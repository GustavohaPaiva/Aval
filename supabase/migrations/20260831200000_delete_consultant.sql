-- Gestor exclui consultor (auth.users + profile). Bloqueia se houver histórico,
-- porque simulations.user_id é ON DELETE CASCADE.

CREATE OR REPLACE FUNCTION public.delete_consultant(p_consultor_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = extensions, auth, public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  IF NOT public.is_gestor() THEN
    RAISE EXCEPTION 'Apenas gestores podem excluir consultores';
  END IF;

  IF p_consultor_id IS NULL THEN
    RAISE EXCEPTION 'Consultor não informado';
  END IF;

  IF p_consultor_id = auth.uid() THEN
    RAISE EXCEPTION 'Não é possível excluir o próprio usuário';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = p_consultor_id
      AND p.role = 'consultor'::public.user_role
  ) THEN
    RAISE EXCEPTION 'Consultor não encontrado';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.simulations s WHERE s.user_id = p_consultor_id
  ) OR EXISTS (
    SELECT 1 FROM public.comissao_registros r WHERE r.consultor_id = p_consultor_id
  ) OR EXISTS (
    SELECT 1 FROM public.lotes_importacao l WHERE l.usuario_id = p_consultor_id
  ) OR EXISTS (
    SELECT 1 FROM public.cotacoes_moeda c WHERE c.criado_por = p_consultor_id
  ) THEN
    RAISE EXCEPTION
      'Não é possível excluir: este consultor possui simulações, pedidos ou outros registros vinculados.';
  END IF;

  DELETE FROM auth.users
  WHERE id = p_consultor_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Consultor não encontrado';
  END IF;
END;
$$;

COMMENT ON FUNCTION public.delete_consultant(uuid) IS
  'Gestor remove consultor de auth + perfil. Bloqueia quando há simulações, comissões ou outros vínculos.';

REVOKE ALL ON FUNCTION public.delete_consultant(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_consultant(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
