// Numeración de boletas. El número real lo asigna el servidor al cerrar la
// cuenta (correlativo por restaurante, único); estas funciones solo lo formatean
// y, para datos viejos sin `numero`, derivan uno estable del id de la cuenta.

/** Serie impresa en la boleta (la misma que fija `cerrar_cuenta` en SQL/local). */
export const SERIE_BOLETA = 'B001'

/** Formatea un correlativo como `B001-000123`. */
export function formatearNumeroBoleta(correlativo: number): string {
  const n = Math.max(0, Math.trunc(correlativo))
  return `${SERIE_BOLETA}-${String(n).padStart(6, '0')}`
}

/**
 * Correlativo estable derivado del UUID. Solo para cuentas sin `numero` (datos
 * anteriores a la columna): nunca colisiona con la serie real, que empieza en 1.
 */
function derivarCorrelativo(cuentaId: string): number {
  let h = 0
  for (let i = 0; i < cuentaId.length; i++) h = (Math.imul(h, 31) + cuentaId.charCodeAt(i)) >>> 0
  return 100000 + (h % 900000)
}

/** Número de la boleta: el del servidor si existe; si no, uno derivado del id. */
export function numeroBoletaDeCuenta(cuenta: { id: string; numero?: string | null }): string {
  if (cuenta.numero) return cuenta.numero
  return formatearNumeroBoleta(derivarCorrelativo(cuenta.id))
}
