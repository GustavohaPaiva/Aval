-- =============================================================================
-- Compras: ordens de compra, estoque (lotes) e lastro de vendas convertidas.
-- Acesso exclusivo de gestor. Local único "Estoque Syagri" (gancho p/ multi-local).
-- Volumes internos em kg (1 t = 1000 kg). Cada recebimento/ajuste vira um lote.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Tipos
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'compra_status'
  ) THEN
    CREATE TYPE public.compra_status AS ENUM (
      'rascunho',
      'enviado',
      'confirmado',
      'recebido_parcial',
      'recebido',
      'cancelado'
    );
  END IF;
END
$$;

-- -----------------------------------------------------------------------------
-- Sequência anual OC-YYYY-NNNN
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.compras_numero_seq (
  ano integer PRIMARY KEY,
  ultimo integer NOT NULL DEFAULT 0,
  CONSTRAINT compras_numero_seq_ano_check CHECK (ano >= 2000 AND ano <= 2100),
  CONSTRAINT compras_numero_seq_ultimo_check CHECK (ultimo >= 0)
);

ALTER TABLE public.compras_numero_seq ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.compras_numero_seq FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.compras_numero_seq TO authenticated;
GRANT ALL ON TABLE public.compras_numero_seq TO service_role;

CREATE POLICY "compras_numero_seq_gestor_all"
  ON public.compras_numero_seq
  FOR ALL
  TO authenticated
  USING (public.is_gestor())
  WITH CHECK (public.is_gestor());

-- -----------------------------------------------------------------------------
-- compras
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.compras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero text NOT NULL,
  fornecedor_id uuid NOT NULL REFERENCES public.fornecedores (id) ON DELETE RESTRICT,
  status public.compra_status NOT NULL DEFAULT 'rascunho'::public.compra_status,
  filial_site text NOT NULL DEFAULT 'uberaba',
  planta text,
  tipo_entrega text,
  cidade_retirada text NOT NULL DEFAULT 'Uberaba',
  condicao_pagamento text NOT NULL DEFAULT 'FAT. ANTECIPADO',
  data_documento date NOT NULL DEFAULT (CURRENT_DATE),
  observacoes text,
  pdf_gerado_em timestamptz,
  criado_por uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT compras_numero_not_empty CHECK (length(trim(numero)) > 0),
  CONSTRAINT compras_filial_site_check CHECK (
    filial_site IN ('nova-ponte', 'uberaba', 'ituverava', 'guaira', 'frutal')
  ),
  CONSTRAINT compras_tipo_entrega_check CHECK (
    tipo_entrega IS NULL OR tipo_entrega IN ('CIF', 'FOB')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS compras_numero_unique_idx
  ON public.compras (numero);

CREATE INDEX IF NOT EXISTS compras_fornecedor_id_idx
  ON public.compras (fornecedor_id);

CREATE INDEX IF NOT EXISTS compras_status_created_idx
  ON public.compras (status, created_at DESC);

CREATE INDEX IF NOT EXISTS compras_criado_por_idx
  ON public.compras (criado_por);

DROP TRIGGER IF EXISTS compras_set_updated_at ON public.compras;
CREATE TRIGGER compras_set_updated_at
  BEFORE UPDATE ON public.compras
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.compras IS
  'Ordens de compra ao fornecedor. Isoladas do pedido do cliente.';
COMMENT ON COLUMN public.compras.filial_site IS
  'Filial Syagri impressa no PDF. Padrão uberaba; gestor pode alterar.';
COMMENT ON COLUMN public.compras.cidade_retirada IS
  'Cidade de retirada/entrega no PDF. Padrão Uberaba.';

-- -----------------------------------------------------------------------------
-- compra_itens
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.compra_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  compra_id uuid NOT NULL REFERENCES public.compras (id) ON DELETE CASCADE,
  produto_oficial_id uuid NOT NULL REFERENCES public.produtos_oficiais (id) ON DELETE RESTRICT,
  embalagem text NOT NULL DEFAULT 'BIG BAG',
  volume_kg numeric(14, 4) NOT NULL,
  volume_recebido_kg numeric(14, 4) NOT NULL DEFAULT 0,
  unidade_exibicao text NOT NULL DEFAULT 't',
  cultura text,
  origem text,
  preco_usd numeric(14, 4),
  desconto_usd numeric(14, 4),
  vencimento_lista date,
  pagamento_syagri date,
  preco_corrigido numeric(14, 4),
  juros numeric(14, 4),
  unitario_brl numeric(14, 4),
  frete numeric(14, 4),
  total numeric(14, 4),
  ordem integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT compra_itens_volume_positive CHECK (volume_kg > 0),
  CONSTRAINT compra_itens_recebido_range CHECK (
    volume_recebido_kg >= 0 AND volume_recebido_kg <= volume_kg
  ),
  CONSTRAINT compra_itens_unidade_check CHECK (unidade_exibicao IN ('t', 'kg')),
  CONSTRAINT compra_itens_embalagem_not_empty CHECK (length(trim(embalagem)) > 0)
);

CREATE INDEX IF NOT EXISTS compra_itens_compra_id_idx
  ON public.compra_itens (compra_id, ordem, created_at);

CREATE INDEX IF NOT EXISTS compra_itens_produto_oficial_id_idx
  ON public.compra_itens (produto_oficial_id);

DROP TRIGGER IF EXISTS compra_itens_set_updated_at ON public.compra_itens;
CREATE TRIGGER compra_itens_set_updated_at
  BEFORE UPDATE ON public.compra_itens
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.compra_itens IS
  'Linhas da OC. volume_kg é a quantidade pedida ao fornecedor (interno em kg).';
COMMENT ON COLUMN public.compra_itens.preco_usd IS 'Preço USD enviado no PDF ao fornecedor.';
COMMENT ON COLUMN public.compra_itens.unitario_brl IS 'Custo interno; não vai no PDF.';

-- -----------------------------------------------------------------------------
-- estoque_lotes
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.estoque_lotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_oficial_id uuid NOT NULL REFERENCES public.produtos_oficiais (id) ON DELETE RESTRICT,
  embalagem text NOT NULL DEFAULT 'BIG BAG',
  local text NOT NULL DEFAULT 'Estoque Syagri',
  origem_tipo text NOT NULL,
  compra_item_id uuid REFERENCES public.compra_itens (id) ON DELETE RESTRICT,
  quantidade_kg numeric(14, 4) NOT NULL,
  reservado_kg numeric(14, 4) NOT NULL DEFAULT 0,
  custo_usd_liquido numeric(14, 4),
  custo_unitario_brl numeric(14, 4),
  observacao text,
  criado_por uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT estoque_lotes_origem_check CHECK (origem_tipo IN ('compra', 'ajuste')),
  CONSTRAINT estoque_lotes_quantidade_check CHECK (quantidade_kg >= 0),
  CONSTRAINT estoque_lotes_reservado_check CHECK (
    reservado_kg >= 0 AND reservado_kg <= quantidade_kg
  ),
  CONSTRAINT estoque_lotes_embalagem_not_empty CHECK (length(trim(embalagem)) > 0),
  CONSTRAINT estoque_lotes_local_not_empty CHECK (length(trim(local)) > 0),
  CONSTRAINT estoque_lotes_compra_origem_check CHECK (
    (origem_tipo = 'compra' AND compra_item_id IS NOT NULL)
    OR (origem_tipo = 'ajuste' AND compra_item_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS estoque_lotes_produto_idx
  ON public.estoque_lotes (produto_oficial_id, created_at DESC);

CREATE INDEX IF NOT EXISTS estoque_lotes_compra_item_idx
  ON public.estoque_lotes (compra_item_id)
  WHERE compra_item_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS estoque_lotes_disponivel_idx
  ON public.estoque_lotes (produto_oficial_id)
  WHERE (quantidade_kg - reservado_kg) > 0;

DROP TRIGGER IF EXISTS estoque_lotes_set_updated_at ON public.estoque_lotes;
CREATE TRIGGER estoque_lotes_set_updated_at
  BEFORE UPDATE ON public.estoque_lotes
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.estoque_lotes IS
  'Lotes físicos. Nunca mescla: cada recebimento/ajuste é um lote. local padrão Estoque Syagri (multi-local no futuro).';
COMMENT ON COLUMN public.estoque_lotes.local IS
  'Depósito. V1 = Estoque Syagri; coluna já existe para troca futura.';

-- -----------------------------------------------------------------------------
-- alocacoes (lastro venda ↔ estoque ou OC)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.alocacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  simulation_item_id uuid NOT NULL REFERENCES public.simulation_items (id) ON DELETE RESTRICT,
  quantidade_kg numeric(14, 4) NOT NULL,
  origem_tipo text NOT NULL,
  estoque_lote_id uuid REFERENCES public.estoque_lotes (id) ON DELETE RESTRICT,
  compra_item_id uuid REFERENCES public.compra_itens (id) ON DELETE RESTRICT,
  criado_por uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT alocacoes_quantidade_positive CHECK (quantidade_kg > 0),
  CONSTRAINT alocacoes_origem_check CHECK (origem_tipo IN ('estoque', 'compra')),
  CONSTRAINT alocacoes_origem_fk_check CHECK (
    (origem_tipo = 'estoque' AND estoque_lote_id IS NOT NULL)
    OR (origem_tipo = 'compra' AND compra_item_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS alocacoes_simulation_item_idx
  ON public.alocacoes (simulation_item_id);

CREATE INDEX IF NOT EXISTS alocacoes_estoque_lote_idx
  ON public.alocacoes (estoque_lote_id)
  WHERE estoque_lote_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS alocacoes_compra_item_idx
  ON public.alocacoes (compra_item_id)
  WHERE compra_item_id IS NOT NULL;

COMMENT ON TABLE public.alocacoes IS
  'Lastro de linha de venda convertida em lote de estoque ou item de OC. Cancelar a venda não mexe aqui.';

-- -----------------------------------------------------------------------------
-- estoque_movimentos
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.estoque_movimentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estoque_lote_id uuid NOT NULL REFERENCES public.estoque_lotes (id) ON DELETE RESTRICT,
  tipo text NOT NULL,
  quantidade_kg numeric(14, 4) NOT NULL,
  observacao text,
  criado_por uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT estoque_movimentos_tipo_check CHECK (
    tipo IN ('entrada_compra', 'entrada_ajuste', 'saida_ajuste')
  ),
  CONSTRAINT estoque_movimentos_quantidade_positive CHECK (quantidade_kg > 0)
);

CREATE INDEX IF NOT EXISTS estoque_movimentos_lote_idx
  ON public.estoque_movimentos (estoque_lote_id, created_at DESC);

COMMENT ON TABLE public.estoque_movimentos IS
  'Auditoria de entradas de OC e lançamentos avulsos de estoque.';

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
ALTER TABLE public.compras ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compra_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.estoque_lotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alocacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.estoque_movimentos ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.compras FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.compra_itens FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.estoque_lotes FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.alocacoes FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.estoque_movimentos FROM PUBLIC, anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.compras TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.compra_itens TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.estoque_lotes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.alocacoes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.estoque_movimentos TO authenticated;

GRANT ALL ON TABLE public.compras TO service_role;
GRANT ALL ON TABLE public.compra_itens TO service_role;
GRANT ALL ON TABLE public.estoque_lotes TO service_role;
GRANT ALL ON TABLE public.alocacoes TO service_role;
GRANT ALL ON TABLE public.estoque_movimentos TO service_role;

CREATE POLICY "compras_gestor_all"
  ON public.compras FOR ALL TO authenticated
  USING (public.is_gestor())
  WITH CHECK (public.is_gestor());

CREATE POLICY "compra_itens_gestor_all"
  ON public.compra_itens FOR ALL TO authenticated
  USING (public.is_gestor())
  WITH CHECK (public.is_gestor());

CREATE POLICY "estoque_lotes_gestor_all"
  ON public.estoque_lotes FOR ALL TO authenticated
  USING (public.is_gestor())
  WITH CHECK (public.is_gestor());

CREATE POLICY "alocacoes_gestor_all"
  ON public.alocacoes FOR ALL TO authenticated
  USING (public.is_gestor())
  WITH CHECK (public.is_gestor());

CREATE POLICY "estoque_movimentos_gestor_all"
  ON public.estoque_movimentos FOR ALL TO authenticated
  USING (public.is_gestor())
  WITH CHECK (public.is_gestor());

-- -----------------------------------------------------------------------------
-- Funções auxiliares
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.compras_assert_gestor()
RETURNS void
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_gestor() THEN
    RAISE EXCEPTION 'Apenas gestores podem gerenciar compras.';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.compras_assert_gestor() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.compras_assert_gestor() TO authenticated;

CREATE OR REPLACE FUNCTION public.compras_status_apos_edicao(p_pdf_gerado_em timestamptz)
RETURNS public.compra_status
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_pdf_gerado_em IS NULL THEN 'rascunho'::public.compra_status
    ELSE 'enviado'::public.compra_status
  END;
$$;

REVOKE ALL ON FUNCTION public.compras_status_apos_edicao(timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.compras_status_apos_edicao(timestamptz) TO authenticated;

CREATE OR REPLACE FUNCTION public.compras_refresh_receive_status(p_compra_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status public.compra_status;
  v_any_received boolean;
  v_all_received boolean;
  v_has_items boolean;
BEGIN
  SELECT status INTO v_status FROM public.compras WHERE id = p_compra_id FOR UPDATE;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Ordem de compra não encontrada.';
  END IF;
  IF v_status = 'cancelado'::public.compra_status THEN
    RETURN;
  END IF;

  SELECT
    COUNT(*) > 0,
    COALESCE(bool_or(ci.volume_recebido_kg > 0), false),
    CASE
      WHEN COUNT(*) = 0 THEN false
      ELSE COALESCE(bool_and(ci.volume_recebido_kg >= ci.volume_kg), false)
    END
  INTO v_has_items, v_any_received, v_all_received
  FROM public.compra_itens ci
  WHERE ci.compra_id = p_compra_id;

  IF NOT v_has_items OR NOT v_any_received THEN
    RETURN;
  END IF;

  UPDATE public.compras
  SET status = CASE
    WHEN v_all_received THEN 'recebido'::public.compra_status
    ELSE 'recebido_parcial'::public.compra_status
  END
  WHERE id = p_compra_id;
END;
$$;

REVOKE ALL ON FUNCTION public.compras_refresh_receive_status(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.compras_refresh_receive_status(uuid) TO postgres, service_role;

CREATE OR REPLACE FUNCTION public.compras_marcar_editada(p_compra_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.compras%ROWTYPE;
BEGIN
  PERFORM public.compras_assert_gestor();
  SELECT * INTO v_row FROM public.compras WHERE id = p_compra_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  IF v_row.status IN (
    'confirmado'::public.compra_status,
    'recebido_parcial'::public.compra_status,
    'recebido'::public.compra_status
  ) THEN
    UPDATE public.compras
    SET status = public.compras_status_apos_edicao(v_row.pdf_gerado_em)
    WHERE id = p_compra_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.compras_marcar_editada(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.compras_marcar_editada(uuid) TO authenticated;

-- Triggers: edição rebaixa status; item deve ser do mesmo fornecedor da OC.
CREATE OR REPLACE FUNCTION public.trg_compras_on_edit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status
      AND (
        NEW.filial_site IS NOT DISTINCT FROM OLD.filial_site
        AND NEW.planta IS NOT DISTINCT FROM OLD.planta
        AND NEW.tipo_entrega IS NOT DISTINCT FROM OLD.tipo_entrega
        AND NEW.cidade_retirada IS NOT DISTINCT FROM OLD.cidade_retirada
        AND NEW.condicao_pagamento IS NOT DISTINCT FROM OLD.condicao_pagamento
        AND NEW.data_documento IS NOT DISTINCT FROM OLD.data_documento
        AND NEW.observacoes IS NOT DISTINCT FROM OLD.observacoes
        AND NEW.fornecedor_id IS NOT DISTINCT FROM OLD.fornecedor_id
      ) THEN
      RETURN NEW;
    END IF;

    IF OLD.status = 'cancelado'::public.compra_status THEN
      RAISE EXCEPTION 'Ordem de compra cancelada não pode ser editada.';
    END IF;

    IF NEW.filial_site IS DISTINCT FROM OLD.filial_site
      OR NEW.planta IS DISTINCT FROM OLD.planta
      OR NEW.tipo_entrega IS DISTINCT FROM OLD.tipo_entrega
      OR NEW.cidade_retirada IS DISTINCT FROM OLD.cidade_retirada
      OR NEW.condicao_pagamento IS DISTINCT FROM OLD.condicao_pagamento
      OR NEW.data_documento IS DISTINCT FROM OLD.data_documento
      OR NEW.observacoes IS DISTINCT FROM OLD.observacoes
      OR NEW.fornecedor_id IS DISTINCT FROM OLD.fornecedor_id
    THEN
      IF OLD.status IN (
        'confirmado'::public.compra_status,
        'recebido_parcial'::public.compra_status,
        'recebido'::public.compra_status
      ) THEN
        NEW.status := public.compras_status_apos_edicao(NEW.pdf_gerado_em);
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS compras_on_edit ON public.compras;
CREATE TRIGGER compras_on_edit
  BEFORE UPDATE ON public.compras
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_compras_on_edit();

CREATE OR REPLACE FUNCTION public.trg_compra_itens_validate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_compra public.compras%ROWTYPE;
  v_fornecedor uuid;
  v_receive_only boolean;
BEGIN
  SELECT * INTO v_compra FROM public.compras WHERE id = NEW.compra_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ordem de compra não encontrada.';
  END IF;
  IF v_compra.status = 'cancelado'::public.compra_status AND TG_OP IN ('INSERT', 'UPDATE') THEN
    RAISE EXCEPTION 'Ordem de compra cancelada não pode ser editada.';
  END IF;

  SELECT po.fornecedor_id INTO v_fornecedor
  FROM public.produtos_oficiais po
  WHERE po.id = NEW.produto_oficial_id;
  IF v_fornecedor IS NULL THEN
    RAISE EXCEPTION 'Produto oficial não encontrado.';
  END IF;
  IF v_fornecedor IS DISTINCT FROM v_compra.fornecedor_id THEN
    RAISE EXCEPTION 'O produto precisa ser do mesmo fornecedor da ordem de compra.';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    v_receive_only :=
      NEW.volume_recebido_kg IS DISTINCT FROM OLD.volume_recebido_kg
      AND NEW.volume_kg IS NOT DISTINCT FROM OLD.volume_kg
      AND NEW.produto_oficial_id IS NOT DISTINCT FROM OLD.produto_oficial_id
      AND NEW.embalagem IS NOT DISTINCT FROM OLD.embalagem
      AND NEW.unidade_exibicao IS NOT DISTINCT FROM OLD.unidade_exibicao
      AND NEW.cultura IS NOT DISTINCT FROM OLD.cultura
      AND NEW.origem IS NOT DISTINCT FROM OLD.origem
      AND NEW.preco_usd IS NOT DISTINCT FROM OLD.preco_usd
      AND NEW.desconto_usd IS NOT DISTINCT FROM OLD.desconto_usd
      AND NEW.vencimento_lista IS NOT DISTINCT FROM OLD.vencimento_lista
      AND NEW.pagamento_syagri IS NOT DISTINCT FROM OLD.pagamento_syagri
      AND NEW.preco_corrigido IS NOT DISTINCT FROM OLD.preco_corrigido
      AND NEW.juros IS NOT DISTINCT FROM OLD.juros
      AND NEW.unitario_brl IS NOT DISTINCT FROM OLD.unitario_brl
      AND NEW.frete IS NOT DISTINCT FROM OLD.frete
      AND NEW.total IS NOT DISTINCT FROM OLD.total;

    IF NOT v_receive_only THEN
      PERFORM public.compras_marcar_editada(NEW.compra_id);
    END IF;
  ELSIF TG_OP = 'INSERT' THEN
    PERFORM public.compras_marcar_editada(NEW.compra_id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS compra_itens_validate ON public.compra_itens;
CREATE TRIGGER compra_itens_validate
  BEFORE INSERT OR UPDATE ON public.compra_itens
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_compra_itens_validate();

CREATE OR REPLACE FUNCTION public.trg_compra_itens_before_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.volume_recebido_kg > 0 THEN
    RAISE EXCEPTION 'Não é possível remover um item que já teve recebimento.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.alocacoes a WHERE a.compra_item_id = OLD.id) THEN
    RAISE EXCEPTION 'Não é possível remover um item com vínculo. Desvincule antes.';
  END IF;
  PERFORM public.compras_marcar_editada(OLD.compra_id);
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS compra_itens_before_delete ON public.compra_itens;
CREATE TRIGGER compra_itens_before_delete
  BEFORE DELETE ON public.compra_itens
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_compra_itens_before_delete();

-- -----------------------------------------------------------------------------
-- RPCs
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.compras_proximo_numero()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ano integer := EXTRACT(YEAR FROM now())::integer;
  v_seq integer;
BEGIN
  PERFORM public.compras_assert_gestor();

  INSERT INTO public.compras_numero_seq (ano, ultimo)
  VALUES (v_ano, 1)
  ON CONFLICT (ano) DO UPDATE
    SET ultimo = public.compras_numero_seq.ultimo + 1
  RETURNING ultimo INTO v_seq;

  RETURN 'OC-' || v_ano::text || '-' || lpad(v_seq::text, 4, '0');
END;
$$;

REVOKE ALL ON FUNCTION public.compras_proximo_numero() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.compras_proximo_numero() TO postgres, service_role;

CREATE OR REPLACE FUNCTION public.compras_criar(p_fornecedor_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_numero text;
BEGIN
  PERFORM public.compras_assert_gestor();
  IF p_fornecedor_id IS NULL THEN
    RAISE EXCEPTION 'Fornecedor é obrigatório.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.fornecedores f WHERE f.id = p_fornecedor_id AND f.ativo
  ) THEN
    RAISE EXCEPTION 'Fornecedor inválido ou inativo.';
  END IF;

  v_numero := public.compras_proximo_numero();

  INSERT INTO public.compras (
    numero, fornecedor_id, filial_site, cidade_retirada, condicao_pagamento, criado_por
  ) VALUES (
    v_numero, p_fornecedor_id, 'uberaba', 'Uberaba', 'FAT. ANTECIPADO', (SELECT auth.uid())
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.compras_criar(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.compras_criar(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.compras_confirmar(p_compra_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status public.compra_status;
BEGIN
  PERFORM public.compras_assert_gestor();
  SELECT status INTO v_status FROM public.compras WHERE id = p_compra_id FOR UPDATE;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Ordem de compra não encontrada.';
  END IF;
  IF v_status = 'cancelado'::public.compra_status THEN
    RAISE EXCEPTION 'Ordem cancelada não pode ser confirmada.';
  END IF;
  IF v_status IN (
    'recebido'::public.compra_status,
    'recebido_parcial'::public.compra_status
  ) THEN
    RAISE EXCEPTION 'Ordem já possui recebimento.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.compra_itens WHERE compra_id = p_compra_id) THEN
    RAISE EXCEPTION 'Inclua ao menos um item antes de confirmar.';
  END IF;
  UPDATE public.compras
  SET status = 'confirmado'::public.compra_status
  WHERE id = p_compra_id;
END;
$$;

REVOKE ALL ON FUNCTION public.compras_confirmar(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.compras_confirmar(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.compras_marcar_pdf_gerado(p_compra_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status public.compra_status;
BEGIN
  PERFORM public.compras_assert_gestor();
  SELECT status INTO v_status FROM public.compras WHERE id = p_compra_id FOR UPDATE;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Ordem de compra não encontrada.';
  END IF;
  IF v_status = 'cancelado'::public.compra_status THEN
    RAISE EXCEPTION 'Ordem cancelada.';
  END IF;
  UPDATE public.compras
  SET
    pdf_gerado_em = COALESCE(pdf_gerado_em, now()),
    status = CASE
      WHEN status = 'rascunho'::public.compra_status THEN 'enviado'::public.compra_status
      ELSE status
    END
  WHERE id = p_compra_id;
END;
$$;

REVOKE ALL ON FUNCTION public.compras_marcar_pdf_gerado(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.compras_marcar_pdf_gerado(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.compras_cancelar(p_compra_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status public.compra_status;
BEGIN
  PERFORM public.compras_assert_gestor();
  SELECT status INTO v_status FROM public.compras WHERE id = p_compra_id FOR UPDATE;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Ordem de compra não encontrada.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.compra_itens ci
    WHERE ci.compra_id = p_compra_id AND ci.volume_recebido_kg > 0
  ) THEN
    RAISE EXCEPTION 'Não é possível cancelar uma OC com recebimento. Trate o saldo na mão.';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.alocacoes a
    JOIN public.compra_itens ci ON ci.id = a.compra_item_id
    WHERE ci.compra_id = p_compra_id
  ) THEN
    RAISE EXCEPTION 'Desvincule as linhas desta OC antes de cancelar.';
  END IF;
  UPDATE public.compras
  SET status = 'cancelado'::public.compra_status
  WHERE id = p_compra_id;
END;
$$;

REVOKE ALL ON FUNCTION public.compras_cancelar(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.compras_cancelar(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.compras_alocar(
  p_simulation_item_id uuid,
  p_quantidade_kg numeric,
  p_estoque_lote_id uuid DEFAULT NULL,
  p_compra_item_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item public.simulation_items%ROWTYPE;
  v_sim public.simulations%ROWTYPE;
  v_vendido_kg numeric(14, 4);
  v_lastreado_kg numeric(14, 4);
  v_origem text;
  v_lote public.estoque_lotes%ROWTYPE;
  v_ci public.compra_itens%ROWTYPE;
  v_compra public.compras%ROWTYPE;
  v_produto_fornecedor uuid;
  v_alocado_item numeric(14, 4);
  v_id uuid;
BEGIN
  PERFORM public.compras_assert_gestor();

  IF p_quantidade_kg IS NULL OR p_quantidade_kg <= 0 THEN
    RAISE EXCEPTION 'Quantidade deve ser maior que zero.';
  END IF;
  IF (p_estoque_lote_id IS NULL) = (p_compra_item_id IS NULL) THEN
    RAISE EXCEPTION 'Informe lote de estoque ou item de OC, não os dois.';
  END IF;

  SELECT * INTO v_item FROM public.simulation_items WHERE id = p_simulation_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Linha de venda não encontrada.';
  END IF;
  SELECT * INTO v_sim FROM public.simulations WHERE id = v_item.simulation_id FOR UPDATE;
  IF v_sim.status IS DISTINCT FROM 'converted'::public.simulation_status THEN
    RAISE EXCEPTION 'Só é possível vincular pedido convertido.';
  END IF;
  IF v_sim.ativo IS FALSE THEN
    RAISE EXCEPTION 'Pedido inativo.';
  END IF;

  v_vendido_kg := round((v_item.volume * 1000)::numeric, 4);
  SELECT COALESCE(SUM(a.quantidade_kg), 0) INTO v_lastreado_kg
  FROM public.alocacoes a
  WHERE a.simulation_item_id = v_item.id;

  IF v_lastreado_kg + p_quantidade_kg > v_vendido_kg + 0.0001 THEN
    RAISE EXCEPTION 'Quantidade excede o volume vendido ainda sem vínculo.';
  END IF;

  SELECT po.fornecedor_id INTO v_produto_fornecedor
  FROM public.produtos_oficiais po
  WHERE po.id = v_item.product_id;

  IF p_estoque_lote_id IS NOT NULL THEN
    v_origem := 'estoque';
    SELECT * INTO v_lote FROM public.estoque_lotes WHERE id = p_estoque_lote_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Lote de estoque não encontrado.';
    END IF;
    IF v_lote.produto_oficial_id IS DISTINCT FROM v_item.product_id THEN
      RAISE EXCEPTION 'O lote não é do mesmo produto da venda.';
    END IF;
    IF (v_lote.quantidade_kg - v_lote.reservado_kg) < p_quantidade_kg THEN
      RAISE EXCEPTION 'Estoque disponível insuficiente neste lote.';
    END IF;
    UPDATE public.estoque_lotes
    SET reservado_kg = reservado_kg + p_quantidade_kg
    WHERE id = v_lote.id;
  ELSE
    v_origem := 'compra';
    SELECT * INTO v_ci FROM public.compra_itens WHERE id = p_compra_item_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Item da ordem de compra não encontrado.';
    END IF;
    SELECT * INTO v_compra FROM public.compras WHERE id = v_ci.compra_id FOR UPDATE;
    IF v_compra.status = 'cancelado'::public.compra_status THEN
      RAISE EXCEPTION 'Não é possível vincular em OC cancelada.';
    END IF;
    IF v_ci.produto_oficial_id IS DISTINCT FROM v_item.product_id THEN
      RAISE EXCEPTION 'O item da OC não é do mesmo produto da venda.';
    END IF;
    IF v_produto_fornecedor IS DISTINCT FROM v_compra.fornecedor_id THEN
      RAISE EXCEPTION 'Fornecedor da OC não confere com o produto vendido.';
    END IF;
    SELECT COALESCE(SUM(a.quantidade_kg), 0) INTO v_alocado_item
    FROM public.alocacoes a
    WHERE a.compra_item_id = v_ci.id AND a.origem_tipo = 'compra';
    IF v_alocado_item + p_quantidade_kg > v_ci.volume_kg + 0.0001 THEN
      RAISE EXCEPTION 'Vínculo excede o volume desta linha da OC.';
    END IF;
  END IF;

  INSERT INTO public.alocacoes (
    simulation_item_id, quantidade_kg, origem_tipo, estoque_lote_id, compra_item_id, criado_por
  ) VALUES (
    v_item.id,
    p_quantidade_kg,
    v_origem,
    p_estoque_lote_id,
    p_compra_item_id,
    (SELECT auth.uid())
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.compras_alocar(uuid, numeric, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.compras_alocar(uuid, numeric, uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.compras_desalocar(p_alocacao_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_a public.alocacoes%ROWTYPE;
BEGIN
  PERFORM public.compras_assert_gestor();
  SELECT * INTO v_a FROM public.alocacoes WHERE id = p_alocacao_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vínculo não encontrado.';
  END IF;

  IF v_a.origem_tipo = 'estoque' AND v_a.estoque_lote_id IS NOT NULL THEN
    UPDATE public.estoque_lotes
    SET reservado_kg = GREATEST(0, reservado_kg - v_a.quantidade_kg)
    WHERE id = v_a.estoque_lote_id;
  END IF;

  DELETE FROM public.alocacoes WHERE id = v_a.id;
END;
$$;

REVOKE ALL ON FUNCTION public.compras_desalocar(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.compras_desalocar(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.compras_receber(
  p_compra_item_id uuid,
  p_quantidade_kg numeric
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ci public.compra_itens%ROWTYPE;
  v_compra public.compras%ROWTYPE;
  v_lote_id uuid;
  v_usd numeric(14, 4);
  v_pendente numeric(14, 4);
  v_reservar numeric(14, 4);
  r record;
  v_split numeric(14, 4);
BEGIN
  PERFORM public.compras_assert_gestor();
  IF p_quantidade_kg IS NULL OR p_quantidade_kg <= 0 THEN
    RAISE EXCEPTION 'Quantidade recebida deve ser maior que zero.';
  END IF;

  SELECT * INTO v_ci FROM public.compra_itens WHERE id = p_compra_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item da OC não encontrado.';
  END IF;
  SELECT * INTO v_compra FROM public.compras WHERE id = v_ci.compra_id FOR UPDATE;
  IF v_compra.status = 'cancelado'::public.compra_status THEN
    RAISE EXCEPTION 'OC cancelada.';
  END IF;
  IF v_ci.volume_recebido_kg + p_quantidade_kg > v_ci.volume_kg + 0.0001 THEN
    RAISE EXCEPTION 'Recebimento excede o volume pedido nesta linha.';
  END IF;

  v_usd := NULLIF(COALESCE(v_ci.preco_usd, 0) - COALESCE(v_ci.desconto_usd, 0), 0);

  INSERT INTO public.estoque_lotes (
    produto_oficial_id, embalagem, local, origem_tipo, compra_item_id,
    quantidade_kg, reservado_kg, custo_usd_liquido, custo_unitario_brl, criado_por
  ) VALUES (
    v_ci.produto_oficial_id,
    v_ci.embalagem,
    'Estoque Syagri',
    'compra',
    v_ci.id,
    p_quantidade_kg,
    0,
    v_usd,
    v_ci.unitario_brl,
    (SELECT auth.uid())
  )
  RETURNING id INTO v_lote_id;

  INSERT INTO public.estoque_movimentos (
    estoque_lote_id, tipo, quantidade_kg, criado_por
  ) VALUES (
    v_lote_id, 'entrada_compra', p_quantidade_kg, (SELECT auth.uid())
  );

  UPDATE public.compra_itens
  SET volume_recebido_kg = volume_recebido_kg + p_quantidade_kg
  WHERE id = v_ci.id;

  v_pendente := p_quantidade_kg;
  FOR r IN
    SELECT a.*
    FROM public.alocacoes a
    WHERE a.compra_item_id = v_ci.id
      AND a.origem_tipo = 'compra'
      AND a.estoque_lote_id IS NULL
    ORDER BY a.created_at
    FOR UPDATE
  LOOP
    EXIT WHEN v_pendente <= 0;
    IF r.quantidade_kg <= v_pendente + 0.0001 THEN
      UPDATE public.alocacoes
      SET origem_tipo = 'estoque', estoque_lote_id = v_lote_id
      WHERE id = r.id;
      v_reservar := r.quantidade_kg;
      v_pendente := v_pendente - r.quantidade_kg;
    ELSE
      v_split := v_pendente;
      UPDATE public.alocacoes
      SET quantidade_kg = quantidade_kg - v_split
      WHERE id = r.id;
      INSERT INTO public.alocacoes (
        simulation_item_id, quantidade_kg, origem_tipo, estoque_lote_id, compra_item_id, criado_por
      ) VALUES (
        r.simulation_item_id, v_split, 'estoque', v_lote_id, v_ci.id, r.criado_por
      );
      v_reservar := v_split;
      v_pendente := 0;
    END IF;

    UPDATE public.estoque_lotes
    SET reservado_kg = reservado_kg + v_reservar
    WHERE id = v_lote_id;
  END LOOP;

  PERFORM public.compras_refresh_receive_status(v_ci.compra_id);
  RETURN v_lote_id;
END;
$$;

REVOKE ALL ON FUNCTION public.compras_receber(uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.compras_receber(uuid, numeric) TO authenticated;

CREATE OR REPLACE FUNCTION public.compras_ajuste_entrada(
  p_produto_oficial_id uuid,
  p_embalagem text,
  p_quantidade_kg numeric,
  p_custo_usd_liquido numeric DEFAULT NULL,
  p_custo_unitario_brl numeric DEFAULT NULL,
  p_observacao text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_embalagem text := NULLIF(trim(p_embalagem), '');
BEGIN
  PERFORM public.compras_assert_gestor();
  IF p_produto_oficial_id IS NULL THEN
    RAISE EXCEPTION 'Produto é obrigatório.';
  END IF;
  IF p_quantidade_kg IS NULL OR p_quantidade_kg <= 0 THEN
    RAISE EXCEPTION 'Quantidade deve ser maior que zero.';
  END IF;
  IF v_embalagem IS NULL THEN
    v_embalagem := 'BIG BAG';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.produtos_oficiais po WHERE po.id = p_produto_oficial_id) THEN
    RAISE EXCEPTION 'Produto oficial não encontrado.';
  END IF;

  INSERT INTO public.estoque_lotes (
    produto_oficial_id, embalagem, local, origem_tipo,
    quantidade_kg, reservado_kg, custo_usd_liquido, custo_unitario_brl,
    observacao, criado_por
  ) VALUES (
    p_produto_oficial_id, v_embalagem, 'Estoque Syagri', 'ajuste',
    p_quantidade_kg, 0, p_custo_usd_liquido, p_custo_unitario_brl,
    NULLIF(trim(p_observacao), ''), (SELECT auth.uid())
  )
  RETURNING id INTO v_id;

  INSERT INTO public.estoque_movimentos (
    estoque_lote_id, tipo, quantidade_kg, observacao, criado_por
  ) VALUES (
    v_id, 'entrada_ajuste', p_quantidade_kg, NULLIF(trim(p_observacao), ''), (SELECT auth.uid())
  );

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.compras_ajuste_entrada(uuid, text, numeric, numeric, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.compras_ajuste_entrada(uuid, text, numeric, numeric, numeric, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.compras_ajuste_saida(
  p_estoque_lote_id uuid,
  p_quantidade_kg numeric,
  p_observacao text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lote public.estoque_lotes%ROWTYPE;
  v_disp numeric(14, 4);
BEGIN
  PERFORM public.compras_assert_gestor();
  IF p_quantidade_kg IS NULL OR p_quantidade_kg <= 0 THEN
    RAISE EXCEPTION 'Quantidade deve ser maior que zero.';
  END IF;
  SELECT * INTO v_lote FROM public.estoque_lotes WHERE id = p_estoque_lote_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lote não encontrado.';
  END IF;
  v_disp := v_lote.quantidade_kg - v_lote.reservado_kg;
  IF p_quantidade_kg > v_disp + 0.0001 THEN
    RAISE EXCEPTION 'Saída maior que o disponível deste lote (já descontando reservas).';
  END IF;

  UPDATE public.estoque_lotes
  SET quantidade_kg = quantidade_kg - p_quantidade_kg
  WHERE id = v_lote.id;

  INSERT INTO public.estoque_movimentos (
    estoque_lote_id, tipo, quantidade_kg, observacao, criado_por
  ) VALUES (
    v_lote.id, 'saida_ajuste', p_quantidade_kg, NULLIF(trim(p_observacao), ''), (SELECT auth.uid())
  );
END;
$$;

REVOKE ALL ON FUNCTION public.compras_ajuste_saida(uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.compras_ajuste_saida(uuid, numeric, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
