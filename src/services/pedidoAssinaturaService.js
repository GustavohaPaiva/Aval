import { resolveAssinaturaPublicUrl } from '../config/appEnv'
import { requireSupabase } from './supabase'

const BUCKET = 'pedido-documentos'

async function invokeFunction(name, body) {
  const supabase = requireSupabase()
  const { data, error } = await supabase.functions.invoke(name, { body })

  if (error) {
    let message = error.message || `Falha em ${name}.`
    try {
      const ctx = error.context
      if (ctx && typeof ctx.json === 'function') {
        const payload = await ctx.json()
        if (payload?.erro) message = payload.erro
      } else if (typeof data?.erro === 'string') {
        message = data.erro
      }
    } catch {
      // ignore parse failure
    }
    return { ok: false, error: message, data }
  }
  if (data?.erro && data?.ok !== true) {
    return { ok: false, error: data.erro, data }
  }
  return { ok: true, data }
}

/**
 * @param {Blob} blob
 * @returns {Promise<string>}
 */
export async function blobToBase64(blob) {
  const buffer = await blob.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

/**
 * @param {string} simulationId
 */
export async function fetchPedidoAssinaturas(simulationId) {
  const supabase = requireSupabase()
  const { data, error } = await supabase
    .from('pedido_assinaturas')
    .select(
      'id, simulation_id, token, status, expires_at, signer_name, signer_cpf, pdf_original_path, pdf_signed_path, signed_at, created_at',
    )
    .eq('simulation_id', simulationId)
    .order('created_at', { ascending: false })

  if (error) return { ok: false, error: error.message }
  return { ok: true, data: data ?? [] }
}

/**
 * @param {{ simulationId: string, pdfBlob: Blob, pedidoSnapshot: object, expiresDays?: number }} args
 */
export async function criarLinkAssinatura({
  simulationId,
  pdfBlob,
  pedidoSnapshot,
  expiresDays = 7,
}) {
  const form = new FormData()
  form.append('simulation_id', simulationId)
  form.append('expires_days', String(expiresDays))
  form.append('pedido_snapshot', JSON.stringify(pedidoSnapshot))
  form.append(
    'pdf',
    pdfBlob,
    'original.pdf',
  )

  const res = await invokeFunction('criar-link-assinatura', form)
  if (!res.ok) {
    return { ok: false, error: res.error || 'Falha ao criar link de assinatura.' }
  }
  if (!res.data?.assinatura?.token) {
    return { ok: false, error: 'Resposta inválida ao criar link.' }
  }

  const token = res.data.assinatura.token
  return {
    ok: true,
    data: {
      ...res.data.assinatura,
      link: resolveAssinaturaPublicUrl(token),
    },
  }
}

/**
 * @param {string} token
 */
export async function obterAssinaturaPublica(token) {
  const res = await invokeFunction('obter-assinatura', { token })
  if (!res.ok) {
    return {
      ok: false,
      error: res.error || 'Falha ao carregar o link.',
      status: res.data?.status,
    }
  }
  if (!res.data?.ok && res.data?.erro) {
    return { ok: false, error: res.data.erro, status: res.data.status }
  }
  return { ok: true, data: res.data }
}

/**
 * @param {{
 *   token: string,
 *   signerName: string,
 *   signerCpf: string,
 *   signaturePngBlob: Blob,
 *   signedPdfBlob: Blob,
 * }} args
 */
export async function concluirAssinaturaPublica({
  token,
  signerName,
  signerCpf,
  signaturePngBlob,
  signedPdfBlob,
}) {
  const [signature_png_base64, signed_pdf_base64] = await Promise.all([
    blobToBase64(signaturePngBlob),
    blobToBase64(signedPdfBlob),
  ])

  const res = await invokeFunction('concluir-assinatura', {
    token,
    signer_name: signerName,
    signer_cpf: signerCpf,
    signature_png_base64,
    signed_pdf_base64,
  })
  if (!res.ok) {
    return { ok: false, error: res.error || 'Falha ao concluir assinatura.' }
  }
  return { ok: true, data: res.data }
}

/**
 * @param {string} assinaturaId
 */
export async function revogarLinkAssinatura(assinaturaId) {
  const supabase = requireSupabase()
  const { error } = await supabase
    .from('pedido_assinaturas')
    .update({ status: 'revoked' })
    .eq('id', assinaturaId)
    .eq('status', 'pending')

  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

/**
 * @param {string | null | undefined} path
 * @param {number} [expiresIn]
 */
export async function createPedidoDocumentoSignedUrl(path, expiresIn = 600) {
  if (!path) return { ok: false, error: 'Documento indisponível.' }
  const supabase = requireSupabase()
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, expiresIn)

  if (error || !data?.signedUrl) {
    return { ok: false, error: error?.message ?? 'Falha ao obter documento.' }
  }
  return { ok: true, url: data.signedUrl }
}

/**
 * @param {{ status: string, expires_at?: string | null }} row
 */
export function normalizeAssinaturaStatus(row) {
  if (!row) return 'unknown'
  if (
    row.status === 'pending' &&
    row.expires_at &&
    new Date(row.expires_at).getTime() < Date.now()
  ) {
    return 'expired'
  }
  return row.status
}

/**
 * @param {string} status
 */
export function assinaturaStatusLabel(status) {
  switch (status) {
    case 'pending':
      return 'Aguardando assinatura'
    case 'signed':
      return 'Assinado'
    case 'expired':
      return 'Expirado'
    case 'revoked':
      return 'Revogado'
    default:
      return status
  }
}
