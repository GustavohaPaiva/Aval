import { describe, expect, it } from 'vitest'
import {
  aplicarPendenciasLogistica,
  montarCartoesLogistica,
  motivoBloqueioMovimento,
  moverStatusLogistica,
  opcoesStatusDoCard,
  parseQuantidade,
  quantidadesProgramarTudo,
  registrarProgramacao,
  validarProgramacao,
} from './logisticaProgramacao'

function pedidoBase() {
  return {
    simulationId: 'ped-1',
    clientNome: 'Fazenda Boa Vista',
    statusLogistica: 'carteira',
    itens: [
      { id: 'a', nome: 'MAP', volume: 10 },
      { id: 'b', nome: 'KCl', volume: 4 },
      { id: 'c', nome: 'Ureia', volume: 3 },
    ],
    entregas: [],
  }
}

function cartao(pedido, status) {
  return montarCartoesLogistica([pedido]).find((card) => card.statusLogistica === status)
}

function somaDoItem(cards, itemId) {
  return cards.reduce((total, card) => {
    const item = card.itens.find((linha) => linha.id === itemId)
    return total + (item ? item.volume : 0)
  }, 0)
}

describe('programação de entregas', () => {
  it('programa todo o saldo e mantém um único cartão em Programado', () => {
    const pedido = pedidoBase()
    const tudo = quantidadesProgramarTudo(pedido.itens)
    const resultado = registrarProgramacao(pedido, tudo, { agora: '2026-10-13T12:00:00Z' })

    expect(resultado.ok).toBe(true)
    expect(resultado.modo).toBe('total')
    expect(resultado.pedido.entregas).toEqual([])
    expect(resultado.pedido.simulationId).toBe('ped-1')

    const cards = montarCartoesLogistica([resultado.pedido])
    expect(cards).toHaveLength(1)
    expect(cards[0].statusLogistica).toBe('programado')
    expect(cards[0].entregaParcial).toBe(false)
    expect(cards[0].itens.map((item) => item.volume)).toEqual([10, 4, 3])
    expect(cards.filter((card) => card.statusLogistica === 'carteira')).toHaveLength(0)
  })

  it('separa vários itens sem duplicar o pedido e deixa o saldo na Carteira', () => {
    const resultado = registrarProgramacao(
      pedidoBase(),
      { a: '5', b: '2,5', c: 0 },
      { entregaId: 'ent-1' },
    )

    expect(resultado.ok).toBe(true)
    expect(resultado.modo).toBe('parcial')
    expect(resultado.pedido.simulationId).toBe('ped-1')
    expect(resultado.pedido.statusLogistica).toBe('carteira')
    expect(resultado.pedido.entregas).toHaveLength(1)

    const cards = montarCartoesLogistica([resultado.pedido])
    expect(cards).toHaveLength(2)
    expect(new Set(cards.map((card) => card.simulationId))).toEqual(new Set(['ped-1']))

    const carteira = cartao(resultado.pedido, 'carteira')
    const programado = cartao(resultado.pedido, 'programado')
    expect(carteira.itens.map((item) => [item.id, item.volume])).toEqual([
      ['a', 5],
      ['b', 1.5],
      ['c', 3],
    ])
    expect(programado.itens.map((item) => [item.id, item.volume])).toEqual([
      ['a', 5],
      ['b', 2.5],
    ])
    expect(carteira.entregaParcial).toBe(true)
    expect(programado.entregaParcial).toBe(true)
    expect(carteira.volumePendenteTotal).toBe(9.5)
    expect(carteira.volumeProgramadoTotal).toBe(7.5)
    expect(programado.volumePendenteTotal).toBe(9.5)
    expect(programado.volumeProgramadoTotal).toBe(7.5)
    expect(somaDoItem(cards, 'a')).toBe(10)
    expect(somaDoItem(cards, 'b')).toBe(4)
    expect(somaDoItem(cards, 'c')).toBe(3)
  })

  it('leva a entrega parcial até Entregue e conserva o saldo na Carteira', () => {
    const parcial = registrarProgramacao(pedidoBase(), { a: 4, b: 1, c: 0 }, { entregaId: 'ent-1' })
    const emTransito = moverStatusLogistica(parcial.pedido, {
      cardId: 'ped-1:ent-1',
      status: 'em_transito',
    })
    const entregue = moverStatusLogistica(emTransito.pedido, {
      cardId: 'ped-1:ent-1',
      status: 'entregue',
    })

    expect(entregue.ok).toBe(true)
    const cards = montarCartoesLogistica([entregue.pedido])
    expect(cards.find((card) => card.entregaId === 'ent-1').statusLogistica).toBe('entregue')
    expect(cards.find((card) => card.entregaId === 'ent-1').itens.map((item) => item.volume)).toEqual([
      4, 1,
    ])
    const carteira = cards.find((card) => card.statusLogistica === 'carteira')
    expect(carteira.itens.map((item) => [item.id, item.volume])).toEqual([
      ['a', 6],
      ['b', 3],
      ['c', 3],
    ])
    expect(carteira.simulationId).toBe('ped-1')
  })

  it('programa o saldo restante inteiro sem criar outra cópia do pedido', () => {
    const parcial = registrarProgramacao(pedidoBase(), { a: 4 }, { entregaId: 'ent-1' })
    const resto = quantidadesProgramarTudo(
      montarCartoesLogistica([parcial.pedido]).find((card) => card.statusLogistica === 'carteira').itens,
    )
    const total = registrarProgramacao(parcial.pedido, resto)

    expect(total.modo).toBe('total')
    expect(total.pedido.entregas).toHaveLength(1)
    const cards = montarCartoesLogistica([total.pedido])
    expect(cards.find((card) => card.statusLogistica === 'carteira')).toBeUndefined()
    expect(cards.filter((card) => card.statusLogistica === 'programado')).toHaveLength(2)
    expect(cards.every((card) => card.simulationId === 'ped-1' && card.entregaParcial)).toBe(true)
    expect(cards[0].volumePendenteTotal).toBe(0)
  })

  it('recusa quantidade acima do saldo, negativa, inválida ou zerada', () => {
    const itens = pedidoBase().itens
    expect(validarProgramacao(itens, { a: 11, b: 0, c: 0 }).ok).toBe(false)
    expect(validarProgramacao(itens, { a: 11, b: 0, c: 0 }).erros[0].mensagem).toMatch(/saldo/)
    expect(validarProgramacao(itens, { a: -1 }).erros[0].mensagem).toMatch(/negativa/)
    expect(validarProgramacao(itens, { a: 'abc' }).erros[0].mensagem).toMatch(/válido/)
    expect(validarProgramacao(itens, { a: 0, b: 0, c: 0 }).ok).toBe(false)

    const parcial = registrarProgramacao(pedidoBase(), { a: 8 }, { entregaId: 'ent-1' })
    const segunda = registrarProgramacao(parcial.pedido, { a: 8 })
    expect(segunda.ok).toBe(false)
    expect(segunda.error).toMatch(/saldo/)
  })

  it('não deixa um segundo clique programar de novo o que já saiu da carteira', () => {
    const tudo = quantidadesProgramarTudo(pedidoBase().itens)
    const primeira = registrarProgramacao(pedidoBase(), tudo)
    const segunda = registrarProgramacao(primeira.pedido, tudo)
    expect(primeira.modo).toBe('total')
    expect(segunda.ok).toBe(false)
    expect(montarCartoesLogistica([primeira.pedido])).toHaveLength(1)
  })

  it('só oferece Programado a partir da Carteira e segue o fluxo simples depois', () => {
    const carteira = montarCartoesLogistica([pedidoBase()])[0]
    expect(opcoesStatusDoCard(carteira).map((status) => status.id)).toEqual([
      'carteira',
      'programado',
    ])
    expect(motivoBloqueioMovimento(carteira, 'programado')).toBe('programar')
    expect(motivoBloqueioMovimento(carteira, 'em_transito')).toMatch(/Programe/)

    const parcial = registrarProgramacao(pedidoBase(), { a: 4 }, { entregaId: 'ent-1' })
    const entrega = montarCartoesLogistica([parcial.pedido]).find((card) => card.entregaId)
    expect(opcoesStatusDoCard(entrega).map((status) => status.id)).toEqual([
      'programado',
      'em_transito',
      'entregue',
    ])
    expect(motivoBloqueioMovimento(entrega, 'em_transito')).toBeNull()
    expect(motivoBloqueioMovimento(entrega, 'carteira')).toMatch(/não volta/)
  })

  it('mantém o status otimista se a lista recarregar antes da confirmação', () => {
    const pending = new Map([
      ['ped-1:ent-1', { statusLogistica: 'entregue', statusLogisticaEm: '2026-10-13T12:00:00Z' }],
    ])
    const servidor = [
      {
        simulationId: 'ped-1',
        statusLogistica: 'carteira',
        itens: pedidoBase().itens,
        entregas: [
          {
            id: 'ent-1',
            statusLogistica: 'programado',
            itens: [{ simulationItemId: 'a', quantidade: 4 }],
          },
        ],
      },
    ]
    const atrasado = aplicarPendenciasLogistica(servidor, pending)
    expect(atrasado.rows[0].statusLogistica).toBe('carteira')
    expect(atrasado.rows[0].entregas[0].statusLogistica).toBe('entregue')
    expect(atrasado.pending.has('ped-1:ent-1')).toBe(true)

    const confirmado = aplicarPendenciasLogistica(
      [
        {
          ...servidor[0],
          entregas: [{ ...servidor[0].entregas[0], statusLogistica: 'entregue' }],
        },
      ],
      atrasado.pending,
    )
    expect(confirmado.rows[0].entregas[0].statusLogistica).toBe('entregue')
    expect(confirmado.pending.has('ped-1:ent-1')).toBe(false)
  })

  it('aceita vírgula decimal e trata vazio como zero', () => {
    expect(parseQuantidade('2,5')).toBe(2.5)
    expect(parseQuantidade('')).toBe(0)
    expect(parseQuantidade('1.2349')).toBe(1.235)
  })
})
