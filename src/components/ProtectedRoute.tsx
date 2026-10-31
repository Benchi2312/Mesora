import { useState, type ReactNode } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuthStore, suSuscripcionVencida } from '../store/auth'
import type { Rol } from '../types/database'
import { homeForRole } from '../domain/security/roles'
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
  const { session, usuario, restaurante, loading, initDone, signOut } = useAuthStore()
  const location = useLocation()
  const navigate = useNavigate()
  const [saliendo, setSaliendo] = useState(false)

  if (loading || !initDone) return <LoadingScreen />

  if (!session || !usuario) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  // RLS permite leer el perfil propio desactivado para explicar el bloqueo.
  // No redirigir a /login con la sesión abierta: Login volvería a esta ruta.
  if (usuario.activo === false) {
    return (
      <div className="grid min-h-screen place-items-center bg-surface-950 px-4 py-12">
        <div role="alert" className="card w-full max-w-sm p-6 text-center sm:p-7">
          <h1 className="mb-3 text-2xl font-bold text-zinc-100">Cuenta desactivada</h1>
          <p className="mb-6 text-sm leading-relaxed text-zinc-400">
            Tu cuenta está desactivada. Contacta al administrador del restaurante para recuperar el acceso.
          </p>
          <button
            type="button"
            disabled={saliendo}
            onClick={async () => {
              setSaliendo(true)
              await signOut()
              navigate('/login', { replace: true })
            }}
            className="btn btn-primary w-full py-3"
          >
            {saliendo ? 'Cerrando sesión…' : 'Cerrar sesión y volver al inicio'}
          </button>
        </div>
      </div>
    )
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
