// Sin permisos de red: los correos de esta prueba nunca salen a Resend.
Deno.env.set('RESEND_API_KEY', 'fixture-no-es-una-clave')
Deno.env.set('MESORA_CONTACT_TO_EMAIL', 'destino@example.invalid')
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
  globalThis.fetch = ((_url: unknown, init: RequestInit) => {
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
    })
    await t.step('método, origen, preflight y honeypot', async () => {
      check((await handleContact(new Request(origin))).status === 405, 'Solo POST')
      const blocked = await handleContact(request(valid, { headers: { origin: 'https://ajeno.invalid' } }))
      check(blocked.status === 403 && !blocked.headers.has('access-control-allow-origin'), 'Rechaza origen ajeno')
      const preflight = await handleContact(new Request(origin, { method: 'OPTIONS', headers: { origin } }))
      check(preflight.headers.get('access-control-allow-origin') === origin, 'CORS autorizado')
      check((await handleContact(request({ ...valid, sitioWeb: 'bot' }))).status === 200, 'Honeypot inocuo')
      check(sent.length === 0, 'El bot no envía correo')
    })
    await t.step('destino fijo, Reply-To, HTML escapado, timeout e idempotencia', async () => {
      const response = await handleContact(request({ ...valid, to: 'intruso@example.invalid' }))
      check(response.status === 200 && (await response.json()).ok, 'Aceptado')
      check(JSON.stringify(sent[0].body.to) === '["destino@example.invalid"]', 'El cliente no elige el destino')
      check(sent[0].body.reply_to === valid.email, 'Reply-To del contacto')
      check(String(sent[0].body.html).includes('&lt;script&gt;'), 'Escape HTML')
      check(sent[0].signal instanceof AbortSignal, 'Solicitud con plazo de espera')
      await handleContact(request(valid))
      check(sent[0].headers.get('idempotency-key') === sent[1].headers.get('idempotency-key'), 'Reintento estable')
      await handleContact(request({ ...valid, mensaje: 'Otra consulta' }))
      check(sent[0].headers.get('idempotency-key') !== sent[2].headers.get('idempotency-key'), 'Consulta distinta')
    })
    await t.step('rechazo del proveedor y caída de red tienen error controlado', async () => {
      globalThis.fetch = (() => Promise.resolve(new Response('detalle privado', { status: 429 }))) as typeof fetch
      const rejected = await handleContact(request(valid))
      check(rejected.status === 502 && !(await rejected.text()).includes('detalle privado'), 'Error sin detalles internos')
      globalThis.fetch = (() => Promise.reject(new Error('fallo interno privado'))) as typeof fetch
      check((await handleContact(request(valid))).status === 502, 'Red controlada')
    })
  } finally {
    globalThis.fetch = originalFetch
  }
})
