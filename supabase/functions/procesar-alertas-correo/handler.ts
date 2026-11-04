import { finishMailJob, mailConfigured, mailRpc, sendMailJob } from '../_shared/mesora-mail.ts'
import type { MailJob } from '../_shared/mesora-mail.ts'

// Esta función no expone CORS ni acepta el JWT de un navegador. Solo la invoca
// el trabajo programado con un token específico para esta tarea.
function sameSecret(left: string, right: string): boolean {
  const a = new TextEncoder().encode(left)
  const b = new TextEncoder().encode(right)
  let mismatch = a.length ^ b.length
  const size = Math.max(a.length, b.length)
  for (let i = 0; i < size; i++) mismatch |= (a[i] ?? 0) ^ (b[i] ?? 0)
  return mismatch === 0
}

export async function handleAlerts(req: Request): Promise<Response> {
  if (req.method !== 'POST') return new Response(null, { status: 405 })
  const token = Deno.env.get('MESORA_ALERTS_CRON_TOKEN') ?? ''
  const provided = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  if (!token || !sameSecret(token, provided)) return new Response(null, { status: 401 })
  if (!mailConfigured()) return Response.json({ error: 'Correo no configurado' }, { status: 503 })

  try {
    const jobs = await mailRpc<MailJob[]>('mesora_claim_mail_jobs', { p_limit: 10, p_job_id: null })
    let enviados = 0
    let fallidos = 0
    for (const job of jobs) {
      const result = await sendMailJob(job)
      try {
        await finishMailJob(job, result)
      } catch {
        console.error(`[mesora:mail] No se pudo confirmar el trabajo ${job.id}`)
        fallidos++
        continue
      }
      if (result.ok) enviados++
      else fallidos++
    }
    return Response.json({ procesados: jobs.length, enviados, fallidos })
  } catch {
    console.error('[mesora:mail] No se pudo obtener la cola de avisos')
    return Response.json({ error: 'Cola de avisos temporalmente no disponible' }, { status: 503 })
  }
}
