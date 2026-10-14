import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import {
  activatePushSubscription,
  readPushSnapshot,
  registerAppServiceWorker,
  removeCurrentPushSubscription,
  requestOwnPushTest,
} from './pushClient'
import { isIosUserAgent, resolvePushStatus } from './pushStatus'

function readEnvironment() {
  if (typeof window === 'undefined') {
    return {
      secureContext: false,
      serviceWorker: false,
      notification: false,
      pushManager: false,
      ios: false,
      standalone: false,
    }
  }
  const ios = isIosUserAgent(
    navigator.userAgent,
    navigator.platform,
    navigator.maxTouchPoints,
  )
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  return {
    secureContext: window.isSecureContext,
    serviceWorker: 'serviceWorker' in navigator,
    notification: 'Notification' in window,
    pushManager: 'PushManager' in window && 'serviceWorker' in navigator,
    ios,
    standalone,
  }
}

export function usePushNotifications() {
  const { user } = useAuth()
  const userId = user?.id ?? null
  const [checking, setChecking] = useState(true)
  const [busyAction, setBusyAction] = useState(null)
  const [testing, setTesting] = useState(false)
  const [error, setError] = useState(null)
  const [testMessage, setTestMessage] = useState(null)
  const [snapshot, setSnapshot] = useState({
    permission: 'default',
    browserSubscription: false,
    serverSubscription: false,
  })

  const refresh = useCallback(async () => {
    const env = readEnvironment()
    if (!env.serviceWorker || !env.secureContext || !userId) {
      setSnapshot({
        permission: env.notification && typeof Notification !== 'undefined'
          ? Notification.permission
          : 'unsupported',
        browserSubscription: false,
        serverSubscription: false,
      })
      setChecking(false)
      return
    }
    try {
      await registerAppServiceWorker()
      const next = await readPushSnapshot(userId)
      setSnapshot(next)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao consultar a inscrição.')
    } finally {
      setChecking(false)
    }
  }, [userId])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      await Promise.resolve()
      if (!cancelled) await refresh()
    })()
    function onVisible() {
      if (document.visibilityState === 'visible') void refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [refresh])

  async function activate() {
    if (!userId) return
    setBusyAction('activate')
    setError(null)
    setTestMessage(null)
    try {
      const result = await activatePushSubscription(userId)
      if (!result.ok) {
        setSnapshot((current) => ({
          ...current,
          permission: result.permission,
        }))
        return
      }
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao ativar as notificações.')
    } finally {
      setBusyAction(null)
    }
  }

  async function deactivate() {
    setBusyAction('deactivate')
    setError(null)
    setTestMessage(null)
    try {
      await removeCurrentPushSubscription()
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao desativar as notificações.')
    } finally {
      setBusyAction(null)
    }
  }

  async function sendTest() {
    setTesting(true)
    setError(null)
    setTestMessage(null)
    try {
      const result = await requestOwnPushTest()
      if (!result.ok) {
        setError(result.error || 'Não foi possível criar a notificação de teste.')
        return { ok: false }
      }
      setTestMessage(
        'A notificação de teste foi criada e continua nesta tela. Se o servidor de push estiver configurado, ela também chega neste dispositivo, mesmo com o Aval fechado.',
      )
      return { ok: true }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao enviar o teste.')
      return { ok: false }
    } finally {
      setTesting(false)
    }
  }

  const env = readEnvironment()
  const status = resolvePushStatus({
    ...env,
    checking,
    error,
    permission: snapshot.permission,
    browserSubscription: snapshot.browserSubscription,
    serverSubscription: snapshot.serverSubscription,
  })

  return {
    status,
    error,
    testMessage,
    testing,
    permission: snapshot.permission,
    browserSubscription: snapshot.browserSubscription,
    serverSubscription: snapshot.serverSubscription,
    busyAction,
    activate,
    deactivate,
    sendTest,
  }
}
