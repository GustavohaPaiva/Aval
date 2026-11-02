import { appBadgeCount } from '../../supabase/functions/enviar-push-notificacao/pushLogic.js'

const FAVICON_SELECTOR = 'link[rel="icon"][type="image/png"]'
let baseFaviconHref = ''

async function setNavigatorBadge(badge) {
  if (typeof navigator === 'undefined') return
  try {
    if (badge > 0 && typeof navigator.setAppBadge === 'function') {
      await navigator.setAppBadge(badge)
      return
    }
    if (typeof navigator.clearAppBadge === 'function') {
      await navigator.clearAppBadge()
    }
  } catch {
    // Sem app instalado ou sem permissão de notificação.
  }
}

function faviconLink() {
  if (typeof document === 'undefined') return null
  return document.querySelector(FAVICON_SELECTOR)
}

function rememberBaseFavicon(link) {
  if (baseFaviconHref || link.href.startsWith('data:')) return
  baseFaviconHref = link.href
}

async function drawFaviconBadge(href) {
  const image = new Image()
  image.src = href
  await image.decode()
  const canvas = document.createElement('canvas')
  canvas.width = 32
  canvas.height = 32
  const context = canvas.getContext('2d')
  if (!context) return null
  context.drawImage(image, 0, 0, 32, 32)
  context.beginPath()
  context.arc(24, 8, 7, 0, Math.PI * 2)
  context.fillStyle = '#dc2626'
  context.fill()
  context.lineWidth = 2
  context.strokeStyle = '#ffffff'
  context.stroke()
  return canvas.toDataURL('image/png')
}

async function syncFaviconBadge(badge) {
  const link = faviconLink()
  if (!link) return
  rememberBaseFavicon(link)
  if (badge <= 0) {
    if (baseFaviconHref) link.href = baseFaviconHref
    return
  }
  try {
    const dotted = await drawFaviconBadge(baseFaviconHref || link.href)
    if (dotted) link.href = dotted
  } catch {
    // O ícone original continua se o desenho falhar.
  }
}

/** Bolinha do ícone instalado e da aba. 0 remove as duas. */
export async function syncAppBadge(count) {
  const badge = appBadgeCount(count) ?? 0
  await Promise.all([setNavigatorBadge(badge), syncFaviconBadge(badge)])
}
