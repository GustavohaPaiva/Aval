-- =============================================================================
-- Logística: leitura de todos os pedidos (assinados ou não)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------
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
      AND s.status IN (
        'order_pending',
        'converted',
        'order_rejected',
        'cancelled'
      )
  );
$$;

REVOKE ALL ON FUNCTION public.simulation_is_pedido(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.simulation_is_pedido(uuid) TO authenticated;

COMMENT ON FUNCTION public.simulation_is_pedido(uuid) IS
  'True se a simulação já foi convertida em pedido (status de pedido).';

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
      AND s.status IN (
        'order_pending',
        'converted',
        'order_rejected',
        'cancelled'
      )
  );
$$;

REVOKE ALL ON FUNCTION public.client_has_pedido(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.client_has_pedido(uuid) TO authenticated;

COMMENT ON FUNCTION public.client_has_pedido(uuid) IS
  'True se o cliente possui ao menos uma simulação em status de pedido.';

-- -----------------------------------------------------------------------------
-- simulations / simulation_items — SELECT de todos os pedidos
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "simulations_select_logistica_signed" ON public.simulations;
DROP POLICY IF EXISTS "simulations_select_logistica_pedidos" ON public.simulations;
CREATE POLICY "simulations_select_logistica_pedidos"
  ON public.simulations
  FOR SELECT
  TO authenticated
  USING (
    public.is_logistica()
    AND status IN (
      'order_pending',
      'converted',
      'order_rejected',
      'cancelled'
    )
  );

DROP POLICY IF EXISTS "simulation_items_select_logistica_signed" ON public.simulation_items;
DROP POLICY IF EXISTS "simulation_items_select_logistica_pedidos" ON public.simulation_items;
CREATE POLICY "simulation_items_select_logistica_pedidos"
  ON public.simulation_items
  FOR SELECT
  TO authenticated
  USING (
    public.is_logistica()
    AND public.simulation_is_pedido(simulation_id)
  );

-- pedido_assinaturas segue restrita a linhas signed (a linha pending carrega o
-- token do link público de assinatura). Pedido sem assinatura simplesmente não
-- traz linha vinculada, e a UI o exibe como "Sem assinatura".

-- -----------------------------------------------------------------------------
-- clients — logística vê clientes com pedido (assinado ou não)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "clients_select_logistica_signed" ON public.clients;
DROP POLICY IF EXISTS "clients_select_logistica_pedidos" ON public.clients;
CREATE POLICY "clients_select_logistica_pedidos"
  ON public.clients
  FOR SELECT
  TO authenticated
  USING (
    public.is_logistica()
    AND public.client_has_pedido(clients.id)
  );

NOTIFY pgrst, 'reload schema';
