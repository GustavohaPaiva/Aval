import { formatQtyByUnit, formatUsd } from './comprasUnits'
import { ocItemValoresPedido, ocTotalBrl } from './comprasPrecos'
import {
  cidadeRetiradaFromFilial,
  ocFaturamento,
  ocItemVencimento,
  ocLista,
  ocVencimentoUnico,
  plantaFromFilial,
  tipoEntregaLabel,
} from '../constants/compras'
import { formatDateBr } from './formatDateBr'
import { formatBRL } from './money'

function bold(value) {
  return `*${String(value ?? '—').trim() || '—'}*`
}

function brlOrDash(value) {
  return value == null ? '—' : formatBRL(value)
}

export function formatOcMensagem(compra, itens, fornecedorNome) {
  if (!compra) return ''
  const faturamento = ocFaturamento(compra)
  const vencimentoUnico = ocVencimentoUnico(itens)
  const lines = [
    `Pedido de fertilizantes: ${bold(compra.numero)}`,
    '',
    `Fornecedora: ${bold(fornecedorNome || '—')}`,
    `Data do pedido: ${formatDateBr(compra.data_documento)}`,
  ]
  if (vencimentoUnico) lines.push(`Data de vencimento: ${formatDateBr(vencimentoUnico)}`)
  lines.push(
    `Condição: ${compra.condicao_pagamento || '—'}`,
    `Planta: ${plantaFromFilial(compra.filial_site) || compra.planta || '—'}`,
    `Tipo de entrega: ${tipoEntregaLabel(compra.tipo_entrega)}`,
    `Cidade / retirada: ${cidadeRetiradaFromFilial(compra.filial_site) || compra.cidade_retirada || '—'}`,
  )
  if (faturamento) lines.push(`Faturamento: ${faturamento}`)
  if (compra.entrega_retirada?.trim()) {
    lines.push(`Entrega/retirada: ${compra.entrega_retirada.trim()}`)
  }
  if (compra.ctc?.trim()) lines.push(`CTC: ${compra.ctc.trim()}`)

  for (const item of itens ?? []) {
    const valores = ocItemValoresPedido(item)
    const lista = ocLista(item)
    lines.push(
      '',
      `Produto: ${item.product?.displayNome || '—'}`,
      `Embalagem: ${item.embalagem || '—'}`,
      `Volume: ${formatQtyByUnit(item.volume_kg, item.unidade_exibicao || 't')}`,
      `USD: ${formatUsd(valores.usd)}`,
      `R$: ${brlOrDash(valores.unitarioBrl)}`,
      `Frete: ${formatBRL(valores.frete)}`,
      `Total: ${brlOrDash(valores.total)}`,
    )
    if (!vencimentoUnico) {
      const vencimento = ocItemVencimento(item)
      if (vencimento) lines.push(`Vencimento: ${formatDateBr(vencimento)}`)
    }
    if (item.cultura) lines.push(`Cultura: ${item.cultura}`)
    if (item.origem) lines.push(`Origem: ${item.origem}`)
    if (lista) lines.push(`Lista: ${lista}`)
  }

  const totalOc = ocTotalBrl(itens)
  lines.push('', `Total da OC: ${bold(brlOrDash(totalOc))}`)

  if (compra.observacoes?.trim()) {
    lines.push('', `Obs.: ${compra.observacoes.trim()}`)
  }

  return lines.join('\n')
}
