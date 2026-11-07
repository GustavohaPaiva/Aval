// Read model shared by native orders and the temporary GEFERT preview.
export const BRANCHES = ['Uberaba', 'Nova Ponte', 'Frutal', 'Guaíra', 'Ituverava']
export const textKey = (value) => String(value ?? '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').toUpperCase()
const round = (value) => Math.round((value + Number.EPSILON) * 100) / 100
const dayMs = 86400000

export function dateKey(value) {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString().slice(0, 10)
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * dayMs).toISOString().slice(0, 10)
  }
  const text = String(value ?? '').trim()
  const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text)
  const iso = br ? `${br[3]}-${br[2]}-${br[1]}` : text.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null
  const date = new Date(`${iso}T00:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === iso ? iso : null
}

export function shiftDay(day, amount) {
  return new Date(Date.parse(`${day}T00:00:00Z`) + amount * dayMs).toISOString().slice(0, 10)
}

export function weekKey(day) {
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay()
  return shiftDay(day, -((weekday + 6) % 7))
}

export function numeric(value) {
  if (value == null || String(value).trim() === '') return null
  const number = typeof value === 'number' ? value : Number(String(value).replace(/R\$|\s/g, '').replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(',', '.'))
  return Number.isFinite(number) ? number : null
}

export const DEFAULT_MARGIN_RULES = [
  { from: '2024-01-01', icms: 0.03, pis: 0, special: 0.015, conventional: 0.005 },
  { from: '2025-01-01', icms: 0.04, pis: 0, special: 0.015, conventional: 0.005 },
  { from: '2026-04-01', icms: 0.04, pis: 0.01, special: 0.015, conventional: 0.005 },
]

export const DEFAULT_ALERTS = {
  vistaRed: 1.5,
  vistaHealthy: 3,
  prazoRed: 5,
  prazoHealthy: 7,
}

export const DEFAULT_GOAL_STEPS = [0, 5, 10, 15]
export const SIGHT_DAYS = 90

export function ruleForDate(date, rules = DEFAULT_MARGIN_RULES) {
  return [...rules]
    .filter((rule) => rule?.from && date >= rule.from)
    .sort((a, b) => b.from.localeCompare(a.from))[0] ?? null
}

export function liquidMargin({ date, revenue, costWithTax, productType, rules }) {
  const rule = ruleForDate(date, rules)
  if (!rule) return null
  if (costWithTax == null || !['ESPECIAL', 'CONVENCIONAL'].includes(textKey(productType))) return null
  const commission = textKey(productType) === 'ESPECIAL' ? rule.special : rule.conventional
  return round(revenue * (1 - rule.icms - rule.pis - commission) - costWithTax)
}

const HEADERS = {
  date: 'Data Neg. (venda)', customerDue: 'Data Venc. (cliente)', supplierDue: 'Data Venc. (Fornecedor)',
  status: 'Status', saleType: 'Tipo de venda', branch: 'Loja', consultant: 'Consultor', client: 'Cliente',
  culture: 'Cultura', harvest: 'Safra', supplier: 'Fornecedor', productType: 'Tipo de produto', product: 'Produto',
  volume: 'Volume', supplierPrice: 'Preço de custo fornecedor', costWithTax: 'Total preço custo COM ICMS',
  cost: 'Total preço custo SEM ICMS', revenue: 'Total Preço venda',
}

export function parseGefertRows(matrix, source = 'Planilha') {
  const headerIndex = matrix.findIndex((row) => row.some((cell) => textKey(cell) === textKey(HEADERS.date)))
  if (headerIndex < 0) throw new Error(`${source}: cabeçalho GFERT não encontrado.`)
  const columns = Object.fromEntries(Object.entries(HEADERS).map(([key, label]) => [key, matrix[headerIndex].findIndex((cell) => textKey(cell) === textKey(label))]))
  const missing = Object.entries(columns).filter(([, index]) => index < 0).map(([key]) => HEADERS[key])
  if (missing.length) throw new Error(`${source}: faltam colunas: ${missing.join(', ')}.`)
  const cityIndex = matrix[headerIndex].findIndex((cell) => textKey(cell) === textKey('Cidade de entrega'))
  const rows = [], issues = [], keys = new Set()
  for (let i = headerIndex + 1; i < matrix.length; i++) {
    const cells = matrix[i]
    if (!cells.some((cell) => cell != null && String(cell).trim() !== '')) continue
    const raw = Object.fromEntries(Object.entries(columns).map(([key, index]) => [key, cells[index]]))
    const issue = (reason) => issues.push({ source, line: i + 1, reason })
    const date = dateKey(raw.date)
    if (!date) { issue('Sem data de venda válida'); continue }
    // Even a cancelled/unpurchased active row supersedes its historical version.
    keys.add(JSON.stringify([date, raw.client, raw.product, raw.consultant, raw.branch].map(textKey)))
    const supplierDue = dateKey(raw.supplierDue)
    const supplierPrice = numeric(raw.supplierPrice)
    if (!supplierDue || supplierPrice == null) { issue('Não comprado: falta vencimento ou preço do fornecedor'); continue }
    const revenue = numeric(raw.revenue), volume = numeric(raw.volume)
    if (revenue === 0 && volume === 0) { issue('Cancelado: volume e faturamento zerados'); continue }
    if (revenue == null || volume == null || revenue < 0 || volume < 0) { issue('Faturamento ou volume inválido'); continue }
    const row = { source, line: i + 1, date, supplierDue, revenue, volume }
    for (const key of ['saleType', 'branch', 'consultant', 'client', 'culture', 'harvest', 'supplier', 'productType', 'product']) row[key] = String(raw[key] ?? '').trim()
    row.id = `${source}:${i + 1}`
    row.customerDue = dateKey(raw.customerDue)
    row.supplierPrice = supplierPrice
    row.city = cityIndex >= 0 ? String(cells[cityIndex] ?? '').trim() : ''
    row.costWithTax = numeric(raw.costWithTax)
    row.cash = row.customerDue ? (Date.parse(row.customerDue) - Date.parse(date)) / dayMs <= SIGHT_DAYS : null
    row.dedupKey = JSON.stringify([date, raw.client, raw.product, raw.consultant, raw.branch].map(textKey))
    row.firm = textKey(raw.status) === 'LANCADO'
    row.cost = numeric(raw.cost)
    row.margin = liquidMargin(row)
    if (row.margin == null) issue('Margem indisponível: custo com ICMS ou tipo de produto inválido')
    if (!row.customerDue) issue('Sem vencimento do cliente: modalidade e caixa incompletos')
    if (row.cost == null) issue('Sem custo sem ICMS: saída de caixa incompleta')
    rows.push(row)
  }
  return { rows, issues, keys: [...keys] }
}

// Priority is explicit: current workbook first. Keep legitimate repeated lines
// inside a workbook; the specification only deduplicates BETWEEN workbooks.
export function mergeGefertSources(sources) {
  const seen = new Set(), rows = [], issues = sources.flatMap((source) => source.issues)
  for (const source of sources) {
    const keys = new Set(source.keys ?? [])
    for (const row of source.rows) {
      const key = JSON.stringify([row.date, row.client, row.product, row.consultant, row.branch].map(textKey))
      keys.add(key)
      if (seen.has(key)) { issues.push({ source: row.source, line: row.line, reason: 'Duplicado em planilha de maior prioridade' }); continue }
      rows.push(row)
    }
    for (const key of keys) seen.add(key)
  }
  return { rows, issues }
}

function chosen(value) {
  if (value == null || value === '') return []
  return (Array.isArray(value) ? value : [value]).map((item) => String(item)).filter(Boolean)
}

function matchesChoice(value, choice) {
  const list = chosen(choice)
  if (!list.length) return true
  return list.some((item) => textKey(item) === textKey(value))
}

const ID_FIELDS = {
  client: 'clientId',
  consultant: 'consultantId',
  supplier: 'supplierId',
  product: 'productId',
}

function matchesId(row, field, choice) {
  const list = chosen(choice)
  if (!list.length) return true
  if (row[field] == null || row[field] === '') return false
  return list.some((item) => String(item) === String(row[field]))
}

function matchesBranch(value, choice) {
  const list = chosen(choice)
  if (!list.length) return true
  const current = textKey(branchLabel(value))
  return list.some((item) => textKey(branchLabel(item)) === current && current !== '')
}

export function filterSales(rows, filters = {}, { ignoreYear = false } = {}) {
  return rows.filter((row) => {
    if (filters.start && row.date < filters.start) return false
    if (filters.end && row.date > filters.end) return false
    if (!ignoreYear && !matchesChoice(row.date.slice(0, 4), filters.year)) return false
    if (!matchesChoice(row.date.slice(5, 7), filters.month)) return false
    if (filters.family === 'exclude' && row.family) return false
    if (filters.family === 'only' && !row.family) return false
    if (!matchesBranch(row.branch, filters.branch)) return false
    for (const [key, field] of Object.entries(ID_FIELDS)) {
      if (!matchesId(row, field, filters[key])) return false
    }
    for (const key of ['culture', 'productType', 'saleType', 'harvest']) {
      if (!matchesChoice(row[key], filters[key])) return false
    }
    return true
  })
}

export function aggregateSales(rows) {
  const revenue = round(rows.reduce((sum, row) => sum + row.revenue, 0))
  const volume = rows.reduce((sum, row) => sum + row.volume, 0)
  const margin = rows.length && rows.every((row) => row.margin != null) ? round(rows.reduce((sum, row) => sum + row.margin, 0)) : null
  const orders = new Set(rows.map((row) => row.orderId ?? row.id)).size
  return { revenue, volume, margin, marginPercent: revenue > 0 && margin != null ? margin / revenue * 100 : null,
    orders, clients: new Set(rows.map((row) => row.clientId ?? textKey(row.client)).filter(Boolean)).size,
    consultants: new Set(rows.map((row) => row.consultantId ?? textKey(row.consultant)).filter(Boolean)).size,
    ticket: orders ? revenue / orders : null, pricePerTon: volume > 0 ? revenue / volume : null,
    marginPerTon: volume > 0 && margin != null ? margin / volume : null }
}

export function groupSales(rows, field) {
  const groups = new Map()
  for (const row of rows) {
    const label = typeof field === 'function' ? field(row) : row[field] || 'Não informado'
    const key = textKey(label)
    if (!groups.has(key)) groups.set(key, { label, rows: [] })
    groups.get(key).rows.push(row)
  }
  return [...groups.values()].map(({ label, rows }) => ({ label, ...aggregateSales(rows) })).sort((a, b) => b.revenue - a.revenue)
}

export function weeklySales(rows) {
  const latest = rows.reduce((max, row) => row.date > max ? row.date : max, '')
  if (!latest) return { week: null, current: [], previous: [] }
  const week = weekKey(latest), previousWeek = shiftDay(week, -7)
  return { week, current: rows.filter((row) => weekKey(row.date) === week), previous: rows.filter((row) => weekKey(row.date) === previousWeek) }
}

export function cashFlow(rows) {
  if (rows.some((row) => row.firm == null)) {
    return {
      unavailable: 'Status de lançamento não registrado',
      incomplete: true,
      incomingKnown: false,
      outgoingKnown: false,
      outgoingGap: null,
      months: [],
    }
  }
  const months = new Map()
  const month = (date) => {
    const key = date.slice(0, 7)
    if (!months.has(key)) months.set(key, { month: key, incoming: 0, outgoing: 0 })
    return months.get(key)
  }
  const firmRows = rows.filter((row) => row.firm)
  const incomingKnown = firmRows.every((row) => row.customerDue)
  const missingSupplierDue = firmRows.some((row) => !row.supplierDue)
  const missingCost = firmRows.some((row) => row.cost == null)
  const outgoingKnown = !missingSupplierDue && !missingCost
  const outgoingGap = missingSupplierDue
    ? 'Vencimento do fornecedor não registrado'
    : missingCost
      ? 'Custo sem ICMS não registrado'
      : null
  const incomplete = !incomingKnown || !outgoingKnown
  for (const row of firmRows) {
    if (row.customerDue) month(row.customerDue).incoming += row.revenue
    if (row.supplierDue && row.cost != null) month(row.supplierDue).outgoing += row.cost
  }
  let accumulated = 0
  return {
    unavailable: null,
    incomplete,
    incomingKnown,
    outgoingKnown,
    outgoingGap,
    months: [...months.values()].sort((a, b) => a.month.localeCompare(b.month)).map((item) => {
      const balance = round(item.incoming - item.outgoing)
      accumulated = round(accumulated + balance)
      return {
        month: item.month,
        incoming: incomingKnown ? round(item.incoming) : null,
        outgoing: outgoingKnown ? round(item.outgoing) : null,
        balance: incomplete ? null : balance,
        accumulated: incomplete ? null : accumulated,
      }
    }),
  }
}

export function modalitySplit(rows) {
  const known = rows.filter((row) => row.cash != null)
  const sight = aggregateSales(known.filter((row) => row.cash))
  const term = aggregateSales(known.filter((row) => row.cash === false))
  const base = aggregateSales(known)
  return {
    sight,
    term,
    missing: rows.length - known.length,
    sightShare: base.revenue > 0 ? sight.revenue / base.revenue * 100 : null,
    termShare: base.revenue > 0 ? term.revenue / base.revenue * 100 : null,
  }
}

export function supplierCompare(currentRows, previousRows, limit = 6) {
  const previous = groupSales(previousRows, 'supplier')
  return groupSales(currentRows, 'supplier').slice(0, limit).map((row) => ({
    label: row.label,
    current: row,
    previous: previous.find((item) => textKey(item.label) === textKey(row.label)) ?? null,
  }))
}

export function compareYears(rows, filters = {}, today = new Date().toISOString().slice(0, 10)) {
  const base = filterSales(rows, filters, { ignoreYear: true })
  const marked = chosen(filters.year).sort().reverse()
  const available = [...new Set(base.map((row) => row.date.slice(0, 4)))].sort().reverse()
  const years = (marked.length >= 2 ? marked : available).slice(0, 2)
  const months = chosen(filters.month)
  return years.map((year) => {
    const cutoff = `${year}-${today.slice(5)}`
    const selected = base.filter((row) => row.date.slice(0, 4) === year && (months.length || row.date <= cutoff))
    return { year, rows: selected, ...aggregateSales(selected) }
  })
}

export function weeklySummary(rows, currency) {
  const { week, current, previous } = weeklySales(rows)
  if (!week) return ''
  const now = aggregateSales(current), before = aggregateSales(previous)
  const decimal = (value) => value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const delta = (value, suffix = '') => `${value >= 0 ? '▲' : '▼'} ${decimal(Math.abs(value))}${suffix}`
  const products = groupSales(current, 'product')
  const volumeProduct = [...products].sort((a, b) => b.volume - a.volume)[0]
  return [`Semana de ${week.split('-').reverse().join('/')}`, 'FATURAMENTO',
    `Esta semana: ${currency(now.revenue)} (${delta(now.revenue - before.revenue)} vs semana anterior)`,
    `Volume: ${decimal(now.volume)} t (${delta(now.volume - before.volume, ' t')})`,
    'MARGEM LÍQUIDA', now.marginPercent == null ? 'Indisponível' : `${decimal(now.marginPercent)}%${before.marginPercent == null ? '' : ` (${delta(now.marginPercent - before.marginPercent, ' p.p.')})`}`,
    'PRINCIPAIS CONSULTORES', ...groupSales(current, 'consultant').slice(0, 3).map((row, index) => `${index + 1}. ${row.label}: ${currency(row.revenue)}`),
    'PRINCIPAIS CLIENTES', ...groupSales(current, 'client').slice(0, 3).map((row, index) => `${index + 1}. ${row.label}: ${currency(row.revenue)}`),
    'PRINCIPAL PRODUTO (valor)', ...(products[0] ? [`${products[0].label}: ${currency(products[0].revenue)}`] : []),
    ...(volumeProduct && volumeProduct.label !== products[0]?.label ? [`Em volume: ${volumeProduct.label}: ${decimal(volumeProduct.volume)} t`] : []),
    'CULTURAS', ...groupSales(current, 'culture').slice(0, 2).map((row) => `${row.label}: ${currency(row.revenue)}`),
    `Pedidos na semana: ${now.orders} (${now.orders - before.orders >= 0 ? '+' : ''}${now.orders - before.orders} vs anterior)`,
    `Acumulado filtrado: ${currency(aggregateSales(rows).revenue)}`].join('\n')
}

export function branchLabel(value) {
  const key = textKey(value).replace(/-/g, ' ')
  const names = {
    UBERABA: 'Uberaba', 'FILIAL UBERABA': 'Uberaba',
    'NOVA PONTE': 'Nova Ponte', 'MATRIZ NOVA PONTE': 'Nova Ponte',
    FRUTAL: 'Frutal', 'FILIAL FRUTAL': 'Frutal',
    GUAIRA: 'Guaíra', 'FILIAL GUAIRA': 'Guaíra',
    ITUVERAVA: 'Ituverava', 'FILIAL ITUVERAVA': 'Ituverava',
  }
  return names[key] || String(value ?? '').trim()
}

export function applyAliases(rows, aliases = []) {
  return rows.map((row) => {
    const next = { ...row }
    for (const alias of aliases) {
      if (alias?.field && textKey(next[alias.field]) === textKey(alias.from)) next[alias.field] = alias.to
    }
    return next
  })
}

export function markFamily(rows, exceptions = [], { known = false } = {}) {
  if (!known) return rows.map((row) => ({ ...row, family: null }))
  const names = new Set(exceptions.filter((item) => item.ativo !== false).flatMap((item) => [item.nome, item.clientId]).map(textKey).filter(Boolean))
  return rows.map((row) => ({ ...row, family: names.has(textKey(row.client)) || names.has(textKey(row.clientId)) }))
}

export function withDerived(rows, { rules, sightDays = SIGHT_DAYS } = {}) {
  return rows.map((row) => {
    const cash = row.customerDue ? (Date.parse(row.customerDue) - Date.parse(row.date)) / dayMs <= sightDays : null
    return { ...row, cash, margin: liquidMargin({ ...row, rules }) }
  })
}

export function marginTone(marginPercent, cash, alerts = DEFAULT_ALERTS) {
  if (marginPercent == null) return null
  const red = cash ? alerts.vistaRed : alerts.prazoRed
  const healthy = cash ? alerts.vistaHealthy : alerts.prazoHealthy
  if (marginPercent < red) return 'red'
  if (marginPercent >= healthy) return 'healthy'
  return 'watch'
}

export function commercialRows(rows) {
  if (!rows.length || rows.some((row) => row.family == null)) return null
  return rows.filter((row) => row.family === false)
}

export function lastWeeks(rows, count = 20) {
  const grouped = groupSales(rows, (row) => weekKey(row.date))
  const latest = grouped.map((row) => row.label).sort().at(-1)
  if (!latest) return []
  return Array.from({ length: count }, (_, index) => {
    const label = shiftDay(latest, (index - (count - 1)) * 7)
    return grouped.find((row) => row.label === label) || { label, revenue: 0, volume: 0, margin: null, marginPercent: null }
  })
}

export function movingAverage(points, window = 4) {
  return points.map((_, index) => {
    const slice = points.slice(Math.max(0, index - window + 1), index + 1).map((point) => point ?? 0)
    return slice.reduce((sum, value) => sum + value, 0) / slice.length
  })
}

export function measureOf(row, measure) {
  if (measure === 'volume') return row.volume
  if (measure === 'margin') return row.marginPercent
  return row.revenue
}

export function heatmap(rows, branches = BRANCHES) {
  const consultants = groupSales(rows, 'consultant').map((row) => row.label)
  return consultants.map((consultant) => {
    const cells = branches.map((branch) => aggregateSales(rows.filter((row) => textKey(row.consultant) === textKey(consultant) && textKey(branchLabel(row.branch)) === textKey(branch))))
    return { consultant, cells, total: aggregateSales(rows.filter((row) => textKey(row.consultant) === textKey(consultant))) }
  })
}

export function yearSeries(rows, year, measure = 'revenue') {
  const selected = rows.filter((row) => row.date.slice(0, 4) === String(year)).sort((a, b) => a.date.localeCompare(b.date))
  let revenue = 0
  let volume = 0
  let margin = 0
  let complete = true
  const points = []
  for (const row of selected) {
    revenue = round(revenue + row.revenue)
    volume += row.volume
    if (row.margin == null) complete = false
    else margin = round(margin + row.margin)
    const value = measure === 'volume' ? volume : measure === 'margin' ? (revenue > 0 && complete ? margin / revenue * 100 : null) : revenue
    points.push({ date: row.date, week: weekKey(row.date), value })
  }
  return points
}

export function annualLadder(previousRevenue, currentRevenue, steps = DEFAULT_GOAL_STEPS) {
  return steps.map((step) => {
    const target = previousRevenue == null ? null : round(previousRevenue * (1 + step / 100))
    const gap = target == null ? null : round(target - currentRevenue)
    return { step, target, gap, reached: gap != null && gap <= 0 }
  })
}

export function goalTone(percent) {
  if (percent == null) return null
  if (percent >= 100) return 'healthy'
  if (percent >= 70) return 'watch'
  return 'red'
}

export function unifySales(native, historical) {
  const seen = new Set(native.keys ?? [])
  const rows = [...native.rows]
  const issues = [...(native.issues ?? [])]
  for (const row of historical.rows ?? []) {
    if (seen.has(row.dedupKey)) {
      issues.push({ source: row.source || 'Carga histórica', line: row.line, reason: 'Já coberto pelo Aval; a linha histórica não foi somada.' })
      continue
    }
    rows.push(row)
    if (row.dedupKey) seen.add(row.dedupKey)
  }
  for (const key of historical.keys ?? []) seen.add(key)
  return { rows, issues }
}

export function formatCompactBRL(value) {
  if (value == null || !Number.isFinite(Number(value))) return '—'
  const number = Number(value)
  const abs = Math.abs(number)
  const sign = number < 0 ? '-' : ''
  if (abs >= 1000000) {
    return `${sign}R$ ${(abs / 1000000).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}M`
  }
  if (abs >= 1000) return `${sign}R$ ${Math.round(abs / 1000).toLocaleString('pt-BR')}k`
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(number)
}
