-- =============================================================================
-- Syagri — filial em profiles + create/update_consultant com p_filial
-- =============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS filial text;

COMMENT ON COLUMN public.profiles.filial IS
  'Filial do consultor (texto livre; preenchimento manual).';

-- Drop old signatures before recreating with optional p_filial
DROP FUNCTION IF EXISTS public.create_consultant(text, text, text);
DROP FUNCTION IF EXISTS public.update_consultant(uuid, text, text, text);

CREATE OR REPLACE FUNCTION public.create_consultant(
  p_email text,
  p_password text,
  p_nome text,
  p_filial text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = extensions, auth, public, pg_temp
AS $$
DECLARE
  v_new_id uuid := gen_random_uuid();
  v_email text := lower(trim(p_email));
  v_nome text := trim(p_nome);
  v_filial text := NULLIF(trim(p_filial), '');
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  IF NOT public.is_gestor() THEN
    RAISE EXCEPTION 'Apenas gestores podem criar consultores';
  END IF;

  IF v_email IS NULL OR v_email = '' OR v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'E-mail inválido';
  END IF;

  IF p_password IS NULL OR length(p_password) < 8 THEN
    RAISE EXCEPTION 'Senha deve ter pelo menos 8 caracteres';
  END IF;

  IF v_nome IS NULL OR length(v_nome) = 0 THEN
    RAISE EXCEPTION 'Nome é obrigatório';
  END IF;

  IF EXISTS (SELECT 1 FROM auth.users u WHERE lower(u.email) = v_email) THEN
    RAISE EXCEPTION 'E-mail já cadastrado';
  END IF;

  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    recovery_sent_at,
    last_sign_in_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    email_change,
    email_change_token_new,
    recovery_token
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    v_new_id,
    'authenticated',
    'authenticated',
    v_email,
    crypt(p_password, gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('nome', v_nome),
    now(),
    now(),
    '',
    '',
    '',
    ''
  );

  INSERT INTO auth.identities (
    id,
    user_id,
    provider_id,
    identity_data,
    provider,
    last_sign_in_at,
    created_at,
    updated_at
  ) VALUES (
    gen_random_uuid(),
    v_new_id,
    v_new_id,
    jsonb_build_object('sub', v_new_id::text, 'email', v_email),
    'email',
    now(),
    now(),
    now()
  );

  -- Trigger cria o profile; garante filial se informada.
  IF v_filial IS NOT NULL THEN
    UPDATE public.profiles
    SET filial = v_filial
    WHERE id = v_new_id;
  END IF;

  RETURN v_new_id;
END;
$$;

COMMENT ON FUNCTION public.create_consultant(text, text, text, text) IS
  'Gestor cria usuário e-mail/senha em auth + identity; perfil consultor via trigger; filial opcional.';

REVOKE ALL ON FUNCTION public.create_consultant(text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_consultant(text, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_consultant(
  p_consultor_id uuid,
  p_nome text DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_password text DEFAULT NULL,
  p_filial text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = extensions, auth, public, pg_temp
AS $$
DECLARE
  v_nome text;
  v_email text;
  v_filial text;
  v_touch_filial boolean := (p_filial IS NOT NULL);
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

  -- Empty string clears filial; NULL (omitted) leaves unchanged.
  IF v_touch_filial THEN
    v_filial := NULLIF(trim(p_filial), '');
    UPDATE public.profiles
    SET filial = v_filial
    WHERE id = p_consultor_id;
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

COMMENT ON FUNCTION public.update_consultant(uuid, text, text, text, text) IS
  'Gestor atualiza nome/filial (profiles), e-mail e/ou senha (auth) de um consultor.';

REVOKE ALL ON FUNCTION public.update_consultant(uuid, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_consultant(uuid, text, text, text, text) TO authenticated;
