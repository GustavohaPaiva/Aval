-- Saldo disponível para o simulador (consultor e gestor).
-- Não expõe custo: só produto e kg disponível.

CREATE OR REPLACE FUNCTION public.estoque_disponivel_simulador()
RETURNS TABLE (
  produto_oficial_id uuid,
  nome text,
  referencia_complementar text,
  fornecedor_id uuid,
  disponivel_kg numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    l.produto_oficial_id,
    p.nome,
    COALESCE(p.referencia_complementar, '') AS referencia_complementar,
    p.fornecedor_id,
    SUM(GREATEST(l.quantidade_kg - COALESCE(l.reservado_kg, 0), 0))::numeric(14, 4)
      AS disponivel_kg
  FROM public.estoque_lotes l
  JOIN public.produtos_oficiais p ON p.id = l.produto_oficial_id
  GROUP BY l.produto_oficial_id, p.nome, p.referencia_complementar, p.fornecedor_id
  HAVING SUM(GREATEST(l.quantidade_kg - COALESCE(l.reservado_kg, 0), 0)) > 0.0001;
$$;

COMMENT ON FUNCTION public.estoque_disponivel_simulador() IS
  'Saldo disponível por produto oficial, sem custos. Usado no alerta do simulador.';

REVOKE ALL ON FUNCTION public.estoque_disponivel_simulador() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.estoque_disponivel_simulador() TO authenticated;
