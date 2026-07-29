import { useCallback, useMemo, useState } from 'react'
import { AlertMessage } from '../components/ui/AlertMessage'
import { Button } from '../components/ui/Button'
import { DataTable } from '../components/ui/DataTable'
import { EmptyState } from '../components/ui/EmptyState'
import { Input } from '../components/ui/Input'
import { MobileCardList } from '../components/ui/MobileCardList'
import { Modal } from '../components/ui/Modal'
import { PageHeader } from '../components/ui/PageHeader'
import { useSyncPageLoading } from '../contexts/PageLoadingContext'
import { useAbortableAsync } from '../hooks/useAbortableAsync'
import {
  aggregateComissaoTotais,
  createComissaoFaixa,
  deleteComissaoFaixa,
  fetchComissaoFaixas,
  fetchComissaoRegistros,
  updateComissaoFaixa,
} from '../services/comissaoService'
import { TIPOS_COMISSAO_PRODUTO } from '../utils/comissaoCalculations'
import { formatShortDate } from '../utils/formatShortDate'
import { formatBRL } from '../utils/money'

const STATUS_FILTERS = [
  { key: 'all', label: 'Todos' },
  { key: 'calculada', label: 'Calculada' },
  { key: 'confirmada', label: 'Confirmada' },
  { key: 'cancelada', label: 'Cancelada' },
]

const STATUS_META = {
  calculada: {
    label: 'Calculada',
    className: 'bg-amber-50 text-amber-800 ring-amber-200',
  },
  confirmada: {
    label: 'Confirmada',
    className: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  },
  cancelada: {
    label: 'Cancelada',
    className: 'bg-rose-50 text-rose-800 ring-rose-200',
  },
}

function parseDecimalBr(value) {
  const normalized = String(value ?? '')
    .trim()
    .replace(/\./g, '')
    .replace(',', '.')
  if (!normalized) return null
  const num = Number.parseFloat(normalized)
  return Number.isFinite(num) ? num : NaN
}

function formatDecimalBr(value, { min = 2, max = 4 } = {}) {
  if (value == null || value === '') return ''
  const num = Number(value)
  if (!Number.isFinite(num)) return ''
  return num.toLocaleString('pt-BR', {
    minimumFractionDigits: min,
    maximumFractionDigits: max,
  })
}

function StatusBadge({ status }) {
  const meta = STATUS_META[status] ?? {
    label: status || '—',
    className: 'bg-slate-50 text-slate-700 ring-slate-200',
  }
  return (
    <span
      className={[
        'inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1',
        meta.className,
      ].join(' ')}
    >
      {meta.label}
    </span>
  )
}

function FaixaRowEditor({ row, onSaved, onDeleted, disabled }) {
  const [margem, setMargem] = useState(
    formatDecimalBr(row.margem_minima_percentual, { min: 0, max: 4 }),
  )
  const [comissao, setComissao] = useState(
    formatDecimalBr(row.comissao_percentual, { min: 2, max: 4 }),
  )
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState(null)

  async function handleSave(e) {
    e.preventDefault()
    setError(null)
    const margemNum = parseDecimalBr(margem)
    const comissaoNum = parseDecimalBr(comissao)
    if (!Number.isFinite(margemNum) || margemNum < 0) {
      setError('Margem mínima inválida.')
      return
    }
    if (!Number.isFinite(comissaoNum) || comissaoNum < 0) {
      setError('Comissão inválida.')
      return
    }

    setSaving(true)
    const res = await updateComissaoFaixa(row.id, {
      margem_minima_percentual: margemNum,
      comissao_percentual: comissaoNum,
    })
    setSaving(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    onSaved?.(res.row)
  }

  async function handleDelete() {
    setError(null)
    setDeleting(true)
    const res = await deleteComissaoFaixa(row.id)
    setDeleting(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    onDeleted?.(row.id)
  }

  return (
    <form
      onSubmit={handleSave}
      className="grid gap-3 rounded-2xl border border-slate-200/90 bg-slate-50/50 p-3 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end"
    >
      <Input
        label="Margem mínima (%)"
        inputMode="decimal"
        value={margem}
        onChange={(e) => setMargem(e.target.value)}
        disabled={disabled || saving || deleting}
      />
      <Input
        label="Comissão (%)"
        inputMode="decimal"
        value={comissao}
        onChange={(e) => setComissao(e.target.value)}
        disabled={disabled || saving || deleting}
      />
      <Button type="submit" loading={saving} disabled={disabled || deleting}>
        Salvar
      </Button>
      <Button
        type="button"
        variant="secondary"
        loading={deleting}
        disabled={disabled || saving}
        onClick={handleDelete}
      >
        Remover
      </Button>
      {error ? (
        <p
          className="text-sm font-medium text-feedback-error sm:col-span-4"
          role="alert"
        >
          {error}
        </p>
      ) : null}
    </form>
  )
}

function FaixaTipoSection({ tipo, rows, onChanged, disabled }) {
  const [novaMargem, setNovaMargem] = useState('')
  const [novaComissao, setNovaComissao] = useState('')
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState(null)

  const titulo =
    tipo === 'Especial' ? 'Produtos especiais' : 'Produtos convencionais'

  async function handleAdd(e) {
    e.preventDefault()
    setAddError(null)
    const margemNum = parseDecimalBr(novaMargem)
    const comissaoNum = parseDecimalBr(novaComissao)
    if (!Number.isFinite(margemNum) || margemNum < 0) {
      setAddError('Informe a margem mínima.')
      return
    }
    if (!Number.isFinite(comissaoNum) || comissaoNum < 0) {
      setAddError('Informe o percentual de comissão.')
      return
    }

    setAdding(true)
    const res = await createComissaoFaixa({
      tipo_produto: tipo,
      margem_minima_percentual: margemNum,
      comissao_percentual: comissaoNum,
    })
    setAdding(false)
    if (!res.ok) {
      setAddError(res.error)
      return
    }
    setNovaMargem('')
    setNovaComissao('')
    onChanged?.()
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm sm:rounded-3xl sm:p-5">
      <h3 className="text-sm font-semibold text-slate-900">{titulo}</h3>
      <p className="mt-1 text-sm text-slate-600">
        A comissão usa a maior faixa cuja margem mínima é ≤ à margem do
        produto/pedido. Abaixo da menor faixa, a comissão é 0%.
      </p>

      <div className="mt-4 space-y-3">
        {rows.length === 0 ? (
          <EmptyState
            title="Nenhuma faixa cadastrada"
            description="Adicione ao menos uma faixa de margem × comissão."
          />
        ) : (
          rows.map((row) => (
            <FaixaRowEditor
              key={row.id}
              row={row}
              disabled={disabled}
              onSaved={() => onChanged?.()}
              onDeleted={() => onChanged?.()}
            />
          ))
        )}
      </div>

      <form
        onSubmit={handleAdd}
        className="mt-5 grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
      >
        <Input
          label="Nova margem mínima (%)"
          inputMode="decimal"
          placeholder="Ex.: 8"
          value={novaMargem}
          onChange={(e) => setNovaMargem(e.target.value)}
          disabled={disabled || adding}
        />
        <Input
          label="Nova comissão (%)"
          inputMode="decimal"
          placeholder="Ex.: 0,60"
          value={novaComissao}
          onChange={(e) => setNovaComissao(e.target.value)}
          disabled={disabled || adding}
        />
        <Button type="submit" loading={adding} disabled={disabled}>
          Adicionar faixa
        </Button>
        {addError ? (
          <p
            className="text-sm font-medium text-feedback-error sm:col-span-3"
            role="alert"
          >
            {addError}
          </p>
        ) : null}
      </form>
    </section>
  )
}

function ComissaoParametrosModal({ open, onClose }) {
  const [faixas, setFaixas] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [successMessage, setSuccessMessage] = useState(null)

  const loadFaixas = useCallback(async (isActive) => {
    setLoading(true)
    setError(null)
    const res = await fetchComissaoFaixas()
    if (isActive && !isActive()) return
    setLoading(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    setFaixas(res.rows)
  }, [])

  useAbortableAsync(
    async (_signal, isActive) => {
      setSuccessMessage(null)
      await loadFaixas(isActive)
    },
    [loadFaixas],
    open,
  )

  const byTipo = useMemo(() => {
    const map = Object.fromEntries(TIPOS_COMISSAO_PRODUTO.map((t) => [t, []]))
    for (const row of faixas) {
      const tipo = TIPOS_COMISSAO_PRODUTO.includes(row.tipo_produto)
        ? row.tipo_produto
        : 'Convencional'
      map[tipo].push(row)
    }
    return map
  }, [faixas])

  async function reload() {
    setSuccessMessage('Faixas atualizadas.')
    await loadFaixas(() => true)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Parâmetros de comissão"
      size="2xl"
      footer={
        <div className="flex justify-end">
          <Button type="button" variant="secondary" onClick={onClose}>
            Fechar
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          Faixas de margem × comissão dos consultores, separadas por classe de
          produto (Convencional e Especial).
        </p>
        {error ? <AlertMessage>{error}</AlertMessage> : null}
        {successMessage ? (
          <AlertMessage tone="success" role="status">
            {successMessage}
          </AlertMessage>
        ) : null}
        {TIPOS_COMISSAO_PRODUTO.map((tipo) => (
          <FaixaTipoSection
            key={tipo}
            tipo={tipo}
            rows={byTipo[tipo] ?? []}
            disabled={loading}
            onChanged={reload}
          />
        ))}
      </div>
    </Modal>
  )
}

function consultorNome(row) {
  return row.consultor_nome ?? '—'
}

function clienteNome(row) {
  return row.simulations?.clients?.nome ?? '—'
}

export function ComissaoPage() {
  const [registros, setRegistros] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [statusFilter, setStatusFilter] = useState('all')
  const [paramsOpen, setParamsOpen] = useState(false)

  const loadPage = useCallback(async (isActive) => {
    setLoading(true)
    setError(null)
    const res = await fetchComissaoRegistros()
    if (isActive && !isActive()) return
    setLoading(false)
    if (!res.ok) {
      setError(res.error)
      setRegistros([])
      return
    }
    setRegistros(res.rows)
  }, [])

  useSyncPageLoading(loading)

  useAbortableAsync(
    async (_signal, isActive) => {
      await loadPage(isActive)
    },
    [loadPage],
  )

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return registros
    return registros.filter((row) => row.status === statusFilter)
  }, [registros, statusFilter])

  const totals = useMemo(
    () => aggregateComissaoTotais(registros),
    [registros],
  )

  const columns = useMemo(
    () => [
      {
        key: 'consultor',
        header: 'Consultor',
        cell: (row) => (
          <div className="min-w-0">
            <p className="font-medium text-slate-900">{consultorNome(row)}</p>
            <p className="truncate text-xs text-slate-500">
              {clienteNome(row)}
            </p>
          </div>
        ),
      },
      {
        key: 'valor',
        header: 'Comissão',
        align: 'right',
        cell: (row) => (
          <span className="finance-text font-semibold text-slate-900">
            {formatBRL(Number(row.comissao_valor) || 0)}
          </span>
        ),
      },
      {
        key: 'data',
        header: 'Data',
        cell: (row) =>
          row.calculado_em ? formatShortDate(row.calculado_em) : '—',
      },
      {
        key: 'status',
        header: 'Status',
        cell: (row) => <StatusBadge status={row.status} />,
      },
    ],
    [],
  )

  return (
    <div className="w-full min-w-0 space-y-4 sm:space-y-6">
      <PageHeader
        eyebrow="Aval"
        title="Comissão"
        description="Histórico de comissões geradas por simulação/pedido, com valor, data e status do ciclo."
        actions={
          <Button
            type="button"
            variant="secondary"
            className="w-full"
            onClick={() => setParamsOpen(true)}
          >
            Ver parâmetros de comissão
          </Button>
        }
      />

      {error ? <AlertMessage>{error}</AlertMessage> : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm sm:rounded-3xl">
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-slate-500">
            Confirmadas
          </p>
          <p className="finance-text mt-1 text-lg font-semibold text-slate-900">
            {formatBRL(totals.confirmada)}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm sm:rounded-3xl">
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-slate-500">
            Calculadas
          </p>
          <p className="finance-text mt-1 text-lg font-semibold text-slate-900">
            {formatBRL(totals.calculada)}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm sm:rounded-3xl">
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-slate-500">
            Registros
          </p>
          <p className="mt-1 text-lg font-semibold text-slate-900">
            {totals.count.toLocaleString('pt-BR')}
          </p>
        </div>
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm sm:rounded-3xl">
        <div className="border-b border-slate-100 px-4 py-3.5 sm:px-6 sm:py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            Status
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {STATUS_FILTERS.map((f) => {
              const active = statusFilter === f.key
              return (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setStatusFilter(f.key)}
                  className={[
                    'rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
                    active
                      ? 'bg-primary-600 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200',
                  ].join(' ')}
                >
                  {f.label}
                </button>
              )
            })}
          </div>
        </div>

        <div className="p-4 sm:p-6">
          <DataTable
            columns={columns}
            rows={filtered}
            loading={loading}
            emptyMessage="Nenhuma comissão encontrada."
            getRowKey={(row) => row.id}
          />

          <MobileCardList
            items={filtered}
            loading={loading}
            emptyMessage="Nenhuma comissão encontrada."
            renderItem={(row) => (
              <li
                key={row.id}
                className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900">
                      {consultorNome(row)}
                    </p>
                    <p className="mt-0.5 truncate text-sm text-slate-500">
                      {clienteNome(row)}
                    </p>
                  </div>
                  <StatusBadge status={row.status} />
                </div>
                <div className="mt-3 flex items-end justify-between gap-3">
                  <p className="text-sm text-slate-500">
                    {row.calculado_em
                      ? formatShortDate(row.calculado_em)
                      : '—'}
                  </p>
                  <p className="finance-text text-base font-semibold text-slate-900">
                    {formatBRL(Number(row.comissao_valor) || 0)}
                  </p>
                </div>
              </li>
            )}
          />
        </div>
      </section>

      <ComissaoParametrosModal
        open={paramsOpen}
        onClose={() => setParamsOpen(false)}
      />
    </div>
  )
}
