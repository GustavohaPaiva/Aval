/**
 * Monta filtros PostgREST `.or()` com ILIKE, com valores entre aspas.
 * Sem aspas, espaço / vírgula / ponto (ex.: "Fazenda Silva" ou CPF
 * formatado) quebram o parser e a busca volta vazia.
 */

export function stripAccents(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

export function sanitizeIlikeNeedle(text) {
  return String(text ?? '')
    .replace(/[%_,"\\()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function quotePostgrestValue(value) {
  return `"${String(value).replace(/"/g, '')}"`
}

/**
 * @param {string[]} columns
 * @param {string} search
 * @returns {string | null}
 */
export function ilikeOrClause(columns, search) {
  const needle = sanitizeIlikeNeedle(search)
  if (!needle || columns.length === 0) return null

  const variants = [...new Set([needle, stripAccents(needle)].filter(Boolean))]
  const parts = []
  for (const col of columns) {
    for (const variant of variants) {
      parts.push(`${col}.ilike.${quotePostgrestValue(`%${variant}%`)}`)
    }
  }
  return parts.join(',')
}
