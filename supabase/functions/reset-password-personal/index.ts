import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type Cuerpo = { trabajador_id?: unknown; password_temporal?: unknown }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...CORS, 'Content-Type': 'application/json' },
})

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Método no permitido.' }, 405)

  try {
    const url = Deno.env.get('SUPABASE_URL')
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
      ?? Deno.env.get('SUPABASE_SECRET')
      ?? (() => {
        try { return JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}')['default'] ?? '' } catch { return '' }
      })()
    const authorization = req.headers.get('Authorization')
    if (!url || !anonKey || !serviceKey) return json({ error: 'Entorno de la función incompleto.' }, 500)
    if (!authorization) return json({ error: 'Inicia sesión para restablecer la contraseña.' }, 401)

    const usuarioApi = createClient(url, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data: { user }, error: errorAuth } = await usuarioApi.auth.getUser()
    if (errorAuth || !user) return json({ error: 'La sesión expiró. Inicia sesión de nuevo.' }, 401)

    const servicio = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data: actor } = await servicio.from('usuarios')
      .select('id, rol, activo, restaurante_id')
      .eq('id', user.id).maybeSingle()
    if (!actor || actor.activo !== true || actor.rol !== 'admin_restaurante' || !actor.restaurante_id) {
      return json({ error: 'Solo un administrador activo puede restablecer contraseñas de su personal.' }, 403)
    }

    const cuerpo = await req.json().catch(() => null) as Cuerpo | null
    const trabajadorId = typeof cuerpo?.trabajador_id === 'string' ? cuerpo.trabajador_id.trim() : ''
    const passwordTemporal = typeof cuerpo?.password_temporal === 'string' ? cuerpo.password_temporal : ''
    if (!trabajadorId) return json({ error: 'Indica el trabajador.' }, 400)
    if (passwordTemporal.length < 10 || passwordTemporal.length > 128 || !passwordTemporal.trim()) {
      return json({ error: 'La clave temporal debe tener entre 10 y 128 caracteres.' }, 400)
    }

    const { data: trabajador } = await servicio.from('usuarios')
      .select('id, nombre, rol, restaurante_id, activo')
      .eq('id', trabajadorId).maybeSingle()
    if (!trabajador) return json({ error: 'No se encontró al trabajador.' }, 404)
    if (trabajador.restaurante_id !== actor.restaurante_id) {
      return json({ error: 'Ese usuario pertenece a otro restaurante.' }, 404)
    }
    if (!['mesero', 'cocina', 'cajero'].includes(trabajador.rol)) {
      return json({ error: 'Solo puedes restablecer la clave de un mesero, cocina o cajero.' }, 400)
    }
    if (trabajador.id === user.id) return json({ error: 'No puedes restablecer tu propia contraseña.' }, 400)
    if (trabajador.activo !== true) return json({ error: 'Reactiva el acceso del trabajador antes de cambiar su contraseña.' }, 409)

    // Marca el flujo antes de tocar Auth. Hasta que Auth y auditoría se
    // confirmen, el trabajador no puede levantar esta barrera por RPC.
    const { error: errorPreparar } = await servicio.rpc('mesora_preparar_reset_password_personal', {
      p_usuario_id: trabajador.id,
    })
    if (errorPreparar) return json({ error: 'No se pudo preparar el cambio de clave. Inténtalo de nuevo.' }, 500)

    const { error: errorCambio } = await servicio.auth.admin.updateUserById(trabajador.id, {
      password: passwordTemporal,
    })
    if (errorCambio) {
      await servicio.rpc('mesora_cancelar_reset_password_personal', { p_usuario_id: trabajador.id })
      return json({ error: 'Auth no aceptó la clave. Revisa sus requisitos e inténtalo de nuevo; la cuenta sigue protegida.' }, 400)
    }

    await servicio.auth.admin.signOut(trabajador.id, 'global').catch(() => undefined)
    const { error: errorFinalizar } = await servicio.rpc('mesora_finalizar_reset_password_personal', {
      p_usuario_id: trabajador.id,
      p_actor_id: user.id,
    })
    if (errorFinalizar) {
      return json({ error: 'La clave cambió, pero falta completar la protección y auditoría. Vuelve a restablecerla.' }, 500)
    }

    // Nunca devolver ni registrar la clave; el admin debe entregarla en persona.
    return json({ ok: true })
  } catch {
    return json({ error: 'No se pudo cambiar la clave. Actualiza el listado antes de volver a intentarlo.' }, 500)
  }
})
