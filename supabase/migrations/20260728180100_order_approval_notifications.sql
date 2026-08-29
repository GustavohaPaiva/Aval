-- Pedido: campos de cancelamento + RPCs de notificação de aprovação de pedido

ALTER TABLE public.simulations
  ADD COLUMN IF NOT EXISTS cancelado_por uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cancelado_em timestamptz;

COMMENT ON COLUMN public.simulations.cancelado_por IS 'Usuário (gestor) que cancelou o pedido.';
COMMENT ON COLUMN public.simulations.cancelado_em IS 'Timestamp do cancelamento do pedido.';

CREATE OR REPLACE FUNCTION public.notify_gestores_order_pending(
  p_simulation_id uuid,
  p_title text,
  p_body text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.simulations s
    WHERE s.id = p_simulation_id
      AND s.status = 'order_pending'::public.simulation_status
      AND (s.user_id = auth.uid() OR public.is_gestor())
  ) THEN
    RAISE EXCEPTION 'Pedido pendente de aprovação não encontrado';
  END IF;

  INSERT INTO public.notifications (
    recipient_id,
    sender_id,
    simulation_id,
    type,
    title,
    body
  )
  SELECT
    p.id,
    auth.uid(),
    p_simulation_id,
    'order_approval_request'::public.notification_type,
    p_title,
    p_body
  FROM public.profiles p
  WHERE p.role = 'gestor'::public.user_role;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_gestores_order_pending(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.notify_gestores_order_pending(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.notify_consultor_order_decision(
  p_simulation_id uuid,
  p_type public.notification_type,
  p_title text,
  p_body text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  IF NOT public.is_gestor() THEN
    RAISE EXCEPTION 'Apenas gestores podem enviar esta notificação';
  END IF;

  IF p_type NOT IN (
    'order_approved'::public.notification_type,
    'order_rejected'::public.notification_type
  ) THEN
    RAISE EXCEPTION 'Tipo de notificação inválido';
  END IF;

  SELECT s.user_id INTO v_owner
  FROM public.simulations s
  WHERE s.id = p_simulation_id;

  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Simulação não encontrada';
  END IF;

  INSERT INTO public.notifications (
    recipient_id,
    sender_id,
    simulation_id,
    type,
    title,
    body
  )
  VALUES (
    v_owner,
    auth.uid(),
    p_simulation_id,
    p_type,
    p_title,
    p_body
  );

  UPDATE public.notifications
  SET read_at = now()
  WHERE simulation_id = p_simulation_id
    AND type = 'order_approval_request'::public.notification_type
    AND read_at IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_consultor_order_decision(uuid, public.notification_type, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.notify_consultor_order_decision(uuid, public.notification_type, text, text) TO authenticated;
