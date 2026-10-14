import { LOGISTICA_STATUS_FLOW } from '../../constants/logisticaStatus'

export function LogisticaStatusSelect({
  value,
  onChange,
  options = LOGISTICA_STATUS_FLOW,
  disabled = false,
  busy = false,
  ariaLabel = 'Status logístico',
}) {
  const lista = options?.length ? options : LOGISTICA_STATUS_FLOW
  return (
    <label className="block min-w-0">
      <span className="sr-only">{ariaLabel}</span>
      <select
        value={value}
        disabled={disabled || busy}
        aria-label={ariaLabel}
        aria-busy={busy || undefined}
        onChange={(event) => onChange(event.target.value)}
        onPointerDown={(event) => event.stopPropagation()}
        className="h-12 w-full cursor-auto rounded-2xl border border-slate-200 bg-white px-3 text-base text-slate-800 shadow-sm transition-[border-color,box-shadow] focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500"
      >
        {lista.map((status) => (
          <option key={status.id} value={status.id}>
            {status.label}
          </option>
        ))}
      </select>
    </label>
  )
}
