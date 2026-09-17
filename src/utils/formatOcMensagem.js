import { formatQtyByUnit, formatUsd } from './comprasUnits'
import { ocLiquidoUsd } from './comprasPrecos'
import { plantaFromFilial } from '../constants/compras'

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
    `Planta: ${plantaFromFilial(compra.filial_site) || compra.planta || '—'}`,
    `Tipo de entrega: ${compra.tipo_entrega || '—'}`,
    `Cidade / retirada: ${compra.cidade_retirada || '—'}`,
  ]

  for (const item of itens ?? []) {
    const liquido = ocLiquidoUsd(item.preco_usd, item.desconto_usd)
    lines.push(
      '',
      `Produto: ${item.product?.displayNome || '—'}`,
      `Embalagem: ${item.embalagem || '—'}`,
      `Volume: ${formatQtyByUnit(item.volume_kg, item.unidade_exibicao || 't')}`,
      `USD: ${formatUsd(liquido)}`,
    )
  }

  if (compra.observacoes?.trim()) {
    lines.push('', `Obs.: ${compra.observacoes.trim()}`)
  }

  return lines.join('\n')
}
