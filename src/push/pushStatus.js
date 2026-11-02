export function isIosUserAgent(userAgent, platform, maxTouchPoints) {
  const ua = String(userAgent ?? '')
  if (/iphone|ipad|ipod/i.test(ua)) return true
  return platform === 'MacIntel' && Number(maxTouchPoints) > 1
}

export function deviceLabelFromUserAgent(userAgent) {
  const ua = String(userAgent ?? '')
  let browser = 'Navegador'
  if (/edg\//i.test(ua)) browser = 'Edge'
  else if (/chrome|crios/i.test(ua)) browser = 'Chrome'
  else if (/firefox|fxios/i.test(ua)) browser = 'Firefox'
  else if (/safari/i.test(ua)) browser = 'Safari'

  let os = 'Desktop'
  if (/android/i.test(ua)) os = 'Android'
  else if (/iphone|ipad|ipod/i.test(ua)) os = 'iPhone/iPad'
  else if (/mac os/i.test(ua)) os = 'Mac'
  else if (/windows/i.test(ua)) os = 'Windows'
  return `${browser} · ${os}`.slice(0, 80)
}

export function normalizeSubscription(userId, json, deviceLabel) {
  if (!userId) throw new Error('Usuário não autenticado.')
  if (!json || typeof json.endpoint !== 'string' || !json.endpoint.startsWith('https://')) {
    throw new Error('Assinatura push inválida.')
  }
  if (json.endpoint.length < 20 || json.endpoint.length > 4096) {
    throw new Error('Endpoint da assinatura é inválido.')
  }
  const p256dh = json.keys?.p256dh
  const auth = json.keys?.auth
  if (typeof p256dh !== 'string' || typeof auth !== 'string') {
    throw new Error('Chaves da assinatura ausentes.')
  }
  if (p256dh.length < 16 || p256dh.length > 200 || auth.length < 8 || auth.length > 64) {
    throw new Error('Chaves da assinatura inválidas.')
  }

  let expiration = null
  if (json.expirationTime != null) {
    const ms = Number(json.expirationTime)
    if (!Number.isFinite(ms)) throw new Error('Validade da assinatura inválida.')
    expiration = new Date(ms).toISOString()
  }

  const label = String(deviceLabel ?? '').trim().slice(0, 80)

  return {
    user_id: userId,
    endpoint: json.endpoint,
    p256dh,
    auth,
    expiration_time: expiration,
    device_label: label || null,
    active: true,
    disabled_reason: null,
    failure_count: 0,
    last_failure_at: null,
  }
}

export function applicationServerKeysMatch(existingKey, nextKey) {
  if (!existingKey || !nextKey) return false
  const left = existingKey instanceof Uint8Array ? existingKey : new Uint8Array(existingKey)
  const right = nextKey instanceof Uint8Array ? nextKey : new Uint8Array(nextKey)
  if (left.length === 0 || left.length !== right.length) return false
  let diff = 0
  for (let i = 0; i < left.length; i += 1) diff |= left[i] ^ right[i]
  return diff === 0
}

/**
 * Reutiliza a inscrição atual quando a chave VAPID é a mesma.
 * Trocar sem necessidade deixa o endpoint antigo ativo e duplica o push.
 */
export function subscriptionReusePlan({ currentEndpoint, currentKey, nextKey }) {
  if (!currentEndpoint) {
    return { action: 'replace', previousEndpoint: null }
  }
  // Sem a chave exposta pelo navegador, reutiliza. Trocar a cada abertura
  // invalidaria o endpoint e poderia duplicar o envio.
  if (!currentKey || applicationServerKeysMatch(currentKey, nextKey)) {
    return { action: 'reuse', previousEndpoint: null }
  }
  return {
    action: 'replace',
    previousEndpoint: currentEndpoint,
  }
}

export function pushTestFeedback({ status, lastError }) {
  if (status === 'sent') {
    return 'Enviada para os dispositivos ativos desta conta. Confira a bandeja do sistema, também com o Aval fechado.'
  }
  if (
    lastError === 'vapid_not_configured' ||
    lastError === 'push_dispatch_not_configured'
  ) {
    return 'A notificação foi registrada, mas o servidor ainda não tem as chaves de envio.'
  }
  if (lastError === 'no_subscription') {
    return 'Não há dispositivo ativo nesta conta. Ative as notificações e tente de novo.'
  }
  if (status === 'failed') {
    return 'O envio falhou. Inscrições inválidas são descartadas nas próximas tentativas.'
  }
  if (status === 'skipped') return 'O envio foi ignorado para este evento.'
  return 'A notificação foi registrada e segue na fila de envio.'
}

export function isPushConfigError(message) {
  return /chave pública|não está configurada|não está publicado|vapid/i.test(
    String(message ?? ''),
  )
}

export function urlBase64ToUint8Array(base64String) {
  const value = String(base64String ?? '').trim()
  if (!value) throw new Error('Chave pública VAPID ausente.')
  const padding = '='.repeat((4 - (value.length % 4)) % 4)
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const output = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i)
  if (output.length !== 65 || output[0] !== 4) {
    throw new Error('Chave pública VAPID inválida.')
  }
  return output
}

/**
 * @returns {'checking'|'activating'|'unsupported'|'ios_install'|'denied'|'misconfigured'|'error'|'active'|'idle'}
 */
export function resolvePushStatus(env) {
  if (env.activating) return 'activating'
  if (env.checking) return 'checking'
  if (!env.secureContext || !env.serviceWorker || !env.notification) {
    return 'unsupported'
  }
  if (env.ios && !env.standalone && !env.pushManager) return 'ios_install'
  if (!env.pushManager) return 'unsupported'
  if (env.permission === 'denied') return 'denied'
  if (env.configError || isPushConfigError(env.error)) return 'misconfigured'
  if (env.error) return 'error'
  if (env.permission === 'granted' && env.browserSubscription && env.serverSubscription) {
    return 'active'
  }
  return 'idle'
}
