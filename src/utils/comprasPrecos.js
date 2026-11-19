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
  const taxa = Number(taxaDolar)
  const cotacao = Number.isFinite(taxa) && taxa > 0 ? taxa : null
  const qty = ocQtyDisplay(volumeKg, unidade)
  const unitarioBrl =
    precoCorrigido == null || cotacao == null ? null : roundMoney(precoCorrigido * cotacao)
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

function numberOrNull(value) {
  if (value == null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

/** Valores por item impressos no pedido ao fornecedor (R$ salvos na OC; frete vazio = 0). */
export function ocItemValoresPedido(item) {
  return {
    usd: ocUsdPedidoFornecedor(item),
    unitarioBrl: numberOrNull(item?.unitario_brl),
    frete: numberOrNull(item?.frete) ?? 0,
    total: numberOrNull(item?.total),
  }
}

/** Soma dos totais R$ dos itens; null se nenhum item tem total. */
export function ocTotalBrl(itens) {
  const totais = (itens ?? []).map((item) => numberOrNull(item?.total)).filter((n) => n != null)
  if (totais.length === 0) return null
  return roundMoney(totais.reduce((acc, n) => acc + n, 0))
}

export const AVISO_DOLAR_AUSENTE =
  'A negociação não tem dólar registrado. Informe o valor manualmente. A cotação do dia não é usada.'

function mesmaMoeda(a, b) {
  return Math.abs(roundMoney(a) - roundMoney(b)) < 0.001
}

/**
 * Recupera a taxa que, aplicada ao líquido em dólar, reproduz o real já gravado.
 * Prefere 2 e depois 4 casas, como a cotação é gravada.
 * Se nenhuma fecha a conta, não inventa taxa.
 */
export function recuperarTaxaDolar(liquidoUsd, valorBrl) {
  const liquido = Number(liquidoUsd)
  const brl = Number(valorBrl)
  if (!(liquido > 0) || !(brl > 0)) return null
  const bruta = brl / liquido
  if (!Number.isFinite(bruta) || bruta <= 0) return null
  for (const casas of [2, 4]) {
    const taxa = Math.round(bruta * 10 ** casas) / 10 ** casas
    if (taxa > 0 && mesmaMoeda(liquido * taxa, brl)) return taxa
  }
  return null
}

function numeroPositivo(value) {
  if (value == null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : null
}

/**
 * Dólar registrado na negociação.
 * Usa o câmbio gravado no item ou o custo em reais congelado naquela venda.
 * Não consulta a cotação vigente.
 */
export function taxaNegociacaoRegistrada(fonte) {
  if (!fonte) return null
  const explicita = numeroPositivo(fonte.overrideTaxa)
  if (explicita != null) return explicita

  const custoUsd = numeroPositivo(
    fonte.overrideCustoUsd != null && fonte.overrideCustoUsd !== ''
      ? fonte.overrideCustoUsd
      : fonte.precoUsd,
  )
  const descontoInformado =
    fonte.overrideDescontoUsd != null && fonte.overrideDescontoUsd !== ''
      ? Number(fonte.overrideDescontoUsd)
      : Number(fonte.descontoUsd ?? 0)
  if (custoUsd == null || !Number.isFinite(descontoInformado)) return null
  return recuperarTaxaDolar(custoUsd - descontoInformado, fonte.custoBrlUnitario)
}

/**
 * Valor efetivo do dólar no item do pedido de compra.
 * O que já foi salvo no item prevalece sobre a negociação.
 */
export function resolverTaxaDolarItem(item) {
  const salva = numeroPositivo(item?.taxa_dolar)
  if (salva != null) return { taxa: salva, origem: 'salva' }

  const inferida = inferTaxaDolar({
    precoUsd: item?.preco_usd,
    descontoUsd: item?.desconto_usd,
    unitarioBrl: item?.unitario_brl,
    precoCorrigido: item?.preco_corrigido,
  })
  if (inferida != null && inferida > 0) {
    const base =
      item?.preco_corrigido != null && Number(item.preco_corrigido) > 0
        ? Number(item.preco_corrigido)
        : ocLiquidoUsd(item?.preco_usd, item?.desconto_usd)
    const limpa = base > 0 ? recuperarTaxaDolar(base, item?.unitario_brl) : null
    return { taxa: limpa ?? inferida, origem: 'item' }
  }

  const negociada = taxaNegociacaoRegistrada(item?.negociacao)
  if (negociada != null) return { taxa: negociada, origem: 'negociacao' }
  return { taxa: null, origem: 'ausente' }
}

export function taxaDolarInput(taxa) {
  const n = numeroPositivo(taxa)
  if (n == null) return ''
  return String(Number(n.toFixed(6)))
}

export function formatTaxaDolar(value) {
  const n = numeroPositivo(value)
  if (n == null) return null
  return n.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  })
}

/** Cotação única das negociações ligadas ao item. Divergência não escolhe uma delas. */
export function negociacaoDoItem(item, fontes) {
  const taxas = (fontes ?? [])
    .map((fonte) =>
      taxaNegociacaoRegistrada({
        overrideTaxa: fonte?.override_taxa ?? fonte?.overrideTaxa,
        overrideCustoUsd: fonte?.override_custo_usd ?? fonte?.overrideCustoUsd,
        overrideDescontoUsd: fonte?.override_desconto_usd ?? fonte?.overrideDescontoUsd,
        custoBrlUnitario: fonte?.custo_brl_unitario ?? fonte?.custoBrlUnitario,
        precoUsd: item?.preco_usd,
        descontoUsd: item?.desconto_usd,
      }),
    )
    .filter((taxa) => taxa != null)
  if (taxas.length === 0) return null
  const primeira = taxas[0]
  if (!taxas.every((taxa) => Math.abs(taxa - primeira) < 0.000001)) return null
  return { overrideTaxa: primeira }
}

/** Uma taxa para o cabeçalho quando todos os itens usam o mesmo dólar. */
export function dolarNegociadoResumo(itens) {
  const taxas = (itens ?? []).map((item) => resolverTaxaDolarItem(item).taxa)
  const presentes = taxas.filter((taxa) => taxa != null)
  if (presentes.length === 0) return { taxa: null, unico: false, ausente: true }
  const primeira = presentes[0]
  const unico = taxas.every(
    (taxa) => taxa != null && Math.abs(taxa - primeira) < 0.000001,
  )
  return { taxa: unico ? primeira : null, unico, ausente: false }
}

/**
 * Preços do item da OC a partir da negociação.
 * taxaDolar informado vence a negociação. Sem registro, o câmbio fica vazio.
 */
export function precoOcFromNegociacao(row, { volumeKg, unidade, taxaDolar } = {}) {
  const custo =
    row?.overrideCustoUsd != null && row.overrideCustoUsd !== ''
      ? Number(row.overrideCustoUsd)
      : Number(row?.product?.preco_original ?? 0)
  const desconto =
    row?.overrideDescontoUsd != null && row.overrideDescontoUsd !== ''
      ? Number(row.overrideDescontoUsd)
      : Number(row?.product?.desconto_usd ?? 0)
  const informada = numeroPositivo(taxaDolar)
  const taxa =
    informada ??
    taxaNegociacaoRegistrada({
      overrideTaxa: row?.overrideTaxa,
      overrideCustoUsd: row?.overrideCustoUsd,
      overrideDescontoUsd: row?.overrideDescontoUsd,
      custoBrlUnitario: row?.custoBrlUnitario,
      precoUsd: custo,
      descontoUsd: desconto,
    })
  const vencimento = row?.overrideVencimentoLista || row?.product?.vencimento_lista || null
  const valores = calcOcItemValores({
    precoUsd: custo,
    descontoUsd: desconto,
    taxaDolar: taxa ?? 0,
    volumeKg,
    unidade: unidade ?? 't',
    vencimentoLista: vencimento,
    pagamentoSyagri: vencimento,
    taxaJuros: row?.product?.taxaJuros,
  })
  const temCambio = taxa != null && taxa > 0 && volumeKg != null
  return {
    preco_usd: Number.isFinite(custo) ? custo : null,
    desconto_usd: Number.isFinite(desconto) ? desconto : null,
    vencimento_lista: vencimento,
    pagamento_syagri: vencimento,
    preco_corrigido: valores.precoCorrigido,
    juros: valores.juros,
    lista: row?.product?.quarter || null,
    taxa_dolar: temCambio ? taxa : null,
    unitario_brl: temCambio ? valores.unitarioBrl : null,
    total: temCambio ? valores.total : null,
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
