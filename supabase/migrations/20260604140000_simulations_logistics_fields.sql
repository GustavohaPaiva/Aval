-- Campos de logística/comercial da simulação (frete, pagamento, quarter)
ALTER TABLE public.simulations
  ADD COLUMN IF NOT EXISTS tipo_frete text,
  ADD COLUMN IF NOT EXISTS origem_frete text,
  ADD COLUMN IF NOT EXISTS destino_frete text,
  ADD COLUMN IF NOT EXISTS data_pagamento date,
  ADD COLUMN IF NOT EXISTS quarter text;

COMMENT ON COLUMN public.simulations.tipo_frete IS 'CIF ou FOB — define se exige endereço de entrega no pedido.';
