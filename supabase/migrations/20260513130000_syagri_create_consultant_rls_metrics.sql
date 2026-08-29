-- =============================================================================
-- Syagri — consultor via gestor (auth + profiles), RLS profiles (SELECT), métricas
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Garantir enum + colunas em profiles (idempotente para bases legadas)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'user_role'
  ) THEN
    CREATE TYPE public.user_role AS ENUM ('gestor', 'consultor');
  END IF;
END $$;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role public.user_role NOT NULL DEFAULT 'consultor'::public.user_role;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS nome text;

-- -----------------------------------------------------------------------------
-- 2) create_consultant — SECURITY DEFINER: insere auth.users + identities;
--    o trigger on_auth_user_created cria o profile (consultor + nome via meta).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_consultant(
  p_email text,
  p_password text,
  p_nome text
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

  RETURN v_new_id;
END;
$$;

COMMENT ON FUNCTION public.create_consultant(text, text, text) IS
  'Gestor cria usuário e-mail/senha em auth + identity; perfil consultor criado pelo trigger handle_new_user (nome em raw_user_meta_data).';

REVOKE ALL ON FUNCTION public.create_consultant(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_consultant(text, text, text) TO authenticated;

-- -----------------------------------------------------------------------------
-- 3) RLS em profiles — SELECT: próprio perfil; gestores leem todos
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "profiles_select_own_or_gestor" ON public.profiles;

CREATE POLICY "profiles_select_own"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (id = auth.uid());

CREATE POLICY "profiles_select_gestor_all"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (public.is_gestor());

-- -----------------------------------------------------------------------------
-- 4) Métricas por consultor (security_invoker = RLS em simulations + profiles)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.consultor_metricas
WITH (security_invoker = true) AS
SELECT
  p.id AS consultor_id,
  p.nome AS consultor_nome,
  count(s.id)::bigint AS total_simulacoes,
  count(s.id) FILTER (
    WHERE s.status = 'converted'::public.simulation_status
  )::bigint AS total_vendas
FROM public.profiles p
LEFT JOIN public.simulations s ON s.user_id = p.id
WHERE p.role = 'consultor'::public.user_role
GROUP BY p.id, p.nome;

COMMENT ON VIEW public.consultor_metricas IS
  'Métricas por consultor; consultor vê só a própria linha (RLS em profiles); gestor vê todos.';

GRANT SELECT ON public.consultor_metricas TO authenticated;
