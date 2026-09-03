import { downloadPedidoDocumento } from './pedidoAssinaturaService'
import { requireSupabase } from './supabase'

/**
 * Lista pedidos com assinatura concluída (um card por simulation_id — mais recente).
 * @param {{ search?: string }} [params]
 */
export async function fetchPedidosAssinadosLogistica(params = {}) {
  const supabase = requireSupabase()
  const search = (params.search ?? '').trim()

  const { data, error } = await supabase
    .from('pedido_assinaturas')
    .select(
      `
      id,
      simulation_id,
      signed_at,
      signer_name,
      pdf_signed_path,
      simulations (
        id,
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
        clients ( id, nome )
      )
    `,
    )
    .eq('status', 'signed')
    .order('signed_at', { ascending: false })

  if (error) return { ok: false, error: error.message }

  const bySim = new Map()
  for (const row of data ?? []) {
    const simId = row.simulation_id
    if (!simId || bySim.has(simId)) continue
    const rawSim = row.simulations
    const sim = Array.isArray(rawSim) ? rawSim[0] : rawSim
    if (!sim) continue
    const rawClient = sim.clients
    const client = Array.isArray(rawClient) ? rawClient[0] : rawClient
    bySim.set(simId, {
      assinaturaId: row.id,
      simulationId: String(simId),
      signedAt: row.signed_at ? String(row.signed_at) : null,
      signerName: row.signer_name ?? null,
      pdfSignedPath: row.pdf_signed_path ?? null,
      clientNome: client?.nome ? String(client.nome) : '—',
      fazenda: sim.fazenda ?? null,
      municipio: sim.pedido_municipio ?? null,
      uf: sim.pedido_uf ?? null,
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
    })
  }

  let rows = [...bySim.values()]

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
 * Detalhe de um pedido assinado para logística.
 * @param {string} simulationId
 */
export async function fetchPedidoAssinadoLogistica(simulationId) {
  const supabase = requireSupabase()
  if (!simulationId) {
    return { ok: false, error: 'Pedido não informado.' }
  }

  const { data: assinatura, error: aErr } = await supabase
    .from('pedido_assinaturas')
    .select(
      'id, simulation_id, signed_at, signer_name, pdf_signed_path, status',
    )
    .eq('simulation_id', simulationId)
    .eq('status', 'signed')
    .order('signed_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (aErr) return { ok: false, error: aErr.message }
  if (!assinatura) {
    return { ok: false, error: 'Pedido assinado não encontrado.' }
  }

  const { data: sim, error: sErr } = await supabase
    .from('simulations')
    .select(
      `
      id,
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
      clients ( id, nome, municipio, uf )
    `,
    )
    .eq('id', simulationId)
    .maybeSingle()

  if (sErr) return { ok: false, error: sErr.message }
  if (!sim) return { ok: false, error: 'Pedido não encontrado.' }

  const rawClient = sim.clients
  const client = Array.isArray(rawClient) ? rawClient[0] : rawClient

  return {
    ok: true,
    data: {
      assinaturaId: assinatura.id,
      simulationId: String(sim.id),
      signedAt: assinatura.signed_at ? String(assinatura.signed_at) : null,
      signerName: assinatura.signer_name ?? null,
      pdfSignedPath: assinatura.pdf_signed_path ?? null,
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
    },
  }
}

/**
 * @param {string | null | undefined} pdfPath
 */
export async function fetchPdfAssinadoLogistica(pdfPath) {
  return downloadPedidoDocumento(pdfPath)
}
