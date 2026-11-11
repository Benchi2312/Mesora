// Configuración del local: navegador aislado y REST simulado, sin tocar datos reales.
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import { chromium, expect } from '@playwright/test'

const raiz = fileURLToPath(new URL('..', import.meta.url))
const entorno = mkdtempSync(join(tmpdir(), 'mesora-configuracion-'))
const endpoint = 'https://mesora-config-qa.supabase.co'
const server = await createServer({
  root: raiz, envDir: entorno, logLevel: 'error',
  define: {
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(endpoint),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('qa-public-key'),
  },
  server: { host: '127.0.0.1', port: 0 },
})
let browser
try {
  const { prepararDatosLocal } = await server.ssrLoadModule('/src/domain/restaurant/datosLocal.ts')
  const { metadatosDiagnostico } = await server.ssrLoadModule('/src/lib/diagnostico.ts')
  assert.deepEqual(metadatosDiagnostico('render', 'ErrorBoundary', '/restablecer?token=reservado#secreto'), {
    p_tipo: 'render', p_ruta: '/restablecer', p_contexto: 'ErrorBoundary',
  })
  assert.equal(metadatosDiagnostico('api', 'correo@privado.pe', '/super-admin/restaurantes/identificador').p_contexto, 'aplicacion')
  assert.deepEqual(prepararDatosLocal({ nombre: '  Mi local  ', dominio: ' @Local-QA.PE/ ', direccion: ' ' }).data,
    { nombre: 'Mi local', dominio: 'local-qa.pe', direccion: null })
  for (const cambios of [
    { nombre: '' }, { ruc: '123' }, { telefono: 'abc' }, { email_contacto: 'inválido' },
    { dominio: 'sin dominio' }, { nombre: null }, { dominio: 5 }, {},
    { modo_cobro: 'ambos' }, { permite_emitir_boleta: 'cajero' }, { suscripcion_activa: true },
  ]) assert(prepararDatosLocal(cambios).error, JSON.stringify(cambios))
  await server.listen()
  const url = `http://127.0.0.1:${server.httpServer.address().port}`
  browser = await chromium.launch({ headless: true })

  // Adaptador real: se intercepta REST y se comprueba el payload que llegaría a Supabase.
  const restPage = await browser.newPage()
  const payloads = []
  await restPage.route(`${endpoint}/**`, async (route) => {
    if (route.request().method() === 'PATCH') {
      const payload = route.request().postDataJSON()
      payloads.push(payload)
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'r-qa', ...payload }) })
    } else if (route.request().url().includes('/rpc/pedidos_pendientes_mesa')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[{"id":"p-qa","mesa_id":"m-qa","estado":"entregado","created_at":"2026-10-30T12:00:00Z"}]' })
    } else if (route.request().url().includes('/rpc/mesas_por_cobrar')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[{"mesa_id":"m-qa","mesa_nombre":"Mesa QA","total":1205,"pedidos":1205}]' })
    } else await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })
  await restPage.goto(url)
  const respuesta = await restPage.evaluate(async () => {
    const api = (await import('/src/lib/api.ts')).getApi()
    const guardado = await api.actualizarRestaurante('r-qa', { nombre: '  Local REST  ', ruc: '20512345678', direccion: ' Calle QA ', telefono: '+51 999 111 222', email_contacto: 'qa@local.pe', dominio: ' @Local-QA.PE/ ' })
    const prohibido = await api.actualizarRestaurante('r-qa', { nombre: 'Local', suscripcion_activa: true })
    const pendientes = await api.getPedidosDeMesa('r-qa', 'm-qa')
    const mesas = await api.getMesasPorCobrar('r-qa')
    return { guardado, prohibido, pendientes, mesas }
  })
  assert.equal(respuesta.guardado.error, null)
  assert(respuesta.prohibido.error)
  assert.equal(respuesta.pendientes.data[0].estado, 'entregado')
  assert.equal(respuesta.mesas.data[0].total, 1205)
  assert.equal(payloads.length, 1)
  assert.deepEqual(Object.keys(payloads[0]).sort(), ['nombre', 'ruc', 'direccion', 'telefono', 'email_contacto', 'dominio'].sort())
  assert.equal(payloads[0].dominio, 'local-qa.pe')
  await restPage.close()

  for (const width of [390, 1280]) {
    console.log(`Configuración QA: guardado, errores y persistencia ${width}px`)
    const context = await browser.newContext({ viewport: { width, height: 900 } })
    const page = await context.newPage()
    page.setDefaultTimeout(15000)
    const errores = []
    page.on('pageerror', (e) => errores.push(e.message))
    await page.goto(`${url}/demo/admin`, { waitUntil: 'networkidle' })
    const explorar = page.getByRole('button', { name: 'Explorar por mi cuenta' })
    if (await explorar.count()) await explorar.click()
    const minimizar = page.getByRole('button', { name: 'Minimizar guía' })
    if (await minimizar.count()) await minimizar.click()
    await page.getByRole('button', { name: 'Datos del local', exact: true }).click()
    await expect(page.locator('#cfg-nombre')).toHaveValue('Restaurante Demo')
    await expect(page.locator('#cfg-modo-cobro, #cfg-emitir-boleta')).toHaveCount(0)
    await page.locator('#cfg-nombre').fill('Local actualizado QA')
    await page.locator('#cfg-direccion').fill('Av. QA 123')
    await page.locator('#cfg-dominio').fill(' @Local-QA.PE/ ')
    const guardar = page.getByRole('button', { name: 'Guardar cambios', exact: true })
    await guardar.click()
    await expect(page.getByText('Datos guardados. La próxima precuenta y boleta usarán estos datos.', { exact: true })).toBeVisible()
    await expect(guardar).toBeDisabled()
    await expect(page.locator('#cfg-dominio')).toHaveValue('local-qa.pe')
    const original = await page.evaluate(async () => {
      const api = (await import('/src/lib/api.ts')).getApi()
      return (await api.getRestaurantes()).data.find((r) => r.id === 'r-demo')
    })
    assert.equal(original.nombre, 'Local actualizado QA')
    assert.equal(original.suscripcion_activa, true)
    const rechazoAtomico = await page.evaluate(async () => {
      const api = (await import('/src/lib/api.ts')).getApi()
      const antes = localStorage.getItem('mesora.demo.datos.v2')
      const res = await api.actualizarRestaurante('r-demo', { nombre: 'No se debe guardar', ruc: 'inválido' })
      return { error: res.error, sinCambios: antes === localStorage.getItem('mesora.demo.datos.v2') }
    })
    assert(rechazoAtomico.error)
    assert(rechazoAtomico.sinCambios)

    // El error mantiene el formulario editable; reintentar usa los mismos datos.
    await page.locator('#cfg-direccion').fill('Av. Reintento 456')
    await page.evaluate(async () => {
      const api = (await import('/src/lib/api.ts')).getApi()
      window.__guardarLocal = api.actualizarRestaurante
      api.actualizarRestaurante = async () => ({ data: null, error: 'Conexión interrumpida QA' })
    })
    await guardar.click()
    await expect(page.getByText('Conexión interrumpida QA', { exact: true })).toBeVisible()
    await expect(guardar).toBeEnabled()
    await expect(page.locator('#cfg-direccion')).toHaveValue('Av. Reintento 456')
    await page.evaluate(async () => { (await import('/src/lib/api.ts')).getApi().actualizarRestaurante = window.__guardarLocal })
    await guardar.click()
    await expect(guardar).toBeDisabled()
    await page.reload({ waitUntil: 'networkidle' })
    const guiaTrasRecargar = page.getByRole('button', { name: 'Minimizar guía' })
    if (await guiaTrasRecargar.count()) await guiaTrasRecargar.click()
    await page.getByRole('button', { name: 'Datos del local', exact: true }).click()
    await expect(page.locator('#cfg-nombre')).toHaveValue('Local actualizado QA')
    await expect(page.locator('#cfg-direccion')).toHaveValue('Av. Reintento 456')
    await expect(page.locator('#cfg-dominio')).toHaveValue('local-qa.pe')
    await page.getByRole('button', { name: 'Configuración operativa', exact: true }).click()
    const cobro = page.getByRole('region', { name: '¿Quién puede cobrar?' })
    await expect(cobro.getByText('Regla aún no activada', { exact: false })).toBeVisible()
    await cobro.getByRole('radio', { name: /Mixto/ }).check()
    const activar = cobro.getByRole('button', { name: 'Revisar y activar modalidad' })
    await expect(activar).toBeDisabled()
    await expect(cobro.getByText('Marca por lo menos un cajero y un mesero', { exact: false })).toBeVisible()
    await cobro.getByRole('button', { name: 'Ir al personal pendiente' }).click()
    await expect(cobro.getByRole('group', { name: 'Personal autorizado' })).toBeFocused()
    await expect(cobro.getByRole('checkbox')).toHaveCount(3)
    await cobro.getByRole('checkbox', { name: /Mesero/ }).first().check()
    await expect(activar).toBeDisabled()
    await cobro.getByRole('checkbox', { name: /Cajero/ }).check()
    await expect(activar).toBeEnabled()
    await cobro.getByRole('radio', { name: /Meseros/ }).check()
    await expect(cobro.getByRole('checkbox')).toHaveCount(2)
    await cobro.getByRole('radio', { name: /Solo caja/ }).check()
    await expect(cobro.getByRole('checkbox')).toHaveCount(1)
    const cajero = cobro.getByRole('checkbox').first()
    await cajero.check()
    await activar.click()
    await expect(page.getByText('El cambio y sus autorizaciones quedarán registrados en auditoría.')).toBeVisible()
    await expect(page.getByText('Mesora genera recibos internos, no boletas electrónicas SUNAT.', { exact: false })).toBeVisible()
    await page.getByRole('button', { name: 'Activar modalidad de cobro', exact: true }).click()
    await expect(cobro.getByText('Regla activa: Solo caja', { exact: false })).toBeVisible()
    await expect(cobro.getByText('Actualizada el', { exact: false })).toBeVisible()
    await cobro.getByRole('radio', { name: /Mixto/ }).check()
    await cobro.getByRole('checkbox', { name: /Mesero/ }).first().check()
    await page.evaluate(async () => {
      const api = (await import('/src/lib/api.ts')).getApi()
      window.__guardarPolitica = api.guardarPoliticaCobro
      api.guardarPoliticaCobro = async () => ({ data: null, error: 'Sin conexión con el servidor QA' })
    })
    await cobro.getByRole('button', { name: 'Guardar cambios de permisos' }).click()
    await page.getByRole('button', { name: 'Confirmar cambios' }).click()
    await expect(cobro.getByRole('alert')).toContainText('Sin conexión con el servidor QA')
    await expect(cobro.getByRole('checkbox', { name: /Mesero/ }).first()).toBeChecked()
    await page.evaluate(async () => { (await import('/src/lib/api.ts')).getApi().guardarPoliticaCobro = window.__guardarPolitica })
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click()
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
    await page.reload({ waitUntil: 'networkidle' })
    const guiaCobro = page.getByRole('button', { name: 'Minimizar guía' })
    if (await guiaCobro.count()) await guiaCobro.click()
    await page.getByRole('button', { name: 'Configuración operativa', exact: true }).click()
    await expect(page.getByRole('region', { name: '¿Quién puede cobrar?' }).getByText('Regla activa: Solo caja', { exact: false })).toBeVisible()
    await expect(page.getByRole('region', { name: '¿Quién puede cobrar?' }).getByText('Actualizada el', { exact: false })).toBeVisible()
    await page.getByRole('link', { name: 'Cajero', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Cobrar una mesa' })).toBeVisible()
    await expect(page.getByText('No hay mesas pendientes de cobro.')).toBeVisible()
    await expect(page.getByText('Tu cuenta no está autorizada para cobrar.', { exact: false })).toHaveCount(0)
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
    await page.getByRole('link', { name: 'Admin', exact: true }).click()
    await page.getByRole('button', { name: 'Personal', exact: true }).click()
    await page.getByRole('button', { name: /Agregar/ }).first().click()
    await expect(page.getByText('@local-qa.pe', { exact: true })).toBeVisible()
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
    assert.deepEqual(errores, [])
    await context.close()
  }
  console.log('Configuración OK: datos del local, modalidad de cobro confirmada y persistente, roles y responsive móvil/escritorio.')
} finally {
  if (browser) await browser.close()
  await server.close()
  rmSync(entorno, { recursive: true, force: true })
}
