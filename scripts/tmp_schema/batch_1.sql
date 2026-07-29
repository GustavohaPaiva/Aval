-- >>> FILE: 20260601150000_avatars_storage_bucket.sql
-- =============================================================================
-- Syagri — Bucket de avatares (foto de perfil)
-- Bucket público para leitura; cada usuário escreve apenas na própria pasta
-- (storage path no formato `<auth.uid()>/arquivo.ext`).
-- =============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Leitura pública dos avatares.
DROP POLICY IF EXISTS "avatars_public_read" ON storage.objects;
CREATE POLICY "avatars_public_read"
  ON storage.objects
  FOR SELECT
  TO public
  USING (bucket_id = 'avatars');

-- Usuário autenticado só pode inserir na própria pasta.
DROP POLICY IF EXISTS "avatars_owner_insert" ON storage.objects;
CREATE POLICY "avatars_owner_insert"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Usuário autenticado só pode atualizar arquivos da própria pasta.
DROP POLICY IF EXISTS "avatars_owner_update" ON storage.objects;
CREATE POLICY "avatars_owner_update"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Usuário autenticado só pode remover arquivos da própria pasta.
DROP POLICY IF EXISTS "avatars_owner_delete" ON storage.objects;
CREATE POLICY "avatars_owner_delete"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- >>> FILE: 20260604120000_update_consultant.sql
-- =============================================================================
-- Syagri — gestor: consultar e atualizar consultores (nome, e-mail, senha)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_consultant_email(p_consultor_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = extensions, auth, public, pg_temp
AS $$
DECLARE
  v_email text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  IF NOT public.is_gestor() THEN
    RAISE EXCEPTION 'Apenas gestores podem consultar credenciais de consultores';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = p_consultor_id
      AND p.role = 'consultor'::public.user_role
  ) THEN
    RAISE EXCEPTION 'Consultor não encontrado';
  END IF;

  SELECT lower(u.email)
  INTO v_email
  FROM auth.users u
  WHERE u.id = p_consultor_id;

  RETURN v_email;
END;
$$;

COMMENT ON FUNCTION public.get_consultant_email(uuid) IS
  'Gestor obtém e-mail de login do consultor (auth.users).';

REVOKE ALL ON FUNCTION public.get_consultant_email(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_consultant_email(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_consultant(
  p_consultor_id uuid,
  p_nome text DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_password text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = extensions, auth, public, pg_temp
AS $$
DECLARE
  v_nome text;
  v_email text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  IF NOT public.is_gestor() THEN
    RAISE EXCEPTION 'Apenas gestores podem atualizar consultores';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = p_consultor_id
      AND p.role = 'consultor'::public.user_role
  ) THEN
    RAISE EXCEPTION 'Consultor não encontrado';
  END IF;

  v_nome := NULLIF(trim(p_nome), '');
  IF v_nome IS NOT NULL AND length(v_nome) = 0 THEN
    RAISE EXCEPTION 'Nome é obrigatório';
  END IF;

  v_email := lower(trim(p_email));
  IF v_email IS NOT NULL AND v_email = '' THEN
    v_email := NULL;
  END IF;

  IF v_email IS NOT NULL AND v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'E-mail inválido';
  END IF;

  IF p_password IS NOT NULL AND length(p_password) > 0 AND length(p_password) < 8 THEN
    RAISE EXCEPTION 'Senha deve ter pelo menos 8 caracteres';
  END IF;

  IF v_email IS NOT NULL AND EXISTS (
    SELECT 1
    FROM auth.users u
    WHERE lower(u.email) = v_email
      AND u.id <> p_consultor_id
  ) THEN
    RAISE EXCEPTION 'E-mail já cadastrado';
  END IF;

  IF v_nome IS NOT NULL THEN
    UPDATE public.profiles
    SET nome = v_nome
    WHERE id = p_consultor_id;
  END IF;

  IF v_email IS NOT NULL OR (p_password IS NOT NULL AND length(p_password) >= 8) THEN
    UPDATE auth.users
    SET
      email = COALESCE(v_email, email),
      encrypted_password = CASE
        WHEN p_password IS NOT NULL AND length(p_password) >= 8
          THEN crypt(p_password, gen_salt('bf'))
        ELSE encrypted_password
      END,
      raw_user_meta_data = CASE
        WHEN v_nome IS NOT NULL
          THEN COALESCE(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('nome', v_nome)
        ELSE raw_user_meta_data
      END,
      updated_at = now()
    WHERE id = p_consultor_id;

    IF v_email IS NOT NULL THEN
      UPDATE auth.identities
      SET
        identity_data = jsonb_set(
          COALESCE(identity_data, '{}'::jsonb),
          '{email}',
          to_jsonb(v_email)
        ),
        updated_at = now()
      WHERE user_id = p_consultor_id
        AND provider = 'email';
    END IF;
  ELSIF v_nome IS NOT NULL THEN
    UPDATE auth.users
    SET
      raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('nome', v_nome),
      updated_at = now()
    WHERE id = p_consultor_id;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.update_consultant(uuid, text, text, text) IS
  'Gestor atualiza nome (profiles), e-mail e/ou senha (auth) de um consultor.';

REVOKE ALL ON FUNCTION public.update_consultant(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_consultant(uuid, text, text, text) TO authenticated;

-- >>> FILE: 20260604140000_simulations_logistics_fields.sql
-- Campos de logística/comercial da simulação (frete, pagamento, quarter)
ALTER TABLE public.simulations
  ADD COLUMN IF NOT EXISTS tipo_frete text,
  ADD COLUMN IF NOT EXISTS origem_frete text,
  ADD COLUMN IF NOT EXISTS destino_frete text,
  ADD COLUMN IF NOT EXISTS data_pagamento date,
  ADD COLUMN IF NOT EXISTS quarter text;

COMMENT ON COLUMN public.simulations.tipo_frete IS 'CIF ou FOB — define se exige endereço de entrega no pedido.';

-- >>> FILE: 20260604150000_notifications.sql
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

-- >>> FILE: 20260604160000_fretes_catalog.sql
-- Catálogo de fretes (origem → destino → valor)

CREATE TABLE public.fretes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  origem text NOT NULL,
  destino text NOT NULL,
  valor numeric(14, 2) NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fretes_origem_not_empty CHECK (length(trim(origem)) > 0),
  CONSTRAINT fretes_destino_not_empty CHECK (length(trim(destino)) > 0),
  CONSTRAINT fretes_valor_non_negative CHECK (valor >= 0),
  CONSTRAINT fretes_origem_destino_unique UNIQUE (origem, destino)
);

CREATE INDEX fretes_origem_idx ON public.fretes (origem);
CREATE INDEX fretes_destino_idx ON public.fretes (destino);
CREATE INDEX fretes_ativo_idx ON public.fretes (ativo) WHERE ativo = true;

CREATE TRIGGER fretes_set_updated_at
  BEFORE UPDATE ON public.fretes
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.fretes IS 'Tabela de fretes por rota (origem, destino, valor em R$).';
COMMENT ON COLUMN public.fretes.origem IS 'Ponto de origem do frete (ex.: UBERABA, CUBATAO, RIO GRANDE, FOB).';
COMMENT ON COLUMN public.fretes.destino IS 'Cidade ou local de destino.';

ALTER TABLE public.fretes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fretes_select_authenticated"
  ON public.fretes
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "fretes_write_gestor"
  ON public.fretes
  FOR ALL
  TO authenticated
  USING (public.is_gestor())
  WITH CHECK (public.is_gestor());

GRANT SELECT ON public.fretes TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.fretes TO authenticated;

