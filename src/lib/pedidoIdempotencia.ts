/** Solo metadatos opacos del intento; el carrito y las credenciales no se guardan. */
export type SolicitudPendiente = {
  id: string
  restauranteId: string
  usuarioId: string
  mesaId: string
  firma: string
  caducaAt: number
}

const prefijo = 'mesora:comanda-pendiente:'
export const claveBorrador = (restauranteId: string, usuarioId: string, mesaId: string) =>
  `${prefijo}${restauranteId}:${usuarioId}:${mesaId}`

export async function firmaComanda(items: { producto_id: string; cantidad: number; nota?: string }[]): Promise<string> {
  const contenido = JSON.stringify(items.map(({ producto_id, cantidad, nota }) => ({ producto_id, cantidad, nota: nota ?? '' })))
  const bytes = new TextEncoder().encode(contenido)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function leerSolicitud(storage: Storage, restauranteId: string, usuarioId: string, mesaId: string): SolicitudPendiente | null {
  const raw = storage.getItem(claveBorrador(restauranteId, usuarioId, mesaId))
  if (!raw) return null
  try {
    const dato = JSON.parse(raw) as SolicitudPendiente
    if (dato.restauranteId !== restauranteId || dato.usuarioId !== usuarioId || dato.mesaId !== mesaId ||
      !/^[0-9a-f-]{36}$/i.test(dato.id) || !/^[0-9a-f]{64}$/.test(dato.firma) || !Number.isFinite(dato.caducaAt)) throw new Error('Solicitud pendiente inválida')
    return dato
  } catch { throw new Error('No se pudo leer la solicitud pendiente de esta mesa') }
}

export function guardarSolicitud(storage: Storage, dato: SolicitudPendiente): void {
  storage.setItem(claveBorrador(dato.restauranteId, dato.usuarioId, dato.mesaId), JSON.stringify(dato))
}

export function limpiarSolicitud(storage: Storage, dato: SolicitudPendiente): void {
  storage.removeItem(claveBorrador(dato.restauranteId, dato.usuarioId, dato.mesaId))
}
