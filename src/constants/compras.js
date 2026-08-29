import { SYAGRI_COMPANY } from './company'

export const COMPRAS_FILIAL_DEFAULT = 'uberaba'
export const COMPRAS_CIDADE_DEFAULT = 'Uberaba'
export const COMPRAS_CONDICAO_DEFAULT = 'FAT. ANTECIPADO'
export const COMPRAS_EMBALAGEM_DEFAULT = 'BIG BAG'
export const COMPRAS_LOCAL_ESTOQUE = 'Estoque Syagri'
export const KG_POR_TONELADA = 1000

export const COMPRA_STATUSES = [
  'rascunho',
  'enviado',
  'confirmado',
  'recebido_parcial',
  'recebido',
  'cancelado',
]

export const EMBALAGEM_OPTIONS = [
  { value: 'BIG BAG', label: 'BIG BAG' },
  { value: 'GRANEL', label: 'Granel' },
  { value: 'SACO 50 KG', label: 'Saco 50 kg' },
]

export const PLANTA_OPTIONS = [
  { value: '', label: 'Não informado' },
  { value: 'Uberaba', label: 'Uberaba' },
  { value: 'Cubatão', label: 'Cubatão' },
  { value: 'Rio Grande', label: 'Rio Grande' },
]

export const TIPO_ENTREGA_OPTIONS = [
  { value: '', label: 'Não informado' },
  { value: 'CIF', label: 'CIF' },
  { value: 'FOB', label: 'FOB' },
]

export const UNIDADE_OPTIONS = [
  { value: 't', label: 'Tonelada (t)' },
  { value: 'kg', label: 'Quilo (kg)' },
]

export function compraStatusLabel(status) {
  switch (status) {
    case 'rascunho':
      return 'Rascunho'
    case 'enviado':
      return 'Enviado'
    case 'confirmado':
      return 'Confirmado'
    case 'recebido_parcial':
      return 'Recebido parcial'
    case 'recebido':
      return 'Recebido'
    case 'cancelado':
      return 'Cancelado'
    default:
      return status ?? '—'
  }
}

export function compraStatusBadgeClass(status) {
  switch (status) {
    case 'confirmado':
    case 'recebido':
      return 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200'
    case 'enviado':
    case 'recebido_parcial':
      return 'bg-amber-50 text-amber-800 ring-1 ring-amber-200'
    case 'cancelado':
      return 'bg-red-50 text-red-800 ring-1 ring-red-200'
    default:
      return 'bg-slate-100 text-slate-700 ring-1 ring-slate-200'
  }
}

export function lastroLabel(faltanteKg) {
  if (faltanteKg <= 0.0001) return 'Completo'
  return 'Pendente'
}

export function demandaStatusLabel(status) {
  switch (status) {
    case 'completo':
      return 'Completo'
    case 'parcial':
      return 'Parcial'
    case 'a_caminho':
      return 'A caminho'
    case 'sem':
      return 'Sem vínculo'
    default:
      return status ?? '—'
  }
}

export function demandaStatusBadgeClass(status) {
  switch (status) {
    case 'completo':
      return 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200'
    case 'parcial':
    case 'a_caminho':
      return 'bg-amber-50 text-amber-800 ring-1 ring-amber-200'
    default:
      return 'bg-slate-100 text-slate-700 ring-1 ring-slate-200'
  }
}

export function filialOptions() {
  return SYAGRI_COMPANY.sites.map((site) => ({
    value: site.id,
    label: site.label,
  }))
}

export function filialById(id) {
  return (
    SYAGRI_COMPANY.sites.find((site) => site.id === id) ??
    SYAGRI_COMPANY.sites.find((site) => site.id === COMPRAS_FILIAL_DEFAULT)
  )
}

export const COMPRAS_NAV = [
  { to: '/compras', label: 'Hub', end: true },
  { to: '/compras/demanda', label: 'Demanda' },
  { to: '/compras/ordens', label: 'Pedidos de compra' },
  { to: '/compras/estoque', label: 'Estoque' },
]
