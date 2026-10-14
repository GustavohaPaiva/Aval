-- Web Push das notificações in-app.
-- A linha em public.notifications continua sendo a fonte da tela interna.
-- Uma falha de push não desfaz o INSERT da notificação.
--
-- Segredos (não gravar neste arquivo):
--   Edge Function: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
--   Vault: push_function_url, push_dispatch_key (JWT service_role legado)
-- Gere as chaves com: node scripts/generate-vapid-keys.mjs

CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE SCHEMA IF NOT EXISTS notificacoes;
REVOKE ALL ON SCHEMA notificacoes FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA notificacoes TO postgres, service_role;

ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'push_test';

CREATE TABLE public.push_event_types (
  event_type text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT push_event_types_name_check CHECK (event_type ~ '^[a-z0-9_]{1,64}$')
);

COMMENT ON TABLE public.push_event_types IS
  'Tipos de public.notifications que também geram push. Tipo ausente ou enabled = false não envia push.';

INSERT INTO public.push_event_types (event_type) VALUES
  ('approval_request'),
  ('simulation_saved'),
  ('simulation_approved'),
  ('simulation_rejected'),
  ('simulation_gestor_updated'),
  ('order_approval_request'),
  ('order_conversion_request'),
  ('order_approved'),
  ('order_rejected'),
  ('pedido_fields_updated'),
  ('exchange_rate_changed'),
  ('price_list_changed'),
  ('push_test')
ON CONFLICT (event_type) DO NOTHING;

CREATE TABLE public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  expiration_time timestamptz,
  device_label text,
  active boolean NOT NULL DEFAULT true,
  failure_count integer NOT NULL DEFAULT 0,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  disabled_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT push_subscriptions_endpoint_unique UNIQUE (endpoint),
  CONSTRAINT push_subscriptions_endpoint_check CHECK (
    endpoint ~ '^https://' AND char_length(endpoint) BETWEEN 20 AND 4096
  ),
  CONSTRAINT push_subscriptions_p256dh_check CHECK (char_length(p256dh) BETWEEN 16 AND 200),
  CONSTRAINT push_subscriptions_auth_check CHECK (char_length(auth) BETWEEN 8 AND 64),
  CONSTRAINT push_subscriptions_device_label_check CHECK (
    device_label IS NULL OR char_length(device_label) BETWEEN 1 AND 80
  ),
  CONSTRAINT push_subscriptions_failure_count_check CHECK (
    failure_count >= 0 AND failure_count <= 20
  ),
  CONSTRAINT push_subscriptions_disabled_reason_check CHECK (
    disabled_reason IS NULL OR disabled_reason IN ('expired', 'failures')
  )
);

CREATE INDEX push_subscriptions_user_active_idx
  ON public.push_subscriptions (user_id)
  WHERE active;

COMMENT ON TABLE public.push_subscriptions IS
  'Inscrições Web Push do próprio usuário. Um endpoint pertence a uma conta.';

CREATE TABLE public.push_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL UNIQUE REFERENCES public.notifications (id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  processing_started_at timestamptz,
  sent_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT push_deliveries_status_check CHECK (
    status IN ('pending', 'processing', 'sent', 'failed', 'skipped')
  ),
  CONSTRAINT push_deliveries_attempts_check CHECK (attempts >= 0 AND attempts <= 10),
  CONSTRAINT push_deliveries_error_check CHECK (
    last_error IS NULL OR char_length(last_error) <= 500
  )
);

CREATE INDEX push_deliveries_due_idx
  ON public.push_deliveries (next_attempt_at, created_at)
  WHERE status IN ('pending', 'failed');

CREATE INDEX push_deliveries_recipient_idx
  ON public.push_deliveries (recipient_id, created_at DESC);

COMMENT ON TABLE public.push_deliveries IS
  'Uma tentativa de push por notificação. UNIQUE(notification_id) impede disparo duplicado.';

ALTER TABLE public.push_event_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_deliveries ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.push_event_types FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.push_subscriptions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.push_deliveries FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.push_subscriptions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.push_event_types TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.push_subscriptions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.push_deliveries TO service_role;

CREATE POLICY push_subscriptions_select_own
  ON public.push_subscriptions
  FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY push_subscriptions_insert_own
  ON public.push_subscriptions
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY push_subscriptions_update_own
  ON public.push_subscriptions
  FOR UPDATE
  TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY push_subscriptions_delete_own
  ON public.push_subscriptions
  FOR DELETE
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP TRIGGER IF EXISTS push_subscriptions_set_updated_at ON public.push_subscriptions;
CREATE TRIGGER push_subscriptions_set_updated_at
  BEFORE UPDATE ON public.push_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS push_deliveries_set_updated_at ON public.push_deliveries;
CREATE TRIGGER push_deliveries_set_updated_at
  BEFORE UPDATE ON public.push_deliveries
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS push_event_types_set_updated_at ON public.push_event_types;
CREATE TRIGGER push_event_types_set_updated_at
  BEFORE UPDATE ON public.push_event_types
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION notificacoes.enqueue_web_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_enabled boolean;
  v_delivery_id uuid;
  v_url text;
  v_key text;
BEGIN
  SELECT t.enabled
  INTO v_enabled
  FROM public.push_event_types t
  WHERE t.event_type = NEW.type::text;

  IF NOT COALESCE(v_enabled, false) THEN
    RETURN NEW;
  END IF;

  BEGIN
    INSERT INTO public.push_deliveries (notification_id, recipient_id)
    VALUES (NEW.id, NEW.recipient_id)
    ON CONFLICT (notification_id) DO NOTHING
    RETURNING id INTO v_delivery_id;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING 'enqueue_web_push insert: %', SQLERRM;
      RETURN NEW;
  END;

  IF v_delivery_id IS NULL THEN
    RETURN NEW;
  END IF;

  BEGIN
    SELECT s.decrypted_secret
    INTO v_url
    FROM vault.decrypted_secrets s
    WHERE s.name = 'push_function_url'
    LIMIT 1;

    SELECT s.decrypted_secret
    INTO v_key
    FROM vault.decrypted_secrets s
    WHERE s.name = 'push_dispatch_key'
    LIMIT 1;

    IF v_url IS NULL OR v_key IS NULL THEN
      RETURN NEW;
    END IF;

    v_url := btrim(v_url);
    v_key := btrim(v_key);
    IF v_url !~ '^https?://' OR length(v_key) < 20 THEN
      RAISE WARNING 'enqueue_web_push: segredo de dispatch inválido';
      RETURN NEW;
    END IF;

    PERFORM net.http_post(
      url := v_url,
      body := jsonb_build_object('notification_id', NEW.id),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_key,
        'apikey', v_key
      ),
      timeout_milliseconds := 10000
    );
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING 'enqueue_web_push http: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION notificacoes.enqueue_web_push() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS notifications_enqueue_web_push ON public.notifications;
CREATE TRIGGER notifications_enqueue_web_push
  AFTER INSERT ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION notificacoes.enqueue_web_push();

CREATE OR REPLACE FUNCTION notificacoes.dispatch_pending_web_pushes()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_url text;
  v_key text;
BEGIN
  SELECT s.decrypted_secret INTO v_url
  FROM vault.decrypted_secrets s
  WHERE s.name = 'push_function_url'
  LIMIT 1;

  SELECT s.decrypted_secret INTO v_key
  FROM vault.decrypted_secrets s
  WHERE s.name = 'push_dispatch_key'
  LIMIT 1;

  IF v_url IS NULL OR v_key IS NULL THEN
    RETURN;
  END IF;

  v_url := btrim(v_url);
  v_key := btrim(v_key);
  IF v_url !~ '^https?://' OR length(v_key) < 20 THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.push_deliveries d
    WHERE (
      d.status IN ('pending', 'failed')
      AND d.attempts < 5
      AND d.next_attempt_at <= now()
    ) OR (
      d.status = 'processing'
      AND d.attempts < 5
      AND d.processing_started_at < now() - interval '10 minutes'
    )
  ) THEN
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := v_url,
    body := jsonb_build_object('action', 'retry'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key,
      'apikey', v_key
    ),
    timeout_milliseconds := 10000
  );
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'dispatch_pending_web_pushes: %', SQLERRM;
END;
$$;

REVOKE ALL ON FUNCTION notificacoes.dispatch_pending_web_pushes() FROM PUBLIC, anon, authenticated;

DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'web_push_retry') THEN
      PERFORM cron.unschedule('web_push_retry');
    END IF;
    PERFORM cron.schedule(
      'web_push_retry',
      '* * * * *',
      'SELECT notificacoes.dispatch_pending_web_pushes()'
    );
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'pg_cron web_push_retry: %', SQLERRM;
END
$cron$;

-- Teste só para o usuário autenticado. O título é fixo; o destinatário é auth.uid().
-- O INSERT passa pelo mesmo trigger das notificações reais.
CREATE OR REPLACE FUNCTION public.request_own_push_test()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.notifications n
    WHERE n.recipient_id = auth.uid()
      AND n.type::text = 'push_test'
      AND n.created_at > now() - interval '1 minute'
  ) THEN
    RAISE EXCEPTION 'Aguarde um minuto antes de enviar outro teste'
      USING ERRCODE = '22023';
  END IF;

  EXECUTE
    'INSERT INTO public.notifications (recipient_id, sender_id, type, title, body)
     VALUES ($1, $1, ''push_test'', $2, $3)
     RETURNING id'
  INTO v_id
  USING
    auth.uid(),
    'Teste de notificação',
    'Se esta mensagem apareceu no sistema do aparelho, as notificações push estão funcionando.';

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.request_own_push_test() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_own_push_test() TO authenticated;

COMMENT ON FUNCTION public.request_own_push_test() IS
  'Cria uma notificação push_test somente para auth.uid(). Não aceita destinatário externo.';
