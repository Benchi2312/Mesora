import { createClient } from 'npm:@supabase/supabase-js@2'
import { crearHandlerCloudinary } from './handler.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const CLOUD_NAME = Deno.env.get('CLOUDINARY_CLOUD_NAME') ?? ''
const CLOUD_API_KEY = Deno.env.get('CLOUDINARY_API_KEY') ?? ''
const CLOUD_API_SECRET = Deno.env.get('CLOUDINARY_API_SECRET') ?? ''
const CLOUD_FOLDER = Deno.env.get('CLOUDINARY_FOLDER') ?? ''

function firmaCloudinary(parametros: Record<string, string>): Promise<string> {
  const texto = Object.keys(parametros)
    .sort()
    .map((clave) => `${clave}=${parametros[clave]}`)
    .join('&') + CLOUD_API_SECRET
  return crypto.subtle.digest('SHA-1', new TextEncoder().encode(texto)).then((hash) =>
    Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join(''),
  )
}

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
    const parametros = { folder: CLOUD_FOLDER, public_id: publicId, timestamp }
    const signature = await firmaCloudinary(parametros)
    const body = new FormData()
    body.set('file', archivo, archivo.name)
    body.set('api_key', CLOUD_API_KEY)
    body.set('timestamp', timestamp)
    body.set('folder', CLOUD_FOLDER)
    body.set('public_id', publicId)
    body.set('signature', signature)
    const response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(CLOUD_NAME)}/image/upload`, {
      method: 'POST',
      body,
    })
    const result = await response.json().catch(() => null) as { secure_url?: unknown; public_id?: unknown } | null
    if (!response.ok || typeof result?.secure_url !== 'string' || typeof result.public_id !== 'string') {
      throw new Error('Cloudinary rechazó la carga.')
    }
    return { secureUrl: result.secure_url, publicId: result.public_id }
  },
  async eliminarImagen(publicId) {
    if (!dependenciasConfiguradas()) throw new Error('Cloudinary no está configurado.')
    const timestamp = Math.floor(Date.now() / 1000).toString()
    const parametros = { invalidate: 'true', public_id: publicId, timestamp }
    const signature = await firmaCloudinary(parametros)
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
