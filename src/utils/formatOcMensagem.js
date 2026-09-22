import { formatQtyByUnit, formatUsd } from './comprasUnits'
import { ocUsdPedidoFornecedor } from './comprasPrecos'
import { ocFaturamento, ocLista, plantaFromFilial } from '../constants/compras'
import { formatDateBr } from './formatDateBr'

function bold(value) {
  return `*${String(value ?? '—').trim() || '—'}*`
}

export function formatOcMensagem(compra, itens, fornecedorNome) {
  if (!compra) return ''
  const faturamento = ocFaturamento(compra)
  const lines = [
    `Pedido de fertilizantes: ${bold(compra.numero)}`,
    '',
    `Fornecedora: ${bold(fornecedorNome || '—')}`,
    `Data: ${formatDateBr(compra.data_documento)}`,
    `Condição: ${compra.condicao_pagamento || '—'}`,
    `Planta: ${plantaFromFilial(compra.filial_site) || compra.planta || '—'}`,
    `Tipo de entrega: ${compra.tipo_entrega || '—'}`,
    `Cidade / retirada: ${compra.cidade_retirada || '—'}`,
  ]
  if (faturamento) lines.push(`Faturamento: ${faturamento}`)
  if (compra.entrega_retirada?.trim()) {
    lines.push(`Entrega/retirada: ${compra.entrega_retirada.trim()}`)
  }
  if (compra.ctc?.trim()) lines.push(`CTC: ${compra.ctc.trim()}`)

  for (const item of itens ?? []) {
    const usd = ocUsdPedidoFornecedor(item)
    const lista = ocLista(item)
    lines.push(
      '',
      `Produto: ${item.product?.displayNome || '—'}`,
      `Embalagem: ${item.embalagem || '—'}`,
      `Volume: ${formatQtyByUnit(item.volume_kg, item.unidade_exibicao || 't')}`,
      `USD: ${formatUsd(usd)}`,
    )
    if (item.cultura) lines.push(`Cultura: ${item.cultura}`)
    if (item.origem) lines.push(`Origem: ${item.origem}`)
    if (lista) lines.push(`Lista: ${lista}`)
  }

  if (compra.observacoes?.trim()) {
    lines.push('', `Obs.: ${compra.observacoes.trim()}`)
  }

  return lines.join('\n')
}
