import { useCallback, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { LoteMetadataPanel } from "../components/importacao/LoteMetadataPanel";
import { ModalStagingRowForm } from "../components/importacao/ModalStagingRowForm";
import {
  StagingMatchSummary,
  StagingProductsTable,
} from "../components/importacao/StagingProductsTable";
import { ImportacaoStatusBadge } from "../components/importacao/ImportacaoVisuals";
import { AlertMessage } from "../components/ui/AlertMessage";
import { Button } from "../components/ui/Button";
import { ButtonGroup } from "../components/ui/ButtonGroup";
import { EmptyState } from "../components/ui/EmptyState";
import { Modal } from "../components/ui/Modal";
import { PageBackLink } from "../components/ui/PageBackLink";
import { PageHeader } from "../components/ui/PageHeader";
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
  fetchStagingByLote,
  getStagingRowErrors,
  inativarListaImportacao,
  promoverLote,
  reativarListaImportacao,
  updateLoteMetadata,
  updateStagingRow,
} from "../services/produtoImportacaoService";
import { CLASSES_PRODUTO } from "../constants/mapeamentoCampos";
import { formatLoteDate } from "../utils/importacaoVisuals";

export function LoteDetalhePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const siblingLotes = location.state?.siblingLotes ?? [];
  const routeSuccessMessage = location.state?.successMessage ?? null;

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

  const readOnly = lote?.status === "concluido";
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
    if (statusFilter === "all") return enrichedRows;
    return enrichedRows.filter((row) => row.status_linha === statusFilter);
  }, [enrichedRows, statusFilter]);

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

  const tableEmptyMessage =
    statusFilter === "all"
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
    setLote((prev) => ({ ...prev, ...res.row }));
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

    const { novos = 0, atualizacoes = 0 } = res.result ?? {};
    navigate("/admin/importacao", {
      state: {
        successMessage: `Lote lançado com sucesso: ${novos} novo(s), ${atualizacoes} atualização(ões).`,
      },
    });
  }

  if (!id) {
    return (
      <div className="w-full min-w-0 space-y-4">
        <PageBackLink to="/admin/importacao">Voltar ao lançamento</PageBackLink>
        <AlertMessage>Lote não informado.</AlertMessage>
      </div>
    );
  }

  return (
    <div className="w-full min-w-0 space-y-4 sm:space-y-6">
      <PageBackLink to="/admin/importacao">Voltar ao lançamento</PageBackLink>

      {loading ? (
        <EmptyState
          title="Carregando lote…"
          description="Buscando produtos extraídos."
        />
      ) : error && !lote ? (
        <AlertMessage>{error}</AlertMessage>
      ) : lote ? (
        <>
          <PageHeader
            eyebrow="Revisão de extração"
            title={lote.fornecedor_nome}
            description={`Enviado em ${formatLoteDate(lote.data_upload)}`}
            actions={<ImportacaoStatusBadge status={lote.status} />}
          />

          {error ? <AlertMessage>{error}</AlertMessage> : null}
          {actionError ? <AlertMessage>{actionError}</AlertMessage> : null}
          {successMessage ? (
            <AlertMessage tone="info">{successMessage}</AlertMessage>
          ) : null}
          {siblingLotes.length > 0 ? (
            <AlertMessage tone="info">
              Outros lançamentos desta planilha:{' '}
              {siblingLotes.map((sibling, index) => (
                <span key={sibling.loteId}>
                  {index > 0 ? ', ' : null}
                  <Link
                    className="font-semibold text-primary-700 underline decoration-primary-200 underline-offset-2 hover:text-primary-800"
                    to={`/admin/importacao/lote/${sibling.loteId}`}
                  >
                    {sibling.quarter || 'Lote'}
                  </Link>
                </span>
              ))}
              . Valide e promova cada um independentemente.
            </AlertMessage>
          ) : null}

          <LoteMetadataPanel
            key={`${lote.id}-${lote.moeda_detectada}-${lote.data_validade}-${lote.quarter_calculado}-${lote.desconto_usd}-${lote.estado_padrao}`}
            lote={lote}
            readOnly={readOnly}
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

          {!readOnly && summary ? (
            <StagingMatchSummary summary={summary} />
          ) : null}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-600">
              {rows.length} produto(s) neste lote
              {semEstadoCount > 0 && !readOnly
                ? ` · ${semEstadoCount} sem estado`
                : ""}
              {readOnly ? " · somente leitura" : ""}
              {lote.ativo === false ? " · lista de produtos inativa" : ""}
            </p>
            {!readOnly ? (
              <ButtonGroup align="stretch">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setEditingRow(null);
                    setRowModalOpen(true);
                  }}
                >
                  Adicionar produto
                </Button>
                <Button
                  type="button"
                  disabled={!canLaunch}
                  onClick={() => setConfirmLaunchOpen(true)}
                >
                  Lançar produtos
                </Button>
              </ButtonGroup>
            ) : null}
          </div>

          {!readOnly && summary?.erros > 0 ? (
            <AlertMessage tone="info">
              {summary.erros} produto(s) com erro impedem o lançamento. Use o
              filtro &quot;Com erro&quot; abaixo e corrija os problemas
              indicados em cada linha.
            </AlertMessage>
          ) : null}

          {!readOnly ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div className="w-full sm:max-w-xs">
                <Select
                  label="Filtrar produtos"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  options={statusFilterOptions}
                />
              </div>
              {summary?.erros > 0 && statusFilter !== "erro" ? (
                <Button
                  type="button"
                  variant="secondary"
                  className="sm:shrink-0"
                  onClick={() => setStatusFilter("erro")}
                >
                  Ver apenas erros ({summary.erros})
                </Button>
              ) : null}
            </div>
          ) : null}

          {!readOnly ? (
            <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-end">
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
            readOnly={readOnly}
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
