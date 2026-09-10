-- Trava o preço proposto na solicitação de revisão.
-- Alteração de dólar/catálogo não altera a proposta; só edições manuais na simulação.
-- Simulações já enviadas (status ≠ draft) continuam travadas no app via status,
-- mesmo sem timestamp.

ALTER TABLE public.simulations
  ADD COLUMN IF NOT EXISTS proposta_travada_em timestamptz;

COMMENT ON COLUMN public.simulations.proposta_travada_em IS
  'Momento em que o preço proposto foi travado (solicitação de revisão). Câmbio/catálogo não alteram a proposta; só edições manuais na simulação.';
