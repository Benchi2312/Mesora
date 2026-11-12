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

async function explorarDemoSinGuia(page) {
  const panel = page.locator('[data-guia-panel]')
  await panel.waitFor({ state: 'visible' })
  const explorar = panel.getByRole('button', { name: 'Explorar por mi cuenta' })
  if (await explorar.count()) {
    await explorar.click()
  } else {
    await panel.getByRole('button', { name: 'Minimizar guía' }).click()
  }
  await panel.waitFor({ state: 'detached' })
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
    Object.defineProperty(window, 'AudioContext', {
      configurable: true,
      value: class {
        state = 'suspended'
        async resume() { throw new Error('El navegador bloqueó el audio') }
      },
    })
  })

  await page.goto(`${URL}/demo/cocina`, { waitUntil: 'networkidle', timeout: 45000 })
  await explorarDemoSinGuia(page)

  // networkidle no espera las consultas asíncronas de Cocina ni el fin de su
  // estado de carga. Espera el primer control del selector como señal funcional.
  await page.getByRole('button', { name: /^Cocina/ }).waitFor({ state: 'visible' })
  check('aparecen las tres estaciones operativas',
    await page.getByRole('button', { name: /^Cocina/ }).count() === 1 &&
    await page.getByRole('button', { name: /^Bar/ }).count() === 1 &&
    await page.getByRole('button', { name: /^Otros/ }).count() === 1)
  const estadoSonido = page.locator('[data-estado-sonido]')
  await estadoSonido.getByText('Sonido desactivado.', { exact: true }).waitFor()
  check('Cocina informa que el sonido inicia desactivado', await page.getByRole('button', { name: 'Activar sonido' }).getAttribute('aria-pressed') === 'false')
  await page.getByRole('button', { name: 'Activar sonido' }).click()
  await estadoSonido.getByText('El navegador no permitió el sonido. Actívalo de nuevo cuando estés listo.', { exact: true }).waitFor()
  check('el bloqueo del navegador se explica sin activar un estado falso', await page.getByRole('button', { name: 'Activar sonido' }).getAttribute('aria-pressed') === 'false')

  // El demo inicia vacío. Sembramos una mesa con un ítem de cocina y otro de
  // bar mediante el API local real; así ambas estaciones usan una comanda.
  await page.goto(`${URL}/demo/mesero`, { waitUntil: 'networkidle', timeout: 45000 })
  const pedidoPruebaId = await page.evaluate(async () => {
    const { getApi, apiMode } = await import('/src/lib/api.ts')
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
    const configActual = await api.getConfiguracionOperativa('r-demo')
    if (configActual.error || !configActual.data) throw new Error(configActual.error ?? 'No se leyó la configuración operativa')
    const configImpresion = {
      ...configActual.data,
      estaciones: configActual.data.estaciones.map((station) => {
        const esCocina = station.codigo === 'cocina'
        const esBar = station.codigo === 'bar'
        if (!esCocina && !esBar) return station
        const existingPrinter = station.destinos.find((destination) => destination.tipo === 'impresora' && destination.grupo === 'principal')
        const destinos = station.destinos.map((destination) => {
          if (destination.grupo !== 'principal') return destination
          if (destination.tipo === 'kds') return { ...destination, activo: esCocina }
          if (destination.tipo === 'impresora') return {
            ...destination,
            nombre: esCocina ? 'Impresora Cocina QA' : 'Impresora Barra QA',
            papel_mm: esCocina ? 80 : 58,
            configuracion: { copias: esCocina ? 2 : 1 },
            activo: true,
          }
          return destination
        })
        if (!existingPrinter) destinos.push({
          id: null,
          tipo: 'impresora',
          grupo: 'principal',
          nombre: esCocina ? 'Impresora Cocina QA' : 'Impresora Barra QA',
          papel_mm: esCocina ? 80 : 58,
          configuracion: { copias: esCocina ? 2 : 1 },
          activo: true,
        })
        return { ...station, activo: true, destinos }
      }),
    }
    const previousOperator = apiMode.operadorId
    apiMode.operadorId = 'u-admin'
    const guardada = await api.guardarConfiguracionOperativa('r-demo', configImpresion)
    apiMode.operadorId = previousOperator
    if (guardada.error) throw new Error(guardada.error)
    const pedido = await api.crearPedido('r-demo', mesa.data.id, [
      { producto_id: cocina.data.id, nombre_producto: cocina.data.nombre, cantidad: 1, precio_unitario: 12, nota: 'Sin sal' },
      { producto_id: bar.data.id, nombre_producto: bar.data.nombre, cantidad: 2, precio_unitario: 5, nota: 'Con hielo' },
    ])
    if (pedido.error || !pedido.data) throw new Error(pedido.error ?? 'No se creó pedido QA')
    return pedido.data
  })
  await page.goto(`${URL}/demo/cocina`, { waitUntil: 'networkidle', timeout: 45000 })
  await explorarDemoSinGuia(page)

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
      salidaCocina: pedido.rutasPorEstacion.cocina?.impresoras[0] ?? null,
      salidaBarra: pedido.rutasPorEstacion.bar?.impresoras[0] ?? null,
      barTieneKds: pedido.rutasPorEstacion.bar?.destinos.includes('kds') ?? false,
    }
  }, pedidoPruebaId)
  if (!pedidoMixto) throw new Error('El demo no tiene una comanda activa mixta para probar la separación')
  await page.getByRole('button', { name: /^Cocina/ }).click()
  check('la configuración mixta usa snapshots de 80 mm/2 copias en Cocina y 58 mm/1 copia en Barra',
    pedidoMixto.salidaCocina?.papel_mm === 80 && pedidoMixto.salidaCocina?.copias === 2 &&
    pedidoMixto.salidaBarra?.papel_mm === 58 && pedidoMixto.salidaBarra?.copias === 1 && !pedidoMixto.barTieneKds)
  await page.locator(`button[data-imprimir-salida="${pedidoMixto.salidaCocina.entrega_id}"]`).click()
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
  check('Cocina respeta el snapshot de 80 mm y dos copias',
    await ticket.getAttribute('data-paper-width') === '80' && (await dialog.innerText()).includes('2 copias'))
  await comprobarSalidaA4('Cocina con ancho guardado de 80 mm en impresora A4', 80)

  // Simula una respuesta de red incierta antes de registrar en el backend. Dos
  // eventos síncronos deben producir una única llamada y ofrecer reintento.
  await page.evaluate(async () => {
    const { getApi } = await import('/src/lib/api.ts')
    const api = getApi()
    window.__mesoraOriginalRegistrar = api.registrarImpresionSalidaComanda
    window.__mesoraRegistroSimulado = 0
    api.registrarImpresionSalidaComanda = async () => {
      window.__mesoraRegistroSimulado++
      await new Promise((resolve) => setTimeout(resolve, 120))
      return { data: null, error: 'TypeError: Failed to fetch' }
    }
  })
  const registrar = dialog.getByRole('button', { name: 'Registrar solicitud de impresión' })
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
    getApi().registrarImpresionSalidaComanda = window.__mesoraOriginalRegistrar
  })

  await dialog.getByRole('button', { name: 'Reintentar de forma segura' }).click()
  await dialog.getByRole('button', { name: 'Imprimir' }).waitFor()
  const auditoriasIniciales = await page.evaluate((pedidoId) => {
    const estado = JSON.parse(localStorage.getItem('mesora.demo.datos.v2') || '{}')
    return (estado.auditLogs || []).filter((log) => log.entidad_id === pedidoId && log.accion === 'comanda_imprimir').length
  }, pedidoMixto.id)
  check('el registro inicial se escribe una sola vez en la auditoría', auditoriasIniciales === 1, `filas=${auditoriasIniciales}`)

  await dialog.getByRole('button', { name: 'Imprimir' }).click()
  check('la impresión usa window.print() como mecanismo del navegador', await page.evaluate(() => window.__mesoraPrintCalls === 1))
  check('el estado de impresión temporal se limpia al cerrar el diálogo', await page.evaluate(() => !document.body.classList.contains('imprimir-comanda')))
  await dialog.getByRole('button', { name: 'Sí, salió' }).click()
  await dialog.getByText(/Impresi.*confirmada por el usuario/).waitFor()
  check('el usuario puede confirmar la salida del papel', await dialog.getByText('Impresión confirmada por el usuario.').count() === 1)
  await dialog.locator('#motivo-reimpresion').fill('Copia adicional solicitada por cocina')
  await dialog.getByRole('button', { name: 'Registrar reimpresi\u00f3n' }).click()
  await dialog.getByRole('button', { name: 'Imprimir' }).waitFor()
  await dialog.getByRole('button', { name: 'Imprimir' }).click()
  await dialog.getByRole('button', { name: 'S\u00ed, sali\u00f3' }).click()
  const auditoriaReimpresionCocina = await page.evaluate((pedidoId) => {
    const estado = JSON.parse(localStorage.getItem('mesora.demo.datos.v2') || '{}')
    return (estado.auditLogs || []).find((log) => log.entidad_id === pedidoId && log.accion === 'comanda_reimprimir')
  }, pedidoMixto.id)
  check('la reimpresión de Cocina exige motivo y registra auditoría',
    auditoriaReimpresionCocina?.actor_id === 'u-cocina' && auditoriaReimpresionCocina?.created_at &&
    auditoriaReimpresionCocina?.detalle?.mesa_nombre === pedidoMixto.mesa &&
    auditoriaReimpresionCocina?.detalle?.motivo === 'Copia adicional solicitada por cocina')
  check('window.print se ejecutó solo por los dos clics explícitos', await page.evaluate(() => window.__mesoraPrintCalls === 2))
  await dialog.getByRole('button', { name: 'Cerrar' }).last().click()

  await page.getByRole('button', { name: /^Bar/ }).click()
  check('la comanda de Barra solo impresora no aparece en el tablero KDS', await page.locator('[data-comanda-kds="' + pedidoMixto.id + '"]').count() === 0)
  const avisoBarraManual = page.locator('[data-estacion-solo-ticketera="bar"]')
  await avisoBarraManual.waitFor({ state: 'visible' })
  await avisoBarraManual.getByText('Barra trabaja solo con ticketera', { exact: true }).waitFor({ state: 'visible' })
  await avisoBarraManual.getByText('No hay pantalla KDS configurada.', { exact: true }).waitFor({ state: 'visible' })
  const comprobacionBarraManual = {
    texto: await avisoBarraManual.innerText(),
    titulo: await avisoBarraManual.getByText('Barra trabaja solo con ticketera', { exact: true }).count(),
    sinKdsConfigurado: await avisoBarraManual.getByText('No hay pantalla KDS configurada.', { exact: true }).count(),
    pendientes: await avisoBarraManual.getByText('1 comanda pendiente de impresión.', { exact: true }).count(),
    limitePapel: await avisoBarraManual.getByText('La impresión se realiza manualmente desde el navegador. Mesora no puede confirmar si salió papel.', { exact: true }).count(),
    regionesKds: await page.getByRole('region', { name: 'KDS de Barra' }).count(),
  }
  check('Barra solo ticketera explica que no tiene KDS y requiere impresión manual',
    comprobacionBarraManual.titulo === 1 && comprobacionBarraManual.sinKdsConfigurado === 1 &&
    comprobacionBarraManual.pendientes === 1 && comprobacionBarraManual.limitePapel === 1 &&
    comprobacionBarraManual.regionesKds === 0, JSON.stringify(comprobacionBarraManual))
  check('la cola de Barra muestra el contador singular correcto',
    await page.getByRole('region', { name: 'Cola de impresión manual de Barra' }).getByText('1 pendiente', { exact: true }).count() === 1)
  check('la acción de la cola indica abrir la impresión manual',
    await page.locator('button[data-imprimir-salida="' + pedidoMixto.salidaBarra.entrega_id + '"]').innerText() === 'Abrir impresión manual')
  await page.locator('button[data-imprimir-salida="' + pedidoMixto.salidaBarra.entrega_id + '"]').click()
  dialog = page.getByRole('dialog', { name: 'Comanda \u00b7 Barra' })
  await dialog.waitFor()
  ticket = dialog.locator('.comanda-print')
  const ticketBar = await ticket.innerText()
  check('Barra imprime solo sus productos y muestra el ancho y la copia configurados',
    pedidoMixto.bar.every((nombre) => ticketBar.includes(nombre)) &&
    pedidoMixto.cocina.every((nombre) => !ticketBar.includes(nombre)) &&
    ticketBar.includes('2 \u00d7') && ticketBar.includes('Con hielo') &&
    await ticket.getAttribute('data-paper-width') === '58' &&
    (await dialog.innerText()).includes('1 copia'))
  check('el ticket conserva el nombre de la impresora manual', (await dialog.innerText()).includes('Impresora Barra QA'))
  await comprobarSalidaA4('Barra con ancho guardado de 58 mm en impresora A4', 58)
  check('al abrir la salida manual no se imprime automáticamente', await page.evaluate(() => window.__mesoraPrintCalls === 2))
  await dialog.getByRole('button', { name: 'Registrar solicitud de impresi\u00f3n' }).click()
  await dialog.getByRole('button', { name: 'Imprimir' }).waitFor()
  await dialog.getByRole('button', { name: 'Imprimir' }).click()
  await dialog.getByRole('button', { name: 'S\u00ed, sali\u00f3' }).click()
  check('Barra abre el diálogo solamente tras la acción explícita', await page.evaluate(() => window.__mesoraPrintCalls === 3))
  await dialog.getByText(/Impresi.*confirmada por el usuario/).waitFor()
  await dialog.getByRole('button', { name: 'Cerrar' }).last().click()
  await page.locator('details summary').click()
  const accionReimpresionBarra = page.locator('button[data-reimprimir-salida="' + pedidoMixto.salidaBarra.entrega_id + '"]')
  check('la salida confirmada mantiene una acción explícita para reimprimir', await accionReimpresionBarra.count() === 1)
  await accionReimpresionBarra.click()
  dialog = page.getByRole('dialog', { name: /Comanda.*Bar/ })
  await dialog.waitFor()
  check('abrir reimpresión no abre el diálogo automáticamente', await page.evaluate(() => window.__mesoraPrintCalls === 3))
  await dialog.locator('button.btn-primary').last().click()
  await dialog.locator('#motivo-reimpresion').waitFor()
  await dialog.locator('#motivo-reimpresion').fill('La copia salió cortada')
  await dialog.getByRole('button', { name: 'Registrar reimpresión' }).click()
  await dialog.getByRole('button', { name: 'Imprimir' }).waitFor()
  await dialog.getByRole('button', { name: 'Imprimir' }).click()
  await dialog.getByRole('button', { name: 'Sí, salió' }).click()
  await dialog.getByText(/Reimpresión confirmada por el usuario/).waitFor()
  check('la reimpresión confirmada abre el diálogo solo al pulsar Imprimir', await page.evaluate(() => window.__mesoraPrintCalls === 4))
  const auditoriaReimpresionBarra = await page.evaluate((pedidoId) => {
    const estado = JSON.parse(localStorage.getItem('mesora.demo.datos.v2') || '{}')
    return (estado.auditLogs || []).find((log) => log.entidad_id === pedidoId && log.accion === 'comanda_reimprimir')
  }, pedidoMixto.id)
  check('Barra registra el motivo de reimpresión para una salida histórica', auditoriaReimpresionBarra?.detalle?.motivo === 'La copia salió cortada')


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

  const comandaBarraKds = await page.evaluate(async (mesaNombre) => {
    const { getApi, apiMode } = await import('/src/lib/api.ts')
    const api = getApi()
    const [config, mesas, productos] = await Promise.all([
      api.getConfiguracionOperativa('r-demo'),
      api.getMesas('r-demo'),
      api.getProductos('r-demo'),
    ])
    if (config.error || !config.data || mesas.error || productos.error) throw new Error('No se pudo preparar el escenario local de Barra con KDS')
    const configuracionConKdsBarra = {
      ...config.data,
      estaciones: config.data.estaciones.map((estacion) => estacion.codigo !== 'bar' ? estacion : ({
        ...estacion,
        destinos: estacion.destinos.map((destino) => destino.tipo === 'kds' && destino.grupo === 'principal' ? { ...destino, activo: true } : destino),
      })),
    }
    const actorAnterior = apiMode.operadorId
    apiMode.operadorId = 'u-admin'
    const guardada = await api.guardarConfiguracionOperativa('r-demo', configuracionConKdsBarra)
    apiMode.operadorId = 'u-mesero-1'
    try {
      if (guardada.error) throw new Error(guardada.error)
      const mesa = mesas.data?.find((fila) => fila.nombre === mesaNombre)
      const bebida = productos.data?.find((fila) => fila.nombre === 'Bebida QA impresión')
      if (!mesa || !bebida) throw new Error('No se encontró la mesa o bebida QA')
      const pedido = await api.crearPedido('r-demo', mesa.id, [{
        producto_id: bebida.id,
        nombre_producto: bebida.nombre,
        cantidad: 1,
        precio_unitario: bebida.precio,
        nota: 'Escenario KDS Barra',
      }])
      if (pedido.error || !pedido.data) throw new Error(pedido.error ?? 'No se creó la comanda QA de Barra KDS')
      return pedido.data
    } finally {
      apiMode.operadorId = actorAnterior
    }
  }, pedidoMixto.mesa)
  const rutaNuevaComandaBarra = await page.evaluate(async (pedidoId) => {
    const { getApi } = await import('/src/lib/api.ts')
    const resultado = await getApi().getPedidosActivos('r-demo')
    const pedido = resultado.data?.find((fila) => fila.id === pedidoId)
    return { error: resultado.error, destinos: pedido?.rutasPorEstacion?.bar?.destinos ?? [] }
  }, comandaBarraKds)
  check('el snapshot nuevo de Barra incluye el destino KDS',
    !rutaNuevaComandaBarra.error && rutaNuevaComandaBarra.destinos.includes('kds'), JSON.stringify(rutaNuevaComandaBarra))
  await page.goto(`${URL}/demo/cocina`, { waitUntil: 'networkidle', timeout: 45000 })
  await explorarDemoSinGuia(page)
  await page.getByRole('button', { name: /^Barra/ }).waitFor({ state: 'visible' })
  await page.getByRole('button', { name: /^Barra/ }).click()
  const kdsBarra = page.getByRole('region', { name: 'KDS de Barra' })
  await kdsBarra.waitFor({ state: 'visible' })
  const nuevaComandaBarra = kdsBarra.locator(`[data-comanda-kds="${comandaBarraKds}"]`)
  await nuevaComandaBarra.waitFor({ state: 'visible' })
  // La región KDS puede aparecer antes de terminar el siguiente ciclo de
  // lectura tras cambiar la estación. Esperamos el contenido que prueba que
  // la nueva comanda y sus estados ya llegaron a la interfaz.
  await kdsBarra.getByRole('heading', { name: 'Pendientes' }).waitFor({ state: 'visible' })
  await kdsBarra.getByRole('heading', { name: 'En preparación' }).waitFor({ state: 'visible' })
  await kdsBarra.getByRole('heading', { name: 'Listos' }).waitFor({ state: 'visible' })
  check('Barra con KDS muestra estados operativos y una comanda nueva',
    await kdsBarra.getByRole('heading', { name: 'Pendientes' }).count() === 1 &&
    await kdsBarra.getByRole('heading', { name: 'En preparación' }).count() === 1 &&
    await kdsBarra.getByRole('heading', { name: 'Listos' }).count() === 1 &&
    await kdsBarra.locator(`[data-comanda-kds="${comandaBarraKds}"]`).count() === 1)
  check('Barra con KDS explica cada etapa de preparación',
    await kdsBarra.getByText('Aún no empieza', { exact: true }).count() === 1 &&
    await kdsBarra.getByText('Se está preparando', { exact: true }).count() === 1 &&
    await kdsBarra.getByText('Preparación terminada', { exact: true }).count() === 1)
  check('el snapshot anterior de Barra sigue solo en impresión manual',
    await kdsBarra.locator(`[data-comanda-kds="${pedidoMixto.id}"]`).count() === 0 &&
    await page.locator('[data-salida-impresion]').count() > 0)
  check('Barra con KDS no abre impresión automáticamente', await page.evaluate(() => window.__mesoraPrintCalls === 0))
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
