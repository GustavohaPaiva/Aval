-- Garante o singleton de parâmetros e permite upsert pelo gestor.

INSERT INTO public.parametros_sistema (id, icms_percentual)
VALUES (1, 4)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "parametros_sistema_insert_gestor" ON public.parametros_sistema;
CREATE POLICY "parametros_sistema_insert_gestor"
  ON public.parametros_sistema
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_gestor() AND id = 1);

GRANT INSERT ON public.parametros_sistema TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
