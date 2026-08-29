import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ComprasSubnav } from '../../components/compras/ComprasSubnav'
import { IconPackage, IconPlus } from '../../components/icons'
import { AlertMessage } from '../../components/ui/AlertMessage'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { Modal } from '../../components/ui/Modal'
import { ModalFormFooter } from '../../components/ui/ModalFormFooter'
import { PageHeader } from '../../components/ui/PageHeader'
import { PageInfoBanner } from '../../components/ui/InfoStatCard'
import { Select } from '../../components/ui/Select'
import {
  COMPRA_STATUSES,
  compraStatusBadgeClass,
  compraStatusLabel,
} from '../../constants/compras'
import { useSyncPageLoading } from '../../contexts/PageLoadingContext'
import { useAbortableAsync } from '../../hooks/useAbortableAsync'
import {
  criarOrdemCompra,
  fetchComprasList,
  fetchFornecedoresAtivos,
} from '../../services/comprasService'
import { formatQtyBoth } from '../../utils/comprasUnits'

export function ComprasOrdensPage() {
  const navigate = useNavigate()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [statusFilter, setStatusFilter] = useState('all')
  const [novaOpen, setNovaOpen] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  useSyncPageLoading(loading)

  useAbortableAsync(
    async (_s, isActive) => {
      setLoading(true)
      setError(null)
      const res = await fetchComprasList()
      if (!isActive()) return
      setLoading(false)
      if (!res.ok) {
        setError(res.error)
        setRows([])
        return
      }
      setRows(res.rows)
    },
    [reloadKey],
  )

  const filtered = useMemo(
    () =>
      statusFilter === 'all' ? rows : rows.filter((r) => r.status === statusFilter),
    [rows, statusFilter],
  )

  return (
    <div className="w-full min-w-0 space-y-4 sm:space-y-6">
      <div className="relative overflow-hidden rounded-2xl border border-primary-100/80 bg-gradient-to-br from-primary-50/80 via-white to-emerald-50/40 p-4 shadow-sm sm:rounded-[2rem] sm:p-6">
        <PageHeader
          eyebrow="Compras"
          title="Pedidos de compra"
          description="Ordens ao fornecedor. Pode criar em branco para estoque, sem vínculo com venda."
          actions={
            <Button type="button" onClick={() => setNovaOpen(true)} className="w-full">
              <IconPlus className="size-4" />
              Nova OC
            </Button>
          }
          className="relative mb-0"
        />
        <PageInfoBanner icon={IconPackage}>
          {loading
            ? 'Carregando…'
            : `${filtered.length.toLocaleString('pt-BR')} ordem(ns) no filtro atual.`}
        </PageInfoBanner>
      </div>

      <ComprasSubnav />
      {error ? <AlertMessage>{error}</AlertMessage> : null}

      <div className="flex flex-wrap gap-1 rounded-2xl bg-slate-100/90 p-1 ring-1 ring-slate-200/70">
        {[{ key: 'all', label: 'Todos' }, ...COMPRA_STATUSES.map((s) => ({ key: s, label: compraStatusLabel(s) }))].map(
          (pill) => (
            <button
              key={pill.key}
              type="button"
              className={[
                'min-h-10 flex-1 rounded-xl px-3 py-2 text-sm font-semibold',
                statusFilter === pill.key
                  ? 'bg-white text-primary-800 shadow-sm ring-1 ring-slate-200/80'
                  : 'text-slate-600',
              ].join(' ')}
              onClick={() => setStatusFilter(pill.key)}
            >
              {pill.label}
            </button>
          ),
        )}
      </div>

      {loading ? (
        <EmptyState title="Carregando ordens…" />
      ) : filtered.length === 0 ? (
        <EmptyState title="Nenhuma ordem" description="Crie uma OC ou vincule a demanda." />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((row) => (
            <button
              key={row.id}
              type="button"
              className="rounded-3xl border border-slate-200/90 bg-white p-5 text-left shadow-sm transition hover:border-primary-200"
              onClick={() => navigate(`/compras/ordens/${row.id}`)}
            >
              <div className="flex items-start justify-between gap-3">
                <p className="font-semibold text-slate-900">{row.numero}</p>
                <span
                  className={[
                    'inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold',
                    compraStatusBadgeClass(row.status),
                  ].join(' ')}
                >
                  {compraStatusLabel(row.status)}
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-600">{row.fornecedorNome}</p>
              <p className="mt-3 text-sm text-slate-500">
                {row.itensCount} item(ns) · {formatQtyBoth(row.volumeKg)}
              </p>
            </button>
          ))}
        </div>
      )}

      {novaOpen ? (
        <ModalNovaOc
          onClose={() => setNovaOpen(false)}
          onCreated={(id) => {
            setNovaOpen(false)
            setReloadKey((k) => k + 1)
            navigate(`/compras/ordens/${id}`)
          }}
        />
      ) : null}
    </div>
  )
}

function ModalNovaOc({ onClose, onCreated }) {
  const [fornecedorId, setFornecedorId] = useState('')
  const [fornecedores, setFornecedores] = useState([])
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  useAbortableAsync(async (_s, isActive) => {
    const res = await fetchFornecedoresAtivos()
    if (!isActive()) return
    if (res.ok) {
      setFornecedores(res.rows)
      setFornecedorId(res.rows[0]?.id ?? '')
    }
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!fornecedorId) {
      setError('Selecione o fornecedor.')
      return
    }
    setSaving(true)
    setError(null)
    const res = await criarOrdemCompra(fornecedorId)
    setSaving(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    onCreated(res.data)
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Nova ordem de compra"
      footer={
        <ModalFormFooter
          formId="nova-oc"
          submitLabel="Criar"
          loading={saving}
          onCancel={onClose}
        />
      }
    >
      {error ? <AlertMessage className="mb-4">{error}</AlertMessage> : null}
      <form id="nova-oc" className="grid gap-4" onSubmit={(e) => void handleSubmit(e)}>
        <Select
          label="Fornecedor"
          value={fornecedorId}
          onChange={(e) => setFornecedorId(e.target.value)}
          options={fornecedores.map((f) => ({ value: f.id, label: f.nome }))}
          required
        />
        <p className="text-sm text-slate-500">
          A OC nasce em Uberaba, condição FAT. ANTECIPADO. Você ajusta no detalhe.
        </p>
      </form>
    </Modal>
  )
}
