import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CATALOG_PRODUCTS } from '../constants/catalogProducts'
import { CULTURES } from '../constants/simulator'
import {
  isConsultorSimulationLocked,
} from '../constants/simulationStatus'
import { parseCpfCnpjInput } from '../utils/dataFormatters'
import { calcComissaoLinha } from '../utils/comissaoCalculations'
import {
  buildFrozenLineView,
  buildFrozenTotals,
  isSimulationFrozen,
} from '../utils/frozenSimulationViews'
import {
  calcPrazoNegociacao,
  getAutonomiaPercentual,
  getFloorRatio,
  normalizeAutonomiaParams,
  todayDateOnly,
} from '../utils/autonomiaDesconto'
import {
  calcCustoBrlComDesconto,
  calcCustoIcmsFromBrl,
  calcDiasAntecipacao,
  calcMargemLucro,
  calcMargemLucroValor,
  calcPrecoSimulacao,
  DEFAULT_ICMS_PERCENTUAL,
  DEFAULT_MARGEM_PERCENTUAL,
  DEFAULT_TAXA_ANTECIPACAO,
  DEFAULT_TAXA_JUROS,
} from '../utils/pricingCalculations'
import { roundMoney } from '../utils/roundMoney'
import { createDraftSaver, loadDraft } from '../utils/uiDraftStorage'

const SIMULADOR_DRAFT_KEY = 'simulador-draft'
const COST_OVERRIDE_FIELDS = ['custoUsd', 'descontoUsd', 'taxa', 'frete']
const OVERRIDE_FIELDS = [
  ...COST_OVERRIDE_FIELDS,
  'taxaAntecipacao',
  'taxaJuros',
]

function readSimulationDraft() {
  const draft = loadDraft(SIMULADOR_DRAFT_KEY, null)
  if (!draft || typeof draft !== 'object') return null
  return draft
}

function normalizeDraftLines(lines) {
  if (!Array.isArray(lines)) return []
  return lines.map((line) => ({
    id: String(line.id ?? crypto.randomUUID()),
    productId: line.productId ?? '',
    cultura: line.cultura ?? CULTURES[0] ?? '',
    volume: Number(line.volume) || 0,
    proposta: Number(line.proposta) || 0,
    overrides: normalizeOverrides(line.overrides),
  }))
}

function normalizeOverrides(overrides) {
  if (!overrides) return undefined
  const next = {}
  for (const field of OVERRIDE_FIELDS) {
    const value = overrides[field]
    if (value != null && Number.isFinite(value)) next[field] = value
  }
  return Object.keys(next).length > 0 ? next : undefined
}

function clampProposta(proposta, precoUnitario, allowAnyPrice) {
  const p = Number.isFinite(proposta) ? proposta : 0
  if (allowAnyPrice) return Math.max(0, p)
  const safePu = Math.max(0, precoUnitario)
  return Math.min(Math.max(0, p), safePu)
}

function resolvePricing(product, context, overrides) {
  if (!product) {
    return { precoUnitario: 0, breakdown: null }
  }
  const {
    dataPagamento,
    freteUnitario = 0,
    icmsPercentual = DEFAULT_ICMS_PERCENTUAL,
    margemPercentual = DEFAULT_MARGEM_PERCENTUAL,
  } = context
  const dias = calcDiasAntecipacao(dataPagamento, product.vencimentoLista)
  const ov = normalizeOverrides(overrides)
  const hasCostOverride = COST_OVERRIDE_FIELDS.some((f) => ov?.[f] != null)

  const custoUsd = ov?.custoUsd ?? Number(product.custoUsd ?? 0)
  const descontoUsd = ov?.descontoUsd ?? Number(product.descontoUsd ?? 0)
  const taxa = ov?.taxa ?? Number(product.taxa ?? 0)
  const frete = ov?.frete ?? freteUnitario
  const taxaAntecipacao =
    ov?.taxaAntecipacao ??
    Number(product.taxaAntecipacao ?? DEFAULT_TAXA_ANTECIPACAO)
  const taxaJuros =
    ov?.taxaJuros ?? Number(product.taxaJuros ?? DEFAULT_TAXA_JUROS)

  let custoBrl
  let custoIcms
  if (hasCostOverride) {
    custoBrl = calcCustoBrlComDesconto(custoUsd, descontoUsd, taxa)
    custoIcms = calcCustoIcmsFromBrl(custoBrl, icmsPercentual)
  } else {
    custoBrl = roundMoney(Number(product.custoBrl ?? 0))
    custoIcms = Number(
      product.custoIcms ?? calcCustoIcmsFromBrl(product.custoBrl, icmsPercentual),
    )
  }

  const { precoFinal, financeiro, valorComFrete, fator } = calcPrecoSimulacao({
    custoIcms,
    freteUnitario: frete,
    diasAntecipacao: dias,
    margemPercentual,
    taxaAntecipacao,
    taxaJuros,
  })

  return {
    precoUnitario: precoFinal,
    breakdown: {
      custoUsd,
      descontoUsd,
      taxa,
      custoBrl,
      custoIcms,
      frete,
      taxaAntecipacao,
      taxaJuros,
      valorComFrete,
      fatorFinanceiro: fator,
      diasAntecipacao: dias,
      financeiro,
      hasOverride: Boolean(ov),
    },
  }
}

function resolvePrecoUnitario(product, context, overrides) {
  return resolvePricing(product, context, overrides).precoUnitario
}

function buildLineView(
  line,
  catalog,
  context,
  canOverrideFloor,
  comissaoFaixas,
  prazoDias,
  autonomiaParams,
) {
  if (line.snapshot) {
    const product = catalog.find((p) => p.id === line.productId)
    const displayNome =
      product?.displayNome ??
      product?.nome ??
      line.snapshot.displayNome ??
      '—'
    return buildFrozenLineView(
      {
        id: line.id,
        product_id: line.productId,
        cultura: line.cultura,
        volume: line.volume,
        preco_unitario: line.snapshot.precoUnitario,
        proposta: line.proposta,
        financeiro_unitario: line.snapshot.financeiro,
        margem_percentual: line.snapshot.margemPercentual,
        comissao_percentual: line.snapshot.comissaoPercentual,
        comissao_valor: line.snapshot.comissaoValor,
        produto_classe: line.snapshot.produtoClasse,
        overrides: line.overrides,
      },
      displayNome,
    )
  }

  const product = catalog.find((p) => p.id === line.productId)
  const overrides = normalizeOverrides(line.overrides)
  const { precoUnitario, breakdown } = resolvePricing(product, context, overrides)
  const proposta = clampProposta(
    line.proposta ?? precoUnitario,
    precoUnitario,
    canOverrideFloor,
  )
  const valorTotal = roundMoney(line.volume * precoUnitario)
  const propostaTotal = roundMoney(line.volume * proposta)
  const financeiro = breakdown?.financeiro ?? 0
  const financeiroTotal = roundMoney(line.volume * financeiro)
  const margemLucro = calcMargemLucro(proposta, financeiro)
  const margemLucroValor = calcMargemLucroValor(propostaTotal, financeiroTotal)
  const comissao = calcComissaoLinha({
    margem: margemLucro,
    classe: product?.classe,
    volume: line.volume,
    proposta,
    faixas: comissaoFaixas,
  })
  const autonomiaPct = getAutonomiaPercentual({
    prazoDias,
    classe: comissao.classe,
    params: autonomiaParams,
  })
  const floorRatio = getFloorRatio(autonomiaPct)
  const floorUnit = floorRatio * precoUnitario
  const isLineBelowFloor = Boolean(product) && proposta < floorUnit

  return {
    id: line.id,
    productId: line.productId,
    cultura: line.cultura,
    volume: line.volume,
    precoUnitario,
    proposta,
    valorTotal,
    propostaTotal,
    financeiro,
    financeiroTotal,
    margemLucro,
    margemLucroValor,
    produtoClasse: comissao.classe,
    margemPercentual: comissao.margemPercentual,
    comissaoPercentual: comissao.comissaoPercentual,
    comissaoValor: comissao.comissaoValor,
    comissaoBaseCalculo: comissao.baseCalculo,
    autonomiaPercentual: autonomiaPct,
    floorUnit,
    isLineBelowFloor,
    overrides: overrides ?? null,
    custoBreakdown: breakdown,
    displayNome: product?.displayNome ?? product?.nome ?? '—',
  }
}

function createLine() {
  return {
    id: crypto.randomUUID(),
    productId: '',
    cultura: '',
    volume: 1,
    proposta: 0,
  }
}

export function useSimulation(options = {}) {
  const catalog = options.catalog ?? CATALOG_PRODUCTS
  const freteUnitario = options.freteUnitario ?? 0
  const icmsPercentual = options.icmsPercentual ?? DEFAULT_ICMS_PERCENTUAL
  const margemPercentual =
    options.margemPercentual ?? DEFAULT_MARGEM_PERCENTUAL
  const autonomiaParams = useMemo(
    () => normalizeAutonomiaParams(options.autonomiaParams),
    [options.autonomiaParams],
  )
  const comissaoFaixas = useMemo(
    () => options.comissaoFaixas ?? [],
    [options.comissaoFaixas],
  )
  const isGestor = options.role === 'gestor'
  const persistDraft = options.persistDraft === true

  const initialDraft = persistDraft ? readSimulationDraft() : null

  const [estado, setEstadoState] = useState(() => initialDraft?.estado ?? null)
  const [clientId, setClientId] = useState(() => initialDraft?.clientId ?? null)
  const [clientName, setClientNameState] = useState(
    () => initialDraft?.clientName ?? '',
  )
  const [clientCnpjCpf, setClientCnpjCpfState] = useState(
    () => parseCpfCnpjInput(initialDraft?.clientCnpjCpf ?? ''),
  )
  const [dataPagamento, setDataPagamentoState] = useState(
    () => initialDraft?.dataPagamento ?? '',
  )
  const [dataNegociacao, setDataNegociacao] = useState(() => todayDateOnly())
  const [tipoFrete, setTipoFreteState] = useState(
    () => initialDraft?.tipoFrete ?? null,
  )
  const [origemFrete, setOrigemFreteState] = useState(
    () => initialDraft?.origemFrete ?? '',
  )
  const [destinoFrete, setDestinoFreteState] = useState(
    () => initialDraft?.destinoFrete ?? '',
  )
  const [quarter, setQuarterState] = useState(() => initialDraft?.quarter ?? null)
  const [observacoes, setObservacoesState] = useState(
    () => initialDraft?.observacoes ?? '',
  )

  const [lines, setLines] = useState(() =>
    normalizeDraftLines(initialDraft?.lines),
  )
  const [actionBanner, setActionBanner] = useState(null)
  const [remotePendingLock, setRemotePendingLock] = useState(false)
  const [frozenTotals, setFrozenTotals] = useState(null)
  const [gestorAlteracao, setGestorAlteracao] = useState(null)

  const draftSaverRef = useRef(null)
  if (draftSaverRef.current == null) {
    draftSaverRef.current = createDraftSaver(SIMULADOR_DRAFT_KEY)
  }

  const pricingContext = useMemo(
    () => ({ dataPagamento, freteUnitario, icmsPercentual, margemPercentual }),
    [dataPagamento, freteUnitario, icmsPercentual, margemPercentual],
  )

  const prazoDias = useMemo(
    () => calcPrazoNegociacao(dataPagamento, dataNegociacao),
    [dataPagamento, dataNegociacao],
  )

  const canOverrideFloor = isGestor && !frozenTotals
  const productsLocked = !Boolean(String(dataPagamento ?? '').trim())

  const lineViews = useMemo(
    () =>
      lines.map((line) =>
        buildLineView(
          line,
          catalog,
          pricingContext,
          canOverrideFloor,
          comissaoFaixas,
          prazoDias,
          autonomiaParams,
        ),
      ),
    [
      lines,
      catalog,
      pricingContext,
      canOverrideFloor,
      comissaoFaixas,
      prazoDias,
      autonomiaParams,
    ],
  )

  const {
    totalValor,
    totalProposta,
    totalFinanceiro,
    margemLucroTotal,
    margemLucroValorTotal,
    comissaoValorTotal,
    globalStatus,
  } =
    useMemo(() => {
      if (frozenTotals) return frozenTotals
      const totalValorRaw = lineViews.reduce((acc, row) => acc + row.valorTotal, 0)
      const totalPropostaRaw = lineViews.reduce(
        (acc, row) => acc + row.propostaTotal,
        0,
      )
      const totalFinanceiroRaw = lineViews.reduce(
        (acc, row) => acc + (row.financeiroTotal ?? 0),
        0,
      )
      const comissaoValorRaw = lineViews.reduce(
        (acc, row) => acc + (row.comissaoValor ?? 0),
        0,
      )
      const tValor = roundMoney(totalValorRaw)
      const tProposta = roundMoney(totalPropostaRaw)
      const tFinanceiro = roundMoney(totalFinanceiroRaw)
      const hasProductLines = lineViews.some((row) => row.productId)
      const anyBelowFloor = lineViews.some(
        (row) => row.productId && row.isLineBelowFloor,
      )
      let status
      if (tValor <= 0 || !hasProductLines) status = 'Rascunho'
      else if (anyBelowFloor) status = 'Pendente'
      else status = 'Aprovado'
      return {
        totalValor: tValor,
        totalProposta: tProposta,
        totalFinanceiro: tFinanceiro,
        margemLucroTotal: calcMargemLucro(tProposta, tFinanceiro),
        margemLucroValorTotal: calcMargemLucroValor(tProposta, tFinanceiro),
        comissaoValorTotal: roundMoney(comissaoValorRaw),
        globalStatus: status,
      }
    }, [lineViews, frozenTotals])

  const isReadOnly = Boolean(remotePendingLock || frozenTotals)
  const canEditProducts = !isReadOnly && !productsLocked
  const canConvert =
    lines.length > 0 &&
    totalValor > 0 &&
    (canOverrideFloor || globalStatus === 'Aprovado')

  const showFreteRotas = tipoFrete === 'CIF'

  const cultureOptions = useMemo(() => {
    const others = 'Outros'
    return [...CULTURES]
      .filter((c) => c !== others)
      .sort((a, b) => a.localeCompare(b, 'pt-BR'))
      .concat(CULTURES.includes(others) ? [others] : [])
  }, [])

  const setClientName = useCallback(
    (value) => {
      if (isReadOnly) return
      setClientNameState(value)
      setClientId(null)
    },
    [isReadOnly],
  )

  const setClientCnpjCpf = useCallback(
    (value) => {
      if (isReadOnly) return
      setClientCnpjCpfState(parseCpfCnpjInput(value))
    },
    [isReadOnly],
  )

  const selectClient = useCallback(
    (client) => {
      if (isReadOnly) return
      setClientId(client.id ?? null)
      setClientNameState(client.nome ?? '')
      setClientCnpjCpfState(parseCpfCnpjInput(client.cnpj_cpf ?? ''))
      if (client.uf) setEstadoState(client.uf)
    },
    [isReadOnly],
  )

  const setEstado = useCallback(
    (value) => {
      if (isReadOnly) return
      setEstadoState(value || null)
    },
    [isReadOnly],
  )

  const setDataPagamento = useCallback(
    (value) => {
      if (isReadOnly) return
      setDataPagamentoState(value)
    },
    [isReadOnly],
  )

  const setTipoFrete = useCallback(
    (value) => {
      if (isReadOnly) return
      const next = value || null
      setTipoFreteState(next)
      if (next !== 'CIF') {
        setOrigemFreteState('')
        setDestinoFreteState('')
      }
    },
    [isReadOnly],
  )

  const setOrigemFrete = useCallback(
    (value) => {
      if (isReadOnly) return
      setOrigemFreteState(value)
    },
    [isReadOnly],
  )

  const setDestinoFrete = useCallback(
    (value) => {
      if (isReadOnly) return
      setDestinoFreteState(value)
    },
    [isReadOnly],
  )

  const setQuarter = useCallback(
    (value) => {
      if (isReadOnly) return
      setQuarterState(value || null)
    },
    [isReadOnly],
  )

  const setObservacoes = useCallback(
    (value) => {
      if (isReadOnly) return
      setObservacoesState(value)
    },
    [isReadOnly],
  )

  const addLine = useCallback(() => {
    if (!canEditProducts) return
    setLines((prev) => [...prev, createLine()])
  }, [canEditProducts])

  const removeLine = useCallback(
    (lineId) => {
      if (!canEditProducts) return
      setLines((prev) => prev.filter((l) => l.id !== lineId))
    },
    [canEditProducts],
  )

  const setLineProduct = useCallback(
    (lineId, productId) => {
      if (!canEditProducts) return
      if (!productId) {
        setLines((prev) =>
          prev.map((line) =>
            line.id === lineId
              ? { ...line, productId: '', proposta: 0, overrides: undefined }
              : line,
          ),
        )
        return
      }
      const product = catalog.find((p) => p.id === productId)
      if (!product) return
      const pu = resolvePrecoUnitario(product, pricingContext)
      setLines((prev) =>
        prev.map((line) => {
          if (line.id !== lineId) return line
          return {
            ...line,
            productId,
            proposta: pu,
            overrides: undefined,
          }
        }),
      )
    },
    [catalog, canEditProducts, pricingContext],
  )

  const setLineCultura = useCallback(
    (lineId, cultura) => {
      if (!canEditProducts) return
      setLines((prev) =>
        prev.map((line) =>
          line.id === lineId ? { ...line, cultura } : line,
        ),
      )
    },
    [canEditProducts],
  )

  const setLineVolume = useCallback(
    (lineId, volume) => {
      if (!canEditProducts) return
      const v = Number.isFinite(volume) && volume >= 0 ? volume : 0
      setLines((prev) =>
        prev.map((line) =>
          line.id === lineId ? { ...line, volume: v } : line,
        ),
      )
    },
    [canEditProducts],
  )

  const setLineProposta = useCallback(
    (lineId, proposta) => {
      if (!canEditProducts) return
      setLines((prev) =>
        prev.map((line) => {
          if (line.id !== lineId) return line
          const product = catalog.find((p) => p.id === line.productId)
          const pu = resolvePrecoUnitario(product, pricingContext, line.overrides)
          return {
            ...line,
            proposta: clampProposta(proposta, pu, canOverrideFloor),
          }
        }),
      )
    },
    [catalog, canEditProducts, canOverrideFloor, pricingContext],
  )

  const setLineOverride = useCallback(
    (lineId, field, value) => {
      if (!isGestor || !canEditProducts) return
      if (!OVERRIDE_FIELDS.includes(field)) return
      setLines((prev) =>
        prev.map((line) => {
          if (line.id !== lineId) return line
          const nextOverrides = { ...(line.overrides ?? {}) }
          if (value == null || value === '' || !Number.isFinite(Number(value))) {
            delete nextOverrides[field]
          } else {
            nextOverrides[field] = Number(value)
          }
          return { ...line, overrides: normalizeOverrides(nextOverrides) }
        }),
      )
    },
    [isGestor, canEditProducts],
  )

  const clearLineOverride = useCallback(
    (lineId) => {
      if (!isGestor || !canEditProducts) return
      setLines((prev) =>
        prev.map((line) =>
          line.id === lineId ? { ...line, overrides: undefined } : line,
        ),
      )
    },
    [isGestor, canEditProducts],
  )

  const dismissActionBanner = useCallback(() => setActionBanner(null), [])

  const lockAsPending = useCallback(() => {
    setRemotePendingLock(true)
  }, [])

  const showActionBanner = useCallback((message) => {
    setActionBanner(message)
  }, [])

  const getLaunchBlockReason = useCallback(() => {
    if (!quarter) return 'Selecione o quarter antes de lançar.'
    if (!tipoFrete) return 'Selecione o tipo de frete.'
    if (!dataPagamento) return 'Informe a data de pagamento.'
    if (tipoFrete === 'CIF') {
      if (!origemFrete?.trim()) return 'Selecione a origem do frete.'
      if (!destinoFrete?.trim()) return 'Selecione o destino do frete.'
    }
    if (lines.length === 0) return 'Inclua ao menos um produto.'
    if (lines.some((line) => !line.productId)) {
      return 'Selecione o produto em todas as linhas.'
    }
    if (lines.some((line) => !String(line.cultura ?? '').trim())) {
      return 'Informe a cultura em todas as linhas.'
    }
    if (lines.some((line) => !(Number(line.volume) > 0))) {
      return 'Informe um volume maior que zero em todas as linhas.'
    }
    if (totalValor <= 0) return 'Informe volumes válidos nos produtos.'
    if (canOverrideFloor) return null
    if (globalStatus === 'Pendente') {
      return 'A proposta está abaixo da autonomia. Solicite revisão do gestor ou ajuste as propostas.'
    }
    if (globalStatus !== 'Aprovado') return 'Complete a simulação antes de converter.'
    return null
  }, [
    canOverrideFloor,
    dataPagamento,
    destinoFrete,
    globalStatus,
    lines,
    origemFrete,
    quarter,
    tipoFrete,
    totalValor,
  ])

  const clearOrphanProducts = useCallback(() => {
    const ids = new Set(catalog.map((p) => p.id))
    setLines((prev) =>
      prev.map((line) =>
        line.productId && !ids.has(line.productId)
          ? { ...line, productId: '', proposta: 0, overrides: undefined }
          : line,
      ),
    )
  }, [catalog])

  const hydrateFromBundle = useCallback(
    (bundle) => {
      const simulation = bundle.simulation
      const frozen = isSimulationFrozen(simulation)
      const consultorLocked =
        !isGestor && isConsultorSimulationLocked(simulation.status)
      setRemotePendingLock(frozen || consultorLocked)
      setClientId(bundle.client.id ?? null)
      setClientNameState(bundle.client.nome)
      setClientCnpjCpfState(parseCpfCnpjInput(bundle.client.cnpj_cpf ?? ''))
      setEstadoState(bundle.client.uf || null)
      setDataPagamentoState(bundle.simulation.data_pagamento ?? '')
      setDataNegociacao(
        simulation.created_at
          ? String(simulation.created_at).slice(0, 10)
          : todayDateOnly(),
      )
      setTipoFreteState(bundle.simulation.tipo_frete ?? null)
      setOrigemFreteState(bundle.simulation.origem_frete ?? '')
      setDestinoFreteState(bundle.simulation.destino_frete ?? '')
      setQuarterState(bundle.simulation.quarter ?? null)
      setObservacoesState(bundle.simulation.observacoes ?? '')
      setActionBanner(null)
      setGestorAlteracao(
        simulation.gestor_alteracao_em
          ? {
              em: simulation.gestor_alteracao_em,
              por: simulation.gestor_alteracao_por,
              resumo: simulation.gestor_alteracao_resumo,
            }
          : null,
      )

      const mappedLines = bundle.items
        .filter((it) => it.product_id.length > 0)
        .map((it) => {
          const displayNome =
            it.product?.nome ||
            [it.product?.sku_fornecedor, it.product?.referencia_complementar]
              .filter(Boolean)
              .join(' ') ||
            '—'
          const base = {
            id: it.id,
            productId: it.product_id,
            cultura: it.cultura ?? CULTURES[0] ?? '',
            volume: it.volume,
            proposta: roundMoney(it.proposta),
            overrides: normalizeOverrides({
              custoUsd: it.override_custo_usd ?? undefined,
              descontoUsd: it.override_desconto_usd ?? undefined,
              taxa: it.override_taxa ?? undefined,
              frete: it.override_frete ?? undefined,
              taxaAntecipacao: it.override_taxa_antecipacao ?? undefined,
              taxaJuros: it.override_taxa_juros ?? undefined,
            }),
          }
          if (!frozen) return base
          return {
            ...base,
            snapshot: {
              precoUnitario: Number(it.preco_unitario) || 0,
              financeiro:
                it.financeiro_unitario != null
                  ? Number(it.financeiro_unitario)
                  : null,
              margemPercentual: it.margem_percentual,
              comissaoPercentual: it.comissao_percentual,
              comissaoValor: it.comissao_valor,
              produtoClasse: it.produto_classe,
              displayNome,
            },
          }
        })

      setLines(mappedLines)

      if (frozen) {
        const views = mappedLines.map((line) =>
          buildFrozenLineView(
            {
              id: line.id,
              product_id: line.productId,
              cultura: line.cultura,
              volume: line.volume,
              preco_unitario: line.snapshot.precoUnitario,
              proposta: line.proposta,
              financeiro_unitario: line.snapshot.financeiro,
              margem_percentual: line.snapshot.margemPercentual,
              comissao_percentual: line.snapshot.comissaoPercentual,
              comissao_valor: line.snapshot.comissaoValor,
              produto_classe: line.snapshot.produtoClasse,
              overrides: line.overrides,
            },
            line.snapshot.displayNome,
          ),
        )
        setFrozenTotals(buildFrozenTotals(views, simulation))
      } else {
        setFrozenTotals(null)
      }
    },
    [isGestor],
  )

  const resetLocal = useCallback(() => {
    setRemotePendingLock(false)
    setFrozenTotals(null)
    setGestorAlteracao(null)
    setClientId(null)
    setClientNameState('')
    setClientCnpjCpfState('')
    setEstadoState(null)
    setDataPagamentoState('')
    setDataNegociacao(todayDateOnly())
    setTipoFreteState(null)
    setOrigemFreteState('')
    setDestinoFreteState('')
    setQuarterState(null)
    setObservacoesState('')
    setLines([])
    setActionBanner(null)
  }, [])

  const clearDraft = useCallback(() => {
    draftSaverRef.current.clear()
  }, [])

  useEffect(() => {
    if (!persistDraft) return
    draftSaverRef.current.save({
      clientId,
      clientName,
      clientCnpjCpf,
      estado,
      dataPagamento,
      tipoFrete,
      origemFrete,
      destinoFrete,
      quarter,
      observacoes,
      lines,
    })
  }, [
    persistDraft,
    clientId,
    clientName,
    clientCnpjCpf,
    estado,
    dataPagamento,
    tipoFrete,
    origemFrete,
    destinoFrete,
    quarter,
    observacoes,
    lines,
  ])

  return {
    catalog,
    cultureOptions,
    estado,
    setEstado,
    clientId,
    clientName,
    setClientName,
    selectClient,
    clientCnpjCpf,
    setClientCnpjCpf,
    dataPagamento,
    setDataPagamento,
    dataNegociacao,
    prazoDias,
    tipoFrete,
    setTipoFrete,
    origemFrete,
    setOrigemFrete,
    destinoFrete,
    setDestinoFrete,
    quarter,
    setQuarter,
    observacoes,
    setObservacoes,
    lines: lineViews,
    simulationLines: lines,
    totalValor,
    totalProposta,
    totalFinanceiro,
    margemLucroTotal,
    margemLucroValorTotal,
    comissaoValorTotal,
    globalStatus,
    isReadOnly,
    isGestor,
    canOverrideFloor,
    canEditProducts,
    productsLocked,
    canConvert,
    remotePendingLock,
    gestorAlteracao,
    isFrozen: Boolean(frozenTotals),
    showFreteRotas,
    addLine,
    removeLine,
    setLineProduct,
    setLineCultura,
    setLineVolume,
    setLineProposta,
    setLineOverride,
    clearLineOverride,
    lockAsPending,
    showActionBanner,
    getLaunchBlockReason,
    actionBanner,
    dismissActionBanner,
    hydrateFromBundle,
    resetLocal,
    clearDraft,
    clearOrphanProducts,
  }
}
