-- Fazendas do cliente. O pedido continua gravando o nome em simulations.fazenda;
-- esta tabela é a lista que o select do pedido oferece, por cliente.

CREATE TABLE public.client_fazendas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients (id) ON DELETE CASCADE,
  nome text NOT NULL,
  municipio text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT client_fazendas_nome_not_empty CHECK (length(btrim(nome)) > 0)
);

CREATE UNIQUE INDEX client_fazendas_client_nome_municipio_uidx
  ON public.client_fazendas (
    client_id,
    lower(btrim(nome)),
    lower(btrim(COALESCE(municipio, '')))
  );

CREATE INDEX client_fazendas_client_id_idx
  ON public.client_fazendas (client_id);

CREATE TRIGGER client_fazendas_set_updated_at
  BEFORE UPDATE ON public.client_fazendas
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.client_fazendas IS
  'Fazendas (ou sítios) de entrega vinculadas ao cliente. O pedido escolhe uma delas.';

ALTER TABLE public.client_fazendas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "client_fazendas_select"
  ON public.client_fazendas
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.clients c
      WHERE c.id = client_fazendas.client_id
    )
  );

CREATE POLICY "client_fazendas_insert_consultor_gestor"
  ON public.client_fazendas
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (public.is_gestor() OR public.is_consultor())
    AND EXISTS (
      SELECT 1
      FROM public.clients c
      WHERE c.id = client_fazendas.client_id
    )
  );

CREATE POLICY "client_fazendas_update_gestor"
  ON public.client_fazendas
  FOR UPDATE
  TO authenticated
  USING (public.is_gestor())
  WITH CHECK (public.is_gestor());

CREATE POLICY "client_fazendas_delete_gestor"
  ON public.client_fazendas
  FOR DELETE
  TO authenticated
  USING (public.is_gestor());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_fazendas TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_fazendas TO service_role;

NOTIFY pgrst, 'reload schema';
