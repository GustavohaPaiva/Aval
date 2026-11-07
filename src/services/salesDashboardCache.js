/** Cache do painel em memória, por usuário. Não vai para localStorage. */
export const SALES_DASHBOARD_CACHE_TTL_MS = 60_000

const entries = new Map()

export function peekSalesDashboard(userId) {
  if (!userId) return null
  const hit = entries.get(userId)
  if (!hit) return null
  if (Date.now() - hit.at > SALES_DASHBOARD_CACHE_TTL_MS) {
    entries.delete(userId)
    return null
  }
  return hit.value
}

export function storeSalesDashboard(userId, value) {
  if (!userId || !value?.ok) return
  entries.set(userId, { at: Date.now(), value })
}

export function invalidateSalesDashboardCache(userId) {
  if (userId) entries.delete(userId)
  else entries.clear()
}
