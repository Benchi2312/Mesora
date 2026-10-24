// Alta de un usuario de la plataforma desde el panel del super admin.
//
// Es la ÚNICA puerta para crear:
//   * un usuario de Supabase Auth (solo el Auth Admin API con service_role),
//   * la fila de perfil en `public.usuarios` atada a SU restaurante.
//
// Seguridad (espejo de `crear-restaurante`):
//   * El platform de Supabase exige un JWT válido en la cabecera (verify_jwt).
//   * Además se verifica que ese usuario exista en `public.usuarios` con rol
//     `super_admin` y `activo = true`, usando el client de service_role (único
//     lugar donde vive esa clave: este backend, no el navegador).
//   * El rol viene del cuerpo PERO se valida contra la lista blanca del
//     proyecto: nunca `super_admin`. Un super admin de plataforma no se crea
//     desde un formulario; eso lo define la base.
//
// Si el perfil no se puede insertar, la cuenta de Auth creada se elimina
// (rollback): no quedan cuentas sueltas sin fila en `usuarios`.

import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const ROLES_OK = ['admin_restaurante', 'mesero', 'cocina', 'cajero']

type Cuerpo = {
  nombre?: unknown
  email?: unknown
  password?: unknown
  rol?: unknown
  restaurante_id?: unknown
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })

const texto = (v: unknown, max = 200): string | null =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Método no permitido.' }, 405)

  try {
    const url = Deno.env.get('SUPABASE_URL')
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const serviceKey =
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ??
      Deno.env.get('SUPABASE_SECRET') ??
      (() => {
        // Forma nueva: diccionario {"default": "sb_secret_..."}.
        try {
          return JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}')['default'] ?? ''
        } catch {
          return ''
        }
      })()
    if (!url || !anonKey) return json({ error: 'Entorno de la función incompleto.' }, 500)
    if (!serviceKey) {
      return json(
        { error: 'Falta el secreto SUPABASE_SERVICE_ROLE_KEY. Ejecutá `supabase secrets set`.' },
        500,
      )
    }

    const cabecera = req.headers.get('Authorization')
    if (!cabecera) return json({ error: 'Sesión requerida.' }, 401)

    // 1 · Quién llama: valida el JWT contra Auth (sin tocar la service_role).
    const publico = createClient(url, anonKey, {
      global: { headers: { Authorization: cabecera } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const {
      data: { user },
      error: errUser,
    } = await publico.auth.getUser()
    if (errUser || !user) return json({ error: 'Sesión inválida o expirada.' }, 401)

    // 2 · ¿Es super_admin? El rol lo decide la base, no el front.
    const servicio = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data: perfil } = await servicio
      .from('usuarios')
      .select('rol, activo')
      .eq('id', user.id)
      .maybeSingle()
    if (!perfil || perfil.rol !== 'super_admin' || perfil.activo !== true) {
      return json({ error: 'Solo el super administrador puede dar de alta usuarios.' }, 403)
    }

    // 3 · Validación de la entrada.
    const cuerpo = (await req.json().catch(() => null)) as Cuerpo | null
    if (!cuerpo) return json({ error: 'Cuerpo inválido.' }, 400)

    const nombre = texto(cuerpo.nombre, 120)
    if (!nombre) return json({ error: 'El nombre del usuario es obligatorio.' }, 400)

    const email = texto(cuerpo.email, 160)?.toLowerCase()
    if (!email || !EMAIL_OK.test(email)) {
      return json({ error: 'Ingresa un correo válido.' }, 400)
    }

    const password = typeof cuerpo.password === 'string' ? cuerpo.password : ''
    if (password.length < 8) {
      return json({ error: 'La contraseña inicial debe tener al menos 8 caracteres.' }, 400)
    }

    const rol = texto(cuerpo.rol, 40)
    if (rol === 'super_admin') {
      return json({ error: 'No se puede crear un super administrador desde el panel.' }, 400)
    }
    if (!rol || !ROLES_OK.includes(rol)) {
      return json({ error: 'Rol no permitido.' }, 400)
    }

    const restauranteId = texto(cuerpo.restaurante_id, 60)
    if (!restauranteId) {
      return json({ error: 'Elegí el restaurante al que pertenece el usuario.' }, 400)
    }
    const { data: restaurante } = await servicio
      .from('restaurantes')
      .select('id')
      .eq('id', restauranteId)
      .maybeSingle()
    if (!restaurante) return json({ error: 'Restaurante no encontrado.' }, 400)

    // 4 · Cuenta de Auth (email ya confirmado: la app trabaja sin confirmación).
    const { data: creado, error: errAuth } = await servicio.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { nombre, creado_por: user.id },
    })
    if (errAuth || !creado.user) {
      const duplicado =
        errAuth?.code === 'email_exists' || /already (registered|exists)/i.test(errAuth?.message ?? '')
      if (duplicado) return json({ error: 'Ya existe una cuenta con ese correo.' }, 409)
      return json({ error: `No se pudo crear la cuenta: ${errAuth?.message ?? 'error desconocido'}` }, 400)
    }

    // 5 · El perfil: atado a SU restaurante y al rol validado.
    const { data: perfilCreado, error: errPerfil } = await servicio
      .from('usuarios')
      .insert({
        id: creado.user.id,
        restaurante_id: restauranteId,
        rol,
        nombre,
        email,
        activo: true,
      })
      .select('id, nombre, email, rol, restaurante_id, activo, created_at')
      .single()
    if (errPerfil || !perfilCreado) {
      // Se deshace lo hecho: no queda cuenta de Auth sin perfil.
      await servicio.auth.admin.deleteUser(creado.user.id).catch(() => {})
      return json({ error: `No se pudo crear el perfil: ${errPerfil?.message ?? ''}` }, 400)
    }

    // 6 · Auditoría append-only (RPC `registrar_auditoria`, grant solo service_role).
    await servicio.rpc('registrar_auditoria', {
      p_actor_id: user.id,
      p_accion: rol === 'admin_restaurante' ? 'administrador_crear' : 'usuario_crear',
      p_restaurante_id: restauranteId,
      p_entidad: 'usuario',
      p_entidad_id: creado.user.id,
      p_descripcion:
        rol === 'admin_restaurante'
          ? `Dio de alta al administrador ${nombre}`
          : `Dio de alta al usuario ${nombre}`,
      p_detalle: { email },
    })

    return json({ usuario: perfilCreado }, 200)
  } catch {
    return json({ error: 'Error inesperado al crear el usuario.' }, 500)
  }
})
