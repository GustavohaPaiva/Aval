-- Kanban de logística: Carteira, Programado, Em trânsito e Entregue.
-- O pedido continua sendo uma linha de simulations. Entrega parcial não copia o pedido:
-- a quantidade programada vai para pedido_logistica_entregas e o saldo fica na Carteira.

ALTER TABLE public.simulations
  DROP CONSTRAINT IF EXISTS simulations_status_logistica_check;

ALTER TABLE public.pedido_logistica_movimentos
  DROP CONSTRAINT IF EXISTS pedido_logistica_movimentos_status_anterior_check;

ALTER TABLE public.pedido_logistica_movimentos
  DROP CONSTRAINT IF EXISTS pedido_logistica_movimentos_status_novo_check;

UPDATE public.simulations
SET status_logistica = CASE status_logistica
  WHEN 'aguardando_inicio' THEN 'carteira'
  WHEN 'em_andamento' THEN 'carteira'
  WHEN 'pedido_realizado' THEN 'programado'
  WHEN 'aguardando_recebimento' THEN 'em_transito'
  WHEN 'concluido' THEN 'entregue'
  ELSE status_logistica
END
WHERE status_logistica IN (
  'aguardando_inicio',
  'em_andamento',
  'pedido_realizado',
  'aguardando_recebimento',
  'concluido'
);

UPDATE public.pedido_logistica_movimentos
SET status_anterior = CASE status_anterior
  WHEN 'aguardando_inicio' THEN 'carteira'
  WHEN 'em_andamento' THEN 'carteira'
  WHEN 'pedido_realizado' THEN 'programado'
  WHEN 'aguardando_recebimento' THEN 'em_transito'
  WHEN 'concluido' THEN 'entregue'
  ELSE status_anterior
END
WHERE status_anterior IN (
  'aguardando_inicio',
  'em_andamento',
  'pedido_realizado',
  'aguardando_recebimento',
  'concluido'
);

UPDATE public.pedido_logistica_movimentos
SET status_novo = CASE status_novo
  WHEN 'aguardando_inicio' THEN 'carteira'
  WHEN 'em_andamento' THEN 'carteira'
  WHEN 'pedido_realizado' THEN 'programado'
  WHEN 'aguardando_recebimento' THEN 'em_transito'
  WHEN 'concluido' THEN 'entregue'
  ELSE status_novo
END
WHERE status_novo IN (
  'aguardando_inicio',
  'em_andamento',
  'pedido_realizado',
  'aguardando_recebimento',
  'concluido'
);

ALTER TABLE public.simulations
  ALTER COLUMN status_logistica SET DEFAULT 'carteira';

ALTER TABLE public.simulations
  ADD CONSTRAINT simulations_status_logistica_check CHECK (
    status_logistica IN ('carteira', 'programado', 'em_transito', 'entregue')
  );

ALTER TABLE public.pedido_logistica_movimentos
  ADD CONSTRAINT pedido_logistica_movimentos_status_anterior_check CHECK (
    status_anterior IS NULL
    OR status_anterior IN ('carteira', 'programado', 'em_transito', 'entregue')
  );

ALTER TABLE public.pedido_logistica_movimentos
  ADD CONSTRAINT pedido_logistica_movimentos_status_novo_check CHECK (
    status_novo IN ('carteira', 'programado', 'em_transito', 'entregue')
  );

COMMENT ON COLUMN public.simulations.status_logistica IS
  'Estágio do saldo ainda não separado em entrega. Novos pedidos entram em carteira. Não altera simulations.status.';

CREATE TABLE IF NOT EXISTS public.pedido_logistica_entregas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  simulation_id uuid NOT NULL REFERENCES public.simulations (id) ON DELETE CASCADE,
  status_logistica text NOT NULL DEFAULT 'programado',
  status_logistica_em timestamptz NOT NULL DEFAULT now(),
  criado_em timestamptz NOT NULL DEFAULT now(),
  criado_por uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  CONSTRAINT pedido_logistica_entregas_status_check CHECK (
    status_logistica IN ('programado', 'em_transito', 'entregue')
  )
);

CREATE INDEX IF NOT EXISTS pedido_logistica_entregas_simulation_idx
  ON public.pedido_logistica_entregas (simulation_id, criado_em);

COMMENT ON TABLE public.pedido_logistica_entregas IS
  'Quantidade já separada de um pedido. O pedido original permanece em simulations.';

CREATE TABLE IF NOT EXISTS public.pedido_logistica_entrega_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entrega_id uuid NOT NULL REFERENCES public.pedido_logistica_entregas (id) ON DELETE CASCADE,
  simulation_item_id uuid NOT NULL REFERENCES public.simulation_items (id) ON DELETE CASCADE,
  quantidade numeric(14, 3) NOT NULL,
  CONSTRAINT pedido_logistica_entrega_itens_quantidade_check CHECK (quantidade > 0),
  CONSTRAINT pedido_logistica_entrega_itens_unica UNIQUE (entrega_id, simulation_item_id)
);

CREATE INDEX IF NOT EXISTS pedido_logistica_entrega_itens_item_idx
  ON public.pedido_logistica_entrega_itens (simulation_item_id);

COMMENT ON TABLE public.pedido_logistica_entrega_itens IS
  'Quantidade de cada item inclusa em uma entrega parcial.';

CREATE TABLE IF NOT EXISTS public.pedido_logistica_operacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key uuid NOT NULL UNIQUE,
  simulation_id uuid NOT NULL REFERENCES public.simulations (id) ON DELETE CASCADE,
  entrega_id uuid REFERENCES public.pedido_logistica_entregas (id) ON DELETE SET NULL,
  modo text NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  criado_por uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  CONSTRAINT pedido_logistica_operacoes_modo_check CHECK (modo IN ('total', 'parcial'))
);

COMMENT ON TABLE public.pedido_logistica_operacoes IS
  'Impede que o mesmo clique de programação grave duas entregas.';

ALTER TABLE public.pedido_logistica_movimentos
  ADD COLUMN IF NOT EXISTS entrega_id uuid REFERENCES public.pedido_logistica_entregas (id) ON DELETE SET NULL;

ALTER TABLE public.pedido_logistica_entregas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedido_logistica_entrega_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedido_logistica_operacoes ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.pedido_logistica_entregas FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.pedido_logistica_entrega_itens FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.pedido_logistica_operacoes FROM PUBLIC, anon;

GRANT SELECT ON TABLE public.pedido_logistica_entregas TO authenticated;
GRANT SELECT ON TABLE public.pedido_logistica_entrega_itens TO authenticated;

DROP POLICY IF EXISTS "pedido_logistica_entregas_select_logistica"
  ON public.pedido_logistica_entregas;
CREATE POLICY "pedido_logistica_entregas_select_logistica"
  ON public.pedido_logistica_entregas
  FOR SELECT
  TO authenticated
  USING (
    (SELECT public.is_logistica())
    AND public.pedido_visivel_logistica(simulation_id)
  );

DROP POLICY IF EXISTS "pedido_logistica_entrega_itens_select_logistica"
  ON public.pedido_logistica_entrega_itens;
CREATE POLICY "pedido_logistica_entrega_itens_select_logistica"
  ON public.pedido_logistica_entrega_itens
  FOR SELECT
  TO authenticated
  USING (
    (SELECT public.is_logistica())
    AND EXISTS (
      SELECT 1
      FROM public.pedido_logistica_entregas e
      WHERE e.id = entrega_id
        AND public.pedido_visivel_logistica(e.simulation_id)
    )
  );

DROP FUNCTION IF EXISTS public.atualizar_status_logistica(uuid, text, text);

CREATE OR REPLACE FUNCTION public.atualizar_status_logistica(
  p_simulation_id uuid,
  p_status text,
  p_status_esperado text DEFAULT NULL,
  p_entrega_id uuid DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_atual text;
  v_entrega_simulation uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sessão inválida.';
  END IF;

  IF NOT public.is_logistica() THEN
    RAISE EXCEPTION 'Acesso negado.';
  END IF;

  IF p_status IS NULL OR p_status NOT IN ('carteira', 'programado', 'em_transito', 'entregue') THEN
    RAISE EXCEPTION 'Status logístico inválido.';
  END IF;

  IF NOT public.pedido_visivel_logistica(p_simulation_id) THEN
    RAISE EXCEPTION 'Pedido não encontrado.';
  END IF;

  PERFORM 1
  FROM public.simulations s
  WHERE s.id = p_simulation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido não encontrado.';
  END IF;

  IF p_entrega_id IS NOT NULL THEN
    SELECT e.status_logistica, e.simulation_id
    INTO v_atual, v_entrega_simulation
    FROM public.pedido_logistica_entregas e
    WHERE e.id = p_entrega_id
    FOR UPDATE;

    IF NOT FOUND OR v_entrega_simulation IS DISTINCT FROM p_simulation_id THEN
      RAISE EXCEPTION 'Entrega não encontrada.';
    END IF;

    IF p_status = 'carteira' OR v_atual NOT IN ('programado', 'em_transito', 'entregue') THEN
      RAISE EXCEPTION 'A quantidade já separada não volta para a carteira por aqui.';
    END IF;

    IF p_status_esperado IS NOT NULL AND v_atual IS DISTINCT FROM p_status_esperado THEN
      RAISE EXCEPTION 'O pedido foi atualizado por outra pessoa. Atualize a tela e tente de novo.';
    END IF;

    IF v_atual IS NOT DISTINCT FROM p_status THEN
      RETURN v_atual;
    END IF;

    UPDATE public.pedido_logistica_entregas
    SET
      status_logistica = p_status,
      status_logistica_em = now()
    WHERE id = p_entrega_id;

    INSERT INTO public.pedido_logistica_movimentos (
      simulation_id,
      entrega_id,
      status_anterior,
      status_novo,
      alterado_por
    ) VALUES (
      p_simulation_id,
      p_entrega_id,
      v_atual,
      p_status,
      auth.uid()
    );

    RETURN p_status;
  END IF;

  SELECT s.status_logistica
  INTO v_atual
  FROM public.simulations s
  WHERE s.id = p_simulation_id;

  IF p_status_esperado IS NOT NULL AND v_atual IS DISTINCT FROM p_status_esperado THEN
    RAISE EXCEPTION 'O pedido foi atualizado por outra pessoa. Atualize a tela e tente de novo.';
  END IF;

  IF v_atual = 'carteira' AND p_status IS DISTINCT FROM 'carteira' THEN
    RAISE EXCEPTION 'Programe a entrega antes de avançar o pedido.';
  END IF;

  IF v_atual IS NOT DISTINCT FROM p_status THEN
    RETURN v_atual;
  END IF;

  UPDATE public.simulations
  SET
    status_logistica = p_status,
    status_logistica_em = now()
  WHERE id = p_simulation_id;

  INSERT INTO public.pedido_logistica_movimentos (
    simulation_id,
    status_anterior,
    status_novo,
    alterado_por
  ) VALUES (
    p_simulation_id,
    v_atual,
    p_status,
    auth.uid()
  );

  RETURN p_status;
END;
$$;

COMMENT ON FUNCTION public.atualizar_status_logistica(uuid, text, text, uuid) IS
  'Move o saldo do pedido ou uma entrega já separada. Sair da carteira só pela programação.';

REVOKE ALL ON FUNCTION public.atualizar_status_logistica(uuid, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.atualizar_status_logistica(uuid, text, text, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.programar_entrega_logistica(
  p_simulation_id uuid,
  p_itens jsonb,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_elem jsonb;
  v_item_text text;
  v_qtd numeric;
  v_solicitado jsonb := '{}'::jsonb;
  v_item record;
  v_alocado numeric;
  v_pendente numeric;
  v_linhas jsonb := '[]'::jsonb;
  v_total numeric := 0;
  v_eh_total boolean := true;
  v_tem_pendente boolean := false;
  v_modo text;
  v_entrega_id uuid;
  v_op_simulation uuid;
  v_repetida boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sessão inválida.';
  END IF;

  IF NOT public.is_logistica() THEN
    RAISE EXCEPTION 'Acesso negado.';
  END IF;

  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'Operação sem identificador.';
  END IF;

  IF p_itens IS NULL OR jsonb_typeof(p_itens) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Itens da programação inválidos.';
  END IF;

  IF NOT public.pedido_visivel_logistica(p_simulation_id) THEN
    RAISE EXCEPTION 'Pedido não encontrado.';
  END IF;

  SELECT s.status_logistica
  INTO v_status
  FROM public.simulations s
  WHERE s.id = p_simulation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido não encontrado.';
  END IF;

  SELECT o.modo, o.entrega_id, o.simulation_id
  INTO v_modo, v_entrega_id, v_op_simulation
  FROM public.pedido_logistica_operacoes o
  WHERE o.idempotency_key = p_idempotency_key;

  IF FOUND THEN
    IF v_op_simulation IS DISTINCT FROM p_simulation_id THEN
      RAISE EXCEPTION 'Esta operação já foi usada em outro pedido.';
    END IF;
    v_repetida := true;
    RETURN jsonb_build_object(
      'modo', v_modo,
      'entrega_id', v_entrega_id,
      'simulation_id', p_simulation_id,
      'status', 'programado',
      'repetida', true
    );
  END IF;

  IF v_status IS DISTINCT FROM 'carteira' THEN
    RAISE EXCEPTION 'O saldo deste pedido não está na carteira.';
  END IF;

  FOR v_elem IN
    SELECT value FROM jsonb_array_elements(p_itens) AS t(value)
  LOOP
    v_item_text := btrim(COALESCE(v_elem->>'item_id', ''));
    IF v_item_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION 'Item inválido.';
    END IF;
    IF v_solicitado ? v_item_text THEN
      RAISE EXCEPTION 'Item repetido na programação.';
    END IF;
    IF COALESCE(v_elem->>'quantidade', '') !~ '^-?[0-9]+(\.[0-9]+)?$' THEN
      RAISE EXCEPTION 'Informe um número válido.';
    END IF;
    v_qtd := round((v_elem->>'quantidade')::numeric, 3);
    v_solicitado := v_solicitado || jsonb_build_object(v_item_text, v_qtd);
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM jsonb_object_keys(v_solicitado) AS chave(item_id)
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.simulation_items si
      WHERE si.simulation_id = p_simulation_id
        AND si.id = chave.item_id::uuid
    )
  ) THEN
    RAISE EXCEPTION 'Item não pertence a este pedido.';
  END IF;

  FOR v_item IN
    SELECT si.id, round(COALESCE(si.volume, 0), 3) AS volume
    FROM public.simulation_items si
    WHERE si.simulation_id = p_simulation_id
    ORDER BY si.id
    FOR UPDATE
  LOOP
    SELECT COALESCE(round(sum(ei.quantidade), 3), 0)
    INTO v_alocado
    FROM public.pedido_logistica_entrega_itens ei
    JOIN public.pedido_logistica_entregas e ON e.id = ei.entrega_id
    WHERE e.simulation_id = p_simulation_id
      AND ei.simulation_item_id = v_item.id;

    v_pendente := round(v_item.volume - v_alocado, 3);
    IF v_pendente < 0 THEN
      v_pendente := 0;
    END IF;

    v_qtd := COALESCE((v_solicitado ->> v_item.id::text)::numeric, 0);

    IF v_qtd < 0 THEN
      RAISE EXCEPTION 'A quantidade não pode ser negativa.';
    END IF;
    IF v_qtd > v_pendente THEN
      RAISE EXCEPTION 'Quantidade acima do saldo pendente.';
    END IF;

    IF v_pendente > 0 THEN
      v_tem_pendente := true;
      IF v_qtd <> v_pendente THEN
        v_eh_total := false;
      END IF;
    ELSIF v_qtd <> 0 THEN
      RAISE EXCEPTION 'Quantidade acima do saldo pendente.';
    END IF;

    v_total := v_total + v_qtd;
    IF v_qtd > 0 THEN
      v_linhas := v_linhas || jsonb_build_array(
        jsonb_build_object('item_id', v_item.id, 'quantidade', v_qtd)
      );
    END IF;
  END LOOP;

  IF NOT v_tem_pendente OR v_total <= 0 THEN
    RAISE EXCEPTION 'Não há saldo pendente para programar.';
  END IF;

  IF v_eh_total THEN
    UPDATE public.simulations
    SET
      status_logistica = 'programado',
      status_logistica_em = now()
    WHERE id = p_simulation_id;

    INSERT INTO public.pedido_logistica_movimentos (
      simulation_id,
      status_anterior,
      status_novo,
      alterado_por
    ) VALUES (
      p_simulation_id,
      'carteira',
      'programado',
      auth.uid()
    );

    INSERT INTO public.pedido_logistica_operacoes (
      idempotency_key,
      simulation_id,
      modo,
      criado_por
    ) VALUES (
      p_idempotency_key,
      p_simulation_id,
      'total',
      auth.uid()
    );

    RETURN jsonb_build_object(
      'modo', 'total',
      'entrega_id', NULL,
      'simulation_id', p_simulation_id,
      'status', 'programado',
      'repetida', false
    );
  END IF;

  INSERT INTO public.pedido_logistica_entregas (
    simulation_id,
    status_logistica,
    criado_por
  ) VALUES (
    p_simulation_id,
    'programado',
    auth.uid()
  )
  RETURNING id INTO v_entrega_id;

  INSERT INTO public.pedido_logistica_entrega_itens (
    entrega_id,
    simulation_item_id,
    quantidade
  )
  SELECT
    v_entrega_id,
    (elem->>'item_id')::uuid,
    (elem->>'quantidade')::numeric
  FROM jsonb_array_elements(v_linhas) AS elem;

  INSERT INTO public.pedido_logistica_movimentos (
    simulation_id,
    entrega_id,
    status_anterior,
    status_novo,
    alterado_por
  ) VALUES (
    p_simulation_id,
    v_entrega_id,
    'carteira',
    'programado',
    auth.uid()
  );

  INSERT INTO public.pedido_logistica_operacoes (
    idempotency_key,
    simulation_id,
    entrega_id,
    modo,
    criado_por
  ) VALUES (
    p_idempotency_key,
    p_simulation_id,
    v_entrega_id,
    'parcial',
    auth.uid()
  );

  RETURN jsonb_build_object(
    'modo', 'parcial',
    'entrega_id', v_entrega_id,
    'simulation_id', p_simulation_id,
    'status', 'programado',
    'repetida', v_repetida
  );
END;
$$;

COMMENT ON FUNCTION public.programar_entrega_logistica(uuid, jsonb, uuid) IS
  'Programa o saldo da carteira. Total muda o status do pedido; parcial grava só a quantidade, no mesmo pedido.';

REVOKE ALL ON FUNCTION public.programar_entrega_logistica(uuid, jsonb, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.programar_entrega_logistica(uuid, jsonb, uuid) TO authenticated;

-- O pedido comercial nasce na Carteira. Edição posterior não mexe no estágio logístico.
CREATE OR REPLACE FUNCTION public.preservar_status_logistica()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status_logistica IS NULL THEN
      NEW.status_logistica := 'carteira';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status IS DISTINCT FROM NEW.status
     AND OLD.status NOT IN ('order_pending', 'converted')
     AND NEW.status IN ('order_pending', 'converted') THEN
    NEW.status_logistica := 'carteira';
    NEW.status_logistica_em := NULL;
    RETURN NEW;
  END IF;

  IF auth.uid() IS NOT NULL AND NOT public.is_logistica() THEN
    IF NEW.status_logistica IS DISTINCT FROM OLD.status_logistica
       OR NEW.status_logistica_em IS DISTINCT FROM OLD.status_logistica_em THEN
      NEW.status_logistica := OLD.status_logistica;
      NEW.status_logistica_em := OLD.status_logistica_em;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.preservar_status_logistica() IS
  'Pedido novo entra em carteira. Quem não é logística não altera o estágio depois disso.';

DROP TRIGGER IF EXISTS simulations_preservar_status_logistica ON public.simulations;

CREATE TRIGGER simulations_preservar_status_logistica
  BEFORE INSERT OR UPDATE ON public.simulations
  FOR EACH ROW
  EXECUTE FUNCTION public.preservar_status_logistica();

NOTIFY pgrst, 'reload schema';
