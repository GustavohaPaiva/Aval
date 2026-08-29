-- Faixas editáveis de comissão (margem × %) por classe de produto
-- + registro da comissão calculada vinculada ao consultor da simulação/pedido.

CREATE TABLE IF NOT EXISTS public.comissao_faixas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo_produto text NOT NULL
    CHECK (tipo_produto IN ('Convencional', 'Especial')),
  margem_minima_percentual numeric(8, 4) NOT NULL
    CHECK (margem_minima_percentual >= 0),
  comissao_percentual numeric(8, 4) NOT NULL
    CHECK (comissao_percentual >= 0),
  ativo boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  CONSTRAINT comissao_faixas_tipo_margem_unique
    UNIQUE (tipo_produto, margem_minima_percentual)
);

COMMENT ON TABLE public.comissao_faixas IS
  'Faixas de comissão do consultor por margem mínima e classe do produto (Convencional/Especial). Editável pelo gestor.';

COMMENT ON COLUMN public.comissao_faixas.margem_minima_percentual IS
  'Piso da faixa em % (ex.: 5 = a partir de 5% de margem). Aplica-se a maior faixa cujo piso <= margem.';

COMMENT ON COLUMN public.comissao_faixas.comissao_percentual IS
  'Percentual de comissão sobre a base (proposta) da linha/pedido (ex.: 0.50 = 0,50%).';

CREATE INDEX IF NOT EXISTS comissao_faixas_tipo_ativo_idx
  ON public.comissao_faixas (tipo_produto, ativo, margem_minima_percentual DESC);

INSERT INTO public.comissao_faixas (tipo_produto, margem_minima_percentual, comissao_percentual)
VALUES
  ('Convencional', 3, 0.30),
  ('Convencional', 4, 0.40),
  ('Convencional', 5, 0.50),
  ('Convencional', 6, 0.50),
  ('Convencional', 7, 0.50),
  ('Especial', 3, 0.60),
  ('Especial', 4, 0.80),
  ('Especial', 5, 1.00),
  ('Especial', 6, 1.25),
  ('Especial', 7, 1.50)
ON CONFLICT (tipo_produto, margem_minima_percentual) DO NOTHING;

-- Snapshot da comissão por simulação/pedido, sempre ligado ao consultor dono.
CREATE TABLE IF NOT EXISTS public.comissao_registros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  simulation_id uuid NOT NULL REFERENCES public.simulations (id) ON DELETE CASCADE,
  consultor_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  base_calculo numeric(14, 2) NOT NULL DEFAULT 0,
  comissao_valor numeric(14, 2) NOT NULL DEFAULT 0,
  margem_media_percentual numeric(12, 6),
  status text NOT NULL DEFAULT 'calculada'
    CHECK (status IN ('calculada', 'confirmada', 'cancelada')),
  calculado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT comissao_registros_simulation_unique UNIQUE (simulation_id)
);

COMMENT ON TABLE public.comissao_registros IS
  'Comissão agregada por simulação/pedido, associada ao consultor (profiles) responsável.';

COMMENT ON COLUMN public.comissao_registros.consultor_id IS
  'Consultor dono da venda (= simulations.user_id). Base para exibir no cadastro do consultor (P2).';

COMMENT ON COLUMN public.comissao_registros.status IS
  'calculada = gerada na aprovação/salvamento; confirmada = pedido convertido; cancelada = anulada.';

CREATE INDEX IF NOT EXISTS comissao_registros_consultor_idx
  ON public.comissao_registros (consultor_id, calculado_em DESC);

CREATE INDEX IF NOT EXISTS comissao_registros_status_idx
  ON public.comissao_registros (status);

CREATE TABLE IF NOT EXISTS public.comissao_registro_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comissao_registro_id uuid NOT NULL
    REFERENCES public.comissao_registros (id) ON DELETE CASCADE,
  simulation_item_id uuid REFERENCES public.simulation_items (id) ON DELETE SET NULL,
  product_id uuid REFERENCES public.produtos_oficiais (id) ON DELETE SET NULL,
  classe text NOT NULL CHECK (classe IN ('Convencional', 'Especial')),
  volume numeric(14, 4),
  proposta_unitaria numeric(14, 2),
  base_calculo numeric(14, 2) NOT NULL DEFAULT 0,
  margem_percentual numeric(12, 6),
  comissao_percentual numeric(8, 4) NOT NULL DEFAULT 0,
  comissao_valor numeric(14, 2) NOT NULL DEFAULT 0
);

COMMENT ON TABLE public.comissao_registro_itens IS
  'Detalhe da comissão por linha do pedido (classe, margem e % aplicados).';

CREATE INDEX IF NOT EXISTS comissao_registro_itens_registro_idx
  ON public.comissao_registro_itens (comissao_registro_id);

-- Colunas de snapshot na linha da simulação (preenchidas no save do simulador).
ALTER TABLE public.simulation_items
  ADD COLUMN IF NOT EXISTS produto_classe text,
  ADD COLUMN IF NOT EXISTS margem_percentual numeric(12, 6),
  ADD COLUMN IF NOT EXISTS comissao_percentual numeric(8, 4),
  ADD COLUMN IF NOT EXISTS comissao_valor numeric(14, 2);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'simulation_items_produto_classe_check'
  ) THEN
    ALTER TABLE public.simulation_items
      ADD CONSTRAINT simulation_items_produto_classe_check
      CHECK (produto_classe IS NULL OR produto_classe IN ('Convencional', 'Especial'));
  END IF;
END
$$;

COMMENT ON COLUMN public.simulation_items.produto_classe IS
  'Snapshot da classe do produto no momento do cálculo da comissão.';
COMMENT ON COLUMN public.simulation_items.margem_percentual IS
  'Margem de lucro da linha em % (ex.: 5.25 = 5,25%).';
COMMENT ON COLUMN public.simulation_items.comissao_percentual IS
  'Percentual de comissão aplicado à linha no momento do save.';
COMMENT ON COLUMN public.simulation_items.comissao_valor IS
  'Valor R$ da comissão da linha (base = volume × proposta).';

ALTER TABLE public.simulations
  ADD COLUMN IF NOT EXISTS comissao_valor_total numeric(14, 2);

COMMENT ON COLUMN public.simulations.comissao_valor_total IS
  'Soma das comissões das linhas no último cálculo.';

-- RLS
ALTER TABLE public.comissao_faixas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comissao_registros ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comissao_registro_itens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "comissao_faixas_select_authenticated" ON public.comissao_faixas;
CREATE POLICY "comissao_faixas_select_authenticated"
  ON public.comissao_faixas
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "comissao_faixas_insert_gestor" ON public.comissao_faixas;
CREATE POLICY "comissao_faixas_insert_gestor"
  ON public.comissao_faixas
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_gestor());

DROP POLICY IF EXISTS "comissao_faixas_update_gestor" ON public.comissao_faixas;
CREATE POLICY "comissao_faixas_update_gestor"
  ON public.comissao_faixas
  FOR UPDATE
  TO authenticated
  USING (public.is_gestor())
  WITH CHECK (public.is_gestor());

DROP POLICY IF EXISTS "comissao_faixas_delete_gestor" ON public.comissao_faixas;
CREATE POLICY "comissao_faixas_delete_gestor"
  ON public.comissao_faixas
  FOR DELETE
  TO authenticated
  USING (public.is_gestor());

DROP POLICY IF EXISTS "comissao_registros_select_own_or_gestor" ON public.comissao_registros;
CREATE POLICY "comissao_registros_select_own_or_gestor"
  ON public.comissao_registros
  FOR SELECT
  TO authenticated
  USING (consultor_id = (SELECT auth.uid()) OR public.is_gestor());

DROP POLICY IF EXISTS "comissao_registros_insert_own_or_gestor" ON public.comissao_registros;
CREATE POLICY "comissao_registros_insert_own_or_gestor"
  ON public.comissao_registros
  FOR INSERT
  TO authenticated
  WITH CHECK (consultor_id = (SELECT auth.uid()) OR public.is_gestor());

DROP POLICY IF EXISTS "comissao_registros_update_own_or_gestor" ON public.comissao_registros;
CREATE POLICY "comissao_registros_update_own_or_gestor"
  ON public.comissao_registros
  FOR UPDATE
  TO authenticated
  USING (consultor_id = (SELECT auth.uid()) OR public.is_gestor())
  WITH CHECK (consultor_id = (SELECT auth.uid()) OR public.is_gestor());

DROP POLICY IF EXISTS "comissao_registros_delete_gestor" ON public.comissao_registros;
CREATE POLICY "comissao_registros_delete_gestor"
  ON public.comissao_registros
  FOR DELETE
  TO authenticated
  USING (public.is_gestor());

DROP POLICY IF EXISTS "comissao_registro_itens_select_via_registro" ON public.comissao_registro_itens;
CREATE POLICY "comissao_registro_itens_select_via_registro"
  ON public.comissao_registro_itens
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.comissao_registros r
      WHERE r.id = comissao_registro_id
        AND (r.consultor_id = (SELECT auth.uid()) OR public.is_gestor())
    )
  );

DROP POLICY IF EXISTS "comissao_registro_itens_insert_via_registro" ON public.comissao_registro_itens;
CREATE POLICY "comissao_registro_itens_insert_via_registro"
  ON public.comissao_registro_itens
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.comissao_registros r
      WHERE r.id = comissao_registro_id
        AND (r.consultor_id = (SELECT auth.uid()) OR public.is_gestor())
    )
  );

DROP POLICY IF EXISTS "comissao_registro_itens_delete_via_registro" ON public.comissao_registro_itens;
CREATE POLICY "comissao_registro_itens_delete_via_registro"
  ON public.comissao_registro_itens
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.comissao_registros r
      WHERE r.id = comissao_registro_id
        AND (r.consultor_id = (SELECT auth.uid()) OR public.is_gestor())
    )
  );

GRANT SELECT ON public.comissao_faixas TO authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON public.comissao_faixas TO authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.comissao_registros TO authenticated, service_role;
GRANT SELECT, INSERT, DELETE ON public.comissao_registro_itens TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
