import { roundMoney } from './roundMoney'

/** Defaults alinhados à regra comercial (prazo >= limiar → longo). */
export const DEFAULT_AUTONOMIA_PARAMS = {
  autonomia_dias_limiar: 90,
  autonomia_especial_longo: 3,
  autonomia_convencional_longo: 4,
  autonomia_especial_curto: 4.5,
  autonomia_convencional_curto: 5.5,
}

/** Extrai YYYY-MM-DD de string de data (aceita ISO com hora). */
function toDateOnly(value) {
  if (value == null || value === '') return null
  const raw = String(value).trim()
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})/)
  return match ? match[1] : null
}

/**
 * Prazo comercial em dias = data_pagamento − data_negociacao.
 * @returns {number|null} null se alguma data estiver ausente/inválida
 */
export function calcPrazoNegociacao(dataPagamento, dataNegociacao) {
  const pagStr = toDateOnly(dataPagamento)
  const negStr = toDateOnly(dataNegociacao)
  if (!pagStr || !negStr) return null
  const pag = new Date(`${pagStr}T12:00:00`)
  const neg = new Date(`${negStr}T12:00:00`)
  if (Number.isNaN(pag.getTime()) || Number.isNaN(neg.getTime())) return null
  return Math.round((pag.getTime() - neg.getTime()) / (1000 * 60 * 60 * 24))
}

/** Data de hoje no fuso local como YYYY-MM-DD. */
export function todayDateOnly() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Normaliza params de autonomia a partir da linha de parametros_sistema.
 */
export function normalizeAutonomiaParams(row) {
  const defaults = DEFAULT_AUTONOMIA_PARAMS
  if (!row || typeof row !== 'object') return { ...defaults }

  const num = (value, fallback) => {
    const n = Number(value)
    return Number.isFinite(n) ? n : fallback
  }

  return {
    autonomia_dias_limiar: Math.max(
      1,
      Math.round(num(row.autonomia_dias_limiar, defaults.autonomia_dias_limiar)),
    ),
    autonomia_especial_longo: num(
      row.autonomia_especial_longo,
      defaults.autonomia_especial_longo,
    ),
    autonomia_convencional_longo: num(
      row.autonomia_convencional_longo,
      defaults.autonomia_convencional_longo,
    ),
    autonomia_especial_curto: num(
      row.autonomia_especial_curto,
      defaults.autonomia_especial_curto,
    ),
    autonomia_convencional_curto: num(
      row.autonomia_convencional_curto,
      defaults.autonomia_convencional_curto,
    ),
  }
}

/**
 * Autonomia percentual para a classe no prazo informado.
 * Sem prazo válido, usa faixa longa (mais restritiva).
 */
export function getAutonomiaPercentual({ prazoDias, classe, params }) {
  const p = normalizeAutonomiaParams(params)
  const limiar = p.autonomia_dias_limiar
  const isLongo = prazoDias == null || !Number.isFinite(prazoDias) || prazoDias >= limiar
  const isEspecial = String(classe ?? '').toLowerCase() === 'especial'

  if (isLongo) {
    return isEspecial
      ? p.autonomia_especial_longo
      : p.autonomia_convencional_longo
  }
  return isEspecial
    ? p.autonomia_especial_curto
    : p.autonomia_convencional_curto
}

/** Floor ratio = 1 − autonomia%/100 (ex.: 3% → 0.97). */
export function getFloorRatio(autonomiaPercentual) {
  const pct = Number(autonomiaPercentual)
  if (!Number.isFinite(pct) || pct < 0) return 1
  return Math.max(0, (100 - pct) / 100)
}

/** Piso unitário em R$ (2 casas). O desconto exatamente igual à autonomia fica no piso. */
export function getFloorUnit(precoUnitario, autonomiaPercentual) {
  const pu = Number(precoUnitario)
  if (!Number.isFinite(pu)) return 0
  return roundMoney(pu * getFloorRatio(autonomiaPercentual))
}

function toCents(value) {
  return Math.round(Number(value) * 100)
}

/** Abaixo do piso: o valor exato da autonomia é permitido; 1 centavo a menos não. */
export function isPropostaBelowFloor(proposta, floorUnit) {
  const p = Number(proposta)
  const f = Number(floorUnit)
  if (!Number.isFinite(p) || !Number.isFinite(f)) return false
  return toCents(p) < toCents(f)
}
