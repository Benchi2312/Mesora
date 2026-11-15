export const MAX_BYTES_IMAGEN_PRODUCTO = 5 * 1024 * 1024

const formatos = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
} as const

export type MimeImagenProducto = (typeof formatos)[keyof typeof formatos]

/** Validación ligera del navegador; el servidor vuelve a validar contenido y tamaño. */
export function validarArchivoImagenProducto(
  archivo: Pick<File, 'name' | 'type' | 'size'>,
): string | null {
  const extension = archivo.name.slice(archivo.name.lastIndexOf('.')).toLowerCase()
  const mimeEsperado = formatos[extension as keyof typeof formatos]
  if (!mimeEsperado || !['image/jpeg', 'image/png', 'image/webp'].includes(archivo.type)) {
    return 'Elige una imagen JPG, PNG o WebP.'
  }
  if (archivo.type !== mimeEsperado) return 'La extensión y el tipo de archivo no coinciden.'
  if (archivo.size <= 0) return 'El archivo está vacío.'
  if (archivo.size > MAX_BYTES_IMAGEN_PRODUCTO) return 'La imagen no puede superar 5 MB.'
  return null
}

/** Verifica las cabeceras binarias; no confía en el nombre ni el MIME enviados por el navegador. */
export function validarContenidoImagenProducto(bytes: Uint8Array, mime: string): boolean {
  if (mime === 'image/jpeg') return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  if (mime === 'image/png') {
    return bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e &&
      bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  }
  if (mime === 'image/webp') {
    return bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
      String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
  }
  return false
}

/** En enlaces nuevos solo se admiten URL HTTPS; nunca rutas locales ni blob/file URLs. */
export function validarUrlImagenProducto(valor: string): string | null {
  const texto = valor.trim()
  if (!texto) return null
  if (/^(?:[a-z]:[\\/]|\\\\|file:|blob:)/i.test(texto)) {
    return 'Usa un enlace web; no se pueden guardar rutas locales del equipo.'
  }
  try {
    const url = new URL(texto)
    if (url.protocol !== 'https:' || !url.hostname) return 'El enlace de imagen debe comenzar con https://.'
    return null
  } catch {
    return 'Escribe un enlace de imagen válido.'
  }
}
