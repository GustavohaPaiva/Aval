/** Operação logística (carteira e entregas). Cadastro de usuários continua só do gestor. */
export const ROLES_OPERACAO_LOGISTICA = ["gestor", "logistica"];

/** Operação financeira (recebimentos). Cadastro de usuários continua só do gestor. */
export const ROLES_OPERACAO_FINANCEIRA = ["gestor", "financeiro"];

/** Consulta da situação financeira do próprio pedido, sem registrar recebimento. */
export const ROLES_CONSULTA_FINANCEIRA = ["gestor", "financeiro", "consultor"];

export function canAccessLogistica(role) {
  return ROLES_OPERACAO_LOGISTICA.includes(role);
}

export function canOperateFinanceiro(role) {
  return ROLES_OPERACAO_FINANCEIRA.includes(role);
}

export function canViewFinanceiroPedido(role) {
  return ROLES_CONSULTA_FINANCEIRA.includes(role);
}
