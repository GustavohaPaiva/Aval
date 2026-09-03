import { Navigate, useLocation } from 'react-router-dom'

import { useAuth } from '../hooks/useAuth'
import { homePathForRole } from '../utils/homePathForRole'


function AuthLoadingScreen({ message }) {
  return (
    <div className="flex min-h-svh items-center justify-center bg-slate-50">
      <p className="text-sm text-slate-600">{message}</p>
    </div>
  )
}

export function ProtectedRoute({
  children,
  roles,
}) {
  const { user, role, initializing, profileLoading } = useAuth()
  const location = useLocation()

  if (initializing) {
    return <AuthLoadingScreen message="Carregando…" />
  }

  if (!user) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location.pathname + location.search + location.hash }}
      />
    )
  }

  if (profileLoading) {
    return <AuthLoadingScreen message="Carregando permissões…" />
  }

  if (roles && roles.length > 0) {
    if (!role || !roles.includes(role)) {
      return <Navigate to={homePathForRole(role)} replace />
    }
  }

  return <>{children}</>
}
