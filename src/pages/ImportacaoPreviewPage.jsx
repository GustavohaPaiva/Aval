import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { SpreadsheetPreviewPanel } from "../components/importacao/SpreadsheetPreviewPanel";
import { AlertMessage } from "../components/ui/AlertMessage";
import { Button } from "../components/ui/Button";
import { ButtonGroup } from "../components/ui/ButtonGroup";
import { EmptyState } from "../components/ui/EmptyState";
import { Input } from "../components/ui/Input";
import { PageBackLink } from "../components/ui/PageBackLink";
import { PageHeader } from "../components/ui/PageHeader";
import { Select } from "../components/ui/Select";
import {
  IGNORE_COLUMN_VALUE,
  MAPPING_TARGET_LABELS,
  SYSTEM_MAPPING_FIELDS,
} from "../constants/mapeamentoCampos";
import { useSyncPageLoading } from "../contexts/PageLoadingContext";
import { useAbortableAsync } from "../hooks/useAbortableAsync";
import {
  lookupOrCreateFornecedor,
  processLoteAuto,
  processLotesPorQuarter,
} from "../services/produtoImportacaoService";
import {
  filterDataRows,
  findCatalogColumnIndex,
  findEmbalagemColumnIndex,
  groupDataRowsByQuarter,
} from "../utils/spreadsheetAnalyzer";
import { parseSpreadsheetFile } from "../utils/spreadsheetParser";

const CONFIDENCE_LABEL = {
  high: "Alta",
  medium: "Média",
  low: "Baixa",
  none: "Não detectado",
};

function mappingsToRecord(mappings) {
  const record = {};
  for (const m of mappings ?? []) {
    record[`col-${m.sourceIndex}`] = m.target;
  }
  return record;
}

function recordToMappings(columns, record) {
  return columns.map((col) => ({
    sourceIndex: col.index,
    sourceLabel: col.label,
    target: record[col.id] || IGNORE_COLUMN_VALUE,
  }));
}

export function ImportacaoPreviewPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const file = location.state?.file ?? null;

  const [error, setError] = useState(null);
  const [processError, setProcessError] = useState(null);
  const [parseState, setParseState] = useState(null);
  const [headerRowIndex, setHeaderRowIndex] = useState(0);
  const [dataValidade, setDataValidade] = useState("");
  const [quarterCalculado, setQuarterCalculado] = useState("");
  const [fornecedorNome, setFornecedorNome] = useState("");
  const [columnMapRecord, setColumnMapRecord] = useState({});
  const [mapConfidence, setMapConfidence] = useState({});
  const [loading, setLoading] = useState(Boolean(file));
  const [confirming, setConfirming] = useState(false);
  const [quarterGroups, setQuarterGroups] = useState([]);
  const [activeGroupIndex, setActiveGroupIndex] = useState(0);

  useSyncPageLoading(loading);

  useAbortableAsync(
    async (_signal, isActive) => {
      if (!file) return;
      setLoading(true);
      setError(null);
      setParseState(null);

      const result = await parseSpreadsheetFile(file);
      if (!isActive()) return;

      if (!result.ok) {
        setLoading(false);
        setError(result.error);
        return;
      }

      setHeaderRowIndex(result.headerRowIndex);
      setDataValidade(result.dataValidade ?? "");
      setQuarterCalculado(result.quarterCalculado ?? "");
      setFornecedorNome(result.fornecedorDetectado?.fornecedorNome ?? "");
      setColumnMapRecord(mappingsToRecord(result.autoMappings));
      setMapConfidence(result.autoMapConfidence ?? {});
      setQuarterGroups(result.quarterGroups ?? []);
      setActiveGroupIndex(0);
      setParseState(result);
      setLoading(false);
      setProcessError(null);
    },
    [file],
    Boolean(file),
  );

  const columnMappings = useMemo(() => {
    if (!parseState?.columns) return [];
    return recordToMappings(parseState.columns, columnMapRecord);
  }, [parseState, columnMapRecord]);

  const mappingValidation = useMemo(() => {
    const targets = columnMappings
      .map((m) => m.target)
      .filter((t) => t && t !== IGNORE_COLUMN_VALUE);
    const missingRequired = ["produto", "preco_custo"].filter(
      (t) => !targets.includes(t),
    );
    const duplicates = Object.entries(
      targets.reduce((acc, t) => {
        acc[t] = (acc[t] ?? 0) + 1;
        return acc;
      }, {}),
    )
      .filter(([, count]) => count > 1)
      .map(([t]) => t);
    return { missingRequired, duplicates };
  }, [columnMappings]);

  const lowConfidenceFields = useMemo(
    () =>
      Object.entries(mapConfidence)
        .filter(([, c]) => c === "low" || c === "none")
        .map(([field]) => MAPPING_TARGET_LABELS[field] ?? field),
    [mapConfidence],
  );

  function handleColumnMapChange(colId, target) {
    setColumnMapRecord((prev) => ({ ...prev, [colId]: target }));
  }

  const previewRows = useMemo(() => {
    if (!parseState?.matrix?.length) return [];
    return filterDataRows(parseState.matrix, headerRowIndex, {
      produtoIndex: columnMappings.find((m) => m.target === "produto")
        ?.sourceIndex,
      precoIndex: columnMappings.find((m) => m.target === "preco_custo")
        ?.sourceIndex,
      referenciaIndex: columnMappings.find(
        (m) => m.target === "referencia_complementar",
      )?.sourceIndex,
      embalagemIndex: findEmbalagemColumnIndex(
        parseState.matrix,
        headerRowIndex,
      ),
    });
  }, [parseState, headerRowIndex, columnMappings]);

  const derivedQuarterGroups = useMemo(() => {
    if (!parseState?.matrix?.length) return quarterGroups;
    const catalogIndex = findCatalogColumnIndex(
      parseState.matrix,
      headerRowIndex,
    );
    const regrouped = groupDataRowsByQuarter(previewRows, {
      catalogIndex,
      matrix: parseState.matrix,
      headerRowIndex,
      fallbackQuarter: quarterCalculado,
      fallbackValidade: dataValidade,
    });

    // Preserve user edits to validade/quarter when regrouping.
    return regrouped.map((group) => {
      const edited = quarterGroups.find((g) => g.quarter === group.quarter);
      if (!edited) return group;
      return {
        ...group,
        dataValidade: edited.dataValidade || group.dataValidade,
        quarter: edited.quarter || group.quarter,
        catalogCode: edited.catalogCode || group.catalogCode,
      };
    });
  }, [
    parseState,
    headerRowIndex,
    previewRows,
    quarterCalculado,
    dataValidade,
    quarterGroups,
  ]);

  const multiQuarter = derivedQuarterGroups.length > 1;
  const totalPreviewRows = multiQuarter
    ? derivedQuarterGroups.reduce(
        (sum, g) => sum + (g.dataRows?.length ?? 0),
        0,
      )
    : previewRows.length;

  function handleGroupFieldChange(index, patch) {
    setQuarterGroups((prev) => {
      const base =
        prev.length === derivedQuarterGroups.length
          ? prev
          : derivedQuarterGroups;
      return base.map((group, i) =>
        i === index
          ? {
              ...group,
              ...patch,
              ...(patch.quarter !== undefined
                ? { quarter: patch.quarter }
                : {}),
            }
          : group,
      );
    });
  }

  async function handleConfirm() {
    if (!file) {
      setProcessError("Sessão de importação inválida.");
      return;
    }
    if (!fornecedorNome.trim()) {
      setProcessError("Informe o fornecedor detectado na planilha.");
      return;
    }
    if (multiQuarter) {
      const missingQuarter = derivedQuarterGroups.some(
        (g) => !String(g.quarter ?? "").trim(),
      );
      if (missingQuarter) {
        setProcessError("Informe o quarter de cada grupo detectado.");
        return;
      }
    } else if (!quarterCalculado.trim()) {
      setProcessError("Informe o quarter (revise a data de validade).");
      return;
    }
    if (mappingValidation.missingRequired.length > 0) {
      const labels = mappingValidation.missingRequired.map(
        (t) => MAPPING_TARGET_LABELS[t] ?? t,
      );
      setProcessError(`Mapeie os campos obrigatórios: ${labels.join(", ")}.`);
      return;
    }
    if (mappingValidation.duplicates.length > 0) {
      setProcessError(
        "Cada campo do sistema só pode ser usado uma vez (exceto “Ignorar coluna”).",
      );
      return;
    }

    setProcessError(null);
    setConfirming(true);

    const parseOptions = {
      fornecedorNome: fornecedorNome.trim(),
      headerRowIndex,
      dataValidade,
      quarterCalculado,
      columnMappings,
      autoMapConfidence: mapConfidence,
      metadataPlanilha: parseState?.metadataPlanilha ?? {},
    };

    const fornRes = await lookupOrCreateFornecedor(parseOptions.fornecedorNome);
    if (!fornRes.ok) {
      setConfirming(false);
      setProcessError(fornRes.error);
      return;
    }

    if (multiQuarter) {
      const res = await processLotesPorQuarter({
        fornecedorId: fornRes.row.id,
        columnMappings: parseOptions.columnMappings,
        file,
        parseOptions,
        quarterGroups: derivedQuarterGroups,
      });
      setConfirming(false);

      if (!res.ok) {
        setProcessError(res.error);
        return;
      }

      const siblingLotes = (res.lotes ?? []).slice(1);
      const labels = (res.lotes ?? [])
        .map((l) => l.quarter)
        .filter(Boolean)
        .join(", ");

      navigate(`/admin/importacao/lote/${res.loteId}`, {
        state: {
          siblingLotes,
          successMessage: `Criados ${res.lotes?.length ?? 0} lançamentos separados (${labels}). Valide e promova cada um.`,
        },
      });
      return;
    }

    const res = await processLoteAuto({
      fornecedorId: fornRes.row.id,
      columnMappings: parseOptions.columnMappings,
      file,
      parseOptions,
    });
    setConfirming(false);

    if (!res.ok) {
      setProcessError(res.error);
      return;
    }

    navigate(`/admin/importacao/lote/${res.loteId}`);
  }

  if (!file) {
    return (
      <div className="w-full min-w-0 space-y-4">
        <PageBackLink to="/admin/importacao">Voltar ao lançamento</PageBackLink>
        <AlertMessage>
          Nenhuma planilha selecionada. Envie um arquivo na tela de lançamento.
        </AlertMessage>
      </div>
    );
  }

  const confirmLabel = multiQuarter
    ? `Processar ${derivedQuarterGroups.length} lançamentos`
    : "Processar lote";

  return (
    <div className="w-full min-w-0 space-y-4 sm:space-y-6">
      <PageBackLink to="/admin/importacao">Voltar ao lançamento</PageBackLink>

      <div className="relative overflow-hidden rounded-2xl border border-primary-100/80 bg-gradient-to-br from-primary-50/80 via-white to-sky-50/40 p-4 shadow-sm sm:rounded-[2rem] sm:p-6">
        <div
          className="pointer-events-none absolute -right-8 -top-8 size-28 rounded-full bg-primary-200/30 blur-3xl"
          aria-hidden
        />
        <PageHeader
          eyebrow="Revisão"
          title="Revisar importação"
          description={file.name}
          className="relative mb-0"
          actions={
            <ButtonGroup>
              <Button
                type="button"
                variant="secondary"
                onClick={() => navigate("/admin/importacao")}
                disabled={confirming}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                loading={confirming}
                disabled={loading || !parseState}
                onClick={() => void handleConfirm()}
              >
                {confirmLabel}
              </Button>
            </ButtonGroup>
          }
        />
      </div>

      {loading ? (
        <EmptyState
          title="Analisando planilha…"
          description="Detectando fornecedor, quarters e colunas."
        />
      ) : error ? (
        <AlertMessage>{error}</AlertMessage>
      ) : parseState ? (
        <>
          {processError ? <AlertMessage>{processError}</AlertMessage> : null}

          {multiQuarter ? (
            <AlertMessage tone="info">
              Esta planilha gerará {derivedQuarterGroups.length} listas
              separadas ({derivedQuarterGroups
                .map((g) => g.quarter)
                .filter(Boolean)
                .join(", ")}
              ). Você revisará e lançará cada quarter de forma independente.
            </AlertMessage>
          ) : null}

          <section className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm sm:rounded-3xl">
            <div className="border-b border-slate-100 bg-gradient-to-r from-primary-50/70 via-white to-emerald-50/40 px-4 py-3.5 sm:px-6 sm:py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary-700">
                Fornecedor
              </p>
              <p className="mt-1 text-sm text-slate-600">
                Confirme o fornecedor detectado na planilha.
              </p>
            </div>
            <div className="p-4 sm:p-6">
              <Input
                label="Fornecedor detectado"
                value={fornecedorNome}
                onChange={(e) => setFornecedorNome(e.target.value)}
                placeholder="Ex.: YARA"
              />
              {parseState.fornecedorDetectado?.confidence ? (
                <p className="mt-1 text-xs text-slate-500">
                  Confiança da detecção:{" "}
                  {CONFIDENCE_LABEL[parseState.fornecedorDetectado.confidence] ??
                    parseState.fornecedorDetectado.confidence}
                </p>
              ) : null}
            </div>
          </section>

          <SpreadsheetPreviewPanel
            dataValidade={dataValidade}
            onDataValidadeChange={setDataValidade}
            quarterCalculado={quarterCalculado}
            onQuarterChange={setQuarterCalculado}
            previewRows={previewRows}
            quarterGroups={derivedQuarterGroups}
            activeGroupIndex={activeGroupIndex}
            onActiveGroupIndexChange={setActiveGroupIndex}
            onGroupFieldChange={handleGroupFieldChange}
          />

          {lowConfidenceFields.length > 0 ? (
            <AlertMessage tone="info">
              Revise o mapeamento das colunas com baixa confiança:{" "}
              {lowConfidenceFields.join(", ")}.
            </AlertMessage>
          ) : null}

          <section className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm sm:rounded-3xl">
            <div className="border-b border-slate-100 bg-gradient-to-r from-primary-50/70 via-white to-sky-50/40 px-4 py-3.5 sm:px-6 sm:py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary-700">
                Mapeamento das colunas
              </p>
              <p className="mt-1 text-sm text-slate-600">
                {totalPreviewRows} linha(s) serão importadas
                {multiQuarter
                  ? ` em ${derivedQuarterGroups.length} lançamentos separados`
                  : ""}{" "}
                (embalagem 1000KG / Big bag liner, quando a coluna existir).
              </p>
            </div>

            <div className="divide-y divide-slate-100">
              {parseState.columns.map((col) => {
                const selected = columnMapRecord[col.id] ?? "";
                const targetLabel =
                  selected && selected !== IGNORE_COLUMN_VALUE
                    ? MAPPING_TARGET_LABELS[selected]
                    : null;
                const confidenceForCol =
                  selected && selected !== IGNORE_COLUMN_VALUE
                    ? mapConfidence[selected]
                    : null;

                return (
                  <div
                    key={col.id}
                    className="grid gap-2 px-4 py-3.5 sm:grid-cols-2 sm:items-center sm:px-6"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-mono text-sm font-medium text-slate-900">
                        {col.label}
                      </p>
                      {targetLabel && confidenceForCol ? (
                        <p className="mt-0.5 text-xs text-slate-500">
                          {targetLabel} · confiança{" "}
                          {CONFIDENCE_LABEL[confidenceForCol] ??
                            confidenceForCol}
                        </p>
                      ) : (
                        <p className="mt-0.5 text-xs text-slate-400">
                          Coluna da planilha
                        </p>
                      )}
                    </div>
                    <Select
                      aria-label={`Mapear coluna ${col.label}`}
                      placeholder="Selecione o campo…"
                      value={selected}
                      onChange={(e) =>
                        handleColumnMapChange(col.id, e.target.value)
                      }
                      options={SYSTEM_MAPPING_FIELDS}
                    />
                  </div>
                );
              })}
            </div>
          </section>

          <div className="sticky bottom-0 z-10 -mx-4 border-t border-slate-200/80 bg-white/95 px-4 py-4 backdrop-blur-sm sm:mx-0 sm:rounded-2xl sm:border sm:shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900">
                  {multiQuarter
                    ? `Processar ${derivedQuarterGroups.length} lançamentos`
                    : "Processar lote"}
                </p>
                <p className="mt-0.5 text-xs text-slate-600">
                  {totalPreviewRows} produto(s) · {fornecedorNome || "fornecedor"}
                </p>
              </div>
              <ButtonGroup className="sm:shrink-0">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => navigate("/admin/importacao")}
                  disabled={confirming}
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  loading={confirming}
                  disabled={loading || !parseState}
                  onClick={() => void handleConfirm()}
                >
                  {confirmLabel}
                </Button>
              </ButtonGroup>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
