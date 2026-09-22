import { supabase } from './supabase'
import { formatProdutoDisplayNome } from '../constants/mapeamentoCampos'
import { formatSupabaseError } from '../utils/supabaseErrors'
import { tonsToKg } from '../utils/comprasUnits'
import { calcOcItemValores } from '../utils/comprasPrecos'
import { DEFAULT_TAXA_JUROS } from '../utils/pricingCalculations'
import {
  COMPRAS_EMBALAGEM_DEFAULT,
  COMPRAS_FILIAL_DEFAULT,
  plantaFromFilial,
} from '../constants/compras'
import { agruparLinhasPorFornecedor } from '../utils/comprasOcAgrupamento'

function rewriteComprasError(text) {
  if (!text) return text
  return String(text)
    .replaceAll('Deslastreie', 'Desvincule')
    .replaceAll('deslastrear', 'desvincular')
    .replaceAll('Deslastrear', 'Desvincular')
    .replaceAll('lastreadas', 'vinculadas')
    .replaceAll('Lastreadas', 'Vinculadas')
    .replaceAll('lastreado', 'vinculado')
    .replaceAll('Lastreado', 'Vinculado')
    .replaceAll('lastreie', 'vincule')
    .replaceAll('Lastreie', 'Vincule')
    .replaceAll('lastrear', 'vincular')
    .replaceAll('Lastrear', 'Vincular')
    .replaceAll('lastro', 'vínculo')
    .replaceAll('Lastro', 'Vínculo')
}

function fail(error, fallback) {
  return { ok: false, error: rewriteComprasError(formatSupabaseError(error, fallback)) }
}

function mapProduto(row) {
  if (!row) return null
  const fornecedorNome = row.fornecedores?.nome ?? ''
  return {
    id: row.id,
    nome: row.nome,
    referencia_complementar: row.referencia_complementar,
    fornecedor_id: row.fornecedor_id,
    fornecedor_nome: fornecedorNome,
    estado: row.estado,
    classe: row.classe,
    quarter: row.quarter,
    preco_original: row.preco_original,
    desconto_usd: row.desconto_usd,
    vencimento_lista: row.vencimento_lista,
    taxaJuros: Number(row.taxa_juros ?? DEFAULT_TAXA_JUROS),
    displayNome: formatProdutoDisplayNome({
      nome: row.nome,
      referencia_complementar: row.referencia_complementar,
      fornecedor_nome: fornecedorNome,
    }),
  }
}

export async function fetchFornecedoresAtivos() {
  const { data, error } = await supabase
    .from('fornecedores')
    .select('id, nome, ativo')
    .eq('ativo', true)
    .order('nome')
  if (error) return fail(error, 'Não foi possível carregar fornecedores.')
  return { ok: true, rows: data ?? [] }
}

export async function fetchProdutosPorFornecedor(fornecedorId) {
  if (!fornecedorId) return { ok: true, rows: [] }
  const { data, error } = await supabase
    .from('produtos_oficiais')
    .select(
      'id, nome, referencia_complementar, fornecedor_id, estado, classe, quarter, preco_original, desconto_usd, vencimento_lista, taxa_juros, ativo, fornecedores(nome)',
    )
    .eq('fornecedor_id', fornecedorId)
    .eq('ativo', true)
    .order('nome')
  if (error) return fail(error, 'Não foi possível carregar produtos.')
  return { ok: true, rows: (data ?? []).map(mapProduto) }
}

const DEMANDA_SIM_SELECT = `
  id,
  status,
  ativo,
  fazenda,
  pedido_municipio,
  pedido_uf,
  prazo_semana_inicio,
  observacoes,
  created_at,
  clients ( id, nome, municipio, uf, telefone ),
  simulation_items (
    id,
    product_id,
    volume,
    cultura,
    override_custo_usd,
    override_desconto_usd,
    override_taxa,
    override_vencimento_lista,
    produtos_oficiais (
      id, nome, referencia_complementar, fornecedor_id, estado, classe, quarter,
      preco_original, desconto_usd, vencimento_lista, taxa_juros, fornecedores ( nome )
    )
  )
`

const ALOCACAO_SELECT = `
  id, simulation_item_id, quantidade_kg, origem_tipo, estoque_lote_id, compra_item_id,
  baixa_fisica, created_at,
  estoque_lotes ( id, embalagem, local, quantidade_kg, reservado_kg, origem_tipo ),
  compra_itens (
    id, volume_kg, volume_recebido_kg, embalagem,
    compras ( id, numero, status, data_documento, fornecedores ( nome ) )
  )
`

function mapDemandaLinhas(sims, alocs) {
  const lastreadoByItem = {}
  const alocacoesByItem = {}
  for (const row of alocs ?? []) {
    lastreadoByItem[row.simulation_item_id] =
      (lastreadoByItem[row.simulation_item_id] ?? 0) + Number(row.quantidade_kg)
    if (!alocacoesByItem[row.simulation_item_id]) {
      alocacoesByItem[row.simulation_item_id] = []
    }
    alocacoesByItem[row.simulation_item_id].push(row)
  }

  const rows = []
  for (const sim of sims ?? []) {
    const cliente = sim.clients
    for (const item of sim.simulation_items ?? []) {
      if (!item?.product_id || !item.produtos_oficiais) continue
      const product = mapProduto(item.produtos_oficiais)
      const vendidoKg = tonsToKg(item.volume)
      const lastreadoKg = lastreadoByItem[item.id] ?? 0
      const faltanteKg = Math.max(0, Math.round((vendidoKg - lastreadoKg) * 10000) / 10000)
      rows.push({
        simulationItemId: item.id,
        simulationId: sim.id,
        clienteId: cliente?.id ?? null,
        clienteNome: cliente?.nome ?? '—',
        clienteMunicipio: cliente?.municipio ?? '',
        clienteUf: cliente?.uf ?? '',
        clienteTelefone: cliente?.telefone ?? '',
        fazenda: sim.fazenda ?? '',
        municipio: sim.pedido_municipio ?? '',
        uf: sim.pedido_uf ?? '',
        prazoSemanaInicio: sim.prazo_semana_inicio ?? null,
        observacoes: sim.observacoes ?? '',
        cultura: item.cultura ?? '',
        volumeT: Number(item.volume) || 0,
        vendidoKg,
        lastreadoKg,
        faltanteKg,
        lastroStatus: faltanteKg <= 0.0001 ? 'completo' : lastreadoKg > 0 ? 'parcial' : 'sem',
        product,
        overrideCustoUsd: item.override_custo_usd,
        overrideDescontoUsd: item.override_desconto_usd,
        overrideTaxa: item.override_taxa,
        overrideVencimentoLista: item.override_vencimento_lista,
        alocacoes: alocacoesByItem[item.id] ?? [],
        createdAt: sim.created_at,
      })
    }
  }
  return rows
}

function groupDemandaPedidos(linhas) {
  const bySim = new Map()
  for (const row of linhas) {
    if (!bySim.has(row.simulationId)) {
      bySim.set(row.simulationId, {
        simulationId: row.simulationId,
        clienteNome: row.clienteNome,
        fazenda: row.fazenda,
        municipio: row.municipio,
        uf: row.uf,
        createdAt: row.createdAt,
        linhas: [],
      })
    }
    bySim.get(row.simulationId).linhas.push(row)
  }

  return [...bySim.values()].map((pedido) => {
    const vendidoKg = pedido.linhas.reduce((acc, row) => acc + row.vendidoKg, 0)
    const vinculadoKg = pedido.linhas.reduce((acc, row) => acc + row.lastreadoKg, 0)
    const faltanteKg = pedido.linhas.reduce((acc, row) => acc + row.faltanteKg, 0)
    const aCaminho = pedido.linhas.some((row) =>
      (row.alocacoes ?? []).some((a) => {
        if (a.origem_tipo !== 'compra') return false
        const recebido = Number(a.compra_itens?.volume_recebido_kg) || 0
        const status = a.compra_itens?.compras?.status
        return recebido <= 0.0001 && status !== 'cancelado' && status !== 'recebido'
      }),
    )
    let status = 'sem'
    if (faltanteKg <= 0.0001) status = 'completo'
    else if (vinculadoKg > 0.0001 && aCaminho) status = 'a_caminho'
    else if (vinculadoKg > 0.0001) status = 'parcial'
    return {
      ...pedido,
      produtos: pedido.linhas.length,
      vendidoKg,
      vinculadoKg,
      faltanteKg,
      status,
    }
  })
}

async function fetchAlocacoesPorItens(itemIds) {
  if (itemIds.length === 0) return { ok: true, rows: [] }
  const { data, error } = await supabase
    .from('alocacoes')
    .select(ALOCACAO_SELECT)
    .in('simulation_item_id', itemIds)
  if (error) return fail(error, 'Não foi possível carregar os vínculos.')
  return { ok: true, rows: data ?? [] }
}

export async function fetchDemandaLinhas() {
  const { data, error } = await supabase
    .from('simulations')
    .select(DEMANDA_SIM_SELECT)
    .eq('status', 'converted')
    .eq('ativo', true)
    .order('created_at', { ascending: false })

  if (error) return fail(error, 'Não foi possível carregar a demanda.')

  const itemIds = []
  for (const sim of data ?? []) {
    for (const item of sim.simulation_items ?? []) {
      if (item?.id) itemIds.push(item.id)
    }
  }
  const alocs = await fetchAlocacoesPorItens(itemIds)
  if (!alocs.ok) return alocs
  return { ok: true, rows: mapDemandaLinhas(data, alocs.rows) }
}

export async function fetchDemandaPedidos() {
  const res = await fetchDemandaLinhas()
  if (!res.ok) return res
  return { ok: true, rows: groupDemandaPedidos(res.rows) }
}

export async function fetchDemandaPedido(simulationId) {
  const { data, error } = await supabase
    .from('simulations')
    .select(DEMANDA_SIM_SELECT)
    .eq('id', simulationId)
    .eq('status', 'converted')
    .eq('ativo', true)
    .maybeSingle()

  if (error) return fail(error, 'Não foi possível carregar o pedido.')
  if (!data) return { ok: false, error: 'Pedido não encontrado na demanda.' }

  const itemIds = (data.simulation_items ?? []).map((item) => item.id).filter(Boolean)
  const alocs = await fetchAlocacoesPorItens(itemIds)
  if (!alocs.ok) return alocs
  const linhas = mapDemandaLinhas([data], alocs.rows)
  const [pedido] = groupDemandaPedidos(linhas)
  if (!pedido) return { ok: false, error: 'Pedido sem produtos na demanda.' }
  return { ok: true, data: pedido }
}

export async function fetchComprasList() {
  const { data, error } = await supabase
    .from('compras')
    .select(
      `
      id, numero, status, fornecedor_id, filial_site, planta, tipo_entrega,
      cidade_retirada, data_documento, pdf_gerado_em, created_at,
      fornecedores ( nome ),
      compra_itens ( id, volume_kg, volume_recebido_kg )
    `,
    )
    .order('created_at', { ascending: false })
  if (error) return fail(error, 'Não foi possível carregar as ordens de compra.')

  const rows = (data ?? []).map((row) => {
    const itens = row.compra_itens ?? []
    const volumeKg = itens.reduce((acc, it) => acc + Number(it.volume_kg || 0), 0)
    const recebidoKg = itens.reduce(
      (acc, it) => acc + Number(it.volume_recebido_kg || 0),
      0,
    )
    return {
      ...row,
      fornecedorNome: row.fornecedores?.nome ?? '—',
      itensCount: itens.length,
      volumeKg,
      recebidoKg,
    }
  })
  return { ok: true, rows }
}

export async function fetchCompraBundle(compraId) {
  const { data, error } = await supabase
    .from('compras')
    .select(
      `
      id, numero, status, fornecedor_id, filial_site, planta, tipo_entrega,
      cidade_retirada, condicao_pagamento, data_documento, observacoes,
      faturamento, ctc, entrega_retirada,
      pdf_gerado_em, created_at, updated_at,
      fornecedores ( id, nome ),
      compra_itens (
        id, produto_oficial_id, embalagem, volume_kg, volume_recebido_kg,
        unidade_exibicao, cultura, origem, lista, preco_usd, desconto_usd,
        vencimento_lista, pagamento_syagri, preco_corrigido, juros,
        unitario_brl, frete, total, ordem,
        produtos_oficiais (
          id, nome, referencia_complementar, fornecedor_id, estado, classe, quarter,
          preco_original, desconto_usd, vencimento_lista, taxa_juros, fornecedores ( nome )
        )
      )
    `,
    )
    .eq('id', compraId)
    .maybeSingle()
  if (error) return fail(error, 'Não foi possível carregar a ordem de compra.')
  if (!data) return { ok: false, error: 'Ordem de compra não encontrada.' }

  const itens = (data.compra_itens ?? [])
    .slice()
    .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0) || a.created_at?.localeCompare?.(b.created_at))
    .map((it) => ({
      ...it,
      product: mapProduto(it.produtos_oficiais),
    }))

  return {
    ok: true,
    data: {
      ...data,
      fornecedorNome: data.fornecedores?.nome ?? '—',
      itens,
    },
  }
}

export async function fetchEstoqueLotes() {
  const { data, error } = await supabase
    .from('estoque_lotes')
    .select(
      `
      id, produto_oficial_id, embalagem, local, origem_tipo, compra_item_id,
      quantidade_kg, reservado_kg, custo_usd_liquido, custo_unitario_brl,
      observacao, created_at,
      produtos_oficiais (
        id, nome, referencia_complementar, fornecedor_id, estado, classe, quarter,
        fornecedores ( nome )
      )
    `,
    )
    .order('created_at', { ascending: false })
  if (error) return fail(error, 'Não foi possível carregar o estoque.')

  const compraItemIds = [
    ...new Set((data ?? []).map((row) => row.compra_item_id).filter(Boolean)),
  ]
  const ocByItem = {}
  if (compraItemIds.length > 0) {
    const { data: itens, error: itensError } = await supabase
      .from('compra_itens')
      .select('id, compras ( numero )')
      .in('id', compraItemIds)
    if (itensError) return fail(itensError, 'Não foi possível carregar as OCs do estoque.')
    for (const it of itens ?? []) {
      ocByItem[it.id] = it.compras?.numero ?? null
    }
  }

  const rows = (data ?? []).map((row) => {
    const qtd = Number(row.quantidade_kg) || 0
    const res = Number(row.reservado_kg) || 0
    return {
      ...row,
      product: mapProduto(row.produtos_oficiais),
      disponivelKg: Math.max(0, qtd - res),
      ocNumero: row.compra_item_id ? (ocByItem[row.compra_item_id] ?? null) : null,
    }
  })
  return { ok: true, rows }
}

export async function fetchLotesDisponiveis(produtoOficialId) {
  const { data, error } = await supabase
    .from('estoque_lotes')
    .select(
      'id, embalagem, local, quantidade_kg, reservado_kg, custo_usd_liquido, custo_unitario_brl, origem_tipo, created_at',
    )
    .eq('produto_oficial_id', produtoOficialId)
    .gt('quantidade_kg', 0)
    .order('created_at', { ascending: true })
  if (error) return fail(error, 'Não foi possível carregar lotes.')
  const rows = (data ?? [])
    .map((row) => ({
      ...row,
      disponivelKg: Math.max(
        0,
        Number(row.quantidade_kg) - Number(row.reservado_kg),
      ),
    }))
    .filter((row) => row.disponivelKg > 0.0001)
  return { ok: true, rows }
}

export async function fetchEstoqueDisponivelSimulador() {
  const { data, error } = await supabase.rpc('estoque_disponivel_simulador')
  if (error) {
    return { ...fail(error, 'Não foi possível consultar o estoque.'), rows: [] }
  }
  return { ok: true, rows: data ?? [] }
}

export async function fetchOcItensParaProduto(produtoOficialId) {
  const { data, error } = await supabase
    .from('compra_itens')
    .select(
      `
      id, volume_kg, volume_recebido_kg, embalagem, compra_id,
      compras!inner ( id, numero, status, fornecedor_id )
    `,
    )
    .eq('produto_oficial_id', produtoOficialId)
    .not('compras.status', 'eq', 'cancelado')
  if (error) return fail(error, 'Não foi possível carregar itens de OC.')

  const ids = (data ?? []).map((r) => r.id)
  const alocadoByItem = {}
  if (ids.length > 0) {
    const { data: alocs, error: alocError } = await supabase
      .from('alocacoes')
      .select('compra_item_id, quantidade_kg, origem_tipo')
      .in('compra_item_id', ids)
      .eq('origem_tipo', 'compra')
    if (alocError) return fail(alocError, 'Não foi possível carregar os vínculos das OCs.')
    for (const a of alocs ?? []) {
      alocadoByItem[a.compra_item_id] =
        (alocadoByItem[a.compra_item_id] ?? 0) + Number(a.quantidade_kg)
    }
  }

  const rows = (data ?? [])
    .filter((row) => row.compras?.status !== 'cancelado')
    .map((row) => {
      const volumeKg = Number(row.volume_kg) || 0
      const alocadoKg = alocadoByItem[row.id] ?? 0
      return {
        id: row.id,
        compraId: row.compra_id,
        numero: row.compras?.numero ?? '—',
        status: row.compras?.status,
        embalagem: row.embalagem,
        volumeKg,
        alocadoKg,
        livreKg: Math.max(0, volumeKg - alocadoKg),
      }
    })
  return { ok: true, rows }
}

async function rpc(name, args, fallback) {
  const { data, error } = await supabase.rpc(name, args)
  if (error) return fail(error, fallback)
  return { ok: true, data }
}

export function criarOrdemCompra(fornecedorId) {
  return rpc('compras_criar', { p_fornecedor_id: fornecedorId }, 'Não foi possível criar a OC.')
}

const ocRascunhoCache = new Map()
const ocRascunhoInflight = new Map()

function ocRascunhoCacheKey(fornecedorId, simulationId) {
  return `${simulationId}:${fornecedorId}`
}

export async function buscarOcRascunhoDoPedido(fornecedorId, simulationId) {
  if (!fornecedorId || !simulationId) return { ok: true, id: null }

  const { data: items, error: itemsError } = await supabase
    .from('simulation_items')
    .select('id')
    .eq('simulation_id', simulationId)
  if (itemsError) return fail(itemsError, 'Não foi possível localizar o pedido.')
  const itemIds = (items ?? []).map((row) => row.id)
  if (itemIds.length === 0) return { ok: true, id: null }

  const { data, error } = await supabase
    .from('alocacoes')
    .select(
      `
      compra_itens!inner (
        compra_id,
        compras!inner ( id, status, fornecedor_id, created_at )
      )
    `,
    )
    .eq('origem_tipo', 'compra')
    .in('simulation_item_id', itemIds)
  if (error) return fail(error, 'Não foi possível localizar a OC do pedido.')

  const candidatos = (data ?? [])
    .map((row) => row.compra_itens?.compras)
    .filter((c) => c && c.status === 'rascunho' && c.fornecedor_id === fornecedorId)
    .sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')))

  return { ok: true, id: candidatos[0]?.id ?? null }
}

export async function obterOuCriarOcRascunho(fornecedorId, simulationId) {
  if (!fornecedorId) return { ok: false, error: 'Fornecedor é obrigatório.' }
  const key = ocRascunhoCacheKey(fornecedorId, simulationId)
  const cached = ocRascunhoCache.get(key)
  if (cached) return { ok: true, data: cached }

  const pending = ocRascunhoInflight.get(key)
  if (pending) return pending

  const promise = (async () => {
    const existing = await buscarOcRascunhoDoPedido(fornecedorId, simulationId)
    if (!existing.ok) return existing
    if (existing.id) {
      ocRascunhoCache.set(key, existing.id)
      return { ok: true, data: existing.id }
    }
    const created = await criarOrdemCompra(fornecedorId)
    if (created.ok && created.data) ocRascunhoCache.set(key, created.data)
    return created
  })()

  ocRascunhoInflight.set(key, promise)
  try {
    return await promise
  } finally {
    ocRascunhoInflight.delete(key)
  }
}

export async function adicionarItemDemandaNaOc(compraId, row, quantidadeKg, unidade = 't') {
  const prices = itemPrecoFromDemanda(row, {
    volumeKg: quantidadeKg,
    unidade,
  })
  const inserted = await insertCompraItem(compraId, {
    produto_oficial_id: row.product.id,
    volume_kg: quantidadeKg,
    unidade_exibicao: unidade,
    cultura: row.cultura,
    ...prices,
  })
  if (!inserted.ok) return inserted
  const aloc = await alocarDemanda({
    simulationItemId: row.simulationItemId,
    quantidadeKg,
    compraItemId: inserted.id,
  })
  if (!aloc.ok) return aloc
  return { ok: true, compraId, compraItemId: inserted.id }
}

export async function gerarOrdensPorFornecedor(linhas) {
  const chosen = (linhas ?? []).filter((row) => row.faltanteKg > 0.0001)
  const grouped = agruparLinhasPorFornecedor(chosen)
  if (!grouped.ok) return grouped
  const compraIds = []
  for (const [fornecedorId, group] of grouped.groups) {
    const oc = await obterOuCriarOcRascunho(fornecedorId, group[0].simulationId)
    if (!oc.ok) return oc
    for (const row of group) {
      const added = await adicionarItemDemandaNaOc(oc.data, row, row.faltanteKg, 't')
      if (!added.ok) return added
    }
    compraIds.push(oc.data)
  }
  return { ok: true, compraIds }
}

export function confirmarOrdemCompra(compraId) {
  return rpc('compras_confirmar', { p_compra_id: compraId }, 'Não foi possível confirmar a OC.')
}

export function marcarPdfGerado(compraId) {
  return rpc(
    'compras_marcar_pdf_gerado',
    { p_compra_id: compraId },
    'Não foi possível registrar o PDF.',
  )
}

export function cancelarOrdemCompra(compraId) {
  return rpc('compras_cancelar', { p_compra_id: compraId }, 'Não foi possível cancelar a OC.')
}

export function alocarDemanda({ simulationItemId, quantidadeKg, estoqueLoteId, compraItemId }) {
  return rpc(
    'compras_alocar',
    {
      p_simulation_item_id: simulationItemId,
      p_quantidade_kg: quantidadeKg,
      p_estoque_lote_id: estoqueLoteId ?? null,
      p_compra_item_id: compraItemId ?? null,
    },
    'Não foi possível vincular a linha.',
  )
}

export function desalocarDemanda(alocacaoId) {
  return rpc('compras_desalocar', { p_alocacao_id: alocacaoId }, 'Não foi possível desvincular.')
}

export function receberCompraItem(compraItemId, quantidadeKg) {
  return rpc(
    'compras_receber',
    { p_compra_item_id: compraItemId, p_quantidade_kg: quantidadeKg },
    'Não foi possível registrar o recebimento.',
  )
}

export function ajusteEntrada(payload) {
  return rpc(
    'compras_ajuste_entrada',
    {
      p_produto_oficial_id: payload.produtoOficialId,
      p_embalagem: payload.embalagem ?? COMPRAS_EMBALAGEM_DEFAULT,
      p_quantidade_kg: payload.quantidadeKg,
      p_custo_usd_liquido: payload.custoUsdLiquido ?? null,
      p_custo_unitario_brl: payload.custoUnitarioBrl ?? null,
      p_observacao: payload.observacao ?? null,
    },
    'Não foi possível lançar a entrada.',
  )
}

export function ajusteSaida(payload) {
  return rpc(
    'compras_ajuste_saida',
    {
      p_estoque_lote_id: payload.estoqueLoteId,
      p_quantidade_kg: payload.quantidadeKg,
      p_observacao: payload.observacao ?? null,
    },
    'Não foi possível lançar a saída.',
  )
}

export async function fetchTaxaUsdVigente() {
  const { data, error } = await supabase
    .from('cotacoes_moeda')
    .select('taxa_conversao')
    .eq('moeda_origem', 'USD')
    .order('data_vigencia', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) return fail(error, 'Não foi possível carregar o dólar.')
  const taxa = Number(data?.taxa_conversao)
  return { ok: true, taxa: Number.isFinite(taxa) && taxa > 0 ? taxa : null }
}

export async function updateCompraCabecalho(compraId, fields) {
  const filialSite = fields.filial_site ?? COMPRAS_FILIAL_DEFAULT
  const { error } = await supabase
    .from('compras')
    .update({
      filial_site: filialSite,
      planta: plantaFromFilial(filialSite),
      tipo_entrega: fields.tipo_entrega || null,
      cidade_retirada: fields.cidade_retirada,
      condicao_pagamento: fields.condicao_pagamento,
      data_documento: fields.data_documento,
      observacoes: fields.observacoes || null,
      faturamento: fields.faturamento || null,
      ctc: fields.ctc || null,
      entrega_retirada: fields.entrega_retirada || null,
    })
    .eq('id', compraId)
  if (error) return fail(error, 'Não foi possível salvar o cabeçalho.')
  return { ok: true }
}

export async function insertCompraItem(compraId, item) {
  const { data: existing } = await supabase
    .from('compra_itens')
    .select('ordem')
    .eq('compra_id', compraId)
    .order('ordem', { ascending: false })
    .limit(1)
  const ordem = Number(existing?.[0]?.ordem ?? 0) + 1
  const { data, error } = await supabase
    .from('compra_itens')
    .insert({
      compra_id: compraId,
      produto_oficial_id: item.produto_oficial_id,
      embalagem: item.embalagem ?? COMPRAS_EMBALAGEM_DEFAULT,
      volume_kg: item.volume_kg,
      unidade_exibicao: item.unidade_exibicao ?? 't',
      cultura: item.cultura || null,
      origem: item.origem || null,
      lista: item.lista || null,
      preco_usd: item.preco_usd ?? null,
      desconto_usd: item.desconto_usd ?? null,
      vencimento_lista: item.vencimento_lista || null,
      pagamento_syagri: item.pagamento_syagri || null,
      preco_corrigido: item.preco_corrigido ?? null,
      juros: item.juros ?? null,
      unitario_brl: item.unitario_brl ?? null,
      frete: item.frete ?? null,
      total: item.total ?? null,
      ordem,
    })
    .select('id')
    .single()
  if (error) return fail(error, 'Não foi possível adicionar o item.')
  return { ok: true, id: data.id }
}

export async function updateCompraItem(itemId, fields) {
  const { error } = await supabase.from('compra_itens').update(fields).eq('id', itemId)
  if (error) return fail(error, 'Não foi possível atualizar o item.')
  return { ok: true }
}

export async function deleteCompraItem(itemId) {
  const { error } = await supabase.from('compra_itens').delete().eq('id', itemId)
  if (error) return fail(error, 'Não foi possível remover o item.')
  return { ok: true }
}

export function itemPrecoFromDemanda(row, { volumeKg, unidade, taxaDolar } = {}) {
  const custo =
    row.overrideCustoUsd != null && row.overrideCustoUsd !== ''
      ? Number(row.overrideCustoUsd)
      : Number(row.product?.preco_original ?? 0)
  const desconto =
    row.overrideDescontoUsd != null && row.overrideDescontoUsd !== ''
      ? Number(row.overrideDescontoUsd)
      : Number(row.product?.desconto_usd ?? 0)
  const taxa =
    taxaDolar != null && taxaDolar !== ''
      ? Number(taxaDolar)
      : row.overrideTaxa != null && row.overrideTaxa !== ''
        ? Number(row.overrideTaxa)
        : null
  const vencimento =
    row.overrideVencimentoLista || row.product?.vencimento_lista || null
  const valores = calcOcItemValores({
    precoUsd: custo,
    descontoUsd: desconto,
    taxaDolar: Number.isFinite(taxa) && taxa > 0 ? taxa : 0,
    volumeKg,
    unidade: unidade ?? 't',
    vencimentoLista: vencimento,
    pagamentoSyagri: vencimento,
    taxaJuros: row.product?.taxaJuros,
  })
  const temCambio = Number.isFinite(taxa) && taxa > 0 && volumeKg != null
  return {
    preco_usd: Number.isFinite(custo) ? custo : null,
    desconto_usd: Number.isFinite(desconto) ? desconto : null,
    vencimento_lista: vencimento,
    pagamento_syagri: vencimento,
    preco_corrigido: valores.precoCorrigido,
    juros: valores.juros,
    lista: row.product?.quarter || null,
    unitario_brl: temCambio ? valores.unitarioBrl : null,
    total: temCambio ? valores.total : null,
  }
}
