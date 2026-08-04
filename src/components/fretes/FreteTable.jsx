import { memo } from "react";
import { FreteRowActions } from "./FreteCard";
import { FreteOrigemBadge } from "./FreteVisuals";
import { EmptyState } from "../ui/EmptyState";
import { formatBRL } from "../../utils/money";

function MobileCellLabel({ children }) {
  return (
    <span className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-slate-500 lg:hidden">
      {children}
    </span>
  );
}

const FreteTableRow = memo(function FreteTableRow({
  row,
  index,
  deletingId,
  onEdit,
  onDelete,
}) {
  return (
    <tr
      className={[
        "group block border-b border-slate-100 p-4 last:border-b-0",
        "lg:table-row lg:border-0 lg:p-0",
        index % 2 === 0 ? "bg-white" : "bg-slate-50/50",
        "lg:hover:bg-primary-50/35",
      ].join(" ")}
    >
      <td className="flex items-center justify-between gap-3 border-b border-slate-100/80 py-2.5 lg:table-cell lg:border-0 lg:px-4 lg:py-4 lg:text-center">
        <MobileCellLabel>Origem</MobileCellLabel>
        <FreteOrigemBadge origem={row.origem} compact />
      </td>

      <td className="flex items-center justify-between gap-3 border-b border-slate-100/80 py-2.5 lg:table-cell lg:border-0 lg:px-4 lg:py-4 lg:text-center">
        <MobileCellLabel>Destino</MobileCellLabel>
        <span className="max-w-[65%] truncate text-right text-sm font-medium text-slate-900 lg:max-w-none lg:text-center">
          {row.destino}
        </span>
      </td>

      <td className="flex items-center justify-between gap-3 py-2.5 lg:table-cell lg:px-4 lg:py-4 lg:text-center">
        <MobileCellLabel>Valor</MobileCellLabel>
        <span className="finance-text inline-flex shrink-0 items-center justify-center rounded-xl bg-white px-2.5 py-1.5 text-sm font-semibold text-slate-900 shadow-sm ring-1 ring-slate-200/80 lg:min-w-[6.5rem] lg:rounded-2xl lg:px-3 lg:py-2 group-hover:lg:ring-primary-200">
          {formatBRL(row.valor)}
        </span>
      </td>

      <td className="mt-3 flex justify-end border-t border-slate-100/80 pt-3 lg:mt-0 lg:table-cell lg:border-0 lg:px-4 lg:py-4 lg:text-center">
        <div className="flex justify-end lg:justify-center">
          <FreteRowActions
            row={row}
            deleting={deletingId === row.id}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        </div>
      </td>
    </tr>
  );
});

export function FreteTable({
  rows,
  loading,
  emptyMessage,
  deletingId,
  onEdit,
  onDelete,
}) {
  if (loading) {
    return (
      <section className="rounded-2xl border border-slate-200/90 bg-white p-8 text-center text-sm text-slate-500 shadow-sm sm:rounded-3xl">
        Carregando fretes…
      </section>
    );
  }

  if (rows.length === 0) {
    return (
      <section className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm sm:rounded-3xl sm:p-10">
        <EmptyState title={emptyMessage} />
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm sm:rounded-3xl">
      <table className="w-full border-collapse text-sm">
        <thead className="hidden border-b border-slate-100 bg-gradient-to-r from-slate-50/90 via-white to-primary-50/40 lg:table-header-group">
          <tr>
            <th className="px-4 py-3.5 text-center text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
              Origem
            </th>
            <th className="px-4 py-3.5 text-center text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
              Destino
            </th>
            <th className="w-36 px-4 py-3.5 text-center text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
              Valor
            </th>
            <th className="w-24 px-4 py-3.5 text-center text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
              Ações
            </th>
          </tr>
        </thead>

        <tbody className="block lg:table-row-group">
          {rows.map((row, index) => (
            <FreteTableRow
              key={row.id}
              row={row}
              index={index}
              deletingId={deletingId}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </tbody>
      </table>
    </section>
  );
}
