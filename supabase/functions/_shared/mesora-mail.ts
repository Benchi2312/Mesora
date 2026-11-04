export type MailJob = {
  id: string
  kind: 'lead' | 'support' | 'incident'
  dedupe_key: string
  payload: Record<string, unknown>
}

const SITE_URL = (Deno.env.get('MESORA_SITE_URL') ?? 'https://mesora-sistema.vercel.app').replace(/\/$/, '')
const FROM_EMAIL = Deno.env.get('MESORA_CONTACT_FROM_EMAIL') ?? 'Mesora <onboarding@resend.dev>'
const TO_EMAIL = Deno.env.get('MESORA_CONTACT_TO_EMAIL') ?? 'mesoratech@gmail.com'

export function mailConfigured(): boolean {
  return Boolean(Deno.env.get('RESEND_API_KEY') && Deno.env.get('SUPABASE_URL') && Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))
}

export async function mailRpc<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) throw new Error('mail_db_unconfigured')
  const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: 'POST',
    signal: AbortSignal.timeout(5000),
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    await response.body?.cancel()
    throw new Error(`mail_db_http_${response.status}`)
  }
  if (response.status === 204) return undefined as T
  return await response.json() as T
}

function value(payload: Record<string, unknown>, key: string): string {
  return typeof payload[key] === 'string' ? String(payload[key]) : ''
}

function escapeHtml(input: string): string {
  return input.replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]!)
}

export async function sendMailJob(job: MailJob): Promise<{ ok: boolean; errorCode?: string }> {
  const key = Deno.env.get('RESEND_API_KEY')
  if (!key) return { ok: false, errorCode: 'resend_unconfigured' }

  const p = job.payload
  let subject: string
  let text: string
  let replyTo: string | undefined
  if (job.kind === 'lead') {
    const restaurante = value(p, 'restaurante')
    const email = value(p, 'email')
    subject = `Consulta comercial Mesora — ${restaurante}`
    replyTo = email
    text = [
      'Nueva consulta desde la landing de Mesora',
      `Nombre: ${value(p, 'nombre')}`,
      `Restaurante: ${restaurante}`,
      `Correo: ${email}`,
      '', value(p, 'mensaje') || 'Quiere conocer Mesora para su restaurante.',
      '', `Bandeja comercial: ${SITE_URL}/super-admin/soporte`,
    ].join('\n')
  } else if (job.kind === 'support') {
    subject = `Soporte Mesora · ${value(p, 'codigo')} · ${value(p, 'asunto')}`
    text = [
      'Un administrador de restaurante reportó un ticket.',
      `Código: ${value(p, 'codigo')}`,
      `Restaurante: ${value(p, 'restaurante')}`,
      `Tipo: ${value(p, 'tipo')}`,
      `Prioridad: ${value(p, 'prioridad')}`,
      `Asunto: ${value(p, 'asunto')}`,
      '', `Ver bandeja: ${SITE_URL}/super-admin/soporte`,
    ].join('\n')
  } else {
    subject = `Incidente técnico Mesora · ${value(p, 'source')}`
    text = [
      'Mesora registró una incidencia técnica.',
      `Origen: ${value(p, 'source')}`,
      `Código: ${value(p, 'code')}`,
      `Día UTC: ${value(p, 'day')}`,
      '', `Ver alertas: ${SITE_URL}/super-admin/notificaciones`,
    ].join('\n')
  }

  const html = `<table role="presentation" style="font-family:Arial,sans-serif;width:100%;max-width:600px;margin:auto;border-collapse:collapse;color:#202124"><tr><td style="padding:18px 22px;background:#111318"><img src="${SITE_URL}/marca/isotipo-email.png" width="40" height="40" alt="" style="vertical-align:middle;border:0"><span style="padding-left:10px;color:#fff;font-size:22px;font-weight:bold;vertical-align:middle">Mesora</span></td></tr><tr><td style="padding:24px 22px;background:#fff"><h1 style="font-size:20px">${escapeHtml(subject)}</h1><pre style="white-space:pre-wrap;font:15px/1.6 Arial,sans-serif">${escapeHtml(text)}</pre></td></tr></table>`
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      signal: AbortSignal.timeout(12_000),
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `mesora-${job.dedupe_key}`,
      },
      body: JSON.stringify({ from: FROM_EMAIL, to: [TO_EMAIL], ...(replyTo ? { reply_to: replyTo } : {}), subject, text, html }),
    })
    await response.body?.cancel()
    return response.ok ? { ok: true } : { ok: false, errorCode: 'resend_rejected' }
  } catch {
    return { ok: false, errorCode: 'resend_unavailable' }
  }
}

export async function finishMailJob(job: MailJob, sent: { ok: boolean; errorCode?: string }): Promise<void> {
  await mailRpc<void>('mesora_finish_mail_job', {
    p_job_id: job.id, p_success: sent.ok, p_error_code: sent.errorCode ?? null,
  })
}
