/**
 * Configuração pública da aplicação (somente variáveis VITE_*).
 * Troca de domínio / path de deploy / e-mail corporativo = só env, sem alterar código.
 */

function trimEnv(value) {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * URL canônica do app, sem barra final.
 * Ex. atual: https://gustavohapaiva.github.io/Syagri
 * Ex. futuro: https://aval-fertilizantes.online
 */
export function getAppUrl() {
  return trimEnv(import.meta.env.VITE_APP_URL).replace(/\/$/, '')
}

/**
 * Domínio de e-mail corporativo com @. Ex.: @syagri.com.br
 * Aceita VITE_AUTH_EMAIL_DOMAIN com ou sem @.
 */
export function getAuthEmailDomain() {
  const raw = trimEnv(import.meta.env.VITE_AUTH_EMAIL_DOMAIN).toLowerCase()
  if (!raw) return '@syagri.com.br'
  return raw.startsWith('@') ? raw : `@${raw}`
}

/** Base path do Vite (sempre com / final), ex.: / ou /Syagri/ */
export function getAppBasePath() {
  const base = trimEnv(import.meta.env.BASE_URL) || '/'
  return base.endsWith('/') ? base : `${base}/`
}

/**
 * URL absoluta a partir de um path do app (ex.: /og-image.png).
 * Prefere VITE_APP_URL; senão usa window.location em runtime.
 */
export function resolveAppAbsoluteUrl(path = '/') {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  const configured = getAppUrl()
  if (configured) {
    return normalizedPath === '/'
      ? `${configured}/`
      : `${configured}${normalizedPath}`
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    const base = getAppBasePath().replace(/\/$/, '')
    return `${window.location.origin}${base}${normalizedPath === '/' ? '/' : normalizedPath}`
  }
  return normalizedPath
}

/**
 * Link público de assinatura.
 * Usa a origem da aba atual para o link funcionar no mesmo ambiente
 * (localhost em dev; domínio canônico em produção já publicado).
 */
export function resolveAssinaturaPublicUrl(token) {
  const safeToken = encodeURIComponent(String(token ?? '').trim())
  const path = `/assinar/${safeToken}`
  if (typeof window !== 'undefined' && window.location?.origin) {
    const base = getAppBasePath().replace(/\/$/, '')
    return `${window.location.origin}${base}${path}`
  }
  return resolveAppAbsoluteUrl(path)
}

/**
 * Destino padrão para fluxos Auth com redirect (recovery, magic link, OAuth).
 * Hoje o login é só senha (sem redirectTo), mas Site URL / Redirect URLs
 * no painel do Supabase ainda usam este valor quando houver e-mails Auth.
 */
export function getAuthRedirectTo() {
  const url = getAppUrl()
  return url ? `${url}/` : undefined
}
