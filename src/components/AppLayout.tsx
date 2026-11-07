import type { ReactNode } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { rolLabel } from '../domain/security/roles'
import { useCurrentContext } from '../lib/useCurrentContext'
import { useDemoStore } from '../demo/demoStore'
import EstadoConexion from './EstadoConexion'
import { esModoLocal } from '../lib/api'
import { useEstadoDeSincronizacion } from '../lib/estadoConexion'

interface AppLayoutProps {
  banner?: ReactNode
}

export default function AppLayout({ banner }: AppLayoutProps) {
  const navigate = useNavigate()
  const { usuario, restaurante, signOut } = useCurrentContext()
  const isDemo = useDemoStore((s) => s.isDemo)
  const conexion = useEstadoDeSincronizacion()

  return (
    <div className="flex min-h-screen flex-col bg-surface-950">
      {banner}

      <header className="no-print sticky top-0 z-20 border-b border-surface-800 bg-surface-900/90 shadow-sm shadow-black/30 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <img src="/marca/isotipo.svg" className="h-9 w-9 shrink-0 rounded-xl shadow-lg shadow-brand-500/25" alt="" aria-hidden="true" />
            <div className="leading-tight">
              <p className="text-base font-bold tracking-tight text-zinc-100">Mesora</p>
              <p className="text-xs text-zinc-500">
                {usuario?.rol === 'super_admin' ? 'Plataforma' : restaurante?.nombre ?? 'Restaurante'}
              </p>
            </div>
          </div>

          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            {!isDemo && !esModoLocal() && usuario && usuario.rol !== 'super_admin' && <EstadoConexion estado={conexion} />}
            <span className="chip chip-warn hidden sm:inline-flex">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
              {usuario ? rolLabel(usuario.rol) : ''}
            </span>
            <button
              type="button"
              onClick={() => (isDemo ? navigate('/') : void signOut())}
              className="btn btn-danger-ghost border border-surface-700 px-3 py-2"
            >
              {isDemo ? 'Salir del demo' : 'Salir'}
            </button>
          </div>
        </div>
      </header>

      {!isDemo && !esModoLocal() && usuario && usuario.rol !== 'super_admin' && conexion.estado !== 'conectado' && (
        <div role="status" aria-live="assertive" className={`mx-auto mt-3 w-full max-w-7xl px-4 text-xs ${conexion.estado === 'reconectando' ? 'text-brand-300' : 'text-danger-400'}`}>
          {conexion.estado === 'reconectando'
            ? 'Red disponible; verificando la conexión con Mesora…'
            : conexion.estado === 'sin_conexion'
              ? 'Sin conexión. Mesora no guarda pedidos ni cobros sin conexión; verifica el estado de cualquier operación pendiente al reconectarte.'
              : 'No se confirmó la última solicitud. Revisa su estado antes de repetirla.'}
        </div>
      )}

      {!isDemo && usuario?.rol !== 'super_admin' && restaurante === null && (
        <div className="aviso mx-auto mt-4 w-full max-w-7xl border-warn-500/30 bg-brand-500/10 text-sm text-brand-300">
          <span className="mt-0.5 text-base leading-none" aria-hidden="true">⚠️</span>
          No se pudo verificar el estado de tu suscripción. Contacta al soporte de Mesora.
        </div>
      )}

      <main className={`mx-auto w-full max-w-7xl flex-1 px-4 pt-8 ${isDemo ? 'pb-28' : 'pb-8'}`}>
        <Outlet />
      </main>
    </div>
  )
}
