-- =============================================================================
-- Assinatura de pedidos via link público (token)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.pedido_assinaturas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  simulation_id uuid NOT NULL REFERENCES public.simulations (id) ON DELETE CASCADE,
  token text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'signed', 'expired', 'revoked')),
  expires_at timestamptz NOT NULL,
  signer_name text,
  signer_cpf text,
  signature_image_path text,
  pdf_original_path text,
  pdf_signed_path text,
  pedido_snapshot jsonb,
  signed_at timestamptz,
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  signer_ip text,
  signer_user_agent text,
  CONSTRAINT pedido_assinaturas_token_unique UNIQUE (token)
);

CREATE INDEX IF NOT EXISTS pedido_assinaturas_simulation_id_idx
  ON public.pedido_assinaturas (simulation_id);

CREATE INDEX IF NOT EXISTS pedido_assinaturas_simulation_status_idx
  ON public.pedido_assinaturas (simulation_id, status);

COMMENT ON TABLE public.pedido_assinaturas IS
  'Links públicos de assinatura de pedido; acesso anon apenas via Edge Functions.';

ALTER TABLE public.pedido_assinaturas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pedido_assinaturas_select_own" ON public.pedido_assinaturas;
CREATE POLICY "pedido_assinaturas_select_own"
  ON public.pedido_assinaturas
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.simulations s
      WHERE s.id = pedido_assinaturas.simulation_id
        AND (s.user_id = (SELECT auth.uid()) OR public.is_gestor())
    )
  );

DROP POLICY IF EXISTS "pedido_assinaturas_update_revoke" ON public.pedido_assinaturas;
CREATE POLICY "pedido_assinaturas_update_revoke"
  ON public.pedido_assinaturas
  FOR UPDATE
  TO authenticated
  USING (
    status = 'pending'
    AND EXISTS (
      SELECT 1
      FROM public.simulations s
      WHERE s.id = pedido_assinaturas.simulation_id
        AND (s.user_id = (SELECT auth.uid()) OR public.is_gestor())
    )
  )
  WITH CHECK (
    status IN ('pending', 'revoked')
    AND EXISTS (
      SELECT 1
      FROM public.simulations s
      WHERE s.id = pedido_assinaturas.simulation_id
        AND (s.user_id = (SELECT auth.uid()) OR public.is_gestor())
    )
  );

REVOKE ALL ON TABLE public.pedido_assinaturas FROM anon;
GRANT SELECT, UPDATE ON TABLE public.pedido_assinaturas TO authenticated;
GRANT ALL ON TABLE public.pedido_assinaturas TO service_role;

-- -----------------------------------------------------------------------------
-- Storage: PDFs e imagem de assinatura (privado)
-- Path: {simulation_id}/{assinatura_id}/original.pdf|assinatura.png|assinado.pdf
-- -----------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'pedido-documentos',
  'pedido-documentos',
  false,
  52428800,
  ARRAY['application/pdf', 'image/png', 'image/jpeg', 'application/octet-stream']::text[]
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "pedido_docs_auth_select" ON storage.objects;
CREATE POLICY "pedido_docs_auth_select"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'pedido-documentos'
    AND EXISTS (
      SELECT 1
      FROM public.simulations s
      WHERE s.id::text = (storage.foldername(name))[1]
        AND (s.user_id = (SELECT auth.uid()) OR public.is_gestor())
    )
  );
