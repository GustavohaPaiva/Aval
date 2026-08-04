export const STATES = [
  { value: 'MG', label: 'Minas Gerais' },
  { value: 'SP', label: 'São Paulo' },
  { value: 'RS', label: 'Rio Grande do Sul' },
]

export const ESTADO_UF_VALUES = ['MG', 'SP', 'RS']

/** Prazo de validade da proposta (dias) — padrão 14. */
export const PRAZO_DIAS_DEFAULT = 14

export const PRAZO_OPTIONS = [
  { value: '7', label: '7 dias' },
  { value: '14', label: '14 dias' },
  { value: '21', label: '21 dias' },
]

export function normalizePrazoDias(value) {
  const n = Number(value)
  if (n === 7 || n === 14 || n === 21) return n
  return PRAZO_DIAS_DEFAULT
}

export const QUARTERS = [
  { value: 'Q1', label: 'Q1 — Jan/Fev/Mar' },
  { value: 'Q2', label: 'Q2 — Abr/Mai/Jun' },
  { value: 'Q3', label: 'Q3 — Jul/Ago/Set' },
  { value: 'Q4', label: 'Q4 — Out/Nov/Dez' },
]

export const FREIGHT_TYPES = [
  { value: 'CIF', label: 'CIF — Posto Fazenda' },
  { value: 'FOB', label: 'FOB — Cliente Retira' },
]

export const CULTURES = [
  'Alho',
  'Amendoim',
  'Batata',
  'Beterraba',
  'Cana',
  'Cebola',
  'Cenoura',
  'Feijão',
  'Milho',
  'Soja',
  'Sorgo',
  'Outros',
]

export const CITIES_BY_STATE = {
  MG: [
    'Araxá',
    'Belo Horizonte',
    'Juiz de Fora',
    'Lavras',
    'Montes Claros',
    'Patos de Minas',
    'Patrocínio',
    'Sete Lagoas',
    'Uberaba',
    'Uberlândia',
  ],
  SP: [
    'Araraquara',
    'Bauru',
    'Campinas',
    'Marília',
    'Piracicaba',
    'Presidente Prudente',
    'Ribeirão Preto',
    'Sorocaba',
    'São José do Rio Preto',
    'São Paulo',
  ],
}

export function getCitiesForState(estado) {
  if (!estado) return []
  return CITIES_BY_STATE[estado] ?? []
}
