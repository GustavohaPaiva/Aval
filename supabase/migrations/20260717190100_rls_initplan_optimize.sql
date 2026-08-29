-- Performance: evita reavaliação de auth.uid() por linha nas policies RLS
-- (advisor auth_rls_initplan). Troca auth.uid() por (select auth.uid()),
-- mantendo a mesma semântica.

-- clients
ALTER POLICY "clients_insert_consultor" ON public.clients
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (select auth.uid()) AND p.role = 'consultor'::public.user_role
    )
  );

ALTER POLICY "clients_update_if_linked_to_own_simulation" ON public.clients
  USING (
    EXISTS (
      SELECT 1 FROM public.simulations s
      WHERE s.client_id = clients.id AND s.user_id = (select auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.simulations s
      WHERE s.client_id = clients.id AND s.user_id = (select auth.uid())
    )
  );

-- cotacoes_moeda
ALTER POLICY "cotacoes_moeda_gestor_insert" ON public.cotacoes_moeda
  WITH CHECK (public.is_gestor() AND (criado_por = (select auth.uid())));

-- notifications
ALTER POLICY "notifications_select_own" ON public.notifications
  USING (recipient_id = (select auth.uid()));

ALTER POLICY "notifications_update_own" ON public.notifications
  USING (recipient_id = (select auth.uid()))
  WITH CHECK (recipient_id = (select auth.uid()));

-- profiles
ALTER POLICY "profiles_insert_own" ON public.profiles
  WITH CHECK (id = (select auth.uid()));

ALTER POLICY "profiles_select_own" ON public.profiles
  USING (id = (select auth.uid()));

ALTER POLICY "profiles_update_own_or_gestor" ON public.profiles
  USING ((id = (select auth.uid())) OR public.is_gestor())
  WITH CHECK ((id = (select auth.uid())) OR public.is_gestor());

-- simulations
ALTER POLICY "simulations_select_consultor_own" ON public.simulations
  USING (
    (user_id = (select auth.uid()))
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (select auth.uid()) AND p.role = 'consultor'::public.user_role
    )
  );

ALTER POLICY "simulations_insert_consultor_own" ON public.simulations
  WITH CHECK (
    (user_id = (select auth.uid()))
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (select auth.uid()) AND p.role = 'consultor'::public.user_role
    )
  );

ALTER POLICY "simulations_update_consultor_own" ON public.simulations
  USING (
    (user_id = (select auth.uid()))
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (select auth.uid()) AND p.role = 'consultor'::public.user_role
    )
  )
  WITH CHECK (
    (user_id = (select auth.uid()))
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (select auth.uid()) AND p.role = 'consultor'::public.user_role
    )
  );

ALTER POLICY "simulations_delete_consultor_own" ON public.simulations
  USING (
    (user_id = (select auth.uid()))
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (select auth.uid()) AND p.role = 'consultor'::public.user_role
    )
  );

-- simulation_items
ALTER POLICY "simulation_items_select_consultor_via_simulation" ON public.simulation_items
  USING (
    EXISTS (
      SELECT 1 FROM public.simulations s
      WHERE s.id = simulation_items.simulation_id AND s.user_id = (select auth.uid())
    )
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (select auth.uid()) AND p.role = 'consultor'::public.user_role
    )
  );

ALTER POLICY "simulation_items_insert_consultor_own_simulation" ON public.simulation_items
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.simulations s
      WHERE s.id = simulation_items.simulation_id AND s.user_id = (select auth.uid())
    )
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (select auth.uid()) AND p.role = 'consultor'::public.user_role
    )
  );

ALTER POLICY "simulation_items_update_consultor_own_simulation" ON public.simulation_items
  USING (
    EXISTS (
      SELECT 1 FROM public.simulations s
      WHERE s.id = simulation_items.simulation_id AND s.user_id = (select auth.uid())
    )
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (select auth.uid()) AND p.role = 'consultor'::public.user_role
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.simulations s
      WHERE s.id = simulation_items.simulation_id AND s.user_id = (select auth.uid())
    )
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (select auth.uid()) AND p.role = 'consultor'::public.user_role
    )
  );

ALTER POLICY "simulation_items_delete_consultor_own_simulation" ON public.simulation_items
  USING (
    EXISTS (
      SELECT 1 FROM public.simulations s
      WHERE s.id = simulation_items.simulation_id AND s.user_id = (select auth.uid())
    )
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (select auth.uid()) AND p.role = 'consultor'::public.user_role
    )
  );

NOTIFY pgrst, 'reload schema';
