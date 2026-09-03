import { useCallback, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { PdfPreviewModal } from '../../components/pdf/PdfPreviewModal'
import {
  IconArrowLeft,
  IconCalendar,
  IconPackage,
  IconTruck,
} from '../../components/icons'
import { AlertMessage } from '../../components/ui/AlertMessage'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { PageHeader } from '../../components/ui/PageHeader'
import { useSyncPageLoading } from '../../contexts/PageLoadingContext'
import { useAbortableAsync } from '../../hooks/useAbortableAsync'
import {
  fetchPdfAssinadoLogistica,
  fetchPedidoAssinadoLogistica,
} from '../../services/logisticaService'
import { formatPrazoSemanaLabel } from '../../utils/calendarWeek'
import { formatShortDate } from '../../utils/formatShortDate'

function InfoRow({ label, value }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
      <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
        {label}
      </dt>
      <dd className="text-sm font-medium text-slate-900 sm:text-right">
        {value || '—'}
      </dd>
    </div>
  )
}

function freteLabel(row) {
  if (!row) return '—'
  const tipo = row.tipoFrete ? String(row.tipoFrete).toUpperCase() : null
  const rota = [row.origemFrete, row.destinoFrete].filter(Boolean).join(' → ')
  if (tipo && rota) return `${tipo} · ${rota}`
  if (tipo) return tipo
  if (rota) return rota
  return '—'
}

export function LogisticaPedidoDetalhePage() {
  const { simulationId } = useParams()
  const [row, setRow] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [pdfOpen, setPdfOpen] = useState(false)

  useSyncPageLoading(loading)

  useAbortableAsync(
    async (_signal, isActive) => {
      if (!simulationId) {
        if (isActive()) {
          setLoading(false)
          setError('Pedido não informado.')
        }
        return
      }
      setLoading(true)
      setError(null)
      const res = await fetchPedidoAssinadoLogistica(simulationId)
      if (!isActive()) return
      setLoading(false)
      if (!res.ok) {
        setError(res.error)
        setRow(null)
        return
      }
      setRow(res.data)
    },
    [simulationId],
  )

  const gerarPdf = useCallback(async () => {
    if (!row?.pdfSignedPath) {
      throw new Error('PDF assinado indisponível.')
    }
    const res = await fetchPdfAssinadoLogistica(row.pdfSignedPath)
    if (!res.ok || !res.blob) {
      throw new Error(res.error || 'Falha ao baixar o PDF.')
    }
    const nome = `pedido-assinado-${row.clientNome || simulationId}.pdf`
      .replace(/\s+/g, '-')
      .toLowerCase()
    return { blob: res.blob, nomePadrao: nome }
  }, [row, simulationId])

  if (!simulationId) {
    return <Navigate to="/logistica" replace />
  }

  return (
    <div className="w-full min-w-0 space-y-4 sm:space-y-6">
      <div className="flex items-center gap-3">
        <Link
          to="/logistica"
          className="inline-flex size-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-900"
          aria-label="Voltar"
        >
          <IconArrowLeft className="size-4" />
        </Link>
        <PageHeader
          eyebrow="Logística"
          title={row?.clientNome || 'Pedido assinado'}
          description="Resumo operacional e PDF assinado para entrega."
          className="mb-0 flex-1"
        />
      </div>

      {error ? <AlertMessage>{error}</AlertMessage> : null}

      {loading ? (
        <section className="rounded-2xl border border-slate-200/90 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
          Carregando…
        </section>
      ) : row ? (
        <>
          <Card className="space-y-4 p-5 sm:p-6">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                Assinado
              </span>
              {row.signedAt ? (
                <span className="text-xs text-slate-500">
                  em {formatShortDate(row.signedAt)}
                  {row.signerName ? ` · ${row.signerName}` : ''}
                </span>
              ) : null}
            </div>

            <dl className="space-y-3">
              <InfoRow label="Cliente" value={row.clientNome} />
              <InfoRow label="Fazenda" value={row.fazenda} />
              <InfoRow
                label="Local"
                value={[row.municipio, row.uf].filter(Boolean).join(' / ')}
              />
              <InfoRow
                label="Prazo de entrega"
                value={formatPrazoSemanaLabel(row.prazoSemanaInicio)}
              />
              <InfoRow label="Frete" value={freteLabel(row)} />
              <InfoRow label="Observações" value={row.observacoes} />
            </dl>
          </Card>

          <Card className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <div className="flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary-50 text-primary-700">
                <IconPackage className="size-5" />
              </span>
              <div>
                <p className="font-semibold text-slate-900">PDF assinado</p>
                <p className="text-sm text-slate-600">
                  Documento do pedido com a assinatura do cliente.
                </p>
              </div>
            </div>
            <Button
              type="button"
              disabled={!row.pdfSignedPath}
              onClick={() => setPdfOpen(true)}
            >
              Ver PDF assinado
            </Button>
          </Card>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-2 flex items-center gap-2 text-slate-500">
                <IconTruck className="size-4" />
                <span className="text-xs font-semibold uppercase tracking-[0.12em]">
                  Frete
                </span>
              </div>
              <p className="text-sm font-medium text-slate-900">
                {freteLabel(row)}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-2 flex items-center gap-2 text-slate-500">
                <IconCalendar className="size-4" />
                <span className="text-xs font-semibold uppercase tracking-[0.12em]">
                  Prazo
                </span>
              </div>
              <p className="text-sm font-medium text-slate-900">
                {formatPrazoSemanaLabel(row.prazoSemanaInicio) || '—'}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-2 flex items-center gap-2 text-slate-500">
                <IconPackage className="size-4" />
                <span className="text-xs font-semibold uppercase tracking-[0.12em]">
                  Destino
                </span>
              </div>
              <p className="text-sm font-medium text-slate-900">
                {[row.municipio, row.uf].filter(Boolean).join(' / ') || '—'}
              </p>
            </div>
          </div>
        </>
      ) : null}

      <PdfPreviewModal
        open={pdfOpen}
        onClose={() => setPdfOpen(false)}
        titulo="PDF assinado"
        gerador={gerarPdf}
        nomeFallback="pedido-assinado.pdf"
      />
    </div>
  )
}
