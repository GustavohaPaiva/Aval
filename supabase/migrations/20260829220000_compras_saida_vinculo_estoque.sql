-- Vincular demanda a lote existente dá baixa física (saída), não só reserva.
-- Desvincular estorna a quantidade. Vínculos vindos de recebimento de OC
-- continuam só reservando (produto chegou e ficou separado para o pedido).

ALTER TABLE public.alocacoes
  ADD COLUMN IF NOT EXISTS baixa_fisica boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.alocacoes.baixa_fisica IS
  'True quando o vínculo tirou quantidade física do lote (saida_venda).';

ALTER TABLE public.estoque_movimentos
  DROP CONSTRAINT IF EXISTS estoque_movimentos_tipo_check;

ALTER TABLE public.estoque_movimentos
  ADD CONSTRAINT estoque_movimentos_tipo_check CHECK (
    tipo IN (
      'entrada_compra',
      'entrada_ajuste',
      'saida_ajuste',
      'saida_venda',
      'entrada_desvinculo'
    )
  );

CREATE OR REPLACE FUNCTION public.compras_alocar(
  p_simulation_item_id uuid,
  p_quantidade_kg numeric,
  p_estoque_lote_id uuid DEFAULT NULL,
  p_compra_item_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item public.simulation_items%ROWTYPE;
  v_sim public.simulations%ROWTYPE;
  v_vendido_kg numeric(14, 4);
  v_lastreado_kg numeric(14, 4);
  v_origem text;
  v_lote public.estoque_lotes%ROWTYPE;
  v_ci public.compra_itens%ROWTYPE;
  v_compra public.compras%ROWTYPE;
  v_produto_fornecedor uuid;
  v_alocado_item numeric(14, 4);
  v_baixa boolean := false;
  v_id uuid;
BEGIN
  PERFORM public.compras_assert_gestor();

  IF p_quantidade_kg IS NULL OR p_quantidade_kg <= 0 THEN
    RAISE EXCEPTION 'Quantidade deve ser maior que zero.';
  END IF;
  IF (p_estoque_lote_id IS NULL) = (p_compra_item_id IS NULL) THEN
    RAISE EXCEPTION 'Informe lote de estoque ou item de OC, não os dois.';
  END IF;

  SELECT * INTO v_item FROM public.simulation_items WHERE id = p_simulation_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Linha de venda não encontrada.';
  END IF;
  SELECT * INTO v_sim FROM public.simulations WHERE id = v_item.simulation_id FOR UPDATE;
  IF v_sim.status IS DISTINCT FROM 'converted'::public.simulation_status THEN
    RAISE EXCEPTION 'Só é possível vincular pedido convertido.';
  END IF;
  IF v_sim.ativo IS FALSE THEN
    RAISE EXCEPTION 'Pedido inativo.';
  END IF;

  v_vendido_kg := round((v_item.volume * 1000)::numeric, 4);
  SELECT COALESCE(SUM(a.quantidade_kg), 0) INTO v_lastreado_kg
  FROM public.alocacoes a
  WHERE a.simulation_item_id = v_item.id;

  IF v_lastreado_kg + p_quantidade_kg > v_vendido_kg + 0.0001 THEN
    RAISE EXCEPTION 'Quantidade excede o volume vendido ainda sem vínculo.';
  END IF;

  SELECT po.fornecedor_id INTO v_produto_fornecedor
  FROM public.produtos_oficiais po
  WHERE po.id = v_item.product_id;

  IF p_estoque_lote_id IS NOT NULL THEN
    v_origem := 'estoque';
    v_baixa := true;
    SELECT * INTO v_lote FROM public.estoque_lotes WHERE id = p_estoque_lote_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Lote de estoque não encontrado.';
    END IF;
    IF v_lote.produto_oficial_id IS DISTINCT FROM v_item.product_id THEN
      RAISE EXCEPTION 'O lote não é do mesmo produto da venda.';
    END IF;
    IF (v_lote.quantidade_kg - v_lote.reservado_kg) < p_quantidade_kg THEN
      RAISE EXCEPTION 'Estoque disponível insuficiente neste lote.';
    END IF;
    UPDATE public.estoque_lotes
    SET quantidade_kg = quantidade_kg - p_quantidade_kg
    WHERE id = v_lote.id;

    INSERT INTO public.estoque_movimentos (
      estoque_lote_id, tipo, quantidade_kg, criado_por
    ) VALUES (
      v_lote.id, 'saida_venda', p_quantidade_kg, (SELECT auth.uid())
    );
  ELSE
    v_origem := 'compra';
    SELECT * INTO v_ci FROM public.compra_itens WHERE id = p_compra_item_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Item da ordem de compra não encontrado.';
    END IF;
    SELECT * INTO v_compra FROM public.compras WHERE id = v_ci.compra_id FOR UPDATE;
    IF v_compra.status = 'cancelado'::public.compra_status THEN
      RAISE EXCEPTION 'Não é possível vincular em OC cancelada.';
    END IF;
    IF v_ci.produto_oficial_id IS DISTINCT FROM v_item.product_id THEN
      RAISE EXCEPTION 'O item da OC não é do mesmo produto da venda.';
    END IF;
    IF v_produto_fornecedor IS DISTINCT FROM v_compra.fornecedor_id THEN
      RAISE EXCEPTION 'Fornecedor da OC não confere com o produto vendido.';
    END IF;
    SELECT COALESCE(SUM(a.quantidade_kg), 0) INTO v_alocado_item
    FROM public.alocacoes a
    WHERE a.compra_item_id = v_ci.id AND a.origem_tipo = 'compra';
    IF v_alocado_item + p_quantidade_kg > v_ci.volume_kg + 0.0001 THEN
      RAISE EXCEPTION 'Vínculo excede o volume desta linha da OC.';
    END IF;
  END IF;

  INSERT INTO public.alocacoes (
    simulation_item_id, quantidade_kg, origem_tipo, estoque_lote_id, compra_item_id,
    baixa_fisica, criado_por
  ) VALUES (
    v_item.id,
    p_quantidade_kg,
    v_origem,
    p_estoque_lote_id,
    p_compra_item_id,
    v_baixa,
    (SELECT auth.uid())
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.compras_desalocar(p_alocacao_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_a public.alocacoes%ROWTYPE;
BEGIN
  PERFORM public.compras_assert_gestor();
  SELECT * INTO v_a FROM public.alocacoes WHERE id = p_alocacao_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vínculo não encontrado.';
  END IF;

  IF v_a.origem_tipo = 'estoque' AND v_a.estoque_lote_id IS NOT NULL THEN
    IF v_a.baixa_fisica THEN
      UPDATE public.estoque_lotes
      SET quantidade_kg = quantidade_kg + v_a.quantidade_kg
      WHERE id = v_a.estoque_lote_id;

      INSERT INTO public.estoque_movimentos (
        estoque_lote_id, tipo, quantidade_kg, criado_por
      ) VALUES (
        v_a.estoque_lote_id, 'entrada_desvinculo', v_a.quantidade_kg, (SELECT auth.uid())
      );
    ELSE
      UPDATE public.estoque_lotes
      SET reservado_kg = GREATEST(0, reservado_kg - v_a.quantidade_kg)
      WHERE id = v_a.estoque_lote_id;
    END IF;
  END IF;

  DELETE FROM public.alocacoes WHERE id = v_a.id;
END;
$$;

NOTIFY pgrst, 'reload schema';
