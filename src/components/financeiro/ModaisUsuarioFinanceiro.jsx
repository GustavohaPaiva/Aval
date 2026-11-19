import { useState } from 'react'
import { AlertMessage } from '../ui/AlertMessage'
import { FormSection } from '../ui/FormSection'
import { Input } from '../ui/Input'
import { Modal } from '../ui/Modal'
import { ModalFormFooter } from '../ui/ModalFormFooter'
import { useAbortableAsync } from '../../hooks/useAbortableAsync'
import { supabase } from '../../services/supabase'
import {
  buildFirstLastUsername,
  isValidDocumentPassword,
  normalizeDocumentDigits,
} from '../../utils/consultantLogin'
import { buildSyagriEmail } from '../../utils/syagriEmail'

export function ModalNovoFinanceiro({ open, onClose, onCreated }) {
  const [nome, setNome] = useState('')
  const [usuarioManual, setUsuarioManual] = useState('')
  const [usuarioTouched, setUsuarioTouched] = useState(false)
  const [cpf, setCpf] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState(null)
  const usuario = usuarioTouched ? usuarioManual : buildFirstLastUsername(nome)

  useAbortableAsync(
    async (_signal, isActive) => {
      if (!isActive()) return
      setNome('')
      setUsuarioManual('')
      setUsuarioTouched(false)
      setCpf('')
      setFormError(null)
      setSaving(false)
    },
    [open],
    open,
  )

  async function handleSubmit(event) {
    event.preventDefault()
    const p_nome = nome.trim()
    const p_email = buildSyagriEmail(usuario)
    const p_password = normalizeDocumentDigits(cpf)
    if (!p_nome) return setFormError('Informe o nome do usuário.')
    if (!p_email) return setFormError('Informe um usuário válido (ex.: joao.silva).')
    if (!isValidDocumentPassword(p_password)) {
      return setFormError('Informe o CPF (11 dígitos) ou CNPJ (14 dígitos), só números.')
    }
    setSaving(true)
    const { data, error } = await supabase.rpc('create_financeiro_user', {
      p_email,
      p_password,
      p_nome,
    })
    setSaving(false)
    if (error || !data) {
      setFormError(error?.message || 'Não foi possível criar o usuário.')
      return
    }
    onCreated?.()
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={() => !saving && onClose()}
      title="Novo usuário financeiro"
      footer={
        <ModalFormFooter
          formId="form-novo-financeiro"
          submitLabel="Cadastrar"
          loading={saving}
          onCancel={onClose}
        />
      }
    >
      <form id="form-novo-financeiro" className="space-y-4" onSubmit={(e) => void handleSubmit(e)}>
        {formError ? <AlertMessage>{formError}</AlertMessage> : null}
        <FormSection title="Acesso" description="O login segue o mesmo padrão da logística.">
          <Input label="Nome" value={nome} onChange={(e) => setNome(e.target.value)} required />
          <Input
            label="Usuário"
            value={usuario}
            onChange={(e) => {
              setUsuarioTouched(true)
              setUsuarioManual(e.target.value)
            }}
            required
          />
          <Input
            label="CPF ou CNPJ"
            inputMode="numeric"
            value={cpf}
            onChange={(e) => setCpf(e.target.value)}
            required
          />
        </FormSection>
      </form>
    </Modal>
  )
}

export function ModalEditarFinanceiro({ open, onClose, userId, nomeInicial, onSaved }) {
  const [nome, setNome] = useState(nomeInicial ?? '')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState(null)

  useAbortableAsync(
    async (_signal, isActive) => {
      if (!isActive() || !open) return
      setNome(nomeInicial ?? '')
      setFormError(null)
      setSaving(false)
    },
    [open, nomeInicial],
    open,
  )

  async function handleSubmit(event) {
    event.preventDefault()
    if (!nome.trim()) return setFormError('Informe o nome.')
    setSaving(true)
    const { error } = await supabase.rpc('update_financeiro_user', {
      p_user_id: userId,
      p_nome: nome.trim(),
    })
    setSaving(false)
    if (error) return setFormError(error.message)
    onSaved?.()
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={() => !saving && onClose()}
      title="Editar cadastro"
      footer={
        <ModalFormFooter
          formId="form-editar-financeiro"
          submitLabel="Salvar"
          loading={saving}
          onCancel={onClose}
        />
      }
    >
      <form id="form-editar-financeiro" className="space-y-4" onSubmit={(e) => void handleSubmit(e)}>
        {formError ? <AlertMessage>{formError}</AlertMessage> : null}
        <Input label="Nome" value={nome} onChange={(e) => setNome(e.target.value)} required />
      </form>
    </Modal>
  )
}

export function ModalCredenciaisFinanceiro({ open, onClose, userId, emailInicial, onSaved }) {
  const [email, setEmail] = useState(emailInicial ?? '')
  const [senha, setSenha] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState(null)

  useAbortableAsync(
    async (_signal, isActive) => {
      if (!isActive() || !open) return
      setEmail(emailInicial ?? '')
      setSenha('')
      setFormError(null)
      setSaving(false)
    },
    [open, emailInicial],
    open,
  )

  async function handleSubmit(event) {
    event.preventDefault()
    const p_password = normalizeDocumentDigits(senha)
    if (senha && !isValidDocumentPassword(p_password)) {
      return setFormError('Informe o CPF (11 dígitos) ou CNPJ (14 dígitos), só números.')
    }
    setSaving(true)
    const { error } = await supabase.rpc('update_financeiro_user', {
      p_user_id: userId,
      p_email: email.trim(),
      p_password: senha ? p_password : null,
    })
    setSaving(false)
    if (error) return setFormError(error.message)
    onSaved?.()
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={() => !saving && onClose()}
      title="Trocar credenciais"
      footer={
        <ModalFormFooter
          formId="form-credenciais-financeiro"
          submitLabel="Atualizar"
          loading={saving}
          onCancel={onClose}
        />
      }
    >
      <form id="form-credenciais-financeiro" className="space-y-4" onSubmit={(e) => void handleSubmit(e)}>
        {formError ? <AlertMessage>{formError}</AlertMessage> : null}
        <Input label="E-mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <Input
          label="Nova senha (CPF ou CNPJ)"
          inputMode="numeric"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
        />
      </form>
    </Modal>
  )
}
