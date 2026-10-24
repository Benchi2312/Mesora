// Alta de personal desde el panel del administrador de restaurante.
//
// Crea la cuenta de Supabase Auth (con service_role, solo en el backend) y la
// fila de perfil en `public.usuarios`, de forma coordinada.
//
// Seguridad:
//   * Requiere un JWT válido (verify_jwt del platform).
//   * Solo un `admin_restaurante` activo puede invocarla.
//   * Solo puede crear usuarios para SU propio `restaurante_id` (nunca del cuerpo).
//   * Roles permitidos: mesero, cocina, cajero. Nunca `super_admin` ni otro
//     `admin_restaurante`.
//   * Si falla la inserción del perfil, se elimina la cuenta Auth recién creada
//     (no quedan cuentas huérfanas).

import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const ROLES_PERMITIDOS = ['mesero', 'cocina', 'cajero']

type Cuerpo = { nombre?: unknown; email?: unknown; password?: unknown; rol?: unknown }

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

    // 1 — Quién llama: JWT contra Auth.
    const publico = createClient(url, anonKey, {
      global: { headers: { Authorization: cabecera } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const {
      data: { user },
      error: errUser,
    } = await publico.auth.getUser()
    if (errUser || !user) return json({ error: 'Sesión inválida o expirada.' }, 401)

    // 2 — Debe ser un admin_restaurante activo; su restaurante sale de la base.
    const servicio = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data: llamador } = await servicio
      .from('usuarios')
      .select('rol, activo, restaurante_id')
      .eq('id', user.id)
      .maybeSingle()
    if (!llamador || llamador.activo !== true || llamador.rol !== 'admin_restaurante') {
      return json({ error: 'Solo un administrador de restaurante activo puede dar de alta personal.' }, 403)
    }
    const rid = llamador.restaurante_id
    if (!rid) return json({ error: 'El administrador no tiene restaurante asignado.' }, 403)

    // 3 — Validación de la entrada.
    const cuerpo = (await req.json().catch(() => null)) as Cuerpo | null
    if (!cuerpo) return json({ error: 'Cuerpo inválido.' }, 400)

    const nombre = texto(cuerpo.nombre, 120)
    if (!nombre) return json({ error: 'El nombre del usuario es obligatorio.' }, 400)

    const email = texto(cuerpo.email, 160)?.toLowerCase()
    if (!email || !EMAIL_OK.test(email)) return json({ error: 'Ingresá un correo válido.' }, 400)

    const password = typeof cuerpo.password === 'string' ? cuerpo.password : ''
    if (password.length < 8) {
      return json({ error: 'La contraseña inicial debe tener al menos 8 caracteres.' }, 400)
    }

    const rol = texto(cuerpo.rol, 40)
    if (!rol || !ROLES_PERMITIDOS.includes(rol)) {
      return json({ error: 'Rol no permitido. Solo se permite mesero, cocina o cajero.' }, 400)
    }

    // 4 — Cuenta de Auth (correo ya confirmado: la app trabaja sin confirmación).
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

    // 5 — El perfil: atado SIEMPRE al restaurante del llamador.
    const { data: perfil, error: errPerfil } = await servicio
      .from('usuarios')
      .insert({
        id: creado.user.id,
        restaurante_id: rid,
        rol,
        nombre,
        email,
        activo: true,
      })
      .select('id, nombre, email, rol, restaurante_id, activo')
      .single()
    if (errPerfil || !perfil) {
      await servicio.auth.admin.deleteUser(creado.user.id).catch(() => {})
      return json({ error: `No se pudo crear el perfil: ${errPerfil?.message ?? ''}` }, 400)
    }

    // 6 — Auditoría append-only (best-effort).
    try {
      await servicio.rpc('registrar_auditoria', {
        p_actor_id: user.id,
        p_accion: 'usuario_crear',
        p_restaurante_id: rid,
        p_entidad: 'usuario',
        p_entidad_id: creado.user.id,
        p_descripcion: `Dio de alta al ${rol} ${nombre}`,
        p_detalle: { email },
      })
    } catch {
      // La auditoría no debe romper el alta.
    }

    return json({ usuario: perfil }, 200)
  } catch {
    return json({ error: 'Error inesperado al crear el personal.' }, 500)
  }
})
