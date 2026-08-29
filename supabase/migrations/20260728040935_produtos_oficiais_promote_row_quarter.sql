-- Use staging row quarter (fallback: lote) for match AND insert/update.
-- Prevents Cibra Q3/Q4 products from collapsing when lote metadata quarter drifts.

CREATE OR REPLACE FUNCTION public.promover_lote_importacao(p_lote_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  v_lote public.lotes_importacao%ROWTYPE;
  v_linha public.produtos_staging%ROWTYPE;
  v_produto_id uuid;
  v_taxa numeric;
  v_preco_interno numeric;
  v_moeda text;
  v_quarter text;
  v_eff_quarter text;
  v_desconto numeric;
  v_estado text;
  v_classe text;
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

  IF NOT COALESCE(v_lote.ativo, true) THEN
    RAISE EXCEPTION 'Esta lista está inativa.';
  END IF;

  v_moeda := upper(trim(COALESCE(v_lote.moeda_detectada, '')));
  IF length(v_moeda) = 0 THEN
    RAISE EXCEPTION 'Moeda do lote não definida. Revise os metadados da planilha.';
  END IF;

  v_quarter := trim(COALESCE(v_lote.quarter_calculado, ''));
  IF length(v_quarter) = 0 THEN
    RAISE EXCEPTION 'Quarter do lote não definido. Revise a data de validade ou o quarter.';
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
        length(trim(COALESCE(ps.nome, ''))) = 0
        OR ps.preco_original IS NULL
        OR ps.preco_original < 0
        OR (ps.preco_original - COALESCE(ps.desconto_usd, v_lote.desconto_usd, 0)) < 0
      )
  ) THEN
    RAISE EXCEPTION 'Existem linhas com fertilizante ou preço inválido.';
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
    v_estado := COALESCE(
      NULLIF(trim(v_linha.estado), ''),
      NULLIF(trim(v_lote.estado_padrao), '')
    );
    IF v_estado IS NULL OR v_estado NOT IN ('MG', 'SP') THEN
      RAISE EXCEPTION 'Estado (MG/SP) obrigatório para o produto %.', trim(v_linha.nome);
    END IF;

    v_classe := COALESCE(NULLIF(trim(v_linha.classe), ''), 'Convencional');
    v_desconto := COALESCE(v_linha.desconto_usd, v_lote.desconto_usd, 0);
    v_preco_interno := round(((v_linha.preco_original - v_desconto) * v_taxa)::numeric, 2);

    -- Prefer row quarter (set per Cibra catalog group) over lote metadata
    v_eff_quarter := trim(COALESCE(NULLIF(trim(v_linha.quarter), ''), v_quarter));
    IF length(v_eff_quarter) = 0 THEN
      RAISE EXCEPTION 'Quarter obrigatório para o produto %.', trim(v_linha.nome);
    END IF;

    -- Match by fornecedor + nome + quarter + estado so Q3/Q4 and MG/SP coexist
    SELECT po.id INTO v_produto_id
    FROM public.produtos_oficiais po
    WHERE po.fornecedor_id = v_lote.fornecedor_id
      AND lower(trim(po.nome)) = lower(trim(v_linha.nome))
      AND lower(trim(po.quarter)) = lower(v_eff_quarter)
      AND po.estado = v_estado
    LIMIT 1;

    IF v_produto_id IS NULL THEN
      INSERT INTO public.produtos_oficiais (
        fornecedor_id,
        sku_fornecedor,
        nome,
        referencia_complementar,
        estado,
        classe,
        quarter,
        moeda_origem,
        preco_original,
        desconto_usd,
        preco_interno_calculado,
        lote_id,
        vencimento_lista,
        ativo
      ) VALUES (
        v_lote.fornecedor_id,
        COALESCE(
          NULLIF(trim(v_linha.referencia_complementar), ''),
          NULLIF(trim(v_linha.sku_fornecedor), ''),
          trim(v_linha.nome)
        ),
        trim(v_linha.nome),
        COALESCE(
          NULLIF(trim(v_linha.referencia_complementar), ''),
          NULLIF(trim(v_linha.sku_fornecedor), ''),
          ''
        ),
        v_estado,
        v_classe,
        v_eff_quarter,
        v_moeda,
        v_linha.preco_original,
        v_desconto,
        v_preco_interno,
        p_lote_id,
        v_lote.data_validade,
        true
      )
      RETURNING id INTO v_produto_id;

      v_novos := v_novos + 1;
    ELSE
      UPDATE public.produtos_oficiais
      SET
        sku_fornecedor = COALESCE(
          NULLIF(trim(v_linha.referencia_complementar), ''),
          NULLIF(trim(v_linha.sku_fornecedor), ''),
          sku_fornecedor
        ),
        referencia_complementar = COALESCE(
          NULLIF(trim(v_linha.referencia_complementar), ''),
          NULLIF(trim(v_linha.sku_fornecedor), ''),
          referencia_complementar
        ),
        estado = v_estado,
        classe = v_classe,
        quarter = v_eff_quarter,
        moeda_origem = v_moeda,
        preco_original = v_linha.preco_original,
        desconto_usd = v_desconto,
        preco_interno_calculado = v_preco_interno,
        lote_id = p_lote_id,
        vencimento_lista = v_lote.data_validade,
        ativo = true
      WHERE id = v_produto_id;

      v_atualizacoes := v_atualizacoes + 1;
    END IF;

    INSERT INTO public.produtos_oficiais_historico (
      produto_oficial_id,
      quarter,
      moeda_origem,
      preco_original,
      desconto_usd,
      preco_interno_calculado,
      criado_por
    ) VALUES (
      v_produto_id,
      v_eff_quarter,
      v_moeda,
      v_linha.preco_original,
      v_desconto,
      v_preco_interno,
      v_uid
    );
  END LOOP;

  UPDATE public.lotes_importacao
  SET status = 'concluido'::public.lote_importacao_status
  WHERE id = p_lote_id;

  RETURN jsonb_build_object(
    'novos', v_novos,
    'atualizacoes', v_atualizacoes
  );
END;
$$;

COMMENT ON FUNCTION public.promover_lote_importacao(uuid) IS
  'Promove staging para catálogo; identidade fornecedor+nome+quarter(linha)+estado.';
