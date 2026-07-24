import { getAuthEmailDomain } from '../config/appEnv'

/**
 * Monta o e-mail corporativo a partir do login curto (ex.: `joao` → `joao@domínio`).
 * Se o usuário colar um e-mail completo, usa apenas a parte local antes do `@`.
 * Domínio vem de VITE_AUTH_EMAIL_DOMAIN.
 */
export function buildSyagriEmail(usernameOrLocal) {
  const trimmed = usernameOrLocal.trim().toLowerCase()
  if (!trimmed) return ''
  const local = trimmed.includes('@')
    ? (trimmed.split('@')[0] ?? '').trim()
    : trimmed
  if (!local) return ''
  return `${local}${getAuthEmailDomain()}`
}

/** Extrai o login curto a partir do e-mail corporativo. */
export function parseSyagriLocalFromEmail(email) {
  const trimmed = (email ?? '').trim().toLowerCase()
  if (!trimmed) return ''
  if (!trimmed.includes('@')) return trimmed
  return (trimmed.split('@')[0] ?? '').trim()
}

/** Exibe `local` + domínio corporativo configurado. */
export function formatCorporateEmail(localPart) {
  const local = (localPart ?? '').trim().toLowerCase()
  if (!local) return ''
  return `${local}${getAuthEmailDomain()}`
}
