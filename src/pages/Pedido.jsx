import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PedidoPdfDocument } from '../components/pedido/PedidoPdfDocument'
import { PdfPreviewModal } from '../components/pdf/PdfPreviewModal'
import { AlertMessage } from '../components/ui/AlertMessage'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { FormattedInput } from '../components/ui/FormattedInput'
import { Input } from '../components/ui/Input'
import { PageBackLink } from '../components/ui/PageBackLink'
import { PageHeader } from '../components/ui/PageHeader'
import { Select } from '../components/ui/Select'
import {
  PRAZO_DIAS_DEFAULT,
  PRAZO_OPTIONS,
  STATES,
  normalizePrazoDias,
} from '../constants/simulator'
import { useAuth } from '../hooks/useAuth'
import { useSyncPageLoading } from '../contexts/PageLoadingContext'
import { useAbortableAsync } from '../hooks/useAbortableAsync'
import { fetchMunicipiosBrasil } from '../services/ibgeLocalidades'
import {
  fetchSimulationOrderBundle,
  updateClientDeliveryFields,
  updatePedidoFields,
} from '../services/simulationOrderService'
import { fetchViaCepAddress } from '../services/viaCep'
import { parseCepInput } from '../utils/dataFormatters'

export function Pedido({ simulationId }) {
  const printRef = useRef(null)
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

  const [cep, setCep] = useState('')
  const [logradouro, setLogradouro] = useState('')
  const [bairro, setBairro] = useState('')
  const [municipio, setMunicipio] = useState('')
  const [uf, setUf] = useState('')
  const [complemento, setComplemento] = useState('')

  const [cepLookupLoading, setCepLookupLoading] = useState(false)
  const [cepLookupError, setCepLookupError] = useState(null)

  const [pdfPreview, setPdfPreview] = useState(null)
  const [actionError, setActionError] = useState(null)
  const [savingPedido, setSavingPedido] = useState(false)

  const isConverted = bundle?.simulation.status === 'converted'
  const isApproved = bundle?.simulation.status === 'approved'
  const isCif = bundle?.simulation.tipo_frete === 'CIF'
  const backTo = isConverted ? '/pedidos' : '/simulacoes'
  const backLabel = isConverted ? 'Voltar para pedidos' : 'Voltar para simulações'

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
      const c = res.data.client
      setFazenda(sim.fazenda ?? '')
      setPedidoMunicipio(sim.pedido_municipio ?? '')
      setPedidoUf(sim.pedido_uf ?? '')
      setPrazoDias(normalizePrazoDias(sim.prazo_dias))
      setCep(parseCepInput(c.cep ?? ''))
      setLogradouro(c.logradouro ?? '')
      setBairro(c.bairro ?? '')
      setMunicipio(c.municipio ?? '')
      setUf(c.uf ?? '')
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

  const lookupCep = useCallback(
    async (digits) => {
      if (!isCif || digits.length !== 8) return
      setCepLookupLoading(true)
      setCepLookupError(null)
      const res = await fetchViaCepAddress(digits)
      setCepLookupLoading(false)
      if (!res.ok) {
        setCepLookupError(res.error)
        return
      }
      setLogradouro(res.data.logradouro)
      setBairro(res.data.bairro)
      setMunicipio(res.data.municipio)
      setUf(res.data.uf)
    },
    [isCif],
  )

  useEffect(() => {
    if (!isCif) return
    const digits = parseCepInput(cep)
    if (digits.length !== 8) return

    const handle = window.setTimeout(() => {
      void lookupCep(digits)
    }, 450)
    return () => window.clearTimeout(handle)
  }, [cep, isCif, lookupCep])

  const cepDigits = parseCepInput(cep)
  const displayedCepLookupError =
    isCif && cepDigits.length === 8 ? cepLookupError : null

  function clearFieldError(key) {
    setFieldErrors((prev) => {
      if (!prev[key]) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  function validatePedidoFields() {
    /** @type {Record<string, string>} */
    const errors = {}
    if (!fazenda.trim()) {
      errors.fazenda = 'Informe o nome da fazenda.'
    }
    if (!pedidoMunicipio.trim()) {
      errors.pedidoMunicipio = 'Selecione o município.'
    }
    if (!['MG', 'SP'].includes(pedidoUf)) {
      errors.pedidoUf = 'Selecione o estado (MG ou SP).'
    }
    const prazo = normalizePrazoDias(prazoDias)
    if (![7, 14, 21].includes(prazo)) {
      errors.prazoDias = 'Prazo inválido.'
    }
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  const pdfBundle =
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
          client: isCif
            ? {
                ...bundle.client,
                cep: parseCepInput(cep) || null,
                logradouro: logradouro.trim() || null,
                bairro: bairro.trim() || null,
                municipio: municipio.trim() || null,
                uf: uf.trim().toUpperCase().slice(0, 2) || null,
              }
            : bundle.client,
        }
      : null

  const pdfNomeFallback = pdfBundle
    ? `proposta-syagri-${formatDocSuffix(pdfBundle.simulation.id)}-${(pdfBundle.client.nome || 'cliente')
        .replace(/[^\w-]+/g, '_')
        .slice(0, 40)}.pdf`
    : 'proposta-syagri.pdf'

  const gerarPdfPedido = useCallback(async () => {
    if (!printRef.current) {
      throw new Error('Documento não disponível para geração.')
    }
    const { buildPedidoPdfBlobFromElement } = await import(
      '../services/pedidoPdf'
    )
    const blob = await buildPedidoPdfBlobFromElement(printRef.current)
    return { blob, nomePadrao: pdfNomeFallback }
  }, [pdfNomeFallback])

  const handleGerarPdf = useCallback(async () => {
    if (!bundle || !printRef.current) return

    setActionError(null)

    if (!validatePedidoFields()) {
      setActionError('Preencha os dados obrigatórios do pedido antes de gerar o PDF.')
      return
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
            },
          }
        : prev,
    )
    setPrazoDias(prazo)

    if (isCif) {
      const addr = await updateClientDeliveryFields({
        clientId: bundle.client.id,
        cep: parseCepInput(cep) || null,
        logradouro: logradouro.trim() || null,
        bairro: bairro.trim() || null,
        municipio: municipio.trim() || null,
        uf: uf.trim().toUpperCase().slice(0, 2) || null,
      })
      if (!addr.ok) {
        setSavingPedido(false)
        setActionError(addr.error)
        return
      }
      setBundle((prev) =>
        prev
          ? {
              ...prev,
              client: {
                ...prev.client,
                cep: parseCepInput(cep) || null,
                logradouro: logradouro.trim() || null,
                bairro: bairro.trim() || null,
                municipio: municipio.trim() || null,
                uf: uf.trim().toUpperCase().slice(0, 2) || null,
              },
            }
          : prev,
      )
    }

    setSavingPedido(false)
    setPdfPreview({
      titulo: 'Proposta comercial',
      gerador: gerarPdfPedido,
      nomeFallback: pdfNomeFallback,
    })
  }, [
    bairro,
    bundle,
    cep,
    fazenda,
    gerarPdfPedido,
    isCif,
    isGestor,
    logradouro,
    municipio,
    pdfNomeFallback,
    pedidoMunicipio,
    pedidoUf,
    prazoDias,
    uf,
  ])

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

  if (bundle.simulation.status !== 'approved' && bundle.simulation.status !== 'converted') {
    return (
      <div className="w-full py-8">
        <PageBackLink to="/simulacoes">Voltar para simulações</PageBackLink>
        <AlertMessage className="mt-4">
          Apenas simulações aprovadas ou convertidas podem ser visualizadas como
          pedido. Status atual: {bundle.simulation.status}
        </AlertMessage>
      </div>
    )
  }

  return (
    <div className="w-full py-2">
      <PageBackLink to={backTo}>{backLabel}</PageBackLink>

      <PageHeader
        eyebrow="Pedido"
        title="Proposta comercial"
        description="Informe fazenda, município, estado e prazo antes de gerar o documento."
        actions={
          isConverted ? (
            <span className="inline-flex rounded-full bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-800 ring-1 ring-emerald-200">
              Convertido
            </span>
          ) : isApproved ? (
            <span className="inline-flex rounded-full bg-primary-50 px-3 py-1 text-sm font-semibold text-primary-800 ring-1 ring-primary-200">
              Aprovado
            </span>
          ) : null
        }
        className="mb-6"
      />

      {actionError ? <AlertMessage className="mb-4">{actionError}</AlertMessage> : null}

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
              if (['MG', 'SP'].includes(ufFromCity)) {
                setPedidoUf(ufFromCity)
                clearFieldError('pedidoUf')
              }
              clearFieldError('pedidoMunicipio')
            }}
            options={municipioSelectOptions}
            searchable
            searchPlaceholder="Digite o nome da cidade…"
            disabled={municipiosLoading}
            error={fieldErrors.pedidoMunicipio || municipiosError}
            required
          />
          {isGestor ? (
            <Select
              label="Prazo"
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
              label="Prazo"
              value={`${normalizePrazoDias(prazoDias)} dias`}
              disabled
              readOnly
            />
          )}
        </div>
      </Card>

      {isCif ? (
        <Card className="mb-6 rounded-3xl">
          <h2 className="mb-4 text-sm font-semibold text-primary-800">
            Endereço de entrega (CIF)
          </h2>
          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <FormattedInput
                format="cep"
                label="CEP"
                placeholder="00000-000"
                value={cep}
                onChange={(e) => setCep(e.target.value)}
                className="finance-text"
              />
              {cepLookupLoading ? (
                <p className="mt-2 text-xs text-slate-500">Consultando ViaCEP…</p>
              ) : null}
              {displayedCepLookupError ? (
                <p className="mt-2 text-xs font-medium text-feedback-error">
                  {displayedCepLookupError}
                </p>
              ) : null}
            </div>
            <Input
              label="Complemento (opcional)"
              value={complemento}
              onChange={(e) => setComplemento(e.target.value)}
            />
            <Input
              label="Logradouro"
              value={logradouro}
              onChange={(e) => setLogradouro(e.target.value)}
            />
            <Input
              label="Bairro"
              value={bairro}
              onChange={(e) => setBairro(e.target.value)}
            />
          </div>
        </Card>
      ) : null}

      <div className="overflow-x-auto rounded-3xl border border-slate-200/80 bg-slate-100/60 p-3 shadow-sm sm:p-5">
        <div className="mx-auto w-fit shadow-xl shadow-slate-900/10">
          {pdfBundle ? (
            <PedidoPdfDocument
              bundle={pdfBundle}
              vendedorNome={bundle.vendedorNome}
              delivery={{ complemento }}
            />
          ) : null}
        </div>
      </div>

      {/* Nó fora da tela, em escala 1:1, só para captura do PDF */}
      <div
        aria-hidden
        className="pointer-events-none fixed left-[-10000px] top-0 z-[-1] overflow-hidden"
      >
        <div ref={printRef}>
          {pdfBundle ? (
            <PedidoPdfDocument
              bundle={pdfBundle}
              vendedorNome={bundle.vendedorNome}
              delivery={{ complemento }}
            />
          ) : null}
        </div>
      </div>

      <div className="mt-6 flex w-full flex-col gap-2">
        <Button
          type="button"
          variant="primary"
          className="w-full"
          disabled={savingPedido}
          onClick={() => void handleGerarPdf()}
        >
          {savingPedido ? 'Salvando…' : 'Gerar PDF para o cliente'}
        </Button>
      </div>

      <PdfPreviewModal
        open={Boolean(pdfPreview)}
        onClose={() => setPdfPreview(null)}
        titulo={pdfPreview?.titulo}
        gerador={pdfPreview?.gerador}
        nomeFallback={pdfPreview?.nomeFallback}
      />
    </div>
  )
}

function formatDocSuffix(id) {
  const digits = String(id).replace(/\D/g, '')
  if (digits.length >= 5) return digits.slice(-5)
  return String(id).slice(0, 8)
}
