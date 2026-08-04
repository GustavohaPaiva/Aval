/**
 * Indicativo visual binário da autonomia de desconto (sem valores).
 * Positivo = dentro do piso; negativo = abaixo do piso.
 */

export function getLineAutonomiaTintClass(isLineBelowFloor, { asCard = false } = {}) {
  if (!isLineBelowFloor) {
    return asCard ? "border-slate-200/90" : "bg-white hover:bg-slate-50/80";
  }
  return asCard
    ? "border-rose-200/90 bg-rose-50/20"
    : "bg-rose-50/50";
}

export function LineAutonomiaBadge({
  isLineBelowFloor,
  canOverrideFloor,
  size = "md",
}) {
  const sizeClass =
    size === "sm"
      ? "px-2 py-0.5 text-[11px]"
      : "px-2 py-0.5 text-xs";

  if (isLineBelowFloor && !canOverrideFloor) {
    return (
      <span
        className={`inline-flex items-center rounded-full bg-rose-50 font-semibold text-rose-800 ${sizeClass}`}
      >
        Pendente
      </span>
    );
  }

  if (isLineBelowFloor && canOverrideFloor) {
    return (
      <span
        className={`inline-flex items-center rounded-full bg-rose-50 font-semibold text-rose-800 ${sizeClass}`}
      >
        Especial
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center rounded-full bg-emerald-50 font-semibold text-emerald-800 ${sizeClass}`}
    >
      OK
    </span>
  );
}
