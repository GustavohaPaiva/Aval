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
