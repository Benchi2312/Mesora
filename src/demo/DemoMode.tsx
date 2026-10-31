import { useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import AppLayout from '../components/AppLayout'
import { apiMode, getApi } from '../lib/api'
import { mockRestaurante, mockUsuarios } from '../lib/mockData'
import { ROLES, ROL_LABELS } from '../domain/security/roles'
import type { Rol } from '../types/database'
import { useDemoStore } from './demoStore'
import GuiaDemo from './GuiaDemo'

const RUTA_DEMO: Record<Rol, string> = {
  super_admin: 'super-admin',
  admin_restaurante: 'admin',
  mesero: 'mesero',
  cocina: 'cocina',
  cajero: 'cajero',
}

// El Super Admin somos nosotros (Mesora), no el restaurante: no se expone en el demo.
const ROLES_DEMO = ROLES.filter((r) => r !== 'super_admin') as Rol[]

/** Cómo se expresa "quién vería la vista actual" en la app real. */
const QUIEN_VE_DEMO: Record<Rol, string> = {
  super_admin: 'un Super Admin',
  admin_restaurante: 'un Administrador',
  mesero: 'un Mesero',
  cocina: 'un Cocinero',
  cajero: 'un Cajero',
}

function rolDesdePath(pathname: string): Rol {
  const segmento = pathname.split('/')[2]
  const encontrado = ROLES_DEMO.find((r) => RUTA_DEMO[r] === segmento)
  return encontrado ?? 'mesero'
}

export default function DemoMode() {
  const { pathname } = useLocation()
  const enterDemo = useDemoStore((s) => s.enterDemo)
  const exitDemo = useDemoStore((s) => s.exitDemo)
  const demoRol = useDemoStore((s) => s.demoRol)

  const rol = rolDesdePath(pathname)

  // DEMO MODE: activa la capa de datos mock durante el render, ANTES de que
  // las vistas hijas consulten datos, sin importar el orden de los efectos.
  apiMode.demo = true
  apiMode.demoRol = rol
  apiMode.operadorId = mockUsuarios.find((u) => u.rol === rol)?.id ?? 'u-mesero-1'

  useEffect(() => {
    let activo = true
    enterDemo(rol)
    // Recupera también los datos editados del local al recargar o cambiar de rol.
    void getApi().getRestaurantes().then((res) => {
      const restaurante = res.data?.find((r) => r.id === mockRestaurante.id)
      if (activo && restaurante) useDemoStore.getState().actualizarRestaurante(restaurante)
    })
    return () => {
      activo = false
      apiMode.demo = false
      exitDemo()
    }
  }, [rol, enterDemo, exitDemo])

  return (
    <>
      <AppLayout
        banner={
        <div className="border-b border-brand-500/30 bg-brand-500/15">
          <div className="mx-auto flex w-full max-w-7xl flex-wrap items-start justify-between gap-x-4 gap-y-1 px-4 py-2">
            <p className="flex min-w-0 flex-1 items-start gap-1.5 text-xs leading-relaxed text-brand-300">
              <svg viewBox="0 0 24 24" className="mt-0.5 h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 8v4M12 16h.01" />
              </svg>
              <span>
                <strong className="font-semibold text-brand-200">Modo demo</strong> — estás
                viendo cómo lo vería {QUIEN_VE_DEMO[rol]}, con datos de ejemplo. En la app real,
                cada usuario solo ve su propia vista según el rol con el que inicia sesión.
              </span>
            </p>
            <Link to="/" className="mt-0.5 shrink-0 font-semibold text-brand-400 underline underline-offset-2 hover:text-brand-300">
              Salir del demo
            </Link>
          </div>
          <nav className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-center gap-1.5 px-4 pb-2">
            {ROLES_DEMO.map((r) => (
              <Link
                key={r}
                to={`/demo/${RUTA_DEMO[r]}`}
                className={`rounded-full border px-3 py-1.5 text-sm transition ${
                  demoRol === r
                    ? 'border-brand-500 bg-brand-500 text-surface-950 font-semibold'
                    : 'border-surface-700 bg-surface-800 text-zinc-300 hover:border-brand-500 hover:text-brand-400'
                }`}
              >
                {ROL_LABELS[r]}
              </Link>
            ))}
          </nav>
        </div>
      }
    />
      <GuiaDemo />
    </>
  )
}
