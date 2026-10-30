import type { RolPersonal, UsuarioPlataforma } from '../../lib/api'
import { fmtFecha, fmtHora } from '../../lib/format'

/**
 * Lógica pura de los paneles "Usuarios" y "Administradores" del super admin:
 * filtros por rol, restaurante, estado y búsqueda, más el texto del último
 * acceso. Vive aparte de los componentes para que `scripts/verificar-flujo.mjs`
 * la ejercite sin navegador.
 *
 * El estado es la columna `activo`: desactivar nunca borra filas ni cuentas.
 */
export type FiltroRolUsuarios = 'todos' | RolPersonal
export type FiltroEstadoUsuarios = 'todos' | 'activos' | 'inactivos'
/** Criterio de orden del listado (el orden no es un filtro: no lo limpia «Limpiar filtros»). */
export type OrdenUsuarios = 'nombre' | 'alta' | 'rol'

export type CriteriosUsuarios = {
  busqueda: string
  rol: FiltroRolUsuarios
  /** 'todos' o el id del restaurante. */
  restaurante: string
  estado: FiltroEstadoUsuarios
  orden: OrdenUsuarios
}

export const CRITERIOS_USUARIOS_VACIOS: CriteriosUsuarios = {
  busqueda: '',
  rol: 'todos',
  restaurante: 'todos',
  estado: 'todos',
  orden: 'nombre',
}

export const ORDENES_USUARIOS: { valor: OrdenUsuarios; texto: string }[] = [
  { valor: 'nombre', texto: 'Orden: nombre (A–Z)' },
  { valor: 'alta', texto: 'Orden: alta (más reciente)' },
  { valor: 'rol', texto: 'Orden: rol' },
]

export function hayFiltrosUsuarios(c: CriteriosUsuarios): boolean {
  return (
    c.busqueda.trim() !== '' ||
    c.rol !== CRITERIOS_USUARIOS_VACIOS.rol ||
    c.restaurante !== CRITERIOS_USUARIOS_VACIOS.restaurante ||
    c.estado !== CRITERIOS_USUARIOS_VACIOS.estado
  )
}

/**
 * Filtra y ordena la lista del panel. Devuelve un arreglo NUEVO.
 * La búsqueda cubre nombre y correo (sin distinción de mayúsculas).
 */
export function filtrarUsuarios(
  usuarios: UsuarioPlataforma[],
  criterios: CriteriosUsuarios,
): UsuarioPlataforma[] {
  const q = criterios.busqueda.trim().toLowerCase()
  const porNombre = (a: UsuarioPlataforma, b: UsuarioPlataforma) => a.nombre.localeCompare(b.nombre)
  const comparadores: Record<OrdenUsuarios, (a: UsuarioPlataforma, b: UsuarioPlataforma) => number> = {
    nombre: porNombre,
    // Más recientes primero; sin fecha, al final.
    alta: (a, b) => fechaMs(b.created_at) - fechaMs(a.created_at) || porNombre(a, b),
    rol: (a, b) => a.rol.localeCompare(b.rol) || porNombre(a, b),
  }
  return usuarios
    .filter((u) => {
      if (criterios.rol !== 'todos' && u.rol !== criterios.rol) return false
      if (criterios.estado === 'activos' && !u.activo) return false
      if (criterios.estado === 'inactivos' && u.activo) return false
      if (criterios.restaurante !== 'todos' && (u.restaurante_id ?? '') !== criterios.restaurante) {
        return false
      }
      if (!q) return true
      return `${u.nombre} ${u.email ?? ''}`.toLowerCase().includes(q)
    })
    .sort(comparadores[criterios.orden] ?? porNombre)
}

function fechaMs(iso: string | null | undefined): number {
  if (!iso) return 0
  const t = new Date(iso).getTime()
  return Number.isNaN(t) ? 0 : t
}

/**
 * Último acceso para la tabla: el mapa viene de `admin_ultimos_accesos` y un
 * `null` (o la ausencia del id) significa que la persona nunca ingresó.
 */
export function labelUltimoAcceso(ultimoAcceso: string | null | undefined): string {
  if (!ultimoAcceso) return 'Nunca ingresó'
  return `${fmtFecha(ultimoAcceso)} ${fmtHora(ultimoAcceso)}`
}
