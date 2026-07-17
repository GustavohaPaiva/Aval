import { Button } from "./Button";
import { Modal } from "./Modal";

const toneConfig = {
  error: {
    iconClass: "bg-red-50 text-feedback-error ring-red-100",
    messageClass: "text-slate-700",
  },
  warning: {
    iconClass: "bg-amber-50 text-amber-700 ring-amber-100",
    messageClass: "text-slate-700",
  },
  info: {
    iconClass: "bg-primary-50 text-primary-700 ring-primary-100",
    messageClass: "text-slate-700",
  },
  success: {
    iconClass: "bg-emerald-50 text-emerald-700 ring-emerald-100",
    messageClass: "text-slate-700",
  },
};

function AlertIcon({ tone }) {
  if (tone === "success") {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden
      >
        <path d="M20 6 9 17l-5-5" />
      </svg>
    );
  }

  if (tone === "info") {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M12 16v-4" />
        <path d="M12 8h.01" />
      </svg>
    );
  }

  if (tone === "warning") {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden
      >
        <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
        <path d="M12 9v4" />
        <path d="M12 17h.01" />
      </svg>
    );
  }

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 8v4" />
      <path d="M12 16h.01" />
    </svg>
  );
}

export function AlertDialog({
  open,
  onClose,
  title,
  children,
  tone = "error",
  confirmLabel = "Entendi",
}) {
  const cfg = toneConfig[tone] ?? toneConfig.error;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <Button type="button" className="w-full" onClick={onClose}>
          {confirmLabel}
        </Button>
      }
    >
      <div className="flex items-start gap-3">
        <span
          className={[
            "flex size-10 shrink-0 items-center justify-center rounded-2xl ring-1",
            cfg.iconClass,
          ].join(" ")}
          aria-hidden
        >
          <AlertIcon tone={tone} />
        </span>
        <p className={["min-w-0 pt-1.5 text-sm leading-relaxed", cfg.messageClass].join(" ")}>
          {children}
        </p>
      </div>
    </Modal>
  );
}
