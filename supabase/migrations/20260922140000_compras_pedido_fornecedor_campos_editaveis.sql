-- Campos editáveis do pedido ao fornecedor (planilha Yara).
ALTER TABLE public.compras
  ADD COLUMN IF NOT EXISTS faturamento text,
  ADD COLUMN IF NOT EXISTS ctc text,
  ADD COLUMN IF NOT EXISTS entrega_retirada text;

COMMENT ON COLUMN public.compras.faturamento IS
  'Texto de faturamento no pedido ao fornecedor. Editável; default sugerido pela filial.';
COMMENT ON COLUMN public.compras.ctc IS
  'Contato/CTC impresso no pedido ao fornecedor.';
COMMENT ON COLUMN public.compras.entrega_retirada IS
  'Prazo de entrega/retirada no pedido ao fornecedor.';

ALTER TABLE public.compra_itens
  ADD COLUMN IF NOT EXISTS lista text;

COMMENT ON COLUMN public.compra_itens.lista IS
  'Lista/quarter impressa no pedido ao fornecedor. Editável por item.';

CREATE OR REPLACE FUNCTION public.trg_compra_itens_validate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_compra public.compras%ROWTYPE;
  v_fornecedor uuid;
  v_receive_only boolean;
BEGIN
  SELECT * INTO v_compra FROM public.compras WHERE id = NEW.compra_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ordem de compra não encontrada.';
  END IF;
  IF v_compra.status = 'cancelado'::public.compra_status AND TG_OP IN ('INSERT', 'UPDATE') THEN
    RAISE EXCEPTION 'Ordem de compra cancelada não pode ser editada.';
  END IF;

  SELECT po.fornecedor_id INTO v_fornecedor
  FROM public.produtos_oficiais po
  WHERE po.id = NEW.produto_oficial_id;
  IF v_fornecedor IS NULL THEN
    RAISE EXCEPTION 'Produto oficial não encontrado.';
  END IF;
  IF v_fornecedor IS DISTINCT FROM v_compra.fornecedor_id THEN
    RAISE EXCEPTION 'O produto precisa ser do mesmo fornecedor da ordem de compra.';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    v_receive_only :=
      NEW.volume_recebido_kg IS DISTINCT FROM OLD.volume_recebido_kg
      AND NEW.volume_kg IS NOT DISTINCT FROM OLD.volume_kg
      AND NEW.produto_oficial_id IS NOT DISTINCT FROM OLD.produto_oficial_id
      AND NEW.embalagem IS NOT DISTINCT FROM OLD.embalagem
      AND NEW.unidade_exibicao IS NOT DISTINCT FROM OLD.unidade_exibicao
      AND NEW.cultura IS NOT DISTINCT FROM OLD.cultura
      AND NEW.origem IS NOT DISTINCT FROM OLD.origem
      AND NEW.lista IS NOT DISTINCT FROM OLD.lista
      AND NEW.preco_usd IS NOT DISTINCT FROM OLD.preco_usd
      AND NEW.desconto_usd IS NOT DISTINCT FROM OLD.desconto_usd
      AND NEW.vencimento_lista IS NOT DISTINCT FROM OLD.vencimento_lista
      AND NEW.pagamento_syagri IS NOT DISTINCT FROM OLD.pagamento_syagri
      AND NEW.preco_corrigido IS NOT DISTINCT FROM OLD.preco_corrigido
      AND NEW.juros IS NOT DISTINCT FROM OLD.juros
      AND NEW.unitario_brl IS NOT DISTINCT FROM OLD.unitario_brl
      AND NEW.frete IS NOT DISTINCT FROM OLD.frete
      AND NEW.total IS NOT DISTINCT FROM OLD.total;

    IF NOT v_receive_only THEN
      PERFORM public.compras_marcar_editada(NEW.compra_id);
    END IF;
  ELSIF TG_OP = 'INSERT' THEN
    PERFORM public.compras_marcar_editada(NEW.compra_id);
  END IF;

  RETURN NEW;
END;
$$;
