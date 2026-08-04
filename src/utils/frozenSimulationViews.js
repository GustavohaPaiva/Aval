import { roundMoney } from './roundMoney'
import {
  calcMargemLucro,
  calcMargemLucroValor,
  DEFAULT_ICMS_PERCENTUAL,
} from './pricingCalculations'

function resolveTaxParams(taxParams = {}) {
  const icmsPercentual =
    taxParams.icmsPercentual == null || taxParams.icmsPercentual === ''
      ? DEFAULT_ICMS_PERCENTUAL
      : Number(taxParams.icmsPercentual)
  const pisCofinsPercentual =
    taxParams.pisCofinsPercentual == null || taxParams.pisCofinsPercentual === ''
      ? 0
      : Number(taxParams.pisCofinsPercentual)
  return { icmsPercentual, pisCofinsPercentual }
}

/**
 * Monta a visão de linha a partir dos valores persistidos (pós-congelamento).
 * Não depende de catálogo; ICMS/PIS vêm dos parâmetros atuais (taxParams).
 */
export function buildFrozenLineView(item, displayNome, taxParams = {}) {
  const { icmsPercentual, pisCofinsPercentual } = resolveTaxParams(taxParams)
  const volume = Number(item.volume) || 0
  const precoUnitario = roundMoney(Number(item.preco_unitario) || 0)
  const proposta = roundMoney(Number(item.proposta) || 0)
  const financeiro =
    item.financeiro_unitario != null && item.financeiro_unitario !== ''
      ? roundMoney(Number(item.financeiro_unitario))
      : null
  const valorTotal = roundMoney(volume * precoUnitario)
  const propostaTotal = roundMoney(volume * proposta)
  const financeiroTotal =
    financeiro != null ? roundMoney(volume * financeiro) : null
  const margemLucro =
    financeiro != null
      ? calcMargemLucro(
          proposta,
          financeiro,
          icmsPercentual,
          pisCofinsPercentual,
        )
      : item.margem_percentual != null
        ? Number(item.margem_percentual) / 100
        : 0
  const margemLucroValor =
    financeiroTotal != null
      ? calcMargemLucroValor(
          propostaTotal,
          financeiroTotal,
          icmsPercentual,
          pisCofinsPercentual,
        )
      : roundMoney(propostaTotal * margemLucro)
  const margemPercentual =
    item.margem_percentual != null
      ? Number(item.margem_percentual)
      : roundMoney(margemLucro * 100)

  return {
    id: String(item.id ?? item.product_id ?? ''),
    productId: String(item.product_id ?? item.productId ?? ''),
    cultura: String(item.cultura ?? ''),
    volume,
    precoUnitario,
    proposta,
    valorTotal,
    propostaTotal,
    financeiro: financeiro ?? 0,
    financeiroTotal: financeiroTotal ?? 0,
    margemLucro,
    margemLucroValor,
    produtoClasse:
      item.produto_classe != null
        ? String(item.produto_classe)
        : item.produtoClasse != null
          ? String(item.produtoClasse)
          : null,
    margemPercentual,
    comissaoPercentual:
      item.comissao_percentual != null
        ? Number(item.comissao_percentual)
        : item.comissaoPercentual != null
          ? Number(item.comissaoPercentual)
          : null,
    comissaoValor:
      item.comissao_valor != null
        ? roundMoney(Number(item.comissao_valor))
        : item.comissaoValor != null
          ? roundMoney(Number(item.comissaoValor))
          : 0,
    comissaoBaseCalculo: null,
    isLineBelowFloor: false,
    overrides: item.overrides ?? null,
    custoBreakdown: null,
    displayNome: displayNome || item.displayNome || '—',
    frozen: true,
  }
}

export function buildFrozenTotals(lineViews, simulation, taxParams = {}) {
  const { icmsPercentual, pisCofinsPercentual } = resolveTaxParams(taxParams)
  const fromLinesValor = roundMoney(
    lineViews.reduce((acc, row) => acc + (row.valorTotal ?? 0), 0),
  )
  const fromLinesProposta = roundMoney(
    lineViews.reduce((acc, row) => acc + (row.propostaTotal ?? 0), 0),
  )
  const totalFinanceiro = roundMoney(
    lineViews.reduce((acc, row) => acc + (row.financeiroTotal ?? 0), 0),
  )
  const comissaoValorTotal = roundMoney(
    lineViews.reduce((acc, row) => acc + (row.comissaoValor ?? 0), 0),
  )
  const totalValor =
    simulation?.total_bruto != null && Number(simulation.total_bruto) > 0
      ? roundMoney(Number(simulation.total_bruto))
      : fromLinesValor
  const totalProposta =
    simulation?.total_proposta != null && Number(simulation.total_proposta) > 0
      ? roundMoney(Number(simulation.total_proposta))
      : fromLinesProposta

  return {
    totalValor,
    totalProposta,
    totalFinanceiro,
    margemLucroTotal: calcMargemLucro(
      totalProposta,
      totalFinanceiro,
      icmsPercentual,
      pisCofinsPercentual,
    ),
    margemLucroValorTotal: calcMargemLucroValor(
      totalProposta,
      totalFinanceiro,
      icmsPercentual,
      pisCofinsPercentual,
    ),
    comissaoValorTotal,
    globalStatus: 'Aprovado',
  }
}

export function isSimulationFrozen(simulation) {
  if (!simulation) return false
  if (simulation.valores_congelados_em) return true
  const status = simulation.status
  return (
    status === 'order_pending' ||
    status === 'converted' ||
    status === 'order_rejected' ||
    status === 'cancelled'
  )
}
