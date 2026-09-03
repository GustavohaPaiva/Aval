import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  IconCalendar,
  IconPackage,
  IconSearch,
  IconTruck,
} from '../../components/icons'
import { AlertMessage } from '../../components/ui/AlertMessage'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { PageHeader } from '../../components/ui/PageHeader'
import { PageInfoBanner } from '../../components/ui/InfoStatCard'
import { SearchInput } from '../../components/ui/SearchInput'
import { useSyncPageLoading } from '../../contexts/PageLoadingContext'
import { useAbortableAsync } from '../../hooks/useAbortableAsync'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import { usePersistedFilters } from '../../hooks/usePersistedFilters'
import { fetchPedidosAssinadosLogistica } from '../../services/logisticaService'
import { formatPrazoSemanaLabel } from '../../utils/calendarWeek'
import { formatShortDate } from '../../utils/formatShortDate'

function localLabel(municipio, uf) {
  const parts = [municipio, uf].filter(Boolean)
  return parts.length ? parts.join(' / ') : '—'
}

export function LogisticaPedidosPage() {
  const navigate = useNavigate()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filters, , patchFilters] = usePersistedFilters(
    'filters:logistica-pedidos',
    { searchQuery: '' },
  )
  const { searchQuery } = filters
  const debouncedSearch = useDebouncedValue(searchQuery, 300)

  useSyncPageLoading(loading)

  useAbortableAsync(
    async (_signal, isActive) => {
      setLoading(true)
      setError(null)
      const res = await fetchPedidosAssinadosLogistica({
        search: debouncedSearch,
      })
      if (!isActive()) return
      setLoading(false)
      if (!res.ok) {
        setError(res.error)
        setRows([])
        return
      }
      setRows(res.data)
    },
    [debouncedSearch],
  )

  const hasFilters = Boolean(searchQuery.trim())
  const bannerText = useMemo(() => {
    if (loading) return 'Carregando pedidos assinados…'
    if (hasFilters) return `${rows.length} pedido(s) encontrado(s).`
    return `${rows.length} pedido(s) assinado(s) disponíveis.`
  }, [loading, hasFilters, rows.length])

  return (
    <div className="w-full min-w-0 space-y-4 sm:space-y-6">
      <div className="relative overflow-hidden rounded-2xl border border-primary-100/80 bg-gradient-to-br from-primary-50/80 via-white to-emerald-50/40 p-4 shadow-sm sm:rounded-[2rem] sm:p-6 lg:p-8">
        <PageHeader
          eyebrow="Logística"
          title="Pedidos assinados"
          description="Pedidos com assinatura do cliente prontos para entrega."
          className="relative mb-0"
        />
        <PageInfoBanner icon={IconTruck}>{bannerText}</PageInfoBanner>
      </div>

      <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm sm:rounded-3xl sm:p-5">
        <div className="flex items-center gap-2">
          <IconSearch className="hidden size-4 text-slate-400 sm:block" />
          <SearchInput
            value={searchQuery}
            onChange={(e) => patchFilters({ searchQuery: e.target.value })}
            placeholder="Buscar por cliente, fazenda ou município…"
          />
        </div>
      </div>

      {error ? <AlertMessage>{error}</AlertMessage> : null}

      {loading ? (
        <section className="rounded-2xl border border-slate-200/90 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
          Carregando…
        </section>
      ) : rows.length === 0 ? (
        <section className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm sm:p-10">
          <EmptyState
            title={
              hasFilters
                ? 'Nenhum resultado para a busca.'
                : 'Nenhum pedido assinado ainda.'
            }
          />
        </section>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((row) => (
            <li key={row.simulationId}>
              <article className="flex h-full flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm transition-[box-shadow,border-color] hover:border-primary-200 hover:shadow-md">
                <header className="border-b border-slate-100 bg-gradient-to-br from-white to-slate-50/80 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h2 className="text-lg font-semibold tracking-tight text-slate-900">
                      {row.clientNome}
                    </h2>
                    <span className="inline-flex shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                      Assinado
                    </span>
                  </div>
                  {row.fazenda ? (
                    <p className="mt-1 text-sm text-slate-600">{row.fazenda}</p>
                  ) : null}
                </header>

                <div className="flex flex-1 flex-col gap-3 p-5">
                  <div className="flex items-center gap-2 text-sm text-slate-600">
                    <IconPackage className="size-4 shrink-0 text-slate-400" />
                    <span>{localLabel(row.municipio, row.uf)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-slate-600">
                    <IconCalendar className="size-4 shrink-0 text-slate-400" />
                    <span>
                      Prazo:{' '}
                      {formatPrazoSemanaLabel(row.prazoSemanaInicio) || '—'}
                    </span>
                  </div>
                  {row.signedAt ? (
                    <p className="text-xs text-slate-500">
                      Assinado em {formatShortDate(row.signedAt)}
                    </p>
                  ) : null}

                  <div className="mt-auto pt-2">
                    <Button
                      type="button"
                      className="w-full"
                      onClick={() =>
                        navigate(`/logistica/${row.simulationId}`)
                      }
                    >
                      Abrir pedido
                    </Button>
                  </div>
                </div>
              </article>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
