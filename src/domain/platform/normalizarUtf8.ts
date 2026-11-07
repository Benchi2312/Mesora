const PAREJA_UTF8_MOJIBAKE = /(?:\u00c3[\u0080-\u00bf]|\u00c2[\u00a0-\u00bf])/g
const HAY_MOJIBAKE_UTF8 = /(?:\u00c3[\u0080-\u00bf]|\u00c2[\u00a0-\u00bf])/

function decodificarPares(texto: string): string {
  return texto.replace(PAREJA_UTF8_MOJIBAKE, (pareja) => {
    const bytes = Uint8Array.from([...pareja], (caracter) => caracter.charCodeAt(0))
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    } catch {
      return pareja
    }
  })
}

/**
 * Repara texto UTF-8 que se leyó por error como Windows-1252/Latin-1.
 * Solo toca parejas con marcadores típicos y deja intacto el texto válido.
 */
export function normalizarTextoUtf8(texto: string): string {
  let resultado = texto
  for (let intento = 0; intento < 2 && HAY_MOJIBAKE_UTF8.test(resultado); intento++) {
    HAY_MOJIBAKE_UTF8.lastIndex = 0
    const siguiente = decodificarPares(resultado)
    if (siguiente === resultado) break
    resultado = siguiente
  }
  HAY_MOJIBAKE_UTF8.lastIndex = 0
  return resultado
}

/** Normaliza también las cadenas que vienen anidadas en el JSON de auditoría. */
export function normalizarContenidoUtf8<T>(valor: T): T {
  if (typeof valor === 'string') return normalizarTextoUtf8(valor) as T
  if (Array.isArray(valor)) return valor.map((elemento) => normalizarContenidoUtf8(elemento)) as T
  if (valor && typeof valor === 'object' && Object.getPrototypeOf(valor) === Object.prototype) {
    return Object.fromEntries(
      Object.entries(valor).map(([clave, contenido]) => [clave, normalizarContenidoUtf8(contenido)]),
    ) as T
  }
  return valor
}
