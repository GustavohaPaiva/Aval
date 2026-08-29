-- Notificações in-app (aprovações, decisões do gestor)

CREATE TYPE public.notification_type AS ENUM (
  'approval_request',
  'simulation_approved',
  'simulation_rejected'
);

CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  sender_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  simulation_id uuid REFERENCES public.simulations (id) ON DELETE CASCADE,
  type public.notification_type NOT NULL,
  title text NOT NULL,
  body text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notifications_title_not_empty CHECK (length(trim(title)) > 0)
);

CREATE INDEX notifications_recipient_created_idx
  ON public.notifications (recipient_id, created_at DESC);

CREATE INDEX notifications_recipient_unread_idx
  ON public.notifications (recipient_id)
  WHERE read_at IS NULL;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notifications_select_own"
  ON public.notifications
  FOR SELECT
  TO authenticated
  USING (recipient_id = auth.uid());

CREATE POLICY "notifications_update_own"
  ON public.notifications
  FOR UPDATE
  TO authenticated
  USING (recipient_id = auth.uid())
  WITH CHECK (recipient_id = auth.uid());

GRANT SELECT, UPDATE ON public.notifications TO authenticated;

-- Notifica todos os gestores sobre simulação pendente (consultor autenticado)
CREATE OR REPLACE FUNCTION public.notify_gestores_simulation_pending(
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
      AND s.status = 'pending'::public.simulation_status
  ) THEN
    RAISE EXCEPTION 'Simulação pendente não encontrada';
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
    'approval_request'::public.notification_type,
    p_title,
    p_body
  FROM public.profiles p
  WHERE p.role = 'gestor'::public.user_role;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_gestores_simulation_pending(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.notify_gestores_simulation_pending(uuid, text, text) TO authenticated;

-- Notifica o consultor dono da simulação (gestor autenticado)
CREATE OR REPLACE FUNCTION public.notify_consultor_simulation_decision(
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
    'simulation_approved'::public.notification_type,
    'simulation_rejected'::public.notification_type
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
    AND type = 'approval_request'::public.notification_type
    AND read_at IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_consultor_simulation_decision(uuid, public.notification_type, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.notify_consultor_simulation_decision(uuid, public.notification_type, text, text) TO authenticated;
