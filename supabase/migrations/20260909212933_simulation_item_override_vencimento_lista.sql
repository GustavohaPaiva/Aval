-- Vencimento da lista do fornecedor editável nos parâmetros da linha da simulação.

ALTER TABLE public.simulation_items
  ADD COLUMN IF NOT EXISTS override_vencimento_lista date;

COMMENT ON COLUMN public.simulation_items.override_vencimento_lista IS
  'Vencimento da lista do fornecedor ajustado nesta simulação; NULL = usa o catálogo.';

NOTIFY pgrst, 'reload schema';
