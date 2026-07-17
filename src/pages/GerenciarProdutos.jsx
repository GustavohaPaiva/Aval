import { useCallback, useState } from 'react'
import { ProdutoFiltersPanel, ProdutoStatsBar } from '../components/produtos/ProdutoVisuals'
import { ProdutoTable } from '../components/produtos/ProdutoTable'
import { ModalHistoricoPrecos } from '../components/produtos/ModalHistoricoPrecos'
import { ModalProdutoOficialForm } from '../components/produtos/ModalProdutoOficialForm'
import { IconPackage } from '../components/icons'
import { AlertMessage } from '../components/ui/AlertMessage'
import { Button } from '../components/ui/Button'
import { PageHeader } from '../components/ui/PageHeader'
import { PageInfoBanner } from '../components/ui/InfoStatCard'
import { PaginationBar } from '../components/ui/PaginationBar'
import { useSyncPageLoading } from '../contexts/PageLoadingContext'
import { useAbortableAsync } from '../hooks/useAbortableAsync'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import { usePersistedFilters } from '../hooks/usePersistedFilters'
import {
  fetchFornecedoresAtivos,
  fetchHistoricoPrecos,
  fetchProdutosList,
  fetchProdutosTotalCount,
  inativarProdutoOficial,
  reativarProdutoOficial,
  upsertProdutoOficialManual,
} from '../services/produtoImportacaoService'

const PAGE_SIZE = 50

function parseStatusFilter(value) {
  if (value === 'true') return true
  if (value === 'false') return false
  return undefined
}

export function GerenciarProdutos() {
  const [rows, setRows] = useState([])
  const [fornecedores, setFornecedores] = useState([])
  const [total, setTotal] = useState(0)
  const [totalCount, setTotalCount] = useState(0)
  const [ativosCount, setAtivosCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [actionError, setActionError] = useState(null)

  const [filters, , patchFilters] = usePersistedFilters('filters:produtos', {
    searchQuery: '',
    fornecedorFilter: '',
    estadoFilter: '',
    classeFilter: '',
    statusFilter: '',
    page: 1,
  })
  const {
    searchQuery,
    fornecedorFilter,
    estadoFilter,
    classeFilter,
    statusFilter,
    page,
  } = filters
  const debouncedSearch = useDebouncedValue(searchQuery, 300)

  const [modalOpen, setModalOpen] = useState(false)
  const [editingProduto, setEditingProduto] = useState(null)

  const [historicoOpen, setHistoricoOpen] = useState(false)
  const [historicoProduto, setHistoricoProduto] = useState(null)
  const [historico, setHistorico] = useState([])
  const [historicoLoading, setHistoricoLoading] = useState(false)

  const [reloadToken, setReloadToken] = useState(0)

  useSyncPageLoading(loading)

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const rangeEnd = Math.min(page * PAGE_SIZE, total)

  const hasFilters = Boolean(
    searchQuery.trim() || fornecedorFilter || statusFilter || estadoFilter || classeFilter,
  )

  useAbortableAsync(
    async (_signal, isActive) => {
      const [countRes, ativosRes, fornRes] = await Promise.all([
        fetchProdutosTotalCount(),
        fetchProdutosTotalCount({ ativo: true }),
        fetchFornecedoresAtivos(),
      ])
      if (!isActive()) return
      if (countRes.ok) setTotalCount(countRes.total)
      if (ativosRes.ok) setAtivosCount(ativosRes.total)
      if (fornRes.ok) setFornecedores(fornRes.rows)
    },
    [reloadToken],
  )

  useAbortableAsync(
    async (_signal, isActive) => {
      setLoading(true)
      setLoadError(null)

      const result = await fetchProdutosList({
        search: debouncedSearch,
        fornecedorId: fornecedorFilter || undefined,
        estado: estadoFilter || undefined,
        classe: classeFilter || undefined,
        ativo: parseStatusFilter(statusFilter),
        page,
        pageSize: PAGE_SIZE,
      })

      if (!isActive()) return

      setLoading(false)

      if (!result.ok) {
        setLoadError(result.error)
        setRows([])
        setTotal(0)
        return
      }

      setRows(result.rows)
      setTotal(result.total)
    },
    [debouncedSearch, fornecedorFilter, statusFilter, estadoFilter, classeFilter, page, reloadToken],
  )

  const reload = useCallback(() => {
    setReloadToken((n) => n + 1)
  }, [])

  const emptyMessage =
    rows.length === 0 && !hasFilters
      ? 'Nenhum produto no catálogo.'
      : 'Nenhum resultado para a busca.'

  function openCreateModal() {
    setEditingProduto(null)
    setModalOpen(true)
  }

  function closeModal() {
    setModalOpen(false)
    setEditingProduto(null)
  }

  function clearFilters() {
    patchFilters({
      searchQuery: '',
      fornecedorFilter: '',
      statusFilter: '',
      estadoFilter: '',
      classeFilter: '',
      page: 1,
    })
  }

  async function handleSaveProduto(payload) {
    setActionError(null)
    const fornecedorId =
      payload.fornecedorId ?? editingProduto?.fornecedor_id

    if (!fornecedorId) {
      return { ok: false, error: 'Selecione um fornecedor.' }
    }

    const res = await upsertProdutoOficialManual({
      fornecedorId,
      id: payload.id,
      sku_fornecedor: payload.referencia_complementar,
      referencia_complementar: payload.referencia_complementar,
      nome: payload.nome,
      estado: payload.estado,
      classe: payload.classe,
      quarter: payload.quarter,
      preco_original: payload.preco_original,
      desconto_usd: payload.desconto_usd,
      moeda_origem: payload.moeda_origem,
    })

    if (res.ok) reload()
    return res
  }

  async function handleInativar(produtoId) {
    if (!window.confirm('Inativar este produto?')) return
    setActionError(null)
    const res = await inativarProdutoOficial(produtoId)
    if (!res.ok) {
      setActionError(res.error)
      return
    }
    reload()
  }

  async function handleReativar(produtoId) {
    setActionError(null)
    const res = await reativarProdutoOficial(produtoId)
    if (!res.ok) {
      setActionError(res.error)
      return
    }
    reload()
  }

  async function handleViewHistorico(produto) {
    setHistoricoProduto(produto)
    setHistoricoOpen(true)
    setHistoricoLoading(true)
    const res = await fetchHistoricoPrecos(produto.id)
    setHistoricoLoading(false)
    if (res.ok) setHistorico(res.rows)
    else setHistorico([])
  }

  return (
    <div className="w-full min-w-0 space-y-4 sm:space-y-6">
      <div className="relative overflow-hidden rounded-2xl border border-primary-100/80 bg-gradient-to-br from-primary-50/80 via-white to-violet-50/40 p-4 shadow-sm sm:rounded-[2rem] sm:p-6 lg:p-8">
        <div
          className="pointer-events-none absolute -right-8 -top-8 size-28 rounded-full bg-primary-200/30 blur-3xl sm:-right-10 sm:-top-10 sm:size-40"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-6 left-1/4 size-24 rounded-full bg-violet-200/20 blur-3xl sm:-bottom-8 sm:left-1/3 sm:size-32"
          aria-hidden
        />

        <PageHeader
          eyebrow="Administração"
          title="Catálogo de produtos"
          description="Visualize, cadastre e gerencie os produtos lançados no catálogo oficial."
          actions={
            <Button
              type="button"
              className="w-full sm:w-auto"
              onClick={openCreateModal}
            >
              Novo produto
            </Button>
          }
          className="relative mb-0"
        />

        <PageInfoBanner icon={IconPackage}>
          {loading
            ? 'Carregando catálogo…'
            : hasFilters
              ? `${total.toLocaleString('pt-BR')} produto(s) encontrado(s) na busca.`
              : `${totalCount.toLocaleString('pt-BR')} produto(s) cadastrado(s) no catálogo.`}
        </PageInfoBanner>
      </div>

      {loadError ? <AlertMessage>{loadError}</AlertMessage> : null}
      {actionError ? <AlertMessage>{actionError}</AlertMessage> : null}

      <ProdutoStatsBar
        total={totalCount}
        filtered={hasFilters ? total : rows.length}
        ativos={ativosCount}
        loading={loading}
      />

      <ProdutoFiltersPanel
        searchQuery={searchQuery}
        fornecedorId={fornecedorFilter}
        fornecedores={fornecedores}
        estadoFilter={estadoFilter}
        classeFilter={classeFilter}
        statusFilter={statusFilter}
        hasFilters={hasFilters}
        onClear={clearFilters}
        onSearchChange={(e) => {
          patchFilters({ searchQuery: e.target.value, page: 1 })
        }}
        onFornecedorChange={(e) => {
          patchFilters({ fornecedorFilter: e.target.value, page: 1 })
        }}
        onEstadoChange={(e) => {
          patchFilters({ estadoFilter: e.target.value, page: 1 })
        }}
        onClasseChange={(e) => {
          patchFilters({ classeFilter: e.target.value, page: 1 })
        }}
        onStatusChange={(e) => {
          patchFilters({ statusFilter: e.target.value, page: 1 })
        }}
      />

      <ProdutoTable
        rows={rows}
        loading={loading}
        emptyMessage={emptyMessage}
        onEdit={(produto) => {
          setEditingProduto(produto)
          setModalOpen(true)
        }}
        onInativar={handleInativar}
        onReativar={handleReativar}
        onViewHistorico={handleViewHistorico}
      />

      <PaginationBar
        page={page}
        totalPages={totalPages}
        rangeStart={rangeStart}
        rangeEnd={rangeEnd}
        total={total}
        loading={loading}
        itemLabel="produtos"
        onPrev={() => patchFilters({ page: Math.max(1, page - 1) })}
        onNext={() => patchFilters({ page: Math.min(totalPages, page + 1) })}
      />

      <ModalProdutoOficialForm
        key={editingProduto?.id ?? 'new-produto'}
        open={modalOpen}
        onClose={closeModal}
        initial={editingProduto}
        title={editingProduto ? 'Editar produto' : 'Novo produto'}
        fornecedores={editingProduto ? undefined : fornecedores}
        onSave={handleSaveProduto}
      />

      <ModalHistoricoPrecos
        open={historicoOpen}
        onClose={() => {
          setHistoricoOpen(false)
          setHistoricoProduto(null)
          setHistorico([])
        }}
        produto={historicoProduto}
        historico={historico}
        loading={historicoLoading}
      />
    </div>
  )
}
