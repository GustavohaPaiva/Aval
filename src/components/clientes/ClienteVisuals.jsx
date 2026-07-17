import { IconPackage, IconSearch, IconUsers } from "../icons";
import { InfoStatCard } from "../ui/InfoStatCard";
import { Button } from "../ui/Button";
import { SearchInput } from "../ui/SearchInput";

export function ClienteFiltersPanel({
  searchQuery,
  onSearchChange,
  onClear,
  hasFilters,
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm sm:rounded-3xl">
      <div className="border-b border-slate-100 bg-gradient-to-r from-primary-50/70 via-white to-emerald-50/40 px-4 py-3.5 sm:px-6 sm:py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary-700">
              Busca
            </p>
            <p className="mt-1 text-sm text-slate-600">
              Encontre clientes pelo nome ou documento.
            </p>
          </div>
          {hasFilters ? (
            <Button
              type="button"
              variant="ghost"
              className="h-9 w-full shrink-0 px-3 sm:w-auto"
              onClick={onClear}
            >
              Limpar busca
            </Button>
          ) : null}
        </div>
      </div>

      <div className="p-4 sm:p-6">
        <label
          htmlFor="cliente-filter-busca"
          className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500"
        >
          <IconSearch className="size-3.5" />
          Nome ou CPF / CNPJ
        </label>
        <SearchInput
          id="cliente-filter-busca"
          ariaLabel="Buscar cliente por nome ou CPF/CNPJ"
          placeholder="Ex.: Fazenda Silva, 12.345.678/0001-90…"
          value={searchQuery}
          onChange={onSearchChange}
        />
      </div>
    </section>
  );
}

export function ClienteStatsBar({ total, filtered, loading }) {
  const items = [
    {
      label: "Carteira",
      value: loading ? "—" : String(total),
      hint: "Clientes cadastrados",
      icon: IconUsers,
      accent: "text-primary-600 bg-primary-50",
    },
    {
      label: "Na listagem",
      value: loading ? "—" : String(filtered),
      hint: "Resultados visíveis",
      icon: IconPackage,
      accent: "text-emerald-700 bg-emerald-50",
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {items.map((item) => (
        <InfoStatCard
          key={item.label}
          {...item}
          className="p-2 sm:p-4"
        />
      ))}
    </div>
  );
}

function clienteInitial(nome) {
  const trimmed = (nome ?? "").trim();
  return trimmed ? trimmed.charAt(0).toUpperCase() : "?";
}

export function ClienteNameBadge({ nome, ativo = true }) {
  return (
    <span className="inline-flex max-w-full items-center gap-2">
      <span
        className={[
          "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ring-1",
          ativo === false
            ? "bg-slate-100 text-slate-600 ring-slate-200"
            : "bg-emerald-50 text-emerald-700 ring-emerald-100",
        ].join(" ")}
        aria-hidden
      >
        {clienteInitial(nome)}
      </span>
      <span className="truncate font-medium text-slate-900">{nome}</span>
      {ativo === false ? (
        <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.08em] text-slate-600 ring-1 ring-slate-200">
          Inativo
        </span>
      ) : null}
    </span>
  );
}
