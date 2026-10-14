import { useNavigate } from 'react-router-dom'
import { useEffect } from 'react'
import { safeNotificationPath } from '../../supabase/functions/enviar-push-notificacao/pushLogic.js'
import { registerAppServiceWorker } from '../push/pushClient'

export function PushNavigationListener() {
  const navigate = useNavigate()

  useEffect(() => {
    let cancelled = false
    void registerAppServiceWorker().catch(() => {
      // O card de notificações explica quando o navegador não registra o worker.
    })

    if (!('serviceWorker' in navigator)) return undefined

    function onMessage(event) {
      if (cancelled) return
      if (event.origin && event.origin !== window.location.origin) return
      if (event.data?.type !== 'aval:push-navigate') return
      navigate(safeNotificationPath(event.data.url))
    }

    navigator.serviceWorker.addEventListener('message', onMessage)
    return () => {
      cancelled = true
      navigator.serviceWorker.removeEventListener('message', onMessage)
    }
  }, [navigate])

  return null
}
