-- Autonomia de desconto do consultor (por prazo e classe de produto)
ALTER TABLE public.parametros_sistema
  ADD COLUMN IF NOT EXISTS autonomia_dias_limiar integer NOT NULL DEFAULT 90
    CHECK (autonomia_dias_limiar > 0),
  ADD COLUMN IF NOT EXISTS autonomia_especial_longo numeric(8, 4) NOT NULL DEFAULT 3
    CHECK (autonomia_especial_longo >= 0 AND autonomia_especial_longo < 100),
  ADD COLUMN IF NOT EXISTS autonomia_convencional_longo numeric(8, 4) NOT NULL DEFAULT 4
    CHECK (autonomia_convencional_longo >= 0 AND autonomia_convencional_longo < 100),
  ADD COLUMN IF NOT EXISTS autonomia_especial_curto numeric(8, 4) NOT NULL DEFAULT 4.5
    CHECK (autonomia_especial_curto >= 0 AND autonomia_especial_curto < 100),
  ADD COLUMN IF NOT EXISTS autonomia_convencional_curto numeric(8, 4) NOT NULL DEFAULT 5.5
    CHECK (autonomia_convencional_curto >= 0 AND autonomia_convencional_curto < 100);

COMMENT ON COLUMN public.parametros_sistema.autonomia_dias_limiar IS
  'Limiar em dias (pagamento - negociacao): >= limiar usa faixas longo; < limiar usa curto.';
COMMENT ON COLUMN public.parametros_sistema.autonomia_especial_longo IS
  'Autonomia % produtos especiais quando prazo >= limiar.';
COMMENT ON COLUMN public.parametros_sistema.autonomia_convencional_longo IS
  'Autonomia % produtos convencionais quando prazo >= limiar.';
COMMENT ON COLUMN public.parametros_sistema.autonomia_especial_curto IS
  'Autonomia % produtos especiais quando prazo < limiar.';
COMMENT ON COLUMN public.parametros_sistema.autonomia_convencional_curto IS
  'Autonomia % produtos convencionais quando prazo < limiar.';
