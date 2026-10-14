import { useState } from 'react'
import {
  LOGISTICA_COLUMN_CLASS,
  LOGISTICA_STATUS_FLOW,
  PRAZO_INDICADOR_LABEL,
  formatItemLinha,
  groupPedidosPorStatus,
  normalizeStatusLogistica,
  prazoIndicador,
} from '../../constants/logisticaStatus'
import {
  statusBadgeClass,
  statusLabelPt,
} from '../../constants/simulationStatus'
import { IconCalendar, IconPackage } from '../icons'
import { Button } from '../ui/Button'
import { formatPrazoSemanaLabel } from '../../utils/calendarWeek'
import { formatShortDate } from '../../utils/formatShortDate'
import { EntregaParcialIndicador } from './EntregaParcialIndicador'
import { LogisticaStatusSelect } from './LogisticaStatusSelect'
import { opcoesStatusDoCard } from '../../constants/logisticaProgramacao'

function localLabel(municipio, uf) {
  const parts = [municipio, uf].filter(Boolean)
  return parts.length ? parts.join(' / ') : null
}

function shortId(simulationId) {
  return String(simulationId ?? '').slice(0, 8)
}

function chaveCard(row) {
  return row.cardId || row.simulationId
}

function PedidoCard({ row, moving, onMove, onOpen, onDragChange }) {
  const status = normalizeStatusLogistica(row.statusLogistica)
  const prazo = prazoIndicador(row.prazoSemanaInicio, status)
  const local = localLabel(row.municipio, row.uf)
  const itens = row.itens ?? []
  const visiveis = itens.slice(0, 2)
  const restantes = Math.max(0, itens.length - visiveis.length)
  const chave = chaveCard(row)

  return (
    <article
      className={[
        'flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm',
        moving ? 'opacity-60' : '',
      ].join(' ')}
      aria-busy={moving || undefined}
    >
      <header
        draggable={!moving}
        title="Arraste para outra coluna"
        onDragStart={(event) => {
          event.dataTransfer.setData('text/plain', chave)
          event.dataTransfer.effectAllowed = 'move'
          onDragChange(chave)
        }}
        onDragEnd={() => onDragChange(null)}
        className="cursor-grab rounded-xl touch-manipulation active:cursor-grabbing"
      >
        <div className="flex items-start justify-between gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
            {shortId(row.simulationId)}
          </p>
          <span
            className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusBadgeClass(row.status, { ativo: row.ativo })}`}
          >
            {statusLabelPt(row.status, { ativo: row.ativo })}
          </span>
        </div>
        <h3 className="mt-1 text-sm font-semibold leading-snug text-slate-900">
          {row.clientNome}
        </h3>
        {row.entregaParcial ? (
          <p className="mt-0.5 text-[11px] font-semibold text-amber-800">
            {row.entregaId ? 'Quantidade programada' : 'Saldo ainda na carteira'}
          </p>
        ) : null}
        {row.fazenda ? (
          <p className="mt-0.5 text-xs text-slate-600">{row.fazenda}</p>
        ) : null}
      </header>

      <div className="flex flex-wrap gap-1.5">
        <span
          className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${
            row.assinado
              ? 'bg-emerald-50 text-emerald-800'
              : 'bg-slate-100 text-slate-600'
          }`}
        >
          {row.assinado ? 'Assinado' : 'Sem assinatura'}
        </span>
        {prazo ? (
          <span
            className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${
              prazo === 'vencido'
                ? 'bg-red-50 text-red-800'
                : 'bg-amber-50 text-amber-800'
            }`}
          >
            {PRAZO_INDICADOR_LABEL[prazo]}
          </span>
        ) : null}
      </div>

      <EntregaParcialIndicador row={row} />

      {visiveis.length > 0 ? (
        <ul className="space-y-1 text-xs text-slate-700">
          {visiveis.map((item) => (
            <li key={item.id ?? formatItemLinha(item)} className="flex gap-1.5">
              <IconPackage className="mt-0.5 size-3.5 shrink-0 text-slate-400" />
              <span>{formatItemLinha(item)}</span>
            </li>
          ))}
          {restantes > 0 ? (
            <li className="pl-5 text-slate-500">+ {restantes} item(ns)</li>
          ) : null}
        </ul>
      ) : null}

      <div className="space-y-1 text-xs text-slate-600">
        {local ? <p>{local}</p> : null}
        <p className="flex items-center gap-1.5">
          <IconCalendar className="size-3.5 shrink-0 text-slate-400" />
          <span>
            {formatPrazoSemanaLabel(row.prazoSemanaInicio) || 'Prazo não informado'}
          </span>
        </p>
        {row.createdAt ? (
          <p className="text-slate-500">Pedido em {formatShortDate(row.createdAt)}</p>
        ) : null}
      </div>

      <LogisticaStatusSelect
        value={status}
        options={opcoesStatusDoCard(row)}
        busy={moving}
        disabled={moving}
        ariaLabel={`Mover pedido de ${row.clientNome}`}
        onChange={(next) => onMove(row, next)}
      />
      <Button
        type="button"
        variant="secondary"
        className="w-full"
        disabled={moving}
        onClick={() => onOpen(row.simulationId)}
      >
        Abrir pedido
      </Button>
    </article>
  )
}

export function LogisticaKanbanBoard({ rows, movingId, onMove, onOpen }) {
  const groups = groupPedidosPorStatus(rows)
  const [draggingId, setDraggingId] = useState(null)
  const [dropStatus, setDropStatus] = useState(null)

  function handleDrop(event, statusId) {
    event.preventDefault()
    const id = event.dataTransfer.getData('text/plain') || draggingId
    setDraggingId(null)
    setDropStatus(null)
    const row = rows.find((item) => chaveCard(item) === id)
    if (!row) return
    onMove(row, statusId)
  }

  return (
    <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2">
      {LOGISTICA_STATUS_FLOW.map((coluna) => {
        const cards = groups[coluna.id] ?? []
        const activeDrop = dropStatus === coluna.id && Boolean(draggingId)
        return (
          <section
            key={coluna.id}
            aria-label={coluna.label}
            onDragOver={(event) => {
              event.preventDefault()
              event.dataTransfer.dropEffect = 'move'
              setDropStatus(coluna.id)
            }}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) {
                setDropStatus((current) => (current === coluna.id ? null : current))
              }
            }}
            onDrop={(event) => handleDrop(event, coluna.id)}
            className={[
              'flex w-[min(86vw,18rem)] shrink-0 snap-center flex-col rounded-2xl border p-3 sm:rounded-3xl',
              LOGISTICA_COLUMN_CLASS[coluna.id],
              activeDrop ? 'ring-2 ring-primary-400' : '',
            ].join(' ')}
          >
            <header className="mb-3 border-b border-black/5 pb-2">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-slate-900">{coluna.label}</h2>
                <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-white/80 px-2 py-0.5 text-xs font-semibold text-slate-600">
                  {cards.length}
                </span>
              </div>
              <p className="mt-0.5 text-[11px] leading-snug text-slate-500">{coluna.hint}</p>
            </header>
            <div className="flex max-h-[min(70vh,42rem)] flex-col gap-2.5 overflow-y-auto">
              {cards.length === 0 ? (
                <p className="px-1 py-6 text-center text-xs text-slate-500">
                  Nenhum pedido
                </p>
              ) : (
                cards.map((row) => (
                  <PedidoCard
                    key={chaveCard(row)}
                    row={row}
                    moving={movingId === chaveCard(row)}
                    onMove={onMove}
                    onOpen={onOpen}
                    onDragChange={(id) => {
                      setDraggingId(id)
                      if (!id) setDropStatus(null)
                    }}
                  />
                ))
              )}
            </div>
          </section>
        )
      })}
    </div>
  )
}
