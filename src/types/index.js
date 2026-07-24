/** Perfis de acesso no domínio Aval */
export const USER_ROLES = ['gestor', 'consultor'];
export function isGestorProfile(profile) {
    return profile.role === 'gestor';
}
export function isConsultorProfile(profile) {
    return profile.role === 'consultor';
}
