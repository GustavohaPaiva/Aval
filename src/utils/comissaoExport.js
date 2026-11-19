import { saoPauloDateOnly } from './autonomiaDesconto'
import { comissaoLiberadaPorQuitacao, dateKey } from './financeiroSituacao'

export const COMISSAO_EXPORT_HEADERS = [
  'Data da venda',
  'Data de vencimento do cliente',
  'Consultor',
  'Cliente',
  'Produto',
  'Valor total do produto (R$)',
  'Margem individual do produto (%)',
  'Comissão (%)',
  'Comissão (R$)',
  'Situação do pagamento',
]

const DATE_FMT = 'dd/mm/yyyy'
const MONEY_FMT = '"R$"#,##0.00'
const PERCENT_FMT = '0.00%'

const COL_WIDTHS = [16, 32, 28, 32, 36, 28, 34, 16, 18, 24]

function finiteNumber(value) {
  if (value == null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

/**
 * Mesma regra da tela: comissão liberada só com valor devido positivo e quitação integral.
 * Valor devido zero continua quitado na cobrança e sai como Não pago.
 */
export function situacaoPagamentoPedido(financeiro) {
  return comissaoLiberadaPorQuitacao(financeiro) ? 'Pago' : 'Não pago'
}

/**
 * Data da venda do pedido: simulations.data_negociacao.
 * É o dia de criação em America/Sao_Paulo e não é regravado na edição.
 * Sem essa data, vale o dia de created_at no mesmo fuso, como no painel.
 * data_venda existe só na carga histórica e não pertence ao pedido.
 */
export function dataVendaPedido(registro) {
  const sim = registro?.simulations ?? {}
  const negociada = dateKey(sim.data_negociacao ?? registro?.data_negociacao)
  if (negociada) return negociada
  return saoPauloDateOnly(sim.created_at ?? registro?.created_at)
}

/** Vencimento vigente: título renegociado quando existir; senão a data do pedido. */
export function dataVencimentoPedido(registro, financeiro) {
  const vigente = dateKey(financeiro?.vencimento)
  if (vigente) return vigente
  return dateKey(registro?.simulations?.data_pagamento)
}

function produtoNome(item) {
  return item?.produto_nome || item?.produtoNome || item?.produtos_oficiais?.nome || ''
}

/**
 * Uma linha por produto, com o snapshot já gravado.
 * Não usa a margem média do pedido e não recalcula a comissão.
 */
export function linhasExportacaoComissao({
  registros = [],
  itens = [],
  financeiroById = {},
} = {}) {
  const itensByRegistro = new Map()
  const seen = new Set()

  for (const item of itens ?? []) {
    const registroId = item?.comissao_registro_id ?? item?.comissaoRegistroId
    if (!registroId) continue

    const lineId = item.simulation_item_id ?? item.simulationItemId
    const lineKey = lineId ? `${registroId}:line:${lineId}` : null
    const idKey = item.id ? `${registroId}:id:${item.id}` : null
    if ((lineKey && seen.has(lineKey)) || (idKey && seen.has(idKey))) continue
    if (lineKey) seen.add(lineKey)
    if (idKey) seen.add(idKey)
    if (!lineKey && !idKey) continue

    const list = itensByRegistro.get(registroId) ?? []
    list.push(item)
    itensByRegistro.set(registroId, list)
  }

  const linhas = []
  for (const registro of registros ?? []) {
    const produtos = itensByRegistro.get(registro.id) ?? []
    if (produtos.length === 0) continue

    const financeiro =
      financeiroById[registro.simulation_id] ??
      financeiroById[registro.simulationId] ??
      null
    const situacao = situacaoPagamentoPedido(financeiro)
    const dataVenda = dataVendaPedido(registro)
    const dataVencimento = dataVencimentoPedido(registro, financeiro)
    const consultor = registro.consultor_nome || ''
    const cliente = registro.simulations?.clients?.nome || registro.cliente_nome || ''

    for (const item of produtos) {
      linhas.push({
        dataVenda,
        dataVencimento,
        consultor,
        cliente,
        produto: produtoNome(item),
        valorTotal: finiteNumber(item.base_calculo ?? item.baseCalculo) ?? 0,
        margemPercentual: finiteNumber(item.margem_percentual ?? item.margemPercentual),
        comissaoPercentual: finiteNumber(item.comissao_percentual ?? item.comissaoPercentual) ?? 0,
        comissaoValor: finiteNumber(item.comissao_valor ?? item.comissaoValor) ?? 0,
        situacaoPagamento: situacao,
      })
    }
  }

  return linhas
}

/** Número de série do Excel para o dia civil, sem deslocar pelo fuso. */
export function excelDateFromIso(iso) {
  const key = dateKey(iso)
  if (!key) return null
  const [year, month, day] = key.split('-').map(Number)
  const utc = Date.UTC(year, month - 1, day)
  const epoch = Date.UTC(1899, 11, 30)
  return Math.round((utc - epoch) / 86400000)
}

export function aoaComissoes(linhas) {
  return [
    COMISSAO_EXPORT_HEADERS,
    ...(linhas ?? []).map((linha) => [
      excelDateFromIso(linha.dataVenda),
      excelDateFromIso(linha.dataVencimento),
      linha.consultor ?? '',
      linha.cliente ?? '',
      linha.produto ?? '',
      linha.valorTotal,
      linha.margemPercentual == null ? null : linha.margemPercentual / 100,
      linha.comissaoPercentual == null ? null : linha.comissaoPercentual / 100,
      linha.comissaoValor,
      linha.situacaoPagamento,
    ]),
  ]
}

export function sheetComissoes(XLSX, linhas) {
  const sheet = XLSX.utils.aoa_to_sheet(aoaComissoes(linhas), { dateNF: DATE_FMT })
  const ref = sheet['!ref']
  if (ref) {
    const range = XLSX.utils.decode_range(ref)
    for (let row = 1; row <= range.e.r; row += 1) {
      for (const col of [0, 1]) {
        const addr = XLSX.utils.encode_cell({ r: row, c: col })
        const cell = sheet[addr]
        if (cell && (cell.t === 'n' || cell.t === 'd')) cell.z = DATE_FMT
      }
      for (const col of [5, 8]) {
        const addr = XLSX.utils.encode_cell({ r: row, c: col })
        const cell = sheet[addr]
        if (cell && cell.t === 'n') cell.z = MONEY_FMT
      }
      for (const col of [6, 7]) {
        const addr = XLSX.utils.encode_cell({ r: row, c: col })
        const cell = sheet[addr]
        if (cell && cell.t === 'n') cell.z = PERCENT_FMT
      }
    }
    sheet['!autofilter'] = { ref }
  }
  sheet['!cols'] = COL_WIDTHS.map((wch) => ({ wch }))
  return sheet
}

export function workbookComissoes(XLSX, linhas) {
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, sheetComissoes(XLSX, linhas), 'Comissões')
  return book
}
