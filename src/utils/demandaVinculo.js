import { compraStatusLabel } from '../constants/compras'
import { formatQtyBoth } from './comprasUnits'

export function linhaTemACaminho(alocacoes) {
  return (alocacoes ?? []).some((a) => {
    if (a.origem_tipo !== 'compra') return false
    const status = a.compra_itens?.compras?.status
    const recebido = Number(a.compra_itens?.volume_recebido_kg) || 0
    return recebido <= 0.0001 && status !== 'cancelado' && status !== 'recebido'
  })
}

export function pedidoCoberturaStatus(linhas) {
  if (!linhas?.length) return 'sem'
  const faltante = linhas.reduce((acc, row) => acc + (row.faltanteKg || 0), 0)
  const vinculado = linhas.reduce((acc, row) => acc + (row.lastreadoKg || 0), 0)
  if (faltante <= 0.0001) return 'completo'
  if (vinculado <= 0.0001) return 'sem'
  if (linhas.some((row) => linhaTemACaminho(row.alocacoes))) return 'a_caminho'
  return 'parcial'
}

export function describeVinculo(aloc) {
  const qty = formatQtyBoth(aloc.quantidade_kg)
  if (aloc.origem_tipo === 'estoque') {
    const lote = aloc.estoque_lotes
    const embalagem = lote?.embalagem ? ` · ${lote.embalagem}` : ''
    if (aloc.baixa_fisica) {
      return {
        tone: 'ok',
        title: 'Saiu do estoque',
        detail: `${qty}${embalagem}${lote?.local ? ` · ${lote.local}` : ''}`,
      }
    }
    return {
      tone: 'ok',
      title: 'Separado no estoque',
      detail: `${qty}${embalagem}${lote?.local ? ` · ${lote.local}` : ''}`,
    }
  }

  const oc = aloc.compra_itens?.compras
  const item = aloc.compra_itens
  const numero = oc?.numero || 'OC'
  const status = oc?.status
  const recebido = Number(item?.volume_recebido_kg) || 0
  const pedido = Number(item?.volume_kg) || 0
  const fornecedor = oc?.fornecedores?.nome

  if (status === 'recebido' || (pedido > 0 && recebido >= pedido - 0.0001)) {
    return {
      tone: 'ok',
      title: 'Chegou do fornecedor',
      detail: `${numero} · ${qty}${fornecedor ? ` · ${fornecedor}` : ''}`,
      ocId: oc?.id,
      ocNumero: numero,
    }
  }
  if (recebido > 0.0001) {
    return {
      tone: 'warn',
      title: 'Chegando (parcial)',
      detail: `${numero} · recebido ${formatQtyBoth(recebido)} de ${formatQtyBoth(pedido)}`,
      ocId: oc?.id,
      ocNumero: numero,
    }
  }
  if (status === 'confirmado') {
    return {
      tone: 'warn',
      title: 'A caminho',
      detail: `${numero} · confirmado, aguardando chegada${fornecedor ? ` · ${fornecedor}` : ''}`,
      ocId: oc?.id,
      ocNumero: numero,
    }
  }
  if (status === 'enviado') {
    return {
      tone: 'warn',
      title: 'A caminho',
      detail: `${numero} · pedido enviado ao fornecedor${fornecedor ? ` · ${fornecedor}` : ''}`,
      ocId: oc?.id,
      ocNumero: numero,
    }
  }
  return {
    tone: 'muted',
    title: 'Pedido ao fornecedor',
    detail: `${numero} · ${compraStatusLabel(status)} · ${qty}`,
    ocId: oc?.id,
    ocNumero: numero,
  }
}

export function resumoLinha(row) {
  if (row.faltanteKg <= 0.0001) {
    if (linhaTemACaminho(row.alocacoes)) {
      return {
        tone: 'warn',
        title: 'A caminho',
        text: 'Volume já pedido ao fornecedor. Ainda não chegou no estoque.',
      }
    }
    if ((row.alocacoes ?? []).some((a) => a.origem_tipo === 'estoque' && a.baixa_fisica)) {
      return {
        tone: 'ok',
        title: 'Atendido pelo estoque',
        text: 'Produto saiu do estoque para este pedido.',
      }
    }
    if ((row.alocacoes ?? []).some((a) => a.origem_tipo === 'estoque')) {
      return {
        tone: 'ok',
        title: 'Separado no estoque',
        text: 'Produto chegou e está separado para este pedido.',
      }
    }
    return {
      tone: 'ok',
      title: 'Coberto',
      text: 'Tudo vinculado.',
    }
  }
  if (linhaTemACaminho(row.alocacoes)) {
    return {
      tone: 'warn',
      title: 'Parcial · ainda vem produto',
      text: `Falta ${formatQtyBoth(row.faltanteKg)}. Parte já está pedida ao fornecedor.`,
    }
  }
  if (row.lastreadoKg > 0.0001) {
    return {
      tone: 'warn',
      title: 'Parcial',
      text: `Falta ${formatQtyBoth(row.faltanteKg)} para cobrir a venda.`,
    }
  }
  return {
    tone: 'muted',
    title: 'Sem vínculo',
    text: 'Ainda não tem estoque nem ordem de compra para esta linha.',
  }
}

export function bannerToneClass(tone) {
  if (tone === 'ok') return 'border-emerald-200 bg-emerald-50 text-emerald-950'
  if (tone === 'warn') return 'border-amber-200 bg-amber-50 text-amber-950'
  return 'border-slate-200 bg-slate-50 text-slate-800'
}
