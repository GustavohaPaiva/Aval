-- Permite gestores criarem/possuírem simulações e inserirem itens.
-- Necessário após a UI passar a oferecer "Nova simulação" também para gestores.

DROP POLICY IF EXISTS "simulations_insert_gestor_own" ON public.simulations;
CREATE POLICY "simulations_insert_gestor_own"
  ON public.simulations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_gestor()
    AND user_id = (select auth.uid())
  );

DROP POLICY IF EXISTS "simulation_items_insert_gestor" ON public.simulation_items;
CREATE POLICY "simulation_items_insert_gestor"
  ON public.simulation_items
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_gestor());

NOTIFY pgrst, 'reload schema';
