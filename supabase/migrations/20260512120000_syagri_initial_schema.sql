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
