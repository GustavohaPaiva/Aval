import { useState } from 'react'
import { useAlertDialog } from '../../contexts/AlertDialogProvider'
import {
  parseCpfCnpjInput,
  parsePhoneInput,
  validateCpfCnpj,
  validateEmail,
  validatePhone,
} from '../../utils/dataFormatters'
import { AlertMessage } from '../ui/AlertMessage'
import { FormSection } from '../ui/FormSection'
import { FormattedInput } from '../ui/FormattedInput'
import { Input } from '../ui/Input'
import { Modal } from '../ui/Modal'
import { ModalFormFooter } from '../ui/ModalFormFooter'
import { Select } from '../ui/Select'
import { STATES } from '../../constants/simulator'
import { useAbortableAsync } from '../../hooks/useAbortableAsync'
import { createClient, updateClient } from '../../services/clientService'

const FORM_ID = 'form-cliente'

const EMPTY = {
  nome: '',
  razao_social: '',
  cnpj_cpf: '',
  email: '',
  telefone: '',
  municipio: '',
  uf: '',
}

function normalizeInitial(initial) {
  if (!initial) return EMPTY
  return {
    ...EMPTY,
    ...initial,
    cnpj_cpf: parseCpfCnpjInput(initial.cnpj_cpf ?? ''),
    telefone: parsePhoneInput(initial.telefone ?? ''),
  }
}

export function ModalClienteForm({
  open,
  mode = 'create',
  clientId,
  initial,
  onClose,
  onSaved,
}) {
  const { showAlert } = useAlertDialog()
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState(null)

  const isEdit = mode === 'edit'

  useAbortableAsync(
    async (_signal, isActive) => {
      if (!isActive()) return
      setForm(normalizeInitial(initial))
      setFormError(null)
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
  }

  function validateForm() {
    if (!form.nome.trim()) {
      showAlert({
        title: 'Nome obrigatório',
        message: 'Informe o nome do cliente.',
      })
      return false
    }

    const documentValidation = validateCpfCnpj(form.cnpj_cpf, { required: false })
    if (!documentValidation.ok) {
      showAlert({
        title: 'CPF / CNPJ inválido',
        message: documentValidation.message,
      })
      return false
    }

    if (form.telefone) {
      const phoneValidation = validatePhone(form.telefone)
      if (!phoneValidation.ok) {
        showAlert({
          title: 'Telefone inválido',
          message: phoneValidation.message,
        })
        return false
      }
    }

    if (form.email) {
      const emailValidation = validateEmail(form.email)
      if (!emailValidation.ok) {
        showAlert({
          title: 'E-mail inválido',
          message: emailValidation.message,
        })
        return false
      }
    }

    return true
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setFormError(null)

    if (!validateForm()) return

    const payload = {
      nome: form.nome,
      razao_social: form.razao_social,
      cnpj_cpf: form.cnpj_cpf,
      email: form.email,
      telefone: form.telefone,
      municipio: form.municipio,
      uf: form.uf,
    }

    setSaving(true)
    const result = isEdit
      ? await updateClient(clientId, payload)
      : await createClient(payload)
    setSaving(false)

    if (!result.ok) {
      setFormError(result.error)
      return
    }

    onSaved?.(result.client)
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={isEdit ? 'Editar cliente' : 'Novo cliente'}
      footer={
        <ModalFormFooter
          formId={FORM_ID}
          submitLabel={isEdit ? 'Salvar alterações' : 'Cadastrar cliente'}
          loading={saving}
          onCancel={handleClose}
        />
      }
    >
      <form id={FORM_ID} className="flex flex-col gap-6" onSubmit={handleSubmit} noValidate>
        <FormSection title="Identificação">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Nome"
              name="nome"
              placeholder="Nome do cliente"
              value={form.nome}
              onChange={(e) => setField('nome', e.target.value)}
              disabled={saving}
              required
            />
            <FormattedInput
              format="cpfCnpj"
              label="CPF / CNPJ (opcional)"
              name="cnpj_cpf"
              placeholder="000.000.000-00 ou 00.000.000/0000-00"
              value={form.cnpj_cpf}
              onChange={(e) => setField('cnpj_cpf', e.target.value)}
              disabled={saving}
            />
            <div className="sm:col-span-2">
              <Input
                label="Razão social"
                name="razao_social"
                placeholder="Opcional"
                value={form.razao_social}
                onChange={(e) => setField('razao_social', e.target.value)}
                disabled={saving}
              />
            </div>
          </div>
        </FormSection>

        <FormSection title="Contato e localização">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="E-mail"
              name="email"
              type="email"
              placeholder="contato@empresa.com"
              value={form.email}
              onChange={(e) => setField('email', e.target.value)}
              disabled={saving}
            />
            <FormattedInput
              format="phone"
              label="Telefone"
              name="telefone"
              placeholder="(00) 00000-0000"
              value={form.telefone}
              onChange={(e) => setField('telefone', e.target.value)}
              disabled={saving}
            />
            <Select
              label="Estado"
              placeholder="Selecione…"
              value={form.uf}
              onChange={(e) => setField('uf', e.target.value)}
              options={STATES}
              disabled={saving}
            />
            <Input
              label="Município"
              name="municipio"
              placeholder="Cidade"
              value={form.municipio}
              onChange={(e) => setField('municipio', e.target.value)}
              disabled={saving}
            />
          </div>
        </FormSection>

        {formError ? <AlertMessage>{formError}</AlertMessage> : null}
      </form>
    </Modal>
  )
}
