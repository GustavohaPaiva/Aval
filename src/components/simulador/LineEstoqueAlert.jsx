import { IconWarehouse } from '../icons'
import { formatTons } from '../../utils/comprasUnits'

export function LineEstoqueAlert({ disponivelKg, className = '' }) {
  const kg = Number(disponivelKg)
  if (!(kg > 0.0001)) return null

  return (
    <p
      role="status"
      className={[
        'inline-flex max-w-full items-center gap-1.5 rounded-xl border border-emerald-200/90 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-800',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <IconWarehouse className="size-3.5 shrink-0" aria-hidden />
      Estoque disponível: {formatTons(kg)}
    </p>
  )
}
