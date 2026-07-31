-- Notifica gestores quando consultor salva rascunho de simulação.
-- Atualiza notificação não lida existente (mesmo recipient + simulation + type) para evitar spam.

ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'simulation_saved';

CREATE OR REPLACE FUNCTION public.notify_gestores_simulation_saved(
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
  v_gestor record;
  v_updated uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.simulations s
    WHERE s.id = p_simulation_id
      AND s.user_id = auth.uid()
      AND s.status = 'draft'::public.simulation_status
  ) THEN
    RAISE EXCEPTION 'Simulação rascunho não encontrada';
  END IF;

  IF length(trim(p_title)) = 0 THEN
    RAISE EXCEPTION 'Título da notificação inválido';
  END IF;

  FOR v_gestor IN
    SELECT p.id
    FROM public.profiles p
    WHERE p.role = 'gestor'::public.user_role
  LOOP
    UPDATE public.notifications n
    SET
      title = p_title,
      body = p_body,
      sender_id = auth.uid(),
      created_at = now()
    WHERE n.recipient_id = v_gestor.id
      AND n.simulation_id = p_simulation_id
      AND n.type = 'simulation_saved'::public.notification_type
      AND n.read_at IS NULL
    RETURNING n.id INTO v_updated;

    IF v_updated IS NULL THEN
      INSERT INTO public.notifications (
        recipient_id,
        sender_id,
        simulation_id,
        type,
        title,
        body
      )
      VALUES (
        v_gestor.id,
        auth.uid(),
        p_simulation_id,
        'simulation_saved'::public.notification_type,
        p_title,
        p_body
      );
    END IF;

    v_updated := NULL;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_gestores_simulation_saved(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.notify_gestores_simulation_saved(uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.notify_gestores_simulation_saved(uuid, text, text) TO authenticated;
