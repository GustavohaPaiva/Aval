-- Overrides de custo por item da simulação (revisão do gestor).
-- Aplicam-se apenas à simulação específica; não alteram o catálogo (produtos_oficiais).
ALTER TABLE public.simulation_items
  ADD COLUMN IF NOT EXISTS override_custo_usd numeric(14, 2),
  ADD COLUMN IF NOT EXISTS override_desconto_usd numeric(14, 2),
  ADD COLUMN IF NOT EXISTS override_taxa numeric(14, 6),
  ADD COLUMN IF NOT EXISTS override_frete numeric(14, 2),
  ADD COLUMN IF NOT EXISTS override_por uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS override_em timestamptz;

COMMENT ON COLUMN public.simulation_items.override_custo_usd IS
  'Custo (USD) ajustado pelo gestor nesta simulação; NULL = usa o valor do catálogo.';
COMMENT ON COLUMN public.simulation_items.override_desconto_usd IS
  'Desconto do fornecedor (USD) ajustado pelo gestor nesta simulação; NULL = usa o catálogo.';
COMMENT ON COLUMN public.simulation_items.override_taxa IS
  'Taxa de câmbio ajustada pelo gestor nesta simulação; NULL = usa a taxa do catálogo.';
COMMENT ON COLUMN public.simulation_items.override_frete IS
  'Frete unitário ajustado pelo gestor nesta simulação; NULL = usa o frete da simulação.';
COMMENT ON COLUMN public.simulation_items.override_por IS
  'Gestor que aplicou os overrides (rastreabilidade da baixa de preço).';
COMMENT ON COLUMN public.simulation_items.override_em IS
  'Momento em que os overrides foram aplicados.';

NOTIFY pgrst, 'reload schema';
