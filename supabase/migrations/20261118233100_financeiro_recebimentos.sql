-- =============================================================================
-- Financeiro: títulos, recebimentos, renegociação e acesso do papel
-- Não há parcelas nem títulos no schema anterior. O vencimento do cliente
-- continua em simulations.data_pagamento e o valor negociado em total_proposta.
-- =============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS ativo boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.profiles.ativo IS
  'Acesso do perfil. Desativado bloqueia o papel financeiro sem apagar o histórico.';

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_financeiro()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = (SELECT auth.uid())
      AND p.role = 'financeiro'::public.user_role
      AND p.ativo IS TRUE
  );
$$;

REVOKE ALL ON FUNCTION public.is_financeiro() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_financeiro() TO authenticated;

COMMENT ON FUNCTION public.is_financeiro() IS
  'True se auth.uid() for financeiro ativo. Papel desativado não opera.';

CREATE OR REPLACE FUNCTION public.profiles_bloquear_escalada()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (SELECT auth.uid()) IS NOT NULL AND NOT public.is_gestor() THEN
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      RAISE EXCEPTION 'Somente o gestor pode alterar o perfil de acesso';
    END IF;
    IF NEW.ativo IS DISTINCT FROM OLD.ativo THEN
      RAISE EXCEPTION 'Somente o gestor pode alterar a situação do acesso';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_bloquear_escalada_trg ON public.profiles;
CREATE TRIGGER profiles_bloquear_escalada_trg
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.profiles_bloquear_escalada();

-- -----------------------------------------------------------------------------
-- Classificação (pagamento separado do vencimento)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.financeiro_classificar(
  p_valor_devido numeric,
  p_valor_recebido numeric,
  p_vencimento date,
  p_hoje date,
  p_dias_proximo integer DEFAULT 7
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_devido numeric := round(COALESCE(p_valor_devido, 0), 2);
  v_recebido numeric := round(COALESCE(p_valor_recebido, 0), 2);
  v_saldo numeric;
  v_quitado boolean;
  v_pagamento text;
  v_vencimento text;
BEGIN
  IF v_recebido < 0 THEN
    v_recebido := 0;
  END IF;
  v_saldo := round(v_devido - v_recebido, 2);
  v_quitado := v_saldo <= 0;

  IF v_quitado THEN
    v_pagamento := 'quitado';
    v_vencimento := 'quitado';
  ELSIF v_recebido > 0 THEN
    v_pagamento := 'parcial';
  ELSE
    v_pagamento := 'pendente';
  END IF;

  IF NOT v_quitado THEN
    IF p_vencimento IS NULL THEN
      v_vencimento := 'sem_data';
    ELSIF p_vencimento < p_hoje THEN
      v_vencimento := 'atrasado';
    ELSIF p_vencimento <= (p_hoje + COALESCE(p_dias_proximo, 7)) THEN
      v_vencimento := 'proximo';
    ELSE
      v_vencimento := 'no_prazo';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'valor_devido', v_devido,
    'valor_recebido', v_recebido,
    'saldo', GREATEST(v_saldo, 0),
    'pagamento', v_pagamento,
    'situacao_vencimento', v_vencimento,
    'quitado', v_quitado,
    'comissao_liberada', v_quitado AND v_devido > 0
  );
END;
$$;

REVOKE ALL ON FUNCTION public.financeiro_classificar(numeric, numeric, date, date, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.financeiro_classificar(numeric, numeric, date, date, integer) TO authenticated;

-- -----------------------------------------------------------------------------
-- Tabelas
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pedido_financeiro_titulos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  simulation_id uuid NOT NULL UNIQUE REFERENCES public.simulations (id) ON DELETE RESTRICT,
  valor_devido numeric(14, 2) NOT NULL CHECK (valor_devido >= 0),
  vencimento date,
  versao integer NOT NULL DEFAULT 1 CHECK (versao > 0),
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.pedido_financeiro_titulos IS
  'Valor devido e vencimento vigente do pedido. Nasce no primeiro recebimento ou renegociação e não segue alteração posterior do total da proposta.';

CREATE TABLE IF NOT EXISTS public.pedido_financeiro_recebimentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  simulation_id uuid NOT NULL REFERENCES public.simulations (id) ON DELETE RESTRICT,
  titulo_id uuid NOT NULL REFERENCES public.pedido_financeiro_titulos (id) ON DELETE RESTRICT,
  idempotency_key uuid NOT NULL UNIQUE,
  valor numeric(14, 2) NOT NULL CHECK (valor > 0),
  data_recebimento date NOT NULL,
  observacao text,
  registrado_por uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'estornado')),
  estornado_em timestamptz,
  estornado_por uuid REFERENCES public.profiles (id) ON DELETE RESTRICT,
  motivo_estorno text,
  criado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pedido_financeiro_recebimentos_estorno_ck CHECK (
    (status = 'ativo' AND estornado_em IS NULL AND estornado_por IS NULL AND motivo_estorno IS NULL)
    OR (status = 'estornado' AND estornado_em IS NOT NULL AND estornado_por IS NOT NULL AND motivo_estorno IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS pedido_financeiro_recebimentos_simulation_idx
  ON public.pedido_financeiro_recebimentos (simulation_id, status);

COMMENT ON TABLE public.pedido_financeiro_recebimentos IS
  'Recebimentos do pedido. Estorno muda o status e preserva a linha.';

CREATE TABLE IF NOT EXISTS public.pedido_financeiro_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  simulation_id uuid NOT NULL REFERENCES public.simulations (id) ON DELETE RESTRICT,
  titulo_id uuid REFERENCES public.pedido_financeiro_titulos (id) ON DELETE RESTRICT,
  recebimento_id uuid REFERENCES public.pedido_financeiro_recebimentos (id) ON DELETE RESTRICT,
  idempotency_key uuid UNIQUE,
  tipo text NOT NULL CHECK (tipo IN ('titulo_aberto', 'recebimento', 'estorno', 'renegociacao')),
  valor numeric(14, 2),
  vencimento_anterior date,
  vencimento_novo date,
  observacao text,
  ator_id uuid REFERENCES public.profiles (id) ON DELETE RESTRICT,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pedido_financeiro_eventos_simulation_idx
  ON public.pedido_financeiro_eventos (simulation_id, criado_em DESC);

COMMENT ON TABLE public.pedido_financeiro_eventos IS
  'Histórico de abertura, recebimento, estorno e renegociação de vencimento.';

ALTER TABLE public.pedido_financeiro_titulos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedido_financeiro_recebimentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedido_financeiro_eventos ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.pedido_financeiro_titulos FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.pedido_financeiro_recebimentos FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.pedido_financeiro_eventos FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.pedido_financeiro_titulos TO authenticated;
GRANT SELECT ON public.pedido_financeiro_recebimentos TO authenticated;
GRANT SELECT ON public.pedido_financeiro_eventos TO authenticated;

DROP POLICY IF EXISTS pedido_financeiro_titulos_select ON public.pedido_financeiro_titulos;
CREATE POLICY pedido_financeiro_titulos_select
  ON public.pedido_financeiro_titulos
  FOR SELECT
  TO authenticated
  USING (
    (SELECT public.is_gestor())
    OR (SELECT public.is_financeiro())
    OR EXISTS (
      SELECT 1
      FROM public.simulations s
      WHERE s.id = simulation_id
        AND s.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS pedido_financeiro_recebimentos_select ON public.pedido_financeiro_recebimentos;
CREATE POLICY pedido_financeiro_recebimentos_select
  ON public.pedido_financeiro_recebimentos
  FOR SELECT
  TO authenticated
  USING (
    (SELECT public.is_gestor())
    OR (SELECT public.is_financeiro())
    OR EXISTS (
      SELECT 1
      FROM public.simulations s
      WHERE s.id = simulation_id
        AND s.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS pedido_financeiro_eventos_select ON public.pedido_financeiro_eventos;
CREATE POLICY pedido_financeiro_eventos_select
  ON public.pedido_financeiro_eventos
  FOR SELECT
  TO authenticated
  USING (
    (SELECT public.is_gestor())
    OR (SELECT public.is_financeiro())
    OR EXISTS (
      SELECT 1
      FROM public.simulations s
      WHERE s.id = simulation_id
        AND s.user_id = (SELECT auth.uid())
    )
  );

-- Financeiro não herda leituras abertas a qualquer autenticado.
DROP POLICY IF EXISTS "clients_select_non_logistica" ON public.clients;
CREATE POLICY "clients_select_non_logistica"
  ON public.clients
  FOR SELECT
  TO authenticated
  USING (NOT public.is_logistica() AND NOT public.is_financeiro());

-- O catálogo antigo `products` não existe no Syagri oficial.
DO $$
BEGIN
  IF to_regclass('public.products') IS NULL THEN
    RETURN;
  END IF;
  EXECUTE 'DROP POLICY IF EXISTS "products_select_authenticated" ON public.products';
  EXECUTE $policy$
    CREATE POLICY "products_select_authenticated"
      ON public.products
      FOR SELECT
      TO authenticated
      USING (NOT public.is_financeiro())
  $policy$;
END $$;

DROP POLICY IF EXISTS "fretes_select_authenticated" ON public.fretes;
CREATE POLICY "fretes_select_authenticated"
  ON public.fretes
  FOR SELECT
  TO authenticated
  USING (NOT public.is_financeiro());

DROP POLICY IF EXISTS "parametros_sistema_select_authenticated" ON public.parametros_sistema;
CREATE POLICY "parametros_sistema_select_authenticated"
  ON public.parametros_sistema
  FOR SELECT
  TO authenticated
  USING (NOT public.is_financeiro());

DROP POLICY IF EXISTS "comissao_faixas_select_authenticated" ON public.comissao_faixas;
CREATE POLICY "comissao_faixas_select_authenticated"
  ON public.comissao_faixas
  FOR SELECT
  TO authenticated
  USING (NOT public.is_financeiro());

-- -----------------------------------------------------------------------------
-- Carteira
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.listar_carteira_financeira(
  p_busca text DEFAULT NULL,
  p_pagamento text DEFAULT NULL,
  p_vencimento text DEFAULT NULL
)
RETURNS TABLE (
  simulation_id uuid,
  identificacao text,
  cliente_nome text,
  consultor_nome text,
  consultor_id uuid,
  status_pedido text,
  ativo boolean,
  valor_devido numeric,
  valor_recebido numeric,
  saldo numeric,
  vencimento date,
  pagamento text,
  situacao_vencimento text,
  quitado boolean,
  comissao_liberada boolean,
  titulo_id uuid,
  versao integer,
  valor_congelado boolean,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_busca text := NULLIF(btrim(COALESCE(p_busca, '')), '');
  v_pagamento text := NULLIF(btrim(COALESCE(p_pagamento, '')), '');
  v_vencimento text := NULLIF(btrim(COALESCE(p_vencimento, '')), '');
  v_hoje date := (timezone('America/Sao_Paulo', now()))::date;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  IF NOT (
    public.is_gestor()
    OR public.is_financeiro()
    OR public.is_consultor()
  ) THEN
    RAISE EXCEPTION 'Sem permissão para consultar o financeiro';
  END IF;

  IF v_pagamento IS NOT NULL AND v_pagamento NOT IN ('pendente', 'parcial', 'quitado') THEN
    RAISE EXCEPTION 'Filtro de pagamento inválido';
  END IF;

  IF v_vencimento IS NOT NULL AND v_vencimento NOT IN ('proximo', 'atrasado', 'no_prazo', 'sem_data') THEN
    RAISE EXCEPTION 'Filtro de vencimento inválido';
  END IF;

  IF v_busca IS NOT NULL THEN
    v_busca := replace(replace(v_busca, '%', ''), '_', '');
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT
      s.id AS simulation_id,
      upper(substr(replace(s.id::text, '-', ''), 1, 8)) AS identificacao,
      COALESCE(c.nome, '—') AS cliente_nome,
      COALESCE(pr.nome, '—') AS consultor_nome,
      s.user_id AS consultor_id,
      s.status::text AS status_pedido,
      s.ativo,
      round(COALESCE(t.valor_devido, s.total_proposta, 0), 2) AS valor_devido,
      round(COALESCE(rec.recebido, 0), 2) AS valor_recebido,
      COALESCE(t.vencimento, s.data_pagamento) AS vencimento,
      t.id AS titulo_id,
      COALESCE(t.versao, 0) AS versao,
      (t.id IS NOT NULL) AS valor_congelado,
      s.created_at
    FROM public.simulations s
    LEFT JOIN public.clients c ON c.id = s.client_id
    LEFT JOIN public.profiles pr ON pr.id = s.user_id
    LEFT JOIN public.pedido_financeiro_titulos t ON t.simulation_id = s.id
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(r.valor), 0) AS recebido
      FROM public.pedido_financeiro_recebimentos r
      WHERE r.simulation_id = s.id
        AND r.status = 'ativo'
    ) rec ON true
    WHERE s.status IN ('order_pending', 'converted', 'order_rejected', 'cancelled')
      AND (
        public.is_gestor()
        OR public.is_financeiro()
        OR s.user_id = (SELECT auth.uid())
      )
      AND (
        v_busca IS NULL
        OR c.nome ILIKE '%' || v_busca || '%'
        OR pr.nome ILIKE '%' || v_busca || '%'
        OR s.id::text ILIKE '%' || v_busca || '%'
        OR upper(substr(replace(s.id::text, '-', ''), 1, 8)) ILIKE '%' || upper(v_busca) || '%'
      )
  ),
  classificada AS (
    SELECT
      b.*,
      public.financeiro_classificar(
        b.valor_devido,
        b.valor_recebido,
        b.vencimento,
        v_hoje,
        7
      ) AS situacao
    FROM base b
  )
  SELECT
    c.simulation_id,
    c.identificacao,
    c.cliente_nome,
    c.consultor_nome,
    c.consultor_id,
    c.status_pedido,
    c.ativo,
    c.valor_devido,
    c.valor_recebido,
    (c.situacao ->> 'saldo')::numeric,
    c.vencimento,
    c.situacao ->> 'pagamento',
    c.situacao ->> 'situacao_vencimento',
    (c.situacao ->> 'quitado')::boolean,
    (c.situacao ->> 'comissao_liberada')::boolean,
    c.titulo_id,
    c.versao,
    c.valor_congelado,
    c.created_at
  FROM classificada c
  WHERE (v_pagamento IS NULL OR (c.situacao ->> 'pagamento') = v_pagamento)
    AND (v_vencimento IS NULL OR (c.situacao ->> 'situacao_vencimento') = v_vencimento)
  ORDER BY
    CASE c.situacao ->> 'situacao_vencimento'
      WHEN 'atrasado' THEN 0
      WHEN 'proximo' THEN 1
      ELSE 2
    END,
    c.vencimento NULLS LAST,
    c.cliente_nome;
END;
$$;

REVOKE ALL ON FUNCTION public.listar_carteira_financeira(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.listar_carteira_financeira(text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.resumo_financeiro_pedidos(p_ids uuid[])
RETURNS TABLE (
  simulation_id uuid,
  identificacao text,
  cliente_nome text,
  consultor_nome text,
  consultor_id uuid,
  status_pedido text,
  ativo boolean,
  valor_devido numeric,
  valor_recebido numeric,
  saldo numeric,
  vencimento date,
  pagamento text,
  situacao_vencimento text,
  quitado boolean,
  comissao_liberada boolean,
  titulo_id uuid,
  versao integer,
  valor_congelado boolean,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_ids IS NULL OR cardinality(p_ids) = 0 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT *
  FROM public.listar_carteira_financeira(NULL, NULL, NULL) c
  WHERE c.simulation_id = ANY (p_ids);
END;
$$;

REVOKE ALL ON FUNCTION public.resumo_financeiro_pedidos(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resumo_financeiro_pedidos(uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.pedido_comissao_liberada(p_simulation_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_flag boolean;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RETURN false;
  END IF;

  IF NOT (
    public.is_gestor()
    OR public.is_financeiro()
    OR EXISTS (
      SELECT 1
      FROM public.simulations s
      WHERE s.id = p_simulation_id
        AND s.user_id = (SELECT auth.uid())
    )
  ) THEN
    RETURN false;
  END IF;

  SELECT c.comissao_liberada
  INTO v_flag
  FROM public.listar_carteira_financeira(NULL, NULL, NULL) c
  WHERE c.simulation_id = p_simulation_id;

  RETURN COALESCE(v_flag, false);
END;
$$;

REVOKE ALL ON FUNCTION public.pedido_comissao_liberada(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pedido_comissao_liberada(uuid) TO authenticated;

COMMENT ON FUNCTION public.pedido_comissao_liberada(uuid) IS
  'True só quando o pedido tem valor devido positivo e está integralmente quitado. Pagamento parcial não libera.';

-- -----------------------------------------------------------------------------
-- Detalhe
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.obter_pedido_financeiro(p_simulation_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pedido record;
  v_recebimentos jsonb;
  v_eventos jsonb;
  v_pode boolean;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  SELECT *
  INTO v_pedido
  FROM public.listar_carteira_financeira(NULL, NULL, NULL) c
  WHERE c.simulation_id = p_simulation_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido não encontrado';
  END IF;

  v_pode := public.is_gestor() OR public.is_financeiro();

  SELECT COALESCE(jsonb_agg(row_to_json(r)::jsonb ORDER BY r.data_recebimento DESC, r.criado_em DESC), '[]'::jsonb)
  INTO v_recebimentos
  FROM (
    SELECT
      rec.id,
      rec.valor,
      rec.data_recebimento,
      rec.observacao,
      rec.status,
      rec.motivo_estorno,
      rec.estornado_em,
      rec.criado_em,
      pr.nome AS registrado_por_nome
    FROM public.pedido_financeiro_recebimentos rec
    LEFT JOIN public.profiles pr ON pr.id = rec.registrado_por
    WHERE rec.simulation_id = p_simulation_id
  ) r;

  SELECT COALESCE(jsonb_agg(row_to_json(e)::jsonb ORDER BY e.criado_em DESC), '[]'::jsonb)
  INTO v_eventos
  FROM (
    SELECT
      ev.id,
      ev.tipo,
      ev.valor,
      ev.vencimento_anterior,
      ev.vencimento_novo,
      ev.observacao,
      ev.criado_em,
      ev.recebimento_id,
      pr.nome AS ator_nome
    FROM public.pedido_financeiro_eventos ev
    LEFT JOIN public.profiles pr ON pr.id = ev.ator_id
    WHERE ev.simulation_id = p_simulation_id
  ) e;

  RETURN jsonb_build_object(
    'pedido', to_jsonb(v_pedido) || jsonb_build_object(
      'pode_operar', v_pode,
      'pode_receber', v_pode AND v_pedido.status_pedido = 'converted' AND v_pedido.ativo AND NOT v_pedido.quitado,
      'pode_renegociar', v_pode AND v_pedido.status_pedido = 'converted' AND v_pedido.ativo
    ),
    'recebimentos', v_recebimentos,
    'eventos', v_eventos
  );
END;
$$;

REVOKE ALL ON FUNCTION public.obter_pedido_financeiro(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.obter_pedido_financeiro(uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- Escrita
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._financeiro_exigir_operacao()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;
  IF NOT (public.is_gestor() OR public.is_financeiro()) THEN
    RAISE EXCEPTION 'Sem permissão para registrar movimentação financeira';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public._financeiro_exigir_operacao() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._financeiro_lock_pedido(p_simulation_id uuid)
RETURNS public.simulations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sim public.simulations;
BEGIN
  SELECT *
  INTO v_sim
  FROM public.simulations
  WHERE id = p_simulation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido não encontrado';
  END IF;

  IF v_sim.status::text <> 'converted' OR v_sim.ativo IS NOT TRUE THEN
    RAISE EXCEPTION 'Só é possível movimentar um pedido convertido e ativo';
  END IF;

  RETURN v_sim;
END;
$$;

REVOKE ALL ON FUNCTION public._financeiro_lock_pedido(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.registrar_recebimento(
  p_simulation_id uuid,
  p_valor numeric,
  p_data date,
  p_observacao text,
  p_idempotency_key uuid,
  p_versao integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sim public.simulations;
  v_titulo public.pedido_financeiro_titulos;
  v_recebido numeric;
  v_valor numeric := round(COALESCE(p_valor, 0), 2);
  v_obs text := NULLIF(btrim(COALESCE(p_observacao, '')), '');
  v_id uuid;
  v_exist public.pedido_financeiro_recebimentos;
BEGIN
  PERFORM public._financeiro_exigir_operacao();

  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'Operação sem identificação';
  END IF;
  IF p_data IS NULL THEN
    RAISE EXCEPTION 'Informe a data do recebimento';
  END IF;
  IF v_valor <= 0 THEN
    RAISE EXCEPTION 'Informe um valor maior que zero';
  END IF;
  IF v_obs IS NOT NULL AND length(v_obs) > 500 THEN
    RAISE EXCEPTION 'Observação deve ter no máximo 500 caracteres';
  END IF;

  SELECT *
  INTO v_exist
  FROM public.pedido_financeiro_recebimentos
  WHERE idempotency_key = p_idempotency_key;

  IF FOUND THEN
    IF v_exist.simulation_id IS DISTINCT FROM p_simulation_id
      OR v_exist.valor IS DISTINCT FROM v_valor
      OR v_exist.data_recebimento IS DISTINCT FROM p_data THEN
      RAISE EXCEPTION 'Recebimento já registrado com outros dados';
    END IF;
    RETURN jsonb_build_object('id', v_exist.id, 'repetido', true);
  END IF;

  v_sim := public._financeiro_lock_pedido(p_simulation_id);

  SELECT *
  INTO v_exist
  FROM public.pedido_financeiro_recebimentos
  WHERE idempotency_key = p_idempotency_key;

  IF FOUND THEN
    IF v_exist.simulation_id IS DISTINCT FROM p_simulation_id
      OR v_exist.valor IS DISTINCT FROM v_valor
      OR v_exist.data_recebimento IS DISTINCT FROM p_data THEN
      RAISE EXCEPTION 'Recebimento já registrado com outros dados';
    END IF;
    RETURN jsonb_build_object('id', v_exist.id, 'repetido', true);
  END IF;

  SELECT *
  INTO v_titulo
  FROM public.pedido_financeiro_titulos
  WHERE simulation_id = p_simulation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    IF COALESCE(p_versao, 0) <> 0 THEN
      RAISE EXCEPTION 'O pedido foi atualizado por outra operação. Atualize a tela e tente de novo.';
    END IF;
    INSERT INTO public.pedido_financeiro_titulos (simulation_id, valor_devido, vencimento, versao)
    VALUES (
      p_simulation_id,
      round(COALESCE(v_sim.total_proposta, 0), 2),
      v_sim.data_pagamento,
      1
    )
    RETURNING * INTO v_titulo;

    INSERT INTO public.pedido_financeiro_eventos (
      simulation_id, titulo_id, tipo, valor, vencimento_novo, ator_id
    ) VALUES (
      p_simulation_id,
      v_titulo.id,
      'titulo_aberto',
      v_titulo.valor_devido,
      v_titulo.vencimento,
      (SELECT auth.uid())
    );
  ELSIF v_titulo.versao IS DISTINCT FROM p_versao THEN
    RAISE EXCEPTION 'O pedido foi atualizado por outra operação. Atualize a tela e tente de novo.';
  END IF;

  SELECT COALESCE(SUM(valor), 0)
  INTO v_recebido
  FROM public.pedido_financeiro_recebimentos
  WHERE titulo_id = v_titulo.id
    AND status = 'ativo';

  IF round(v_recebido + v_valor, 2) > v_titulo.valor_devido THEN
    RAISE EXCEPTION 'Recebimento acima do saldo em aberto';
  END IF;

  BEGIN
    INSERT INTO public.pedido_financeiro_recebimentos (
      simulation_id,
      titulo_id,
      idempotency_key,
      valor,
      data_recebimento,
      observacao,
      registrado_por
    ) VALUES (
      p_simulation_id,
      v_titulo.id,
      p_idempotency_key,
      v_valor,
      p_data,
      v_obs,
      (SELECT auth.uid())
    )
    RETURNING id INTO v_id;

    INSERT INTO public.pedido_financeiro_eventos (
      simulation_id,
      titulo_id,
      recebimento_id,
      idempotency_key,
      tipo,
      valor,
      observacao,
      ator_id
    ) VALUES (
      p_simulation_id,
      v_titulo.id,
      v_id,
      p_idempotency_key,
      'recebimento',
      v_valor,
      v_obs,
      (SELECT auth.uid())
    );

    UPDATE public.pedido_financeiro_titulos
    SET versao = versao + 1,
        atualizado_em = now()
    WHERE id = v_titulo.id;
  EXCEPTION
    WHEN unique_violation THEN
      SELECT *
      INTO v_exist
      FROM public.pedido_financeiro_recebimentos
      WHERE idempotency_key = p_idempotency_key;

      IF NOT FOUND
        OR v_exist.simulation_id IS DISTINCT FROM p_simulation_id
        OR v_exist.valor IS DISTINCT FROM v_valor
        OR v_exist.data_recebimento IS DISTINCT FROM p_data THEN
        RAISE EXCEPTION 'Recebimento já registrado com outros dados';
      END IF;
      RETURN jsonb_build_object('id', v_exist.id, 'repetido', true);
  END;

  RETURN jsonb_build_object('id', v_id, 'repetido', false);
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_recebimento(uuid, numeric, date, text, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_recebimento(uuid, numeric, date, text, uuid, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.estornar_recebimento(
  p_recebimento_id uuid,
  p_motivo text,
  p_versao integer,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec public.pedido_financeiro_recebimentos;
  v_titulo public.pedido_financeiro_titulos;
  v_motivo text := NULLIF(btrim(COALESCE(p_motivo, '')), '');
  v_evento_id uuid;
BEGIN
  PERFORM public._financeiro_exigir_operacao();

  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'Operação sem identificação';
  END IF;
  IF v_motivo IS NULL THEN
    RAISE EXCEPTION 'Informe o motivo do estorno';
  END IF;
  IF length(v_motivo) > 500 THEN
    RAISE EXCEPTION 'Motivo deve ter no máximo 500 caracteres';
  END IF;

  SELECT id
  INTO v_evento_id
  FROM public.pedido_financeiro_eventos
  WHERE idempotency_key = p_idempotency_key
    AND tipo = 'estorno';

  IF FOUND THEN
    RETURN jsonb_build_object('id', v_evento_id, 'repetido', true);
  END IF;

  SELECT *
  INTO v_rec
  FROM public.pedido_financeiro_recebimentos
  WHERE id = p_recebimento_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recebimento não encontrado';
  END IF;

  PERFORM public._financeiro_lock_pedido(v_rec.simulation_id);

  SELECT *
  INTO v_titulo
  FROM public.pedido_financeiro_titulos
  WHERE id = v_rec.titulo_id
  FOR UPDATE;

  IF v_titulo.versao IS DISTINCT FROM p_versao THEN
    RAISE EXCEPTION 'O pedido foi atualizado por outra operação. Atualize a tela e tente de novo.';
  END IF;

  IF v_rec.status = 'estornado' THEN
    RAISE EXCEPTION 'Recebimento já estornado';
  END IF;

  UPDATE public.pedido_financeiro_recebimentos
  SET status = 'estornado',
      estornado_em = now(),
      estornado_por = (SELECT auth.uid()),
      motivo_estorno = v_motivo
  WHERE id = v_rec.id;

  INSERT INTO public.pedido_financeiro_eventos (
    simulation_id,
    titulo_id,
    recebimento_id,
    idempotency_key,
    tipo,
    valor,
    observacao,
    ator_id
  ) VALUES (
    v_rec.simulation_id,
    v_rec.titulo_id,
    v_rec.id,
    p_idempotency_key,
    'estorno',
    v_rec.valor,
    v_motivo,
    (SELECT auth.uid())
  )
  RETURNING id INTO v_evento_id;

  UPDATE public.pedido_financeiro_titulos
  SET versao = versao + 1,
      atualizado_em = now()
  WHERE id = v_titulo.id;

  RETURN jsonb_build_object('id', v_evento_id, 'repetido', false);
END;
$$;

REVOKE ALL ON FUNCTION public.estornar_recebimento(uuid, text, integer, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.estornar_recebimento(uuid, text, integer, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.renegociar_vencimento(
  p_simulation_id uuid,
  p_vencimento date,
  p_observacao text,
  p_versao integer,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sim public.simulations;
  v_titulo public.pedido_financeiro_titulos;
  v_obs text := NULLIF(btrim(COALESCE(p_observacao, '')), '');
  v_anterior date;
  v_evento_id uuid;
BEGIN
  PERFORM public._financeiro_exigir_operacao();

  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'Operação sem identificação';
  END IF;
  IF p_vencimento IS NULL THEN
    RAISE EXCEPTION 'Informe o novo vencimento';
  END IF;
  IF v_obs IS NOT NULL AND length(v_obs) > 500 THEN
    RAISE EXCEPTION 'Observação deve ter no máximo 500 caracteres';
  END IF;

  SELECT id
  INTO v_evento_id
  FROM public.pedido_financeiro_eventos
  WHERE idempotency_key = p_idempotency_key
    AND tipo = 'renegociacao';

  IF FOUND THEN
    RETURN jsonb_build_object('id', v_evento_id, 'repetido', true);
  END IF;

  v_sim := public._financeiro_lock_pedido(p_simulation_id);

  SELECT *
  INTO v_titulo
  FROM public.pedido_financeiro_titulos
  WHERE simulation_id = p_simulation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    IF COALESCE(p_versao, 0) <> 0 THEN
      RAISE EXCEPTION 'O pedido foi atualizado por outra operação. Atualize a tela e tente de novo.';
    END IF;
    v_anterior := v_sim.data_pagamento;
    IF v_anterior IS NOT DISTINCT FROM p_vencimento THEN
      RAISE EXCEPTION 'O vencimento informado já é o vigente';
    END IF;
    INSERT INTO public.pedido_financeiro_titulos (simulation_id, valor_devido, vencimento, versao)
    VALUES (
      p_simulation_id,
      round(COALESCE(v_sim.total_proposta, 0), 2),
      p_vencimento,
      1
    )
    RETURNING * INTO v_titulo;

    INSERT INTO public.pedido_financeiro_eventos (
      simulation_id, titulo_id, tipo, valor, vencimento_novo, ator_id
    ) VALUES (
      p_simulation_id,
      v_titulo.id,
      'titulo_aberto',
      v_titulo.valor_devido,
      v_anterior,
      (SELECT auth.uid())
    );
  ELSE
    IF v_titulo.versao IS DISTINCT FROM p_versao THEN
      RAISE EXCEPTION 'O pedido foi atualizado por outra operação. Atualize a tela e tente de novo.';
    END IF;
    v_anterior := v_titulo.vencimento;
    IF v_anterior IS NOT DISTINCT FROM p_vencimento THEN
      RAISE EXCEPTION 'O vencimento informado já é o vigente';
    END IF;
    UPDATE public.pedido_financeiro_titulos
    SET vencimento = p_vencimento,
        versao = versao + 1,
        atualizado_em = now()
    WHERE id = v_titulo.id;
  END IF;

  INSERT INTO public.pedido_financeiro_eventos (
    simulation_id,
    titulo_id,
    idempotency_key,
    tipo,
    vencimento_anterior,
    vencimento_novo,
    observacao,
    ator_id
  ) VALUES (
    p_simulation_id,
    v_titulo.id,
    p_idempotency_key,
    'renegociacao',
    v_anterior,
    p_vencimento,
    v_obs,
    (SELECT auth.uid())
  )
  RETURNING id INTO v_evento_id;

  RETURN jsonb_build_object('id', v_evento_id, 'repetido', false);
END;
$$;

REVOKE ALL ON FUNCTION public.renegociar_vencimento(uuid, date, text, integer, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.renegociar_vencimento(uuid, date, text, integer, uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- Usuários financeiros (espelho da logística, com desativação)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_financeiro_user(
  p_email text,
  p_password text,
  p_nome text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = extensions, auth, public, pg_temp
AS $$
DECLARE
  v_new_id uuid := gen_random_uuid();
  v_email text := lower(trim(p_email));
  v_nome text := trim(p_nome);
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  IF NOT public.is_gestor() THEN
    RAISE EXCEPTION 'Apenas gestores podem criar usuários financeiros';
  END IF;

  IF v_email IS NULL OR v_email = '' OR v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'E-mail inválido';
  END IF;

  IF p_password IS NULL OR length(p_password) < 8 THEN
    RAISE EXCEPTION 'Senha deve ter pelo menos 8 caracteres';
  END IF;

  IF v_nome IS NULL OR length(v_nome) = 0 THEN
    RAISE EXCEPTION 'Nome é obrigatório';
  END IF;

  IF EXISTS (SELECT 1 FROM auth.users u WHERE lower(u.email) = v_email) THEN
    RAISE EXCEPTION 'E-mail já cadastrado';
  END IF;

  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, recovery_sent_at, last_sign_in_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    v_new_id,
    'authenticated',
    'authenticated',
    v_email,
    crypt(p_password, gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('nome', v_nome),
    now(), now(),
    '', '', '', ''
  );

  INSERT INTO auth.identities (
    id, user_id, provider_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at
  ) VALUES (
    gen_random_uuid(),
    v_new_id,
    v_new_id,
    jsonb_build_object('sub', v_new_id::text, 'email', v_email),
    'email',
    now(), now(), now()
  );

  UPDATE public.profiles
  SET role = 'financeiro'::public.user_role,
      ativo = true
  WHERE id = v_new_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Perfil não criado para o usuário financeiro';
  END IF;

  RETURN v_new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_financeiro_user(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_financeiro_user(text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_financeiro_email(p_user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = extensions, auth, public, pg_temp
AS $$
DECLARE
  v_email text;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;
  IF NOT public.is_gestor() THEN
    RAISE EXCEPTION 'Apenas gestores podem consultar credenciais financeiras';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = p_user_id AND p.role = 'financeiro'::public.user_role
  ) THEN
    RAISE EXCEPTION 'Usuário financeiro não encontrado';
  END IF;

  SELECT lower(u.email) INTO v_email FROM auth.users u WHERE u.id = p_user_id;
  RETURN v_email;
END;
$$;

REVOKE ALL ON FUNCTION public.get_financeiro_email(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_financeiro_email(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_financeiro_user(
  p_user_id uuid,
  p_nome text DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_password text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = extensions, auth, public, pg_temp
AS $$
DECLARE
  v_nome text;
  v_email text;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;
  IF NOT public.is_gestor() THEN
    RAISE EXCEPTION 'Apenas gestores podem atualizar usuários financeiros';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = p_user_id AND p.role = 'financeiro'::public.user_role
  ) THEN
    RAISE EXCEPTION 'Usuário financeiro não encontrado';
  END IF;

  v_nome := NULLIF(trim(p_nome), '');
  IF p_nome IS NOT NULL AND v_nome IS NULL THEN
    RAISE EXCEPTION 'Nome é obrigatório';
  END IF;

  v_email := lower(trim(p_email));
  IF v_email IS NOT NULL AND v_email = '' THEN
    v_email := NULL;
  END IF;
  IF v_email IS NOT NULL AND v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'E-mail inválido';
  END IF;
  IF p_password IS NOT NULL AND length(p_password) > 0 AND length(p_password) < 8 THEN
    RAISE EXCEPTION 'Senha deve ter pelo menos 8 caracteres';
  END IF;
  IF v_email IS NOT NULL AND EXISTS (
    SELECT 1 FROM auth.users u WHERE lower(u.email) = v_email AND u.id <> p_user_id
  ) THEN
    RAISE EXCEPTION 'E-mail já cadastrado';
  END IF;

  IF v_nome IS NOT NULL THEN
    UPDATE public.profiles SET nome = v_nome WHERE id = p_user_id;
  END IF;

  IF v_email IS NOT NULL OR (p_password IS NOT NULL AND length(p_password) >= 8) THEN
    UPDATE auth.users
    SET
      email = COALESCE(v_email, email),
      encrypted_password = CASE
        WHEN p_password IS NOT NULL AND length(p_password) >= 8
          THEN crypt(p_password, gen_salt('bf'))
        ELSE encrypted_password
      END,
      raw_user_meta_data = CASE
        WHEN v_nome IS NOT NULL
          THEN COALESCE(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('nome', v_nome)
        ELSE raw_user_meta_data
      END,
      updated_at = now()
    WHERE id = p_user_id;

    IF v_email IS NOT NULL THEN
      UPDATE auth.identities
      SET
        identity_data = jsonb_set(COALESCE(identity_data, '{}'::jsonb), '{email}', to_jsonb(v_email)),
        updated_at = now()
      WHERE user_id = p_user_id AND provider = 'email';
    END IF;
  ELSIF v_nome IS NOT NULL THEN
    UPDATE auth.users
    SET
      raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('nome', v_nome),
      updated_at = now()
    WHERE id = p_user_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.update_financeiro_user(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_financeiro_user(uuid, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_financeiro_user_ativo(
  p_user_id uuid,
  p_ativo boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = extensions, auth, public, pg_temp
AS $$
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;
  IF NOT public.is_gestor() THEN
    RAISE EXCEPTION 'Apenas gestores podem desativar usuários financeiros';
  END IF;
  IF p_ativo IS NULL THEN
    RAISE EXCEPTION 'Informe a situação do acesso';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = p_user_id AND p.role = 'financeiro'::public.user_role
  ) THEN
    RAISE EXCEPTION 'Usuário financeiro não encontrado';
  END IF;

  UPDATE public.profiles
  SET ativo = p_ativo
  WHERE id = p_user_id;

  UPDATE auth.users
  SET banned_until = CASE WHEN p_ativo THEN NULL ELSE 'infinity'::timestamptz END,
      updated_at = now()
  WHERE id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_financeiro_user_ativo(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_financeiro_user_ativo(uuid, boolean) TO authenticated;
