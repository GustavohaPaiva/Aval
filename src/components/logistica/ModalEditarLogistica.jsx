import { useState } from 'react'
import { AlertMessage } from '../ui/AlertMessage'
import { FormSection } from '../ui/FormSection'
import { Input } from '../ui/Input'
import { Modal } from '../ui/Modal'
import { ModalFormFooter } from '../ui/ModalFormFooter'
import { useAbortableAsync } from '../../hooks/useAbortableAsync'
import { supabase } from '../../services/supabase'

const FORM_ID = 'form-editar-logistica'

export function ModalEditarLogistica({
  open,
  userId,
  initialNome,
  onClose,
  onSaved,
}) {
  const [nome, setNome] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState(null)

  useAbortableAsync(
    async (_signal, isActive) => {
      if (!isActive()) return
      setNome(initialNome ?? '')
      setFormError(null)
      setSaving(false)
    },
    [open, initialNome],
    open,
  )

  function handleClose() {
    if (saving) return
    onClose()
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setFormError(null)

    const p_nome = nome.trim()
    if (!p_nome) {
      setFormError('Informe o nome do usuário.')
      return
    }

    setSaving(true)
    const { error } = await supabase.rpc('update_logistica_user', {
      p_user_id: userId,
      p_nome,
    })
    setSaving(false)

    if (error) {
      setFormError(error.message || 'Não foi possível salvar.')
      return
    }

    onSaved?.({ nome: p_nome })
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Editar usuário de logística"
      footer={
        <ModalFormFooter
          formId={FORM_ID}
          submitLabel="Salvar alterações"
          loading={saving}
          onCancel={handleClose}
        />
      }
    >
      <form
        id={FORM_ID}
        className="flex flex-col gap-6"
        onSubmit={handleSubmit}
        noValidate
      >
        <FormSection title="Identificação">
          <Input
            label="Nome completo"
            name="nome"
            autoComplete="name"
            placeholder="Ex.: João Silva"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            disabled={saving}
          />
        </FormSection>
        {formError ? <AlertMessage>{formError}</AlertMessage> : null}
      </form>
    </Modal>
  )
}
