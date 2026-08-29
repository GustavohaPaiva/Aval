-- Congela valores comerciais no convert + auditoria de alteração do gestor.
-- Também garante colunas de override financeiro usadas pelo app.

ALTER TABLE public.simulations
  ADD COLUMN IF NOT EXISTS valores_congelados_em timestamptz,
  ADD COLUMN IF NOT EXISTS gestor_alteracao_em timestamptz,
  ADD COLUMN IF NOT EXISTS gestor_alteracao_por uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS gestor_alteracao_resumo text;

COMMENT ON COLUMN public.simulations.valores_congelados_em IS
  'Momento em que os valores comerciais foram congelados (conversão em pedido).';
COMMENT ON COLUMN public.simulations.gestor_alteracao_em IS
  'Última alteração relevante feita pelo gestor (overrides/revisão ou dados do pedido).';
COMMENT ON COLUMN public.simulations.gestor_alteracao_por IS
  'Gestor responsável pela última alteração registrada.';
COMMENT ON COLUMN public.simulations.gestor_alteracao_resumo IS
  'Resumo textual da última alteração do gestor (exibido ao consultor).';

ALTER TABLE public.simulation_items
  ADD COLUMN IF NOT EXISTS financeiro_unitario numeric(14, 2),
  ADD COLUMN IF NOT EXISTS override_taxa_antecipacao numeric(14, 6),
  ADD COLUMN IF NOT EXISTS override_taxa_juros numeric(14, 6);

COMMENT ON COLUMN public.simulation_items.financeiro_unitario IS
  'Custo financeiro unitário no momento do save/congelamento; usado na visualização pós-pedido.';
COMMENT ON COLUMN public.simulation_items.override_taxa_antecipacao IS
  'Taxa de antecipação ajustada pelo gestor nesta simulação; NULL = usa o catálogo.';
COMMENT ON COLUMN public.simulation_items.override_taxa_juros IS
  'Taxa de juros ajustada pelo gestor nesta simulação; NULL = usa o catálogo.';

ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'simulation_gestor_updated';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'pedido_fields_updated';

NOTIFY pgrst, 'reload schema';
