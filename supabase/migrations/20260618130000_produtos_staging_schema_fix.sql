-- =============================================================================
-- Syagri — Garantir colunas de staging + recarregar cache do PostgREST
-- (corrige 400 quando migration anterior falhou parcialmente ou cache stale)
-- =============================================================================

ALTER TABLE public.produtos_staging
  ADD COLUMN IF NOT EXISTS nome text,
  ADD COLUMN IF NOT EXISTS cultura text,
  ADD COLUMN IF NOT EXISTS quarter text,
  ADD COLUMN IF NOT EXISTS descricao text;

ALTER TABLE public.produtos_oficiais
  ADD COLUMN IF NOT EXISTS descricao text;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'produtos_staging'
      AND column_name = 'cultura'
  ) THEN
    ALTER TABLE public.produtos_staging
      ALTER COLUMN cultura DROP NOT NULL;
  END IF;
END
$$;

ALTER TABLE public.lotes_importacao
  ADD COLUMN IF NOT EXISTS moeda_detectada text,
  ADD COLUMN IF NOT EXISTS data_validade date,
  ADD COLUMN IF NOT EXISTS quarter_calculado text;

ALTER TABLE public.lotes_importacao
  ADD COLUMN IF NOT EXISTS metadata_planilha jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Recarrega o schema cache do PostgREST (necessário após ALTER TABLE manual)
NOTIFY pgrst, 'reload schema';
