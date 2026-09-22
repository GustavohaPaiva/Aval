import { createElement, useCallback, useEffect, useMemo, useState } from 'react'
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
  TIPO_ENTREGA_OPTIONS,
  UNIDADE_OPTIONS,
  compraStatusBadgeClass,
  compraStatusLabel,
  faturamentoFromFilial,
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
  fetchTaxaUsdVigente,
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
  kgToTons,
  parseQtyInput,
} from '../../utils/comprasUnits'
import {
  calcOcItemValores,
  inferTaxaDolar,
  parseOcNumber,
} from '../../utils/comprasPrecos'
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
  const [tipoEntrega, setTipoEntrega] = useState('')
  const [cidade, setCidade] = useState('Uberaba')
  const [condicao, setCondicao] = useState('FAT. ANTECIPADO')
  const [dataDoc, setDataDoc] = useState('')
  const [faturamento, setFaturamento] = useState('')
  const [entregaRetirada, setEntregaRetirada] = useState('')
  const [ctc, setCtc] = useState('')
  const [obs, setObs] = useState('')
  const [taxaUsdVigente, setTaxaUsdVigente] = useState(null)

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
      setTipoEntrega(c.tipo_entrega || '')
      setCidade(c.cidade_retirada || 'Uberaba')
      setCondicao(c.condicao_pagamento || 'FAT. ANTECIPADO')
      setDataDoc(String(c.data_documento ?? '').slice(0, 10))
      setFaturamento(c.faturamento || faturamentoFromFilial(c.filial_site))
      setEntregaRetirada(c.entrega_retirada || '')
      setCtc(c.ctc || '')
      setObs(c.observacoes || '')
      setLoadState('ready')
    },
    [compraId, reloadKey],
  )

  useAbortableAsync(async (_s, isActive) => {
    const res = await fetchTaxaUsdVigente()
    if (!isActive()) return
    if (res.ok) setTaxaUsdVigente(res.taxa)
  }, [])

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
  const mensagem = bundle
    ? formatOcMensagem(
        {
          ...bundle,
          filial_site: filial,
          tipo_entrega: tipoEntrega,
          cidade_retirada: cidade,
          condicao_pagamento: condicao,
          data_documento: dataDoc,
          observacoes: obs,
          faturamento,
          entrega_retirada: entregaRetirada,
          ctc,
        },
        bundle.itens,
        bundle.fornecedorNome,
      )
    : ''

  async function handleSaveHeader() {
    setSaving(true)
    setError(null)
    const res = await updateCompraCabecalho(compraId, {
      filial_site: filial,
      tipo_entrega: tipoEntrega,
      cidade_retirada: cidade,
      condicao_pagamento: condicao,
      data_documento: dataDoc,
      observacoes: obs,
      faturamento,
      ctc,
      entrega_retirada: entregaRetirada,
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
    const snapshot = {
      ...bundle,
      filial_site: filial,
      tipo_entrega: tipoEntrega,
      cidade_retirada: cidade,
      condicao_pagamento: condicao,
      data_documento: dataDoc,
      observacoes: obs,
      faturamento,
      entrega_retirada: entregaRetirada,
      ctc,
    }
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
  }, [
    bundle,
    filial,
    tipoEntrega,
    cidade,
    condicao,
    dataDoc,
    obs,
    faturamento,
    entregaRetirada,
    ctc,
  ])

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
            onChange={(e) => {
              const next = e.target.value
              setFilial(next)
              setFaturamento((prev) => {
                const previousDefault = faturamentoFromFilial(filial)
                if (!prev || prev === previousDefault) return faturamentoFromFilial(next)
                return prev
              })
            }}
            options={filialOptions()}
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
          <Input
            label="Faturamento"
            value={faturamento}
            onChange={(e) => setFaturamento(e.target.value)}
            disabled={!canEdit}
          />
          <Input
            label="Entrega / retirada"
            value={entregaRetirada}
            onChange={(e) => setEntregaRetirada(e.target.value)}
            disabled={!canEdit}
          />
          <Input
            label="CTC"
            value={ctc}
            onChange={(e) => setCtc(e.target.value)}
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
                taxaUsdVigente={taxaUsdVigente}
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
          taxaUsdVigente={taxaUsdVigente}
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

function OcItemEditor({ item, canEdit, canReceive, taxaUsdVigente, onSaved, onDelete, onReceive }) {
  const [preco, setPreco] = useState(item.preco_usd ?? '')
  const [desc, setDesc] = useState(item.desconto_usd ?? '')
  const [dolar, setDolar] = useState(() => {
    const inferred = inferTaxaDolar({
      precoUsd: item.preco_usd,
      descontoUsd: item.desconto_usd,
      unitarioBrl: item.unitario_brl,
      fallback: taxaUsdVigente,
      precoCorrigido: item.preco_corrigido,
    })
    return inferred == null ? '' : String(Number(inferred.toFixed(6)))
  })
  const [vencimento, setVencimento] = useState(
    String(item.vencimento_lista ?? '').slice(0, 10),
  )
  const [pagamentoSyagri, setPagamentoSyagri] = useState(
    String(item.pagamento_syagri ?? item.vencimento_lista ?? '').slice(0, 10),
  )
  const [frete, setFrete] = useState(item.frete ?? '')
  const [cultura, setCultura] = useState(item.cultura ?? '')
  const [origem, setOrigem] = useState(item.origem ?? '')
  const [lista, setLista] = useState(item.lista || item.product?.quarter || '')
  const [embalagem, setEmbalagem] = useState(item.embalagem || 'BIG BAG')
  const [unidade, setUnidade] = useState(item.unidade_exibicao || 't')
  const [qty, setQty] = useState(() =>
    item.unidade_exibicao === 'kg'
      ? String(Number(item.volume_kg) || '')
      : String(kgToTons(item.volume_kg) || ''),
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const restoKg = Number(item.volume_kg) - Number(item.volume_recebido_kg)

  useEffect(() => {
    if (dolar !== '') return
    const inferred = inferTaxaDolar({
      precoUsd: item.preco_usd,
      descontoUsd: item.desconto_usd,
      unitarioBrl: item.unitario_brl,
      fallback: taxaUsdVigente,
      precoCorrigido: item.preco_corrigido,
    })
    if (inferred != null) setDolar(String(Number(inferred.toFixed(6))))
  }, [dolar, item, taxaUsdVigente])

  const parsedVolume = parseQtyInput(qty, unidade)
  const volumeKg = parsedVolume.ok ? parsedVolume.kg : Number(item.volume_kg)

  const valores = useMemo(
    () =>
      calcOcItemValores({
        precoUsd: parseOcNumber(preco),
        descontoUsd: parseOcNumber(desc) ?? 0,
        taxaDolar: parseOcNumber(dolar),
        volumeKg,
        unidade,
        vencimentoLista: vencimento || null,
        pagamentoSyagri: pagamentoSyagri || null,
        taxaJuros: item.product?.taxaJuros,
        frete: parseOcNumber(frete),
      }),
    [
      preco,
      desc,
      dolar,
      volumeKg,
      unidade,
      item.product?.taxaJuros,
      vencimento,
      pagamentoSyagri,
      frete,
    ],
  )

  async function saveInternal() {
    setSaving(true)
    setError(null)
    if (!parsedVolume.ok) {
      setSaving(false)
      setError(parsedVolume.error)
      return
    }
    if (parsedVolume.kg + 0.0001 < Number(item.volume_recebido_kg)) {
      setSaving(false)
      setError('Volume não pode ser menor do que o já recebido.')
      return
    }
    const res = await updateCompraItem(item.id, {
      preco_usd: parseOcNumber(preco),
      desconto_usd: parseOcNumber(desc),
      unitario_brl: valores.unitarioBrl,
      total: valores.total,
      frete: parseOcNumber(frete),
      vencimento_lista: vencimento || null,
      pagamento_syagri: pagamentoSyagri || null,
      preco_corrigido: valores.precoCorrigido,
      juros: valores.juros,
      cultura: cultura.trim() || null,
      origem: origem.trim() || null,
      lista: lista.trim() || null,
      embalagem,
      unidade_exibicao: unidade,
      volume_kg: parsedVolume.kg,
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
            {embalagem} · pedido {formatQtyBoth(volumeKg)} · recebido{' '}
            {formatQtyBoth(item.volume_recebido_kg)}
            {lista ? ` · Lista ${lista}` : ''}
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
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Select
          label="Embalagem"
          value={embalagem}
          onChange={(e) => setEmbalagem(e.target.value)}
          options={EMBALAGEM_OPTIONS}
          disabled={!canEdit}
        />
        <Select
          label="Unidade"
          value={unidade}
          onChange={(e) => {
            const next = e.target.value
            const parsed = parseQtyInput(qty, unidade)
            setUnidade(next)
            if (parsed.ok) {
              setQty(next === 'kg' ? String(parsed.kg) : String(kgToTons(parsed.kg)))
            }
          }}
          options={UNIDADE_OPTIONS}
          disabled={!canEdit}
        />
        <Input
          label="Quantidade"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          disabled={!canEdit}
        />
        <Input
          label="Lista"
          value={lista}
          onChange={(e) => setLista(e.target.value)}
          disabled={!canEdit}
        />
        <Input label="Preço USD" value={preco} onChange={(e) => setPreco(e.target.value)} disabled={!canEdit} />
        <Input
          label="Desconto USD"
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          disabled={!canEdit}
        />
        <Input
          label="Valor com desconto"
          value={valores.liquidoUsd == null ? '' : String(valores.liquidoUsd)}
          disabled
          readOnly
        />
        <Input
          label="Dólar"
          value={dolar}
          onChange={(e) => setDolar(e.target.value)}
          disabled={!canEdit}
        />
        <DatePicker
          label="Vencimento da lista"
          value={vencimento}
          onChange={(e) => setVencimento(e.target.value)}
          disabled={!canEdit}
        />
        <DatePicker
          label="Pagamento Syagri"
          value={pagamentoSyagri}
          onChange={(e) => setPagamentoSyagri(e.target.value)}
          disabled={!canEdit}
        />
        <Input
          label="Preço corrigido USD"
          value={valores.precoCorrigido == null ? '' : String(valores.precoCorrigido)}
          disabled
          readOnly
        />
        <Input
          label="Juros USD"
          value={valores.juros == null ? '' : String(valores.juros)}
          disabled
          readOnly
        />
        <Input
          label="Unitário R$"
          value={valores.unitarioBrl == null ? '' : String(valores.unitarioBrl)}
          disabled
          readOnly
        />
        <Input label="Frete R$" value={frete} onChange={(e) => setFrete(e.target.value)} disabled={!canEdit} />
        <Input
          label="Total R$"
          value={valores.total == null ? '' : String(valores.total)}
          disabled
          readOnly
        />
        <Input
          label="Cultura"
          value={cultura}
          onChange={(e) => setCultura(e.target.value)}
          disabled={!canEdit}
        />
        <Input
          label="Origem"
          value={origem}
          onChange={(e) => setOrigem(e.target.value)}
          disabled={!canEdit}
        />
      </div>
      <p className="mt-2 text-xs text-slate-500">
        Pedido ao fornecedor: USD {formatUsd(valores.precoCorrigido)}
        {valores.dias > 0 ? ` · ${valores.dias} dia(s) de juros` : ''}
        {' · '}
        Unitário {formatBRL(Number(valores.unitarioBrl) || 0)} · saldo a receber {formatQtyBoth(restoKg)}
      </p>
      {canEdit ? (
        <Button type="button" variant="secondary" className="mt-3 w-full" loading={saving} onClick={() => void saveInternal()}>
          Salvar preços
        </Button>
      ) : null}
    </div>
  )
}

function ModalAddItem({ fornecedorId, taxaUsdVigente, onClose, onSave }) {
  const [produtos, setProdutos] = useState([])
  const [produtoId, setProdutoId] = useState('')
  const [embalagem, setEmbalagem] = useState('BIG BAG')
  const [unidade, setUnidade] = useState('t')
  const [qty, setQty] = useState('')
  const [cultura, setCultura] = useState('')
  const [origem, setOrigem] = useState('')
  const [lista, setLista] = useState('')
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  useAbortableAsync(async (_s, isActive) => {
    const res = await fetchProdutosPorFornecedor(fornecedorId)
    if (!isActive()) return
    if (res.ok) {
      setProdutos(res.rows)
      setProdutoId(res.rows[0]?.id ?? '')
      setLista(res.rows[0]?.quarter || '')
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
    const vencimento = product?.vencimento_lista ?? null
    const valores = calcOcItemValores({
      precoUsd: product?.preco_original,
      descontoUsd: product?.desconto_usd,
      taxaDolar: taxaUsdVigente,
      volumeKg: parsed.kg,
      unidade,
      vencimentoLista: vencimento,
      pagamentoSyagri: vencimento,
      taxaJuros: product?.taxaJuros,
    })
    setSaving(true)
    const res = await onSave({
      produto_oficial_id: produtoId,
      embalagem,
      volume_kg: parsed.kg,
      unidade_exibicao: unidade,
      cultura,
      origem: origem.trim() || null,
      lista: lista.trim() || product?.quarter || null,
      preco_usd: product?.preco_original ?? null,
      desconto_usd: product?.desconto_usd ?? null,
      vencimento_lista: vencimento,
      pagamento_syagri: vencimento,
      preco_corrigido: valores.precoCorrigido,
      juros: valores.juros,
      unitario_brl: valores.unitarioBrl,
      total: valores.total,
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
          onChange={(e) => {
            const next = e.target.value
            setProdutoId(next)
            const product = produtos.find((p) => p.id === next)
            setLista(product?.quarter || '')
          }}
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
        <Input label="Origem" value={origem} onChange={(e) => setOrigem(e.target.value)} />
        <Input label="Lista" value={lista} onChange={(e) => setLista(e.target.value)} />
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
