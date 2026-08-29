-- Eventos adicionais enviados a consultores e configuração segura do telefone.

ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'exchange_rate_changed';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'price_list_changed';

CREATE OR REPLACE FUNCTION public.set_profile_whatsapp(
  p_profile_id uuid,
  p_phone_e164 text,
  p_enabled boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_phone text := NULLIF(trim(p_phone_e164), '');
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  IF auth.uid() <> p_profile_id AND NOT public.is_gestor() THEN
    RAISE EXCEPTION 'Sem permissão para alterar este perfil';
  END IF;

  IF coalesce(p_enabled, false) AND v_phone IS NULL THEN
    RAISE EXCEPTION 'Informe o telefone para ativar as notificações';
  END IF;

  IF v_phone IS NOT NULL AND v_phone !~ '^\+[1-9][0-9]{7,14}$' THEN
    RAISE EXCEPTION 'Telefone inválido. Use o formato E.164, por exemplo +5534999999999';
  END IF;

  UPDATE public.profiles
  SET whatsapp_phone_e164 = v_phone,
      whatsapp_notifications_enabled = coalesce(p_enabled, false)
  WHERE id = p_profile_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'Perfil não encontrado'; END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_profile_whatsapp(uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_profile_whatsapp(uuid, text, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.notify_consultores_exchange_rate_changed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.notifications (recipient_id, sender_id, type, title, body)
  SELECT
    p.id,
    NEW.criado_por,
    'exchange_rate_changed'::public.notification_type,
    'Valor do dólar atualizado',
    format(
      'Nova cotação de %s: R$ %s. Vigência: %s.',
      upper(trim(NEW.moeda_origem)),
      trim(to_char(NEW.taxa_conversao, 'FM999999990D000000')),
      to_char(NEW.data_vigencia AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI')
    )
  FROM public.profiles p
  WHERE p.role = 'consultor'::public.user_role;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_consultores_exchange_rate_changed() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS cotacoes_moeda_notify_consultores ON public.cotacoes_moeda;
CREATE TRIGGER cotacoes_moeda_notify_consultores
  AFTER INSERT ON public.cotacoes_moeda
  FOR EACH ROW EXECUTE FUNCTION public.notify_consultores_exchange_rate_changed();

CREATE OR REPLACE FUNCTION public.notify_consultores_price_list_changed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_title text;
BEGIN
  IF NEW.status <> 'concluido'::public.lote_importacao_status OR NOT coalesce(NEW.ativo, true) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'concluido'::public.lote_importacao_status
       AND coalesce(OLD.ativo, true) THEN
      RETURN NEW;
    END IF;

    IF coalesce(OLD.ativo, false) = false THEN
      v_title := 'Lista de preços reativada';
    ELSE
      v_title := 'Nova lista de preços disponível';
    END IF;
  ELSE
    v_title := 'Nova lista de preços disponível';
  END IF;

  INSERT INTO public.notifications (recipient_id, sender_id, type, title, body)
  SELECT
    p.id,
    NEW.usuario_id,
    'price_list_changed'::public.notification_type,
    v_title,
    concat_ws(
      ' · ',
      coalesce((SELECT f.nome FROM public.fornecedores f WHERE f.id = NEW.fornecedor_id), 'Fornecedor'),
      NULLIF(NEW.quarter_calculado, ''),
      NULLIF(NEW.estado_padrao, '')
    )
  FROM public.profiles p
  WHERE p.role = 'consultor'::public.user_role;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_consultores_price_list_changed() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS lotes_importacao_notify_consultores ON public.lotes_importacao;
CREATE TRIGGER lotes_importacao_notify_consultores
  AFTER INSERT OR UPDATE OF status, ativo ON public.lotes_importacao
  FOR EACH ROW EXECUTE FUNCTION public.notify_consultores_price_list_changed();

NOTIFY pgrst, 'reload schema';
