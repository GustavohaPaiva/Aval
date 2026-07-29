import { useCallback, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  ListaFiltersPanel,
  ListaStatsBar,
  ListaTable,
} from '../components/listas/ListaVisuals'
import { IconClipboardList, IconPlus } from '../components/icons'
import { AlertMessage } from '../components/ui/AlertMessage'
import { PageHeader } from '../components/ui/PageHeader'
import { PageInfoBanner } from '../components/ui/InfoStatCard'
import { PaginationBar } from '../components/ui/PaginationBar'
import { useSyncPageLoading } from '../contexts/PageLoadingContext'
import { useAbortableAsync } from '../hooks/useAbortableAsync'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import { usePersistedFilters } from '../hooks/usePersistedFilters'
import {
  excluirListaImportacao,
  fetchFornecedoresAtivos,
  fetchLotesList,
  fetchLotesTotalCount,
  inativarListaImportacao,
  reativarListaImportacao,
} from '../services/produtoImportacaoService'

const PAGE_SIZE = 50

function parseStatusFilter(value) {
  if (value === 'true') return true
  if (value === 'false') return false
  return undefined
}

export function GerenciarListas() {
  const location = useLocation()
  const [rows, setRows] = useState([])
  const [fornecedores, setFornecedores] = useState([])
  const [total, setTotal] = useState(0)
  const [totalCount, setTotalCount] = useState(0)
  const [ativasCount, setAtivasCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [actionError, setActionError] = useState(null)
  const [successMessage] = useState(location.state?.successMessage ?? null)

  const [filters, , patchFilters] = usePersistedFilters('filters:listas', {
    searchQuery: '',
    fornecedorFilter: '',
    quarterFilter: '',
    statusFilter: '',
    page: 1,
  })
  const {
    searchQuery,
    fornecedorFilter,
    quarterFilter,
    statusFilter,
    page,
  } = filters
  const debouncedSearch = useDebouncedValue(searchQuery, 300)

  const [reloadToken, setReloadToken] = useState(0)

  useSyncPageLoading(loading)

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const rangeEnd = Math.min(page * PAGE_SIZE, total)

  const hasFilters = Boolean(
    searchQuery.trim() || fornecedorFilter || quarterFilter || statusFilter,
  )

  useAbortableAsync(
    async (_signal, isActive) => {
      const [countRes, ativasRes, fornRes] = await Promise.all([
        fetchLotesTotalCount(),
        fetchLotesTotalCount({ ativo: true }),
        fetchFornecedoresAtivos(),
      ])
      if (!isActive()) return
      if (countRes.ok) setTotalCount(countRes.total)
      if (ativasRes.ok) setAtivasCount(ativasRes.total)
      if (fornRes.ok) setFornecedores(fornRes.rows)
    },
    [reloadToken],
  )

  useAbortableAsync(
    async (_signal, isActive) => {
      setLoading(true)
      setLoadError(null)
      const res = await fetchLotesList({
        page,
        pageSize: PAGE_SIZE,
        search: debouncedSearch,
        fornecedorId: fornecedorFilter || undefined,
        quarter: quarterFilter || undefined,
        ativo: parseStatusFilter(statusFilter),
      })
      if (!isActive()) return
      setLoading(false)
      if (!res.ok) {
        setLoadError(res.error)
        setRows([])
        setTotal(0)
        return
      }
      setRows(res.rows)
      setTotal(res.total)
    },
    [
      page,
      debouncedSearch,
      fornecedorFilter,
      quarterFilter,
      statusFilter,
      reloadToken,
    ],
  )

  const reload = useCallback(() => {
    setReloadToken((n) => n + 1)
  }, [])

  function clearFilters() {
    patchFilters({
      searchQuery: '',
      fornecedorFilter: '',
      quarterFilter: '',
      statusFilter: '',
      page: 1,
    })
  }

  async function handleInativar(lista) {
    setActionError(null)
    if (
      !window.confirm(
        `Inativar a lista de produtos de ${lista.fornecedor_nome}${lista.quarter_calculado ? ` (${lista.quarter_calculado})` : ''} e todos os produtos vinculados?`,
      )
    ) {
      return
    }
    const res = await inativarListaImportacao(lista.id)
    if (!res.ok) {
      setActionError(res.error)
      return
    }
    reload()
  }

  async function handleReativar(lista) {
    setActionError(null)
    if (
      !window.confirm(
        `Reativar a lista de produtos de ${lista.fornecedor_nome}${lista.quarter_calculado ? ` (${lista.quarter_calculado})` : ''} e os produtos vinculados?`,
      )
    ) {
      return
    }
    const res = await reativarListaImportacao(lista.id)
    if (!res.ok) {
      setActionError(res.error)
      return
    }
    reload()
  }

  async function handleExcluir(lista) {
    setActionError(null)
    const label = [lista.fornecedor_nome, lista.quarter_calculado]
      .filter(Boolean)
      .join(' ')
    if (
      !window.confirm(
        `Excluir a lista de produtos${label ? ` de ${label}` : ''}? Os produtos do catálogo, simulações e pedidos permanecem inalterados. Esta ação não pode ser desfeita.`,
      )
    ) {
      return
    }
    const res = await excluirListaImportacao(lista.id)
    if (!res.ok) {
      setActionError(res.error)
      return
    }
    reload()
  }

  const emptyMessage = hasFilters
    ? 'Nenhuma lista de produtos encontrada com esses filtros.'
    : 'Nenhuma lista de produtos lançada ainda.'

  return (
    <div className="w-full min-w-0 space-y-4 sm:space-y-6">
      <div className="relative overflow-hidden rounded-2xl border border-primary-100/80 bg-gradient-to-br from-primary-50/80 via-white to-emerald-50/40 p-4 shadow-sm sm:rounded-[2rem] sm:p-6 lg:p-8">
        <div
          className="pointer-events-none absolute -right-8 -top-8 size-28 rounded-full bg-primary-200/30 blur-3xl sm:-right-10 sm:-top-10 sm:size-40"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-6 left-1/4 size-24 rounded-full bg-emerald-200/20 blur-3xl sm:-bottom-8 sm:left-1/3 sm:size-32"
          aria-hidden
        />

        <PageHeader
          eyebrow="Administração"
          title="Listas de produtos"
          description="Gerencie as listas lançadas por fornecedor e quarter. Inative para desativar os produtos no simulador, ou abra o detalhe para editar padrões."
          className="relative mb-0"
          actions={
            <Link
              to="/admin/importacao"
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-primary-600 px-4 text-sm font-medium text-white shadow-sm transition hover:bg-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 sm:w-auto"
            >
              <IconPlus className="size-4" aria-hidden />
              Nova lista
            </Link>
          }
        />

        <PageInfoBanner icon={IconClipboardList}>
          {loading
            ? 'Carregando listas de produtos…'
            : hasFilters
              ? `${total.toLocaleString('pt-BR')} lista(s) de produtos encontrada(s) na busca.`
              : `${totalCount.toLocaleString('pt-BR')} lista(s) de produtos lançada(s).`}
        </PageInfoBanner>
      </div>

      {loadError ? <AlertMessage>{loadError}</AlertMessage> : null}
      {actionError ? <AlertMessage>{actionError}</AlertMessage> : null}
      {successMessage ? (
        <AlertMessage tone="info">{successMessage}</AlertMessage>
      ) : null}

      <ListaStatsBar
        total={totalCount}
        filtered={hasFilters ? total : rows.length}
        ativas={ativasCount}
        loading={loading}
      />

      <ListaFiltersPanel
        searchQuery={searchQuery}
        fornecedorId={fornecedorFilter}
        fornecedores={fornecedores}
        quarterFilter={quarterFilter}
        statusFilter={statusFilter}
        hasFilters={hasFilters}
        onClear={clearFilters}
        onSearchChange={(e) => {
          patchFilters({ searchQuery: e.target.value, page: 1 })
        }}
        onFornecedorChange={(e) => {
          patchFilters({ fornecedorFilter: e.target.value, page: 1 })
        }}
        onQuarterChange={(e) => {
          patchFilters({ quarterFilter: e.target.value, page: 1 })
        }}
        onStatusChange={(e) => {
          patchFilters({ statusFilter: e.target.value, page: 1 })
        }}
      />

      <ListaTable
        rows={rows}
        loading={loading}
        emptyMessage={emptyMessage}
        onInativar={handleInativar}
        onReativar={handleReativar}
        onExcluir={handleExcluir}
      />

      <PaginationBar
        page={page}
        totalPages={totalPages}
        rangeStart={rangeStart}
        rangeEnd={rangeEnd}
        total={total}
        loading={loading}
        itemLabel="listas de produtos"
        onPrev={() => patchFilters({ page: Math.max(1, page - 1) })}
        onNext={() => patchFilters({ page: Math.min(totalPages, page + 1) })}
      />
    </div>
  )
}
