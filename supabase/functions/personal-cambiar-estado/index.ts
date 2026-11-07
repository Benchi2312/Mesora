import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type Cuerpo = { usuario_id?: unknown; activo?: unknown; motivo?: unknown }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...CORS, 'Content-Type': 'application/json' },
})
const motivoTexto = (valor: unknown) => typeof valor === 'string' ? valor.trim().slice(0, 240) : ''

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
    if (!authorization) return json({ error: 'Inicia sesión para gestionar el acceso.' }, 401)

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
    if (!actor || actor.rol !== 'admin_restaurante' || actor.activo !== true || !actor.restaurante_id) {
      return json({ error: 'Solo un administrador activo puede gestionar el personal de su restaurante.' }, 403)
    }

    const cuerpo = await req.json().catch(() => null) as Cuerpo | null
    if (!cuerpo || typeof cuerpo.usuario_id !== 'string' || typeof cuerpo.activo !== 'boolean') {
      return json({ error: 'Indica el usuario y el estado nuevo.' }, 400)
    }
    const usuarioId = cuerpo.usuario_id.trim()
    if (!usuarioId) return json({ error: 'Indica el usuario que deseas cambiar.' }, 400)
    if (usuarioId === user.id) return json({ error: 'No puedes desactivar tu propio acceso.' }, 400)

    const { data: objetivo } = await servicio.from('usuarios')
      .select('id, nombre, email, rol, activo, restaurante_id')
      .eq('id', usuarioId).maybeSingle()
    if (!objetivo || objetivo.restaurante_id !== actor.restaurante_id || !['mesero', 'cocina', 'cajero', 'admin_restaurante'].includes(objetivo.rol)) {
      return json({ error: 'Ese usuario no pertenece a tu restaurante.' }, 404)
    }
    if ((objetivo.activo !== false) === cuerpo.activo) {
      return json({ error: 'El acceso ya tiene ese estado. Actualiza la lista.' }, 409)
    }

    // Bloquear Auth primero al desactivar: nuevas sesiones no podrán iniciarse
    // mientras la RPC registra el cambio en la misma transacción que su auditoría.
    if (!cuerpo.activo) {
      const { error } = await servicio.auth.admin.updateUserById(usuarioId, { ban_duration: '876000h' })
      if (error) return json({ error: 'No se pudo bloquear el acceso. No se cambió el estado del perfil.' }, 502)
    }

    const { data: perfil, error: errorCambio } = await servicio.rpc('admin_cambiar_estado_personal', {
      p_actor_id: user.id,
      p_usuario_id: usuarioId,
      p_activo: cuerpo.activo,
      p_motivo: motivoTexto(cuerpo.motivo) || null,
    })
    if (errorCambio || !perfil) {
      if (!cuerpo.activo) {
        await servicio.auth.admin.updateUserById(usuarioId, { ban_duration: 'none' })
      }
      return json({ error: errorCambio?.message ?? 'No se pudo guardar el cambio de acceso.' }, 409)
    }

    if (cuerpo.activo) {
      const { error } = await servicio.auth.admin.updateUserById(usuarioId, { ban_duration: 'none' })
      if (error) {
        // Compensa en base si Auth no pudo habilitar la cuenta; se mantiene
        // bloqueada, en vez de mostrar un acceso activo que no inicia sesión.
        await servicio.rpc('admin_cambiar_estado_personal', {
          p_actor_id: user.id,
          p_usuario_id: usuarioId,
          p_activo: false,
          p_motivo: 'Compensación: Auth no pudo reactivar la cuenta.',
        })
        return json({ error: 'El perfil quedó protegido, pero no se pudo reactivar el inicio de sesión. Inténtalo de nuevo.' }, 502)
      }
    } else {
      // El ban impide nuevas sesiones; la revocación elimina la posibilidad
      // de refrescar sesiones antiguas. Los RPC operativos también verifican activo.
      await servicio.auth.admin.signOut(usuarioId, 'global').catch(() => undefined)
    }

    const usuario = Array.isArray(perfil) ? perfil[0] : perfil
    return json({ usuario: { id: usuario.id, nombre: usuario.nombre, email: usuario.email, activo: usuario.activo, rol: usuario.rol } })
  } catch {
    return json({ error: 'No se pudo cambiar el acceso. Actualiza el listado antes de volver a intentarlo.' }, 500)
  }
})
