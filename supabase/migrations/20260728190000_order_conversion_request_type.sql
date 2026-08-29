-- Consultor solicita conversão; gestor executa

ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'order_conversion_request';
