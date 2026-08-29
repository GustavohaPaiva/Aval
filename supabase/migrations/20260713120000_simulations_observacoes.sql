-- Observações livres na simulação comercial
ALTER TABLE public.simulations
  ADD COLUMN IF NOT EXISTS observacoes text;

COMMENT ON COLUMN public.simulations.observacoes IS 'Observações da proposta/simulação (texto livre).';
