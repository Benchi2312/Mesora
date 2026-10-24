import { NavLink, Outlet, useLocation } from 'react-router-dom'
import PageHeader from '../../components/PageHeader'

type SeccionSA = {
  path: string
  label: string
  titulo: string
  descripcion: string
  exacta?: boolean
}

export const SECCIONES_SA: SeccionSA[] = [
  {
    path: '/super-admin',
    label: 'Dashboard',
    exacta: true,
    titulo: 'Centro de administración',
    descripcion: 'Resumen de la plataforma: restaurantes, usuarios y actividad reciente.',
  },
  {
    path: '/super-admin/restaurantes',
    label: 'Restaurantes',
    titulo: 'Restaurantes',
    descripcion: 'Clientes suscritos a Mesora, su administrador de cuenta y el estado de su suscripción.',
  },
  {
    path: '/super-admin/administradores',
    label: 'Administradores',
    titulo: 'Administradores',
    descripcion: 'Cuentas de administrador principal de cada restaurante de la plataforma.',
  },
  {
    path: '/super-admin/usuarios',
    label: 'Usuarios',
    titulo: 'Usuarios',
    descripcion: 'Personas registradas en la plataforma, agrupadas por restaurante.',
  },
  {
    path: '/super-admin/suscripciones',
    label: 'Suscripciones',
    titulo: 'Suscripciones',
    descripcion: 'Estado y vencimientos de las suscripciones de los clientes.',
  },
  {
    path: '/super-admin/estadisticas',
    label: 'Estadísticas',
    titulo: 'Estadísticas',
    descripcion: 'Métricas de uso y ventas de la plataforma.',
  },
  {
    path: '/super-admin/auditoria',
    label: 'Auditoría',
    titulo: 'Auditoría',
    descripcion: 'Historial de acciones sobre la plataforma.',
  },
  {
    path: '/super-admin/notificaciones',
    label: 'Notificaciones',
    titulo: 'Notificaciones',
    descripcion: 'Alertas de suscripciones, altas recientes y tickets urgentes.',
  },
  {
    path: '/super-admin/soporte',
    label: 'Soporte',
    titulo: 'Soporte',
    descripcion: 'Consultas e incidencias de los clientes.',
  },
  {
    path: '/super-admin/configuracion',
    label: 'Configuración',
    titulo: 'Configuración',
    descripcion: 'Ajustes generales de la plataforma.',
  },
]

export default function SuperAdminLayout() {
  const { pathname } = useLocation()
  const activa =
    SECCIONES_SA.find((s) => (s.exacta ? pathname === s.path : pathname.startsWith(s.path))) ??
    SECCIONES_SA[0]

  return (
    <div>
      <PageHeader titulo={activa.titulo} descripcion={activa.descripcion} />

      <nav
        className="no-print mb-8 flex flex-wrap gap-2"
        aria-label="Secciones del super administrador"
      >
        {SECCIONES_SA.map((s) => (
          <NavLink
            key={s.path}
            to={s.path}
            end={s.exacta}
            className={({ isActive }) =>
              `min-h-11 touch-manipulation rounded-xl border px-4 py-2.5 text-sm font-semibold transition active:scale-[0.98] ${
                isActive
                  ? 'border-brand-500 bg-brand-500/15 text-brand-400 shadow-sm shadow-brand-500/10'
                  : 'border-surface-700 bg-surface-800 text-zinc-300 hover:border-surface-500 hover:text-white'
              }`
            }
          >
            {s.label}
          </NavLink>
        ))}
      </nav>

      <Outlet />
    </div>
  )
}
