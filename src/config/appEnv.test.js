import { afterEach, describe, expect, it, vi } from 'vitest'

describe('appEnv + corporate email', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('usa VITE_AUTH_EMAIL_DOMAIN ao montar e-mail', async () => {
    vi.stubEnv('VITE_AUTH_EMAIL_DOMAIN', 'aval.com.br')
    const { buildSyagriEmail, formatCorporateEmail } = await import(
      '../utils/syagriEmail.js'
    )
    expect(buildSyagriEmail('joao')).toBe('joao@aval.com.br')
    expect(formatCorporateEmail('maria')).toBe('maria@aval.com.br')
  })

  it('resolve URL absoluta a partir de VITE_APP_URL', async () => {
    vi.stubEnv('VITE_APP_URL', 'https://app.exemplo.com.br')
    const { resolveAppAbsoluteUrl, getAppUrl } = await import('./appEnv.js')
    expect(getAppUrl()).toBe('https://app.exemplo.com.br')
    expect(resolveAppAbsoluteUrl('/og-image.png')).toBe(
      'https://app.exemplo.com.br/og-image.png',
    )
  })
})
