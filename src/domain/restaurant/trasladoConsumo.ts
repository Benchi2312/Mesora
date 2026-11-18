export type ObservacionTrasladoConsumo = {
  ok: boolean
  origenEstado?: string
  destinoEstado?: string
  pedidosOrigen?: readonly { id: string }[]
  pedidosDestino?: readonly { id: string }[]
}

export type EstadoTrasladoConsumo = 'confirmado' | 'sin_cambios' | 'incierto'

export type ResultadoIntentoTraslado =
  | { estado: 'confirmado' }
  | { estado: 'rechazado'; error: string }
  | { estado: 'pendiente' }

/**
 * Compara las comandas que se iban a mover con una lectura nueva del servidor.
 * Nunca infiere éxito a partir de un total o de una mesa ocupada solamente.
 */
export function evaluarTrasladoConsumo(
  pedidoIds: readonly string[],
  observacion: ObservacionTrasladoConsumo,
): EstadoTrasladoConsumo {
  if (!observacion.ok || pedidoIds.length === 0 || !observacion.pedidosOrigen || !observacion.pedidosDestino) {
    return 'incierto'
  }

  const origenIds = new Set(observacion.pedidosOrigen.map(({ id }) => id))
  const destinoIds = new Set(observacion.pedidosDestino.map(({ id }) => id))
  const todosEnDestino = pedidoIds.every((id) => destinoIds.has(id))
  const ningunoEnOrigen = pedidoIds.every((id) => !origenIds.has(id))

  if (
    observacion.origenEstado === 'libre' &&
    observacion.destinoEstado === 'ocupada' &&
    observacion.pedidosOrigen.length === 0 &&
    todosEnDestino &&
    ningunoEnOrigen
  ) {
    return 'confirmado'
  }

  const todosEnOrigen = pedidoIds.every((id) => origenIds.has(id))
  const ningunoEnDestino = pedidoIds.every((id) => !destinoIds.has(id))
  if (
    observacion.origenEstado === 'ocupada' &&
    observacion.destinoEstado === 'libre' &&
    todosEnOrigen &&
    ningunoEnDestino &&
    observacion.pedidosDestino.length === 0
  ) {
    return 'sin_cambios'
  }

  return 'incierto'
}

/**
 * Espera la RPC y, ante error o respuesta incierta, consulta el estado actual.
 * Un error de transporte conserva el estado pendiente si la lectura no prueba
 * éxito; la UI no debe entonces ofrecer un reintento a ciegas.
 */
export async function ejecutarTrasladoConReconciliacion(
  ejecutar: () => Promise<{ error: string | null }>,
  observar: () => Promise<ObservacionTrasladoConsumo>,
  pedidoIds: readonly string[],
  esAmbiguo: (error: string) => boolean,
): Promise<ResultadoIntentoTraslado> {
  let respuesta: { error: string | null }
  try {
    respuesta = await ejecutar()
  } catch {
    try {
      const lectura = await observar()
      return evaluarTrasladoConsumo(pedidoIds, lectura) === 'confirmado'
        ? { estado: 'confirmado' }
        : { estado: 'pendiente' }
    } catch {
      return { estado: 'pendiente' }
    }
  }

  if (!respuesta.error) return { estado: 'confirmado' }

  try {
    const lectura = await observar()
    const estado = evaluarTrasladoConsumo(pedidoIds, lectura)
    if (estado === 'confirmado') return { estado: 'confirmado' }
    if (estado === 'sin_cambios' && !esAmbiguo(respuesta.error)) {
      return { estado: 'rechazado', error: respuesta.error }
    }
    return { estado: 'pendiente' }
  } catch {
    return { estado: 'pendiente' }
  }
}
