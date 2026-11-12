import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import PageHeader from '../../components/PageHeader'
import './superadmin.css'

type GrupoSA = 'general' | 'clientes' | 'plataforma'

type SeccionSA = {
  path: string
  label: string
  titulo: string
  descripcion: string
  grupo: GrupoSA
  exacta?: boolean
}

export const SECCIONES_SA: SeccionSA[] = [
  {
    path: '/super-admin',
    label: 'Dashboard',
    exacta: true,
    grupo: 'general',
    titulo: 'Centro de administración',
    descripcion: 'Resumen de la plataforma: restaurantes, usuarios y actividad reciente.',
  },
  {
    path: '/super-admin/restaurantes',
    label: 'Restaurantes',
    grupo: 'clientes',
    titulo: 'Restaurantes',
    descripcion: 'Clientes suscritos a Mesora, sus administradores y el estado de sus suscripciones.',
  },
  {
    path: '/super-admin/administradores',
    label: 'Administradores',
    grupo: 'clientes',
    titulo: 'Administradores',
    descripcion: 'Cuentas de administración principal de cada restaurante de la plataforma.',
  },
  {
    path: '/super-admin/usuarios',
    label: 'Usuarios',
    grupo: 'clientes',
    titulo: 'Usuarios',
    descripcion: 'Personas registradas en la plataforma, agrupadas por restaurante.',
  },
  {
    path: '/super-admin/suscripciones',
    label: 'Suscripciones',
    grupo: 'clientes',
    titulo: 'Suscripciones',
    descripcion: 'Estado y vencimientos de las suscripciones de los clientes.',
  },
  {
    path: '/super-admin/estadisticas',
    label: 'Estadísticas',
    grupo: 'plataforma',
    titulo: 'Estadísticas',
    descripcion: 'Métricas de uso y ventas de los restaurantes clientes.',
  },
  {
    path: '/super-admin/auditoria',
    label: 'Auditoría',
    grupo: 'plataforma',
    titulo: 'Auditoría',
    descripcion: 'Historial de acciones sobre la plataforma.',
  },
  {
    path: '/super-admin/notificaciones',
    label: 'Notificaciones',
    grupo: 'plataforma',
    titulo: 'Notificaciones',
    descripcion: 'Alertas de suscripciones, altas recientes y tickets urgentes.',
  },
  {
    path: '/super-admin/soporte',
    label: 'Soporte',
    grupo: 'plataforma',
    titulo: 'Soporte',
    descripcion: 'Consultas e incidencias de los clientes.',
  },
  {
    path: '/super-admin/configuracion',
    label: 'Configuración',
    grupo: 'plataforma',
    titulo: 'Configuración',
    descripcion: 'Ajustes generales de la plataforma.',
  },
]

const GRUPOS: { id: GrupoSA; label: string }[] = [
  { id: 'general', label: 'GENERAL' },
  { id: 'clientes', label: 'CLIENTES' },
  { id: 'plataforma', label: 'PLATAFORMA' },
]

function NavegacionSuperAdmin({
  id,
  movil = false,
  onNavigate,
}: {
  id: string
  movil?: boolean
  onNavigate?: () => void
}) {
  return (
    <nav
      id={id}
      className="sa-navigation"
      aria-label={movil ? 'Secciones móviles del superadministrador' : 'Secciones del superadministrador'}
    >
      {GRUPOS.map((grupo) => (
        <div key={grupo.id} className="sa-nav-group">
          <p className="sa-nav-group-label">{grupo.label}</p>
          <div className="sa-nav-group-links">
            {SECCIONES_SA.filter((seccion) => seccion.grupo === grupo.id).map((seccion) => (
              <NavLink
                key={seccion.path}
                to={seccion.path}
                end={seccion.exacta}
                onClick={onNavigate}
                className={({ isActive }) => 'sa-nav-link' + (isActive ? ' is-active' : '')}
              >
                <span className="sa-nav-indicator" aria-hidden="true" />
                <span>{seccion.label}</span>
              </NavLink>
            ))}
          </div>
        </div>
      ))}
    </nav>
  )
}

export default function SuperAdminLayout() {
  const { pathname } = useLocation()
  const [menuAbierto, setMenuAbierto] = useState(false)
  const botonMenuRef = useRef<HTMLButtonElement>(null)
  const drawerRef = useRef<HTMLElement>(null)

  const activa =
    SECCIONES_SA.find((seccion) =>
      seccion.exacta ? pathname === seccion.path : pathname.startsWith(seccion.path),
    ) ?? SECCIONES_SA[0]

  useEffect(() => {
    setMenuAbierto(false)
  }, [pathname])

  useEffect(() => {
    if (!menuAbierto) return

    const overflowAnterior = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const enfocarPrimeraOpcion = window.requestAnimationFrame(() => {
      drawerRef.current?.querySelector<HTMLAnchorElement>('a[href]')?.focus()
    })

    function manejarTecla(evento: KeyboardEvent) {
      if (evento.key === 'Escape') {
        evento.preventDefault()
        setMenuAbierto(false)
        return
      }

      if (evento.key !== 'Tab' || !drawerRef.current) return
      const elementos = Array.from(
        drawerRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'),
      )
      const primero = elementos[0]
      const ultimo = elementos.at(-1)
      if (!primero || !ultimo) return

      if (evento.shiftKey && document.activeElement === primero) {
        evento.preventDefault()
        ultimo.focus()
      } else if (!evento.shiftKey && document.activeElement === ultimo) {
        evento.preventDefault()
        primero.focus()
      }
    }

    document.addEventListener('keydown', manejarTecla)
    return () => {
      window.cancelAnimationFrame(enfocarPrimeraOpcion)
      document.removeEventListener('keydown', manejarTecla)
      document.body.style.overflow = overflowAnterior
      botonMenuRef.current?.focus()
    }
  }, [menuAbierto])

  return (
    <div className="superadmin-shell">
      <aside className="sa-sidebar" aria-label="Navegación de Superadmin">
        <div className="sa-sidebar-heading">
          <span className="sa-sidebar-eyebrow">PLATAFORMA</span>
          <p className="sa-sidebar-title">Centro de control</p>
          <p className="sa-sidebar-description">Gestión de restaurantes y servicio</p>
        </div>
        <NavegacionSuperAdmin id="superadmin-nav-desktop" />
      </aside>

      <div className="superadmin-main">
        <div className="sa-mobile-toolbar">
          <button
            ref={botonMenuRef}
            type="button"
            className="sa-mobile-menu-button"
            aria-label="Abrir menú de superadministración"
            aria-expanded={menuAbierto}
            aria-controls="superadmin-nav-mobile"
            onClick={() => setMenuAbierto(true)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
            <span>Secciones</span>
          </button>
          <span className="sa-mobile-current" aria-live="polite">{activa.label}</span>
        </div>

        <PageHeader titulo={activa.titulo} descripcion={activa.descripcion} />

        <div className="superadmin-content">
          <Outlet />
        </div>
      </div>

      {menuAbierto && (
        <div className="sa-drawer-layer">
          <button
            type="button"
            className="sa-drawer-backdrop"
            aria-label="Cerrar menú de superadministración"
            onClick={() => setMenuAbierto(false)}
          />
          <aside
            ref={drawerRef}
            id="superadmin-nav-mobile"
            className="sa-mobile-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Menú de superadministración"
          >
            <div className="sa-drawer-heading">
              <div>
                <span className="sa-sidebar-eyebrow">PLATAFORMA</span>
                <p className="sa-sidebar-title">Secciones</p>
              </div>
              <button
                type="button"
                className="sa-drawer-close"
                aria-label="Cerrar menú"
                onClick={() => setMenuAbierto(false)}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="m7 7 10 10M17 7 7 17" />
                </svg>
              </button>
            </div>
            <div className="sa-drawer-scroll">
              <NavegacionSuperAdmin
                id="superadmin-nav-mobile-links"
                movil
                onNavigate={() => setMenuAbierto(false)}
              />
            </div>
          </aside>
        </div>
      )}
    </div>
  )
}
