// Sin permisos de red: los correos de esta prueba nunca salen a Resend.
Deno.env.set('RESEND_API_KEY', 'fixture-no-es-una-clave')
Deno.env.set('MESORA_CONTACT_TO_EMAIL', 'destino@example.invalid')
Deno.env.set('SUPABASE_URL', 'https://fixture.supabase.invalid')
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'fixture-service-key')
const { handleContact } = await import('./handler.ts')
const origin = 'https://mesora-sistema.vercel.app'
const valid = { nombre: 'Ana <script>', restaurante: 'Local QA', email: 'ana@example.invalid', mensaje: 'Consulta & demo' }
function check(condition: unknown, message: string): void {
  if (!condition) throw new Error(message)
}
function request(body: unknown, extra: RequestInit = {}) {
  return new Request(`${origin}/contacto`, { method: 'POST', headers: { origin }, body: JSON.stringify(body), ...extra })
}

Deno.test('Contacto: validación, envío, reintentos y errores sin correo real', async (t) => {
  const originalFetch = globalThis.fetch
  const sent: { body: Record<string, unknown>; headers: Headers; signal: AbortSignal | null | undefined }[] = []
  const reservations: Record<string, unknown>[] = []
  const incidents: Record<string, unknown>[] = []
  const leads = new Map<string, { id: string; sent: boolean; payload: Record<string, unknown> }>()
  globalThis.fetch = ((url: string, init: RequestInit) => {
    if (url.includes('/rpc/mesora_contact_can_send')) {
      reservations.push(JSON.parse(String(init.body)))
      return Promise.resolve(new Response('true', { status: 200 }))
    }
    if (url.includes('/rpc/mesora_record_incident')) {
      incidents.push(JSON.parse(String(init.body)))
      return Promise.resolve(new Response(null, { status: 204 }))
    }
    if (url.includes('/rpc/mesora_register_commercial_lead')) {
      const body = JSON.parse(String(init.body))
      const key = String(body.p_submission_key)
      if (!leads.has(key)) leads.set(key, {
        id: `00000000-0000-4000-8000-${String(leads.size + 1).padStart(12, '0')}`,
        sent: false,
        payload: { nombre: body.p_nombre, restaurante: body.p_restaurante, email: body.p_email, mensaje: body.p_mensaje },
      })
      const lead = leads.get(key)!
      return Promise.resolve(Response.json({ lead_id: lead.id, job_id: lead.id }))
    }
    if (url.includes('/rpc/mesora_claim_mail_jobs')) {
      const body = JSON.parse(String(init.body))
      const lead = [...leads.entries()].find(([, v]) => v.id === body.p_job_id)
      if (!lead || lead[1].sent) return Promise.resolve(Response.json([]))
      return Promise.resolve(Response.json([{ id: lead[1].id, kind: 'lead', dedupe_key: `lead:${lead[0]}`, payload: lead[1].payload }]))
    }
    if (url.includes('/rpc/mesora_finish_mail_job')) {
      const body = JSON.parse(String(init.body))
      const lead = [...leads.values()].find((v) => v.id === body.p_job_id)!
      lead.sent = body.p_success === true
      return Promise.resolve(new Response(null, { status: 204 }))
    }
    sent.push({ body: JSON.parse(String(init.body)), headers: new Headers(init.headers), signal: init.signal })
    return Promise.resolve(new Response('{"id":"fixture"}', { status: 200 }))
  }) as typeof fetch
  const normalFetch = globalThis.fetch
  try {
    await t.step('rechaza JSON inválido, null, arrays y campos incorrectos sin enviar', async () => {
      for (const body of [null, [], 5, 'texto', {}, { ...valid, email: 'inválido' }, { ...valid, nombre: ' ' }]) {
        check((await handleContact(request(body))).status === 400, 'Debe rechazar el cuerpo inválido')
      }
      check((await handleContact(request(valid, { body: '{' }))).status === 400, 'JSON roto')
      check((await handleContact(request({ ...valid, mensaje: 'a'.repeat(6100) }))).status === 413, 'Tamaño máximo')
      check(sent.length === 0, 'No debe contactar al proveedor')
      check(reservations.length === 0, 'No debe gastar cuota')
    })
    await t.step('método, origen, preflight y honeypot', async () => {
      check((await handleContact(new Request(origin))).status === 405, 'Solo POST')
      const blocked = await handleContact(request(valid, { headers: { origin: 'https://ajeno.invalid' } }))
      check(blocked.status === 403 && !blocked.headers.has('access-control-allow-origin'), 'Rechaza origen ajeno')
      const preflight = await handleContact(new Request(origin, { method: 'OPTIONS', headers: { origin } }))
      check(preflight.headers.get('access-control-allow-origin') === origin, 'CORS autorizado')
      check((await handleContact(request({ ...valid, sitioWeb: 'bot' }))).status === 200, 'Honeypot inocuo')
      check(sent.length === 0, 'El bot no envía correo')
      check(reservations.length === 0, 'El bot no gasta cuota')
    })
    await t.step('bandeja privada, destino fijo, Reply-To, HTML escapado e idempotencia', async () => {
      const response = await handleContact(request({ ...valid, to: 'intruso@example.invalid' }))
      check(response.status === 200 && (await response.json()).ok, 'Aceptado')
      check(JSON.stringify(sent[0].body.to) === '["destino@example.invalid"]', 'El cliente no elige el destino')
      check(sent[0].body.reply_to === valid.email, 'Reply-To del contacto')
      check(String(sent[0].body.html).includes('&lt;script&gt;'), 'Escape HTML')
      check(sent[0].signal instanceof AbortSignal, 'Solicitud con plazo de espera')
      check(reservations.length === 1, 'Reserva antes del proveedor')
      check(typeof reservations[0].p_email_hash === 'string' && String(reservations[0].p_email_hash).length === 64, 'Huella del correo')
      check(!JSON.stringify(reservations[0]).includes(valid.email), 'No se guarda correo en claro')
      await handleContact(request(valid))
      check(leads.size === 1 && sent.length === 1, 'Reintento sin consulta ni correo duplicado')
      await handleContact(request({ ...valid, mensaje: 'Otra consulta' }))
      check(leads.size === 2, 'Consulta distinta en bandeja')
      check(sent[0].headers.get('idempotency-key') !== sent[1].headers.get('idempotency-key'), 'Consulta distinta')
    })
    await t.step('cuota denegada y almacenamiento caído no envían correos', async () => {
      const before = sent.length
      globalThis.fetch = ((url: string, init: RequestInit) => {
        if (url.includes('/rpc/mesora_contact_can_send')) return Promise.resolve(new Response('false', { status: 200 }))
        if (url.includes('/rpc/mesora_record_incident')) {
          incidents.push(JSON.parse(String(init.body)))
          return Promise.resolve(new Response(null, { status: 204 }))
        }
        throw new Error('No debe contactar a Resend')
      }) as typeof fetch
      const limited = await handleContact(request(valid))
      check(limited.status === 429 && limited.headers.get('retry-after') === '3600', 'Cuota agotada')
      check(sent.length === before, 'El límite no envía')
      globalThis.fetch = ((url: string, init: RequestInit) => {
        if (url.includes('/rpc/mesora_contact_can_send')) return Promise.reject(new Error('DB caída'))
        if (url.includes('/rpc/mesora_record_incident')) {
          incidents.push(JSON.parse(String(init.body)))
          return Promise.resolve(new Response(null, { status: 204 }))
        }
        throw new Error('No debe contactar a Resend')
      }) as typeof fetch
      check((await handleContact(request(valid))).status === 503, 'DB caída cierra el envío')
      check(sent.length === before, 'Un fallo de DB no envía')
      check(incidents.some((event) => event.p_code === 'rate_store_unavailable'), 'Incidencia registrada')
      globalThis.fetch = normalFetch
    })
    await t.step('rechazo del proveedor deja consulta persistida y correo en cola', async () => {
      const workingFetch = globalThis.fetch
      globalThis.fetch = ((url: string, init: RequestInit) => url.includes('api.resend.com')
        ? Promise.resolve(new Response('detalle privado', { status: 429 }))
        : workingFetch(url, init)) as typeof fetch
      const rejected = await handleContact(request({ ...valid, mensaje: 'Proveedor rechazó' }))
      check(rejected.status === 202 && (await rejected.json()).correo === 'en_cola', 'Consulta aceptada con aviso pendiente')
      check(leads.size === 3 && incidents.some((event) => event.p_code === 'resend_rejected'), 'Bandeja y alerta conservadas')
      globalThis.fetch = ((url: string, init: RequestInit) => url.includes('api.resend.com')
        ? Promise.reject(new Error('fallo interno privado'))
        : workingFetch(url, init)) as typeof fetch
      const down = await handleContact(request({ ...valid, mensaje: 'Proveedor caído' }))
      check(down.status === 202 && leads.size === 4, 'Caída de red no pierde la consulta')
    })
  } finally {
    globalThis.fetch = originalFetch
  }
})
