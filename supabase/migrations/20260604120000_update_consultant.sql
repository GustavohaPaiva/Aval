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
