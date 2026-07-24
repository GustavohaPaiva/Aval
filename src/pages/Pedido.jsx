import { useCallback, useEffect, useRef, useState } from 'react'
import { PedidoPdfDocument } from '../components/pedido/PedidoPdfDocument'
import { PdfPreviewModal } from '../components/pdf/PdfPreviewModal'
import { AlertMessage } from '../components/ui/AlertMessage'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { FormattedInput } from '../components/ui/FormattedInput'
import { Input } from '../components/ui/Input'
import { PageBackLink } from '../components/ui/PageBackLink'
import { PageHeader } from '../components/ui/PageHeader'
import { useSyncPageLoading } from '../contexts/PageLoadingContext'
import { useAbortableAsync } from '../hooks/useAbortableAsync'
import {
  fetchSimulationOrderBundle,
  updateClientDeliveryFields,
  updateSimulationStatus,
} from '../services/simulationOrderService'
import { fetchViaCepAddress } from '../services/viaCep'
import { parseCepInput } from '../utils/dataFormatters'

export function Pedido({ simulationId }) {
  const printRef = useRef(null)
  const [loadState, setLoadState] = useState('idle')
  const [loadError, setLoadError] = useState(null)
  const [bundle, setBundle] = useState(null)

  useSyncPageLoading(loadState === 'loading' || loadState === 'idle')

  const [cep, setCep] = useState('')
  const [logradouro, setLogradouro] = useState('')
  const [bairro, setBairro] = useState('')
  const [municipio, setMunicipio] = useState('')
  const [uf, setUf] = useState('')
  const [complemento, setComplemento] = useState('')

  const [cepLookupLoading, setCepLookupLoading] = useState(false)
  const [cepLookupError, setCepLookupError] = useState(null)

  const [pdfPreview, setPdfPreview] = useState(null)
  const [convertLoading, setConvertLoading] = useState(false)
  const [actionError, setActionError] = useState(null)

  const isConverted = bundle?.simulation.status === 'converted'
  const isApproved = bundle?.simulation.status === 'approved'
  const isCif = bundle?.simulation.tipo_frete === 'CIF'
  const formLocked = isConverted

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
      const c = res.data.client
      setCep(parseCepInput(c.cep ?? ''))
      setLogradouro(c.logradouro ?? '')
      setBairro(c.bairro ?? '')
      setMunicipio(c.municipio ?? '')
      setUf(c.uf ?? '')
      setLoadState('ready')
    },
    [simulationId],
  )

  const lookupCep = useCallback(
    async (digits) => {
      if (formLocked || !isCif || digits.length !== 8) return
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
    [formLocked, isCif],
  )

  useEffect(() => {
    if (formLocked || !isCif) return
    const digits = parseCepInput(cep)
    if (digits.length !== 8) return

    const handle = window.setTimeout(() => {
      void lookupCep(digits)
    }, 450)
    return () => window.clearTimeout(handle)
  }, [cep, formLocked, isCif, lookupCep])

  const cepDigits = parseCepInput(cep)
  const displayedCepLookupError =
    isCif && cepDigits.length === 8 ? cepLookupError : null

  const pdfBundle =
    bundle && isCif
      ? {
          ...bundle,
          client: {
            ...bundle.client,
            cep: parseCepInput(cep) || null,
            logradouro: logradouro.trim() || null,
            bairro: bairro.trim() || null,
            municipio: municipio.trim() || null,
            uf: uf.trim().toUpperCase().slice(0, 2) || null,
          },
        }
      : bundle

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
    setPdfPreview({
      titulo: 'Proposta comercial',
      gerador: gerarPdfPedido,
      nomeFallback: pdfNomeFallback,
    })

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
  }, [
    bairro,
    bundle,
    cep,
    gerarPdfPedido,
    isCif,
    logradouro,
    municipio,
    pdfNomeFallback,
    uf,
  ])

  const handleMarcarConvertida = useCallback(async () => {
    if (!bundle || bundle.simulation.status !== 'approved') return

    setActionError(null)
    setConvertLoading(true)
    try {
      const st = await updateSimulationStatus(bundle.simulation.id, 'converted')
      if (!st.ok) {
        setActionError(st.error)
        return
      }
      setBundle((prev) =>
        prev
          ? {
              ...prev,
              simulation: { ...prev.simulation, status: 'converted' },
            }
          : prev,
      )
    } finally {
      setConvertLoading(false)
    }
  }, [bundle])

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
        <PageBackLink to="/simulacoes">Voltar para simulações</PageBackLink>
        <AlertMessage className="mt-4">
          {loadError ?? 'Simulação inválida.'}
        </AlertMessage>
      </div>
    )
  }

  if (bundle.simulation.status !== 'approved' && bundle.simulation.status !== 'converted') {
    return (
      <div className="w-full py-8">
        <PageBackLink to="/simulacoes">Voltar para simulações</PageBackLink>
        <AlertMessage className="mt-4">
          Apenas simulações aprovadas podem ser visualizadas como pedido. Status
          atual: {bundle.simulation.status}
        </AlertMessage>
      </div>
    )
  }

  return (
    <div className="w-full py-2">
      <PageBackLink to="/simulacoes">Voltar para simulações</PageBackLink>

      <PageHeader
        eyebrow="Aval"
        title="Proposta comercial"
        description="Documento para envio ao cliente com base nesta simulação."
        actions={
          isConverted ? (
            <span className="inline-flex rounded-full bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-800 ring-1 ring-emerald-200">
              Convertido
            </span>
          ) : (
            <span className="inline-flex rounded-full bg-primary-50 px-3 py-1 text-sm font-semibold text-primary-800 ring-1 ring-primary-200">
              Aprovado
            </span>
          )
        }
        className="mb-6"
      />

      {actionError ? <AlertMessage className="mb-4">{actionError}</AlertMessage> : null}

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
                disabled={formLocked}
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
              disabled={formLocked}
            />
            <Input
              label="Logradouro"
              value={logradouro}
              onChange={(e) => setLogradouro(e.target.value)}
              disabled={formLocked}
            />
            <Input
              label="Bairro"
              value={bairro}
              onChange={(e) => setBairro(e.target.value)}
              disabled={formLocked}
            />
            <Input
              label="Município"
              value={municipio}
              onChange={(e) => setMunicipio(e.target.value)}
              disabled={formLocked}
            />
            <Input
              label="UF"
              value={uf}
              maxLength={2}
              onChange={(e) => setUf(e.target.value.toUpperCase().slice(0, 2))}
              disabled={formLocked}
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
          onClick={() => void handleGerarPdf()}
        >
          Gerar PDF para o cliente
        </Button>
        {isApproved ? (
          <Button
            type="button"
            variant="secondary"
            className="w-full"
            loading={convertLoading}
            onClick={() => void handleMarcarConvertida()}
          >
            Marcar como convertida
          </Button>
        ) : null}
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
