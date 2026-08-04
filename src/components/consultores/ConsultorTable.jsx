import { IconEye } from '../icons'
import { ConsultorNameBadge } from './ConsultorVisuals'
import { EmptyState } from '../ui/EmptyState'
import { formatShortDate } from '../../utils/formatShortDate'

function MobileCellLabel({ children }) {
  return (
    <span className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-slate-500 lg:hidden">
      {children}
    </span>
  )
}

function ViewDetailsButton({ label, onClick }) {
  return (
    <button
      type="button"
      className="inline-flex size-7 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-primary-50 hover:text-primary-700"
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      <IconEye className="size-3.5" />
    </button>
  )
}

export function ConsultorTable({ rows, loading, emptyMessage, onViewDetails }) {
  if (loading) {
    return (
      <section className="rounded-2xl border border-slate-200/90 bg-white p-8 text-center text-sm text-slate-500 shadow-sm sm:rounded-3xl">
        Carregando consultores…
      </section>
    )
  }

  if (rows.length === 0) {
    return (
      <section className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm sm:rounded-3xl sm:p-10">
        <EmptyState title={emptyMessage} />
      </section>
    )
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm sm:rounded-3xl">
      <table className="w-full border-collapse text-sm">
        <thead className="hidden border-b border-slate-100 bg-gradient-to-r from-slate-50/90 via-white to-primary-50/40 lg:table-header-group">
          <tr>
            <th className="px-4 py-3.5 text-center text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
              Nome
            </th>
            <th className="px-4 py-3.5 text-center text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
              Filial
            </th>
            <th className="px-4 py-3.5 text-center text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
              Cadastro
            </th>
            <th className="w-16 px-4 py-3.5 text-center text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
              <span className="sr-only">Detalhes</span>
            </th>
          </tr>
        </thead>

        <tbody className="block lg:table-row-group">
          {rows.map((row, index) => (
            <tr
              key={row.id}
              className={[
                'group block border-b border-slate-100 p-4 last:border-b-0',
                'lg:table-row lg:border-0 lg:p-0',
                index % 2 === 0 ? 'bg-white' : 'bg-slate-50/50',
                'lg:hover:bg-primary-50/35',
              ].join(' ')}
            >
              <td className="flex items-center justify-between gap-3 border-b border-slate-100/80 py-2.5 lg:table-cell lg:border-0 lg:px-4 lg:py-4 lg:text-center">
                <MobileCellLabel>Nome</MobileCellLabel>
                <div className="flex justify-end lg:justify-center">
                  <ConsultorNameBadge nome={row.nome} />
                </div>
              </td>

              <td className="flex items-center justify-between gap-3 border-b border-slate-100/80 py-2.5 lg:table-cell lg:border-0 lg:px-4 lg:py-4 lg:text-center">
                <MobileCellLabel>Filial</MobileCellLabel>
                <span className="text-sm text-slate-700">
                  {row.filial?.trim() || '—'}
                </span>
              </td>

              <td className="flex items-center justify-between gap-3 border-b border-slate-100/80 py-2.5 lg:table-cell lg:border-0 lg:px-4 lg:py-4 lg:text-center">
                <MobileCellLabel>Cadastro</MobileCellLabel>
                <span className="text-sm text-slate-700">
                  {formatShortDate(row.created_at)}
                </span>
              </td>

              <td className="mt-3 flex justify-end border-t border-slate-100/80 pt-3 lg:mt-0 lg:table-cell lg:border-0 lg:px-4 lg:py-4 lg:text-center">
                <div className="flex justify-end lg:justify-center">
                  <ViewDetailsButton
                    label={`Ver detalhes de ${row.nome}`}
                    onClick={() => onViewDetails(row.id)}
                  />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
