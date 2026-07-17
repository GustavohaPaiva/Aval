import { useNavigate } from 'react-router-dom'
import { IconBan, IconEye, IconPackage, IconRotateCw, IconSearch } from '../icons'
import { QUARTERS } from '../../constants/simulator'
import { IconActionButton } from '../fretes/FreteCard'
import { InfoStatCard } from '../ui/InfoStatCard'
import { Button } from '../ui/Button'
import { DataTable } from '../ui/DataTable'
import { EmptyState } from '../ui/EmptyState'
import { SearchInput } from '../ui/SearchInput'
import { Select } from '../ui/Select'

const STATUS_OPTIONS = [
  { value: '', label: 'Todos os status' },
  { value: 'true', label: 'Ativas' },
  { value: 'false', label: 'Inativas' },
]

function formatDate(value) {
  if (!value) return '—'
  const d = new Date(`${String(value).slice(0, 10)}T12:00:00`)
  if (Number.isNaN(d.getTime())) return String(value)
  return d.toLocaleDateString('pt-BR')
}

function StatusBadge({ ativo }) {
  return (
    <span
      className={[
        'inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset',
        ativo
          ? 'bg-emerald-50 text-emerald-800 ring-emerald-200'
          : 'bg-slate-100 text-slate-600 ring-slate-200',
      ].join(' ')}
    >
      {ativo ? 'Ativa' : 'Inativa'}
    </span>
  )
}

export function ListaStatsBar({ total, filtered, ativas, loading }) {
  const items = [
    {
      label: 'Listas lançadas',
      value: loading ? '—' : String(total),
      hint: 'Lotes concluídos',
      icon: IconPackage,
      accent: 'text-primary-600 bg-primary-50',
    },
    {
      label: 'Ativas',
      value: loading ? '—' : String(ativas),
      hint: 'Produtos disponíveis',
      icon: IconPackage,
      accent: 'text-emerald-700 bg-emerald-50',
    },
    {
      label: 'Na listagem',
      value: loading ? '—' : String(filtered),
      hint: 'Resultados visíveis',
      icon: IconSearch,
      accent: 'text-violet-700 bg-violet-50',
    },
  ]

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {items.map((item) => (
        <InfoStatCard key={item.label} {...item} className="p-2 sm:p-4" />
      ))}
    </div>
  )
}

export function ListaFiltersPanel({
  searchQuery,
  onSearchChange,
  fornecedorId,
  onFornecedorChange,
  fornecedores,
  quarterFilter,
  onQuarterChange,
  statusFilter,
  onStatusChange,
  onClear,
  hasFilters,
}) {
  const fornecedorOptions = [
    { value: '', label: 'Todos os fornecedores' },
    ...(fornecedores?.map((f) => ({ value: f.id, label: f.nome })) ?? []),
  ]

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm sm:rounded-3xl">
      <div className="border-b border-slate-100 bg-gradient-to-r from-primary-50/70 via-white to-violet-50/40 px-4 py-3.5 sm:px-6 sm:py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary-700">
              Busca e filtros
            </p>
            <p className="mt-1 text-sm text-slate-600">
              Filtre listas por fornecedor, quarter ou status.
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            className="h-9 w-full shrink-0 px-3 sm:w-auto"
            disabled={!hasFilters}
            onClick={onClear}
          >
            Limpar filtros
          </Button>
        </div>
      </div>

      <div className="space-y-4 p-4 sm:p-6">
        <div>
          <label
            htmlFor="lista-filter-busca"
            className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500"
          >
            <IconSearch className="size-3.5" />
            Quarter ou estado
          </label>
          <SearchInput
            id="lista-filter-busca"
            ariaLabel="Buscar lista"
            placeholder="Ex.: Q2, MG…"
            value={searchQuery}
            onChange={onSearchChange}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Select
            label="Fornecedor"
            value={fornecedorId}
            onChange={onFornecedorChange}
            options={fornecedorOptions}
          />
          <Select
            label="Quarter"
            value={quarterFilter}
            onChange={onQuarterChange}
            options={[{ value: '', label: 'Todos' }, ...QUARTERS]}
          />
          <Select
            label="Status"
            value={statusFilter}
            onChange={onStatusChange}
            options={STATUS_OPTIONS}
          />
        </div>
      </div>
    </section>
  )
}

export function ListaTable({
  rows,
  loading,
  emptyMessage,
  onInativar,
  onReativar,
}) {
  const navigate = useNavigate()

  if (loading) {
    return (
      <section className="rounded-2xl border border-slate-200/90 bg-white p-8 text-center text-sm text-slate-500 shadow-sm sm:rounded-3xl">
        Carregando listas…
      </section>
    )
  }

  if (rows.length === 0) {
    return (
      <section className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm sm:rounded-3xl sm:p-10">
        <EmptyState title={emptyMessage} />
      </section>
    )
  }

  const columns = [
    {
      key: 'fornecedor',
      header: 'Fornecedor',
      cell: (row) => row.fornecedor_nome ?? '—',
    },
    {
      key: 'quarter',
      header: 'Quarter',
      cell: (row) => row.quarter_calculado || '—',
    },
    {
      key: 'validade',
      header: 'Validade',
      cell: (row) => formatDate(row.data_validade),
    },
    {
      key: 'upload',
      header: 'Lançamento',
      cell: (row) => formatDate(row.data_upload),
    },
    {
      key: 'produtos',
      header: 'Produtos',
      align: 'right',
      cell: (row) => Number(row.produtos_count ?? 0).toLocaleString('pt-BR'),
    },
    {
      key: 'status',
      header: 'Status',
      cell: (row) => <StatusBadge ativo={row.ativo} />,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (row) => {
        const label = `${row.fornecedor_nome} ${row.quarter_calculado || ''}`.trim()
        return (
          <div className="flex justify-end gap-0.5">
            <IconActionButton
              label={`Abrir detalhe de ${label}`}
              onClick={() => navigate(`/admin/importacao/lote/${row.id}`)}
            >
              <IconEye className="size-3.5" />
            </IconActionButton>
            {row.ativo ? (
              <IconActionButton
                label={`Inativar ${label}`}
                tone="danger"
                onClick={() => onInativar(row)}
              >
                <IconBan className="size-3.5" />
              </IconActionButton>
            ) : (
              <IconActionButton
                label={`Reativar ${label}`}
                onClick={() => onReativar(row)}
              >
                <IconRotateCw className="size-3.5" />
              </IconActionButton>
            )}
          </div>
        )
      },
    },
  ]

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm sm:rounded-3xl">
      <DataTable columns={columns} rows={rows} getRowKey={(row) => row.id} />
    </section>
  )
}
