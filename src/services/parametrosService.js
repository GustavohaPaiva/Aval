import { supabase } from './supabase'

export const DEFAULT_ICMS_PERCENTUAL = 4

/**
 * Lê o registro singleton de parâmetros do sistema.
 * @returns {{ ok: true, row: object } | { ok: false, error: string }}
 */
export async function fetchParametrosSistema() {
  const { data, error } = await supabase
    .from('parametros_sistema')
    .select(
      'id, icms_percentual, pis_cofins_percentual, margem_percentual, updated_at',
    )
    .eq('id', 1)
    .maybeSingle()

  if (error) return { ok: false, error: error.message }

  if (!data) {
    return {
      ok: true,
      row: {
        id: 1,
        icms_percentual: DEFAULT_ICMS_PERCENTUAL,
        pis_cofins_percentual: null,
        margem_percentual: null,
        updated_at: null,
      },
    }
  }

  return { ok: true, row: data }
}

/**
 * Atualiza ICMS, PIS/COFINS e/ou Margem (não altera cotação de dólar).
 */
export async function updateParametrosSistema({
  icms_percentual,
  pis_cofins_percentual,
  margem_percentual,
} = {}) {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession()

  if (sessionError || !session?.user) {
    return { ok: false, error: 'Sessão expirada. Faça login novamente.' }
  }

  const payload = {
    updated_at: new Date().toISOString(),
    updated_by: session.user.id,
  }

  if (icms_percentual !== undefined) {
    const icms = Number(icms_percentual)
    if (!Number.isFinite(icms) || icms < 0 || icms >= 100) {
      return { ok: false, error: 'Informe um ICMS válido entre 0 e 100.' }
    }
    payload.icms_percentual = icms
  }

  if (pis_cofins_percentual !== undefined) {
    if (pis_cofins_percentual === null || pis_cofins_percentual === '') {
      payload.pis_cofins_percentual = null
    } else {
      const pis = Number(pis_cofins_percentual)
      if (!Number.isFinite(pis) || pis < 0 || pis >= 100) {
        return { ok: false, error: 'Informe um PIS/COFINS válido entre 0 e 100.' }
      }
      payload.pis_cofins_percentual = pis
    }
  }

  if (margem_percentual !== undefined) {
    if (margem_percentual === null || margem_percentual === '') {
      payload.margem_percentual = null
    } else {
      const margem = Number(margem_percentual)
      if (!Number.isFinite(margem) || margem < 0) {
        return { ok: false, error: 'Informe uma margem válida maior ou igual a zero.' }
      }
      payload.margem_percentual = margem
    }
  }

  const { data, error } = await supabase
    .from('parametros_sistema')
    .update(payload)
    .eq('id', 1)
    .select(
      'id, icms_percentual, pis_cofins_percentual, margem_percentual, updated_at',
    )
    .single()

  if (error) return { ok: false, error: error.message }
  return { ok: true, row: data }
}
