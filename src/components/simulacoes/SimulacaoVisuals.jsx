import { IconClipboardList, IconSearch, IconSliders } from "../icons";
import { InfoStatCard } from "../ui/InfoStatCard";
import { Button } from "../ui/Button";
import { SearchInput } from "../ui/SearchInput";

const SIMULACAO_STATUS_FILTERS = [
  { key: "all", label: "Todos" },
  { key: "draft", label: "Rascunhos" },
  { key: "pending", label: "Pendentes" },
  { key: "approved", label: "Aprovados" },
  { key: "rejected", label: "Reprovados" },
];

export function SimulacaoFiltersPanel({
  searchQuery,
  onSearchChange,
  quickFilter,
  onQuickFilterChange,
  onClear,
  hasFilters,
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm sm:rounded-3xl">
      <div className="border-b border-slate-100 bg-gradient-to-r from-primary-50/70 via-white to-violet-50/40 px-4 py-3.5 sm:px-6 sm:py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary-700">
              Filtros
            </p>
            <p className="mt-1 text-sm text-slate-600">
              Busque por cliente ou consultor e refine por status.
            </p>
          </div>
          {hasFilters ? (
            <Button
              type="button"
              variant="ghost"
              className="h-9 w-full shrink-0 px-3 sm:w-auto"
              onClick={onClear}
            >
              Limpar filtros
            </Button>
          ) : null}
        </div>
      </div>

      <div className="space-y-5 p-4 sm:p-6">
        <div>
          <label
            htmlFor="simulacao-filter-busca"
            className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500"
          >
            <IconSearch className="size-3.5" />
            Busca
          </label>
          <SearchInput
            id="simulacao-filter-busca"
            ariaLabel="Buscar simulação por cliente ou consultor"
            placeholder="Buscar por cliente ou consultor…"
            value={searchQuery}
            onChange={onSearchChange}
          />
        </div>

        <div>
          <p
            id="simulacao-filter-status-label"
            className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500"
          >
            <IconSliders className="size-3.5" />
            Status
          </p>
          <div
            role="tablist"
            aria-labelledby="simulacao-filter-status-label"
            className="grid grid-cols-2 gap-1 rounded-2xl bg-slate-100/90 p-1 ring-1 ring-slate-200/70 sm:grid-cols-3 lg:grid-cols-5"
          >
            {SIMULACAO_STATUS_FILTERS.map((pill) => {
              const active = quickFilter === pill.key;
              return (
                <button
                  key={pill.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  className={[
                    "inline-flex min-h-10 items-center justify-center rounded-xl px-2.5 py-2 text-center text-sm font-medium transition-all",
                    active
                      ? "bg-white text-primary-700 shadow-sm ring-1 ring-slate-200/80"
                      : "text-slate-600 hover:bg-white/60 hover:text-slate-900",
                  ].join(" ")}
                  onClick={() => onQuickFilterChange(pill.key)}
                >
                  <span>{pill.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

export function SimulacaoStatsBar({ total, filtered, loading, statusLabel }) {
  const items = [
    {
      label: "Na listagem",
      value: loading ? "—" : String(filtered),
      hint: statusLabel ? `Filtro: ${statusLabel}` : "Resultados visíveis",
      icon: IconClipboardList,
      accent: "text-primary-600 bg-primary-50",
    },
    {
      label: "Carregadas",
      value: loading ? "—" : String(total),
      hint: "Simulações neste status",
      icon: IconClipboardList,
      accent: "text-violet-700 bg-violet-50",
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
