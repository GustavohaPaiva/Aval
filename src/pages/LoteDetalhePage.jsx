import { useCallback, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  LoteLaunchBar,
  LoteProductsSection,
  LoteProfileHero,
  SiblingQuartersNav,
} from "../components/importacao/LoteDetailVisuals";
import { LoteMetadataPanel } from "../components/importacao/LoteMetadataPanel";
import { ModalStagingRowForm } from "../components/importacao/ModalStagingRowForm";
import {
  StagingMatchSummary,
  StagingProductsTable,
} from "../components/importacao/StagingProductsTable";
import { AlertMessage } from "../components/ui/AlertMessage";
import { Button } from "../components/ui/Button";
import { ButtonGroup } from "../components/ui/ButtonGroup";
import { EmptyState } from "../components/ui/EmptyState";
import { Modal } from "../components/ui/Modal";
import { PageBackLink } from "../components/ui/PageBackLink";
import { Select } from "../components/ui/Select";
import { useSyncPageLoading } from "../contexts/PageLoadingContext";
import { useAbortableAsync } from "../hooks/useAbortableAsync";
import {
  applyStagingMatchToLote,
  buildStagingIdentityCounts,
  bulkUpdateStagingClasse,
  createStagingRow,
  deleteStagingRow,
  fetchLoteById,
  fetchProdutosOficiaisByLote,
  fetchStagingByLote,
  getStagingRowErrors,
  inativarListaImportacao,
  promoverLote,
  reativarListaImportacao,
  updateLoteMetadata,
  updateStagingRow,
} from "../services/produtoImportacaoService";
import { CLASSES_PRODUTO } from "../constants/mapeamentoCampos";

export function LoteDetalhePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const siblingLotes = location.state?.siblingLotes ?? [];
  const routeSuccessMessage = location.state?.successMessage ?? null;
  const cameFromListas = location.state?.from === "listas";
  const backTo = cameFromListas ? "/admin/listas" : "/admin/importacao";
  const backLabel = cameFromListas
    ? "Voltar às listas"
    : "Voltar ao lançamento";

  const [lote, setLote] = useState(null);
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(Boolean(id));
  const [error, setError] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(routeSuccessMessage);
  const [launching, setLaunching] = useState(false);
  const [confirmLaunchOpen, setConfirmLaunchOpen] = useState(false);
  const [rowModalOpen, setRowModalOpen] = useState(false);
  const [editingRow, setEditingRow] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkClasse, setBulkClasse] = useState("");
  const [bulkApplying, setBulkApplying] = useState(false);
  const [listaActionLoading, setListaActionLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  const productsReadOnly = lote?.status === "concluido";
  const metadataEditable =
    lote?.status === "aguardando_validacao" || lote?.status === "concluido";
  const loteEstadoPadrao = lote?.estado_padrao ?? "";

  const enrichedRows = useMemo(() => {
    if (!lote) return rows;
    const nomeCounts = buildStagingIdentityCounts(rows);
    const ctx = {
      identityCounts: nomeCounts,
      loteEstadoPadrao: lote.estado_padrao ?? "",
      loteDescontoUsd: lote.desconto_usd ?? 0,
    };
    return rows.map((row) => ({
      ...row,
      staging_erros: row.staging_erros ?? getStagingRowErrors(row, ctx),
    }));
  }, [rows, lote]);

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return enrichedRows.filter((row) => {
      if (statusFilter !== "all" && row.status_linha !== statusFilter) {
        return false;
      }
      if (!q) return true;
      return (row.nome ?? "").toLowerCase().includes(q);
    });
  }, [enrichedRows, statusFilter, searchQuery]);

  const statusFilterOptions = useMemo(() => {
    const counts = enrichedRows.reduce(
      (acc, row) => {
        acc[row.status_linha] = (acc[row.status_linha] ?? 0) + 1;
        return acc;
      },
      { novo: 0, atualizacao: 0, erro: 0 },
    );
    return [
      { value: "all", label: `Todos (${enrichedRows.length})` },
      { value: "erro", label: `Com erro (${counts.erro ?? 0})` },
      { value: "novo", label: `Novos (${counts.novo ?? 0})` },
      { value: "atualizacao", label: `Atualizações (${counts.atualizacao ?? 0})` },
    ];
  }, [enrichedRows]);

  const hasSearchQuery = Boolean(searchQuery.trim());
  const tableEmptyMessage = hasSearchQuery
    ? "Nenhum produto corresponde à busca."
    : statusFilter === "all"
      ? "Nenhum produto neste lote."
      : statusFilter === "erro"
        ? "Nenhum produto com erro neste filtro."
        : "Nenhum produto corresponde ao filtro selecionado.";
  const semEstadoCount = enrichedRows.filter(
    (r) => !String(r.estado ?? "").trim() && !String(loteEstadoPadrao).trim(),
  ).length;

  const loadData = useCallback(
    async (isActive) => {
      if (!id) return;

      setLoading(true);
      setError(null);

      const loteRes = await fetchLoteById(id);
      if (!isActive || !isActive()) return;

      if (!loteRes.ok) {
        setLoading(false);
        setError(loteRes.error);
        setLote(null);
        setRows([]);
        return;
      }

      setLote(loteRes.row);

      if (loteRes.row.status === "concluido") {
        const oficiaisRes = await fetchProdutosOficiaisByLote(id);
        if (!isActive || !isActive()) return;

        if (!oficiaisRes.ok) {
          setLoading(false);
          setError(oficiaisRes.error);
          return;
        }

        setRows(oficiaisRes.rows);
        setSummary(null);
        setLoading(false);
        return;
      }

      const stagingRes = await fetchStagingByLote(id);
      if (!isActive || !isActive()) return;

      if (!stagingRes.ok) {
        setLoading(false);
        setError(stagingRes.error);
        return;
      }

      if (loteRes.row.status === "aguardando_validacao") {
        const matchRes = await applyStagingMatchToLote(
          id,
          loteRes.row.fornecedor_id,
        );
        if (!isActive || !isActive()) return;

        if (matchRes.ok) {
          setRows(matchRes.rows);
          setSummary(matchRes.summary);
        } else {
          setRows(stagingRes.rows);
        }
      } else {
        setRows(stagingRes.rows);
      }

      setLoading(false);
    },
    [id],
  );

  useSyncPageLoading(loading);

  useAbortableAsync(
    async (_signal, isActive) => {
      await loadData(isActive);
    },
    [loadData],
    Boolean(id),
  );

  const canLaunch = useMemo(() => {
    if (!lote || lote.status !== "aguardando_validacao") return false;
    if (!lote.moeda_detectada?.trim() || !lote.quarter_calculado?.trim()) {
      return false;
    }
    if (semEstadoCount > 0) return false;
    if (!summary) return rows.length > 0;
    return summary.erros === 0 && rows.length > 0;
  }, [lote, summary, rows.length, semEstadoCount]);

  async function refreshMatch() {
    const matchRes = await applyStagingMatchToLote(id, lote.fornecedor_id);
    if (matchRes.ok) {
      setRows(matchRes.rows);
      setSummary(matchRes.summary);
    }
  }

  async function refreshLaunchedProducts() {
    const oficiaisRes = await fetchProdutosOficiaisByLote(id);
    if (!oficiaisRes.ok) {
      setActionError(oficiaisRes.error);
      return;
    }
    setRows(oficiaisRes.rows);
  }

  async function handleRowChange(rowId, patch) {
    setActionError(null);
    const res = await updateStagingRow(rowId, patch);
    if (!res.ok) {
      setActionError(res.error);
      return;
    }
    await refreshMatch();
  }

  async function handleSaveRow(payload) {
    setActionError(null);

    if (editingRow) {
      const res = await updateStagingRow(editingRow.id, payload);
      if (!res.ok) return res;
      await refreshMatch();
      return { ok: true };
    }

    const res = await createStagingRow(id, payload);
    if (!res.ok) return res;
    await refreshMatch();
    return { ok: true };
  }

  async function handleDeleteRow(rowId) {
    if (!window.confirm("Excluir este produto do lote?")) return;

    setActionError(null);
    const res = await deleteStagingRow(rowId);
    if (!res.ok) {
      setActionError(res.error);
      return;
    }

    setSelectedIds((prev) => prev.filter((x) => x !== rowId));
    await refreshMatch();
  }

  async function handleLoteMetadataSave(patch) {
    const res = await updateLoteMetadata(id, patch);
    if (!res.ok) {
      setActionError(res.error);
      return;
    }
    setActionError(null);
    setLote((prev) => ({ ...prev, ...res.row }));

    if (lote?.status === "concluido") {
      const updatedCount = res.cascade?.updatedCount ?? 0;
      setSuccessMessage(
        updatedCount > 0
          ? `Metadados salvos. ${updatedCount} produto(s) do catálogo atualizado(s) com o novo padrão; produtos com valor diferente (editados individualmente) foram mantidos. Simulações já salvas não são alteradas.`
          : "Metadados da lista salvos. Nenhum produto do catálogo precisava ser atualizado (já estavam customizados ou sem mudança efetiva).",
      );
      await refreshLaunchedProducts();
      return;
    }

    await refreshMatch();
  }

  async function handleBulkClasse(onlySelected) {
    setActionError(null);
    setBulkApplying(true);

    const rowIds = onlySelected ? selectedIds : null;
    const res = await bulkUpdateStagingClasse(id, bulkClasse, rowIds);
    setBulkApplying(false);

    if (!res.ok) {
      setActionError(res.error);
      return;
    }

    setBulkClasse("");
    await loadData(() => true);
  }

  async function handleInativarLista() {
    if (
      !window.confirm(
        "Inativar esta lista de produtos e todos os produtos vinculados a ela no catálogo? Esta ação não restaura a lista anterior automaticamente.",
      )
    ) {
      return;
    }
    setListaActionLoading(true);
    setActionError(null);
    const res = await inativarListaImportacao(id);
    setListaActionLoading(false);
    if (!res.ok) {
      setActionError(res.error);
      return;
    }
    await loadData(() => true);
  }

  async function handleReativarLista() {
    if (
      !window.confirm("Reativar esta lista de produtos e os produtos vinculados a ela?")
    ) {
      return;
    }
    setListaActionLoading(true);
    setActionError(null);
    const res = await reativarListaImportacao(id);
    setListaActionLoading(false);
    if (!res.ok) {
      setActionError(res.error);
      return;
    }
    await loadData(() => true);
  }

  function toggleSelect(rowId) {
    setSelectedIds((prev) =>
      prev.includes(rowId) ? prev.filter((x) => x !== rowId) : [...prev, rowId],
    );
  }

  function toggleSelectAll() {
    if (rows.every((r) => selectedIds.includes(r.id))) {
      setSelectedIds([]);
    } else {
      setSelectedIds(rows.map((r) => r.id));
    }
  }

  async function handleLaunch() {
    setLaunching(true);
    setActionError(null);

    const res = await promoverLote(id);
    setLaunching(false);
    setConfirmLaunchOpen(false);

    if (!res.ok) {
      setActionError(res.error);
      return;
    }

    const { novos = 0, atualizacoes = 0, listas_inativadas = 0 } =
      res.result ?? {};
    const baseMsg = `Lista lançada com sucesso: ${novos} novo(s), ${atualizacoes} atualização(ões).`;
    const inativaMsg =
      Number(listas_inativadas) > 0
        ? ` ${listas_inativadas} lista(s) anterior(es) inativada(s).`
        : "";
    navigate("/admin/listas", {
      state: {
        successMessage: `${baseMsg}${inativaMsg}`,
      },
    });
  }

  if (!id) {
    return (
      <div className="w-full min-w-0 space-y-4">
        <PageBackLink to={backTo}>{backLabel}</PageBackLink>
        <AlertMessage>Lote não informado.</AlertMessage>
      </div>
    );
  }

  return (
    <div className="w-full min-w-0 space-y-4 sm:space-y-6">
      <PageBackLink to={backTo}>{backLabel}</PageBackLink>

      {loading ? (
        <EmptyState
          title="Carregando lote…"
          description="Buscando produtos extraídos."
        />
      ) : error && !lote ? (
        <AlertMessage>{error}</AlertMessage>
      ) : lote ? (
        <>
          <LoteProfileHero
            lote={lote}
            productsCount={rows.length}
            semEstadoCount={semEstadoCount}
            launched={productsReadOnly}
          />

          {error ? <AlertMessage>{error}</AlertMessage> : null}
          {actionError ? <AlertMessage>{actionError}</AlertMessage> : null}
          {successMessage ? (
            <AlertMessage tone="info">{successMessage}</AlertMessage>
          ) : null}

          <SiblingQuartersNav
            siblingLotes={siblingLotes}
            currentLoteId={lote.id}
            currentQuarter={lote.quarter_calculado}
          />

          <LoteMetadataPanel
            key={`${lote.id}-${lote.moeda_detectada}-${lote.data_validade}-${lote.quarter_calculado}-${lote.desconto_usd}-${lote.estado_padrao}-${lote.taxa_antecipacao}-${lote.taxa_juros}`}
            lote={lote}
            readOnly={!metadataEditable}
            launched={lote.status === "concluido"}
            onSave={handleLoteMetadataSave}
          />

          {lote.status === "concluido" ? (
            <div className="flex flex-wrap gap-2">
              {lote.ativo === false ? (
                <Button
                  type="button"
                  variant="secondary"
                  loading={listaActionLoading}
                  onClick={() => void handleReativarLista()}
                >
                  Reativar lista de produtos
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="secondary"
                  loading={listaActionLoading}
                  onClick={() => void handleInativarLista()}
                >
                  Inativar lista de produtos
                </Button>
              )}
            </div>
          ) : null}

          {!productsReadOnly && summary ? (
            <StagingMatchSummary summary={summary} />
          ) : null}

          {!productsReadOnly && summary?.erros > 0 ? (
            <AlertMessage tone="info">
              {summary.erros} produto(s) com erro impedem o lançamento. Use o
              filtro &quot;Com erro&quot; e corrija os problemas indicados em
              cada linha.
            </AlertMessage>
          ) : null}

          <LoteProductsSection
            productsCount={rows.length}
            launched={productsReadOnly}
            inactive={lote.ativo === false}
            semEstadoCount={semEstadoCount}
            searchQuery={searchQuery}
            onSearchChange={(e) => setSearchQuery(e.target.value)}
            statusFilter={statusFilter}
            onStatusFilterChange={(e) => setStatusFilter(e.target.value)}
            statusFilterOptions={statusFilterOptions}
            showStatusFilter={!productsReadOnly}
            onAddProduct={() => {
              setEditingRow(null);
              setRowModalOpen(true);
            }}
            onLaunch={() => setConfirmLaunchOpen(true)}
            canLaunch={canLaunch}
            errorCount={summary?.erros ?? 0}
            onShowErrors={() => setStatusFilter("erro")}
          >
            {!productsReadOnly ? (
              <div className="flex flex-col gap-3 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm sm:flex-row sm:items-end sm:rounded-3xl sm:p-5">
                <div className="min-w-0 flex-1">
                  <Select
                    label="Classe em massa"
                    value={bulkClasse}
                    onChange={(e) => setBulkClasse(e.target.value)}
                    options={CLASSES_PRODUTO}
                  />
                </div>
                <ButtonGroup align="stretch" className="sm:flex-1">
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={!bulkClasse || bulkApplying}
                    onClick={() => void handleBulkClasse(false)}
                  >
                    Aplicar classe a todos
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={
                      !bulkClasse || bulkApplying || selectedIds.length === 0
                    }
                    onClick={() => void handleBulkClasse(true)}
                  >
                    Aplicar aos selecionados ({selectedIds.length})
                  </Button>
                </ButtonGroup>
              </div>
            ) : null}

            <StagingProductsTable
              rows={filteredRows}
              loading={false}
              readOnly={productsReadOnly}
              loteMoeda={lote.moeda_detectada}
              loteDescontoUsd={lote.desconto_usd}
              loteEstadoPadrao={lote.estado_padrao}
              selectedIds={selectedIds}
              onToggleSelect={toggleSelect}
              onToggleSelectAll={toggleSelectAll}
              onRowChange={handleRowChange}
              emptyMessage={tableEmptyMessage}
              onEdit={(row) => {
                setEditingRow(row);
                setRowModalOpen(true);
              }}
              onDelete={handleDeleteRow}
            />
          </LoteProductsSection>

          {!productsReadOnly ? (
            <LoteLaunchBar
              canLaunch={canLaunch}
              launching={launching}
              onLaunch={() => setConfirmLaunchOpen(true)}
              summary={summary}
              quarter={lote.quarter_calculado}
              moeda={lote.moeda_detectada}
            />
          ) : null}

          <ModalStagingRowForm
            key={editingRow?.id ?? `create-${rowModalOpen}`}
            open={rowModalOpen}
            onClose={() => {
              setRowModalOpen(false);
              setEditingRow(null);
            }}
            initial={editingRow}
            title={editingRow ? "Editar produto" : "Adicionar produto"}
            loteMoeda={lote.moeda_detectada ?? "BRL"}
            loteQuarter={lote.quarter_calculado ?? ""}
            loteEstado={lote.estado_padrao ?? ""}
            onSave={handleSaveRow}
          />

          <Modal
            open={confirmLaunchOpen}
            onClose={() => setConfirmLaunchOpen(false)}
            title="Confirmar lançamento"
            footer={
              <ButtonGroup>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setConfirmLaunchOpen(false)}
                  disabled={launching}
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  loading={launching}
                  onClick={() => void handleLaunch()}
                >
                  Confirmar lançamento
                </Button>
              </ButtonGroup>
            }
          >
            <p className="text-sm text-slate-700">
              {summary
                ? `Serão lançados ${summary.novos} produto(s) novo(s) e ${summary.atualizacoes} atualização(ões) no catálogo oficial (quarter ${lote.quarter_calculado}, moeda ${lote.moeda_detectada}).`
                : "Os produtos serão publicados no catálogo oficial."}
            </p>
          </Modal>
        </>
      ) : null}
    </div>
  );
}
