-- Rascunhos expiram em 7 dias (inativados e ocultos).
-- Simulação/pedido aprovado pode ser inativado (fora das estatísticas)
-- ou excluído (some do sistema).

ALTER TABLE public.simulations
  ADD COLUMN IF NOT EXISTS ativo boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS inativado_em timestamptz,
  ADD COLUMN IF NOT EXISTS inativado_por uuid REFERENCES auth.users (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS simulations_ativo_idx
  ON public.simulations (ativo)
  WHERE ativo = true;

CREATE INDEX IF NOT EXISTS simulations_draft_updated_idx
  ON public.simulations (updated_at)
  WHERE status = 'draft'::public.simulation_status AND ativo = true;

COMMENT ON COLUMN public.simulations.ativo IS
  'false = fora das estatísticas. Rascunho inativo (expirado ou oculto) não aparece no sistema.';
COMMENT ON COLUMN public.simulations.inativado_em IS
  'Quando a simulação/pedido foi inativado (manual ou rascunho expirado).';
COMMENT ON COLUMN public.simulations.inativado_por IS
  'Gestor que inativou; nulo quando a inativação é automática (rascunho expirado).';
