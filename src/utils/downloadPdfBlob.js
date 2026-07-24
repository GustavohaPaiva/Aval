/**
 * Dispara download de um Blob PDF com nome sugerido.
 * Usa showSaveFilePicker quando disponível (usuário escolhe pasta/arquivo).
 */
export async function baixarPdfBlob(blob, nomeArquivo) {
  const nome = nomeArquivo || 'documento.pdf'

  if (typeof window.showSaveFilePicker === 'function') {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: nome,
        types: [
          {
            description: 'Arquivo PDF',
            accept: { 'application/pdf': ['.pdf'] },
          },
        ],
      })
      const writable = await handle.createWritable()
      await writable.write(blob)
      await writable.close()
      return true
    } catch (err) {
      if (err?.name === 'AbortError') return false
      console.error('[baixarPdfBlob] showSaveFilePicker:', err)
    }
  }

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nome
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
  return true
}
