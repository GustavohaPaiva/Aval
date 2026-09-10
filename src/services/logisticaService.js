import { LOGISTICA_PEDIDO_STATUSES } from '../constants/simulationStatus'
import { downloadPedidoDocumento } from './pedidoAssinaturaService'
import { requireSupabase } from './supabase'

const PEDIDO_SELECT = `
  id,
  created_at,
  status,
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

function mapPedido(sim) {
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
  }
}

/**
 * Lista os pedidos para a logística (assinados ou não). O RLS de logística já
 * limita o retorno a pedidos em andamento com os dados operacionais completos.
 * @param {{ search?: string }} [params]
 */
export async function fetchPedidosLogistica(params = {}) {
  const supabase = requireSupabase()
  const search = (params.search ?? '').trim()

  const { data, error } = await supabase
    .from('simulations')
    .select(PEDIDO_SELECT)
    .in('status', LOGISTICA_PEDIDO_STATUSES)
    .order('created_at', { ascending: false })

  if (error) return { ok: false, error: error.message }

  let rows = (data ?? []).map(mapPedido)

  if (search) {
    const q = search.toLowerCase()
    rows = rows.filter((r) => {
      const hay = [r.clientNome, r.fazenda, r.municipio, r.uf]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    })
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

  const { data: sim, error } = await supabase
    .from('simulations')
    .select(PEDIDO_SELECT)
    .eq('id', simulationId)
    .in('status', LOGISTICA_PEDIDO_STATUSES)
    .maybeSingle()

  if (error) return { ok: false, error: error.message }
  if (!sim) return { ok: false, error: 'Pedido não encontrado.' }

  return { ok: true, data: mapPedido(sim) }
}

/**
 * @param {string | null | undefined} pdfPath
 */
export async function fetchPdfAssinadoLogistica(pdfPath) {
  return downloadPedidoDocumento(pdfPath)
}
