export type ObservacionTrasladoConsumo = {
  ok: boolean
  origenEstado?: string
  destinoEstado?: string
  destinoResponsableId?: string | null
  pedidosOrigen?: readonly { id: string }[]
  pedidosDestino?: readonly { id: string }[]
}

export type EstadoTrasladoConsumo = 'confirmado' | 'sin_cambios' | 'incierto'
export type EstadoPrevalidacionTraslado = 'disponible' | 'destino_no_disponible' | 'origen_cambio' | 'incierto'

export type ResultadoIntentoTraslado =
  | { estado: 'confirmado' }
  | { estado: 'rechazado'; error: string }
  | { estado: 'pendiente' }

/**
 * Valida una lectura reciente antes de mostrar la confirmación y justo antes
 * de invocar la RPC. No basta con el estado que quedó en el selector.
 */
export function validarPrecondicionesTraslado(
  pedidoIds: readonly string[],
  observacion: ObservacionTrasladoConsumo,
): EstadoPrevalidacionTraslado {
  if (!observacion.ok || pedidoIds.length === 0 || !observacion.pedidosOrigen || !observacion.pedidosDestino) {
    return 'incierto'
  }

  if (
    observacion.destinoEstado !== 'libre' ||
    observacion.destinoResponsableId != null ||
    observacion.pedidosDestino.length > 0
  ) {
    return 'destino_no_disponible'
  }

  const origenIds = observacion.pedidosOrigen.map(({ id }) => id)
  const esperaba = new Set(pedidoIds)
  if (
    observacion.origenEstado !== 'ocupada' ||
    origenIds.length !== esperaba.size ||
    origenIds.some((id) => !esperaba.has(id))
  ) {
    return 'origen_cambio'
  }

  return 'disponible'
}

export function esErrorPinIncorrectoTraslado(error: string): boolean {
  return /(?:pin\s+de\s+autorizaci[oó]n\s+incorrecto|pin\s+no\s+coincide)/i.test(error)
}

export function esErrorDestinoOcupadoTraslado(error: string): boolean {
  return /mesa de destino debe estar libre|mesa de destino.*consumo pendiente|mesa de destino.*responsable/i.test(error)
}

export function mensajeDestinoNoDisponible(nombre: string): string {
  const nombreMesa = nombre.trim()
  const prefijo = /^mesa\b/i.test(nombreMesa) ? '' : 'Mesa '
  return `${prefijo}${nombreMesa} no está disponible porque tiene consumo pendiente. Elige otra mesa`
}

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

  // Un PIN inválido es un rechazo de negocio conocido. La RPC valida antes de
  // escribir y su transacción no puede dejar un traslado parcial. Intentamos
  // releer para que la interfaz actualice el estado, pero nunca lo clasificamos
  // como error de transporte ni dejamos el modal bloqueado como incierto.
  if (esErrorPinIncorrectoTraslado(respuesta.error)) {
    try {
      const lectura = await observar()
      if (evaluarTrasladoConsumo(pedidoIds, lectura) === 'confirmado') {
        return { estado: 'confirmado' }
      }
    } catch {
      // El error del PIN sigue siendo determinista aunque la lectura no responda.
    }
    return { estado: 'rechazado', error: respuesta.error }
  }

  // La RPC verifica disponibilidad dentro del mismo lock transaccional antes
  // de validar el PIN o tocar pedidos. Si detecta una mesa destino ocupada,
  // releemos para actualizar el selector, pero no tratamos el rechazo como una
  // operación de resultado incierto.
  if (esErrorDestinoOcupadoTraslado(respuesta.error)) {
    try {
      const lectura = await observar()
      if (evaluarTrasladoConsumo(pedidoIds, lectura) === 'confirmado') {
        return { estado: 'confirmado' }
      }
    } catch {
      // El rechazo de validación SQL ya garantiza rollback transaccional.
    }
    return { estado: 'rechazado', error: respuesta.error }
  }

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
