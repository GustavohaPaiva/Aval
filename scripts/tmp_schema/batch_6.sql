-- >>> FILE: 20260730180000_excluir_lista_importacao_delete_produtos.sql
-- Exclui a lista (lote) e seus produtos oficiais.
-- Bloqueia se algum produto estiver em simulation_items (simulações/pedidos).
-- Staging é removido por ON DELETE CASCADE.

CREATE OR REPLACE FUNCTION public.excluir_lista_importacao(p_lote_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_produtos_excluidos int;
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

  IF EXISTS (
    SELECT 1
    FROM public.simulation_items si
    INNER JOIN public.produtos_oficiais po ON po.id = si.product_id
    WHERE po.lote_id = p_lote_id
  ) THEN
    RAISE EXCEPTION 'Não é possível excluir: há simulações ou pedidos com produtos desta lista. Inative a lista em vez de excluir.';
  END IF;

  DELETE FROM public.produtos_oficiais
  WHERE lote_id = p_lote_id;

  GET DIAGNOSTICS v_produtos_excluidos = ROW_COUNT;

  DELETE FROM public.lotes_importacao
  WHERE id = p_lote_id;

  RETURN jsonb_build_object(
    'produtos_excluidos', v_produtos_excluidos,
    'lista_excluida', true
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.excluir_lista_importacao(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.excluir_lista_importacao(uuid) TO authenticated;

-- Reforça o contrato: apagar lote remove produtos oficiais vinculados.
ALTER TABLE public.produtos_oficiais
  DROP CONSTRAINT IF EXISTS produtos_oficiais_lote_id_fkey;

ALTER TABLE public.produtos_oficiais
  ADD CONSTRAINT produtos_oficiais_lote_id_fkey
  FOREIGN KEY (lote_id) REFERENCES public.lotes_importacao (id)
  ON DELETE CASCADE;

NOTIFY pgrst, 'reload schema';

-- >>> FILE: 20260730181000_cleanup_produtos_orfos_sem_lote.sql
-- Produtos órfãos (lote_id NULL) do comportamento antigo de exclusão.
-- Com vínculo em simulação/pedido: inativa. Sem vínculo: remove.

UPDATE public.produtos_oficiais
SET ativo = false, updated_at = now()
WHERE lote_id IS NULL
  AND id IN (
    SELECT si.product_id
    FROM public.simulation_items si
    WHERE si.product_id IS NOT NULL
  );

DELETE FROM public.produtos_oficiais
WHERE lote_id IS NULL
  AND id NOT IN (
    SELECT si.product_id
    FROM public.simulation_items si
    WHERE si.product_id IS NOT NULL
  );
