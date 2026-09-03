-- Apagar simulação/pedido remove comissão (e lastro) na mesma transação,
-- sem depender de RLS no ON DELETE CASCADE.

CREATE OR REPLACE FUNCTION public.simulations_before_delete_cascade()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  DELETE FROM public.comissao_registros
  WHERE simulation_id = OLD.id;

  DELETE FROM public.alocacoes
  WHERE simulation_item_id IN (
    SELECT si.id
    FROM public.simulation_items si
    WHERE si.simulation_id = OLD.id
  );

  RETURN OLD;
END;
$$;

COMMENT ON FUNCTION public.simulations_before_delete_cascade() IS
  'Remove comissão e alocações antes de apagar a simulação, para a exclusão em cascata não falhar no RLS/FK.';

REVOKE ALL ON FUNCTION public.simulations_before_delete_cascade() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS simulations_before_delete_cascade ON public.simulations;
CREATE TRIGGER simulations_before_delete_cascade
  BEFORE DELETE ON public.simulations
  FOR EACH ROW
  EXECUTE FUNCTION public.simulations_before_delete_cascade();

-- Sobra: comissão de pedido já cancelado, cliente de teste, ou simulação inexistente.
DELETE FROM public.comissao_registros cr
WHERE cr.status = 'cancelada'
   OR NOT EXISTS (
     SELECT 1 FROM public.simulations s WHERE s.id = cr.simulation_id
   )
   OR EXISTS (
     SELECT 1
     FROM public.simulations s
     JOIN public.clients c ON c.id = s.client_id
     WHERE s.id = cr.simulation_id
       AND c.nome ILIKE '%teste%'
   );

-- Pedidos de teste que ainda estavam no sistema.
DELETE FROM public.simulations s
USING public.clients c
WHERE c.id = s.client_id
  AND c.nome ILIKE '%teste%';

NOTIFY pgrst, 'reload schema';
