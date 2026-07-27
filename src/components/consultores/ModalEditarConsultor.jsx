import { useState } from 'react'
import { AlertMessage } from '../ui/AlertMessage'
import { FormSection } from '../ui/FormSection'
import { Input } from '../ui/Input'
import { Modal } from '../ui/Modal'
import { ModalFormFooter } from '../ui/ModalFormFooter'
import { useAbortableAsync } from '../../hooks/useAbortableAsync'
import { supabase } from '../../services/supabase'

const FORM_ID = 'form-editar-consultor'

export function ModalEditarConsultor({
  open,
  consultorId,
  initialNome,
  initialFilial = '',
  onClose,
  onSaved,
}) {
  const [nome, setNome] = useState('')
  const [filial, setFilial] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState(null)

  useAbortableAsync(
    async (_signal, isActive) => {
      if (!isActive()) return
      setNome(initialNome ?? '')
      setFilial(initialFilial ?? '')
      setFormError(null)
      setSaving(false)
    },
    [open, initialNome, initialFilial],
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
      setFormError('Informe o nome do consultor.')
      return
    }

    setSaving(true)
    const { error } = await supabase.rpc('update_consultant', {
      p_consultor_id: consultorId,
      p_nome,
      p_filial: filial.trim(),
    })
    setSaving(false)

    if (error) {
      setFormError(error.message || 'Não foi possível salvar.')
      return
    }

    onSaved?.({ nome: p_nome, filial: filial.trim() || null })
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Editar consultor"
      footer={
        <ModalFormFooter
          formId={FORM_ID}
          submitLabel="Salvar alterações"
          loading={saving}
          onCancel={handleClose}
        />
      }
    >
      <form id={FORM_ID} className="flex flex-col gap-6" onSubmit={handleSubmit} noValidate>
        <FormSection title="Identificação">
          <div className="flex flex-col gap-4">
            <Input
              label="Nome completo"
              name="nome"
              autoComplete="name"
              placeholder="Ex.: João Silva"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              disabled={saving}
            />
            <Input
              label="Filial"
              name="filial"
              autoComplete="off"
              placeholder="Ex.: Uberaba, Nova Ponte, Ituverava"
              value={filial}
              onChange={(e) => setFilial(e.target.value)}
              disabled={saving}
            />
          </div>
        </FormSection>
        {formError ? <AlertMessage>{formError}</AlertMessage> : null}
      </form>
    </Modal>
  )
}
