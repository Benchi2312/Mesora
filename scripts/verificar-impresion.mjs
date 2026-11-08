import { chromium } from '@playwright/test'
import { spawn } from 'node:child_process'
import { mkdtempSync, openSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

const SCRIPTS = dirname(fileURLToPath(import.meta.url))
const RAIZ = join(SCRIPTS, '..')
const PUERTO = 5176
const URL = `http://127.0.0.1:${PUERTO}`
const ENV_DIR = mkdtempSync(join(tmpdir(), 'mesora-impresion-env-'))
const LOG = openSync(join(RAIZ, 'vite-impresion.log'), 'a')
let checks = 0
let fallos = 0

function check(nombre, condicion, detalle = '') {
  checks++
  if (condicion) {
    console.log(`  OK ${nombre}`)
    return
  }
  fallos++
  console.log(`  FALLA ${nombre}${detalle ? ` — ${detalle}` : ''}`)
}

function paginasPdf(pdf) {
  return (Buffer.from(pdf).toString('latin1').match(/\/Type\s*\/Page\b/g) ?? []).length
}

function iniciarVite() {
  return spawn(process.execPath, [join(SCRIPTS, 'qa-vite.mjs'), RAIZ, ENV_DIR, String(PUERTO)], {
    cwd: RAIZ,
    stdio: ['ignore', LOG, LOG],
  })
}

async function esperarServidor() {
  const inicio = Date.now()
  while (Date.now() - inicio < 60000) {
    try {
      if ((await fetch(URL)).ok) return
    } catch { /* espera a que Vite arranque */ }
    await new Promise((resolve) => setTimeout(resolve, 400))
  }
  throw new Error(`Vite no respondió en ${URL}`)
}

const vite = iniciarVite()
let browser
try {
  await esperarServidor()
  browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const page = await context.newPage()
  const erroresPagina = []
  page.on('pageerror', (error) => erroresPagina.push(String(error)))
  await page.addInitScript(() => {
    window.__mesoraPrintCalls = 0
    window.print = () => {
      window.__mesoraPrintCalls++
      window.dispatchEvent(new Event('afterprint'))
    }
  })

  await page.goto(`${URL}/demo/cocina`, { waitUntil: 'networkidle', timeout: 45000 })
  const explorar = page.getByRole('button', { name: 'Explorar por mi cuenta' })
  if (await explorar.count()) await explorar.first().click()
  const minimizar = page.getByRole('button', { name: 'Minimizar guía' })
  if (await minimizar.count()) await minimizar.first().click()

  check('aparecen las tres estaciones operativas',
    await page.getByRole('button', { name: /^Cocina/ }).count() === 1 &&
    await page.getByRole('button', { name: /^Bar/ }).count() === 1 &&
    await page.getByRole('button', { name: /^Otros/ }).count() === 1)

  // El demo inicia vacío. Sembramos una mesa con un ítem de cocina y otro de
  // bar mediante el API local real; así ambas estaciones usan una comanda.
  await page.goto(`${URL}/demo/mesero`, { waitUntil: 'networkidle', timeout: 45000 })
  const pedidoPruebaId = await page.evaluate(async () => {
    const { getApi } = await import('/src/lib/api.ts')
    const api = getApi()
    const zona = await api.crearZona('r-demo', 'QA impresión')
    if (zona.error || !zona.data) throw new Error(zona.error ?? 'No se creó zona QA')
    const mesa = await api.crearMesa('r-demo', { zona_id: zona.data.id, nombre: 'Mesa QA impresión' })
    if (mesa.error || !mesa.data) throw new Error(mesa.error ?? 'No se creó mesa QA')
    const cocina = await api.crearProducto('r-demo', {
      nombre: 'Plato QA impresión', categoria_id: null, precio: 12, disponible: true,
      es_bebida: false, estacion: 'cocina',
    })
    const bar = await api.crearProducto('r-demo', {
      nombre: 'Bebida QA impresión', categoria_id: null, precio: 5, disponible: true,
      es_bebida: true, estacion: 'bar',
    })
    if (cocina.error || !cocina.data || bar.error || !bar.data) throw new Error('No se crearon productos QA')
    const pedido = await api.crearPedido('r-demo', mesa.data.id, [
      { producto_id: cocina.data.id, nombre_producto: cocina.data.nombre, cantidad: 1, precio_unitario: 12, nota: 'Sin sal' },
      { producto_id: bar.data.id, nombre_producto: bar.data.nombre, cantidad: 2, precio_unitario: 5, nota: 'Con hielo' },
    ])
    if (pedido.error || !pedido.data) throw new Error(pedido.error ?? 'No se creó pedido QA')
    return pedido.data
  })
  await page.goto(`${URL}/demo/cocina`, { waitUntil: 'networkidle', timeout: 45000 })
  const explorarCocina = page.getByRole('button', { name: 'Explorar por mi cuenta' })
  if (await explorarCocina.count()) await explorarCocina.first().click()
  const minimizarCocina = page.getByRole('button', { name: 'Minimizar guía' })
  if (await minimizarCocina.count()) await minimizarCocina.first().click()

  const pedidosAntes = await page.evaluate(async () => {
    const { getApi } = await import('/src/lib/api.ts')
    return (await getApi().getPedidosActivos('r-demo')).data?.length ?? -1
  })

  // Selecciona una comanda activa que mezcle comida y bebida para verificar
  // ambas estaciones con el mismo pedido y evitar depender de IDs sembrados.
  const pedidoMixto = await page.evaluate(async (pedidoId) => {
    const [{ getApi }, { estacionDeProducto }] = await Promise.all([
      import('/src/lib/api.ts'),
      import('/src/domain/restaurant/impresionComandas.ts'),
    ])
    const api = getApi()
    const pedidos = (await api.getPedidosActivos('r-demo')).data ?? []
    const pedido = pedidos.find((pedido) => pedido.id === pedidoId && (() => {
      const estaciones = new Set(pedido.items.map((item) => estacionDeProducto(item)))
      return estaciones.has('cocina') && estaciones.has('bar')
    })())
    if (!pedido) return null
    const [mesas, meseros] = await Promise.all([api.getMesas('r-demo'), api.getMeseros('r-demo')])
    return {
      id: pedido.id,
      mesa: mesas.data?.find((mesa) => mesa.id === pedido.mesa_id)?.nombre ?? '',
      mesero: meseros.data?.find((mesero) => mesero.id === pedido.mesero_id)?.nombre ?? '',
      cocina: pedido.items.filter((item) => estacionDeProducto(item) === 'cocina').map((item) => item.nombre_producto),
      bar: pedido.items.filter((item) => estacionDeProducto(item) === 'bar').map((item) => item.nombre_producto),
    }
  }, pedidoPruebaId)
  if (!pedidoMixto) throw new Error('El demo no tiene una comanda activa mixta para probar la separación')
  await page.getByRole('button', { name: /^Cocina/ }).click()
  await page.locator(`button[data-imprimir-comanda="${pedidoMixto.id}"]`).click()
  let dialog = page.getByRole('dialog', { name: 'Comanda · Cocina' })
  await dialog.waitFor()
  let ticket = dialog.locator('.comanda-print')
  const ticketCocina = await ticket.innerText()
  async function comprobarSalidaA4(nombre, anchoEsperado) {
    await page.emulateMedia({ media: 'print' })
    await page.evaluate(() => document.body.classList.add('imprimir-comanda'))
    async function crearPdf(opciones) {
      await page.evaluate(() => document.body.classList.add('imprimir-comanda'))
      const resultado = await page.pdf(opciones)
      // Chromium también puede emitir `afterprint` al terminar Page.printToPDF.
      // Restablecemos el contexto para comprobar cada tamaño de papel aislado.
      await page.evaluate(() => document.body.classList.add('imprimir-comanda'))
      return resultado
    }
    const copiasEnDom = await page.locator('.comanda-print').count()
    const anchoReal = await ticket.evaluate((elemento) => Number.parseFloat(getComputedStyle(elemento).width) * 25.4 / 96)
    const pdf = await crearPdf({ format: 'A4', printBackground: true, preferCSSPageSize: false })
    const pdfConTamanoCSS = await crearPdf({ format: 'A4', printBackground: true, preferCSSPageSize: true })
    const pdfRollo = await crearPdf({ width: `${anchoEsperado}mm`, height: '150mm', printBackground: true, preferCSSPageSize: false })
    const paginas = paginasPdf(pdf)
    const paginasConTamanoCSS = paginasPdf(pdfConTamanoCSS)
    const paginasRollo = paginasPdf(pdfRollo)
    await page.evaluate(() => document.body.classList.remove('imprimir-comanda'))
    await page.emulateMedia({ media: 'screen' })
    check(`${nombre}: existe una sola copia imprimible`, copiasEnDom === 1, `copias=${copiasEnDom}`)
    check(`${nombre}: A4 genera una sola página`, paginas === 1, `páginas=${paginas}`)
    check(`${nombre}: tamaño CSS genera una sola página`, paginasConTamanoCSS === 1, `páginas=${paginasConTamanoCSS}`)
    check(`${nombre}: papel de rollo genera una sola página`, paginasRollo === 1, `páginas=${paginasRollo}`)
    check(`${nombre}: conserva ancho térmico de ${anchoEsperado} mm`, Math.abs(anchoReal - anchoEsperado) < 0.5, `ancho=${anchoReal.toFixed(2)} mm`)
  }
  check('la impresión de cocina incluye restaurante, mesa, mesero, fecha/hora y comanda',
    ticketCocina.includes('Restaurante Demo') && ticketCocina.includes(pedidoMixto.mesa) &&
    ticketCocina.includes(pedidoMixto.mesero) && ticketCocina.includes(`N.º ${pedidoMixto.id.slice(0, 8).toUpperCase()}`) &&
    ticketCocina.includes('Fecha') && ticketCocina.includes('Hora'))
  check('la estación cocina imprime solo el producto de cocina',
    pedidoMixto.cocina.every((nombre) => ticketCocina.includes(nombre)) &&
    pedidoMixto.bar.every((nombre) => !ticketCocina.includes(nombre)) &&
    ticketCocina.includes('1 ×') && ticketCocina.includes('Sin sal'))
  await dialog.getByLabel('Ancho de papel térmico').selectOption('80')
  check('la vista de impresión admite papel de 80 mm', await ticket.getAttribute('data-paper-width') === '80')
  await comprobarSalidaA4('Cocina con ancho 80 mm en impresora A4', 80)
  await dialog.getByLabel('Ancho de papel térmico').selectOption('58')
  check('la vista de impresión admite papel de 58 mm', await ticket.getAttribute('data-paper-width') === '58')
  await comprobarSalidaA4('Cocina con ancho 58 mm en impresora A4', 58)

  // Simula una respuesta de red incierta antes de registrar en el backend. Dos
  // eventos síncronos deben producir una única llamada y ofrecer reintento.
  await page.evaluate(async () => {
    const { getApi } = await import('/src/lib/api.ts')
    const api = getApi()
    window.__mesoraOriginalRegistrar = api.registrarImpresionComanda
    window.__mesoraRegistroSimulado = 0
    api.registrarImpresionComanda = async () => {
      window.__mesoraRegistroSimulado++
      await new Promise((resolve) => setTimeout(resolve, 120))
      return { data: null, error: 'TypeError: Failed to fetch' }
    }
  })
  const registrar = dialog.getByRole('button', { name: 'Registrar impresión' })
  await registrar.evaluate((button) => {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
  await dialog.getByText(/La solicitud pudo llegar al servidor/).waitFor()
  check('el doble clic no duplica la solicitud durante un fallo de conexión',
    await page.evaluate(() => window.__mesoraRegistroSimulado === 1))
  check('el error de red ofrece reintento seguro', await dialog.getByRole('button', { name: 'Reintentar de forma segura' }).count() === 1)
  await page.evaluate(async () => {
    const { getApi } = await import('/src/lib/api.ts')
    getApi().registrarImpresionComanda = window.__mesoraOriginalRegistrar
  })

  await dialog.getByRole('button', { name: 'Reintentar de forma segura' }).click()
  await dialog.getByRole('button', { name: 'Abrir diálogo de impresión' }).waitFor()
  const auditoriasIniciales = await page.evaluate((pedidoId) => {
    const estado = JSON.parse(localStorage.getItem('mesora.demo.datos.v2') || '{}')
    return (estado.auditLogs || []).filter((log) => log.entidad_id === pedidoId && log.accion === 'comanda_imprimir').length
  }, pedidoMixto.id)
  check('el registro inicial se escribe una sola vez en la auditoría', auditoriasIniciales === 1, `filas=${auditoriasIniciales}`)

  await dialog.getByRole('button', { name: 'Abrir diálogo de impresión' }).click()
  check('la impresión usa window.print() como mecanismo del navegador', await page.evaluate(() => window.__mesoraPrintCalls === 1))
  check('el estado de impresión temporal se limpia al cerrar el diálogo', await page.evaluate(() => !document.body.classList.contains('imprimir-comanda')))
  await dialog.getByRole('button', { name: 'Sí, salió' }).click()
  check('el usuario puede confirmar la salida del papel', await dialog.getByText('Impresión confirmada por el usuario.').count() === 1)
  await dialog.getByRole('button', { name: 'Cerrar' }).last().click()

  await page.getByRole('button', { name: /^Bar/ }).click()
  await page.locator(`button[data-imprimir-comanda="${pedidoMixto.id}"]`).click()
  dialog = page.getByRole('dialog', { name: 'Comanda · Bar' })
  await dialog.waitFor()
  ticket = dialog.locator('.comanda-print')
  const ticketBar = await ticket.innerText()
  check('la estación bar imprime solo la bebida de la misma comanda',
    pedidoMixto.bar.every((nombre) => ticketBar.includes(nombre)) &&
    pedidoMixto.cocina.every((nombre) => !ticketBar.includes(nombre)) &&
    ticketBar.includes('2 ×') && ticketBar.includes('Con hielo'))
  await dialog.getByLabel('Ancho de papel térmico').selectOption('80')
  await comprobarSalidaA4('Bar con ancho 80 mm en impresora A4', 80)
  await dialog.getByLabel('Ancho de papel térmico').selectOption('58')
  await comprobarSalidaA4('Bar con ancho 58 mm en impresora A4', 58)
  await dialog.getByLabel('Ancho de papel térmico').selectOption('80')
  await dialog.getByRole('button', { name: 'Registrar impresión' }).click()
  await dialog.getByRole('button', { name: 'Abrir diálogo de impresión' }).waitFor()
  await dialog.getByRole('button', { name: 'Abrir diálogo de impresión' }).click()
  await dialog.getByRole('button', { name: 'Sí, salió' }).click()
  await dialog.getByRole('button', { name: 'Cerrar' }).last().click()

  await page.getByRole('button', { name: /^Bar/ }).click()
  await page.locator(`button[data-imprimir-comanda="${pedidoMixto.id}"]`).click()
  dialog = page.getByRole('dialog', { name: 'Comanda · Bar' })
  await dialog.waitFor()
  await dialog.getByRole('button', { name: 'Registrar impresión' }).click()
  await dialog.getByLabel('Motivo de reimpresión').waitFor()
  check('una reimpresión exige motivo', await dialog.getByText(/entre 5 y 300 caracteres/).count() === 1)
  await dialog.getByLabel('Motivo de reimpresión').fill('La copia de cocina no salió')
  await dialog.getByRole('button', { name: 'Registrar reimpresión' }).click()
  await dialog.getByRole('button', { name: 'Abrir diálogo de impresión' }).waitFor()
  await comprobarSalidaA4('Reimpresión de Bar en A4', 80)
  const auditoriaReimpresion = await page.evaluate((pedidoId) => {
    const estado = JSON.parse(localStorage.getItem('mesora.demo.datos.v2') || '{}')
    return (estado.auditLogs || []).find((log) => log.entidad_id === pedidoId && log.accion === 'comanda_reimprimir')
  }, pedidoMixto.id)
  check('la reimpresión audita usuario, fecha, mesa y motivo',
    auditoriaReimpresion?.actor_id === 'u-cocina' && auditoriaReimpresion?.created_at &&
    auditoriaReimpresion?.detalle?.mesa_nombre === pedidoMixto.mesa &&
    auditoriaReimpresion?.detalle?.motivo === 'La copia de cocina no salió')
  await dialog.getByRole('button', { name: 'Abrir diálogo de impresión' }).click()
  check('el navegador muestra el diálogo para cada impresión registrada', await page.evaluate(() => window.__mesoraPrintCalls === 3))
  await dialog.getByRole('button', { name: 'No se imprimió' }).click()
  check('si no se confirma, muestra el mensaje requerido y pide motivo para reintentar',
    await dialog.getByText('La comanda fue registrada, pero no se pudo confirmar la impresión.', { exact: true }).count() === 1 &&
    await dialog.getByLabel('Motivo de reimpresión').count() === 1)

  await page.setViewportSize({ width: 360, height: 640 })
  const responsive = await page.evaluate(() => ({
    anchoDocumento: document.documentElement.scrollWidth,
    anchoVentana: window.innerWidth,
    dialogoDerecho: document.querySelector('[role="dialog"]')?.getBoundingClientRect().right ?? 0,
  }))
  check('el flujo de impresión cabe en móvil de 360 px',
    responsive.anchoDocumento <= responsive.anchoVentana + 1 && responsive.dialogoDerecho <= responsive.anchoVentana + 1,
    JSON.stringify(responsive))

  const pedidosDespues = await page.evaluate(async () => {
    const { getApi } = await import('/src/lib/api.ts')
    return (await getApi().getPedidosActivos('r-demo')).data?.length ?? -1
  })
  check('imprimir y reimprimir no crea pedidos ni comandas', pedidosDespues === pedidosAntes, `${pedidosAntes} → ${pedidosDespues}`)
  check('la vista de impresión no genera errores de JavaScript', erroresPagina.length === 0, erroresPagina.join(' | '))
  await context.close()
} catch (error) {
  fallos++
  checks++
  console.error(`FALLA inesperada de QA impresión: ${String(error).slice(0, 500)}`)
} finally {
  if (browser) await browser.close()
  vite.kill()
  rmSync(ENV_DIR, { recursive: true, force: true })
}

console.log(`\n${'-'.repeat(56)}`)
if (fallos === 0) console.log(`IMPRESIÓN OK: ${checks} comprobaciones.`)
else {
  console.log(`IMPRESIÓN FALLÓ: ${fallos} de ${checks} comprobaciones.`)
  process.exitCode = 1
}
