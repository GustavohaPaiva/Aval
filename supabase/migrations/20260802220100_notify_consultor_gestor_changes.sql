-- RPCs: notificar consultor quando o gestor altera simulação ou dados do pedido.

CREATE OR REPLACE FUNCTION public.notify_consultor_gestor_simulation_updated(
  p_simulation_id uuid,
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

  SELECT s.user_id INTO v_owner
  FROM public.simulations s
  WHERE s.id = p_simulation_id;

  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Simulação não encontrada';
  END IF;

  -- Não notifica o próprio gestor se ele for o dono da simulação.
  IF v_owner = auth.uid() THEN
    RETURN;
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
    'simulation_gestor_updated'::public.notification_type,
    p_title,
    p_body
  );
END;
$$;

REVOKE ALL ON FUNCTION public.notify_consultor_gestor_simulation_updated(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.notify_consultor_gestor_simulation_updated(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.notify_consultor_pedido_fields_updated(
  p_simulation_id uuid,
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

  SELECT s.user_id INTO v_owner
  FROM public.simulations s
  WHERE s.id = p_simulation_id;

  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Simulação não encontrada';
  END IF;

  IF v_owner = auth.uid() THEN
    RETURN;
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
    'pedido_fields_updated'::public.notification_type,
    p_title,
    p_body
  );
END;
$$;

REVOKE ALL ON FUNCTION public.notify_consultor_pedido_fields_updated(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.notify_consultor_pedido_fields_updated(uuid, text, text) TO authenticated;
