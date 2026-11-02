-- O gateway exige a chave publicável em `apikey`. O disparo usa outro segredo
-- (PUSH_DISPATCH_KEY), porque a função não aceita JWT no Authorization.
-- Se `push_apikey` não existir, os dois headers continuam com a mesma chave.

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

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
  v_apikey text;
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

    SELECT s.decrypted_secret
    INTO v_apikey
    FROM vault.decrypted_secrets s
    WHERE s.name = 'push_apikey'
    LIMIT 1;

    IF v_url IS NULL OR v_key IS NULL THEN
      UPDATE public.push_deliveries
      SET
        last_error = 'push_dispatch_not_configured',
        next_attempt_at = now() + interval '15 minutes'
      WHERE id = v_delivery_id;
      RETURN NEW;
    END IF;

    v_url := btrim(v_url);
    v_key := btrim(v_key);
    v_apikey := btrim(v_apikey);
    IF v_apikey IS NULL OR v_apikey = '' THEN
      v_apikey := v_key;
    END IF;

    IF v_url !~ '^https?://' OR length(v_key) < 20 OR length(v_apikey) < 20 THEN
      UPDATE public.push_deliveries
      SET
        last_error = 'push_dispatch_not_configured',
        next_attempt_at = now() + interval '15 minutes'
      WHERE id = v_delivery_id;
      RAISE WARNING 'enqueue_web_push: segredo de dispatch inválido';
      RETURN NEW;
    END IF;

    PERFORM net.http_post(
      url := v_url,
      body := jsonb_build_object('notification_id', NEW.id),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_key,
        'apikey', v_apikey
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

CREATE OR REPLACE FUNCTION notificacoes.dispatch_pending_web_pushes()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_url text;
  v_key text;
  v_apikey text;
BEGIN
  SELECT s.decrypted_secret INTO v_url
  FROM vault.decrypted_secrets s
  WHERE s.name = 'push_function_url'
  LIMIT 1;

  SELECT s.decrypted_secret INTO v_key
  FROM vault.decrypted_secrets s
  WHERE s.name = 'push_dispatch_key'
  LIMIT 1;

  SELECT s.decrypted_secret INTO v_apikey
  FROM vault.decrypted_secrets s
  WHERE s.name = 'push_apikey'
  LIMIT 1;

  IF v_url IS NULL OR v_key IS NULL THEN
    RETURN;
  END IF;

  v_url := btrim(v_url);
  v_key := btrim(v_key);
  v_apikey := btrim(v_apikey);
  IF v_apikey IS NULL OR v_apikey = '' THEN
    v_apikey := v_key;
  END IF;

  IF v_url !~ '^https?://' OR length(v_key) < 20 OR length(v_apikey) < 20 THEN
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
      'apikey', v_apikey
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
