import { roundMoney } from './roundMoney'

export const TIPOS_COMISSAO_PRODUTO = ['Convencional', 'Especial']

/**
 * Normaliza classe do produto para o tipo usado nas faixas de comissão.
 * @param {string | null | undefined} classe
 * @returns {'Convencional' | 'Especial'}
 */
export function normalizeTipoComissao(classe) {
  const raw = String(classe ?? '').trim()
  if (raw.toLowerCase() === 'especial') return 'Especial'
  return 'Convencional'
}

/**
 * Converte margem (ratio 0–1 ou percentual ≥ 1 / 0–100) para percentual (ex.: 5.25).
 * @param {number | null | undefined} margem
 * @returns {number | null}
 */
export function toMargemPercentual(margem) {
  if (margem == null || margem === '') return null
  const n = Number(margem)
  if (!Number.isFinite(n)) return null
  // calcMargemLucro devolve ratio (0.05 = 5%); valores ≥ 1 tratamos como % já convertida.
  if (Math.abs(n) <= 1) return n * 100
  return n
}

/**
 * Resolve o % de comissão a partir das faixas ativas.
 * Usa a maior faixa cujo piso de margem <= margem informada.
 *
 * @param {number | null | undefined} margemPercentual - margem em % (ex.: 5.2)
 * @param {'Convencional' | 'Especial' | string} tipoProduto
 * @param {Array<{ tipo_produto?: string, tipoProduto?: string, margem_minima_percentual?: number, margemMinimaPercentual?: number, comissao_percentual?: number, comissaoPercentual?: number, ativo?: boolean }>} faixas
 * @returns {number} percentual de comissão (ex.: 0.5). 0 se abaixo de todas as faixas.
 */
export function resolveComissaoPercentual(margemPercentual, tipoProduto, faixas = []) {
  const margem = Number(margemPercentual)
  if (!Number.isFinite(margem)) return 0

  const tipo = normalizeTipoComissao(tipoProduto)
  const aplicaveis = (faixas ?? [])
    .filter((f) => {
      if (f?.ativo === false) return false
      const t = normalizeTipoComissao(f.tipo_produto ?? f.tipoProduto)
      return t === tipo
    })
    .map((f) => ({
      piso: Number(f.margem_minima_percentual ?? f.margemMinimaPercentual),
      comissao: Number(f.comissao_percentual ?? f.comissaoPercentual),
    }))
    .filter((f) => Number.isFinite(f.piso) && Number.isFinite(f.comissao))
    .sort((a, b) => b.piso - a.piso)

  const match = aplicaveis.find((f) => margem >= f.piso)
  return match ? match.comissao : 0
}

/**
 * Valor R$ da comissão = base × (comissao% / 100).
 * @param {number} baseCalculo - tipicamente volume × proposta
 * @param {number} comissaoPercentual - ex.: 0.50 para 0,50%
 */
export function calcComissaoValor(baseCalculo, comissaoPercentual) {
  const base = Number(baseCalculo)
  const pct = Number(comissaoPercentual)
  if (!Number.isFinite(base) || base <= 0 || !Number.isFinite(pct) || pct <= 0) {
    return 0
  }
  return roundMoney((base * pct) / 100)
}

/**
 * Calcula comissão de uma linha a partir da margem (ratio ou %) e das faixas.
 */
export function calcComissaoLinha({
  margem,
  classe,
  volume,
  proposta,
  faixas,
} = {}) {
  const margemPercentual = toMargemPercentual(margem)
  const tipo = normalizeTipoComissao(classe)
  const comissaoPercentual = resolveComissaoPercentual(
    margemPercentual,
    tipo,
    faixas,
  )
  const vol = Number(volume)
  const prop = Number(proposta)
  const baseCalculo =
    Number.isFinite(vol) && Number.isFinite(prop) && vol > 0 && prop > 0
      ? roundMoney(vol * prop)
      : 0
  const comissaoValor = calcComissaoValor(baseCalculo, comissaoPercentual)

  return {
    classe: tipo,
    margemPercentual,
    comissaoPercentual,
    baseCalculo,
    comissaoValor,
  }
}
