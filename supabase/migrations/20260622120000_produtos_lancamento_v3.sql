-- =============================================================================
-- Syagri — Lançamento v3: fertilizante como chave, desconto antes do câmbio,
-- estado/classe, inativação por lista, remoção de cultura/descrição
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. lotes_importacao — metadados da lista
-- -----------------------------------------------------------------------------
ALTER TABLE public.lotes_importacao
  ADD COLUMN IF NOT EXISTS desconto_usd numeric(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ativo boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS estado_padrao text;

ALTER TABLE public.lotes_importacao
  DROP CONSTRAINT IF EXISTS lotes_importacao_estado_padrao_check;

ALTER TABLE public.lotes_importacao
  ADD CONSTRAINT lotes_importacao_estado_padrao_check
  CHECK (estado_padrao IS NULL OR estado_padrao IN ('MG', 'SP'));

ALTER TABLE public.lotes_importacao
  DROP CONSTRAINT IF EXISTS lotes_importacao_desconto_non_negative;

ALTER TABLE public.lotes_importacao
  ADD CONSTRAINT lotes_importacao_desconto_non_negative
  CHECK (desconto_usd >= 0);

CREATE INDEX IF NOT EXISTS lotes_importacao_ativo_idx
  ON public.lotes_importacao (ativo) WHERE ativo;

COMMENT ON COLUMN public.lotes_importacao.desconto_usd IS
  'Desconto fixo em USD aplicado a todos os produtos desta lista antes da conversão.';
COMMENT ON COLUMN public.lotes_importacao.estado_padrao IS
  'Estado (MG/SP) aplicado às linhas do lote quando não informado por linha.';

-- -----------------------------------------------------------------------------
-- 2. produtos_staging — novos campos; referência opcional
-- -----------------------------------------------------------------------------
ALTER TABLE public.produtos_staging
  ADD COLUMN IF NOT EXISTS estado text,
  ADD COLUMN IF NOT EXISTS classe text NOT NULL DEFAULT 'Convencional',
  ADD COLUMN IF NOT EXISTS referencia_complementar text;

UPDATE public.produtos_staging
SET referencia_complementar = trim(sku_fornecedor)
WHERE referencia_complementar IS NULL
  AND length(trim(COALESCE(sku_fornecedor, ''))) > 0;

ALTER TABLE public.produtos_staging
  ALTER COLUMN sku_fornecedor DROP NOT NULL;

ALTER TABLE public.produtos_staging
  DROP CONSTRAINT IF EXISTS produtos_staging_sku_not_empty;

ALTER TABLE public.produtos_staging
  DROP CONSTRAINT IF EXISTS produtos_staging_estado_check;

ALTER TABLE public.produtos_staging
  ADD CONSTRAINT produtos_staging_estado_check
  CHECK (estado IS NULL OR estado IN ('MG', 'SP'));

ALTER TABLE public.produtos_staging
  DROP CONSTRAINT IF EXISTS produtos_staging_classe_check;

ALTER TABLE public.produtos_staging
  ADD CONSTRAINT produtos_staging_classe_check
  CHECK (classe IN ('Convencional', 'Especial'));

ALTER TABLE public.produtos_staging
  DROP COLUMN IF EXISTS cultura;

ALTER TABLE public.produtos_staging
  DROP COLUMN IF EXISTS descricao;

-- -----------------------------------------------------------------------------
-- 3. produtos_oficiais — novos campos; chave por fertilizante (nome)
-- -----------------------------------------------------------------------------
ALTER TABLE public.produtos_oficiais
  ADD COLUMN IF NOT EXISTS estado text,
  ADD COLUMN IF NOT EXISTS classe text NOT NULL DEFAULT 'Convencional',
  ADD COLUMN IF NOT EXISTS referencia_complementar text,
  ADD COLUMN IF NOT EXISTS desconto_usd numeric(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lote_id uuid REFERENCES public.lotes_importacao (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS vencimento_lista date;

UPDATE public.produtos_oficiais
SET referencia_complementar = trim(sku_fornecedor)
WHERE referencia_complementar IS NULL
  AND length(trim(COALESCE(sku_fornecedor, ''))) > 0;

ALTER TABLE public.produtos_oficiais
  DROP CONSTRAINT IF EXISTS produtos_oficiais_cultura_not_empty;

ALTER TABLE public.produtos_oficiais
  DROP CONSTRAINT IF EXISTS produtos_oficiais_estado_check;

ALTER TABLE public.produtos_oficiais
  ADD CONSTRAINT produtos_oficiais_estado_check
  CHECK (estado IS NULL OR estado IN ('MG', 'SP'));

ALTER TABLE public.produtos_oficiais
  DROP CONSTRAINT IF EXISTS produtos_oficiais_classe_check;

ALTER TABLE public.produtos_oficiais
  ADD CONSTRAINT produtos_oficiais_classe_check
  CHECK (classe IN ('Convencional', 'Especial'));

ALTER TABLE public.produtos_oficiais
  DROP CONSTRAINT IF EXISTS produtos_oficiais_desconto_non_negative;

ALTER TABLE public.produtos_oficiais
  ADD CONSTRAINT produtos_oficiais_desconto_non_negative
  CHECK (desconto_usd >= 0);

ALTER TABLE public.produtos_oficiais
  DROP COLUMN IF EXISTS cultura;

ALTER TABLE public.produtos_oficiais
  DROP COLUMN IF EXISTS descricao;

DROP INDEX IF EXISTS public.produtos_oficiais_cultura_quarter_idx;
DROP INDEX IF EXISTS public.produtos_oficiais_fornecedor_sku_unique_idx;

CREATE UNIQUE INDEX IF NOT EXISTS produtos_oficiais_fornecedor_nome_unique_idx
  ON public.produtos_oficiais (fornecedor_id, lower(trim(nome)));

CREATE INDEX IF NOT EXISTS produtos_oficiais_lote_id_idx
  ON public.produtos_oficiais (lote_id);

CREATE INDEX IF NOT EXISTS produtos_oficiais_estado_quarter_idx
  ON public.produtos_oficiais (estado, quarter);

-- Coluna gerada: Custo - ICMS (4% de desconto sobre custo R$)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'produtos_oficiais'
      AND column_name = 'custo_icms'
  ) THEN
    ALTER TABLE public.produtos_oficiais
      ADD COLUMN custo_icms numeric(14, 2)
      GENERATED ALWAYS AS (round((preco_interno_calculado * 0.96)::numeric, 2)) STORED;
  END IF;
END
$$;

-- -----------------------------------------------------------------------------
-- 4. histórico — snapshot com desconto
-- -----------------------------------------------------------------------------
ALTER TABLE public.produtos_oficiais_historico
  ADD COLUMN IF NOT EXISTS desconto_usd numeric(14, 2) NOT NULL DEFAULT 0;

-- -----------------------------------------------------------------------------
-- 5. Trigger: recálculo com desconto antes do câmbio
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_cotacoes_moeda_atualizar_precos_internos()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.produtos_oficiais po
  SET
    preco_interno_calculado = round(
      ((po.preco_original - po.desconto_usd) * NEW.taxa_conversao)::numeric,
      2
    ),
    updated_at = now()
  WHERE upper(trim(po.moeda_origem)) = upper(trim(NEW.moeda_origem))
    AND (po.preco_original - po.desconto_usd) >= 0;

  RETURN NEW;
END;
$$;

-- -----------------------------------------------------------------------------
-- 6. RPC: promover lote (match por fertilizante / nome)
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

  v_desconto := COALESCE(v_lote.desconto_usd, 0);

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
        OR (ps.preco_original - v_desconto) < 0
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
    v_preco_interno := round(((v_linha.preco_original - v_desconto) * v_taxa)::numeric, 2);

    SELECT po.id INTO v_produto_id
    FROM public.produtos_oficiais po
    WHERE po.fornecedor_id = v_lote.fornecedor_id
      AND lower(trim(po.nome)) = lower(trim(v_linha.nome))
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
        v_quarter,
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
        quarter = v_quarter,
        moeda_origem = v_moeda,
        preco_original = v_linha.preco_original,
        desconto_usd = v_desconto,
        preco_interno_calculado = v_preco_interno,
        lote_id = p_lote_id,
        vencimento_lista = v_lote.data_validade,
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
      desconto_usd,
      preco_interno_calculado,
      lote_id,
      criado_por
    ) VALUES (
      v_produto_id,
      v_quarter,
      v_moeda,
      v_linha.preco_original,
      v_desconto,
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
  'Promove staging para catálogo; match por fertilizante (nome); desconto USD antes do câmbio.';

-- -----------------------------------------------------------------------------
-- 7. RPC: inativar / reativar lista (sem auto-revert)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.inativar_lista_importacao(p_lote_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sessão inválida.';
  END IF;

  IF NOT public.is_gestor() THEN
    RAISE EXCEPTION 'Acesso negado.';
  END IF;

  UPDATE public.lotes_importacao
  SET ativo = false, updated_at = now()
  WHERE id = p_lote_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lote não encontrado.';
  END IF;

  UPDATE public.produtos_oficiais
  SET ativo = false, updated_at = now()
  WHERE lote_id = p_lote_id;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object('produtos_inativados', v_count);
END;
$$;

CREATE OR REPLACE FUNCTION public.reativar_lista_importacao(p_lote_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sessão inválida.';
  END IF;

  IF NOT public.is_gestor() THEN
    RAISE EXCEPTION 'Acesso negado.';
  END IF;

  UPDATE public.lotes_importacao
  SET ativo = true, updated_at = now()
  WHERE id = p_lote_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lote não encontrado.';
  END IF;

  UPDATE public.produtos_oficiais
  SET ativo = true, updated_at = now()
  WHERE lote_id = p_lote_id;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object('produtos_reativados', v_count);
END;
$$;

REVOKE ALL ON FUNCTION public.inativar_lista_importacao(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reativar_lista_importacao(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.inativar_lista_importacao(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reativar_lista_importacao(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- Cultura informada apenas na simulação (por linha)
ALTER TABLE public.simulation_items
  ADD COLUMN IF NOT EXISTS cultura text;
