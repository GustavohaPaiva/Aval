-- =============================================================================
-- Logística: só enxerga pedidos com os dados operacionais completos
-- =============================================================================
-- Completo = fazenda, município, UF, semana de entrega, tipo de frete e itens.
-- Frete CIF exige também origem e destino; FOB não possui rota.

CREATE OR REPLACE FUNCTION public.pedido_visivel_logistica(p_simulation_id uuid)
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
      AND nullif(btrim(s.fazenda), '') IS NOT NULL
      AND nullif(btrim(s.pedido_municipio), '') IS NOT NULL
      AND nullif(btrim(s.pedido_uf), '') IS NOT NULL
      AND s.prazo_semana_inicio IS NOT NULL
      AND nullif(btrim(s.tipo_frete), '') IS NOT NULL
      AND (
        upper(btrim(s.tipo_frete)) <> 'CIF'
        OR (
          nullif(btrim(s.origem_frete), '') IS NOT NULL
          AND nullif(btrim(s.destino_frete), '') IS NOT NULL
        )
      )
      AND EXISTS (
        SELECT 1
        FROM public.simulation_items si
        WHERE si.simulation_id = s.id
      )
  );
$$;

REVOKE ALL ON FUNCTION public.pedido_visivel_logistica(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pedido_visivel_logistica(uuid) TO authenticated;

COMMENT ON FUNCTION public.pedido_visivel_logistica(uuid) IS
  'True se o pedido está em andamento e com os dados operacionais completos.';

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
      AND public.pedido_visivel_logistica(s.id)
  );
$$;

COMMENT ON FUNCTION public.client_has_pedido(uuid) IS
  'True se o cliente possui ao menos um pedido visível para a logística.';

DROP POLICY IF EXISTS "simulations_select_logistica_pedidos" ON public.simulations;
CREATE POLICY "simulations_select_logistica_pedidos"
  ON public.simulations
  FOR SELECT
  TO authenticated
  USING (
    public.is_logistica()
    AND public.pedido_visivel_logistica(id)
  );

DROP POLICY IF EXISTS "simulation_items_select_logistica_pedidos" ON public.simulation_items;
CREATE POLICY "simulation_items_select_logistica_pedidos"
  ON public.simulation_items
  FOR SELECT
  TO authenticated
  USING (
    public.is_logistica()
    AND public.pedido_visivel_logistica(simulation_id)
  );

DROP FUNCTION IF EXISTS public.simulation_is_pedido(uuid);

NOTIFY pgrst, 'reload schema';
