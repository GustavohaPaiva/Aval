import { roundMoney } from './roundMoney'

function roundVolume(value) {
  return Math.round((Number(value) || 0) * 10000) / 10000
}

function numOrNull(value) {
  if (value == null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function overrideTupleFromItem(item) {
  return [
    numOrNull(item.override_custo_usd),
    numOrNull(item.override_desconto_usd),
    numOrNull(item.override_taxa),
    numOrNull(item.override_frete),
    numOrNull(item.override_taxa_antecipacao),
    numOrNull(item.override_taxa_juros),
  ]
}

function overrideTupleFromLine(line) {
  const ov = line?.overrides ?? {}
  return [
    numOrNull(ov.custoUsd),
    numOrNull(ov.descontoUsd),
    numOrNull(ov.taxa),
    numOrNull(ov.frete),
    numOrNull(ov.taxaAntecipacao),
    numOrNull(ov.taxaJuros),
  ]
}

function overridesEqual(a, b) {
  return a.every((value, i) => {
    const other = b[i]
    if (value == null && other == null) return true
    if (value == null || other == null) return false
    return Math.abs(value - other) < 1e-6
  })
}

/**
 * Mudança comercial visível ao consultor: produto, volume, cultura, proposta
 * (quando não for só recálculo de parâmetro) ou inclusão/remoção de linha.
 */
export function hasNotifiablePedidoComercialChanges(previousItems, nextLines) {
  const prev = previousItems ?? []
  const next = nextLines ?? []
  if (prev.length !== next.length) return true

  const prevById = new Map(prev.map((item) => [String(item.id), item]))
  const seen = new Set()

  for (const line of next) {
    const id = line.id ? String(line.id) : ''
    if (!id || !prevById.has(id)) return true
    seen.add(id)

    const item = prevById.get(id)
    if (String(item.product_id ?? '') !== String(line.productId ?? '')) {
      return true
    }
    if (roundVolume(item.volume) !== roundVolume(line.volume)) return true
    if (String(item.cultura ?? '').trim() !== String(line.cultura ?? '').trim()) {
      return true
    }

    const propostaChanged =
      roundMoney(Number(item.proposta) || 0) !==
      roundMoney(Number(line.proposta) || 0)
    if (
      propostaChanged &&
      overridesEqual(overrideTupleFromItem(item), overrideTupleFromLine(line))
    ) {
      return true
    }
  }

  for (const id of prevById.keys()) {
    if (!seen.has(id)) return true
  }

  return false
}
