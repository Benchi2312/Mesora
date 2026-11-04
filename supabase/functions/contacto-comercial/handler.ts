import { recordSystemIncident } from '../_shared/system-incidents.ts'
import { finishMailJob, mailRpc, sendMailJob } from '../_shared/mesora-mail.ts'
import type { MailJob } from '../_shared/mesora-mail.ts'

const SITE_URL = (Deno.env.get('MESORA_SITE_URL') ?? 'https://mesora-sistema.vercel.app').replace(/\/$/, '')
const ALLOWED_ORIGINS = new Set([
  SITE_URL,
  'https://mesora-sistema.vercel.app',
  'https://mesora-piloto.vercel.app',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  ...(Deno.env.get('MESORA_EXTRA_ALLOWED_ORIGINS') ?? '').split(',').map((value) => value.trim()).filter(Boolean),
])

const RESEND_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function cors(req: Request) {
  const origin = req.headers.get('origin') ?? ''
  return {
    ...(ALLOWED_ORIGINS.has(origin) ? { 'Access-Control-Allow-Origin': origin } : {}),
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  }
}

function json(req: Request, status: number, body: Record<string, unknown>, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(req), 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extraHeaders },
  })
}

async function keyedHash(value: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(RESEND_KEY), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

async function reserveContact(req: Request, email: string): Promise<boolean> {
  if (!SUPABASE_URL || !SERVICE_KEY) throw new Error('rate_store_unconfigured')
  // Supabase hospedado recibe este encabezado de Cloudflare. No se confía en
  // x-forwarded-for, que puede contener una IP escrita por el propio cliente.
  const ip = req.headers.get('cf-connecting-ip')?.trim() ?? ''
  const ipHash = /^[0-9a-f:.]{3,45}$/i.test(ip) ? await keyedHash(ip) : null
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/mesora_contact_can_send`, {
    method: 'POST',
    signal: AbortSignal.timeout(3000),
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_email_hash: await keyedHash(email.toLowerCase()), p_ip_hash: ipHash }),
  })
  if (!response.ok) {
    await response.body?.cancel()
    throw new Error('rate_store_unavailable')
  }
  const result = await response.json()
  if (typeof result !== 'boolean') throw new Error('rate_store_invalid_result')
  return result
}

export async function handleContact(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) })
  if (req.method !== 'POST') return json(req, 405, { error: 'Método no permitido.' })
  const origin = req.headers.get('origin')
  if (origin && !ALLOWED_ORIGINS.has(origin)) return json(req, 403, { error: 'Origen no permitido.' })
  if (!RESEND_KEY) {
    await recordSystemIncident('contacto-comercial', 'resend_unconfigured')
    return json(req, 503, { error: 'El envío de consultas aún no está configurado.' })
  }

  let payload: Record<string, unknown>
  try {
    const raw = await req.text()
    if (raw.length > 6000) return json(req, 413, { error: 'La consulta supera el tamaño permitido.' })
    payload = JSON.parse(raw)
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return json(req, 400, { error: 'Solicitud inválida.' })
    }
  } catch {
    return json(req, 400, { error: 'Solicitud inválida.' })
  }

  // Honeypot: bots que completan el campo oculto reciben una respuesta inocua.
  if (typeof payload.sitioWeb === 'string' && payload.sitioWeb.trim()) return json(req, 200, { ok: true })

  const nombre = typeof payload.nombre === 'string' ? payload.nombre.trim() : ''
  const restaurante = typeof payload.restaurante === 'string' ? payload.restaurante.trim() : ''
  const email = typeof payload.email === 'string' ? payload.email.trim() : ''
  const mensaje = typeof payload.mensaje === 'string' ? payload.mensaje.trim() : ''
  if (!nombre || nombre.length > 100 || !restaurante || restaurante.length > 120 ||
      !EMAIL_OK.test(email) || email.length > 160 || mensaje.length > 1000) {
    return json(req, 400, { error: 'Revisa los datos del formulario.' })
  }

  try {
    if (!await reserveContact(req, email)) {
      return json(req, 429, { error: 'Recibimos demasiadas consultas. Espera antes de volver a enviar.' }, { 'Retry-After': '3600' })
    }
  } catch {
    await recordSystemIncident('contacto-comercial', 'rate_store_unavailable')
    return json(req, 503, { error: 'El formulario no está disponible en este momento. Intenta más tarde.' })
  }

  // Reintentos idénticos del mismo día conservan una sola consulta y un solo
  // aviso. La huella nunca revela el contenido del formulario.
  const submissionKey = await keyedHash(JSON.stringify([
    nombre, restaurante, email.toLowerCase(), mensaje, new Date().toISOString().slice(0, 10),
  ]))
  let jobId: string
  try {
    const registered = await mailRpc<{ lead_id: string; job_id: string }>('mesora_register_commercial_lead', {
      p_submission_key: submissionKey,
      p_nombre: nombre,
      p_restaurante: restaurante,
      p_email: email,
      p_mensaje: mensaje,
    })
    jobId = registered.job_id
    if (!jobId) throw new Error('mail_job_missing')
  } catch {
    await recordSystemIncident('contacto-comercial', 'lead_store_unavailable')
    return json(req, 503, { error: 'No se pudo guardar la consulta. Intenta nuevamente.' })
  }

  // Entrega inmediata; si Resend falla, el trabajo programado reintenta.
  // La consulta ya existe en la bandeja del superadministrador.
  try {
    const jobs = await mailRpc<MailJob[]>('mesora_claim_mail_jobs', { p_limit: 1, p_job_id: jobId })
    // Otro intento ya tomó el aviso o lo entregó. El estado exacto puede
    // cambiar en paralelo; solo confirmamos lo que sí sabemos: se registró.
    if (jobs.length === 0) return json(req, 200, { ok: true, correo: 'registrado' })
    const result = await sendMailJob(jobs[0])
    await finishMailJob(jobs[0], result)
    if (!result.ok) await recordSystemIncident('contacto-comercial', result.errorCode ?? 'resend_unavailable')
    return json(req, result.ok ? 200 : 202, { ok: true, correo: result.ok ? 'enviado' : 'en_cola' })
  } catch {
    await recordSystemIncident('contacto-comercial', 'mail_queue_unavailable')
    return json(req, 202, { ok: true, correo: 'en_cola' })
  }
}
