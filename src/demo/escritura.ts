/**
 * Efecto «máquina de escribir» del demo guiado: al pulsar «Hazlo por mí» los
 * campos del formulario se rellenan a la vista del usuario, que luego confirma
 * con Guardar. Solo se usa en el demo; el modo local y el real no lo tocan.
 *
 * Los temporizadores usan `globalThis` (y no `window`) para que el mismo
 * código se pueda ejercitar en Node desde `npm run verificar`.
 */

/** Escribe `texto` letra a letra. Devuelve una función para cancelar. */
export function escribirTexto(
  texto: string,
  aplicar: (parcial: string) => void,
  msPorLetra = 55,
): () => void {
  let i = 0
  aplicar('')
  const t = globalThis.setInterval(() => {
    i += 1
    aplicar(texto.slice(0, i))
    if (i >= texto.length) globalThis.clearInterval(t)
  }, msPorLetra)
  return () => globalThis.clearInterval(t)
}

/**
 * Escribe varios campos a la vez (p. ej. nombre y precio de un plato) para que
 * se rellenen en paralelo. Se detiene cuando el más largo termina.
 */
export function escribirVarios(
  campos: { texto: string; aplicar: (parcial: string) => void }[],
  msPorLetra = 55,
): () => void {
  const largo = campos.reduce((max, c) => Math.max(max, c.texto.length), 0)
  for (const c of campos) c.aplicar('')
  let i = 0
  const t = globalThis.setInterval(() => {
    i += 1
    for (const c of campos) c.aplicar(c.texto.slice(0, i))
    if (i >= largo) globalThis.clearInterval(t)
  }, msPorLetra)
  return () => globalThis.clearInterval(t)
}

/** Un campo de la secuencia de autocompletado. */
export interface CampoSecuencia {
  /**
   * Texto a escribir letra a letra. Vacío = no se escribe nada: solo se aplica
   * el valor (sirve para un desplegable, que no se «escribe»).
   */
  texto: string
  /** Recibe el texto parcial que se lleva escrito. */
  aplicar: (parcial: string) => void
  /** Ritmo de escritura de este campo (por defecto 55 ms por letra). */
  msPorLetra?: number
}

/**
 * Escribe varios campos UNO TRAS OTRO, no en paralelo: el siguiente campo
 * espera a que termine el anterior, para que el usuario vea el recorrido del
 * cursor por el formulario.
 *
 * `alCambiar` recibe el índice del campo que se está escribiendo, y -1 cuando
 * la secuencia terminó. Devuelve la función para cancelar (la usan el cleanup
 * del `useEffect` y el cierre del modal: nunca debe quedar un intervalo vivo).
 */
export function escribirSecuencia(
  campos: CampoSecuencia[],
  alCambiar: (indice: number) => void = () => {},
  opciones: { pausaEntreCampos?: number; msPorLetra?: number } = {},
): () => void {
  const pausa = opciones.pausaEntreCampos ?? 320
  const msDefecto = opciones.msPorLetra ?? 55
  let cancelado = false
  let temporizador: ReturnType<typeof globalThis.setTimeout> | null = null
  let intervalo: ReturnType<typeof globalThis.setInterval> | null = null

  const cancelar = () => {
    cancelado = true
    if (temporizador !== null) globalThis.clearTimeout(temporizador)
    if (intervalo !== null) globalThis.clearInterval(intervalo)
  }

  const escribirUno = (indice: number) => {
    if (cancelado) return
    const campo = campos[indice]
    if (!campo) {
      alCambiar(-1)
      return
    }
    alCambiar(indice)
    campo.aplicar('')
    // Un campo sin texto no se escribe: se aplica su valor y se sigue.
    if (campo.texto.length === 0) {
      temporizador = globalThis.setTimeout(() => escribirUno(indice + 1), pausa)
      return
    }
    let i = 0
    const ms = campo.msPorLetra ?? msDefecto
    intervalo = globalThis.setInterval(() => {
      i += 1
      campo.aplicar(campo.texto.slice(0, i))
      if (i >= campo.texto.length) {
        globalThis.clearInterval(intervalo)
        intervalo = null
        temporizador = globalThis.setTimeout(() => escribirUno(indice + 1), pausa)
      }
    }, ms)
  }

  temporizador = globalThis.setTimeout(() => escribirUno(0), 0)
  return cancelar
}
