-- =============================================================================
-- Novo papel: logística (enum apenas — usar o valor na migration seguinte)
-- =============================================================================

ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'logistica';
