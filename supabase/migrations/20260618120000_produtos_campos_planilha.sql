-- =============================================================================
-- Syagri — Campos de planilha: descrição, metadata do lote, promoção revisada
-- =============================================================================

-- Descrição no staging e catálogo
ALTER TABLE public.produtos_staging
  ADD COLUMN IF NOT EXISTS descricao text;

ALTER TABLE public.produtos_oficiais
  ADD COLUMN IF NOT EXISTS descricao text;

-- Cultura opcional no staging (obrigatória só no lançamento)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'produtos_staging'
      AND column_name = 'cultura'
  ) THEN
    ALTER TABLE public.produtos_staging
      ALTER COLUMN cultura DROP NOT NULL;
  END IF;
END
$$;

-- Metadata extraída da planilha no lote
ALTER TABLE public.lotes_importacao
  ADD COLUMN IF NOT EXISTS moeda_detectada text,
  ADD COLUMN IF NOT EXISTS data_validade date,
  ADD COLUMN IF NOT EXISTS quarter_calculado text,
  ADD COLUMN IF NOT EXISTS metadata_planilha jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.lotes_importacao.moeda_detectada IS
  'Moeda detectada no cabeçalho/contexto da planilha; aplicada a todas as linhas do lote.';
COMMENT ON COLUMN public.lotes_importacao.data_validade IS
  'Data de validade da lista de preços detectada na planilha.';
COMMENT ON COLUMN public.lotes_importacao.quarter_calculado IS
  'Quarter calculado a partir da data de validade.';
COMMENT ON COLUMN public.lotes_importacao.metadata_planilha IS
  'Candidatos detectados (moeda, validade, cabeçalho) para auditoria.';

-- -----------------------------------------------------------------------------
-- RPC: promover lote (usa metadata do lote + exige cultura no lançamento)
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
  v_moeda text;
  v_quarter text;
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

  v_moeda := upper(trim(COALESCE(v_lote.moeda_detectada, '')));
  IF length(v_moeda) = 0 THEN
    RAISE EXCEPTION 'Moeda do lote não definida. Revise os metadados da planilha.';
  END IF;

  v_quarter := trim(COALESCE(v_lote.quarter_calculado, ''));
  IF length(v_quarter) = 0 THEN
    RAISE EXCEPTION 'Quarter do lote não definido. Revise a data de validade.';
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
        OR length(trim(COALESCE(ps.descricao, ''))) = 0
        OR length(trim(COALESCE(ps.cultura, ''))) = 0
      )
  ) THEN
    RAISE EXCEPTION 'Existem linhas com campos obrigatórios vazios (produto, descrição, referência ou cultura).';
  END IF;

  v_taxa := public.get_taxa_conversao_vigente(v_moeda);
  IF v_taxa IS NULL THEN
    RAISE EXCEPTION 'Cotação não encontrada para moeda %.', v_moeda;
  END IF;

  FOR v_linha IN
    SELECT * FROM public.produtos_staging
    WHERE lote_id = p_lote_id
    ORDER BY created_at ASC
  LOOP
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
        descricao,
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
        trim(v_linha.descricao),
        trim(v_linha.cultura),
        v_quarter,
        v_moeda,
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
        descricao = trim(v_linha.descricao),
        cultura = trim(v_linha.cultura),
        quarter = v_quarter,
        moeda_origem = v_moeda,
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
      v_quarter,
      v_moeda,
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

COMMENT ON FUNCTION public.promover_lote_importacao(uuid) IS
  'Promove staging para catálogo usando moeda/quarter do lote; exige cultura por linha.';
