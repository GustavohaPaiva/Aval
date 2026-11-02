-- O teste de push só devolve a entrega do próprio usuário. A tabela continua fechada.
CREATE OR REPLACE FUNCTION public.own_push_test_status(p_notification_id uuid)
RETURNS TABLE (status text, last_error text, attempts integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT d.status, d.last_error, d.attempts
  FROM public.push_deliveries d
  JOIN public.notifications n ON n.id = d.notification_id
  WHERE d.notification_id = p_notification_id
    AND n.recipient_id = (SELECT auth.uid())
    AND n.type::text = 'push_test';
$$;

REVOKE ALL ON FUNCTION public.own_push_test_status(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.own_push_test_status(uuid) TO authenticated;

COMMENT ON FUNCTION public.own_push_test_status(uuid) IS
  'Status da entrega push_test criada por auth.uid(). Não lista outras notificações.';

-- O disparo (enqueue_web_push) fica em 20261102134601_push_dispatch_headers.sql.

NOTIFY pgrst, 'reload schema';
