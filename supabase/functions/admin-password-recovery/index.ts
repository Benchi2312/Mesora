import { createClient } from '@supabase/supabase-js'

type Profile = {
  id: string
  rol: string
  activo: boolean | null
  email: string | null
  correo_recuperacion: string | null
  correo_recuperacion_verificado: boolean | null
}

const URL = Deno.env.get('SUPABASE_URL') ?? ''
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const RESEND_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const FROM_EMAIL = Deno.env.get('MESORA_AUTH_FROM_EMAIL') ?? ''
const EMAIL_API_URL = Deno.env.get('MESORA_EMAIL_API_URL') ?? 'https://api.resend.com/emails'
const SITE_URL = (Deno.env.get('MESORA_SITE_URL') ?? 'https://mesoraapp.vercel.app').replace(/\/$/, '')
const RESET_URL = `${SITE_URL}/restablecer`
const GENERIC_RESET = 'Si corresponde a una cuenta de administrador activa, enviaremos instrucciones al correo de recuperación configurado.'

const ORIGINS = new Set([
  SITE_URL,
  'https://mesoraapp.vercel.app',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  ...(Deno.env.get('MESORA_EXTRA_ALLOWED_ORIGINS') ?? '').split(',').map((x) => x.trim()).filter(Boolean),
])

const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function corsHeaders(req: Request) {
  const origin = req.headers.get('origin') ?? ''
  return {
    ...(ORIGINS.has(origin) ? { 'Access-Control-Allow-Origin': origin } : {}),
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  }
}

function json(req: Request, status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}

function makeToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function hashToken(token: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]!)
}

function client(requestUrl: string, key: string) {
  return createClient(requestUrl, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

async function sendEmail(to: string, subject: string, text: string, href: string) {
  if (!RESEND_KEY || !FROM_EMAIL) return false
  const safeHref = escapeHtml(href)
  const response = await fetch(EMAIL_API_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: [to],
      subject,
      text: `${text}\n\n${href}\n\nSi no solicitaste este mensaje, puedes ignorarlo.`,
      html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#1b1b1b"><h1 style="color:#f28c00">Mesora</h1><p>${escapeHtml(text)}</p><p><a href="${safeHref}" style="display:inline-block;background:#f28c00;color:#111;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold">Continuar</a></p><p style="font-size:12px;color:#666">Si no solicitaste este mensaje, puedes ignorarlo.</p></div>`,
    }),
  })
  await response.body?.cancel()
  return response.ok
}

async function profileByEmail(admin: ReturnType<typeof client>, email: string) {
  const columns = 'id, rol, activo, email, correo_recuperacion, correo_recuperacion_verificado'
  const { data: byLogin, error: loginError } = await admin
    .from('usuarios').select(columns).eq('email', email).maybeSingle()
  if (loginError) throw loginError
  if (byLogin) return byLogin as Profile
  const { data: byRecovery, error: recoveryError } = await admin
    .from('usuarios').select(columns).eq('correo_recuperacion', email).maybeSingle()
  if (recoveryError) throw recoveryError
  return (byRecovery as Profile | null) ?? null
}

async function profileForSession(admin: ReturnType<typeof client>, request: Request) {
  const authorization = request.headers.get('authorization') ?? ''
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1]
  if (!token) return { error: 'Se requiere una sesión válida.' as const }
  const { data: authData, error: authError } = await admin.auth.getUser(token)
  if (authError || !authData.user) return { error: 'La sesión venció. Inicia sesión de nuevo.' as const }
  const { data: profile, error } = await admin
    .from('usuarios')
    .select('id, rol, activo, email, correo_recuperacion, correo_recuperacion_verificado')
    .eq('id', authData.user.id)
    .maybeSingle()
  if (error) throw error
  if (!profile || profile.rol !== 'admin_restaurante' || profile.activo !== true) {
    return { error: 'Solo un administrador activo del restaurante puede configurar este correo.' as const }
  }
  return { profile: profile as Profile }
}

async function sendLoginEmailReset(admin: ReturnType<typeof client>, profile: Profile) {
  if (!ANON_KEY) return false
  const { data: authData, error: userError } = await admin.auth.admin.getUserById(profile.id)
  const email = authData.user?.email
  if (userError || !email) return false
  const publicClient = client(URL, ANON_KEY)
  const { error } = await publicClient.auth.resetPasswordForEmail(email, { redirectTo: RESET_URL })
  return !error
}

async function requestReset(req: Request, admin: ReturnType<typeof client>, body: Record<string, unknown>) {
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  if (email.length > 254 || !EMAIL_OK.test(email)) return json(req, 400, { error: 'Escribe un correo válido.' })

  let profile: Profile | null = null
  try {
    profile = await profileByEmail(admin, email)
  } catch {
    return json(req, 503, { error: 'No se pudo procesar la solicitud. Intenta más tarde.' })
  }

  if (!profile || profile.activo !== true) return json(req, 200, { message: GENERIC_RESET })
  if (!['admin_restaurante', 'super_admin'].includes(profile.rol)) {
    return json(req, 200, { message: GENERIC_RESET })
  }

  const { data: allowed, error: rateError } = await admin.rpc('mesora_recovery_can_send', {
    p_usuario_id: profile.id,
    p_accion: 'recuperar_password',
  })
  if (rateError || !allowed) return json(req, 200, { message: GENERIC_RESET })

  if (profile.rol === 'admin_restaurante' && profile.correo_recuperacion_verificado && profile.correo_recuperacion) {
    if (!RESEND_KEY || !FROM_EMAIL) return json(req, 200, { message: GENERIC_RESET })
    const { data: authData, error: userError } = await admin.auth.admin.getUserById(profile.id)
    if (userError || !authData.user?.email) return json(req, 200, { message: GENERIC_RESET })
    const { data: generated, error: linkError } = await admin.auth.admin.generateLink({
      type: 'recovery',
      email: authData.user.email,
      options: { redirectTo: RESET_URL },
    })
    const link = generated?.properties?.action_link
    if (linkError || !link) return json(req, 200, { message: GENERIC_RESET })
    const sent = await sendEmail(
      profile.correo_recuperacion,
      'Restablece tu contraseña de Mesora',
      'Recibimos una solicitud para cambiar la contraseña de tu cuenta de administrador.',
      link,
    ).catch(() => false)
    if (!sent) return json(req, 200, { message: GENERIC_RESET })
    return json(req, 200, { message: GENERIC_RESET })
  }

  // Conserva el flujo estándar de Supabase mientras el administrador aún no
  // registra un correo alternativo verificado. Para otros roles no se envía.
  const sent = await sendLoginEmailReset(admin, profile).catch(() => false)
  if (!sent) return json(req, 200, { message: GENERIC_RESET })
  return json(req, 200, { message: GENERIC_RESET })
}

async function startEmailVerification(req: Request, admin: ReturnType<typeof client>, body: Record<string, unknown>) {
  const session = await profileForSession(admin, req)
  if (!session.profile) return json(req, 401, { error: session.error })
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  if (email.length > 254 || !EMAIL_OK.test(email) || email.endsWith('.invalid')) {
    return json(req, 400, { error: 'Ingresa un correo real y válido para recuperar tu cuenta.' })
  }
  if (!RESEND_KEY || !FROM_EMAIL) {
    return json(req, 503, { error: 'La verificación por correo aún no está habilitada. Contacta al propietario de Mesora.' })
  }

  const { data: duplicate, error: duplicateError } = await admin
    .from('usuarios').select('id').eq('correo_recuperacion', email).neq('id', session.profile.id).maybeSingle()
  if (duplicateError) return json(req, 503, { error: 'No se pudo verificar el correo. Intenta más tarde.' })
  if (duplicate) return json(req, 409, { error: 'Ese correo ya está asociado a otra cuenta.' })

  const { data: allowed, error: rateError } = await admin.rpc('mesora_recovery_can_send', {
    p_usuario_id: session.profile.id,
    p_accion: 'verificar_correo',
  })
  if (rateError || !allowed) return json(req, 429, { error: 'Espera un minuto antes de solicitar otro enlace.' })

  const token = makeToken()
  const tokenHash = await hashToken(token)
  const expiry = new Date(Date.now() + 30 * 60 * 1000).toISOString()
  const { error: storeError } = await admin.rpc('mesora_recovery_store_token', {
    p_usuario_id: session.profile.id,
    p_correo: email,
    p_token_hash: tokenHash,
    p_expira_en: expiry,
  })
  if (storeError) return json(req, 503, { error: 'No se pudo preparar la verificación. Intenta más tarde.' })

  // El fragmento no se envía al servidor web ni queda en logs HTTP del hosting.
  const link = `${SITE_URL}/verificar-correo-recuperacion#token=${token}`
  const sent = await sendEmail(
    email,
    'Verifica tu correo de recuperación de Mesora',
    'Confirma que puedes recibir correos en esta dirección. El enlace vence en 30 minutos.',
    link,
  ).catch(() => false)
  if (!sent) return json(req, 503, { error: 'El correo de verificación no pudo enviarse. Contacta al propietario de Mesora.' })
  return json(req, 200, { message: 'Te enviamos un enlace. Ábrelo en este dispositivo para confirmar el correo.' })
}

async function confirmEmailVerification(req: Request, admin: ReturnType<typeof client>, body: Record<string, unknown>) {
  const token = typeof body.token === 'string' ? body.token.trim() : ''
  if (!/^[a-f0-9]{64}$/i.test(token)) return json(req, 400, { error: 'El enlace no es válido o ya venció.' })
  const tokenHash = await hashToken(token)
  const { data: consumed, error: consumeError } = await admin.rpc('mesora_recovery_consume_token', {
    p_token_hash: tokenHash,
  })
  const item = Array.isArray(consumed) ? consumed[0] : consumed
  if (consumeError || !item?.usuario_id || !item?.correo) {
    return json(req, 400, { error: 'El enlace no es válido o ya venció. Solicita otro desde tu cuenta.' })
  }

  const { data: profile, error: profileError } = await admin
    .from('usuarios').select('id, rol, activo').eq('id', item.usuario_id).maybeSingle()
  if (profileError || !profile || profile.rol !== 'admin_restaurante' || profile.activo !== true) {
    return json(req, 400, { error: 'La cuenta ya no está habilitada para verificar este correo.' })
  }

  const { error: updateError } = await admin.from('usuarios').update({
    correo_recuperacion: item.correo,
    correo_recuperacion_verificado: true,
  }).eq('id', item.usuario_id)
  if (updateError) return json(req, 409, { error: 'No se pudo guardar ese correo. Puede que ya esté asignado a otra cuenta.' })

  try {
    await admin.rpc('registrar_auditoria', {
      p_actor_id: item.usuario_id,
      p_accion: 'admin_correo_recuperacion_verificado',
      p_entidad: 'usuario',
      p_entidad_id: item.usuario_id,
      p_descripcion: 'Verificó un correo para recuperar la cuenta de administrador',
      p_detalle: {},
    })
  } catch {
    // La verificación no se revierte si la auditoría no responde.
  }
  return json(req, 200, { message: 'Correo de recuperación verificado correctamente.' })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  if (req.method !== 'POST') return json(req, 405, { error: 'Método no permitido.' })
  if (!URL || !SERVICE_KEY || !ANON_KEY) return json(req, 503, { error: 'La recuperación no está disponible en este momento.' })

  let body: Record<string, unknown>
  try {
    const parsed = await req.json()
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid')
    body = parsed as Record<string, unknown>
  } catch {
    return json(req, 400, { error: 'Solicitud inválida.' })
  }

  const admin = client(URL, SERVICE_KEY)
  try {
    switch (body.accion) {
      case 'solicitar': return await requestReset(req, admin, body)
      case 'iniciar_verificacion': return await startEmailVerification(req, admin, body)
      case 'confirmar_verificacion': return await confirmEmailVerification(req, admin, body)
      default: return json(req, 400, { error: 'Acción no válida.' })
    }
  } catch {
    return json(req, 500, { error: 'No se pudo completar la operación. Intenta de nuevo.' })
  }
})
