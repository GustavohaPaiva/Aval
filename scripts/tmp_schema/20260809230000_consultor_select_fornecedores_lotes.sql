-- Consultores precisam de SELECT em fornecedores e lotes_importacao
-- para o embed do catálogo do simulador (nome do fornecedor + filtro de lote ativo).
-- Escrita continua exclusiva de gestores.

CREATE POLICY "fornecedores_consultor_select"
  ON public.fornecedores
  FOR SELECT
  TO authenticated
  USING (public.is_consultor());

CREATE POLICY "lotes_importacao_consultor_select"
  ON public.lotes_importacao
  FOR SELECT
  TO authenticated
  USING (public.is_consultor());
