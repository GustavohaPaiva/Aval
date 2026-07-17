import { useState } from 'react'
import { FRETE_ORIGENS } from '../../constants/fretes'
import { findFreteDuplicate, createFrete, updateFrete } from '../../services/freteService'
import { AlertMessage } from '../ui/AlertMessage'
import { Input } from '../ui/Input'
import { Modal } from '../ui/Modal'
import { ModalFormFooter } from '../ui/ModalFormFooter'
import { Select } from '../ui/Select'
import { useAbortableAsync } from '../../hooks/useAbortableAsync'

const FORM_ID = 'form-frete'

const EMPTY = {
  origem: '',
  destino: '',
  valor: '',
}

export function ModalFreteForm({
  open,
  mode = 'create',
  freteId,
  initial,
  onClose,
  onSaved,
}) {
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState(null)
  const [duplicateHint, setDuplicateHint] = useState(null)

  const isEdit = mode === 'edit'

  useAbortableAsync(
    async (_signal, isActive) => {
      if (!isActive()) return
      setForm({
        origem: initial?.origem ?? '',
        destino: initial?.destino ?? '',
        valor: initial?.valor != null ? String(initial.valor) : '',
      })
      setFormError(null)
      setDuplicateHint(null)
      setSaving(false)
    },
    [open, initial],
    open,
  )

  function handleClose() {
    if (saving) return
    onClose()
  }

  function setField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }))
    if (key === 'origem' || key === 'destino') {
      setDuplicateHint(null)
    }
  }

  async function validateDuplicate() {
    if (!form.origem.trim() || !form.destino.trim()) {
      setDuplicateHint(null)
      return
    }

    const result = await findFreteDuplicate({
      origem: form.origem,
      destino: form.destino,
      excludeId: isEdit ? freteId : undefined,
    })

    if (!result.ok) return
    if (result.duplicate) {
      setDuplicateHint(
        `Já existe um frete para ${result.duplicate.origem} → ${result.duplicate.destino} (R$ ${result.duplicate.valor.toFixed(2)}).`,
      )
      return
    }
    setDuplicateHint(null)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setFormError(null)

    setSaving(true)
    const result = isEdit
      ? await updateFrete(freteId, form)
      : await createFrete(form)
    setSaving(false)

    if (!result.ok) {
      setFormError(result.error)
      return
    }

    onSaved?.(result.frete)
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={isEdit ? 'Editar frete' : 'Novo frete'}
      footer={
        <ModalFormFooter
          formId={FORM_ID}
          submitLabel={isEdit ? 'Salvar alterações' : 'Cadastrar frete'}
          loading={saving}
          onCancel={handleClose}
        />
      }
    >
      <form id={FORM_ID} className="space-y-4" onSubmit={(e) => void handleSubmit(e)}>
        <Select
          label="Origem"
          placeholder="Selecione a origem"
          value={form.origem}
          onChange={(e) => setField('origem', e.target.value)}
          onBlur={() => void validateDuplicate()}
          options={FRETE_ORIGENS}
          required
        />

        <Input
          label="Destino"
          value={form.destino}
          onChange={(e) => setField('destino', e.target.value)}
          onBlur={() => void validateDuplicate()}
          placeholder="Ex.: Uberlândia"
          required
        />

        <Input
          label="Valor (R$)"
          type="number"
          min="0"
          step="0.01"
          inputMode="decimal"
          value={form.valor}
          onChange={(e) => setField('valor', e.target.value)}
          placeholder="0,00"
          required
        />

        {duplicateHint ? (
          <AlertMessage tone="info">{duplicateHint}</AlertMessage>
        ) : null}
        {formError ? <AlertMessage>{formError}</AlertMessage> : null}
      </form>
    </Modal>
  )
}
