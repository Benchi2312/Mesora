// Restablecimiento de contraseña de un trabajador desde el panel del admin.
//
// El Admin del restaurante pierde la contraseña de un mesero/cocina/cajero:
// genera una contraseña temporal nueva, se la entrega en persona y el
// trabajador la cambia al entrar. El navegador NUNCA manda la contraseña:
// la genera el servidor.
//
// Seguridad:
//   * Requiere un JWT válido (verify_jwt del platform).
//   * Solo un `admin_restaurante` activo puede invocarla.
//   * Solo puede restablecer la contraseña de SU propio personal: el
//     `restaurante_id` sale de la base, nunca del cuerpo.
//   * Nunca a otro `admin_restaurante` ni a sí mismo.
//   * La contraseña se devuelve UNA sola vez (aquí); no se guarda en la base
//     ni en la auditoría.

import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type Cuerpo = { trabajador_id?: unknown }

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })

const texto = (v: unknown, max = 200): string | null =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null

/**
 * Contraseña temporal de 12 caracteres.
 *
 * Bytes aleatorios de `crypto.getRandomValues` codificados en base64url (los
 * dos caracteres del base64 estándar que no son URL-safe se sustituyen) y
 * recortados a la longitud pedida. No es una palabra: no se puede adivinar
 * por diccionario, y solo la ve el Admin una vez.
 */
function generarPasswordTemporal(longitud = 12): string {
  // 3 bytes dan 4 caracteres base64: se piden de más y se recorta.
  const bytes = new Uint8Array(Math.ceil((longitud * 4) / 3) + 3)
  crypto.getRandomValues(bytes)
  let binario = ''
  for (const b of bytes) binario += String.fromCharCode(b)
  const base64url = btoa(binario).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return base64url.slice(0, longitud)
}

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
      return json(
        { error: 'Solo un administrador de restaurante activo puede restablecer contraseñas.' },
        403,
      )
    }
    const rid = llamador.restaurante_id
    if (!rid) return json({ error: 'El administrador no tiene restaurante asignado.' }, 403)

    // 3 — A quién se le restablece.
    const cuerpo = (await req.json().catch(() => null)) as Cuerpo | null
    if (!cuerpo) return json({ error: 'Cuerpo inválido.' }, 400)

    const trabajadorId = texto(cuerpo.trabajador_id, 64)
    if (!trabajadorId) return json({ error: 'Falta el trabajador a resetting.' }, 400)

    const { data: trabajador } = await servicio
      .from('usuarios')
      .select('id, nombre, rol, restaurante_id, email')
      .eq('id', trabajadorId)
      .maybeSingle()
    if (!trabajador) return json({ error: 'El usuario no existe.' }, 400)

    // 4 — Reglas: es de SU restaurante, no es él mismo y no es otro admin.
    if (trabajador.restaurante_id !== rid) {
      return json({ error: 'Ese usuario pertenece a otro restaurante.' }, 403)
    }
    if (trabajador.id === user.id) {
      return json({ error: 'No puedes restablecer tu propia contraseña.' }, 400)
    }
    if (trabajador.rol === 'admin_restaurante') {
      return json(
        { error: 'No se puede restablecer la contraseña de otro administrador.' },
        400,
      )
    }

    // 5 — Contraseña nueva + cierre de las sesiones activas del trabajador.
    const password = generarPasswordTemporal(12)

    const { error: errAuth } = await servicio.auth.admin.updateUserById(trabajador.id, {
      password,
    })
    if (errAuth) {
      return json(
        { error: `No se pudo cambiar la contraseña: ${errAuth.message ?? 'error desconocido'}` },
        400,
      )
    }

    // Revocar las sesiones del trabajador (best-effort): la contraseña ya
    // cambió, así que un fallo acá no debe convertir un reset exitoso en un
    // error para el Admin.
    try {
      await servicio.auth.admin.signOut(trabajador.id, 'global')
    } catch {
      // Sin sesiones revocadas: el usuario puede tener que volver a entrar.
    }

    // 6 — Queda marcado para cambiar la contraseña al entrar.
    const { error: errFlag } = await servicio
      .from('usuarios')
      .update({ debe_cambiar_password: true })
      .eq('id', trabajador.id)
    if (errFlag) {
      return json(
        {
          error: `La contraseña se restableció, pero no se pudo marcar el cambio obligatorio: ${errFlag.message}`,
          password_temporal: password,
        },
        500,
      )
    }

    // 7 — Auditoría append-only (best-effort). SIN la contraseña: en el
    // detalle solo va el rol del trabajador.
    try {
      await servicio.rpc('registrar_auditoria', {
        p_actor_id: user.id,
        p_accion: 'usuario_password_reset',
        p_restaurante_id: rid,
        p_entidad: 'usuario',
        p_entidad_id: trabajador.id,
        p_descripcion: `Restableció la contraseña del ${trabajador.rol} ${trabajador.nombre}`,
        p_detalle: { rol: trabajador.rol },
      })
    } catch {
      // La auditoría no debe romper el reset.
    }

    return json({ password_temporal: password }, 200)
  } catch {
    return json({ error: 'Error inesperado al restablecer la contraseña.' }, 500)
  }
})
