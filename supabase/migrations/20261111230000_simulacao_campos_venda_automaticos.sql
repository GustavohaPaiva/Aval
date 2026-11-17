-- Campos de venda deixam de ser editados na simulação.
-- Nova linha nasce com a data de criação em America/Sao_Paulo, filial do perfil
-- (gestor = uberaba), tipo reais e lançamento lancado.
-- Update não regrava data, filial, tipo, safra nem lançamento já persistidos.
-- Não apaga coluna, linha nem valor histórico.
--
-- ROLLBACK do gatilho e do default, sem apagar dados:
-- DROP TRIGGER IF EXISTS simulations_campos_venda ON public.simulations;
-- DROP FUNCTION IF EXISTS public.trg_simulations_campos_venda();
-- recriar trg_simulations_status_lancamento a partir de 20261106193000_dashboard_vendas_gestor.sql;
-- ALTER TABLE public.simulations ALTER COLUMN status_lancamento SET DEFAULT 'nao_lancado';
-- O preenchimento de data_negociacao nula e a normalização de alias de filial
-- não são revertidos aqui: voltar o texto antigo apagaria a forma canônica
-- e zerar a data apagaria também uma data gravada de propósito no mesmo dia.

CREATE OR REPLACE FUNCTION public.normalize_filial_codigo(value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN value IS NULL OR btrim(value) = '' THEN NULL
    ELSE (
      SELECT CASE folded
        WHEN 'uberaba' THEN 'uberaba'
        WHEN 'filial uberaba' THEN 'uberaba'
        WHEN 'nova ponte' THEN 'nova-ponte'
        WHEN 'matriz nova ponte' THEN 'nova-ponte'
        WHEN 'matriz' THEN 'nova-ponte'
        WHEN 'nova ponte mg' THEN 'nova-ponte'
        WHEN 'filial nova ponte' THEN 'nova-ponte'
        WHEN 'guaira' THEN 'guaira'
        WHEN 'filial guaira' THEN 'guaira'
        WHEN 'ituverava' THEN 'ituverava'
        WHEN 'filial ituverava' THEN 'ituverava'
        WHEN 'frutal' THEN 'frutal'
        WHEN 'filial frutal' THEN 'frutal'
        ELSE btrim(value)
      END
      FROM (
        SELECT lower(
          regexp_replace(
            translate(
              regexp_replace(btrim(value), '[-_]+', ' ', 'g'),
              'ÁÀÃÂáàãâÉÈÊéèêÍÌÎíìîÓÒÕÔóòõôÚÙÛúùûÇç',
              'AAAAaaaaEEEeeeIIIiiiOOOOooooUUUuuuCc'
            ),
            '\s+',
            ' ',
            'g'
          )
        ) AS folded
      ) AS folded_source
    )
  END;
$$;

COMMENT ON FUNCTION public.normalize_filial_codigo(text) IS
  'Converte alias conhecidos para o código da filial. Texto desconhecido é mantido.';

REVOKE ALL ON FUNCTION public.normalize_filial_codigo(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.normalize_filial_codigo(text) TO authenticated;

UPDATE public.simulations
SET data_negociacao = (created_at AT TIME ZONE 'America/Sao_Paulo')::date
WHERE data_negociacao IS NULL
  AND created_at IS NOT NULL;

UPDATE public.simulations
SET filial_venda = public.normalize_filial_codigo(filial_venda)
WHERE filial_venda IS NOT NULL
  AND filial_venda IS DISTINCT FROM public.normalize_filial_codigo(filial_venda);

UPDATE public.simulations AS simulation
SET filial_venda = CASE
  WHEN profile.role = 'gestor' THEN 'uberaba'
  ELSE public.normalize_filial_codigo(profile.filial)
END
FROM public.profiles AS profile
WHERE simulation.user_id = profile.id
  AND simulation.filial_venda IS NULL
  AND (
    profile.role = 'gestor'
    OR public.normalize_filial_codigo(profile.filial) IS NOT NULL
  );

UPDATE public.profiles
SET filial = public.normalize_filial_codigo(filial)
WHERE filial IS NOT NULL
  AND filial IS DISTINCT FROM public.normalize_filial_codigo(filial);

ALTER TABLE public.simulations
  ALTER COLUMN status_lancamento SET DEFAULT 'lancado';

COMMENT ON COLUMN public.simulations.data_negociacao IS
  'Dia de criação da simulação em America/Sao_Paulo. Não é regravado na edição.';
COMMENT ON COLUMN public.simulations.filial_venda IS
  'Filial da venda, copiada do perfil na criação. Gestor fica em uberaba. Não acompanha troca posterior de filial.';
COMMENT ON COLUMN public.simulations.tipo_venda IS
  'Novas operações nascem reais. Valor já gravado, inclusive barter, não é reescrito no save.';
COMMENT ON COLUMN public.simulations.safra IS
  'Rótulo antigo. O painel filtra pelo ano-calendário e não por safra.';
COMMENT ON COLUMN public.simulations.status_lancamento IS
  'Novas operações nascem lancado. O valor já gravado não muda no save. Só lancado entra no caixa; a venda continua na base.';

CREATE OR REPLACE FUNCTION public.trg_simulations_campos_venda()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_filial text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.data_negociacao := (COALESCE(NEW.created_at, now()) AT TIME ZONE 'America/Sao_Paulo')::date;
    NEW.tipo_venda := 'reais';
    NEW.status_lancamento := 'lancado';
    IF NEW.user_id IS NOT NULL THEN
      SELECT role, filial INTO v_role, v_filial
      FROM public.profiles
      WHERE id = NEW.user_id;
    END IF;
    IF v_role = 'gestor' THEN
      NEW.filial_venda := 'uberaba';
    ELSIF NEW.filial_venda IS NULL THEN
      NEW.filial_venda := public.normalize_filial_codigo(v_filial);
    ELSE
      NEW.filial_venda := public.normalize_filial_codigo(NEW.filial_venda);
    END IF;
    RETURN NEW;
  END IF;

  NEW.data_negociacao := OLD.data_negociacao;
  NEW.filial_venda := OLD.filial_venda;
  NEW.tipo_venda := OLD.tipo_venda;
  NEW.safra := OLD.safra;
  NEW.status_lancamento := OLD.status_lancamento;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS simulations_status_lancamento ON public.simulations;
DROP FUNCTION IF EXISTS public.trg_simulations_status_lancamento();

DROP TRIGGER IF EXISTS simulations_campos_venda ON public.simulations;
CREATE TRIGGER simulations_campos_venda
  BEFORE INSERT OR UPDATE ON public.simulations
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_simulations_campos_venda();

REVOKE ALL ON FUNCTION public.trg_simulations_campos_venda() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.trg_simulations_campos_venda() TO authenticated;

COMMENT ON FUNCTION public.trg_simulations_campos_venda() IS
  'Preenche a venda na criação e impede que um save posterior regrave data, filial, tipo, safra ou lançamento.';
