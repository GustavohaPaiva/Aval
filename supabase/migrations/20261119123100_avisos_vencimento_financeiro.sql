-- Aviso diário de vencimento para o consultor do pedido.
-- A notificação interna nasce em public.notifications. O push continua no
-- gatilho notifications_enqueue_web_push: falha de envio não desfaz o INSERT.
-- Não altera recebimento, renegociação, comissão nem financeiro_classificar.
--
-- O cron do banco está em UTC. 11:00 UTC é 08:00 em America/Sao_Paulo.
-- A data usada na regra é a de São Paulo, não a do relógio UTC.
-- Só entra o vencimento vigente que cai exatamente 3 dias à frente.
-- Dia perdido não gera aviso atrasado. Vencimento já passado também não.
-- Um pedido recebe um aviso por data. A data renegociada pode receber outro,
-- quando ela mesma chegar a 3 dias. A data antiga não é reenviada.

CREATE OR REPLACE FUNCTION notificacoes.formatar_brl(p_valor numeric)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_cents bigint;
  v_negativo boolean := false;
  v_inteiro text;
  v_grupo text := '';
BEGIN
  IF p_valor IS NULL OR p_valor = 0 THEN
    RETURN 'R$ 0,00';
  END IF;

  v_cents := round(p_valor * 100)::bigint;
  IF v_cents < 0 THEN
    v_negativo := true;
    v_cents := -v_cents;
  END IF;

  v_inteiro := (v_cents / 100)::text;
  WHILE length(v_inteiro) > 3 LOOP
    v_grupo := '.' || right(v_inteiro, 3) || v_grupo;
    v_inteiro := left(v_inteiro, length(v_inteiro) - 3);
  END LOOP;

  RETURN CASE WHEN v_negativo THEN '-R$ ' ELSE 'R$ ' END
    || v_inteiro
    || v_grupo
    || ','
    || lpad((v_cents % 100)::text, 2, '0');
END;
$$;

REVOKE ALL ON FUNCTION notificacoes.formatar_brl(numeric) FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS notificacoes.avisos_vencimento (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  simulation_id uuid NOT NULL REFERENCES public.simulations (id) ON DELETE CASCADE,
  vencimento date NOT NULL,
  recipient_id uuid NOT NULL,
  notification_id uuid NOT NULL,
  saldo numeric(14, 2) NOT NULL CHECK (saldo > 0),
  criado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT avisos_vencimento_pedido_data_key UNIQUE (simulation_id, vencimento)
);

COMMENT ON TABLE notificacoes.avisos_vencimento IS
  'Um aviso interno por pedido e data de vencimento. Impede reenvio da mesma data, inclusive com execuções simultâneas.';

ALTER TABLE notificacoes.avisos_vencimento ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE notificacoes.avisos_vencimento FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION notificacoes.avisar_vencimentos_financeiros()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, notificacoes
AS $$
DECLARE
  v_hoje date := (timezone('America/Sao_Paulo', now()))::date;
  v_count integer := 0;
BEGIN
  PERFORM pg_advisory_xact_lock(814201, 20261119);

  WITH candidatos AS (
    SELECT
      s.id AS simulation_id,
      COALESCE(t.vencimento, s.data_pagamento) AS vencimento,
      s.user_id AS recipient_id,
      COALESCE(
        NULLIF(regexp_replace(btrim(c.nome), '[[:cntrl:]]', '', 'g'), ''),
        '—'
      ) AS cliente_nome,
      round(COALESCE(t.valor_devido, s.total_proposta, 0), 2) AS valor_devido,
      round(COALESCE(rec.recebido, 0), 2) AS valor_recebido
    FROM public.simulations s
    JOIN public.profiles p ON p.id = s.user_id
    LEFT JOIN public.clients c ON c.id = s.client_id
    LEFT JOIN public.pedido_financeiro_titulos t ON t.simulation_id = s.id
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(r.valor), 0) AS recebido
      FROM public.pedido_financeiro_recebimentos r
      WHERE r.simulation_id = s.id
        AND r.status = 'ativo'
    ) rec ON true
    WHERE s.status = 'converted'::public.simulation_status
      AND s.ativo IS TRUE
      AND p.role = 'consultor'::public.user_role
      AND COALESCE(t.vencimento, s.data_pagamento) = v_hoje + 3
  ),
  classificados AS (
    SELECT
      c.simulation_id,
      c.vencimento,
      c.recipient_id,
      c.cliente_nome,
      public.financeiro_classificar(
        c.valor_devido,
        c.valor_recebido,
        c.vencimento,
        v_hoje,
        7
      ) AS situacao
    FROM candidatos c
  ),
  elegiveis AS (
    SELECT
      c.simulation_id,
      c.vencimento,
      c.recipient_id,
      c.cliente_nome,
      (c.situacao ->> 'saldo')::numeric AS saldo
    FROM classificados c
    WHERE (c.situacao ->> 'saldo')::numeric > 0
  ),
  reservados AS (
    INSERT INTO notificacoes.avisos_vencimento (
      simulation_id,
      vencimento,
      recipient_id,
      notification_id,
      saldo
    )
    SELECT
      e.simulation_id,
      e.vencimento,
      e.recipient_id,
      gen_random_uuid(),
      e.saldo
    FROM elegiveis e
    ON CONFLICT (simulation_id, vencimento) DO NOTHING
    RETURNING simulation_id, vencimento, recipient_id, notification_id, saldo
  )
  INSERT INTO public.notifications (
    id,
    recipient_id,
    sender_id,
    simulation_id,
    type,
    title,
    body
  )
  SELECT
    r.notification_id,
    r.recipient_id,
    NULL,
    r.simulation_id,
    'pagamento_vencimento'::public.notification_type,
    'Pagamento próximo do vencimento',
    'O pedido do cliente '
      || e.cliente_nome
      || ' vence em 3 dias. Saldo pendente: '
      || notificacoes.formatar_brl(r.saldo)
      || '.'
  FROM reservados r
  JOIN elegiveis e ON e.simulation_id = r.simulation_id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION notificacoes.avisar_vencimentos_financeiros() IS
  'Grava o aviso interno dos pedidos convertidos e ativos que vencem em 3 dias, em America/Sao_Paulo, com saldo em aberto. O push segue o gatilho já existente.';

REVOKE ALL ON FUNCTION notificacoes.avisar_vencimentos_financeiros()
  FROM PUBLIC, anon, authenticated, service_role;

INSERT INTO public.push_event_types (event_type)
VALUES ('pagamento_vencimento')
ON CONFLICT (event_type) DO NOTHING;

DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'financeiro_aviso_vencimento') THEN
      PERFORM cron.unschedule('financeiro_aviso_vencimento');
    END IF;
    PERFORM cron.schedule(
      'financeiro_aviso_vencimento',
      '0 11 * * *',
      'SELECT notificacoes.avisar_vencimentos_financeiros()'
    );
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'pg_cron financeiro_aviso_vencimento: %', SQLERRM;
END
$cron$;
