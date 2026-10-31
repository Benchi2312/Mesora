// Alertas administrativas del panel del super admin. Lógica pura que refleja la
// RPC `admin_alertas()` de la base: se calcula en memoria con el dataset local y
// en producción la agrega el servidor.

import type { Restaurante, SoporteTicket, Usuario } from '../../types/database'

export type NivelAlerta = 'critico' | 'advertencia' | 'info'

export type TipoAlerta =
  | 'restaurante_vencido'
  | 'restaurante_por_vencer'
  | 'restaurante_suspendido'
  | 'restaurante_nuevo'
  | 'administrador_nuevo'
  | 'ticket_urgente'

export type AlertaAdministrativa = {
  id: string
  tipo: TipoAlerta
  nivel: NivelAlerta
  titulo: string
  detalle: string
  fecha: string | null
  restaurante_id: string | null
  restaurante_nombre: string | null
  referencia_id: string | null
}

/** Días de antelación con que se avisa de un vencimiento próximo. */
export const DIAS_POR_VENCER = 7
/** Días durante los que un alta se considera "nueva". */
export const DIAS_NUEVO = 7

const DIA_MS = 24 * 60 * 60 * 1000

/** Fuente mínima que necesitan las alertas (subconjunto del dataset/BD). */
export type FuenteAlertas = {
  restaurantes: Pick<Restaurante, 'id' | 'nombre' | 'suscripcion_activa' | 'fecha_vencimiento' | 'created_at'>[]
  usuarios: Pick<Usuario, 'id' | 'nombre' | 'rol' | 'restaurante_id' | 'created_at'>[]
  tickets: Pick<SoporteTicket, 'id' | 'codigo' | 'asunto' | 'prioridad' | 'estado' | 'restaurante_id' | 'created_at'>[]
}

const ORDEN_TIPO: Record<TipoAlerta, number> = {
  restaurante_vencido: 1,
  ticket_urgente: 1,
  restaurante_por_vencer: 2,
  restaurante_suspendido: 3,
  restaurante_nuevo: 4,
  administrador_nuevo: 4,
}

const etiquetaTipo: Record<TipoAlerta, string> = {
  restaurante_vencido: 'Suscripción vencida',
  restaurante_por_vencer: 'Suscripción por vencer',
  restaurante_suspendido: 'Restaurante suspendido',
  restaurante_nuevo: 'Nuevo restaurante',
  administrador_nuevo: 'Nuevo administrador',
  ticket_urgente: 'Ticket urgente',
}

function fecha(iso: string | null): number | null {
  if (!iso) return null
  const t = Date.parse(iso)
  return Number.isNaN(t) ? null : t
}

/**
 * Calcula las alertas administrativas. Mismos criterios y niveles que la RPC
 * `admin_alertas()` para que el modo local y producción coincidan.
 */
export function calcularAlertas(fuente: FuenteAlertas, ahora: Date = new Date()): AlertaAdministrativa[] {
  const ahoraMs = ahora.getTime()
  const limite = ahoraMs + DIAS_POR_VENCER * DIA_MS
  const desdeNuevo = ahoraMs - DIAS_NUEVO * DIA_MS
  const nombreRestaurante = new Map(fuente.restaurantes.map((r) => [r.id, r.nombre]))
  const alertas: AlertaAdministrativa[] = []

  const push = (
    tipo: TipoAlerta,
    nivel: NivelAlerta,
    detalle: string,
    f: string | null,
    restauranteId: string | null,
    referenciaId: string | null,
  ) => {
    alertas.push({
      id: `${prefijo(tipo)}-${referenciaId}`,
      tipo,
      nivel,
      titulo: etiquetaTipo[tipo],
      detalle,
      fecha: f,
      restaurante_id: restauranteId,
      restaurante_nombre: restauranteId ? nombreRestaurante.get(restauranteId) ?? null : null,
      referencia_id: referenciaId,
    })
  }

  for (const r of fuente.restaurantes) {
    const activa = r.suscripcion_activa === true
    const venc = fecha(r.fecha_vencimiento)
    if (activa && venc !== null && venc < ahoraMs) {
      push('restaurante_vencido', 'critico', `${r.nombre} tiene la suscripción vencida.`, r.fecha_vencimiento, r.id, r.id)
    }
    if (activa && venc !== null && venc >= ahoraMs && venc <= limite) {
      push('restaurante_por_vencer', 'advertencia', `${r.nombre} tiene la suscripción por vencer.`, r.fecha_vencimiento, r.id, r.id)
    }
    if (!activa) {
      push('restaurante_suspendido', 'advertencia', `${r.nombre} tiene la suscripción suspendida.`, r.fecha_vencimiento ?? r.created_at, r.id, r.id)
    }
    const creado = fecha(r.created_at)
    if (creado !== null && creado >= desdeNuevo) {
      push('restaurante_nuevo', 'info', `${r.nombre} se registró recientemente.`, r.created_at, r.id, r.id)
    }
  }

  for (const u of fuente.usuarios) {
    if (u.rol !== 'admin_restaurante') continue
    const creado = fecha(u.created_at)
    if (creado === null || creado < desdeNuevo) continue
    const nombre = u.restaurante_id ? nombreRestaurante.get(u.restaurante_id) ?? null : null
    push(
      'administrador_nuevo',
      'info',
      `${u.nombre} fue designado administrador${nombre ? ` de ${nombre}` : ''}.`,
      u.created_at,
      u.restaurante_id,
      u.id,
    )
  }

  for (const t of fuente.tickets) {
    if (t.prioridad !== 'urgente') continue
    if (t.estado !== 'abierto' && t.estado !== 'en_progreso') continue
    push('ticket_urgente', 'critico', `${t.codigo}: ${t.asunto}`, t.created_at, t.restaurante_id, t.id)
  }

  return alertas.sort((a, b) => {
    const o = ORDEN_TIPO[a.tipo] - ORDEN_TIPO[b.tipo]
    if (o !== 0) return o
    return (fecha(b.fecha) ?? 0) - (fecha(a.fecha) ?? 0)
  })
}

function prefijo(tipo: TipoAlerta): string {
  switch (tipo) {
    case 'restaurante_vencido':
      return 'venc'
    case 'restaurante_por_vencer':
      return 'porvencer'
    case 'restaurante_suspendido':
      return 'susp'
    case 'restaurante_nuevo':
      return 'nuevo'
    case 'administrador_nuevo':
      return 'admin'
    case 'ticket_urgente':
      return 'tk'
  }
}

/** Conteo de alertas por nivel, para las tarjetas del panel. */
export function contarPorNivel(alertas: readonly AlertaAdministrativa[]): Record<NivelAlerta, number> {
  const conteo: Record<NivelAlerta, number> = { critico: 0, advertencia: 0, info: 0 }
  for (const a of alertas) conteo[a.nivel] += 1
  return conteo
}
