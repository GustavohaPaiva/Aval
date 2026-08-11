import html2canvas from 'html2canvas-pro'
import { jsPDF } from 'jspdf'

const PDF_MARGIN_MM = 10
/** JPEG reduz muito o tamanho vs PNG (html2canvas gera bitmaps). */
const PDF_IMAGE_MIME = 'image/jpeg'
const PDF_IMAGE_FORMAT = 'JPEG'
const PDF_JPEG_QUALITY = 0.82

/**
 * Fatia um canvas em páginas A4 e adiciona ao PDF.
 * @param {import('jspdf').jsPDF} pdf
 * @param {HTMLCanvasElement} canvas
 * @param {{ isFirstSliceOfDocument: boolean }} options
 */
function appendCanvasSlices(pdf, canvas, { isFirstSliceOfDocument }) {
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const contentWidth = pageWidth - PDF_MARGIN_MM * 2
  const contentHeight = pageHeight - PDF_MARGIN_MM * 2

  const imgWidthMm = contentWidth
  const imgHeightMm = (canvas.height * imgWidthMm) / canvas.width
  const pxPerMm = canvas.width / imgWidthMm
  const sliceHeightPx = contentHeight * pxPerMm

  let offsetMm = 0
  let sliceIndex = 0

  while (offsetMm < imgHeightMm - 0.5) {
    const isVeryFirstSlice = isFirstSliceOfDocument && sliceIndex === 0
    if (!isVeryFirstSlice) {
      pdf.addPage()
    }

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

    const pageImg = pageCanvas.toDataURL(PDF_IMAGE_MIME, PDF_JPEG_QUALITY)
    pdf.addImage(
      pageImg,
      PDF_IMAGE_FORMAT,
      PDF_MARGIN_MM,
      PDF_MARGIN_MM,
      imgWidthMm,
      destHeightMm,
      undefined,
      'FAST',
    )

    offsetMm += contentHeight
    sliceIndex += 1
  }

  return sliceIndex
}

async function captureElement(element) {
  return html2canvas(element, {
    scale: 1.5,
    useCORS: true,
    logging: false,
    backgroundColor: '#ffffff',
    windowWidth: element.scrollWidth,
    windowHeight: element.scrollHeight,
  })
}

/**
 * Gera Blob PDF A4 a partir de um elemento HTML (proposta / pedido).
 * Fatia o canvas por página e aplica margem em todos os lados —
 * inclusive no topo das páginas após a quebra.
 *
 * Filhos diretos `.pedido-pdf-page` definem quebras explícitas entre seções;
 * cada seção alta continua paginando automaticamente.
 */
export async function buildPedidoPdfBlobFromElement(element) {
  const pageNodes = Array.from(element.children).filter((child) =>
    child.classList?.contains('pedido-pdf-page'),
  )
  const sections = pageNodes.length > 0 ? pageNodes : [element]

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  })

  let documentHasContent = false

  for (const section of sections) {
    const canvas = await captureElement(section)
    const slices = appendCanvasSlices(pdf, canvas, {
      isFirstSliceOfDocument: !documentHasContent,
    })
    if (slices > 0) documentHasContent = true
  }

  return pdf.output('blob')
}
