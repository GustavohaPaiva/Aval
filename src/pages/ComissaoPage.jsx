import { useCallback, useMemo, useState } from 'react'
import { AlertMessage } from '../components/ui/AlertMessage'
import { Button } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'
import { Input } from '../components/ui/Input'
import { PageHeader } from '../components/ui/PageHeader'
import { useSyncPageLoading } from '../contexts/PageLoadingContext'
import { useAbortableAsync } from '../hooks/useAbortableAsync'
import {
  createComissaoFaixa,
  deleteComissaoFaixa,
  fetchComissaoFaixas,
  updateComissaoFaixa,
} from '../services/comissaoService'
import { TIPOS_COMISSAO_PRODUTO } from '../utils/comissaoCalculations'

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

function FaixaTipoSection({
  tipo,
  rows,
  onChanged,
  disabled,
}) {
  const [novaMargem, setNovaMargem] = useState('')
  const [novaComissao, setNovaComissao] = useState('')
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState(null)

  const titulo =
    tipo === 'Especial' ? 'Produtos especiais (Yara)' : 'Produtos convencionais'

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
    <section className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm sm:rounded-3xl sm:p-6">
      <h2 className="text-sm font-semibold text-slate-900">{titulo}</h2>
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

export function ComissaoPage() {
  const [faixas, setFaixas] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [successMessage, setSuccessMessage] = useState(null)

  const loadPage = useCallback(async (isActive) => {
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

  useSyncPageLoading(loading)

  useAbortableAsync(
    async (_signal, isActive) => {
      await loadPage(isActive)
    },
    [loadPage],
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
    await loadPage(() => true)
  }

  return (
    <div className="w-full min-w-0 space-y-4 sm:space-y-6">
      <PageHeader
        eyebrow="Aval"
        title="Comissão"
        description="Faixas de margem × comissão dos consultores, separadas por classe de produto (Convencional e Especial)."
      />

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
  )
}
