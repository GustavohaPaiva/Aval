import { IconCalendar, IconDollarSign, IconUser } from './icons'
import { Button } from './ui/Button'
import {
  isPedidoStatus,
  statusBadgeClass,
  statusLabelPt,
} from '../constants/simulationStatus'
import { formatBRL } from '../utils/money'

/**
 * Shared action / label logic for simulation & pedido list cards and tables.
 * @param {{
 *   row: object,
 *   isGestor?: boolean,
 *   listKind?: 'simulacoes' | 'pedidos',
 * }} args
 */
export function resolveSimulationListAction({
  row,
  isGestor,
  listKind = 'simulacoes',
}) {
  const isPedidosList = listKind === 'pedidos'

  const viewLabel = isPedidosList
    ? isPedidoStatus(row.status)
      ? row.status === 'order_pending' && isGestor
        ? 'Revisar pedido'
        : 'Ver pedido'
      : 'Ver detalhes'
    : isPedidoStatus(row.status) || row.status !== 'draft'
      ? 'Ver simulação'
      : 'Continuar edição'

  if (!isPedidosList && row.status === 'draft') {
    return {
      kind: 'continue',
      label: 'Continuar edição',
      variant: 'primary',
      handler: 'onContinueEdit',
    }
  }

  if (!isPedidosList && row.status === 'pending' && isGestor) {
    return {
      kind: 'review',
      label: 'Revisar',
      variant: 'primary',
      handler: 'onViewDetails',
    }
  }

  if (
    isPedidosList &&
    isPedidoStatus(row.status) &&
    !isGestor &&
    (row.ativo === false ||
      row.status === 'cancelled' ||
      row.status !== 'converted')
  ) {
    return {
      kind: 'message',
      message:
        row.ativo === false || row.status === 'cancelled'
          ? 'Pedido inativo'
          : 'Aguardando aprovação do gestor',
    }
  }

  if (isPedidosList && row.status === 'order_pending' && isGestor) {
    return {
      kind: 'review',
      label: 'Revisar pedido',
      variant: 'primary',
      handler: 'onViewDetails',
    }
  }

  return {
    kind: 'view',
    label: viewLabel,
    variant: 'secondary',
    handler: 'onViewDetails',
  }
}

/**
 * @param {{
 *   row: object,
 *   consultorNome?: string,
 *   isGestor?: boolean,
 *   listKind?: 'simulacoes' | 'pedidos',
 *   onContinueEdit?: (id: string, status: string) => void,
 *   onViewDetails?: (id: string, status: string) => void,
 * }} props
 */
export function SimulationListCard({
  row,
  consultorNome,
  isGestor,
  listKind = 'simulacoes',
  onContinueEdit,
  onViewDetails,
}) {
  const formattedDate = new Date(row.created_at).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  const action = resolveSimulationListAction({ row, isGestor, listKind })
  const handlers = { onContinueEdit, onViewDetails }

  return (
    <article className="group flex flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm transition-[box-shadow,border-color] hover:border-primary-200 hover:shadow-md">
      <header className="border-b border-slate-100 bg-gradient-to-br from-white to-slate-50/80 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h2 className="text-lg font-semibold tracking-tight text-slate-900">
            {row.client_nome}
          </h2>
          <span
            className={[
              'inline-flex shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold',
              statusBadgeClass(row.status, { ativo: row.ativo }),
            ].join(' ')}
          >
            {statusLabelPt(row.status, { ativo: row.ativo })}
          </span>
        </div>
      </header>

      <div className="flex flex-1 flex-col gap-4 p-5">
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <IconCalendar className="size-4 shrink-0 text-slate-400" />
          <span>{formattedDate}</span>
        </div>

        <div className="rounded-2xl bg-slate-50 px-4 py-3">
          <div className="flex items-start gap-2">
            <IconDollarSign className="mt-0.5 size-4 shrink-0 text-primary-600" />
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                Valor total
              </p>
              <p className="finance-text mt-0.5 text-2xl font-semibold text-slate-900">
                {formatBRL(row.total_proposta)}
              </p>
            </div>
          </div>
        </div>

        {isGestor ? (
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <IconUser className="size-4 shrink-0 text-slate-400" />
            <span>
              <span className="text-slate-500">Consultor: </span>
              <span className="font-medium text-slate-800">
                {consultorNome ?? '—'}
              </span>
            </span>
          </div>
        ) : null}
      </div>

      <footer className="mt-auto border-t border-slate-100 bg-slate-50/50 p-4">
        {action.kind === 'message' ? (
          <p className="text-center text-sm text-slate-500">{action.message}</p>
        ) : (
          <Button
            type="button"
            variant={action.variant}
            className="w-full"
            onClick={() =>
              handlers[action.handler]?.(row.id, row.status)
            }
          >
            {action.label}
          </Button>
        )}
      </footer>
    </article>
  )
}
