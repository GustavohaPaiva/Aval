import { useState } from "react";
import { AlertMessage } from "../ui/AlertMessage";
import { FormSection } from "../ui/FormSection";
import { Input } from "../ui/Input";
import { Modal } from "../ui/Modal";
import { ModalFormFooter } from "../ui/ModalFormFooter";
import { useAbortableAsync } from "../../hooks/useAbortableAsync";
import { supabase } from "../../services/supabase";
import {
  buildFirstLastUsername,
  isValidDocumentPassword,
  normalizeDocumentDigits,
} from "../../utils/consultantLogin";
import { buildSyagriEmail } from "../../utils/syagriEmail";

const FORM_ID = "form-novo-logistica";

export function ModalNovoLogistica({ open, onClose, onCreated }) {
  const [nome, setNome] = useState("");
  const [usuarioManual, setUsuarioManual] = useState("");
  const [usuarioTouched, setUsuarioTouched] = useState(false);
  const [cpf, setCpf] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  const usuario = usuarioTouched
    ? usuarioManual
    : buildFirstLastUsername(nome);

  useAbortableAsync(
    async (_signal, isActive) => {
      if (!isActive()) return;
      setNome("");
      setUsuarioManual("");
      setUsuarioTouched(false);
      setCpf("");
      setFormError(null);
      setSaving(false);
    },
    [open],
    open,
  );

  function handleClose() {
    if (saving) return;
    onClose();
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setFormError(null);

    const p_nome = nome.trim();
    const p_email = buildSyagriEmail(usuario);
    const p_password = normalizeDocumentDigits(cpf);

    if (!p_nome) {
      setFormError("Informe o nome do usuário.");
      return;
    }
    if (!p_email) {
      setFormError("Informe um usuário válido (ex.: joao.silva).");
      return;
    }
    if (!isValidDocumentPassword(p_password)) {
      setFormError("Informe o CPF (11 dígitos) ou CNPJ (14 dígitos), só números.");
      return;
    }

    setSaving(true);
    const { data, error } = await supabase.rpc("create_logistica_user", {
      p_email,
      p_password,
      p_nome,
    });
    setSaving(false);

    if (error) {
      setFormError(error.message || "Não foi possível criar o usuário.");
      return;
    }

    if (!data) {
      setFormError("Resposta inesperada do servidor.");
      return;
    }

    onCreated?.();
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Novo usuário de logística"
      footer={
        <ModalFormFooter
          formId={FORM_ID}
          submitLabel="Cadastrar"
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
        <FormSection>
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

        <FormSection
          title="Acesso"
          description="Usuário = primeiro.último nome. Senha = CPF/CNPJ só com números."
        >
          <div className="flex flex-col gap-4">
            <Input
              label="Usuário"
              name="usuario"
              autoComplete="off"
              placeholder="ex.: joao.silva"
              value={usuario}
              onChange={(e) => {
                setUsuarioTouched(true);
                setUsuarioManual(e.target.value);
              }}
              disabled={saving}
            />
            <Input
              label="CPF / CNPJ (senha)"
              name="cpf"
              autoComplete="off"
              inputMode="numeric"
              placeholder="Somente números"
              value={cpf}
              onChange={(e) => setCpf(normalizeDocumentDigits(e.target.value))}
              disabled={saving}
            />
          </div>
        </FormSection>

        {formError ? <AlertMessage>{formError}</AlertMessage> : null}
      </form>
    </Modal>
  );
}
