const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const PEDIDO_TYPES = new Set([
  'order_approval_request',
  'order_approved',
  'order_rejected',
  'pedido_fields_updated',
])

const BACKOFF_MINUTES = [1, 5, 15, 60, 180]
const STALE_PROCESSING_MS = 10 * 60 * 1000

export function isUuid(value) {
  return typeof value === 'string' && UUID_RE.test(value)
}

function stripControls(value) {
  let out = ''
  for (const char of value) {
    const code = char.charCodeAt(0)
    out += (code <= 31 || code === 127) ? ' ' : char
  }
  return out
}

function hasControlChar(value) {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i)
    if (code <= 31 || code === 127) return true
  }
  return false
}

function clip(value, max) {
  if (typeof value !== 'string') return ''
  const cleaned = stripControls(value).trim()
  if (cleaned.length <= max) return cleaned
  return `${cleaned.slice(0, Math.max(0, max - 1))}…`
}

/**
 * Aceita só caminho do próprio app. Bloqueia URL absoluta, protocol-relative e escapes.
 */
export function safeNotificationPath(input) {
  if (typeof input !== 'string') return '/notificacoes'
  const trimmed = input.trim()
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return '/notificacoes'
  if (trimmed.includes('\\') || trimmed.includes('://')) return '/notificacoes'
  if (hasControlChar(trimmed)) return '/notificacoes'

  let url
  try {
    url = new URL(trimmed, 'https://aval.local')
  } catch {
    return '/notificacoes'
  }
  if (url.origin !== 'https://aval.local') return '/notificacoes'
  if (url.username || url.password) return '/notificacoes'
  return `${url.pathname}${url.search}${url.hash}`
}

/** Resolve o caminho seguro dentro do escopo do service worker (respeita o base path). */
export function urlWithinAppScope(path, scope) {
  const safe = safeNotificationPath(path)
  let base
  try {
    base = new URL(scope)
  } catch {
    return safe
  }
  const resolved = new URL(safe.replace(/^\//, ''), base)
  if (resolved.origin !== base.origin) return base.href
  if (!resolved.pathname.startsWith(base.pathname)) return base.href
  return resolved.href
}

/**
 * Mesmo destino da tela interna (NotificacoesPage.handleOpen).
 * Sem simulação, o push abre a lista de notificações.
 */
export function notificationTargetPath({ type, simulationId, role }) {
  if (simulationId == null || String(simulationId).trim() === '') {
    return '/notificacoes'
  }
  const id = encodeURIComponent(String(simulationId))
  const isGestor = role === 'gestor'
  if (type === 'order_approved' || type === 'pedido_fields_updated') {
    return `/pedido/${id}`
  }
  if (type === 'simulation_gestor_updated') {
    return `/simulador?simulationId=${id}`
  }
  if (PEDIDO_TYPES.has(type) && isGestor) return `/pedido/${id}`
  if (type === 'order_conversion_request') {
    return `/simulador?simulationId=${id}`
  }
  if (type === 'order_rejected') return '/pedidos'
  return `/simulador?simulationId=${id}`
}

export function buildPushPayload({ title, body, notificationId, url }) {
  return {
    title: clip(title, 120) || 'Aval',
    body: clip(body, 240),
    notificationId: isUuid(notificationId) ? notificationId : null,
    url: safeNotificationPath(url),
  }
}

export function pushDisplayFromPayload(raw) {
  const data = raw && typeof raw === 'object' ? raw : {}
  return buildPushPayload({
    title: data.title,
    body: data.body,
    notificationId: data.notificationId,
    url: data.url,
  })
}

export function canClaimDelivery(row, nowMs) {
  if (!row || !Number.isFinite(row.attempts) || row.attempts >= 5) return false
  if (row.status === 'sent' || row.status === 'skipped') return false
  if (row.status === 'pending' || row.status === 'failed') {
    const due = new Date(row.next_attempt_at).getTime()
    return Number.isFinite(due) && due <= nowMs
  }
  if (row.status === 'processing') {
    const started = new Date(row.processing_started_at).getTime()
    if (!Number.isFinite(started)) return true
    return nowMs - started >= STALE_PROCESSING_MS
  }
  return false
}

export function deliveryResultPatch(attempts, outcome, errorCode, nowMs) {
  const now = new Date(nowMs).toISOString()
  if (outcome === 'sent') {
    return {
      status: 'sent',
      sent_at: now,
      last_error: null,
      processing_started_at: null,
    }
  }
  if (outcome === 'skipped') {
    return {
      status: 'skipped',
      last_error: clip(errorCode, 500) || 'skipped',
      processing_started_at: null,
    }
  }
  const minutes = BACKOFF_MINUTES[Math.min(Math.max(attempts, 1), 5) - 1]
  const willRetry = attempts < 5
  return {
    status: 'failed',
    last_error: clip(errorCode, 500) || 'push_failed',
    processing_started_at: null,
    next_attempt_at: willRetry
      ? new Date(nowMs + minutes * 60 * 1000).toISOString()
      : now,
  }
}
