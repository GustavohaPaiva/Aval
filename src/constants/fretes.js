export const FRETE_ORIGENS = [
  { value: 'UBERABA', label: 'Uberaba' },
  { value: 'CUBATAO', label: 'Cubatão' },
  { value: 'RIO GRANDE', label: 'Rio Grande' },
]

export const FRETE_ORIGEM_VALUES = FRETE_ORIGENS.map((item) => item.value)

/** Origem CIF fixa por estado da operação (hardcode comercial). */
export const ORIGEM_FRETE_POR_ESTADO = {
  MG: 'UBERABA',
  SP: 'CUBATAO',
  RS: 'RIO GRANDE',
}

export function resolveOrigemFreteByEstado(estado) {
  if (!estado) return ''
  return ORIGEM_FRETE_POR_ESTADO[estado] ?? ''
}
