import { IconPackage, IconSearch } from '../icons'
import { CLASSES_PRODUTO, ESTADOS_PRODUTO } from '../../constants/mapeamentoCampos'
import { InfoStatCard } from '../ui/InfoStatCard'
import { Button } from '../ui/Button'
import { SearchInput } from '../ui/SearchInput'
import { Select } from '../ui/Select'

const STATUS_OPTIONS = [
  { value: '', label: 'Todos os status' },
  { value: 'true', label: 'Ativos' },
  { value: 'false', label: 'Inativos' },
]

export function ProdutoFiltersPanel({
  searchQuery,
  onSearchChange,
  fornecedorId,
  onFornecedorChange,
  fornecedores,
  estadoFilter,
  onEstadoChange,
  classeFilter,
  onClasseChange,
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
              Encontre produtos por fertilizante, referência ou fornecedor.
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
            htmlFor="produto-filter-busca"
            className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500"
          >
            <IconSearch className="size-3.5" />
            Fertilizante ou referência
          </label>
          <SearchInput
            id="produto-filter-busca"
            ariaLabel="Buscar produto"
            placeholder="Ex.: Ureia, MAP, YARA-001…"
            value={searchQuery}
            onChange={onSearchChange}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Select
            label="Fornecedor"
            value={fornecedorId}
            onChange={onFornecedorChange}
            options={fornecedorOptions}
          />
          <Select
            label="Estado"
            value={estadoFilter}
            onChange={onEstadoChange}
            options={[{ value: '', label: 'Todos' }, ...ESTADOS_PRODUTO]}
          />
          <Select
            label="Classe"
            value={classeFilter}
            onChange={onClasseChange}
            options={[{ value: '', label: 'Todas' }, ...CLASSES_PRODUTO]}
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

export function ProdutoStatsBar({ total, filtered, ativos, loading }) {
  const items = [
    {
      label: 'Catálogo',
      value: loading ? '—' : String(total),
      hint: 'Produtos cadastrados',
      icon: IconPackage,
      accent: 'text-primary-600 bg-primary-50',
    },
    {
      label: 'Ativos',
      value: loading ? '—' : String(ativos),
      hint: 'Disponíveis no simulador',
      icon: IconPackage,
      accent: 'text-emerald-700 bg-emerald-50',
    },
    {
      label: 'Na listagem',
      value: loading ? '—' : String(filtered),
      hint: 'Resultados visíveis',
      icon: IconPackage,
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
