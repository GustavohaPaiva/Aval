-- =============================================================================
-- Logística: helpers, RLS (somente leitura de pedidos assinados) e RPC de cadastro
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_logistica()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = (SELECT auth.uid())
      AND p.role = 'logistica'::public.user_role
  );
$$;

REVOKE ALL ON FUNCTION public.is_logistica() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_logistica() TO authenticated;

COMMENT ON FUNCTION public.is_logistica() IS
  'Retorna true se auth.uid() for logística em profiles; usada nas políticas RLS.';

CREATE OR REPLACE FUNCTION public.simulation_has_signed_pedido(p_simulation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.pedido_assinaturas pa
    WHERE pa.simulation_id = p_simulation_id
      AND pa.status = 'signed'
  );
$$;

REVOKE ALL ON FUNCTION public.simulation_has_signed_pedido(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.simulation_has_signed_pedido(uuid) TO authenticated;

COMMENT ON FUNCTION public.simulation_has_signed_pedido(uuid) IS
  'True se a simulação possui ao menos uma assinatura com status signed.';

-- -----------------------------------------------------------------------------
-- simulations / simulation_items — SELECT para logística (pedidos assinados)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "simulations_select_logistica_signed" ON public.simulations;
CREATE POLICY "simulations_select_logistica_signed"
  ON public.simulations
  FOR SELECT
  TO authenticated
  USING (
    public.is_logistica()
    AND public.simulation_has_signed_pedido(id)
  );

DROP POLICY IF EXISTS "simulation_items_select_logistica_signed" ON public.simulation_items;
CREATE POLICY "simulation_items_select_logistica_signed"
  ON public.simulation_items
  FOR SELECT
  TO authenticated
  USING (
    public.is_logistica()
    AND public.simulation_has_signed_pedido(simulation_id)
  );

-- -----------------------------------------------------------------------------
-- pedido_assinaturas — SELECT só linhas signed
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "pedido_assinaturas_select_logistica_signed" ON public.pedido_assinaturas;
CREATE POLICY "pedido_assinaturas_select_logistica_signed"
  ON public.pedido_assinaturas
  FOR SELECT
  TO authenticated
  USING (
    public.is_logistica()
    AND status = 'signed'
  );

-- -----------------------------------------------------------------------------
-- Storage pedido-documentos — só PDF assinado
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "pedido_docs_logistica_signed_select" ON storage.objects;
CREATE POLICY "pedido_docs_logistica_signed_select"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'pedido-documentos'
    AND public.is_logistica()
    AND EXISTS (
      SELECT 1
      FROM public.pedido_assinaturas pa
      WHERE pa.status = 'signed'
        AND pa.pdf_signed_path IS NOT NULL
        AND pa.pdf_signed_path = name
    )
  );

-- -----------------------------------------------------------------------------
-- clients — logística só vê clientes de pedidos assinados
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "clients_select_authenticated" ON public.clients;

CREATE POLICY "clients_select_non_logistica"
  ON public.clients
  FOR SELECT
  TO authenticated
  USING (NOT public.is_logistica());

CREATE POLICY "clients_select_logistica_signed"
  ON public.clients
  FOR SELECT
  TO authenticated
  USING (
    public.is_logistica()
    AND EXISTS (
      SELECT 1
      FROM public.simulations s
      WHERE s.client_id = clients.id
        AND public.simulation_has_signed_pedido(s.id)
    )
  );

-- -----------------------------------------------------------------------------
-- create_logistica_user — gestor cria usuário e promove role para logistica
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_logistica_user(
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
    RAISE EXCEPTION 'Apenas gestores podem criar usuários de logística';
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

  -- Trigger handle_new_user cria profile como consultor; promove para logística.
  UPDATE public.profiles
  SET role = 'logistica'::public.user_role
  WHERE id = v_new_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Perfil não criado para o usuário de logística';
  END IF;

  RETURN v_new_id;
END;
$$;

COMMENT ON FUNCTION public.create_logistica_user(text, text, text) IS
  'Gestor cria usuário e-mail/senha; perfil promovido para role logistica.';

REVOKE ALL ON FUNCTION public.create_logistica_user(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_logistica_user(text, text, text) TO authenticated;
