import { createElement, useCallback, useState } from 'react'
import { useParams } from 'react-router-dom'
import { ComprasSubnav } from '../../components/compras/ComprasSubnav'
import { OcPdfDocument } from '../../components/compras/OcPdfDocument'
import { AlertMessage } from '../../components/ui/AlertMessage'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { DatePicker } from '../../components/ui/DatePicker'
import { Input } from '../../components/ui/Input'
import { Modal } from '../../components/ui/Modal'
import { ModalFormFooter } from '../../components/ui/ModalFormFooter'
import { PageBackLink } from '../../components/ui/PageBackLink'
import { PageHeader } from '../../components/ui/PageHeader'
import { PdfPreviewModal } from '../../components/pdf/PdfPreviewModal'
import { Select } from '../../components/ui/Select'
import {
  EMBALAGEM_OPTIONS,
  PLANTA_OPTIONS,
  TIPO_ENTREGA_OPTIONS,
  UNIDADE_OPTIONS,
  compraStatusBadgeClass,
  compraStatusLabel,
  filialOptions,
} from '../../constants/compras'
import { useSyncPageLoading } from '../../contexts/PageLoadingContext'
import { useAbortableAsync } from '../../hooks/useAbortableAsync'
import { buildPdfBlobFromReactNode } from '../../services/renderReactPdf'
import {
  cancelarOrdemCompra,
  confirmarOrdemCompra,
  deleteCompraItem,
  fetchCompraBundle,
  fetchProdutosPorFornecedor,
  insertCompraItem,
  marcarPdfGerado,
  receberCompraItem,
  updateCompraCabecalho,
  updateCompraItem,
} from '../../services/comprasService'
import { formatOcMensagem } from '../../utils/formatOcMensagem'
import {
  formatQtyBoth,
  formatUsd,
  parseQtyInput,
} from '../../utils/comprasUnits'
import { formatBRL } from '../../utils/money'

export function ComprasOrdemDetalhePage() {
  const { compraId } = useParams()
  const [bundle, setBundle] = useState(null)
  const [loadState, setLoadState] = useState('idle')
  const [error, setError] = useState(null)
  const [banner, setBanner] = useState(null)
  const [saving, setSaving] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [pdfPreview, setPdfPreview] = useState(null)
  const [copied, setCopied] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [receiveItem, setReceiveItem] = useState(null)

  const [filial, setFilial] = useState('uberaba')
  const [planta, setPlanta] = useState('')
  const [tipoEntrega, setTipoEntrega] = useState('')
  const [cidade, setCidade] = useState('Uberaba')
  const [condicao, setCondicao] = useState('FAT. ANTECIPADO')
  const [dataDoc, setDataDoc] = useState('')
  const [obs, setObs] = useState('')

  useSyncPageLoading(loadState !== 'ready')

  useAbortableAsync(
    async (_s, isActive) => {
      setError(null)
      const keepUi = Boolean(bundle) && bundle.id === compraId
      if (!keepUi) setLoadState('loading')
      const res = await fetchCompraBundle(compraId)
      if (!isActive()) return
      if (!res.ok) {
        setLoadState('error')
        setError(res.error)
        setBundle(null)
        return
      }
      const c = res.data
      setBundle(c)
      setFilial(c.filial_site || 'uberaba')
      setPlanta(c.planta || '')
      setTipoEntrega(c.tipo_entrega || '')
      setCidade(c.cidade_retirada || 'Uberaba')
      setCondicao(c.condicao_pagamento || 'FAT. ANTECIPADO')
      setDataDoc(String(c.data_documento ?? '').slice(0, 10))
      setObs(c.observacoes || '')
      setLoadState('ready')
    },
    [compraId, reloadKey],
  )

  const canEdit = bundle && bundle.status !== 'cancelado'
  const canReceive =
    Boolean(canEdit) &&
    (bundle.status === 'confirmado' || bundle.status === 'recebido_parcial')
  const canConfirm =
    Boolean(canEdit) &&
    (bundle.status === 'rascunho' || bundle.status === 'enviado')
  const canCancel =
    Boolean(canEdit) &&
    (bundle.itens ?? []).every((item) => Number(item.volume_recebido_kg) <= 0)
  const mensagem = bundle ? formatOcMensagem(bundle, bundle.itens, bundle.fornecedorNome) : ''

  async function handleSaveHeader() {
    setSaving(true)
    setError(null)
    const res = await updateCompraCabecalho(compraId, {
      filial_site: filial,
      planta,
      tipo_entrega: tipoEntrega,
      cidade_retirada: cidade,
      condicao_pagamento: condicao,
      data_documento: dataDoc,
      observacoes: obs,
    })
    setSaving(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    setBanner('Cabeçalho salvo.')
    setReloadKey((k) => k + 1)
  }

  const handlePdf = useCallback(async () => {
    if (!bundle) return
    const snapshot = bundle
    setPdfPreview({
      titulo: `Pedido ${bundle.numero}`,
      gerador: async () => {
        const blob = await buildPdfBlobFromReactNode(
          createElement(OcPdfDocument, {
            compra: snapshot,
            itens: snapshot.itens,
            fornecedorNome: snapshot.fornecedorNome,
          }),
        )
        await marcarPdfGerado(snapshot.id)
        return { blob, nomePadrao: `${snapshot.numero}.pdf` }
      },
      nomeFallback: `${bundle.numero}.pdf`,
    })
  }, [bundle])

  async function handleCopy() {
    if (!mensagem) return
    await navigator.clipboard.writeText(mensagem)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  async function handleConfirmar() {
    if (!window.confirm('Marcar esta OC como confirmada pelo fornecedor?')) return
    setSaving(true)
    const res = await confirmarOrdemCompra(compraId)
    setSaving(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    setReloadKey((k) => k + 1)
  }

  async function handleCancelar() {
    if (!window.confirm('Cancelar esta ordem de compra?')) return
    setSaving(true)
    const res = await cancelarOrdemCompra(compraId)
    setSaving(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    setReloadKey((k) => k + 1)
  }

  async function handleDeleteItem(id) {
    if (!window.confirm('Remover este item?')) return
    const res = await deleteCompraItem(id)
    if (!res.ok) {
      setError(res.error)
      return
    }
    setReloadKey((k) => k + 1)
  }

  if (loadState === 'loading' || loadState === 'idle') {
    return <p className="py-16 text-center text-slate-600">Carregando ordem…</p>
  }
  if (loadState === 'error' || !bundle) {
    return (
      <div className="py-8">
        <PageBackLink to="/compras/ordens">Voltar</PageBackLink>
        <AlertMessage className="mt-4">{error ?? 'OC inválida.'}</AlertMessage>
      </div>
    )
  }

  return (
    <div className="w-full min-w-0 space-y-4 sm:space-y-6">
      <PageBackLink to="/compras/ordens">Voltar para pedidos de compra</PageBackLink>
      <ComprasSubnav />

      <PageHeader
        eyebrow="Ordem de compra"
        title={bundle.numero}
        description={bundle.fornecedorNome}
        actions={
          <span
            className={[
              'inline-flex rounded-full px-3 py-1 text-sm font-semibold',
              compraStatusBadgeClass(bundle.status),
            ].join(' ')}
          >
            {compraStatusLabel(bundle.status)}
          </span>
        }
      />

      {error ? <AlertMessage>{error}</AlertMessage> : null}
      {banner ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900">
          {banner}
        </div>
      ) : null}

      <Card>
        <h2 className="mb-4 text-sm font-semibold text-primary-800">Cabeçalho</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Filial Syagri"
            value={filial}
            onChange={(e) => setFilial(e.target.value)}
            options={filialOptions()}
            disabled={!canEdit}
          />
          <Select
            label="Planta"
            value={planta}
            onChange={(e) => setPlanta(e.target.value)}
            options={PLANTA_OPTIONS}
            disabled={!canEdit}
          />
          <Select
            label="Tipo de entrega"
            value={tipoEntrega}
            onChange={(e) => setTipoEntrega(e.target.value)}
            options={TIPO_ENTREGA_OPTIONS}
            disabled={!canEdit}
          />
          <Input
            label="Cidade / retirada"
            value={cidade}
            onChange={(e) => setCidade(e.target.value)}
            disabled={!canEdit}
          />
          <Input
            label="Condição de pagamento"
            value={condicao}
            onChange={(e) => setCondicao(e.target.value)}
            disabled={!canEdit}
          />
          <DatePicker
            label="Data do documento"
            value={dataDoc}
            onChange={(e) => setDataDoc(e.target.value)}
            disabled={!canEdit}
          />
          <div className="sm:col-span-2">
            <Input
              label="Observações"
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              disabled={!canEdit}
            />
          </div>
        </div>
        {canEdit ? (
          <Button className="mt-4 w-full" type="button" loading={saving} onClick={() => void handleSaveHeader()}>
            Salvar cabeçalho
          </Button>
        ) : null}
      </Card>

      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-primary-800">Itens</h2>
          {canEdit ? (
            <Button type="button" variant="secondary" className="w-full" onClick={() => setAddOpen(true)}>
              Adicionar item
            </Button>
          ) : null}
        </div>
        {bundle.itens.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhum item ainda.</p>
        ) : (
          <div className="space-y-4">
            {bundle.itens.map((item) => (
              <OcItemEditor
                key={item.id}
                item={item}
                canEdit={canEdit}
                canReceive={canReceive}
                onSaved={() => setReloadKey((k) => k + 1)}
                onDelete={() => void handleDeleteItem(item.id)}
                onReceive={() => setReceiveItem(item)}
              />
            ))}
          </div>
        )}
      </Card>

      <Card>
        <h2 className="mb-2 text-sm font-semibold text-primary-800">Mensagem (WhatsApp / e-mail)</h2>
        <textarea
          readOnly
          value={mensagem}
          rows={8}
          className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-sm"
        />
        <div className="mt-3 grid grid-cols-1 gap-2">
          <Button type="button" variant="secondary" className="w-full" onClick={() => void handleCopy()}>
            {copied ? 'Copiado!' : 'Copiar mensagem'}
          </Button>
          <Button type="button" className="w-full" onClick={() => void handlePdf()} disabled={!canEdit || bundle.itens.length === 0}>
            Gerar PDF
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="w-full"
            disabled={!canConfirm || saving}
            onClick={() => void handleConfirmar()}
          >
            Confirmar OC
          </Button>
          <Button
            type="button"
            variant="danger"
            className="w-full"
            disabled={!canCancel || saving}
            onClick={() => void handleCancelar()}
          >
            Cancelar OC
          </Button>
        </div>
      </Card>

      {addOpen ? (
        <ModalAddItem
          fornecedorId={bundle.fornecedor_id}
          onClose={() => setAddOpen(false)}
          onSave={async (payload) => {
            const res = await insertCompraItem(compraId, payload)
            if (!res.ok) return res
            setAddOpen(false)
            setReloadKey((k) => k + 1)
            return { ok: true }
          }}
        />
      ) : null}

      {receiveItem ? (
        <ModalReceber
          item={receiveItem}
          onClose={() => setReceiveItem(null)}
          onDone={() => {
            setReceiveItem(null)
            setReloadKey((k) => k + 1)
          }}
        />
      ) : null}

      <PdfPreviewModal
        open={Boolean(pdfPreview)}
        onClose={() => {
          setPdfPreview(null)
          setReloadKey((k) => k + 1)
        }}
        titulo={pdfPreview?.titulo}
        gerador={pdfPreview?.gerador}
        nomeFallback={pdfPreview?.nomeFallback}
      />
    </div>
  )
}

function OcItemEditor({ item, canEdit, canReceive, onSaved, onDelete, onReceive }) {
  const [preco, setPreco] = useState(item.preco_usd ?? '')
  const [desc, setDesc] = useState(item.desconto_usd ?? '')
  const [unitario, setUnitario] = useState(item.unitario_brl ?? '')
  const [frete, setFrete] = useState(item.frete ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const restoKg = Number(item.volume_kg) - Number(item.volume_recebido_kg)

  async function saveInternal() {
    setSaving(true)
    setError(null)
    const res = await updateCompraItem(item.id, {
      preco_usd: preco === '' ? null : Number(preco),
      desconto_usd: desc === '' ? null : Number(desc),
      unitario_brl: unitario === '' ? null : Number(unitario),
      frete: frete === '' ? null : Number(frete),
    })
    setSaving(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    onSaved()
  }

  return (
    <div className="rounded-2xl border border-slate-200 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-slate-900">{item.product?.displayNome || '—'}</p>
          <p className="text-sm text-slate-500">
            {item.embalagem} · pedido {formatQtyBoth(item.volume_kg)} · recebido{' '}
            {formatQtyBoth(item.volume_recebido_kg)}
          </p>
        </div>
        {canEdit ? (
          <div className="flex w-full flex-col gap-2">
            {canReceive && restoKg > 0.0001 ? (
              <Button type="button" variant="secondary" className="w-full" onClick={onReceive}>
                Receber
              </Button>
            ) : null}
            {Number(item.volume_recebido_kg) <= 0 ? (
              <Button type="button" variant="ghost" className="w-full" onClick={onDelete}>
                Remover
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
      {error ? <AlertMessage className="mt-3">{error}</AlertMessage> : null}
      <div className="mt-3 grid gap-3 sm:grid-cols-4">
        <Input label="USD" value={preco} onChange={(e) => setPreco(e.target.value)} disabled={!canEdit} />
        <Input label="Desconto USD" value={desc} onChange={(e) => setDesc(e.target.value)} disabled={!canEdit} />
        <Input
          label="Unitário R$ (interno)"
          value={unitario}
          onChange={(e) => setUnitario(e.target.value)}
          disabled={!canEdit}
        />
        <Input label="Frete (interno)" value={frete} onChange={(e) => setFrete(e.target.value)} disabled={!canEdit} />
      </div>
      <p className="mt-2 text-xs text-slate-500">
        PDF: USD {formatUsd(item.preco_usd)} · Interno: {formatBRL(Number(item.unitario_brl) || 0)} · saldo a receber{' '}
        {formatQtyBoth(restoKg)}
      </p>
      {canEdit ? (
        <Button type="button" variant="secondary" className="mt-3 w-full" loading={saving} onClick={() => void saveInternal()}>
          Salvar preços
        </Button>
      ) : null}
    </div>
  )
}

function ModalAddItem({ fornecedorId, onClose, onSave }) {
  const [produtos, setProdutos] = useState([])
  const [produtoId, setProdutoId] = useState('')
  const [embalagem, setEmbalagem] = useState('BIG BAG')
  const [unidade, setUnidade] = useState('t')
  const [qty, setQty] = useState('')
  const [cultura, setCultura] = useState('')
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  useAbortableAsync(async (_s, isActive) => {
    const res = await fetchProdutosPorFornecedor(fornecedorId)
    if (!isActive()) return
    if (res.ok) {
      setProdutos(res.rows)
      setProdutoId(res.rows[0]?.id ?? '')
    }
  }, [fornecedorId])

  async function handleSubmit(e) {
    e.preventDefault()
    const parsed = parseQtyInput(qty, unidade)
    if (!parsed.ok) {
      setError(parsed.error)
      return
    }
    const product = produtos.find((p) => p.id === produtoId)
    setSaving(true)
    const res = await onSave({
      produto_oficial_id: produtoId,
      embalagem,
      volume_kg: parsed.kg,
      unidade_exibicao: unidade,
      cultura,
      preco_usd: product?.preco_original ?? null,
      desconto_usd: product?.desconto_usd ?? null,
      vencimento_lista: product?.vencimento_lista ?? null,
    })
    setSaving(false)
    if (!res.ok) setError(res.error)
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Adicionar item"
      footer={
        <ModalFormFooter formId="add-item" submitLabel="Adicionar" loading={saving} onCancel={onClose} />
      }
    >
      {error ? <AlertMessage className="mb-4">{error}</AlertMessage> : null}
      <form id="add-item" className="grid gap-4" onSubmit={(e) => void handleSubmit(e)}>
        <Select
          label="Produto"
          value={produtoId}
          onChange={(e) => setProdutoId(e.target.value)}
          options={produtos.map((p) => ({ value: p.id, label: p.displayNome }))}
        />
        <Select
          label="Embalagem"
          value={embalagem}
          onChange={(e) => setEmbalagem(e.target.value)}
          options={EMBALAGEM_OPTIONS}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Unidade"
            value={unidade}
            onChange={(e) => setUnidade(e.target.value)}
            options={UNIDADE_OPTIONS}
          />
          <Input label="Quantidade" value={qty} onChange={(e) => setQty(e.target.value)} required />
        </div>
        <Input label="Cultura" value={cultura} onChange={(e) => setCultura(e.target.value)} />
      </form>
    </Modal>
  )
}

function ModalReceber({ item, onClose, onDone }) {
  const [unidade, setUnidade] = useState(item.unidade_exibicao || 't')
  const [qty, setQty] = useState('')
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const resto = Number(item.volume_kg) - Number(item.volume_recebido_kg)

  async function handleSubmit(e) {
    e.preventDefault()
    const parsed = parseQtyInput(qty, unidade)
    if (!parsed.ok) {
      setError(parsed.error)
      return
    }
    setSaving(true)
    const res = await receberCompraItem(item.id, parsed.kg)
    setSaving(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    onDone()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Receber item"
      footer={
        <ModalFormFooter formId="receber" submitLabel="Receber" loading={saving} onCancel={onClose} />
      }
    >
      <p className="mb-4 text-sm text-slate-600">Saldo a receber: {formatQtyBoth(resto)}</p>
      {error ? <AlertMessage className="mb-4">{error}</AlertMessage> : null}
      <form id="receber" className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => void handleSubmit(e)}>
        <Select
          label="Unidade"
          value={unidade}
          onChange={(e) => setUnidade(e.target.value)}
          options={UNIDADE_OPTIONS}
        />
        <Input label="Quantidade" value={qty} onChange={(e) => setQty(e.target.value)} required />
      </form>
    </Modal>
  )
}
