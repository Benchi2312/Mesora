// Sin permisos de red: los correos de esta prueba nunca salen a Resend.
Deno.env.set('RESEND_API_KEY', 'fixture-no-es-una-clave')
Deno.env.set('MESORA_CONTACT_TO_EMAIL', 'destino@example.invalid')
Deno.env.set('SUPABASE_URL', 'https://fixture.supabase.invalid')
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'fixture-service-key')
const { handleContact } = await import('./handler.ts')
const origin = 'https://mesora-sistema.vercel.app'
const valid = { nombre: 'Ana <script>', restaurante: 'Local QA', email: 'ana@example.invalid', mensaje: 'Consulta & demo' }
function check(condition: unknown, message: string): asserts condition {
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
  globalThis.fetch = ((url: string, init: RequestInit) => {
    if (url.includes('/rpc/mesora_contact_can_send')) {
      reservations.push(JSON.parse(String(init.body)))
      return Promise.resolve(new Response('true', { status: 200 }))
    }
    if (url.includes('/rpc/mesora_record_incident')) {
      incidents.push(JSON.parse(String(init.body)))
      return Promise.resolve(new Response(null, { status: 204 }))
    }
    sent.push({ body: JSON.parse(String(init.body)), headers: new Headers(init.headers), signal: init.signal })
    return Promise.resolve(new Response('{"id":"fixture"}', { status: 200 }))
  }) as typeof fetch
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
    await t.step('destino fijo, Reply-To, HTML escapado, timeout e idempotencia', async () => {
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
      check(sent[0].headers.get('idempotency-key') === sent[1].headers.get('idempotency-key'), 'Reintento estable')
      await handleContact(request({ ...valid, mensaje: 'Otra consulta' }))
      check(sent[0].headers.get('idempotency-key') !== sent[2].headers.get('idempotency-key'), 'Consulta distinta')
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
    })
    await t.step('rechazo del proveedor y caída de red tienen error controlado', async () => {
      globalThis.fetch = ((url: string) => Promise.resolve(url.includes('/rpc/')
        ? new Response(url.includes('can_send') ? 'true' : null, { status: url.includes('can_send') ? 200 : 204 })
        : new Response('detalle privado', { status: 429 }))) as typeof fetch
      const rejected = await handleContact(request(valid))
      check(rejected.status === 502 && !(await rejected.text()).includes('detalle privado'), 'Error sin detalles internos')
      globalThis.fetch = ((url: string) => url.includes('/rpc/')
        ? Promise.resolve(new Response(url.includes('can_send') ? 'true' : null, { status: url.includes('can_send') ? 200 : 204 }))
        : Promise.reject(new Error('fallo interno privado'))) as typeof fetch
      check((await handleContact(request(valid))).status === 502, 'Red controlada')
    })
  } finally {
    globalThis.fetch = originalFetch
  }
})
