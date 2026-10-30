// PIN de autorización: las reglas puras.
//
// Por qué en un lib y no dentro del componente: la validación del PIN corre en
// tres lugares (ConfiguracionTab para darlo de alta, el modal de anular ítem y
// el de anular cobro) y el mismo criterio tiene que estar en el verificador de
// flujo. Si cada pantalla escribiera su propio `if`, acabarían discrepando
// ("4 dígitos" en un lado, "4 o más" en el otro).
//
// La comparación real NO es la de acá: la que manda es la del servidor
// (`public.validar_pin_autorizacion` en supabase/pin_autorizacion.sql), que
// compara contra el hash. Esto es la versión que da feedback instantáneo.

/** Mínimo y máximo de dígitos. Mismo criterio que el CHECK del servidor. */
export const PIN_MIN_DIGITOS = 4
export const PIN_MAX_DIGITOS = 6

/** Motivos frecuentes de anulación de cobro: los que se escriben de memoria. */
export const MOTIVOS_ANULACION_COBRO = [
  'Error de cobro',
  'Cliente devolvió la comida',
  'Mesacancelada / comanda mal tomada',
  'Cobro duplicado',
] as const

/** Solo dígitos, sin espacios: el PIN se teclea con una mano en la caja. */
export function esPinValido(pin: string): boolean {
  return new RegExp(`^[0-9]{${PIN_MIN_DIGITOS},${PIN_MAX_DIGITOS}}$`).test(pin)
}

/**
 * Reglas para dar de alta o rotar el PIN. Devuelve el mensaje de error o `null`
 * si se puede guardar.
 */
export function errorAlConfigurarPin(pin: string, confirmacion: string): string | null {
  if (!pin) return 'Escribe el PIN.'
  if (!esPinValido(pin)) {
    return `El PIN debe tener entre ${PIN_MIN_DIGITOS} y ${PIN_MAX_DIGITOS} dígitos.`
  }
  if (pin !== confirmacion) return 'Los dos PIN no coinciden.'
  return null
}

/**
 * Reglas para anular un cobro. El motivo no es un formality: una boleta anulada
 * sin explicación no sirve ni para el cliente ni para revisar el mes.
 */
export function errorAlAnularCobro(motivo: string): string | null {
  const limpio = motivo.trim()
  if (!limpio) return 'Escribe el motivo de la anulación.'
  if (limpio.length < 4) return 'El motivo es demasiado corto para que sirva de registro.'
  if (limpio.length > 200) return 'El motivo es demasiado largo.'
  return null
}

/**
 * El PIN no se valida acá en serio (no se puede comparar contra un hash en el
 * navegador), así que lo único que hace esta función es decidir si hay que
 * pedirlo. Sin PIN configurado no se pide nada: los restaurantes que no lo
 * configuraron siguen anular ítems igual (ver la nota de
 * supabase/pin_autorizacion.sql).
 */
export function pinRequerido(pinConfigurado: string | null | undefined): boolean {
  return Boolean(pinConfigurado)
}

/** Mensaje de error del PIN incorrecto. El servidor y el mock dicen lo mismo. */
export const MENSAJE_PIN_INCORRECTO = 'PIN de autorización incorrecto'
