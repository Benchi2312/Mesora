export const MENSAJE_ITEM_ANULADO = '\u00cdtem anulado correctamente.'
export const MENSAJE_ITEM_ANULADO_MESA_LIBERADA =
  '\u00cdtem anulado correctamente. La mesa qued\u00f3 liberada porque no ten\u00eda m\u00e1s comandas abiertas.'
export const MENSAJE_ANULACION_INCIERTA =
  'No se pudo confirmar si el \u00edtem se anul\u00f3. Actualiza la comanda y revisa su estado antes de volver a intentarlo.'

type DependenciasAnulacion = {
  anular: () => Promise<{ error: string | null }>
  verificarAnulado: () => Promise<boolean>
  recargar: () => Promise<{ ok: boolean; comandasAbiertas: number }>
}

export type ResultadoAnulacion =
  | { estado: 'exito'; mesaLiberada: boolean; mensaje: string }
  | { estado: 'error'; mensaje: string; resultadoIncierto: boolean }

/**
 * Ejecuta la mutación una sola vez. Si la respuesta se pierde o reporta error,
 * reconcilia leyendo el estado del ítem; nunca reintenta la escritura.
 */
export async function ejecutarAnulacionItem(
  dependencias: DependenciasAnulacion,
): Promise<ResultadoAnulacion> {
  let confirmado = false
  let errorMutacion: string | null = null
  let resultadoIncierto = false

  try {
    const resultado = await dependencias.anular()
    confirmado = resultado.error === null
    errorMutacion = resultado.error
  } catch {
    resultadoIncierto = true
  }

  if (!confirmado) {
    try {
      confirmado = await dependencias.verificarAnulado()
    } catch {
      // Sin lectura confiable no se afirma que la operación se haya aplicado.
    }
  }

  if (!confirmado) {
    return {
      estado: 'error',
      mensaje: resultadoIncierto ? MENSAJE_ANULACION_INCIERTA : (errorMutacion ?? MENSAJE_ANULACION_INCIERTA),
      resultadoIncierto,
    }
  }

  let mesaLiberada = false
  try {
    const estadoActual = await dependencias.recargar()
    mesaLiberada = estadoActual.ok && estadoActual.comandasAbiertas === 0
  } catch {
    // La mutación ya está confirmada: un error de lectura no puede convertirla en fallo.
  }

  return {
    estado: 'exito',
    mesaLiberada,
    mensaje: mesaLiberada ? MENSAJE_ITEM_ANULADO_MESA_LIBERADA : MENSAJE_ITEM_ANULADO,
  }
}
