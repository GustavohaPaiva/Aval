import { useCallback, useState } from "react";
import { FreteTable } from "../components/fretes/FreteTable";
import { FreteFiltersPanel } from "../components/fretes/FreteFiltersPanel";
import { FreteStatsBar } from "../components/fretes/FreteVisuals";
import { ModalFreteForm } from "../components/fretes/ModalFreteForm";
import { IconTruck } from "../components/icons";
import { AlertMessage } from "../components/ui/AlertMessage";
import { Button } from "../components/ui/Button";
import { PageHeader } from "../components/ui/PageHeader";
import { PageInfoBanner } from "../components/ui/InfoStatCard";
import { useSyncPageLoading } from "../contexts/PageLoadingContext";
import { useAbortableAsync } from "../hooks/useAbortableAsync";
import { useAuth } from "../hooks/useAuth";
import { usePersistedFilters } from "../hooks/usePersistedFilters";
import { deleteFrete, fetchFretesList } from "../services/freteService";
import { formatBRL } from "../utils/money";

const PAGE_SIZE = 50;

function FretePagination({
  page,
  totalPages,
  rangeStart,
  rangeEnd,
  total,
  loading,
  onPrev,
  onNext,
}) {
  if (total <= PAGE_SIZE) return null;

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-slate-200/90 bg-white px-4 py-3.5 shadow-sm sm:rounded-3xl sm:px-5 sm:py-4 md:flex-row md:items-center md:justify-between">
      <p className="text-center text-sm text-slate-600 md:text-left">
        Exibindo{" "}
        <span className="font-medium text-slate-900">
          {rangeStart}–{rangeEnd}
        </span>{" "}
        de{" "}
        <span className="font-medium text-slate-900">
          {total.toLocaleString("pt-BR")}
        </span>{" "}
        rotas
      </p>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <span className="text-center text-xs font-medium uppercase tracking-[0.12em] text-slate-500 sm:text-left">
          Página {page} / {totalPages}
        </span>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <Button
            type="button"
            variant="secondary"
            className="w-full sm:w-auto"
            disabled={page <= 1 || loading}
            onClick={onPrev}
          >
            Anterior
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="w-full sm:w-auto"
            disabled={page >= totalPages || loading}
            onClick={onNext}
          >
            Próxima
          </Button>
        </div>
      </div>
    </div>
  );
}

export function FretePage() {
  const { role } = useAuth();
  const isGestor = role === "gestor";

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, , patchFilters] = usePersistedFilters("filters:fretes", {
    origemSearch: "",
    destinoSearch: "",
    page: 1,
  });
  const { origemSearch, destinoSearch, page } = filters;
  const [modalOpen, setModalOpen] = useState(false);
  const [editingFrete, setEditingFrete] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [reloadToken, setReloadToken] = useState(0);

  useSyncPageLoading(loading);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const reload = useCallback(() => {
    setReloadToken((n) => n + 1);
  }, []);

  const loadFretes = useCallback(
    async (isActive) => {
      setLoading(true);
      setError(null);

      const result = await fetchFretesList({
        origemSearch,
        destinoSearch,
        page,
        pageSize: PAGE_SIZE,
      });

      if (!isActive()) return;

      setLoading(false);
      if (!result.ok) {
        setError(result.error);
        setRows([]);
        setTotal(0);
        return;
      }

      setRows(result.rows);
      setTotal(result.total);
    },
    [origemSearch, destinoSearch, page],
  );

  useAbortableAsync(
    async (_signal, isActive) => {
      await loadFretes(isActive);
    },
    [loadFretes, reloadToken],
  );

  const hasFilters = Boolean(origemSearch.trim() || destinoSearch.trim());

  const emptyMessage =
    total === 0 && !hasFilters
      ? "Nenhum frete cadastrado."
      : "Nenhum resultado para a busca.";

  function clearFilters() {
    patchFilters({ origemSearch: "", destinoSearch: "", page: 1 });
  }

  async function handleDelete(frete) {
    const confirmed = window.confirm(
      `Excluir o frete ${frete.origem} → ${frete.destino} (${formatBRL(frete.valor)})?`,
    );
    if (!confirmed) return;

    setDeletingId(frete.id);
    const result = await deleteFrete(frete.id);
    setDeletingId(null);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    reload();
  }

  function openEditModal(frete) {
    setEditingFrete(frete);
    setModalOpen(true);
  }

  function openCreateModal() {
    setEditingFrete(null);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingFrete(null);
  }

  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, total);

  return (
    <div className="w-full min-w-0 space-y-4 sm:space-y-6">
      <div className="relative overflow-hidden rounded-2xl border border-primary-100/80 bg-gradient-to-br from-primary-50/80 via-white to-sky-50/40 p-4 shadow-sm sm:rounded-[2rem] sm:p-6 lg:p-8">
        <div
          className="pointer-events-none absolute -right-8 -top-8 size-28 rounded-full bg-primary-200/30 blur-3xl sm:-right-10 sm:-top-10 sm:size-40"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-6 left-1/4 size-24 rounded-full bg-sky-200/25 blur-3xl sm:-bottom-8 sm:left-1/3 sm:size-32"
          aria-hidden
        />

        <PageHeader
          eyebrow="Logística"
          title="Fretes"
          description="Catálogo de rotas e valores para consulta e gestão comercial."
          actions={
            isGestor ? (
              <Button
                type="button"
                className="w-full sm:w-auto"
                onClick={openCreateModal}
              >
                Novo frete
              </Button>
            ) : null
          }
          className="relative mb-0"
        />

        <PageInfoBanner icon={IconTruck}>
          {loading
            ? "Carregando catálogo de fretes…"
            : hasFilters
              ? `${total.toLocaleString("pt-BR")} rota(s) encontrada(s) com os filtros aplicados.`
              : `${total.toLocaleString("pt-BR")} rotas disponíveis no catálogo.`}
        </PageInfoBanner>
      </div>

      {error ? <AlertMessage>{error}</AlertMessage> : null}

      <FreteStatsBar
        total={total}
        page={page}
        pageSize={PAGE_SIZE}
        rows={rows}
        loading={loading}
      />

      <FreteFiltersPanel
        origemSearch={origemSearch}
        destinoSearch={destinoSearch}
        hasFilters={hasFilters}
        onClear={clearFilters}
        onOrigemChange={(e) => {
          patchFilters({ origemSearch: e.target.value, page: 1 });
        }}
        onDestinoChange={(e) => {
          patchFilters({ destinoSearch: e.target.value, page: 1 });
        }}
      />

      <FreteTable
        rows={rows}
        loading={loading}
        emptyMessage={emptyMessage}
        isGestor={isGestor}
        deletingId={deletingId}
        onEdit={openEditModal}
        onDelete={(item) => void handleDelete(item)}
      />

      <FretePagination
        page={page}
        totalPages={totalPages}
        rangeStart={rangeStart}
        rangeEnd={rangeEnd}
        total={total}
        loading={loading}
        onPrev={() => patchFilters({ page: Math.max(1, page - 1) })}
        onNext={() => patchFilters({ page: Math.min(totalPages, page + 1) })}
      />

      {isGestor ? (
        <ModalFreteForm
          open={modalOpen}
          mode={editingFrete ? "edit" : "create"}
          freteId={editingFrete?.id}
          initial={editingFrete ?? undefined}
          onClose={closeModal}
          onSaved={() => reload()}
        />
      ) : null}
    </div>
  );
}
