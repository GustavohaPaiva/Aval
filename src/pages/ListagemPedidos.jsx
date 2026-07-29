import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { SimulationListCard } from "../components/SimulationListCard";
import { IconPackage, IconSearch, IconSliders } from "../components/icons";
import { AlertMessage } from "../components/ui/AlertMessage";
import { Button } from "../components/ui/Button";
import { EmptyState } from "../components/ui/EmptyState";
import { PageHeader } from "../components/ui/PageHeader";
import { PageInfoBanner } from "../components/ui/InfoStatCard";
import { PaginationBar } from "../components/ui/PaginationBar";
import { SearchInput } from "../components/ui/SearchInput";
import { PEDIDO_STATUSES } from "../constants/simulationStatus";
import { useSyncPageLoading } from "../contexts/PageLoadingContext";
import { useAbortableAsync } from "../hooks/useAbortableAsync";
import { useAuth } from "../hooks/useAuth";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { usePersistedFilters } from "../hooks/usePersistedFilters";
import { fetchSimulationsList } from "../services/simulationOrderService";

const PAGE_SIZE = 50;

const PEDIDO_STATUS_FILTERS = [
  { key: "all", label: "Todos" },
  { key: "order_pending", label: "Pendentes" },
  { key: "converted", label: "Convertidos" },
  { key: "order_rejected", label: "Reprovados" },
  { key: "cancelled", label: "Cancelados" },
];

const VALID_STATUS_KEYS = new Set(
  PEDIDO_STATUS_FILTERS.map((f) => f.key).filter((k) => k !== "all"),
);

export function ListagemPedidos() {
  const { user, role, initializing } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [consultorNomeById, setConsultorNomeById] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, , patchFilters] = usePersistedFilters("filters:pedidos", {
    searchQuery: "",
    quickFilter: "all",
    page: 1,
  });
  const { searchQuery, quickFilter, page } = filters;
  const debouncedSearch = useDebouncedValue(searchQuery, 300);

  useSyncPageLoading(loading || initializing);

  const statusParam = searchParams.get("status");
  const effectiveFilter =
    statusParam && VALID_STATUS_KEYS.has(statusParam)
      ? statusParam
      : quickFilter;

  const canFetch = !initializing && Boolean(user?.id) && Boolean(role);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, total);
  const hasFilters =
    Boolean(searchQuery.trim()) || effectiveFilter !== "all";

  useAbortableAsync(
    async (_signal, isActive) => {
      if (!user?.id || !role) {
        if (!isActive()) return;
        setLoading(false);
        setError("Perfil não encontrado.");
        setRows([]);
        setTotal(0);
        return;
      }

      setLoading(true);
      setError(null);

      const statusForQuery =
        effectiveFilter !== "all" ? effectiveFilter : null;

      const result = await fetchSimulationsList({
        userId: user.id,
        role,
        statusFilter: statusForQuery,
        statusIn: statusForQuery ? undefined : PEDIDO_STATUSES,
        search: debouncedSearch,
        page,
        pageSize: PAGE_SIZE,
      });

      if (!isActive()) return;

      setLoading(false);
      if (!result.ok) {
        setError(result.error);
        setRows([]);
        setTotal(0);
        setConsultorNomeById({});
        return;
      }
      setRows(result.rows);
      setTotal(result.total);
      setConsultorNomeById(result.consultorNomeById);
    },
    [user, role, debouncedSearch, page, effectiveFilter],
    canFetch,
  );

  const isGestor = role === "gestor";

  function openPedido(simulationId, status) {
    if (!isGestor && status !== "converted") return;
    navigate(`/pedido/${encodeURIComponent(simulationId)}`);
  }

  function setQuickFilter(key) {
    patchFilters({ quickFilter: key, page: 1 });
    if (statusParam) {
      const next = new URLSearchParams(searchParams);
      next.delete("status");
      setSearchParams(next, { replace: true });
    }
  }

  return (
    <div className="w-full min-w-0 space-y-4 sm:space-y-6">
      <div className="relative overflow-hidden rounded-2xl border border-primary-100/80 bg-gradient-to-br from-primary-50/80 via-white to-emerald-50/40 p-4 shadow-sm sm:rounded-[2rem] sm:p-6 lg:p-8">
        <div
          className="pointer-events-none absolute -right-8 -top-8 size-28 rounded-full bg-primary-200/30 blur-3xl sm:-right-10 sm:-top-10 sm:size-40"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-6 left-1/4 size-24 rounded-full bg-emerald-200/20 blur-3xl sm:-bottom-8 sm:left-1/3 sm:size-32"
          aria-hidden
        />

        <PageHeader
          eyebrow={isGestor ? "Gestão comercial" : "Operação"}
          title={isGestor ? "Pedidos" : "Meus pedidos"}
          description="Pedidos convertidos a partir de simulações, com status de aprovação."
          className="relative mb-0"
        />

        <PageInfoBanner icon={IconPackage}>
          {loading || initializing
            ? "Carregando pedidos…"
            : hasFilters
              ? `${total.toLocaleString("pt-BR")} pedido(s) encontrado(s) com os filtros atuais.`
              : `${total.toLocaleString("pt-BR")} pedido(s) disponível(is) nesta listagem.`}
        </PageInfoBanner>
      </div>

      {error ? <AlertMessage>{error}</AlertMessage> : null}

      <section className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm sm:rounded-3xl">
        <div className="border-b border-slate-100 bg-gradient-to-r from-primary-50/70 via-white to-emerald-50/40 px-4 py-3.5 sm:px-6 sm:py-4">
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
                onClick={() => {
                  patchFilters({
                    searchQuery: "",
                    quickFilter: "all",
                    page: 1,
                  });
                  if (statusParam) {
                    const next = new URLSearchParams(searchParams);
                    next.delete("status");
                    setSearchParams(next, { replace: true });
                  }
                }}
              >
                Limpar filtros
              </Button>
            ) : null}
          </div>
        </div>

        <div className="space-y-5 p-4 sm:p-6">
          <div>
            <label
              htmlFor="pedido-filter-busca"
              className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500"
            >
              <IconSearch className="size-3.5" />
              Busca
            </label>
            <SearchInput
              id="pedido-filter-busca"
              ariaLabel="Buscar pedido por cliente ou consultor"
              placeholder="Buscar por cliente ou consultor…"
              value={searchQuery}
              onChange={(e) => {
                patchFilters({ searchQuery: e.target.value, page: 1 });
              }}
            />
          </div>

          <div>
            <p
              id="pedido-filter-status-label"
              className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500"
            >
              <IconSliders className="size-3.5" />
              Status
            </p>
            <div
              role="tablist"
              aria-labelledby="pedido-filter-status-label"
              className="grid grid-cols-2 gap-1 rounded-2xl bg-slate-100/90 p-1 ring-1 ring-slate-200/70 sm:grid-cols-3 lg:grid-cols-5"
            >
              {PEDIDO_STATUS_FILTERS.map((pill) => {
                const active = effectiveFilter === pill.key;
                return (
                  <button
                    key={pill.key}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    className={[
                      "rounded-xl px-3 py-2 text-sm font-semibold transition-colors",
                      active
                        ? "bg-white text-primary-800 shadow-sm ring-1 ring-slate-200/80"
                        : "text-slate-600 hover:text-slate-900",
                    ].join(" ")}
                    onClick={() => setQuickFilter(pill.key)}
                  >
                    {pill.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {loading || initializing ? (
        <EmptyState
          title="Carregando pedidos…"
          description="Aguarde um instante."
        />
      ) : rows.length === 0 ? (
        <EmptyState
          title={
            total === 0 && !hasFilters
              ? "Nenhum pedido encontrado"
              : "Nenhum resultado para a busca"
          }
          description={
            total === 0 && !hasFilters
              ? "Converta uma simulação em pedido no simulador para vê-la aqui."
              : "Tente outro termo ou status."
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((row) => (
            <SimulationListCard
              key={row.id}
              row={row}
              isGestor={isGestor}
              consultorNome={consultorNomeById[row.user_id]}
              onContinueEdit={openPedido}
              onViewDetails={openPedido}
            />
          ))}
        </div>
      )}

      <PaginationBar
        page={page}
        totalPages={totalPages}
        rangeStart={rangeStart}
        rangeEnd={rangeEnd}
        total={total}
        loading={loading || initializing}
        itemLabel="pedidos"
        onPrev={() => patchFilters({ page: Math.max(1, page - 1) })}
        onNext={() => patchFilters({ page: Math.min(totalPages, page + 1) })}
      />
    </div>
  );
}
