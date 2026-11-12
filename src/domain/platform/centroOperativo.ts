import type { UsuarioPlataforma } from '../../lib/api'
import type { Plan, Restaurante, SoporteTicket } from '../../types/database'
import { ticketAbierto } from './soporte'

const DIA_MS = 86_400_000

export type PrioridadAtencion = 'critica' | 'advertencia' | 'informativa'

export type ElementoAtencion = {
  id: string
  prioridad: PrioridadAtencion
  motivo: string
  nombre: string
  href: string
  tipo: 'restaurante' | 'ticket'
}

export type ResumenSuscripcionesOperativo = {
  activas: number
  hasta7Dias: number
  dias8a15: number
  dias16a30: number
  vencidas: number
  suspendidas: number
  porPlan: { planId: string | null; nombre: string; cantidad: number }[]
}

type AdministradorOperativo = Pick<UsuarioPlataforma, 'id' | 'activo' | 'restaurante_id'>
type UsuarioOperativo = Pick<UsuarioPlataforma, 'id' | 'restaurante_id'>
type PersonaBusqueda = Pick<UsuarioPlataforma, 'id' | 'nombre' | 'email'>

function normalizarTexto(valor: string): string {
  return valor.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase()
}

function diasHasta(fecha: string, ahora: Date): number | null {
  const fechaMs = Date.parse(fecha)
  if (!Number.isFinite(fechaMs)) return null
  const inicioHoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate()).getTime()
  const fechaDia = new Date(fechaMs)
  fechaDia.setHours(0, 0, 0, 0)
  return Math.floor((fechaDia.getTime() - inicioHoy) / DIA_MS)
}

export function calcularResumenSuscripciones(
  restaurantes: readonly Restaurante[],
  planes: readonly Plan[],
  ahora: Date = new Date(),
): ResumenSuscripcionesOperativo {
  const conteoPlanes = new Map<string | null, number>()
  for (const restaurante of restaurantes) {
    const planId = restaurante.plan_id ?? null
    conteoPlanes.set(planId, (conteoPlanes.get(planId) ?? 0) + 1)
  }

  const nombrePorPlan = new Map(planes.map((plan) => [plan.id, plan.nombre]))
  const porPlan = [...conteoPlanes.entries()]
    .map(([planId, cantidad]) => ({
      planId,
      nombre: planId ? nombrePorPlan.get(planId) ?? 'Plan no disponible' : 'Sin plan asignado',
      cantidad,
    }))
    .sort((a, b) => b.cantidad - a.cantidad || a.nombre.localeCompare(b.nombre))

  let activas = 0
  let hasta7Dias = 0
  let dias8a15 = 0
  let dias16a30 = 0
  let vencidas = 0
  let suspendidas = 0

  for (const restaurante of restaurantes) {
    if (!restaurante.suscripcion_activa) {
      suspendidas += 1
      continue
    }

    if (!restaurante.fecha_vencimiento) {
      activas += 1
      continue
    }

    const dias = diasHasta(restaurante.fecha_vencimiento, ahora)
    if (dias === null) {
      // El backend de acceso trata la bandera activa como vigente si no puede
      // interpretar la fecha. Conservamos ese comportamiento y no asignamos
      // un tramo de vencimiento sin una fecha confiable.
      activas += 1
    } else if (dias < 0) {
      vencidas += 1
    } else {
      activas += 1
      if (dias <= 7) hasta7Dias += 1
      else if (dias <= 15) dias8a15 += 1
      else if (dias <= 30) dias16a30 += 1
    }
  }

  return { activas, hasta7Dias, dias8a15, dias16a30, vencidas, suspendidas, porPlan }
}

export function calcularElementosAtencion(params: {
  restaurantes: readonly Restaurante[]
  administradores: readonly AdministradorOperativo[]
  usuarios?: readonly UsuarioOperativo[]
  tickets: readonly SoporteTicket[]
  ultimoAccesoPorUsuario?: Readonly<Record<string, string | null>>
  errorTickets?: boolean
  errorAccesos?: boolean
  ahora?: Date
}): ElementoAtencion[] {
  const ahora = params.ahora ?? new Date()
  const adminActivoPorRestaurante = new Set(
    params.administradores
      .filter((admin) => admin.activo && admin.restaurante_id)
      .map((admin) => admin.restaurante_id as string),
  )
  const elementos: ElementoAtencion[] = []

  for (const restaurante of params.restaurantes) {
    if (!restaurante.suscripcion_activa) {
      elementos.push({
        id: `rest-suspendido-${restaurante.id}`,
        prioridad: 'critica',
        motivo: 'La suscripción está suspendida; el acceso del restaurante está detenido.',
        nombre: restaurante.nombre,
        href: `/super-admin/restaurantes/${restaurante.id}`,
        tipo: 'restaurante',
      })
    } else if (restaurante.fecha_vencimiento) {
      const dias = diasHasta(restaurante.fecha_vencimiento, ahora)
      if (dias !== null && dias < 0) {
        elementos.push({
          id: `rest-vencido-${restaurante.id}`,
          prioridad: 'critica',
          motivo: 'La fecha de vencimiento ya pasó.',
          nombre: restaurante.nombre,
          href: `/super-admin/restaurantes/${restaurante.id}`,
          tipo: 'restaurante',
        })
      } else if (dias !== null && dias <= 7) {
        elementos.push({
          id: `rest-por-vencer-${restaurante.id}`,
          prioridad: 'advertencia',
          motivo: `La suscripción vence ${dias === 0 ? 'hoy' : `en ${dias} día${dias === 1 ? '' : 's'}`}.`,
          nombre: restaurante.nombre,
          href: `/super-admin/restaurantes/${restaurante.id}`,
          tipo: 'restaurante',
        })
      }
    }

    if (!adminActivoPorRestaurante.has(restaurante.id)) {
      elementos.push({
        id: `rest-sin-admin-${restaurante.id}`,
        prioridad: 'advertencia',
        motivo: 'No tiene un administrador de restaurante activo.',
        nombre: restaurante.nombre,
        href: `/super-admin/restaurantes/${restaurante.id}`,
        tipo: 'restaurante',
      })
    }

    if (!params.errorAccesos) {
      const diasDesdeAlta = diasHasta(restaurante.created_at, ahora)
      if (diasDesdeAlta !== null && diasDesdeAlta >= -7) {
        const idsUsuarios = (params.usuarios ?? params.administradores)
          .filter((usuario) => usuario.restaurante_id === restaurante.id)
          .map((usuario) => usuario.id)
        const sinAccesoConocido = idsUsuarios.length === 0 || idsUsuarios.every((id) => !params.ultimoAccesoPorUsuario?.[id])
        if (sinAccesoConocido) {
          elementos.push({
            id: `rest-sin-acceso-${restaurante.id}`,
            prioridad: 'informativa',
            motivo: idsUsuarios.length === 0
              ? 'Restaurante creado recientemente; aún no registra usuarios ni accesos conocidos.'
              : 'Restaurante creado recientemente; sus usuarios aún no registran un acceso conocido.',
            nombre: restaurante.nombre,
            href: `/super-admin/restaurantes/${restaurante.id}`,
            tipo: 'restaurante',
          })
        }
      }
    }
  }

  if (!params.errorTickets) {
    for (const ticket of params.tickets) {
      if (!ticketAbierto(ticket.estado)) continue
      const urgente = ticket.prioridad === 'urgente'
      const sinResponsable = !ticket.responsable_id && !ticket.responsable?.trim()
      if (!urgente && !sinResponsable) continue
      elementos.push({
        id: `ticket-atencion-${ticket.id}`,
        prioridad: urgente ? 'critica' : 'advertencia',
        motivo: `${ticket.codigo}: ${urgente ? `ticket urgente${sinResponsable ? ' y sin responsable' : ''}` : 'ticket abierto sin responsable'}.`,
        nombre: ticket.asunto,
        href: `/super-admin/soporte?ticket=${encodeURIComponent(ticket.id)}`,
        tipo: 'ticket',
      })
    }
  }

  const peso: Record<PrioridadAtencion, number> = { critica: 0, advertencia: 1, informativa: 2 }
  return elementos.sort((a, b) => peso[a.prioridad] - peso[b.prioridad] || a.nombre.localeCompare(b.nombre))
}

export function buscarCentroOperativo(params: {
  termino: string
  restaurantes: readonly Restaurante[]
  administradores: readonly PersonaBusqueda[]
  usuarios: readonly UsuarioPlataforma[]
  tickets: readonly SoporteTicket[]
}) {
  const q = normalizarTexto(params.termino.trim())
  if (!q) return { restaurantes: [], administradores: [], usuarios: [], tickets: [] }
  const contiene = (...valores: (string | null | undefined)[]) =>
    valores.some((valor) => normalizarTexto(valor ?? '').includes(q))

  return {
    restaurantes: params.restaurantes
      .filter((r) => contiene(r.nombre, r.ruc))
      .slice(0, 4),
    administradores: params.administradores
      .filter((u) => contiene(u.nombre, u.email))
      .slice(0, 4),
    usuarios: params.usuarios
      .filter((u) => contiene(u.nombre, u.email))
      .slice(0, 4),
    tickets: params.tickets
      .filter((t) => contiene(t.codigo, t.asunto))
      .slice(0, 4),
  }
}
