-- Aval — fila de notificações via WhatsApp Cloud API.
-- A entrega é processada pela Edge Function whatsapp-dispatch.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS whatsapp_phone_e164 text,
  ADD COLUMN IF NOT EXISTS whatsapp_notifications_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_whatsapp_phone_e164_format;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_whatsapp_phone_e164_format
  CHECK (whatsapp_phone_e164 IS NULL OR whatsapp_phone_e164 ~ '^\+[1-9][0-9]{7,14}$');

COMMENT ON COLUMN public.profiles.whatsapp_phone_e164 IS
  'Telefone do usuário no formato E.164, por exemplo +5534999999999.';
COMMENT ON COLUMN public.profiles.whatsapp_notifications_enabled IS
  'Autoriza entregas de WhatsApp para as notificações deste usuário.';

CREATE TABLE IF NOT EXISTS public.whatsapp_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL UNIQUE REFERENCES public.notifications (id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  phone_e164 text NOT NULL,
  message_type text NOT NULL DEFAULT 'text',
  template_name text,
  template_language text,
  message_body text,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  processing_started_at timestamptz,
  sent_at timestamptz,
  meta_message_id text,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_outbox_phone_format CHECK (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  CONSTRAINT whatsapp_outbox_message_type_check CHECK (message_type IN ('text', 'template')),
  CONSTRAINT whatsapp_outbox_status_check CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'cancelled')),
  CONSTRAINT whatsapp_outbox_attempts_check CHECK (attempts >= 0),
  CONSTRAINT whatsapp_outbox_payload_check CHECK (
    (message_type = 'text' AND message_body IS NOT NULL)
    OR (message_type = 'template' AND template_name IS NOT NULL AND template_language IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS whatsapp_outbox_dispatch_idx
  ON public.whatsapp_outbox (status, next_attempt_at, created_at)
  WHERE status IN ('pending', 'failed');

CREATE INDEX IF NOT EXISTS whatsapp_outbox_recipient_idx
  ON public.whatsapp_outbox (recipient_id, created_at DESC);

DROP TRIGGER IF EXISTS whatsapp_outbox_set_updated_at ON public.whatsapp_outbox;
CREATE TRIGGER whatsapp_outbox_set_updated_at
  BEFORE UPDATE ON public.whatsapp_outbox
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.whatsapp_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.whatsapp_outbox FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_outbox TO service_role;

CREATE OR REPLACE FUNCTION public.enqueue_notification_for_whatsapp()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_phone text;
BEGIN
  SELECT p.whatsapp_phone_e164 INTO v_phone
  FROM public.profiles p
  WHERE p.id = NEW.recipient_id
    AND p.whatsapp_notifications_enabled = true
    AND p.whatsapp_phone_e164 IS NOT NULL;

  IF v_phone IS NULL THEN RETURN NEW; END IF;

  INSERT INTO public.whatsapp_outbox (
    notification_id, recipient_id, phone_e164, message_type, message_body
  ) VALUES (
    NEW.id, NEW.recipient_id, v_phone, 'text',
    concat_ws(E'\n', NEW.title, NULLIF(NEW.body, ''))
  )
  ON CONFLICT (notification_id) DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_notification_for_whatsapp() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS notifications_enqueue_whatsapp ON public.notifications;
CREATE TRIGGER notifications_enqueue_whatsapp
  AFTER INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_notification_for_whatsapp();

CREATE OR REPLACE FUNCTION public.claim_whatsapp_outbox(p_batch_size integer DEFAULT 20)
RETURNS SETOF public.whatsapp_outbox
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Acesso restrito ao service_role';
  END IF;

  RETURN QUERY
  WITH candidates AS (
    SELECT o.id
    FROM public.whatsapp_outbox o
    WHERE (
      o.status = 'pending'
      OR (o.status = 'failed' AND o.attempts < 5)
      OR (o.status = 'processing' AND o.processing_started_at < now() - interval '10 minutes' AND o.attempts < 5)
    )
      AND o.next_attempt_at <= now()
    ORDER BY o.created_at
    LIMIT least(greatest(coalesce(p_batch_size, 20), 1), 100)
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.whatsapp_outbox o
  SET status = 'processing', attempts = o.attempts + 1,
      processing_started_at = now(), last_error = NULL
  FROM candidates c
  WHERE o.id = c.id
  RETURNING o.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_whatsapp_outbox(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_whatsapp_outbox(integer) TO service_role;

