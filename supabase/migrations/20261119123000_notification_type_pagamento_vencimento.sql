-- Valor novo do enum, em arquivo separado.
-- O Postgres só permite usar o valor depois que esta migration é confirmada.

ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'pagamento_vencimento';
