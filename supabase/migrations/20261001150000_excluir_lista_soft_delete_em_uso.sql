-- Exclusão de lista de produtos sem perder vínculos de simulações, pedidos, compras e estoque.
-- Produtos referenciados são inativados (some do simulador); os demais são removidos.
-- O lote só é removido quando não sobra nenhum produto; caso contrário fica inativo.

CREATE OR REPLACE FUNCTION public.excluir_lista_importacao(p_lote_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_inativados int := 0;
  v_excluidos int := 0;
  v_restantes int := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sessão inválida.';
  END IF;

  IF NOT public.is_gestor() THEN
    RAISE EXCEPTION 'Acesso negado.';
  END IF;

  PERFORM 1
  FROM public.lotes_importacao
  WHERE id = p_lote_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lista de produtos não encontrada.';
  END IF;

  UPDATE public.produtos_oficiais po
  SET ativo = false, updated_at = now()
  WHERE po.lote_id = p_lote_id
    AND (
      EXISTS (SELECT 1 FROM public.simulation_items si WHERE si.product_id = po.id)
      OR EXISTS (SELECT 1 FROM public.compra_itens ci WHERE ci.produto_oficial_id = po.id)
      OR EXISTS (SELECT 1 FROM public.estoque_lotes el WHERE el.produto_oficial_id = po.id)
    );

  GET DIAGNOSTICS v_inativados = ROW_COUNT;

  DELETE FROM public.produtos_oficiais po
  WHERE po.lote_id = p_lote_id
    AND NOT EXISTS (SELECT 1 FROM public.simulation_items si WHERE si.product_id = po.id)
    AND NOT EXISTS (SELECT 1 FROM public.compra_itens ci WHERE ci.produto_oficial_id = po.id)
    AND NOT EXISTS (SELECT 1 FROM public.estoque_lotes el WHERE el.produto_oficial_id = po.id);

  GET DIAGNOSTICS v_excluidos = ROW_COUNT;

  SELECT count(*)::int INTO v_restantes
  FROM public.produtos_oficiais
  WHERE lote_id = p_lote_id;

  IF v_restantes > 0 THEN
    UPDATE public.lotes_importacao
    SET ativo = false, updated_at = now()
    WHERE id = p_lote_id;
  ELSE
    DELETE FROM public.lotes_importacao
    WHERE id = p_lote_id;
  END IF;

  RETURN jsonb_build_object(
    'produtos_inativados', v_inativados,
    'produtos_excluidos', v_excluidos,
    'lista_inativada', v_restantes > 0,
    'lista_excluida', v_restantes = 0
  );
END;
$function$;

COMMENT ON FUNCTION public.excluir_lista_importacao(uuid) IS
  'Exclui a lista: inativa produtos em uso (simulações, pedidos, compras, estoque) e remove os demais. O lote fica inativo se restar produto.';

REVOKE EXECUTE ON FUNCTION public.excluir_lista_importacao(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.excluir_lista_importacao(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
