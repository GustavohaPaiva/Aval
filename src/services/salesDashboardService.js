import { supabase } from './supabase'
import { formatProdutoDisplayNome } from '../constants/mapeamentoCampos'
import { buildNativeSaleFacts } from '../utils/nativeSalesFacts'
import { mergeGefertSources } from '../utils/salesDashboard'
import {
  invalidateSalesDashboardCache,
  peekSalesDashboard,
  storeSalesDashboard,
} from './salesDashboardCache'

const one = (value) => Array.isArray(value) ? value[0] : value
const GESTOR_ONLY = 'Painel disponível somente para gestores.'

const ORDER_RICH = `
  id, user_id, client_id, total_proposta, data_pagamento, data_negociacao,
  filial_venda, tipo_venda, safra, status_lancamento,
  clients(nome),
  simulation_items(
    id, product_id, volume, proposta, cultura, produto_classe,
    custo_brl_unitario, custo_icms_unitario,
    produtos_oficiais(nome)
  )`
const ORDER_BASIC = `
  id, user_id, client_id, total_proposta, data_pagamento,
  clients(nome),
  simulation_items(id, product_id, volume, proposta, cultura, produto_classe, produtos_oficiais(nome))`
const ORDER_EMBEDDED = `
  id, user_id, client_id, total_proposta, data_pagamento, data_negociacao,
  filial_venda, tipo_venda, safra, status_lancamento,
  clients(nome),
  simulation_items(
    id, product_id, volume, proposta, cultura, produto_classe,
    custo_brl_unitario, custo_icms_unitario,
    produtos_oficiais(nome),
    alocacoes(
      id, simulation_item_id, quantidade_kg, compra_item_id, estoque_lote_id,
      compra_itens(
        id, unitario_brl, pagamento_syagri, compra_id,
        compras(id, fornecedor_id, fornecedores(nome))
      ),
      estoque_lotes(
        id, compra_item_id,
        compra_itens(
          id, unitario_brl, pagamento_syagri, compra_id,
          compras(id, fornecedor_id, fornecedores(nome))
        )
      )
    )
  )`
const HISTORICAL_COLUMNS = `id, importacao_id, linha, dedup_key, data_venda, data_venc_cliente, data_venc_fornecedor, status_lancado, tipo_venda, filial, consultor, cliente, cultura, safra, fornecedor, tipo_produto, produto, volume, preco_fornecedor, custo_com_icms, custo_sem_icms, faturamento`
const PARAMETER_COLUMNS = 'id, dolar_referencia, dias_vista, alerta_vista_vermelho, alerta_vista_saudavel, alerta_prazo_vermelho, alerta_prazo_saudavel, meta_incrementos'

let loadTicket = 0

function missingColumn(error) {
  return /column|schema cache|does not exist/i.test(error?.message ?? '')
}

function relationshipError(error) {
  return /could not find a relationship|more than one relationship|PGRST200/i.test(error?.message ?? '')
}

async function currentUserId() {
  if (!supabase.auth?.getSession) return null
  try {
    const { data } = await supabase.auth.getSession()
    return data.session?.user?.id ?? null
  } catch {
    return null
  }
}

async function pageOrders(signal, select) {
  const orders = []
  let offset = 0
  let total = null
  do {
    const result = await supabase.from('simulations').select(select, { count: 'exact' })
      .eq('status', 'converted').eq('ativo', true)
      .order('id').range(offset, offset + 199).abortSignal(signal)
    if (result.error) throw result.error
    total = result.count ?? total
    const page = result.data ?? []
    orders.push(...page)
    offset += page.length
    if (!page.length) {
      if (total != null && offset < total) throw new Error('A consulta retornou uma base incompleta. Atualize o painel.')
      break
    }
  } while (total == null ? offset % 200 === 0 : offset < total)
  return orders
}

async function inChunks(ids, signal, run) {
  const rows = []
  for (let index = 0; index < ids.length; index += 100) {
    const result = await run(ids.slice(index, index + 100), signal)
    if (result?.error) throw result.error
    rows.push(...(result?.data ?? []))
  }
  return rows
}

function mapHistorical(row, fileName) {
  return {
    id: row.id,
    source: fileName,
    line: row.linha,
    date: row.data_venda,
    customerDue: row.data_venc_cliente,
    supplierDue: row.data_venc_fornecedor,
    firm: row.status_lancado === true,
    saleType: row.tipo_venda || '',
    branch: row.filial || '',
    consultant: row.consultor || '',
    client: row.cliente || '',
    culture: row.cultura || '',
    harvest: row.safra || '',
    supplier: row.fornecedor || '',
    productType: row.tipo_produto || '',
    product: row.produto || '',
    volume: Number(row.volume),
    revenue: Number(row.faturamento),
    supplierPrice: row.preco_fornecedor == null ? null : Number(row.preco_fornecedor),
    costWithTax: row.custo_com_icms == null ? null : Number(row.custo_com_icms),
    cost: row.custo_sem_icms == null ? null : Number(row.custo_sem_icms),
    dedupKey: row.dedup_key,
    family: false,
  }
}

async function loadOptional(run) {
  try {
    const result = await run()
    if (result?.error) return { ok: false, error: result.error }
    return { ok: true, data: result.data }
  } catch (error) {
    return { ok: false, error }
  }
}

function supportIsEmbedded(orders) {
  return orders.every((order) => (order.simulation_items ?? []).every((item) => Array.isArray(item.alocacoes)))
}

function rememberPurchase(map, value) {
  const row = one(value)
  if (row?.id && !map.has(row.id)) map.set(row.id, row)
}

function collectEmbedded(orders) {
  const allocationRows = []
  const lots = []
  const seenLots = new Set()
  const purchases = new Map()
  for (const order of orders) {
    for (const item of order.simulation_items ?? []) {
      for (const allocation of item.alocacoes ?? []) {
        allocationRows.push({
          id: allocation.id,
          simulation_item_id: allocation.simulation_item_id ?? item.id,
          quantidade_kg: allocation.quantidade_kg,
          compra_item_id: allocation.compra_item_id,
          estoque_lote_id: allocation.estoque_lote_id,
        })
        rememberPurchase(purchases, allocation.compra_itens)
        const lot = one(allocation.estoque_lotes)
        if (lot?.id && !seenLots.has(lot.id)) {
          seenLots.add(lot.id)
          lots.push({ id: lot.id, compra_item_id: lot.compra_item_id })
          rememberPurchase(purchases, lot.compra_itens)
        }
      }
    }
  }
  const purchaseRows = [...purchases.values()]
  const compras = new Map()
  for (const row of purchaseRows) {
    const compra = one(row.compras)
    if (compra?.id && !compras.has(compra.id)) compras.set(compra.id, compra)
  }
  return { allocationRows, lots, purchaseRows, compras: [...compras.values()] }
}

async function loadSupport(orders, signal) {
  if (supportIsEmbedded(orders)) return collectEmbedded(orders)
  const itemIds = orders.flatMap((order) => (order.simulation_items ?? []).map((item) => item.id))
  const allocationRows = itemIds.length ? await inChunks(itemIds, signal, (ids, current) => (
    supabase.from('alocacoes').select('id, simulation_item_id, quantidade_kg, compra_item_id, estoque_lote_id').in('simulation_item_id', ids).abortSignal(current)
  )) : []
  const lotIds = [...new Set(allocationRows.map((row) => row.estoque_lote_id).filter(Boolean))]
  const directIds = [...new Set(allocationRows.map((row) => row.compra_item_id).filter(Boolean))]
  const purchaseSelect = 'id, unitario_brl, pagamento_syagri, compra_id'
  const [lots, directPurchases] = await Promise.all([
    lotIds.length ? inChunks(lotIds, signal, (ids, current) => (
      supabase.from('estoque_lotes').select('id, compra_item_id').in('id', ids).abortSignal(current)
    )) : [],
    directIds.length ? inChunks(directIds, signal, (ids, current) => (
      supabase.from('compra_itens').select(purchaseSelect).in('id', ids).abortSignal(current)
    )) : [],
  ])
  const seenPurchases = new Set(directPurchases.map((row) => row.id))
  const extraIds = [...new Set(lots.map((row) => row.compra_item_id).filter((id) => id && !seenPurchases.has(id)))]
  const extraPurchases = extraIds.length ? await inChunks(extraIds, signal, (ids, current) => (
    supabase.from('compra_itens').select(purchaseSelect).in('id', ids).abortSignal(current)
  )) : []
  const purchaseRows = [...directPurchases, ...extraPurchases]
  const compraIds = [...new Set(purchaseRows.map((row) => row.compra_id).filter(Boolean))]
  const compras = compraIds.length ? await inChunks(compraIds, signal, (ids, current) => (
    supabase.from('compras').select('id, fornecedor_id, fornecedores(nome)').in('id', ids).abortSignal(current)
  )) : []
  return { allocationRows, lots, purchaseRows, compras }
}

async function loadNative(signal) {
  let schemaReady = true
  let saleFields = true
  let orders
  try {
    orders = await pageOrders(signal, ORDER_EMBEDDED)
  } catch (error) {
    if (relationshipError(error)) {
      try {
        orders = await pageOrders(signal, ORDER_RICH)
      } catch (richError) {
        if (!missingColumn(richError)) throw richError
        schemaReady = false
        saleFields = false
        orders = await pageOrders(signal, ORDER_BASIC)
      }
    } else if (missingColumn(error)) {
      schemaReady = false
      saleFields = false
      orders = await pageOrders(signal, ORDER_BASIC)
    } else {
      throw error
    }
  }
  for (const order of orders) {
    const items = order.simulation_items ?? []
    const sum = items.reduce((value, item) => value + Number(item.volume) * Number(item.proposta), 0)
    if (!items.length || Math.abs(sum - Number(order.total_proposta)) > 0.05) {
      throw new Error('Há pedidos com itens ausentes ou total divergente. Confira os pedidos antes de consolidar o painel.')
    }
  }
  const profileIds = [...new Set(orders.map((row) => row.user_id).filter(Boolean))]
  const [profileRows, support] = await Promise.all([
    profileIds.length ? inChunks(profileIds, signal, (ids, current) => (
      supabase.from('profiles').select('id, nome, filial').in('id', ids).abortSignal(current)
    )) : [],
    loadSupport(orders, signal),
  ])
  const profiles = new Map(profileRows.map((row) => [row.id, row]))
  const supplierByCompra = new Map(support.compras.map((row) => [row.id, {
    name: one(row.fornecedores)?.nome || '',
    id: row.fornecedor_id || null,
  }]))
  const native = buildNativeSaleFacts({
    orders: orders.map((order) => ({
      id: order.id,
      userId: order.user_id,
      clientId: order.client_id,
      client: one(order.clients)?.nome || '',
      negotiatedOn: saleFields && order.data_negociacao ? String(order.data_negociacao).slice(0, 10) : null,
      customerDue: order.data_pagamento ? String(order.data_pagamento).slice(0, 10) : null,
      branch: saleFields ? (order.filial_venda || '') : '',
      saleType: !saleFields ? '' : order.tipo_venda === 'barter' ? 'Barter' : order.tipo_venda === 'reais' ? 'Reais' : '',
      harvest: saleFields ? (order.safra || '') : '',
      firm: saleFields ? order.status_lancamento === 'lancado' : null,
      items: (order.simulation_items ?? []).map((item) => ({
        id: item.id,
        volume: Number(item.volume),
        proposta: Number(item.proposta),
        culture: item.cultura || '',
        productType: item.produto_classe || '',
        product: one(item.produtos_oficiais)?.nome || '',
        productId: item.product_id || null,
        costWithTaxUnit: saleFields && item.custo_brl_unitario != null ? Number(item.custo_brl_unitario) : null,
        costUnit: saleFields && item.custo_icms_unitario != null ? Number(item.custo_icms_unitario) : null,
      })),
    })),
    profiles,
    allocations: support.allocationRows.map((row) => ({
      id: row.id,
      simulationItemId: row.simulation_item_id,
      kg: Number(row.quantidade_kg),
      compraItemId: row.compra_item_id,
      loteId: row.estoque_lote_id,
    })),
    purchases: support.purchaseRows.map((row) => ({
      id: row.id,
      supplierDue: row.pagamento_syagri ? String(row.pagamento_syagri).slice(0, 10) : null,
      supplierPrice: row.unitario_brl == null ? null : Number(row.unitario_brl),
      supplier: supplierByCompra.get(row.compra_id)?.name || '',
      supplierId: supplierByCompra.get(row.compra_id)?.id || null,
    })),
    lots: support.lots.map((row) => ({ id: row.id, compraItemId: row.compra_item_id })),
  })
  return { schemaReady, saleFields, native }
}

export async function loadSalesDashboard({ role, signal, fresh = false, userId = null } = {}) {
  if (role !== 'gestor') return { ok: false, error: GESTOR_ONLY }
  const cacheId = userId || await currentUserId()
  if (!fresh) {
    const cached = peekSalesDashboard(cacheId)
    if (cached) return cached
  }
  const ticket = ++loadTicket
  try {
    const historicalPromise = loadHistorical(signal).then(
      (value) => ({ ok: true, value }),
      (error) => ({ ok: false, error }),
    )
    const [nativeResult, config, catalogs, historicalResult] = await Promise.all([
      loadNative(signal),
      loadDashboardConfig(signal),
      loadFilterCatalogs(signal),
      historicalPromise,
    ])
    if (signal?.aborted) return { ok: false, error: 'Consulta cancelada.' }
    let { schemaReady, saleFields, native } = nativeResult
    if (!config.schemaReady) schemaReady = false
    let historical = { rows: [], issues: [], files: [] }
    if (config.schemaReady) {
      if (!historicalResult.ok) throw historicalResult.error
      historical = historicalResult.value
    }
    const fields = {
      negotiationDate: saleFields,
      saleBranch: saleFields,
      saleType: saleFields,
      harvest: saleFields,
      firmStatus: saleFields,
      frozenCost: saleFields,
      goals: config.schemaReady,
      family: config.schemaReady && config.values.exceptions.some((item) => item.ativo !== false),
      snapshots: config.schemaReady && config.values.snapshots.length > 0,
      dollar: config.values.dollar != null,
      historical: config.schemaReady && historical.files.length > 0,
    }
    const result = { ok: true, schemaReady, fields, native, historical, catalogs, config: config.values, updatedAt: new Date().toISOString() }
    if (cacheId && ticket === loadTicket && !signal?.aborted) storeSalesDashboard(cacheId, result)
    return result
  } catch (error) {
    if (signal?.aborted) return { ok: false, error: 'Consulta cancelada.' }
    return { ok: false, error: error?.message || 'Não foi possível carregar as vendas.' }
  }
}

const CATALOG_PAGE = 1000

async function fetchPage(signal, table, select, refine, offset, withCount) {
  let query = supabase.from(table).select(select, withCount ? { count: 'exact' } : undefined).range(offset, offset + CATALOG_PAGE - 1)
  if (refine) query = refine(query)
  const result = await query.abortSignal(signal)
  if (result.error) throw result.error
  return result
}

async function fetchAllRows(signal, table, select, refine) {
  const first = await fetchPage(signal, table, select, refine, 0, true)
  const batch = first.data ?? []
  if (batch.length < CATALOG_PAGE) return batch
  if (first.count == null) {
    const rows = [...batch]
    let offset = CATALOG_PAGE
    for (;;) {
      if (offset > 50000) throw new Error('A consulta de cadastros veio incompleta.')
      const next = await fetchPage(signal, table, select, refine, offset, false)
      const page = next.data ?? []
      rows.push(...page)
      if (page.length < CATALOG_PAGE) return rows
      offset += CATALOG_PAGE
    }
  }
  if (first.count > 50000) throw new Error('A consulta de cadastros veio incompleta.')
  const pages = Math.ceil(first.count / CATALOG_PAGE)
  const rest = await Promise.all(Array.from({ length: pages - 1 }, (_, index) => (
    fetchPage(signal, table, select, refine, (index + 1) * CATALOG_PAGE, false)
  )))
  const rows = batch.concat(...rest.map((page) => page.data ?? []))
  if (rows.length < first.count) throw new Error('A consulta de cadastros veio incompleta.')
  return rows
}

function catalogOptions(rows, labelOf, hintOf) {
  const labels = rows.map((row) => String(labelOf(row) ?? '').trim())
  const counts = new Map()
  for (const label of labels) {
    if (!label) continue
    counts.set(label, (counts.get(label) ?? 0) + 1)
  }
  return rows.flatMap((row, index) => {
    const label = labels[index]
    if (!row.id || !label) return []
    const hint = hintOf && counts.get(label) > 1 ? String(hintOf(row) ?? '').trim() : ''
    return [{ value: row.id, label: hint ? `${label} · ${hint}` : label }]
  })
}

async function loadFilterCatalogs(signal) {
  const [clients, suppliers, consultants, products] = await Promise.all([
    fetchAllRows(signal, 'clients', 'id, nome, municipio', (query) => query.order('nome', { ascending: true })),
    fetchAllRows(signal, 'fornecedores', 'id, nome', (query) => query.order('nome', { ascending: true })),
    fetchAllRows(signal, 'profiles', 'id, nome', (query) => query.eq('role', 'consultor').order('nome', { ascending: true })),
    fetchAllRows(signal, 'produtos_oficiais', 'id, nome, referencia_complementar, fornecedores(nome)', (query) => query.order('nome', { ascending: true })),
  ])
  return {
    clients: catalogOptions(clients, (row) => row.nome, (row) => row.municipio),
    suppliers: catalogOptions(suppliers, (row) => row.nome),
    consultants: catalogOptions(consultants, (row) => row.nome),
    products: products.flatMap((row) => {
      const label = formatProdutoDisplayNome({
        nome: row.nome,
        referencia_complementar: row.referencia_complementar,
        fornecedor_nome: one(row.fornecedores)?.nome,
      }).trim()
      return row.id && label ? [{ value: row.id, label }] : []
    }),
  }
}

async function loadQuote(signal) {
  const quotes = await loadOptional(() => supabase.from('cotacoes_moeda').select('moeda_origem, taxa_conversao, data_vigencia').order('data_vigencia', { ascending: false }).limit(8).abortSignal(signal))
  const quote = (quotes.data ?? []).find((row) => /usd|dolar|dólar/i.test(row.moeda_origem ?? '')) ?? quotes.data?.[0] ?? null
  return quote ? { rate: Number(quote.taxa_conversao), on: quote.data_vigencia, currency: quote.moeda_origem } : null
}

async function loadDashboardConfig(signal) {
  const [parameters, quote, rules, goals, exceptions, aliases, snapshots] = await Promise.all([
    loadOptional(() => supabase.from('dashboard_parametros').select(PARAMETER_COLUMNS).eq('id', 1).abortSignal(signal).maybeSingle()),
    loadQuote(signal),
    loadOptional(() => supabase.from('dashboard_regras_margem').select('vigente_desde, icms, pis, comissao_especial, comissao_convencional').order('vigente_desde').abortSignal(signal)),
    loadOptional(() => supabase.from('dashboard_metas').select('id, ano, consultor_nome, profile_id, valor').order('ano', { ascending: false }).abortSignal(signal)),
    loadOptional(() => supabase.from('dashboard_excecoes_cliente').select('id, client_id, nome, ativo').order('nome').abortSignal(signal)),
    loadOptional(() => supabase.from('dashboard_depara').select('id, campo, origem, destino').order('campo').abortSignal(signal)),
    loadOptional(() => supabase.from('dashboard_snapshots').select('id, ano, capturado_em, faturamento, volume, margem, pedidos').order('capturado_em', { ascending: false }).limit(30).abortSignal(signal)),
  ])
  if (!parameters.ok) return { schemaReady: false, values: { ...emptyConfig(), quote } }
  const parameter = parameters.data ?? {}
  return {
    schemaReady: true,
    values: {
      dollar: Number(parameter.dolar_referencia) > 0 ? Number(parameter.dolar_referencia) : null,
      sightDays: Number(parameter.dias_vista) || 90,
      alertsRegistered: true,
      alerts: {
        vistaRed: Number(parameter.alerta_vista_vermelho),
        vistaHealthy: Number(parameter.alerta_vista_saudavel),
        prazoRed: Number(parameter.alerta_prazo_vermelho),
        prazoHealthy: Number(parameter.alerta_prazo_saudavel),
      },
      steps: Array.isArray(parameter.meta_incrementos) ? parameter.meta_incrementos.map(Number) : [0, 5, 10, 15],
      rules: (rules.data ?? []).map((row) => ({
        from: String(row.vigente_desde).slice(0, 10),
        icms: Number(row.icms),
        pis: Number(row.pis),
        special: Number(row.comissao_especial),
        conventional: Number(row.comissao_convencional),
      })),
      goals: (goals.data ?? []).map((row) => ({ id: row.id, year: row.ano, consultant: row.consultor_nome, profileId: row.profile_id, value: Number(row.valor) })),
      exceptions: (exceptions.data ?? []).map((row) => ({ id: row.id, clientId: row.client_id, nome: row.nome, ativo: row.ativo })),
      aliases: (aliases.data ?? []).map((row) => ({ id: row.id, field: row.campo, from: row.origem, to: row.destino })),
      snapshots: snapshots.data ?? [],
      quote,
    },
  }
}

function emptyConfig() {
  return { dollar: null, sightDays: 90, alerts: { vistaRed: 1.5, vistaHealthy: 3, prazoRed: 5, prazoHealthy: 7 }, alertsRegistered: false, steps: [0, 5, 10, 15], rules: [], goals: [], exceptions: [], aliases: [], snapshots: [], quote: null }
}

async function loadHistorical(signal) {
  const [imports, linesResult] = await Promise.all([
    supabase.from('dashboard_importacoes').select('id, arquivo, prioridade, chaves, ocorrencias, importado_em').order('prioridade').abortSignal(signal),
    fetchAllRows(signal, 'dashboard_vendas_historicas', HISTORICAL_COLUMNS, (query) => query.order('id', { ascending: true })),
  ])
  if (imports.error) throw imports.error
  const files = imports.data ?? []
  const lines = linesResult
  const byImport = new Map(files.map((file) => [file.id, []]))
  for (const line of lines) byImport.get(line.importacao_id)?.push(line)
  const sources = files.map((file) => ({
    rows: (byImport.get(file.id) ?? []).map((line) => mapHistorical(line, file.arquivo)),
    issues: file.ocorrencias ?? [],
    keys: file.chaves ?? [],
  }))
  return { ...mergeGefertSources(sources), files }
}

async function requireGestor() {
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) return { ok: false, error: 'Sessão expirada. Faça login novamente.' }
  const profile = await supabase.from('profiles').select('role').eq('id', data.user.id).maybeSingle()
  if (profile.error) return { ok: false, error: profile.error.message }
  if (profile.data?.role !== 'gestor') return { ok: false, error: GESTOR_ONLY }
  return { ok: true, userId: data.user.id }
}

export async function saveGefertImport(files) {
  const auth = await requireGestor()
  if (!auth.ok) return auth
  const probe = await supabase.from('dashboard_importacoes').select('id').limit(1)
  if (probe.error) return { ok: false, error: 'A carga histórica ainda não pode ser gravada. A migration do dashboard precisa ser aplicada em desenvolvimento.' }
  const { sources } = await readGefertFiles(files)
  for (const source of sources) {
    const saved = await supabase.from('dashboard_importacoes').upsert({
      arquivo: source.source,
      prioridade: /24[_\s-]*25/.test(source.source) ? 1 : 0,
      chaves: source.keys,
      ocorrencias: source.issues.slice(0, 300),
      linhas: source.rows.length,
      importado_em: new Date().toISOString(),
      importado_por: auth.userId,
    }, { onConflict: 'arquivo' }).select('id').single()
    if (saved.error) return { ok: false, error: saved.error.message }
    const removed = await supabase.from('dashboard_vendas_historicas').delete().eq('importacao_id', saved.data.id)
    if (removed.error) return { ok: false, error: removed.error.message }
    const payload = source.rows.map((row) => ({
      importacao_id: saved.data.id,
      dedup_key: row.dedupKey,
      data_venda: row.date,
      data_venc_cliente: row.customerDue,
      data_venc_fornecedor: row.supplierDue,
      status_lancado: row.firm === true,
      tipo_venda: row.saleType || null,
      filial: row.branch || null,
      consultor: row.consultant || null,
      cliente: row.client || null,
      cultura: row.culture || null,
      safra: row.harvest || null,
      fornecedor: row.supplier || null,
      tipo_produto: row.productType || null,
      produto: row.product || null,
      volume: row.volume,
      preco_fornecedor: row.supplierPrice,
      custo_com_icms: row.costWithTax,
      custo_sem_icms: row.cost,
      faturamento: row.revenue,
      cidade: row.city || null,
      linha: row.line,
    }))
    for (let index = 0; index < payload.length; index += 200) {
      const inserted = await supabase.from('dashboard_vendas_historicas').insert(payload.slice(index, index + 200))
      if (inserted.error) return { ok: false, error: inserted.error.message }
    }
  }
  invalidateSalesDashboardCache()
  return { ok: true }
}

export async function saveDashboardSettings(patch) {
  const auth = await requireGestor()
  if (!auth.ok) return auth
  const row = { id: 1, atualizado_em: new Date().toISOString(), atualizado_por: auth.userId }
  if (patch.dollar != null) row.dolar_referencia = patch.dollar
  if (patch.sightDays != null) row.dias_vista = patch.sightDays
  if (patch.alerts) {
    row.alerta_vista_vermelho = patch.alerts.vistaRed
    row.alerta_vista_saudavel = patch.alerts.vistaHealthy
    row.alerta_prazo_vermelho = patch.alerts.prazoRed
    row.alerta_prazo_saudavel = patch.alerts.prazoHealthy
  }
  if (patch.steps) row.meta_incrementos = patch.steps
  const result = await supabase.from('dashboard_parametros').upsert(row)
  if (result.error) return { ok: false, error: result.error.message }
  invalidateSalesDashboardCache()
  return { ok: true }
}

export async function saveGoal(goal) {
  const auth = await requireGestor()
  if (!auth.ok) return auth
  const result = await supabase.from('dashboard_metas').upsert({
    id: goal.id,
    ano: Number(goal.year),
    consultor_nome: goal.consultant.trim(),
    valor: Number(goal.value),
  })
  if (!result.error) invalidateSalesDashboardCache()
  return result.error ? { ok: false, error: result.error.message } : { ok: true }
}

export async function deleteDashboardRow(table, id) {
  const auth = await requireGestor()
  if (!auth.ok) return auth
  const allowed = ['dashboard_metas', 'dashboard_excecoes_cliente', 'dashboard_depara', 'dashboard_regras_margem']
  if (!allowed.includes(table)) return { ok: false, error: 'Cadastro inválido.' }
  const result = await supabase.from(table).delete().eq('id', id)
  if (!result.error) invalidateSalesDashboardCache()
  return result.error ? { ok: false, error: result.error.message } : { ok: true }
}

export async function saveException(exception) {
  const auth = await requireGestor()
  if (!auth.ok) return auth
  const result = await supabase.from('dashboard_excecoes_cliente').upsert({
    id: exception.id,
    nome: exception.nome.trim(),
    client_id: exception.clientId || null,
    ativo: exception.ativo !== false,
  })
  if (!result.error) invalidateSalesDashboardCache()
  return result.error ? { ok: false, error: result.error.message } : { ok: true }
}

export async function saveAlias(alias) {
  const auth = await requireGestor()
  if (!auth.ok) return auth
  const result = await supabase.from('dashboard_depara').upsert({
    id: alias.id,
    campo: alias.field,
    origem: alias.from.trim(),
    destino: alias.to.trim(),
  }, { onConflict: 'campo,origem' })
  if (!result.error) invalidateSalesDashboardCache()
  return result.error ? { ok: false, error: result.error.message } : { ok: true }
}

export async function saveMarginRule(rule) {
  const auth = await requireGestor()
  if (!auth.ok) return auth
  const result = await supabase.from('dashboard_regras_margem').upsert({
    vigente_desde: rule.from,
    icms: Number(rule.icms),
    pis: Number(rule.pis),
    comissao_especial: Number(rule.special),
    comissao_convencional: Number(rule.conventional),
  }, { onConflict: 'vigente_desde' })
  if (!result.error) invalidateSalesDashboardCache()
  return result.error ? { ok: false, error: result.error.message } : { ok: true }
}

export async function captureSnapshot(snapshot) {
  const auth = await requireGestor()
  if (!auth.ok) return auth
  const result = await supabase.from('dashboard_snapshots').insert({
    ano: snapshot.year,
    faturamento: snapshot.revenue,
    volume: snapshot.volume,
    margem: snapshot.margin,
    pedidos: snapshot.orders,
    capturado_por: auth.userId,
  })
  if (!result.error) invalidateSalesDashboardCache()
  return result.error ? { ok: false, error: result.error.message } : { ok: true }
}

export async function readGefertFiles(files) {
  const XLSX = await import('xlsx')
  const { parseGefertRows, mergeGefertSources: merge } = await import('../utils/salesDashboard')
  const sources = []
  const sorted = [...files].sort((a, b) => Number(/24[_\s-]*25/.test(a.name)) - Number(/24[_\s-]*25/.test(b.name)))
  if (new Set(sorted.map((file) => file.name)).size !== sorted.length) throw new Error('Selecione arquivos com nomes diferentes para manter a origem identificável.')
  for (const file of sorted) {
    if (!/\.xlsx$/i.test(file.name)) throw new Error('Selecione somente planilhas .xlsx.')
    if (file.size > 15 * 1024 * 1024) throw new Error('Cada planilha deve ter até 15 MB.')
    const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: false })
    const sheetName = workbook.SheetNames.find((name) => name.trim().toUpperCase() === 'GFERT')
    if (!sheetName) throw new Error(`${file.name}: aba GFERT não encontrada.`)
    const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: null, raw: true })
    sources.push({ ...parseGefertRows(matrix, file.name), source: file.name })
  }
  return { ...merge(sources), sources }
}
