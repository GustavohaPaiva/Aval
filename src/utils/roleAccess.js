/** Operação logística (carteira e entregas). Cadastro de usuários continua só do gestor. */
export const ROLES_OPERACAO_LOGISTICA = ["gestor", "logistica"];

export function canAccessLogistica(role) {
  return ROLES_OPERACAO_LOGISTICA.includes(role);
}
