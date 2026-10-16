import {
  pushDisplayFromPayload,
  safeNotificationPath,
  urlWithinAppScope,
} from '../supabase/functions/enviar-push-notificacao/pushLogic.js'

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
  event.waitUntil(
    (async () => {
      let raw
      try {
        raw = event.data ? event.data.json() : {}
      } catch {
        raw = { title: 'Aval', body: '' }
      }
      const display = pushDisplayFromPayload(raw)
      const options = {
        body: display.body,
        lang: 'pt-BR',
        data: {
          url: display.url,
          notificationId: display.notificationId,
        },
      }
      if (display.notificationId) options.tag = `aval-${display.notificationId}`
      const icon = new URL('apple-touch-icon.png', self.registration.scope).href
      try {
        await self.registration.showNotification(display.title, { ...options, icon })
      } catch {
        await self.registration.showNotification(display.title, options)
      }
    })(),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const path = safeNotificationPath(event.notification?.data?.url)
  const targetUrl = urlWithinAppScope(path, self.registration.scope)

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      })
      for (const client of windows) {
        if (new URL(client.url).origin !== self.location.origin) continue
        if (typeof client.focus === 'function') await client.focus()
        if (typeof client.navigate === 'function') {
          try {
            await client.navigate(targetUrl)
            return
          } catch {
            // Segue para postMessage ou openWindow.
          }
        }
        client.postMessage({ type: 'aval:push-navigate', url: path })
        return
      }
      await self.clients.openWindow(targetUrl)
    })(),
  )
})
