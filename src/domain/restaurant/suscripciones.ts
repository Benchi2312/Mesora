import type { AdminRestaurante } from '../../lib/api'
import { estadoSuscripcion } from './restaurantes'
import type { EstadoSuscripcion } from './restaurantes'
import type { Plan, Restaurante, SuscripcionAccion } from '../../types/database'

/**
 * Lógica pura del panel "Suscripciones" del super admin: filtros por estado,
 * plan y búsqueda, y utilidades de presentación. Vive aparte del componente
 * para que `scripts/verificar-flujo.mjs` la ejercite sin navegador.
 *
 * Los estados son los derivados de `restaurantes.ts`: activa / por vencer /
 * vencida / suspendida (nada de esto se guarda en columnas).
 */
export type CriteriosSuscripciones = {
  busqueda: string
  estado: 'todos' | EstadoSuscripcion
  /** 'todos' o el id del plan. */
  plan: string
}

export const CRITERIOS_SUSCRIPCIONES_VACIOS: CriteriosSuscripciones = {
  busqueda: '',
  estado: 'todos',
  plan: 'todos',
}

export function hayFiltrosSuscripciones(c: CriteriosSuscripciones): boolean {
  return (
    c.busqueda.trim() !== '' ||
    c.estado !== CRITERIOS_SUSCRIPCIONES_VACIOS.estado ||
    c.plan !== CRITERIOS_SUSCRIPCIONES_VACIOS.plan
  )
}

function textoDe(r: Restaurante, admin: AdminRestaurante | undefined): string {
  return [r.nombre, r.email_contacto, admin?.nombre, admin?.email]
    .filter((v): v is string => typeof v === 'string' && v.length > 0)
    .join(' ')
    .toLowerCase()
}

/**
 * Filtra la lista del panel. Devuelve un arreglo NUEVO ordenado por nombre.
 * La búsqueda cubre nombre, correo de contacto y —si se pasan— nombre/correo
 * del administrador.
 */
export function filtrarSuscripciones(
  restaurantes: Restaurante[],
  criterios: CriteriosSuscripciones,
  admins?: AdminRestaurante[],
): Restaurante[] {
  const q = criterios.busqueda.trim().toLowerCase()
  return restaurantes
    .filter((r) => {
      if (criterios.estado !== 'todos' && estadoSuscripcion(r) !== criterios.estado) return false
      if (criterios.plan !== 'todos' && (r.plan_id ?? '') !== criterios.plan) return false
      if (!q) return true
      const admin = admins?.find((a) => a.restaurante_id === r.id)
      return textoDe(r, admin).includes(q)
    })
    .sort((a, b) => a.nombre.localeCompare(b.nombre))
}

/** Nombre del plan vigente para mostrar ('—' si no tiene plan conocido). */
export function nombrePlan(planes: Plan[], planId: string | null | undefined): string {
  if (!planId) return '—'
  return planes.find((p) => p.id === planId)?.nombre ?? '—'
}

const ETIQUETAS_ACCION: Record<SuscripcionAccion, string> = {
  renovacion: 'Renovación',
  cambio_plan: 'Cambio de plan',
  suspension: 'Suspensión',
  reactivacion: 'Reactivación',
  ajuste: 'Ajuste',
}

export function etiquetaAccion(accion: SuscripcionAccion): string {
  return ETIQUETAS_ACCION[accion] ?? accion
}
