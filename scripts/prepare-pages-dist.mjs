import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const distDir = 'dist'

/** Carrega .env local no processo (CI já injeta via workflow). */
function loadDotEnv() {
  const envPath = '.env'
  if (!existsSync(envPath)) return
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (!(key in process.env)) process.env[key] = value
  }
}

loadDotEnv()

copyFileSync(join(distDir, 'index.html'), join(distDir, '404.html'))
writeFileSync(join(distDir, '.nojekyll'), '')

/**
 * Preserva o custom domain no branch gh-pages.
 * Sem este arquivo, force_orphan do deploy apaga o CNAME do GitHub Pages.
 */
const appUrl = String(process.env.VITE_APP_URL || '')
  .trim()
  .replace(/^https?:\/\//i, '')
  .replace(/\/.*$/, '')

if (appUrl && !appUrl.endsWith('github.io')) {
  writeFileSync(join(distDir, 'CNAME'), `${appUrl}\n`)
  console.log(`GitHub Pages: CNAME gerado → ${appUrl}`)
} else {
  console.log('GitHub Pages: CNAME não gerado (VITE_APP_URL ausente ou github.io)')
}

console.log('GitHub Pages: 404.html e .nojekyll gerados em dist/')
