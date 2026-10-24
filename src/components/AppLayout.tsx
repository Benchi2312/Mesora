import type { ReactNode } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { rolLabel } from '../lib/roles'
import { useCurrentContext } from '../lib/useCurrentContext'
import { useDemoStore } from '../demo/demoStore'

interface AppLayoutProps {
  banner?: ReactNode
}

export default function AppLayout({ banner }: AppLayoutProps) {
  const navigate = useNavigate()
  const { usuario, restaurante, signOut } = useCurrentContext()
  const isDemo = useDemoStore((s) => s.isDemo)

  return (
    <div className="flex min-h-screen flex-col bg-surface-950">
      {banner}

      <header className="no-print sticky top-0 z-20 border-b border-surface-800 bg-surface-900/90 shadow-sm shadow-black/30 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 text-lg font-black text-surface-950 shadow-lg shadow-brand-500/25">
              M
            </span>
            <div className="leading-tight">
              <p className="text-base font-bold tracking-tight text-zinc-100">Mesora</p>
              <p className="text-xs text-zinc-500">
                {usuario?.rol === 'super_admin' ? 'Plataforma' : restaurante?.nombre ?? 'Restaurante'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
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

      {!isDemo && usuario?.rol !== 'super_admin' && restaurante === null && (
        <div className="aviso mx-auto mt-4 w-full max-w-7xl border-warn-500/30 bg-brand-500/10 text-sm text-brand-300">
          <span className="mt-0.5 text-base leading-none" aria-hidden="true">⚠️</span>
          No se pudo verificar el estado de tu suscripción. Contacta al soporte de Mesora.
        </div>
      )}

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8">
        <Outlet />
      </main>
    </div>
  )
}