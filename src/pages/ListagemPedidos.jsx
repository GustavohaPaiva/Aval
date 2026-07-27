import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { SimulationListCard } from "../components/SimulationListCard";
import { IconPackage } from "../components/icons";
import { AlertMessage } from "../components/ui/AlertMessage";
import { EmptyState } from "../components/ui/EmptyState";
import { PageHeader } from "../components/ui/PageHeader";
import { PageInfoBanner } from "../components/ui/InfoStatCard";
import { PaginationBar } from "../components/ui/PaginationBar";
import { SearchInput } from "../components/ui/SearchInput";
import { useSyncPageLoading } from "../contexts/PageLoadingContext";
import { useAbortableAsync } from "../hooks/useAbortableAsync";
import { useAuth } from "../hooks/useAuth";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { usePersistedFilters } from "../hooks/usePersistedFilters";
import { fetchSimulationsList } from "../services/simulationOrderService";

const PAGE_SIZE = 50;

export function ListagemPedidos() {
  const { user, role, initializing } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [consultorNomeById, setConsultorNomeById] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, , patchFilters] = usePersistedFilters("filters:pedidos", {
    searchQuery: "",
    page: 1,
  });
  const { searchQuery, page } = filters;
  const debouncedSearch = useDebouncedValue(searchQuery, 300);

  useSyncPageLoading(loading || initializing);

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
        statusFilter: "converted",
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
    [user, role, debouncedSearch, page],
    canFetch,
  );

  function openPedido(simulationId) {
    navigate(`/pedido/${encodeURIComponent(simulationId)}`);
  }

  const isGestor = role === "gestor";
  const hasFilters = Boolean(searchQuery.trim());

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
          description="Simulações convertidas em pedidos, prontas para envio ao cliente."
          className="relative mb-0"
        />

        <PageInfoBanner icon={IconPackage}>
          {loading || initializing
            ? "Carregando pedidos…"
            : hasFilters
              ? `${total.toLocaleString("pt-BR")} pedido(s) encontrado(s) com a busca atual.`
              : `${total.toLocaleString("pt-BR")} pedido(s) disponível(is) nesta listagem.`}
        </PageInfoBanner>
      </div>

      {error ? <AlertMessage>{error}</AlertMessage> : null}

      <section className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm sm:rounded-3xl">
        <div className="p-4 sm:p-6">
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
              : "Tente outro termo de busca."
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
