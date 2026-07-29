-- >>> FILE: 20260716120000_simulation_items_produtos_oficiais_clients_cnpj_optional.sql
-- 1) simulation_items.product_id → produtos_oficiais (catálogo oficial do simulador)
-- 2) GRANT DELETE em simulation_items (replace de itens no save pending)
-- 3) clients.cnpj_cpf opcional (cadastro só com nome)

-- ---------------------------------------------------------------------------
-- simulation_items → produtos_oficiais
-- ---------------------------------------------------------------------------
DELETE FROM public.simulation_items si
WHERE NOT EXISTS (
  SELECT 1 FROM public.produtos_oficiais po WHERE po.id = si.product_id
);

ALTER TABLE public.simulation_items
  DROP CONSTRAINT IF EXISTS simulation_items_product_id_fkey;

ALTER TABLE public.simulation_items
  ADD CONSTRAINT simulation_items_product_id_fkey
  FOREIGN KEY (product_id)
  REFERENCES public.produtos_oficiais (id)
  ON DELETE RESTRICT;

GRANT DELETE ON public.simulation_items TO authenticated;

-- ---------------------------------------------------------------------------
-- clients: CPF/CNPJ opcional
-- ---------------------------------------------------------------------------
ALTER TABLE public.clients
  DROP CONSTRAINT IF EXISTS clients_cnpj_cpf_not_empty;

ALTER TABLE public.clients
  ALTER COLUMN cnpj_cpf DROP NOT NULL;

UPDATE public.clients
SET cnpj_cpf = NULL
WHERE cnpj_cpf IS NOT NULL AND length(trim(cnpj_cpf)) = 0;

DROP INDEX IF EXISTS public.clients_cnpj_cpf_unique_idx;

CREATE UNIQUE INDEX clients_cnpj_cpf_unique_idx
  ON public.clients (lower(trim(cnpj_cpf)))
  WHERE cnpj_cpf IS NOT NULL AND length(trim(cnpj_cpf)) > 0;

NOTIFY pgrst, 'reload schema';

-- >>> FILE: 20260717120000_clients_ativo.sql
-- clients.ativo: permite inativar cliente sem apagar histórico
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS ativo boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS clients_ativo_idx
  ON public.clients (ativo)
  WHERE ativo = true;

COMMENT ON COLUMN public.clients.ativo IS
  'Cliente ativo pode receber lançamentos e aparece no select do simulador.';

NOTIFY pgrst, 'reload schema';

-- >>> FILE: 20260717150000_simulations_delete_for_rollback.sql
-- Permite rollback de simulação órfã quando o insert de itens falha
GRANT DELETE ON public.simulations TO authenticated;

-- >>> FILE: 20260717180000_rls_enable_core_delete_policies.sql
-- Reativa RLS nas tabelas-core e adiciona policies DELETE
-- necessárias para replace de itens / rollback de simulação órfã.
-- Policies DELETE são criadas antes do ENABLE para evitar janela quebrada.

-- ---------------------------------------------------------------------------
-- simulation_items DELETE
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "simulation_items_delete_consultor_own_simulation"
  ON public.simulation_items;
CREATE POLICY "simulation_items_delete_consultor_own_simulation"
  ON public.simulation_items
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.simulations s
      WHERE s.id = simulation_items.simulation_id
        AND s.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'consultor'::public.user_role
    )
  );

DROP POLICY IF EXISTS "simulation_items_delete_gestor_all"
  ON public.simulation_items;
CREATE POLICY "simulation_items_delete_gestor_all"
  ON public.simulation_items
  FOR DELETE
  TO authenticated
  USING (public.is_gestor());

GRANT DELETE ON public.simulation_items TO authenticated;

-- ---------------------------------------------------------------------------
-- simulations DELETE (rollback de insert órfão)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "simulations_delete_consultor_own"
  ON public.simulations;
CREATE POLICY "simulations_delete_consultor_own"
  ON public.simulations
  FOR DELETE
  TO authenticated
  USING (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'consultor'::public.user_role
    )
  );

DROP POLICY IF EXISTS "simulations_delete_gestor_all"
  ON public.simulations;
CREATE POLICY "simulations_delete_gestor_all"
  ON public.simulations
  FOR DELETE
  TO authenticated
  USING (public.is_gestor());

GRANT DELETE ON public.simulations TO authenticated;

-- ---------------------------------------------------------------------------
-- Reativar RLS (policies SELECT/INSERT/UPDATE já existiam)
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.simulations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.simulation_items ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';

-- >>> FILE: 20260717180100_revoke_sensitive_rpc_from_anon.sql
-- Revoga EXECUTE de RPCs sensíveis do role anon / PUBLIC.
-- Mantém EXECUTE para authenticated onde a app chama via sessão.

REVOKE EXECUTE ON FUNCTION public.create_consultant(text, text, text) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_consultant(text, text, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.update_consultant(uuid, text, text, text) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_consultant(uuid, text, text, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_consultant_email(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_consultant_email(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.promover_lote_importacao(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.promover_lote_importacao(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.inativar_lista_importacao(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.inativar_lista_importacao(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.reativar_lista_importacao(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.reativar_lista_importacao(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.notify_gestores_simulation_pending(uuid, text, text) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.notify_gestores_simulation_pending(uuid, text, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.notify_consultor_simulation_decision(uuid, public.notification_type, text, text) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.notify_consultor_simulation_decision(uuid, public.notification_type, text, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.is_gestor() FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_gestor() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.is_consultor() FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_consultor() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_taxa_conversao_vigente(text) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_taxa_conversao_vigente(text) TO authenticated;

-- Internas: não devem ser chamáveis via PostgREST por anon/authenticated
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, PUBLIC, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_cotacoes_moeda_atualizar_precos_internos() FROM anon, PUBLIC, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM anon, PUBLIC, authenticated;

NOTIFY pgrst, 'reload schema';

-- >>> FILE: 20260717190000_set_updated_at_search_path.sql
-- Corrige advisor function_search_path_mutable: fixa search_path da trigger
-- set_updated_at (as demais funções já têm search_path definido).
ALTER FUNCTION public.set_updated_at() SET search_path = '';

NOTIFY pgrst, 'reload schema';

-- >>> FILE: 20260717190100_rls_initplan_optimize.sql
-- Performance: evita reavaliação de auth.uid() por linha nas policies RLS
-- (advisor auth_rls_initplan). Troca auth.uid() por (select auth.uid()),
-- mantendo a mesma semântica.

-- clients
ALTER POLICY "clients_insert_consultor" ON public.clients
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (select auth.uid()) AND p.role = 'consultor'::public.user_role
    )
  );

ALTER POLICY "clients_update_if_linked_to_own_simulation" ON public.clients
  USING (
    EXISTS (
      SELECT 1 FROM public.simulations s
      WHERE s.client_id = clients.id AND s.user_id = (select auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.simulations s
      WHERE s.client_id = clients.id AND s.user_id = (select auth.uid())
    )
  );

-- cotacoes_moeda
ALTER POLICY "cotacoes_moeda_gestor_insert" ON public.cotacoes_moeda
  WITH CHECK (public.is_gestor() AND (criado_por = (select auth.uid())));

-- notifications
ALTER POLICY "notifications_select_own" ON public.notifications
  USING (recipient_id = (select auth.uid()));

ALTER POLICY "notifications_update_own" ON public.notifications
  USING (recipient_id = (select auth.uid()))
  WITH CHECK (recipient_id = (select auth.uid()));

-- profiles
ALTER POLICY "profiles_insert_own" ON public.profiles
  WITH CHECK (id = (select auth.uid()));

ALTER POLICY "profiles_select_own" ON public.profiles
  USING (id = (select auth.uid()));

ALTER POLICY "profiles_update_own_or_gestor" ON public.profiles
  USING ((id = (select auth.uid())) OR public.is_gestor())
  WITH CHECK ((id = (select auth.uid())) OR public.is_gestor());

-- simulations
ALTER POLICY "simulations_select_consultor_own" ON public.simulations
  USING (
    (user_id = (select auth.uid()))
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (select auth.uid()) AND p.role = 'consultor'::public.user_role
    )
  );

ALTER POLICY "simulations_insert_consultor_own" ON public.simulations
  WITH CHECK (
    (user_id = (select auth.uid()))
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (select auth.uid()) AND p.role = 'consultor'::public.user_role
    )
  );

ALTER POLICY "simulations_update_consultor_own" ON public.simulations
  USING (
    (user_id = (select auth.uid()))
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (select auth.uid()) AND p.role = 'consultor'::public.user_role
    )
  )
  WITH CHECK (
    (user_id = (select auth.uid()))
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (select auth.uid()) AND p.role = 'consultor'::public.user_role
    )
  );

ALTER POLICY "simulations_delete_consultor_own" ON public.simulations
  USING (
    (user_id = (select auth.uid()))
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (select auth.uid()) AND p.role = 'consultor'::public.user_role
    )
  );

-- simulation_items
ALTER POLICY "simulation_items_select_consultor_via_simulation" ON public.simulation_items
  USING (
    EXISTS (
      SELECT 1 FROM public.simulations s
      WHERE s.id = simulation_items.simulation_id AND s.user_id = (select auth.uid())
    )
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (select auth.uid()) AND p.role = 'consultor'::public.user_role
    )
  );

ALTER POLICY "simulation_items_insert_consultor_own_simulation" ON public.simulation_items
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.simulations s
      WHERE s.id = simulation_items.simulation_id AND s.user_id = (select auth.uid())
    )
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (select auth.uid()) AND p.role = 'consultor'::public.user_role
    )
  );

ALTER POLICY "simulation_items_update_consultor_own_simulation" ON public.simulation_items
  USING (
    EXISTS (
      SELECT 1 FROM public.simulations s
      WHERE s.id = simulation_items.simulation_id AND s.user_id = (select auth.uid())
    )
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (select auth.uid()) AND p.role = 'consultor'::public.user_role
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.simulations s
      WHERE s.id = simulation_items.simulation_id AND s.user_id = (select auth.uid())
    )
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (select auth.uid()) AND p.role = 'consultor'::public.user_role
    )
  );

ALTER POLICY "simulation_items_delete_consultor_own_simulation" ON public.simulation_items
  USING (
    EXISTS (
      SELECT 1 FROM public.simulations s
      WHERE s.id = simulation_items.simulation_id AND s.user_id = (select auth.uid())
    )
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (select auth.uid()) AND p.role = 'consultor'::public.user_role
    )
  );

NOTIFY pgrst, 'reload schema';

-- >>> FILE: 20260722150000_gestor_simulation_insert_policies.sql
-- Permite gestores criarem/possuírem simulações e inserirem itens.
-- Necessário após a UI passar a oferecer "Nova simulação" também para gestores.

DROP POLICY IF EXISTS "simulations_insert_gestor_own" ON public.simulations;
CREATE POLICY "simulations_insert_gestor_own"
  ON public.simulations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_gestor()
    AND user_id = (select auth.uid())
  );

DROP POLICY IF EXISTS "simulation_items_insert_gestor" ON public.simulation_items;
CREATE POLICY "simulation_items_insert_gestor"
  ON public.simulation_items
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_gestor());

NOTIFY pgrst, 'reload schema';

-- >>> FILE: 20260722160000_parametros_sistema_icms.sql
-- Parâmetros do sistema (singleton) + ICMS parametrizável no lançamento de produtos.
-- Dólar continua em cotacoes_moeda; PIS/COFINS e Margem são apenas armazenamento.

CREATE TABLE IF NOT EXISTS public.parametros_sistema (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  icms_percentual numeric(8, 4) NOT NULL DEFAULT 4
    CHECK (icms_percentual >= 0 AND icms_percentual < 100),
  pis_cofins_percentual numeric(8, 4) NULL
    CHECK (pis_cofins_percentual IS NULL OR (pis_cofins_percentual >= 0 AND pis_cofins_percentual < 100)),
  margem_percentual numeric(8, 4) NULL
    CHECK (margem_percentual IS NULL OR margem_percentual >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL
);

COMMENT ON TABLE public.parametros_sistema IS
  'Parâmetros globais editáveis (singleton id=1). ICMS afeta custo_icms em novos lançamentos; PIS/COFINS e margem são armazenamento futuro.';

COMMENT ON COLUMN public.parametros_sistema.icms_percentual IS
  'Percentual de ICMS aplicado sobre o custo R$ no lançamento: custo_icms = preco_interno * (1 - icms/100).';

INSERT INTO public.parametros_sistema (id, icms_percentual)
VALUES (1, 4)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.get_icms_fator()
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT (1 - (ps.icms_percentual / 100.0))::numeric
      FROM public.parametros_sistema ps
      WHERE ps.id = 1
    ),
    0.96
  );
$$;

COMMENT ON FUNCTION public.get_icms_fator() IS
  'Fator multiplicador do custo R$ para obter custo_icms (ex.: ICMS 4% → 0.96).';

REVOKE ALL ON FUNCTION public.get_icms_fator() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_icms_fator() TO authenticated, service_role;

-- custo_icms deixa de ser coluna gerada com 4% fixo e passa a ser preenchida por trigger.
-- Idempotente: só faz DROP EXPRESSION se a coluna ainda for generated stored.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'produtos_oficiais'
      AND a.attname = 'custo_icms'
      AND a.attnum > 0
      AND NOT a.attisdropped
      AND a.attgenerated = 's'
  ) THEN
    ALTER TABLE public.produtos_oficiais
      ALTER COLUMN custo_icms DROP EXPRESSION;
  END IF;
END
$$;

UPDATE public.produtos_oficiais
SET custo_icms = round((preco_interno_calculado * public.get_icms_fator())::numeric, 2)
WHERE custo_icms IS NULL
   OR custo_icms IS DISTINCT FROM round((preco_interno_calculado * public.get_icms_fator())::numeric, 2);

CREATE OR REPLACE FUNCTION public.trg_produtos_oficiais_set_custo_icms()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Só recalcula no insert/atualização de preço interno (lançamento ou dólar).
  -- Alterar ICMS em parametros_sistema NÃO atualiza produtos já lançados.
  NEW.custo_icms := round((NEW.preco_interno_calculado * public.get_icms_fator())::numeric, 2);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS produtos_oficiais_before_set_custo_icms ON public.produtos_oficiais;
CREATE TRIGGER produtos_oficiais_before_set_custo_icms
  BEFORE INSERT OR UPDATE OF preco_interno_calculado
  ON public.produtos_oficiais
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_produtos_oficiais_set_custo_icms();

COMMENT ON FUNCTION public.trg_produtos_oficiais_set_custo_icms() IS
  'Define custo_icms a partir do ICMS cadastrado em parametros_sistema no lançamento/atualização de preço interno.';

REVOKE ALL ON FUNCTION public.trg_produtos_oficiais_set_custo_icms() FROM PUBLIC, anon, authenticated;

-- RLS
ALTER TABLE public.parametros_sistema ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "parametros_sistema_select_authenticated" ON public.parametros_sistema;
CREATE POLICY "parametros_sistema_select_authenticated"
  ON public.parametros_sistema
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "parametros_sistema_update_gestor" ON public.parametros_sistema;
CREATE POLICY "parametros_sistema_update_gestor"
  ON public.parametros_sistema
  FOR UPDATE
  TO authenticated
  USING (public.is_gestor())
  WITH CHECK (public.is_gestor());

GRANT SELECT ON public.parametros_sistema TO authenticated, service_role;
GRANT UPDATE ON public.parametros_sistema TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

-- >>> FILE: 20260722170000_comissao_faixas_registros.sql
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

-- >>> FILE: 20260727120000_profiles_filial_consultant_rpcs.sql
-- =============================================================================
-- Syagri — filial em profiles + create/update_consultant com p_filial
-- =============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS filial text;

COMMENT ON COLUMN public.profiles.filial IS
  'Filial do consultor (texto livre; preenchimento manual).';

-- Drop old signatures before recreating with optional p_filial
DROP FUNCTION IF EXISTS public.create_consultant(text, text, text);
DROP FUNCTION IF EXISTS public.update_consultant(uuid, text, text, text);

CREATE OR REPLACE FUNCTION public.create_consultant(
  p_email text,
  p_password text,
  p_nome text,
  p_filial text DEFAULT NULL
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
  v_filial text := NULLIF(trim(p_filial), '');
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  IF NOT public.is_gestor() THEN
    RAISE EXCEPTION 'Apenas gestores podem criar consultores';
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
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    recovery_sent_at,
    last_sign_in_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    email_change,
    email_change_token_new,
    recovery_token
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    v_new_id,
    'authenticated',
    'authenticated',
    v_email,
    crypt(p_password, gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('nome', v_nome),
    now(),
    now(),
    '',
    '',
    '',
    ''
  );

  INSERT INTO auth.identities (
    id,
    user_id,
    provider_id,
    identity_data,
    provider,
    last_sign_in_at,
    created_at,
    updated_at
  ) VALUES (
    gen_random_uuid(),
    v_new_id,
    v_new_id,
    jsonb_build_object('sub', v_new_id::text, 'email', v_email),
    'email',
    now(),
    now(),
    now()
  );

  -- Trigger cria o profile; garante filial se informada.
  IF v_filial IS NOT NULL THEN
    UPDATE public.profiles
    SET filial = v_filial
    WHERE id = v_new_id;
  END IF;

  RETURN v_new_id;
END;
$$;

COMMENT ON FUNCTION public.create_consultant(text, text, text, text) IS
  'Gestor cria usuário e-mail/senha em auth + identity; perfil consultor via trigger; filial opcional.';

REVOKE ALL ON FUNCTION public.create_consultant(text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_consultant(text, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_consultant(
  p_consultor_id uuid,
  p_nome text DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_password text DEFAULT NULL,
  p_filial text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = extensions, auth, public, pg_temp
AS $$
DECLARE
  v_nome text;
  v_email text;
  v_filial text;
  v_touch_filial boolean := (p_filial IS NOT NULL);
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  IF NOT public.is_gestor() THEN
    RAISE EXCEPTION 'Apenas gestores podem atualizar consultores';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = p_consultor_id
      AND p.role = 'consultor'::public.user_role
  ) THEN
    RAISE EXCEPTION 'Consultor não encontrado';
  END IF;

  v_nome := NULLIF(trim(p_nome), '');
  IF v_nome IS NOT NULL AND length(v_nome) = 0 THEN
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
    SELECT 1
    FROM auth.users u
    WHERE lower(u.email) = v_email
      AND u.id <> p_consultor_id
  ) THEN
    RAISE EXCEPTION 'E-mail já cadastrado';
  END IF;

  -- Empty string clears filial; NULL (omitted) leaves unchanged.
  IF v_touch_filial THEN
    v_filial := NULLIF(trim(p_filial), '');
    UPDATE public.profiles
    SET filial = v_filial
    WHERE id = p_consultor_id;
  END IF;

  IF v_nome IS NOT NULL THEN
    UPDATE public.profiles
    SET nome = v_nome
    WHERE id = p_consultor_id;
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
    WHERE id = p_consultor_id;

    IF v_email IS NOT NULL THEN
      UPDATE auth.identities
      SET
        identity_data = jsonb_set(
          COALESCE(identity_data, '{}'::jsonb),
          '{email}',
          to_jsonb(v_email)
        ),
        updated_at = now()
      WHERE user_id = p_consultor_id
        AND provider = 'email';
    END IF;
  ELSIF v_nome IS NOT NULL THEN
    UPDATE auth.users
    SET
      raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('nome', v_nome),
      updated_at = now()
    WHERE id = p_consultor_id;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.update_consultant(uuid, text, text, text, text) IS
  'Gestor atualiza nome/filial (profiles), e-mail e/ou senha (auth) de um consultor.';

REVOKE ALL ON FUNCTION public.update_consultant(uuid, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_consultant(uuid, text, text, text, text) TO authenticated;

-- >>> FILE: 20260727124427_add_pedido_fields_to_simulations.sql
-- Campos da tela de pedido em simulations (faltava no Git; já aplicado em prod)

ALTER TABLE public.simulations
  ADD COLUMN IF NOT EXISTS fazenda text,
  ADD COLUMN IF NOT EXISTS pedido_municipio text,
  ADD COLUMN IF NOT EXISTS pedido_uf text,
  ADD COLUMN IF NOT EXISTS prazo_dias integer NOT NULL DEFAULT 14;

ALTER TABLE public.simulations
  DROP CONSTRAINT IF EXISTS simulations_prazo_dias_check;

ALTER TABLE public.simulations
  ADD CONSTRAINT simulations_prazo_dias_check
  CHECK (prazo_dias IN (7, 14, 21));

ALTER TABLE public.simulations
  DROP CONSTRAINT IF EXISTS simulations_pedido_uf_check;

ALTER TABLE public.simulations
  ADD CONSTRAINT simulations_pedido_uf_check
  CHECK (pedido_uf IS NULL OR pedido_uf IN ('MG', 'SP'));

COMMENT ON COLUMN public.simulations.fazenda IS 'Nome da fazenda informado na tela de pedido';
COMMENT ON COLUMN public.simulations.pedido_municipio IS 'Município do pedido (catálogo IBGE)';
COMMENT ON COLUMN public.simulations.pedido_uf IS 'UF do pedido (MG ou SP)';
COMMENT ON COLUMN public.simulations.prazo_dias IS 'Prazo de validade da proposta em dias (7, 14 ou 21)';

-- >>> FILE: 20260727180000_excluir_lista_importacao.sql
-- Exclui apenas a lista (lote). Produtos oficiais permanecem (lote_id → NULL via FK).
-- Staging é removido por ON DELETE CASCADE. Simulações e demais vínculos não são alterados.

CREATE OR REPLACE FUNCTION public.excluir_lista_importacao(p_lote_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_produtos_desvinculados int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sessão inválida.';
  END IF;

  IF NOT public.is_gestor() THEN
    RAISE EXCEPTION 'Acesso negado.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.lotes_importacao WHERE id = p_lote_id
  ) THEN
    RAISE EXCEPTION 'Lista de produtos não encontrada.';
  END IF;

  SELECT count(*)::int INTO v_produtos_desvinculados
  FROM public.produtos_oficiais
  WHERE lote_id = p_lote_id;

  DELETE FROM public.lotes_importacao
  WHERE id = p_lote_id;

  RETURN jsonb_build_object(
    'produtos_desvinculados', v_produtos_desvinculados,
    'lista_excluida', true
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.excluir_lista_importacao(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.excluir_lista_importacao(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- >>> FILE: 20260727190000_parametros_sistema_seed_upsert.sql
-- Garante o singleton de parâmetros e permite upsert pelo gestor.

INSERT INTO public.parametros_sistema (id, icms_percentual)
VALUES (1, 4)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "parametros_sistema_insert_gestor" ON public.parametros_sistema;
CREATE POLICY "parametros_sistema_insert_gestor"
  ON public.parametros_sistema
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_gestor() AND id = 1);

GRANT INSERT ON public.parametros_sistema TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

