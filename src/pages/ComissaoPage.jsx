import { useCallback, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { IconEye } from '../components/icons'
import { AlertMessage } from '../components/ui/AlertMessage'
import { Button } from '../components/ui/Button'
import { DataTable } from '../components/ui/DataTable'
import { DatePicker } from '../components/ui/DatePicker'
import { EmptyState } from '../components/ui/EmptyState'
import { Input } from '../components/ui/Input'
import { MobileCardList } from '../components/ui/MobileCardList'
import { Modal } from '../components/ui/Modal'
import { PageHeader } from '../components/ui/PageHeader'
import { SearchInput } from '../components/ui/SearchInput'
import { Select } from '../components/ui/Select'
import { useSyncPageLoading } from '../contexts/PageLoadingContext'
import { useAbortableAsync } from '../hooks/useAbortableAsync'
import { useAuth } from '../hooks/useAuth'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import { usePersistedFilters } from '../hooks/usePersistedFilters'
import {
  aggregateComissaoTotais,
  applyComissaoRegistroFaixas,
  createComissaoFaixa,
  deleteComissaoFaixa,
  fetchComissaoFaixas,
  fetchComissaoRegistroDetalhe,
  fetchComissaoRegistros,
  updateComissaoFaixa,
} from '../services/comissaoService'
import {
  calcComissaoMediaPercentual,
  TIPOS_COMISSAO_PRODUTO,
} from '../utils/comissaoCalculations'
import { formatShortDate } from '../utils/formatShortDate'
import { formatBRL, formatComissaoPctValor, formatPercentPoints } from '../utils/money'

function pedidoPath(simulationId) {
  if (!simulationId) return null
  return `/pedido/${encodeURIComponent(simulationId)}`
}

const STATUS_OPTIONS = [
  { value: '', label: 'Todos os status' },
  { value: 'calculada', label: 'Calculada' },
  { value: 'confirmada', label: 'Confirmada' },
  { value: 'cancelada', label: 'Cancelada' },
]

const EMPTY_FILTERS = {
  searchQuery: '',
  consultorId: '',
  status: '',
  dateFrom: '',
  dateTo: '',
}

/** YYYY-MM-DD local from an ISO timestamp (for inclusive date-range compare). */
function toLocalDateKey(iso) {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

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

function registroComissaoLabel(row) {
  const pct = calcComissaoMediaPercentual(
    row.comissao_valor,
    row.base_calculo,
  )
  return formatComissaoPctValor(pct, row.comissao_valor)
}

function ComissaoValorLink({ row }) {
  const path = pedidoPath(row.simulation_id)
  const label = registroComissaoLabel(row)
  if (!path) {
    return (
      <span className="finance-text font-semibold text-slate-900">{label}</span>
    )
  }
  return (
    <Link
      to={path}
      className="finance-text font-semibold text-primary-700 underline-offset-2 hover:text-primary-800 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
      title="Abrir pedido desta comissão"
    >
      {label}
    </Link>
  )
}

function DraftFaixaRow({ row, disabled, onChange, onRemove }) {
  const [margem, setMargem] = useState(
    formatDecimalBr(row.margem_minima_percentual, { min: 0, max: 4 }),
  )
  const [comissao, setComissao] = useState(
    formatDecimalBr(row.comissao_percentual, { min: 2, max: 4 }),
  )

  function updateMargem(value) {
    setMargem(value)
    const margemNum = parseDecimalBr(value)
    if (!Number.isFinite(margemNum) || margemNum < 0) return
    onChange?.({
      ...row,
      margem_minima_percentual: margemNum,
    })
  }

  function updateComissao(value) {
    setComissao(value)
    const comissaoNum = parseDecimalBr(value)
    if (!Number.isFinite(comissaoNum) || comissaoNum < 0) return
    onChange?.({
      ...row,
      comissao_percentual: comissaoNum,
    })
  }

  return (
    <div className="grid gap-3 rounded-2xl border border-slate-200/90 bg-slate-50/50 p-3 sm:grid-cols-3 sm:items-end">
      <Input
        label="Margem mínima (%)"
        inputMode="decimal"
        value={margem}
        onChange={(e) => updateMargem(e.target.value)}
        disabled={disabled}
      />
      <Input
        label="Comissão (%)"
        inputMode="decimal"
        value={comissao}
        onChange={(e) => updateComissao(e.target.value)}
        disabled={disabled}
      />
      <Button
        type="button"
        variant="secondary"
        className="w-full"
        disabled={disabled}
        onClick={() => onRemove?.(row.id)}
      >
        Remover
      </Button>
    </div>
  )
}

function DraftFaixaTipoSection({ tipo, rows, disabled, onChangeRows }) {
  const [novaMargem, setNovaMargem] = useState('')
  const [novaComissao, setNovaComissao] = useState('')
  const [addError, setAddError] = useState(null)

  const titulo =
    tipo === 'Especial' ? 'Produtos especiais' : 'Produtos convencionais'

  function handleAdd(e) {
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
    if (
      rows.some(
        (r) => Number(r.margem_minima_percentual) === margemNum,
      )
    ) {
      setAddError('Já existe uma faixa com essa margem mínima.')
      return
    }
    onChangeRows([
      ...rows,
      {
        id: `draft-${tipo}-${margemNum}-${Date.now()}`,
        tipo_produto: tipo,
        margem_minima_percentual: margemNum,
        comissao_percentual: comissaoNum,
        ativo: true,
      },
    ])
    setNovaMargem('')
    setNovaComissao('')
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
            <DraftFaixaRow
              key={row.id}
              row={row}
              disabled={disabled}
              onChange={(next) =>
                onChangeRows(
                  rows.map((r) => (r.id === row.id ? next : r)),
                )
              }
              onRemove={(id) =>
                onChangeRows(rows.filter((r) => r.id !== id))
              }
            />
          ))
        )}
      </div>

      <form
        onSubmit={handleAdd}
        className="mt-5 grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-3 sm:items-end"
      >
        <Input
          label="Nova margem mínima (%)"
          inputMode="decimal"
          placeholder="Ex.: 8"
          value={novaMargem}
          onChange={(e) => setNovaMargem(e.target.value)}
          disabled={disabled}
        />
        <Input
          label="Nova comissão (%)"
          inputMode="decimal"
          placeholder="Ex.: 0,60"
          value={novaComissao}
          onChange={(e) => setNovaComissao(e.target.value)}
          disabled={disabled}
        />
        <Button type="submit" className="w-full" disabled={disabled}>
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

function ComissaoDetalheModal({ open, registroId, canEdit, onClose, onSaved }) {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [registro, setRegistro] = useState(null)
  const [faixas, setFaixas] = useState([])
  const [usingOverride, setUsingOverride] = useState(false)

  const loadDetalhe = useCallback(
    async (isActive) => {
      if (!registroId) return
      setLoading(true)
      setError(null)
      const res = await fetchComissaoRegistroDetalhe(registroId)
      if (isActive && !isActive()) return
      setLoading(false)
      if (!res.ok) {
        setError(res.error)
        setRegistro(null)
        setFaixas([])
        return
      }
      setRegistro(res.registro)
      setUsingOverride(Boolean(res.usingOverride))
      setFaixas(
        (res.faixas ?? []).map((f, idx) => ({
          ...f,
          id:
            f.id ??
            `seed-${f.tipo_produto}-${f.margem_minima_percentual}-${idx}`,
        })),
      )
    },
    [registroId],
  )

  useAbortableAsync(
    async (_signal, isActive) => {
      await loadDetalhe(isActive)
    },
    [loadDetalhe],
    open && Boolean(registroId),
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

  function replaceTipo(tipo, nextRows) {
    setFaixas((prev) => [
      ...prev.filter((r) => r.tipo_produto !== tipo),
      ...nextRows.map((r) => ({ ...r, tipo_produto: tipo })),
    ])
  }

  async function handleApply() {
    if (!canEdit || !registroId) return
    setError(null)
    if (faixas.length === 0) {
      setError('Informe ao menos uma faixa de margem × comissão.')
      return
    }

    setSaving(true)
    const res = await applyComissaoRegistroFaixas({
      registroId,
      faixas,
    })
    setSaving(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    onSaved?.(res)
    onClose?.()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Parâmetros desta comissão"
      size="lg"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Button
            type="button"
            variant="secondary"
            className="w-full flex-1"
            onClick={onClose}
          >
            Fechar
          </Button>
          {canEdit ? (
            <Button
              type="button"
              className="w-full flex-1"
              loading={saving}
              disabled={loading || !registro}
              onClick={handleApply}
            >
              Aplicar a este pedido
            </Button>
          ) : null}
        </div>
      }
    >
      <div className="space-y-4">
        {error ? <AlertMessage>{error}</AlertMessage> : null}

        {loading ? (
          <p className="text-sm text-slate-500">Carregando parâmetros…</p>
        ) : !registro ? (
          <EmptyState
            title="Registro não encontrado"
            description="Não foi possível carregar os parâmetros desta comissão."
          />
        ) : (
          <>
            <div className="grid gap-3 rounded-2xl border border-slate-200/90 bg-slate-50/60 p-4 sm:grid-cols-2">
              <div>
                <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Consultor
                </p>
                <p className="mt-1 text-sm font-medium text-slate-900">
                  {registro.consultor_nome ?? '—'}
                </p>
              </div>
              <div>
                <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Cliente
                </p>
                <p className="mt-1 text-sm font-medium text-slate-900">
                  {registro.simulations?.clients?.nome ?? '—'}
                </p>
              </div>
              <div>
                <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Status
                </p>
                <div className="mt-1">
                  <StatusBadge status={registro.status} />
                </div>
              </div>
              <div>
                <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Comissão atual
                </p>
                <p className="finance-text mt-1 text-sm font-semibold text-slate-900">
                  {registroComissaoLabel(registro)}
                </p>
              </div>
            </div>

            <p className="text-sm text-slate-600">
              {canEdit
                ? usingOverride
                  ? 'Estas faixas valem só para este pedido. As faixas globais não são alteradas.'
                  : 'Partindo das faixas globais. Ao aplicar, o ajuste fica só neste pedido.'
                : 'Faixas usadas no cálculo deste pedido (somente leitura).'}
            </p>

            {TIPOS_COMISSAO_PRODUTO.map((tipo) => (
              <DraftFaixaTipoSection
                key={tipo}
                tipo={tipo}
                rows={byTipo[tipo] ?? []}
                disabled={loading || saving || !canEdit}
                onChangeRows={(next) => replaceTipo(tipo, next)}
              />
            ))}
          </>
        )}
      </div>
    </Modal>
  )
}

export function ComissaoPage() {
  const navigate = useNavigate()
  const { role } = useAuth()
  const isGestor = role === 'gestor'
  const [registros, setRegistros] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [paramsOpen, setParamsOpen] = useState(false)
  const [detalheRegistroId, setDetalheRegistroId] = useState(null)

  const [filters, setFilters, patchFilters] = usePersistedFilters(
    'filters:comissao',
    EMPTY_FILTERS,
  )
  const { searchQuery, consultorId, status, dateFrom, dateTo } = filters
  const debouncedSearch = useDebouncedValue(searchQuery, 300)

  const hasFilters = Boolean(
    searchQuery.trim() || consultorId || status || dateFrom || dateTo,
  )

  function openPedido(row) {
    const path = pedidoPath(row.simulation_id)
    if (!path) return
    navigate(path)
  }

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

  const consultorOptions = useMemo(() => {
    const byId = new Map()
    for (const row of registros) {
      const id = row.consultor_id
      if (id == null || byId.has(String(id))) continue
      byId.set(String(id), {
        value: String(id),
        label: row.consultor_nome || 'Consultor sem nome',
      })
    }
    return [
      { value: '', label: 'Todos os consultores' },
      ...[...byId.values()].sort((a, b) =>
        a.label.localeCompare(b.label, 'pt-BR'),
      ),
    ]
  }, [registros])

  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase()
    return registros.filter((row) => {
      if (consultorId && String(row.consultor_id) !== String(consultorId)) {
        return false
      }
      if (status && row.status !== status) return false

      if (dateFrom || dateTo) {
        const key = toLocalDateKey(row.calculado_em)
        if (!key) return false
        if (dateFrom && key < dateFrom) return false
        if (dateTo && key > dateTo) return false
      }

      if (q) {
        const nome = String(row.consultor_nome ?? '').toLowerCase()
        const cliente = String(
          row.simulations?.clients?.nome ?? '',
        ).toLowerCase()
        if (!nome.includes(q) && !cliente.includes(q)) return false
      }

      return true
    })
  }, [registros, debouncedSearch, consultorId, status, dateFrom, dateTo])

  const totals = useMemo(
    () => aggregateComissaoTotais(filtered),
    [filtered],
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
        cell: (row) => <ComissaoValorLink row={row} />,
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
      {
        key: 'acoes',
        header: '',
        align: 'right',
        cell: (row) => (
          <button
            type="button"
            className="inline-flex size-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-primary-50 hover:text-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
            aria-label="Ver parâmetros desta comissão"
            title="Ver parâmetros desta comissão"
            onClick={() => setDetalheRegistroId(row.id)}
          >
            <IconEye className="size-3.5" />
          </button>
        ),
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

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
            Comissão média
          </p>
          <p className="finance-text mt-1 text-lg font-semibold text-slate-900">
            {formatPercentPoints(totals.mediaPercentual)}
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
        <div className="border-b border-slate-100 bg-gradient-to-r from-primary-50/70 via-white to-emerald-50/40 px-4 py-3.5 sm:px-6 sm:py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary-700">
                Busca e filtros
              </p>
              <p className="mt-1 text-sm text-slate-600">
                Filtre comissões por consultor, status, período ou texto livre.
              </p>
            </div>
            {hasFilters ? (
              <Button
                type="button"
                variant="secondary"
                onClick={() => setFilters({ ...EMPTY_FILTERS })}
              >
                Limpar filtros
              </Button>
            ) : null}
          </div>
        </div>

        <div className="grid gap-4 border-b border-slate-100 p-4 sm:grid-cols-2 sm:p-6 lg:grid-cols-3 xl:grid-cols-6">
          <div className="sm:col-span-2 lg:col-span-3 xl:col-span-2">
            <label
              htmlFor="comissao-busca"
              className="mb-1.5 block text-sm font-medium text-slate-700"
            >
              Busca
            </label>
            <SearchInput
              id="comissao-busca"
              ariaLabel="Buscar por consultor ou cliente"
              placeholder="Consultor ou cliente…"
              value={searchQuery}
              onChange={(e) => patchFilters({ searchQuery: e.target.value })}
            />
          </div>
          <Select
            label="Consultor"
            value={consultorId}
            onChange={(e) => patchFilters({ consultorId: e.target.value })}
            options={consultorOptions}
          />
          <Select
            label="Status"
            value={status}
            onChange={(e) => patchFilters({ status: e.target.value })}
            options={STATUS_OPTIONS}
          />
          <DatePicker
            label="Data de"
            value={dateFrom}
            onChange={(e) => patchFilters({ dateFrom: e.target.value })}
          />
          <DatePicker
            label="Data até"
            value={dateTo}
            onChange={(e) => patchFilters({ dateTo: e.target.value })}
          />
        </div>

        <div className="p-4 sm:p-6">
          <DataTable
            columns={columns}
            rows={filtered}
            loading={loading}
            emptyMessage="Nenhuma comissão encontrada."
            getRowKey={(row) => row.id}
            onRowClick={openPedido}
          />

          <MobileCardList
            items={filtered}
            loading={loading}
            emptyMessage="Nenhuma comissão encontrada."
            renderItem={(row) => (
              <li key={row.id}>
                <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm">
                  <button
                    type="button"
                    onClick={() => openPedido(row)}
                    className="w-full text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
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
                      <span className="finance-text text-base font-semibold text-primary-700 underline-offset-2">
                        {registroComissaoLabel(row)}
                      </span>
                    </div>
                  </button>
                  <div className="mt-3 flex justify-end border-t border-slate-100 pt-3">
                    <button
                      type="button"
                      className="inline-flex size-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-primary-50 hover:text-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
                      aria-label="Ver parâmetros desta comissão"
                      title="Ver parâmetros desta comissão"
                      onClick={() => setDetalheRegistroId(row.id)}
                    >
                      <IconEye className="size-3.5" />
                    </button>
                  </div>
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

      <ComissaoDetalheModal
        open={Boolean(detalheRegistroId)}
        registroId={detalheRegistroId}
        canEdit={isGestor}
        onClose={() => setDetalheRegistroId(null)}
        onSaved={() => {
          void loadPage(() => true)
        }}
      />
    </div>
  )
}
