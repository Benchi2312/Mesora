// Prueba la pantalla real con backend y agente simulados; no usa Supabase ni impresoras reales.
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import { chromium, expect } from '@playwright/test'

const raiz = fileURLToPath(new URL('..', import.meta.url))
const entorno = mkdtempSync(join(tmpdir(), 'mesora-impresion-ui-'))
const endpoint = 'https://placeholder.supabase.co'
const servidor = await createServer({
  root: raiz,
  envDir: entorno,
  logLevel: 'error',
  define: {
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(endpoint),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('qa-public-key'),
    'import.meta.env.VITE_MESORA_MODO_LOCAL': JSON.stringify('true'),
  },
  server: { host: '127.0.0.1', port: 0 },
})

let navegador
try {
  const { localSeed } = await servidor.ssrLoadModule('/src/lib/localSeed.ts')
  const admin = localSeed.usuarios.find((usuario) => usuario.rol === 'admin_restaurante' && usuario.activo !== false)
  assert(admin?.email && admin.restaurante_id, 'La semilla local debe incluir un administrador activo')
  const restauranteId = admin.restaurante_id

  const agentes = [
    { id: 'agente-cocina', nombre: 'Computadora Cocina', estado: 'activo', conectado: true, ultimo_heartbeat_at: null, impresoras_detectadas: ['Térmica Cocina', 'Impresora Oficina'] },
    { id: 'agente-barra', nombre: 'Computadora Barra', estado: 'activo', conectado: false, ultimo_heartbeat_at: null, impresoras_detectadas: ['Térmica Barra'] },
    { id: 'agente-revocado', nombre: 'Computadora anterior', estado: 'revocado', conectado: false, ultimo_heartbeat_at: null, impresoras_detectadas: [] },
  ]
  const estaciones = [
    { id: 'estacion-cocina', codigo: 'cocina' },
    { id: 'estacion-barra', codigo: 'bar' },
  ]
  const destinos = [
    { id: 'destino-cocina', nombre: 'Pedidos de Cocina', estacion_id: 'estacion-cocina', grupo: 'principal', activo: true },
    { id: 'destino-barra', nombre: 'Pedidos de Barra', estacion_id: 'estacion-barra', grupo: 'principal', activo: true },
    { id: 'destino-respaldo', nombre: 'Respaldo interno', estacion_id: 'estacion-cocina', grupo: 'respaldo', activo: true },
  ]
  const asignaciones = [
    { destino_id: 'destino-cocina', agente_id: 'agente-cocina', cola_windows: 'Térmica Cocina', activa: true, max_intentos: 7, reintento_base_seg: 45 },
    { destino_id: 'destino-barra', agente_id: '', cola_windows: '', activa: false, max_intentos: 3, reintento_base_seg: 15 },
  ]
  const asignacionesIniciales = structuredClone(asignaciones)
  const trabajos = [
    { id: 'trabajo-inicial', tipo: 'comanda', estacion: 'cocina', estado: 'enviado', cola_windows: 'Térmica Cocina', intentos: 1, max_intentos: 7, creado_at: '2026-11-19T15:00:00.000Z', enviado_at: '2026-11-19T15:00:02.000Z', error_final: null },
  ]
  const llamadasAsignar = []
  const llamadasPrueba = []
  const confirmaciones = []
  let fallarProximaAsignacion = false
  let numeroCodigo = 0

  await servidor.listen()
  const url = 'http://127.0.0.1:' + servidor.httpServer.address().port
  navegador = await chromium.launch({ headless: true })

  async function responder(route, cuerpo, estado = 200) {
    await route.fulfill({
      status: estado,
      contentType: 'application/json',
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      },
      body: JSON.stringify(cuerpo),
    })
  }

  async function interceptar(request) {
    const ruta = new URL(request.request().url())
    const metodo = request.request().method()
    if (metodo === 'OPTIONS') return responder(request, null, 204)
    if (ruta.pathname.endsWith('/estaciones_restaurante')) return responder(request, estaciones)
    if (ruta.pathname.endsWith('/destinos_estacion')) return responder(request, destinos)
    if (!ruta.pathname.includes('/rpc/')) return responder(request, [])

    const nombreRpc = ruta.pathname.split('/').pop()
    if (nombreRpc === 'admin_impresion_panel') {
      return responder(request, { agentes, asignaciones, trabajos, respaldo_automatico_disponible: false })
    }
    if (nombreRpc === 'admin_impresion_crear_codigo') {
      numeroCodigo += 1
      return responder(request, { codigo: 'QA-' + String(numeroCodigo).padStart(4, '0'), expira_at: new Date(Date.now() + 10 * 60_000).toISOString() })
    }
    if (nombreRpc === 'admin_impresion_asignar') {
      const payload = request.request().postDataJSON()
      llamadasAsignar.push(payload)
      if (fallarProximaAsignacion) {
        fallarProximaAsignacion = false
        return responder(request, { code: 'NETWORK_QA', message: 'Conexión interrumpida durante la prueba QA' }, 503)
      }
      const previo = asignaciones.find((item) => item.destino_id === payload.p_destino_id)
      const siguiente = {
        destino_id: payload.p_destino_id,
        agente_id: payload.p_agente_id,
        cola_windows: payload.p_cola_windows,
        activa: payload.p_activa,
        max_intentos: payload.p_max_intentos,
        reintento_base_seg: payload.p_reintento_base_seg,
      }
      if (previo) Object.assign(previo, siguiente)
      else asignaciones.push(siguiente)
      return responder(request, null)
    }
    if (nombreRpc === 'admin_impresion_prueba') {
      const payload = request.request().postDataJSON()
      llamadasPrueba.push(payload)
      const destino = destinos.find((item) => item.id === payload.p_destino_id)
      trabajos.unshift({
        id: 'trabajo-prueba-' + llamadasPrueba.length,
        tipo: 'prueba',
        estacion: destino?.estacion_id === 'estacion-barra' ? 'bar' : 'cocina',
        estado: 'pendiente',
        cola_windows: asignaciones.find((item) => item.destino_id === payload.p_destino_id)?.cola_windows ?? '',
        intentos: 0,
        max_intentos: 3,
        creado_at: new Date().toISOString(),
        enviado_at: null,
        error_final: null,
      })
      return responder(request, 'trabajo-prueba-' + llamadasPrueba.length)
    }
    if (nombreRpc === 'admin_impresion_revocar') {
      const payload = request.request().postDataJSON()
      const agente = agentes.find((item) => item.id === payload.p_agente_id)
      if (agente) agente.estado = 'revocado'
      return responder(request, null)
    }
    return responder(request, null)
  }

  for (const ancho of [390, 768, 1024, 1440]) {
    asignaciones.splice(0, asignaciones.length, ...structuredClone(asignacionesIniciales))
    if (ancho === 768) {
      asignaciones.forEach((item) => {
        item.agente_id = ''
        item.cola_windows = ''
        item.activa = false
      })
    }
    const contexto = await navegador.newContext({ viewport: { width: ancho, height: 900 } })
    const pagina = await contexto.newPage()
    pagina.setDefaultTimeout(12000)
    pagina.on('pageerror', (fallo) => confirmaciones.push('PAGE_ERROR: ' + fallo.message))
    await pagina.addInitScript((correo) => {
      localStorage.setItem('mesora.local.sesion', JSON.stringify({ email: correo }))
      window.__confirmacionesImpresionQA = []
      window.confirm = (mensaje) => { window.__confirmacionesImpresionQA.push(mensaje); return true }
    }, admin.email)
    await pagina.route(endpoint + '/**', interceptar)
    await pagina.goto(url + '/admin', { waitUntil: 'domcontentloaded' })
    if (ancho < 1024) {
      await pagina.locator('.admin-menu-trigger').click()
      await expect(pagina.locator('.admin-drawer[role="dialog"]')).toBeVisible()
      await pagina.locator('.admin-drawer[role="dialog"]').getByRole('button', { name: 'Impresión automática', exact: true }).click()
      await expect(pagina.locator('.admin-drawer[role="dialog"]')).toHaveCount(0)
    } else {
      await expect(pagina.locator('.admin-sidebar').getByRole('button', { name: 'Impresión automática', exact: true })).toBeVisible()
      await pagina.locator('.admin-sidebar').getByRole('button', { name: 'Impresión automática', exact: true }).click()
    }

    const panel = pagina.getByRole('region', { name: 'Impresión automática de comandas' })
    await expect(panel.getByRole('heading', { name: 'Impresión automática de comandas (opcional)' })).toBeVisible()
    await expect(panel.getByText('Conecta una computadora Windows para enviar automáticamente las comandas de Cocina y Barra a sus impresoras. Si no activas esta función, puedes seguir usando las pantallas o imprimir manualmente.', { exact: true })).toBeVisible()
    await expect(panel.getByRole('heading', { name: 'Conectar una computadora' })).toBeVisible()
    await expect(panel.getByRole('heading', { name: 'Elegir las impresoras' })).toBeVisible()
    await expect(panel.getByRole('heading', { name: 'Activar impresión automática' })).toBeVisible()
    await expect(panel.getByText('2 computadoras vinculadas · 1 conectada', { exact: true })).toBeVisible()
    await expect(panel.getByRole('article', { name: 'Impresora de Cocina' })).toBeVisible()
    await expect(panel.getByRole('article', { name: 'Impresora de Barra' })).toBeVisible()
    if (ancho === 768) {
      await expect(panel.getByText('Aún no hay impresoras configuradas. Puedes seguir usando las pantallas y la impresión manual.', { exact: true })).toBeVisible()
    } else {
      await expect(panel.getByText('Aún no hay impresoras configuradas. Puedes seguir usando las pantallas y la impresión manual.', { exact: true })).toHaveCount(0)
    }
    await expect(panel.getByText('Una impresora de oficina puede usarse para probar la conexión, pero las impresoras térmicas utilizan un formato diferente de 58 u 80 mm.', { exact: true })).toBeVisible()
    await expect(panel.getByText(/Cola de Windows|Máximo de intentos|Espera inicial|Reintentos|heartbeat|reconocimiento KDS/i)).toHaveCount(0)
    await expect(panel.getByRole('button', { name: 'Actualizar estado', exact: true })).toBeVisible()
    await expect(panel.getByRole('button', { name: 'Generar código de conexión', exact: true })).toBeVisible()

    const medidos = await panel.evaluate((element) => {
      const buttons = Array.from(element.querySelectorAll('button')).filter((item) => item.getClientRects().length)
      const selects = Array.from(element.querySelectorAll('select')).filter((item) => item.getClientRects().length)
      const labelsSwitch = Array.from(element.querySelectorAll('input[role="switch"]')).map((item) => item.closest('label'))
      const alturas = [...buttons, ...selects, ...labelsSwitch].filter(Boolean).map((item) => item.getBoundingClientRect().height)
      return {
        anchoDocumento: document.documentElement.scrollWidth,
        anchoVentana: document.documentElement.clientWidth,
        alturas,
      }
    })
    assert(medidos.anchoDocumento <= medidos.anchoVentana, 'No debe existir desbordamiento horizontal en ' + ancho + ' px')
    assert(medidos.alturas.every((altura) => altura >= 44), 'Los controles táctiles deben medir al menos 44 px en ' + ancho + ' px')

    const tarjetaCocina = await panel.getByRole('article', { name: 'Impresora de Cocina' }).boundingBox()
    const tarjetaBarra = await panel.getByRole('article', { name: 'Impresora de Barra' }).boundingBox()
    assert(tarjetaCocina && tarjetaBarra, 'Las tarjetas de ambas áreas deben estar visibles')
    if (ancho >= 1024) {
      assert(tarjetaBarra.x > tarjetaCocina.x && Math.abs(tarjetaBarra.y - tarjetaCocina.y) < 20, 'Cocina y Barra deben mostrarse lado a lado desde 1024 px')
    } else {
      assert(tarjetaBarra.y >= tarjetaCocina.y + tarjetaCocina.height - 2, 'En móvil Cocina y Barra deben apilarse')
    }

    if (ancho === 390) {
      await panel.getByRole('button', { name: 'Generar código de conexión' }).click()
      await expect(panel.getByText(/Código de un solo uso · vence/)).toBeVisible()
      await expect(panel.getByText('QA-0001', { exact: true })).toBeVisible()
      await expect(pagina.locator('#computadora-bar')).toBeEnabled()
      await pagina.locator('#computadora-bar').selectOption('agente-barra')
      await pagina.locator('#impresora-bar').selectOption('Térmica Barra')
      const switchBarra = panel.getByRole('switch', { name: 'Enviar comandas automáticamente a Barra' })
      await switchBarra.check({ force: true })
      await expect(switchBarra).toBeChecked()

      const tarjetaActivacionBarra = panel.getByRole('article', { name: 'Activación para Barra' })
      fallarProximaAsignacion = true
      await tarjetaActivacionBarra.getByRole('button', { name: 'Guardar configuración', exact: true }).click()
      await expect(panel.getByRole('alert')).toContainText('Conexión interrumpida durante la prueba QA')
      await expect(switchBarra).toBeChecked()
      await expect(pagina.locator('#computadora-bar')).toHaveValue('agente-barra')
      await expect(pagina.locator('#impresora-bar')).toHaveValue('Térmica Barra')

      await tarjetaActivacionBarra.getByRole('button', { name: 'Guardar configuración', exact: true }).click()
      await expect(panel.getByText('Configuración de Barra guardada. Solo se aplicará a comandas nuevas.', { exact: true })).toBeVisible()
      await expect(tarjetaActivacionBarra.getByText('Activo', { exact: true })).toBeVisible()
      await expect(tarjetaActivacionBarra.getByRole('switch')).toBeChecked()

      await tarjetaActivacionBarra.getByRole('button', { name: 'Probar impresión', exact: true }).click()
      await expect(panel.getByText(/Prueba solicitada para Barra/)).toBeVisible()
      const textoConfirmacion = await pagina.evaluate(() => window.__confirmacionesImpresionQA.at(-1))
      assert.match(textoConfirmacion, /hoja física de prueba/i, 'La confirmación debe avisar que se imprimirá una hoja física')
      assert.equal(llamadasPrueba.length, 1, 'La prueba simulada debe enviar una única solicitud')
      assert.equal(llamadasPrueba[0].p_destino_id, 'destino-barra')

      const guardadoCocina = await panel.getByRole('article', { name: 'Activación para Cocina' }).getByRole('button', { name: 'Guardar configuración', exact: true })
      await guardadoCocina.click()
      await expect(panel.getByText('Configuración de Cocina guardada. Solo se aplicará a comandas nuevas.', { exact: true })).toBeVisible()
      const payloadCocina = llamadasAsignar.find((payload) => payload.p_destino_id === 'destino-cocina')
      assert.equal(payloadCocina.p_max_intentos, 7, 'El máximo interno de intentos debe conservar su valor guardado')
      assert.equal(payloadCocina.p_reintento_base_seg, 45, 'La espera interna debe conservar su valor guardado')
      assert(!llamadasAsignar.some((payload) => payload.p_destino_id === 'destino-respaldo'), 'La configuración de respaldo existente no debe modificarse')
      assert.equal(confirmaciones.filter((mensaje) => mensaje.startsWith('PAGE_ERROR:')).length, 0, 'No deben aparecer errores JavaScript')
    }

    await contexto.close()
    console.log('Impresión automática UI: ' + ancho + ' px, opciones, estados y layout aprobados')
  }

  console.log('Impresión automática UI OK: cuatro anchos, controles táctiles, guardado y reintento, valores internos conservados y prueba física advertida (simulada).')
} finally {
  await navegador?.close()
  await servidor.close()
  rmSync(entorno, { recursive: true, force: true })
}
