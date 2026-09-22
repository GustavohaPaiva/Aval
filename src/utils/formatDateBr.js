/**
 * Formata data em pt-BR (dd/mm/aaaa).
 * Datas só-dia (YYYY-MM-DD) usam o calendário local — `new Date('YYYY-MM-DD')`
 * é UTC meia-noite e recua um dia no Brasil (UTC-3).
 */
export function formatDateBr(isoOrDate) {
  if (!isoOrDate) return '—'
  if (isoOrDate instanceof Date) {
    if (Number.isNaN(isoOrDate.getTime())) return '—'
    return formatLocale(isoOrDate)
  }
  const raw = String(isoOrDate).trim()
  const dateOnly = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (dateOnly) return `${dateOnly[3]}/${dateOnly[2]}/${dateOnly[1]}`
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return '—'
  return formatLocale(d)
}

function formatLocale(date) {
  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}
