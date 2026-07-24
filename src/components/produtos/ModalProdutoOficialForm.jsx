import { useState } from 'react'
import { ESTADOS_PRODUTO, CLASSES_PRODUTO } from '../../constants/mapeamentoCampos'
import { Input } from '../ui/Input'
import { Modal } from '../ui/Modal'
import { ModalFormFooter } from '../ui/ModalFormFooter'
import { Select } from '../ui/Select'
import { parsePrecoValue } from '../../utils/spreadsheetAnalyzer'

const MOEDA_OPTIONS = [
  { value: 'BRL', label: 'BRL' },
  { value: 'USD', label: 'USD' },
  { value: 'EUR', label: 'EUR' },
]

const EMPTY = {
  nome: '',
  referencia_complementar: '',
  estado: '',
  classe: 'Convencional',
  quarter: '',
  preco_original: '',
  desconto_usd: '0',
  moeda_origem: 'USD',
}

function buildForm(initial) {
  if (!initial) return EMPTY
  return {
    nome: initial.nome ?? '',
    referencia_complementar:
      initial.referencia_complementar ?? initial.sku_fornecedor ?? '',
    estado: initial.estado ?? '',
    classe: initial.classe ?? 'Convencional',
    quarter: initial.quarter ?? '',
    preco_original: String(initial.preco_original ?? ''),
    desconto_usd: String(initial.desconto_usd ?? 0),
    moeda_origem: initial.moeda_origem ?? 'USD',
  }
}

export function ModalProdutoOficialForm({
  open,
  onClose,
  onSave,
  initial,
  title = 'Novo produto',
  fornecedores,
}) {
  const [form, setForm] = useState(() => buildForm(initial))
  const [fornecedorId, setFornecedorId] = useState(
    () => initial?.fornecedor_id ?? fornecedores?.[0]?.id ?? '',
  )
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  const showFornecedorSelect = Boolean(fornecedores?.length) && !initial?.id

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)

    if (showFornecedorSelect && !fornecedorId) {
      setError('Selecione um fornecedor.')
      return
    }

    if (!form.nome.trim() || !form.quarter.trim()) {
      setError('Preencha fertilizante e quarter.')
      return
    }
    if (!form.estado) {
      setError('Selecione o estado (MG ou SP).')
      return
    }

    const preco = parsePrecoValue(form.preco_original)
    if (preco === null) {
      setError('Informe um preço de custo válido.')
      return
    }

    const descontoRaw = String(form.desconto_usd ?? '').trim()
    const desconto =
      descontoRaw === '' ? 0 : parsePrecoValue(descontoRaw)
    if (desconto === null) {
      setError('Informe um desconto USD válido (maior ou igual a zero).')
      return
    }
    if (preco - desconto < 0) {
      setError('Desconto USD não pode ser maior que o preço de custo.')
      return
    }

    setSaving(true)
    const res = await onSave({
      id: initial?.id,
      fornecedorId: showFornecedorSelect ? fornecedorId : undefined,
      sku_fornecedor: form.referencia_complementar.trim(),
      referencia_complementar: form.referencia_complementar.trim(),
      nome: form.nome.trim(),
      estado: form.estado,
      classe: form.classe,
      quarter: form.quarter.trim(),
      preco_original: preco,
      desconto_usd: desconto,
      moeda_origem: form.moeda_origem,
    })
    setSaving(false)

    if (res && !res.ok) {
      setError(res.error)
      return
    }

    onClose()
  }

  const fornecedorOptions =
    fornecedores?.map((f) => ({ value: f.id, label: f.nome })) ?? []

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <ModalFormFooter
          formId="produto-oficial-form"
          onCancel={onClose}
          submitLabel="Salvar"
          loading={saving}
        />
      }
    >
      <form
        id="produto-oficial-form"
        onSubmit={handleSubmit}
        className="flex flex-col gap-4"
      >
        {showFornecedorSelect ? (
          <Select
            label="Fornecedor"
            value={fornecedorId}
            onChange={(e) => setFornecedorId(e.target.value)}
            options={fornecedorOptions}
            disabled={saving}
          />
        ) : null}
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
          disabled={saving || Boolean(initial?.id)}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Estado"
            placeholder="Selecione…"
            value={form.estado}
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
          label="Quarter"
          value={form.quarter}
          onChange={(e) =>
            setForm((p) => ({ ...p, quarter: e.target.value }))
          }
          disabled={saving}
          placeholder="Ex.: Q2 2026"
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Preço de custo (USD)"
            value={form.preco_original}
            onChange={(e) =>
              setForm((p) => ({ ...p, preco_original: e.target.value }))
            }
            disabled={saving}
          />
          <Input
            label="Desconto USD"
            value={form.desconto_usd}
            onChange={(e) =>
              setForm((p) => ({ ...p, desconto_usd: e.target.value }))
            }
            disabled={saving}
          />
        </div>
        <Select
          label="Moeda"
          value={form.moeda_origem}
          onChange={(e) =>
            setForm((p) => ({ ...p, moeda_origem: e.target.value }))
          }
          options={MOEDA_OPTIONS}
          disabled={saving}
        />
        {error ? (
          <p className="text-sm font-medium text-feedback-error" role="alert">
            {error}
          </p>
        ) : null}
      </form>
    </Modal>
  )
}
