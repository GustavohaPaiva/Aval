-- Snapshot de faixas (margem × %) por registro de comissão + UPDATE de itens pelo gestor.

ALTER TABLE public.comissao_registros
  ADD COLUMN IF NOT EXISTS faixas_override jsonb;

COMMENT ON COLUMN public.comissao_registros.faixas_override IS
  'Snapshot das faixas (margem × %) usadas só neste registro. NULL = usa comissao_faixas global.';

GRANT UPDATE ON public.comissao_registro_itens TO authenticated, service_role;

DROP POLICY IF EXISTS "comissao_registro_itens_update_gestor" ON public.comissao_registro_itens;
CREATE POLICY "comissao_registro_itens_update_gestor"
  ON public.comissao_registro_itens
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.comissao_registros r
      WHERE r.id = comissao_registro_id
        AND public.is_gestor()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.comissao_registros r
      WHERE r.id = comissao_registro_id
        AND public.is_gestor()
    )
  );

NOTIFY pgrst, 'reload schema';
