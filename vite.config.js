import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/// <reference types="vitest/config" />

// GitHub Pages: https://gustavohapaiva.github.io/Syagri/
const pagesBase = '/Syagri/'

export default defineConfig(({ mode }) => ({
  base: mode === 'production' ? pagesBase : '/',
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react-dom') || id.includes('node_modules/react/')) {
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
          if (id.includes('jspdf') || id.includes('html2canvas')) {
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
      name: 'syagri-spa-fallback',
      transformIndexHtml(html) {
        if (mode !== 'production') return html
        const redirectScript = `
    <script>
      (function () {
        var base = ${JSON.stringify(pagesBase)};
        var path = window.location.pathname;
        if (path.endsWith('/index.html')) {
          window.history.replaceState(null, '', base);
        }
      })();
    </script>`
        return html.replace('</head>', `${redirectScript}\n  </head>`)
      },
    },
  ],
}))
