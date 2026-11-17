import { KG_POR_TONELADA } from '../constants/compras'
import { branchLabel, liquidMargin, textKey } from './salesDashboard'

const round = (value) => Math.round((value + Number.EPSILON) * 100) / 100

function purchaseOf(allocation, purchases, lots) {
  const direct = purchases.get(allocation.compraItemId)
  if (direct) return direct
  const lot = lots.get(allocation.loteId)
  return lot?.compraItemId ? purchases.get(lot.compraItemId) : null
}

function linkedPurchases(itemId, byItem, purchaseMap, lotMap) {
  const found = []
  for (const allocation of byItem.get(itemId) ?? []) {
    const purchase = purchaseOf(allocation, purchaseMap, lotMap)
    if (purchase) found.push(purchase)
  }
  return found
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

function singleSupplier(purchases) {
  const identities = new Set(purchases.map((item) => item.supplierId || item.supplier || ''))
  if (identities.size !== 1) return null
  const purchase = purchases[0]
  if (!purchase?.supplier && !purchase?.supplierId) return null
  return purchase
}

function saleRow({
  id, order, item, profile, branch, date, volume, revenue,
  supplierDue = null, supplierPrice = null, supplier = '', supplierId = null,
  costWithTax = null, cost = null,
}) {
  const row = {
    id,
    orderId: order.id,
    source: 'Aval',
    date,
    customerDue: order.customerDue || null,
    supplierDue,
    supplierPrice,
    revenue,
    volume,
    saleType: order.saleType || '',
    branch,
    consultant: profile.nome || 'Consultor não informado',
    consultantId: order.userId,
    client: order.client || 'Cliente não informado',
    clientId: order.clientId,
    culture: item.culture || '',
    harvest: order.harvest || '',
    supplier,
    supplierId,
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
  return row
}

/**
 * Pedido convertido e ativo entra pelo volume e valor do próprio pedido.
 * Data de negociação (ou fallback) é obrigatória. Compra ligada repartilha
 * fornecedores quando existir; o restante sem lastro continua na base.
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
        issues.push({
          source: 'Aval',
          line: label,
          code: 'negotiation-date',
          excluded: true,
          reason: 'Sem data de negociação nem data de criação. O pedido não entra no período.',
        })
        continue
      }
      remember()
      if (!(revenue > 0) && !(volume > 0)) {
        coverage.excludedCancelled += 1
        issues.push({ source: 'Aval', line: label, code: 'cancelled', excluded: true, reason: 'Cancelado: volume e faturamento zerados.' })
        continue
      }
      if (!(volume > 0) || revenue == null || revenue < 0) {
        issues.push({ source: 'Aval', line: label, code: 'invalid-amount', excluded: true, reason: 'Volume ou faturamento inválido.' })
        continue
      }
      const bought = boughtParts(item.id, byItem, purchaseMap, lotMap)
      const soldKg = volume * KG_POR_TONELADA
      const boughtKg = bought.reduce((sum, part) => sum + part.kg, 0)
      const uncoveredKg = Math.max(0, soldKg - boughtKg)

      if (!(boughtKg > 0)) {
        const linked = linkedPurchases(item.id, byItem, purchaseMap, lotMap)
        const supplier = singleSupplier(linked)
        issues.push(linked.length ? {
          source: 'Aval',
          line: label,
          code: 'purchase-without-price',
          reason: 'Compra ligada sem preço unitário ou vencimento completos. A venda entra uma vez, pelo volume e pelo valor do pedido.',
        } : {
          source: 'Aval',
          line: label,
          code: 'not-purchased',
          reason: 'Pedido sem compra ligada: entra pelo volume e valor do pedido, sem fornecedor.',
        })
        const row = saleRow({
          id: `${item.id}:order`,
          order,
          item,
          profile,
          branch,
          date,
          volume,
          revenue,
          supplierDue: supplier?.supplierDue || null,
          supplier: supplier?.supplier || '',
          supplierId: supplier?.supplierId || null,
          costWithTax: item.costWithTaxUnit == null ? null : round(Number(item.costWithTaxUnit) * volume),
          cost: item.costUnit == null ? null : round(Number(item.costUnit) * volume),
        })
        if (row.margin == null) issues.push({ source: 'Aval', line: label, reason: 'Margem indisponível: custo com ICMS congelado ou tipo de produto ausente. O catálogo atual não foi usado.' })
        if (!row.customerDue) issues.push({ source: 'Aval', line: label, reason: 'Sem vencimento do cliente.' })
        if (row.cost == null) issues.push({ source: 'Aval', line: label, reason: 'Sem custo sem ICMS congelado: o caixa não fecha esta linha.' })
        rows.push(row)
        continue
      }

      const scale = boughtKg > soldKg ? soldKg / boughtKg : 1
      if (uncoveredKg > 0.001) {
        issues.push({
          source: 'Aval',
          line: label,
          reason: `Compra parcial: ${round(uncoveredKg / KG_POR_TONELADA)} t sem lastro permanecem na base sem fornecedor.`,
        })
      }
      for (const part of bought) {
        const tons = (part.kg * scale) / KG_POR_TONELADA
        const partRevenue = tons * proposta
        const row = saleRow({
          id: `${item.id}:${part.allocation.id}`,
          order,
          item,
          profile,
          branch,
          date,
          volume: tons,
          revenue: partRevenue,
          supplierDue: part.purchase.supplierDue,
          supplierPrice: Number(part.purchase.supplierPrice),
          supplier: part.purchase.supplier || '',
          supplierId: part.purchase.supplierId || null,
          costWithTax: item.costWithTaxUnit == null ? null : round(Number(item.costWithTaxUnit) * tons),
          cost: item.costUnit == null ? null : round(Number(item.costUnit) * tons),
        })
        if (row.margin == null) issues.push({ source: 'Aval', line: label, reason: 'Margem indisponível: custo com ICMS congelado ou tipo de produto ausente. O catálogo atual não foi usado.' })
        if (!row.customerDue) issues.push({ source: 'Aval', line: label, reason: 'Sem vencimento do cliente.' })
        if (row.cost == null) issues.push({ source: 'Aval', line: label, reason: 'Sem custo sem ICMS congelado: o caixa não fecha esta linha.' })
        rows.push(row)
      }
      if (uncoveredKg > 0.001) {
        const tons = uncoveredKg / KG_POR_TONELADA
        const row = saleRow({
          id: `${item.id}:uncovered`,
          order,
          item,
          profile,
          branch,
          date,
          volume: tons,
          revenue: tons * proposta,
          costWithTax: item.costWithTaxUnit == null ? null : round(Number(item.costWithTaxUnit) * tons),
          cost: item.costUnit == null ? null : round(Number(item.costUnit) * tons),
        })
        rows.push(row)
      }
    }
  }
  coverage.includedOrders = new Set(rows.map((row) => row.orderId)).size
  return { rows, issues, keys: [...keys], coverage }
}
