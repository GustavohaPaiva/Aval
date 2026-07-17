import { IconCalendar, IconDollarSign, IconUser } from './icons'
import { Button } from './ui/Button'
import { formatBRL } from '../utils/money'

function statusLabelPt(status) {
  switch (status) {
    case 'draft':
      return 'Rascunho'
    case 'pending':
      return 'Aguardando aprovação'
    case 'approved':
      return 'Aprovado'
    case 'rejected':
      return 'Reprovado'
    case 'converted':
      return 'Convertido'
  }
}

function statusBadgeClass(status) {
  switch (status) {
    case 'approved':
    case 'converted':
      return 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200'
    case 'pending':
      return 'bg-amber-50 text-amber-800 ring-1 ring-amber-200'
    case 'rejected':
      return 'bg-red-50 text-red-800 ring-1 ring-red-200'
    default:
      return 'bg-slate-100 text-slate-700 ring-1 ring-slate-200'
  }
}

export function SimulationListCard({
  row,
  consultorNome,
  isGestor,
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
              statusBadgeClass(row.status),
            ].join(' ')}
          >
            {statusLabelPt(row.status)}
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
        {row.status === 'draft' ? (
          <Button
            type="button"
            className="w-full"
            onClick={() => onContinueEdit(row.id)}
          >
            Continuar edição
          </Button>
        ) : row.status === 'pending' && isGestor ? (
          <Button
            type="button"
            variant="primary"
            className="w-full"
            onClick={() => onViewDetails(row.id)}
          >
            Revisar
          </Button>
        ) : (
          <Button
            type="button"
            variant="secondary"
            className="w-full"
            onClick={() => onViewDetails(row.id)}
          >
            Ver detalhes
          </Button>
        )}
      </footer>
    </article>
  )
}
