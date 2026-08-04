import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { SimulationListCard } from "../components/SimulationListCard";
import {
  SIMULACAO_STATUS_FILTERS,
  SimulacaoFiltersPanel,
  SimulacaoStatsBar,
} from "../components/simulacoes/SimulacaoVisuals";
import { IconClipboardList } from "../components/icons";
import { AlertMessage } from "../components/ui/AlertMessage";
import { Button } from "../components/ui/Button";
import { EmptyState } from "../components/ui/EmptyState";
import { PageHeader } from "../components/ui/PageHeader";
import { PageInfoBanner } from "../components/ui/InfoStatCard";
import { PaginationBar } from "../components/ui/PaginationBar";
import { useSyncPageLoading } from "../contexts/PageLoadingContext";
import { useAbortableAsync } from "../hooks/useAbortableAsync";
import { useAuth } from "../hooks/useAuth";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { usePersistedFilters } from "../hooks/usePersistedFilters";
import { fetchSimulationsList } from "../services/simulationOrderService";

const PAGE_SIZE = 50;

const VALID_STATUS_KEYS = new Set(
  SIMULACAO_STATUS_FILTERS.map((f) => f.key).filter((k) => k !== "all"),
);

export function ListagemSimulacoes() {
  const { user, role, initializing } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [consultorNomeById, setConsultorNomeById] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, , patchFilters] = usePersistedFilters("filters:simulacoes", {
    searchQuery: "",
    quickFilter: "all",
    page: 1,
  });
  const { searchQuery, quickFilter, page } = filters;
  const debouncedSearch = useDebouncedValue(searchQuery, 300);

  useEffect(() => {
    const statusParam = searchParams.get("status");
    if (statusParam && VALID_STATUS_KEYS.has(statusParam)) {
      if (quickFilter !== statusParam) {
        patchFilters({ quickFilter: statusParam, page: 1 });
      }
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete("status");
          return next;
        },
        { replace: true },
      );
    }
  }, [searchParams, quickFilter, patchFilters, setSearchParams]);

  useSyncPageLoading(loading || initializing);

  const statusForQuery = quickFilter === "all" ? null : quickFilter;
  const canFetch = !initializing && Boolean(user?.id) && Boolean(role);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, total);

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

      const result = await fetchSimulationsList({
        userId: user.id,
        role,
        statusFilter: statusForQuery,
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
    [user, role, statusForQuery, debouncedSearch, page],
    canFetch,
  );

  function openSimulacao(simulationId) {
    navigate(`/simulador?simulationId=${encodeURIComponent(simulationId)}`);
  }

  const isGestor = role === "gestor";
  const hasFilters = Boolean(searchQuery.trim()) || quickFilter !== "all";

  const activeStatusLabel =
    SIMULACAO_STATUS_FILTERS.find((pill) => pill.key === quickFilter)?.label ??
    "Todos";

  function clearFilters() {
    patchFilters({ searchQuery: "", quickFilter: "all", page: 1 });
  }

  return (
    <div className="w-full min-w-0 space-y-4 sm:space-y-6">
      <div className="relative overflow-hidden rounded-2xl border border-primary-100/80 bg-gradient-to-br from-primary-50/80 via-white to-violet-50/40 p-4 shadow-sm sm:rounded-[2rem] sm:p-6 lg:p-8">
        <div
          className="pointer-events-none absolute -right-8 -top-8 size-28 rounded-full bg-primary-200/30 blur-3xl sm:-right-10 sm:-top-10 sm:size-40"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-6 left-1/4 size-24 rounded-full bg-violet-200/20 blur-3xl sm:-bottom-8 sm:left-1/3 sm:size-32"
          aria-hidden
        />

        <PageHeader
          eyebrow={isGestor ? "Gestão comercial" : "Operação"}
          title={isGestor ? "Simulações" : "Minhas simulações"}
          description="Acompanhe rascunhos, aprovações, conversões e propostas em qualquer status."
          actions={
            <Button
              type="button"
              className="w-full sm:w-auto"
              onClick={() => navigate("/simulador")}
            >
              Nova simulação
            </Button>
          }
          className="relative mb-0"
        />

        <PageInfoBanner icon={IconClipboardList}>
          {loading || initializing
            ? "Carregando simulações…"
            : hasFilters
              ? `${total.toLocaleString("pt-BR")} simulação(ões) encontrada(s) com os filtros atuais.`
              : `${total.toLocaleString("pt-BR")} simulação(ões) disponível(is) nesta listagem.`}
        </PageInfoBanner>
      </div>

      {error ? <AlertMessage>{error}</AlertMessage> : null}

      <SimulacaoStatsBar
        total={total}
        filtered={rows.length}
        loading={loading || initializing}
        statusLabel={quickFilter === "all" ? null : activeStatusLabel}
      />

      <SimulacaoFiltersPanel
        searchQuery={searchQuery}
        onSearchChange={(e) => {
          patchFilters({ searchQuery: e.target.value, page: 1 });
        }}
        quickFilter={quickFilter}
        onQuickFilterChange={(value) => {
          patchFilters({ quickFilter: value, page: 1 });
        }}
        hasFilters={hasFilters}
        onClear={clearFilters}
      />

      {loading || initializing ? (
        <EmptyState
          title="Carregando simulações…"
          description="Aguarde um instante."
        />
      ) : rows.length === 0 ? (
        <EmptyState
          title={
            total === 0 && !hasFilters
              ? "Nenhuma simulação encontrada"
              : "Nenhum resultado para a busca"
          }
          description={
            total === 0 && !hasFilters
              ? isGestor
                ? "Aguardando propostas dos consultores."
                : "Crie uma nova simulação para começar."
              : "Tente outro termo ou limpe os filtros."
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
              listKind="simulacoes"
              onContinueEdit={openSimulacao}
              onViewDetails={openSimulacao}
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
        itemLabel="simulações"
        onPrev={() => patchFilters({ page: Math.max(1, page - 1) })}
        onNext={() => patchFilters({ page: Math.min(totalPages, page + 1) })}
      />
    </div>
  );
}
