import { useNavigate } from 'react-router-dom'
import {
  IconBan,
  IconEye,
  IconPackage,
  IconRotateCw,
  IconSearch,
  IconTrash,
} from '../icons'
import { QUARTERS } from '../../constants/simulator'
import { IconActionButton } from '../fretes/FreteCard'
import { InfoStatCard } from '../ui/InfoStatCard'
import { Button } from '../ui/Button'
import { DataTable } from '../ui/DataTable'
import { EmptyState } from '../ui/EmptyState'
import { MobileCardList } from '../ui/MobileCardList'
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
        'inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset',
        ativo
          ? 'bg-emerald-50 text-emerald-800 ring-emerald-200'
          : 'bg-slate-100 text-slate-600 ring-slate-200',
      ].join(' ')}
    >
      {ativo ? 'Ativa' : 'Inativa'}
    </span>
  )
}

function ListaRowActions({ row, onInativar, onReativar, onExcluir }) {
  const navigate = useNavigate()
  const label = `${row.fornecedor_nome} ${row.quarter_calculado || ''}`.trim()

  return (
    <div className="flex justify-end gap-0.5">
      <IconActionButton
        label={`Abrir detalhe de ${label}`}
        onClick={() =>
          navigate(`/admin/importacao/lote/${row.id}`, {
            state: { from: 'listas' },
          })
        }
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
      <IconActionButton
        label={`Excluir lista de produtos ${label}`}
        tone="danger"
        onClick={() => onExcluir(row)}
      >
        <IconTrash className="size-3.5" />
      </IconActionButton>
    </div>
  )
}

function ListaCard({ row, onInativar, onReativar, onExcluir }) {
  const navigate = useNavigate()
  const label = `${row.fornecedor_nome} ${row.quarter_calculado || ''}`.trim()

  return (
    <li>
      <article className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm">
        <header className="border-b border-slate-100 bg-gradient-to-br from-primary-50/50 via-white to-emerald-50/30 px-4 py-3.5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-base font-semibold text-slate-900">
                {row.fornecedor_nome ?? '—'}
              </p>
              <p className="mt-0.5 text-sm font-medium text-primary-700">
                {row.quarter_calculado || 'Quarter não definido'}
              </p>
            </div>
            <StatusBadge ativo={row.ativo} />
          </div>
        </header>

        <div className="grid grid-cols-2 gap-3 px-4 py-3.5 text-sm">
          <div>
            <p className="text-xs font-medium text-slate-500">Validade</p>
            <p className="mt-0.5 font-medium text-slate-800">
              {formatDate(row.data_validade)}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">Lançamento</p>
            <p className="mt-0.5 font-medium text-slate-800">
              {formatDate(row.data_upload)}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">Estado</p>
            <p className="mt-0.5 font-medium text-slate-800">
              {row.estado_padrao || '—'}
            </p>
          </div>
          
          <div className="col-span-2 flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2">
            <IconPackage className="size-4 shrink-0 text-primary-600" />
            <p className="text-sm text-slate-700">
              <span className="font-semibold text-slate-900">
                {Number(row.produtos_count ?? 0).toLocaleString('pt-BR')}
              </span>{' '}
              produto(s)
            </p>
          </div>
        </div>

        <footer className="flex items-center gap-2 border-t border-slate-100 bg-slate-50/60 px-4 py-3">
          <Button
            type="button"
            className="min-w-0 flex-1"
            onClick={() =>
              navigate(`/admin/importacao/lote/${row.id}`, {
                state: { from: 'listas' },
              })
            }
          >
            <IconEye className="size-4" aria-hidden />
            Abrir
          </Button>
          {row.ativo ? (
            <Button
              type="button"
              variant="secondary"
              className="shrink-0"
              aria-label={`Inativar ${label}`}
              onClick={() => onInativar(row)}
            >
              <IconBan className="size-4" aria-hidden />
            </Button>
          ) : (
            <Button
              type="button"
              variant="secondary"
              className="shrink-0"
              aria-label={`Reativar ${label}`}
              onClick={() => onReativar(row)}
            >
              <IconRotateCw className="size-4" aria-hidden />
            </Button>
          )}
          <Button
            type="button"
            variant="secondary"
            className="shrink-0"
            aria-label={`Excluir lista de produtos ${label}`}
            onClick={() => onExcluir(row)}
          >
            <IconTrash className="size-4" aria-hidden />
          </Button>
        </footer>
      </article>
    </li>
  )
}

export function ListaStatsBar({ total, filtered, ativas, loading }) {
  const items = [
    {
      label: 'Listas de produtos',
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
      accent: 'text-sky-700 bg-sky-50',
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
      <div className="border-b border-slate-100 bg-gradient-to-r from-primary-50/70 via-white to-emerald-50/40 px-4 py-3.5 sm:px-6 sm:py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary-700">
              Busca e filtros
            </p>
            <p className="mt-1 text-sm text-slate-600">
              Filtre listas de produtos por fornecedor, quarter ou status.
            </p>
          </div>
          {hasFilters ? (
            <Button type="button" variant="secondary" onClick={onClear}>
              Limpar filtros
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-6 lg:grid-cols-4">
        <div className="sm:col-span-2 lg:col-span-1">
          <label
            htmlFor="listas-busca"
            className="mb-1.5 block text-sm font-medium text-slate-700"
          >
            Quarter ou estado
          </label>
          <SearchInput
            id="listas-busca"
            ariaLabel="Buscar por quarter ou estado"
            placeholder="Ex.: Q2, MT…"
            value={searchQuery}
            onChange={onSearchChange}
          />
        </div>
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
    </section>
  )
}

export function ListaTable({
  rows,
  loading,
  emptyMessage,
  onInativar,
  onReativar,
  onExcluir,
}) {
  if (loading) {
    return (
      <section className="rounded-2xl border border-slate-200/90 bg-white p-8 text-center text-sm text-slate-500 shadow-sm sm:rounded-3xl">
        Carregando listas de produtos…
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
      cell: (row) => (
        <span className="font-medium text-slate-900">
          {row.fornecedor_nome ?? '—'}
        </span>
      ),
    },
    {
      key: 'quarter',
      header: 'Quarter',
      cell: (row) => (
        <span className="inline-flex rounded-lg bg-primary-50 px-2 py-1 text-xs font-semibold text-primary-800 ring-1 ring-inset ring-primary-100">
          {row.quarter_calculado || '—'}
        </span>
      ),
    },
    {
      key: 'estado',
      header: 'Estado',
      cell: (row) => row.estado_padrao || '-',
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
      cell: (row) => (
        <span className="font-semibold tabular-nums text-slate-900">
          {Number(row.produtos_count ?? 0).toLocaleString('pt-BR')}
        </span>
      ),
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
      cell: (row) => (
        <ListaRowActions
          row={row}
          onInativar={onInativar}
          onReativar={onReativar}
          onExcluir={onExcluir}
        />
      ),
    },
  ]

  return (
    <>
      <DataTable
        columns={columns}
        rows={rows}
        getRowKey={(row) => row.id}
      />

      <MobileCardList
        items={rows}
        loading={false}
        emptyMessage={emptyMessage}
        renderItem={(row) => (
          <ListaCard
            key={row.id}
            row={row}
            onInativar={onInativar}
            onReativar={onReativar}
            onExcluir={onExcluir}
          />
        )}
      />
    </>
  )
}
