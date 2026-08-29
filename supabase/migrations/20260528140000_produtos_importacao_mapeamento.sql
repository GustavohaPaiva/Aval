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
