-- RPC: consultor solicita que o gestor converta a simulação em pedido

CREATE OR REPLACE FUNCTION public.notify_gestores_order_conversion_request(
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
      AND s.user_id = auth.uid()
      AND s.status = 'approved'::public.simulation_status
  ) THEN
    RAISE EXCEPTION 'Simulação aprovada não encontrada para solicitar conversão';
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
    'order_conversion_request'::public.notification_type,
    p_title,
    p_body
  FROM public.profiles p
  WHERE p.role = 'gestor'::public.user_role;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_gestores_order_conversion_request(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.notify_gestores_order_conversion_request(uuid, text, text) TO authenticated;
