import { formatVolumeTon } from '../../constants/logisticaStatus'

export function EntregaParcialIndicador({ row }) {
  if (!row?.entregaParcial) return null
  return (
    <p className="rounded-xl bg-amber-50 px-2.5 py-2 text-xs leading-snug text-amber-950 ring-1 ring-amber-200/90">
      <span className="font-semibold">Entrega parcial</span>
      <span className="mt-0.5 block">Nesta etapa {formatVolumeTon(row.volumeEtapa)}</span>
      <span className="block font-medium">
        Programado {formatVolumeTon(row.volumeProgramadoTotal)} · Pendente{' '}
        {formatVolumeTon(row.volumePendenteTotal)}
      </span>
    </p>
  )
}
