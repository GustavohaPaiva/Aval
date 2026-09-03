/** Home path after login by role. */
export function homePathForRole(role) {
  if (role === 'logistica') return '/logistica'
  return '/dashboard'
}
