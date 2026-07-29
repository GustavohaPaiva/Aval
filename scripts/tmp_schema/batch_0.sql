-- >>> FILE: 20260512120000_syagri_initial_schema.sql
-- =============================================================================
-- Syagri — schema inicial (PostgreSQL / Supabase)
-- Inclui tabelas, enums, índices, trigger de perfil, RLS e políticas.
-- Execute via Supabase SQL Editor ou: supabase db push / migration up
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Extensões (uuid já disponível em projetos Supabase padrão)
-- -----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- -----------------------------------------------------------------------------
-- Tipos enumerados
-- -----------------------------------------------------------------------------
CREATE TYPE public.user_role AS ENUM ('gestor', 'consultor');

-- Status da simulação e das linhas (mesmo conjunto de valores)
CREATE TYPE public.simulation_status AS ENUM (
  'draft',
  'pending',
  'approved',
  'rejected'
);

-- -----------------------------------------------------------------------------
-- Função genérica: updated_at
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- -----------------------------------------------------------------------------
-- 1. profiles — espelha auth.users; papel e nome para RLS e UI
-- -----------------------------------------------------------------------------
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  role public.user_role NOT NULL DEFAULT 'consultor',
  nome text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT profiles_nome_not_empty CHECK (length(trim(nome)) > 0)
);

CREATE INDEX profiles_role_idx ON public.profiles (role);

CREATE TRIGGER profiles_set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.profiles IS 'Perfis de aplicação vinculados a auth.users; role usado nas políticas RLS.';

-- -----------------------------------------------------------------------------
-- 2. clients — cadastro de clientes (campos principais + extras comuns)
-- -----------------------------------------------------------------------------
CREATE TABLE public.clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  razao_social text,
  cnpj_cpf text NOT NULL,
  email text,
  telefone text,
  endereco text,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT clients_nome_not_empty CHECK (length(trim(nome)) > 0),
  CONSTRAINT clients_cnpj_cpf_not_empty CHECK (length(trim(cnpj_cpf)) > 0)
);

CREATE UNIQUE INDEX clients_cnpj_cpf_unique_idx
  ON public.clients (lower(trim(cnpj_cpf)));

CREATE INDEX clients_nome_idx ON public.clients USING gin (to_tsvector('simple', nome));

CREATE TRIGGER clients_set_updated_at
  BEFORE UPDATE ON public.clients
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.clients IS 'Clientes atendidos; CPF/CNPJ único por registro (normalizado em índice).';

-- -----------------------------------------------------------------------------
-- 3. products — catálogo
-- -----------------------------------------------------------------------------
CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  cultura text NOT NULL,
  preco_base numeric(14, 2) NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT products_nome_not_empty CHECK (length(trim(nome)) > 0),
  CONSTRAINT products_cultura_not_empty CHECK (length(trim(cultura)) > 0),
  CONSTRAINT products_preco_base_positive CHECK (preco_base >= 0)
);

CREATE INDEX products_cultura_idx ON public.products (cultura);
CREATE INDEX products_ativo_idx ON public.products (ativo) WHERE ativo;

CREATE TRIGGER products_set_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.products IS 'Produtos por cultura; preco_base em moeda local.';

-- -----------------------------------------------------------------------------
-- 4. simulations — proposta por consultor e cliente
-- -----------------------------------------------------------------------------
CREATE TABLE public.simulations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients (id) ON DELETE RESTRICT,
  total_bruto numeric(14, 2) NOT NULL DEFAULT 0,
  total_proposta numeric(14, 2) NOT NULL DEFAULT 0,
  status public.simulation_status NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT simulations_totals_non_negative CHECK (
    total_bruto >= 0
    AND total_proposta >= 0
  )
);

CREATE INDEX simulations_user_id_idx ON public.simulations (user_id);
CREATE INDEX simulations_client_id_idx ON public.simulations (client_id);
CREATE INDEX simulations_status_idx ON public.simulations (status);

CREATE TRIGGER simulations_set_updated_at
  BEFORE UPDATE ON public.simulations
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.simulations IS 'Simulações comerciais; user_id = consultor dono da proposta.';

-- -----------------------------------------------------------------------------
-- 5. simulation_items — linhas da simulação
-- -----------------------------------------------------------------------------
CREATE TABLE public.simulation_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  simulation_id uuid NOT NULL REFERENCES public.simulations (id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products (id) ON DELETE RESTRICT,
  volume numeric(14, 4) NOT NULL,
  preco_unitario numeric(14, 2) NOT NULL,
  proposta numeric(14, 2) NOT NULL,
  status_linha public.simulation_status NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT simulation_items_volume_positive CHECK (volume > 0),
  CONSTRAINT simulation_items_precos_non_negative CHECK (
    preco_unitario >= 0
    AND proposta >= 0
  )
);

CREATE INDEX simulation_items_simulation_id_idx ON public.simulation_items (simulation_id);
CREATE INDEX simulation_items_product_id_idx ON public.simulation_items (product_id);

CREATE TRIGGER simulation_items_set_updated_at
  BEFORE UPDATE ON public.simulation_items
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.simulation_items IS 'Itens de uma simulação; proposta = preço negociado por unidade/volume conforme regra de negócio da aplicação.';

-- -----------------------------------------------------------------------------
-- Novo usuário em auth.users → linha em profiles (papel padrão consultor)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, role, nome)
  VALUES (
    NEW.id,
    'consultor',
    coalesce(NEW.raw_user_meta_data->>'nome', split_part(NEW.email, '@', 1), 'Usuário')
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

COMMENT ON FUNCTION public.handle_new_user() IS 'Cria profile default; promova gestores via SQL ou painel seguro (não use user_metadata para autorização).';

-- -----------------------------------------------------------------------------
-- Função auxiliar: gestor? (SECURITY DEFINER — evita recursão de RLS em policies)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_gestor()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'gestor'::public.user_role
  );
$$;

REVOKE ALL ON FUNCTION public.is_gestor() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_gestor() TO authenticated;

COMMENT ON FUNCTION public.is_gestor() IS 'Retorna true se auth.uid() for gestor em profiles; usada nas políticas RLS.';

-- -----------------------------------------------------------------------------
-- Row Level Security — habilitar em todas as tabelas expostas
-- -----------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.simulations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.simulation_items ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- profiles
-- -----------------------------------------------------------------------------
CREATE POLICY "profiles_select_own_or_gestor"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (id = auth.uid() OR public.is_gestor());

CREATE POLICY "profiles_insert_own"
  ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid());

CREATE POLICY "profiles_update_own_or_gestor"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid() OR public.is_gestor())
  WITH CHECK (id = auth.uid() OR public.is_gestor());

-- -----------------------------------------------------------------------------
-- clients — leitura ampla; escrita apenas gestor (catálogo compartilhado)
-- -----------------------------------------------------------------------------
CREATE POLICY "clients_select_authenticated"
  ON public.clients
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "clients_write_gestor"
  ON public.clients
  FOR ALL
  TO authenticated
  USING (public.is_gestor())
  WITH CHECK (public.is_gestor());

-- Nota: FOR ALL cobre INSERT/UPDATE/DELETE; SELECT já coberto pela policy acima
-- (PostgreSQL combina múltiplas políticas com OR para o mesmo comando).

-- -----------------------------------------------------------------------------
-- products — leitura para autenticados; escrita apenas gestor
-- -----------------------------------------------------------------------------
CREATE POLICY "products_select_authenticated"
  ON public.products
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "products_write_gestor"
  ON public.products
  FOR ALL
  TO authenticated
  USING (public.is_gestor())
  WITH CHECK (public.is_gestor());

-- -----------------------------------------------------------------------------
-- simulations — regras solicitadas
-- Consultores: SELECT, INSERT, UPDATE apenas onde user_id = auth.uid()
-- Gestores: SELECT e UPDATE em todas
-- -----------------------------------------------------------------------------

CREATE POLICY "simulations_select_consultor_own"
  ON public.simulations
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'consultor'::public.user_role
    )
  );

CREATE POLICY "simulations_select_gestor_all"
  ON public.simulations
  FOR SELECT
  TO authenticated
  USING (public.is_gestor());

CREATE POLICY "simulations_insert_consultor_own"
  ON public.simulations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'consultor'::public.user_role
    )
  );

CREATE POLICY "simulations_update_consultor_own"
  ON public.simulations
  FOR UPDATE
  TO authenticated
  USING (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'consultor'::public.user_role
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'consultor'::public.user_role
    )
  );

CREATE POLICY "simulations_update_gestor_all"
  ON public.simulations
  FOR UPDATE
  TO authenticated
  USING (public.is_gestor())
  WITH CHECK (public.is_gestor());

-- -----------------------------------------------------------------------------
-- simulation_items — acesso derivado da simulação pai
-- Consultor: SELECT/INSERT/UPDATE nas linhas das próprias simulações
-- Gestor: SELECT/UPDATE em todas (alinhado às simulações)
-- -----------------------------------------------------------------------------

CREATE POLICY "simulation_items_select_consultor_via_simulation"
  ON public.simulation_items
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.simulations s
      WHERE s.id = simulation_items.simulation_id
        AND s.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'consultor'::public.user_role
    )
  );

CREATE POLICY "simulation_items_select_gestor_all"
  ON public.simulation_items
  FOR SELECT
  TO authenticated
  USING (public.is_gestor());

CREATE POLICY "simulation_items_insert_consultor_own_simulation"
  ON public.simulation_items
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.simulations s
      WHERE s.id = simulation_id
        AND s.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'consultor'::public.user_role
    )
  );

CREATE POLICY "simulation_items_update_consultor_own_simulation"
  ON public.simulation_items
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.simulations s
      WHERE s.id = simulation_items.simulation_id
        AND s.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'consultor'::public.user_role
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.simulations s
      WHERE s.id = simulation_items.simulation_id
        AND s.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'consultor'::public.user_role
    )
  );

CREATE POLICY "simulation_items_update_gestor_all"
  ON public.simulation_items
  FOR UPDATE
  TO authenticated
  USING (public.is_gestor())
  WITH CHECK (public.is_gestor());

-- -----------------------------------------------------------------------------
-- Grants (RLS continua sendo a barreira por linha)
-- -----------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO postgres, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clients TO postgres, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO postgres, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.simulations TO postgres, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.simulation_items TO postgres, service_role;

GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clients TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.simulations TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.simulation_items TO authenticated;

-- >>> FILE: 20260513120000_simulation_converted_client_address.sql
-- Status de simulação após conversão em pedido (PDF / fluxo comercial)
ALTER TYPE public.simulation_status ADD VALUE IF NOT EXISTS 'converted';

-- Localização cadastral do cliente (município/UF).
-- cep/logradouro/bairro foram removidos em 20260729160000_drop_clients_delivery_address.sql
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS municipio text,
  ADD COLUMN IF NOT EXISTS uf text;

-- Produtos seed com IDs fixos (alinhados ao catálogo do Simulador no frontend)
INSERT INTO public.products (id, nome, cultura, preco_base, ativo)
VALUES
  ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a01'::uuid, 'Soja RR', 'Soja', 118.50, true),
  ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a02'::uuid, 'Milho safrinha', 'Milho', 72.00, true),
  ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a03'::uuid, 'Algodão caroço', 'Algodão', 165.25, true)
ON CONFLICT (id) DO UPDATE SET
  nome = excluded.nome,
  cultura = excluded.cultura,
  preco_base = excluded.preco_base,
  ativo = excluded.ativo,
  updated_at = now();

-- >>> FILE: 20260513120100_clients_consultor_insert.sql
-- Consultores precisam cadastrar cliente ao persistir simulação / pedido.
CREATE POLICY "clients_insert_consultor"
  ON public.clients
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'consultor'::public.user_role
    )
  );

-- >>> FILE: 20260513120200_clients_update_linked_simulation.sql
-- Permite ao consultor atualizar dados do cliente vinculado à sua simulação (ex.: endereço no pedido).
CREATE POLICY "clients_update_if_linked_to_own_simulation"
  ON public.clients
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.simulations s
      WHERE s.client_id = clients.id
        AND s.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.simulations s
      WHERE s.client_id = clients.id
        AND s.user_id = auth.uid()
    )
  );

-- >>> FILE: 20260513130000_syagri_create_consultant_rls_metrics.sql
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

-- >>> FILE: 20260528140000_produtos_importacao_mapeamento.sql
-- =============================================================================
-- Syagri — Lançamento e Mapeamento Dinâmico de Produtos
-- Tabelas: fornecedores, templates, cotações, lotes, staging, produtos_oficiais
-- RLS: gestores leem/escrevem tudo do módulo; consultores só SELECT em produtos_oficiais
-- Trigger: nova cotação → recalcula preco_interno_calculado por moeda_origem
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Tipos enumerados
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'lote_importacao_status'
  ) THEN
    CREATE TYPE public.lote_importacao_status AS ENUM (
      'processando',
      'aguardando_validacao',
      'concluido'
    );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'produto_staging_status_linha'
  ) THEN
    CREATE TYPE public.produto_staging_status_linha AS ENUM (
      'novo',
      'atualizacao',
      'erro'
    );
  END IF;
END
$$;

-- -----------------------------------------------------------------------------
-- 1. fornecedores
-- -----------------------------------------------------------------------------
CREATE TABLE public.fornecedores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fornecedores_nome_not_empty CHECK (length(trim(nome)) > 0)
);

CREATE INDEX fornecedores_ativo_idx ON public.fornecedores (ativo) WHERE ativo;
CREATE INDEX fornecedores_nome_idx ON public.fornecedores (lower(trim(nome)));

CREATE TRIGGER fornecedores_set_updated_at
  BEFORE UPDATE ON public.fornecedores
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.fornecedores IS 'Fornecedores de produtos importados; gestão exclusiva de gestores.';

-- -----------------------------------------------------------------------------
-- 2. templates_mapeamento
-- -----------------------------------------------------------------------------
CREATE TABLE public.templates_mapeamento (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fornecedor_id uuid NOT NULL REFERENCES public.fornecedores (id) ON DELETE CASCADE,
  nome_layout text NOT NULL,
  config_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT templates_mapeamento_nome_layout_not_empty CHECK (length(trim(nome_layout)) > 0),
  CONSTRAINT templates_mapeamento_config_json_object CHECK (jsonb_typeof(config_json) = 'object')
);

CREATE INDEX templates_mapeamento_fornecedor_id_idx
  ON public.templates_mapeamento (fornecedor_id);

CREATE UNIQUE INDEX templates_mapeamento_fornecedor_layout_unique_idx
  ON public.templates_mapeamento (fornecedor_id, lower(trim(nome_layout)));

CREATE TRIGGER templates_mapeamento_set_updated_at
  BEFORE UPDATE ON public.templates_mapeamento
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.templates_mapeamento IS 'Layout de mapeamento de colunas/planilha por fornecedor (config_json).';

-- -----------------------------------------------------------------------------
-- 3. cotacoes_moeda
-- -----------------------------------------------------------------------------
CREATE TABLE public.cotacoes_moeda (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  moeda_origem text NOT NULL,
  taxa_conversao numeric(14, 6) NOT NULL,
  data_vigencia timestamptz NOT NULL DEFAULT now(),
  criado_por uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cotacoes_moeda_moeda_origem_not_empty CHECK (length(trim(moeda_origem)) > 0),
  CONSTRAINT cotacoes_moeda_taxa_positive CHECK (taxa_conversao > 0)
);

CREATE INDEX cotacoes_moeda_moeda_vigencia_idx
  ON public.cotacoes_moeda (upper(trim(moeda_origem)), data_vigencia DESC);

CREATE INDEX cotacoes_moeda_criado_por_idx ON public.cotacoes_moeda (criado_por);

COMMENT ON TABLE public.cotacoes_moeda IS 'Histórico de taxas; INSERT dispara recálculo de preco_interno_calculado em produtos_oficiais.';

-- -----------------------------------------------------------------------------
-- 4. lotes_importacao
-- -----------------------------------------------------------------------------
CREATE TABLE public.lotes_importacao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  fornecedor_id uuid NOT NULL REFERENCES public.fornecedores (id) ON DELETE RESTRICT,
  status public.lote_importacao_status NOT NULL DEFAULT 'processando'::public.lote_importacao_status,
  data_upload timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX lotes_importacao_usuario_id_idx ON public.lotes_importacao (usuario_id);
CREATE INDEX lotes_importacao_fornecedor_id_idx ON public.lotes_importacao (fornecedor_id);
CREATE INDEX lotes_importacao_status_idx ON public.lotes_importacao (status);
CREATE INDEX lotes_importacao_data_upload_idx ON public.lotes_importacao (data_upload DESC);

CREATE TRIGGER lotes_importacao_set_updated_at
  BEFORE UPDATE ON public.lotes_importacao
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.lotes_importacao IS 'Lote de upload/planilha por fornecedor; workflow de validação.';

-- -----------------------------------------------------------------------------
-- 5. produtos_staging
-- -----------------------------------------------------------------------------
CREATE TABLE public.produtos_staging (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lote_id uuid NOT NULL REFERENCES public.lotes_importacao (id) ON DELETE CASCADE,
  sku_fornecedor text NOT NULL,
  dados_brutos jsonb NOT NULL DEFAULT '{}'::jsonb,
  preco_original numeric(14, 2) NOT NULL,
  moeda text NOT NULL,
  status_linha public.produto_staging_status_linha NOT NULL DEFAULT 'novo'::public.produto_staging_status_linha,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT produtos_staging_sku_not_empty CHECK (length(trim(sku_fornecedor)) > 0),
  CONSTRAINT produtos_staging_moeda_not_empty CHECK (length(trim(moeda)) > 0),
  CONSTRAINT produtos_staging_preco_non_negative CHECK (preco_original >= 0),
  CONSTRAINT produtos_staging_dados_brutos_object CHECK (jsonb_typeof(dados_brutos) = 'object')
);

CREATE INDEX produtos_staging_lote_id_idx ON public.produtos_staging (lote_id);
CREATE INDEX produtos_staging_status_linha_idx ON public.produtos_staging (status_linha);
CREATE INDEX produtos_staging_lote_sku_idx
  ON public.produtos_staging (lote_id, lower(trim(sku_fornecedor)));

COMMENT ON TABLE public.produtos_staging IS 'Linhas brutas do lote antes de promover para produtos_oficiais.';

CREATE TRIGGER produtos_staging_set_updated_at
  BEFORE UPDATE ON public.produtos_staging
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 6. produtos_oficiais
-- -----------------------------------------------------------------------------
CREATE TABLE public.produtos_oficiais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fornecedor_id uuid NOT NULL REFERENCES public.fornecedores (id) ON DELETE RESTRICT,
  sku_fornecedor text NOT NULL,
  nome text NOT NULL,
  cultura text NOT NULL,
  quarter text NOT NULL,
  moeda_origem text NOT NULL,
  preco_original numeric(14, 2) NOT NULL,
  preco_interno_calculado numeric(14, 2) NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT produtos_oficiais_sku_not_empty CHECK (length(trim(sku_fornecedor)) > 0),
  CONSTRAINT produtos_oficiais_nome_not_empty CHECK (length(trim(nome)) > 0),
  CONSTRAINT produtos_oficiais_cultura_not_empty CHECK (length(trim(cultura)) > 0),
  CONSTRAINT produtos_oficiais_quarter_not_empty CHECK (length(trim(quarter)) > 0),
  CONSTRAINT produtos_oficiais_moeda_not_empty CHECK (length(trim(moeda_origem)) > 0),
  CONSTRAINT produtos_oficiais_preco_original_non_negative CHECK (preco_original >= 0),
  CONSTRAINT produtos_oficiais_preco_interno_non_negative CHECK (preco_interno_calculado >= 0)
);

CREATE UNIQUE INDEX produtos_oficiais_fornecedor_sku_unique_idx
  ON public.produtos_oficiais (fornecedor_id, lower(trim(sku_fornecedor)));

CREATE INDEX produtos_oficiais_moeda_origem_idx
  ON public.produtos_oficiais (upper(trim(moeda_origem)));

CREATE INDEX produtos_oficiais_fornecedor_id_idx ON public.produtos_oficiais (fornecedor_id);
CREATE INDEX produtos_oficiais_ativo_idx ON public.produtos_oficiais (ativo) WHERE ativo;
CREATE INDEX produtos_oficiais_cultura_quarter_idx
  ON public.produtos_oficiais (cultura, quarter);

CREATE TRIGGER produtos_oficiais_set_updated_at
  BEFORE UPDATE ON public.produtos_oficiais
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.produtos_oficiais IS 'Catálogo oficial pós-validação; consultores leem; preço interno atualizado por cotação.';

-- -----------------------------------------------------------------------------
-- Função auxiliar: consultor autenticado?
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_consultor()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'consultor'::public.user_role
  );
$$;

REVOKE ALL ON FUNCTION public.is_consultor() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_consultor() TO authenticated;

COMMENT ON FUNCTION public.is_consultor() IS 'True se auth.uid() for consultor; usada em RLS de produtos_oficiais.';

-- -----------------------------------------------------------------------------
-- Trigger: nova cotação → recalcular preco_interno_calculado
-- (executa na mesma transação do INSERT; SECURITY DEFINER ignora RLS no UPDATE em massa)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_cotacoes_moeda_atualizar_precos_internos()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.produtos_oficiais po
  SET
    preco_interno_calculado = round((po.preco_original * NEW.taxa_conversao)::numeric, 2),
    updated_at = now()
  WHERE upper(trim(po.moeda_origem)) = upper(trim(NEW.moeda_origem));

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.trg_cotacoes_moeda_atualizar_precos_internos() IS
  'Após INSERT em cotacoes_moeda, atualiza preco_interno_calculado = preco_original * taxa_conversao para a moeda.';

CREATE TRIGGER cotacoes_moeda_after_insert_refresh_precos
  AFTER INSERT ON public.cotacoes_moeda
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_cotacoes_moeda_atualizar_precos_internos();

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------
ALTER TABLE public.fornecedores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.templates_mapeamento ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cotacoes_moeda ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lotes_importacao ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.produtos_staging ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.produtos_oficiais ENABLE ROW LEVEL SECURITY;

-- fornecedores — somente gestor
CREATE POLICY "fornecedores_gestor_all"
  ON public.fornecedores
  FOR ALL
  TO authenticated
  USING (public.is_gestor())
  WITH CHECK (public.is_gestor());

-- templates_mapeamento — somente gestor
CREATE POLICY "templates_mapeamento_gestor_all"
  ON public.templates_mapeamento
  FOR ALL
  TO authenticated
  USING (public.is_gestor())
  WITH CHECK (public.is_gestor());

-- cotacoes_moeda — somente gestor (histórico imutável na prática: sem UPDATE/DELETE explícitos além de ALL)
CREATE POLICY "cotacoes_moeda_gestor_select"
  ON public.cotacoes_moeda
  FOR SELECT
  TO authenticated
  USING (public.is_gestor());

CREATE POLICY "cotacoes_moeda_gestor_insert"
  ON public.cotacoes_moeda
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_gestor()
    AND criado_por = auth.uid()
  );

CREATE POLICY "cotacoes_moeda_gestor_update"
  ON public.cotacoes_moeda
  FOR UPDATE
  TO authenticated
  USING (public.is_gestor())
  WITH CHECK (public.is_gestor());

CREATE POLICY "cotacoes_moeda_gestor_delete"
  ON public.cotacoes_moeda
  FOR DELETE
  TO authenticated
  USING (public.is_gestor());

-- lotes_importacao — somente gestor
CREATE POLICY "lotes_importacao_gestor_all"
  ON public.lotes_importacao
  FOR ALL
  TO authenticated
  USING (public.is_gestor())
  WITH CHECK (public.is_gestor());

-- produtos_staging — somente gestor
CREATE POLICY "produtos_staging_gestor_all"
  ON public.produtos_staging
  FOR ALL
  TO authenticated
  USING (public.is_gestor())
  WITH CHECK (public.is_gestor());

-- produtos_oficiais — gestor tudo; consultor só leitura
CREATE POLICY "produtos_oficiais_gestor_all"
  ON public.produtos_oficiais
  FOR ALL
  TO authenticated
  USING (public.is_gestor())
  WITH CHECK (public.is_gestor());

CREATE POLICY "produtos_oficiais_consultor_select"
  ON public.produtos_oficiais
  FOR SELECT
  TO authenticated
  USING (public.is_consultor());

-- -----------------------------------------------------------------------------
-- Grants (authenticated + service_role)
-- -----------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fornecedores TO postgres, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.templates_mapeamento TO postgres, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cotacoes_moeda TO postgres, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lotes_importacao TO postgres, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.produtos_staging TO postgres, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.produtos_oficiais TO postgres, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fornecedores TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.templates_mapeamento TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cotacoes_moeda TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lotes_importacao TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.produtos_staging TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.produtos_oficiais TO authenticated;

