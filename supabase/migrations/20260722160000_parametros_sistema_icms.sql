-- Parâmetros do sistema (singleton) + ICMS parametrizável no lançamento de produtos.
-- Dólar continua em cotacoes_moeda; PIS/COFINS e Margem são apenas armazenamento.

CREATE TABLE IF NOT EXISTS public.parametros_sistema (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  icms_percentual numeric(8, 4) NOT NULL DEFAULT 4
    CHECK (icms_percentual >= 0 AND icms_percentual < 100),
  pis_cofins_percentual numeric(8, 4) NULL
    CHECK (pis_cofins_percentual IS NULL OR (pis_cofins_percentual >= 0 AND pis_cofins_percentual < 100)),
  margem_percentual numeric(8, 4) NULL
    CHECK (margem_percentual IS NULL OR margem_percentual >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL
);

COMMENT ON TABLE public.parametros_sistema IS
  'Parâmetros globais editáveis (singleton id=1). ICMS afeta custo_icms em novos lançamentos; PIS/COFINS e margem são armazenamento futuro.';

COMMENT ON COLUMN public.parametros_sistema.icms_percentual IS
  'Percentual de ICMS aplicado sobre o custo R$ no lançamento: custo_icms = preco_interno * (1 - icms/100).';

INSERT INTO public.parametros_sistema (id, icms_percentual)
VALUES (1, 4)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.get_icms_fator()
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT (1 - (ps.icms_percentual / 100.0))::numeric
      FROM public.parametros_sistema ps
      WHERE ps.id = 1
    ),
    0.96
  );
$$;

COMMENT ON FUNCTION public.get_icms_fator() IS
  'Fator multiplicador do custo R$ para obter custo_icms (ex.: ICMS 4% → 0.96).';

REVOKE ALL ON FUNCTION public.get_icms_fator() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_icms_fator() TO authenticated, service_role;

-- custo_icms deixa de ser coluna gerada com 4% fixo e passa a ser preenchida por trigger.
-- Idempotente: só faz DROP EXPRESSION se a coluna ainda for generated stored.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'produtos_oficiais'
      AND a.attname = 'custo_icms'
      AND a.attnum > 0
      AND NOT a.attisdropped
      AND a.attgenerated = 's'
  ) THEN
    ALTER TABLE public.produtos_oficiais
      ALTER COLUMN custo_icms DROP EXPRESSION;
  END IF;
END
$$;

UPDATE public.produtos_oficiais
SET custo_icms = round((preco_interno_calculado * public.get_icms_fator())::numeric, 2)
WHERE custo_icms IS NULL
   OR custo_icms IS DISTINCT FROM round((preco_interno_calculado * public.get_icms_fator())::numeric, 2);

CREATE OR REPLACE FUNCTION public.trg_produtos_oficiais_set_custo_icms()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Só recalcula no insert/atualização de preço interno (lançamento ou dólar).
  -- Alterar ICMS em parametros_sistema NÃO atualiza produtos já lançados.
  NEW.custo_icms := round((NEW.preco_interno_calculado * public.get_icms_fator())::numeric, 2);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS produtos_oficiais_before_set_custo_icms ON public.produtos_oficiais;
CREATE TRIGGER produtos_oficiais_before_set_custo_icms
  BEFORE INSERT OR UPDATE OF preco_interno_calculado
  ON public.produtos_oficiais
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_produtos_oficiais_set_custo_icms();

COMMENT ON FUNCTION public.trg_produtos_oficiais_set_custo_icms() IS
  'Define custo_icms a partir do ICMS cadastrado em parametros_sistema no lançamento/atualização de preço interno.';

REVOKE ALL ON FUNCTION public.trg_produtos_oficiais_set_custo_icms() FROM PUBLIC, anon, authenticated;

-- RLS
ALTER TABLE public.parametros_sistema ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "parametros_sistema_select_authenticated" ON public.parametros_sistema;
CREATE POLICY "parametros_sistema_select_authenticated"
  ON public.parametros_sistema
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "parametros_sistema_update_gestor" ON public.parametros_sistema;
CREATE POLICY "parametros_sistema_update_gestor"
  ON public.parametros_sistema
  FOR UPDATE
  TO authenticated
  USING (public.is_gestor())
  WITH CHECK (public.is_gestor());

GRANT SELECT ON public.parametros_sistema TO authenticated, service_role;
GRANT UPDATE ON public.parametros_sistema TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
