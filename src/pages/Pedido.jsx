import { createElement, useCallback, useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { AtribuirConsultorPanel } from '../components/AtribuirConsultorPanel'
import { PedidoCotacaoMensagem } from '../components/pedido/PedidoCotacaoMensagem'
import { PedidoPdfDocument } from '../components/pedido/PedidoPdfDocument'
import { PedidoSimulationSummary } from '../components/pedido/PedidoSimulationSummary'
import { AlertMessage } from '../components/ui/AlertMessage'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Input } from '../components/ui/Input'
import { PageBackLink } from '../components/ui/PageBackLink'
import { PageHeader } from '../components/ui/PageHeader'
import { Select } from '../components/ui/Select'
import {
  ESTADO_UF_VALUES,
  PRAZO_DIAS_DEFAULT,
  PRAZO_OPTIONS,
  STATES,
  normalizePrazoDias,
} from '../constants/simulator'
import {
  isPedidoStatus,
  statusBadgeClass,
  statusLabelPt,
} from '../constants/simulationStatus'
import { useAuth } from '../hooks/useAuth'
import { useSyncPageLoading } from '../contexts/PageLoadingContext'
import { useAbortableAsync } from '../hooks/useAbortableAsync'
import { fetchMunicipiosBrasil } from '../services/ibgeLocalidades'
import { buildPdfBlobFromReactNode } from '../services/renderReactPdf'
import {
  cancelOrder,
  fetchSimulationOrderBundle,
  updatePedidoFields,
} from '../services/simulationOrderService'
import { baixarPdfBlob } from '../utils/downloadPdfBlob'

export function Pedido({ simulationId }) {
  const { role } = useAuth()
  const isGestor = role === 'gestor'

  const [loadState, setLoadState] = useState('idle')
  const [loadError, setLoadError] = useState(null)
  const [bundle, setBundle] = useState(null)

  useSyncPageLoading(loadState === 'loading' || loadState === 'idle')

  const [fazenda, setFazenda] = useState('')
  const [pedidoMunicipio, setPedidoMunicipio] = useState('')
  const [pedidoUf, setPedidoUf] = useState('')
  const [prazoDias, setPrazoDias] = useState(PRAZO_DIAS_DEFAULT)
  const [fieldErrors, setFieldErrors] = useState({})

  const [municipioOptions, setMunicipioOptions] = useState([])
  const [municipiosLoading, setMunicipiosLoading] = useState(false)
  const [municipiosError, setMunicipiosError] = useState(null)

  const [actionError, setActionError] = useState(null)
  const [actionBanner, setActionBanner] = useState(null)
  const [savingPedido, setSavingPedido] = useState(false)
  const [generatingPdf, setGeneratingPdf] = useState(false)
  const [deciding, setDeciding] = useState(null)

  const status = bundle?.simulation.status
  const isOrderPending = status === 'order_pending'
  const isConverted = status === 'converted'
  const isOrderRejected = status === 'order_rejected'
  const canEditPedido = isGestor
    ? isOrderPending || isConverted
    : isConverted
  const canCancelPedido =
    isGestor && (isOrderPending || isConverted || isOrderRejected)
  const backTo = isPedidoStatus(status) ? '/pedidos' : '/simulacoes'
  const backLabel = isPedidoStatus(status)
    ? 'Voltar para pedidos'
    : 'Voltar para simulações'

  useAbortableAsync(
    async (_signal, isActive) => {
      setLoadState('loading')
      setLoadError(null)
      const res = await fetchSimulationOrderBundle(simulationId)
      if (!isActive()) return
      if (!res.ok) {
        setLoadState('error')
        setLoadError(res.error)
        setBundle(null)
        return
      }
      setBundle(res.data)
      const sim = res.data.simulation
      setFazenda(sim.fazenda ?? '')
      setPedidoMunicipio(sim.pedido_municipio ?? '')
      setPedidoUf(sim.pedido_uf ?? '')
      setPrazoDias(normalizePrazoDias(sim.prazo_dias))
      setLoadState('ready')
    },
    [simulationId],
  )

  useAbortableAsync(
    async (_signal, isActive) => {
      setMunicipiosLoading(true)
      setMunicipiosError(null)
      const res = await fetchMunicipiosBrasil()
      if (!isActive()) return
      setMunicipiosLoading(false)
      if (!res.ok) {
        setMunicipiosError(res.error)
        setMunicipioOptions([])
        return
      }
      setMunicipioOptions(res.options)
    },
    [],
  )

  const municipioSelectValue = useMemo(() => {
    if (!pedidoMunicipio) return ''
    const match =
      municipioOptions.find(
        (o) =>
          o.nome === pedidoMunicipio &&
          (!pedidoUf || o.uf === pedidoUf),
      ) ?? municipioOptions.find((o) => o.nome === pedidoMunicipio)
    return match?.value ?? pedidoMunicipio
  }, [municipioOptions, pedidoMunicipio, pedidoUf])

  const municipioSelectOptions = useMemo(() => {
    const list = municipioOptions.map((o) => ({
      value: o.value,
      label: o.label,
    }))
    if (
      municipioSelectValue &&
      !list.some((o) => o.value === municipioSelectValue)
    ) {
      return [
        {
          value: municipioSelectValue,
          label: pedidoUf
            ? `${pedidoMunicipio} — ${pedidoUf}`
            : pedidoMunicipio,
        },
        ...list,
      ]
    }
    return list
  }, [
    municipioOptions,
    municipioSelectValue,
    pedidoMunicipio,
    pedidoUf,
  ])

  function clearFieldError(key) {
    setFieldErrors((prev) => {
      if (!prev[key]) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  const handleConsultorAssigned = useCallback((result) => {
    if (!result?.userId) return
    setBundle((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        vendedorNome: result.vendedorNome ?? prev.vendedorNome,
        simulation: {
          ...prev.simulation,
          user_id: result.userId,
        },
      }
    })
  }, [])

  function validatePedidoFields() {
    /** @type {Record<string, string>} */
    const errors = {}
    if (!fazenda.trim()) {
      errors.fazenda = 'Informe o nome da fazenda.'
    }
    if (!pedidoMunicipio.trim()) {
      errors.pedidoMunicipio = 'Selecione o município.'
    }
    if (!ESTADO_UF_VALUES.includes(pedidoUf)) {
      errors.pedidoUf = 'Selecione o estado.'
    }
    const prazo = normalizePrazoDias(prazoDias)
    if (![7, 14, 21].includes(prazo)) {
      errors.prazoDias = 'Prazo inválido.'
    }
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  function patchSimulationStatus(nextStatus) {
    setBundle((prev) =>
      prev
        ? {
            ...prev,
            simulation: { ...prev.simulation, status: nextStatus },
          }
        : prev,
    )
  }

  async function handleCancelOrder() {
    if (!bundle || !isGestor) return
    const confirmed = window.confirm(
      'Cancelar este pedido? Essa ação registra quem cancelou e quando.',
    )
    if (!confirmed) return

    setActionError(null)
    setActionBanner(null)
    setDeciding('cancel')
    try {
      const result = await cancelOrder(bundle.simulation.id)
      if (!result.ok) {
        setActionError(result.error)
        return
      }
      patchSimulationStatus('cancelled')
      setActionBanner('Pedido cancelado.')
    } finally {
      setDeciding(null)
    }
  }

  const pdfBundle = useMemo(
    () =>
      bundle
        ? {
            ...bundle,
            simulation: {
              ...bundle.simulation,
              fazenda: fazenda.trim() || null,
              pedido_municipio: pedidoMunicipio.trim() || null,
              pedido_uf: pedidoUf || null,
              prazo_dias: normalizePrazoDias(prazoDias),
            },
          }
        : null,
    [bundle, fazenda, pedidoMunicipio, pedidoUf, prazoDias],
  )

  const pdfNomeFallback = useMemo(
    () =>
      pdfBundle
        ? `proposta-syagri-${formatDocSuffix(pdfBundle.simulation.id)}-${(pdfBundle.client.nome || 'cliente')
            .replace(/[^\w-]+/g, '_')
            .slice(0, 40)}.pdf`
        : 'proposta-syagri.pdf',
    [pdfBundle],
  )

  const persistPedidoBeforePdf = useCallback(async () => {
    if (!bundle) return { ok: false, error: 'Pedido inválido.' }

    if (!validatePedidoFields()) {
      return {
        ok: false,
        error: 'Preencha os dados obrigatórios do pedido antes de gerar o PDF.',
      }
    }

    const prazo = isGestor
      ? normalizePrazoDias(prazoDias)
      : normalizePrazoDias(bundle.simulation.prazo_dias ?? PRAZO_DIAS_DEFAULT)

    setSavingPedido(true)
    const pedidoRes = await updatePedidoFields({
      simulationId: bundle.simulation.id,
      fazenda: fazenda.trim(),
      pedidoMunicipio: pedidoMunicipio.trim(),
      pedidoUf,
      prazoDias: prazo,
    })
    if (!pedidoRes.ok) {
      setSavingPedido(false)
      return pedidoRes
    }

    setBundle((prev) =>
      prev
        ? {
            ...prev,
            simulation: {
              ...prev.simulation,
              fazenda: fazenda.trim(),
              pedido_municipio: pedidoMunicipio.trim(),
              pedido_uf: pedidoUf,
              prazo_dias: prazo,
            },
          }
        : prev,
    )
    setPrazoDias(prazo)

    setSavingPedido(false)
    return { ok: true }
  }, [
    bundle,
    fazenda,
    isGestor,
    pedidoMunicipio,
    pedidoUf,
    prazoDias,
  ])

  const handleGerarPdf = useCallback(async () => {
    if (!bundle || !pdfBundle) return

    setActionError(null)

    const snapshot = {
      ...pdfBundle,
      simulation: { ...pdfBundle.simulation },
      client: { ...pdfBundle.client },
      items: pdfBundle.items.map((item) => ({ ...item })),
    }
    const vendedorNome = bundle.vendedorNome
    const nomeArquivo = pdfNomeFallback

    const saved = await persistPedidoBeforePdf()
    if (!saved.ok) {
      setActionError(saved.error)
      return
    }

    setGeneratingPdf(true)
    try {
      const blob = await buildPdfBlobFromReactNode(
        createElement(PedidoPdfDocument, {
          bundle: snapshot,
          vendedorNome,
        }),
      )
      await baixarPdfBlob(blob, nomeArquivo)
    } catch (e) {
      console.error('[Pedido] PDF:', e)
      setActionError(
        e instanceof Error ? e.message : 'Não foi possível gerar o PDF.',
      )
    } finally {
      setGeneratingPdf(false)
    }
  }, [bundle, pdfBundle, pdfNomeFallback, persistPedidoBeforePdf])

  async function handleSavePedidoFields() {
    if (!bundle || !isGestor) return
    setActionError(null)
    setActionBanner(null)
    setSavingPedido(true)
    try {
      if (!validatePedidoFields()) {
        setActionError('Preencha os dados obrigatórios do pedido.')
        return
      }
      const prazo = normalizePrazoDias(prazoDias)
      const pedidoRes = await updatePedidoFields({
        simulationId: bundle.simulation.id,
        fazenda: fazenda.trim(),
        pedidoMunicipio: pedidoMunicipio.trim(),
        pedidoUf,
        prazoDias: prazo,
      })
      if (!pedidoRes.ok) {
        setActionError(pedidoRes.error)
        return
      }
      setBundle((prev) =>
        prev
          ? {
              ...prev,
              simulation: {
                ...prev.simulation,
                fazenda: fazenda.trim(),
                pedido_municipio: pedidoMunicipio.trim(),
                pedido_uf: pedidoUf,
                prazo_dias: prazo,
                gestor_alteracao_em: new Date().toISOString(),
                gestor_alteracao_resumo: 'Dados do pedido atualizados',
              },
            }
          : prev,
      )
      setActionBanner('Dados do pedido salvos.')
    } finally {
      setSavingPedido(false)
    }
  }

  if (loadState === 'loading' || loadState === 'idle') {
    return (
      <div className="w-full py-16 text-center text-slate-600">
        Carregando dados do pedido…
      </div>
    )
  }

  if (loadState === 'error' || !bundle) {
    return (
      <div className="w-full py-8">
        <PageBackLink to="/pedidos">Voltar para pedidos</PageBackLink>
        <AlertMessage className="mt-4">
          {loadError ?? 'Pedido inválido.'}
        </AlertMessage>
      </div>
    )
  }

  // Consultor só acessa a tela do pedido depois da aprovação (converted).
  if (!isGestor && status !== 'converted') {
    return <Navigate to="/pedidos" replace />
  }

  if (!isPedidoStatus(bundle.simulation.status)) {
    return (
      <div className="w-full py-8">
        <PageBackLink to="/simulacoes">Voltar para simulações</PageBackLink>
        <AlertMessage className="mt-4">
          Esta simulação ainda não foi convertida em pedido. Status atual:{' '}
          {statusLabelPt(bundle.simulation.status)}
        </AlertMessage>
      </div>
    )
  }

  return (
    <div className="w-full py-2">
      <PageBackLink to={backTo}>{backLabel}</PageBackLink>

      <PageHeader
        eyebrow="Pedido"
        title={isGestor ? 'Pedido' : 'Proposta comercial'}
        description={
          isGestor
            ? 'Revise a simulação fechada e preencha os dados do pedido.'
            : 'Informe fazenda, município, estado e prazo antes de gerar o documento.'
        }
        actions={
          status ? (
            <span
              className={[
                'inline-flex rounded-full px-3 py-1 text-sm font-semibold',
                statusBadgeClass(status),
              ].join(' ')}
            >
              {statusLabelPt(status)}
            </span>
          ) : null
        }
        className="mb-6"
      />

      {actionError ? <AlertMessage className="mb-4">{actionError}</AlertMessage> : null}
      {actionBanner ? (
        <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900">
          {actionBanner}
        </div>
      ) : null}

      {isGestor ? (
        <AtribuirConsultorPanel
          className="mb-6"
          simulationId={simulationId}
          currentUserId={bundle.simulation.user_id}
          currentVendedorNome={bundle.vendedorNome}
          onAssigned={handleConsultorAssigned}
        />
      ) : null}

      {isGestor ? <PedidoSimulationSummary bundle={bundle} /> : null}

      {pdfBundle ? <PedidoCotacaoMensagem bundle={pdfBundle} /> : null}

      <Card className="mb-6 rounded-3xl">
        <h2 className="mb-4 text-sm font-semibold text-primary-800">
          Dados do pedido
        </h2>
        <div className="grid gap-6 sm:grid-cols-2">
          <Input
            label="Fazenda"
            placeholder="Nome da fazenda"
            value={fazenda}
            onChange={(e) => {
              setFazenda(e.target.value)
              clearFieldError('fazenda')
            }}
            error={fieldErrors.fazenda}
            required
            disabled={!canEditPedido}
          />
          <Select
            label="Estado"
            placeholder="Selecione…"
            value={pedidoUf}
            onChange={(e) => {
              setPedidoUf(e.target.value)
              clearFieldError('pedidoUf')
            }}
            options={STATES}
            error={fieldErrors.pedidoUf}
            required
            disabled={!canEditPedido}
          />
          <Select
            label="Município"
            placeholder={
              municipiosLoading
                ? 'Carregando municípios…'
                : 'Buscar município…'
            }
            value={municipioSelectValue}
            onChange={(e) => {
              const raw = e.target.value
              const [nome, ufFromCity] = String(raw).split('|')
              setPedidoMunicipio((nome || raw).trim())
              if (ESTADO_UF_VALUES.includes(ufFromCity)) {
                setPedidoUf(ufFromCity)
                clearFieldError('pedidoUf')
              }
              clearFieldError('pedidoMunicipio')
            }}
            options={municipioSelectOptions}
            searchable
            searchPlaceholder="Digite o nome da cidade…"
            disabled={municipiosLoading || !canEditPedido}
            error={fieldErrors.pedidoMunicipio || municipiosError}
            required
          />
          {isGestor && canEditPedido ? (
            <Select
              label="Prazo de entrega"
              value={String(prazoDias)}
              onChange={(e) => {
                setPrazoDias(normalizePrazoDias(e.target.value))
                clearFieldError('prazoDias')
              }}
              options={PRAZO_OPTIONS}
              error={fieldErrors.prazoDias}
            />
          ) : (
            <Input
              label="Prazo de entrega"
              value={`${normalizePrazoDias(prazoDias)} dias`}
              disabled
              readOnly
            />
          )}
        </div>
      </Card>

      <div className="mt-6 flex w-full flex-col gap-2">
        {canEditPedido ? (
          <Button
            type="button"
            variant="primary"
            className="w-full"
            loading={savingPedido || generatingPdf}
            disabled={savingPedido || generatingPdf || Boolean(deciding)}
            onClick={() => void handleGerarPdf()}
          >
            {savingPedido
              ? 'Salvando…'
              : generatingPdf
                ? 'Gerando PDF…'
                : 'Baixar Proposta p/ Cliente'}
          </Button>
        ) : null}
        {isGestor && canEditPedido ? (
          <Button
            type="button"
            variant="secondary"
            className="w-full"
            loading={savingPedido}
            disabled={savingPedido || Boolean(deciding)}
            onClick={() => void handleSavePedidoFields()}
          >
            {savingPedido ? 'Salvando…' : 'Salvar dados do pedido'}
          </Button>
        ) : null}
        {canCancelPedido ? (
          <Button
            type="button"
            variant="secondary"
            className="w-full"
            loading={deciding === 'cancel'}
            disabled={Boolean(deciding) || savingPedido || generatingPdf}
            onClick={() => void handleCancelOrder()}
          >
            Cancelar pedido
          </Button>
        ) : null}
      </div>
    </div>
  )
}

function formatDocSuffix(id) {
  const digits = String(id).replace(/\D/g, '')
  if (digits.length >= 5) return digits.slice(-5)
  return String(id).slice(0, 8)
}
