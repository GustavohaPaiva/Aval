export const DRAFT_TTL_DAYS = 7

export function draftExpiryCutoffIso(now = new Date()) {
  return new Date(
    now.getTime() - DRAFT_TTL_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString()
}

export function isHiddenDraft(row, now = new Date()) {
  if (!row || row.status !== 'draft') return false
  if (row.ativo === false) return true
  const updated = new Date(row.updated_at ?? row.created_at ?? 0).getTime()
  if (!Number.isFinite(updated)) return false
  return updated < now.getTime() - DRAFT_TTL_DAYS * 24 * 60 * 60 * 1000
}

export function isCountedInStats(row) {
  return row?.ativo !== false && !isHiddenDraft(row)
}
