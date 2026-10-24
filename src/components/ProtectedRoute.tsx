import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuthStore, suSuscripcionVencida } from '../store/auth'
import type { Rol } from '../types/database'
import { homeForRole } from '../lib/roles'
import LoadingScreen from './LoadingScreen'

interface ProtectedRouteProps {
  roles: Rol[]
  children: ReactNode
}

/**
 * Guarda de rutas por rol. Además bloquea el acceso cuando la suscripción
 * del restaurante está vencida (excepto para super_admin).
 */
export default function ProtectedRoute({ roles, children }: ProtectedRouteProps) {
  const { session, usuario, restaurante, loading, initDone } = useAuthStore()
  const location = useLocation()

  if (loading || !initDone) return <LoadingScreen />

  if (!session || !usuario) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  if (usuario.debe_cambiar_password && location.pathname !== '/restablecer') {
    return <Navigate to="/restablecer" replace state={{ from: location.pathname }} />
  }

  if (usuario.rol !== 'super_admin' && restaurante && suSuscripcionVencida(restaurante)) {
    return <Navigate to="/suscripcion-vencida" replace />
  }

  if (!roles.includes(usuario.rol)) {
    return <Navigate to={homeForRole(usuario.rol)} replace />
  }

  return children
}
