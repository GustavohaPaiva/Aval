import {
  isStatusLogistica,
  pedidoMatchesSearch,
} from '../constants/logisticaStatus'
import { LOGISTICA_PEDIDO_STATUSES } from '../constants/simulationStatus'
import { downloadPedidoDocumento } from './pedidoAssinaturaService'
import { requireSupabase } from './supabase'

const PEDIDO_SELECT = `
  id,
  created_at,
  status,
  status_logistica,
  status_logistica_em,
  ativo,
  fazenda,
  pedido_municipio,
  pedido_uf,
  prazo_semana_inicio,
  tipo_frete,
  origem_frete,
  destino_frete,
  observacoes,
  clients ( id, nome, municipio, uf ),
  pedido_assinaturas ( id, status, signed_at, signer_name, pdf_signed_path )
`

function first(value) {
  return Array.isArray(value) ? value[0] : value
}

/** Assinatura concluída mais recente do pedido, se houver. */
function assinaturaAssinada(sim) {
  const assinaturas = Array.isArray(sim.pedido_assinaturas)
    ? sim.pedido_assinaturas
    : sim.pedido_assinaturas
      ? [sim.pedido_assinaturas]
      : []
  return assinaturas
    .filter((a) => a?.status === 'signed')
    .sort((a, b) => String(b.signed_at ?? '').localeCompare(String(a.signed_at ?? '')))[0] ?? null
}

function mapItem(row) {
  return {
    simulationId: row.simulation_id ? String(row.simulation_id) : null,
    id: row.item_id ? String(row.item_id) : null,
    nome: row.nome ? String(row.nome) : '',
    referenciaComplementar: row.referencia_complementar ?? null,
    fornecedorNome: row.fornecedor_nome ?? null,
    volume: row.volume,
  }
}

function groupItensPorPedido(itens) {
  const grupos = new Map()
  for (const item of itens) {
    if (!item.simulationId) continue
    const list = grupos.get(item.simulationId) ?? []
    list.push(item)
    grupos.set(item.simulationId, list)
  }
  return grupos
}

function mapPedido(sim, itens = []) {
  const client = first(sim.clients)
  const assinatura = assinaturaAssinada(sim)
  return {
    simulationId: String(sim.id),
    createdAt: sim.created_at ? String(sim.created_at) : null,
    assinado: Boolean(assinatura),
    assinaturaId: assinatura?.id ?? null,
    signedAt: assinatura?.signed_at ? String(assinatura.signed_at) : null,
    signerName: assinatura?.signer_name ?? null,
    pdfSignedPath: assinatura?.pdf_signed_path ?? null,
    clientNome: client?.nome ? String(client.nome) : '—',
    fazenda: sim.fazenda ?? null,
    municipio: sim.pedido_municipio ?? client?.municipio ?? null,
    uf: sim.pedido_uf ?? client?.uf ?? null,
    prazoSemanaInicio:
      sim.prazo_semana_inicio != null
        ? String(sim.prazo_semana_inicio).slice(0, 10)
        : null,
    tipoFrete: sim.tipo_frete ?? null,
    origemFrete: sim.origem_frete ?? null,
    destinoFrete: sim.destino_frete ?? null,
    observacoes: sim.observacoes ?? null,
    ativo: sim.ativo !== false,
    status: sim.status,
    statusLogistica: sim.status_logistica ?? null,
    statusLogisticaEm: sim.status_logistica_em
      ? String(sim.status_logistica_em)
      : null,
    itens,
    entregas: [],
  }
}

const ENTREGA_SELECT = `
  id,
  simulation_id,
  status_logistica,
  status_logistica_em,
  criado_em,
  pedido_logistica_entrega_itens ( simulation_item_id, quantidade )
`

function mapEntrega(row) {
  const itens = Array.isArray(row.pedido_logistica_entrega_itens)
    ? row.pedido_logistica_entrega_itens
    : []
  return {
    id: String(row.id),
    simulationId: row.simulation_id ? String(row.simulation_id) : null,
    statusLogistica: row.status_logistica ?? null,
    statusLogisticaEm: row.status_logistica_em
      ? String(row.status_logistica_em)
      : null,
    itens: itens
      .filter((item) => item?.simulation_item_id)
      .map((item) => ({
        simulationItemId: String(item.simulation_item_id),
        quantidade: item.quantidade,
      })),
  }
}

function anexarEntregas(pedidos, entregas) {
  const porPedido = new Map()
  for (const entrega of entregas) {
    if (!entrega.simulationId) continue
    const lista = porPedido.get(entrega.simulationId) ?? []
    lista.push(entrega)
    porPedido.set(entrega.simulationId, lista)
  }
  return pedidos.map((pedido) => ({
    ...pedido,
    entregas: porPedido.get(pedido.simulationId) ?? [],
  }))
}

async function fetchEntregas(simulationId) {
  const supabase = requireSupabase()
  let query = supabase
    .from('pedido_logistica_entregas')
    .select(ENTREGA_SELECT)
    .order('criado_em', { ascending: true })
  if (simulationId) query = query.eq('simulation_id', simulationId)
  const { data, error } = await query
  if (error) return { ok: false, error: error.message }
  return { ok: true, data: (data ?? []).map(mapEntrega) }
}

async function fetchResumoItens(simulationId) {
  const supabase = requireSupabase()
  const args = simulationId ? { p_simulation_id: simulationId } : {}
  const { data, error } = await supabase.rpc('logistica_resumo_itens', args)
  if (error) return { ok: false, error: error.message }
  const itens = (data ?? []).map(mapItem)
  return { ok: true, data: itens }
}

/**
 * Lista os pedidos para a logística (assinados ou não). O RLS de logística já
 * limita o retorno a pedidos em andamento com os dados operacionais completos.
 * @param {{ search?: string }} [params]
 */
export async function fetchPedidosLogistica(params = {}) {
  const supabase = requireSupabase()
  const search = (params.search ?? '').trim()

  const [pedidosRes, itensRes, entregasRes] = await Promise.all([
    supabase
      .from('simulations')
      .select(PEDIDO_SELECT)
      .in('status', LOGISTICA_PEDIDO_STATUSES)
      .order('created_at', { ascending: false }),
    fetchResumoItens(),
    fetchEntregas(),
  ])

  if (pedidosRes.error) return { ok: false, error: pedidosRes.error.message }
  if (!itensRes.ok) return itensRes
  if (!entregasRes.ok) return entregasRes

  const itensPorPedido = groupItensPorPedido(itensRes.data)

  let rows = anexarEntregas(
    (pedidosRes.data ?? []).map((sim) =>
      mapPedido(sim, itensPorPedido.get(String(sim.id)) ?? []),
    ),
    entregasRes.data,
  )

  if (search) {
    rows = rows.filter((row) => pedidoMatchesSearch(row, search))
  }

  return { ok: true, data: rows }
}

/**
 * Detalhe de um pedido para logística (assinado ou não).
 * @param {string} simulationId
 */
export async function fetchPedidoLogistica(simulationId) {
  const supabase = requireSupabase()
  if (!simulationId) {
    return { ok: false, error: 'Pedido não informado.' }
  }

  const [pedidoRes, itensRes, entregasRes] = await Promise.all([
    supabase
      .from('simulations')
      .select(PEDIDO_SELECT)
      .eq('id', simulationId)
      .in('status', LOGISTICA_PEDIDO_STATUSES)
      .maybeSingle(),
    fetchResumoItens(simulationId),
    fetchEntregas(simulationId),
  ])

  if (pedidoRes.error) return { ok: false, error: pedidoRes.error.message }
  if (!pedidoRes.data) return { ok: false, error: 'Pedido não encontrado.' }
  if (!itensRes.ok) return itensRes
  if (!entregasRes.ok) return entregasRes

  const [pedido] = anexarEntregas(
    [mapPedido(pedidoRes.data, itensRes.data)],
    entregasRes.data,
  )
  return { ok: true, data: pedido }
}

/**
 * Persiste a coluna do Kanban. O status comercial do pedido não é alterado.
 * @param {{ simulationId: string, status: string, statusEsperado?: string|null, entregaId?: string|null }} input
 */
export async function atualizarStatusLogistica(input) {
  const simulationId = input?.simulationId
  const status = input?.status
  if (!simulationId) return { ok: false, error: 'Pedido não informado.' }
  if (!isStatusLogistica(status)) {
    return { ok: false, error: 'Status logístico inválido.' }
  }

  const supabase = requireSupabase()
  const { data, error } = await supabase.rpc('atualizar_status_logistica', {
    p_simulation_id: simulationId,
    p_status: status,
    p_status_esperado: input.statusEsperado ?? null,
    p_entrega_id: input.entregaId ?? null,
  })

  if (error) {
    return { ok: false, error: error.message || 'Não foi possível atualizar o status.' }
  }

  return { ok: true, status: data }
}

/**
 * Programa o saldo da Carteira. A mesma chave não grava a operação duas vezes.
 * @param {{ simulationId: string, linhas: Array<{ itemId: string, quantidade: number }>, idempotencyKey: string }} input
 */
export async function programarEntregaLogistica(input) {
  const simulationId = input?.simulationId
  const linhas = Array.isArray(input?.linhas) ? input.linhas : []
  if (!simulationId) return { ok: false, error: 'Pedido não informado.' }
  if (!input?.idempotencyKey) {
    return { ok: false, error: 'Operação sem identificador.' }
  }
  if (linhas.length === 0) {
    return { ok: false, error: 'Informe a quantidade de ao menos um item.' }
  }

  const supabase = requireSupabase()
  const { data, error } = await supabase.rpc('programar_entrega_logistica', {
    p_simulation_id: simulationId,
    p_itens: linhas.map((linha) => ({
      item_id: linha.itemId,
      quantidade: linha.quantidade,
    })),
    p_idempotency_key: input.idempotencyKey,
  })

  if (error) {
    return { ok: false, error: error.message || 'Não foi possível programar a entrega.' }
  }

  return { ok: true, data }
}

/**
 * @param {string | null | undefined} pdfPath
 */
export async function fetchPdfAssinadoLogistica(pdfPath) {
  return downloadPedidoDocumento(pdfPath)
}
