-- Corrige advisor function_search_path_mutable: fixa search_path da trigger
-- set_updated_at (as demais funções já têm search_path definido).
ALTER FUNCTION public.set_updated_at() SET search_path = '';

NOTIFY pgrst, 'reload schema';
