/** Status de pedido (pós "converter em pedido"). */
export const PEDIDO_STATUSES = [
  'order_pending',
  'converted',
  'order_rejected',
  'cancelled',
]

/** Status de simulação (antes da conversão). */
export const SIMULACAO_STATUSES = [
  'draft',
  'pending',
  'approved',
  'conversion_requested',
  'rejected',
]

export function isPedidoStatus(status) {
  return PEDIDO_STATUSES.includes(status)
}

/** Pedido convertido ativo — gestor ainda pode editar produtos e valores. */
export function isGestorEditableConverted(status, { ativo } = {}) {
  return status === 'converted' && ativo !== false
}

export function isConsultorSimulationLocked(status) {
  return (
    status === 'pending' ||
    status === 'approved' ||
    status === 'conversion_requested'
  )
}

export function statusLabelPt(status, { ativo } = {}) {
  if (ativo === false) return 'Inativo'
  switch (status) {
    case 'draft':
      return 'Rascunho'
    case 'pending':
      return 'Aguardando aprovação'
    case 'approved':
      return 'Aprovado'
    case 'conversion_requested':
      return 'Conversão solicitada'
    case 'rejected':
      return 'Reprovado'
    case 'order_pending':
      return 'Pendente de aprovação'
    case 'converted':
      return 'Convertido'
    case 'order_rejected':
      return 'Pedido reprovado'
    case 'cancelled':
      return 'Cancelado'
    default:
      return status ?? '—'
  }
}

export function statusBadgeClass(status, { ativo } = {}) {
  if (ativo === false) {
    return 'bg-slate-100 text-slate-700 ring-1 ring-slate-200'
  }
  switch (status) {
    case 'approved':
    case 'converted':
      return 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200'
    case 'pending':
    case 'order_pending':
    case 'conversion_requested':
      return 'bg-amber-50 text-amber-800 ring-1 ring-amber-200'
    case 'rejected':
    case 'order_rejected':
    case 'cancelled':
      return 'bg-red-50 text-red-800 ring-1 ring-red-200'
    default:
      return 'bg-slate-100 text-slate-700 ring-1 ring-slate-200'
  }
}
