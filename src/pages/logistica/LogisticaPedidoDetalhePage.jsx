import { useCallback, useMemo, useRef, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { EntregaParcialIndicador } from '../../components/logistica/EntregaParcialIndicador'
import { LogisticaStatusSelect } from '../../components/logistica/LogisticaStatusSelect'
import { ModalProgramarEntrega } from '../../components/logistica/ModalProgramarEntrega'
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
  formatItemLinha,
  formatVolumeTon,
  normalizeStatusLogistica,
  statusLogisticaLabel,
} from '../../constants/logisticaStatus'
import {
  itensComSaldo,
  montarCartoesLogistica,
  motivoBloqueioMovimento,
  moverStatusLogistica,
  opcoesStatusDoCard,
} from '../../constants/logisticaProgramacao'
import {
  statusBadgeClass,
  statusLabelPt,
} from '../../constants/simulationStatus'
import {
  atualizarStatusLogistica,
  fetchPdfAssinadoLogistica,
  fetchPedidoLogistica,
  programarEntregaLogistica,
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
  const [savingStatus, setSavingStatus] = useState(false)
  const [statusError, setStatusError] = useState(null)
  const [programacao, setProgramacao] = useState(null)
  const statusLock = useRef(false)

  const cards = useMemo(() => (row ? montarCartoesLogistica([row]) : []), [row])
  const saldoItens = useMemo(() => (row ? itensComSaldo(row) : []), [row])

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
      const res = await fetchPedidoLogistica(simulationId)
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

  async function recarregarPedido() {
    const res = await fetchPedidoLogistica(simulationId)
    if (res.ok) setRow(res.data)
    return res
  }

  async function changeStatus(card, nextStatus) {
    if (!row || !card || statusLock.current) return
    const bloqueio = motivoBloqueioMovimento(card, nextStatus)
    if (bloqueio === 'igual') return
    if (bloqueio === 'programar') {
      setStatusError(null)
      setProgramacao(card)
      return
    }
    if (bloqueio) {
      setStatusError({ message: bloqueio })
      return
    }

    const expected = normalizeStatusLogistica(card.statusLogistica)
    const previous = row
    const movido = moverStatusLogistica(row, { cardId: card.cardId, status: nextStatus })
    if (!movido.ok) {
      setStatusError({ message: movido.error || 'Não foi possível mover o pedido.' })
      return
    }

    statusLock.current = true
    setSavingStatus(true)
    setStatusError(null)
    setRow(movido.pedido)
    const res = await atualizarStatusLogistica({
      simulationId: row.simulationId,
      status: nextStatus,
      statusEsperado: expected,
      entregaId: card.entregaId,
    })
    if (!res.ok) {
      setRow(previous)
      statusLock.current = false
      setSavingStatus(false)
      setStatusError({
        message: res.error || 'Não foi possível salvar o status.',
        card,
        nextStatus,
      })
      return
    }
    await recarregarPedido()
    statusLock.current = false
    setSavingStatus(false)
  }

  async function confirmarProgramacao({ linhas, idempotencyKey }) {
    if (!programacao || statusLock.current) {
      return { ok: false, ignored: true }
    }
    statusLock.current = true
    setSavingStatus(true)
    const res = await programarEntregaLogistica({
      simulationId: programacao.simulationId,
      linhas,
      idempotencyKey,
    })
    if (!res.ok) {
      statusLock.current = false
      setSavingStatus(false)
      return res
    }
    setProgramacao(null)
    await recarregarPedido()
    statusLock.current = false
    setSavingStatus(false)
    return res
  }

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
          title={row?.clientNome || 'Pedido'}
          description="Dados do cliente, itens, entrega e PDF assinado, quando disponível."
          className="mb-0 flex-1"
        />
      </div>

      {error ? <AlertMessage>{error}</AlertMessage> : null}
      {statusError ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <AlertMessage className="flex-1">{statusError.message}</AlertMessage>
          {statusError.card ? (
            <Button
              type="button"
              variant="secondary"
              disabled={savingStatus || !row}
              onClick={() => {
                void changeStatus(statusError.card, statusError.nextStatus)
              }}
            >
              Tentar novamente
            </Button>
          ) : null}
        </div>
      ) : null}

      {loading ? (
        <section className="rounded-2xl border border-slate-200/90 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
          Carregando…
        </section>
      ) : row ? (
        <>
          <Card className="space-y-4 p-5 sm:p-6">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusBadgeClass(row.status, { ativo: row.ativo })}`}
              >
                {statusLabelPt(row.status, { ativo: row.ativo })}
              </span>
              <span
                className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                  row.assinado
                    ? 'bg-emerald-50 text-emerald-800'
                    : 'bg-slate-100 text-slate-700'
                }`}
              >
                {row.assinado ? 'Assinado' : 'Sem assinatura'}
              </span>
              {row.signedAt ? (
                <span className="text-xs text-slate-500">
                  em {formatShortDate(row.signedAt)}
                  {row.signerName ? ` · ${row.signerName}` : ''}
                </span>
              ) : null}
            </div>

            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                Status logístico
              </p>
              {cards.map((card) => (
                <div
                  key={card.cardId}
                  className="max-w-lg space-y-2 rounded-2xl border border-slate-200 bg-slate-50/70 p-3"
                >
                  <p className="text-sm font-semibold text-slate-900">
                    {card.entregaId ? 'Quantidade programada' : 'Saldo do pedido'}
                    <span className="ml-2 font-medium text-slate-500">
                      {statusLogisticaLabel(card.statusLogistica)}
                      {card.statusLogisticaEm
                        ? ` · ${formatShortDate(card.statusLogisticaEm)}`
                        : ''}
                    </span>
                  </p>
                  <EntregaParcialIndicador row={card} />
                  <LogisticaStatusSelect
                    value={normalizeStatusLogistica(card.statusLogistica)}
                    options={opcoesStatusDoCard(card)}
                    busy={savingStatus}
                    ariaLabel={
                      card.entregaId
                        ? 'Status da quantidade programada'
                        : 'Status do saldo do pedido'
                    }
                    onChange={(next) => {
                      void changeStatus(card, next)
                    }}
                  />
                  {savingStatus ? (
                    <p className="text-xs text-slate-500">Salvando…</p>
                  ) : null}
                </div>
              ))}
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

          <Card className="space-y-3 p-5 sm:p-6">
            <h2 className="text-sm font-semibold text-slate-900">Itens</h2>
            {saldoItens.length ? (
              <ul className="divide-y divide-slate-100">
                {saldoItens.map((item) => (
                  <li
                    key={item.id ?? formatItemLinha(item)}
                    className="flex items-start gap-2 py-2 text-sm text-slate-800"
                  >
                    <IconPackage className="mt-0.5 size-4 shrink-0 text-slate-400" />
                    <span>
                      {formatItemLinha({ ...item, volume: item.volumeOriginal })}
                      {item.volumeProgramadoItem > 0 ? (
                        <span className="mt-0.5 block text-xs text-slate-500">
                          Programado {formatVolumeTon(item.volumeProgramadoItem)} · Pendente{' '}
                          {formatVolumeTon(item.volumePendente)}
                        </span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">Nenhum item neste pedido.</p>
            )}
          </Card>

          <Card className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <div className="flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary-50 text-primary-700">
                <IconPackage className="size-5" />
              </span>
              <div>
                <p className="font-semibold text-slate-900">PDF assinado</p>
                <p className="text-sm text-slate-600">
                  {row.pdfSignedPath
                    ? 'Documento do pedido com a assinatura do cliente.'
                    : 'Pedido ainda sem assinatura do cliente.'}
                </p>
              </div>
            </div>
            <Button
              type="button"
              disabled={!row.pdfSignedPath}
              onClick={() => setPdfOpen(true)}
            >
              {row.pdfSignedPath ? 'Ver PDF assinado' : 'Aguardando assinatura'}
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

      <ModalProgramarEntrega
        open={Boolean(programacao)}
        pedido={programacao}
        saving={savingStatus}
        onClose={() => {
          if (!savingStatus) setProgramacao(null)
        }}
        onConfirm={confirmarProgramacao}
      />

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
