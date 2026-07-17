import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ClienteFiltersPanel,
  ClienteStatsBar,
} from "../components/clientes/ClienteVisuals";
import { ClienteTable } from "../components/clientes/ClienteTable";
import { ModalClienteForm } from "../components/clientes/ModalClienteForm";
import { IconUsers } from "../components/icons";
import { AlertMessage } from "../components/ui/AlertMessage";
import { Button } from "../components/ui/Button";
import { PageHeader } from "../components/ui/PageHeader";
import { PageInfoBanner } from "../components/ui/InfoStatCard";
import { PaginationBar } from "../components/ui/PaginationBar";
import { useSyncPageLoading } from "../contexts/PageLoadingContext";
import { useAbortableAsync } from "../hooks/useAbortableAsync";
import { useAuth } from "../hooks/useAuth";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { usePersistedFilters } from "../hooks/usePersistedFilters";
import {
  fetchClientsList,
  fetchClientsTotalCount,
} from "../services/clientService";

const PAGE_SIZE = 50;

export function GerenciarClientes() {
  const navigate = useNavigate();
  const { role } = useAuth();
  const isGestor = role === "gestor";
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [filters, , patchFilters] = usePersistedFilters("filters:clientes", {
    searchQuery: "",
    page: 1,
  });
  const { searchQuery, page } = filters;
  const debouncedSearch = useDebouncedValue(searchQuery, 300);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState(null);
  const [reloadToken, setReloadToken] = useState(0);

  useSyncPageLoading(loading);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, total);

  useAbortableAsync(
    async (_signal, isActive) => {
      const countResult = await fetchClientsTotalCount();
      if (!isActive()) return;
      if (countResult.ok) setTotalCount(countResult.total);
    },
    [reloadToken],
  );

  useAbortableAsync(
    async (_signal, isActive) => {
      setLoading(true);
      setLoadError(null);

      const result = await fetchClientsList({
        search: debouncedSearch,
        page,
        pageSize: PAGE_SIZE,
      });

      if (!isActive()) return;

      setLoading(false);
      if (!result.ok) {
        setLoadError(result.error);
        setRows([]);
        setTotal(0);
        return;
      }

      setRows(result.rows);
      setTotal(result.total);
    },
    [debouncedSearch, page, reloadToken],
  );

  const reload = useCallback(() => {
    setReloadToken((n) => n + 1);
  }, []);

  const hasFilters = Boolean(searchQuery.trim());

  const emptyMessage =
    rows.length === 0 && !hasFilters
      ? "Nenhum cliente cadastrado."
      : "Nenhum resultado para a busca.";

  function openCreateModal() {
    setEditingClient(null);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingClient(null);
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
          eyebrow="Comercial"
          title="Clientes"
          description="Gerencie a carteira de clientes, consulte cadastros e acompanhe o histórico comercial."
          actions={
            <Button
              type="button"
              className="w-full sm:w-auto"
              onClick={openCreateModal}
            >
              Novo cliente
            </Button>
          }
          className="relative mb-0"
        />

        <PageInfoBanner icon={IconUsers}>
          {loading
            ? "Carregando carteira de clientes…"
            : hasFilters
              ? `${total.toLocaleString("pt-BR")} cliente(s) encontrado(s) na busca.`
              : `${totalCount.toLocaleString("pt-BR")} cliente(s) cadastrado(s) na operação.`}
        </PageInfoBanner>
      </div>

      {loadError ? <AlertMessage>{loadError}</AlertMessage> : null}

      <ClienteStatsBar
        total={totalCount}
        filtered={hasFilters ? total : rows.length}
        loading={loading}
      />

      <ClienteFiltersPanel
        searchQuery={searchQuery}
        hasFilters={hasFilters}
        onClear={() => {
          patchFilters({ searchQuery: "", page: 1 });
        }}
        onSearchChange={(e) => {
          patchFilters({ searchQuery: e.target.value, page: 1 });
        }}
      />

      <ClienteTable
        rows={rows}
        loading={loading}
        emptyMessage={emptyMessage}
        isGestor={isGestor}
        onViewDetails={(id) => navigate(`/clientes/${id}`)}
        onEdit={(client) => {
          setEditingClient(client);
          setModalOpen(true);
        }}
      />

      <PaginationBar
        page={page}
        totalPages={totalPages}
        rangeStart={rangeStart}
        rangeEnd={rangeEnd}
        total={total}
        loading={loading}
        itemLabel="clientes"
        onPrev={() => patchFilters({ page: Math.max(1, page - 1) })}
        onNext={() => patchFilters({ page: Math.min(totalPages, page + 1) })}
      />

      <ModalClienteForm
        open={modalOpen}
        mode={editingClient ? "edit" : "create"}
        clientId={editingClient?.id}
        initial={editingClient ?? undefined}
        onClose={closeModal}
        onSaved={reload}
      />
    </div>
  );
}
