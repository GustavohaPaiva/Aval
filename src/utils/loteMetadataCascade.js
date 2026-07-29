/** Normaliza data YYYY-MM-DD para comparação de padrões da lista. */
export function normalizeListDate(value) {
  if (!value) return ''
  return String(value).slice(0, 10)
}

export function sameListNumeric(a, b) {
  const na = Number(a)
  const nb = Number(b)
  if (!Number.isFinite(na) && !Number.isFinite(nb)) return true
  return na === nb
}

export function sameListText(a, b) {
  return String(a ?? '').trim() === String(b ?? '').trim()
}

export function sameListDate(a, b) {
  return normalizeListDate(a) === normalizeListDate(b)
}

/**
 * Planeja a propagação de metadados do lote → produtos_oficiais.
 * Só inclui campos cujo valor novo difere do anterior; a execução
 * aplica apenas em produtos que ainda guardam o valor antigo (não customizados).
 *
 * @param {object} previous valores atuais do lote (antes do update)
 * @param {object} nextPayload patch já normalizado que será gravado no lote
 * @returns {Array<{ key: string, productColumn: string, oldValue: unknown, newValue: unknown, kind: 'simple' | 'desconto' }>}
 */
export function planOfficialMetadataCascade(previous, nextPayload) {
  const ops = []
  if (!previous || !nextPayload) return ops

  if (nextPayload.data_validade !== undefined) {
    const oldValue = normalizeListDate(previous.data_validade) || null
    const newValue = normalizeListDate(nextPayload.data_validade) || null
    if (!sameListDate(oldValue, newValue)) {
      ops.push({
        key: 'vencimento',
        productColumn: 'vencimento_lista',
        oldValue,
        newValue,
        kind: 'simple',
      })
    }
  }

  if (nextPayload.quarter_calculado !== undefined) {
    const oldValue = String(previous.quarter_calculado ?? '').trim()
    const newValue = String(nextPayload.quarter_calculado ?? '').trim()
    if (newValue && !sameListText(oldValue, newValue)) {
      ops.push({
        key: 'quarter',
        productColumn: 'quarter',
        oldValue: oldValue || null,
        newValue,
        kind: 'simple',
      })
    }
  }

  if (nextPayload.desconto_usd !== undefined) {
    const oldValue = Number(previous.desconto_usd ?? 0)
    const newValue = Math.max(0, Number(nextPayload.desconto_usd) || 0)
    if (!sameListNumeric(oldValue, newValue)) {
      ops.push({
        key: 'desconto',
        productColumn: 'desconto_usd',
        oldValue,
        newValue,
        kind: 'desconto',
      })
    }
  }

  if (nextPayload.estado_padrao !== undefined) {
    const oldValue = String(previous.estado_padrao ?? '').trim() || null
    const newValue = String(nextPayload.estado_padrao ?? '').trim() || null
    if (newValue && !sameListText(oldValue, newValue)) {
      ops.push({
        key: 'estado',
        productColumn: 'estado',
        oldValue,
        newValue,
        kind: 'simple',
      })
    }
  }

  if (nextPayload.taxa_antecipacao !== undefined) {
    const oldValue = Number(previous.taxa_antecipacao)
    const newValue = Number(nextPayload.taxa_antecipacao)
    if (
      Number.isFinite(oldValue) &&
      Number.isFinite(newValue) &&
      !sameListNumeric(oldValue, newValue)
    ) {
      ops.push({
        key: 'taxa_antecipacao',
        productColumn: 'taxa_antecipacao',
        oldValue,
        newValue,
        kind: 'simple',
      })
    }
  }

  if (nextPayload.taxa_juros !== undefined) {
    const oldValue = Number(previous.taxa_juros)
    const newValue = Number(nextPayload.taxa_juros)
    if (
      Number.isFinite(oldValue) &&
      Number.isFinite(newValue) &&
      !sameListNumeric(oldValue, newValue)
    ) {
      ops.push({
        key: 'taxa_juros',
        productColumn: 'taxa_juros',
        oldValue,
        newValue,
        kind: 'simple',
      })
    }
  }

  return ops
}

export function summarizeCascadeCounts(opsResults) {
  const counts = {}
  let updatedCount = 0
  for (const row of opsResults ?? []) {
    const n = Number(row?.updated ?? 0)
    counts[row.key] = n
    updatedCount += n
  }
  return { counts, updatedCount }
}
