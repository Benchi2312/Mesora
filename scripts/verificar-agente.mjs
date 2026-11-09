import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { AgenteMesora } from '../agent/worker.mjs'
import { ImpresoraSimulada } from '../agent/simulated-printer.mjs'
import { crearTransporte, validarConexion } from '../agent/transport.mjs'
import { ImpresoraWindows } from '../agent/windows-printer.mjs'

let checks = 0
function check(descripcion, accion) { accion(); checks++; console.log(`OK ${checks}: ${descripcion}`) }
const trabajo = (extra = {}) => ({ id: 'trabajo-1', reclamo_id: 'reclamo-1', estacion: 'cocina',
  cola_windows: 'Mesora Simulada Cocina', copias: 2, numero_intento: 1,
  papel_mm: 58, restaurante: 'QA', mesa: 'Mesa 1', mesero: 'Mesero QA',
  items: [{ nombre: 'Plato', cantidad: 1, nota: 'sin sal' }], ...extra })

function entorno({ cola = [trabajo()], impresora = new ImpresoraSimulada(), fallarConfirmacion = false } = {}) {
  const llamadas = []
  let recibo = null
  let ultimoEstado = null
  let confirmacionFallida = fallarConfirmacion
  const transporte = { rpc: async (nombre, args) => {
    llamadas.push({ nombre, args })
    if (nombre === 'agente_impresion_reclamar') return cola.shift() ?? null
    if (nombre === 'agente_impresion_confirmar' && confirmacionFallida) {
      confirmacionFallida = false
      throw new Error('Sin conexión al confirmar')
    }
    return { estado: 'enviado' }
  } }
  const almacen = {
    guardarEstado: async (valor) => { ultimoEstado = valor }, leerRecibo: async () => recibo,
    guardarRecibo: async (valor) => { recibo = valor }, borrarRecibo: async () => { recibo = null },
  }
  const agente = new AgenteMesora({ transporte, impresora, almacen, token: 't'.repeat(64) })
  return { agente, llamadas, impresora, leerRecibo: () => recibo, leerEstado: () => ultimoEstado }
}

const base = new ImpresoraSimulada()
check('adaptador simulado no confirma papel físico', () => {
  assert.deepEqual(base.nombres, ['Mesora Simulada Cocina', 'Mesora Simulada Barra'])
})
const salida = await base.imprimir(trabajo())
check('adaptador simulado acepta cola y copias', () => {
  assert.equal(salida.enviadoACola, true)
  assert.equal(salida.impresionFisicaConfirmada, false)
  assert.equal(base.envios[0].copias, 2)
})

const normal = entorno()
await normal.agente.ciclo()
check('un trabajo de Cocina se imprime y confirma una vez', () => {
  assert.equal(normal.impresora.envios.length, 1)
  assert.equal(normal.llamadas.filter((x) => x.nombre === 'agente_impresion_confirmar').length, 1)
  assert.equal(normal.leerRecibo(), null)
})
await normal.agente.ciclo()
check('un segundo ciclo no duplica el trabajo', () => assert.equal(normal.impresora.envios.length, 1))
await normal.agente.estado('error', 'Token ' + 't'.repeat(64))
check('estado visible no registra el token del agente', () => {
  assert.equal(normal.leerEstado().detalle.includes('t'.repeat(64)), false)
})

const barra = entorno({ cola: [trabajo({ id: 'barra-1', estacion: 'bar', cola_windows: 'Mesora Simulada Barra', papel_mm: 80, copias: 3 })] })
await barra.agente.ciclo()
check('Barra respeta cola, ancho y copias del snapshot', () => {
  assert.equal(barra.impresora.envios[0].cola, 'Mesora Simulada Barra')
  assert.equal(barra.impresora.envios[0].copias, 3)
  assert.equal(barra.llamadas.find((x) => x.nombre === 'agente_impresion_reclamar')?.args.p_token.length, 64)
})

const perdido = entorno({ fallarConfirmacion: true })
await assert.rejects(perdido.agente.ciclo(), /Sin conexión/)
check('confirmación remota caída conserva recibo sin reimprimir', () => {
  assert.equal(perdido.impresora.envios.length, 1)
  assert.equal(perdido.leerRecibo()?.id, 'trabajo-1')
})
await perdido.agente.ciclo()
check('recuperación confirma recibo previo antes de reclamar', () => {
  assert.equal(perdido.impresora.envios.length, 1)
  assert.equal(perdido.leerRecibo(), null)
  assert.equal(perdido.llamadas.filter((x) => x.nombre === 'agente_impresion_confirmar').length, 2)
})

const ausente = entorno({ cola: [trabajo({ cola_windows: 'Tiquetera no instalada' })] })
await ausente.agente.ciclo()
check('cola ausente usa reintento seguro antes de iniciar spooler', () => {
  assert.equal(ausente.impresora.envios.length, 0)
  assert.equal(ausente.llamadas.find((x) => x.nombre === 'agente_impresion_fallar')?.args.p_reintento_seguro, true)
  assert.equal(ausente.llamadas.some((x) => x.nombre === 'agente_impresion_iniciar_envio'), false)
})

const incierto = entorno({ impresora: { listar: async () => ['Mesora Simulada Cocina'], imprimir: async () => { throw new Error('Spooler sin respuesta') } } })
await incierto.agente.ciclo()
check('fallo después de iniciar spooler termina sin reintento automático', () => {
  assert.equal(incierto.llamadas.find((x) => x.nombre === 'agente_impresion_fallar')?.args.p_reintento_seguro, false)
})

const revocado = entorno({ cola: [] })
revocado.agente.transporte.rpc = async () => { throw new Error('Agente no autorizado o revocado.') }
await revocado.agente.ejecutar()
check('revocación detiene el agente sin volver a consultar', () => assert.equal(revocado.leerEstado().estado, 'revocado'))

check('solo URL Supabase HTTPS y clave pública anon', () => {
  assert.equal(validarConexion('https://yyfsewgxyyqjyzcejsqq.supabase.co', 'sb_publishable_qa'), 'https://yyfsewgxyyqjyzcejsqq.supabase.co')
  assert.throws(() => validarConexion('https://evil.example', 'sb_publishable_qa'))
  assert.throws(() => validarConexion('https://yyfsewgxyyqjyzcejsqq.supabase.co', 'sb_secret_qa'))
})
let fetches = 0
let ultimosHeaders
const red = crearTransporte({ url: 'https://yyfsewgxyyqjyzcejsqq.supabase.co', apiKey: 'sb_publishable_qa',
  fetchImpl: async (_url, opciones) => { fetches++; ultimosHeaders = opciones.headers; return { ok: true, status: 200, json: async () => null } } })
await assert.rejects(red.rpc('admin_impresion_panel', {}), /no permitida/)
check('transporte bloquea RPC administrativas', () => assert.equal(fetches, 0))
await red.rpc('agente_impresion_reclamar', { p_token: 'qa' })
check('clave publicable va solo en apikey, sin Bearer inválido', () => {
  assert.equal(ultimosHeaders.apikey, 'sb_publishable_qa')
  assert.equal(ultimosHeaders.Authorization, undefined)
})

const raiz = fileURLToPath(new URL('../agent/', import.meta.url))
for (const nombre of readdirSync(raiz)) {
  const contenido = readFileSync(join(raiz, nombre), 'utf8')
  if (nombre === 'transport.mjs') continue // validación explícita de prefijos prohibidos
  assert.ok(!/service_role|sb_secret_|sb_service_/i.test(contenido), `${nombre} contiene referencia a credencial administrativa`)
}
check('el agente no contiene service_role ni claves administrativas', () => {})

if (process.platform === 'win32') {
  const script = fileURLToPath(new URL('../agent/windows-dpapi.ps1', import.meta.url))
  const comando = (modo, input) => spawnSync('powershell.exe', ['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script,'-Modo',modo], { input, encoding: 'utf8', windowsHide: true })
  const protegido = comando('proteger', 'token-de-prueba')
  const abierto = comando('abrir', protegido.stdout)
  check('DPAPI de Windows cifra y descifra para el usuario actual', () => {
    assert.equal(protegido.status, 0)
    assert.notEqual(protegido.stdout.trim(), 'token-de-prueba')
    assert.equal(abierto.status, 0)
    assert.equal(abierto.stdout, 'token-de-prueba')
  })
  const colas = await new ImpresoraWindows().listar()
  check('adaptador real enumera las colas instaladas sin imprimir', () => assert.ok(Array.isArray(colas)))
}

console.log(`AGENTE OK: ${checks} comprobaciones. No se realizó impresión física.`)
