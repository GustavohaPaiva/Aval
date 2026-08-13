import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import { SimulacaoCotacaoMensagem } from "../components/simulador/SimulacaoCotacaoMensagem";
import { IconClipboardList } from "../components/icons";
import { AlertMessage } from "../components/ui/AlertMessage";
import { Button } from "../components/ui/Button";
import { Combobox } from "../components/ui/Combobox";
import { EmptyState } from "../components/ui/EmptyState";
import { FormattedInput } from "../components/ui/FormattedInput";
import { DatePicker } from "../components/ui/DatePicker";
import { PageBackLink } from "../components/ui/PageBackLink";
import { PageHeader } from "../components/ui/PageHeader";
import { PageInfoBanner } from "../components/ui/InfoStatCard";
import { Select } from "../components/ui/Select";
import { FREIGHT_TYPES, QUARTERS, STATES } from "../constants/simulator";
import { FRETE_ORIGENS, resolveOrigemFreteByEstado } from "../constants/fretes";
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
  inactivateSimulation,
  deleteSimulation,
} from "../services/simulationOrderService";
import { notifyGestoresSimulationPending } from "../services/notificationService";
import { fetchComissaoFaixas } from "../services/comissaoService";
import {
  fetchCatalogoSimulador,
} from "../services/produtoCatalogoService";
import { fetchParametrosSistema } from "../services/parametrosService";
import {
  fetchFreteDestinosAtivos,
  lookupFreteValor,
} from "../services/freteService";
import { formatBRL } from "../utils/money";
import { displayCpfCnpj, validateCpfCnpj } from "../utils/dataFormatters";
import { DEFAULT_AUTONOMIA_PARAMS } from "../utils/autonomiaDesconto";
import { DEFAULT_ICMS_PERCENTUAL, DEFAULT_MARGEM_PERCENTUAL } from "../utils/pricingCalculations";

export function Simulador() {
  const [searchParams] = useSearchParams();
  const simulationId = searchParams.get("simulationId");
  const { role } = useAuth();
  const [catalog, setCatalog] = useState([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogReady, setCatalogReady] = useState(false);
  const [freteUnitario, setFreteUnitario] = useState(0);
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
  const hydrateFromBundleRef = useRef(sim.hydrateFromBundle);
  const resetLocalRef = useRef(sim.resetLocal);
  const clearDraftRef = useRef(sim.clearDraft);
  const lockAsPendingRef = useRef(sim.lockAsPending);
  const navigateRef = useRef(navigate);
  hydrateFromBundleRef.current = sim.hydrateFromBundle;
  resetLocalRef.current = sim.resetLocal;
  clearDraftRef.current = sim.clearDraft;
  lockAsPendingRef.current = sim.lockAsPending;
  navigateRef.current = navigate;
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
  const [remoteAtivo, setRemoteAtivo] = useState(true);
  const [lifecycleBusy, setLifecycleBusy] = useState(null);
  const loadCatalog = useCallback(async (quarter, estado, isActive) => {
    if (!quarter || !estado) {
      setCatalog([]);
      setCatalogLoading(false);
      setCatalogReady(false);
      return;
    }

    setCatalogLoading(true);
    setCatalogReady(false);
    const res = await fetchCatalogoSimulador({
      quarter,
      estado,
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
          resetLocalRef.current();
          clearDraftRef.current();
        }
        wasRemoteSimRef.current = false;
        setRemoteStatus(null);
        setRemoteAtivo(true);
        setAssignedUserId(null);
        setAssignedVendedorNome(null);
        return;
      }
      wasRemoteSimRef.current = true;
      const result = await fetchSimulationOrderBundle(simulationId);
      if (!isActive()) return;
      if (!result.ok) {
        navigateRef.current("/simulacoes", { replace: true });
        return;
      }
      hydrateFromBundleRef.current(result.data);
      setRemoteStatus(result.data.simulation.status ?? null);
      setRemoteAtivo(result.data.simulation.ativo !== false);
      if (result.data.simulation.ativo === false) {
        lockAsPendingRef.current();
      }
      setAssignedUserId(result.data.simulation.user_id ?? null);
      setAssignedVendedorNome(result.data.vendedorNome ?? null);
    },
    // Só reage ao simulationId: hydrateFromBundle muda com o catálogo e
    // re-hidratar resetava o estado da lista.
    [simulationId],
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
    if (!sim.estado) return "Selecione o estado antes de salvar.";
    if (!sim.quarter) return "Selecione o quarter antes de salvar.";
    if (!sim.tipoFrete) return "Selecione o tipo de frete.";
    if (!sim.dataPagamento) return "Informe a data de pagamento.";
    if (sim.tipoFrete === "CIF") {
      if (!sim.origemFrete?.trim())
        return "Origem do frete indisponível para o estado.";
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

  const cotacaoBundle = useMemo(() => {
    if (!sim.clientName.trim()) return null;

    const catalogById = new Map(sim.catalog.map((p) => [p.id, p]));
    const items = sim.lines
      .filter((row) => row.productId)
      .map((row) => {
        const product = catalogById.get(row.productId);
        return {
          product_id: row.productId,
          cultura: row.cultura,
          volume: row.volume,
          proposta: row.proposta,
          product: {
            nome: product?.nome ?? row.displayNome ?? "",
            referencia_complementar: product?.referenciaComplementar ?? null,
            fornecedor_nome: product?.fornecedorNome ?? null,
          },
        };
      });

    return {
      simulation: {
        tipo_frete: sim.tipoFrete,
        data_pagamento: sim.dataPagamento,
        destino_frete: sim.destinoFrete,
      },
      client: {
        nome: sim.clientName,
      },
      items,
    };
  }, [
    sim.catalog,
    sim.clientName,
    sim.dataPagamento,
    sim.destinoFrete,
    sim.lines,
    sim.tipoFrete,
  ]);

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
    setRemoteAtivo(result.data.simulation.ativo !== false);
    if (result.data.simulation.ativo === false) {
      sim.lockAsPending();
    }
  }

  async function handleInactivateSimulation() {
    if (!sim.isGestor || !simulationId) return;
    const confirmed = window.confirm(
      "Inativar esta simulação? Ela sai das estatísticas e continua visível na listagem.",
    );
    if (!confirmed) return;
    setLaunchError(null);
    setLifecycleBusy("inactivate");
    try {
      const result = await inactivateSimulation(simulationId);
      if (!result.ok) {
        setLaunchError(result.error);
        return;
      }
      setRemoteAtivo(false);
      if (result.status) setRemoteStatus(result.status);
      sim.lockAsPending();
      sim.showActionBanner(
        "Simulação inativada. Ela não entra mais nas estatísticas.",
      );
    } finally {
      setLifecycleBusy(null);
    }
  }

  async function handleDeleteSimulation() {
    if (!sim.isGestor || !simulationId) return;
    const confirmed = window.confirm(
      "Excluir esta simulação? Ela não aparecerá mais no sistema. Esta ação não pode ser desfeita.",
    );
    if (!confirmed) return;
    setLaunchError(null);
    setLifecycleBusy("delete");
    try {
      const result = await deleteSimulation(simulationId);
      if (!result.ok) {
        setLaunchError(result.error);
        return;
      }
      navigate("/simulacoes", { replace: true });
    } finally {
      setLifecycleBusy(null);
    }
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

  const origemOptions = useMemo(() => {
    const value =
      sim.origemFrete || resolveOrigemFreteByEstado(sim.estado) || "";
    if (!value) return [];
    const known = FRETE_ORIGENS.find((o) => o.value === value);
    return [{ value, label: known?.label ?? value }];
  }, [sim.origemFrete, sim.estado]);

  const isRemoteInactive = remoteAtivo === false;
  const showGestorReview =
    sim.isGestor && remoteStatus === "pending" && !isRemoteInactive;
  const canGestorSaveReview =
    sim.isGestor &&
    Boolean(simulationId) &&
    !isPedidoStatus(remoteStatus) &&
    !isRemoteInactive;

  const destinoOptions = freteDestinos.map((d) => ({ id: d, label: d }));

  const productsForSelect = useMemo(
    () =>
      sim.catalog.map((p) => ({
        id: p.id,
        nome: p.nome ?? "",
        referenciaComplementar: p.referenciaComplementar ?? "",
        fornecedorNome: p.fornecedorNome ?? "",
        displayNome: p.displayNome ?? p.nome ?? "",
        fornecedorId: p.fornecedorId ?? "",
      })),
    [sim.catalog],
  );

  const fornecedorOptions = useMemo(() => {
    const map = new Map();
    for (const p of sim.catalog) {
      if (!p.fornecedorId) continue;
      if (!map.has(p.fornecedorId)) {
        map.set(p.fornecedorId, p.fornecedorNome || "Fornecedor");
      }
    }
    return Array.from(map, ([id, nome]) => ({ id, nome })).sort((a, b) =>
      a.nome.localeCompare(b.nome, "pt-BR"),
    );
  }, [sim.catalog]);

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
    }),
    [sim.clientName, sim.clientCnpjCpf],
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
            : !sim.estado || !sim.quarter || !sim.dataPagamento
              ? ' · Selecione estado, data de pagamento e quarter para liberar os produtos.'
              : ` · ${catalog.length} produto(s) do quarter ${sim.quarter} · ${sim.estado}.`}
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

      {sim.softNotice ? (
        <p
          role="status"
          className="rounded-xl border border-amber-200/70 bg-amber-50/80 px-3 py-2 text-xs font-medium text-amber-900/90"
        >
          {sim.softNotice}
        </p>
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
          description="Identifique o cliente da proposta."
        >
          <div className="grid gap-4 lg:grid-cols-2">
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
              editableHint
            />
            <FormattedInput
              format="cpfCnpj"
              label="CPF / CNPJ"
              placeholder="000.000.000-00 ou 00.000.000/0000-00"
              value={sim.clientCnpjCpf ?? ""}
              onChange={(e) => sim.setClientCnpjCpf(e.target.value)}
              disabled={sim.isReadOnly}
              editableHint
            />
          </div>
        </SimuladorSectionPanel>

        <SimuladorSectionPanel
          icon={SIMULADOR_SECTION_ICONS.frete}
          title="Frete e logística"
          description="Estado da lista, pagamento, tipo de frete e rotas quando aplicável."
          gradient="from-primary-50/70 via-white to-sky-50/50"
        >
          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
            <Select
              label="Estado da lista"
              placeholder="Selecione…"
              value={sim.estado ?? ""}
              onChange={(e) => sim.setEstado(e.target.value)}
              options={STATES}
              disabled={sim.isReadOnly}
              editableHint
            />
            <DatePicker
              label="Data de pagamento"
              value={sim.dataPagamento ?? ""}
              onChange={(e) => sim.setDataPagamento(e.target.value)}
              disabled={sim.isReadOnly}
              editableHint
            />
            <Select
              label="Tipo de frete"
              placeholder="Selecione…"
              value={sim.tipoFrete ?? ""}
              onChange={(e) => sim.setTipoFrete(e.target.value)}
              options={FREIGHT_TYPES}
              disabled={sim.isReadOnly}
              editableHint
            />
            <Select
              label="Quarter"
              placeholder="Selecione…"
              value={sim.quarter ?? ""}
              onChange={(e) => sim.setQuarter(e.target.value)}
              options={QUARTERS}
              disabled={sim.isReadOnly}
              editableHint
            />
          </div>
          {sim.showFreteRotas ? (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Select
                label="Origem do frete"
                placeholder={
                  sim.estado
                    ? "Definida pelo estado"
                    : "Selecione o estado primeiro"
                }
                value={sim.origemFrete ?? ""}
                onChange={() => {}}
                options={origemOptions}
                disabled
                editableHint={false}
              />
              <Combobox
                label="Destino do frete"
                placeholder={
                  sim.origemFrete
                    ? "Cidade de destino…"
                    : sim.estado
                      ? "Origem definida pelo estado…"
                      : "Selecione o estado primeiro"
                }
                value={sim.destinoFrete ?? ""}
                onTextChange={sim.setDestinoFrete}
                onSelect={(opt) => sim.setDestinoFrete(opt.label)}
                options={destinoOptions}
                allowFreeText={false}
                disabled={sim.isReadOnly || !sim.origemFrete}
                editableHint
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
              Selecione o estado, a data de pagamento e o quarter antes de
              adicionar ou editar produtos.
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
                    fornecedorOptions={fornecedorOptions}
                    isReadOnly={!sim.canEditProducts}
                    canOverrideFloor={sim.canOverrideFloor}
                    onVolumeChange={(v) => sim.setLineVolume(row.id, v)}
                    onCulturaChange={(c) => sim.setLineCultura(row.id, c)}
                    onFornecedorChange={(id) =>
                      sim.setLineFornecedor(row.id, id)
                    }
                    onProductChange={(id) => sim.setLineProduct(row.id, id)}
                    onPropostaChange={(p) => sim.setLineProposta(row.id, p)}
                    onDescontoPctChange={(p) =>
                      sim.setLineDescontoPct(row.id, p)
                    }
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
                fornecedorOptions={fornecedorOptions}
                isReadOnly={!sim.canEditProducts}
                canOverrideFloor={sim.canOverrideFloor}
                showMargem={sim.isGestor}
                onVolumeChange={sim.setLineVolume}
                onCulturaChange={sim.setLineCultura}
                onFornecedorChange={sim.setLineFornecedor}
                onProductChange={sim.setLineProduct}
                onPropostaChange={sim.setLineProposta}
                onDescontoPctChange={sim.setLineDescontoPct}
                onOverrideChange={sim.setLineOverride}
                onClearOverride={sim.clearLineOverride}
                onRemove={sim.removeLine}
              />
            </>
          )}
        </SimuladorSectionPanel>

        {cotacaoBundle ? (
          <SimulacaoCotacaoMensagem bundle={cotacaoBundle} />
        ) : null}

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
            {isRemoteInactive ? (
              <p className="text-sm text-slate-600">
                Simulação inativa — fora das estatísticas. Exclua para removê-la
                do sistema.
              </p>
            ) : showReadOnlyNotice ? (
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
                    Gerar pedido
                  </Button>
                </>
              ) : sim.isGestor &&
                simulationId &&
                !isPedidoStatus(remoteStatus) &&
                !isRemoteInactive ? (
                <Button
                  type="button"
                  variant="primary"
                  className="w-full sm:flex-1"
                  loading={persisting}
                  disabled={reviewSaving || Boolean(reviewDeciding)}
                  onClick={() => void handleGestorConvertToPedido()}
                >
                  Gerar pedido
                </Button>
              ) : !sim.isGestor &&
                !isPedidoStatus(remoteStatus) &&
                !isRemoteInactive &&
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
                  Gerar pedido
                </Button>
              ) : null}
              {sim.isGestor &&
              simulationId &&
              !isPedidoStatus(remoteStatus) &&
              !isRemoteInactive ? (
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full sm:flex-1"
                  loading={lifecycleBusy === "inactivate"}
                  disabled={Boolean(lifecycleBusy) || persisting || reviewSaving}
                  onClick={() => void handleInactivateSimulation()}
                >
                  Inativar simulação
                </Button>
              ) : null}
              {sim.isGestor && simulationId && !isPedidoStatus(remoteStatus) ? (
                <Button
                  type="button"
                  variant="danger"
                  className="w-full sm:flex-1"
                  loading={lifecycleBusy === "delete"}
                  disabled={Boolean(lifecycleBusy) || persisting || reviewSaving}
                  onClick={() => void handleDeleteSimulation()}
                >
                  Excluir simulação
                </Button>
              ) : null}
            </div>
          </div>

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
    </div>
  );
}
