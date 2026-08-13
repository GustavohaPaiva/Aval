/**
 * Garante MIME application/pdf para o viewer nativo do browser.
 * @param {Blob} blob
 * @returns {Blob}
 */
export function ensurePdfBlob(blob) {
  if (!(blob instanceof Blob) || blob.size < 8) {
    throw new Error('Documento PDF inválido.')
  }
  if (blob.type === 'application/pdf') return blob
  return blob.slice(0, blob.size, 'application/pdf')
}

/**
 * Baixa um PDF remoto e retorna Blob com MIME correto.
 * @param {string} url
 * @returns {Promise<Blob>}
 */
export async function fetchPdfBlob(url) {
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error('Não foi possível carregar o PDF.')
  }
  return ensurePdfBlob(await res.blob())
}

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
