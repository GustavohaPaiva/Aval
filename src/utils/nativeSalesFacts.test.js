import { describe, expect, it } from 'vitest'
import { buildNativeSaleFacts } from './nativeSalesFacts'
import { aggregateSales, marginTone, unifySales } from './salesDashboard'

const order = {
  id: 'ped-1', userId: 'user-1', clientId: 'cli-1', client: 'Cliente A',
  negotiatedOn: '2026-08-04', customerDue: '2026-11-04', branch: 'uberaba',
  saleType: 'Reais', harvest: '26/27', firm: true,
  items: [{ id: 'item-1', volume: 10, proposta: 1000, culture: 'Café', productType: 'Convencional', product: 'MAP', costWithTaxUnit: 800, costUnit: 760 }],
}

describe('fatos nativos', () => {
  it('reparte compra parcial entre fornecedores sem duplicar a venda', () => {
    const result = buildNativeSaleFacts({
      orders: [order],
      profiles: new Map([['user-1', { nome: 'Ana', filial: 'Frutal' }]]),
      allocations: [
        { id: 'a1', simulationItemId: 'item-1', kg: 4000, compraItemId: 'c1' },
        { id: 'a2', simulationItemId: 'item-1', kg: 3000, compraItemId: 'c2' },
      ],
      purchases: [
        { id: 'c1', supplierDue: '2026-09-01', supplierPrice: 700, supplier: 'Yara' },
        { id: 'c2', supplierDue: '2026-10-01', supplierPrice: 720, supplier: 'Cibra' },
      ],
    })
    expect(aggregateSales(result.rows).volume).toBe(7)
    expect(aggregateSales(result.rows).revenue).toBe(7000)
    expect(aggregateSales(result.rows).orders).toBe(1)
    expect(result.rows.map((row) => row.supplier).sort()).toEqual(['Cibra', 'Yara'])
    expect(result.rows[0].branch).toBe('Uberaba')
    expect(result.issues.some((issue) => issue.reason.startsWith('Compra parcial'))).toBe(true)
  })

  it('não trata pedido convertido nem cadastro como compra ou negociação', () => {
    const missing = buildNativeSaleFacts({
      orders: [{ ...order, negotiatedOn: null, items: order.items }],
      profiles: new Map([['user-1', { nome: 'Ana' }]]),
      allocations: [{ id: 'a1', simulationItemId: 'item-1', kg: 10000, compraItemId: 'c1' }],
      purchases: [{ id: 'c1', supplierDue: '2026-09-01', supplierPrice: 700, supplier: 'Yara' }],
    })
    expect(missing.rows).toHaveLength(0)
    const unbought = buildNativeSaleFacts({
      orders: [order],
      profiles: new Map([['user-1', { nome: 'Ana' }]]),
      allocations: [{ id: 'a1', simulationItemId: 'item-1', kg: 10000, loteId: 'lote-1' }],
      lots: [{ id: 'lote-1', compraItemId: null }],
    })
    expect(unbought.rows).toHaveLength(0)
    expect(unbought.keys).toHaveLength(1)
  })

  it('reduz lastro maior que a venda e não usa custo de catálogo', () => {
    const result = buildNativeSaleFacts({
      orders: [{ ...order, items: [{ ...order.items[0], costWithTaxUnit: null, costUnit: null }] }],
      profiles: new Map([['user-1', { nome: 'Ana' }]]),
      allocations: [{ id: 'a1', simulationItemId: 'item-1', kg: 15000, compraItemId: 'c1' }],
      purchases: [{ id: 'c1', supplierDue: '2026-09-01', supplierPrice: 700, supplier: 'Yara' }],
    })
    expect(aggregateSales(result.rows).volume).toBe(10)
    expect(aggregateSales(result.rows).revenue).toBe(10000)
    expect(result.rows[0].margin).toBeNull()
  })

  it('histórico não soma linha já coberta pelo Aval', () => {
    const native = buildNativeSaleFacts({
      orders: [order],
      profiles: new Map([['user-1', { nome: 'Ana' }]]),
      allocations: [{ id: 'a1', simulationItemId: 'item-1', kg: 10000, compraItemId: 'c1' }],
      purchases: [{ id: 'c1', supplierDue: '2026-09-01', supplierPrice: 700, supplier: 'Yara' }],
    })
    const unified = unifySales(native, { rows: [{ ...native.rows[0], id: 'planilha', revenue: 999999, dedupKey: native.rows[0].dedupKey }] })
    expect(unified.rows).toHaveLength(1)
    expect(aggregateSales(unified.rows).revenue).toBe(10000)
  })

  it('não usa a filial atual do consultor como filial da venda', () => {
    const result = buildNativeSaleFacts({
      orders: [{ ...order, branch: '' }],
      profiles: new Map([['user-1', { nome: 'Ana', filial: 'Frutal' }]]),
      allocations: [{ id: 'a1', simulationItemId: 'item-1', kg: 10000, compraItemId: 'c1' }],
      purchases: [{ id: 'c1', supplierDue: '2026-09-01', supplierPrice: 700, supplier: 'Yara' }],
    })
    expect(result.rows[0].branch).toBe('')
    expect(result.rows[0].firm).toBe(true)
  })

  it('alerta à vista é mais apertado que o a prazo', () => {
    expect(marginTone(2, true)).toBe('watch')
    expect(marginTone(2, false)).toBe('red')
    expect(marginTone(8, false)).toBe('healthy')
  })
})
