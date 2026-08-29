import { KG_POR_TONELADA } from '../constants/compras'

export function tonsToKg(tons) {
  const n = Number(tons)
  if (!Number.isFinite(n)) return 0
  return Math.round(n * KG_POR_TONELADA * 10000) / 10000
}

export function kgToTons(kg) {
  const n = Number(kg)
  if (!Number.isFinite(n)) return 0
  return Math.round((n / KG_POR_TONELADA) * 10000) / 10000
}

export function parseQtyInput(raw, unidade) {
  const n = Number(String(raw ?? '').replace(',', '.'))
  if (!Number.isFinite(n) || n <= 0) return { ok: false, error: 'Informe uma quantidade válida.' }
  const kg = unidade === 'kg' ? n : tonsToKg(n)
  if (kg <= 0) return { ok: false, error: 'Informe uma quantidade válida.' }
  return { ok: true, kg }
}

export function formatKg(kg) {
  const n = Number(kg)
  if (!Number.isFinite(n)) return '—'
  return `${n.toLocaleString('pt-BR', {
    maximumFractionDigits: 3,
  })} kg`
}

export function formatTons(kg) {
  const t = kgToTons(kg)
  if (!Number.isFinite(t)) return '—'
  return `${t.toLocaleString('pt-BR', {
    maximumFractionDigits: 4,
  })} t`
}

export function formatQtyBoth(kg) {
  return `${formatTons(kg)} · ${formatKg(kg)}`
}

export function formatQtyByUnit(kg, unidade) {
  return unidade === 'kg' ? formatKg(kg) : formatTons(kg)
}

export function formatUsd(value) {
  if (value == null || value === '') return '—'
  const n = Number(value)
  if (!Number.isFinite(n)) return '—'
  return n.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  })
}
