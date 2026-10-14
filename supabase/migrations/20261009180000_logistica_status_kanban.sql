-- Status operacional da logística, independente do status comercial (simulations.status)
-- e de qualquer acompanhamento financeiro. Pedidos já existentes entram em
-- "aguardando_inicio": antes desta coluna não havia estágio logístico registrado.

ALTER TABLE public.simulations
  ADD COLUMN IF NOT EXISTS status_logistica text,
  ADD COLUMN IF NOT EXISTS status_logistica_em timestamptz;

UPDATE public.simulations
SET status_logistica = 'aguardando_inicio'
WHERE status_logistica IS NULL;

ALTER TABLE public.simulations
  ALTER COLUMN status_logistica SET DEFAULT 'aguardando_inicio',
  ALTER COLUMN status_logistica SET NOT NULL;

ALTER TABLE public.simulations
  DROP CONSTRAINT IF EXISTS simulations_status_logistica_check;

ALTER TABLE public.simulations
  ADD CONSTRAINT simulations_status_logistica_check CHECK (
    status_logistica IN (
      'aguardando_inicio',
      'em_andamento',
      'pedido_realizado',
      'aguardando_recebimento',
      'concluido'
    )
  );

COMMENT ON COLUMN public.simulations.status_logistica IS
  'Estágio do Kanban de logística. Não altera simulations.status (comercial).';

COMMENT ON COLUMN public.simulations.status_logistica_em IS
  'Momento da última mudança de status_logistica. Nulo enquanto ninguém moveu o pedido.';

CREATE TABLE IF NOT EXISTS public.pedido_logistica_movimentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  simulation_id uuid NOT NULL REFERENCES public.simulations (id) ON DELETE CASCADE,
  status_anterior text,
  status_novo text NOT NULL,
  alterado_por uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  alterado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pedido_logistica_movimentos_status_anterior_check CHECK (
    status_anterior IS NULL
    OR status_anterior IN (
      'aguardando_inicio',
      'em_andamento',
      'pedido_realizado',
      'aguardando_recebimento',
      'concluido'
    )
  ),
  CONSTRAINT pedido_logistica_movimentos_status_novo_check CHECK (
    status_novo IN (
      'aguardando_inicio',
      'em_andamento',
      'pedido_realizado',
      'aguardando_recebimento',
      'concluido'
    )
  )
);

CREATE INDEX IF NOT EXISTS pedido_logistica_movimentos_simulation_idx
  ON public.pedido_logistica_movimentos (simulation_id, alterado_em DESC);

COMMENT ON TABLE public.pedido_logistica_movimentos IS
  'Histórico de mudanças do status logístico. Escrita apenas pela RPC atualizar_status_logistica.';

ALTER TABLE public.pedido_logistica_movimentos ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.pedido_logistica_movimentos FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.pedido_logistica_movimentos TO authenticated;

DROP POLICY IF EXISTS "pedido_logistica_movimentos_select_logistica"
  ON public.pedido_logistica_movimentos;

CREATE POLICY "pedido_logistica_movimentos_select_logistica"
  ON public.pedido_logistica_movimentos
  FOR SELECT
  TO authenticated
  USING (
    (SELECT public.is_logistica())
    AND public.pedido_visivel_logistica(simulation_id)
  );

-- Impede que gestor/consultor sobrescrevam o estágio ao editar o pedido comercial.
-- auth.uid() nulo (migration / service role) continua podendo ajustar a coluna.
CREATE OR REPLACE FUNCTION public.preservar_status_logistica()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
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

DROP TRIGGER IF EXISTS simulations_preservar_status_logistica ON public.simulations;

CREATE TRIGGER simulations_preservar_status_logistica
  BEFORE UPDATE ON public.simulations
  FOR EACH ROW
  EXECUTE FUNCTION public.preservar_status_logistica();

COMMENT ON FUNCTION public.preservar_status_logistica() IS
  'Reverte mudança de status logístico feita por usuário autenticado que não é logística.';

REVOKE ALL ON FUNCTION public.preservar_status_logistica() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preservar_status_logistica() TO authenticated, service_role;

-- Nomes de produto só para pedidos que a logística já pode ver. Não expõe preço nem custo.
CREATE OR REPLACE FUNCTION public.logistica_resumo_itens(p_simulation_id uuid DEFAULT NULL)
RETURNS TABLE (
  simulation_id uuid,
  item_id uuid,
  nome text,
  referencia_complementar text,
  fornecedor_nome text,
  volume numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    si.simulation_id,
    si.id,
    po.nome,
    po.referencia_complementar,
    f.nome,
    si.volume
  FROM public.simulation_items si
  JOIN public.produtos_oficiais po ON po.id = si.product_id
  LEFT JOIN public.fornecedores f ON f.id = po.fornecedor_id
  WHERE (SELECT public.is_logistica())
    AND public.pedido_visivel_logistica(si.simulation_id)
    AND (p_simulation_id IS NULL OR si.simulation_id = p_simulation_id)
  ORDER BY po.nome;
$$;

COMMENT ON FUNCTION public.logistica_resumo_itens(uuid) IS
  'Resumo operacional dos itens (nome, fornecedor e volume) dos pedidos visíveis à logística.';

REVOKE ALL ON FUNCTION public.logistica_resumo_itens(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.logistica_resumo_itens(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.atualizar_status_logistica(
  p_simulation_id uuid,
  p_status text,
  p_status_esperado text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_atual text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sessão inválida.';
  END IF;

  IF NOT public.is_logistica() THEN
    RAISE EXCEPTION 'Acesso negado.';
  END IF;

  IF p_status IS NULL OR p_status NOT IN (
    'aguardando_inicio',
    'em_andamento',
    'pedido_realizado',
    'aguardando_recebimento',
    'concluido'
  ) THEN
    RAISE EXCEPTION 'Status logístico inválido.';
  END IF;

  IF NOT public.pedido_visivel_logistica(p_simulation_id) THEN
    RAISE EXCEPTION 'Pedido não encontrado.';
  END IF;

  SELECT s.status_logistica
  INTO v_atual
  FROM public.simulations s
  WHERE s.id = p_simulation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido não encontrado.';
  END IF;

  IF p_status_esperado IS NOT NULL AND v_atual IS DISTINCT FROM p_status_esperado THEN
    RAISE EXCEPTION 'O pedido foi atualizado por outra pessoa. Atualize a tela e tente de novo.';
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

COMMENT ON FUNCTION public.atualizar_status_logistica(uuid, text, text) IS
  'Move o pedido no Kanban de logística. Não altera o status comercial.';

REVOKE ALL ON FUNCTION public.atualizar_status_logistica(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.atualizar_status_logistica(uuid, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
