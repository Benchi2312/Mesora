import type { SoporteMensaje } from '../../types/database'

export type ConteoMensajesSoporteNoLeidos = {
  ticket_id: string
  cantidad: number
}

export type MensajeSoporteLeido = {
  mensaje_id: string
  leido_at: string
}

/** Construye el estado actual entregado por la base; nunca incrementa por evento. */
export function mapaConteosSoporteNoLeidos(
  filas: readonly ConteoMensajesSoporteNoLeidos[],
): Record<string, number> {
  const conteos: Record<string, number> = {}
  for (const fila of filas) {
    const cantidad = Math.max(0, Math.trunc(Number(fila.cantidad) || 0))
    if (!fila.ticket_id || cantidad === 0) continue
    // La RPC agrupa por ticket. Si una respuesta repetida llegara por error,
    // se conserva el valor del servidor en vez de sumarlo por segunda vez.
    conteos[fila.ticket_id] = cantidad
  }
  return conteos
}

export function totalSoporteNoLeidos(conteos: Readonly<Record<string, number>>): number {
  return Object.values(conteos).reduce((total, cantidad) => total + cantidad, 0)
}

/** IDs exactos de mensajes entrantes que se mostraron al abrir una conversación. */
export function idsMensajesSoporteNoLeidos(
  mensajes: readonly Pick<SoporteMensaje, 'id' | 'autor_super_admin' | 'leido_superadmin_at'>[],
): string[] {
  return mensajes
    .filter((mensaje) => !mensaje.autor_super_admin && mensaje.leido_superadmin_at === null)
    .map((mensaje) => mensaje.id)
}

export function aplicarLecturasMensajesSoporte(
  mensajes: readonly SoporteMensaje[],
  leidos: readonly MensajeSoporteLeido[],
  lectorId: string,
): SoporteMensaje[] {
  const porId = new Map(leidos.map((fila) => [fila.mensaje_id, fila.leido_at]))
  if (porId.size === 0) return [...mensajes]
  return mensajes.map((mensaje) => {
    const leidoAt = porId.get(mensaje.id)
    return leidoAt
      ? { ...mensaje, leido_superadmin_at: leidoAt, leido_superadmin_por: lectorId }
      : mensaje
  })
}
