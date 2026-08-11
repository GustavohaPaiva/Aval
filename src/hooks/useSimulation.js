import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CATALOG_PRODUCTS } from '../constants/catalogProducts'
import { resolveOrigemFreteByEstado } from '../constants/fretes'
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

function normalizeDescontoPct(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.min(100, Math.max(0, n))
}

/** Comparação de % com 2 casas (mesmo passo do input). */
function roundDescontoPct(value) {
  return Math.round(normalizeDescontoPct(value) * 100) / 100
}

/** Desconto % em relação ao valor unitário (tabela). */
function calcDescontoPct(precoUnitario, proposta) {
  const pu = Number(precoUnitario)
  if (!(pu > 0)) return 0
  const prop = clampProposta(proposta)
  return normalizeDescontoPct(((pu - prop) / pu) * 100)
}

function calcPropostaFromDesconto(precoUnitario, descontoPct) {
  const pu = Number(precoUnitario) || 0
  const pct = normalizeDescontoPct(descontoPct)
  return clampProposta(roundMoney(pu * (1 - pct / 100)))
}

function resolveLineAutonomia(classe, prazoDias, autonomiaParams) {
  const autonomiaPct = getAutonomiaPercentual({
    prazoDias,
    classe,
    params: autonomiaParams,
  })
  return {
    autonomiaPct,
    floorRatio: getFloorRatio(autonomiaPct),
  }
}

function normalizeDraftLines(lines) {
  if (!Array.isArray(lines)) return []
  return lines.map((line) => {
    const hasDesconto =
      line.descontoPct != null && Number.isFinite(Number(line.descontoPct))
    return {
      id: String(line.id ?? crypto.randomUUID()),
      productId: line.productId ?? '',
      fornecedorId: line.fornecedorId ?? '',
      cultura: line.cultura ?? CULTURES[0] ?? '',
      volume: Number(line.volume) || 0,
      proposta: Number(line.proposta) || 0,
      descontoPct: hasDesconto ? normalizeDescontoPct(line.descontoPct) : null,
      overrides: normalizeOverrides(line.overrides),
    }
  })
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

function clampProposta(proposta) {
  const p = Number.isFinite(proposta) ? proposta : 0
  return Math.max(0, p)
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
  comissaoFaixas,
  prazoDias,
  autonomiaParams,
  { suppressDescontoBelowFloor = false } = {},
) {
  const icmsPercentual = context.icmsPercentual ?? DEFAULT_ICMS_PERCENTUAL
  const pisCofinsPercentual = context.pisCofinsPercentual ?? 0
  const taxParams = { icmsPercentual, pisCofinsPercentual }

  if (line.snapshot) {
    const product = catalog.find((p) => p.id === line.productId)
    const displayNome =
      product?.displayNome ??
      product?.nome ??
      line.snapshot.displayNome ??
      '—'
    return {
      ...buildFrozenLineView(
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
        taxParams,
      ),
      fornecedorId: line.fornecedorId ?? product?.fornecedorId ?? '',
      descontoPct:
        line.descontoPct != null && Number.isFinite(Number(line.descontoPct))
          ? normalizeDescontoPct(line.descontoPct)
          : calcDescontoPct(line.snapshot.precoUnitario, line.proposta),
    }
  }

  const product = catalog.find((p) => p.id === line.productId)
  const overrides = normalizeOverrides(line.overrides)
  const { precoUnitario, breakdown } = resolvePricing(product, context, overrides)
  const proposta = clampProposta(line.proposta ?? precoUnitario)
  const valorTotal = roundMoney(line.volume * precoUnitario)
  const propostaTotal = roundMoney(line.volume * proposta)
  const financeiro = breakdown?.financeiro ?? 0
  const financeiroTotal = roundMoney(line.volume * financeiro)
  const margemLucro = calcMargemLucro(
    proposta,
    financeiro,
    icmsPercentual,
    pisCofinsPercentual,
  )
  const margemLucroValor = calcMargemLucroValor(
    propostaTotal,
    financeiroTotal,
    icmsPercentual,
    pisCofinsPercentual,
  )
  const comissao = calcComissaoLinha({
    margem: margemLucro,
    classe: product?.classe,
    volume: line.volume,
    proposta,
    faixas: comissaoFaixas,
  })
  const { autonomiaPct, floorRatio } = resolveLineAutonomia(
    comissao.classe,
    prazoDias,
    autonomiaParams,
  )
  const floorUnit = floorRatio * precoUnitario
  const isLineBelowFloor = Boolean(product) && proposta < floorUnit

  const hasStoredDesconto =
    line.descontoPct != null && Number.isFinite(Number(line.descontoPct))
  let descontoPct = null
  if (isLineBelowFloor && suppressDescontoBelowFloor) {
    descontoPct = null
  } else if (hasStoredDesconto) {
    descontoPct = normalizeDescontoPct(line.descontoPct)
  } else if (!isLineBelowFloor) {
    descontoPct = calcDescontoPct(precoUnitario, proposta)
  }

  return {
    id: line.id,
    productId: line.productId,
    fornecedorId: line.fornecedorId ?? '',
    cultura: line.cultura,
    volume: line.volume,
    precoUnitario,
    proposta,
    descontoPct,
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
    fornecedorId: '',
    cultura: '',
    volume: 1,
    proposta: 0,
    descontoPct: 0,
  }
}

export function useSimulation(options = {}) {
  const catalog = options.catalog ?? CATALOG_PRODUCTS
  const freteUnitario = options.freteUnitario ?? 0
  const icmsPercentual = options.icmsPercentual ?? DEFAULT_ICMS_PERCENTUAL
  const pisCofinsPercentual =
    options.pisCofinsPercentual == null || options.pisCofinsPercentual === ''
      ? 0
      : Number(options.pisCofinsPercentual)
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
  const [origemFrete, setOrigemFreteState] = useState(() => {
    const tipo = initialDraft?.tipoFrete ?? null
    const est = initialDraft?.estado ?? null
    if (tipo === 'CIF') {
      return (
        resolveOrigemFreteByEstado(est) || initialDraft?.origemFrete || ''
      )
    }
    return ''
  })
  const [destinoFrete, setDestinoFreteState] = useState(
    () => initialDraft?.destinoFrete ?? '',
  )
  const [quarter, setQuarterState] = useState(() => initialDraft?.quarter ?? null)

  const [lines, setLines] = useState(() =>
    normalizeDraftLines(initialDraft?.lines),
  )
  const [actionBanner, setActionBanner] = useState(null)
  const [softNotice, setSoftNotice] = useState(null)
  const softNoticeTimerRef = useRef(null)
  const [remotePendingLock, setRemotePendingLock] = useState(false)
  const [frozenTotals, setFrozenTotals] = useState(null)
  const [gestorAlteracao, setGestorAlteracao] = useState(null)

  const draftSaverRef = useRef(null)
  if (draftSaverRef.current == null) {
    draftSaverRef.current = createDraftSaver(SIMULADOR_DRAFT_KEY)
  }

  const pricingContext = useMemo(
    () => ({
      dataPagamento,
      freteUnitario,
      icmsPercentual,
      pisCofinsPercentual,
      margemPercentual,
    }),
    [
      dataPagamento,
      freteUnitario,
      icmsPercentual,
      pisCofinsPercentual,
      margemPercentual,
    ],
  )

  const prazoDias = useMemo(
    () => calcPrazoNegociacao(dataPagamento, dataNegociacao),
    [dataPagamento, dataNegociacao],
  )

  const canOverrideFloor = isGestor && !frozenTotals
  const suppressDescontoBelowFloor = !canOverrideFloor
  const productsLocked =
    !estado ||
    !Boolean(String(dataPagamento ?? '').trim()) ||
    !quarter

  const showSoftNotice = useCallback((message) => {
    if (softNoticeTimerRef.current != null) {
      clearTimeout(softNoticeTimerRef.current)
      softNoticeTimerRef.current = null
    }
    setSoftNotice(message)
    softNoticeTimerRef.current = setTimeout(() => {
      setSoftNotice(null)
      softNoticeTimerRef.current = null
    }, 3200)
  }, [])

  useEffect(() => {
    return () => {
      if (softNoticeTimerRef.current != null) {
        clearTimeout(softNoticeTimerRef.current)
      }
    }
  }, [])

  const lineViews = useMemo(
    () =>
      lines.map((line) =>
        buildLineView(
          line,
          catalog,
          pricingContext,
          comissaoFaixas,
          prazoDias,
          autonomiaParams,
          { suppressDescontoBelowFloor },
        ),
      ),
    [
      lines,
      catalog,
      pricingContext,
      comissaoFaixas,
      prazoDias,
      autonomiaParams,
      suppressDescontoBelowFloor,
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
        margemLucroTotal: calcMargemLucro(
          tProposta,
          tFinanceiro,
          icmsPercentual,
          pisCofinsPercentual,
        ),
        margemLucroValorTotal: calcMargemLucroValor(
          tProposta,
          tFinanceiro,
          icmsPercentual,
          pisCofinsPercentual,
        ),
        comissaoValorTotal: roundMoney(comissaoValorRaw),
        globalStatus: status,
      }
    }, [lineViews, frozenTotals, icmsPercentual, pisCofinsPercentual])

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
    },
    [isReadOnly],
  )

  const setEstado = useCallback(
    (value) => {
      if (isReadOnly) return
      const next = value || null
      if (next === estado) return
      setEstadoState(next)
      setLines([])
      if (tipoFrete === 'CIF') {
        const origem = resolveOrigemFreteByEstado(next)
        setOrigemFreteState(origem)
        setDestinoFreteState('')
      }
    },
    [isReadOnly, estado, tipoFrete],
  )

  const setDataPagamento = useCallback(
    (value) => {
      if (isReadOnly) return
      if (value === dataPagamento) return
      setDataPagamentoState(value)
      setLines([])
    },
    [isReadOnly, dataPagamento],
  )

  const setTipoFrete = useCallback(
    (value) => {
      if (isReadOnly) return
      const next = value || null
      setTipoFreteState(next)
      if (next === 'CIF') {
        const origem = resolveOrigemFreteByEstado(estado)
        setOrigemFreteState(origem)
        setDestinoFreteState('')
      } else {
        setOrigemFreteState('')
        setDestinoFreteState('')
      }
    },
    [isReadOnly, estado],
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
      const next = value || null
      if (next === quarter) return
      setQuarterState(next)
      setLines([])
    },
    [isReadOnly, quarter],
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
              ? {
                  ...line,
                  productId: '',
                  proposta: 0,
                  descontoPct: 0,
                  overrides: undefined,
                }
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
            fornecedorId: product.fornecedorId ?? line.fornecedorId ?? '',
            proposta: pu,
            descontoPct: 0,
            overrides: undefined,
          }
        }),
      )
    },
    [catalog, canEditProducts, pricingContext],
  )

  const setLineFornecedor = useCallback(
    (lineId, fornecedorId) => {
      if (!canEditProducts) return
      const nextFornecedorId = fornecedorId ? String(fornecedorId) : ''
      setLines((prev) =>
        prev.map((line) => {
          if (line.id !== lineId) return line
          if (!nextFornecedorId) {
            return { ...line, fornecedorId: '' }
          }
          const product = line.productId
            ? catalog.find((p) => p.id === line.productId)
            : null
          const productMatches =
            product &&
            String(product.fornecedorId ?? '') === nextFornecedorId
          if (line.productId && !productMatches) {
            return {
              ...line,
              fornecedorId: nextFornecedorId,
              productId: '',
              proposta: 0,
              descontoPct: 0,
              overrides: undefined,
            }
          }
          return { ...line, fornecedorId: nextFornecedorId }
        }),
      )
    },
    [catalog, canEditProducts],
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
          const product = line.productId
            ? catalog.find((p) => p.id === line.productId)
            : null
          const pu = resolvePrecoUnitario(
            product,
            pricingContext,
            line.overrides,
          )
          const nextProposta = clampProposta(proposta)
          const { floorRatio } = resolveLineAutonomia(
            product?.classe,
            prazoDias,
            autonomiaParams,
          )
          const floorUnit = floorRatio * pu
          const belowFloor = Boolean(product) && nextProposta < floorUnit
          if (!canOverrideFloor && belowFloor) {
            return {
              ...line,
              proposta: nextProposta,
              descontoPct: null,
            }
          }
          return {
            ...line,
            proposta: nextProposta,
            descontoPct: calcDescontoPct(pu, nextProposta),
          }
        }),
      )
    },
    [
      canEditProducts,
      canOverrideFloor,
      catalog,
      pricingContext,
      prazoDias,
      autonomiaParams,
    ],
  )

  const setLineDescontoPct = useCallback(
    (lineId, descontoPct) => {
      if (!canEditProducts) return
      const pct = normalizeDescontoPct(descontoPct)
      const current = lines.find((line) => line.id === lineId)
      if (!current) return
      const product = current.productId
        ? catalog.find((p) => p.id === current.productId)
        : null
      const pu = resolvePrecoUnitario(
        product,
        pricingContext,
        current.overrides,
      )
      if (!canOverrideFloor && product) {
        const { autonomiaPct } = resolveLineAutonomia(
          product?.classe,
          prazoDias,
          autonomiaParams,
        )
        const cap = roundDescontoPct(autonomiaPct)
        if (roundDescontoPct(pct) > cap) {
          const capLabel = String(cap).replace('.', ',')
          showSoftNotice(
            `Desconto acima da autonomia (${capLabel}%). Valor não alterado.`,
          )
          return
        }
      }
      setLines((prev) =>
        prev.map((line) =>
          line.id === lineId
            ? {
                ...line,
                descontoPct: pct,
                proposta: calcPropostaFromDesconto(pu, pct),
              }
            : line,
        ),
      )
    },
    [
      canEditProducts,
      canOverrideFloor,
      lines,
      catalog,
      pricingContext,
      prazoDias,
      autonomiaParams,
      showSoftNotice,
    ],
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
          const overrides = normalizeOverrides(nextOverrides)
          const product = line.productId
            ? catalog.find((p) => p.id === line.productId)
            : null
          const pu = resolvePrecoUnitario(product, pricingContext, overrides)
          const proposta = clampProposta(line.proposta)
          return {
            ...line,
            overrides,
            proposta,
            descontoPct: calcDescontoPct(pu, proposta),
          }
        }),
      )
    },
    [isGestor, canEditProducts, catalog, pricingContext],
  )

  const clearLineOverride = useCallback(
    (lineId) => {
      if (!isGestor || !canEditProducts) return
      setLines((prev) =>
        prev.map((line) => {
          if (line.id !== lineId) return line
          const product = line.productId
            ? catalog.find((p) => p.id === line.productId)
            : null
          const pu = resolvePrecoUnitario(product, pricingContext, undefined)
          const proposta = clampProposta(line.proposta)
          return {
            ...line,
            overrides: undefined,
            proposta,
            descontoPct: calcDescontoPct(pu, proposta),
          }
        }),
      )
    },
    [isGestor, canEditProducts, catalog, pricingContext],
  )

  const dismissActionBanner = useCallback(() => setActionBanner(null), [])

  const lockAsPending = useCallback(() => {
    setRemotePendingLock(true)
  }, [])

  const showActionBanner = useCallback((message) => {
    setActionBanner(message)
  }, [])

  const getLaunchBlockReason = useCallback(() => {
    if (!estado) return 'Selecione o estado antes de lançar.'
    if (!quarter) return 'Selecione o quarter antes de lançar.'
    if (!tipoFrete) return 'Selecione o tipo de frete.'
    if (!dataPagamento) return 'Informe a data de pagamento.'
    if (tipoFrete === 'CIF') {
      if (!origemFrete?.trim()) return 'Origem do frete indisponível para o estado.'
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
    estado,
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
          ? {
              ...line,
              productId: '',
              proposta: 0,
              descontoPct: 0,
              overrides: undefined,
            }
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
      // Estado da operação (lista/origem) — nunca o UF cadastral do cliente.
      const estadoFromItems = bundle.items.find(
        (it) => it.product?.estado,
      )?.product?.estado
      const nextEstado =
        estadoFromItems || simulation.pedido_uf || null
      setEstadoState(nextEstado)
      setDataPagamentoState(bundle.simulation.data_pagamento ?? '')
      setDataNegociacao(
        simulation.created_at
          ? String(simulation.created_at).slice(0, 10)
          : todayDateOnly(),
      )
      const nextTipoFrete = bundle.simulation.tipo_frete ?? null
      setTipoFreteState(nextTipoFrete)
      const origemSalva = bundle.simulation.origem_frete ?? ''
      setOrigemFreteState(
        nextTipoFrete === 'CIF'
          ? origemSalva || resolveOrigemFreteByEstado(nextEstado)
          : '',
      )
      setDestinoFreteState(bundle.simulation.destino_frete ?? '')
      setQuarterState(bundle.simulation.quarter ?? null)
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
            fornecedorId:
              catalog.find((p) => p.id === it.product_id)?.fornecedorId ?? '',
            cultura: it.cultura ?? CULTURES[0] ?? '',
            volume: it.volume,
            proposta: roundMoney(it.proposta),
            descontoPct: calcDescontoPct(
              Number(it.preco_unitario) || 0,
              it.proposta,
            ),
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
        const taxParams = { icmsPercentual, pisCofinsPercentual }
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
            taxParams,
          ),
        )
        setFrozenTotals(buildFrozenTotals(views, simulation, taxParams))
      } else {
        setFrozenTotals(null)
      }
    },
    [catalog, isGestor, icmsPercentual, pisCofinsPercentual],
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
    lines,
  ])

  // Quando a tabela muda:
  // - com % preenchido: proposta acompanha o desconto
  // - consultor abaixo do piso: mantém proposta e % vazio
  // - draft antigo sem %: deriva o desconto (se dentro do piso)
  useEffect(() => {
    if (isReadOnly) return
    setLines((prev) => {
      let changed = false
      const next = prev.map((line) => {
        if (!line.productId || line.snapshot) return line
        const product = catalog.find((p) => p.id === line.productId)
        if (!product) return line
        const pu = resolvePrecoUnitario(product, pricingContext, line.overrides)
        const { floorRatio } = resolveLineAutonomia(
          product?.classe,
          prazoDias,
          autonomiaParams,
        )
        const floorUnit = floorRatio * pu
        const belowFloor = clampProposta(line.proposta) < floorUnit
        const hasDesconto =
          line.descontoPct != null && Number.isFinite(Number(line.descontoPct))

        if (!canOverrideFloor && belowFloor) {
          if (hasDesconto) {
            changed = true
            return { ...line, descontoPct: null }
          }
          return line
        }

        if (!hasDesconto) {
          const derived = calcDescontoPct(pu, line.proposta)
          changed = true
          return { ...line, descontoPct: derived }
        }
        const descontoPct = normalizeDescontoPct(line.descontoPct)
        const expected = calcPropostaFromDesconto(pu, descontoPct)
        if (roundMoney(line.proposta) === expected) return line
        changed = true
        return { ...line, descontoPct, proposta: expected }
      })
      return changed ? next : prev
    })
  }, [
    catalog,
    pricingContext,
    isReadOnly,
    prazoDias,
    autonomiaParams,
    canOverrideFloor,
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
    setLineFornecedor,
    setLineCultura,
    setLineVolume,
    setLineProposta,
    setLineDescontoPct,
    setLineOverride,
    clearLineOverride,
    lockAsPending,
    showActionBanner,
    getLaunchBlockReason,
    actionBanner,
    dismissActionBanner,
    softNotice,
    dismissSoftNotice: () => setSoftNotice(null),
    hydrateFromBundle,
    resetLocal,
    clearDraft,
    clearOrphanProducts,
  }
}
