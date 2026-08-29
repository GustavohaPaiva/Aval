-- Remove tabela de templates de mapeamento (substituída por auto-mapeamento por palavras-chave).

ALTER TABLE public.lotes_importacao
  DROP CONSTRAINT IF EXISTS lotes_importacao_template_id_fkey;

ALTER TABLE public.lotes_importacao
  DROP COLUMN IF EXISTS template_id;

DROP TABLE IF EXISTS public.templates_mapeamento;

NOTIFY pgrst, 'reload schema';
