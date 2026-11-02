import { requireSupabase } from '../services/supabase'
import {
  deviceLabelFromUserAgent,
  normalizeSubscription,
  subscriptionReusePlan,
  urlBase64ToUint8Array,
} from './pushStatus'

let cachedVapidPublicKey = ''
let vapidKeyPromise = null

export function registerAppServiceWorker() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return Promise.resolve(null)
  }
  if (!window.isSecureContext) return Promise.resolve(null)

  const url = `${import.meta.env.BASE_URL}sw.js`
  const options = {
    scope: import.meta.env.BASE_URL,
    updateViaCache: 'none',
  }
  // Em dev o Vite serve o SW como módulo. Em produção ele é script clássico:
  // no celular, worker de módulo às vezes não acorda quando o push chega.
  if (import.meta.env.DEV) options.type = 'module'
  return navigator.serviceWorker.register(url, options)
}

async function readBrowserSubscription() {
  if (!('serviceWorker' in navigator)) return null
  const registration = await navigator.serviceWorker.getRegistration(
    import.meta.env.BASE_URL,
  )
  if (!registration?.pushManager) return null
  return registration.pushManager.getSubscription()
}

export async function readPushSnapshot(userId) {
  const permission = 'Notification' in window ? Notification.permission : 'unsupported'
  const browserSubscription = await readBrowserSubscription()
  let serverSubscription = false
  if (userId && browserSubscription?.endpoint) {
    const { data, error } = await requireSupabase()
      .from('push_subscriptions')
      .select('id')
      .eq('endpoint', browserSubscription.endpoint)
      .eq('active', true)
      .maybeSingle()
    if (error) throw new Error(error.message)
    serverSubscription = Boolean(data?.id)
  }
  return {
    permission,
    browserSubscription: Boolean(browserSubscription),
    serverSubscription,
  }
}

async function fetchVapidPublicKey() {
  const fromEnv = import.meta.env.VITE_VAPID_PUBLIC_KEY?.trim()
  if (fromEnv) return fromEnv

  const supabase = requireSupabase()
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
  if (sessionError) throw new Error(sessionError.message)
  const token = sessionData.session?.access_token
  if (!token) throw new Error('Sessão expirada. Entre novamente.')

  const base = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, '')
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  const response = await fetch(`${base}/functions/v1/enviar-push-notificacao`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      apikey: anonKey,
    },
    body: JSON.stringify({ action: 'vapid-public-key' }),
  })
  const payload = await response.json().catch(() => ({}))
  if (response.status === 404) {
    throw new Error('O envio de push não está publicado no servidor.')
  }
  if (!response.ok || typeof payload.publicKey !== 'string') {
    throw new Error(
      payload.error ||
        'A chave pública de push não está configurada no servidor.',
    )
  }
  return payload.publicKey
}

/** Busca a chave pública uma vez. A ativação no clique não pode esperar a rede. */
export function warmVapidPublicKey() {
  if (cachedVapidPublicKey) return Promise.resolve(cachedVapidPublicKey)
  if (!vapidKeyPromise) {
    vapidKeyPromise = fetchVapidPublicKey()
      .then((key) => {
        cachedVapidPublicKey = key
        return key
      })
      .catch((error) => {
        vapidKeyPromise = null
        throw error
      })
  }
  return vapidKeyPromise
}

async function persistSubscription(userId, subscription, previousEndpoint) {
  const row = normalizeSubscription(
    userId,
    subscription.toJSON(),
    deviceLabelFromUserAgent(navigator.userAgent),
  )
  const supabase = requireSupabase()
  if (previousEndpoint && previousEndpoint !== row.endpoint) {
    const { error: deleteError } = await supabase
      .from('push_subscriptions')
      .delete()
      .eq('endpoint', previousEndpoint)
    if (deleteError) throw new Error(deleteError.message)
  }
  const { error } = await supabase
    .from('push_subscriptions')
    .upsert(row, { onConflict: 'endpoint' })
  if (error) {
    const message = error.message || 'Não foi possível salvar a inscrição.'
    if (/row-level security|push_subscriptions_endpoint/i.test(message)) {
      throw new Error(
        'Este navegador já está inscrito em outra conta. Desative as notificações nessa conta e tente de novo.',
      )
    }
    throw new Error(message)
  }
}

async function subscribeWithCachedKey(registration) {
  const applicationServerKey = urlBase64ToUint8Array(cachedVapidPublicKey)
  const current = await registration.pushManager.getSubscription()
  const plan = subscriptionReusePlan({
    currentEndpoint: current?.endpoint ?? null,
    currentKey: current?.options?.applicationServerKey ?? null,
    nextKey: applicationServerKey,
  })
  if (plan.action === 'reuse' && current) {
    return { subscription: current, previousEndpoint: null }
  }
  if (current) {
    try {
      await current.unsubscribe()
    } catch {
      // A inscrição antiga pode já ter sido invalidada pelo navegador.
    }
  }
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey,
  })
  return { subscription, previousEndpoint: plan.previousEndpoint }
}

export async function activatePushSubscription(userId) {
  if (!('Notification' in window) || !('PushManager' in window)) {
    throw new Error('Este navegador não suporta notificações push.')
  }
  if (!cachedVapidPublicKey) await warmVapidPublicKey()

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    return { ok: false, permission }
  }

  const existing = await navigator.serviceWorker.getRegistration(import.meta.env.BASE_URL)
  const registration = existing ?? (await registerAppServiceWorker())
  if (!registration) throw new Error('Não foi possível registrar o service worker.')
  await navigator.serviceWorker.ready
  const { subscription, previousEndpoint } = await subscribeWithCachedKey(registration)
  await persistSubscription(userId, subscription, previousEndpoint)
  return { ok: true, permission: 'granted' }
}

/**
 * Renova a inscrição só quando a permissão já foi concedida.
 * Não chama requestPermission.
 */
export async function syncPushSubscription(userId) {
  if (!userId || typeof Notification === 'undefined') return { ok: false, skipped: true }
  if (Notification.permission !== 'granted') return { ok: false, skipped: true }
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return { ok: false, skipped: true }
  }
  if (!window.isSecureContext) return { ok: false, skipped: true }

  await registerAppServiceWorker()
  if (!cachedVapidPublicKey) await warmVapidPublicKey()
  const registration = await navigator.serviceWorker.ready
  try {
    const subscribed = await subscribeWithCachedKey(registration)
    const { subscription } = subscribed
    const previousEndpoint = subscribed.previousEndpoint
    if (!previousEndpoint) {
      const { data, error } = await requireSupabase()
        .from('push_subscriptions')
        .select('id')
        .eq('endpoint', subscription.endpoint)
        .eq('active', true)
        .maybeSingle()
      if (error) throw new Error(error.message)
      if (data?.id) return { ok: true, unchanged: true }
    }
    await persistSubscription(userId, subscription, previousEndpoint)
    return { ok: true }
  } catch (error) {
    if (error?.name === 'NotAllowedError' || error?.name === 'InvalidStateError') {
      return { ok: false, needsGesture: true }
    }
    throw error
  }
}

export async function savePushSubscription(userId, json) {
  if (!userId || !json) return
  const row = normalizeSubscription(
    userId,
    json,
    deviceLabelFromUserAgent(navigator.userAgent),
  )
  const { error } = await requireSupabase()
    .from('push_subscriptions')
    .upsert(row, { onConflict: 'endpoint' })
  if (error) throw new Error(error.message)
}

export async function removeCurrentPushSubscription() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
  const registration = await navigator.serviceWorker.getRegistration(
    import.meta.env.BASE_URL,
  )
  const subscription = await registration?.pushManager?.getSubscription()
  const endpoint = subscription?.endpoint ?? null
  if (subscription) {
    try {
      await subscription.unsubscribe()
    } catch {
      // A remoção no servidor ainda precisa acontecer.
    }
  }
  if (!endpoint) return
  const { error } = await requireSupabase()
    .from('push_subscriptions')
    .delete()
    .eq('endpoint', endpoint)
  if (error) throw new Error(error.message)
}

export async function requestOwnPushTest() {
  const { data, error } = await requireSupabase().rpc('request_own_push_test')
  if (error) return { ok: false, error: error.message }
  return { ok: true, id: data }
}

export async function readOwnPushTestStatus(notificationId) {
  const { data, error } = await requireSupabase().rpc('own_push_test_status', {
    p_notification_id: notificationId,
  })
  if (error) return { ok: false, error: error.message }
  const row = Array.isArray(data) ? data[0] : null
  if (!row) return { ok: true, status: null, lastError: null, attempts: 0 }
  return {
    ok: true,
    status: row.status ?? null,
    lastError: row.last_error ?? null,
    attempts: row.attempts ?? 0,
  }
}
