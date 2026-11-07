import { useEffect, useId, useMemo, useRef, useState, useTransition } from 'react'
import { Link } from 'react-router-dom'
import { filialOptions } from '../../constants/compras'
import { CLASSES_PRODUTO } from '../../constants/mapeamentoCampos'
import { CULTURES } from '../../constants/simulator'
import { useDashboardShell } from '../../contexts/DashboardShellContext'
import { IconChevronLeft, IconChevronRight, IconClipboardList } from '../icons'
import { AlertMessage } from '../ui/AlertMessage'
import { Button } from '../ui/Button'
import { DatePicker } from '../ui/DatePicker'
import { InfoStatCard } from '../ui/InfoStatCard'
import { MobileCardList } from '../ui/MobileCardList'
import { PageHeader } from '../ui/PageHeader'
import { Select } from '../ui/Select'
import { useAbortableAsync } from '../../hooks/useAbortableAsync'
import { useAuth } from '../../hooks/useAuth'
import { peekSalesDashboard } from '../../services/salesDashboardCache'
import { loadSalesDashboard } from '../../services/salesDashboardService'
import {
  BRANCHES,
  aggregateSales,
  annualLadder,
  applyAliases,
  cashFlow,
  commercialRows,
  compareYears,
  filterSales,
  formatCompactBRL,
  goalTone,
  groupSales,
  heatmap,
  lastWeeks,
  marginTone,
  markFamily,
  measureOf,
  modalitySplit,
  movingAverage,
  supplierCompare,
  unifySales,
  weeklySales,
  weeklySummary,
  withDerived,
  yearSeries,
  DEFAULT_MARGIN_RULES,
} from '../../utils/salesDashboard'
import { formatPercentPoints } from '../../utils/money'

const TABS = [
  ['overview', 'Visão Geral'],
  ['week', 'Semana Atual'],
  ['cash', 'Fluxo de Caixa'],
  ['annual', 'Comparativo Anual'],
  ['consultants', 'Comparativo de Consultores'],
  ['margin', 'Margem vs Média'],
]
const MEASURES = [
  ['revenue', 'Faturamento'],
  ['volume', 'Volume (t)'],
  ['margin', 'Margem %'],
]
const MONTH_LABELS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
const FILTER_FIELDS = ['branch', 'saleType', 'supplier', 'culture', 'productType', 'product', 'consultant', 'client', 'harvest', 'month', 'year']
const CARD = 'rounded-2xl border border-slate-200/90 bg-white shadow-sm sm:rounded-3xl'
const todayKey = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
const toneClass = { red: 'text-red-700', watch: 'text-amber-700', healthy: 'text-emerald-700' }
const tons = (value) => value == null ? '—' : `${Math.round(value).toLocaleString('pt-BR')} t`
const pct = (value, digits = 2) => formatPercentPoints(value, digits)
const brDate = (value) => value ? value.slice(0, 10).split('-').reverse().join('/') : '—'
const money = (hasRows, value) => hasRows ? formatCompactBRL(value) : '—'
const volumeText = (hasRows, value) => hasRows ? tons(value) : '—'

function Panel({ title, children, action, className = '', accent = false }) {
  return (
    <section className={['mb-2.5 p-3.5', CARD, accent ? 'border-l-[3px] border-l-primary-600' : '', className].filter(Boolean).join(' ')}>
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xs font-semibold text-slate-500">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

function KpiGrid({ children, className = '' }) {
  return <div className={`mb-2.5 grid grid-cols-2 gap-2 lg:grid-cols-4 ${className}`}>{children}</div>
}

function Kpi({ label, value, hint }) {
  return (
    <div className={`${CARD} px-3.5 py-3`}>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-0.5 text-xl font-bold tabular-nums leading-tight text-slate-900">{value}</p>
      {hint ? <p className="mt-0.5 truncate text-[11px] text-slate-500">{hint}</p> : null}
    </div>
  )
}

function Dash() {
  return <p className="text-sm text-slate-400">—</p>
}

function MeasureSwitch({ value, onChange }) {
  return (
    <div className="inline-flex overflow-hidden rounded-xl border border-slate-200" role="group" aria-label="Medida do gráfico">
      {MEASURES.map(([key, label]) => (
        <button key={key} type="button" aria-pressed={value === key} onClick={() => onChange(key)} className={`px-2 py-1 text-[10px] font-semibold ${value === key ? 'bg-primary-600 text-white' : 'bg-white text-slate-500 hover:text-slate-800'}`}>{label}</button>
      ))}
    </div>
  )
}

function SeriesChart({ points, measure, highlight }) {
  if (!points.length) return <Dash />
  const values = points.map((point) => measureOf(point, measure) ?? 0)
  const average = measure === 'revenue' ? movingAverage(values) : null
  const max = Math.max(1, ...values, ...(average ?? []))
  return (
    <div className="space-y-3">
      <div className="relative h-44">
        <div className="flex h-full items-end gap-1" role="img" aria-label="Série do período. Os valores completos estão na lista abaixo.">
          {points.map((point, index) => (
            <div key={point.label || point.date || index} className="flex h-full min-w-5 flex-1 items-end" title={point.label}>
              <div className={`w-full rounded-t ${highlight && point.label === highlight ? 'bg-amber-500' : 'bg-primary-500'}`} style={{ height: `${Math.max(values[index] ? 2 : 0, Math.abs(values[index]) / max * 100)}%` }} />
            </div>
          ))}
        </div>
        {average ? (
          <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 ${Math.max(points.length, 1) * 10} 100`} preserveAspectRatio="none" aria-hidden="true">
            <polyline fill="none" stroke="#b45309" strokeWidth="1.5" vectorEffect="non-scaling-stroke" points={average.map((value, index) => `${index * 10 + 5},${(100 - (value / max) * 96).toFixed(2)}`).join(' ')} />
          </svg>
        ) : null}
      </div>
      {average ? <p className="text-[11px] text-amber-800">Média móvel de quatro semanas.</p> : null}
      <ul className="sr-only">
        {points.map((point) => (
          <li key={point.label}>{brDate(point.label)}: {formatCompactBRL(point.revenue)} · {tons(point.volume)} · {pct(point.marginPercent, 1)}</li>
        ))}
      </ul>
    </div>
  )
}

function RankTable({ title, rows, field }) {
  const data = groupSales(rows, field).slice(0, 10)
  const columns = [
    { key: 'label', header: 'Nome', cell: (row) => row.label },
    { key: 'revenue', header: 'Faturamento', align: 'right', cell: (row) => formatCompactBRL(row.revenue) },
    { key: 'volume', header: 'Volume', align: 'right', cell: (row) => tons(row.volume) },
    { key: 'margin', header: 'Margem', align: 'right', cell: (row) => pct(row.marginPercent, 1) },
  ]
  return (
    <Panel title={title} className="h-full">
      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full text-left text-[11px]">
          <thead>
            <tr>{columns.map((column) => <th key={column.key} className={`border-b border-slate-200 px-1.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500 ${column.align === 'right' ? 'text-right' : ''}`}>{column.header}</th>)}</tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr key={row.label} className="border-b border-slate-100 last:border-0">
                {columns.map((column) => (
                  <td key={column.key} className={`px-1.5 py-1 tabular-nums ${column.align === 'right' ? 'text-right' : 'font-medium'}`}>{column.cell(row)}</td>
                ))}
              </tr>
            ))}
            {!data.length ? <tr><td colSpan={columns.length} className="px-1.5 py-3 text-slate-400">—</td></tr> : null}
          </tbody>
        </table>
      </div>
      <MobileCardList items={data} emptyMessage="Nenhum registro neste recorte." renderItem={(row) => (
        <li key={row.label} className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="font-medium text-slate-800">{row.label}</p>
          <p className="mt-1 text-sm text-slate-600">{formatCompactBRL(row.revenue)} · {tons(row.volume)} · {pct(row.marginPercent, 1)}</p>
        </li>
      )} />
    </Panel>
  )
}

function ShareRings({ rows }) {
  const groups = [
    ['Por cultura', 'culture'],
    ['Por fornecedor', 'supplier'],
    ['Por tipo de produto', 'productType'],
  ]
  return (
    <div className="grid gap-2.5 lg:grid-cols-3">
      {groups.map(([title, field]) => {
        const parts = groupSales(rows, field).slice(0, 6)
        const total = parts.reduce((sum, part) => sum + part.revenue, 0)
        let cursor = 0
        const stops = total ? parts.map((part, index) => {
          const start = cursor
          cursor += part.revenue / total * 100
          const color = ['#0f766e', '#ca8a04', '#0369a1', '#7c3aed', '#b45309', '#475569'][index]
          return `${color} ${start}% ${cursor}%`
        }) : []
        return (
          <Panel key={field} title={title}>
            {parts.length ? (
              <>
                <div className="mx-auto size-36 rounded-full" style={{ background: `conic-gradient(${stops.join(',') || '#e2e8f0 0 100%'})` }} role="img" aria-label={title} />
                <ul className="mt-3 space-y-1 text-sm text-slate-600">
                  {parts.map((part) => <li key={part.label}>{part.label}: {formatCompactBRL(part.revenue)} ({pct(total ? part.revenue / total * 100 : null, 1)})</li>)}
                </ul>
              </>
            ) : <Dash />}
          </Panel>
        )
      })}
    </div>
  )
}

function deltaHint(delta, kind) {
  if (delta == null) return ''
  const sign = delta > 0 ? '+' : ''
  if (kind === 'volume') return `${sign}${Math.round(delta).toLocaleString('pt-BR')} t`
  return `${sign}${formatCompactBRL(delta)}`
}

function Overview({ rows, measure, setMeasure, dollar, snapshotDelta, familyKnown, alerts }) {
  const hasRows = rows.length > 0
  const stats = aggregateSales(rows)
  const commercial = commercialRows(rows)
  const commercialStats = commercial ? aggregateSales(commercial) : null
  const cards = [
    ['Faturamento', money(hasRows, stats.revenue), deltaHint(snapshotDelta?.revenue, 'money')],
    ['Volume total', volumeText(hasRows, stats.volume), deltaHint(snapshotDelta?.volume, 'volume')],
    ['Margem líquida', hasRows ? pct(stats.marginPercent) : '—', hasRows && stats.margin != null ? formatCompactBRL(stats.margin) : ''],
    ['Margem em reais', hasRows ? (stats.margin == null ? '—' : formatCompactBRL(stats.margin)) : '—', deltaHint(snapshotDelta?.margin, 'money')],
    ['Pedidos', hasRows ? String(stats.orders) : '—', hasRows ? `${stats.clients} clientes · ${stats.consultants} consultores` : ''],
    ['Ticket médio', hasRows ? formatCompactBRL(stats.ticket) : '—', ''],
    ['Preço médio / t', hasRows ? formatCompactBRL(stats.pricePerTon) : '—', 'R$/t'],
    ['Receita líquida / t', hasRows ? (stats.marginPerTon == null ? '—' : formatCompactBRL(stats.marginPerTon)) : '—', dollar && stats.marginPerTon != null ? `US$ ${(stats.marginPerTon / dollar).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}` : ''],
  ]
  const branches = rows.some((row) => row.branch)
  const [branchMeasure, setBranchMeasure] = useState(measure)
  return (
    <div>
      <KpiGrid>
        {cards.map(([label, value, hint]) => <Kpi key={label} label={label} value={value} hint={hint} />)}
      </KpiGrid>
      {familyKnown ? (
        <KpiGrid>
          <Kpi label="Margem com família/custo" value={hasRows ? pct(stats.marginPercent) : '—'} hint={hasRows && stats.margin != null ? formatCompactBRL(stats.margin) : ''} />
          <Kpi label="Margem comercial" value={hasRows ? pct(commercialStats?.marginPercent) : '—'} hint="Sem clientes família/custo" />
        </KpiGrid>
      ) : null}
      <Panel title="Régua de margem" accent>
        <div className="grid gap-2 lg:grid-cols-3">
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2"><p className="text-xs font-bold text-emerald-800">Saudável</p><p className="mt-0.5 text-[11px] text-slate-600">À vista ≥ {alerts.vistaHealthy}% · a prazo ≥ {alerts.prazoHealthy}%</p></div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2"><p className="text-xs font-bold text-amber-900">Observar</p><p className="mt-0.5 text-[11px] text-slate-600">À vista {alerts.vistaRed}–{alerts.vistaHealthy}% · a prazo {alerts.prazoRed}–{alerts.prazoHealthy}%</p></div>
          <div className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2"><p className="text-xs font-bold text-red-800">Atenção</p><p className="mt-0.5 text-[11px] text-slate-600">À vista &lt; {alerts.vistaRed}% · a prazo &lt; {alerts.prazoRed}%</p></div>
        </div>
      </Panel>
      <Panel title="Evolução semanal" action={<MeasureSwitch value={measure} onChange={setMeasure} />}>
        <p className="mb-2 text-[11px] text-slate-500">Cada barra é uma semana, de segunda a domingo.</p>
        <SeriesChart points={lastWeeks(rows)} measure={measure} />
      </Panel>
      <div className="mb-2.5 grid items-start gap-2.5 lg:grid-cols-2">
        <RankTable title="Top consultores" rows={rows} field="consultant" />
        <Panel title="Filial × consultor" className="h-full">
          {branches ? <Heat rows={rows} /> : <Dash />}
        </Panel>
      </div>
      <Panel title="Por filial" action={<MeasureSwitch value={branchMeasure} onChange={setBranchMeasure} />}>
        {branches
          ? <SeriesChart points={BRANCHES.map((label) => groupSales(rows, 'branch').find((row) => row.label === label) || { label, revenue: 0, volume: 0, marginPercent: null })} measure={branchMeasure} />
          : <Dash />}
      </Panel>
      <div className="mb-2.5 grid items-start gap-2.5 lg:grid-cols-2">
        <RankTable title="Top clientes" rows={rows} field="client" />
        <RankTable title="Top produtos" rows={rows} field="product" />
      </div>
      <ShareRings rows={rows} />
    </div>
  )
}

function Heat({ rows }) {
  const matrix = heatmap(rows).slice(0, 12)
  const max = Math.max(1, ...matrix.flatMap((line) => line.cells.map((cell) => cell.revenue)))
  if (!matrix.length) return <Dash />
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[40rem] text-left text-sm">
        <thead><tr><th className="p-2">Consultor</th>{BRANCHES.map((branch) => <th key={branch} className="p-2">{branch}</th>)}<th className="p-2">Total</th></tr></thead>
        <tbody>
          {matrix.map((line) => (
            <tr key={line.consultant} className="border-t border-slate-100">
              <th className="p-2 font-medium">{line.consultant}</th>
              {line.cells.map((cell, index) => <td key={BRANCHES[index]} className="p-2" style={{ background: `rgba(15,118,110,${cell.revenue / max})` }}>{cell.revenue ? formatCompactBRL(cell.revenue) : '—'}</td>)}
              <td className="p-2 font-medium">{formatCompactBRL(line.total.revenue)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function WeekView({ rows, alerts }) {
  const weekly = weeklySales(rows)
  const hasWeek = Boolean(weekly.week)
  const now = aggregateSales(weekly.current)
  const before = aggregateSales(weekly.previous)
  const variation = (value, previous, kind) => {
    if (!hasWeek || value == null || previous == null) return '—'
    const delta = value - previous
    const sign = delta > 0 ? '+' : ''
    if (kind === 'pct') return `${sign}${pct(delta)} vs semana anterior`
    if (kind === 'volume') return `${sign}${Math.round(delta).toLocaleString('pt-BR')} t vs semana anterior`
    if (kind === 'count') return `${sign}${delta} vs semana anterior`
    return `${sign}${formatCompactBRL(delta)} vs semana anterior`
  }
  const cards = [
    ['Faturamento', money(hasWeek, now.revenue), variation(now.revenue, before.revenue)],
    ['Volume', volumeText(hasWeek, now.volume), variation(now.volume, before.volume, 'volume')],
    ['Margem %', hasWeek ? pct(now.marginPercent) : '—', variation(now.marginPercent, before.marginPercent, 'pct')],
    ['Margem em reais', hasWeek ? (now.margin == null ? '—' : formatCompactBRL(now.margin)) : '—', variation(now.margin, before.margin)],
    ['Pedidos', hasWeek ? String(now.orders) : '—', variation(now.orders, before.orders, 'count')],
  ]
  const reds = weekly.current.filter((row) => row.family !== true && marginTone(row.revenue ? row.margin / row.revenue * 100 : null, row.cash, alerts) === 'red')
  const weeks = lastWeeks(rows, 8)
  const hasBranch = weekly.current.some((row) => row.branch) || weekly.previous.some((row) => row.branch)
  return (
    <div>
      <p className="mb-2 text-[11px] text-slate-500">{hasWeek ? `Semana de ${brDate(weekly.week)} · anterior ${brDate(shiftLabel(weekly.week))}` : '—'}</p>
      <KpiGrid>
        {cards.map(([label, value, hint]) => <Kpi key={label} label={label} value={value} hint={hint} />)}
        <Kpi label="Acumulado filtrado" value={money(rows.length > 0, aggregateSales(rows).revenue)} hint={volumeText(rows.length > 0, aggregateSales(rows).volume)} />
      </KpiGrid>
      <div className="mb-2.5 grid gap-2.5 lg:grid-cols-3">
        {[['Consultores — esta semana', 'consultant'], ['Clientes — esta semana', 'client'], ['Produtos — esta semana', 'product']].map(([title, field]) => <WeekRank key={field} title={title} current={weekly.current} previous={weekly.previous} field={field} />)}
      </div>
      <div className="mb-2.5 grid items-start gap-2.5 lg:grid-cols-2">
        <Panel title="Filiais — esta semana vs anterior" className="mb-0">
          {hasBranch ? (
            <ul className="space-y-3">
              {BRANCHES.map((branch) => {
                const current = aggregateSales(weekly.current.filter((row) => row.branch === branch))
                const previous = aggregateSales(weekly.previous.filter((row) => row.branch === branch))
                const max = Math.max(current.revenue, previous.revenue, 1)
                return (
                  <li key={branch}>
                    <div className="mb-1 flex justify-between gap-3 text-sm"><span>{branch}</span><span>{formatCompactBRL(current.revenue)} · anterior {formatCompactBRL(previous.revenue)}</span></div>
                    <div className="grid gap-1">
                      <div className="h-2 rounded-full bg-primary-500" style={{ width: `${current.revenue / max * 100}%` }} />
                      <div className="h-2 rounded-full bg-slate-300" style={{ width: `${previous.revenue / max * 100}%` }} />
                    </div>
                  </li>
                )
              })}
            </ul>
          ) : <Dash />}
        </Panel>
        <Panel title="Evolução últimas 8 semanas" className="mb-0">
          <p className="text-xs text-slate-500">Semana atual em âmbar.</p>
          <SeriesChart points={weeks} measure="revenue" highlight={weekly.week} />
        </Panel>
      </div>
      <div className="grid items-start gap-2.5 lg:grid-cols-2">
        <Panel title="Resumo da semana" action={<CopySummary rows={rows} />}>
          <pre className="whitespace-pre-wrap font-sans text-sm text-slate-700">{weeklySummary(rows, formatCompactBRL) || '—'}</pre>
        </Panel>
        <Panel title="Pedidos que exigem atenção">
          {reds.length ? (
            <ul className="space-y-2 text-sm">
              {reds.slice(0, 30).map((row) => <li key={row.id}>{row.client} · {row.consultant} · {row.branch || '—'} · {row.product} · {tons(row.volume)} · {formatCompactBRL(row.revenue)} · {pct(row.revenue ? row.margin / row.revenue * 100 : null, 1)} · {row.cash == null ? 'sem vencimento' : row.cash ? 'à vista' : 'a prazo'}</li>)}
            </ul>
          ) : <p className="text-sm text-slate-600">{hasWeek ? 'Nenhum pedido em vermelho nesta semana.' : '—'}</p>}
        </Panel>
      </div>
    </div>
  )
}

function shiftLabel(week) {
  const date = new Date(`${week}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() - 7)
  return date.toISOString().slice(0, 10)
}

function CopySummary({ rows }) {
  const [notice, setNotice] = useState('')
  return (
    <div className="flex flex-col items-end gap-1">
      <Button type="button" variant="secondary" onClick={async () => {
        try { await navigator.clipboard.writeText(weeklySummary(rows, formatCompactBRL)); setNotice('Resumo copiado.') }
        catch { setNotice('Não foi possível copiar.') }
      }}>Copiar</Button>
      {notice ? <p role="status" className="text-xs text-slate-500">{notice}</p> : null}
    </div>
  )
}

function WeekRank({ title, current, previous, field }) {
  const now = groupSales(current, field).slice(0, 10)
  const before = groupSales(previous, field)
  return (
    <Panel title={title}>
      <ul className="space-y-2 text-sm">
        {now.map((row) => {
          const prior = before.find((item) => item.label === row.label)
          const delta = (row.revenue || 0) - (prior?.revenue || 0)
          return (
            <li key={row.label} className="flex items-start justify-between gap-3">
              <span>{row.label}<br /><span className="text-slate-500">{tons(row.volume)} · {delta >= 0 ? '+' : ''}{formatCompactBRL(delta)} vs anterior</span></span>
              <span>{pct(row.marginPercent, 1)}</span>
            </li>
          )
        })}
        {!now.length ? <li className="text-slate-400">—</li> : null}
      </ul>
    </Panel>
  )
}

function FlowBars({ months }) {
  const value = (amount) => (Number.isFinite(amount) ? amount : 0)
  const max = Math.max(1, ...months.flatMap((row) => [value(row.incoming), value(row.outgoing)]))
  return (
    <div>
      <div className="flex h-24 items-end gap-1" role="img" aria-label="Recebido do cliente e a pagar ao fornecedor por mês">
        {months.map((row) => (
          <div key={row.month} className="flex h-full min-w-0 flex-1 items-end gap-px" title={`${row.month}: ${formatCompactBRL(row.incoming)} · ${formatCompactBRL(row.outgoing)}`}>
            <div className="w-1/2 rounded-t bg-primary-500" style={{ height: `${Math.max(value(row.incoming) ? 2 : 0, value(row.incoming) / max * 100)}%` }} />
            <div className="w-1/2 rounded-t bg-amber-500" style={{ height: `${Math.max(value(row.outgoing) ? 2 : 0, value(row.outgoing) / max * 100)}%` }} />
          </div>
        ))}
      </div>
      <p className="mt-1 text-[11px] text-slate-500"><span className="text-primary-700">Cliente</span> · <span className="text-amber-700">Fornecedor</span></p>
    </div>
  )
}

function AccumulatedBars({ months }) {
  const values = months.map((row) => (Number.isFinite(row.accumulated) ? row.accumulated : 0))
  const max = Math.max(1, ...values.map((value) => Math.abs(value)))
  return (
    <div className="flex h-36 items-end gap-1" role="img" aria-label="Saldo acumulado por mês">
      {months.map((row) => (
        <div key={row.month} className="flex h-full min-w-0 flex-1 flex-col justify-end" title={`${row.month}: ${formatCompactBRL(row.accumulated)}`}>
          <div className={`w-full rounded-t ${row.accumulated < 0 ? 'bg-red-500' : 'bg-primary-600'}`} style={{ height: `${Math.max(row.accumulated ? 2 : 0, Math.abs(row.accumulated) / max * 100)}%` }} />
        </div>
      ))}
    </div>
  )
}

function CashView({ rows, allRows, filters }) {
  const split = modalitySplit(rows)
  const flow = cashFlow(rows)
  const years = compareYears(allRows, filters, todayKey())
  const known = split.sightShare != null
  return (
    <div>
      <Panel title="À vista × a prazo" accent>
        <p className="mb-2 text-[11px] text-slate-500">À vista: até 90 dias entre a negociação e o pagamento do cliente.</p>
        <KpiGrid className="mb-2.5">
          <Kpi label="À vista" value={known ? pct(split.sightShare) : '—'} hint={known ? `${formatCompactBRL(split.sight.revenue)} · ${tons(split.sight.volume)} · ${pct(split.sight.marginPercent, 1)}` : ''} />
          <Kpi label="A prazo" value={known ? pct(split.termShare) : '—'} hint={known ? `${formatCompactBRL(split.term.revenue)} · ${tons(split.term.volume)} · ${pct(split.term.marginPercent, 1)}` : ''} />
          <Kpi label="Prazo − à vista" value={pct(split.sight.marginPercent != null && split.term.marginPercent != null ? split.term.marginPercent - split.sight.marginPercent : null)} hint="p.p." />
          <Kpi label="Sem vencimento" value={rows.length ? String(split.missing) : '—'} />
        </KpiGrid>
        <div className="grid items-start gap-2.5 lg:grid-cols-2">
        <Panel title="Faturamento por modalidade" className="mb-0 border-0 p-0 shadow-none">
          <p className="text-xs text-slate-500">À vista: até 90 dias.</p>
          {known ? (
            <>
              <div className="flex h-3 overflow-hidden rounded-full" role="img" aria-label={`À vista ${pct(split.sightShare, 1)}, a prazo ${pct(split.termShare, 1)}`}>
                <div className="bg-primary-600" style={{ width: `${split.sightShare}%` }} />
                <div className="bg-amber-500" style={{ width: `${split.termShare}%` }} />
              </div>
              <p className="text-sm text-slate-600">À vista {pct(split.sightShare, 1)} · a prazo {pct(split.termShare, 1)}</p>
            </>
          ) : <Dash />}
        </Panel>
        <Panel title="À vista e a prazo por ano" className="mb-0 border-0 p-0 shadow-none">
          {years.length < 2 ? <Dash /> : (
            <ul className="space-y-3 text-sm">
              {years.map((year) => {
                const part = modalitySplit(year.rows)
                return <li key={year.year} className="rounded-2xl bg-slate-50 p-3"><span className="font-semibold">{year.year}.</span> À vista {formatCompactBRL(part.sight.revenue)} ({pct(part.sightShare, 1)}) · a prazo {formatCompactBRL(part.term.revenue)} ({pct(part.termShare, 1)})</li>
              })}
            </ul>
          )}
        </Panel>
        </div>
      </Panel>
      <Panel title="Fluxo de caixa — recebido do cliente e a pagar ao fornecedor">
        <p className="mb-2 text-[11px] text-slate-500">Somente lançado. Vencimento é previsão.</p>
        {flow.months.length ? (
          <>
            <FlowBars months={flow.months} />
            <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[36rem] text-right text-[11px]">
              <thead><tr>{['Mês', 'Do cliente', 'Ao fornecedor', 'Saldo', 'Acumulado'].map((label) => <th key={label} className="p-2 text-left">{label}</th>)}</tr></thead>
              <tbody>{flow.months.map((row) => <tr key={row.month} className="border-t border-slate-100"><th className="p-2 text-left">{row.month}</th><td className="p-2">{formatCompactBRL(row.incoming)}</td><td className="p-2">{formatCompactBRL(row.outgoing)}</td><td className="p-2">{formatCompactBRL(row.balance)}</td><td className="p-2">{formatCompactBRL(row.accumulated)}</td></tr>)}</tbody>
            </table>
            </div>
          </>
        ) : <Dash />}
      </Panel>
      <Panel title="Saldo acumulado por mês">
        {flow.months.length ? <AccumulatedBars months={flow.months} /> : <Dash />}
      </Panel>
    </div>
  )
}

function AnnualView({ allRows, filters, steps, measure, setMeasure }) {
  const years = compareYears(allRows, filters, todayKey())
  const full = [...new Set(allRows.map((row) => row.date.slice(0, 4)))].sort()
  const previousFull = full.length >= 2 ? aggregateSales(allRows.filter((row) => row.date.slice(0, 4) === full.at(-2))) : null
  const currentYear = full.at(-1)
  const current = currentYear ? aggregateSales(allRows.filter((row) => row.date.slice(0, 4) === currentYear && row.date <= todayKey())) : null
  const ladder = annualLadder(previousFull?.revenue ?? null, current?.revenue ?? 0, steps)
  const [left, right] = years
  return (
    <div>
      <Panel title="Meta do ano · faturamento" accent>
        {previousFull ? <p className="text-sm text-slate-600">{full.at(-2)}: {formatCompactBRL(previousFull.revenue)}. Até hoje: {formatCompactBRL(current?.revenue)} ({pct(previousFull.revenue ? current.revenue / previousFull.revenue * 100 : null)}).</p> : <Dash />}
        {previousFull ? <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{ladder.map((item) => <li key={item.step} className="rounded-2xl bg-slate-50 p-3 text-sm">{item.step > 0 ? `+${item.step}%` : 'Igualar'}: {formatCompactBRL(item.target)} · {item.reached ? 'atingido' : `faltam ${formatCompactBRL(item.gap)}`}</li>)}</ul> : null}
      </Panel>
      {years.length < 2 ? <Panel title="Ano contra ano"><Dash /></Panel> : (
        <Panel title="Ano contra ano · mesmo período">
          <div className="grid items-start gap-3 lg:grid-cols-[1fr_auto_1fr]">
            <div className="rounded-2xl bg-slate-50 p-3.5">
              <p className="mb-2 text-[11px] font-bold text-primary-700">{left.year}</p>
              <p className="text-[10px] uppercase tracking-wide text-slate-500">Faturamento</p><p className="text-lg font-bold">{formatCompactBRL(left.revenue)}</p>
              <p className="mt-2 text-[10px] uppercase tracking-wide text-slate-500">Volume</p><p className="text-lg font-bold">{tons(left.volume)}</p>
              <p className="mt-2 text-[10px] uppercase tracking-wide text-slate-500">Margem</p><p className="text-lg font-bold">{pct(left.marginPercent)}</p>
              <p className="mt-2 text-[10px] uppercase tracking-wide text-slate-500">Receita / t</p><p className="text-lg font-bold">{formatCompactBRL(left.marginPerTon)}</p>
            </div>
            <div className="flex min-w-[8.125rem] flex-col items-center gap-6 pt-7 text-center">
              <p><span className="block text-sm font-bold">{signedMoney(left.revenue - right.revenue)}</span><span className="text-[10px] text-slate-500">{pct(right.revenue ? (left.revenue - right.revenue) / right.revenue * 100 : null)}</span></p>
              <p><span className="block text-sm font-bold">{signedTons(left.volume - right.volume)}</span></p>
              <p><span className="block text-sm font-bold">{pct(left.marginPercent != null && right.marginPercent != null ? left.marginPercent - right.marginPercent : null)}</span></p>
              <p><span className="block text-sm font-bold">{signedMoney(left.marginPerTon != null && right.marginPerTon != null ? left.marginPerTon - right.marginPerTon : null)}</span></p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-3.5">
              <p className="mb-2 text-[11px] font-bold text-sky-700">{right.year}</p>
              <p className="text-[10px] uppercase tracking-wide text-slate-500">Faturamento</p><p className="text-lg font-bold">{formatCompactBRL(right.revenue)}</p>
              <p className="mt-2 text-[10px] uppercase tracking-wide text-slate-500">Volume</p><p className="text-lg font-bold">{tons(right.volume)}</p>
              <p className="mt-2 text-[10px] uppercase tracking-wide text-slate-500">Margem</p><p className="text-lg font-bold">{pct(right.marginPercent)}</p>
              <p className="mt-2 text-[10px] uppercase tracking-wide text-slate-500">Receita / t</p><p className="text-lg font-bold">{formatCompactBRL(right.marginPerTon)}</p>
            </div>
          </div>
        </Panel>
      )}
      {years.length >= 2 ? <Panel title="Evolução acumulada" action={<MeasureSwitch value={measure} onChange={setMeasure} />}><Accumulated rows={allRows} years={years.map((year) => year.year)} measure={measure} /></Panel> : null}
      <div className="grid items-start gap-2.5 lg:grid-cols-2">
        {years.length >= 2 ? (
          <Panel title="Indicadores até o corte">
            <div className="grid gap-3 sm:grid-cols-2">{years.map((year) => <div key={year.year} className="rounded-2xl border border-slate-200 p-4 text-sm"><h3 className="font-semibold">{year.year}</h3><p>{formatCompactBRL(year.revenue)}</p><p>{tons(year.volume)}</p><p>Margem {pct(year.marginPercent)}</p><p>{formatCompactBRL(year.marginPerTon)} / t</p></div>)}</div>
          </Panel>
        ) : null}
        <Panel title="Por fornecedor" className={years.length >= 2 ? '' : 'xl:col-span-2'}>
          {years.length < 2 ? <Dash /> : <SupplierBars rows={supplierCompare(years[0].rows, years[1].rows)} />}
        </Panel>
      </div>
    </div>
  )
}

function signedMoney(value) {
  if (value == null || !Number.isFinite(value)) return '—'
  return `${value > 0 ? '+' : ''}${formatCompactBRL(value)}`
}
function signedTons(value) {
  if (value == null || !Number.isFinite(value)) return '—'
  return `${value > 0 ? '+' : ''}${Math.round(value).toLocaleString('pt-BR')} t`
}

function Accumulated({ rows, years, measure }) {
  const lines = years.map((year, index) => ({
    label: year,
    color: index === 0 ? '#0f766e' : '#ca8a04',
    points: yearSeries(rows, year, measure).filter((point, pointIndex, all) => pointIndex === all.length - 1 || all[pointIndex + 1]?.week !== point.week),
  }))
  const width = 640
  const height = 220
  const max = Math.max(1, ...lines.flatMap((line) => line.points.map((point) => point.value || 0)))
  const pathOf = (points) => points.map((point, index) => {
    const x = points.length <= 1 ? 0 : (index / (points.length - 1)) * width
    const y = height - ((point.value || 0) / max) * (height - 8) - 4
    return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  const labelOf = (value) => measure === 'volume' ? tons(value) : measure === 'margin' ? pct(value, 1) : formatCompactBRL(value)
  if (!lines.some((line) => line.points.length)) return <Dash />
  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-44 w-full" role="img" aria-label="Série acumulada dos anos comparados">
        {lines.map((line) => <path key={line.label} d={pathOf(line.points)} fill="none" stroke={line.color} strokeWidth="3" />)}
      </svg>
      <ul className="mt-2 flex flex-wrap gap-3 text-sm text-slate-600">{lines.map((line) => <li key={line.label}><span className="mr-1 inline-block size-2 rounded-full" style={{ background: line.color }} />{line.label}: {labelOf(line.points.at(-1)?.value)}</li>)}</ul>
    </div>
  )
}

function SupplierBars({ rows }) {
  const max = Math.max(1, ...rows.flatMap((row) => [row.current.revenue, row.previous?.revenue || 0]))
  if (!rows.length) return <Dash />
  return (
    <ul className="space-y-3">
      {rows.map((row) => (
        <li key={row.label}>
          <p className="text-sm font-medium text-slate-800">{row.label}</p>
          <p className="text-xs text-slate-500">{formatCompactBRL(row.current.revenue)} · anterior {row.previous ? formatCompactBRL(row.previous.revenue) : '—'}</p>
          <div className="mt-1 h-2 rounded-full bg-primary-500" style={{ width: `${row.current.revenue / max * 100}%` }} />
          <div className="mt-1 h-2 rounded-full bg-amber-400" style={{ width: `${(row.previous?.revenue || 0) / max * 100}%` }} />
        </li>
      ))}
    </ul>
  )
}

function ConsultantView({ allRows, filters, goals, goalsKnown }) {
  const years = compareYears(allRows, filters, todayKey())
  const [current, previous] = years
  if (!current) return <Panel title="Consultores"><Dash /></Panel>
  const names = [...new Set([...(current.rows ?? []), ...(previous?.rows ?? [])].map((row) => row.consultant))]
  const goalOf = (name) => goals.find((goal) => goal.year === Number(current.year) && goal.consultant.trim().toLowerCase() === name.trim().toLowerCase())
  const lines = names.map((name) => {
    const now = aggregateSales(current.rows.filter((row) => row.consultant === name))
    const before = aggregateSales((previous?.rows ?? []).filter((row) => row.consultant === name))
    const goal = goalsKnown ? goalOf(name) : null
    const percent = goal?.value ? now.revenue / goal.value * 100 : null
    return { name, now, before, goal, percent }
  }).sort((a, b) => b.now.revenue - a.now.revenue)
  const totalNow = aggregateSales(current.rows)
  const totalBefore = previous ? aggregateSales(previous.rows) : null
  return (
    <Panel title="Consultores">
      <p className="text-xs text-slate-500">Verde subiu contra o ano anterior. Vermelho caiu.</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[44rem] text-right text-sm">
          <thead><tr><th className="p-2 text-left">Consultor</th>{previous ? <th className="p-2">{previous.year}</th> : null}<th className="p-2">{current.year}</th><th className="p-2">Meta</th><th className="p-2">% meta</th><th className="p-2">Volume</th><th className="p-2">Margem</th></tr></thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.name} className="border-t border-slate-100">
                <th className="p-2 text-left font-medium">{line.name}</th>
                {previous ? <td className={`p-2 ${line.now.revenue >= line.before.revenue ? 'text-emerald-700' : 'text-red-700'}`}>{formatCompactBRL(line.before.revenue)}</td> : null}
                <td className="p-2">{formatCompactBRL(line.now.revenue)}</td>
                <td className="p-2">{line.goal ? formatCompactBRL(line.goal.value) : '—'}</td>
                <td className={`p-2 ${toneClass[goalTone(line.percent)] || ''}`}>{line.percent == null ? '—' : pct(line.percent, 1)}</td>
                <td className="p-2">{tons(line.now.volume)}</td>
                <td className="p-2">{pct(line.now.marginPercent, 1)}</td>
              </tr>
            ))}
            <tr className="border-t border-slate-200 font-semibold"><th className="p-2 text-left">Total</th>{previous ? <td className="p-2">{formatCompactBRL(totalBefore.revenue)}</td> : null}<td className="p-2">{formatCompactBRL(totalNow.revenue)}</td><td /><td /><td className="p-2">{tons(totalNow.volume)}</td><td className="p-2">{pct(totalNow.marginPercent, 1)}</td></tr>
          </tbody>
        </table>
      </div>
    </Panel>
  )
}

function MarginView({ allRows, filters, alerts }) {
  const years = compareYears(allRows, filters, todayKey())
  const [current, previous] = years
  if (!current) return <Panel title="Margem"><Dash /></Panel>
  const sight = (rows) => aggregateSales((rows ?? []).filter((row) => row.cash === true))
  const term = (rows) => aggregateSales((rows ?? []).filter((row) => row.cash === false))
  const cards = [
    ['Média do ano', current.marginPercent, previous?.marginPercent],
    ['À vista', sight(current.rows).marginPercent, sight(previous?.rows).marginPercent],
    ['A prazo', term(current.rows).marginPercent, term(previous?.rows).marginPercent],
  ]
  const names = [...new Set([...(current.rows ?? []), ...(previous?.rows ?? [])].map((row) => row.consultant))]
  const people = names.map((name) => ({
    name,
    now: aggregateSales(current.rows.filter((row) => row.consultant === name)),
    before: aggregateSales((previous?.rows ?? []).filter((row) => row.consultant === name)),
  })).sort((a, b) => (b.now.marginPercent ?? -999) - (a.now.marginPercent ?? -999))
  const max = Math.max(1, ...people.flatMap((person) => [Math.abs(person.now.marginPercent || 0), Math.abs(person.before.marginPercent || 0)]))
  return (
    <div>
      <Panel title="Margem · ano corrente e anterior" accent className="mb-2.5">
        <KpiGrid className="mb-0">
          {cards.map(([label, value, prior]) => <Kpi key={label} label={label} value={pct(value)} hint={prior == null ? '' : `Anterior ${pct(prior)} · ${pct(value != null && prior != null ? value - prior : null)}`} />)}
          <Kpi label="Prazo − à vista" value={pct(term(current.rows).marginPercent != null && sight(current.rows).marginPercent != null ? term(current.rows).marginPercent - sight(current.rows).marginPercent : null)} hint="p.p." />
        </KpiGrid>
      </Panel>
      <Panel title="Margem à vista e a prazo">
          <ul className="space-y-3 text-sm">
            {[['À vista', sight(current.rows).marginPercent, sight(previous?.rows).marginPercent], ['A prazo', term(current.rows).marginPercent, term(previous?.rows).marginPercent]].map(([label, now, prior]) => (
              <li key={label}>
                <p className="font-medium">{label}: {pct(now, 1)} · anterior {pct(prior, 1)}</p>
                <div className="mt-1 h-2 rounded-full bg-primary-500" style={{ width: `${Math.max(0, (now || 0)) / Math.max(Math.abs(now || 0), Math.abs(prior || 0), 1) * 100}%` }} />
                <div className="mt-1 h-2 rounded-full bg-slate-300" style={{ width: `${Math.max(0, (prior || 0)) / Math.max(Math.abs(now || 0), Math.abs(prior || 0), 1) * 100}%` }} />
              </li>
            ))}
          </ul>
      </Panel>
      <Panel title="Margem por consultor">
          <p className="text-xs text-slate-500">Verde: na média do ano ou acima. Barra cinza: ano anterior.</p>
          <ul className="space-y-3 text-sm">
            {people.map((person) => {
              const above = person.now.marginPercent != null && current.marginPercent != null && person.now.marginPercent >= current.marginPercent
              return (
                <li key={person.name}>
                  <div className="flex justify-between gap-3"><span>{person.name}</span><span className={above ? 'text-emerald-700' : 'text-red-700'}>{pct(person.now.marginPercent, 1)} · anterior {pct(person.before.marginPercent, 1)}</span></div>
                  <div className={`mt-1 h-2 rounded-full ${above ? 'bg-emerald-600' : 'bg-red-600'}`} style={{ width: `${Math.max(0, (person.now.marginPercent || 0) / max * 100)}%` }} />
                  <div className="mt-1 h-2 rounded-full bg-slate-300" style={{ width: `${Math.max(0, (person.before.marginPercent || 0) / max * 100)}%` }} />
                </li>
              )
            })}
          </ul>
      </Panel>
      <Panel title="Régua de alertas">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl bg-slate-50 p-4 text-sm"><p className="font-semibold">À vista</p><p>Vermelho abaixo de {alerts.vistaRed}%</p><p>Observar de {alerts.vistaRed}% a {alerts.vistaHealthy}%</p><p>Saudável a partir de {alerts.vistaHealthy}%</p></div>
          <div className="rounded-2xl bg-slate-50 p-4 text-sm"><p className="font-semibold">A prazo</p><p>Vermelho abaixo de {alerts.prazoRed}%</p><p>Observar de {alerts.prazoRed}% a {alerts.prazoHealthy}%</p><p>Saudável a partir de {alerts.prazoHealthy}%</p></div>
        </div>
        <p className="text-xs text-slate-500">Sem vencimento, a régua é a prazo.</p>
      </Panel>
    </div>
  )
}

function periodOptions(rows, slice) {
  return [...new Set(rows.map((row) => row.date?.slice(...slice)).filter(Boolean))]
    .sort((a, b) => b.localeCompare(a, 'pt-BR'))
    .map((value) => ({ value, label: slice[0] === 5 ? MONTH_LABELS[Number(value) - 1] : value }))
}

function storedOptions(rows, field) {
  return [...new Set(rows.map((row) => row[field]).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'pt-BR'))
    .map((value) => ({ value, label: value }))
}

function optionLabel(options, value) {
  return options.find((option) => String(option.value) === String(value))?.label || 'Sem cadastro'
}

function FilterSelect({ label, options, value = [], onChange, searchable = false }) {
  const selected = Array.isArray(value) ? value : []
  function remove(item) {
    onChange(selected.filter((current) => String(current) !== String(item)))
  }
  return (
    <div className="space-y-1.5">
      <Select
        label={label}
        size="compact"
        multiple
        searchable={searchable}
        placeholder="Todos"
        options={options}
        value={selected}
        allowClear={false}
        onChange={(event) => onChange(event.target.value)}
      />
      {selected.length ? (
        <div className="flex flex-wrap gap-1">
          {selected.map((item) => (
            <button key={item} type="button" onClick={() => remove(item)} className="max-w-full truncate rounded-full bg-primary-50 px-2 py-0.5 text-xs font-medium text-primary-800">
              {optionLabel(options, item)} <span aria-hidden="true">×</span>
              <span className="sr-only">Remover {label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function FilterPanel({ closeRef, onClose, onClear, loading, onRefresh, children }) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-3">
        <p className="text-sm font-semibold text-slate-900">Filtros</p>
        <Button ref={closeRef} type="button" variant="ghost" className="h-9 px-3" onClick={onClose}>
          <IconChevronRight className="size-4" />
          Recolher
        </Button>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3">{children}</div>
      <div className="grid gap-2 border-t border-slate-100 p-3">
        <Button type="button" variant="secondary" className="w-full" onClick={onClear}>Limpar filtros</Button>
        <Button type="button" className="w-full" loading={loading} onClick={onRefresh}>Atualizar</Button>
      </div>
    </div>
  )
}

function FilterRail({ buttonRef, count, onClick, controls, className = '', hidden = false, embedded = false }) {
  const [tip, setTip] = useState(null)
  function place(event) {
    const rect = event.currentTarget.getBoundingClientRect()
    setTip({ top: rect.top + rect.height / 2, left: rect.left - 8 })
  }
  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={onClick}
        onMouseEnter={place}
        onFocus={place}
        onMouseLeave={() => setTip(null)}
        onBlur={() => setTip(null)}
        aria-expanded="false"
        aria-controls={controls}
        aria-label="Abrir filtros"
        aria-hidden={hidden || undefined}
        tabIndex={hidden ? -1 : undefined}
        className={embedded
          ? `filter-rail absolute inset-0 z-10 flex flex-col items-center justify-start gap-2 pt-4 text-slate-600 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/30 ${className}`
          : `flex w-11 shrink-0 flex-col items-center justify-start gap-2 rounded-2xl border border-slate-200/90 bg-white pt-4 text-slate-600 shadow-sm hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/30 sm:rounded-3xl ${className}`}
      >
        <IconChevronLeft className="size-4" />
        {count > 0 ? <span className="size-1.5 rounded-full bg-primary-600" aria-hidden="true" /> : null}
        <span className="sr-only">{count > 0 ? `${count} filtros ativos` : 'Nenhum filtro ativo'}</span>
      </button>
      {tip ? (
        <span role="tooltip" style={{ top: tip.top, left: tip.left }} className="pointer-events-none fixed z-50 -translate-x-full -translate-y-1/2 whitespace-nowrap rounded-xl bg-slate-900 px-2.5 py-1 text-xs font-medium text-white shadow-lg">
          Abrir filtros
        </span>
      ) : null}
    </>
  )
}

const FILTER_MOTION_MS = 320

function DashboardPending() {
  return (
    <div className={`${CARD} flex min-h-64 flex-col items-center justify-center gap-3 px-6 py-10`} role="status" aria-live="polite" aria-busy="true">
      <span className="size-5 animate-spin rounded-full border-2 border-primary-200 border-t-primary-600" aria-hidden="true" />
      <p className="text-sm font-medium text-slate-600">Carregando informações…</p>
    </div>
  )
}

export function SalesDashboard({ role, operations = [], operationsLoading = false, onNew, onPending }) {
  const { user } = useAuth()
  const userId = user?.id ?? null
  const [bundle, setBundle] = useState(() => peekSalesDashboard(userId))
  const [tab, setTab] = useState('overview')
  const [measure, setMeasure] = useState('revenue')
  const [filters, setFilters] = useState({})
  const [yearDefaultDismissed, setYearDefaultDismissed] = useState(false)
  const [loading, setLoading] = useState(() => peekSalesDashboard(userId) == null)
  const [error, setError] = useState(null)
  const [refresh, setRefresh] = useState(0)
  const [, startTransition] = useTransition()
  useAbortableAsync(async (signal, isActive) => {
    const fresh = refresh > 0
    if (fresh || !peekSalesDashboard(userId)) {
      setLoading(true)
      setError(null)
    }
    const result = await loadSalesDashboard({ role, signal, fresh, userId })
    if (!isActive()) return
    if (!result.ok) {
      setLoading(false)
      setBundle(null)
      setError(result.error)
      return
    }
    startTransition(() => {
      setBundle(result)
      setLoading(false)
    })
  }, [role, refresh, userId], role === 'gestor')

  const prepared = useMemo(() => {
    if (!bundle) return { rows: [], issues: [] }
    const rules = bundle.config.rules?.length ? bundle.config.rules : DEFAULT_MARGIN_RULES
    const derive = (rows) => withDerived(markFamily(applyAliases(rows, bundle.config.aliases), bundle.config.exceptions, { known: bundle.fields?.family === true }), { rules, sightDays: bundle.config.sightDays })
    const native = { ...bundle.native, rows: derive(bundle.native.rows) }
    const historicalRows = derive(bundle.historical.rows)
    if (!bundle.fields?.historical) return { rows: native.rows, issues: native.issues }
    return unifySales(native, { ...bundle.historical, rows: historicalRows })
  }, [bundle])
  const familyKnown = bundle?.fields?.family === true
  const yearNow = todayKey().slice(0, 4)
  const appliedFilters = useMemo(() => {
    const next = familyKnown ? { ...filters } : { ...filters, family: '' }
    if (!yearDefaultDismissed && !next.year?.length && prepared.rows.some((row) => row.date.startsWith(yearNow))) next.year = [yearNow]
    return next
  }, [filters, familyKnown, yearDefaultDismissed, prepared.rows, yearNow])
  const rows = useMemo(() => filterSales(prepared.rows, appliedFilters), [prepared.rows, appliedFilters])
  const alerts = bundle?.config.alerts ?? { vistaRed: 1.5, vistaHealthy: 3, prazoRed: 5, prazoHealthy: 7 }

  const filterOptions = useMemo(() => ({
    year: periodOptions(prepared.rows, [0, 4]),
    month: [...new Set(prepared.rows.map((row) => row.date?.slice(5, 7)).filter(Boolean))].sort().map((value) => ({ value, label: MONTH_LABELS[Number(value) - 1] || value })),
    branch: filialOptions(),
    saleType: [{ value: 'reais', label: 'Reais' }, { value: 'barter', label: 'Barter' }],
    supplier: bundle?.catalogs?.suppliers ?? [],
    culture: CULTURES.map((value) => ({ value, label: value })),
    productType: CLASSES_PRODUTO,
    product: bundle?.catalogs?.products ?? [],
    consultant: bundle?.catalogs?.consultants ?? [],
    client: bundle?.catalogs?.clients ?? [],
    harvest: storedOptions(prepared.rows, 'harvest'),
  }), [prepared.rows, bundle])
  const activeChips = []
  if (appliedFilters.start) activeChips.push(['start', `De ${brDate(appliedFilters.start)}`])
  if (appliedFilters.end) activeChips.push(['end', `Até ${brDate(appliedFilters.end)}`])
  if (appliedFilters.family) activeChips.push(['family', appliedFilters.family === 'exclude' ? 'Sem família/custo' : 'Só família/custo'])
  for (const key of FILTER_FIELDS) {
    const value = appliedFilters[key]
    if (Array.isArray(value) && value.length) activeChips.push([key, value.map((item) => optionLabel(filterOptions[key], item)).join(', ')])
  }

  function clearChip(key) {
    if (key === 'year') setYearDefaultDismissed(true)
    const next = { ...appliedFilters }
    delete next[key]
    setFilters(next)
  }

  function clearFilters() {
    setYearDefaultDismissed(true)
    setFilters({})
  }

  function setFilter(key, value) {
    if (key === 'year') setYearDefaultDismissed(true)
    setFilters({ ...appliedFilters, [key]: value })
  }

  const shell = useDashboardShell()
  const filtersOpen = shell.filtersOpen
  const panelId = useId()
  const desktopTabRef = useRef(null)
  const mobileTabRef = useRef(null)
  const closeRef = useRef(null)
  const filtersWereOpen = useRef(filtersOpen)
  const [drawer, setDrawer] = useState(filtersOpen ? 'open' : 'closed')
  const [trackedFiltersOpen, setTrackedFiltersOpen] = useState(filtersOpen)
  const [isDesktopFilters, setIsDesktopFilters] = useState(() => window.matchMedia('(min-width: 1024px)').matches)
  if (filtersOpen !== trackedFiltersOpen) {
    setTrackedFiltersOpen(filtersOpen)
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    setDrawer(reduceMotion ? (filtersOpen ? 'open' : 'closed') : (filtersOpen ? 'enter' : 'leave'))
  }

  useEffect(() => {
    const media = window.matchMedia('(min-width: 1024px)')
    const onChange = () => setIsDesktopFilters(media.matches)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    if (drawer === 'enter') {
      let inner = 0
      const frame = requestAnimationFrame(() => {
        inner = requestAnimationFrame(() => setDrawer('open'))
      })
      return () => {
        cancelAnimationFrame(frame)
        cancelAnimationFrame(inner)
      }
    }
    if (drawer !== 'leave') return undefined
    const timeout = window.setTimeout(() => setDrawer('closed'), FILTER_MOTION_MS)
    return () => window.clearTimeout(timeout)
  }, [drawer])

  useEffect(() => {
    if (!(filtersWereOpen.current && !filtersOpen && drawer === 'closed')) return
    filtersWereOpen.current = false
    const visible = [desktopTabRef.current, mobileTabRef.current].find((node) => node && node.offsetParent !== null)
    visible?.focus()
  }, [filtersOpen, drawer])

  useEffect(() => {
    if (filtersOpen) filtersWereOpen.current = true
  }, [filtersOpen])

  useEffect(() => {
    if (drawer === 'closed' || !window.matchMedia('(max-width: 1023px)').matches) return undefined
    const dialog = document.getElementById(`${panelId}-mob`)
    if (drawer === 'open') closeRef.current?.focus()
    function onKey(event) {
      if (event.key === 'Escape') {
        event.preventDefault()
        shell.closeFilters()
        return
      }
      if (event.key !== 'Tab' || !dialog) return
      const nodes = [...dialog.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((node) => !node.hasAttribute('disabled') && node.tabIndex !== -1)
      if (!nodes.length) return
      const first = nodes[0]
      const last = nodes.at(-1)
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [drawer, panelId, shell])

  if (role !== 'gestor') return null

  const orders = rows.length ? aggregateSales(rows).orders : 0
  const countLabel = prepared.rows.length ? `${rows.length} de ${prepared.rows.length} linhas · ${orders} pedidos` : '—'
  const reload = () => setRefresh((value) => value + 1)

  function dimension(key, label, searchable = false) {
    return (
      <FilterSelect
        key={key}
        label={label}
        options={filterOptions[key]}
        value={appliedFilters[key] || []}
        searchable={searchable}
        onChange={(value) => setFilter(key, value)}
      />
    )
  }

  const filterBody = (
    <>
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Período</p>
        <div className="grid grid-cols-2 gap-2">
          <DatePicker size="compact" label="De" value={appliedFilters.start || ''} onChange={(event) => setFilter('start', event.target.value)} />
          <DatePicker size="compact" label="Até" value={appliedFilters.end || ''} onChange={(event) => setFilter('end', event.target.value)} />
        </div>
        {dimension('year', 'Ano')}
        {dimension('month', 'Mês')}
      </div>
      <div className="space-y-2 border-t border-slate-100 pt-3">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Dimensões</p>
        {dimension('branch', 'Filial')}
        {dimension('saleType', 'Tipo de venda')}
        {dimension('harvest', 'Safra', true)}
        {dimension('culture', 'Cultura', true)}
        {dimension('productType', 'Tipo')}
        {dimension('product', 'Produto', true)}
        {dimension('client', 'Cliente', true)}
        {dimension('supplier', 'Fornecedor', true)}
        {dimension('consultant', 'Consultor', true)}
        {familyKnown ? (
          <Select
            label="Família/custo"
            size="compact"
            placeholder="Todas"
            options={[{ value: 'exclude', label: 'Sem família/custo' }, { value: 'only', label: 'Só família/custo' }]}
            value={appliedFilters.family || ''}
            onChange={(event) => setFilter('family', event.target.value)}
          />
        ) : null}
      </div>
    </>
  )

  const shortcutCards = operationsLoading
    ? Array.from({ length: 4 }).map((_, index) => (
        <InfoStatCard key={index} label="…" value="—" hint="Carregando" icon={IconClipboardList} accent="text-slate-500 bg-slate-100" />
      ))
    : operations.map((card) => (
        <Link key={card.label} to={card.to} className="block min-w-0">
          <InfoStatCard label={card.label} value={card.value} hint={card.hint} icon={card.icon} accent={card.accent} />
        </Link>
      ))

  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-2xl border border-primary-100/80 bg-gradient-to-br from-primary-50/80 via-white to-violet-50/40 p-4 shadow-sm sm:rounded-[2rem] sm:p-6">
        <div className="pointer-events-none absolute -right-8 -top-8 size-28 rounded-full bg-primary-200/30 blur-3xl" aria-hidden />
        <PageHeader
          eyebrow="Gestão comercial"
          title="Dashboard"
          description="Acompanhe faturamento, volume e margem das vendas."
          actions={
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
              {onNew ? <Button type="button" className="w-full sm:w-auto" onClick={onNew}>Nova simulação</Button> : null}
              {onPending ? <Button type="button" variant="secondary" className="w-full sm:w-auto" onClick={onPending}>Ver pendentes</Button> : null}
            </div>
          }
          className="relative mb-0"
        />
      </div>

      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {shortcutCards}
          </div>

          {activeChips.length ? (
            <div className={`flex flex-wrap items-center gap-1.5 px-3 py-2 ${CARD}`}>
              <span className="mr-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Filtros</span>
              {activeChips.map(([key, label]) => (
                <button key={key} type="button" onClick={() => clearChip(key)} className="max-w-full truncate rounded-full bg-primary-50 px-2.5 py-1 text-xs font-medium text-primary-800">
                  {label} <span aria-hidden="true">×</span><span className="sr-only">Remover filtro</span>
                </button>
              ))}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <div className={`inline-flex max-w-full gap-0.5 overflow-x-auto p-1 ${CARD}`} role="tablist" aria-label="Visões de vendas">
              {TABS.map(([key, label]) => (
                <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)} className={`shrink-0 rounded-xl px-3 py-1.5 text-xs font-semibold ${tab === key ? 'bg-primary-600 text-white' : 'text-slate-500 hover:text-slate-800'}`}>{label}</button>
              ))}
            </div>
            <p className="text-xs text-slate-500">{loading ? (bundle ? 'Atualizando…' : 'Carregando…') : countLabel}</p>
          </div>

          {error ? <AlertMessage>{error}</AlertMessage> : null}
          {loading && !bundle ? <DashboardPending /> : null}
          {bundle && tab === 'overview' ? <Overview rows={rows} measure={measure} setMeasure={setMeasure} dollar={bundle?.config.dollar} snapshotDelta={snapshotDeltaOf(bundle, appliedFilters, prepared.rows, yearNow)} familyKnown={familyKnown} alerts={alerts} /> : null}
          {bundle && tab === 'week' ? <WeekView rows={rows} alerts={alerts} /> : null}
          {bundle && tab === 'cash' ? <CashView rows={rows} allRows={prepared.rows} filters={appliedFilters} /> : null}
          {bundle && tab === 'annual' ? <AnnualView allRows={prepared.rows} filters={appliedFilters} steps={bundle?.config.steps} measure={measure} setMeasure={setMeasure} /> : null}
          {bundle && tab === 'consultants' ? <ConsultantView allRows={prepared.rows} filters={appliedFilters} goals={bundle?.config.goals ?? []} goalsKnown={bundle?.fields?.goals === true} /> : null}
          {bundle && tab === 'margin' ? <MarginView allRows={prepared.rows} filters={appliedFilters} alerts={alerts} /> : null}
        </div>

        {isDesktopFilters ? (
          <aside id={`${panelId}-desk`} aria-label="Filtros" className={`filter-shell sticky top-0 hidden h-[calc(100svh-2rem)] shrink-0 overflow-hidden lg:flex ${filtersOpen ? 'is-open' : 'is-collapsed'} ${CARD}`}>
            <FilterRail embedded hidden={filtersOpen} buttonRef={desktopTabRef} count={activeChips.length} controls={`${panelId}-desk`} onClick={shell.openFilters} />
            <div className="filter-panel" inert={filtersOpen ? undefined : true}>
              <FilterPanel onClose={shell.closeFilters} onClear={clearFilters} loading={loading} onRefresh={reload}>{filterBody}</FilterPanel>
            </div>
          </aside>
        ) : null}

        {isDesktopFilters ? null : (
          <FilterRail hidden={drawer !== 'closed'} buttonRef={mobileTabRef} count={activeChips.length} controls={`${panelId}-mob`} onClick={shell.openFilters} className="sticky top-0 h-[calc(100svh-4.5rem)] lg:hidden" />
        )}
        {!isDesktopFilters && drawer !== 'closed' ? (
          <div className="lg:hidden">
            <button type="button" className={`filter-backdrop fixed inset-0 z-40 bg-slate-900/30 ${drawer === 'open' ? 'is-open' : ''}`} aria-label="Fechar filtros" onClick={shell.closeFilters} />
            <aside id={`${panelId}-mob`} role="dialog" aria-modal="true" aria-label="Filtros" className={`filter-drawer fixed inset-y-0 right-0 z-50 flex w-[min(100%,20rem)] flex-col rounded-l-3xl bg-white shadow-xl ${drawer === 'open' ? 'is-open' : ''}`}>
              <FilterPanel closeRef={closeRef} onClose={shell.closeFilters} onClear={clearFilters} loading={loading} onRefresh={reload}>{filterBody}</FilterPanel>
            </aside>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function snapshotDeltaOf(bundle, filters, rows, year) {
  if (!bundle?.fields?.snapshots) return null
  const ignored = ['start', 'end', 'month', 'branch', 'saleType', 'supplier', 'culture', 'productType', 'product', 'consultant', 'client', 'harvest', 'family']
  if (ignored.some((key) => Array.isArray(filters[key]) ? filters[key].length : filters[key])) return null
  if (filters.year?.length && !(filters.year.length === 1 && filters.year[0] === year)) return null
  const previous = (bundle.config.snapshots ?? []).find((item) => String(item.ano) === year)
  if (!previous) return null
  const stats = aggregateSales(filterSales(rows, { year }))
  return {
    revenue: stats.revenue - Number(previous.faturamento),
    volume: stats.volume - Number(previous.volume),
    margin: stats.margin == null || previous.margem == null ? null : stats.margin - Number(previous.margem),
  }
}
