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
const TO_EMAIL = Deno.env.get('MESORA_CONTACT_TO_EMAIL') ?? 'mesoratech@gmail.com'
const FROM_EMAIL = Deno.env.get('MESORA_CONTACT_FROM_EMAIL') ?? 'Mesora <onboarding@resend.dev>'
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

function json(req: Request, status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(req), 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]!)
}

export async function handleContact(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) })
  if (req.method !== 'POST') return json(req, 405, { error: 'Método no permitido.' })
  const origin = req.headers.get('origin')
  if (origin && !ALLOWED_ORIGINS.has(origin)) return json(req, 403, { error: 'Origen no permitido.' })
  if (!RESEND_KEY) return json(req, 503, { error: 'El envío de consultas aún no está configurado.' })

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

  const subject = `Consulta comercial Mesora — ${restaurante}`
  const text = [
    'Nueva consulta desde la landing de Mesora',
    `Nombre: ${nombre}`,
    `Restaurante: ${restaurante}`,
    `Correo: ${email}`,
    '',
    mensaje || 'Quiere conocer Mesora para su restaurante.',
  ].join('\n')
  const safe = { nombre: escapeHtml(nombre), restaurante: escapeHtml(restaurante), email: escapeHtml(email), mensaje: escapeHtml(mensaje || 'Quiere conocer Mesora para su restaurante.') }
  // Reintentos idénticos durante el mismo día conservan la clave de Resend.
  // El hash evita incluir datos personales en la cabecera de idempotencia.
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([
    FROM_EMAIL, TO_EMAIL, nombre, restaurante, email, mensaje, new Date().toISOString().slice(0, 10),
  ])))
  const idempotencyKey = `contacto-${Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')}`
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      signal: AbortSignal.timeout(12_000),
      headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [TO_EMAIL],
        reply_to: email,
        subject,
        text,
        html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#202124"><h1 style="color:#f28c00">Nueva consulta de Mesora</h1><p><b>Nombre:</b> ${safe.nombre}</p><p><b>Restaurante:</b> ${safe.restaurante}</p><p><b>Correo:</b> ${safe.email}</p><p style="white-space:pre-wrap">${safe.mensaje}</p></div>`,
      }),
    })
    if (!response.ok) {
      await response.body?.cancel()
      return json(req, 502, { error: 'No se pudo entregar la consulta al servicio de correo.' })
    }
    await response.body?.cancel()
    return json(req, 200, { ok: true })
  } catch {
    return json(req, 502, { error: 'No se pudo confirmar el envío. Puedes reintentar.' })
  }
}
