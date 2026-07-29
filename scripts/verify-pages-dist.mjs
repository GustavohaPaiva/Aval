import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const distDir = 'dist'

/**
 * Bloqueia publish se o bundle embutir chave Gemini / Google API.
 * GitHub Push Protection rejeita o push de gh-pages quando isso acontece.
 */
const SECRET_PATTERNS = [
  {
    name: 'GCP / Gemini API key (AQ.)',
    re: /AQ\.[A-Za-z0-9_-]{20,}/g,
  },
  {
    name: 'Google API key (AIza)',
    re: /AIza[0-9A-Za-z_-]{20,}/g,
  },
]

function walk(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) out.push(...walk(path))
    else if (/\.(js|html|css|json|txt|map)$/i.test(name)) out.push(path)
  }
  return out
}

if (!existsSync(distDir)) {
  console.error(`verify-pages-dist: pasta ${distDir}/ não encontrada`)
  process.exit(1)
}

const hits = []
for (const file of walk(distDir)) {
  const text = readFileSync(file, 'utf8')
  for (const { name, re } of SECRET_PATTERNS) {
    re.lastIndex = 0
    if (re.test(text)) {
      hits.push({ file, name })
    }
  }
}

if (hits.length) {
  console.error('verify-pages-dist: possível segredo no dist (não publicar):')
  for (const h of hits) {
    console.error(`  - ${h.name} em ${h.file}`)
  }
  console.error(
    'Build de Pages não deve incluir VITE_GEMINI_API_KEY. Use: VITE_GEMINI_API_KEY= npm run build',
  )
  process.exit(1)
}

console.log('verify-pages-dist: ok (sem chave Gemini/Google no dist)')
