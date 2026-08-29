-- Reativa RLS nas tabelas-core e adiciona policies DELETE
-- necessárias para replace de itens / rollback de simulação órfã.
-- Policies DELETE são criadas antes do ENABLE para evitar janela quebrada.

-- ---------------------------------------------------------------------------
-- simulation_items DELETE
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "simulation_items_delete_consultor_own_simulation"
  ON public.simulation_items;
CREATE POLICY "simulation_items_delete_consultor_own_simulation"
  ON public.simulation_items
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.simulations s
      WHERE s.id = simulation_items.simulation_id
        AND s.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'consultor'::public.user_role
    )
  );

DROP POLICY IF EXISTS "simulation_items_delete_gestor_all"
  ON public.simulation_items;
CREATE POLICY "simulation_items_delete_gestor_all"
  ON public.simulation_items
  FOR DELETE
  TO authenticated
  USING (public.is_gestor());

GRANT DELETE ON public.simulation_items TO authenticated;

-- ---------------------------------------------------------------------------
-- simulations DELETE (rollback de insert órfão)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "simulations_delete_consultor_own"
  ON public.simulations;
CREATE POLICY "simulations_delete_consultor_own"
  ON public.simulations
  FOR DELETE
  TO authenticated
  USING (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'consultor'::public.user_role
    )
  );

DROP POLICY IF EXISTS "simulations_delete_gestor_all"
  ON public.simulations;
CREATE POLICY "simulations_delete_gestor_all"
  ON public.simulations
  FOR DELETE
  TO authenticated
  USING (public.is_gestor());

GRANT DELETE ON public.simulations TO authenticated;

-- ---------------------------------------------------------------------------
-- Reativar RLS (policies SELECT/INSERT/UPDATE já existiam)
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.simulations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.simulation_items ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
