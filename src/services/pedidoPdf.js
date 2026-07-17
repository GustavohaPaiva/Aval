import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'

/**
 * Gera PDF A4 a partir de um elemento HTML (proposta / pedido).
 * Pagina automaticamente quando o conteúdo excede uma página.
 */
export async function downloadPedidoPdfFromElement(element, filename) {
  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    logging: false,
    backgroundColor: '#ffffff',
    windowWidth: element.scrollWidth,
    windowHeight: element.scrollHeight,
  })

  const imgData = canvas.toDataURL('image/png')
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  })

  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const margin = 6
  const contentWidth = pageWidth - margin * 2
  const contentHeight = pageHeight - margin * 2

  const imgWidth = contentWidth
  const imgHeight = (canvas.height * imgWidth) / canvas.width

  let heightLeft = imgHeight
  let position = margin

  pdf.addImage(imgData, 'PNG', margin, position, imgWidth, imgHeight)
  heightLeft -= contentHeight

  while (heightLeft > 1) {
    position = margin - (imgHeight - heightLeft)
    pdf.addPage()
    pdf.addImage(imgData, 'PNG', margin, position, imgWidth, imgHeight)
    heightLeft -= contentHeight
  }

  pdf.save(filename)
}
