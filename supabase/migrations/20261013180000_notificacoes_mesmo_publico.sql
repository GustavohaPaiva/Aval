-- Notificações internas e push passam a seguir o mesmo público.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'notification_type'
      AND e.enumlabel IN ('simulation_saved', 'price_list_changed', 'approval_request', 'simulation_approved')
    GROUP BY t.oid
    HAVING count(*) = 4
  ) THEN
    RAISE EXCEPTION 'Tipos de notificação de simulação ou lista ainda não existem neste banco';
  END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS notificacoes;
REVOKE ALL ON SCHEMA notificacoes FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA notificacoes TO postgres;

-- O push continua nascendo do INSERT em public.notifications
-- (trigger notifications_enqueue_web_push). Esta migration só corrige
-- quem recebe e o que o texto diz. O histórico já lido não é apagado.

CREATE OR REPLACE FUNCTION notificacoes.count_label(
  p_count integer,
  p_one text,
  p_many text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT concat(
    coalesce(p_count, 0)::text,
    ' ',
    CASE WHEN coalesce(p_count, 0) = 1 THEN p_one ELSE p_many END
  );
$$;

CREATE OR REPLACE FUNCTION notificacoes.lista_label(
  p_nome text,
  p_quarter text,
  p_estado text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT coalesce(
    nullif(
      concat_ws(
        ' · ',
        nullif(btrim(p_nome), ''),
        nullif(btrim(p_quarter), ''),
        nullif(btrim(p_estado), '')
      ),
      ''
    ),
    'Fornecedor'
  );
$$;

REVOKE ALL ON FUNCTION notificacoes.count_label(integer, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION notificacoes.lista_label(text, text, text) FROM PUBLIC, anon, authenticated;

-- skip: não lida idêntica, sem novo push.
-- replace: apaga a não lida do mesmo evento e insere de novo, um push.
-- insert: primeira linha, um push.
CREATE OR REPLACE FUNCTION notificacoes.write_notification(
  p_recipient uuid,
  p_sender uuid,
  p_simulation uuid,
  p_type public.notification_type,
  p_title text,
  p_body text,
  p_replace_same_key boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_recipient IS NULL OR p_recipient IS NOT DISTINCT FROM p_sender THEN
    RETURN;
  END IF;

  IF length(btrim(coalesce(p_title, ''))) = 0 THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.notifications n
    WHERE n.recipient_id = p_recipient
      AND n.simulation_id IS NOT DISTINCT FROM p_simulation
      AND n.type = p_type
      AND n.read_at IS NULL
      AND n.title = btrim(p_title)
      AND n.body IS NOT DISTINCT FROM p_body
  ) THEN
    RETURN;
  END IF;

  IF coalesce(p_replace_same_key, false) THEN
    DELETE FROM public.notifications n
    WHERE n.recipient_id = p_recipient
      AND n.simulation_id IS NOT DISTINCT FROM p_simulation
      AND n.type = p_type
      AND n.read_at IS NULL;
  END IF;

  INSERT INTO public.notifications (
    recipient_id,
    sender_id,
    simulation_id,
    type,
    title,
    body
  ) VALUES (
    p_recipient,
    p_sender,
    p_simulation,
    p_type,
    btrim(p_title),
    p_body
  );
END;
$$;

REVOKE ALL ON FUNCTION notificacoes.write_notification(uuid, uuid, uuid, public.notification_type, text, text, boolean)
  FROM PUBLIC, anon, authenticated;

-- Dono consultor, diferente de quem executou a ação. Ausência de simulação é erro.
CREATE OR REPLACE FUNCTION notificacoes.consultor_destinatario(p_simulation_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_role public.user_role;
BEGIN
  SELECT s.user_id, p.role
  INTO v_owner, v_role
  FROM public.simulations s
  LEFT JOIN public.profiles p ON p.id = s.user_id
  WHERE s.id = p_simulation_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Simulação não encontrada';
  END IF;

  IF v_role IS DISTINCT FROM 'consultor'::public.user_role THEN
    RETURN NULL;
  END IF;

  IF v_owner IS NOT DISTINCT FROM auth.uid() THEN
    RETURN NULL;
  END IF;

  RETURN v_owner;
END;
$$;

REVOKE ALL ON FUNCTION notificacoes.consultor_destinatario(uuid) FROM PUBLIC, anon, authenticated;

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
DECLARE
  v_gestor uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  IF NOT public.is_consultor() THEN
    RETURN;
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

  IF length(btrim(coalesce(p_title, ''))) = 0 THEN
    RAISE EXCEPTION 'Título da notificação inválido';
  END IF;

  FOR v_gestor IN
    SELECT p.id
    FROM public.profiles p
    WHERE p.role = 'gestor'::public.user_role
      AND p.id IS DISTINCT FROM auth.uid()
  LOOP
    PERFORM notificacoes.write_notification(
      v_gestor,
      auth.uid(),
      p_simulation_id,
      'approval_request'::public.notification_type,
      p_title,
      p_body,
      true
    );
  END LOOP;
END;
$$;

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
  v_gestor uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  IF NOT public.is_consultor() THEN
    RETURN;
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

  IF length(btrim(coalesce(p_title, ''))) = 0 THEN
    RAISE EXCEPTION 'Título da notificação inválido';
  END IF;

  FOR v_gestor IN
    SELECT p.id
    FROM public.profiles p
    WHERE p.role = 'gestor'::public.user_role
      AND p.id IS DISTINCT FROM auth.uid()
  LOOP
    PERFORM notificacoes.write_notification(
      v_gestor,
      auth.uid(),
      p_simulation_id,
      'simulation_saved'::public.notification_type,
      p_title,
      p_body,
      true
    );
  END LOOP;
END;
$$;

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

  v_owner := notificacoes.consultor_destinatario(p_simulation_id);

  UPDATE public.notifications
  SET read_at = now()
  WHERE simulation_id = p_simulation_id
    AND type = 'approval_request'::public.notification_type
    AND read_at IS NULL;

  IF v_owner IS NULL THEN
    RETURN;
  END IF;

  PERFORM notificacoes.write_notification(
    v_owner,
    auth.uid(),
    p_simulation_id,
    p_type,
    p_title,
    p_body,
    true
  );
END;
$$;

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
DECLARE
  v_gestor uuid;
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

  FOR v_gestor IN
    SELECT p.id
    FROM public.profiles p
    WHERE p.role = 'gestor'::public.user_role
      AND p.id IS DISTINCT FROM auth.uid()
  LOOP
    PERFORM notificacoes.write_notification(
      v_gestor,
      auth.uid(),
      p_simulation_id,
      'order_approval_request'::public.notification_type,
      p_title,
      p_body,
      true
    );
  END LOOP;
END;
$$;

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
DECLARE
  v_gestor uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.simulations s
    WHERE s.id = p_simulation_id
      AND s.user_id = auth.uid()
      AND s.status = 'conversion_requested'::public.simulation_status
  ) THEN
    RAISE EXCEPTION 'Simulação com conversão solicitada não encontrada';
  END IF;

  FOR v_gestor IN
    SELECT p.id
    FROM public.profiles p
    WHERE p.role = 'gestor'::public.user_role
      AND p.id IS DISTINCT FROM auth.uid()
  LOOP
    PERFORM notificacoes.write_notification(
      v_gestor,
      auth.uid(),
      p_simulation_id,
      'order_conversion_request'::public.notification_type,
      p_title,
      p_body,
      true
    );
  END LOOP;
END;
$$;

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

  UPDATE public.notifications
  SET read_at = now()
  WHERE simulation_id = p_simulation_id
    AND type = 'order_approval_request'::public.notification_type
    AND read_at IS NULL;

  IF v_owner IS NOT DISTINCT FROM auth.uid() THEN
    RETURN;
  END IF;

  PERFORM notificacoes.write_notification(
    v_owner,
    auth.uid(),
    p_simulation_id,
    p_type,
    p_title,
    p_body,
    true
  );
END;
$$;

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

  v_owner := notificacoes.consultor_destinatario(p_simulation_id);
  IF v_owner IS NULL THEN
    RETURN;
  END IF;

  PERFORM notificacoes.write_notification(
    v_owner,
    auth.uid(),
    p_simulation_id,
    'simulation_gestor_updated'::public.notification_type,
    p_title,
    p_body,
    true
  );
END;
$$;

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

  v_owner := notificacoes.consultor_destinatario(p_simulation_id);
  IF v_owner IS NULL THEN
    RETURN;
  END IF;

  PERFORM notificacoes.write_notification(
    v_owner,
    auth.uid(),
    p_simulation_id,
    'pedido_fields_updated'::public.notification_type,
    p_title,
    p_body,
    true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.notify_gestores_simulation_pending(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notify_gestores_simulation_pending(uuid, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.notify_gestores_simulation_saved(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notify_gestores_simulation_saved(uuid, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.notify_consultor_simulation_decision(uuid, public.notification_type, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notify_consultor_simulation_decision(uuid, public.notification_type, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.notify_gestores_order_pending(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notify_gestores_order_pending(uuid, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.notify_gestores_order_conversion_request(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notify_gestores_order_conversion_request(uuid, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.notify_consultor_order_decision(uuid, public.notification_type, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notify_consultor_order_decision(uuid, public.notification_type, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.notify_consultor_gestor_simulation_updated(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notify_consultor_gestor_simulation_updated(uuid, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.notify_consultor_pedido_fields_updated(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notify_consultor_pedido_fields_updated(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.notify_consultores_exchange_rate_changed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.notifications (recipient_id, sender_id, type, title, body)
  SELECT
    p.id,
    NEW.criado_por,
    'exchange_rate_changed'::public.notification_type,
    'Valor do dólar atualizado',
    format(
      'Nova cotação de %s: R$ %s. Vigência: %s.',
      upper(trim(NEW.moeda_origem)),
      trim(to_char(NEW.taxa_conversao, 'FM999999990D000000')),
      to_char(NEW.data_vigencia AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI')
    )
  FROM public.profiles p
  WHERE p.role = 'consultor'::public.user_role
    AND p.id IS DISTINCT FROM NEW.criado_por;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_consultores_exchange_rate_changed() FROM PUBLIC, anon, authenticated;

-- O trigger antigo avisava só "nova lista" e ignorava inativação e exclusão.
CREATE OR REPLACE FUNCTION public.notify_consultores_price_list_changed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE ALL ON FUNCTION public.notify_consultores_price_list_changed() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS lotes_importacao_notify_consultores ON public.lotes_importacao;

CREATE OR REPLACE FUNCTION notificacoes.capture_lista_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_forn_id uuid;
  v_forn text;
  v_quarter text;
  v_estado text;
  v_lote_id uuid;
  v_op text;
  v_nome text;
  v_old_ativo boolean;
  v_new_ativo boolean;
  v_old_lote uuid;
  v_new_lote uuid;
  v_quarter_fallback text;
  v_estado_fallback text;
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS lista_notif_eventos (
    kind text NOT NULL,
    op text,
    lote_id uuid,
    fornecedor_id uuid,
    fornecedor_nome text,
    quarter text,
    estado text,
    old_status text,
    new_status text,
    old_ativo boolean,
    new_ativo boolean,
    produto_nome text,
    old_produto_ativo boolean,
    new_produto_ativo boolean,
    old_lote_id uuid,
    new_lote_id uuid
  ) ON COMMIT DROP;

  IF TG_TABLE_NAME = 'lotes_importacao' THEN
    IF TG_OP = 'DELETE' THEN
      SELECT f.nome INTO v_forn
      FROM public.fornecedores f
      WHERE f.id = OLD.fornecedor_id;

      INSERT INTO pg_temp.lista_notif_eventos (
        kind, op, lote_id, fornecedor_id, fornecedor_nome, quarter, estado,
        old_status, new_status, old_ativo, new_ativo
      ) VALUES (
        'lote_delete',
        NULL,
        OLD.id,
        OLD.fornecedor_id,
        coalesce(v_forn, 'Fornecedor'),
        OLD.quarter_calculado,
        OLD.estado_padrao,
        OLD.status::text,
        NULL,
        OLD.ativo,
        NULL
      );
      RETURN OLD;
    END IF;

    IF TG_OP = 'UPDATE'
       AND OLD.status IS NOT DISTINCT FROM NEW.status
       AND OLD.ativo IS NOT DISTINCT FROM NEW.ativo THEN
      RETURN NEW;
    END IF;

    IF TG_OP = 'INSERT'
       AND (NEW.status::text IS DISTINCT FROM 'concluido' OR coalesce(NEW.ativo, false) IS NOT TRUE) THEN
      RETURN NEW;
    END IF;

    SELECT f.nome INTO v_forn
    FROM public.fornecedores f
    WHERE f.id = NEW.fornecedor_id;

    IF TG_OP = 'UPDATE' THEN
      INSERT INTO pg_temp.lista_notif_eventos (
        kind, op, lote_id, fornecedor_id, fornecedor_nome, quarter, estado,
        old_status, new_status, old_ativo, new_ativo
      ) VALUES (
        'lote', NULL, NEW.id, NEW.fornecedor_id, coalesce(v_forn, 'Fornecedor'),
        NEW.quarter_calculado, NEW.estado_padrao,
        OLD.status::text, NEW.status::text, OLD.ativo, NEW.ativo
      );
    ELSE
      INSERT INTO pg_temp.lista_notif_eventos (
        kind, op, lote_id, fornecedor_id, fornecedor_nome, quarter, estado,
        old_status, new_status, old_ativo, new_ativo
      ) VALUES (
        'lote', NULL, NEW.id, NEW.fornecedor_id, coalesce(v_forn, 'Fornecedor'),
        NEW.quarter_calculado, NEW.estado_padrao,
        NULL, NEW.status::text, NULL, NEW.ativo
      );
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.ativo IS NOT DISTINCT FROM NEW.ativo
     AND OLD.lote_id IS NOT DISTINCT FROM NEW.lote_id THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_op := 'insert';
    v_lote_id := NEW.lote_id;
    v_forn_id := NEW.fornecedor_id;
    v_nome := NEW.nome;
    v_old_ativo := NULL;
    v_new_ativo := NEW.ativo;
    v_old_lote := NULL;
    v_new_lote := NEW.lote_id;
    v_quarter_fallback := NEW.quarter;
    v_estado_fallback := NEW.estado;
  ELSIF TG_OP = 'DELETE' THEN
    v_op := 'delete';
    v_lote_id := OLD.lote_id;
    v_forn_id := OLD.fornecedor_id;
    v_nome := OLD.nome;
    v_old_ativo := OLD.ativo;
    v_new_ativo := NULL;
    v_old_lote := OLD.lote_id;
    v_new_lote := NULL;
    v_quarter_fallback := OLD.quarter;
    v_estado_fallback := OLD.estado;
  ELSE
    IF OLD.ativo IS DISTINCT FROM NEW.ativo THEN
      v_op := 'ativo';
    ELSE
      v_op := 'move';
    END IF;
    v_lote_id := NEW.lote_id;
    v_forn_id := NEW.fornecedor_id;
    v_nome := NEW.nome;
    v_old_ativo := OLD.ativo;
    v_new_ativo := NEW.ativo;
    v_old_lote := OLD.lote_id;
    v_new_lote := NEW.lote_id;
    v_quarter_fallback := coalesce(NEW.quarter, OLD.quarter);
    v_estado_fallback := coalesce(NEW.estado, OLD.estado);
  END IF;

  SELECT
    coalesce(f.nome, 'Fornecedor'),
    coalesce(nullif(btrim(l.quarter_calculado), ''), nullif(btrim(v_quarter_fallback), '')),
    coalesce(nullif(btrim(l.estado_padrao), ''), nullif(btrim(v_estado_fallback), '')),
    coalesce(l.fornecedor_id, v_forn_id)
  INTO v_forn, v_quarter, v_estado, v_forn_id
  FROM (SELECT v_lote_id AS id) seed
  LEFT JOIN public.lotes_importacao l ON l.id = seed.id
  LEFT JOIN public.fornecedores f ON f.id = coalesce(l.fornecedor_id, v_forn_id);

  INSERT INTO pg_temp.lista_notif_eventos (
    kind, op, lote_id, fornecedor_id, fornecedor_nome, quarter, estado,
    produto_nome, old_produto_ativo, new_produto_ativo, old_lote_id, new_lote_id
  ) VALUES (
    'produto',
    v_op,
    v_lote_id,
    v_forn_id,
    coalesce(v_forn, 'Fornecedor'),
    v_quarter,
    v_estado,
    v_nome,
    v_old_ativo,
    v_new_ativo,
    v_old_lote,
    v_new_lote
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'capture_lista_event: %', SQLERRM;
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION notificacoes.flush_lista_notificacoes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_launch record;
  v_off record;
  v_removed record;
  v_prod record;
  v_covered uuid[] := '{}'::uuid[];
  v_motivo text;
  v_exclusao boolean;
  v_label text;
  v_novos integer;
  v_atualizados integer;
  v_saida integer;
  v_inativados integer;
  v_excluidos integer;
  v_voltaram integer;
  v_substituida boolean;
  v_status text;
  v_ativo boolean;
  v_ref uuid;
  v_nome text;
  v_title text;
  v_body text;
BEGIN
  IF current_setting('aval.lista_flush_done', true) = '1' THEN
    RETURN NULL;
  END IF;

  PERFORM set_config('aval.lista_flush_done', '1', true);

  IF to_regclass('pg_temp.lista_notif_eventos') IS NULL THEN
    RETURN NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_temp.lista_notif_eventos) THEN
    RETURN NULL;
  END IF;

  v_motivo := current_setting('aval.lista_motivo', true);
  v_exclusao := v_motivo = 'exclusao';

  CREATE TEMP TABLE IF NOT EXISTS lista_notif_msgs (
    title text NOT NULL,
    body text NOT NULL
  ) ON COMMIT DROP;
  TRUNCATE pg_temp.lista_notif_msgs;

  FOR v_launch IN
    SELECT *
    FROM pg_temp.lista_notif_eventos
    WHERE kind = 'lote'
      AND new_status = 'concluido'
      AND new_ativo IS TRUE
      AND old_status IS DISTINCT FROM 'concluido'
  LOOP
    v_covered := array_append(v_covered, v_launch.lote_id);
    v_label := notificacoes.lista_label(v_launch.fornecedor_nome, v_launch.quarter, v_launch.estado);

    SELECT count(*) INTO v_novos
    FROM pg_temp.lista_notif_eventos p
    WHERE p.kind = 'produto'
      AND p.op = 'insert'
      AND p.new_lote_id = v_launch.lote_id;

    SELECT count(*) INTO v_atualizados
    FROM pg_temp.lista_notif_eventos p
    WHERE p.kind = 'produto'
      AND p.op NOT IN ('insert', 'delete')
      AND coalesce(p.new_lote_id, p.lote_id) = v_launch.lote_id
      AND (
        (p.old_lote_id IS NOT NULL AND p.old_lote_id IS DISTINCT FROM v_launch.lote_id)
        OR (p.old_produto_ativo IS FALSE AND p.new_produto_ativo IS TRUE)
      );

    IF v_novos > 0 THEN
      v_body := format(
        'Chegaram %s na lista de %s.',
        notificacoes.count_label(v_novos, 'produto novo', 'produtos novos'),
        v_label
      );
      IF v_atualizados > 0 THEN
        v_body := v_body || ' ' || notificacoes.count_label(
          v_atualizados,
          'produto já existente foi atualizado',
          'produtos já existentes foram atualizados'
        ) || '.';
      END IF;
      INSERT INTO pg_temp.lista_notif_msgs (title, body)
      VALUES ('Chegada de novos produtos', v_body);
    ELSIF v_atualizados > 0 THEN
      INSERT INTO pg_temp.lista_notif_msgs (title, body)
      VALUES (
        'Lista de produtos atualizada',
        format(
          'A lista de %s foi atualizada. %s e nenhum produto novo chegou.',
          v_label,
          notificacoes.count_label(
            v_atualizados,
            'produto já existente foi atualizado',
            'produtos já existentes foram atualizados'
          )
        )
      );
    ELSE
      INSERT INTO pg_temp.lista_notif_msgs (title, body)
      VALUES (
        'Lista de produtos lançada',
        format('A lista de %s foi lançada.', v_label)
      );
    END IF;
  END LOOP;

  FOR v_launch IN
    SELECT *
    FROM pg_temp.lista_notif_eventos
    WHERE kind = 'lote'
      AND old_status = 'concluido'
      AND old_ativo IS FALSE
      AND new_ativo IS TRUE
      AND new_status = 'concluido'
  LOOP
    v_covered := array_append(v_covered, v_launch.lote_id);
    v_label := notificacoes.lista_label(v_launch.fornecedor_nome, v_launch.quarter, v_launch.estado);

    SELECT count(*) INTO v_voltaram
    FROM pg_temp.lista_notif_eventos p
    WHERE p.kind = 'produto'
      AND p.old_produto_ativo IS FALSE
      AND p.new_produto_ativo IS TRUE
      AND (
        p.lote_id = v_launch.lote_id
        OR p.old_lote_id = v_launch.lote_id
        OR p.new_lote_id = v_launch.lote_id
      );

    INSERT INTO pg_temp.lista_notif_msgs (title, body)
    VALUES (
      'Lista de produtos reativada',
      format(
        'A lista de %s foi reativada. %s ao catálogo.',
        v_label,
        notificacoes.count_label(v_voltaram, 'produto voltou', 'produtos voltaram')
      )
    );
  END LOOP;

  FOR v_removed IN
    SELECT *
    FROM pg_temp.lista_notif_eventos
    WHERE kind = 'lote_delete'
      AND old_status = 'concluido'
  LOOP
    v_covered := array_append(v_covered, v_removed.lote_id);
    v_label := notificacoes.lista_label(v_removed.fornecedor_nome, v_removed.quarter, v_removed.estado);

    SELECT count(*) INTO v_inativados
    FROM pg_temp.lista_notif_eventos p
    WHERE p.kind = 'produto'
      AND p.op NOT IN ('insert', 'delete')
      AND p.old_produto_ativo IS TRUE
      AND p.new_produto_ativo IS FALSE
      AND (p.new_lote_id IS NULL OR p.new_lote_id = v_removed.lote_id)
      AND (
        p.lote_id = v_removed.lote_id
        OR p.old_lote_id = v_removed.lote_id
        OR p.new_lote_id = v_removed.lote_id
      );

    SELECT count(*) INTO v_excluidos
    FROM pg_temp.lista_notif_eventos p
    WHERE p.kind = 'produto'
      AND p.op = 'delete'
      AND p.lote_id = v_removed.lote_id;

    INSERT INTO pg_temp.lista_notif_msgs (title, body)
    VALUES (
      'Lista de produtos excluída',
      format(
        'A lista de %s foi excluída. %s e %s do catálogo.',
        v_label,
        notificacoes.count_label(v_inativados, 'produto em uso foi inativado', 'produtos em uso foram inativados'),
        notificacoes.count_label(v_excluidos, 'produto foi removido', 'produtos foram removidos')
      )
    );
  END LOOP;

  FOR v_off IN
    SELECT *
    FROM pg_temp.lista_notif_eventos
    WHERE kind = 'lote'
      AND old_ativo IS TRUE
      AND new_ativo IS FALSE
      AND old_status = 'concluido'
  LOOP
    IF v_off.lote_id = ANY (v_covered) THEN
      CONTINUE;
    END IF;

    v_covered := array_append(v_covered, v_off.lote_id);
    v_label := notificacoes.lista_label(v_off.fornecedor_nome, v_off.quarter, v_off.estado);

    SELECT EXISTS (
      SELECT 1
      FROM pg_temp.lista_notif_eventos pub
      WHERE pub.lote_id IS DISTINCT FROM v_off.lote_id
        AND (
          (
            pub.kind = 'lote'
            AND pub.new_status = 'concluido'
            AND pub.new_ativo IS TRUE
            AND pub.old_status IS DISTINCT FROM 'concluido'
          )
          OR (
            pub.kind = 'lote'
            AND pub.old_status = 'concluido'
            AND pub.old_ativo IS FALSE
            AND pub.new_ativo IS TRUE
            AND pub.new_status = 'concluido'
          )
        )
        AND (
          CASE
            WHEN pub.fornecedor_id IS NOT NULL THEN 'id:' || pub.fornecedor_id::text
            ELSE 'nome:' || lower(btrim(coalesce(pub.fornecedor_nome, '')))
          END
        ) = (
          CASE
            WHEN v_off.fornecedor_id IS NOT NULL THEN 'id:' || v_off.fornecedor_id::text
            ELSE 'nome:' || lower(btrim(coalesce(v_off.fornecedor_nome, '')))
          END
        )
        AND lower(btrim(coalesce(pub.quarter, ''))) = lower(btrim(coalesce(v_off.quarter, '')))
        AND upper(btrim(coalesce(pub.estado, ''))) = upper(btrim(coalesce(v_off.estado, '')))
    ) INTO v_substituida;

    SELECT count(*) INTO v_saida
    FROM pg_temp.lista_notif_eventos p
    WHERE p.kind = 'produto'
      AND p.op NOT IN ('insert', 'delete')
      AND p.old_produto_ativo IS TRUE
      AND p.new_produto_ativo IS FALSE
      AND (p.new_lote_id IS NULL OR p.new_lote_id = v_off.lote_id)
      AND (
        p.lote_id = v_off.lote_id
        OR p.old_lote_id = v_off.lote_id
        OR p.new_lote_id = v_off.lote_id
      );

    SELECT count(*) INTO v_excluidos
    FROM pg_temp.lista_notif_eventos p
    WHERE p.kind = 'produto'
      AND p.op = 'delete'
      AND p.lote_id = v_off.lote_id;

    IF v_exclusao THEN
      INSERT INTO pg_temp.lista_notif_msgs (title, body)
      VALUES (
        'Lista de produtos excluída',
        format(
          'A lista de %s foi excluída. %s e %s do catálogo.',
          v_label,
          notificacoes.count_label(v_saida, 'produto em uso foi inativado', 'produtos em uso foram inativados'),
          notificacoes.count_label(v_excluidos, 'produto foi removido', 'produtos foram removidos')
        )
      );
    ELSIF v_substituida THEN
      INSERT INTO pg_temp.lista_notif_msgs (title, body)
      VALUES (
        'Saída de produtos da lista',
        format(
          '%s da lista de %s porque ela foi substituída.',
          notificacoes.count_label(v_saida, 'produto saiu', 'produtos saíram'),
          v_label
        )
      );
    ELSE
      INSERT INTO pg_temp.lista_notif_msgs (title, body)
      VALUES (
        'Lista de produtos inativada',
        format(
          'A lista de %s foi inativada. %s do catálogo.',
          v_label,
          notificacoes.count_label(v_saida, 'produto saiu', 'produtos saíram')
        )
      );
    END IF;
  END LOOP;

  FOR v_prod IN
    SELECT * FROM pg_temp.lista_notif_eventos WHERE kind = 'produto'
  LOOP
    IF v_prod.lote_id = ANY (v_covered)
       OR v_prod.old_lote_id = ANY (v_covered)
       OR v_prod.new_lote_id = ANY (v_covered) THEN
      CONTINUE;
    END IF;

    v_ref := coalesce(v_prod.new_lote_id, v_prod.lote_id, v_prod.old_lote_id);
    IF v_ref IS NOT NULL THEN
      SELECT l.status::text, l.ativo
      INTO v_status, v_ativo
      FROM public.lotes_importacao l
      WHERE l.id = v_ref;

      IF NOT FOUND
         OR v_status IS DISTINCT FROM 'concluido'
         OR coalesce(v_ativo, false) IS NOT TRUE THEN
        CONTINUE;
      END IF;
    END IF;

    v_label := notificacoes.lista_label(v_prod.fornecedor_nome, v_prod.quarter, v_prod.estado);
    v_nome := coalesce(nullif(btrim(v_prod.produto_nome), ''), 'Produto');

    IF v_prod.op = 'insert' THEN
      v_title := 'Novo produto na lista';
      v_body := format('O produto %s entrou na lista de %s.', v_nome, v_label);
    ELSIF v_prod.op = 'delete' THEN
      v_title := 'Produto excluído da lista';
      v_body := format('O produto %s foi excluído da lista de %s.', v_nome, v_label);
    ELSIF v_prod.old_produto_ativo IS TRUE AND v_prod.new_produto_ativo IS FALSE THEN
      v_title := 'Produto inativado';
      v_body := format('O produto %s foi inativado e saiu da lista de %s.', v_nome, v_label);
    ELSIF v_prod.old_produto_ativo IS FALSE AND v_prod.new_produto_ativo IS TRUE THEN
      v_title := 'Produto reativado na lista';
      v_body := format('O produto %s foi reativado na lista de %s.', v_nome, v_label);
    ELSE
      CONTINUE;
    END IF;

    INSERT INTO pg_temp.lista_notif_msgs (title, body) VALUES (v_title, v_body);
  END LOOP;

  DELETE FROM pg_temp.lista_notif_msgs a
  USING pg_temp.lista_notif_msgs b
  WHERE a.ctid > b.ctid
    AND a.title = b.title
    AND a.body IS NOT DISTINCT FROM b.body;

  INSERT INTO public.notifications (recipient_id, sender_id, type, title, body)
  SELECT
    pr.id,
    auth.uid(),
    'price_list_changed'::public.notification_type,
    m.title,
    m.body
  FROM pg_temp.lista_notif_msgs m
  CROSS JOIN public.profiles pr
  WHERE pr.role = 'consultor'::public.user_role
    AND pr.id IS DISTINCT FROM auth.uid()
    AND NOT EXISTS (
      SELECT 1
      FROM public.notifications n
      WHERE n.recipient_id = pr.id
        AND n.type = 'price_list_changed'::public.notification_type
        AND n.simulation_id IS NULL
        AND n.read_at IS NULL
        AND n.title = m.title
        AND n.body IS NOT DISTINCT FROM m.body
    );

  RETURN NULL;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'flush_lista_notificacoes: %', SQLERRM;
    RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION notificacoes.capture_lista_event() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION notificacoes.flush_lista_notificacoes() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS lotes_lista_notif_capture ON public.lotes_importacao;
CREATE TRIGGER lotes_lista_notif_capture
  AFTER INSERT OR DELETE OR UPDATE OF status, ativo
  ON public.lotes_importacao
  FOR EACH ROW
  EXECUTE FUNCTION notificacoes.capture_lista_event();

DROP TRIGGER IF EXISTS lotes_lista_notif_flush ON public.lotes_importacao;
CREATE CONSTRAINT TRIGGER lotes_lista_notif_flush
  AFTER INSERT OR DELETE OR UPDATE OF status, ativo
  ON public.lotes_importacao
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION notificacoes.flush_lista_notificacoes();

DROP TRIGGER IF EXISTS produtos_lista_notif_capture ON public.produtos_oficiais;
CREATE TRIGGER produtos_lista_notif_capture
  AFTER INSERT OR DELETE OR UPDATE OF ativo, lote_id
  ON public.produtos_oficiais
  FOR EACH ROW
  EXECUTE FUNCTION notificacoes.capture_lista_event();

DROP TRIGGER IF EXISTS produtos_lista_notif_flush ON public.produtos_oficiais;
CREATE CONSTRAINT TRIGGER produtos_lista_notif_flush
  AFTER INSERT OR DELETE OR UPDATE OF ativo, lote_id
  ON public.produtos_oficiais
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION notificacoes.flush_lista_notificacoes();

-- A exclusão que só inativa produtos em uso fica igual à inativação
-- se o flush não souber o motivo. O flag vale só nesta transação.
CREATE OR REPLACE FUNCTION public.excluir_lista_importacao(p_lote_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_inativados int := 0;
  v_excluidos int := 0;
  v_restantes int := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sessão inválida.';
  END IF;

  IF NOT public.is_gestor() THEN
    RAISE EXCEPTION 'Acesso negado.';
  END IF;

  PERFORM set_config('aval.lista_motivo', 'exclusao', true);

  PERFORM 1
  FROM public.lotes_importacao
  WHERE id = p_lote_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lista de produtos não encontrada.';
  END IF;

  UPDATE public.produtos_oficiais po
  SET ativo = false, updated_at = now()
  WHERE po.lote_id = p_lote_id
    AND (
      EXISTS (SELECT 1 FROM public.simulation_items si WHERE si.product_id = po.id)
      OR EXISTS (SELECT 1 FROM public.compra_itens ci WHERE ci.produto_oficial_id = po.id)
      OR EXISTS (SELECT 1 FROM public.estoque_lotes el WHERE el.produto_oficial_id = po.id)
    );

  GET DIAGNOSTICS v_inativados = ROW_COUNT;

  DELETE FROM public.produtos_oficiais po
  WHERE po.lote_id = p_lote_id
    AND NOT EXISTS (SELECT 1 FROM public.simulation_items si WHERE si.product_id = po.id)
    AND NOT EXISTS (SELECT 1 FROM public.compra_itens ci WHERE ci.produto_oficial_id = po.id)
    AND NOT EXISTS (SELECT 1 FROM public.estoque_lotes el WHERE el.produto_oficial_id = po.id);

  GET DIAGNOSTICS v_excluidos = ROW_COUNT;

  SELECT count(*)::int INTO v_restantes
  FROM public.produtos_oficiais
  WHERE lote_id = p_lote_id;

  IF v_restantes > 0 THEN
    UPDATE public.lotes_importacao
    SET ativo = false, updated_at = now()
    WHERE id = p_lote_id;
  ELSE
    DELETE FROM public.lotes_importacao
    WHERE id = p_lote_id;
  END IF;

  RETURN jsonb_build_object(
    'produtos_inativados', v_inativados,
    'produtos_excluidos', v_excluidos,
    'lista_inativada', v_restantes > 0,
    'lista_excluida', v_restantes = 0
  );
END;
$function$;

COMMENT ON FUNCTION public.excluir_lista_importacao(uuid) IS
  'Exclui a lista: inativa produtos em uso e remove os demais. Notifica consultores como exclusão.';

REVOKE EXECUTE ON FUNCTION public.excluir_lista_importacao(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.excluir_lista_importacao(uuid) TO authenticated;
