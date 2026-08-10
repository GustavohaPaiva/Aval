-- Prazo de entrega por semana de calendário (domingo → sábado).
-- Valor persistido: data do domingo (início da semana).

ALTER TABLE public.simulations
  ADD COLUMN IF NOT EXISTS prazo_semana_inicio date;

COMMENT ON COLUMN public.simulations.prazo_semana_inicio IS
  'Domingo (início) da semana de calendário selecionada como prazo de entrega';
