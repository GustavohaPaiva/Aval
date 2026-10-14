import { describe, expect, it } from 'vitest'
import {
  formatItemLinha,
  groupPedidosPorStatus,
  normalizeStatusLogistica,
  pedidoMatchesSearch,
  prazoIndicador,
  reconcilePedidosComPendencias,
} from './logisticaStatus'

describe('logisticaStatus', () => {
  it('trata status desconhecido como carteira e reconhece o fluxo antigo', () => {
    expect(normalizeStatusLogistica(null)).toBe('carteira')
    expect(normalizeStatusLogistica('converted')).toBe('carteira')
    expect(normalizeStatusLogistica('em_andamento')).toBe('carteira')
    expect(normalizeStatusLogistica('pedido_realizado')).toBe('programado')
    expect(normalizeStatusLogistica('aguardando_recebimento')).toBe('em_transito')
    expect(normalizeStatusLogistica('concluido')).toBe('entregue')
    expect(normalizeStatusLogistica('programado')).toBe('programado')
  })

  it('agrupa pedidos sem perder nem duplicar cartões', () => {
    const rows = [
      { simulationId: 'a', statusLogistica: 'entregue' },
      { simulationId: 'b', statusLogistica: null },
      { simulationId: 'c', statusLogistica: 'programado' },
    ]
    const groups = groupPedidosPorStatus(rows)
    expect(groups.carteira.map((row) => row.simulationId)).toEqual(['b'])
    expect(groups.programado.map((row) => row.simulationId)).toEqual(['c'])
    expect(groups.entregue.map((row) => row.simulationId)).toEqual(['a'])
    expect(groups.em_transito).toEqual([])
    const total = Object.values(groups).reduce((sum, list) => sum + list.length, 0)
    expect(total).toBe(rows.length)
  })

  it('marca prazo vencido e entrega nesta semana, e ignora pedido entregue', () => {
    const hoje = new Date(2026, 9, 9, 12)
    expect(prazoIndicador('2026-09-27', 'programado', hoje)).toBe('vencido')
    expect(prazoIndicador('2026-10-04', 'carteira', hoje)).toBe('esta_semana')
    expect(prazoIndicador('2026-10-11', 'em_transito', hoje)).toBeNull()
    expect(prazoIndicador('2026-09-27', 'entregue', hoje)).toBeNull()
  })

  it('busca por cliente, identificador e item', () => {
    const row = {
      simulationId: 'abc12345-0000-4000-8000-000000000000',
      clientNome: 'Fazenda Boa Vista',
      fazenda: 'Sede',
      municipio: 'Uberaba',
      uf: 'MG',
      itens: [{ nome: 'MAP', referenciaComplementar: null, fornecedorNome: 'Yara' }],
    }
    expect(pedidoMatchesSearch(row, 'boa vista')).toBe(true)
    expect(pedidoMatchesSearch(row, 'abc12345')).toBe(true)
    expect(pedidoMatchesSearch(row, 'yara')).toBe(true)
    expect(pedidoMatchesSearch(row, 'inexistente')).toBe(false)
  })

  it('não deixa um retorno antigo do servidor desfazer a movimentação local', () => {
    const pending = new Map([
      ['a:ent-1', { statusLogistica: 'em_transito', statusLogisticaEm: '2026-10-09T12:00:00Z' }],
    ])
    const stale = reconcilePedidosComPendencias(
      [{ cardId: 'a:ent-1', simulationId: 'a', statusLogistica: 'programado', clientNome: 'A' }],
      pending,
    )
    expect(stale.rows[0].statusLogistica).toBe('em_transito')
    expect(stale.rows[0].clientNome).toBe('A')
    expect(stale.pending.has('a:ent-1')).toBe(true)

    const confirmed = reconcilePedidosComPendencias(
      [{ cardId: 'a:ent-1', simulationId: 'a', statusLogistica: 'em_transito' }],
      stale.pending,
    )
    expect(confirmed.rows[0].statusLogistica).toBe('em_transito')
    expect(confirmed.pending.has('a:ent-1')).toBe(false)
  })

  it('resume item com volume em toneladas', () => {
    expect(
      formatItemLinha({
        nome: 'MAP',
        referenciaComplementar: '11-52',
        fornecedorNome: 'Yara',
        volume: 12.5,
      }),
    ).toBe('MAP · 11-52 · Yara · 12,5 ton')
  })
})
