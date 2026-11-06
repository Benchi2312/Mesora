// Lógica pura de la sección "Auditoría" del super admin: categorías, etiquetas
// legibles y filtros. El backend (Supabase o local) solo entrega las filas de
// `audit_logs`; acá se decide cómo se muestran y se filtran.

import type { AuditLog } from '../../types/database'

export type AccionAuditoria =
  | 'restaurante_crear'
  | 'restaurante_editar'
  | 'usuario_crear'
  | 'administrador_crear'
  | 'usuario_cambiar_rol'
  | 'usuario_estado'
  | 'usuario_password_reset'
  | 'suscripcion_renovar'
  | 'suscripcion_cambiar_plan'
  | 'suscripcion_suspender'
  | 'suscripcion_reactivar'
  | 'suscripcion_ajuste'
  | 'configuracion_actualizar'
  | 'mesa_transferir_responsable'
  | 'mesa_mover_consumo'
  | 'comanda_item_anular'
  | 'cuenta_anular'
  | 'caja_turno_cerrar'

export type CategoriaAuditoria = 'restaurantes' | 'usuarios' | 'suscripciones' | 'configuracion' | 'otros'

const ETIQUETAS: Record<AccionAuditoria, string> = {
  restaurante_crear: 'Restaurante creado',
  restaurante_editar: 'Restaurante editado',
  usuario_crear: 'Usuario creado',
  administrador_crear: 'Administrador creado',
  usuario_cambiar_rol: 'Rol cambiado',
  usuario_estado: 'Estado de usuario',
  usuario_password_reset: 'Contraseña restablecida',
  suscripcion_renovar: 'Suscripción renovada',
  suscripcion_cambiar_plan: 'Plan cambiado',
  suscripcion_suspender: 'Suscripción suspendida',
  suscripcion_reactivar: 'Suscripción reactivada',
  suscripcion_ajuste: 'Suscripción ajustada',
  configuracion_actualizar: 'Configuración actualizada',
  mesa_transferir_responsable: 'Responsable de mesa cambiado',
  mesa_mover_consumo: 'Consumo movido entre mesas',
  comanda_item_anular: 'Ítem de comanda anulado',
  cuenta_anular: 'Boleta anulada y reembolsada',
  caja_turno_cerrar: 'Turno de caja cerrado',
}

const CATEGORIAS: Record<AccionAuditoria, CategoriaAuditoria> = {
  restaurante_crear: 'restaurantes',
  restaurante_editar: 'restaurantes',
  usuario_crear: 'usuarios',
  administrador_crear: 'usuarios',
  usuario_cambiar_rol: 'usuarios',
  usuario_estado: 'usuarios',
  usuario_password_reset: 'usuarios',
  suscripcion_renovar: 'suscripciones',
  suscripcion_cambiar_plan: 'suscripciones',
  suscripcion_suspender: 'suscripciones',
  suscripcion_reactivar: 'suscripciones',
  suscripcion_ajuste: 'suscripciones',
  configuracion_actualizar: 'configuracion',
  mesa_transferir_responsable: 'otros',
  mesa_mover_consumo: 'otros',
  comanda_item_anular: 'otros',
  cuenta_anular: 'otros',
  caja_turno_cerrar: 'otros',
}

/** Texto legible de una acción; si es desconocida, se muestra tal cual. */
export function etiquetaAccionAuditoria(accion: string): string {
  return ETIQUETAS[accion as AccionAuditoria] ?? accion
}

/** Categoría de una acción (para el filtro de la tabla). */
export function categoriaDeAccion(accion: string): CategoriaAuditoria {
  return CATEGORIAS[accion as AccionAuditoria] ?? 'otros'
}

export const CATEGORIAS_AUDITORIA: { valor: 'todas' | CategoriaAuditoria; texto: string }[] = [
  { valor: 'todas', texto: 'Categoría: todas' },
  { valor: 'restaurantes', texto: 'Restaurantes' },
  { valor: 'usuarios', texto: 'Usuarios' },
  { valor: 'suscripciones', texto: 'Suscripciones' },
  { valor: 'configuracion', texto: 'Configuración' },
  { valor: 'otros', texto: 'Otras' },
]

const TEXTO_CATEGORIA: Record<Exclude<CategoriaAuditoria, 'otros'>, string> = {
  restaurantes: 'Restaurantes',
  usuarios: 'Usuarios',
  suscripciones: 'Suscripciones',
  configuracion: 'Configuración',
}

/** Etiqueta corta de la categoría, para los chips de cada fila. */
export function etiquetaCategoria(categoria: CategoriaAuditoria): string {
  return categoria === 'otros' ? 'Otra' : TEXTO_CATEGORIA[categoria]
}

export type CriteriosAuditoria = {
  busqueda: string
  categoria: 'todas' | CategoriaAuditoria
  restauranteId: string
}

export const CRITERIOS_AUDITORIA_VACIOS: CriteriosAuditoria = {
  busqueda: '',
  categoria: 'todas',
  restauranteId: 'todos',
}

export function hayFiltrosAuditoria(criterios: CriteriosAuditoria): boolean {
  return (
    criterios.busqueda.trim() !== '' ||
    criterios.categoria !== 'todas' ||
    criterios.restauranteId !== 'todos'
  )
}

/**
 * Filtra el registro de auditoría. La búsqueda mira actor, descripción,
 * restaurante y la etiqueta legible de la acción.
 */
export function filtrarAuditoria(
  logs: readonly AuditLog[],
  criterios: CriteriosAuditoria,
): AuditLog[] {
  const texto = criterios.busqueda.trim().toLowerCase()
  return logs.filter((l) => {
    if (criterios.categoria !== 'todas' && categoriaDeAccion(l.accion) !== criterios.categoria) {
      return false
    }
    if (criterios.restauranteId !== 'todos' && l.restaurante_id !== criterios.restauranteId) {
      return false
    }
    if (!texto) return true
    const campos = [
      l.actor_nombre ?? '',
      l.actor_rol ?? '',
      l.descripcion ?? '',
      l.restaurante_nombre ?? '',
      etiquetaAccionAuditoria(l.accion),
    ]
    return campos.some((c) => c.toLowerCase().includes(texto))
  })
}
