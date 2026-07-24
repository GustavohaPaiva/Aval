import { useState } from 'react'
import { ESTADOS_PRODUTO, CLASSES_PRODUTO } from '../../constants/mapeamentoCampos'
import { Input } from '../ui/Input'
import { Modal } from '../ui/Modal'
import { ModalFormFooter } from '../ui/ModalFormFooter'
import { Select } from '../ui/Select'
import { parsePrecoValue } from '../../utils/spreadsheetAnalyzer'

const EMPTY = {
  nome: '',
  referencia_complementar: '',
  estado: '',
  classe: 'Convencional',
  preco_original: '',
}

function buildForm(initial) {
  if (!initial) return EMPTY
  return {
    nome: initial.nome ?? '',
    referencia_complementar:
      initial.referencia_complementar ?? initial.sku_fornecedor ?? '',
    estado: initial.estado ?? '',
    classe: initial.classe ?? 'Convencional',
    preco_original: String(initial.preco_original ?? ''),
  }
}

export function ModalStagingRowForm({
  open,
  onClose,
  onSave,
  initial,
  title = 'Adicionar produto',
  loteMoeda = 'USD',
  loteQuarter = '',
  loteEstado = '',
}) {
  const [form, setForm] = useState(() => buildForm(initial))
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)

    if (!form.nome.trim()) {
      setError('Informe o fertilizante.')
      return
    }

    const estado = form.estado.trim() || String(loteEstado ?? '').trim()
    if (!['MG', 'SP'].includes(estado)) {
      setError('Selecione o estado (MG ou SP).')
      return
    }

    const preco = parsePrecoValue(form.preco_original)
    if (preco === null) {
      setError('Informe um preço de custo válido.')
      return
    }

    setSaving(true)
    const res = await onSave({
      sku_fornecedor: form.referencia_complementar.trim(),
      referencia_complementar: form.referencia_complementar.trim(),
      nome: form.nome.trim(),
      estado,
      classe: form.classe,
      quarter: loteQuarter,
      preco_original: preco,
      moeda: loteMoeda,
    })
    setSaving(false)

    if (res && !res.ok) {
      setError(res.error)
      return
    }

    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <ModalFormFooter
          formId="staging-row-form"
          onCancel={onClose}
          submitLabel="Salvar"
          loading={saving}
        />
      }
    >
      <form
        id="staging-row-form"
        onSubmit={handleSubmit}
        className="flex flex-col gap-4"
      >
        <Input
          label="Fertilizante"
          value={form.nome}
          onChange={(e) => setForm((p) => ({ ...p, nome: e.target.value }))}
          disabled={saving}
        />
        <Input
          label="Referência complementar (opcional)"
          value={form.referencia_complementar}
          onChange={(e) =>
            setForm((p) => ({ ...p, referencia_complementar: e.target.value }))
          }
          disabled={saving}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Estado"
            placeholder="Selecione…"
            value={form.estado || loteEstado}
            onChange={(e) => setForm((p) => ({ ...p, estado: e.target.value }))}
            options={ESTADOS_PRODUTO}
            disabled={saving}
          />
          <Select
            label="Classe"
            value={form.classe}
            onChange={(e) => setForm((p) => ({ ...p, classe: e.target.value }))}
            options={CLASSES_PRODUTO}
            disabled={saving}
          />
        </div>
        <Input
          label="Preço de custo (USD)"
          value={form.preco_original}
          onChange={(e) =>
            setForm((p) => ({ ...p, preco_original: e.target.value }))
          }
          disabled={saving}
        />
        <p className="text-xs text-slate-500">
          Moeda do lote: {loteMoeda}
          {loteQuarter ? ` · Quarter: ${loteQuarter}` : ''}
        </p>
        {error ? (
          <p className="text-sm font-medium text-feedback-error" role="alert">
            {error}
          </p>
        ) : null}
      </form>
    </Modal>
  )
}
