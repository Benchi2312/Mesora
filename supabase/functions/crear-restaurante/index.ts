// Alta de un restaurante con su administrador de cuenta.
//
// Es la ÚNICA puerta para crear:
//   * una fila en `public.restaurantes` (la RLS no da INSERT a nadie),
//   * un usuario de Supabase Auth (solo el Auth Admin API con service_role),
//   * la fila de perfil en `public.usuarios` con rol `admin_restaurante`.
//
// Seguridad:
//   * El platform de Supabase exige un JWT válido en la cabecera (verify_jwt).
//   * Acá además se verifica que ese usuario exista en `public.usuarios` con
//     rol `super_admin` y `activo = true`, usando el client de service_role
//     (único lugar donde vive esa clave: este backend, no el navegador).
//   * El rol sale de la base de datos, nunca del cuerpo del pedido: aunque el
//     front mande `rol: "super_admin"`, acá se ignora y se asigna
//     `admin_restaurante` siempre.

import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type Cuerpo = {
  nombre?: unknown
  ruc?: unknown
  direccion?: unknown
  telefono?: unknown
  email_contacto?: unknown
  suscripcion_activa?: unknown
  fecha_vencimiento?: unknown
  admin?: { nombre?: unknown; email?: unknown; password?: unknown }
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
      return json({ error: 'Solo el super administrador puede dar de alta restaurantes.' }, 403)
    }

    // 3 · Validación de la entrada.
    const cuerpo = (await req.json().catch(() => null)) as Cuerpo | null
    if (!cuerpo) return json({ error: 'Cuerpo inválido.' }, 400)

    const nombre = texto(cuerpo.nombre, 120)
    if (!nombre) return json({ error: 'El nombre del restaurante es obligatorio.' }, 400)

    const adminNombre = texto(cuerpo.admin?.nombre, 120)
    if (!adminNombre) return json({ error: 'El nombre del administrador es obligatorio.' }, 400)

    const email = texto(cuerpo.admin?.email, 160)?.toLowerCase()
    if (!email || !EMAIL_OK.test(email)) {
      return json({ error: 'Ingresa un correo válido para el administrador.' }, 400)
    }

    const password = typeof cuerpo.admin?.password === 'string' ? cuerpo.admin.password : ''
    if (password.length < 8) {
      return json({ error: 'La contraseña inicial debe tener al menos 8 caracteres.' }, 400)
    }

    let fechaVencimiento: string | null = null
    if (typeof cuerpo.fecha_vencimiento === 'string' && cuerpo.fecha_vencimiento.trim()) {
      const t = Date.parse(cuerpo.fecha_vencimiento)
      if (Number.isNaN(t)) return json({ error: 'La fecha de vencimiento no es válida.' }, 400)
      fechaVencimiento = new Date(t).toISOString()
    }

    // 4 · Cuenta de Auth (email ya confirmado: la app trabaja sin confirmación).
    const { data: creado, error: errAuth } = await servicio.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { nombre: adminNombre, creado_por: user.id },
    })
    if (errAuth || !creado.user) {
      const duplicado =
        errAuth?.code === 'email_exists' || /already (registered|exists)/i.test(errAuth?.message ?? '')
      if (duplicado) return json({ error: 'Ya existe una cuenta con ese correo.' }, 409)
      return json({ error: `No se pudo crear la cuenta: ${errAuth?.message ?? 'error desconocido'}` }, 400)
    }

    // 5 · El restaurante.
    const { data: restaurante, error: errRest } = await servicio
      .from('restaurantes')
      .insert({
        nombre,
        ruc: texto(cuerpo.ruc, 20),
        direccion: texto(cuerpo.direccion, 200),
        telefono: texto(cuerpo.telefono, 40),
        email_contacto: texto(cuerpo.email_contacto, 160),
        suscripcion_activa: cuerpo.suscripcion_activa !== false,
        fecha_vencimiento: fechaVencimiento,
      })
      .select('*')
      .single()
    if (errRest || !restaurante) {
      await servicio.auth.admin.deleteUser(creado.user.id).catch(() => {})
      return json({ error: `No se pudo crear el restaurante: ${errRest?.message ?? ''}` }, 400)
    }

    // 6 · El perfil del administrador: atado a ese restaurante y a ese rol.
    const { error: errPerfil } = await servicio.from('usuarios').insert({
      id: creado.user.id,
      restaurante_id: restaurante.id,
      rol: 'admin_restaurante',
      nombre: adminNombre,
      email,
      activo: true,
    })
    if (errPerfil) {
      // Se deshace lo hecho: no queda restaurante sin administrador ni cuenta suelta.
      await servicio.from('restaurantes').delete().eq('id', restaurante.id).catch(() => {})
      await servicio.auth.admin.deleteUser(creado.user.id).catch(() => {})
      return json({ error: `No se pudo crear el perfil: ${errPerfil.message}` }, 400)
    }

    // 7 · Auditoría append-only (RPC `registrar_auditoria`, grant solo service_role).
    const actorAuditoria = {
      nombreRestaurante: nombre,
      adminNombre,
    }
    await servicio.rpc('registrar_auditoria', {
      p_actor_id: user.id,
      p_accion: 'restaurante_crear',
      p_restaurante_id: restaurante.id,
      p_entidad: 'restaurante',
      p_entidad_id: restaurante.id,
      p_descripcion: `Creó el restaurante «${actorAuditoria.nombreRestaurante}»`,
      p_detalle: { nombre: actorAuditoria.nombreRestaurante },
    })
    await servicio.rpc('registrar_auditoria', {
      p_actor_id: user.id,
      p_accion: 'administrador_crear',
      p_restaurante_id: restaurante.id,
      p_entidad: 'usuario',
      p_entidad_id: creado.user.id,
      p_descripcion: `Creó el administrador «${actorAuditoria.adminNombre}»`,
      p_detalle: { email },
    })

    return json(
      {
        restaurante,
        admin: {
          id: creado.user.id,
          nombre: adminNombre,
          email,
          rol: 'admin_restaurante',
          restaurante_id: restaurante.id,
          activo: true,
        },
      },
      200,
    )
  } catch {
    return json({ error: 'Error inesperado al crear el restaurante.' }, 500)
  }
})
