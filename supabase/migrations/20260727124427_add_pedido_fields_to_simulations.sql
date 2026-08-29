-- Campos da tela de pedido em simulations (faltava no Git; já aplicado em prod)

ALTER TABLE public.simulations
  ADD COLUMN IF NOT EXISTS fazenda text,
  ADD COLUMN IF NOT EXISTS pedido_municipio text,
  ADD COLUMN IF NOT EXISTS pedido_uf text,
  ADD COLUMN IF NOT EXISTS prazo_dias integer NOT NULL DEFAULT 14;

ALTER TABLE public.simulations
  DROP CONSTRAINT IF EXISTS simulations_prazo_dias_check;

ALTER TABLE public.simulations
  ADD CONSTRAINT simulations_prazo_dias_check
  CHECK (prazo_dias IN (7, 14, 21));

ALTER TABLE public.simulations
  DROP CONSTRAINT IF EXISTS simulations_pedido_uf_check;

ALTER TABLE public.simulations
  ADD CONSTRAINT simulations_pedido_uf_check
  CHECK (pedido_uf IS NULL OR pedido_uf IN ('MG', 'SP'));

COMMENT ON COLUMN public.simulations.fazenda IS 'Nome da fazenda informado na tela de pedido';
COMMENT ON COLUMN public.simulations.pedido_municipio IS 'Município do pedido (catálogo IBGE)';
COMMENT ON COLUMN public.simulations.pedido_uf IS 'UF do pedido (MG ou SP)';
COMMENT ON COLUMN public.simulations.prazo_dias IS 'Prazo de validade da proposta em dias (7, 14 ou 21)';

