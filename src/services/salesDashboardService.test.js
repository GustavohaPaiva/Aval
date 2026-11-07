import { beforeEach, describe, expect, it, vi } from 'vitest'

const mock = vi.hoisted(() => ({ from: vi.fn() }))
vi.mock('./supabase', () => ({ supabase: { from: mock.from } }))
import { invalidateSalesDashboardCache, peekSalesDashboard } from './salesDashboardCache'
import { loadSalesDashboard } from './salesDashboardService'

function query(result) {
  const q = {}
  for (const method of ['select', 'eq', 'order', 'range', 'in', 'limit']) q[method] = vi.fn(() => q)
  q.abortSignal = vi.fn(async () => result)
  q.maybeSingle = vi.fn(async () => result)
  return q
}

const order = (id) => ({ id, user_id: 'consultant-1', client_id: 'client-1', total_proposta: 100, data_negociacao: null,
  clients: { nome: 'Cliente' }, simulation_items: [{ id: `item-${id}`, volume: 2, proposta: 50, cultura: 'Café', produtos_oficiais: { nome: 'Produto' } }] })

beforeEach(() => {
  vi.resetAllMocks()
  invalidateSalesDashboardCache()
})

describe('consulta de vendas nativas', () => {
  it('não consulta o banco para consultor ou logística', async () => {
    expect((await loadSalesDashboard({ role: 'consultor' })).ok).toBe(false)
    expect((await loadSalesDashboard({ role: 'logistica' })).ok).toBe(false)
    expect(mock.from).not.toHaveBeenCalled()
  })
  it('pagina os convertidos ativos e não transforma pedido sem compra em venda', async () => {
    const first = query({ data: Array.from({ length: 200 }, (_, i) => order(String(i))), count: 201 })
    const second = query({ data: [order('200')], count: 201 })
    let pages = 0
    mock.from.mockImplementation((table) => {
      if (table === 'simulations') return pages++ === 0 ? first : second
      if (table === 'profiles') return query({ data: [{ id: 'consultant-1', nome: 'Consultor', filial: 'Uberaba' }] })
      if (table === 'alocacoes') return query({ data: [] })
      if (table === 'clients' || table === 'fornecedores' || table === 'produtos_oficiais') return query({ data: [] })
      return query({ error: { message: 'relation does not exist' } })
    })
    const result = await loadSalesDashboard({ role: 'gestor' })
    expect(result.ok).toBe(true)
    expect(result.native.rows).toHaveLength(0)
    expect(result.native.issues.length).toBeGreaterThan(0)
    expect(first.eq).toHaveBeenCalledWith('status', 'converted')
    expect(first.eq).toHaveBeenCalledWith('ativo', true)
    expect(second.range).toHaveBeenCalledWith(200, 399)
    expect(result.schemaReady).toBe(false)
  })
  it('não retorna totais parciais se uma página falhar', async () => {
    mock.from.mockImplementation((table) => table === 'simulations'
      ? query({ error: { message: 'Falha na consulta' } })
      : query({ data: [] }))
    const result = await loadSalesDashboard({ role: 'gestor' })
    expect(result).toEqual({ ok: false, error: 'Falha na consulta' })
  })
  it('busca o lastro mesmo quando o pedido ainda não tem as colunas novas', async () => {
    let simulations = 0
    mock.from.mockImplementation((table) => {
      if (table === 'simulations') {
        simulations += 1
        return simulations === 1
          ? query({ error: { message: 'column simulations.data_negociacao does not exist' } })
          : query({ data: [order('1')], count: 1 })
      }
      if (table === 'profiles') return query({ data: [{ id: 'consultant-1', nome: 'Consultor', filial: 'Uberaba' }] })
      if (table === 'alocacoes') return query({ data: [] })
      if (table === 'clients' || table === 'fornecedores' || table === 'produtos_oficiais') return query({ data: [] })
      return query({ error: { message: 'relation does not exist' } })
    })
    const result = await loadSalesDashboard({ role: 'gestor' })
    expect(result.ok).toBe(true)
    expect(result.fields.negotiationDate).toBe(false)
    expect(result.fields.dollar).toBe(false)
    expect(result.config.dollar).toBeNull()
    expect(mock.from).toHaveBeenCalledWith('alocacoes')
    expect(result.native.coverage.excludedNegotiation).toBe(1)
  })
  it('percorre o cadastro de clientes além da primeira página', async () => {
    const page = query({ data: Array.from({ length: 1000 }, (_, i) => ({ id: `c${i}`, nome: `Cliente ${i}` })) })
    const last = query({ data: [{ id: 'c1000', nome: 'Cliente 1000', municipio: 'Uberaba' }] })
    let clients = 0
    mock.from.mockImplementation((table) => {
      if (table === 'simulations') return query({ data: [], count: 0 })
      if (table === 'clients') return clients++ === 0 ? page : last
      if (table === 'profiles' || table === 'fornecedores' || table === 'produtos_oficiais') return query({ data: [] })
      return query({ error: { message: 'relation does not exist' } })
    })
    const result = await loadSalesDashboard({ role: 'gestor' })
    expect(result.ok).toBe(true)
    expect(result.catalogs.clients).toHaveLength(1001)
    expect(page.range).toHaveBeenCalledWith(0, 999)
    expect(last.range).toHaveBeenCalledWith(1000, 1999)
  })
  it('busca as páginas seguintes do cadastro ao mesmo tempo', async () => {
    const page = query({ data: Array.from({ length: 1000 }, (_, i) => ({ id: `c${i}`, nome: `Cliente ${i}` })), count: 1001 })
    const last = query({ data: [{ id: 'c1000', nome: 'Cliente 1000' }] })
    let clients = 0
    mock.from.mockImplementation((table) => {
      if (table === 'simulations') return query({ data: [], count: 0 })
      if (table === 'clients') return clients++ === 0 ? page : last
      if (table === 'profiles' || table === 'fornecedores' || table === 'produtos_oficiais') return query({ data: [] })
      return query({ error: { message: 'relation does not exist' } })
    })
    const result = await loadSalesDashboard({ role: 'gestor' })
    expect(result.ok).toBe(true)
    expect(result.catalogs.clients).toHaveLength(1001)
    expect(page.range).toHaveBeenCalledWith(0, 999)
    expect(last.range).toHaveBeenCalledWith(1000, 1999)
  })
  it('não consulta alocações de novo quando o pedido já traz o lastro', async () => {
    const embedded = order('1')
    embedded.simulation_items[0].alocacoes = []
    mock.from.mockImplementation((table) => {
      if (table === 'simulations') return query({ data: [embedded], count: 1 })
      if (table === 'profiles') return query({ data: [{ id: 'consultant-1', nome: 'Consultor', filial: 'Uberaba' }] })
      if (table === 'clients' || table === 'fornecedores' || table === 'produtos_oficiais') return query({ data: [] })
      return query({ error: { message: 'relation does not exist' } })
    })
    const result = await loadSalesDashboard({ role: 'gestor' })
    expect(result.ok).toBe(true)
    expect(mock.from).not.toHaveBeenCalledWith('alocacoes')
    expect(mock.from).toHaveBeenCalledWith('profiles')
  })
  it('reaproveita a carga do mesmo usuário e busca de novo ao atualizar', async () => {
    mock.from.mockImplementation((table) => {
      if (table === 'simulations') return query({ data: [], count: 0 })
      if (table === 'clients' || table === 'profiles' || table === 'fornecedores' || table === 'produtos_oficiais') return query({ data: [] })
      return query({ error: { message: 'relation does not exist' } })
    })
    const first = await loadSalesDashboard({ role: 'gestor', userId: 'gestor-1' })
    expect(first.ok).toBe(true)
    const calls = mock.from.mock.calls.length
    const second = await loadSalesDashboard({ role: 'gestor', userId: 'gestor-1' })
    expect(second).toBe(first)
    expect(mock.from.mock.calls.length).toBe(calls)
    expect(peekSalesDashboard('gestor-2')).toBeNull()
    await loadSalesDashboard({ role: 'gestor', userId: 'gestor-1', fresh: true })
    expect(mock.from.mock.calls.length).toBeGreaterThan(calls)
  })
  it('não devolve cadastro incompleto', async () => {
    const page = query({ data: Array.from({ length: 1000 }, (_, i) => ({ id: `c${i}`, nome: `Cliente ${i}` })), count: 2000 })
    let clients = 0
    mock.from.mockImplementation((table) => {
      if (table === 'clients') return clients++ === 0 ? page : query({ data: [] })
      if (table === 'simulations' || table === 'profiles' || table === 'fornecedores' || table === 'produtos_oficiais') return query({ data: [], count: 0 })
      return query({ error: { message: 'relation does not exist' } })
    })
    const result = await loadSalesDashboard({ role: 'gestor' })
    expect(result.ok).toBe(false)
    expect(result.error).toContain('incompleta')
  })
  it('recusa pedido com total divergente ou itens ausentes', async () => {
    mock.from.mockReturnValue(query({ data: [{ ...order('1'), total_proposta: 200 }], count: 1 }))
    const result = await loadSalesDashboard({ role: 'gestor' })
    expect(result.ok).toBe(false)
    expect(result.error).toContain('total divergente')
  })
})
