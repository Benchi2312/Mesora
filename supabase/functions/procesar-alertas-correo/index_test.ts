// Prueba aislada: no concede permiso de red ni envía correos reales.
Deno.env.set('MESORA_ALERTS_CRON_TOKEN', 'fixture-cron-token')
Deno.env.set('RESEND_API_KEY', 'fixture-resend-key')
Deno.env.set('SUPABASE_URL', 'https://fixture.supabase.invalid')
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'fixture-service-key')
Deno.env.set('MESORA_CONTACT_TO_EMAIL', 'destino@example.invalid')
const { handleAlerts } = await import('./handler.ts')

function check(condition: unknown, message: string): void {
  if (!condition) throw new Error(message)
}

Deno.test('Avisos: autorización, lote y reintento sin red', async () => {
  const originalFetch = globalThis.fetch
  const calls: string[] = []
  globalThis.fetch = ((url: string, init: RequestInit) => {
    calls.push(url)
    if (url.includes('/rpc/mesora_claim_mail_jobs')) return Promise.resolve(Response.json([
      { id: 'job-1', kind: 'support', dedupe_key: 'support:fixture', payload: { codigo: 'TK-TEST', asunto: 'Consulta', restaurante: 'Local', tipo: 'consulta', prioridad: 'media' } },
    ]))
    if (url.includes('/rpc/mesora_finish_mail_job')) {
      const body = JSON.parse(String(init.body))
      check(body.p_success === true, 'Se confirma entrega aceptada')
      return Promise.resolve(new Response(null, { status: 204 }))
    }
    if (url === 'https://api.resend.com/emails') {
      const body = JSON.parse(String(init.body))
      check(body.to[0] === 'destino@example.invalid', 'Destino fijo')
      check(String(body.subject).includes('TK-TEST'), 'Asunto de ticket')
      return Promise.resolve(Response.json({ id: 'fixture-email' }))
    }
    throw new Error('Solicitud inesperada')
  }) as typeof fetch
  try {
    const wrongMethod = await handleAlerts(new Request('https://fixture.invalid', { method: 'GET' }))
    check(wrongMethod.status === 405, 'Solo POST')
    const denied = await handleAlerts(new Request('https://fixture.invalid', { method: 'POST' }))
    check(denied.status === 401 && calls.length === 0, 'Sin token no toca cola ni proveedor')
    const allowed = await handleAlerts(new Request('https://fixture.invalid', {
      method: 'POST', headers: { authorization: 'Bearer fixture-cron-token' },
    }))
    check(allowed.status === 200, 'Token válido')
    const result = await allowed.json()
    check(result.procesados === 1 && result.enviados === 1 && result.fallidos === 0, 'Lote procesado')
    check(calls.some((url) => url.includes('/rpc/mesora_finish_mail_job')), 'Aviso confirmado')
  } finally {
    globalThis.fetch = originalFetch
  }
})
