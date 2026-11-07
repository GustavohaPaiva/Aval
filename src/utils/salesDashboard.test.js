import { describe, expect, it } from 'vitest'
import { aggregateSales, cashFlow, commercialRows, compareYears, dateKey, filterSales, liquidMargin, markFamily, mergeGefertSources, modalitySplit, parseGefertRows, supplierCompare, weekKey, weeklySales } from './salesDashboard'

const header = ['Data Neg. (venda)', 'Data Venc. (cliente)', 'Data Venc. (Fornecedor)', 'Status', 'Tipo de venda', 'Loja', 'Consultor', 'Cliente', 'Cultura', 'Safra', 'Fornecedor', 'Tipo de produto', 'Produto', 'Volume', 'Preço de custo fornecedor', 'Total preço custo COM ICMS', 'Total preço custo SEM ICMS', 'Total Preço venda']
const line = ['04/08/2026', '04/09/2026', '04/09/2026', 'Lançado', 'Reais', 'Uberaba', 'Consultor A', 'Cliente A', 'Café', '26/27', 'Fornecedor A', 'Convencional', 'Produto A', 100, 100, 357356.04, 350000, 387500]
const record = (overrides = {}) => ({ id: '1', date: '2026-08-04', client: 'A', consultant: 'B', product: 'C', branch: 'Uberaba', revenue: 100, volume: 10, margin: 10, ...overrides })

describe('margem líquida — exemplos da especificação', () => {
  it.each([
    ['2024-04-03', 'Convencional', 98050, 84670.48, 9947.77],
    ['2025-01-07', 'Especial', 92610, 86082.54, 1433.91],
    ['2025-03-15', 'Especial', 1160000, 1068628.34, 27571.66],
    ['2026-02-02', 'Especial', 48300, 40952.91, 4690.59],
    ['2026-08-04', 'Convencional', 387500, 357356.04, 8831.46],
    ['2026-08-04', 'Especial', 1233000, 1061816.91, 91038.09],
  ])('%s / %s', (date, productType, revenue, costWithTax, expected) => {
    expect(liquidMargin({ date, productType, revenue, costWithTax })).toBe(expected)
  })
  it('aplica PIS a partir de 1 de abril, sem presumir custo ausente', () => {
    expect(liquidMargin({ date: '2026-03-31', revenue: 1000, costWithTax: 0, productType: 'Especial' })).toBe(945)
    expect(liquidMargin({ date: '2026-04-01', revenue: 1000, costWithTax: 0, productType: 'Especial' })).toBe(935)
    expect(liquidMargin({ date: '2026-04-01', revenue: 1000, costWithTax: null, productType: 'Especial' })).toBeNull()
  })
})

describe('importação e limpeza', () => {
  it('mapeia cabeçalhos por nome mesmo com colunas trocadas', () => {
    const result = parseGefertRows([[], [], [], [...header].reverse(), [...line].reverse()])
    expect(result.rows[0]).toMatchObject({ date: '2026-08-04', volume: 100, revenue: 387500, supplierPrice: 100, margin: 8831.46, cash: true })
  })
  it('inclui comprado com status não lançado; exclui cancelado e não comprado', () => {
    const notFirm = [...line]; notFirm[3] = 'Não Lançado'
    const cancelled = [...line]; cancelled[13] = 0; cancelled[17] = 0
    const notBought = [...line]; notBought[2] = ''
    const result = parseGefertRows([header, notFirm, cancelled, notBought])
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].firm).toBe(false)
    expect(result.issues).toHaveLength(2)
  })
  it('deduplica entre fontes, preserva linhas legítimas dentro da mesma fonte', () => {
    const first = record({ revenue: 200 })
    const result = mergeGefertSources([{ rows: [first, { ...first, id: '2' }], issues: [] }, { rows: [record({ client: ' a ' })], issues: [] }])
    expect(result.rows).toHaveLength(2)
    expect(aggregateSales(result.rows).revenue).toBe(400)
    expect(result.issues).toHaveLength(1)
  })
  it('não transforma célula vazia ou erro de fórmula em zero', () => {
    const invalid = [...line]; invalid[17] = '#VALUE!'
    const incomplete = [...line]; incomplete[15] = null
    const result = parseGefertRows([header, invalid, incomplete])
    expect(result.rows).toHaveLength(1)
    expect(aggregateSales(result.rows).margin).toBeNull()
    expect(() => parseGefertRows([['Produto'], ['A']])).toThrow('cabeçalho')
  })
  it('não ressuscita pedido histórico cancelado na planilha ativa', () => {
    const cancelled = [...line]; cancelled[13] = 0; cancelled[17] = 0
    const result = mergeGefertSources([parseGefertRows([header, cancelled], 'ativa'), parseGefertRows([header, line], 'histórica')])
    expect(result.rows).toHaveLength(0)
  })
})

describe('agregações, períodos e caixa', () => {
  it('pondera a margem por faturamento e conta pedidos distintos', () => {
    const stats = aggregateSales([record({ orderId: 'same' }), record({ id: '2', orderId: 'same', revenue: 900, margin: 180 })])
    expect(stats.marginPercent).toBe(19)
    expect(stats.orders).toBe(1)
    expect(stats.ticket).toBe(1000)
    expect(aggregateSales([record({ margin: null }), record()]).marginPercent).toBeNull()
    expect(aggregateSales([]).ticket).toBeNull()
  })
  it('valida datas e usa segunda-feira, inclusive na virada de ano', () => {
    expect(dateKey('31/02/2026')).toBeNull()
    expect(dateKey(46238)).toMatch(/^2026-/)
    expect(weekKey('2026-01-01')).toBe('2025-12-29')
    const weekly = weeklySales([record({ date: '2026-08-04' }), record({ date: '2026-07-21' })])
    expect(weekly.week).toBe('2026-08-03')
    expect(weekly.previous).toHaveLength(0)
  })
  it('aplica filtros e mantém dois anos no comparativo até o mesmo corte', () => {
    const rows = [record({ date: '2026-08-04' }), record({ date: '2025-08-04' }), record({ date: '2025-12-10' })]
    expect(filterSales(rows, { year: '2026' })).toHaveLength(1)
    const comparison = compareYears(rows, { year: '2026' }, '2026-11-06')
    expect(comparison.map((row) => row.revenue)).toEqual([100, 100])
  })
  it('filtra cadastro pelo id e filial pelo nome oficial, sem unir histórico só pelo texto', () => {
    const linked = record({ clientId: 'c1', client: 'Cliente A', supplierId: 's1', supplier: 'Yara', productId: 'p1', branch: 'Filial Uberaba' })
    const historical = record({ id: 'h', client: 'Cliente A', supplier: 'Yara', product: 'Produto A', branch: 'Outra praça' })
    expect(filterSales([linked, historical], { client: ['c1'] }).map((row) => row.id)).toEqual(['1'])
    expect(filterSales([linked, historical], { supplier: ['s1'], product: ['p1'] })).toHaveLength(1)
    expect(filterSales([linked, historical], { branch: ['uberaba'] }).map((row) => row.id)).toEqual(['1'])
    expect(filterSales([historical], { culture: ['Soja'] })).toHaveLength(0)
  })
  it('soma caixa só de Lançado, por vencimento, sem mostrar saldo incompleto', () => {
    const rows = [record({ firm: true, customerDue: '2026-09-01', supplierDue: '2026-08-01', cost: 80 }), record({ firm: false, customerDue: '2026-09-01', supplierDue: '2026-08-01', cost: 80 })]
    expect(cashFlow(rows).months).toEqual([
      { month: '2026-08', incoming: 0, outgoing: 80, balance: -80, accumulated: -80 },
      { month: '2026-09', incoming: 100, outgoing: 0, balance: 100, accumulated: 20 },
    ])
    expect(cashFlow([...rows, record({ firm: true })]).months[0].balance).toBeNull()
    expect(cashFlow([record({ firm: null })]).unavailable).toBe('Status de lançamento não registrado')
  })
  it('não trata classificação ausente como margem comercial e compara fornecedores', () => {
    const rows = [record({ supplier: 'Yara', revenue: 200 }), record({ id: '2', supplier: 'Cibra', revenue: 50 })]
    expect(commercialRows(markFamily(rows, []))).toBeNull()
    expect(commercialRows(markFamily(rows, [{ nome: 'A', ativo: true }], { known: true }))).toHaveLength(0)
    expect(supplierCompare(rows, [record({ supplier: 'Yara', revenue: 80 })])[0]).toMatchObject({ label: 'Yara' })
    expect(modalitySplit([record({ cash: true, revenue: 75 }), record({ id: '2', cash: false, revenue: 25 })]).sightShare).toBe(75)
  })
})
