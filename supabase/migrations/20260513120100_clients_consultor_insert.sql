-- Consultores precisam cadastrar cliente ao persistir simulação / pedido.
CREATE POLICY "clients_insert_consultor"
  ON public.clients
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'consultor'::public.user_role
    )
  );
