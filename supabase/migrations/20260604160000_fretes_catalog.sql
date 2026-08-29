-- Catálogo de fretes (origem → destino → valor)

CREATE TABLE public.fretes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  origem text NOT NULL,
  destino text NOT NULL,
  valor numeric(14, 2) NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fretes_origem_not_empty CHECK (length(trim(origem)) > 0),
  CONSTRAINT fretes_destino_not_empty CHECK (length(trim(destino)) > 0),
  CONSTRAINT fretes_valor_non_negative CHECK (valor >= 0),
  CONSTRAINT fretes_origem_destino_unique UNIQUE (origem, destino)
);

CREATE INDEX fretes_origem_idx ON public.fretes (origem);
CREATE INDEX fretes_destino_idx ON public.fretes (destino);
CREATE INDEX fretes_ativo_idx ON public.fretes (ativo) WHERE ativo = true;

CREATE TRIGGER fretes_set_updated_at
  BEFORE UPDATE ON public.fretes
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.fretes IS 'Tabela de fretes por rota (origem, destino, valor em R$).';
COMMENT ON COLUMN public.fretes.origem IS 'Ponto de origem do frete (ex.: UBERABA, CUBATAO, RIO GRANDE, FOB).';
COMMENT ON COLUMN public.fretes.destino IS 'Cidade ou local de destino.';

ALTER TABLE public.fretes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fretes_select_authenticated"
  ON public.fretes
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "fretes_write_gestor"
  ON public.fretes
  FOR ALL
  TO authenticated
  USING (public.is_gestor())
  WITH CHECK (public.is_gestor());

GRANT SELECT ON public.fretes TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.fretes TO authenticated;
