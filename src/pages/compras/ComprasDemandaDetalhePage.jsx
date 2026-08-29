import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ComprasSubnav } from '../../components/compras/ComprasSubnav'
import { AlertMessage } from '../../components/ui/AlertMessage'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'
import { PageBackLink } from '../../components/ui/PageBackLink'
import { PageHeader } from '../../components/ui/PageHeader'
import { Select } from '../../components/ui/Select'
import {
  UNIDADE_OPTIONS,
  demandaStatusBadgeClass,
  demandaStatusLabel,
} from '../../constants/compras'
import { useSyncPageLoading } from '../../contexts/PageLoadingContext'
import { useAbortableAsync } from '../../hooks/useAbortableAsync'
import {
  alocarDemanda,
  criarOrdemCompra,
  desalocarDemanda,
  fetchDemandaPedido,
  fetchLotesDisponiveis,
  fetchOcItensParaProduto,
  insertCompraItem,
  itemPrecoFromDemanda,
} from '../../services/comprasService'
import { formatQtyBoth, kgToTons, parseQtyInput } from '../../utils/comprasUnits'
import {
  bannerToneClass,
  describeVinculo,
  resumoLinha,
} from '../../utils/demandaVinculo'
import { formatShortDate } from '../../utils/formatShortDate'

export function ComprasDemandaDetalhePage() {
  const { simulationId } = useParams()
  const navigate = useNavigate()
  const [pedido, setPedido] = useState(null)
  const [loadState, setLoadState] = useState('idle')
  const [error, setError] = useState(null)
  const [banner, setBanner] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [busy, setBusy] = useState(false)

  useSyncPageLoading(loadState !== 'ready')

  useAbortableAsync(
    async (_s, isActive) => {
      setError(null)
      const keepUi = Boolean(pedido) && pedido.simulationId === simulationId
      if (!keepUi) setLoadState('loading')
      const res = await fetchDemandaPedido(simulationId)
      if (!isActive()) return
      if (!res.ok) {
        setLoadState('error')
        setError(res.error)
        setPedido(null)
        return
      }
      setPedido(res.data)
      setLoadState('ready')
    },
    [simulationId, reloadKey],
  )

  const local = pedido
    ? [pedido.municipio, pedido.uf].filter(Boolean).join('/')
    : ''
  const primeira = pedido?.linhas?.[0]

  async function handlePedirFalta() {
    const chosen = (pedido?.linhas ?? []).filter((row) => row.faltanteKg > 0.0001)
    if (chosen.length === 0) return
    setBusy(true)
    setError(null)
    setBanner(null)
    try {
      const byForn = new Map()
      for (const row of chosen) {
        const fid = row.product.fornecedor_id
        if (!byForn.has(fid)) byForn.set(fid, [])
        byForn.get(fid).push(row)
      }
      const numeros = []
      for (const [fornecedorId, group] of byForn) {
        const created = await criarOrdemCompra(fornecedorId)
        if (!created.ok) {
          setError(created.error)
          return
        }
        for (const row of group) {
          const prices = itemPrecoFromDemanda(row)
          const inserted = await insertCompraItem(created.data, {
            produto_oficial_id: row.product.id,
            volume_kg: row.faltanteKg,
            unidade_exibicao: 't',
            cultura: row.cultura,
            ...prices,
          })
          if (!inserted.ok) {
            setError(inserted.error)
            return
          }
          const aloc = await alocarDemanda({
            simulationItemId: row.simulationItemId,
            quantidadeKg: row.faltanteKg,
            compraItemId: inserted.id,
          })
          if (!aloc.ok) {
            setError(aloc.error)
            return
          }
        }
        numeros.push(created.data)
      }
      setBanner(
        numeros.length > 1
          ? 'Ordens de compra criadas para o que faltava.'
          : 'Ordem de compra criada para o que faltava.',
      )
      setReloadKey((k) => k + 1)
    } finally {
      setBusy(false)
    }
  }

  if (loadState === 'loading' || loadState === 'idle') {
    return <p className="py-16 text-center text-slate-600">Carregando pedido…</p>
  }
  if (loadState === 'error' || !pedido) {
    return (
      <div className="py-8">
        <PageBackLink to="/compras/demanda">Voltar</PageBackLink>
        <AlertMessage className="mt-4">{error ?? 'Pedido inválido.'}</AlertMessage>
      </div>
    )
  }

  const temFalta = pedido.faltanteKg > 0.0001

  return (
    <div className="w-full min-w-0 space-y-4 sm:space-y-6">
      <PageBackLink to="/compras/demanda">Voltar para demanda</PageBackLink>
      <ComprasSubnav />

      <PageHeader
        eyebrow="Demanda"
        title={pedido.clienteNome}
        description={`${pedido.fazenda || 'Sem fazenda'}${local ? ` · ${local}` : ''}`}
        actions={
          <span
            className={[
              'inline-flex rounded-full px-3 py-1 text-sm font-semibold',
              demandaStatusBadgeClass(pedido.status),
            ].join(' ')}
          >
            {demandaStatusLabel(pedido.status)}
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
        <h2 className="mb-4 text-sm font-semibold text-primary-800">Pedido do cliente</h2>
        <dl className="grid gap-4 sm:grid-cols-2">
          <Info label="Cliente" value={pedido.clienteNome} />
          <Info label="Fazenda" value={pedido.fazenda || '—'} />
          <Info label="Cidade / UF" value={local || '—'} />
          <Info
            label="Convertido em"
            value={pedido.createdAt ? formatShortDate(pedido.createdAt) : '—'}
          />
          <Info
            label="Prazo (semana)"
            value={
              primeira?.prazoSemanaInicio
                ? formatShortDate(primeira.prazoSemanaInicio)
                : '—'
            }
          />
          <Info
            label="Telefone"
            value={primeira?.clienteTelefone || '—'}
          />
        </dl>
        {primeira?.observacoes ? (
          <p className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-700 whitespace-pre-wrap">
            {primeira.observacoes}
          </p>
        ) : null}
        <Button
          type="button"
          variant="secondary"
          className="mt-4 w-full"
          onClick={() => navigate(`/pedido/${pedido.simulationId}`)}
        >
          Abrir pedido do cliente
        </Button>
      </Card>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Produtos" value={String(pedido.produtos)} />
        <Stat label="Vendido" value={formatQtyBoth(pedido.vendidoKg)} />
        <Stat label="Ainda falta" value={formatQtyBoth(pedido.faltanteKg)} />
      </div>

      {temFalta ? (
        <Button
          type="button"
          className="w-full"
          loading={busy}
          onClick={() => void handlePedirFalta()}
        >
          Pedir o que falta ao fornecedor
        </Button>
      ) : null}

      {pedido.linhas.map((row) => (
        <ProdutoDemandaCard
          key={row.simulationItemId}
          row={row}
          busy={busy}
          onError={setError}
          onDone={() => setReloadKey((k) => k + 1)}
        />
      ))}
    </div>
  )
}

function Info({ label, value }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
        {label}
      </dt>
      <dd className="mt-1 text-sm font-medium text-slate-900">{value}</dd>
    </div>
  )
}

function Stat({ label, value }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-slate-900">{value}</p>
    </div>
  )
}

function ProdutoDemandaCard({ row, busy, onError, onDone }) {
  const resumo = resumoLinha(row)

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">{row.product.displayNome}</h2>
        <p className="mt-1 text-sm text-slate-600">
          {row.product.fornecedor_nome}
          {row.cultura ? ` · Cultura: ${row.cultura}` : ''}
          {row.product.estado ? ` · ${row.product.estado}` : ''}
        </p>
      </div>

      <div className={`rounded-2xl border px-4 py-3 text-sm ${bannerToneClass(resumo.tone)}`}>
        <p className="font-semibold">{resumo.title}</p>
        <p className="mt-1">{resumo.text}</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Vendido" value={formatQtyBoth(row.vendidoKg)} />
        <Stat label="Vinculado" value={formatQtyBoth(row.lastreadoKg)} />
        <Stat label="Falta" value={formatQtyBoth(row.faltanteKg)} />
      </div>

      {row.alocacoes.length > 0 ? (
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
            Situação de cada vínculo
          </p>
          {row.alocacoes.map((aloc) => (
            <VinculoItem
              key={aloc.id}
              aloc={aloc}
              disabled={busy}
              onError={onError}
              onDone={onDone}
            />
          ))}
        </div>
      ) : null}

      {row.faltanteKg > 0.0001 ? (
        <PainelVincular
          key={`${row.simulationItemId}-${row.faltanteKg}`}
          row={row}
          disabled={busy}
          onError={onError}
          onDone={onDone}
        />
      ) : null}
    </Card>
  )
}

function VinculoItem({ aloc, disabled, onError, onDone }) {
  const info = describeVinculo(aloc)
  const [saving, setSaving] = useState(false)
  const navigate = useNavigate()

  async function handleDesvincular() {
    setSaving(true)
    onError(null)
    const res = await desalocarDemanda(aloc.id)
    setSaving(false)
    if (!res.ok) {
      onError(res.error)
      return
    }
    onDone()
  }

  return (
    <div className={`rounded-2xl border px-4 py-3 ${bannerToneClass(info.tone)}`}>
      <p className="font-semibold">{info.title}</p>
      <p className="mt-1 text-sm">{info.detail}</p>
      <div className="mt-3 grid gap-2">
        {info.ocId ? (
          <Button
            type="button"
            variant="secondary"
            className="w-full"
            onClick={() => navigate(`/compras/ordens/${info.ocId}`)}
          >
            Abrir {info.ocNumero}
          </Button>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          className="w-full text-red-700"
          disabled={disabled || saving}
          loading={saving}
          onClick={() => void handleDesvincular()}
        >
          Desvincular
        </Button>
      </div>
    </div>
  )
}

function PainelVincular({ row, disabled, onError, onDone }) {
  const [origem, setOrigem] = useState('estoque')
  const [unidade, setUnidade] = useState('t')
  const [qty, setQty] = useState(() => String(kgToTons(row.faltanteKg)))
  const [loteId, setLoteId] = useState('')
  const [ocItemId, setOcItemId] = useState('')
  const [lotes, setLotes] = useState([])
  const [ocItens, setOcItens] = useState([])
  const [saving, setSaving] = useState(false)

  useAbortableAsync(
    async (_s, isActive) => {
      const [lRes, oRes] = await Promise.all([
        fetchLotesDisponiveis(row.product.id),
        fetchOcItensParaProduto(row.product.id),
      ])
      if (!isActive()) return
      if (lRes.ok) {
        setLotes(lRes.rows)
        setLoteId((prev) => prev || lRes.rows[0]?.id || '')
        if (lRes.rows.length === 0) setOrigem((cur) => (cur === 'estoque' ? 'nova' : cur))
      }
      if (oRes.ok) {
        const livres = oRes.rows.filter((r) => r.livreKg > 0.0001)
        setOcItens(livres)
        setOcItemId((prev) => prev || livres[0]?.id || '')
      }
    },
    [row.product.id, row.faltanteKg],
  )

  const qtyHint = useMemo(
    () => `Saldo desta linha: ${formatQtyBoth(row.faltanteKg)}`,
    [row.faltanteKg],
  )

  async function handleSubmit(e) {
    e.preventDefault()
    onError(null)
    const parsed = parseQtyInput(qty, unidade)
    if (!parsed.ok) {
      onError(parsed.error)
      return
    }
    if (parsed.kg > row.faltanteKg + 0.0001) {
      onError('Quantidade maior que o saldo sem vínculo desta linha.')
      return
    }
    setSaving(true)
    try {
      if (origem === 'estoque') {
        if (!loteId) {
          onError('Selecione um lote.')
          return
        }
        const res = await alocarDemanda({
          simulationItemId: row.simulationItemId,
          quantidadeKg: parsed.kg,
          estoqueLoteId: loteId,
        })
        if (!res.ok) {
          onError(res.error)
          return
        }
        onDone()
        return
      }
      if (origem === 'oc') {
        if (!ocItemId) {
          onError('Selecione um item de OC.')
          return
        }
        const res = await alocarDemanda({
          simulationItemId: row.simulationItemId,
          quantidadeKg: parsed.kg,
          compraItemId: ocItemId,
        })
        if (!res.ok) {
          onError(res.error)
          return
        }
        onDone()
        return
      }
      const created = await criarOrdemCompra(row.product.fornecedor_id)
      if (!created.ok) {
        onError(created.error)
        return
      }
      const prices = itemPrecoFromDemanda(row)
      const inserted = await insertCompraItem(created.data, {
        produto_oficial_id: row.product.id,
        volume_kg: parsed.kg,
        unidade_exibicao: unidade,
        cultura: row.cultura,
        ...prices,
      })
      if (!inserted.ok) {
        onError(inserted.error)
        return
      }
      const aloc = await alocarDemanda({
        simulationItemId: row.simulationItemId,
        quantidadeKg: parsed.kg,
        compraItemId: inserted.id,
      })
      if (!aloc.ok) {
        onError(aloc.error)
        return
      }
      onDone()
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="grid gap-4 border-t border-slate-100 pt-4" onSubmit={(e) => void handleSubmit(e)}>
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
        Vincular saldo
      </p>
      <p className="text-sm text-slate-600">{qtyHint}</p>
      <Select
        label="Origem"
        value={origem}
        onChange={(e) => setOrigem(e.target.value)}
        options={[
          { value: 'estoque', label: 'Estoque existente (dá baixa)' },
          { value: 'oc', label: 'Item de OC existente (a caminho)' },
          { value: 'nova', label: 'Nova ordem de compra' },
        ]}
      />
      {origem === 'estoque' ? (
        <Select
          label="Lote"
          value={loteId}
          onChange={(e) => setLoteId(e.target.value)}
          options={[
            { value: '', label: lotes.length ? 'Selecione…' : 'Sem lote disponível' },
            ...lotes.map((l) => ({
              value: l.id,
              label: `${l.embalagem} · disp. ${formatQtyBoth(l.disponivelKg)}`,
            })),
          ]}
        />
      ) : null}
      {origem === 'oc' ? (
        <Select
          label="Item da OC"
          value={ocItemId}
          onChange={(e) => setOcItemId(e.target.value)}
          options={[
            { value: '', label: ocItens.length ? 'Selecione…' : 'Nenhuma OC com saldo' },
            ...ocItens.map((it) => ({
              value: it.id,
              label: `${it.numero} · ${it.status} · livre ${formatQtyBoth(it.livreKg)}`,
            })),
          ]}
        />
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Select
          label="Unidade"
          value={unidade}
          onChange={(e) => setUnidade(e.target.value)}
          options={UNIDADE_OPTIONS}
        />
        <Input
          label="Quantidade"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          required
        />
      </div>
      <Button type="submit" className="w-full" loading={saving} disabled={disabled}>
        Vincular
      </Button>
    </form>
  )
}
