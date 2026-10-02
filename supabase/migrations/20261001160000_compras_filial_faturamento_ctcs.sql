-- Filial de faturamento separada da planta + cadastro de CTC.
ALTER TABLE public.compras
  ADD COLUMN IF NOT EXISTS filial_faturamento text;

-- Backfill não é edição do usuário: sem o trigger, OCs canceladas também recebem o valor.
ALTER TABLE public.compras DISABLE TRIGGER compras_on_edit;

UPDATE public.compras
SET filial_faturamento = filial_site
WHERE filial_faturamento IS NULL;

ALTER TABLE public.compras ENABLE TRIGGER compras_on_edit;

ALTER TABLE public.compras
  ALTER COLUMN filial_faturamento SET DEFAULT 'uberaba',
  ALTER COLUMN filial_faturamento SET NOT NULL;

ALTER TABLE public.compras
  DROP CONSTRAINT IF EXISTS compras_filial_faturamento_check;
ALTER TABLE public.compras
  ADD CONSTRAINT compras_filial_faturamento_check CHECK (
    filial_faturamento IN ('nova-ponte', 'uberaba', 'ituverava', 'guaira', 'frutal')
  );

COMMENT ON COLUMN public.compras.filial_faturamento IS
  'Filial Syagri faturada no pedido ao fornecedor (CNPJ/endereço da compradora). Independe da planta.';

CREATE TABLE IF NOT EXISTS public.ctcs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ctcs_nome_not_blank CHECK (btrim(nome) <> '')
);

CREATE UNIQUE INDEX IF NOT EXISTS ctcs_nome_unique ON public.ctcs (lower(btrim(nome)));

COMMENT ON TABLE public.ctcs IS 'Cadastro de CTC impresso no pedido ao fornecedor.';

ALTER TABLE public.ctcs ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ctcs TO authenticated;
GRANT ALL ON TABLE public.ctcs TO service_role;

DROP POLICY IF EXISTS "ctcs_gestor_all" ON public.ctcs;
CREATE POLICY "ctcs_gestor_all"
  ON public.ctcs FOR ALL TO authenticated
  USING (public.is_gestor())
  WITH CHECK (public.is_gestor());

INSERT INTO public.ctcs (nome)
SELECT DISTINCT btrim(ctc)
FROM public.compras
WHERE nullif(btrim(ctc), '') IS NOT NULL
ON CONFLICT DO NOTHING;
