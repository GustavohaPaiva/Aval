import {
  LOGISTICA_STATUS_FLOW,
  STATUS_LOGISTICA_CARTEIRA,
  STATUS_LOGISTICA_PROGRAMADO,
  isStatusLogistica,
  normalizeStatusLogistica,
} from './logisticaStatus'

const ESCALA = 1000

function unidades(value) {
  return Math.round(Number(value) * ESCALA)
}

export function roundQuantidade(value) {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return null
  return unidades(n) / ESCALA
}

export function parseQuantidade(raw) {
  if (raw == null) return 0
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return null
    return roundQuantidade(raw)
  }
  const text = String(raw).trim().replace(/\s/g, '').replace(',', '.')
  if (!text) return 0
  if (!/^-?\d+(\.\d+)?$/.test(text)) return null
  return roundQuantidade(text)
}

function somar(valores) {
  const total = valores.reduce((acc, n) => acc + (Number(n) || 0), 0)
  return roundQuantidade(total) ?? 0
}

function excede(a, b) {
  return unidades(a) > unidades(b)
}

function mesmaQuantidade(a, b) {
  return unidades(a) === unidades(b)
}

function alocadoPorItem(entregas) {
  const map = new Map()
  for (const entrega of entregas ?? []) {
    for (const linha of entrega.itens ?? []) {
      const id = linha.simulationItemId || linha.itemId
      if (!id) continue
      const qtd = roundQuantidade(linha.quantidade) ?? 0
      map.set(id, somar([map.get(id) ?? 0, qtd]))
    }
  }
  return map
}

/** Volume original, já programado e ainda pendente de cada item do pedido. */
export function itensComSaldo(pedido) {
  const alocado = alocadoPorItem(pedido?.entregas)
  return (pedido?.itens ?? []).map((item) => {
    const original = roundQuantidade(item.volume) ?? 0
    const usado = alocado.get(item.id) ?? 0
    const pendente = Math.max(0, roundQuantidade(original - usado) ?? 0)
    return {
      ...item,
      volumeOriginal: original,
      volumeProgramadoItem: usado,
      volumePendente: pendente,
    }
  })
}

/**
 * Valida quantidades contra o saldo pendente exibido (item.volume ou volumePendente).
 * Quantidade ausente vale zero. Total quando cada saldo pendente é coberto por inteiro.
 */
export function validarProgramacao(itens, quantidadesPorItem = {}) {
  const erros = []
  const linhas = []
  let cobreTudo = true

  for (const item of itens ?? []) {
    const pendente = roundQuantidade(item.volumePendente ?? item.volume) ?? 0
    const informado = Object.prototype.hasOwnProperty.call(quantidadesPorItem, item.id)
      ? quantidadesPorItem[item.id]
      : 0
    const qtd = parseQuantidade(informado)
    if (qtd == null) {
      erros.push({ itemId: item.id, mensagem: 'Informe um número válido.' })
      cobreTudo = false
      continue
    }
    if (qtd < 0) {
      erros.push({ itemId: item.id, mensagem: 'A quantidade não pode ser negativa.' })
      cobreTudo = false
      continue
    }
    if (excede(qtd, pendente)) {
      erros.push({ itemId: item.id, mensagem: 'Acima do saldo pendente.' })
      cobreTudo = false
      continue
    }
    if (!mesmaQuantidade(qtd, pendente)) cobreTudo = false
    linhas.push({ itemId: item.id, quantidade: qtd, pendente })
  }

  const positivas = linhas.filter((linha) => linha.quantidade > 0)
  if (!erros.length && positivas.length === 0) {
    erros.push({
      itemId: null,
      mensagem: 'Informe a quantidade de ao menos um item.',
    })
  }

  const totalProgramado = somar(linhas.map((linha) => linha.quantidade))
  const totalPendente = somar(linhas.map((linha) => linha.pendente))
  return {
    ok: erros.length === 0,
    erros,
    linhas: positivas,
    modo: erros.length === 0 && cobreTudo ? 'total' : 'parcial',
    totalProgramado,
    totalRestante: roundQuantidade(totalPendente - totalProgramado) ?? 0,
  }
}

export function quantidadesProgramarTudo(itens) {
  const quantidades = {}
  for (const item of itens ?? []) {
    const pendente = roundQuantidade(item.volumePendente ?? item.volume) ?? 0
    if (pendente > 0) quantidades[item.id] = pendente
  }
  return quantidades
}

/**
 * Espelha a RPC programar_entrega_logistica.
 * Total: o saldo pendente muda de status no mesmo pedido, sem nova entrega.
 * Parcial: só a quantidade informada vira uma entrega ligada ao pedido original.
 */
export function registrarProgramacao(
  pedido,
  quantidadesPorItem,
  { entregaId = 'entrega-nova', agora = new Date().toISOString() } = {},
) {
  if (normalizeStatusLogistica(pedido?.statusLogistica) !== STATUS_LOGISTICA_CARTEIRA) {
    return { ok: false, error: 'O saldo deste pedido não está na carteira.' }
  }

  const saldo = itensComSaldo(pedido).filter((item) => item.volumePendente > 0)
  if (saldo.length === 0) {
    return { ok: false, error: 'Não há saldo pendente para programar.' }
  }

  const validacao = validarProgramacao(
    saldo.map((item) => ({ ...item, volume: item.volumePendente })),
    quantidadesPorItem,
  )
  if (!validacao.ok) {
    return {
      ok: false,
      error: validacao.erros[0]?.mensagem || 'Quantidade inválida.',
      validacao,
    }
  }

  if (validacao.modo === 'total') {
    return {
      ok: true,
      modo: 'total',
      pedido: {
        ...pedido,
        statusLogistica: STATUS_LOGISTICA_PROGRAMADO,
        statusLogisticaEm: agora,
      },
    }
  }

  const entrega = {
    id: entregaId,
    simulationId: pedido.simulationId,
    statusLogistica: STATUS_LOGISTICA_PROGRAMADO,
    statusLogisticaEm: agora,
    itens: validacao.linhas.map((linha) => ({
      simulationItemId: linha.itemId,
      quantidade: linha.quantidade,
    })),
  }

  return {
    ok: true,
    modo: 'parcial',
    entregaId,
    pedido: {
      ...pedido,
      entregas: [...(pedido.entregas ?? []), entrega],
    },
  }
}

function pedidoSemEntregas(pedido) {
  const copia = { ...pedido }
  delete copia.entregas
  return copia
}

function totaisDoPedido(saldo, statusBase) {
  const original = somar(saldo.map((item) => item.volumeOriginal))
  const pendente =
    statusBase === STATUS_LOGISTICA_CARTEIRA
      ? somar(saldo.map((item) => item.volumePendente))
      : 0
  return {
    volumePendenteTotal: pendente,
    volumeProgramadoTotal: roundQuantidade(original - pendente) ?? 0,
  }
}

/**
 * Um pedido continua sendo uma simulação. O Kanban mostra o saldo e,
 * quando há entrega parcial, um cartão por entrega — todos com o mesmo simulationId.
 */
export function montarCartoesLogistica(pedidos) {
  const cards = []
  for (const pedido of pedidos ?? []) {
    const saldo = itensComSaldo(pedido)
    const entregas = pedido.entregas ?? []
    const parcial = entregas.length > 0
    const statusBase = normalizeStatusLogistica(pedido.statusLogistica)
    const totais = totaisDoPedido(saldo, statusBase)
    const saldoVisivel = saldo
      .filter((item) => item.volumePendente > 0)
      .map((item) => ({ ...item, volume: item.volumePendente }))
    const mostrarBase = entregas.length === 0 || saldoVisivel.length > 0

    if (mostrarBase) {
      const itensBase =
        entregas.length === 0
          ? saldo.map((item) => ({ ...item, volume: item.volumeOriginal }))
          : saldoVisivel
      cards.push({
        ...pedidoSemEntregas(pedido),
        cardId: pedido.simulationId,
        entregaId: null,
        statusLogistica: statusBase,
        itens: itensBase,
        entregaParcial: parcial,
        volumeEtapa: somar(itensBase.map((item) => item.volume)),
        ...totais,
      })
    }

    entregas.forEach((entrega) => {
      const porItem = new Map(
        (entrega.itens ?? []).map((linha) => [
          linha.simulationItemId,
          roundQuantidade(linha.quantidade) ?? 0,
        ]),
      )
      const itens = saldo
        .filter((item) => (porItem.get(item.id) ?? 0) > 0)
        .map((item) => ({ ...item, volume: porItem.get(item.id) }))
      cards.push({
        ...pedidoSemEntregas(pedido),
        cardId: `${pedido.simulationId}:${entrega.id}`,
        entregaId: entrega.id,
        statusLogistica: normalizeStatusLogistica(entrega.statusLogistica),
        statusLogisticaEm: entrega.statusLogisticaEm ?? null,
        itens,
        entregaParcial: true,
        volumeEtapa: somar(itens.map((item) => item.volume)),
        ...totais,
      })
    })
  }
  return cards
}

export function motivoBloqueioMovimento(row, nextStatus) {
  if (!isStatusLogistica(nextStatus)) return 'Status logístico inválido.'
  const current = normalizeStatusLogistica(row?.statusLogistica)
  if (current === nextStatus) return 'igual'
  if (!row?.entregaId && current === STATUS_LOGISTICA_CARTEIRA && nextStatus === STATUS_LOGISTICA_PROGRAMADO) {
    return 'programar'
  }
  if (!row?.entregaId && current === STATUS_LOGISTICA_CARTEIRA) {
    return 'Programe a entrega antes de avançar o pedido.'
  }
  if (row?.entregaId && nextStatus === STATUS_LOGISTICA_CARTEIRA) {
    return 'A quantidade já separada não volta para a carteira por aqui.'
  }
  return null
}

export function opcoesStatusDoCard(row) {
  if (row?.entregaId) {
    return LOGISTICA_STATUS_FLOW.filter((status) => status.id !== STATUS_LOGISTICA_CARTEIRA)
  }
  if (normalizeStatusLogistica(row?.statusLogistica) === STATUS_LOGISTICA_CARTEIRA) {
    return LOGISTICA_STATUS_FLOW.filter(
      (status) =>
        status.id === STATUS_LOGISTICA_CARTEIRA ||
        status.id === STATUS_LOGISTICA_PROGRAMADO,
    )
  }
  return LOGISTICA_STATUS_FLOW
}

/**
 * Reaplica uma movimentação ainda não confirmada sobre os pedidos do servidor.
 * A chave da carteira é o simulationId; a de uma entrega é simulationId:entregaId.
 */
export function aplicarPendenciasLogistica(pedidos, pending) {
  const nextPending = new Map(pending)
  const rows = (pedidos ?? []).map((pedido) => {
    const baseKey = pedido.simulationId
    const baseOverlay = nextPending.get(baseKey)
    let next = pedido
    if (baseOverlay) {
      if (normalizeStatusLogistica(pedido.statusLogistica) === baseOverlay.statusLogistica) {
        nextPending.delete(baseKey)
      } else {
        next = {
          ...pedido,
          statusLogistica: baseOverlay.statusLogistica,
          statusLogisticaEm: baseOverlay.statusLogisticaEm ?? pedido.statusLogisticaEm,
        }
      }
    }

    const entregas = (next.entregas ?? []).map((entrega) => {
      const chave = `${pedido.simulationId}:${entrega.id}`
      const overlay = nextPending.get(chave)
      if (!overlay) return entrega
      if (normalizeStatusLogistica(entrega.statusLogistica) === overlay.statusLogistica) {
        nextPending.delete(chave)
        return entrega
      }
      return {
        ...entrega,
        statusLogistica: overlay.statusLogistica,
        statusLogisticaEm: overlay.statusLogisticaEm ?? entrega.statusLogisticaEm,
      }
    })

    return { ...next, entregas }
  })
  return { rows, pending: nextPending }
}

export function moverStatusLogistica(pedido, { cardId, status }) {
  const card = montarCartoesLogistica([pedido]).find((item) => item.cardId === cardId)
  if (!card) return { ok: false, error: 'Cartão não encontrado.' }
  const bloqueio = motivoBloqueioMovimento(card, status)
  if (bloqueio === 'igual') return { ok: true, pedido }
  if (bloqueio === 'programar') return { ok: false, programar: true, error: 'programar' }
  if (bloqueio) return { ok: false, error: bloqueio }

  const agora = new Date().toISOString()
  if (card.entregaId) {
    return {
      ok: true,
      pedido: {
        ...pedido,
        entregas: (pedido.entregas ?? []).map((entrega) =>
          entrega.id === card.entregaId
            ? { ...entrega, statusLogistica: status, statusLogisticaEm: agora }
            : entrega,
        ),
      },
    }
  }

  return {
    ok: true,
    pedido: {
      ...pedido,
      statusLogistica: status,
      statusLogisticaEm: agora,
    },
  }
}
