-- Schema próprio do Aval-Notificacoes.
-- NÃO cria trigger em public.notifications nem neste schema.
-- Consumo por polling (RPC poll_notifications). Sem SECURITY DEFINER.
--
-- Data API (MVP): incluir `notificacoes` em Exposed schemas.
-- Grants: REVOKE ALL de PUBLIC/anon/authenticated; GRANT só a service_role.
-- RLS ligado, sem policies para anon/authenticated.

CREATE SCHEMA IF NOT EXISTS notificacoes;

REVOKE ALL ON SCHEMA notificacoes FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA notificacoes TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA notificacoes
  REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA notificacoes
  REVOKE ALL ON FUNCTIONS FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA notificacoes
  GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA notificacoes
  GRANT ALL ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA notificacoes
  GRANT ALL ON FUNCTIONS TO service_role;

CREATE TABLE notificacoes.processor_cursors (
  id text PRIMARY KEY,
  horizon_at timestamptz,
  last_created_at timestamptz,
  last_notification_id uuid,
  last_poll_at timestamptz,
  last_poll_count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT processor_cursors_count_check CHECK (last_poll_count >= 0)
);

INSERT INTO notificacoes.processor_cursors (id)
VALUES ('notifications_poll')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE notificacoes.deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL UNIQUE,
  recipient_id uuid NOT NULL,
  event_type text NOT NULL,
  title text NOT NULL,
  body text,
  simulation_id uuid,
  phone_e164 text,
  status text NOT NULL DEFAULT 'pending',
  skip_reason text,
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  processing_started_at timestamptz,
  sent_at timestamptz,
  mock_mode boolean NOT NULL DEFAULT true,
  message_type text,
  template_name text,
  meta_message_id text,
  last_error text,
  notification_created_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT deliveries_status_check CHECK (
    status IN ('pending', 'processing', 'sent', 'skipped', 'failed', 'cancelled')
  ),
  CONSTRAINT deliveries_event_type_check CHECK (
    event_type IN (
      'exchange_rate_changed',
      'price_list_changed',
      'simulation_approved',
      'simulation_gestor_updated',
      'pedido_fields_updated',
      'approval_request'
    )
  ),
  CONSTRAINT deliveries_skip_reason_check CHECK (
    skip_reason IS NULL OR skip_reason IN (
      'opt_in_disabled',
      'phone_missing',
      'phone_invalid',
      'profile_missing'
    )
  ),
  CONSTRAINT deliveries_phone_format CHECK (
    phone_e164 IS NULL OR phone_e164 ~ '^\+55[1-9][0-9]{10}$'
  ),
  CONSTRAINT deliveries_attempts_check CHECK (attempts >= 0),
  CONSTRAINT deliveries_message_type_check CHECK (
    message_type IS NULL OR message_type IN ('text', 'template')
  )
);

CREATE INDEX deliveries_dispatch_idx
  ON notificacoes.deliveries (status, next_attempt_at, created_at)
  WHERE status IN ('pending', 'failed');
CREATE INDEX deliveries_recipient_idx
  ON notificacoes.deliveries (recipient_id, created_at DESC);
CREATE INDEX deliveries_event_type_idx
  ON notificacoes.deliveries (event_type, created_at DESC);
CREATE INDEX deliveries_created_idx
  ON notificacoes.deliveries (notification_created_at, notification_id);

CREATE TABLE notificacoes.send_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id uuid NOT NULL REFERENCES notificacoes.deliveries (id) ON DELETE CASCADE,
  notification_id uuid NOT NULL,
  attempt integer NOT NULL,
  channel text NOT NULL,
  status text NOT NULL,
  error text,
  meta_message_id text,
  message_type text,
  template_name text,
  http_status integer,
  request_summary jsonb,
  response_summary jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT send_logs_channel_check CHECK (channel IN ('mock', 'cloud_api')),
  CONSTRAINT send_logs_status_check CHECK (status IN ('sent', 'failed', 'skipped')),
  CONSTRAINT send_logs_attempt_check CHECK (attempt >= 1),
  CONSTRAINT send_logs_message_type_check CHECK (
    message_type IS NULL OR message_type IN ('text', 'template')
  ),
  CONSTRAINT send_logs_request_summary_size CHECK (
    request_summary IS NULL OR octet_length(request_summary::text) <= 2048
  ),
  CONSTRAINT send_logs_response_summary_size CHECK (
    response_summary IS NULL OR octet_length(response_summary::text) <= 2048
  ),
  CONSTRAINT send_logs_error_size CHECK (error IS NULL OR char_length(error) <= 500)
);

CREATE INDEX send_logs_delivery_idx
  ON notificacoes.send_logs (delivery_id, created_at DESC);
CREATE INDEX send_logs_notification_idx
  ON notificacoes.send_logs (notification_id, created_at DESC);
CREATE INDEX send_logs_created_idx
  ON notificacoes.send_logs (created_at);

ALTER TABLE notificacoes.processor_cursors ENABLE ROW LEVEL SECURITY;
ALTER TABLE notificacoes.deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE notificacoes.send_logs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE notificacoes.processor_cursors FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE notificacoes.deliveries FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE notificacoes.send_logs FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE notificacoes.processor_cursors TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE notificacoes.deliveries TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE notificacoes.send_logs TO service_role;

CREATE OR REPLACE FUNCTION notificacoes.poll_notifications(
  p_since timestamptz,
  p_limit integer DEFAULT 50
)
RETURNS TABLE (
  id uuid,
  recipient_id uuid,
  sender_id uuid,
  simulation_id uuid,
  type text,
  title text,
  body text,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, notificacoes
AS $$
  SELECT
    n.id,
    n.recipient_id,
    n.sender_id,
    n.simulation_id,
    n.type::text,
    n.title,
    n.body,
    n.created_at
  FROM public.notifications n
  WHERE n.type::text IN (
      'exchange_rate_changed',
      'price_list_changed',
      'simulation_approved',
      'simulation_gestor_updated',
      'pedido_fields_updated',
      'approval_request'
    )
    AND n.created_at >= p_since
    AND NOT EXISTS (
      SELECT 1
      FROM notificacoes.deliveries d
      WHERE d.notification_id = n.id
    )
  ORDER BY n.created_at, n.id
  LIMIT least(greatest(coalesce(p_limit, 50), 1), 200);
$$;

REVOKE ALL ON FUNCTION notificacoes.poll_notifications(timestamptz, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION notificacoes.poll_notifications(timestamptz, integer)
  TO service_role;

CREATE OR REPLACE FUNCTION notificacoes.claim_deliveries(
  p_batch_size integer DEFAULT 20,
  p_max_attempts integer DEFAULT 5,
  p_delivery_id uuid DEFAULT NULL
)
RETURNS SETOF notificacoes.deliveries
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = notificacoes
AS $$
BEGIN
  IF p_max_attempts IS NULL OR p_max_attempts < 1 OR p_max_attempts > 10 THEN
    RAISE EXCEPTION 'claim_deliveries: p_max_attempts deve estar entre 1 e 10'
      USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH candidates AS (
    SELECT d.id
    FROM notificacoes.deliveries d
    WHERE (
      d.status = 'pending'
      OR (d.status = 'failed' AND d.attempts < p_max_attempts)
      OR (
        d.status = 'processing'
        AND d.processing_started_at < now() - interval '10 minutes'
        AND d.attempts < p_max_attempts
      )
    )
      AND d.next_attempt_at <= now()
      AND (p_delivery_id IS NULL OR d.id = p_delivery_id)
    ORDER BY d.created_at, d.id
    LIMIT least(greatest(coalesce(p_batch_size, 20), 1), 100)
    FOR UPDATE SKIP LOCKED
  )
  UPDATE notificacoes.deliveries d
  SET
    status = 'processing',
    attempts = d.attempts + 1,
    processing_started_at = now(),
    last_error = NULL,
    updated_at = now()
  FROM candidates c
  WHERE d.id = c.id
  RETURNING d.*;
END;
$$;

REVOKE ALL ON FUNCTION notificacoes.claim_deliveries(integer, integer, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION notificacoes.claim_deliveries(integer, integer, uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION notificacoes.purge_send_logs(
  p_retention interval DEFAULT interval '30 days'
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = notificacoes
AS $$
DECLARE
  v_deleted integer;
BEGIN
  IF p_retention IS NULL THEN
    RAISE EXCEPTION 'purge_send_logs: retenção nula'
      USING ERRCODE = '22023';
  END IF;
  IF p_retention < interval '0' THEN
    RAISE EXCEPTION 'purge_send_logs: retenção negativa'
      USING ERRCODE = '22023';
  END IF;
  IF p_retention < interval '1 day' THEN
    RAISE EXCEPTION 'purge_send_logs: retenção menor que 1 dia'
      USING ERRCODE = '22023';
  END IF;
  IF p_retention > interval '365 days' THEN
    RAISE EXCEPTION 'purge_send_logs: retenção maior que 365 dias'
      USING ERRCODE = '22023';
  END IF;

  DELETE FROM notificacoes.send_logs
  WHERE created_at < now() - p_retention;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION notificacoes.purge_send_logs(interval)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION notificacoes.purge_send_logs(interval)
  TO service_role;

COMMENT ON SCHEMA notificacoes IS
  'Fila e logs do Aval-Notificacoes. Exposto na Data API só para service_role; anon/authenticated sem grant.';
COMMENT ON TABLE notificacoes.deliveries IS
  'Uma entrega por public.notifications.id. skipped é terminal: não reenvia se o telefone for cadastrado depois.';
COMMENT ON TABLE notificacoes.processor_cursors IS
  'Último ponto de polling. Não participa da transação do Aval.';
COMMENT ON TABLE notificacoes.send_logs IS
  'Resumo redigido da tentativa. Sem telefone, corpo da mensagem ou payload integral da Meta. Retenção: 30 dias (purge_send_logs).';
COMMENT ON FUNCTION notificacoes.claim_deliveries(integer, integer, uuid) IS
  'Reserva lote com SKIP LOCKED. p_max_attempts (1-10) é o mesmo teto do worker. p_delivery_id é só para teste; o worker não envia.';
COMMENT ON FUNCTION notificacoes.purge_send_logs(interval) IS
  'Remove send_logs mais antigos que a retenção (padrão 30 dias). Rejeita nulo, negativo, < 1 dia ou > 365 dias, sem apagar.';
