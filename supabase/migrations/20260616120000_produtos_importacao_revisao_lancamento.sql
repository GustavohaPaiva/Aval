-- =============================================================================
-- Syagri — Revisão de staging, histórico de preços e promoção de lotes
-- =============================================================================

-- Colunas explícitas no staging para revisão
ALTER TABLE public.produtos_staging
  ADD COLUMN IF NOT EXISTS nome text,
  ADD COLUMN IF NOT EXISTS cultura text,
  ADD COLUMN IF NOT EXISTS quarter text;

-- Rastrear template usado no lote
ALTER TABLE public.lotes_importacao
  ADD COLUMN IF NOT EXISTS template_id uuid REFERENCES public.templates_mapeamento (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS lotes_importacao_template_id_idx
  ON public.lotes_importacao (template_id);

-- Histórico de preços por produto oficial
CREATE TABLE IF NOT EXISTS public.produtos_oficiais_historico (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_oficial_id uuid NOT NULL REFERENCES public.produtos_oficiais (id) ON DELETE CASCADE,
  quarter text NOT NULL,
  moeda_origem text NOT NULL,
  preco_original numeric(14, 2) NOT NULL,
  preco_interno_calculado numeric(14, 2) NOT NULL,
  lote_id uuid REFERENCES public.lotes_importacao (id) ON DELETE SET NULL,
  lancado_em timestamptz NOT NULL DEFAULT now(),
  criado_por uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT produtos_oficiais_historico_quarter_not_empty CHECK (length(trim(quarter)) > 0),
  CONSTRAINT produtos_oficiais_historico_moeda_not_empty CHECK (length(trim(moeda_origem)) > 0),
  CONSTRAINT produtos_oficiais_historico_preco_original_non_negative CHECK (preco_original >= 0),
  CONSTRAINT produtos_oficiais_historico_preco_interno_non_negative CHECK (preco_interno_calculado >= 0)
);

CREATE INDEX IF NOT EXISTS produtos_oficiais_historico_produto_lancado_idx
  ON public.produtos_oficiais_historico (produto_oficial_id, lancado_em DESC);

CREATE INDEX IF NOT EXISTS produtos_oficiais_historico_lote_id_idx
  ON public.produtos_oficiais_historico (lote_id);

COMMENT ON TABLE public.produtos_oficiais_historico IS
  'Histórico de preços por quarter; cada lançamento ou atualização gera um registro.';

-- RLS para histórico
ALTER TABLE public.produtos_oficiais_historico ENABLE ROW LEVEL SECURITY;

CREATE POLICY "produtos_oficiais_historico_gestor_all"
  ON public.produtos_oficiais_historico
  FOR ALL
  TO authenticated
  USING (public.is_gestor())
  WITH CHECK (public.is_gestor());

CREATE POLICY "produtos_oficiais_historico_consultor_select"
  ON public.produtos_oficiais_historico
  FOR SELECT
  TO authenticated
  USING (public.is_consultor());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.produtos_oficiais_historico TO postgres, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.produtos_oficiais_historico TO authenticated;

-- -----------------------------------------------------------------------------
-- Função auxiliar: taxa de conversão vigente por moeda
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_taxa_conversao_vigente(p_moeda text)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT c.taxa_conversao
      FROM public.cotacoes_moeda c
      WHERE upper(trim(c.moeda_origem)) = upper(trim(p_moeda))
      ORDER BY c.data_vigencia DESC, c.created_at DESC
      LIMIT 1
    ),
    CASE WHEN upper(trim(p_moeda)) = 'BRL' THEN 1::numeric ELSE NULL END
  );
$$;

COMMENT ON FUNCTION public.get_taxa_conversao_vigente(text) IS
  'Retorna a taxa mais recente para a moeda; BRL default 1.';

-- -----------------------------------------------------------------------------
-- RPC: promover lote de staging para catálogo oficial
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.promover_lote_importacao(p_lote_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lote public.lotes_importacao%ROWTYPE;
  v_linha public.produtos_staging%ROWTYPE;
  v_produto_id uuid;
  v_taxa numeric;
  v_preco_interno numeric;
  v_novos int := 0;
  v_atualizacoes int := 0;
  v_uid uuid;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão inválida.';
  END IF;

  IF NOT public.is_gestor() THEN
    RAISE EXCEPTION 'Acesso negado.';
  END IF;

  SELECT * INTO v_lote
  FROM public.lotes_importacao
  WHERE id = p_lote_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lote não encontrado.';
  END IF;

  IF v_lote.status <> 'aguardando_validacao'::public.lote_importacao_status THEN
    RAISE EXCEPTION 'Lote não está aguardando validação.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.produtos_staging ps
    WHERE ps.lote_id = p_lote_id AND ps.status_linha = 'erro'::public.produto_staging_status_linha
  ) THEN
    RAISE EXCEPTION 'Existem linhas com erro. Corrija antes de lançar.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.produtos_staging ps
    WHERE ps.lote_id = p_lote_id
      AND (
        length(trim(ps.sku_fornecedor)) = 0
        OR length(trim(COALESCE(ps.nome, ''))) = 0
        OR length(trim(COALESCE(ps.cultura, ''))) = 0
        OR length(trim(COALESCE(ps.quarter, ''))) = 0
        OR length(trim(ps.moeda)) = 0
      )
  ) THEN
    RAISE EXCEPTION 'Existem linhas com campos obrigatórios vazios.';
  END IF;

  FOR v_linha IN
    SELECT * FROM public.produtos_staging
    WHERE lote_id = p_lote_id
    ORDER BY created_at ASC
  LOOP
    v_taxa := public.get_taxa_conversao_vigente(v_linha.moeda);
    IF v_taxa IS NULL THEN
      RAISE EXCEPTION 'Cotação não encontrada para moeda %.', v_linha.moeda;
    END IF;

    v_preco_interno := round((v_linha.preco_original * v_taxa)::numeric, 2);

    SELECT po.id INTO v_produto_id
    FROM public.produtos_oficiais po
    WHERE po.fornecedor_id = v_lote.fornecedor_id
      AND lower(trim(po.sku_fornecedor)) = lower(trim(v_linha.sku_fornecedor))
    LIMIT 1;

    IF v_produto_id IS NULL THEN
      INSERT INTO public.produtos_oficiais (
        fornecedor_id,
        sku_fornecedor,
        nome,
        cultura,
        quarter,
        moeda_origem,
        preco_original,
        preco_interno_calculado,
        ativo
      ) VALUES (
        v_lote.fornecedor_id,
        trim(v_linha.sku_fornecedor),
        trim(v_linha.nome),
        trim(v_linha.cultura),
        trim(v_linha.quarter),
        upper(trim(v_linha.moeda)),
        v_linha.preco_original,
        v_preco_interno,
        true
      )
      RETURNING id INTO v_produto_id;

      v_novos := v_novos + 1;
    ELSE
      UPDATE public.produtos_oficiais
      SET
        nome = trim(v_linha.nome),
        cultura = trim(v_linha.cultura),
        quarter = trim(v_linha.quarter),
        moeda_origem = upper(trim(v_linha.moeda)),
        preco_original = v_linha.preco_original,
        preco_interno_calculado = v_preco_interno,
        ativo = true,
        updated_at = now()
      WHERE id = v_produto_id;

      v_atualizacoes := v_atualizacoes + 1;
    END IF;

    INSERT INTO public.produtos_oficiais_historico (
      produto_oficial_id,
      quarter,
      moeda_origem,
      preco_original,
      preco_interno_calculado,
      lote_id,
      criado_por
    ) VALUES (
      v_produto_id,
      trim(v_linha.quarter),
      upper(trim(v_linha.moeda)),
      v_linha.preco_original,
      v_preco_interno,
      p_lote_id,
      v_uid
    );
  END LOOP;

  UPDATE public.lotes_importacao
  SET status = 'concluido'::public.lote_importacao_status,
      updated_at = now()
  WHERE id = p_lote_id;

  RETURN jsonb_build_object(
    'novos', v_novos,
    'atualizacoes', v_atualizacoes,
    'total', v_novos + v_atualizacoes
  );
END;
$$;

REVOKE ALL ON FUNCTION public.promover_lote_importacao(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.promover_lote_importacao(uuid) TO authenticated;

COMMENT ON FUNCTION public.promover_lote_importacao(uuid) IS
  'Promove linhas de staging para produtos_oficiais com histórico de preços; marca lote concluído.';
