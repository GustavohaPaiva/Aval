-- Pedido convertido: só o gestor altera dados comerciais (produtos, totais, frete).
-- Consultor continua podendo preencher fazenda/município/prazo/observações.

ALTER POLICY "simulation_items_insert_consultor_own_simulation"
  ON public.simulation_items
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.simulations s
      WHERE s.id = simulation_items.simulation_id
        AND s.user_id = (SELECT auth.uid())
        AND s.status NOT IN (
          'order_pending'::public.simulation_status,
          'converted'::public.simulation_status,
          'order_rejected'::public.simulation_status,
          'cancelled'::public.simulation_status
        )
    )
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid()) AND p.role = 'consultor'::public.user_role
    )
  );

ALTER POLICY "simulation_items_update_consultor_own_simulation"
  ON public.simulation_items
  USING (
    EXISTS (
      SELECT 1 FROM public.simulations s
      WHERE s.id = simulation_items.simulation_id
        AND s.user_id = (SELECT auth.uid())
        AND s.status NOT IN (
          'order_pending'::public.simulation_status,
          'converted'::public.simulation_status,
          'order_rejected'::public.simulation_status,
          'cancelled'::public.simulation_status
        )
    )
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid()) AND p.role = 'consultor'::public.user_role
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.simulations s
      WHERE s.id = simulation_items.simulation_id
        AND s.user_id = (SELECT auth.uid())
        AND s.status NOT IN (
          'order_pending'::public.simulation_status,
          'converted'::public.simulation_status,
          'order_rejected'::public.simulation_status,
          'cancelled'::public.simulation_status
        )
    )
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid()) AND p.role = 'consultor'::public.user_role
    )
  );

ALTER POLICY "simulation_items_delete_consultor_own_simulation"
  ON public.simulation_items
  USING (
    EXISTS (
      SELECT 1 FROM public.simulations s
      WHERE s.id = simulation_items.simulation_id
        AND s.user_id = (SELECT auth.uid())
        AND s.status NOT IN (
          'order_pending'::public.simulation_status,
          'converted'::public.simulation_status,
          'order_rejected'::public.simulation_status,
          'cancelled'::public.simulation_status
        )
    )
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid()) AND p.role = 'consultor'::public.user_role
    )
  );

CREATE OR REPLACE FUNCTION public.prevent_consultor_comercial_edit_on_pedido()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF public.is_gestor() THEN
    RETURN NEW;
  END IF;

  IF OLD.status IN (
    'order_pending'::public.simulation_status,
    'converted'::public.simulation_status,
    'order_rejected'::public.simulation_status,
    'cancelled'::public.simulation_status
  ) THEN
    IF NEW.status IS DISTINCT FROM OLD.status
      OR NEW.total_bruto IS DISTINCT FROM OLD.total_bruto
      OR NEW.total_proposta IS DISTINCT FROM OLD.total_proposta
      OR NEW.comissao_valor_total IS DISTINCT FROM OLD.comissao_valor_total
      OR NEW.tipo_frete IS DISTINCT FROM OLD.tipo_frete
      OR NEW.origem_frete IS DISTINCT FROM OLD.origem_frete
      OR NEW.destino_frete IS DISTINCT FROM OLD.destino_frete
      OR NEW.data_pagamento IS DISTINCT FROM OLD.data_pagamento
      OR NEW.quarter IS DISTINCT FROM OLD.quarter
      OR NEW.client_id IS DISTINCT FROM OLD.client_id
      OR NEW.user_id IS DISTINCT FROM OLD.user_id
      OR NEW.valores_congelados_em IS DISTINCT FROM OLD.valores_congelados_em
      OR NEW.ativo IS DISTINCT FROM OLD.ativo
    THEN
      RAISE EXCEPTION
        'Apenas gestores podem alterar dados comerciais de um pedido convertido.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS simulations_prevent_consultor_comercial_edit
  ON public.simulations;
CREATE TRIGGER simulations_prevent_consultor_comercial_edit
  BEFORE UPDATE ON public.simulations
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_consultor_comercial_edit_on_pedido();

REVOKE ALL ON FUNCTION public.prevent_consultor_comercial_edit_on_pedido() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prevent_consultor_comercial_edit_on_pedido() TO authenticated;

COMMENT ON FUNCTION public.prevent_consultor_comercial_edit_on_pedido() IS
  'Impede consultor de alterar totais, status, cliente, frete e freeze de pedido convertido.';

NOTIFY pgrst, 'reload schema';
