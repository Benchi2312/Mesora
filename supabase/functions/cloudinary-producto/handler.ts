import {
  MAX_BYTES_IMAGEN_PRODUCTO,
  validarArchivoImagenProducto,
  validarContenidoImagenProducto,
} from '../../../src/domain/restaurant/imagenProducto.ts'

export type PerfilCloudinary = {
  rol: string
  activo: boolean
  restaurante_id: string | null
}

export type ImagenCloudinary = { secureUrl: string; publicId: string }

export type DependenciasCloudinary = {
  usuarioDesdeRequest: (request: Request) => Promise<{ id: string } | null>
  perfilDeUsuario: (id: string) => Promise<PerfilCloudinary | null>
  imagenEstaEnUso: (publicId: string) => Promise<boolean>
  subirImagen: (archivo: File, restauranteId: string) => Promise<ImagenCloudinary>
  eliminarImagen: (publicId: string) => Promise<'ok' | 'not_found'>
}

const MAX_CUERPO = MAX_BYTES_IMAGEN_PRODUCTO + 64 * 1024
const SITIO_PRODUCCION = 'https://mesora-sistema.vercel.app'
const ORIGENES_BASE = [
  SITIO_PRODUCCION,
  'https://mesora-piloto.vercel.app',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
]

function respuesta(request: Request, estado: number, cuerpo: Record<string, unknown>, origenes: Set<string>): Response {
  const origin = request.headers.get('origin') ?? ''
  const permitido = origin && origenes.has(origin)
  return new Response(estado === 204 ? null : JSON.stringify(cuerpo), {
    status: estado,
    headers: {
      ...(permitido ? { 'Access-Control-Allow-Origin': origin } : {}),
      'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Max-Age': '86400',
      'Cache-Control': 'no-store',
      ...(estado === 204 ? {} : { 'Content-Type': 'application/json; charset=utf-8' }),
      Vary: 'Origin',
    },
  })
}

async function leerCuerpoLimitado(request: Request, maximo: number): Promise<Uint8Array | null> {
  if (!request.body) return null
  const reader = request.body.getReader()
  const partes: Uint8Array[] = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maximo) {
      await reader.cancel().catch(() => undefined)
      return null
    }
    partes.push(value)
  }
  const resultado = new Uint8Array(total)
  let offset = 0
  for (const parte of partes) {
    resultado.set(parte, offset)
    offset += parte.byteLength
  }
  return resultado
}

function uuidValido(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

/** El upload usa un ID aleatorio con el tenant en el nombre. */
export function publicIdDeRestauranteValido(publicId: string, restauranteId: string): boolean {
  if (!uuidValido(restauranteId)) return false
  const partes = publicId.split('/')
  if (partes.length > 3) return false
  const hoja = partes.at(-1) ?? ''
  const ruta = partes.slice(0, -1).join('/')
  if (ruta !== '' && ruta !== 'mesora/products') return false
  const prefijo = `${restauranteId}_`
  if (!hoja.startsWith(prefijo)) return false
  return uuidValido(hoja.slice(prefijo.length))
}

export function crearHandlerCloudinary(
  dependencias: DependenciasCloudinary,
  opciones: { origenes?: string[] } = {},
): (request: Request) => Promise<Response> {
  const origenes = new Set([...ORIGENES_BASE, ...(opciones.origenes ?? [])])

  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get('origin') ?? ''
    if (origin && !origenes.has(origin)) return respuesta(request, 403, { error: 'Origen no permitido.' }, origenes)
    if (request.method === 'OPTIONS') return respuesta(request, 204, {}, origenes)
    if (request.method !== 'POST') return respuesta(request, 405, { error: 'Método no permitido.' }, origenes)

    try {
      const usuario = await dependencias.usuarioDesdeRequest(request)
      if (!usuario) return respuesta(request, 401, { error: 'Inicia sesión para gestionar imágenes.' }, origenes)
      const perfil = await dependencias.perfilDeUsuario(usuario.id)
      if (!perfil || perfil.rol !== 'admin_restaurante' || perfil.activo !== true || !perfil.restaurante_id) {
        return respuesta(request, 403, { error: 'Solo un administrador activo puede gestionar imágenes de productos.' }, origenes)
      }
      const restauranteId = perfil.restaurante_id

      if (request.headers.get('content-type')?.toLowerCase().startsWith('multipart/form-data')) {
        const length = Number(request.headers.get('content-length') ?? '0')
        if (length > MAX_CUERPO) return respuesta(request, 413, { error: 'La imagen no puede superar 5 MB.' }, origenes)
        const cuerpo = await leerCuerpoLimitado(request, MAX_CUERPO)
        if (!cuerpo) return respuesta(request, 413, { error: 'La imagen no puede superar 5 MB.' }, origenes)

        const contentType = request.headers.get('content-type') ?? ''
        const cuerpoBuffer = new ArrayBuffer(cuerpo.byteLength)
        new Uint8Array(cuerpoBuffer).set(cuerpo)
        const form = await new Response(cuerpoBuffer, { headers: { 'Content-Type': contentType } }).formData()
        const ridDeclarado = form.get('restaurante_id')
        if (typeof ridDeclarado !== 'string' || ridDeclarado !== restauranteId) {
          return respuesta(request, 403, { error: 'El restaurante de la sesión no coincide.' }, origenes)
        }
        const valorArchivo = form.get('archivo')
        if (!(valorArchivo instanceof File)) return respuesta(request, 400, { error: 'Selecciona un archivo de imagen.' }, origenes)
        if (valorArchivo.size > MAX_BYTES_IMAGEN_PRODUCTO) return respuesta(request, 413, { error: 'La imagen no puede superar 5 MB.' }, origenes)
        const errorArchivo = validarArchivoImagenProducto(valorArchivo)
        if (errorArchivo) return respuesta(request, 400, { error: errorArchivo }, origenes)
        const bytes = new Uint8Array(await valorArchivo.arrayBuffer())
        if (!validarContenidoImagenProducto(bytes, valorArchivo.type)) {
          return respuesta(request, 400, { error: 'El contenido no coincide con una imagen JPG, PNG o WebP válida.' }, origenes)
        }

        try {
          const imagen = await dependencias.subirImagen(valorArchivo, restauranteId)
          if (!imagen.secureUrl.startsWith('https://') || !publicIdDeRestauranteValido(imagen.publicId, restauranteId)) {
            return respuesta(request, 502, { error: 'Cloudinary devolvió una respuesta de imagen inválida.' }, origenes)
          }
          return respuesta(request, 200, { secure_url: imagen.secureUrl, public_id: imagen.publicId }, origenes)
        } catch {
          return respuesta(request, 502, { error: 'Cloudinary no pudo guardar la imagen. El formulario se conserva para reintentar.' }, origenes)
        }
      }

      if (request.headers.get('content-type')?.toLowerCase().includes('application/json')) {
        const body = await request.json().catch(() => null) as Record<string, unknown> | null
        if (!body || body.accion !== 'eliminar' || typeof body.public_id !== 'string') {
          return respuesta(request, 400, { error: 'Solicitud de eliminación inválida.' }, origenes)
        }
        const publicId = body.public_id.trim()
        if (!publicIdDeRestauranteValido(publicId, restauranteId)) {
          return respuesta(request, 403, { error: 'La imagen no pertenece al restaurante de la sesión.' }, origenes)
        }
        if (await dependencias.imagenEstaEnUso(publicId)) {
          return respuesta(request, 409, { error: 'La imagen todavía está vinculada a un producto.' }, origenes)
        }
        try {
          await dependencias.eliminarImagen(publicId)
          return respuesta(request, 200, { eliminada: true }, origenes)
        } catch {
          return respuesta(request, 502, { error: 'La imagen quedó desvinculada, pero Cloudinary no confirmó su eliminación.' }, origenes)
        }
      }

      return respuesta(request, 415, { error: 'Usa una carga multipart o una solicitud de eliminación.' }, origenes)
    } catch {
      return respuesta(request, 500, { error: 'No se pudo procesar la imagen. Inténtalo nuevamente.' }, origenes)
    }
  }
}
