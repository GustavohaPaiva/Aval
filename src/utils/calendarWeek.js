/** Semana de calendário brasileiro (domingo → sábado). */

const MS_DAY = 24 * 60 * 60 * 1000

const MESES = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
]

const MESES_ABREV = [
  'jan',
  'fev',
  'mar',
  'abr',
  'mai',
  'jun',
  'jul',
  'ago',
  'set',
  'out',
  'nov',
  'dez',
]

/** @param {string|Date|null|undefined} value */
export function toDateOnly(value) {
  if (value == null || value === '') return null
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null
    const y = value.getFullYear()
    const m = String(value.getMonth() + 1).padStart(2, '0')
    const d = String(value.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  const raw = String(value).trim()
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})/)
  return match ? match[1] : null
}

/** @param {string} isoDate YYYY-MM-DD */
export function parseDateOnly(isoDate) {
  const iso = toDateOnly(isoDate)
  if (!iso) return null
  const date = new Date(`${iso}T12:00:00`)
  return Number.isNaN(date.getTime()) ? null : date
}

/** @param {Date} date */
export function formatDateOnly(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * @param {string|Date} date
 * @param {number} days
 * @returns {string|null} YYYY-MM-DD
 */
export function addDays(date, days) {
  const base = typeof date === 'string' ? parseDateOnly(date) : date
  if (!base || Number.isNaN(base.getTime())) return null
  const next = new Date(base.getTime())
  next.setDate(next.getDate() + days)
  return formatDateOnly(next)
}

/** Domingo da semana que contém a data. @returns {string|null} YYYY-MM-DD */
export function startOfWeekSunday(date) {
  const d = typeof date === 'string' ? parseDateOnly(date) : date
  if (!d) return null
  const copy = new Date(d.getTime())
  copy.setDate(copy.getDate() - copy.getDay())
  return formatDateOnly(copy)
}

/** Sábado da semana que contém a data. @returns {string|null} YYYY-MM-DD */
export function endOfWeekSaturday(date) {
  const start = startOfWeekSunday(date)
  if (!start) return null
  return addDays(start, 6)
}

/**
 * Número da semana no mês (1ª = semana que contém o dia 1).
 * @param {string|Date} date
 * @param {number} [month] 0-11; default = mês da data
 * @param {number} [year]
 */
export function weekOfMonth(date, month, year) {
  const d = typeof date === 'string' ? parseDateOnly(date) : date
  if (!d) return null
  const m = month ?? d.getMonth()
  const y = year ?? d.getFullYear()
  const firstOfMonth = new Date(y, m, 1, 12, 0, 0)
  const firstWeekStart = startOfWeekSunday(firstOfMonth)
  const weekStart = startOfWeekSunday(d)
  if (!firstWeekStart || !weekStart) return null
  const first = parseDateOnly(firstWeekStart)
  const current = parseDateOnly(weekStart)
  if (!first || !current) return null
  const diff = Math.round((current.getTime() - first.getTime()) / (7 * MS_DAY))
  return diff + 1
}

/**
 * @param {string|Date} date
 * @returns {{
 *   weekStart: string,
 *   weekEnd: string,
 *   label: string,
 *   crossesMonth: boolean,
 * } | null}
 */
export function getCalendarWeek(date) {
  const weekStart = startOfWeekSunday(date)
  const weekEnd = endOfWeekSaturday(date)
  if (!weekStart || !weekEnd) return null

  const start = parseDateOnly(weekStart)
  const end = parseDateOnly(weekEnd)
  if (!start || !end) return null

  const crossesMonth =
    start.getMonth() !== end.getMonth() || start.getFullYear() !== end.getFullYear()

  let label
  if (crossesMonth) {
    const nStart = weekOfMonth(start, start.getMonth(), start.getFullYear())
    const nEnd = weekOfMonth(end, end.getMonth(), end.getFullYear())
    label = `${nStart}ª sem. ${MESES_ABREV[start.getMonth()]} / ${nEnd}ª sem. ${MESES_ABREV[end.getMonth()]}`
  } else {
    const n = weekOfMonth(start, start.getMonth(), start.getFullYear())
    label = `${n}ª semana de ${MESES[start.getMonth()]}`
  }

  return { weekStart, weekEnd, label, crossesMonth }
}

/**
 * Data mínima de entrega: criação + 14 dias corridos.
 * @param {string|Date} createdAt
 * @returns {string|null} YYYY-MM-DD
 */
export function minPrazoEntregaDate(createdAt) {
  const created = toDateOnly(createdAt)
  if (!created) return null
  return addDays(created, 14)
}

/** Domingo da primeira semana permitida (contém criação + 14 dias). */
export function minPrazoSemanaInicio(createdAt) {
  const minDate = minPrazoEntregaDate(createdAt)
  if (!minDate) return null
  return startOfWeekSunday(minDate)
}

export const PRAZO_SEMANA_HORIZON = 10

/**
 * Opções de prazo por semana de calendário.
 * @param {{
 *   createdAt: string|Date,
 *   isGestor?: boolean,
 *   weekCount?: number,
 *   selectedWeekStart?: string|null,
 * }} opts
 * @returns {{ value: string, label: string }[]}
 */
export function buildPrazoSemanaOptions({
  createdAt,
  isGestor = false,
  weekCount = PRAZO_SEMANA_HORIZON,
  selectedWeekStart = null,
}) {
  const created = toDateOnly(createdAt)
  if (!created) return []

  const minWeek = minPrazoSemanaInicio(created)
  const creationWeek = startOfWeekSunday(created)
  if (!minWeek || !creationWeek) return []

  const rangeStart = isGestor ? creationWeek : minWeek
  const startDate = parseDateOnly(rangeStart)
  if (!startDate) return []

  /** @type {Map<string, string>} */
  const byValue = new Map()

  for (let i = 0; i < weekCount; i += 1) {
    const weekDate = new Date(startDate.getTime())
    weekDate.setDate(weekDate.getDate() + i * 7)
    const week = getCalendarWeek(weekDate)
    if (!week) continue
    byValue.set(week.weekStart, week.label)
  }

  // Gestor: preenche também até cobrir o horizonte a partir do mínimo
  if (isGestor && minWeek > creationWeek) {
    const minStart = parseDateOnly(minWeek)
    if (minStart) {
      for (let i = 0; i < weekCount; i += 1) {
        const weekDate = new Date(minStart.getTime())
        weekDate.setDate(weekDate.getDate() + i * 7)
        const week = getCalendarWeek(weekDate)
        if (!week) continue
        byValue.set(week.weekStart, week.label)
      }
    }
  }

  const selected = toDateOnly(selectedWeekStart)
  if (selected && !byValue.has(selected)) {
    const week = getCalendarWeek(selected)
    if (week) byValue.set(week.weekStart, week.label)
  }

  return [...byValue.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([value, label]) => ({ value, label }))
}

/**
 * Valida se a semana pode ser escolhida pelo perfil.
 * @param {string} weekStart
 * @param {{
 *   createdAt: string|Date,
 *   isGestor?: boolean,
 *   previousWeekStart?: string|null,
 * }} opts
 */
export function isPrazoSemanaAllowed(
  weekStart,
  { createdAt, isGestor = false, previousWeekStart = null },
) {
  const start = toDateOnly(weekStart)
  if (!start || startOfWeekSunday(start) !== start) return false
  if (isGestor) return true
  const previous = toDateOnly(previousWeekStart)
  if (previous && previous === start) return true
  const minWeek = minPrazoSemanaInicio(createdAt)
  if (!minWeek) return false
  return start >= minWeek
}

/** Rótulo a partir do domingo persistido. */
export function formatPrazoSemanaLabel(weekStart) {
  const week = getCalendarWeek(weekStart)
  return week?.label ?? null
}
