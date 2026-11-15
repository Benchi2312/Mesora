import { supabase } from './supabase'
import {
  MAX_BYTES_IMAGEN_PRODUCTO,
  validarArchivoImagenProducto,
  validarUrlImagenProducto,
} from '../domain/restaurant/imagenProducto'

export { MAX_BYTES_IMAGEN_PRODUCTO, validarArchivoImagenProducto, validarUrlImagenProducto }

export type ImagenProductoCloudinary = { secure_url: string; public_id: string }

/** La sesión del usuario viaja a la Edge Function; ninguna clave privada llega al navegador. */
export function subirImagenProducto(
  archivo: File,
  restauranteId: string,
  alProgresar: (porcentaje: number) => void,
): Promise<ImagenProductoCloudinary> {
  const error = validarArchivoImagenProducto(archivo)
  if (error) return Promise.reject(new Error(error))
  const urlSupabase = import.meta.env.VITE_SUPABASE_URL as string | undefined
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
  if (!urlSupabase || !anonKey) return Promise.reject(new Error('No se pudo conectar con el servicio de imágenes.'))

  return supabase.auth.getSession().then(({ data, error: sessionError }) => {
    const token = data.session?.access_token
    if (sessionError || !token) throw new Error('Inicia sesión nuevamente para subir imágenes.')
    return new Promise<ImagenProductoCloudinary>((resolve, reject) => {
      const request = new XMLHttpRequest()
      request.open('POST', `${urlSupabase.replace(/\/$/, '')}/functions/v1/cloudinary-producto`)
      request.setRequestHeader('Authorization', `Bearer ${token}`)
      request.setRequestHeader('apikey', anonKey)
      request.upload.onprogress = (event) => {
        if (event.lengthComputable) alProgresar(Math.min(99, Math.round((event.loaded / event.total) * 100)))
      }
      request.onerror = () => reject(new Error('No se pudo confirmar la carga. Puedes volver a intentarlo.'))
      request.ontimeout = () => reject(new Error('La carga tardó demasiado. Puedes volver a intentarlo.'))
      request.timeout = 60_000
      request.onload = () => {
        let body: { secure_url?: unknown; public_id?: unknown; error?: unknown } = {}
        try { body = JSON.parse(request.responseText) as typeof body } catch { /* error legible abajo */ }
        if (request.status < 200 || request.status >= 300) {
          reject(new Error(typeof body.error === 'string' ? body.error : 'Cloudinary no pudo guardar la imagen.'))
          return
        }
        if (typeof body.secure_url !== 'string' || typeof body.public_id !== 'string') {
          reject(new Error('La respuesta de carga no contiene una imagen confirmada.'))
          return
        }
        alProgresar(100)
        resolve({ secure_url: body.secure_url, public_id: body.public_id })
      }
      const form = new FormData()
      form.set('restaurante_id', restauranteId)
      form.set('archivo', archivo, archivo.name)
      request.send(form)
    })
  })
}

export async function eliminarImagenProducto(publicId: string): Promise<string | null> {
  const { data, error } = await supabase.functions.invoke('cloudinary-producto', {
    body: { accion: 'eliminar', public_id: publicId },
  })
  if (error) {
    const contexto = await error.context?.json?.().catch(() => null) as { error?: string } | null
    return contexto?.error ?? 'Cloudinary no confirmó la limpieza de una imagen anterior.'
  }
  if (!(data as { eliminada?: boolean } | null)?.eliminada) {
    return 'Cloudinary no confirmó la limpieza de una imagen anterior.'
  }
  return null
}
