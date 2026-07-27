/**
 * Convenções de login de consultor:
 * - usuário: primeiro.ultimo (minúsculo, sem acento)
 * - senha: CPF/CNPJ apenas dígitos (11 ou 14)
 */

export function stripDiacritics(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

export function normalizePersonName(nome) {
  return String(nome ?? '')
    .replace(/^#+/, '')
    .trim()
    .replace(/\s+/g, ' ')
}

/** CPF/CNPJ → só dígitos; números de planilha são zero-padded para 11. */
export function normalizeDocumentDigits(raw) {
  if (raw == null || raw === '') return ''

  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const asInt = Math.trunc(raw)
    const digits = String(asInt)
    if (digits.length <= 11) return digits.padStart(11, '0')
    if (digits.length <= 14) return digits.padStart(14, '0')
    return digits
  }

  const digits = String(raw).replace(/\D/g, '')
  return digits
}

export function isValidDocumentPassword(digits) {
  return digits.length === 11 || digits.length === 14
}

/**
 * Gera local-part `primeiro.ultimo` a partir do nome completo.
 * Sufixos (Junior/Filho) permanecem se forem a última palavra.
 */
export function buildFirstLastUsername(nomeCompleto) {
  const cleaned = normalizePersonName(nomeCompleto)
  if (!cleaned) return ''

  const parts = stripDiacritics(cleaned)
    .toLowerCase()
    .split(/\s+/)
    .map((p) => p.replace(/[^a-z0-9]/g, ''))
    .filter(Boolean)

  if (parts.length === 0) return ''
  if (parts.length === 1) return parts[0]
  return `${parts[0]}.${parts[parts.length - 1]}`
}

/** Evita colisão: base, base2, base3… */
export function uniquifyUsername(base, used) {
  let candidate = base
  let n = 2
  while (used.has(candidate)) {
    candidate = `${base}${n}`
    n += 1
  }
  used.add(candidate)
  return candidate
}
