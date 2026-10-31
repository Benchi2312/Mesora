// Caja por turnos: apertura, arqueo y cierre.
//
// La lógica vive aquí (y no en el componente) porque es la parte que se puede
// equivocar: el arqueo compara el dinero declarado contra el que *debería*
// haber, y ese cálculo tiene que ser el mismo en el modo local, en el demo y
// en producción. Si cada pantalla lo calculara a su modo, el arqueo y la
// boleta dejarían de cuadrar.

import type { Cuenta, Pago, TurnoCaja } from '../../types/database'

/**
 * Ventas en efectivo imputables a un turno: el efectivo cobrado dentro de la
 * ventana [apertura, cierre), menos el efectivo devuelto por anulaciones hechas
 * dentro de la misma ventana.
 *
 * - Solo `efectivo`: el tarjeta/Yape no entra a la gaveta, así que no puede
 *   "salvar" un faltante de efectivo.
 * - La ventana es del cierre OPEN (fecha_cierre): un turno abierto nunca tiene
 *   fecha de cierre, así que todo lo pagado desde que abrió cuenta.
 * - El borde inferior es `>=` (la cuenta cobrada en el mismo instante en que
 *   se abrió la caja es del turno nuevo) y el superior es `<` (si dos turnos se
 *   tocan, la cuenta no se cuenta dos veces).
 * - Con pago dividido hay que sumar SOLO la parte en efectivo, y restarle el
 *   vuelto que salió de ella: "30 en efectivo + 3 por Yape" para una cuenta de
 *   28 deja 25 en la gaveta, no 30 ni 33.
 * - Una cuenta ANULADA aporta las DOS cosas, cada una en su fecha: el efectivo
 *   que entró (pagado_at) y el que volvió a salir (anulada_at). No es
 *   "cobrar menos": si se cobró y se anuló en el MISMO turno, el turno tiene que
 *   ver +25 y −25, no solo uno, porque la gaveta estuvo con la plata y después
 *   la devolvió. Si se cobró en un turno y se anuló en el siguiente, cada
 *   arqueo cuenta su parte: el dinero entró en la primera gaveta y salió de la
 *   segunda, y el segundo turno no puede mostrar una venta que no tuvo.
 */
export function ventasEfectivoDelTurno(
  cuentas: ReadonlyArray<
    Pick<Cuenta, 'id' | 'total' | 'metodo_pago' | 'estado' | 'pagado_at' | 'vuelto' | 'anulada_at'>
  >,
  apertura: string,
  cierre: string | null,
  pagos: ReadonlyArray<Pick<Pago, 'cuenta_id' | 'metodo_pago' | 'monto'>> = [],
): number {
  const desde = new Date(apertura).getTime()
  const hasta = cierre ? new Date(cierre).getTime() : Infinity
  const pagosPorCuenta = new Map<string, Pick<Pago, 'metodo_pago' | 'monto'>[]>()
  for (const p of pagos) {
    const arr = pagosPorCuenta.get(p.cuenta_id) ?? []
    arr.push(p)
    pagosPorCuenta.set(p.cuenta_id, arr)
  }

  const enVentana = (iso: string | null | undefined): boolean => {
    if (!iso) return false
    const t = new Date(iso).getTime()
    return t >= desde && t < hasta
  }

  /** Efectivo que esta cuenta puso (o devolvió) en la gaveta. */
  const efectivoDeLaCuenta = (c: (typeof cuentas)[number]): number => {
    const partes = pagosPorCuenta.get((c as { id?: string }).id ?? '')
    // Sin detalle de pagos (cuentas viejas) se usa el método principal.
    if (!partes || partes.length === 0) return c.metodo_pago === 'efectivo' ? c.total : 0
    const entregado = partes
      .filter((p) => p.metodo_pago === 'efectivo')
      .reduce((a, p) => a + p.monto, 0)
    // El vuelto sale de la gaveta: lo que queda es lo que entró por venta.
    return Math.max(0, entregado - (c.vuelto ?? 0))
  }

  let total = 0
  for (const c of cuentas) {
    // 'pendiente' no cuenta: no entra ni sale dinero de una cuenta sin cobrar.
    if (c.estado !== 'pagada' && c.estado !== 'anulada') continue
    const efectivo = efectivoDeLaCuenta(c)
    if (efectivo === 0) continue
    if (enVentana(c.pagado_at)) total += efectivo
    if (c.estado === 'anulada' && enVentana(c.anulada_at)) total -= efectivo
  }
  return total
}

export type Arqueo = {
  /** Dinero con el que se abrió la gaveta. */
  inicial: number
  /** Efectivo cobrado durante el turno (ya menos los reembolsos de boletas anuladas). */
  ventas: number
  /** Lo que debería haber en la gaveta al cerrar. */
  esperado: number
  /** Lo que el cajero declaró (0 si aún no declaró nada). */
  declarado: number
  /** declarado − esperado. Positivo = sobrante, negativo = faltante. */
  diferencia: number
  /** diferencia ≈ 0 (tolerancia de 1 centavo por redondeo). */
  cuadrado: boolean
}

/**
 * Arqueo del turno. Funciona con el turno abierto (declarado en 0) para que la
 * UI pueda mostrar "esperado" mientras se cobra, y con el cerrado para el
 * histórico.
 */
export function arqueoTurno(
  turno: Pick<TurnoCaja, 'monto_inicial' | 'fecha_apertura' | 'fecha_cierre' | 'monto_declarado'> | null | undefined,
  cuentas: ReadonlyArray<
    Pick<Cuenta, 'id' | 'total' | 'metodo_pago' | 'estado' | 'pagado_at' | 'vuelto' | 'anulada_at'>
  >,
  pagos: ReadonlyArray<Pick<Pago, 'cuenta_id' | 'metodo_pago' | 'monto'>> = [],
): Arqueo {
  if (!turno) {
    return {
      inicial: 0,
      ventas: 0,
      esperado: 0,
      declarado: 0,
      diferencia: 0,
      cuadrado: true,
    }
  }
  const ventas = ventasEfectivoDelTurno(cuentas, turno.fecha_apertura, turno.fecha_cierre, pagos)
  const esperado = redondear(turno.monto_inicial + ventas)
  const declarado = redondear(turno.monto_declarado ?? 0)
  const diferencia = redondear(declarado - esperado)
  return { inicial: redondear(turno.monto_inicial), ventas: redondear(ventas), esperado, declarado, diferencia, cuadrado: Math.abs(diferencia) < 0.01 }
}

/** Redondeo a 2 decimales: los soles no tienen centavos menores a 1/100. */
export function redondear(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Reglas de apertura. Devuelve el mensaje de error o `null` si se puede abrir.
 * La regla real (un solo turno abierto por restaurante) la refuerza un índice
 * único parcial en SQL; esto es la versión que el usuario ve al instante.
 */
export function errorAlAbrirTurno(
  montoInicial: number,
  turnoAbierto: Pick<TurnoCaja, 'id'> | null,
): string | null {
  if (turnoAbierto) return 'Ya hay un turno de caja abierto. Debes cerrarlo antes de abrir otro nuevo.'
  if (!Number.isFinite(montoInicial)) return 'El monto inicial debe ser un número válido.'
  if (montoInicial < 0) return 'El monto inicial no puede ser negativo.'
  if (montoInicial > 1_000_000) return 'El monto inicial parece demasiado alto. Revisa el valor ingresado.'
  return null
}

/**
 * Reglas de cierre. Mismo patrón: mensaje de error o `null` si se puede cerrar.
 *
 * POR QUÉ NO BLOQUEA POR MESAS SIN COBRAR
 * El arqueo esperado suma ÚNICAMENTE el efectivo cobrado dentro del turno. Una
 * cuenta impaga todavía no entró a la gaveta, así que no puede descuadrar el
 * cierre: se cobrará en el turno en que efectivamente se pague y entrará a ESE
 * arqueo. Bloquear el cierre dejaba al admin sin salida (para cobrar hay que ir
 * a la vista de mesero) y obligaba a inventar un cobro. La advertencia correcta
 * se muestra en Caja con `getMesasPorCobrar`, pero es informativa.
 */
export function errorAlCerrarTurno(
  montoDeclarado: number,
  turnoAbierto: Pick<TurnoCaja, 'id'> | null,
): string | null {
  if (!turnoAbierto) return 'No hay ningún turno de caja abierto.'
  if (!Number.isFinite(montoDeclarado)) return 'El monto declarado debe ser un número válido.'
  if (montoDeclarado < 0) return 'El monto declarado no puede ser negativo.'
  if (montoDeclarado > 1_000_000) return 'El monto declarado parece demasiado alto. Revisa el valor ingresado.'
  return null
}

/**
 * Lee un monto escrito por la persona que caja. Acepta "1,234.50", "1234,50",
 * "1234.5" y "1.234.567": en el salón se teclea como sea, y un `parseFloat` que
 * no entienda la coma devuelve NaN y bloquea el cobro con un error confuso.
 *
 * La regla es la de los separadores de millar: si hay punto Y coma, el último
 * que aparece es el decimal y el otro es de miles. "1,234.50" → 1234.50 y
 * "1.234,50" → 1234.50.
 */
export function parseMonto(valor: string): number {
  const limpio = valor.replace(/\s/g, '').replace(/S\/|\$/g, '')
  if (!limpio) return NaN

  const ultimaComa = limpio.lastIndexOf(',')
  const ultimoPunto = limpio.lastIndexOf('.')
  let normalizado = limpio

  if (ultimaComa > -1 && ultimoPunto > -1) {
    normalizado = ultimaComa > ultimoPunto ? limpio.replace(/\./g, '').replace(',', '.') : limpio.replace(/,/g, '')
  } else if (ultimaComa > -1) {
    // Una sola coma es decimal ("1234,50"); repetida es millar ("1,234,567").
    normalizado = (limpio.match(/,/g)?.length ?? 0) > 1 ? limpio.replace(/,/g, '') : limpio.replace(',', '.')
  } else if (ultimoPunto > -1) {
    normalizado = (limpio.match(/\./g)?.length ?? 0) > 1 ? limpio.replace(/\./g, '') : limpio
  }

  const n = Number(normalizado)
  return Number.isFinite(n) ? n : NaN
}
