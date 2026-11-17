import { describe, expect, it } from 'vitest'
import { buildNativeSaleFacts } from './nativeSalesFacts'
import { aggregateSales, filterSales, marginTone, unifySales } from './salesDashboard'

const order = {
  id: 'ped-1', userId: 'user-1', clientId: 'cli-1', client: 'Cliente A',
  negotiatedOn: '2026-08-04', customerDue: '2026-11-04', branch: 'uberaba',
  saleType: 'Reais', harvest: '26/27', firm: true,
  items: [{ id: 'item-1', volume: 10, proposta: 1000, culture: 'Café', productType: 'Convencional', product: 'MAP', costWithTaxUnit: 800, costUnit: 760 }],
}

describe('fatos nativos', () => {
  it('reparte compra parcial entre fornecedores e mantém o restante sem lastro', () => {
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
    expect(aggregateSales(result.rows).volume).toBe(10)
    expect(aggregateSales(result.rows).revenue).toBe(10000)
    expect(aggregateSales(result.rows).orders).toBe(1)
    expect(result.rows.map((row) => row.supplier).sort()).toEqual(['', 'Cibra', 'Yara'])
    expect(result.rows[0].branch).toBe('Uberaba')
    expect(result.issues.some((issue) => issue.reason.startsWith('Compra parcial'))).toBe(true)
  })

  it('inclui compra sem preço unitário uma vez e pedido sem compra', () => {
    const withPurchase = buildNativeSaleFacts({
      orders: [order],
      profiles: new Map([['user-1', { nome: 'Ana' }]]),
      allocations: [{ id: 'a1', simulationItemId: 'item-1', kg: 1000, compraItemId: 'c1' }],
      purchases: [{ id: 'c1', supplierDue: '2026-12-01', supplierPrice: null, supplier: 'Yara', supplierId: 'forn-1' }],
    })
    expect(withPurchase.rows).toHaveLength(1)
    expect(aggregateSales(withPurchase.rows).volume).toBe(10)
    expect(aggregateSales(withPurchase.rows).revenue).toBe(10000)
    expect(aggregateSales(withPurchase.rows).orders).toBe(1)
    expect(withPurchase.rows[0].supplier).toBe('Yara')
    expect(withPurchase.rows[0].supplierId).toBe('forn-1')
    expect(withPurchase.issues.some((issue) => issue.code === 'purchase-without-price' && !issue.excluded)).toBe(true)

    const plain = buildNativeSaleFacts({
      orders: [{ ...order, id: 'ped-2', negotiatedOn: '2026-11-12' }],
      profiles: new Map([['user-1', { nome: 'Ana' }]]),
    })
    expect(plain.rows).toHaveLength(1)
    expect(plain.rows[0].supplier).toBe('')
    expect(filterSales(plain.rows, { year: ['2025'] })).toHaveLength(0)
    expect(filterSales(withPurchase.rows, { year: ['2026'], supplier: ['forn-1'] })).toHaveLength(1)

    const duplicated = unifySales(withPurchase, {
      rows: [{ ...withPurchase.rows[0], id: 'planilha', revenue: 999999, dedupKey: withPurchase.rows[0].dedupKey }],
    })
    expect(duplicated.rows).toHaveLength(1)
    expect(aggregateSales(duplicated.rows).revenue).toBe(10000)

    const twoSuppliers = buildNativeSaleFacts({
      orders: [order],
      profiles: new Map([['user-1', { nome: 'Ana' }]]),
      allocations: [
        { id: 'a1', simulationItemId: 'item-1', kg: 4000, compraItemId: 'c1' },
        { id: 'a2', simulationItemId: 'item-1', kg: 6000, compraItemId: 'c2' },
      ],
      purchases: [
        { id: 'c1', supplierDue: null, supplierPrice: null, supplier: 'Yara', supplierId: 'forn-1' },
        { id: 'c2', supplierDue: null, supplierPrice: null, supplier: 'Cibra', supplierId: 'forn-2' },
      ],
    })
    expect(twoSuppliers.rows).toHaveLength(1)
    expect(aggregateSales(twoSuppliers.rows).volume).toBe(10)
    expect(twoSuppliers.rows[0].supplier).toBe('')
  })

  it('exige data e inclui pedido sem compra pelo volume e valor', () => {
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
    expect(unbought.rows).toHaveLength(1)
    expect(aggregateSales(unbought.rows).volume).toBe(10)
    expect(aggregateSales(unbought.rows).revenue).toBe(10000)
    expect(unbought.rows[0].supplier).toBe('')
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
