import html2canvas from 'html2canvas-pro'
import { jsPDF } from 'jspdf'

/**
 * Gera Blob PDF A4 a partir de um elemento HTML (proposta / pedido).
 * Fatia o canvas por página e aplica margem em todos os lados —
 * inclusive no topo das páginas após a quebra.
 */
export async function buildPedidoPdfBlobFromElement(element) {
  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    logging: false,
    backgroundColor: '#ffffff',
    windowWidth: element.scrollWidth,
    windowHeight: element.scrollHeight,
  })

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  })

  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const margin = 10
  const contentWidth = pageWidth - margin * 2
  const contentHeight = pageHeight - margin * 2

  const imgWidthMm = contentWidth
  const imgHeightMm = (canvas.height * imgWidthMm) / canvas.width
  const pxPerMm = canvas.width / imgWidthMm
  const sliceHeightPx = contentHeight * pxPerMm

  let offsetMm = 0
  let pageIndex = 0

  while (offsetMm < imgHeightMm - 0.5) {
    if (pageIndex > 0) pdf.addPage()

    const srcY = offsetMm * pxPerMm
    const srcHeight = Math.min(sliceHeightPx, canvas.height - srcY)
    const destHeightMm = srcHeight / pxPerMm

    const pageCanvas = document.createElement('canvas')
    pageCanvas.width = canvas.width
    pageCanvas.height = Math.max(1, Math.ceil(srcHeight))
    const ctx = pageCanvas.getContext('2d')
    if (!ctx) {
      throw new Error('Não foi possível preparar a página do PDF.')
    }
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height)
    ctx.drawImage(
      canvas,
      0,
      srcY,
      canvas.width,
      srcHeight,
      0,
      0,
      canvas.width,
      srcHeight,
    )

    const pageImg = pageCanvas.toDataURL('image/png')
    pdf.addImage(pageImg, 'PNG', margin, margin, imgWidthMm, destHeightMm)

    offsetMm += contentHeight
    pageIndex += 1
  }

  return pdf.output('blob')
}
