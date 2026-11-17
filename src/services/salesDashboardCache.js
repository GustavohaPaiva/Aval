/** Cache do painel em memória, por usuário. Não vai para localStorage. */
export const SALES_DASHBOARD_CACHE_TTL_MS = 60_000
const CACHE_VERSION = 2

const entries = new Map()
const listeners = new Set()

export function peekSalesDashboard(userId) {
  if (!userId) return null
  const hit = entries.get(userId)
  if (!hit || hit.version !== CACHE_VERSION) {
    if (hit) entries.delete(userId)
    return null
  }
  if (Date.now() - hit.at > SALES_DASHBOARD_CACHE_TTL_MS) {
    entries.delete(userId)
    return null
  }
  return hit.value
}

export function storeSalesDashboard(userId, value) {
  if (!userId || !value?.ok) return
  entries.set(userId, { at: Date.now(), version: CACHE_VERSION, value })
}

export function subscribeSalesDashboardCache(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function invalidateSalesDashboardCache(userId) {
  if (userId) entries.delete(userId)
  else entries.clear()
  for (const listener of listeners) listener()
}
