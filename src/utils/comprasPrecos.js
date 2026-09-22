import { KG_POR_TONELADA } from '../constants/compras'
import {
  calcDiasAntecipacao,
  DEFAULT_TAXA_JUROS,
} from './pricingCalculations'
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

export function roundUsd(n) {
  return Math.round(Number(n) * 10000) / 10000
}

/**
 * Dias de juros simples da OC: pagamento Syagri − vencimento da lista.
 * Só conta atraso (DATEDIF da planilha Yara). Antecipação não reduz o USD.
 */
export function calcDiasJurosOc(vencimentoLista, pagamentoSyagri) {
  const dias = calcDiasAntecipacao(pagamentoSyagri, vencimentoLista)
  return dias > 0 ? dias : 0
}

function resolveTaxaJuros(taxa) {
  const n = Number(taxa)
  if (!Number.isFinite(n) || n < 0) return DEFAULT_TAXA_JUROS
  return n
}

/**
 * Planilha Yara col. I:
 * F * (1 + 0.02 * (DATEDIF(G, H, "d") / 30))
 * G = vencimento da lista, H = pagamento Syagri.
 */
export function calcOcPrecoCorrigido(
  liquidoUsd,
  dias,
  taxaJuros = DEFAULT_TAXA_JUROS,
) {
  const base = Number(liquidoUsd)
  if (!Number.isFinite(base)) return null
  const d = Math.max(0, Number(dias) || 0)
  const taxa = resolveTaxaJuros(taxaJuros) / 100
  return roundUsd(base * (1 + taxa * (d / 30)))
}

export function inferTaxaDolar({
  precoUsd,
  descontoUsd,
  unitarioBrl,
  fallback = null,
  precoCorrigido = null,
}) {
  const base =
    precoCorrigido != null && Number.isFinite(Number(precoCorrigido))
      ? Number(precoCorrigido)
      : ocLiquidoUsd(precoUsd, descontoUsd)
  const unitario = Number(unitarioBrl)
  if (base > 0 && Number.isFinite(unitario) && unitario > 0) {
    return unitario / base
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
  vencimentoLista,
  pagamentoSyagri,
  taxaJuros = DEFAULT_TAXA_JUROS,
  frete,
}) {
  const liquidoUsd = ocLiquidoUsd(precoUsd, descontoUsd)
  const dias = calcDiasJurosOc(vencimentoLista, pagamentoSyagri)
  const precoCorrigido = calcOcPrecoCorrigido(liquidoUsd, dias, taxaJuros)
  const juros =
    liquidoUsd == null || precoCorrigido == null
      ? null
      : roundUsd(precoCorrigido - liquidoUsd)
  const taxa = Number(taxaDolar) || 0
  const qty = ocQtyDisplay(volumeKg, unidade)
  const unitarioBrl =
    precoCorrigido == null ? null : roundMoney(precoCorrigido * taxa)
  const freteN = Number(frete) || 0
  const total =
    unitarioBrl == null ? null : roundMoney((unitarioBrl + freteN) * qty)
  return {
    liquidoUsd,
    precoCorrigido,
    juros,
    dias,
    qty,
    unitarioBrl,
    total,
  }
}

/** USD que vai no PDF / WhatsApp ao fornecedor (preço já com juros simples). */
export function ocUsdPedidoFornecedor(item) {
  if (!item) return null
  return calcOcItemValores({
    precoUsd: item.preco_usd,
    descontoUsd: item.desconto_usd,
    taxaDolar: 0,
    volumeKg: item.volume_kg,
    unidade: item.unidade_exibicao,
    vencimentoLista: item.vencimento_lista,
    pagamentoSyagri: item.pagamento_syagri,
    taxaJuros: item.product?.taxaJuros,
    frete: item.frete,
  }).precoCorrigido
}
