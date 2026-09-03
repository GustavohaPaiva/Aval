import { useRef, useState } from "react";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import {
  IconCamera,
  IconLayoutList,
  IconLogOut,
  IconTrash,
  IconUserSwitch,
} from "../icons";
import { removeAvatar, uploadAvatar } from "../../services/profileService";

function userInitial(name) {
  const trimmed = (name ?? "").trim();
  return trimmed ? trimmed.charAt(0).toUpperCase() : "?";
}

function ProfileAction({
  icon: Icon,
  label,
  onClick,
  disabled = false,
  tone = "default",
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        "flex h-11 w-full items-center gap-3 rounded-2xl px-3 text-sm font-medium transition-colors disabled:opacity-50",
        tone === "danger"
          ? "text-red-600 hover:bg-red-50"
          : "text-slate-700 hover:bg-slate-50",
      ].join(" ")}
    >
      <span
        className={[
          "flex size-8 shrink-0 items-center justify-center rounded-xl",
          tone === "danger"
            ? "bg-red-50 text-red-600"
            : "bg-slate-100 text-slate-600",
        ].join(" ")}
      >
        <Icon className="size-4" />
      </span>
      {label}
    </button>
  );
}

export function ProfileModal({
  open,
  onClose,
  displayName,
  email,
  roleLabel,
  avatarUrl,
  isGestor = false,
  listViewEnabled = false,
  onListViewChange,
  onSwitchAccount,
  onSignOut,
}) {
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setError(null);
    setNotice(null);
    setBusy(true);
    const res = await uploadAvatar(file);
    setBusy(false);

    if (!res.ok) {
      setError(res.error);
      return;
    }
    setNotice("Foto atualizada.");
  }

  async function handleRemove() {
    setError(null);
    setNotice(null);
    setBusy(true);
    const res = await removeAvatar();
    setBusy(false);

    if (!res.ok) {
      setError(res.error);
      return;
    }
    setNotice("Foto removida.");
  }

  return (
    <Modal open={open} onClose={onClose} title="Minha conta" size="sm">
      <div className="flex items-center gap-3.5 rounded-2xl border border-slate-100 bg-slate-50/80 px-4 py-3">
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt=""
            className="size-11 shrink-0 rounded-full object-cover ring-1 ring-slate-200"
          />
        ) : (
          <span
            className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary-600 text-sm font-semibold text-white"
            aria-hidden
          >
            {userInitial(displayName)}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p
            className="truncate text-sm font-semibold text-slate-900"
            title={displayName}
          >
            {displayName}
          </p>
          {email ? (
            <p className="truncate text-xs text-slate-500" title={email}>
              {email}
            </p>
          ) : null}
          <p className="mt-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-primary-700">
            {roleLabel}
          </p>
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />

      <div className="mt-5">
        <p className="mb-2.5 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
          Foto de perfil
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            type="button"
            variant="secondary"
            className="w-full shrink-0 sm:flex-1"
            loading={busy}
            onClick={() => fileRef.current?.click()}
          >
            <span className="flex flex-row items-center gap-2">
              <IconCamera className="size-4" />
              {avatarUrl ? "Alterar foto" : "Enviar foto"}
            </span>
          </Button>
          {avatarUrl ? (
            <Button
              type="button"
              variant="ghost"
              className="w-full shrink-0 border border-slate-200 sm:flex-1"
              onClick={() => void handleRemove()}
              disabled={busy}
            >
              <IconTrash className="size-4" />
              Remover
            </Button>
          ) : null}
        </div>
      </div>

      {isGestor ? (
        <div className="mt-5 hidden border-t border-slate-100 pt-4 lg:block">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            Preferências
          </p>
          <button
            type="button"
            role="switch"
            aria-checked={listViewEnabled}
            disabled={busy}
            onClick={() => onListViewChange?.(!listViewEnabled)}
            className="flex h-11 w-full items-center gap-3 rounded-2xl px-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
              <IconLayoutList className="size-4" />
            </span>
            <span className="min-w-0 flex-1 text-left">Visualização em lista</span>
            <span
              className={[
                "flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors",
                listViewEnabled ? "bg-primary-600 justify-end" : "bg-slate-200 justify-start",
              ].join(" ")}
              aria-hidden
            >
              <span className="size-5 rounded-full bg-white shadow-sm" />
            </span>
          </button>
          <p className="mt-1.5 px-3 text-xs text-slate-500">
            No computador, troca cards por tabela nas listagens.
          </p>
        </div>
      ) : null}

      <div className="mt-5 border-t border-slate-100 pt-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
          Sessão
        </p>
        <div className="flex flex-col gap-0.5">
          <ProfileAction
            icon={IconUserSwitch}
            label="Trocar de conta"
            onClick={onSwitchAccount}
            disabled={busy}
          />
          <ProfileAction
            icon={IconLogOut}
            label="Sair do sistema"
            onClick={onSignOut}
            disabled={busy}
            tone="danger"
          />
        </div>
      </div>

      {error ? (
        <p
          className="mt-4 rounded-2xl border border-red-200/90 bg-red-50 px-3 py-2.5 text-sm font-medium text-red-800"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      {notice ? (
        <p
          className="mt-4 rounded-2xl border border-emerald-200/90 bg-emerald-50 px-3 py-2.5 text-sm font-medium text-emerald-800"
          role="status"
        >
          {notice}
        </p>
      ) : null}
    </Modal>
  );
}
