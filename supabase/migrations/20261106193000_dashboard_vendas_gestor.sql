-- Dashboard do gestor: data de negociação, custo congelado da venda
-- e cadastros administráveis (parâmetros, metas, exceções, carga histórica).
-- Não aplica nada em produção por si só. Revisar antes de rodar.

ALTER TABLE public.simulations
  ADD COLUMN IF NOT EXISTS data_negociacao date,
  ADD COLUMN IF NOT EXISTS filial_venda text,
  ADD COLUMN IF NOT EXISTS tipo_venda text,
  ADD COLUMN IF NOT EXISTS safra text,
  ADD COLUMN IF NOT EXISTS status_lancamento text NOT NULL DEFAULT 'nao_lancado';

ALTER TABLE public.simulations
  DROP CONSTRAINT IF EXISTS simulations_tipo_venda_check;
ALTER TABLE public.simulations
  ADD CONSTRAINT simulations_tipo_venda_check CHECK (
    tipo_venda IS NULL OR tipo_venda IN ('reais', 'barter')
  );

ALTER TABLE public.simulations
  DROP CONSTRAINT IF EXISTS simulations_status_lancamento_check;
ALTER TABLE public.simulations
  ADD CONSTRAINT simulations_status_lancamento_check CHECK (
    status_lancamento IN ('lancado', 'nao_lancado')
  );

COMMENT ON COLUMN public.simulations.data_negociacao IS
  'Data da negociação da venda. Não é created_at nem data de faturamento.';
COMMENT ON COLUMN public.simulations.filial_venda IS
  'Filial da venda, gravada no pedido. profiles.filial é o cadastro do consultor.';
COMMENT ON COLUMN public.simulations.tipo_venda IS
  'reais ou barter. Vazio até o pedido informar.';
COMMENT ON COLUMN public.simulations.safra IS
  'Rótulo de safra. Não é o eixo do comparativo anual.';
COMMENT ON COLUMN public.simulations.status_lancamento IS
  'Só lancado entra no fluxo de caixa. Não decide se a venda entra na base.';

CREATE OR REPLACE FUNCTION public.trg_simulations_status_lancamento()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status_lancamento = 'lancado' AND NOT public.is_gestor() THEN
      NEW.status_lancamento := 'nao_lancado';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.status_lancamento IS DISTINCT FROM OLD.status_lancamento
     AND NOT public.is_gestor() THEN
    RAISE EXCEPTION 'Apenas o gestor altera o lançamento do pedido';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS simulations_status_lancamento ON public.simulations;
CREATE TRIGGER simulations_status_lancamento
  BEFORE INSERT OR UPDATE OF status_lancamento ON public.simulations
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_simulations_status_lancamento();

REVOKE ALL ON FUNCTION public.trg_simulations_status_lancamento() FROM PUBLIC, anon, authenticated;

ALTER TABLE public.simulation_items
  ADD COLUMN IF NOT EXISTS custo_brl_unitario numeric(14, 2),
  ADD COLUMN IF NOT EXISTS custo_icms_unitario numeric(14, 2);

COMMENT ON COLUMN public.simulation_items.custo_brl_unitario IS
  'Custo unitário em R$ com ICMS, congelado no save da linha. Não acompanha o catálogo.';
COMMENT ON COLUMN public.simulation_items.custo_icms_unitario IS
  'Custo unitário em R$ sem ICMS, congelado no save da linha. Usado no fluxo de caixa.';

-- Parâmetros de exibição e alertas. As alíquotas históricas ficam em regras por vigência.
CREATE TABLE IF NOT EXISTS public.dashboard_parametros (
  id integer PRIMARY KEY CHECK (id = 1),
  dolar_referencia numeric(14, 4) NOT NULL DEFAULT 5.05,
  dias_vista integer NOT NULL DEFAULT 90 CHECK (dias_vista > 0),
  alerta_vista_vermelho numeric(8, 3) NOT NULL DEFAULT 1.5,
  alerta_vista_saudavel numeric(8, 3) NOT NULL DEFAULT 3,
  alerta_prazo_vermelho numeric(8, 3) NOT NULL DEFAULT 5,
  alerta_prazo_saudavel numeric(8, 3) NOT NULL DEFAULT 7,
  meta_incrementos numeric[] NOT NULL DEFAULT ARRAY[0, 5, 10, 15],
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_por uuid REFERENCES auth.users (id) ON DELETE SET NULL
);

INSERT INTO public.dashboard_parametros (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE public.dashboard_parametros IS
  'Parâmetros do painel editáveis pelo gestor. O dólar daqui não substitui cotacoes_moeda.';

CREATE TABLE IF NOT EXISTS public.dashboard_regras_margem (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vigente_desde date NOT NULL UNIQUE,
  icms numeric(8, 5) NOT NULL,
  pis numeric(8, 5) NOT NULL,
  comissao_especial numeric(8, 5) NOT NULL,
  comissao_convencional numeric(8, 5) NOT NULL
);

INSERT INTO public.dashboard_regras_margem (vigente_desde, icms, pis, comissao_especial, comissao_convencional)
VALUES
  ('2024-01-01', 0.03, 0, 0.015, 0.005),
  ('2025-01-01', 0.04, 0, 0.015, 0.005),
  ('2026-04-01', 0.04, 0.01, 0.015, 0.005)
ON CONFLICT (vigente_desde) DO NOTHING;

COMMENT ON TABLE public.dashboard_regras_margem IS
  'Alíquotas pela data do pedido. Uma vigência nova não recalcula o passado.';

CREATE TABLE IF NOT EXISTS public.dashboard_metas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ano integer NOT NULL CHECK (ano BETWEEN 2000 AND 2100),
  consultor_nome text NOT NULL,
  profile_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  valor numeric(14, 2) NOT NULL CHECK (valor >= 0),
  UNIQUE (ano, consultor_nome)
);

CREATE TABLE IF NOT EXISTS public.dashboard_excecoes_cliente (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES public.clients (id) ON DELETE SET NULL,
  nome text NOT NULL,
  ativo boolean NOT NULL DEFAULT true
);

COMMENT ON TABLE public.dashboard_excecoes_cliente IS
  'Clientes família/custo. A margem deles não dispara alerta e sai da margem comercial.';

CREATE TABLE IF NOT EXISTS public.dashboard_depara (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campo text NOT NULL CHECK (campo IN (
    'cultura', 'fornecedor', 'produto', 'consultor', 'cliente', 'filial', 'saleType'
  )),
  origem text NOT NULL,
  destino text NOT NULL,
  UNIQUE (campo, origem)
);

CREATE TABLE IF NOT EXISTS public.dashboard_importacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  arquivo text NOT NULL UNIQUE,
  prioridade integer NOT NULL DEFAULT 0,
  chaves jsonb NOT NULL DEFAULT '[]'::jsonb,
  ocorrencias jsonb NOT NULL DEFAULT '[]'::jsonb,
  linhas integer NOT NULL DEFAULT 0,
  importado_em timestamptz NOT NULL DEFAULT now(),
  importado_por uuid REFERENCES auth.users (id) ON DELETE SET NULL
);

COMMENT ON TABLE public.dashboard_importacoes IS
  'Carga histórica GEFERT. Não é fonte recorrente; o painel lê estas linhas gravadas.';

CREATE TABLE IF NOT EXISTS public.dashboard_vendas_historicas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  importacao_id uuid NOT NULL REFERENCES public.dashboard_importacoes (id) ON DELETE CASCADE,
  dedup_key text NOT NULL,
  data_venda date NOT NULL,
  data_venc_cliente date,
  data_venc_fornecedor date,
  status_lancado boolean NOT NULL DEFAULT false,
  tipo_venda text,
  filial text,
  consultor text,
  cliente text,
  cultura text,
  safra text,
  fornecedor text,
  tipo_produto text,
  produto text,
  volume numeric(14, 4) NOT NULL,
  preco_fornecedor numeric(14, 4),
  custo_com_icms numeric(14, 2),
  custo_sem_icms numeric(14, 2),
  faturamento numeric(14, 2) NOT NULL,
  cidade text,
  linha integer
);

CREATE INDEX IF NOT EXISTS dashboard_vendas_historicas_data_idx
  ON public.dashboard_vendas_historicas (data_venda);

CREATE TABLE IF NOT EXISTS public.dashboard_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ano integer NOT NULL,
  capturado_em timestamptz NOT NULL DEFAULT now(),
  faturamento numeric(14, 2) NOT NULL,
  volume numeric(14, 4) NOT NULL,
  margem numeric(14, 2),
  pedidos integer NOT NULL,
  capturado_por uuid REFERENCES auth.users (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS dashboard_snapshots_ano_idx
  ON public.dashboard_snapshots (ano, capturado_em DESC);

ALTER TABLE public.dashboard_parametros ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dashboard_regras_margem ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dashboard_metas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dashboard_excecoes_cliente ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dashboard_depara ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dashboard_importacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dashboard_vendas_historicas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dashboard_snapshots ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  tabela text;
BEGIN
  FOREACH tabela IN ARRAY ARRAY[
    'dashboard_parametros',
    'dashboard_regras_margem',
    'dashboard_metas',
    'dashboard_excecoes_cliente',
    'dashboard_depara',
    'dashboard_importacoes',
    'dashboard_vendas_historicas',
    'dashboard_snapshots'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', tabela || '_gestor_all', tabela);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.is_gestor()) WITH CHECK (public.is_gestor())',
      tabela || '_gestor_all',
      tabela
    );
    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated',
      tabela
    );
  END LOOP;
END $$;
