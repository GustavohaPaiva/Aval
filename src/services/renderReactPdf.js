import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { buildPedidoPdfBlobFromElement } from './pedidoPdf'

function waitForPaint() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(resolve)
    })
  })
}

/**
 * Monta um nó React off-screen, captura PDF A4 via html2canvas e limpa o DOM.
 * Use com um snapshot congelado no clique — não releia estado vivo depois.
 *
 * @param {import('react').ReactNode} reactNode
 * @returns {Promise<Blob>}
 */
export async function buildPdfBlobFromReactNode(reactNode) {
  const host = document.createElement('div')
  host.setAttribute('aria-hidden', 'true')
  host.style.cssText =
    'position:fixed;left:-10000px;top:0;pointer-events:none;z-index:-1;'
  document.body.appendChild(host)

  const root = createRoot(host)
  try {
    flushSync(() => {
      root.render(reactNode)
    })
    await waitForPaint()

    const element =
      host.querySelector('.pedido-pdf-root') ?? host.firstElementChild
    if (!element) {
      throw new Error('Documento não disponível para geração.')
    }

    return await buildPedidoPdfBlobFromElement(element)
  } finally {
    root.unmount()
    host.remove()
  }
}
