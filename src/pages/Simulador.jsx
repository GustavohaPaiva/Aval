import { createElement, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAlertDialog } from '../contexts/AlertDialogProvider'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AtribuirConsultorPanel } from "../components/AtribuirConsultorPanel";
import { ModalClienteForm } from "../components/clientes/ModalClienteForm";
import {
  SIMULADOR_SECTION_ICONS,
  SimuladorSectionPanel,
  SimuladorSummaryBar,
} from "../components/simulador/SimuladorVisuals";
import { SimulationLineCard } from "../components/simulador/SimulationLineCard";
import { SimulationLinesTable } from "../components/simulador/SimulationLinesTable";
import { SimulacaoPdfDocument } from "../components/simulador/SimulacaoPdfDocument";
import { PdfPreviewModal } from "../components/pdf/PdfPreviewModal";
import { IconClipboardList } from "../components/icons";
import { AlertMessage } from "../components/ui/AlertMessage";
import { Button } from "../components/ui/Button";
import { Combobox } from "../components/ui/Combobox";
import { EmptyState } from "../components/ui/EmptyState";
import { FormattedInput } from "../components/ui/FormattedInput";
import { BotaoAssistenteIA, CampoTextoComIA } from "../components/ui/CampoTextoComIA";
import { DatePicker } from "../components/ui/DatePicker";
import { PageBackLink } from "../components/ui/PageBackLink";
import { PageHeader } from "../components/ui/PageHeader";
import { PageInfoBanner } from "../components/ui/InfoStatCard";
import { Select } from "../components/ui/Select";
import { FREIGHT_TYPES, QUARTERS, STATES } from "../constants/simulator";
import { FRETE_ORIGENS } from "../constants/fretes";
import { isPedidoStatus } from "../constants/simulationStatus";
import { useAbortableAsync } from "../hooks/useAbortableAsync";
import { useAuth } from "../hooks/useAuth";
import { useSimulation } from "../hooks/useSimulation";
import {
  fetchSimulationOrderBundle,
  persistConvertedSimulation,
  requestOrderConversion,
  saveDraftSimulation,
  savePendingSimulation,
  saveGestorReview,
  searchClients,
  updateSimulationStatus,
} from "../services/simulationOrderService";
import { buildPdfBlobFromReactNode } from "../services/renderReactPdf";
import { notifyGestoresSimulationPending } from "../services/notificationService";
import { fetchComissaoFaixas } from "../services/comissaoService";
import {
  fetchCatalogoSimulador,
} from "../services/produtoCatalogoService";
import { fetchParametrosSistema } from "../services/parametrosService";
import {
  fetchFreteDestinosAtivos,
  fetchFreteOrigensAtivas,
  lookupFreteValor,
} from "../services/freteService";
import { formatBRL } from "../utils/money";
import { displayCpfCnpj, validateCpfCnpj } from "../utils/dataFormatters";
import { DEFAULT_AUTONOMIA_PARAMS } from "../utils/autonomiaDesconto";
import { DEFAULT_ICMS_PERCENTUAL, DEFAULT_MARGEM_PERCENTUAL } from "../utils/pricingCalculations";

export function Simulador() {
  const [searchParams] = useSearchParams();
  const simulationId = searchParams.get("simulationId");
  const { role, profile } = useAuth();
  const [catalog, setCatalog] = useState([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogReady, setCatalogReady] = useState(false);
  const [freteUnitario, setFreteUnitario] = useState(0);
  const [freteOrigens, setFreteOrigens] = useState([]);
  const [freteDestinos, setFreteDestinos] = useState([]);
  const [freteLookupError, setFreteLookupError] = useState(null);
  const [icmsPercentual, setIcmsPercentual] = useState(DEFAULT_ICMS_PERCENTUAL);
  const [pisCofinsPercentual, setPisCofinsPercentual] = useState(0);
  const [margemPercentual, setMargemPercentual] = useState(
    DEFAULT_MARGEM_PERCENTUAL,
  );
  const [autonomiaParams, setAutonomiaParams] = useState(
    DEFAULT_AUTONOMIA_PARAMS,
  );
  const [comissaoFaixas, setComissaoFaixas] = useState([]);
  const sim = useSimulation({
    role,
    catalog,
    freteUnitario,
    icmsPercentual,
    pisCofinsPercentual,
    margemPercentual,
    autonomiaParams,
    comissaoFaixas,
    persistDraft: !simulationId,
  });
  const navigate = useNavigate();
  const { showAlert } = useAlertDialog();
  const wasRemoteSimRef = useRef(Boolean(simulationId));
  const [pdfPreview, setPdfPreview] = useState(null);
  const [pdfError, setPdfError] = useState(null);
  const [assignedUserId, setAssignedUserId] = useState(null);
  const [assignedVendedorNome, setAssignedVendedorNome] = useState(null);

  function ensureValidClientDocument() {
    const validation = validateCpfCnpj(sim.clientCnpjCpf, { required: false });
    if (!validation.ok) {
      showAlert({
        title: "CPF / CNPJ inválido",
        message: validation.message,
      });
      return false;
    }
    return true;
  }
  const [persisting, setPersisting] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [notifying, setNotifying] = useState(false);
  const [persistError, setPersistError] = useState(null);
  const [saveError, setSaveError] = useState(null);
  const [notifyError, setNotifyError] = useState(null);
  const [launchError, setLaunchError] = useState(null);
  const [clientModalOpen, setClientModalOpen] = useState(false);
  const [convertAfterClientSave, setConvertAfterClientSave] = useState(false);
  const [requestConversionAfterClientSave, setRequestConversionAfterClientSave] =
    useState(false);
  const [reviewSaving, setReviewSaving] = useState(false);
  const [reviewDeciding, setReviewDeciding] = useState(null);
  const [reviewError, setReviewError] = useState(null);
  const [remoteStatus, setRemoteStatus] = useState(null);
  const observacoesIARef = useRef(null);

  const loadCatalog = useCallback(async (quarter, estado, isActive) => {
    if (!quarter) {
      setCatalog([]);
      setCatalogLoading(false);
      setCatalogReady(false);
      return;
    }

    setCatalogLoading(true);
    setCatalogReady(false);
    const res = await fetchCatalogoSimulador({
      quarter,
      estado: estado || undefined,
    });
    if (isActive && !isActive()) return;
    setCatalogLoading(false);

    if (!res.ok) {
      setCatalog([]);
      setCatalogReady(true);
      return;
    }

    setCatalog(res.rows);
    if (res.icmsPercentual != null) {
      setIcmsPercentual(Number(res.icmsPercentual));
    }
    setCatalogReady(true);
  }, []);

  useAbortableAsync(
    async (_signal, isActive) => {
      const [paramRes, faixasRes] = await Promise.all([
        fetchParametrosSistema(),
        fetchComissaoFaixas({ apenasAtivas: true }),
      ]);
      if (isActive && !isActive()) return;
      if (paramRes.ok) {
        setIcmsPercentual(
          Number(paramRes.row.icms_percentual ?? DEFAULT_ICMS_PERCENTUAL),
        );
        const pisRaw = paramRes.row.pis_cofins_percentual;
        setPisCofinsPercentual(
          pisRaw == null || pisRaw === "" ? 0 : Number(pisRaw),
        );
        const margemRaw = paramRes.row.margem_percentual;
        setMargemPercentual(
          margemRaw == null || margemRaw === ""
            ? DEFAULT_MARGEM_PERCENTUAL
            : Number(margemRaw),
        );
        setAutonomiaParams({
          autonomia_dias_limiar: paramRes.row.autonomia_dias_limiar,
          autonomia_especial_longo: paramRes.row.autonomia_especial_longo,
          autonomia_convencional_longo:
            paramRes.row.autonomia_convencional_longo,
          autonomia_especial_curto: paramRes.row.autonomia_especial_curto,
          autonomia_convencional_curto:
            paramRes.row.autonomia_convencional_curto,
        });
      }
      if (faixasRes.ok) {
        setComissaoFaixas(faixasRes.rows);
      }
    },
    [],
  );

  useAbortableAsync(
    async (_signal, isActive) => {
      await loadCatalog(sim.quarter, sim.estado, isActive);
    },
    [sim.quarter, sim.estado, loadCatalog],
  );

  useEffect(() => {
    // Avoid wiping selected products while the catalog is still empty/loading
    // (e.g. local draft restore before fetchCatalogoSimulador finishes).
    if (!catalogReady || catalogLoading) return;
    sim.clearOrphanProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: catalog-driven cleanup
  }, [catalog, catalogReady, catalogLoading]);

  useAbortableAsync(
    async (_signal, isActive) => {
      if (sim.tipoFrete !== "CIF") return;
      const res = await fetchFreteOrigensAtivas();
      if (isActive && !isActive()) return;
      setFreteOrigens(res.ok ? res.values : []);
    },
    [sim.tipoFrete],
  );

  useAbortableAsync(
    async (_signal, isActive) => {
      if (sim.tipoFrete !== "CIF" || !sim.origemFrete) {
        if (isActive && !isActive()) return;
        setFreteDestinos([]);
        return;
      }
      const res = await fetchFreteDestinosAtivos(sim.origemFrete);
      if (isActive && !isActive()) return;
      setFreteDestinos(res.ok ? res.values : []);
    },
    [sim.tipoFrete, sim.origemFrete],
  );

  useAbortableAsync(
    async (_signal, isActive) => {
      if (sim.tipoFrete !== "CIF" || !sim.origemFrete || !sim.destinoFrete) {
        if (isActive && !isActive()) return;
        setFreteUnitario(0);
        setFreteLookupError(null);
        return;
      }
      const res = await lookupFreteValor(sim.origemFrete, sim.destinoFrete);
      if (isActive && !isActive()) return;
      if (res.ok) {
        setFreteUnitario(res.frete.valor);
        setFreteLookupError(null);
      } else {
        setFreteUnitario(0);
        setFreteLookupError(res.error);
      }
    },
    [sim.tipoFrete, sim.origemFrete, sim.destinoFrete],
  );

  useAbortableAsync(
    async (_signal, isActive) => {
      if (!simulationId) {
        if (wasRemoteSimRef.current) {
          sim.resetLocal();
          sim.clearDraft();
        }
        wasRemoteSimRef.current = false;
        setRemoteStatus(null);
        setAssignedUserId(null);
        setAssignedVendedorNome(null);
        return;
      }
      wasRemoteSimRef.current = true;
      const result = await fetchSimulationOrderBundle(simulationId);
      if (!isActive()) return;
      if (!result.ok) {
        navigate("/simulacoes", { replace: true });
        return;
      }
      sim.hydrateFromBundle(result.data);
      setRemoteStatus(result.data.simulation.status ?? null);
      setAssignedUserId(result.data.simulation.user_id ?? null);
      setAssignedVendedorNome(result.data.vendedorNome ?? null);
    },
    [simulationId, navigate, sim.hydrateFromBundle, sim.resetLocal, sim.clearDraft],
  );

  const handleConsultorAssigned = useCallback((result) => {
    if (result?.userId) setAssignedUserId(result.userId);
    if (result?.vendedorNome != null) {
      setAssignedVendedorNome(result.vendedorNome);
    }
  }, []);

  const handleClientSearch = useCallback(async (query, signal) => {
    const r = await searchClients(query, signal);
    if (!r.ok) return [];
    return r.rows.map((c) => ({
      id: c.id,
      label: c.nome,
      sublabel: [displayCpfCnpj(c.cnpj_cpf), c.municipio, c.uf].filter(Boolean).join(" • "),
      payload: c,
    }));
  }, []);

  const openClientRegistration = useCallback(() => {
    if (sim.isReadOnly) return;
    if (!sim.clientName.trim()) {
      setLaunchError("Informe o nome do cliente antes de cadastrar.");
      return;
    }
    setLaunchError(null);
    setClientModalOpen(true);
  }, [sim.clientName, sim.isReadOnly]);

  async function persistAndNavigate(overrideClientId) {
    if (!sim.isGestor) {
      setPersistError("Apenas gestores podem converter simulações em pedido.");
      return;
    }
    setPersisting(true);
    try {
      const result = await persistConvertedSimulation({
        ...buildSimulationPayload(),
        clientId: overrideClientId ?? sim.clientId,
      });
      if (!result.ok) {
        setPersistError(result.error);
        return;
      }
      sim.clearDraft();
      setRemoteStatus(result.status ?? "converted");
      navigate(`/pedido/${result.simulationId}`);
    } finally {
      setPersisting(false);
    }
  }

  async function persistRequestConversion(overrideClientId) {
    setPersisting(true);
    setNotifyError(null);
    setLaunchError(null);
    try {
      const result = await requestOrderConversion({
        ...buildSimulationPayload(),
        clientId: overrideClientId ?? sim.clientId,
      });
      if (!result.ok) {
        setNotifyError(result.error);
        return;
      }
      sim.clearDraft();
      setRemoteStatus(result.status ?? "conversion_requested");
      sim.lockAsPending();
      sim.showActionBanner(
        result.alreadyRequested
          ? "Conversão já havia sido solicitada. A proposta permanece bloqueada."
          : "Solicitação enviada: o gestor foi notificado para converter esta simulação em pedido. A proposta ficou bloqueada para edição.",
      );
      if (!simulationId) {
        navigate(
          `/simulador?simulationId=${encodeURIComponent(result.simulationId)}`,
          { replace: true },
        );
      }
    } finally {
      setPersisting(false);
    }
  }

  function getSaveBlockReason() {
    if (!sim.quarter) return "Selecione o quarter antes de salvar.";
    if (!sim.tipoFrete) return "Selecione o tipo de frete.";
    if (!sim.dataPagamento) return "Informe a data de pagamento.";
    if (sim.tipoFrete === "CIF") {
      if (!sim.origemFrete?.trim()) return "Selecione a origem do frete.";
      if (!sim.destinoFrete?.trim()) return "Selecione o destino do frete.";
      if (freteLookupError) return freteLookupError;
    }
    if (sim.lines.length === 0) return "Inclua ao menos um produto.";
    if (sim.lines.some((line) => !line.productId)) {
      return "Selecione o produto em todas as linhas.";
    }
    if (sim.lines.some((line) => !String(line.cultura ?? "").trim())) {
      return "Informe a cultura em todas as linhas.";
    }
    if (sim.lines.some((line) => !(Number(line.volume) > 0))) {
      return "Informe um volume maior que zero em todas as linhas.";
    }
    if (!sim.clientName.trim()) return "Informe o nome do cliente.";
    return null;
  }

  async function handleSaveSimulation() {
    setSaveError(null);
    setLaunchError(null);
    if (sim.isReadOnly) return;

    const blockReason = getSaveBlockReason();
    if (blockReason) {
      setSaveError(blockReason);
      return;
    }
    if (!ensureValidClientDocument()) return;

    setSavingDraft(true);
    try {
      const result = await saveDraftSimulation(buildSimulationPayload());
      if (!result.ok) {
        setSaveError(result.error);
        return;
      }
      sim.clearDraft();
      setRemoteStatus("draft");
      sim.showActionBanner("Simulação salva com sucesso.");
      if (!simulationId) {
        navigate(
          `/simulador?simulationId=${encodeURIComponent(result.simulationId)}`,
          { replace: true },
        );
      }
    } finally {
      setSavingDraft(false);
    }
  }

  const pdfSnapshot = useMemo(
    () => ({
      id: simulationId,
      clientName: sim.clientName,
      clientCnpjCpf: sim.clientCnpjCpf,
      dataPagamento: sim.dataPagamento,
      tipoFrete: sim.tipoFrete,
      origemFrete: sim.origemFrete,
      destinoFrete: sim.destinoFrete,
      quarter: sim.quarter,
      observacoes: sim.observacoes,
      totalProposta: sim.totalProposta,
      lines: sim.lines.map((row) => ({
        id: row.id,
        volume: row.volume,
        proposta: row.proposta,
        cultura: row.cultura,
        displayNome: row.displayNome,
      })),
    }),
    [
      simulationId,
      sim.clientName,
      sim.clientCnpjCpf,
      sim.dataPagamento,
      sim.tipoFrete,
      sim.origemFrete,
      sim.destinoFrete,
      sim.quarter,
      sim.observacoes,
      sim.totalProposta,
      sim.lines,
    ],
  );

  const canGeneratePdf =
    Boolean(sim.clientName.trim()) &&
    sim.lines.length > 0 &&
    (!sim.isReadOnly || Boolean(simulationId));

  const isDraftEditable =
    !sim.isReadOnly && (!remoteStatus || remoteStatus === "draft");

  const pdfNomeFallback = useMemo(() => {
    const safeName = (sim.clientName || "cliente")
      .replace(/[^\w-]+/g, "_")
      .slice(0, 40);
    const suffix = simulationId
      ? String(simulationId).replace(/\D/g, "").slice(-5) || "sim"
      : "rascunho";
    return `proposta-syagri-simulacao-${suffix}-${safeName}.pdf`;
  }, [sim.clientName, simulationId]);

  async function handleGerarPdf() {
    if (!canGeneratePdf) return;

    setPdfError(null);

    const frozenSnapshot = {
      ...pdfSnapshot,
      lines: pdfSnapshot.lines.map((row) => ({ ...row })),
    };
    const frozenVendedor =
      assignedVendedorNome?.trim() || profile?.nome || "";
    let snapshotForPdf = frozenSnapshot;
    let nomeForPdf = pdfNomeFallback;
    /** @type {string | null} */
    let navigateToId = null;

    const needsDraftSave = isDraftEditable;

    if (needsDraftSave) {
      const blockReason = getSaveBlockReason();
      if (blockReason) {
        setPdfError(blockReason);
        return;
      }
      if (!ensureValidClientDocument()) return;

      setSavingDraft(true);
      try {
        const result = await saveDraftSimulation(buildSimulationPayload());
        if (!result.ok) {
          setPdfError(result.error);
          return;
        }
        sim.clearDraft();
        setRemoteStatus("draft");
        if (!simulationId) {
          navigateToId = result.simulationId;
          snapshotForPdf = { ...frozenSnapshot, id: result.simulationId };
          const safeName = (frozenSnapshot.clientName || "cliente")
            .replace(/[^\w-]+/g, "_")
            .slice(0, 40);
          const suffix =
            String(result.simulationId).replace(/\D/g, "").slice(-5) || "sim";
          nomeForPdf = `proposta-syagri-simulacao-${suffix}-${safeName}.pdf`;
        }
      } finally {
        setSavingDraft(false);
      }
    } else if (!simulationId) {
      setPdfError("Salve a simulação antes de gerar o PDF.");
      return;
    }

    setSavingDraft(true);
    try {
      const blob = await buildPdfBlobFromReactNode(
        createElement(SimulacaoPdfDocument, {
          snapshot: snapshotForPdf,
          vendedorNome: frozenVendedor,
        }),
      );
      setPdfPreview({
        titulo: "Proposta comercial",
        gerador: async () => ({ blob, nomePadrao: nomeForPdf }),
        nomeFallback: nomeForPdf,
      });
      if (navigateToId) {
        navigate(
          `/simulador?simulationId=${encodeURIComponent(navigateToId)}`,
          { replace: true },
        );
      }
    } catch (e) {
      console.error("[Simulador] PDF:", e);
      setPdfError(
        e instanceof Error ? e.message : "Não foi possível gerar o PDF.",
      );
    } finally {
      setSavingDraft(false);
    }
  }

  async function handleConvertToPedido() {
    setPersistError(null);
    setLaunchError(null);

    if (!sim.isGestor) {
      setLaunchError("Apenas gestores podem converter simulações em pedido.");
      return;
    }

    if (isPedidoStatus(remoteStatus)) {
      if (simulationId) navigate(`/pedido/${simulationId}`);
      return;
    }

    const liberatedByGestor = remoteStatus === "approved";
    if (!liberatedByGestor) {
      const blockReason = sim.getLaunchBlockReason();
      if (blockReason) {
        setLaunchError(blockReason);
        return;
      }
      if (sim.tipoFrete === "CIF" && freteLookupError) {
        setLaunchError(freteLookupError);
        return;
      }
      if (!sim.canConvert) return;
    } else {
      const blockReason = getSaveBlockReason();
      if (blockReason) {
        setLaunchError(blockReason);
        return;
      }
    }

    if (!sim.clientId) {
      if (!sim.clientName.trim()) {
        setLaunchError("Informe o nome do cliente.");
        return;
      }
      if (!ensureValidClientDocument()) return;
      setConvertAfterClientSave(true);
      setClientModalOpen(true);
      return;
    }

    await persistAndNavigate();
  }

  async function handleRequestOrderConversion() {
    setNotifyError(null);
    setLaunchError(null);

    if (sim.isGestor || isPedidoStatus(remoteStatus)) return;
    if (remoteStatus === "conversion_requested") {
      setLaunchError(
        "Conversão já solicitada. Aguarde o gestor converter esta simulação em pedido.",
      );
      return;
    }

    const liberatedByGestor = remoteStatus === "approved";
    if (!liberatedByGestor) {
      const blockReason = sim.getLaunchBlockReason();
      if (blockReason) {
        setLaunchError(blockReason);
        return;
      }
      if (sim.tipoFrete === "CIF" && freteLookupError) {
        setLaunchError(freteLookupError);
        return;
      }
      if (!sim.canConvert) return;
    } else {
      const blockReason = getSaveBlockReason();
      if (blockReason) {
        setLaunchError(blockReason);
        return;
      }
    }

    if (!ensureValidClientDocument()) return;

    if (!sim.clientId) {
      if (!sim.clientName.trim()) {
        setLaunchError("Informe o nome do cliente.");
        return;
      }
      setRequestConversionAfterClientSave(true);
      setClientModalOpen(true);
      return;
    }

    await persistRequestConversion();
  }

  function buildSimulationPayload() {
    return {
      simulationId,
      clientId: sim.clientId,
      clientName: sim.clientName,
      clientCnpjCpf: sim.clientCnpjCpf,
      estado: sim.estado,
      tipoFrete: sim.tipoFrete,
      origemFrete: sim.origemFrete,
      destinoFrete: sim.destinoFrete,
      dataPagamento: sim.dataPagamento || null,
      quarter: sim.quarter,
      observacoes: sim.observacoes,
      lines: sim.lines.map((l) => ({
        productId: l.productId,
        volume: l.volume,
        precoUnitario: l.precoUnitario,
        proposta: l.proposta,
        cultura: l.cultura,
        overrides: l.overrides,
        produtoClasse: l.produtoClasse,
        margemPercentual: l.margemPercentual,
        comissaoPercentual: l.comissaoPercentual,
        comissaoValor: l.comissaoValor,
        comissaoBaseCalculo: l.comissaoBaseCalculo,
      })),
      totalValor: sim.totalValor,
      totalProposta: sim.totalProposta,
      comissaoValorTotal: sim.comissaoValorTotal,
    };
  }

  async function handleNotifyGestor() {
    setNotifyError(null);
    setLaunchError(null);

    if (
      sim.isGestor ||
      sim.remotePendingLock ||
      sim.globalStatus !== "Pendente"
    ) {
      return;
    }

    const blockReason = getSaveBlockReason();
    if (blockReason) {
      setNotifyError(blockReason);
      return;
    }

    if (!ensureValidClientDocument()) return;

    setNotifying(true);
    try {
      const saveResult = await savePendingSimulation(buildSimulationPayload());
      if (!saveResult.ok) {
        setNotifyError(saveResult.error);
        return;
      }

      sim.clearDraft();

      const notifyResult = await notifyGestoresSimulationPending({
        simulationId: saveResult.simulationId,
        title: `Revisão solicitada — ${sim.clientName.trim()}`,
        body: `Proposta de ${formatBRL(sim.totalProposta)} abaixo da autonomia.`,
      });

      if (!notifyResult.ok) {
        setNotifyError(notifyResult.error);
        return;
      }

      sim.lockAsPending();
      setRemoteStatus("pending");
      sim.showActionBanner(
        "Revisão solicitada: o gestor será notificado para validar o preço especial desta simulação.",
      );

      if (!simulationId) {
        navigate(
          `/simulador?simulationId=${encodeURIComponent(saveResult.simulationId)}`,
          { replace: true },
        );
      }
    } finally {
      setNotifying(false);
    }
  }

  function buildReviewPayload(extra = {}) {
    return {
      simulationId,
      clientName: sim.clientName,
      lines: sim.lines.map((l) => ({
        id: l.id,
        precoUnitario: l.precoUnitario,
        proposta: l.proposta,
        overrides: l.overrides,
        productId: l.productId,
        volume: l.volume,
        cultura: l.cultura,
        financeiro: l.financeiro,
        produtoClasse: l.produtoClasse,
        margemPercentual: l.margemPercentual,
        comissaoPercentual: l.comissaoPercentual,
        comissaoValor: l.comissaoValor,
        comissaoBaseCalculo: l.comissaoBaseCalculo,
      })),
      totalValor: sim.totalValor,
      totalProposta: sim.totalProposta,
      comissaoValorTotal: sim.comissaoValorTotal,
      resumoAlteracao:
        "Produtos, quantidades ou parâmetros ajustados pelo gestor",
      ...extra,
    };
  }

  async function reloadSimulationBundle() {
    if (!simulationId) return;
    const result = await fetchSimulationOrderBundle(simulationId);
    if (!result.ok) return;
    sim.hydrateFromBundle(result.data);
    setRemoteStatus(result.data.simulation.status ?? null);
  }

  async function handleSaveReview() {
    if (!sim.isGestor || !simulationId) return;
    setReviewError(null);
    setReviewSaving(true);
    try {
      const result = await saveGestorReview(buildReviewPayload());
      if (!result.ok) {
        setReviewError(result.error);
        return;
      }
      await reloadSimulationBundle();
      sim.showActionBanner(
        "Revisão salva. O consultor foi notificado das alterações.",
      );
    } finally {
      setReviewSaving(false);
    }
  }

  async function handleReviewDecision(status) {
    if (!sim.isGestor || !simulationId) return;
    setReviewError(null);
    setReviewDeciding(status);
    try {
      const saveResult = await saveGestorReview(
        buildReviewPayload({ skipNotify: true }),
      );
      if (!saveResult.ok) {
        setReviewError(saveResult.error);
        return;
      }
      const result = await updateSimulationStatus(simulationId, status, {
        notifyConsultor: true,
        clientName: sim.clientName,
      });
      if (!result.ok) {
        setReviewError(result.error);
        return;
      }
      setRemoteStatus(status);
      await reloadSimulationBundle();
      sim.showActionBanner(
        status === "approved"
          ? "Margem aprovada. O consultor pode solicitar a conversão em pedido."
          : "Simulação reprovada e consultor notificado.",
      );
    } finally {
      setReviewDeciding(null);
    }
  }

  async function handleGestorConvertToPedido() {
    if (!sim.isGestor || !simulationId) return;
    if (isPedidoStatus(remoteStatus)) {
      navigate(`/pedido/${simulationId}`);
      return;
    }
    setReviewError(null);
    setPersisting(true);
    try {
      const saveResult = await saveGestorReview(
        buildReviewPayload({
          skipNotify: true,
          resumoAlteracao: "Simulação convertida em pedido pelo gestor",
        }),
      );
      if (!saveResult.ok) {
        setReviewError(saveResult.error);
        return;
      }
      const statusResult = await updateSimulationStatus(
        simulationId,
        "converted",
        {
          notifyConsultor: true,
          clientName: sim.clientName,
          body: `Proposta de ${formatBRL(sim.totalProposta)} convertida em pedido.`,
        },
      );
      if (!statusResult.ok) {
        setReviewError(statusResult.error);
        return;
      }
      setRemoteStatus("converted");
      navigate(`/pedido/${simulationId}`);
    } finally {
      setPersisting(false);
    }
  }

  const origemOptions = freteOrigens.map((value) => {
    const known = FRETE_ORIGENS.find((o) => o.value === value);
    return { value, label: known?.label ?? value };
  });

  const showGestorReview = sim.isGestor && remoteStatus === "pending";
  const canGestorSaveReview =
    sim.isGestor &&
    Boolean(simulationId) &&
    !isPedidoStatus(remoteStatus);

  const destinoOptions = freteDestinos.map((d) => ({ id: d, label: d }));

  const productsForSelect = sim.catalog.map((p) => ({
    id: p.id,
    nome: p.displayNome ?? p.nome,
  }));

  const pageTitle = !simulationId
    ? "Nova simulação"
    : sim.isFrozen || isPedidoStatus(remoteStatus)
      ? "Visualizar simulação"
      : "Editar simulação";
  const pageDescription = !simulationId
    ? "Monte a proposta comercial informando cliente, frete e produtos."
    : sim.isFrozen || isPedidoStatus(remoteStatus)
      ? "Proposta comercial congelada — apenas visualização."
      : "Revise os dados, ajuste produtos e finalize a proposta comercial.";

  const showReadOnlyNotice = sim.isReadOnly;

  const gestorAlteracaoLabel = sim.gestorAlteracao?.em
    ? (() => {
        const when = new Date(sim.gestorAlteracao.em).toLocaleString("pt-BR", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });
        const resumo = sim.gestorAlteracao.resumo?.trim();
        return resumo
          ? `Alterado pelo gestor em ${when}: ${resumo}`
          : `Alterado pelo gestor em ${when}`;
      })()
    : null;

  const heroContext = sim.clientName.trim()
    ? `Proposta para ${sim.clientName.trim()} — ${sim.lines.length} produto(s) · ${formatBRL(sim.totalProposta)}`
    : sim.lines.length > 0
      ? `${sim.lines.length} produto(s) na simulação · proposta de ${formatBRL(sim.totalProposta)}`
      : "Preencha cliente, frete e produtos para montar a proposta.";

  const clientModalInitial = useMemo(
    () => ({
      nome: sim.clientName,
      cnpj_cpf: sim.clientCnpjCpf,
      uf: sim.estado ?? "",
    }),
    [sim.clientName, sim.clientCnpjCpf, sim.estado],
  );

  return (
    <div className="w-full min-w-0 space-y-4 sm:space-y-6">
      <PageBackLink to="/simulacoes">Voltar para simulações</PageBackLink>

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
          eyebrow="Simulação comercial"
          title={pageTitle}
          description={pageDescription}
          className="relative mb-0"
        />

        <PageInfoBanner icon={IconClipboardList}>
          {heroContext}
          {catalogLoading
            ? ' · Atualizando catálogo de produtos…'
            : !sim.quarter
              ? ' · Selecione o quarter para carregar os produtos da lista.'
              : ` · ${catalog.length} produto(s) do quarter ${sim.quarter}.`}
        </PageInfoBanner>
      </div>

      {gestorAlteracaoLabel ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-950">
          {gestorAlteracaoLabel}
        </div>
      ) : null}

      {sim.isGestor && simulationId ? (
        <AtribuirConsultorPanel
          simulationId={simulationId}
          currentUserId={assignedUserId}
          currentVendedorNome={assignedVendedorNome}
          onAssigned={handleConsultorAssigned}
        />
      ) : null}

      {sim.actionBanner ? (
        <AlertMessage tone="info" role="status">
          <span className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>{sim.actionBanner}</span>
            <Button
              type="button"
              variant="secondary"
              className="h-9 shrink-0 px-4"
              onClick={sim.dismissActionBanner}
            >
              Fechar
            </Button>
          </span>
        </AlertMessage>
      ) : null}

      <SimuladorSummaryBar
        totalValor={sim.totalValor}
        totalProposta={sim.totalProposta}
        globalStatus={sim.globalStatus}
        showMargem={sim.isGestor}
        margemLucroTotal={sim.margemLucroTotal}
        margemLucroValorTotal={sim.margemLucroValorTotal}
      />

      <div className="flex flex-col gap-4 sm:gap-6">
        <SimuladorSectionPanel
          icon={SIMULADOR_SECTION_ICONS.cliente}
          title="Cliente"
          description="Identifique o cliente e o estado da operação."
        >
          <div className="grid gap-4 lg:grid-cols-3">
            <Select
              label="Estado"
              placeholder="Selecione…"
              value={sim.estado ?? ""}
              onChange={(e) => sim.setEstado(e.target.value)}
              options={STATES}
              disabled={sim.isReadOnly}
            />
            <Combobox
              label="Cliente"
              placeholder="Buscar cliente…"
              value={sim.clientName ?? ""}
              onTextChange={sim.setClientName}
              onSearch={handleClientSearch}
              onSelect={(opt) => sim.selectClient(opt.payload)}
              onCreateRequest={openClientRegistration}
              disabled={sim.isReadOnly}
              className=""
            />
            <FormattedInput
              format="cpfCnpj"
              label="CPF / CNPJ"
              placeholder="000.000.000-00 ou 00.000.000/0000-00"
              value={sim.clientCnpjCpf ?? ""}
              onChange={(e) => sim.setClientCnpjCpf(e.target.value)}
              disabled={sim.isReadOnly}
            />
          </div>
        </SimuladorSectionPanel>

        <SimuladorSectionPanel
          icon={SIMULADOR_SECTION_ICONS.frete}
          title="Frete e logística"
          description="Defina pagamento, tipo de frete e rotas quando aplicável."
          gradient="from-primary-50/70 via-white to-sky-50/50"
        >
          <div className="grid gap-4 lg:grid-cols-3">
            <DatePicker
              label="Data de pagamento"
              value={sim.dataPagamento ?? ""}
              onChange={(e) => sim.setDataPagamento(e.target.value)}
              disabled={sim.isReadOnly}
            />
            <Select
              label="Tipo de frete"
              placeholder="Selecione…"
              value={sim.tipoFrete ?? ""}
              onChange={(e) => sim.setTipoFrete(e.target.value)}
              options={FREIGHT_TYPES}
              disabled={sim.isReadOnly}
            />
            <Select
              label="Quarter"
              placeholder="Selecione…"
              value={sim.quarter ?? ""}
              onChange={(e) => sim.setQuarter(e.target.value)}
              options={QUARTERS}
              disabled={sim.isReadOnly}
            />
          </div>
          {sim.showFreteRotas ? (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Select
                label="Origem do frete"
                placeholder="Selecione a origem…"
                value={sim.origemFrete ?? ""}
                onChange={(e) => {
                  sim.setOrigemFrete(e.target.value);
                  sim.setDestinoFrete("");
                }}
                options={origemOptions}
                disabled={sim.isReadOnly}
              />
              <Combobox
                label="Destino do frete"
                placeholder={
                  sim.origemFrete
                    ? "Cidade de destino…"
                    : "Selecione a origem primeiro"
                }
                value={sim.destinoFrete ?? ""}
                onTextChange={sim.setDestinoFrete}
                onSelect={(opt) => sim.setDestinoFrete(opt.label)}
                options={destinoOptions}
                allowFreeText={false}
                disabled={sim.isReadOnly || !sim.origemFrete}
              />
              {freteLookupError ? (
                <div className="sm:col-span-2">
                  <AlertMessage tone="info">{freteLookupError}</AlertMessage>
                </div>
              ) : null}
            </div>
          ) : null}
        </SimuladorSectionPanel>

        <SimuladorSectionPanel
          icon={SIMULADOR_SECTION_ICONS.produtos}
          title="Produtos"
          description="Adicione cultura (simulação), produtos e propostas por linha."
          gradient="from-primary-50/70 via-white to-violet-50/40"
          actions={
            <Button
              type="button"
              variant="secondary"
              className="h-9 w-full px-3 sm:w-auto"
              onClick={sim.addLine}
              disabled={!sim.canEditProducts}
            >
              Adicionar produto
            </Button>
          }
        >
          {sim.productsLocked ? (
            <AlertMessage tone="info">
              Preencha a data de pagamento antes de adicionar ou editar
              produtos.
            </AlertMessage>
          ) : null}
          {sim.lines.length === 0 ? (
            <EmptyState title="Nenhum produto na simulação" />
          ) : (
            <>
              <div className="grid gap-3 lg:hidden">
                {sim.lines.map((row) => (
                  <SimulationLineCard
                    key={row.id}
                    row={row}
                    cultureOptions={sim.cultureOptions}
                    productOptions={productsForSelect}
                    isReadOnly={!sim.canEditProducts}
                    canOverrideFloor={sim.canOverrideFloor}
                    onVolumeChange={(v) => sim.setLineVolume(row.id, v)}
                    onCulturaChange={(c) => sim.setLineCultura(row.id, c)}
                    onProductChange={(id) => sim.setLineProduct(row.id, id)}
                    onPropostaChange={(p) => sim.setLineProposta(row.id, p)}
                    onOverrideChange={(field, value) =>
                      sim.setLineOverride(row.id, field, value)
                    }
                    onClearOverride={() => sim.clearLineOverride(row.id)}
                    onRemove={() => sim.removeLine(row.id)}
                  />
                ))}
              </div>
              <SimulationLinesTable
                lines={sim.lines}
                cultureOptions={sim.cultureOptions}
                productOptions={productsForSelect}
                isReadOnly={!sim.canEditProducts}
                canOverrideFloor={sim.canOverrideFloor}
                showMargem={sim.isGestor}
                onVolumeChange={sim.setLineVolume}
                onCulturaChange={sim.setLineCultura}
                onProductChange={sim.setLineProduct}
                onPropostaChange={sim.setLineProposta}
                onOverrideChange={sim.setLineOverride}
                onClearOverride={sim.clearLineOverride}
                onRemove={sim.removeLine}
              />
            </>
          )}
        </SimuladorSectionPanel>

        <SimuladorSectionPanel
          icon={SIMULADOR_SECTION_ICONS.observacoes}
          title="Observações"
          description="Anote condições especiais, prazos e detalhes comerciais."
          gradient="from-primary-50/70 via-white to-sky-50/40"
          actions={
            !sim.isReadOnly ? (
              <BotaoAssistenteIA
                onClick={() => observacoesIARef.current?.abrirAssistente()}
                disabled={!String(sim.observacoes ?? "").trim()}
              />
            ) : null
          }
        >
          <CampoTextoComIA
            ref={observacoesIARef}
            hideTrigger
            placeholder="Condições especiais, prazos, observações comerciais…"
            value={sim.observacoes ?? ""}
            onChange={sim.setObservacoes}
            disabled={sim.isReadOnly}
            rows={4}
          />
        </SimuladorSectionPanel>

        <SimuladorSectionPanel
          icon={SIMULADOR_SECTION_ICONS.consolidacao}
          title="Consolidação"
          description="Revise totais, status e finalize a simulação."
          gradient="from-primary-50/70 via-white to-emerald-50/40"
        >
          <dl className="grid gap-3 sm:grid-cols-3">
            <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-slate-50/80 px-4 py-3.5">
              <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                Soma valor total
              </dt>
              <dd className="finance-text mt-1 text-xl font-semibold text-slate-900">
                {formatBRL(sim.totalValor)}
              </dd>
            </div>
            <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-slate-50/80 px-4 py-3.5">
              <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                Soma total proposta
              </dt>
              <dd className="finance-text mt-1 text-xl font-semibold text-slate-900">
                {formatBRL(sim.totalProposta)}
              </dd>
            </div>
            <div
              className={[
                "relative overflow-hidden rounded-2xl border px-4 py-3.5",
                sim.globalStatus === "Aprovado"
                  ? "border-emerald-200/80 bg-emerald-50 ring-1 ring-emerald-100"
                  : sim.globalStatus === "Pendente"
                    ? "border-amber-200/80 bg-amber-50 ring-1 ring-amber-100"
                    : "border-slate-200/80 bg-slate-50/80",
              ].join(" ")}
            >
              <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                Status geral
              </dt>
              <dd className="mt-1 text-lg font-semibold text-slate-900">
                {sim.globalStatus}
              </dd>
            </div>
          </dl>

          <div className="mt-5 space-y-3 rounded-2xl border border-slate-100 bg-slate-50/50 p-4 sm:p-5">
            {showReadOnlyNotice ? (
              <p className="text-sm text-slate-600">
                {sim.isFrozen || isPedidoStatus(remoteStatus)
                  ? "Simulação convertida em pedido — valores congelados. Apenas visualização."
                  : remoteStatus === "conversion_requested"
                    ? "Conversão solicitada — proposta bloqueada. Aguarde o gestor converter em pedido."
                    : remoteStatus === "approved"
                      ? "Simulação aprovada — edição bloqueada. Você pode solicitar a conversão em pedido."
                      : "Proposta enviada — aguardando revisão do gestor."}
              </p>
            ) : null}
            {showGestorReview ? (
              <p className="text-sm text-slate-600">
                Revisão do gestor: ajuste os fatores de custo e as taxas de
                antecipação/juros por linha para recalcular o preço de tabela e
                validar o preço especial desta simulação.
              </p>
            ) : null}
            <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap">
              {canGeneratePdf ? (
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full sm:flex-1"
                  loading={savingDraft && isDraftEditable}
                  disabled={savingDraft}
                  onClick={() => void handleGerarPdf()}
                >
                  {savingDraft && isDraftEditable
                    ? "Salvando…"
                    : "Gerar Proposta p/ Cliente"}
                </Button>
              ) : null}
              {!sim.isReadOnly && !canGestorSaveReview ? (
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full sm:flex-1"
                  loading={savingDraft}
                  onClick={() => void handleSaveSimulation()}
                >
                  Salvar simulação
                </Button>
              ) : null}
              {!sim.isReadOnly &&
              !sim.isGestor &&
              sim.globalStatus === "Pendente" &&
              remoteStatus !== "approved" ? (
                <Button
                  type="button"
                  variant="primary"
                  className="w-full sm:flex-1"
                  loading={notifying}
                  onClick={() => void handleNotifyGestor()}
                >
                  Solicitar revisão do gestor
                </Button>
              ) : null}
              {canGestorSaveReview ? (
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full sm:flex-1"
                  loading={reviewSaving}
                  disabled={Boolean(reviewDeciding) || persisting}
                  onClick={() => void handleSaveReview()}
                >
                  Salvar revisão
                </Button>
              ) : null}
              {showGestorReview ? (
                <>
                  <Button
                    type="button"
                    variant="danger"
                    className="w-full sm:flex-1"
                    loading={reviewDeciding === "rejected"}
                    disabled={reviewSaving || reviewDeciding === "approved" || persisting}
                    onClick={() => void handleReviewDecision("rejected")}
                  >
                    Reprovar
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    className="w-full sm:flex-1"
                    loading={reviewDeciding === "approved"}
                    disabled={reviewSaving || reviewDeciding === "rejected" || persisting}
                    onClick={() => void handleReviewDecision("approved")}
                  >
                    Liberar margem
                  </Button>
                  <Button
                    type="button"
                    variant="primary"
                    className="w-full sm:flex-1"
                    loading={persisting}
                    disabled={reviewSaving || Boolean(reviewDeciding)}
                    onClick={() => void handleGestorConvertToPedido()}
                  >
                    Converter em pedido
                  </Button>
                </>
              ) : sim.isGestor && simulationId && !isPedidoStatus(remoteStatus) ? (
                <Button
                  type="button"
                  variant="primary"
                  className="w-full sm:flex-1"
                  loading={persisting}
                  disabled={reviewSaving || Boolean(reviewDeciding)}
                  onClick={() => void handleGestorConvertToPedido()}
                >
                  Converter em pedido
                </Button>
              ) : !sim.isGestor &&
                !isPedidoStatus(remoteStatus) &&
                remoteStatus !== "conversion_requested" &&
                (sim.globalStatus === "Aprovado" ||
                  remoteStatus === "approved") ? (
                <Button
                  type="button"
                  variant="primary"
                  className="w-full sm:flex-1"
                  loading={persisting || notifying}
                  onClick={() => void handleRequestOrderConversion()}
                >
                  Solicitar conversão em pedido
                </Button>
              ) : sim.isGestor && !simulationId ? (
                <Button
                  type="button"
                  variant="primary"
                  className="w-full sm:flex-1"
                  loading={persisting}
                  onClick={() => void handleConvertToPedido()}
                >
                  Converter em pedido
                </Button>
              ) : null}
            </div>
          </div>

          {pdfError ? (
            <AlertMessage className="mt-4">{pdfError}</AlertMessage>
          ) : null}
          {launchError ? (
            <AlertMessage className="mt-4">{launchError}</AlertMessage>
          ) : null}
          {saveError ? (
            <AlertMessage className="mt-4">{saveError}</AlertMessage>
          ) : null}
          {notifyError ? (
            <AlertMessage className="mt-4">{notifyError}</AlertMessage>
          ) : null}
          {reviewError ? (
            <AlertMessage className="mt-4">{reviewError}</AlertMessage>
          ) : null}
          {persistError ? (
            <AlertMessage className="mt-4">{persistError}</AlertMessage>
          ) : null}
        </SimuladorSectionPanel>
      </div>

      <ModalClienteForm
        open={clientModalOpen}
        initial={clientModalInitial}
        onClose={() => {
          setClientModalOpen(false);
          setConvertAfterClientSave(false);
          setRequestConversionAfterClientSave(false);
        }}
        onSaved={(client) => {
          sim.selectClient(client);
          if (convertAfterClientSave) {
            setConvertAfterClientSave(false);
            void persistAndNavigate(client.id);
            return;
          }
          if (requestConversionAfterClientSave) {
            setRequestConversionAfterClientSave(false);
            void persistRequestConversion(client.id);
          }
        }}
      />

      <PdfPreviewModal
        open={Boolean(pdfPreview)}
        onClose={() => setPdfPreview(null)}
        titulo={pdfPreview?.titulo}
        gerador={pdfPreview?.gerador}
        nomeFallback={pdfPreview?.nomeFallback}
      />
    </div>
  );
}
