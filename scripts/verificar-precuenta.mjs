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
      dato(await api.crearMesa('r-demo', { nombre: 'Mesa motivo UI QA', zona_id: zona.id }))
      const plato = dato(await api.crearProducto('r-demo', { nombre: 'Lomo saltado especial con acompañamiento de la casa', precio: 22.5, categoria_id: null, disponible: true }))
      const bebida = dato(await api.crearProducto('r-demo', { nombre: 'Bebida QA', precio: 5.5, categoria_id: null, disponible: true }))
      dato(await api.crearProducto('r-demo', { nombre: 'Producto motivo UI QA', precio: 0.01, categoria_id: null, disponible: true }))
      const pedido = dato(await api.crearPedido('r-demo', mesa.id, [
        { producto_id: plato.id, nombre_producto: plato.nombre, cantidad: 2, precio_unitario: 22.5 },
        { producto_id: bebida.id, nombre_producto: bebida.nombre, cantidad: 1, precio_unitario: 5.5 },
      ]))
      dato(await api.crearPedido('r-demo', mesa.id, [{ producto_id: bebida.id, nombre_producto: bebida.nombre, cantidad: 2, precio_unitario: 5.5 }]))
      const items = dato(await api.getPedidoItems([pedido]))
      const anulacion = await api.anularItem('r-demo', pedido, items.find((it) => it.producto_id === bebida.id).id, 'Bebida agregada por error')
      if (anulacion.error) throw new Error(anulacion.error)
    })
    await visitar('/demo/mesero')
    await page.evaluate(async () => {
      const { getApi } = await import('/src/lib/api.ts')
      const api = getApi()
      const dato = (r) => { if (r.error || r.data == null) throw new Error(r.error ?? 'Respuesta vacía'); return r.data }
      const mesas = dato(await api.getMesas('r-demo'))
      const productos = dato(await api.getProductos('r-demo'))
      const mesa = mesas.find((fila) => fila.nombre === 'Mesa motivo UI QA')
      const producto = productos.find((fila) => fila.nombre === 'Producto motivo UI QA')
      const pedido = dato(await api.crearPedido('r-demo', mesa.id, [{ producto_id: producto.id, nombre_producto: producto.nombre, cantidad: 1, precio_unitario: producto.precio }]))
      sessionStorage.setItem('qa.pedidoMotivoUi', pedido)
    })
    await visitar('/demo/mesero')
    await page.getByRole('button', { name: /Mesa motivo UI QA/ }).click()
    await page.getByRole('button', { name: 'Editar Producto motivo UI QA' }).click()
    await page.getByRole('button', { name: 'Anular ítem', exact: true }).click()
    const campoMotivo = page.getByLabel('Motivo de anulación')
    const botonAnular = page.getByRole('button', { name: 'Anular ítem', exact: true })
    await expect(campoMotivo).toBeVisible()
    await expect(botonAnular).toBeDisabled()
    await campoMotivo.fill('   ')
    await expect(botonAnular).toBeDisabled()
    await expect(page.getByRole('alert')).toContainText('Escribe el motivo')
    await campoMotivo.fill('Cambio solicitado por cliente')
    await expect(botonAnular).toBeEnabled()
    await page.evaluate(async () => {
      const { getApi } = await import('/src/lib/api.ts')
      const api = getApi()
      window.__apiAnularItemOriginal = api.anularItem
      window.__anulacionesUiQa = 0
      api.anularItem = async () => {
        window.__anulacionesUiQa++
        await new Promise((resolve) => setTimeout(resolve, 80))
        return { data: null, error: 'Failed to fetch' }
      }
    })
    await botonAnular.dblclick()
    await expect(page.getByText('No se pudo conectar. Revisa internet y actualiza la pantalla antes de repetir la operación.')).toBeVisible()
    assert.equal(await campoMotivo.inputValue(), 'Cambio solicitado por cliente', 'El motivo debe conservarse si la RPC falla')
    assert.equal(await page.evaluate(() => window.__anulacionesUiQa), 1, 'El doble clic solo debe disparar una solicitud')
    await page.evaluate(async () => {
      const { getApi } = await import('/src/lib/api.ts')
      getApi().anularItem = window.__apiAnularItemOriginal
    })
    await botonAnular.click()
    await expect(campoMotivo).toHaveCount(0)
    const motivoGuardado = await page.evaluate(async () => {
      const { getApi } = await import('/src/lib/api.ts')
      const api = getApi()
      const mesas = (await api.getMesas('r-demo')).data
      const productos = (await api.getProductos('r-demo')).data
      const mesa = mesas.find((fila) => fila.nombre === 'Mesa motivo UI QA')
      const producto = productos.find((fila) => fila.nombre === 'Producto motivo UI QA')
      const items = (await api.getPedidoItems([sessionStorage.getItem('qa.pedidoMotivoUi')])).data
      return items.find((item) => item.producto_id === producto.id)?.motivo_anulacion
    })
    assert.equal(motivoGuardado, 'Cambio solicitado por cliente')
    await page.getByRole('button', { name: /Volver a mesas/ }).click()
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
    await expect(page.getByRole('button', { name: 'Descargar recibo interno (PDF)' })).toBeVisible()
    await page.getByRole('button', { name: 'Listo', exact: true }).click()
    await expect(page.getByRole('button', { name: /Mesa precuenta QA.*Libre/ })).toBeVisible()
    escenarios++

    async function prepararMesaTraslado(prefijo, crearComanda = true) {
      return page.evaluate(async ({ nombre, crearComanda }) => {
        const { getApi } = await import('/src/lib/api.ts')
        const api = getApi()
        const dato = (r) => { if (r.error || r.data == null) throw new Error(r.error ?? 'Respuesta vacía'); return r.data }
        const zona = dato(await api.getZonas('r-demo')).find((fila) => fila.nombre === 'Salón QA')
        const producto = dato(await api.getProductos('r-demo')).find((fila) => fila.nombre === 'Producto motivo UI QA')
        const origen = dato(await api.crearMesa('r-demo', { nombre: `Mesa ${nombre} origen`, zona_id: zona.id }))
        const destino = dato(await api.crearMesa('r-demo', { nombre: `Mesa ${nombre} destino`, zona_id: zona.id }))
        const pedidoId = crearComanda
          ? dato(await api.crearPedido('r-demo', origen.id, [{ producto_id: producto.id, nombre_producto: producto.nombre, cantidad: 1, precio_unitario: producto.precio }]))
          : null
        return { origen: origen.nombre, destino: destino.nombre, origenId: origen.id, destinoId: destino.id, pedidoId }
      }, { nombre: prefijo, crearComanda })
    }

    const trasladoUi = await prepararMesaTraslado('reconciliación UI QA')
    await visitar('/demo/mesero')
    await page.evaluate(async () => {
      const api = (await import('/src/lib/api.ts')).getApi()
      window.__apiMoverOriginalUiQa = api.moverConsumoMesa
      window.__moverIntentosUiQa = 0
      api.moverConsumoMesa = async (...args) => {
        window.__moverIntentosUiQa++
        const confirmado = await window.__apiMoverOriginalUiQa(...args)
        return confirmado.error ? confirmado : { data: null, error: 'Failed to fetch' }
      }
    })
    await page.getByRole('button', { name: new RegExp(trasladoUi.origen) }).click()
    await page.getByRole('button', { name: 'Mover consumo a otra mesa', exact: true }).click()
    await page.locator('#mesa-destino-consumo').selectOption({ value: trasladoUi.destinoId })
    await page.locator('#mesa-motivo-operacion').fill('Cambio de mesa comprobado por QA')
    await page.getByRole('button', { name: 'Revisar y confirmar' }).click()
    await page.getByRole('button', { name: 'Confirmar y guardar' }).click()
    await expect(page.getByText(`Consumo movido correctamente de ${trasladoUi.origen} a ${trasladoUi.destino}`, { exact: true })).toBeVisible()
    const lecturaTrasladoUi = await page.evaluate(async ({ origenId, destinoId, pedidoId }) => {
      const api = (await import('/src/lib/api.ts')).getApi()
      const [mesas, origen, destino] = await Promise.all([api.getMesas('r-demo'), api.getPedidosDeMesa('r-demo', origenId), api.getPedidosDeMesa('r-demo', destinoId)])
      return {
        origen: mesas.data.find((m) => m.id === origenId)?.estado,
        destino: mesas.data.find((m) => m.id === destinoId)?.estado,
        pedidosOrigen: origen.data.map((p) => p.id),
        pedidosDestino: destino.data.map((p) => p.id),
        intentos: window.__moverIntentosUiQa,
        pedido: pedidoId,
      }
    }, trasladoUi)
    assert.equal(lecturaTrasladoUi.origen, 'libre')
    assert.equal(lecturaTrasladoUi.destino, 'ocupada')
    assert.deepEqual(lecturaTrasladoUi.pedidosOrigen, [])
    assert.deepEqual(lecturaTrasladoUi.pedidosDestino, [trasladoUi.pedidoId])
    assert.equal(lecturaTrasladoUi.intentos, 1, 'Un solo envío debe resolver el timeout con la lectura de estado')
    await page.evaluate(async () => {
      const api = (await import('/src/lib/api.ts')).getApi()
      api.moverConsumoMesa = window.__apiMoverOriginalUiQa
    })
    escenarios++

    const trasladoPendienteUi = await prepararMesaTraslado('pendiente UI QA')
    await visitar('/demo/mesero')
    await page.evaluate(async () => {
      const api = (await import('/src/lib/api.ts')).getApi()
      window.__apiMoverOriginalUiQa = api.moverConsumoMesa
      window.__moverIntentosUiQa = 0
      api.moverConsumoMesa = async () => {
        window.__moverIntentosUiQa++
        return { data: null, error: 'Failed to fetch' }
      }
    })
    await page.getByRole('button', { name: new RegExp(trasladoPendienteUi.origen) }).click()
    await page.getByRole('button', { name: 'Mover consumo a otra mesa', exact: true }).click()
    await page.locator('#mesa-destino-consumo').selectOption({ value: trasladoPendienteUi.destinoId })
    await page.locator('#mesa-motivo-operacion').fill('Verificación manual de QA')
    await page.getByRole('button', { name: 'Revisar y confirmar' }).click()
    await page.getByRole('button', { name: 'Confirmar y guardar' }).click()
    await expect(page.locator('p').filter({ hasText: 'No se pudo confirmar el resultado. Actualiza las mesas antes de volver a intentarlo' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Verificar resultado' })).toBeEnabled()
    await expect(page.getByRole('button', { name: 'Confirmar y guardar' })).toHaveCount(0)
    assert.equal(await page.evaluate(() => window.__moverIntentosUiQa), 1, 'La solicitud pendiente no debe reenviarse automáticamente')
    await page.getByRole('button', { name: 'Verificar resultado' }).click()
    await expect(page.getByText('Las mesas siguen en su estado original; el traslado no se registró. Ya puedes revisar y volver a intentar.')).toBeVisible()
    await expect(page.locator('#mesa-motivo-operacion')).toHaveValue('Verificación manual de QA')
    const estadoSinCambioUi = await page.evaluate(async ({ origenId, destinoId }) => {
      const api = (await import('/src/lib/api.ts')).getApi()
      const [mesas, origen, destino] = await Promise.all([api.getMesas('r-demo'), api.getPedidosDeMesa('r-demo', origenId), api.getPedidosDeMesa('r-demo', destinoId)])
      return { origen: mesas.data.find((m) => m.id === origenId)?.estado, destino: mesas.data.find((m) => m.id === destinoId)?.estado, origenCount: origen.data.length, destinoCount: destino.data.length }
    }, trasladoPendienteUi)
    assert.deepEqual(estadoSinCambioUi, { origen: 'ocupada', destino: 'libre', origenCount: 1, destinoCount: 0 })
    await page.evaluate(async () => {
      const api = (await import('/src/lib/api.ts')).getApi()
      api.moverConsumoMesa = window.__apiMoverOriginalUiQa
    })
    await page.getByRole('button', { name: 'Revisar y confirmar' }).click()
    await page.getByRole('button', { name: 'Confirmar y guardar' }).click()
    await expect(page.getByText(`Consumo movido correctamente de ${trasladoPendienteUi.origen} a ${trasladoPendienteUi.destino}`, { exact: true })).toBeVisible()
    assert.equal(await page.evaluate(() => window.__moverIntentosUiQa), 1)
    escenarios++

    // La lista del selector puede quedar obsoleta mientras el modal está abierto.
    await visitar('/demo/admin')
    const trasladoMesaOcupadaUi = await prepararMesaTraslado('destino ocupado UI QA')
    await visitar('/demo/mesero')
    await page.evaluate(async () => {
      const api = (await import('/src/lib/api.ts')).getApi()
      window.__apiMoverOriginalUiQa = api.moverConsumoMesa
      window.__moverIntentosUiQa = 0
      api.moverConsumoMesa = async (...args) => {
        window.__moverIntentosUiQa++
        return window.__apiMoverOriginalUiQa(...args)
      }
    })
    await page.getByRole('button', { name: new RegExp(trasladoMesaOcupadaUi.origen) }).click()
    await page.getByRole('button', { name: 'Mover consumo a otra mesa', exact: true }).click()
    await page.locator('#mesa-destino-consumo').selectOption({ value: trasladoMesaOcupadaUi.destinoId })
    await page.locator('#mesa-motivo-operacion').fill('Verificación del destino ocupado en QA')
    const estadoAntesBloqueo = await page.evaluate(async (ids) => {
      const api = (await import('/src/lib/api.ts')).getApi()
      const antes = JSON.parse(localStorage.getItem('mesora.demo.datos.v2') ?? '{}').auditLogs ?? []
      const producto = (await api.getProductos('r-demo')).data.find((p) => p.nombre === 'Producto motivo UI QA')
      const resultado = await api.crearPedido('r-demo', ids.destinoId, [{ producto_id: producto.id, nombre_producto: producto.nombre, cantidad: 1, precio_unitario: producto.precio }])
      if (resultado.error) throw new Error(resultado.error)
      return { auditorias: antes.filter((l) => l.accion === 'mesa_mover_consumo' && l.entidad_id === ids.origenId).length, pedidoDestinoId: resultado.data }
    }, trasladoMesaOcupadaUi)
    await page.getByRole('button', { name: 'Revisar y confirmar' }).click()
    await expect(page.getByRole('alert')).toHaveText(`${trasladoMesaOcupadaUi.destino} no está disponible porque tiene consumo pendiente. Elige otra mesa`)
    await expect(page.locator('#campo-pin-autorizacion')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Confirmar y guardar' })).toHaveCount(0)
    const bloqueoMesaOcupada = await page.evaluate(async (ids) => {
      const api = (await import('/src/lib/api.ts')).getApi()
      const [origen, destino] = await Promise.all([api.getPedidosDeMesa('r-demo', ids.origenId), api.getPedidosDeMesa('r-demo', ids.destinoId)])
      const auditoria = JSON.parse(localStorage.getItem('mesora.demo.datos.v2') ?? '{}').auditLogs ?? []
      return {
        intentos: window.__moverIntentosUiQa,
        origen: origen.data.map((p) => p.id),
        destino: destino.data.map((p) => p.id),
        auditorias: auditoria.filter((l) => l.accion === 'mesa_mover_consumo' && l.entidad_id === ids.origenId).length,
      }
    }, trasladoMesaOcupadaUi)
    assert.equal(bloqueoMesaOcupada.intentos, 0, 'La prevalidación debe impedir la RPC para destino ocupado')
    assert.deepEqual(bloqueoMesaOcupada.origen, [trasladoMesaOcupadaUi.pedidoId])
    assert.deepEqual(bloqueoMesaOcupada.destino, [estadoAntesBloqueo.pedidoDestinoId])
    assert.equal(bloqueoMesaOcupada.auditorias, estadoAntesBloqueo.auditorias)
    await page.evaluate(async () => { (await import('/src/lib/api.ts')).getApi().moverConsumoMesa = window.__apiMoverOriginalUiQa })
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click()
    escenarios++

    // Una ocupación que aparece entre la primera revisión y el RPC se reconcilia
    // automáticamente; el backend conserva el último bloqueo transaccional.
    await visitar('/demo/admin')
    await page.evaluate(async () => {
      const api = (await import('/src/lib/api.ts')).getApi()
      const configuracion = await api.configurarPinAutorizacion('r-demo', '4321')
      if (configuracion.error) throw new Error(configuracion.error)
      ;(await import('/src/components/pin.tsx')).olvidarPinCacheado()
    })
    const trasladoCarreraUi = await prepararMesaTraslado('carrera destino UI QA')
    await visitar('/demo/mesero')
    await page.evaluate(async () => {
      const api = (await import('/src/lib/api.ts')).getApi()
      window.__apiMoverOriginalUiQa = api.moverConsumoMesa
      window.__moverIntentosUiQa = 0
      api.moverConsumoMesa = async (...args) => {
        window.__moverIntentosUiQa++
        const producto = (await api.getProductos('r-demo')).data.find((p) => p.nombre === 'Producto motivo UI QA')
        const entrada = await api.crearPedido(args[0], args[2], [{ producto_id: producto.id, nombre_producto: producto.nombre, cantidad: 1, precio_unitario: producto.precio }])
        if (entrada.error) throw new Error(entrada.error)
        return window.__apiMoverOriginalUiQa(...args)
      }
    })
    await page.getByRole('button', { name: new RegExp(trasladoCarreraUi.origen) }).click()
    await page.getByRole('button', { name: 'Mover consumo a otra mesa', exact: true }).click()
    await page.locator('#mesa-destino-consumo').selectOption({ value: trasladoCarreraUi.destinoId })
    await page.locator('#mesa-motivo-operacion').fill('Carrera de ocupación durante revisión')
    await page.getByRole('button', { name: 'Revisar y confirmar' }).click()
    await expect(page.locator('#campo-pin-autorizacion')).toBeVisible()
    await page.locator('#campo-pin-autorizacion').fill('4321')
    await page.getByRole('button', { name: 'Confirmar y guardar' }).click()
    await expect(page.getByRole('alert')).toHaveText(`${trasladoCarreraUi.destino} no está disponible porque tiene consumo pendiente. Elige otra mesa`)
    await expect(page.locator('#campo-pin-autorizacion')).toHaveCount(0)
    const carreraReconciliada = await page.evaluate(async (ids) => {
      const api = (await import('/src/lib/api.ts')).getApi()
      const [origen, destino] = await Promise.all([api.getPedidosDeMesa('r-demo', ids.origenId), api.getPedidosDeMesa('r-demo', ids.destinoId)])
      const auditoria = JSON.parse(localStorage.getItem('mesora.demo.datos.v2') ?? '{}').auditLogs ?? []
      return {
        intentos: window.__moverIntentosUiQa,
        origen: origen.data.map((p) => p.id),
        destino: destino.data.map((p) => p.id),
        auditorias: auditoria.filter((l) => l.accion === 'mesa_mover_consumo' && l.entidad_id === ids.origenId).length,
      }
    }, trasladoCarreraUi)
    assert.equal(carreraReconciliada.intentos, 1)
    assert.deepEqual(carreraReconciliada.origen, [trasladoCarreraUi.pedidoId])
    assert.equal(carreraReconciliada.destino.length, 1)
    assert.equal(carreraReconciliada.auditorias, 0)
    await page.evaluate(async () => { (await import('/src/lib/api.ts')).getApi().moverConsumoMesa = window.__apiMoverOriginalUiQa })
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click()
    escenarios++

    // PIN inválido conserva el diálogo, no audita y no cambia las mesas; el PIN
    // válido permite después el único traslado y la única auditoría.
    await visitar('/demo/admin')
    const trasladoPinUi = await prepararMesaTraslado('pin traslado UI QA', false)
    await visitar('/demo/mesero')
    trasladoPinUi.pedidoId = await page.evaluate(async (origenId) => {
      const api = (await import('/src/lib/api.ts')).getApi()
      const producto = (await api.getProductos('r-demo')).data.find((p) => p.nombre === 'Producto motivo UI QA')
      const resultado = await api.crearPedido('r-demo', origenId, [{ producto_id: producto.id, nombre_producto: producto.nombre, cantidad: 1, precio_unitario: producto.precio }])
      if (resultado.error) throw new Error(resultado.error)
      return resultado.data
    }, trasladoPinUi.origenId)
    await visitar('/demo/mesero')
    await page.evaluate(async () => {
      const api = (await import('/src/lib/api.ts')).getApi()
      window.__apiMoverOriginalUiQa = api.moverConsumoMesa
      window.__moverIntentosUiQa = 0
      api.moverConsumoMesa = async (...args) => {
        window.__moverIntentosUiQa++
        return window.__apiMoverOriginalUiQa(...args)
      }
      ;(await import('/src/components/pin.tsx')).olvidarPinCacheado()
    })
    await page.getByRole('button', { name: new RegExp(trasladoPinUi.origen) }).click()
    await page.getByRole('button', { name: 'Mover consumo a otra mesa', exact: true }).click()
    await page.locator('#mesa-destino-consumo').selectOption({ value: trasladoPinUi.destinoId })
    await page.locator('#mesa-motivo-operacion').fill('Traslado con PIN validado por QA')
    await page.getByRole('button', { name: 'Revisar y confirmar' }).click()
    await expect(page.locator('#campo-pin-autorizacion')).toBeVisible()
    const auditoriasAntesPinUi = await page.evaluate(async (origenId) => {
      return (JSON.parse(localStorage.getItem('mesora.demo.datos.v2') ?? '{}').auditLogs ?? []).filter((l) => l.accion === 'mesa_mover_consumo' && l.entidad_id === origenId).length
    }, trasladoPinUi.origenId)
    await page.locator('#campo-pin-autorizacion').fill('0000')
    await page.getByRole('button', { name: 'Confirmar y guardar' }).click()
    await expect(page.getByRole('alert')).toHaveText('PIN incorrecto. No se realizó el traslado')
    await expect(page.locator('#campo-pin-autorizacion')).toBeVisible()
    const pinRechazadoUi = await page.evaluate(async (ids) => {
      const api = (await import('/src/lib/api.ts')).getApi()
      const [mesas, origen, destino] = await Promise.all([api.getMesas('r-demo'), api.getPedidosDeMesa('r-demo', ids.origenId), api.getPedidosDeMesa('r-demo', ids.destinoId)])
      const auditoria = JSON.parse(localStorage.getItem('mesora.demo.datos.v2') ?? '{}').auditLogs ?? []
      return {
        origenEstado: mesas.data.find((m) => m.id === ids.origenId)?.estado,
        destinoEstado: mesas.data.find((m) => m.id === ids.destinoId)?.estado,
        origen: origen.data.map((p) => p.id),
        destino: destino.data.map((p) => p.id),
        auditorias: auditoria.filter((l) => l.accion === 'mesa_mover_consumo' && l.entidad_id === ids.origenId).length,
        pinGuardado: Array.from({ length: sessionStorage.length }, (_, i) => sessionStorage.getItem(sessionStorage.key(i))).some((valor) => valor?.includes('0000')),
      }
    }, trasladoPinUi)
    assert.equal(pinRechazadoUi.origenEstado, 'ocupada')
    assert.equal(pinRechazadoUi.destinoEstado, 'libre')
    assert.deepEqual(pinRechazadoUi.origen, [trasladoPinUi.pedidoId])
    assert.deepEqual(pinRechazadoUi.destino, [])
    assert.equal(pinRechazadoUi.auditorias, auditoriasAntesPinUi)
    assert.equal(pinRechazadoUi.pinGuardado, false)
    await page.locator('#campo-pin-autorizacion').fill('4321')
    await page.getByRole('button', { name: 'Confirmar y guardar' }).click()
    await expect(page.getByText(`Consumo movido correctamente de ${trasladoPinUi.origen} a ${trasladoPinUi.destino}`, { exact: true })).toBeVisible()
    const trasladoPinValidoUi = await page.evaluate(async (ids) => {
      const api = (await import('/src/lib/api.ts')).getApi()
      const [origen, destino] = await Promise.all([api.getPedidosDeMesa('r-demo', ids.origenId), api.getPedidosDeMesa('r-demo', ids.destinoId)])
      const auditoria = JSON.parse(localStorage.getItem('mesora.demo.datos.v2') ?? '{}').auditLogs ?? []
      return {
        origen: origen.data.map((p) => p.id),
        destino: destino.data.map((p) => p.id),
        auditorias: auditoria.filter((l) => l.accion === 'mesa_mover_consumo' && l.entidad_id === ids.origenId).length,
        intentos: window.__moverIntentosUiQa,
        pinGuardado: Array.from({ length: sessionStorage.length }, (_, i) => sessionStorage.getItem(sessionStorage.key(i))).some((valor) => valor?.includes('4321')),
      }
    }, trasladoPinUi)
    assert.deepEqual(trasladoPinValidoUi.origen, [])
    assert.deepEqual(trasladoPinValidoUi.destino, [trasladoPinUi.pedidoId])
    assert.equal(trasladoPinValidoUi.auditorias, auditoriasAntesPinUi + 1)
    assert.equal(trasladoPinValidoUi.intentos, 2)
    assert.equal(trasladoPinValidoUi.pinGuardado, false)
    await page.evaluate(async () => { (await import('/src/lib/api.ts')).getApi().moverConsumoMesa = window.__apiMoverOriginalUiQa })
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
