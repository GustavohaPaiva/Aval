import { useEffect, useRef, useState } from "react";
import {
  EDITABLE_HINT_BORDER,
  EDITABLE_HINT_CURSOR,
  EditableHintIcon,
} from "./editableFieldHint";

export function EditableNumber({
  value,
  onChange,
  disabled = false,
  min = 0,
  step = 0.001,
  decimals = 3,
  className = "",
  inputClassName = "",
  ariaLabel,
  centered = false,
  emphasized = false,
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  function startEditing() {
    setDraft(
      value == null || !Number.isFinite(Number(value)) ? "" : String(value),
    );
    setEditing(true);
  }

  function commit() {
    setEditing(false);
    const n = Number.parseFloat(draft.replace(",", "."));
    onChange(Number.isFinite(n) ? Math.max(min, n) : min);
  }

  function cancel() {
    setEditing(false);
  }

  const display =
    Number.isFinite(value) && value !== null
      ? value.toLocaleString("pt-BR", {
          minimumFractionDigits: 0,
          maximumFractionDigits: decimals,
        })
      : "—";

  if (disabled) {
    return (
      <span
        className={[
          "finance-text text-base font-semibold text-slate-900",
          centered ? "block w-full text-center" : "",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {display}
      </span>
    );
  }

  const frameClass = [
    "relative w-full min-w-[4.5rem]",
    centered ? "mx-auto max-w-[6.5rem]" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const controlClass = [
    "finance-text h-9 w-full rounded-xl bg-white pl-2 pr-7 text-base font-semibold text-slate-900 outline-none transition-[border-color,box-shadow,background-color]",
    EDITABLE_HINT_BORDER,
    centered ? "text-center" : "text-left",
    emphasized
      ? "border-primary-300/70 bg-primary-50/60 text-primary-900"
      : "",
    inputClassName,
  ]
    .filter(Boolean)
    .join(" ");

  if (editing) {
    return (
      <div className={frameClass}>
        <input
          ref={inputRef}
          type="number"
          min={min}
          step={step}
          aria-label={ariaLabel}
          data-no-row-click
          className={[
            controlClass,
            "cursor-text focus:border-primary-400 focus:ring-2 focus:ring-primary-500/20",
            emphasized ? "ring-2 ring-primary-500/30" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") cancel();
          }}
        />
        <EditableHintIcon size="compact" />
      </div>
    );
  }

  return (
    <div className={frameClass}>
      <button
        type="button"
        data-no-row-click
        aria-label={
          ariaLabel ? `${ariaLabel}: ${display}. Clique para editar.` : undefined
        }
        className={[controlClass, EDITABLE_HINT_CURSOR].join(" ")}
        onClick={startEditing}
      >
        {display}
      </button>
      <EditableHintIcon size="compact" />
    </div>
  );
}
