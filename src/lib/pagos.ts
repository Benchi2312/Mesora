// Métodos de pago y cobro: la lista canónica vive en src/types/database.ts
// (METODOS_PAGO). Aquí están las etiquetas para la UI y la lógica de pago
// dividido / vuelto / propina.
//
// El tipo `Record<MetodoPago, string>` obliga a que todo método de pago tenga su
// etiqueta: si agregas uno nuevo a METODOS_PAGO, el typecheck falla aquí hasta
// que lo agregues.

import { METODOS_PAGO, esMetodoPagoValido, type MetodoPago } from '../types/database'

export const METODOS_PAGO_LABEL: Record<MetodoPago, string> = {
  efectivo: 'Efectivo',
  tarjeta: 'Tarjeta',
  yape_plin: 'Yape / Plin',
  otro: 'Otro',
}

/** Lista ordenada para pintar los botones de pago. */
export const METODOS_PAGO_LISTA: { id: MetodoPago; label: string }[] = METODOS_PAGO.map((id) => ({
  id,
  label: METODOS_PAGO_LABEL[id],
}))

/** Etiqueta legible de un método, con fallback para datos venidos del backend. */
export function labelMetodoPago(metodo: string): string {
  return METODOS_PAGO_LABEL[metodo as MetodoPago] ?? metodo
}

/** Un pago que forma parte de una cuenta (pago dividido). */
export type PagoParte = {
  metodo: MetodoPago
  /** Efectivo (o dinero) entregado por el cliente con este método. */
  monto: number
  /** Nro de operación de tarjeta/Yape. Opcional, solo informativo. */
  referencia?: string | null
}

/** Propinas sugeridas como porcentaje del total. */
export const PROPINAS_SUGERIDAS = [0, 5, 10, 15] as const

export type ResumenPago = {
  /** Total de la comanda (sin propina). */
  total: number
  propina: number
  /** Lo que el cliente debe entregar: total + propina. */
  aPagar: number
  /** Suma de todas las partes. */
  recibido: number
  /** Devuelto al cliente. Siempre ≥ 0. */
  vuelto: number
  /** Solo la parte en efectivo: es la única de la que sale el vuelto. */
  efectivo: number
  /** Suma de las partes que no son efectivo. */
  noEfectivo: number
  /** ¿El desglose se puede cobrar así? */
  valido: boolean
  /** Motivo por el que no, o `null` si sí. */
  error: string | null
}

function c2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Calcula el resumen del cobro (a pagar, recibido, vuelto) y valida que el
 * desglose tenga sentido. Es la MISMA función que usan la pantalla de cobro, el
 * backend local y la verificación: si el vuelto se calculara en tres lugares,
 * el papel y la base disagreeían en el redondeo.
 *
 * Reglas:
 * 1. Todos los métodos deben estar en la whitelist de METODOS_PAGO.
 * 2. Cada parte tiene que aportar algo (> 0).
 * 3. Lo recibido tiene que cubrir el total (no se cobra "a crédito").
 * 4. El vuelto sale solo del efectivo: no se puede devolver cambio de una
 *    tarjeta. Se traduce como: la parte no-efectivo no puede superar el total a
 *    pagar.
 */
export function resumirPago(total: number, partes: readonly PagoParte[], propina = 0): ResumenPago {
  const suma = c2(partes.reduce((acc, p) => acc + (Number.isFinite(p.monto) ? p.monto : 0), 0))
  const efectivo = c2(
    partes.filter((p) => p.metodo === 'efectivo').reduce((acc, p) => acc + (Number.isFinite(p.monto) ? p.monto : 0), 0),
  )
  const aPagar = c2(total + (Number.isFinite(propina) ? propina : 0))

  let error: string | null = null
  if (!Number.isFinite(total) || total < 0) error = 'El total de la cuenta no es válido.'
  else if (!Number.isFinite(propina) || propina < 0) error = 'La propina no puede ser negativa.'
  else if (partes.length === 0) error = 'Agrega al menos un método de pago.'
  else if (partes.some((p) => !esMetodoPagoValido(p.metodo))) error = 'Hay un método de pago no válido.'
  else if (partes.some((p) => !Number.isFinite(p.monto) || p.monto <= 0))
    error = 'Cada pago debe ser mayor que cero.'
  else if (c2(suma - aPagar) < -0.01) error = 'El monto recibido no cubre el total de la cuenta.'
  else if (c2(suma - efectivo) > aPagar + 0.01)
    error = 'El pago con tarjeta o Yape no puede superar el total: el vuelto solo se entrega en efectivo.'

  const diferencia = c2(suma - aPagar)
  return {
    total: c2(total),
    propina: c2(propina),
    aPagar,
    recibido: suma,
    // Con error de validación el vuelto es informativo (0, nunca negativo).
    vuelto: error ? 0 : c2(Math.max(0, diferencia)),
    efectivo,
    noEfectivo: c2(suma - efectivo),
    valido: error === null,
    error,
  }
}

/**
 * Vuelto de un cobro rápido en un solo método. Es lo que muestra la pantalla
 * mientras el mesero cuenta el billete, antes de que exista el desglose.
 */
export function vueltoRapido(recibido: number, aPagar: number): number {
  if (!Number.isFinite(recibido) || !Number.isFinite(aPagar)) return 0
  return c2(Math.max(0, c2(recibido) - c2(aPagar)))
}

/**
 * Completa las partes que quedaron "exactas" (monto 0 = el que aún no se
 * tecleó), repartiendo el resto del total a pagar entre ellas.
 *
 * Sin esto, un desglose de "33 en efectivo + exacto en Yape" cobraría 33 + 28:
 * el 0 se interpretaría como "el cliente entregó el total completo" y la cuenta
 * sumaría el doble. Con este helper, el 0 significa siempre "el resto que
 * falta", que es lo que el mesero espera al dejar una parte en blanco.
 *
 * Reglas: solo una parte puede quedar exacta, y tiene que quedar algo por
 * repartir (si las demás ya cubren el total, esa parte no aporta nada).
 */
export function completarPartes(
  partes: readonly PagoParte[],
  aPagar: number,
): { partes: PagoParte[]; error: string | null } {
  const exactas = partes.filter((p) => !(p.monto > 0))
  if (exactas.length === 0) return { partes: [...partes], error: null }
  if (exactas.length > 1)
    return { partes: [...partes], error: 'Solo una parte puede quedar "exacta". Reparte el total entre los métodos.' }

  const yaTeclado = c2(partes.reduce((acc, p) => acc + (p.monto > 0 ? p.monto : 0), 0))
  const resto = c2(aPagar - yaTeclado)
  if (resto <= 0)
    return {
      partes: [...partes],
      error: 'Los montos que pusiste ya cubren el total. Quita esa parte o ajústala.',
    }

  return { partes: partes.map((p) => (p.monto > 0 ? { ...p } : { ...p, monto: resto })), error: null }
}

/**
 * Genera el desglose de un pago dividido "por defecto": reparte el total entre
 * métodos en el orden dado. Se usa cuando el mesero elige dos métodos pero solo
 * teclea el primer monto.
 */
export function repartoSugerido(aPagar: number, metodos: readonly MetodoPago[]): PagoParte[] {
  const lista = metodos.filter(esMetodoPagoValido)
  if (lista.length === 0 || !Number.isFinite(aPagar) || aPagar <= 0) return []
  if (lista.length === 1) return [{ metodo: lista[0], monto: c2(aPagar) }]

  const partes: PagoParte[] = []
  let restante = c2(aPagar)
  // Todos menos el último se reparten en partes iguales; el último absorbe el
  // redondeo para que la suma sea exacta (si no, "10 + 10 + 10" deja 0.01
  // colgando y el cobro parece incompleto).
  const cuota = c2(Math.floor(c2(restante / lista.length) * 100) / 100)
  for (let i = 0; i < lista.length - 1; i++) {
    partes.push({ metodo: lista[i], monto: cuota })
    restante = c2(restante - cuota)
  }
  partes.push({ metodo: lista[lista.length - 1], monto: restante })
  return partes
}
