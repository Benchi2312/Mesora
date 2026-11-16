import { createClient } from 'npm:@supabase/supabase-js@2'
import { crearHandlerCloudinary } from './handler.ts'
import { clasificarErrorCloudinary } from './cloudinaryErrors.ts'
import {
  formularioCargaCloudinary,
  firmarParametrosCloudinary,
  parametrosCargaCloudinary,
} from './cloudinaryFirma.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const CLOUD_NAME = Deno.env.get('CLOUDINARY_CLOUD_NAME') ?? ''
const CLOUD_API_KEY = Deno.env.get('CLOUDINARY_API_KEY') ?? ''
const CLOUD_API_SECRET = Deno.env.get('CLOUDINARY_API_SECRET') ?? ''
const CLOUD_FOLDER = Deno.env.get('CLOUDINARY_FOLDER') ?? ''

function dependenciasConfiguradas(): boolean {
  return Boolean(
    SUPABASE_URL && SUPABASE_ANON_KEY && SUPABASE_SERVICE_KEY && CLOUD_NAME &&
      CLOUD_API_KEY && CLOUD_API_SECRET && CLOUD_FOLDER === 'mesora/products',
  )
}

const handler = crearHandlerCloudinary({
  async usuarioDesdeRequest(request) {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null
    const authorization = request.headers.get('Authorization')
    if (!authorization) return null
    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data, error } = await client.auth.getUser()
    return error || !data.user ? null : { id: data.user.id }
  },
  async perfilDeUsuario(id) {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return null
    const service = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data, error } = await service
      .from('usuarios')
      .select('rol, activo, restaurante_id')
      .eq('id', id)
      .maybeSingle()
    return error || !data ? null : data
  },
  async imagenEstaEnUso(publicId) {
    const service = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { count, error } = await service
      .from('productos')
      .select('id', { count: 'exact', head: true })
      .eq('imagen_public_id', publicId)
    if (error) throw new Error('No se pudo comprobar si la imagen sigue vinculada.')
    return (count ?? 0) > 0
  },
  async subirImagen(archivo, restauranteId) {
    if (!dependenciasConfiguradas()) throw new Error('Cloudinary no está configurado.')
    const timestamp = Math.floor(Date.now() / 1000).toString()
    const publicId = `${restauranteId}_${crypto.randomUUID()}`
    const parametros = parametrosCargaCloudinary(CLOUD_FOLDER, publicId, timestamp)
    const signature = await firmarParametrosCloudinary(parametros, CLOUD_API_SECRET)
    const body = formularioCargaCloudinary(archivo, CLOUD_API_KEY, parametros, signature)
    const response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(CLOUD_NAME)}/image/upload`, {
      method: 'POST',
      body,
    })
    const result = await response.json().catch(() => null) as { secure_url?: unknown; public_id?: unknown; error?: unknown } | null
    if (!response.ok || typeof result?.secure_url !== 'string' || typeof result.public_id !== 'string') {
      const errorProveedor = result?.error
      const detalleProveedor = errorProveedor && typeof errorProveedor === 'object' && 'message' in errorProveedor &&
        typeof errorProveedor.message === 'string'
        ? errorProveedor.message
        : ''
      throw new Error(`CLOUDINARY_${clasificarErrorCloudinary(response.status, detalleProveedor)}`)
    }
    return { secureUrl: result.secure_url, publicId: result.public_id }
  },
  async eliminarImagen(publicId) {
    if (!dependenciasConfiguradas()) throw new Error('Cloudinary no está configurado.')
    const timestamp = Math.floor(Date.now() / 1000).toString()
    const parametros = { invalidate: 'true', public_id: publicId, timestamp }
    const signature = await firmarParametrosCloudinary(parametros, CLOUD_API_SECRET)
    const body = new FormData()
    body.set('public_id', publicId)
    body.set('timestamp', timestamp)
    body.set('invalidate', 'true')
    body.set('api_key', CLOUD_API_KEY)
    body.set('signature', signature)
    const response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(CLOUD_NAME)}/image/destroy`, {
      method: 'POST',
      body,
    })
    const result = await response.json().catch(() => null) as { result?: unknown } | null
    if (!response.ok || (result?.result !== 'ok' && result?.result !== 'not found')) {
      throw new Error('Cloudinary no confirmó la eliminación.')
    }
    return result.result === 'ok' ? 'ok' : 'not_found'
  },
})

Deno.serve(async (request) => {
  if (!dependenciasConfiguradas()) {
    return new Response(JSON.stringify({ error: 'La gestión segura de imágenes no está configurada en el servidor.' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
    })
  }
  return handler(request)
})
