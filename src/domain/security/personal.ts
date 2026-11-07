import { rolLabel } from './roles'
import type { Rol } from '../../types/database'

export type RolPersonal = Extract<Rol, 'admin_restaurante' | 'mesero' | 'cocina' | 'cajero'>
export type EstadoFiltroPersonal = 'todos' | 'activos' | 'inactivos'
export type PersonalFiltrable = { nombre: string; email: string | null; rol: RolPersonal; activo: boolean }

/** Filtra por los datos visibles del personal, considerando ausente/null como activo. */
export function filtrarPersonal<T extends PersonalFiltrable>(
  personal: T[],
  filtros: { busqueda: string; rol: 'todos' | RolPersonal; estado: EstadoFiltroPersonal },
): T[] {
  const termino = filtros.busqueda.trim().toLocaleLowerCase()
  return personal.filter((usuario) => {
    if (termino && !`${usuario.nombre} ${usuario.email ?? ''} ${rolLabel(usuario.rol)}`.toLocaleLowerCase().includes(termino)) return false
    if (filtros.rol !== 'todos' && usuario.rol !== filtros.rol) return false
    if (filtros.estado === 'activos' && !usuario.activo) return false
    if (filtros.estado === 'inactivos' && usuario.activo) return false
    return true
  })
}
