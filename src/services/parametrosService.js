import { supabase } from './supabase'
import {
  DEFAULT_AUTONOMIA_PARAMS,
  normalizeAutonomiaParams,
} from '../utils/autonomiaDesconto'

export const DEFAULT_ICMS_PERCENTUAL = 4

const PARAMETROS_SELECT =
  'id, icms_percentual, pis_cofins_percentual, margem_percentual, autonomia_dias_limiar, autonomia_especial_longo, autonomia_convencional_longo, autonomia_especial_curto, autonomia_convencional_curto, updated_at'

function emptyParametrosRow() {
  return {
    id: 1,
    icms_percentual: DEFAULT_ICMS_PERCENTUAL,
    pis_cofins_percentual: null,
    margem_percentual: null,
    ...DEFAULT_AUTONOMIA_PARAMS,
    updated_at: null,
  }
}

function parseOptionalPercent(value, label) {
  if (value === null || value === '' || value === undefined) {
    return { ok: true, value: null }
  }
  const num = Number(value)
  if (!Number.isFinite(num) || num < 0 || num >= 100) {
    return {
      ok: false,
      error: `Informe um ${label} válido entre 0 e 100.`,
    }
  }
  return { ok: true, value: num }
}

function parseRequiredAutonomiaPercent(value, label) {
  const num = Number(value)
  if (!Number.isFinite(num) || num < 0 || num >= 100) {
    return {
      ok: false,
      error: `Informe ${label} válido entre 0 e 100.`,
    }
  }
  return { ok: true, value: num }
}

/**
 * Lê o registro singleton de parâmetros do sistema.
 * @returns {{ ok: true, row: object } | { ok: false, error: string }}
 */
export async function fetchParametrosSistema() {
  const { data, error } = await supabase
    .from('parametros_sistema')
    .select(PARAMETROS_SELECT)
    .eq('id', 1)
    .maybeSingle()

  if (error) return { ok: false, error: error.message }

  if (!data) {
    return { ok: true, row: emptyParametrosRow() }
  }

  return {
    ok: true,
    row: {
      ...data,
      ...normalizeAutonomiaParams(data),
    },
  }
}

/**
 * Atualiza ICMS, PIS/COFINS, Margem e/ou autonomia (não altera cotação de dólar).
 */
export async function updateParametrosSistema({
  icms_percentual,
  pis_cofins_percentual,
  margem_percentual,
  autonomia_dias_limiar,
  autonomia_especial_longo,
  autonomia_convencional_longo,
  autonomia_especial_curto,
  autonomia_convencional_curto,
} = {}) {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession()

  if (sessionError || !session?.user) {
    return { ok: false, error: 'Sessão expirada. Faça login novamente.' }
  }

  const payload = {
    id: 1,
    updated_at: new Date().toISOString(),
    updated_by: session.user.id,
  }

  if (icms_percentual !== undefined) {
    const icms = Number(icms_percentual)
    if (!Number.isFinite(icms) || icms < 0 || icms >= 100) {
      return { ok: false, error: 'Informe um ICMS válido entre 0 e 100.' }
    }
    payload.icms_percentual = icms
  } else {
    payload.icms_percentual = DEFAULT_ICMS_PERCENTUAL
  }

  if (pis_cofins_percentual !== undefined) {
    const parsed = parseOptionalPercent(pis_cofins_percentual, 'PIS/COFINS')
    if (!parsed.ok) return parsed
    payload.pis_cofins_percentual = parsed.value
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

  if (autonomia_dias_limiar !== undefined) {
    const limiar = Number(autonomia_dias_limiar)
    if (!Number.isFinite(limiar) || limiar <= 0) {
      return { ok: false, error: 'Informe um limiar de dias válido maior que zero.' }
    }
    payload.autonomia_dias_limiar = Math.round(limiar)
  }

  if (autonomia_especial_longo !== undefined) {
    const parsed = parseRequiredAutonomiaPercent(
      autonomia_especial_longo,
      'autonomia especiais (prazo longo)',
    )
    if (!parsed.ok) return parsed
    payload.autonomia_especial_longo = parsed.value
  }

  if (autonomia_convencional_longo !== undefined) {
    const parsed = parseRequiredAutonomiaPercent(
      autonomia_convencional_longo,
      'autonomia convencionais (prazo longo)',
    )
    if (!parsed.ok) return parsed
    payload.autonomia_convencional_longo = parsed.value
  }

  if (autonomia_especial_curto !== undefined) {
    const parsed = parseRequiredAutonomiaPercent(
      autonomia_especial_curto,
      'autonomia especiais (prazo curto)',
    )
    if (!parsed.ok) return parsed
    payload.autonomia_especial_curto = parsed.value
  }

  if (autonomia_convencional_curto !== undefined) {
    const parsed = parseRequiredAutonomiaPercent(
      autonomia_convencional_curto,
      'autonomia convencionais (prazo curto)',
    )
    if (!parsed.ok) return parsed
    payload.autonomia_convencional_curto = parsed.value
  }

  const { data, error } = await supabase
    .from('parametros_sistema')
    .upsert(payload, { onConflict: 'id' })
    .select(PARAMETROS_SELECT)
    .single()

  if (error) return { ok: false, error: error.message }
  return {
    ok: true,
    row: {
      ...data,
      ...normalizeAutonomiaParams(data),
    },
  }
}
