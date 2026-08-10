import { IconPencil } from "../icons";

/** Borda tracejada sutil para campos editáveis. */
export const EDITABLE_HINT_BORDER =
  "border !border-dashed !border-slate-300 !shadow-none";

/** Cursor de interação nos campos editáveis. */
export const EDITABLE_HINT_CURSOR = "cursor-pointer";

/**
 * Classes de controle quando o indicativo de edição está ativo.
 * @param {{ disabled?: boolean, padEnd?: 'icon' | 'icons' | 'none', size?: 'default' | 'compact' }} opts
 */
export function editableHintControlClass({
  disabled = false,
  padEnd = "icon",
  size = "default",
} = {}) {
  if (disabled) return "";
  const pad =
    padEnd === "none"
      ? ""
      : padEnd === "icons"
        ? size === "compact"
          ? "pr-12"
          : "pr-14"
        : size === "compact"
          ? "pr-7"
          : "pr-9";
  return [EDITABLE_HINT_BORDER, EDITABLE_HINT_CURSOR, pad]
    .filter(Boolean)
    .join(" ");
}

/**
 * Ícone de lápis discreto (canto direito interno).
 * Para selects com chevron, use `offset="beforeChevron"`.
 */
export function EditableHintIcon({
  size = "default",
  offset = "end",
  className = "",
}) {
  const iconSize = size === "compact" ? "size-3" : "size-3.5";
  const position =
    offset === "beforeChevron"
      ? size === "compact"
        ? "right-6"
        : "right-8"
      : offset === "topEnd"
        ? "right-2.5 top-2.5 translate-y-0"
        : size === "compact"
          ? "right-2"
          : "right-2.5";

  return (
    <IconPencil
      aria-hidden
      className={[
        "pointer-events-none absolute text-slate-400/75",
        offset === "topEnd" ? "" : "top-1/2 -translate-y-1/2",
        iconSize,
        position,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    />
  );
}
