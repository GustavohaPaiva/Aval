import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '../ui/Button'
import { baixarPdfBlob } from '../../utils/downloadPdfBlob'

/**
 * Pré-visualização de PDF (estilo Montezuma): iframe + download com Salvar como.
 *
 * @param {{
 *   open: boolean,
 *   onClose: () => void,
 *   titulo?: string,
 *   gerador: () => Promise<{ blob: Blob, nomePadrao?: string } | Blob>,
 *   nomeFallback?: string,
 * }} props
 */
export function PdfPreviewModal({
  open,
  onClose,
  titulo = 'Visualizar documento',
  gerador,
  nomeFallback = 'documento.pdf',
}) {
  const [pdfUrl, setPdfUrl] = useState(null)
  const [nomeArquivo, setNomeArquivo] = useState(nomeFallback)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState(null)
  const [baixando, setBaixando] = useState(false)
  const pdfUrlRef = useRef(null)

  useEffect(() => {
    if (!open || typeof gerador !== 'function') return undefined

    let cancelado = false

    queueMicrotask(() => {
      if (cancelado) return
      setCarregando(true)
      setErro(null)
      setNomeArquivo(nomeFallback)
      if (pdfUrlRef.current) {
        URL.revokeObjectURL(pdfUrlRef.current)
        pdfUrlRef.current = null
        setPdfUrl(null)
      }
    })

    ;(async () => {
      try {
        const resultado = await gerador()
        if (cancelado) return
        const blob = resultado?.blob ?? resultado
        if (!blob || !(blob instanceof Blob)) {
          throw new Error('Não foi possível gerar o documento.')
        }
        const url = URL.createObjectURL(blob)
        pdfUrlRef.current = url
        setNomeArquivo(resultado?.nomePadrao || nomeFallback)
        setPdfUrl(url)
      } catch (e) {
        if (!cancelado) {
          console.error('[PdfPreviewModal]', e)
          setErro(e instanceof Error ? e.message : 'Erro ao gerar o documento.')
        }
      } finally {
        if (!cancelado) setCarregando(false)
      }
    })()

    return () => {
      cancelado = true
      if (pdfUrlRef.current) {
        URL.revokeObjectURL(pdfUrlRef.current)
        pdfUrlRef.current = null
      }
    }
  }, [open, gerador, nomeFallback])

  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  const handleBaixar = async () => {
    if (!pdfUrl) return
    setBaixando(true)
    try {
      const res = await fetch(pdfUrl)
      const blob = await res.blob()
      await baixarPdfBlob(blob, nomeArquivo)
    } catch (e) {
      console.error('[PdfPreviewModal] download:', e)
    } finally {
      setBaixando(false)
    }
  }

  const handleAbrirNovaAba = () => {
    if (!pdfUrl) return
    window.open(pdfUrl, '_blank', 'noopener,noreferrer')
  }

  if (!open) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-slate-900/40 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label={titulo}
    >
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 bg-white px-4 py-3 shadow-sm sm:px-6 sm:py-4">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/80">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden
            >
              <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-bold uppercase tracking-tight text-slate-800 sm:text-base">
              {titulo}
            </h2>
            <p className="truncate text-xs text-slate-500">{nomeArquivo}</p>
          </div>
        </div>

        <div className="flex w-full shrink-0 flex-wrap items-center justify-end gap-2 sm:w-auto">
          <Button
            type="button"
            variant="secondary"
            className="min-h-11 flex-1 sm:flex-initial"
            onClick={handleAbrirNovaAba}
            disabled={!pdfUrl || carregando}
          >
            Nova aba
          </Button>
          <Button
            type="button"
            variant="primary"
            className="min-h-11 flex-1 sm:flex-initial"
            onClick={() => void handleBaixar()}
            disabled={!pdfUrl || carregando}
            loading={baixando}
          >
            {baixando ? 'Salvando…' : 'Baixar PDF'}
          </Button>
          <button
            type="button"
            onClick={onClose}
            className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:bg-slate-50 hover:text-slate-800"
            aria-label="Fechar"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden
            >
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>
      </header>

      <div className="relative min-h-0 flex-1 bg-gradient-to-b from-slate-100 to-slate-200 p-3 sm:p-4">
        {carregando ? (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-slate-100">
            <svg
              className="size-10 animate-spin text-emerald-700"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              aria-hidden
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            <p className="text-sm font-semibold text-slate-700">
              Gerando documento…
            </p>
          </div>
        ) : null}

        {erro && !carregando ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
            <div className="max-w-md rounded-2xl border border-red-100 bg-white p-8 shadow-lg">
              <p className="text-base font-semibold text-red-600">{erro}</p>
              <Button
                type="button"
                variant="secondary"
                className="mt-4"
                onClick={onClose}
              >
                Fechar
              </Button>
            </div>
          </div>
        ) : null}

        {pdfUrl && !erro ? (
          <iframe
            src={`${pdfUrl}#toolbar=1&navpanes=0`}
            title={titulo}
            className="h-full w-full rounded-xl border border-slate-200/80 bg-white shadow-md"
          />
        ) : null}
      </div>
    </div>,
    document.body,
  )
}
