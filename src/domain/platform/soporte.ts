// Lógica pura de la sección "Soporte" del super admin: catálogos de prioridad
// y estado, etiquetas y filtros. La persistencia la resuelve la API.

import type { SoporteTicket, TicketEstado, TicketPrioridad } from '../../types/database'

export const PRIORIDADES_TICKET: readonly TicketPrioridad[] = ['baja', 'media', 'alta', 'urgente']
export const ESTADOS_TICKET: readonly TicketEstado[] = [
  'abierto',
  'en_progreso',
  'resuelto',
  'cerrado',
]

const ETIQUETA_PRIORIDAD: Record<TicketPrioridad, string> = {
  baja: 'Baja',
  media: 'Media',
  alta: 'Alta',
  urgente: 'Urgente',
}

const ETIQUETA_ESTADO: Record<TicketEstado, string> = {
  abierto: 'Abierto',
  en_progreso: 'En progreso',
  resuelto: 'Resuelto',
  cerrado: 'Cerrado',
}

export function etiquetaPrioridadTicket(p: TicketPrioridad): string {
  return ETIQUETA_PRIORIDAD[p] ?? p
}

export function etiquetaEstadoTicket(e: TicketEstado): string {
  return ETIQUETA_ESTADO[e] ?? e
}

/** Un ticket sigue "vivo" mientras no esté resuelto ni cerrado. */
export function ticketAbierto(estado: TicketEstado): boolean {
  return estado === 'abierto' || estado === 'en_progreso'
}

const ORDEN_PRIORIDAD: Record<TicketPrioridad, number> = {
  urgente: 0,
  alta: 1,
  media: 2,
  baja: 3,
}

/** Ordena por prioridad (urgente primero) y, dentro de cada una, más reciente. */
export function ordenarTickets(tickets: readonly SoporteTicket[]): SoporteTicket[] {
  return [...tickets].sort((a, b) => {
    const p = ORDEN_PRIORIDAD[a.prioridad] - ORDEN_PRIORIDAD[b.prioridad]
    if (p !== 0) return p
    return b.created_at.localeCompare(a.created_at)
  })
}

export type CriteriosTickets = {
  busqueda: string
  estado: 'todos' | TicketEstado
  prioridad: 'todas' | TicketPrioridad
  /** 'todos' o el id del restaurante; 'sin' agrupa los tickets sin restaurante. */
  restaurante: string
}

export const CRITERIOS_TICKETS_VACIOS: CriteriosTickets = {
  busqueda: '',
  estado: 'todos',
  prioridad: 'todas',
  restaurante: 'todos',
}

export function hayFiltrosTickets(criterios: CriteriosTickets): boolean {
  return (
    criterios.busqueda.trim() !== '' ||
    criterios.estado !== 'todos' ||
    criterios.prioridad !== 'todas' ||
    criterios.restaurante !== 'todos'
  )
}

/**
 * Filtra tickets. `nombreRestaurante` es opcional: si se pasa, la búsqueda por
 * texto también encuentra por nombre de restaurante.
 */
export function filtrarTickets(
  tickets: readonly SoporteTicket[],
  criterios: CriteriosTickets,
  nombreRestaurante?: (id: string | null) => string | null,
): SoporteTicket[] {
  const texto = criterios.busqueda.trim().toLowerCase()
  return tickets.filter((t) => {
    if (criterios.estado !== 'todos' && t.estado !== criterios.estado) return false
    if (criterios.prioridad !== 'todas' && t.prioridad !== criterios.prioridad) return false
    if (criterios.restaurante === 'sin') {
      if (t.restaurante_id !== null) return false
    } else if (criterios.restaurante !== 'todos' && t.restaurante_id !== criterios.restaurante) {
      return false
    }
    if (!texto) return true
    const campos = [
      t.codigo,
      t.asunto,
      t.descripcion,
      t.responsable ?? '',
      nombreRestaurante?.(t.restaurante_id) ?? '',
    ]
    return campos.some((c) => c.toLowerCase().includes(texto))
  })
}
