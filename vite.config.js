import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/// <reference types="vitest/config" />

/**
 * Normaliza base path do Vite (sempre começa e termina com /).
 * Domínio próprio na raiz: /
 * Projeto GitHub Pages sem domínio: /NomeDoRepo/
 */
function normalizeBasePath(raw, mode) {
  const fallback = mode === 'production' ? '/' : '/'
  let base = String(raw ?? fallback).trim()
  if (!base) base = fallback
  if (!base.startsWith('/')) base = `/${base}`
  if (!base.endsWith('/')) base = `${base}/`
  return base === '//' ? '/' : base
}

function normalizeAppUrl(raw) {
  return String(raw || '')
    .trim()
    .replace(/\/$/, '')
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const base = normalizeBasePath(env.VITE_BASE_PATH, mode)
  const appUrl = normalizeAppUrl(env.VITE_APP_URL)

  return {
    base,
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (
              id.includes('node_modules/react-dom') ||
              id.includes('node_modules/react/')
            ) {
              return 'vendor-react'
            }
            if (id.includes('node_modules/react-router')) {
              return 'vendor-router'
            }
            if (id.includes('@supabase')) {
              return 'vendor-supabase'
            }
            if (id.includes('node_modules/xlsx')) {
              return 'vendor-xlsx'
            }
            if (id.includes('jspdf') || id.includes('html2canvas-pro') || id.includes('html2canvas')) {
              return 'vendor-pdf'
            }
          },
        },
      },
    },
    test: {
      environment: 'node',
      include: ['src/**/*.test.js'],
    },
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'aval-app-url-meta',
        transformIndexHtml(html) {
          if (!appUrl) return html

          const absoluteImage = `${appUrl}/og-image.png`
          let next = html
            .replace(
              /(<meta\s+property="og:image"\s+content=")[^"]*("\s*\/?>)/i,
              `$1${absoluteImage}$2`,
            )
            .replace(
              /(<meta\s+name="twitter:image"\s+content=")[^"]*("\s*\/?>)/i,
              `$1${absoluteImage}$2`,
            )

          if (!/property="og:url"/i.test(next)) {
            next = next.replace(
              /(<meta\s+property="og:title"[^>]*>)/i,
              `$1\n    <meta property="og:url" content="${appUrl}/" />`,
            )
          }
          return next
        },
      },
      {
        name: 'aval-spa-fallback',
        transformIndexHtml(html) {
          if (mode !== 'production') return html

          const redirectScript = `
    <script>
      (function () {
        var base = ${JSON.stringify(base)};
        var path = window.location.pathname;

        // GitHub Pages (projeto): garante que a URL comece com o base path.
        if (
          base !== '/' &&
          location.hostname.endsWith('github.io') &&
          !path.startsWith(base)
        ) {
          location.replace(base + location.search + location.hash);
          return;
        }

        if (path.endsWith('/index.html')) {
          window.history.replaceState(null, '', base);
        }
      })();
    </script>`
          return html.replace('</head>', `${redirectScript}\n  </head>`)
        },
      },
    ],
  }
})
