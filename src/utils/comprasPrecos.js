import { KG_POR_TONELADA } from '../constants/compras'
import { roundMoney } from './roundMoney'

export function parseOcNumber(raw) {
  if (raw == null || raw === '') return null
  const n = Number(String(raw).replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

export function ocQtyDisplay(volumeKg, unidade) {
  const kg = Number(volumeKg) || 0
  return unidade === 'kg' ? kg : kg / KG_POR_TONELADA
}

export function ocLiquidoUsd(precoUsd, descontoUsd) {
  const preco = Number(precoUsd)
  if (!Number.isFinite(preco)) return null
  const desc = Number(descontoUsd) || 0
  return Math.max(0, preco - desc)
}

export function inferTaxaDolar({
  precoUsd,
  descontoUsd,
  unitarioBrl,
  fallback = null,
}) {
  const liquido = ocLiquidoUsd(precoUsd, descontoUsd)
  const unitario = Number(unitarioBrl)
  if (liquido > 0 && Number.isFinite(unitario) && unitario > 0) {
    return unitario / liquido
  }
  const taxa = Number(fallback)
  return Number.isFinite(taxa) && taxa > 0 ? taxa : null
}

export function calcOcItemValores({
  precoUsd,
  descontoUsd,
  taxaDolar,
  volumeKg,
  unidade,
}) {
  const liquidoUsd = ocLiquidoUsd(precoUsd, descontoUsd)
  const taxa = Number(taxaDolar) || 0
  const qty = ocQtyDisplay(volumeKg, unidade)
  const unitarioBrl =
    liquidoUsd == null ? null : roundMoney(liquidoUsd * taxa)
  const total =
    unitarioBrl == null ? null : roundMoney(unitarioBrl * qty)
  return { liquidoUsd, qty, unitarioBrl, total }
}
