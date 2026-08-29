-- Permite ao consultor atualizar dados do cliente vinculado à sua simulação (ex.: endereço no pedido).
CREATE POLICY "clients_update_if_linked_to_own_simulation"
  ON public.clients
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.simulations s
      WHERE s.client_id = clients.id
        AND s.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.simulations s
      WHERE s.client_id = clients.id
        AND s.user_id = auth.uid()
    )
  );
