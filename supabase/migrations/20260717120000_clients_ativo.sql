-- clients.ativo: permite inativar cliente sem apagar histórico
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS ativo boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS clients_ativo_idx
  ON public.clients (ativo)
  WHERE ativo = true;

COMMENT ON COLUMN public.clients.ativo IS
  'Cliente ativo pode receber lançamentos e aparece no select do simulador.';

NOTIFY pgrst, 'reload schema';
