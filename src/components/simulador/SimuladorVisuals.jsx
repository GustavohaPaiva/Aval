import {
  IconClipboardList,
  IconDollarSign,
  IconPackage,
  IconTruck,
  IconUser,
} from '../icons'
import { InfoStatCard } from '../ui/InfoStatCard'
import { calcComissaoMediaPercentual } from '../../utils/comissaoCalculations'
import { formatBRL, formatComissaoPctValor, formatPercent } from '../../utils/money'

export function SimuladorSectionPanel({
  icon: Icon,
  title,
  description,
  actions,
  children,
  gradient = 'from-primary-50/70 via-white to-violet-50/40',
}) {
  return (
    <section className="overflow-visible rounded-2xl border border-slate-200/90 bg-white shadow-sm sm:rounded-3xl">
      <div
        className={[
          'border-b border-slate-100 bg-gradient-to-r px-4 py-3.5 sm:px-6 sm:py-4',
          gradient,
        ].join(' ')}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            {Icon ? (
              <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-700">
                <Icon className="size-4" />
              </span>
            ) : null}
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary-700">
                {title}
              </p>
              {description ? (
                <p className="mt-0.5 text-sm text-slate-600">{description}</p>
              ) : null}
            </div>
          </div>
          {actions ? (
            <div className="flex flex-col gap-2 sm:shrink-0 sm:flex-row">
              {actions}
            </div>
          ) : null}
        </div>
      </div>
      <div className="p-4 sm:p-6">{children}</div>
    </section>
  )
}

export function SimuladorSummaryBar({
  totalValor,
  totalProposta,
  globalStatus,
  showMargem = false,
  margemLucroTotal = null,
  margemLucroValorTotal = null,
  showComissao = false,
  comissaoValorTotal = null,
  comissaoMediaPercentual = null,
}) {
  const statusAccent =
    globalStatus === 'Aprovado'
      ? 'text-emerald-700 bg-emerald-50'
      : globalStatus === 'Pendente'
        ? 'text-amber-700 bg-amber-50'
        : 'text-slate-700 bg-slate-100'

  const items = [
    {
      label: 'Valor bruto',
      value: formatBRL(totalValor),
      hint: 'Soma do catálogo',
      icon: IconDollarSign,
      accent: 'text-sky-700 bg-sky-50',
    },
    {
      label: 'Proposta',
      value: formatBRL(totalProposta),
      hint: 'Total negociado',
      icon: IconDollarSign,
      accent: 'text-violet-700 bg-violet-50',
    },
  ]

  if (showMargem) {
    items.push(
      {
        label: 'Margem',
        value: formatPercent(margemLucroTotal),
        hint: 'Lucro sobre o custo',
        icon: IconDollarSign,
        accent: 'text-emerald-700 bg-emerald-50',
      },
      {
        label: 'Margem R$',
        value:
          margemLucroValorTotal == null
            ? '—'
            : formatBRL(margemLucroValorTotal),
        hint: 'Lucro em reais',
        icon: IconDollarSign,
        accent: 'text-teal-700 bg-teal-50',
      },
    )
  }

  if (showComissao) {
    const media =
      comissaoMediaPercentual == null
        ? calcComissaoMediaPercentual(comissaoValorTotal, totalProposta)
        : Number(comissaoMediaPercentual)
    items.push({
      label: 'Comissão',
      value: formatComissaoPctValor(media, comissaoValorTotal),
      hint: 'Média e total do consultor',
      icon: IconDollarSign,
      accent: 'text-amber-700 bg-amber-50',
      valueClassName:
        'finance-text text-sm font-semibold leading-snug tracking-tight text-slate-900 sm:text-base',
    })
  }

  items.push({
    label: 'Status',
    value: globalStatus,
    hint: 'Situação da simulação',
    icon: IconClipboardList,
    accent: statusAccent,
  })

  const cols =
    items.length >= 6
      ? 'grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6'
      : items.length >= 5
        ? 'grid-cols-2 gap-3 lg:grid-cols-5'
        : items.length === 4
          ? 'grid-cols-2 gap-3 lg:grid-cols-4'
          : 'grid-cols-2 gap-3 sm:grid-cols-3'

  return (
    <div className={`grid ${cols}`}>
      {items.map((item, index) => {
        const isLast = index === items.length - 1
        const orphanFullWidth =
          isLast &&
          items.length % 2 === 1 &&
          (items.length === 3
            ? 'col-span-2 sm:col-span-1'
            : items.length >= 5
              ? 'col-span-2 lg:col-span-1'
              : '')

        return (
          <InfoStatCard
            key={item.label}
            {...item}
            className={['p-3 sm:p-4', orphanFullWidth]
              .filter(Boolean)
              .join(' ')}
            valueClassName={
              item.valueClassName ??
              'finance-text truncate text-base font-semibold leading-tight tracking-tight text-slate-900 sm:text-lg'
            }
          />
        )
      })}
    </div>
  )
}

export const SIMULADOR_SECTION_ICONS = {
  cliente: IconUser,
  frete: IconTruck,
  produtos: IconPackage,
  cotacao: IconClipboardList,
  consolidacao: IconDollarSign,
}
