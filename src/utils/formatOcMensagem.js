import { formatQtyByUnit, formatUsd } from './comprasUnits'

function bold(value) {
  return `*${String(value ?? '—').trim() || '—'}*`
}

function formatDateBr(iso) {
  if (!iso) return '—'
  const raw = String(iso)
  const dayOnly = raw.match(/^(\d{4})-(\d{2})-(\d{2})/)
  const d = dayOnly
    ? new Date(`${dayOnly[1]}-${dayOnly[2]}-${dayOnly[3]}T12:00:00`)
    : new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('pt-BR')
}

export function formatOcMensagem(compra, itens, fornecedorNome) {
  if (!compra) return ''
  const lines = [
    `Pedido de fertilizantes: ${bold(compra.numero)}`,
    '',
    `Fornecedora: ${bold(fornecedorNome || '—')}`,
    `Data: ${formatDateBr(compra.data_documento)}`,
    `Condição: ${compra.condicao_pagamento || '—'}`,
    `Planta: ${compra.planta || '—'}`,
    `Tipo de entrega: ${compra.tipo_entrega || '—'}`,
    `Cidade / retirada: ${compra.cidade_retirada || '—'}`,
  ]

  for (const item of itens ?? []) {
    const liquido =
      item.preco_usd != null
        ? Number(item.preco_usd) - (Number(item.desconto_usd) || 0)
        : null
    lines.push(
      '',
      `Produto: ${item.product?.displayNome || '—'}`,
      `Embalagem: ${item.embalagem || '—'}`,
      `Volume: ${formatQtyByUnit(item.volume_kg, item.unidade_exibicao || 't')}`,
      `USD: ${formatUsd(item.preco_usd)} · Desc.: ${formatUsd(item.desconto_usd)} · Líquido: ${
        liquido == null ? '—' : formatUsd(liquido)
      }`,
    )
  }

  if (compra.observacoes?.trim()) {
    lines.push('', `Obs.: ${compra.observacoes.trim()}`)
  }

  return lines.join('\n')
}
