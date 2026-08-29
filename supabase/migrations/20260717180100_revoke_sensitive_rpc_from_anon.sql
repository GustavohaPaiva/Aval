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
