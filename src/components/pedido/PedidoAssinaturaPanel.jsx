import { useCallback, useState } from 'react'
import { AlertMessage } from '../ui/AlertMessage'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { PdfPreviewModal } from '../pdf/PdfPreviewModal'
import { resolveAssinaturaPublicUrl } from '../../config/appEnv'
import { useAbortableAsync } from '../../hooks/useAbortableAsync'
import {
  assinaturaStatusLabel,
  criarLinkAssinatura,
  downloadPedidoDocumento,
  fetchPedidoAssinaturas,
  normalizeAssinaturaStatus,
  revogarLinkAssinatura,
} from '../../services/pedidoAssinaturaService'

/**
 * Painel de link público de assinatura no pedido autenticado.
 */
export function PedidoAssinaturaPanel({
  simulationId,
  canManage,
  buildPdfBlob,
  buildSnapshot,
  persistBeforeCreate,
  disabled = false,
}) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [reloadKey, setReloadKey] = useState(0)
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState(null)
  const [banner, setBanner] = useState(null)
  const [copiedId, setCopiedId] = useState(null)
  const [pdfPreview, setPdfPreview] = useState(null)

  useAbortableAsync(
    async (_signal, isActive) => {
      setLoading(true)
      setError(null)
      const res = await fetchPedidoAssinaturas(simulationId)
      if (!isActive()) return
      setLoading(false)
      if (!res.ok) {
        setError(res.error)
        setRows([])
        return
      }
      setRows(res.data)
    },
    [simulationId, reloadKey],
  )

  const reload = useCallback(() => {
    setReloadKey((k) => k + 1)
  }, [])

  async function handleGerarLink() {
    if (!canManage || !buildPdfBlob || !buildSnapshot) return
    setError(null)
    setBanner(null)
    setBusy('create')
    try {
      if (persistBeforeCreate) {
        const saved = await persistBeforeCreate()
        if (!saved?.ok) {
          setError(saved?.error || 'Não foi possível salvar o pedido.')
          return
        }
      }

      const snapshot = buildSnapshot()
      const pdfBlob = await buildPdfBlob(snapshot)
      const res = await criarLinkAssinatura({
        simulationId,
        pdfBlob,
        pedidoSnapshot: snapshot,
      })
      if (!res.ok) {
        setError(res.error)
        return
      }
      setBanner('Link de assinatura gerado.')
      reload()
      if (res.data?.link) {
        try {
          await navigator.clipboard.writeText(res.data.link)
          setCopiedId(res.data.id)
          setBanner('Link de assinatura gerado e copiado.')
        } catch {
          // clipboard pode falhar; link ainda aparece na lista
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao gerar link.')
    } finally {
      setBusy(null)
    }
  }

  async function handleCopiar(row) {
    const link = resolveAssinaturaPublicUrl(row.token)
    try {
      await navigator.clipboard.writeText(link)
      setCopiedId(row.id)
      setBanner('Link copiado.')
      setError(null)
    } catch {
      setError('Não foi possível copiar. Copie manualmente o link.')
    }
  }

  async function handleRevogar(row) {
    if (!window.confirm('Revogar este link de assinatura?')) return
    setBusy(`revoke-${row.id}`)
    setError(null)
    const res = await revogarLinkAssinatura(row.id)
    setBusy(null)
    if (!res.ok) {
      setError(res.error)
      return
    }
    setBanner('Link revogado.')
    reload()
  }

  async function handleVerPdf(row, kind) {
    const path =
      kind === 'signed' ? row.pdf_signed_path : row.pdf_original_path
    const titulo = kind === 'signed' ? 'PDF assinado' : 'PDF original'
    const nomeArquivo =
      kind === 'signed' ? 'pedido-assinado.pdf' : 'pedido.pdf'
    setBusy(`download-${row.id}-${kind}`)
    setError(null)
    const res = await downloadPedidoDocumento(path)
    setBusy(null)
    if (!res.ok) {
      setError(res.error)
      return
    }
    const blob = res.blob
    setPdfPreview({
      titulo,
      nomeFallback: nomeArquivo,
      gerador: async () => ({ blob, nomePadrao: nomeArquivo }),
    })
  }

  return (
    <Card className="mb-6 rounded-3xl">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-primary-800">
            Assinatura do cliente
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Gere um link exclusivo para o cliente assinar o PDF deste pedido.
          </p>
        </div>
        {canManage ? (
          <Button
            type="button"
            variant="secondary"
            loading={busy === 'create'}
            disabled={disabled || Boolean(busy)}
            onClick={() => void handleGerarLink()}
          >
            {busy === 'create' ? 'Gerando…' : 'Gerar link de assinatura'}
          </Button>
        ) : null}
      </div>

      {error ? <AlertMessage className="mb-3">{error}</AlertMessage> : null}
      {banner ? (
        <div className="mb-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900">
          {banner}
        </div>
      ) : null}

      {loading ? (
        <p className="text-sm text-slate-500">Carregando links…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-500">
          Nenhum link gerado ainda para este pedido.
        </p>
      ) : (
        <ul className="space-y-3">
          {rows.slice(0, 5).map((row) => {
            const status = normalizeAssinaturaStatus(row)
            const link = resolveAssinaturaPublicUrl(row.token)
            return (
              <li
                key={row.id}
                className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">
                      {assinaturaStatusLabel(status)}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {status === 'signed' && row.signer_name
                        ? `Assinado por ${row.signer_name}`
                        : row.expires_at
                          ? `Expira em ${new Date(row.expires_at).toLocaleString('pt-BR')}`
                          : null}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {status === 'pending' ? (
                      <>
                        <Button
                          type="button"
                          variant="secondary"
                          className="px-3! py-1.5! text-xs"
                          disabled={Boolean(busy)}
                          onClick={() => void handleCopiar(row)}
                        >
                          {copiedId === row.id ? 'Copiado' : 'Copiar link'}
                        </Button>
                        {canManage ? (
                          <Button
                            type="button"
                            variant="secondary"
                            className="px-3! py-1.5! text-xs"
                            loading={busy === `revoke-${row.id}`}
                            disabled={Boolean(busy)}
                            onClick={() => void handleRevogar(row)}
                          >
                            Revogar
                          </Button>
                        ) : null}
                      </>
                    ) : null}
                    {status === 'signed' && row.pdf_signed_path ? (
                      <Button
                        type="button"
                        variant="secondary"
                        className="px-3! py-1.5! text-xs"
                        loading={busy === `download-${row.id}-signed`}
                        disabled={Boolean(busy)}
                        onClick={() => void handleVerPdf(row, 'signed')}
                      >
                        Ver PDF assinado
                      </Button>
                    ) : null}
                    {row.pdf_original_path ? (
                      <Button
                        type="button"
                        variant="secondary"
                        className="px-3! py-1.5! text-xs"
                        loading={busy === `download-${row.id}-original`}
                        disabled={Boolean(busy)}
                        onClick={() => void handleVerPdf(row, 'original')}
                      >
                        Ver PDF original
                      </Button>
                    ) : null}
                  </div>
                </div>
                {status === 'pending' ? (
                  <p className="mt-2 break-all text-xs text-slate-500">{link}</p>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}

      <PdfPreviewModal
        open={Boolean(pdfPreview)}
        onClose={() => setPdfPreview(null)}
        titulo={pdfPreview?.titulo}
        gerador={pdfPreview?.gerador}
        nomeFallback={pdfPreview?.nomeFallback}
      />
    </Card>
  )
}
