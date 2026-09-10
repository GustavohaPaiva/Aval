-- =============================================================================
-- Logística: pedidos cancelados e reprovados ficam fora da visão de logística
-- =============================================================================

CREATE OR REPLACE FUNCTION public.simulation_is_pedido(p_simulation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.simulations s
    WHERE s.id = p_simulation_id
      AND s.status IN ('order_pending', 'converted')
  );
$$;

COMMENT ON FUNCTION public.simulation_is_pedido(uuid) IS
  'True se a simulação é pedido em andamento (order_pending ou converted).';

CREATE OR REPLACE FUNCTION public.client_has_pedido(p_client_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.simulations s
    WHERE s.client_id = p_client_id
      AND s.status IN ('order_pending', 'converted')
  );
$$;

COMMENT ON FUNCTION public.client_has_pedido(uuid) IS
  'True se o cliente possui ao menos um pedido em andamento.';

DROP POLICY IF EXISTS "simulations_select_logistica_pedidos" ON public.simulations;
CREATE POLICY "simulations_select_logistica_pedidos"
  ON public.simulations
  FOR SELECT
  TO authenticated
  USING (
    public.is_logistica()
    AND status IN ('order_pending', 'converted')
  );

NOTIFY pgrst, 'reload schema';
