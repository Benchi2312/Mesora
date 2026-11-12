// QA aislado: solo demo en un navegador nuevo; nunca usa ni modifica Supabase.
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import { chromium, expect } from '@playwright/test'

const raiz = fileURLToPath(new URL('..', import.meta.url))
const entorno = mkdtempSync(join(tmpdir(), 'mesora-precuenta-'))
const server = await createServer({ root: raiz, envDir: entorno, logLevel: 'error', server: { host: '127.0.0.1', port: 0 } })
let browser
let escenarios = 0
try {
  const { crearPrecuenta } = await server.ssrLoadModule('/src/domain/cashier/precuenta.ts')
  const mesa = { id: 'm', nombre: 'Mesa QA' }
  const pedidos = [{ id: 'p', mesa_id: 'm', estado: 'entregado' }, { id: 'a', mesa_id: 'm', estado: 'anulado' }]
  const item = { id: 'i', pedido_id: 'p', nombre_producto: 'Producto', cantidad: 3, precio_unitario: 0.1 }
  const fuente = [item, { ...item, id: 'cancelado', anulado: true }, { ...item, id: 'ajeno', pedido_id: 'otro' }, { ...item, id: 'pedido-anulado', pedido_id: 'a' }]
  const antes = JSON.stringify({ pedidos, fuente })
  const resultado = crearPrecuenta(mesa, pedidos, fuente)
  assert.equal(resultado.total, 0.3)
  assert.equal(resultado.items.length, 1)
  assert.equal(JSON.stringify({ pedidos, fuente }), antes)
  resultado.items[0].nombre_producto = 'Copia'
  assert.equal(item.nombre_producto, 'Producto')
  assert.throws(() => crearPrecuenta(mesa, [{ ...pedidos[0], mesa_id: 'otra' }], [item]), /otra mesa/)
  assert.throws(() => crearPrecuenta(mesa, [], []), /consumo pendiente/)
  assert.throws(() => crearPrecuenta(mesa, pedidos, [{ ...item, precio_unitario: NaN }]), /inválidos/)
  assert.throws(() => crearPrecuenta(mesa, pedidos, [{ ...item, cantidad: -1 }]), /inválidos/)
  escenarios += 5
  await server.listen()
  const url = `http://127.0.0.1:${server.httpServer.address().port}`
  browser = await chromium.launch({ headless: true })
  const capturas = join(raiz, 'capturas', 'precuenta')
  mkdirSync(capturas, { recursive: true })
  for (const width of [390, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, acceptDownloads: true })
    const page = await context.newPage()
    page.setDefaultTimeout(15000)
    const errores = []
    page.on('pageerror', (e) => errores.push(e.message))
    async function visitar(ruta) {
      await page.goto(`${url}${ruta}`, { waitUntil: 'networkidle' })
      const explorar = page.getByRole('button', { name: 'Explorar por mi cuenta' })
      if (await explorar.count()) await explorar.click()
      const minimizar = page.getByRole('button', { name: 'Minimizar guía' })
      if (await minimizar.count()) await minimizar.click()
    }
    async function navegarACajaAdmin() {
      if (width < 1024) {
        const abrirMenu = page.getByRole('button', { name: 'Abrir menú de administración' })
        await expect(abrirMenu).toBeVisible()
        await abrirMenu.click()

        const drawer = page.getByRole('dialog', { name: 'Navegación de administración' })
        await expect(drawer).toBeVisible()
        await drawer.getByRole('button', { name: 'Caja', exact: true }).click()
        await expect(drawer).toHaveCount(0)
      } else {
        await page.getByRole('navigation', { name: 'Secciones de administración' })
          .getByRole('button', { name: 'Caja', exact: true }).click()
      }
      await expect(page.locator('[data-admin-active-section="caja"]')).toBeVisible()
    }
    console.log(`Precuenta QA: preparando datos ${width}px`)
    await visitar('/demo/admin')
    await page.evaluate(async () => {
      const { getApi, reiniciarDemoDatos } = await import('/src/lib/api.ts')
      reiniciarDemoDatos()
      const api = getApi()
      const dato = (r) => { if (r.error || r.data == null) throw new Error(r.error ?? 'Respuesta vacía'); return r.data }
      const zona = dato(await api.crearZona('r-demo', 'Salón QA'))
      const mesa = dato(await api.crearMesa('r-demo', { nombre: 'Mesa precuenta QA', zona_id: zona.id }))
      const plato = dato(await api.crearProducto('r-demo', { nombre: 'Lomo saltado especial con acompañamiento de la casa', precio: 22.5, categoria_id: null, disponible: true }))
      const bebida = dato(await api.crearProducto('r-demo', { nombre: 'Bebida QA', precio: 5.5, categoria_id: null, disponible: true }))
      const pedido = dato(await api.crearPedido('r-demo', mesa.id, [
        { producto_id: plato.id, nombre_producto: plato.nombre, cantidad: 2, precio_unitario: 22.5 },
        { producto_id: bebida.id, nombre_producto: bebida.nombre, cantidad: 1, precio_unitario: 5.5 },
      ]))
      dato(await api.crearPedido('r-demo', mesa.id, [{ producto_id: bebida.id, nombre_producto: bebida.nombre, cantidad: 2, precio_unitario: 5.5 }]))
      const items = dato(await api.getPedidoItems([pedido]))
      const anulacion = await api.anularItem('r-demo', pedido, items.find((it) => it.producto_id === bebida.id).id)
      if (anulacion.error) throw new Error(anulacion.error)
    })
    await visitar('/demo/mesero')
    await page.getByRole('button', { name: /Mesa precuenta QA/ }).click()
    const datosAntes = await page.evaluate(() => localStorage.getItem('mesora.demo.datos.v2'))
    await page.getByRole('button', { name: 'Ver precuenta', exact: true }).click()
    await expect(page.getByTestId('precuenta-total')).toHaveText(/56[,.]00/)
    console.log(`Precuenta QA: comprobando impresión y PDF ${width}px`)
    await expect(page.locator('.precuenta-print tbody tr')).toHaveCount(2)
    await expect(page.locator('.precuenta-print')).toContainText('No es un comprobante de pago.')
    assert.equal(await page.evaluate(() => localStorage.getItem('mesora.demo.datos.v2')), datosAntes)
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
    await page.screenshot({ path: join(capturas, `precuenta-${width}.png`), fullPage: true })
    await page.evaluate(() => { window.__impresiones = 0; window.print = () => { window.__impresiones++ } })
    await page.getByRole('button', { name: 'Imprimir precuenta', exact: true }).click()
    assert.equal(await page.evaluate(() => window.__impresiones), 1)
    await page.emulateMedia({ media: 'print' })
    assert.equal(await page.locator('.precuenta-print').evaluate((el) => getComputedStyle(el).visibility), 'visible')
    const papel = await page.pdf({ path: join(capturas, `impresion-${width}.pdf`), format: 'A4' })
    assert.equal((papel.toString('latin1').match(/\/Type \/Page\b/g) ?? []).length, 1, 'La impresión corta no debe generar páginas vacías')
    await page.emulateMedia({ media: 'screen' })
    const descargaPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Descargar precuenta (PDF)', exact: true }).click()
    const descarga = await descargaPromise
    const pdf = readFileSync(await descarga.path())
    assert.equal(pdf.subarray(0, 4).toString(), '%PDF')
    assert(pdf.toString('latin1').includes('PRECUENTA'))
    assert(!pdf.toString('latin1').includes('BOLETA'))
    assert.equal(await page.evaluate(() => localStorage.getItem('mesora.demo.datos.v2')), datosAntes)
    escenarios += 4
    if (width === 1280) {
      const largaPromise = page.waitForEvent('download')
      await page.evaluate(async () => {
        const { descargarPrecuentaPdf } = await import('/src/domain/cashier/precuentaPdf.ts')
        descargarPrecuentaPdf({
          fecha: new Date().toISOString(), mesaId: 'qa', mesaNombre: 'Mesa extensa QA', pedidos: 1, total: 1200,
          items: Array.from({ length: 120 }, (_, i) => ({ id: String(i), pedido_id: 'qa', nombre_producto: `Item ${i} - Producto de nombre extenso con varios ingredientes y detalles del menu`, cantidad: 1, precio_unitario: 10, importe: 10 })),
        }, { nombre: 'Restaurante QA' })
      })
      const larga = await largaPromise
      const contenido = readFileSync(await larga.path()).toString('latin1')
      assert((contenido.match(/\/Type \/Page\b/g) ?? []).length > 1)
      assert(contenido.includes('Item 119'))
      assert(contenido.includes('TOTAL CONSUMO'))
      await larga.saveAs(join(capturas, 'precuenta-extensa.pdf'))
      escenarios++
    }

    // Fallo de lectura: no mostrar un recibo viejo y permitir recuperar la carga.
    await page.evaluate(async () => {
      const api = (await import('/src/lib/api.ts')).getApi()
      window.__getItems = api.getPedidoItems
      api.getPedidoItems = async () => ({ data: null, error: 'Fallo de conexión QA' })
    })
    await page.getByRole('button', { name: 'Actualizar precuenta', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText('Fallo de conexión QA')
    await expect(page.locator('.precuenta-print')).toHaveCount(0)
    await page.evaluate(async () => { (await import('/src/lib/api.ts')).getApi().getPedidoItems = window.__getItems })
    await page.getByRole('button', { name: 'Actualizar precuenta', exact: true }).click()
    await expect(page.getByTestId('precuenta-total')).toHaveText(/56[,.]00/)
    escenarios++
    // Otra terminal cierra la cuenta entre la lectura de pedidos y la de ítems.
    await page.evaluate(async () => {
      const api = (await import('/src/lib/api.ts')).getApi()
      window.__getPedidos = api.getPedidosDeMesa
      let llamadas = 0
      api.getPedidosDeMesa = (...args) => ++llamadas === 1 ? window.__getPedidos(...args) : Promise.resolve({ data: [], error: null })
    })
    await page.getByRole('button', { name: 'Actualizar precuenta', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText('La cuenta cambió en otra terminal')
    await expect(page.locator('.precuenta-print')).toHaveCount(0)
    await page.evaluate(async () => { (await import('/src/lib/api.ts')).getApi().getPedidosDeMesa = window.__getPedidos })
    await page.getByRole('button', { name: 'Actualizar precuenta', exact: true }).click()
    await expect(page.getByTestId('precuenta-total')).toHaveText(/56[,.]00/)
    escenarios++
    await page.getByRole('button', { name: '← Volver', exact: true }).click()
    await page.getByRole('button', { name: /Cerrar cuenta ·/ }).click()
    await page.getByRole('button', { name: 'Ver precuenta', exact: true }).click()
    await expect(page.getByTestId('precuenta-total')).toHaveText(/56[,.]00/)
    await page.getByRole('button', { name: '← Volver', exact: true }).click()
    await expect(page.getByRole('button', { name: /^Cobrar / })).toBeEnabled()
    assert.equal(await page.evaluate(() => localStorage.getItem('mesora.demo.datos.v2')), datosAntes)
    escenarios++
    await visitar('/demo/cajero')
    await page.getByRole('button', { name: /^Precuenta Mesa precuenta QA/ }).click()
    await expect(page.getByTestId('precuenta-total')).toHaveText(/56[,.]00/)
    await visitar('/demo/admin')
    await navegarACajaAdmin()
    await page.getByRole('button', { name: /^Precuenta Mesa precuenta QA/ }).click()
    await expect(page.getByTestId('precuenta-total')).toHaveText(/56[,.]00/)
    // El flujo de cobro sigue operativo después de consultar la precuenta.
    await visitar('/demo/mesero')
    await page.getByRole('button', { name: /Mesa precuenta QA/ }).click()
    await page.getByRole('button', { name: /Cerrar cuenta ·/ }).click()
    await page.getByRole('button', { name: /^Cobrar / }).click()
    await expect(page.getByRole('button', { name: 'Descargar boleta (PDF)' })).toBeVisible()
    await page.getByRole('button', { name: 'Listo', exact: true }).click()
    await expect(page.getByRole('button', { name: /Mesa precuenta QA.*Libre/ })).toBeVisible()
    escenarios++
    assert.deepEqual(errores, [])
    escenarios++
    await context.close()
  }
  console.log(`Precuenta: ${escenarios} escenarios correctos (dominio, mesero, caja, admin, PDF, impresión y recuperación de errores; móvil/escritorio).`)
} finally {
  if (browser) await browser.close()
  await server.close()
  rmSync(entorno, { recursive: true, force: true })
}
