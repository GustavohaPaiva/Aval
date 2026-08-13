import { useEffect, useRef, useState } from 'react'
import { Button } from '../ui/Button'
import { baixarPdfBlob, ensurePdfBlob } from '../../utils/downloadPdfBlob'

/**
 * Preview de PDF via blob URL (evita iframe em URL assinada do Storage,
 * que vem com Content-Disposition: attachment e fica em branco).
 *
 * @param {{
 *   title?: string,
 *   blob?: Blob | null,
 *   loader?: () => Promise<Blob>,
 *   className?: string,
 *   nomeArquivo?: string,
 * }} props
 */
export function PdfInlinePreview({
  title = 'Documento',
  blob = null,
  loader,
  className = '',
  nomeArquivo = 'pedido.pdf',
}) {
  const [pdfUrl, setPdfUrl] = useState(null)
  const [pdfBlob, setPdfBlob] = useState(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState(null)
  const [baixando, setBaixando] = useState(false)
  const urlRef = useRef(null)

  useEffect(() => {
    let cancelado = false

    async function load() {
      setCarregando(true)
      setErro(null)
      try {
        const raw = blob || (typeof loader === 'function' ? await loader() : null)
        if (cancelado) return
        if (!raw) throw new Error('Documento indisponível.')
        const typed = ensurePdfBlob(raw)
        const url = URL.createObjectURL(typed)
        if (urlRef.current) URL.revokeObjectURL(urlRef.current)
        urlRef.current = url
        setPdfBlob(typed)
        setPdfUrl(url)
      } catch (e) {
        if (!cancelado) {
          setErro(e instanceof Error ? e.message : 'Erro ao carregar o PDF.')
          setPdfUrl(null)
          setPdfBlob(null)
        }
      } finally {
        if (!cancelado) setCarregando(false)
      }
    }

    void load()
    return () => {
      cancelado = true
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current)
        urlRef.current = null
      }
    }
  }, [blob, loader])

  return (
    <div
      className={[
        'flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2">
        <Button
          type="button"
          variant="secondary"
          className="h-9! px-3! text-xs"
          disabled={!pdfUrl || carregando}
          onClick={() => pdfUrl && window.open(pdfUrl, '_blank', 'noopener,noreferrer')}
        >
          Abrir PDF
        </Button>
        <Button
          type="button"
          variant="secondary"
          className="h-9! px-3! text-xs"
          disabled={!pdfBlob || carregando}
          loading={baixando}
          onClick={() => {
            if (!pdfBlob) return
            setBaixando(true)
            void baixarPdfBlob(pdfBlob, nomeArquivo).finally(() => setBaixando(false))
          }}
        >
          Baixar
        </Button>
      </div>

      <div className="relative min-h-0 flex-1 bg-slate-100">
        {carregando ? (
          <div className="flex h-full min-h-48 items-center justify-center text-sm font-medium text-slate-600">
            Carregando documento…
          </div>
        ) : null}

        {erro && !carregando ? (
          <div className="flex h-full min-h-48 items-center justify-center px-4 text-center text-sm text-red-600">
            {erro}
          </div>
        ) : null}

        {pdfUrl && !erro && !carregando ? (
          <iframe title={title} src={pdfUrl} className="h-full min-h-48 w-full bg-white" />
        ) : null}
      </div>
    </div>
  )
}
