/** Perfis de acesso no domínio Aval */
export const USER_ROLES = ['gestor', 'consultor', 'logistica', 'financeiro'];
export function isGestorProfile(profile) {
    return profile.role === 'gestor';
}
export function isConsultorProfile(profile) {
    return profile.role === 'consultor';
}
export function isLogisticaProfile(profile) {
    return profile.role === 'logistica';
}
export function isFinanceiroProfile(profile) {
    return profile.role === 'financeiro';
}
