import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ComprasSubnav } from '../../components/compras/ComprasSubnav'
import { IconClipboardList, IconSearch } from '../../components/icons'
import { AlertMessage } from '../../components/ui/AlertMessage'
import { EmptyState } from '../../components/ui/EmptyState'
import { PageHeader } from '../../components/ui/PageHeader'
import { PageInfoBanner } from '../../components/ui/InfoStatCard'
import { SearchInput } from '../../components/ui/SearchInput'
import {
  demandaStatusBadgeClass,
  demandaStatusLabel,
} from '../../constants/compras'
import { useSyncPageLoading } from '../../contexts/PageLoadingContext'
import { useAbortableAsync } from '../../hooks/useAbortableAsync'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import { fetchDemandaPedidos } from '../../services/comprasService'
import { formatQtyBoth } from '../../utils/comprasUnits'
import { formatShortDate } from '../../utils/formatShortDate'

const FILTERS = [
  { key: 'all', label: 'Todos' },
  { key: 'sem', label: 'Sem vínculo' },
  { key: 'parcial', label: 'Parcial' },
  { key: 'a_caminho', label: 'A caminho' },
  { key: 'completo', label: 'Completo' },
]

export function ComprasDemandaPage() {
  const navigate = useNavigate()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const debouncedSearch = useDebouncedValue(search, 250)

  useSyncPageLoading(loading)

  useAbortableAsync(
    async (_signal, isActive) => {
      setLoading(true)
      setError(null)
      const res = await fetchDemandaPedidos()
      if (!isActive()) return
      setLoading(false)
      if (!res.ok) {
        setError(res.error)
        setRows([])
        return
      }
      setRows(res.rows)
    },
    [],
  )

  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLocaleLowerCase('pt-BR')
    return rows.filter((row) => {
      if (statusFilter !== 'all' && row.status !== statusFilter) return false
      if (!q) return true
      const hay = [row.clienteNome, row.fazenda, row.municipio, row.uf]
        .join(' ')
        .toLocaleLowerCase('pt-BR')
      return hay.includes(q)
    })
  }, [rows, debouncedSearch, statusFilter])

  const pendentes = filtered.filter((row) => row.faltanteKg > 0.0001).length

  return (
    <div className="w-full min-w-0 space-y-4 sm:space-y-6">
      <div className="relative overflow-hidden rounded-2xl border border-primary-100/80 bg-gradient-to-br from-primary-50/80 via-white to-emerald-50/40 p-4 shadow-sm sm:rounded-[2rem] sm:p-6">
        <PageHeader
          eyebrow="Compras"
          title="Demanda"
          description="Pedidos convertidos. Abra o pedido para ver os produtos e vincular estoque ou ordem de compra."
          className="relative mb-0"
        />
        <PageInfoBanner icon={IconClipboardList}>
          {loading
            ? 'Carregando demanda…'
            : `${filtered.length.toLocaleString('pt-BR')} pedido(s) · ${pendentes.toLocaleString('pt-BR')} com saldo sem vínculo.`}
        </PageInfoBanner>
      </div>

      <ComprasSubnav />
      {error ? <AlertMessage>{error}</AlertMessage> : null}

      <section className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm sm:rounded-3xl">
        <div className="space-y-4 p-4 sm:p-6">
          <div>
            <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
              <IconSearch className="size-3.5" />
              Busca
            </label>
            <SearchInput
              placeholder="Cliente, fazenda ou cidade…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-1 rounded-2xl bg-slate-100/90 p-1 ring-1 ring-slate-200/70">
            {FILTERS.map((pill) => (
              <button
                key={pill.key}
                type="button"
                className={[
                  'min-h-11 min-w-24 flex-1 rounded-xl px-3 py-2 text-sm font-semibold',
                  statusFilter === pill.key
                    ? 'bg-white text-primary-800 shadow-sm ring-1 ring-slate-200/80'
                    : 'text-slate-600',
                ].join(' ')}
                onClick={() => setStatusFilter(pill.key)}
              >
                {pill.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {loading ? (
        <EmptyState title="Carregando demanda…" />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="Nenhum pedido"
          description="Só entram pedidos convertidos e ativos."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {filtered.map((row) => {
            const local = [row.municipio, row.uf].filter(Boolean).join('/')
            return (
              <button
                key={row.simulationId}
                type="button"
                className="rounded-3xl border border-slate-200/90 bg-white p-5 text-left shadow-sm transition hover:border-primary-200"
                onClick={() => navigate(`/compras/demanda/${row.simulationId}`)}
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="text-lg font-semibold text-slate-900">{row.clienteNome}</p>
                  <span
                    className={[
                      'inline-flex shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold',
                      demandaStatusBadgeClass(row.status),
                    ].join(' ')}
                  >
                    {demandaStatusLabel(row.status)}
                  </span>
                </div>
                <p className="mt-1 text-sm text-slate-600">
                  {row.fazenda || '—'}
                  {local ? ` · ${local}` : ''}
                </p>
                <p className="mt-3 text-sm text-slate-500">
                  {row.createdAt ? formatShortDate(row.createdAt) : '—'} · {row.produtos}{' '}
                  produto(s)
                </p>
                <p className="mt-2 text-sm font-medium text-slate-800">
                  Falta {formatQtyBoth(row.faltanteKg)}
                </p>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
