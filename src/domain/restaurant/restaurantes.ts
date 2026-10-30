import type { AdminRestaurante } from '../../lib/api'
import { suSuscripcionVencida } from '../../store/auth'
import type { Restaurante } from '../../types/database'

/**
 * Lógica pura del módulo "Gestión de restaurantes" del super admin: estados,
 * búsqueda, filtros y ordenamiento. Vive aparte de los componentes para que
 * `scripts/verificar-flujo.mjs` la ejercite sin navegador.
 *
 * Reglas de estado (derivadas, no hay columna `estado` en la tabla):
 *   * operativo  → la suscripción está vigente (`suSuscripcionVencida` = false):
 *     el restaurante puede entrar y operar en la app.
 *   * detenido   → suscripción suspendida o vencida: los roles de ese restaurante
 *     quedan en la pantalla de suscripción vencida y RLS deja de permitirles
 *     escribir (puedo_escribir_en exige suscripcion_vigente).
 */

/** Ventana de "próximos a vencer" que usan el filtro y la etiqueta de la lista. */
export const DIAS_PARA_VENCER = 30
const MS_POR_DIA = 86_400_000

export type EstadoOperativo = 'operando' | 'detenido'
export type EstadoSuscripcion = 'activa' | 'por_vencer' | 'vencida' | 'suspendida'
export type FiltroEstado = 'todos' | EstadoOperativo
export type FiltroSuscripcion = 'todas' | EstadoSuscripcion
export type OrdenRestaurantes = 'nombre' | 'nombre_desc' | 'recientes' | 'antiguos' | 'vencimiento'

export type CriteriosBusqueda = {
  busqueda: string
  estado: FiltroEstado
  suscripcion: FiltroSuscripcion
  orden: OrdenRestaurantes
}

export const CRITERIOS_VACIOS: CriteriosBusqueda = {
  busqueda: '',
  estado: 'todos',
  suscripcion: 'todas',
  orden: 'nombre',
}

/** ¿Puede el restaurante operar ahora mismo? */
export function estadoOperativo(r: Restaurante): EstadoOperativo {
  return suSuscripcionVencida(r) ? 'detenido' : 'operando'
}

/**
 * Estado de la suscripción: suspendida (apagada por el super admin), vencida,
 * por vencer (vigente con vencimiento dentro de la ventana) o activa.
 */
export function estadoSuscripcion(r: Restaurante): EstadoSuscripcion {
  if (!r.suscripcion_activa) return 'suspendida'
  if (r.fecha_vencimiento) {
    const t = new Date(r.fecha_vencimiento).getTime()
    if (!Number.isNaN(t) && t < Date.now()) return 'vencida'
  }
  if (venceEnDias(r)) return 'por_vencer'
  return 'activa'
}

/** Suscripción activa que vence (o venció) dentro de la ventana indicada. */
export function venceEnDias(r: Restaurante, dias: number = DIAS_PARA_VENCER): boolean {
  if (!r.suscripcion_activa || !r.fecha_vencimiento) return false
  const ahora = Date.now()
  const t = new Date(r.fecha_vencimiento).getTime()
  return !Number.isNaN(t) && t >= ahora && t <= ahora + dias * MS_POR_DIA
}

/** Días naturales hasta el vencimiento (negativo = ya venció; null = sin fecha). */
export function diasParaVencimiento(r: Restaurante): number | null {
  if (!r.fecha_vencimiento) return null
  const t = new Date(r.fecha_vencimiento).getTime()
  if (Number.isNaN(t)) return null
  return Math.ceil((t - Date.now()) / MS_POR_DIA)
}

/** Texto breve "vence en X días" o "vencido hace Y días". */
export function venceEnTexto(r: Restaurante): string | null {
  const d = diasParaVencimiento(r)
  if (d === null) return null
  if (d <= 0) return `Venció hace ${Math.abs(d)} día${Math.abs(d) !== 1 ? 's' : ''}`
  return `Vence en ${d} día${d !== 1 ? 's' : ''}`
}

function textoDe(r: Restaurante, admin: AdminRestaurante | undefined): string {
  return [r.nombre, r.ruc, r.telefono, r.direccion, r.email_contacto, admin?.nombre, admin?.email]
    .filter((v): v is string => typeof v === 'string' && v.length > 0)
    .join(' ')
    .toLowerCase()
}

const SIN_VENCIMIENTO = '9999-12-31'

/**
 * Filtra y ordena la lista de restaurantes del panel. Devuelve un arreglo
 * NUEVO (nunca muta el que entra). La búsqueda cubre nombre, RUC, teléfono,
 * dirección, correo de contacto y —si se pasan— nombre/correo del admin.
 */
export function filtrarRestaurantes(
  restaurantes: Restaurante[],
  criterios: CriteriosBusqueda,
  admins?: AdminRestaurante[],
): Restaurante[] {
  const q = criterios.busqueda.trim().toLowerCase()

  const filtrados = restaurantes.filter((r) => {
    if (criterios.estado !== 'todos' && estadoOperativo(r) !== criterios.estado) return false

    if (criterios.suscripcion !== 'todas' && estadoSuscripcion(r) !== criterios.suscripcion) {
      return false
    }

    if (!q) return true
    const admin = admins?.find((a) => a.restaurante_id === r.id)
    return textoDe(r, admin).includes(q)
  })

  switch (criterios.orden) {
    case 'nombre_desc':
      return filtrados.sort((a, b) => b.nombre.localeCompare(a.nombre))
    case 'recientes':
      return filtrados.sort((a, b) => b.created_at.localeCompare(a.created_at))
    case 'antiguos':
      return filtrados.sort((a, b) => a.created_at.localeCompare(b.created_at))
    case 'vencimiento':
      // Sin fecha de vencimiento: al final (no deben aparecer como "por vencer").
      return filtrados.sort((a, b) =>
        (a.fecha_vencimiento ?? SIN_VENCIMIENTO).localeCompare(b.fecha_vencimiento ?? SIN_VENCIMIENTO),
      )
    case 'nombre':
    default:
      return filtrados.sort((a, b) => a.nombre.localeCompare(b.nombre))
  }
}

/** ¿Hay algún filtro activo que valga la pena ofrecer limpiar? */
export function hayFiltrosActivos(c: CriteriosBusqueda): boolean {
  return (
    c.busqueda.trim() !== '' ||
    c.estado !== 'todos' ||
    c.suscripcion !== 'todas' ||
    c.orden !== CRITERIOS_VACIOS.orden
  )
}
