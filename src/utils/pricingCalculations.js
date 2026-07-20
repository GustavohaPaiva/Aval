import { roundMoney } from './roundMoney'

/** Dias entre vencimento da lista e pagamento do cliente (negativo = antecipado). */
export function calcDiasAntecipacao(dataPagamento, vencimentoLista) {
  if (!dataPagamento || !vencimentoLista) return 0
  const pag = new Date(`${dataPagamento}T12:00:00`)
  const lista = new Date(`${vencimentoLista}T12:00:00`)
  if (Number.isNaN(pag.getTime()) || Number.isNaN(lista.getTime())) return 0
  const ms = pag.getTime() - lista.getTime()
  return Math.round(ms / (1000 * 60 * 60 * 24))
}

/** Fator de antecipação: (100 - (1.7/30)*dias)/100 */
export function calcFatorAntecipacao(dias) {
  return (100 - (1.7 / 30) * dias) / 100
}

/** Fator de juros: (100 - (2/30)*dias)/100 — usado quando pagamento atrasa (dias positivos = após o vencimento da lista). */
export function calcFatorJuros(dias) {
  return (100 - (2 / 30) * dias) / 100
}

/**
 * Cadeia de preço por linha (Excel):
 * base = custo_icms + frete
 * financeiro = base * fator (antecipação se dias<0, juros se dias>0, 1 se zero)
 * preço final (margem 15%) = financeiro / 0.85
 */
export function calcPrecoSimulacao({
  custoIcms,
  freteUnitario = 0,
  diasAntecipacao = 0,
  margemRatio = 0.85,
}) {
  const base = roundMoney(Number(custoIcms) + Number(freteUnitario))
  let fator = 1
  if (diasAntecipacao < 0) {
    fator = calcFatorAntecipacao(Math.abs(diasAntecipacao))
  } else if (diasAntecipacao > 0) {
    const jurosFactor = calcFatorJuros(diasAntecipacao)
    fator = jurosFactor > 0 ? 1 / jurosFactor : 1
  }
  const financeiro = roundMoney(base * fator)
  const precoFinal = roundMoney(financeiro / margemRatio)
  return {
    base,
    fator,
    financeiro,
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

/** Custo-ICMS a partir dos fatores de custo (desconto antes do câmbio, 4% ICMS). */
export function calcCustoIcms({ custoUsd, descontoUsd, taxa }) {
  const custoBrl = calcCustoBrlComDesconto(custoUsd, descontoUsd, taxa)
  return roundMoney(custoBrl * 0.96)
}
