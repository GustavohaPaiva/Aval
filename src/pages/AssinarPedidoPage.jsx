import { createElement, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { SignaturePad } from '../components/assinatura/SignaturePad'
import { PedidoPdfDocument } from '../components/pedido/PedidoPdfDocument'
import { BrandLogoFull } from '../components/brand/BrandLogo'
import { AlertMessage } from '../components/ui/AlertMessage'
import { Button } from '../components/ui/Button'
import { FormattedInput } from '../components/ui/FormattedInput'
import { Input } from '../components/ui/Input'
import { useAbortableAsync } from '../hooks/useAbortableAsync'
import { buildPdfBlobFromReactNode } from '../services/renderReactPdf'
import {
  concluirAssinaturaPublica,
  obterAssinaturaPublica,
} from '../services/pedidoAssinaturaService'
import { validateCpf } from '../utils/dataFormatters'

export function AssinarPedidoPage() {
  const { token } = useParams()
  const padRef = useRef(null)

  const [loadState, setLoadState] = useState('loading')
  const [loadError, setLoadError] = useState(null)
  const [payload, setPayload] = useState(null)

  const [nome, setNome] = useState('')
  const [cpf, setCpf] = useState('')
  const [hasInk, setHasInk] = useState(false)
  const [fieldError, setFieldError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [doneUrl, setDoneUrl] = useState(null)

  useAbortableAsync(
    async (_signal, isActive) => {
      setLoadState('loading')
      setLoadError(null)
      const res = await obterAssinaturaPublica(String(token ?? ''))
      if (!isActive()) return
      if (!res.ok) {
        setLoadState('error')
        setLoadError(res.error || 'Link inválido.')
        setPayload(res)
        return
      }
      setPayload(res.data)
      setLoadState('ready')
      if (res.data?.status === 'signed' && res.data?.pdf_url) {
        setDoneUrl(res.data.pdf_url)
      }
    },
    [token],
  )

  async function handleSubmit(e) {
    e.preventDefault()
    setFieldError(null)

    const nomeTrim = nome.trim()
    if (nomeTrim.length < 3) {
      setFieldError('Informe o nome completo.')
      return
    }
    const cpfCheck = validateCpf(cpf, { required: true })
    if (!cpfCheck.ok) {
      setFieldError(cpfCheck.message)
      return
    }
    if (!padRef.current?.hasInk()) {
      setFieldError('Desenhe sua assinatura na área indicada.')
      return
    }

    const snapshot = payload?.pedido_snapshot
    if (!snapshot?.simulation || !snapshot?.client || !snapshot?.items) {
      setFieldError('Dados do pedido indisponíveis para assinar.')
      return
    }

    setSubmitting(true)
    try {
      const imageDataUrl = padRef.current.toDataUrl()
      const signaturePngBlob = await padRef.current.toPngBlob()
      if (!imageDataUrl || !signaturePngBlob) {
        setFieldError('Não foi possível capturar a assinatura.')
        return
      }

      const signedPdfBlob = await buildPdfBlobFromReactNode(
        createElement(PedidoPdfDocument, {
          bundle: snapshot,
          vendedorNome: snapshot.vendedorNome,
          assinaturaComprador: {
            imageDataUrl,
            nome: nomeTrim,
            cpf: cpfCheck.value,
          },
        }),
      )

      const res = await concluirAssinaturaPublica({
        token: String(token ?? ''),
        signerName: nomeTrim,
        signerCpf: cpfCheck.value,
        signaturePngBlob,
        signedPdfBlob,
      })

      if (!res.ok) {
        setFieldError(res.error)
        return
      }

      setDoneUrl(res.data?.pdf_url || payload?.pdf_url || null)
      setPayload((prev) =>
        prev
          ? {
              ...prev,
              status: 'signed',
              signer_name: nomeTrim,
              pdf_url: res.data?.pdf_url || prev.pdf_url,
            }
          : prev,
      )
    } catch (err) {
      setFieldError(
        err instanceof Error ? err.message : 'Falha ao assinar o pedido.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  if (loadState === 'loading') {
    return (
      <PublicShell>
        <p className="text-center text-slate-600">Carregando documento…</p>
      </PublicShell>
    )
  }

  if (loadState === 'error' || !payload) {
    return (
      <PublicShell>
        <AlertMessage>
          {loadError || payload?.erro || 'Link inválido ou indisponível.'}
        </AlertMessage>
      </PublicShell>
    )
  }

  if (payload.status && payload.status !== 'pending' && payload.status !== 'signed') {
    return (
      <PublicShell>
        <AlertMessage>
          {payload.erro || 'Este link não está mais disponível.'}
        </AlertMessage>
      </PublicShell>
    )
  }

  if (payload.status === 'signed' || doneUrl) {
    return (
      <PublicShell>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900">
          Pedido assinado
          {payload.signer_name ? ` por ${payload.signer_name}` : ''}.
        </div>
        {doneUrl || payload.pdf_url ? (
          <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <iframe
              title="Pedido assinado"
              src={doneUrl || payload.pdf_url}
              className="h-[70vh] w-full"
            />
          </div>
        ) : null}
      </PublicShell>
    )
  }

  return (
    <PublicShell>
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-slate-900">
          Assinatura do pedido
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          {payload.client_nome
            ? `Documento para ${payload.client_nome}.`
            : 'Revise o documento e assine abaixo.'}
        </p>
      </div>

      {payload.pdf_url ? (
        <div className="mb-6 overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <iframe
            title="Pedido de venda"
            src={payload.pdf_url}
            className="h-[55vh] w-full"
          />
        </div>
      ) : null}

      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
        <Input
          label="Nome completo"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          required
          autoComplete="name"
          disabled={submitting}
        />
        <FormattedInput
          format="cpfCnpj"
          label="CPF"
          value={cpf}
          onChange={(e) => setCpf(e.target.value)}
          required
          disabled={submitting}
        />
        <div>
          <p className="mb-1.5 text-sm font-medium text-slate-700">
            Assinatura
          </p>
          <SignaturePad
            ref={padRef}
            disabled={submitting}
            onChange={setHasInk}
          />
        </div>

        {fieldError ? <AlertMessage>{fieldError}</AlertMessage> : null}

        <Button
          type="submit"
          variant="primary"
          className="w-full"
          loading={submitting}
          disabled={submitting || !hasInk}
        >
          {submitting ? 'Assinando…' : 'Confirmar assinatura'}
        </Button>
        <p className="text-center text-xs text-slate-500">
          Ao confirmar, seu nome e CPF serão aplicados ao documento junto com a
          assinatura.
        </p>
      </form>
    </PublicShell>
  )
}

function PublicShell({ children }) {
  return (
    <div className="min-h-dvh bg-linear-to-b from-emerald-50 via-white to-slate-50">
      <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-4 py-6 sm:px-6">
        <header className="mb-6 flex items-center justify-center">
          <BrandLogoFull className="h-10 w-auto" />
        </header>
        <main className="flex-1">{children}</main>
        <footer className="mt-8 text-center text-xs text-slate-400">
          Ambiente exclusivo para assinatura do pedido · SYAGRI
        </footer>
      </div>
    </div>
  )
}
