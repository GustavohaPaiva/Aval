import { supabase } from './supabase'
import { IGNORE_COLUMN_VALUE } from '../constants/mapeamentoCampos'
import { dateToQuarter, parsePrecoValue } from '../utils/spreadsheetAnalyzer'
import {
  isValidFertilizante,
  normalizeFertilizante,
} from '../utils/normalizeSku'
import { calcCustoBrlComDesconto } from '../utils/pricingCalculations'
import { formatSupabaseError } from '../utils/supabaseErrors'

const STAGING_ROW_FIELDS =
  'id, lote_id, sku_fornecedor, nome, referencia_complementar, estado, classe, quarter, preco_original, moeda, desconto_usd, status_linha, dados_brutos'

const LOTE_DETAIL_SELECT = `
      id,
      status,
      data_upload,
      fornecedor_id,
      moeda_detectada,
      data_validade,
      quarter_calculado,
      desconto_usd,
      estado_padrao,
      ativo,
      metadata_planilha,
      fornecedores ( id, nome )
    `

const PRODUTO_LIST_FIELDS =
  'id, fornecedor_id, sku_fornecedor, nome, referencia_complementar, estado, classe, quarter, moeda_origem, preco_original, desconto_usd, preco_interno_calculado, custo_icms, lote_id, vencimento_lista, ativo, fornecedores(nome), lotes_importacao(id, quarter_calculado, data_validade, ativo)'

function normalizeEstado(value) {
  const estado = String(value ?? '').trim().toUpperCase()
  return ['MG', 'SP'].includes(estado) ? estado : null
}

function prepareStagingInsertRows(rows) {
  return rows.map((row) => ({
    lote_id: row.lote_id,
    sku_fornecedor: row.sku_fornecedor ?? row.referencia_complementar ?? '',
    dados_brutos: row.dados_brutos,
    preco_original: row.preco_original,
    moeda: row.moeda,
    status_linha: row.status_linha ?? 'novo',
    nome: row.nome ?? '',
    referencia_complementar: row.referencia_complementar ?? '',
    estado: normalizeEstado(row.estado),
    classe: row.classe ?? 'Convencional',
    quarter: row.quarter ?? '',
    desconto_usd:
      row.desconto_usd !== undefined && row.desconto_usd !== null
        ? Number(row.desconto_usd)
        : null,
  }))
}

function restoreStagingRowFields(row) {
  const brutos = row.dados_brutos ?? {}
  return {
    ...row,
    nome: row.nome || brutos._produto || '',
    referencia_complementar:
      row.referencia_complementar ||
      row.sku_fornecedor ||
      brutos._referencia_complementar ||
      '',
    estado: row.estado ?? '',
    classe: row.classe ?? 'Convencional',
    desconto_usd:
      row.desconto_usd !== undefined && row.desconto_usd !== null
        ? Number(row.desconto_usd)
        : null,
  }
}

function buildLoteMetadataInsert({
  moedaDetectada,
  dataValidade,
  quarterCalculado,
  metadataPlanilha,
}) {
  return {
    moeda_detectada: moedaDetectada,
    data_validade: dataValidade || null,
    quarter_calculado: quarterCalculado,
    metadata_planilha: metadataPlanilha ?? {},
  }
}

export async function fetchFornecedoresAtivos() {
  const { data, error } = await supabase
    .from('fornecedores')
    .select('id, nome, ativo')
    .eq('ativo', true)
    .order('nome', { ascending: true })

  if (error) return { ok: false, error: error.message }
  return { ok: true, rows: data ?? [] }
}

export async function fetchFornecedores() {
  const { data, error } = await supabase
    .from('fornecedores')
    .select('id, nome, ativo, created_at')
    .order('nome', { ascending: true })

  if (error) return { ok: false, error: error.message }
  return { ok: true, rows: data ?? [] }
}

export async function fetchFornecedorById(id) {
  if (!id) return { ok: false, error: 'Fornecedor não informado.' }

  const { data, error } = await supabase
    .from('fornecedores')
    .select('id, nome, ativo, created_at')
    .eq('id', id)
    .maybeSingle()

  if (error) return { ok: false, error: error.message }
  if (!data) return { ok: false, error: 'Fornecedor não encontrado.' }
  return { ok: true, row: data }
}

export async function criarFornecedor(nome) {
  const nomeLimpo = String(nome ?? '').trim()
  if (!nomeLimpo) {
    return { ok: false, error: 'Informe o nome do fornecedor.' }
  }

  const { data, error } = await supabase
    .from('fornecedores')
    .insert({ nome: nomeLimpo, ativo: true })
    .select('id, nome, ativo')
    .single()

  if (error) {
    const message =
      error.code === '23505'
        ? 'Já existe um fornecedor com esse nome.'
        : error.message
    return { ok: false, error: message }
  }

  return { ok: true, row: data }
}

/**
 * Busca fornecedor por nome (case-insensitive) ou cria um novo ativo.
 */
export async function lookupOrCreateFornecedor(nome) {
  const nomeLimpo = String(nome ?? '').trim()
  if (!nomeLimpo) {
    return { ok: false, error: 'Fornecedor não detectado na planilha.' }
  }

  const { data: existing, error: searchError } = await supabase
    .from('fornecedores')
    .select('id, nome, ativo')
    .ilike('nome', nomeLimpo)
    .maybeSingle()

  if (searchError) {
    return { ok: false, error: searchError.message }
  }

  if (existing) {
    return { ok: true, row: existing, created: false }
  }

  const created = await criarFornecedor(nomeLimpo)
  if (!created.ok) return created
  return { ok: true, row: created.row, created: true }
}

export async function deleteFornecedor(id) {
  if (!id) return { ok: false, error: 'Fornecedor não informado.' }

  const [prodRes, loteRes] = await Promise.all([
    supabase
      .from('produtos_oficiais')
      .select('id', { count: 'exact', head: true })
      .eq('fornecedor_id', id),
    supabase
      .from('lotes_importacao')
      .select('id', { count: 'exact', head: true })
      .eq('fornecedor_id', id),
  ])

  if (prodRes.error) {
    return { ok: false, error: formatSupabaseError(prodRes.error) }
  }
  if (loteRes.error) {
    return { ok: false, error: formatSupabaseError(loteRes.error) }
  }

  const prodCount = prodRes.count ?? 0
  const loteCount = loteRes.count ?? 0

  if (prodCount > 0 || loteCount > 0) {
    const parts = []
    if (prodCount > 0) {
      parts.push(
        `${prodCount} produto${prodCount === 1 ? '' : 's'} no catálogo`,
      )
    }
    if (loteCount > 0) {
      parts.push(
        `${loteCount} lote${loteCount === 1 ? '' : 's'} de importação`,
      )
    }
    return {
      ok: false,
      error: `Não é possível excluir: este fornecedor possui ${parts.join(' e ')} vinculado(s).`,
    }
  }

  const { error } = await supabase.from('fornecedores').delete().eq('id', id)

  if (error) {
    return {
      ok: false,
      error:
        error.code === '23503'
          ? 'Não é possível excluir: este fornecedor possui registros vinculados.'
          : formatSupabaseError(error),
    }
  }

  return { ok: true }
}

export async function fetchLotesRecentes(limit = 12) {
  const { data, error } = await supabase
    .from('lotes_importacao')
    .select(
      `
      id,
      status,
      data_upload,
      fornecedor_id,
      fornecedores ( nome )
    `,
    )
    .order('data_upload', { ascending: false })
    .limit(limit)

  if (error) return { ok: false, error: error.message }

  const rows = (data ?? []).map((row) => {
    const rawFornecedor = row.fornecedores
    const fornecedor =
      Array.isArray(rawFornecedor) ? rawFornecedor[0] : rawFornecedor
    return {
      id: row.id,
      status: row.status,
      data_upload: row.data_upload,
      fornecedor_id: row.fornecedor_id,
      fornecedor_nome: fornecedor?.nome ?? '—',
    }
  })

  return { ok: true, rows }
}

export async function fetchLotesList(params = {}) {
  const page = Math.max(1, params.page ?? 1)
  const pageSize = Math.min(100, Math.max(10, params.pageSize ?? 50))
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  let q = supabase
    .from('lotes_importacao')
    .select(
      `
      id,
      status,
      data_upload,
      fornecedor_id,
      moeda_detectada,
      data_validade,
      quarter_calculado,
      desconto_usd,
      estado_padrao,
      ativo,
      fornecedores ( nome ),
      produtos_oficiais ( count )
    `,
      { count: 'exact' },
    )
    .eq('status', 'concluido')
    .order('data_upload', { ascending: false })
    .range(from, to)

  if (params.ativo === true || params.ativo === false) {
    q = q.eq('ativo', params.ativo)
  }

  if (params.fornecedorId) {
    q = q.eq('fornecedor_id', params.fornecedorId)
  }

  const quarter = (params.quarter ?? '').trim()
  if (quarter) {
    q = q.ilike('quarter_calculado', `%${quarter}%`)
  }

  const search = (params.search ?? '').trim()
  if (search) {
    const term = `%${search}%`
    q = q.or(
      `quarter_calculado.ilike.${term},estado_padrao.ilike.${term}`,
    )
  }

  const { data, error, count } = await q
  if (error) return { ok: false, error: formatSupabaseError(error) }

  const rows = (data ?? []).map((row) => {
    const rawFornecedor = row.fornecedores
    const fornecedor = Array.isArray(rawFornecedor)
      ? rawFornecedor[0]
      : rawFornecedor
    const countRow = Array.isArray(row.produtos_oficiais)
      ? row.produtos_oficiais[0]
      : row.produtos_oficiais
    return {
      id: row.id,
      status: row.status,
      data_upload: row.data_upload,
      fornecedor_id: row.fornecedor_id,
      fornecedor_nome: fornecedor?.nome ?? '—',
      moeda_detectada: row.moeda_detectada ?? 'USD',
      data_validade: row.data_validade ?? '',
      quarter_calculado: row.quarter_calculado ?? '',
      desconto_usd: Number(row.desconto_usd ?? 0),
      estado_padrao: row.estado_padrao ?? '',
      ativo: row.ativo ?? true,
      produtos_count: Number(countRow?.count ?? 0),
    }
  })

  return { ok: true, rows, total: count ?? 0 }
}

export async function fetchLotesTotalCount({ ativo } = {}) {
  let q = supabase
    .from('lotes_importacao')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'concluido')

  if (ativo === true || ativo === false) {
    q = q.eq('ativo', ativo)
  }

  const { count, error } = await q
  if (error) return { ok: false, error: error.message }
  return { ok: true, total: count ?? 0 }
}

export async function fetchLoteById(loteId) {
  if (!loteId) return { ok: false, error: 'Lote não informado.' }

  const { data, error } = await supabase
    .from('lotes_importacao')
    .select(LOTE_DETAIL_SELECT)
    .eq('id', loteId)
    .maybeSingle()

  if (error) return { ok: false, error: formatSupabaseError(error) }
  if (!data) return { ok: false, error: 'Lote não encontrado.' }

  const rawFornecedor = data.fornecedores
  const fornecedor = Array.isArray(rawFornecedor)
    ? rawFornecedor[0]
    : rawFornecedor

  return {
    ok: true,
    row: {
      id: data.id,
      status: data.status,
      data_upload: data.data_upload,
      fornecedor_id: data.fornecedor_id,
      moeda_detectada: data.moeda_detectada ?? 'USD',
      data_validade: data.data_validade ?? '',
      quarter_calculado: data.quarter_calculado ?? '',
      desconto_usd: Number(data.desconto_usd ?? 0),
      estado_padrao: data.estado_padrao ?? '',
      ativo: data.ativo ?? true,
      metadata_planilha: data.metadata_planilha ?? {},
      fornecedor_nome: fornecedor?.nome ?? '—',
    },
  }
}

export async function updateLoteMetadata(loteId, patch) {
  const payload = {}
  if (patch.data_validade !== undefined) {
    payload.data_validade = patch.data_validade || null
    if (patch.data_validade && patch.quarter_calculado === undefined) {
      const d = new Date(`${patch.data_validade}T12:00:00`)
      payload.quarter_calculado = dateToQuarter(d)
    }
  }
  if (patch.quarter_calculado !== undefined) {
    payload.quarter_calculado = String(patch.quarter_calculado).trim()
  }
  if (patch.desconto_usd !== undefined) {
    payload.desconto_usd = Math.max(0, Number(patch.desconto_usd) || 0)
  }
  if (patch.estado_padrao !== undefined) {
    payload.estado_padrao = patch.estado_padrao || null
  }

  const { data, error } = await supabase
    .from('lotes_importacao')
    .update(payload)
    .eq('id', loteId)
    .select(
      'id, moeda_detectada, data_validade, quarter_calculado, desconto_usd, estado_padrao, ativo, metadata_planilha',
    )
    .single()

  if (error) return { ok: false, error: formatSupabaseError(error) }

  if (patch.estado_padrao !== undefined && patch.estado_padrao) {
    const bulkRes = await bulkUpdateStagingEstado(loteId, patch.estado_padrao)
    if (!bulkRes.ok) return bulkRes
  }

  if (patch.desconto_usd !== undefined) {
    const bulkRes = await bulkUpdateStagingDescontoUsd(
      loteId,
      payload.desconto_usd ?? 0,
    )
    if (!bulkRes.ok) return bulkRes
  }

  return { ok: true, row: data }
}

export async function bulkUpdateStagingEstado(loteId, estado, rowIds = null) {
  const estadoTrim = String(estado ?? '').trim()
  if (!['MG', 'SP'].includes(estadoTrim)) {
    return { ok: false, error: 'Informe o estado (MG ou SP).' }
  }

  let q = supabase
    .from('produtos_staging')
    .update({ estado: estadoTrim })
    .eq('lote_id', loteId)

  if (Array.isArray(rowIds) && rowIds.length > 0) {
    q = q.in('id', rowIds)
  }

  const { error } = await q
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function bulkUpdateStagingClasse(loteId, classe, rowIds = null) {
  const classeTrim = String(classe ?? '').trim()
  if (!['Convencional', 'Especial'].includes(classeTrim)) {
    return { ok: false, error: 'Informe a classe (Convencional ou Especial).' }
  }

  let q = supabase
    .from('produtos_staging')
    .update({ classe: classeTrim })
    .eq('lote_id', loteId)

  if (Array.isArray(rowIds) && rowIds.length > 0) {
    q = q.in('id', rowIds)
  }

  const { error } = await q
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function bulkUpdateStagingDescontoUsd(
  loteId,
  desconto,
  rowIds = null,
) {
  const descontoVal = Math.max(0, Number(desconto) || 0)

  let q = supabase
    .from('produtos_staging')
    .update({ desconto_usd: descontoVal })
    .eq('lote_id', loteId)

  if (Array.isArray(rowIds) && rowIds.length > 0) {
    q = q.in('id', rowIds)
  }

  const { error } = await q
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function fetchStagingByLote(loteId) {
  if (!loteId) return { ok: true, rows: [] }

  const { data, error } = await supabase
    .from('produtos_staging')
    .select(STAGING_ROW_FIELDS)
    .eq('lote_id', loteId)
    .order('created_at', { ascending: true })

  if (error) return { ok: false, error: formatSupabaseError(error) }
  const rows = (data ?? []).map((row) => restoreStagingRowFields(row))
  return { ok: true, rows }
}

function mapRowToStagingPayload({
  loteId,
  columnMappings,
  row,
  loteMoeda = 'USD',
  loteQuarter = '',
  loteEstado = '',
  loteClasse = 'Convencional',
  loteDescontoUsd = 0,
}) {
  const dados_brutos = {}
  const mapped = {}
  const precoIdx = getMappedColumnIndex(columnMappings, 'preco_custo')

  for (const map of columnMappings) {
    const raw = row[map.sourceIndex]
    const value = raw === null || raw === undefined ? '' : String(raw).trim()
    dados_brutos[map.sourceLabel] = value
    if (map.target && map.target !== IGNORE_COLUMN_VALUE) {
      mapped[map.target] = value
    }
  }

  const fertilizante = String(mapped.produto ?? '').trim()
  const referencia = String(mapped.referencia_complementar ?? '').trim()
  const codigoProduto = String(mapped.codigo_produto ?? '').trim()
  const precoRaw =
    precoIdx !== undefined ? row[precoIdx] : mapped.preco_custo

  return {
    lote_id: loteId,
    sku_fornecedor: codigoProduto || referencia,
    nome: fertilizante,
    referencia_complementar: referencia,
    estado: loteEstado,
    classe: loteClasse,
    quarter: loteQuarter,
    desconto_usd: Math.max(0, Number(loteDescontoUsd) || 0),
    dados_brutos: {
      ...dados_brutos,
      _produto: fertilizante,
      _referencia_complementar: referencia,
      _codigo_produto: codigoProduto,
    },
    preco_original: parsePrecoValue(precoRaw) ?? 0,
    moeda: loteMoeda.toUpperCase().slice(0, 8),
    status_linha: 'novo',
  }
}

/**
 * Constrói as linhas de produtos_staging a partir dos mapeamentos De-Para.
 */
function getMappedColumnIndex(columnMappings, target) {
  const map = columnMappings.find((m) => m.target === target)
  return map?.sourceIndex
}

function buildStagingRows({
  loteId,
  columnMappings,
  dataRows,
  loteMoeda = 'USD',
  loteQuarter = '',
  loteEstado = '',
  loteClasse = 'Convencional',
  loteDescontoUsd = 0,
}) {
  const prodIdx = getMappedColumnIndex(columnMappings, 'produto')
  const precoIdx = getMappedColumnIndex(columnMappings, 'preco_custo')

  const filteredRows = dataRows.filter((row) => {
    if (prodIdx !== undefined && !isValidFertilizante(row[prodIdx])) return false
    if (precoIdx !== undefined) {
      const preco = parsePrecoValue(row[precoIdx])
      if (preco === null) return false
    }
    return true
  })

  return filteredRows.map((row) =>
    mapRowToStagingPayload({
      loteId,
      columnMappings,
      row,
      loteMoeda,
      loteQuarter,
      loteEstado,
      loteClasse,
      loteDescontoUsd,
    }),
  )
}

export function getStagingRowErrors(
  row,
  { identityCounts, loteEstadoPadrao, loteDescontoUsd } = {},
) {
  const errors = []

  if (!isValidFertilizante(row.nome)) {
    errors.push('Fertilizante inválido ou ausente')
  }

  const preco = Number(row.preco_original)
  if (!Number.isFinite(preco) || preco < 0) {
    errors.push('Preço de custo inválido')
  }

  const desconto = effectiveStagingDescontoUsd(row, loteDescontoUsd)
  if (Number.isFinite(preco) && preco - desconto < 0) {
    errors.push('Desconto USD maior que o preço de custo')
  }

  const estado =
    String(row.estado ?? '').trim() || String(loteEstadoPadrao ?? '').trim()
  if (!['MG', 'SP'].includes(estado)) {
    errors.push('Estado (MG ou SP) não informado')
  }

  const identityKey = stagingRowIdentityKey(row)
  if (identityKey && identityCounts && (identityCounts.get(identityKey) ?? 0) > 1) {
    errors.push('Produto repetido neste lote (mesmo código ou fertilizante + referência)')
  }

  return errors
}

function effectiveStagingDescontoUsd(row, loteDescontoUsd) {
  if (row.desconto_usd !== undefined && row.desconto_usd !== null) {
    return Number(row.desconto_usd)
  }
  return Number(loteDescontoUsd ?? 0)
}

function extractStagingProductCode(row) {
  const brutos = row.dados_brutos ?? {}
  const candidates = [brutos._codigo_produto, brutos.Produto, row.sku_fornecedor]
  for (const value of candidates) {
    const digits = String(value ?? '').replace(/\D/g, '')
    if (/^\d{8,}$/.test(digits)) return digits
  }
  return ''
}

export function stagingRowIdentityKey(row) {
  const codigo = extractStagingProductCode(row)
  if (codigo) return `codigo:${codigo}`

  const ref = String(row.referencia_complementar ?? '').trim().toLowerCase()
  const nome = normalizeFertilizante(row.nome)
  if (!nome) return ''
  return `${nome}|${ref}`
}

export function buildStagingIdentityCounts(stagingRows) {
  const counts = new Map()
  for (const row of stagingRows) {
    const key = stagingRowIdentityKey(row)
    if (!key) continue
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return counts
}

/** @deprecated Use buildStagingIdentityCounts */
export function buildStagingNomeCounts(stagingRows) {
  return buildStagingIdentityCounts(stagingRows)
}

export function validateStagingRowFields(row) {
  return getStagingRowErrors(row).map((msg) => {
    if (msg.startsWith('Fertilizante')) return 'Fertilizante'
    if (msg.startsWith('Preço')) return 'Preço de custo'
    return msg
  })
}

/**
 * Calcula status_linha para cada row com base no catálogo oficial.
 */
export async function computeStagingMatch(
  fornecedorId,
  stagingRows,
  { loteEstadoPadrao = '', loteDescontoUsd = 0 } = {},
) {
  if (!fornecedorId || stagingRows.length === 0) {
    return {
      ok: true,
      rows: stagingRows.map((r) => ({ ...r, status_linha: 'novo' })),
      summary: { novos: 0, atualizacoes: 0, erros: 0 },
    }
  }

  const { data: oficiais, error } = await supabase
    .from('produtos_oficiais')
    .select('id, nome, quarter')
    .eq('fornecedor_id', fornecedorId)

  if (error) return { ok: false, error: error.message }

  const catalogByNomeQuarter = new Map()
  for (const p of oficiais ?? []) {
    const key = `${normalizeFertilizante(p.nome)}|${String(p.quarter ?? '')
      .trim()
      .toLowerCase()}`
    catalogByNomeQuarter.set(key, p.id)
  }

  const identityCounts = buildStagingIdentityCounts(stagingRows)
  const matchContext = { identityCounts, loteEstadoPadrao, loteDescontoUsd }

  let novos = 0
  let atualizacoes = 0
  let erros = 0

  const rows = stagingRows.map((row) => {
    const rowErrors = getStagingRowErrors(row, matchContext)

    let status_linha = 'novo'
    if (rowErrors.length > 0) {
      status_linha = 'erro'
      erros += 1
    } else {
      const matchKey = `${normalizeFertilizante(row.nome)}|${String(
        row.quarter ?? '',
      )
        .trim()
        .toLowerCase()}`
      if (catalogByNomeQuarter.has(matchKey)) {
        status_linha = 'atualizacao'
        atualizacoes += 1
      } else {
        novos += 1
      }
    }

    return { ...row, status_linha, staging_erros: rowErrors }
  })

  return {
    ok: true,
    rows,
    summary: { novos, atualizacoes, erros },
  }
}

export async function applyStagingMatchToLote(loteId, fornecedorId) {
  const stagingRes = await fetchStagingByLote(loteId)
  if (!stagingRes.ok) return stagingRes

  const loteRes = await fetchLoteById(loteId)
  const matchContext = loteRes.ok
    ? {
        loteEstadoPadrao: loteRes.row.estado_padrao ?? '',
        loteDescontoUsd: loteRes.row.desconto_usd ?? 0,
      }
    : {}

  const matchRes = await computeStagingMatch(
    fornecedorId,
    stagingRes.rows,
    matchContext,
  )
  if (!matchRes.ok) return matchRes

  const byStatus = new Map()
  for (const row of matchRes.rows) {
    const list = byStatus.get(row.status_linha) ?? []
    list.push(row.id)
    byStatus.set(row.status_linha, list)
  }

  for (const [status, ids] of byStatus.entries()) {
    if (ids.length === 0) continue
    const { error } = await supabase
      .from('produtos_staging')
      .update({ status_linha: status })
      .in('id', ids)

    if (error) return { ok: false, error: error.message }
  }

  return { ok: true, rows: matchRes.rows, summary: matchRes.summary }
}

export async function updateStagingRow(id, patch) {
  const payload = {}
  if (patch.sku_fornecedor !== undefined) {
    payload.sku_fornecedor = String(patch.sku_fornecedor).trim()
  }
  if (patch.referencia_complementar !== undefined) {
    payload.referencia_complementar = String(patch.referencia_complementar).trim()
    payload.sku_fornecedor = payload.referencia_complementar
  }
  if (patch.nome !== undefined) {
    payload.nome = String(patch.nome).trim()
  }
  if (patch.estado !== undefined) {
    payload.estado = normalizeEstado(patch.estado)
  }
  if (patch.classe !== undefined) {
    payload.classe = String(patch.classe).trim()
  }
  if (patch.quarter !== undefined) {
    payload.quarter = String(patch.quarter).trim()
  }
  if (patch.preco_original !== undefined) {
    payload.preco_original = Number(patch.preco_original)
  }
  if (patch.desconto_usd !== undefined) {
    payload.desconto_usd = Math.max(0, Number(patch.desconto_usd) || 0)
  }
  if (patch.moeda !== undefined) {
    payload.moeda = String(patch.moeda).toUpperCase().slice(0, 8)
  }
  if (patch.status_linha !== undefined) payload.status_linha = patch.status_linha

  const selectFields = STAGING_ROW_FIELDS.replace(', dados_brutos', '')

  const { data, error } = await supabase
    .from('produtos_staging')
    .update(payload)
    .eq('id', id)
    .select(selectFields)
    .single()

  if (error) return { ok: false, error: formatSupabaseError(error) }
  return { ok: true, row: restoreStagingRowFields(data) }
}

export async function createStagingRow(loteId, payload) {
  const nome = String(payload.nome ?? '').trim()
  if (!isValidFertilizante(nome)) {
    return { ok: false, error: 'Informe o fertilizante.' }
  }

  const estado = normalizeEstado(payload.estado)
  if (!estado) {
    return { ok: false, error: 'Selecione o estado (MG ou SP).' }
  }

  const preco = Number(payload.preco_original ?? 0)
  if (!Number.isFinite(preco) || preco < 0) {
    return { ok: false, error: 'Informe um preço de custo válido.' }
  }

  const desconto =
    payload.desconto_usd !== undefined && payload.desconto_usd !== null
      ? Math.max(0, Number(payload.desconto_usd) || 0)
      : null
  if (desconto !== null && preco - desconto < 0) {
    return {
      ok: false,
      error: 'Desconto USD não pode ser maior que o preço de custo.',
    }
  }

  const row = {
    lote_id: loteId,
    sku_fornecedor: String(
      payload.referencia_complementar ?? payload.sku_fornecedor ?? '',
    ).trim(),
    nome,
    referencia_complementar: String(
      payload.referencia_complementar ?? payload.sku_fornecedor ?? '',
    ).trim(),
    estado,
    classe: String(payload.classe ?? 'Convencional').trim() || 'Convencional',
    quarter: String(payload.quarter ?? '').trim(),
    preco_original: preco,
    moeda: String(payload.moeda ?? 'USD').toUpperCase().slice(0, 8),
    desconto_usd: desconto,
    dados_brutos: {
      ...(payload.dados_brutos ?? {}),
      _produto: nome,
      _referencia_complementar: String(
        payload.referencia_complementar ?? payload.sku_fornecedor ?? '',
      ).trim(),
    },
    status_linha: 'novo',
  }

  const insertRow = prepareStagingInsertRows([row])[0]
  const selectFields = STAGING_ROW_FIELDS.replace(', dados_brutos', '')

  const { data, error } = await supabase
    .from('produtos_staging')
    .insert(insertRow)
    .select(selectFields)
    .single()

  if (error) return { ok: false, error: formatSupabaseError(error) }
  return { ok: true, row: restoreStagingRowFields(data) }
}

export async function deleteStagingRow(id) {
  const { error } = await supabase.from('produtos_staging').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function promoverLote(loteId) {
  const { data, error } = await supabase.rpc('promover_lote_importacao', {
    p_lote_id: loteId,
  })

  if (error) return { ok: false, error: error.message }
  return { ok: true, result: data }
}

export async function fetchProdutosOficiaisByFornecedor(fornecedorId) {
  if (!fornecedorId) return { ok: true, rows: [] }

  const { data, error } = await supabase
    .from('produtos_oficiais')
    .select(
      'id, fornecedor_id, sku_fornecedor, nome, referencia_complementar, estado, classe, quarter, moeda_origem, preco_original, desconto_usd, preco_interno_calculado, custo_icms, lote_id, vencimento_lista, ativo',
    )
    .eq('fornecedor_id', fornecedorId)
    .order('nome', { ascending: true })

  if (error) return { ok: false, error: error.message }
  return { ok: true, rows: data ?? [] }
}

const PRODUTO_SELECT_FIELDS =
  'id, fornecedor_id, sku_fornecedor, nome, referencia_complementar, estado, classe, quarter, moeda_origem, preco_original, desconto_usd, preco_interno_calculado, custo_icms, ativo'

export async function fetchProdutosTotalCount({ ativo } = {}) {
  let q = supabase
    .from('produtos_oficiais')
    .select('id', { count: 'exact', head: true })

  if (ativo === true || ativo === false) {
    q = q.eq('ativo', ativo)
  }

  const { count, error } = await q
  if (error) return { ok: false, error: error.message }
  return { ok: true, total: count ?? 0 }
}

export async function fetchProdutosList(params = {}) {
  const page = Math.max(1, params.page ?? 1)
  const pageSize = Math.min(100, Math.max(10, params.pageSize ?? 50))
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  let q = supabase
    .from('produtos_oficiais')
    .select(PRODUTO_LIST_FIELDS, { count: 'exact' })
    .order('nome', { ascending: true })
    .range(from, to)

  const search = (params.search ?? '').trim()
  if (search) {
    const term = `%${search}%`
    q = q.or(
      `nome.ilike.${term},sku_fornecedor.ilike.${term},referencia_complementar.ilike.${term},quarter.ilike.${term}`,
    )
  }

  if (params.fornecedorId) {
    q = q.eq('fornecedor_id', params.fornecedorId)
  }

  if (params.estado) {
    q = q.eq('estado', params.estado)
  }

  if (params.classe) {
    q = q.eq('classe', params.classe)
  }

  if (params.loteId) {
    q = q.eq('lote_id', params.loteId)
  }

  if (params.ativo === true || params.ativo === false) {
    q = q.eq('ativo', params.ativo)
  }

  const { data, error, count } = await q
  if (error) return { ok: false, error: formatSupabaseError(error) }

  const rows = (data ?? []).map((row) => {
    const rawLote = row.lotes_importacao
    const lote = Array.isArray(rawLote) ? rawLote[0] : rawLote
    return {
      ...row,
      referencia_complementar: row.referencia_complementar ?? row.sku_fornecedor ?? '',
      fornecedor_nome: row.fornecedores?.nome ?? '—',
      lista_id: lote?.id ?? row.lote_id ?? null,
      lista_quarter: lote?.quarter_calculado ?? row.quarter ?? '',
      lista_validade: lote?.data_validade ?? row.vencimento_lista ?? '',
      lista_ativa: lote?.ativo ?? null,
    }
  })

  return { ok: true, rows, total: count ?? 0 }
}

export async function fetchHistoricoPrecos(produtoId, limit = 20) {
  if (!produtoId) return { ok: true, rows: [] }

  const { data, error } = await supabase
    .from('produtos_oficiais_historico')
    .select(
      'id, produto_oficial_id, quarter, moeda_origem, preco_original, preco_interno_calculado, lancado_em, lote_id',
    )
    .eq('produto_oficial_id', produtoId)
    .order('lancado_em', { ascending: false })
    .limit(limit)

  if (error) return { ok: false, error: error.message }
  return { ok: true, rows: data ?? [] }
}

async function getTaxaConversao(moeda) {
  const moedaUpper = String(moeda ?? 'BRL').toUpperCase().trim()
  if (moedaUpper === 'BRL') return 1

  const { data, error } = await supabase
    .from('cotacoes_moeda')
    .select('taxa_conversao')
    .eq('moeda_origem', moedaUpper)
    .order('data_vigencia', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !data) return null
  return Number(data.taxa_conversao)
}

export async function upsertProdutoOficialManual({
  fornecedorId,
  id,
  sku_fornecedor,
  referencia_complementar,
  nome,
  estado,
  classe,
  quarter,
  moeda_origem,
  preco_original,
  desconto_usd = 0,
  ativo = true,
}) {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession()

  if (sessionError || !session?.user) {
    return { ok: false, error: 'Sessão expirada. Faça login novamente.' }
  }

  const fertilizante = String(nome ?? '').trim()
  if (!isValidFertilizante(fertilizante)) {
    return { ok: false, error: 'Informe o fertilizante.' }
  }

  const quarterVal = String(quarter ?? '').trim()
  if (!quarterVal) {
    return { ok: false, error: 'Informe o quarter.' }
  }

  const estadoVal = String(estado ?? '').trim().toUpperCase()
  if (!['MG', 'SP'].includes(estadoVal)) {
    return { ok: false, error: 'Selecione o estado (MG ou SP).' }
  }

  const referencia = String(
    referencia_complementar ?? sku_fornecedor ?? '',
  ).trim()
  const moeda = String(moeda_origem ?? 'USD').toUpperCase().slice(0, 8)
  const preco = Number(preco_original ?? 0)
  if (!Number.isFinite(preco) || preco < 0) {
    return { ok: false, error: 'Informe um preço de custo válido.' }
  }

  const desconto = Math.max(0, Number(desconto_usd ?? 0))
  if (!Number.isFinite(desconto)) {
    return { ok: false, error: 'Informe um desconto USD válido.' }
  }
  if (preco - desconto < 0) {
    return {
      ok: false,
      error: 'Desconto USD não pode ser maior que o preço de custo.',
    }
  }

  const taxa = await getTaxaConversao(moeda)
  if (taxa === null) {
    return {
      ok: false,
      error: `Cotação não encontrada para moeda ${moeda}. Cadastre em Parâmetros.`,
    }
  }
  const preco_interno_calculado = calcCustoBrlComDesconto(preco, desconto, taxa)

  const payload = {
    fornecedor_id: fornecedorId,
    sku_fornecedor: referencia || fertilizante,
    nome: fertilizante,
    referencia_complementar: referencia,
    estado: estadoVal,
    classe: String(classe ?? 'Convencional').trim() || 'Convencional',
    quarter: quarterVal,
    moeda_origem: moeda,
    preco_original: preco,
    desconto_usd: desconto,
    preco_interno_calculado,
    ativo,
  }

  const selectFields = PRODUTO_SELECT_FIELDS

  if (id) {
    const { data, error } = await supabase
      .from('produtos_oficiais')
      .update(payload)
      .eq('id', id)
      .select(selectFields)
      .single()

    if (error) return { ok: false, error: formatSupabaseError(error) }

    await supabase.from('produtos_oficiais_historico').insert({
      produto_oficial_id: data.id,
      quarter: payload.quarter,
      moeda_origem: payload.moeda_origem,
      preco_original: payload.preco_original,
      desconto_usd: payload.desconto_usd,
      preco_interno_calculado: payload.preco_interno_calculado,
      criado_por: session.user.id,
    })

    return { ok: true, row: data }
  }

  const { data, error } = await supabase
    .from('produtos_oficiais')
    .insert(payload)
    .select(selectFields)
    .single()

  if (error) {
    const message =
      error.code === '23505'
        ? 'Já existe um produto com esse fertilizante e quarter para este fornecedor.'
        : formatSupabaseError(error)
    return { ok: false, error: message }
  }

  await supabase.from('produtos_oficiais_historico').insert({
    produto_oficial_id: data.id,
    quarter: payload.quarter,
    moeda_origem: payload.moeda_origem,
    preco_original: payload.preco_original,
    desconto_usd: payload.desconto_usd,
    preco_interno_calculado: payload.preco_interno_calculado,
    criado_por: session.user.id,
  })

  return { ok: true, row: data }
}

export async function inativarListaImportacao(loteId) {
  const { data, error } = await supabase.rpc('inativar_lista_importacao', {
    p_lote_id: loteId,
  })
  if (error) return { ok: false, error: error.message }
  return { ok: true, result: data }
}

export async function excluirListaImportacao(loteId) {
  if (!loteId) return { ok: false, error: 'Lista de produtos não informada.' }

  const { data, error } = await supabase.rpc('excluir_lista_importacao', {
    p_lote_id: loteId,
  })

  if (error) {
    return {
      ok: false,
      error:
        error.code === '23503'
          ? 'Não é possível excluir: esta lista de produtos possui registros vinculados. Inative a lista em vez de excluir.'
          : formatSupabaseError(error),
    }
  }

  return { ok: true, result: data }
}

export async function reativarListaImportacao(loteId) {
  const { data, error } = await supabase.rpc('reativar_lista_importacao', {
    p_lote_id: loteId,
  })
  if (error) return { ok: false, error: error.message }
  return { ok: true, result: data }
}

export async function reativarProdutoOficial(id) {
  const { data, error } = await supabase
    .from('produtos_oficiais')
    .update({ ativo: true })
    .eq('id', id)
    .select('id, ativo')
    .single()

  if (error) return { ok: false, error: error.message }
  return { ok: true, row: data }
}

export async function inativarProdutoOficial(id) {
  const { data, error } = await supabase
    .from('produtos_oficiais')
    .update({ ativo: false })
    .eq('id', id)
    .select('id, ativo')
    .single()

  if (error) return { ok: false, error: error.message }
  return { ok: true, row: data }
}

// --- Cotacoes ---

export async function fetchCotacoesRecentes(limit = 50) {
  const { data, error } = await supabase
    .from('cotacoes_moeda')
    .select('id, moeda_origem, taxa_conversao, data_vigencia, created_at')
    .order('data_vigencia', { ascending: false })
    .limit(limit)

  if (error) return { ok: false, error: error.message }
  return { ok: true, rows: data ?? [] }
}

export async function criarCotacao({ moeda_origem, taxa_conversao }) {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession()

  if (sessionError || !session?.user) {
    return { ok: false, error: 'Sessão expirada. Faça login novamente.' }
  }

  const moeda = String(moeda_origem ?? '').toUpperCase().trim()
  const taxa = Number(taxa_conversao)

  if (!moeda) return { ok: false, error: 'Informe a moeda.' }
  if (moeda !== 'USD') {
    return {
      ok: false,
      error: 'Apenas a cotação do dólar (USD) é aceita em Parâmetros.',
    }
  }
  if (!Number.isFinite(taxa) || taxa <= 0) {
    return { ok: false, error: 'Informe uma taxa válida maior que zero.' }
  }

  const { data, error } = await supabase
    .from('cotacoes_moeda')
    .insert({
      moeda_origem: moeda,
      taxa_conversao: taxa,
      criado_por: session.user.id,
    })
    .select('id, moeda_origem, taxa_conversao, data_vigencia')
    .single()

  if (error) return { ok: false, error: error.message }
  return { ok: true, row: data }
}

/**
 * Processa planilha com mapeamento automático (sem template salvo).
 * Aceita `dataRowsOverride` para lançar só um subconjunto (ex.: um quarter Cibra).
 */
export async function processLoteAuto({
  fornecedorId,
  columnMappings,
  file,
  parseOptions = {},
  dataRowsOverride,
}) {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession()

  if (sessionError || !session?.user) {
    return { ok: false, error: 'Sessão expirada. Faça login novamente.' }
  }

  if (!fornecedorId) {
    return { ok: false, error: 'Fornecedor não informado.' }
  }

  const mappings = Array.isArray(columnMappings) ? columnMappings : []
  if (mappings.length === 0) {
    return { ok: false, error: 'Mapeamento de colunas inválido.' }
  }

  const hasProduto = mappings.some((m) => m.target === 'produto')
  const hasPreco = mappings.some((m) => m.target === 'preco_custo')
  if (!hasProduto || !hasPreco) {
    return {
      ok: false,
      error: 'Mapeamento incompleto: informe colunas de Fertilizante e Preço de custo.',
    }
  }

  const { parseSpreadsheetFile } = await import('../utils/spreadsheetParser')
  const parsed = await parseSpreadsheetFile(file, {
    ...parseOptions,
    columnMappings: mappings,
  })
  if (!parsed.ok) {
    return { ok: false, error: parsed.error }
  }

  const moedaDetectada = 'USD'
  const dataValidade = parseOptions.dataValidade ?? parsed.dataValidade ?? null
  const quarterCalculado =
    parseOptions.quarterCalculado ?? parsed.quarterCalculado ?? ''
  const dataRows = Array.isArray(dataRowsOverride)
    ? dataRowsOverride
    : parsed.dataRows

  const loteInsert = {
    usuario_id: session.user.id,
    fornecedor_id: fornecedorId,
    status: 'processando',
    ...buildLoteMetadataInsert({
      moedaDetectada,
      dataValidade,
      quarterCalculado,
      metadataPlanilha: {
        ...(parsed.metadataPlanilha ?? {}),
        ...(parseOptions.metadataPlanilha ?? {}),
      },
    }),
  }

  const { data: loteRow, error: loteError } = await supabase
    .from('lotes_importacao')
    .insert(loteInsert)
    .select('id')
    .single()

  if (loteError || !loteRow) {
    return {
      ok: false,
      error: formatSupabaseError(
        loteError,
        'Não foi possível criar o lote.',
      ),
    }
  }

  const stagingPayload = prepareStagingInsertRows(
    buildStagingRows({
      loteId: loteRow.id,
      columnMappings: mappings,
      dataRows,
      loteMoeda: moedaDetectada,
      loteQuarter: quarterCalculado,
      loteEstado: parseOptions.estadoPadrao ?? '',
      loteClasse: parseOptions.classePadrao ?? 'Convencional',
      loteDescontoUsd: parseOptions.descontoUsd ?? 0,
    }),
  )

  if (stagingPayload.length > 0) {
    const { error: stagingError } = await supabase
      .from('produtos_staging')
      .insert(stagingPayload)

    if (stagingError) {
      return { ok: false, error: formatSupabaseError(stagingError) }
    }

    await applyStagingMatchToLote(loteRow.id, fornecedorId)
  }

  const nextStatus =
    stagingPayload.length > 0 ? 'aguardando_validacao' : 'concluido'

  const { error: statusError } = await supabase
    .from('lotes_importacao')
    .update({ status: nextStatus })
    .eq('id', loteRow.id)

  if (statusError) {
    return { ok: false, error: statusError.message }
  }

  return {
    ok: true,
    loteId: loteRow.id,
    rowsProcessed: stagingPayload.length,
    quarter: quarterCalculado,
    parseResult: parsed,
  }
}

/**
 * Cria um lote independente por grupo de quarter (ex.: Cibra Q3 + Q4).
 */
export async function processLotesPorQuarter({
  fornecedorId,
  columnMappings,
  file,
  parseOptions = {},
  quarterGroups = [],
}) {
  const groups = Array.isArray(quarterGroups) ? quarterGroups : []
  if (groups.length === 0) {
    return processLoteAuto({
      fornecedorId,
      columnMappings,
      file,
      parseOptions,
    })
  }

  const lotes = []
  for (const group of groups) {
    const quarter = String(group.quarter ?? '').trim()
    if (!quarter) {
      return {
        ok: false,
        error: 'Grupo de quarter sem identificação. Revise a planilha.',
      }
    }

    const res = await processLoteAuto({
      fornecedorId,
      columnMappings,
      file,
      parseOptions: {
        ...parseOptions,
        quarterCalculado: quarter,
        dataValidade: group.dataValidade || parseOptions.dataValidade,
        metadataPlanilha: {
          ...(parseOptions.metadataPlanilha ?? {}),
          catalogCode: group.catalogCode ?? '',
          quarterGroup: quarter,
        },
      },
      dataRowsOverride: group.dataRows ?? [],
    })

    if (!res.ok) {
      return {
        ok: false,
        error: `Falha ao criar lote ${quarter}: ${res.error}`,
        lotes,
      }
    }

    lotes.push({
      loteId: res.loteId,
      quarter,
      rowsProcessed: res.rowsProcessed,
      catalogCode: group.catalogCode ?? '',
    })
  }

  return {
    ok: true,
    loteId: lotes[0]?.loteId,
    lotes,
    rowsProcessed: lotes.reduce((sum, l) => sum + (l.rowsProcessed ?? 0), 0),
  }
}
