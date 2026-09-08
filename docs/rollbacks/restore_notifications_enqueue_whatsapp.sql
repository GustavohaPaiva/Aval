-- Rollback: recria o trigger que copia INSERT de public.notifications
-- para public.whatsapp_outbox. A função
-- public.enqueue_notification_for_whatsapp() permanece no banco
-- (não é removida pela migration 20260908173748).
--
-- Usar somente se for necessário voltar ao acoplamento antigo.
-- Não aplicar em produção sem autorização.

DROP TRIGGER IF EXISTS notifications_enqueue_whatsapp ON public.notifications;
CREATE TRIGGER notifications_enqueue_whatsapp
  AFTER INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_notification_for_whatsapp();
