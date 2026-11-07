import { KG_POR_TONELADA } from '../constants/compras'
import { branchLabel, liquidMargin, textKey } from './salesDashboard'

const round = (value) => Math.round((value + Number.EPSILON) * 100) / 100

function purchaseOf(allocation, purchases, lots) {
  const direct = purchases.get(allocation.compraItemId)
  if (direct) return direct
  const lot = lots.get(allocation.loteId)
  return lot?.compraItemId ? purchases.get(lot.compraItemId) : null
}

function boughtParts(itemId, byItem, purchaseMap, lotMap) {
  const bought = []
  for (const allocation of byItem.get(itemId) ?? []) {
    const purchase = purchaseOf(allocation, purchaseMap, lotMap)
    const kg = Number(allocation.kg)
    if (!(kg > 0) || !purchase?.supplierDue || purchase.supplierPrice == null) continue
    bought.push({ allocation, purchase, kg })
  }
  return bought
}

/**
 * Uma linha de venda entra na base só com data de negociação e lastro de compra.
 * Pedido convertido, cadastro da proposta e catálogo atual não substituem isso.
 * Compras parciais e vários lotes repartem volume e faturamento, sem repetir a venda.
 */
export function buildNativeSaleFacts({ orders = [], profiles = new Map(), allocations = [], purchases = [], lots = [] }) {
  const purchaseMap = new Map(purchases.map((item) => [item.id, item]))
  const lotMap = new Map(lots.map((item) => [item.id, item]))
  const byItem = new Map()
  for (const allocation of allocations) {
    const list = byItem.get(allocation.simulationItemId) ?? []
    list.push(allocation)
    byItem.set(allocation.simulationItemId, list)
  }
  const rows = []
  const issues = []
  const keys = new Set()
  const coverage = { orders: orders.length, lines: 0, excludedNegotiation: 0, excludedPurchase: 0, excludedCancelled: 0 }
  for (const order of orders) {
    const profile = profiles.get(order.userId) ?? {}
    const branch = order.branch ? branchLabel(order.branch) : ''
    const date = order.negotiatedOn || null
    for (const item of order.items ?? []) {
      coverage.lines += 1
      const volume = Number(item.volume)
      const proposta = Number(item.proposta)
      const revenue = Number.isFinite(volume) && Number.isFinite(proposta) ? volume * proposta : null
      const label = `${order.client || 'Cliente'} · ${item.product || 'Produto'}`
      const remember = () => {
        if (!date) return
        keys.add(JSON.stringify([date, order.client, item.product, profile.nome, branch].map(textKey)))
      }
      if (!date) {
        coverage.excludedNegotiation += 1
        const purchased = boughtParts(item.id, byItem, purchaseMap, lotMap).length > 0
        if (!purchased) coverage.excludedPurchase += 1
        issues.push({
          source: 'Aval',
          line: label,
          code: 'negotiation-date',
          reason: purchased
            ? 'Sem data de negociação. O cadastro da proposta não entra no período.'
            : 'Sem data de negociação. O cadastro da proposta não entra no período. Também não há vencimento ou preço do fornecedor no lastro.',
        })
        continue
      }
      remember()
      if (!(revenue > 0) && !(volume > 0)) {
        coverage.excludedCancelled += 1
        issues.push({ source: 'Aval', line: label, code: 'cancelled', reason: 'Cancelado: volume e faturamento zerados.' })
        continue
      }
      if (!(volume > 0) || revenue == null || revenue < 0) {
        issues.push({ source: 'Aval', line: label, reason: 'Volume ou faturamento inválido.' })
        continue
      }
      const bought = boughtParts(item.id, byItem, purchaseMap, lotMap)
      const soldKg = volume * KG_POR_TONELADA
      const boughtKg = bought.reduce((sum, part) => sum + part.kg, 0)
      if (!(boughtKg > 0)) {
        coverage.excludedPurchase += 1
        issues.push({ source: 'Aval', line: label, code: 'not-purchased', reason: 'Pedido convertido sem compra: falta vencimento ou preço do fornecedor no lastro.' })
        continue
      }
      const scale = boughtKg > soldKg ? soldKg / boughtKg : 1
      if (boughtKg + 0.001 < soldKg) {
        issues.push({ source: 'Aval', line: label, reason: `Compra parcial: ${round((soldKg - boughtKg) / KG_POR_TONELADA)} t ainda sem lastro e fora da base.` })
      }
      for (const part of bought) {
        const tons = (part.kg * scale) / KG_POR_TONELADA
        const partRevenue = tons * proposta
        const costWithTax = item.costWithTaxUnit == null ? null : round(Number(item.costWithTaxUnit) * tons)
        const cost = item.costUnit == null ? null : round(Number(item.costUnit) * tons)
        const row = {
          id: `${item.id}:${part.allocation.id}`,
          orderId: order.id,
          source: 'Aval',
          date,
          customerDue: order.customerDue || null,
          supplierDue: part.purchase.supplierDue,
          supplierPrice: Number(part.purchase.supplierPrice),
          revenue: partRevenue,
          volume: tons,
          saleType: order.saleType || '',
          branch,
          consultant: profile.nome || 'Consultor não informado',
          consultantId: order.userId,
          client: order.client || 'Cliente não informado',
          clientId: order.clientId,
          culture: item.culture || '',
          harvest: order.harvest || '',
          supplier: part.purchase.supplier || '',
          supplierId: part.purchase.supplierId || null,
          productType: item.productType || '',
          product: item.product || 'Produto não informado',
          productId: item.productId || null,
          costWithTax,
          cost,
          firm: order.firm == null ? null : order.firm === true,
          family: null,
        }
        row.margin = liquidMargin(row)
        row.dedupKey = JSON.stringify([row.date, row.client, row.product, row.consultant, row.branch].map(textKey))
        if (row.margin == null) issues.push({ source: 'Aval', line: label, reason: 'Margem indisponível: custo com ICMS congelado ou tipo de produto ausente. O catálogo atual não foi usado.' })
        if (!row.customerDue) issues.push({ source: 'Aval', line: label, reason: 'Sem vencimento do cliente.' })
        if (row.cost == null) issues.push({ source: 'Aval', line: label, reason: 'Sem custo sem ICMS congelado: o caixa não fecha esta linha.' })
        rows.push(row)
      }
    }
  }
  coverage.includedOrders = new Set(rows.map((row) => row.orderId)).size
  return { rows, issues, keys: [...keys], coverage }
}
