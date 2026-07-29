import { Link } from 'react-router-dom'
import { IconPackage } from '../icons'
import { ImportacaoStatusBadge } from './ImportacaoVisuals'
import { Button } from '../ui/Button'
import { ButtonGroup } from '../ui/ButtonGroup'
import { SearchInput } from '../ui/SearchInput'
import { Select } from '../ui/Select'
import { formatLoteDate, fornecedorInitial } from '../../utils/importacaoVisuals'

export function LoteProfileHero({
  lote,
  productsCount = 0,
  semEstadoCount = 0,
  launched = false,
}) {
  const quarter = lote.quarter_calculado?.trim()
  const moeda = lote.moeda_detectada?.trim()
  const isInactive = lote.ativo === false

  return (
    <div className="relative overflow-hidden rounded-2xl border border-primary-100/80 bg-gradient-to-br from-primary-50/80 via-white to-emerald-50/40 p-4 shadow-sm sm:rounded-[2rem] sm:p-6 lg:p-8">
      <div
        className="pointer-events-none absolute -right-8 -top-8 size-28 rounded-full bg-primary-200/30 blur-3xl sm:-right-10 sm:-top-10 sm:size-40"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -bottom-6 left-1/4 size-24 rounded-full bg-emerald-200/20 blur-3xl sm:-bottom-8 sm:left-1/3 sm:size-32"
        aria-hidden
      />

      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:items-start sm:text-left">
          <span className="flex size-16 shrink-0 items-center justify-center rounded-3xl bg-primary-600 text-2xl font-semibold text-white shadow-md ring-4 ring-white/80">
            {fornecedorInitial(lote.fornecedor_nome)}
          </span>
          <div className="min-w-0">
            <div className="flex flex-col items-center gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2.5">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary-700">
                {launched ? 'Lista de produtos' : 'Revisão de lote'}
              </p>
              <ImportacaoStatusBadge status={lote.status} />
              {isInactive ? (
                <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
                  Inativa
                </span>
              ) : null}
            </div>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
              {lote.fornecedor_nome}
            </h1>
            <div className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 text-sm text-slate-600 sm:justify-start">
              {quarter ? (
                <span className="inline-flex items-center rounded-lg bg-primary-50 px-2 py-0.5 text-xs font-semibold text-primary-800 ring-1 ring-inset ring-primary-100">
                  {quarter}
                </span>
              ) : (
                <span className="text-amber-700">Quarter pendente</span>
              )}
              {moeda ? <span>Moeda {moeda}</span> : null}
              <span>Enviado em {formatLoteDate(lote.data_upload)}</span>
            </div>
            {isInactive ? (
              <p className="mt-2 text-sm text-slate-500">
                Lista inativa: produtos vinculados não aparecem no simulador.
              </p>
            ) : null}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:min-w-[14rem]">
          <div className="rounded-2xl border border-white/80 bg-white/80 px-3 py-2.5 text-center shadow-sm backdrop-blur-sm">
            <p className="text-lg font-semibold tabular-nums text-slate-900">
              {productsCount}
            </p>
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-slate-500">
              Produtos
            </p>
          </div>
          <div
            className={[
              'rounded-2xl border px-3 py-2.5 text-center shadow-sm backdrop-blur-sm',
              semEstadoCount > 0 && !launched
                ? 'border-amber-200/80 bg-amber-50/90'
                : 'border-white/80 bg-white/80',
            ].join(' ')}
          >
            <p
              className={[
                'text-lg font-semibold tabular-nums',
                semEstadoCount > 0 && !launched
                  ? 'text-amber-800'
                  : 'text-slate-900',
              ].join(' ')}
            >
              {launched ? lote.estado_padrao || '—' : semEstadoCount}
            </p>
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-slate-500">
              {launched ? 'Estado' : 'Sem estado'}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export function SiblingQuartersNav({
  siblingLotes = [],
  currentLoteId,
  currentQuarter,
}) {
  const others = siblingLotes.filter(
    (s) => String(s.loteId) !== String(currentLoteId),
  )
  if (!others.length) return null

  const allKnown = [
    { loteId: currentLoteId, quarter: currentQuarter },
    ...others,
  ]

  return (
    <section className="overflow-hidden rounded-2xl border border-sky-200/80 bg-gradient-to-r from-sky-50/80 via-white to-primary-50/40 shadow-sm sm:rounded-3xl">
      <div className="px-4 py-3.5 sm:px-6 sm:py-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-700">
            <IconPackage className="size-4" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-800">
              Planilha com múltiplos quarters
            </p>
            <p className="mt-1 text-sm text-slate-600">
              Cada quarter vira um lançamento independente. Valide e promova um
              por um.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="inline-flex items-center rounded-xl bg-primary-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm">
                {currentQuarter || 'Lote atual'}
              </span>
              {others.map((sibling) => (
                <Link
                  key={sibling.loteId}
                  to={`/admin/importacao/lote/${sibling.loteId}`}
                  state={{
                    siblingLotes: allKnown.filter(
                      (s) => String(s.loteId) !== String(sibling.loteId),
                    ),
                    from: 'importacao',
                  }}
                  className="inline-flex items-center rounded-xl bg-white px-3 py-1.5 text-sm font-semibold text-primary-700 ring-1 ring-sky-200/80 transition hover:bg-sky-50 hover:ring-sky-300"
                >
                  {sibling.quarter || 'Lote'}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

export function LoteProductsSection({
  productsCount,
  launched,
  inactive,
  semEstadoCount,
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  statusFilterOptions,
  showStatusFilter,
  onAddProduct,
  onLaunch,
  canLaunch,
  errorCount = 0,
  onShowErrors,
  children,
}) {
  return (
    <section className="space-y-4">
      <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm sm:rounded-3xl">
        <div className="border-b border-slate-100 bg-gradient-to-r from-primary-50/70 via-white to-emerald-50/40 px-4 py-3.5 sm:px-6 sm:py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary-700">
                {launched ? 'Produtos do catálogo' : 'Produtos do lote'}
              </p>
              <p className="mt-1 text-sm text-slate-600">
                {productsCount} produto(s)
                {semEstadoCount > 0 && !launched
                  ? ` · ${semEstadoCount} sem estado`
                  : ''}
                {launched ? ' · catálogo oficial' : ''}
                {inactive ? ' · lista inativa' : ''}
              </p>
            </div>
            {!launched ? (
              <ButtonGroup align="stretch" className="sm:w-auto">
                <Button type="button" variant="secondary" onClick={onAddProduct}>
                  Adicionar produto
                </Button>
                <Button type="button" disabled={!canLaunch} onClick={onLaunch}>
                  Lançar produtos
                </Button>
              </ButtonGroup>
            ) : null}
          </div>
        </div>

        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end sm:justify-between sm:p-5">
          <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex w-full flex-col gap-1.5 sm:max-w-xs">
              <label
                htmlFor="lote-produto-busca"
                className="text-sm font-medium text-slate-700"
              >
                Buscar produto
              </label>
              <SearchInput
                id="lote-produto-busca"
                ariaLabel="Buscar produto por nome"
                placeholder="Ex.: Ureia, MAP…"
                value={searchQuery}
                onChange={onSearchChange}
              />
            </div>
            {showStatusFilter ? (
              <div className="w-full sm:max-w-xs">
                <Select
                  label="Filtrar produtos"
                  value={statusFilter}
                  onChange={onStatusFilterChange}
                  options={statusFilterOptions}
                />
              </div>
            ) : null}
          </div>
          {!launched && errorCount > 0 && statusFilter !== 'erro' ? (
            <Button
              type="button"
              variant="secondary"
              className="sm:shrink-0"
              onClick={onShowErrors}
            >
              Ver apenas erros ({errorCount})
            </Button>
          ) : null}
        </div>
      </div>

      {children}
    </section>
  )
}

export function LoteLaunchBar({
  canLaunch,
  launching,
  onLaunch,
  summary,
  quarter,
  moeda,
}) {
  if (!canLaunch && !summary) return null

  return (
    <div className="sticky bottom-0 z-10 -mx-4 border-t border-slate-200/80 bg-white/95 px-4 py-4 backdrop-blur-sm sm:mx-0 sm:rounded-2xl sm:border sm:shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">
            Pronto para lançar?
          </p>
          <p className="mt-0.5 text-xs text-slate-600">
            {summary
              ? `${summary.novos} novo(s) · ${summary.atualizacoes} atualização(ões)${
                  quarter ? ` · ${quarter}` : ''
                }${moeda ? ` · ${moeda}` : ''}`
              : 'Revise os metadados e produtos antes de publicar no catálogo.'}
          </p>
        </div>
        <Button
          type="button"
          disabled={!canLaunch}
          loading={launching}
          onClick={onLaunch}
          className="sm:shrink-0"
        >
          Lançar produtos
        </Button>
      </div>
    </div>
  )
}
