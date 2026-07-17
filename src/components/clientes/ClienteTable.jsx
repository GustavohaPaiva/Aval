import { memo } from "react";
import { IconEye, IconPencil } from "../icons";
import { IconActionButton } from "../fretes/FreteCard";
import { ClienteNameBadge } from "./ClienteVisuals";
import { EmptyState } from "../ui/EmptyState";
import { formatShortDate } from "../../utils/formatShortDate";
import { displayCpfCnpj } from "../../utils/dataFormatters";

function MobileCellLabel({ children }) {
  return (
    <span className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-slate-500 md:hidden">
      {children}
    </span>
  );
}

const ClienteTableRow = memo(function ClienteTableRow({
  row,
  index,
  isGestor,
  onViewDetails,
  onEdit,
}) {
  return (
    <tr
      className={[
        "group block border-b border-slate-100 p-4 last:border-b-0",
        "md:table-row md:border-0 md:p-0",
        index % 2 === 0 ? "bg-white" : "bg-slate-50/50",
        "md:hover:bg-primary-50/35",
      ].join(" ")}
    >
      <td className="flex items-center justify-between gap-3 border-b border-slate-100/80 py-2.5 md:table-cell md:border-0 md:px-4 md:py-4 md:text-center">
        <MobileCellLabel>Nome</MobileCellLabel>
        <div className="flex justify-end md:justify-center">
          <ClienteNameBadge nome={row.nome} ativo={row.ativo} />
        </div>
      </td>

      <td className="flex items-center justify-between gap-3 border-b border-slate-100/80 py-2.5 md:table-cell md:border-0 md:px-4 md:py-4 md:text-center">
        <MobileCellLabel>CPF / CNPJ</MobileCellLabel>
        <span className="text-sm text-slate-700">{displayCpfCnpj(row.cnpj_cpf)}</span>
      </td>

      <td className="flex items-center justify-between gap-3 border-b border-slate-100/80 py-2.5 md:table-cell md:border-0 md:px-4 md:py-4 md:text-center">
        <MobileCellLabel>Local</MobileCellLabel>
        <span className="max-w-[65%] truncate text-right text-sm text-slate-700 md:max-w-none md:text-center">
          {[row.municipio, row.uf].filter(Boolean).join(" — ") || "—"}
        </span>
      </td>

      <td className="flex items-center justify-between gap-3 border-b border-slate-100/80 py-2.5 md:table-cell md:border-0 md:px-4 md:py-4 md:text-center">
        <MobileCellLabel>Cadastro</MobileCellLabel>
        <span className="text-sm text-slate-700">
          {formatShortDate(row.created_at)}
        </span>
      </td>

      <td className="mt-3 flex justify-end border-t border-slate-100/80 pt-3 md:mt-0 md:table-cell md:border-0 md:px-4 md:py-4 md:text-center">
        <div className="flex justify-end gap-1 md:justify-center">
          <IconActionButton
            label={`Ver detalhes de ${row.nome}`}
            onClick={() => onViewDetails(row.id)}
          >
            <IconEye className="size-3.5" />
          </IconActionButton>
          {isGestor ? (
            <IconActionButton
              label={`Editar ${row.nome}`}
              onClick={() => onEdit(row)}
            >
              <IconPencil className="size-3.5" />
            </IconActionButton>
          ) : null}
        </div>
      </td>
    </tr>
  );
});

export function ClienteTable({
  rows,
  loading,
  emptyMessage,
  isGestor,
  onViewDetails,
  onEdit,
}) {
  if (loading) {
    return (
      <section className="rounded-2xl border border-slate-200/90 bg-white p-8 text-center text-sm text-slate-500 shadow-sm sm:rounded-3xl">
        Carregando clientes…
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
        <thead className="hidden border-b border-slate-100 bg-gradient-to-r from-slate-50/90 via-white to-primary-50/40 md:table-header-group">
          <tr>
            <th className="px-4 py-3.5 text-center text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
              Nome
            </th>
            <th className="px-4 py-3.5 text-center text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
              CPF / CNPJ
            </th>
            <th className="px-4 py-3.5 text-center text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
              Local
            </th>
            <th className="px-4 py-3.5 text-center text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
              Cadastro
            </th>
            <th className="w-24 px-4 py-3.5 text-center text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
              Ações
            </th>
          </tr>
        </thead>

        <tbody className="block md:table-row-group">
          {rows.map((row, index) => (
            <ClienteTableRow
              key={row.id}
              row={row}
              index={index}
              isGestor={isGestor}
              onViewDetails={onViewDetails}
              onEdit={onEdit}
            />
          ))}
        </tbody>
      </table>
    </section>
  );
}
