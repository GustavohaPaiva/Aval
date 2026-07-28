import { roundMoney } from './roundMoney'

/** Default histórico (4%) — usado só como fallback quando o parâmetro não está disponível. */
export const DEFAULT_ICMS_PERCENTUAL = 4

/** Fator multiplicador: ICMS 4% → 0.96 (custo_icms = custoBrl * fator). */
export function calcFatorIcms(icmsPercentual = DEFAULT_ICMS_PERCENTUAL) {
  const p = Number(icmsPercentual)
  if (!Number.isFinite(p) || p < 0 || p >= 100) {
    return (100 - DEFAULT_ICMS_PERCENTUAL) / 100
  }
  return (100 - p) / 100
}

/** Custo - ICMS a partir do custo em R$ e do percentual cadastrado em Parâmetros. */
export function calcCustoIcmsFromBrl(
  custoBrl,
  icmsPercentual = DEFAULT_ICMS_PERCENTUAL,
) {
  return roundMoney(Number(custoBrl) * calcFatorIcms(icmsPercentual))
}

/** Extrai YYYY-MM-DD de string de data (aceita ISO com hora). */
function toDateOnly(value) {
  if (value == null || value === '') return null
  const raw = String(value).trim()
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})/)
  return match ? match[1] : null
}

/**
 * Dias = data_pagamento − vencimento_da_lista.
 * Negativo = pagamento antes do vencimento (antecipação).
 * Positivo = pagamento depois do vencimento (juros).
 */
export function calcDiasAntecipacao(dataPagamento, vencimentoLista) {
  const pagStr = toDateOnly(dataPagamento)
  const listaStr = toDateOnly(vencimentoLista)
  if (!pagStr || !listaStr) return 0
  const pag = new Date(`${pagStr}T12:00:00`)
  const lista = new Date(`${listaStr}T12:00:00`)
  if (Number.isNaN(pag.getTime()) || Number.isNaN(lista.getTime())) return 0
  const ms = pag.getTime() - lista.getTime()
  return Math.round(ms / (1000 * 60 * 60 * 24))
}

/** Taxa padrão de antecipação (% a cada 30 dias) — planilha col. L. */
export const DEFAULT_TAXA_ANTECIPACAO = 1.7

/** Taxa padrão de juros (% a cada 30 dias) — planilha col. M. */
export const DEFAULT_TAXA_JUROS = 2

function resolveTaxaFinanceira(taxa, fallback) {
  const n = Number(taxa)
  if (!Number.isFinite(n) || n < 0) return fallback
  return n
}

/**
 * Fator de antecipação (planilha col. L): (100 - (taxa/30)*dias)/100
 * Com dias negativos (antecipado) o fator fica > 1.
 */
export function calcFatorAntecipacao(
  dias,
  taxa = DEFAULT_TAXA_ANTECIPACAO,
) {
  const t = resolveTaxaFinanceira(taxa, DEFAULT_TAXA_ANTECIPACAO)
  return (100 - (t / 30) * Number(dias)) / 100
}

/**
 * Fator de juros (planilha col. M): (100 - (taxa/30)*dias)/100
 * Com dias positivos (atraso) o fator fica < 1.
 */
export function calcFatorJuros(dias, taxa = DEFAULT_TAXA_JUROS) {
  const t = resolveTaxaFinanceira(taxa, DEFAULT_TAXA_JUROS)
  return (100 - (t / 30) * Number(dias)) / 100
}

/**
 * Cadeia de preço só na simulação (planilha Base de dados):
 * 1. valor_com_frete (base) = custo_icms + frete
 * 2. valor_ajustado (financeiro) = base / fator
 *    - dias < 0 → divide pelo fator de antecipação
 *    - dias > 0 → divide pelo fator de juros
 *    - dias = 0 → sem alteração
 * 3. valor_com_margem (preço final) = financeiro / 0.85
 *
 * A planilha usa divisão (R/L ou R/M), não multiplicação.
 */
export function calcPrecoSimulacao({
  custoIcms,
  freteUnitario = 0,
  diasAntecipacao = 0,
  margemRatio = 0.85,
  taxaAntecipacao = DEFAULT_TAXA_ANTECIPACAO,
  taxaJuros = DEFAULT_TAXA_JUROS,
}) {
  const valorComFrete = roundMoney(Number(custoIcms) + Number(freteUnitario))
  const dias = Number(diasAntecipacao) || 0

  let fator = 1
  if (dias < 0) {
    fator = calcFatorAntecipacao(dias, taxaAntecipacao)
  } else if (dias > 0) {
    fator = calcFatorJuros(dias, taxaJuros)
  }

  const valorAjustado =
    fator > 0 ? roundMoney(valorComFrete / fator) : valorComFrete
  const precoFinal = roundMoney(valorAjustado / margemRatio)

  return {
    base: valorComFrete,
    valorComFrete,
    fator,
    financeiro: valorAjustado,
    valorAjustado,
    precoFinal,
  }
}

/**
 * Margem de lucro da planilha (Simulador_Negociação):
 * (proposta - proposta*0.04 - proposta*0.01 - financeiro) / proposta
 * = (proposta * 0.95 - financeiro) / proposta
 */
export function calcMargemLucro(proposta, financeiro) {
  const p = Number(proposta)
  const f = Number(financeiro)
  if (!Number.isFinite(p) || p <= 0 || !Number.isFinite(f)) return null
  return (p * 0.95 - f) / p
}

export function calcCustoBrlComDesconto(custoUsd, descontoUsd, taxa) {
  const liquido = Math.max(0, Number(custoUsd) - Number(descontoUsd))
  return roundMoney(liquido * Number(taxa))
}

/** Custo-ICMS a partir dos fatores de custo (desconto antes do câmbio + ICMS parametrizável). */
export function calcCustoIcms({
  custoUsd,
  descontoUsd,
  taxa,
  icmsPercentual = DEFAULT_ICMS_PERCENTUAL,
}) {
  const custoBrl = calcCustoBrlComDesconto(custoUsd, descontoUsd, taxa)
  return calcCustoIcmsFromBrl(custoBrl, icmsPercentual)
}
