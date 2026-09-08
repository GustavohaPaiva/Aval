-- Desacopla a fila WhatsApp da transação de public.notifications.
-- NÃO aplicar até autorização. Somente Syagri-Test (uszbvqmquniuorxkqyat).
-- Não altera produção. Não remove tabelas, RPCs de negócio, telefone nem opt-in.
--
-- Rollback documentado em:
--   docs/rollbacks/restore_notifications_enqueue_whatsapp.sql

DROP TRIGGER IF EXISTS notifications_enqueue_whatsapp ON public.notifications;
