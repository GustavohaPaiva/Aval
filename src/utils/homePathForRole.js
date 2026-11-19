/** Home path after login by role. */
export function homePathForRole(role) {
  if (role === 'logistica') return '/logistica'
  if (role === 'financeiro') return '/financeiro'
  return '/dashboard'
}
