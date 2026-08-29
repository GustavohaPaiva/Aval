import { useState } from 'react'
import { AlertMessage } from '../ui/AlertMessage'
import { FormSection } from '../ui/FormSection'
import { Input } from '../ui/Input'
import { Modal } from '../ui/Modal'
import { ModalFormFooter } from '../ui/ModalFormFooter'
import { useAbortableAsync } from '../../hooks/useAbortableAsync'
import { supabase } from '../../services/supabase'

const FORM_ID = 'form-editar-consultor'

function brazilPhoneDigits(value) {
  let digits = String(value ?? '').replace(/\D/g, '')
  if (digits.startsWith('55') && digits.length > 11) digits = digits.slice(2)
  return digits.slice(0, 11)
}

function formatBrazilPhone(value) {
  const digits = brazilPhoneDigits(value)
  if (digits.length <= 2) return digits ? `(${digits}` : ''
  const ddd = digits.slice(0, 2)
  const number = digits.slice(2)
  if (number.length <= 5) return `(${ddd}) ${number}`
  return `(${ddd}) ${number.slice(0, 5)}-${number.slice(5)}`
}

export function ModalEditarConsultor({
  open,
  consultorId,
  initialNome,
  initialFilial = '',
  initialWhatsappPhone = '',
  initialWhatsappEnabled = false,
  onClose,
  onSaved,
}) {
  const [nome, setNome] = useState('')
  const [filial, setFilial] = useState('')
  const [whatsappPhone, setWhatsappPhone] = useState('')
  const [whatsappEnabled, setWhatsappEnabled] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState(null)

  useAbortableAsync(
    async (_signal, isActive) => {
      if (!isActive()) return
      setNome(initialNome ?? '')
      setFilial(initialFilial ?? '')
      setWhatsappPhone(formatBrazilPhone(initialWhatsappPhone))
      setWhatsappEnabled(Boolean(initialWhatsappEnabled))
      setFormError(null)
      setSaving(false)
    },
    [open, initialNome, initialFilial, initialWhatsappPhone, initialWhatsappEnabled],
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
    const phoneDigits = brazilPhoneDigits(whatsappPhone)
    const p_phone_e164 = phoneDigits ? `+55${phoneDigits}` : ''
    if (!p_nome) {
      setFormError('Informe o nome do consultor.')
      return
    }
    if (phoneDigits && phoneDigits.length !== 11) {
      setFormError('Informe DDD e celular com 11 dígitos, por exemplo (34) 99999-9999.')
      return
    }
    if (whatsappEnabled && !p_phone_e164) {
      setFormError('Informe o WhatsApp antes de ativar as notificações.')
      return
    }

    setSaving(true)
    const { error } = await supabase.rpc('update_consultant', {
      p_consultor_id: consultorId,
      p_nome,
      p_filial: filial.trim(),
    })
    if (error) {
      setSaving(false)
      setFormError(error.message || 'Não foi possível salvar.')
      return
    }

    const { error: whatsappError } = await supabase.rpc('set_profile_whatsapp', {
      p_profile_id: consultorId,
      p_phone_e164,
      p_enabled: whatsappEnabled,
    })
    setSaving(false)

    if (whatsappError) {
      setFormError(whatsappError.message || 'Não foi possível salvar o WhatsApp.')
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
        <FormSection
          title="Notificações por WhatsApp"
          description="Informe DDD e celular. O sistema acrescenta automaticamente o código +55 do Brasil."
        >
          <div className="flex flex-col gap-4">
            <Input
              label="Número do WhatsApp"
              name="whatsapp"
              autoComplete="tel"
              inputMode="tel"
              placeholder="Ex.: (34) 99999-9999"
              value={whatsappPhone}
              onChange={(e) => setWhatsappPhone(formatBrazilPhone(e.target.value))}
              disabled={saving}
            />
            <label className="flex items-center gap-3 text-sm text-slate-700">
              <input
                type="checkbox"
                className="size-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                checked={whatsappEnabled}
                onChange={(e) => setWhatsappEnabled(e.target.checked)}
                disabled={saving}
              />
              Receber notificações do Aval pelo WhatsApp
            </label>
          </div>
        </FormSection>
        {formError ? <AlertMessage>{formError}</AlertMessage> : null}
      </form>
    </Modal>
  )
}
