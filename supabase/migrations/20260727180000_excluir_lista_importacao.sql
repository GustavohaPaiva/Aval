-- Exclusão definitiva de lista de produtos (lote + produtos oficiais vinculados).
-- Bloqueia se algum produto estiver em simulation_items (FK RESTRICT).

CREATE OR REPLACE FUNCTION public.excluir_lista_importacao(p_lote_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_produtos_count int;
  v_sim_count int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sessão inválida.';
  END IF;

  IF NOT public.is_gestor() THEN
    RAISE EXCEPTION 'Acesso negado.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.lotes_importacao WHERE id = p_lote_id
  ) THEN
    RAISE EXCEPTION 'Lista de produtos não encontrada.';
  END IF;

  SELECT count(*)::int INTO v_sim_count
  FROM public.simulation_items si
  WHERE si.product_id IN (
    SELECT po.id
    FROM public.produtos_oficiais po
    WHERE po.lote_id = p_lote_id
  );

  IF v_sim_count > 0 THEN
    RAISE EXCEPTION
      'Não é possível excluir: produtos desta lista estão em % simulação(ões). Inative a lista em vez de excluir.',
      v_sim_count;
  END IF;

  DELETE FROM public.produtos_oficiais
  WHERE lote_id = p_lote_id;

  GET DIAGNOSTICS v_produtos_count = ROW_COUNT;

  DELETE FROM public.lotes_importacao
  WHERE id = p_lote_id;

  RETURN jsonb_build_object(
    'produtos_excluidos', v_produtos_count,
    'lista_excluida', true
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.excluir_lista_importacao(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.excluir_lista_importacao(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
