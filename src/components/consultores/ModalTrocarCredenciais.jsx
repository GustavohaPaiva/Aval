import { useState } from 'react'
import { AlertMessage } from '../ui/AlertMessage'
import { FormSection } from '../ui/FormSection'
import { Input } from '../ui/Input'
import { Modal } from '../ui/Modal'
import { ModalFormFooter } from '../ui/ModalFormFooter'
import { useAbortableAsync } from '../../hooks/useAbortableAsync'
import { supabase } from '../../services/supabase'
import {
  isValidDocumentPassword,
  normalizeDocumentDigits,
} from '../../utils/consultantLogin'
import { buildSyagriEmail } from '../../utils/syagriEmail'

const FORM_ID = 'form-trocar-credenciais'

export function ModalTrocarCredenciais({
  open,
  consultorId,
  initialUsuario,
  onClose,
  onSaved,
}) {
  const [usuario, setUsuario] = useState('')
  const [senha, setSenha] = useState('')
  const [confirmSenha, setConfirmSenha] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState(null)

  useAbortableAsync(
    async (_signal, isActive) => {
      if (!isActive()) return
      setUsuario(initialUsuario ?? '')
      setSenha('')
      setConfirmSenha('')
      setFormError(null)
      setSaving(false)
    },
    [open, initialUsuario],
    open,
  )

  function handleClose() {
    if (saving) return
    onClose()
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setFormError(null)

    const p_email = buildSyagriEmail(usuario)
    if (!p_email) {
      setFormError('Informe um usuário válido.')
      return
    }

    const wantsPassword = senha.length > 0 || confirmSenha.length > 0
    const normalizedPassword = wantsPassword
      ? normalizeDocumentDigits(senha)
      : null
    if (wantsPassword) {
      if (!isValidDocumentPassword(normalizedPassword ?? '')) {
        setFormError('A senha deve ser o CPF (11) ou CNPJ (14), só números.')
        return
      }
      if (normalizeDocumentDigits(senha) !== normalizeDocumentDigits(confirmSenha)) {
        setFormError('As senhas não coincidem.')
        return
      }
    }

    setSaving(true)
    const { error } = await supabase.rpc('update_consultant', {
      p_consultor_id: consultorId,
      p_email,
      p_password: wantsPassword ? normalizedPassword : null,
    })
    setSaving(false)

    if (error) {
      setFormError(error.message || 'Não foi possível atualizar as credenciais.')
      return
    }

    onSaved?.(p_email)
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Trocar credenciais"
      footer={
        <ModalFormFooter
          formId={FORM_ID}
          submitLabel="Atualizar acesso"
          loading={saving}
          onCancel={handleClose}
        />
      }
    >
      <form id={FORM_ID} className="flex flex-col gap-6" onSubmit={handleSubmit} noValidate>
        <FormSection
          title="Acesso"
          description="Altere o usuário de login. Deixe as senhas em branco para manter a atual."
        >
          <div className="flex flex-col gap-4">
            <Input
              label="Usuário"
              name="usuario"
              autoComplete="off"
              placeholder="ex.: joao.silva"
              value={usuario}
              onChange={(e) => setUsuario(e.target.value)}
              disabled={saving}
            />
            <Input
              label="Nova senha (CPF/CNPJ)"
              name="senha"
              type="password"
              autoComplete="new-password"
              placeholder="Opcional — só números do CPF/CNPJ"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              disabled={saving}
            />
            <Input
              label="Confirmar nova senha"
              name="confirmSenha"
              type="password"
              autoComplete="new-password"
              placeholder="Repita a nova senha"
              value={confirmSenha}
              onChange={(e) => setConfirmSenha(e.target.value)}
              disabled={saving}
            />
          </div>
        </FormSection>
        {formError ? <AlertMessage>{formError}</AlertMessage> : null}
      </form>
    </Modal>
  )
}
