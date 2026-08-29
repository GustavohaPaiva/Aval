-- Pedido: aprovação manual pós-conversão (status + auditoria de cancelamento + notificações)

ALTER TYPE public.simulation_status ADD VALUE IF NOT EXISTS 'order_pending';
ALTER TYPE public.simulation_status ADD VALUE IF NOT EXISTS 'order_rejected';
ALTER TYPE public.simulation_status ADD VALUE IF NOT EXISTS 'cancelled';

ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'order_approval_request';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'order_approved';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'order_rejected';
