// Verificación de responsive sin mirar capturas: recorre las rutas reales en
// varios anchos y falla si algo se sale del viewport (scroll horizontal) o si
// un control táctil queda por debajo de 32 px de alto.
//
//   npm run verificar:responsive
//
// Levanta Vite con un directorio de entorno vacío para usar los datos mock,
// sin mover .env.local ni cambiar la configuración de otros servidores.

import { chromium } from '@playwright/test'
import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, openSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'

const SCRIPTS = dirname(fileURLToPath(import.meta.url))
const RAIZ = join(SCRIPTS, '..')
const CAPTURAS = mkdtempSync(join(tmpdir(), 'mesora-responsive-capturas-'))
const PUERTO = 5175
const URL = `http://127.0.0.1:${PUERTO}`

const VIEWPORTS = [
  { w: 360, h: 640, nombre: '360x640' },
  { w: 390, h: 844, nombre: '390x844' },
  { w: 768, h: 1024, nombre: '768x1024' },
  { w: 1024, h: 768, nombre: '1024x768' },
  { w: 1280, h: 800, nombre: '1280x800' },
]

// Incluye los puntos en que cambia el diseño y el ancho que provocó el
// solapamiento de la cabecera en tablet. Se revisa la landing por separado
// para no repetir todas las sesiones operativas en cada uno de estos anchos.
const LANDING_VIEWPORTS = [320, 360, 390, 414, 639, 640, 767, 768, 820, 1023, 1024, 1100, 1279, 1280, 1366, 1920]
  .map((w) => ({ w, h: 800, nombre: `${w}x800` }))

// Cada entrada: ruta + pestañas que hay que abrir dentro de ella (por nombre
// accesible del botón) para revisar todas las pantallas.
const PANTALLAS = [
  { ruta: '/', nombre: 'landing' },
  { ruta: '/login', nombre: 'login' },
  {
    ruta: '/demo/admin',
    nombre: 'admin',
    tabs: ['Dashboard', 'Ventas', 'Caja', 'Cobros', 'Mesas y zonas', 'Menú', 'Personal', 'Datos del local', 'Configuración operativa', 'Impresión automática', 'Auditoría', 'Soporte'],
  },
  { ruta: '/demo/mesero', nombre: 'mesero' },
  { ruta: '/demo/cocina', nombre: 'cocina' },
  { ruta: '/demo/cajero', nombre: 'cajero' },
]

const ENV_DIR = mkdtempSync(join(tmpdir(), 'mesora-responsive-env-'))

mkdirSync(CAPTURAS, { recursive: true })

let fallos = 0
let checks = 0
function check(nombre, condicion, detalle = '') {
  checks++
  if (condicion) return
  fallos++
  console.log(`  FALLA ${nombre}${detalle ? ` — ${detalle}` : ''}`)
}

function iniciarVite() {
  const log = openSync(join(RAIZ, 'vite-responsive.log'), 'a')
  const entry = join(SCRIPTS, 'qa-vite.mjs')
  return spawn(process.execPath, [entry, RAIZ, ENV_DIR, String(PUERTO)], {
    cwd: RAIZ,
    stdio: ['ignore', log, log],
  })
}

async function esperarServidor(timeout = 60000) {
  const inicio = Date.now()
  while (Date.now() - inicio < timeout) {
    try {
      const res = await fetch(URL)
      if (res.ok) return
    } catch {
      /* todavía no levanta */
    }
    await new Promise((r) => setTimeout(r, 400))
  }
  throw new Error(`Vite no respondió en ${URL}`)
}

/**
 * Inspecciona el documento y devuelve los elementos que se salen a la derecha
 * del viewport. Ignora los `position: fixed` invisibles y los SVG decorativos.
 */
async function medir(page, vp, etiqueta) {
  const datos = await page.evaluate((ancho) => {
    const desbordes = []
    for (const el of document.querySelectorAll('body *')) {
      const estilo = getComputedStyle(el)
      if (estilo.display === 'none' || estilo.visibility === 'hidden' || Number(estilo.opacity) === 0) continue
      const r = el.getBoundingClientRect()
      if (r.width < 1 || r.height < 1) continue
      // Un contenedor con overflow propio y scroll horizontal es intencional.
      const scroller = el.closest('[class*="overflow-x-auto"]')
      if (scroller && scroller !== el) continue
      if (r.right > ancho + 1 || r.left < -1) {
        desbordes.push({
          tag: el.tagName.toLowerCase(),
          clase: String(el.className || '').slice(0, 120),
          texto: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60),
          izq: Math.round(r.left),
          der: Math.round(r.right),
        })
      }
    }
    const scroll = document.documentElement.scrollWidth
    const chicos = []
    for (const el of document.querySelectorAll('button, a.btn, input, select, textarea')) {
      const estilo = getComputedStyle(el)
      if (estilo.display === 'none' || estilo.visibility === 'hidden' || el.disabled) continue
      const r = el.getBoundingClientRect()
      if (r.width < 1 || r.height < 1) continue
      if (r.height < 28) {
        chicos.push({
          tag: el.tagName.toLowerCase(),
          texto: (el.textContent || el.getAttribute('placeholder') || '').trim().slice(0, 40),
          alto: Math.round(r.height),
        })
      }
    }
    // Con un diálogo abierto, los controles del fondo quedan cubiertos por el
    // modal. Solo sus botones son interactivos; medir cruces entre botones del
    // fondo y la cabecera fija produce falsos positivos después del scroll.
    const dialogo = [...document.querySelectorAll('[role="dialog"]')].find((el) => {
      const estilo = getComputedStyle(el)
      return estilo.display !== 'none' && estilo.visibility !== 'hidden' && el.getBoundingClientRect().width > 0
    })
    const botones = [...document.querySelectorAll('button')].filter((el) => {
      if (dialogo && !dialogo.contains(el)) return false
      const estilo = getComputedStyle(el)
      const r = el.getBoundingClientRect()
      return estilo.display !== 'none' && estilo.visibility !== 'hidden' && Number(estilo.opacity) !== 0 && r.width > 1 && r.height > 1
    })
    const solapados = []
    for (let i = 0; i < botones.length; i++) {
      const a = botones[i].getBoundingClientRect()
      for (let j = i + 1; j < botones.length; j++) {
        if (botones[i].contains(botones[j]) || botones[j].contains(botones[i])) continue
        const b = botones[j].getBoundingClientRect()
        const anchoComun = Math.min(a.right, b.right) - Math.max(a.left, b.left)
        const altoComun = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
        if (anchoComun > 3 && altoComun > 3) {
          const texto = (el) => (el.getAttribute('aria-label') || el.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 35)
          solapados.push({ a: texto(botones[i]), b: texto(botones[j]), ancho: Math.round(anchoComun), alto: Math.round(altoComun) })
        }
      }
    }
    return { scroll, ancho: window.innerWidth, desbordes, chicos, solapados }
  }, vp.w)

  check(`sin scroll horizontal en ${etiqueta}`, datos.scroll <= datos.ancho + 1, `scrollWidth=${datos.scroll}`)
  check(
    `nada se sale del viewport en ${etiqueta}`,
    datos.desbordes.length === 0,
    datos.desbordes.slice(0, 4).map((d) => `${d.tag}.${d.clase} [${d.izq}..${d.der}] "${d.texto}"`).join(' · '),
  )
  check(
    `controles táctiles de al menos 28 px en ${etiqueta}`,
    datos.chicos.length === 0,
    datos.chicos.slice(0, 5).map((c) => `${c.tag} "${c.texto}" ${c.alto}px`).join(' · '),
  )
  if (vp.w <= 768) {
    check(
      `botones sin superponerse en ${etiqueta}`,
      datos.solapados.length === 0,
      datos.solapados.slice(0, 4).map((b) => `"${b.a}" / "${b.b}" (${b.ancho}x${b.alto}px)`).join(' · '),
    )
  }
  if (datos.desbordes.length > 0) {
    await page.screenshot({ path: join(CAPTURAS, `${etiqueta}.png`), fullPage: false })
  }
}

async function revisarCabeceraLanding(page, etiqueta) {
  const datos = await page.locator('header').evaluate((header) => {
    const controles = [...header.querySelectorAll('a, button')].filter((el) => {
      const estilo = getComputedStyle(el)
      const rect = el.getBoundingClientRect()
      return estilo.visibility !== 'hidden' && estilo.display !== 'none' && rect.width > 0 && rect.height > 0
    })
    const nombre = (el) => (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ')
    const fuera = []
    const tapados = []
    const solapados = []
    for (let i = 0; i < controles.length; i++) {
      const rect = controles[i].getBoundingClientRect()
      if (rect.left < -1 || rect.right > innerWidth + 1) fuera.push(nombre(controles[i]))
      const punto = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
      if (punto && !controles[i].contains(punto)) tapados.push(nombre(controles[i]))
      for (let j = i + 1; j < controles.length; j++) {
        const otro = controles[j].getBoundingClientRect()
        const ancho = Math.min(rect.right, otro.right) - Math.max(rect.left, otro.left)
        const alto = Math.min(rect.bottom, otro.bottom) - Math.max(rect.top, otro.top)
        if (ancho > 1 && alto > 1) solapados.push(`${nombre(controles[i])} / ${nombre(controles[j])}`)
      }
    }
    return { fuera, tapados, solapados }
  })
  check(`controles de navegación dentro de pantalla ${etiqueta}`, datos.fuera.length === 0, datos.fuera.join(' · '))
  check(`enlaces y botones de navegación sin superponerse ${etiqueta}`, datos.solapados.length === 0, datos.solapados.join(' · '))
  check(`controles de navegación accesibles al clic ${etiqueta}`, datos.tapados.length === 0, datos.tapados.join(' · '))
}

async function correrLandingResponsive(browser) {
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  page.setDefaultTimeout(10000)
  try {
    for (const vp of LANDING_VIEWPORTS) {
      try {
        await page.setViewportSize({ width: vp.w, height: vp.h })
        await page.goto(URL, { waitUntil: 'load', timeout: 45000 })
        await page.getByRole('heading', { level: 1 }).waitFor()
        await page.evaluate(() => document.fonts.ready)
        await medir(page, vp, `${vp.nombre}_landing_detalle`)
        await revisarCabeceraLanding(page, `${vp.nombre} cerrada`)
        if (vp.w === 320 || vp.w === 820) {
          const fuenteRespaldo = await page.addStyleTag({ content: 'html { font-family: Arial, sans-serif !important; }' })
          await medir(page, vp, `${vp.nombre}_landing_fuente_respaldo`)
          await revisarCabeceraLanding(page, `${vp.nombre} fuente de respaldo`)
          await fuenteRespaldo.evaluate((el) => el.remove())
        }

        const precio = await page.locator('#planes').getByText('Plan mensual', { exact: true }).last().boundingBox()
        const etiqueta = await page.locator('#planes').getByText('Mesora Pro', { exact: true }).boundingBox()
        const crucePrecio = precio && etiqueta &&
          Math.min(precio.x + precio.width, etiqueta.x + etiqueta.width) - Math.max(precio.x, etiqueta.x) > 1 &&
          Math.min(precio.y + precio.height, etiqueta.y + etiqueta.height) - Math.max(precio.y, etiqueta.y) > 1
        check(`precio y etiqueta sin superponerse ${vp.nombre}`, Boolean(precio && etiqueta && !crucePrecio))

        const boton = page.locator('header button[aria-expanded]')
        if (vp.w < 1280) {
          const visible = await boton.isVisible()
          check(`menú disponible ${vp.nombre}`, visible)
          if (!visible) continue
          await boton.click()
          check(`menú abierto ${vp.nombre}`, await boton.getAttribute('aria-expanded') === 'true')
          await revisarCabeceraLanding(page, `${vp.nombre} abierta`)
          await page.keyboard.press('Escape')
          check(`Escape cierra el menú y devuelve el foco ${vp.nombre}`,
            await boton.getAttribute('aria-expanded') === 'false' && await boton.evaluate((el) => document.activeElement === el))
          await boton.click()
          await page.getByRole('navigation', { name: 'Menú de navegación' }).getByRole('link', { name: 'Precio', exact: true }).click()
          check(`enlace cierra el menú y llega a precio ${vp.nombre}`,
            await page.evaluate(() => window.location.hash) === '#planes' && await boton.getAttribute('aria-expanded') === 'false')
          if (vp.w === 390) {
            await boton.click()
            await page.getByRole('navigation', { name: 'Menú de navegación' }).getByRole('link', { name: 'Ingresar', exact: true }).click()
            await page.waitForURL('**/login')
            const tituloLogin = page.getByRole('heading', { name: 'Iniciar sesión', exact: true })
            await tituloLogin.waitFor({ state: 'visible' })
            check('ingresar desde el menú móvil abre el login', await tituloLogin.isVisible())
          }
          if (vp.w === 820) {
            await boton.click()
            await page.mouse.click(5, vp.h - 5)
            check('clic fuera cierra el menú', await boton.getAttribute('aria-expanded') === 'false')
            await boton.click()
            await page.setViewportSize({ width: 1280, height: vp.h })
            check('al cambiar a escritorio se cierra el menú', await boton.getAttribute('aria-expanded') === 'false')
          }
        } else {
          check(`navegación de escritorio visible ${vp.nombre}`,
            await page.getByRole('navigation', { name: 'Navegación principal' }).getByRole('link', { name: 'Precio', exact: true }).isVisible() && !(await boton.isVisible()))
        }
      } catch (e) {
        fallos++
        checks++
        console.log(`  FALLA landing ${vp.nombre} — ${String(e).split('\n')[0].slice(0, 200)}`)
        await page.screenshot({ path: join(CAPTURAS, `${vp.nombre}_landing_error.png`) })
      }
    }
  } finally {
    await ctx.close()
  }
}

async function correrGuiaMovil(browser, vp) {
  if (vp.w > 768) return
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h } })
  const page = await ctx.newPage()
  try {
    await page.goto(`${URL}/demo/admin`, { waitUntil: 'networkidle', timeout: 45000 })
    await page.getByRole('button', { name: 'Empezar recorrido' }).click()
    const panel = page.locator('[data-guia-panel]')
    await panel.getByRole('button', { name: /Hazlo por mí/ }).waitFor({ timeout: 10000 })
    await page.waitForTimeout(250)
    const solapados = await panel.evaluate((root) => {
      const botones = [...root.querySelectorAll('button')].filter((el) => {
        const r = el.getBoundingClientRect()
        const estilo = getComputedStyle(el)
        return estilo.display !== 'none' && estilo.visibility !== 'hidden' && r.width > 1 && r.height > 1
      })
      const casos = []
      for (let i = 0; i < botones.length; i++) {
        const a = botones[i].getBoundingClientRect()
        for (let j = i + 1; j < botones.length; j++) {
          const b = botones[j].getBoundingClientRect()
          if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 3 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 3) {
            casos.push(`${botones[i].getAttribute('aria-label') || botones[i].innerText} / ${botones[j].getAttribute('aria-label') || botones[j].innerText}`)
          }
        }
      }
      return casos
    })
    check(`barra de guía móvil sin botones superpuestos ${vp.nombre}`, solapados.length === 0, solapados.join(' · '))
    const revisarPastilla = async (vista) => {
      await panel.getByRole('button', { name: 'Minimizar guía' }).click()
      const solapamientos = await page.locator('[data-guia-minimizada]').evaluate((burbuja) => {
        const a = burbuja.getBoundingClientRect()
        return [...document.querySelectorAll('button')]
          .filter((otro) => otro !== burbuja)
          .filter((otro) => {
            const estilo = getComputedStyle(otro)
            const b = otro.getBoundingClientRect()
            return estilo.display !== 'none' && estilo.visibility !== 'hidden' &&
              Math.min(a.right, b.right) - Math.max(a.left, b.left) > 3 &&
              Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 3
          })
          .map((otro) => {
            const b = otro.getBoundingClientRect()
            return `${(otro.getAttribute('aria-label') || otro.innerText || '').trim().slice(0, 40)} [${Math.round(b.left)},${Math.round(b.top)}-${Math.round(b.right)},${Math.round(b.bottom)}]`
          })
      })
      check(`guía minimizada móvil no tapa controles ${vista} ${vp.nombre}`, solapamientos.length === 0, solapamientos.join(' · '))
      await page.locator('[data-guia-minimizada]').click()
    }
    await revisarPastilla('admin')
    for (const [rol, ruta] of [['Mesero', 'mesero'], ['Cocina', 'cocina'], ['Cajero', 'cajero']]) {
      await page.getByRole('link', { name: rol, exact: true }).click()
      await page.waitForURL((url) => url.pathname === `/demo/${ruta}`, { timeout: 10000 })
      await revisarPastilla(rol.toLowerCase())
    }
  } catch (e) {
    fallos++
    checks++
    console.log(`  FALLA guía móvil ${vp.nombre} — ${String(e).split('\n')[0].slice(0, 180)}`)
  } finally {
    await ctx.close()
  }
}

async function correrDemoRutas(browser, vp) {
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h } })
  const page = await ctx.newPage()
  const roles = [
    { ruta: 'admin', enlace: 'Admin', titulo: 'Panel de administración' },
    { ruta: 'mesero', enlace: 'Mesero', titulo: 'Restaurante Demo' },
    { ruta: 'cocina', enlace: 'Cocina', titulo: 'Estaciones de preparación' },
    { ruta: 'cajero', enlace: 'Cajero', titulo: 'Caja' },
  ]
  try {
    for (const rol of roles) {
      await page.goto(`${URL}/demo/${rol.ruta}`, { waitUntil: 'networkidle', timeout: 45000 })
      const titulo = page.getByRole('heading', { level: 1, name: rol.titulo, exact: true })
      await titulo.waitFor({ state: 'visible', timeout: 15000 })
      check(`ruta directa ${rol.ruta} muestra su vista ${vp.nombre}`, await titulo.isVisible())
      check(`ruta directa ${rol.ruta} marca el rol activo ${vp.nombre}`,
        await page.getByRole('link', { name: rol.enlace, exact: true }).getAttribute('aria-current') === 'page')
    }

    await page.goto(`${URL}/demo/admin`, { waitUntil: 'networkidle', timeout: 45000 })
    for (const rol of [...roles.slice(1), roles[0]]) {
      await page.getByRole('link', { name: rol.enlace, exact: true }).click()
      await page.waitForURL((url) => url.pathname === `/demo/${rol.ruta}`, { timeout: 10000 })
      const titulo = page.getByRole('heading', { level: 1, name: rol.titulo, exact: true })
      await titulo.waitFor({ state: 'visible', timeout: 15000 })
      check(`navegación interna muestra ${rol.ruta} ${vp.nombre}`, await titulo.isVisible())
      check(`navegación interna activa ${rol.ruta} ${vp.nombre}`,
        await page.getByRole('link', { name: rol.enlace, exact: true }).getAttribute('aria-current') === 'page')
    }
  } catch (e) {
    fallos++
    checks++
    console.log(`  FALLA rutas demo ${vp.nombre} — ${String(e).split('\n')[0].slice(0, 200)}`)
  } finally {
    await ctx.close()
  }
}

async function correrGuiaCompletada(browser, vp) {
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h } })
  const page = await ctx.newPage()
  const progreso = {
    version: 2,
    iniciado: true,
    base: {
      zonas: 0, mesas: 0, mesaIds: [], mesaEstados: {}, categorias: 0, productos: 0,
      pedidoIds: [], pedidoEstados: {}, pedidoMesas: {}, cuentasMes: 0, ventaMes: 0,
    },
    hechos: ['salon', 'carta', 'comanda', 'cocina', 'cobro', 'panel'],
    mesaTour: null,
    pedidoTour: null,
    pedidoEstados: {},
    nuevaZona: true,
    boleta: true,
  }
  try {
    await page.addInitScript((guardado) => localStorage.setItem('mesora.demo.guia.v2', JSON.stringify(guardado)), progreso)
    await page.goto(`${URL}/demo/admin`, { waitUntil: 'networkidle', timeout: 45000 })
    await page.locator('[data-guia-minimizada]').waitFor({ state: 'visible', timeout: 15000 })
    const dashboard = page.getByRole('heading', { level: 1, name: 'Panel de administración', exact: true })
    check(`recorrido completo inicia minimizado ${vp.nombre}`,
      await page.getByRole('dialog', { name: 'Recorrido guiado del demo' }).count() === 0 && await dashboard.isVisible())
    await page.locator('[data-guia-minimizada]').click()
    const panel = page.getByRole('dialog', { name: 'Recorrido guiado del demo' })
    await panel.waitFor({ state: 'visible', timeout: 10000 })
    check(`guía completada se puede abrir ${vp.nombre}`, await panel.isVisible())
    await panel.getByRole('button', { name: 'Minimizar guía' }).click()
    await page.locator('[data-guia-minimizada]').waitFor({ state: 'visible', timeout: 10000 })
    check(`guía completada se puede minimizar ${vp.nombre}`,
      await page.getByRole('dialog', { name: 'Recorrido guiado del demo' }).count() === 0 && await dashboard.isVisible())
  } catch (e) {
    fallos++
    checks++
    console.log(`  FALLA guía completada ${vp.nombre} — ${String(e).split('\n')[0].slice(0, 200)}`)
  } finally {
    await ctx.close()
  }
}

async function correrGuiaCategoria(browser) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const page = await ctx.newPage()
  let etapa = 'abrir el demo admin'
  try {
    await page.goto(`${URL}/demo/admin`, { waitUntil: 'networkidle', timeout: 45000 })
    etapa = 'iniciar el recorrido'
    await page.getByRole('button', { name: 'Empezar recorrido' }).click()
    const hazlo = () => page.locator('[data-guia-panel]').getByRole('button', { name: /Hazlo por m/ })

    etapa = 'abrir y confirmar la zona'
    await hazlo().click()
    await page.getByRole('heading', { name: 'Nueva zona' }).waitFor({ timeout: 10000 })
    await page.waitForFunction(() => Boolean(document.querySelector('#zona-nombre')?.value))
    await page.getByRole('button', { name: 'Crear zona' }).click()

    etapa = 'abrir y confirmar la mesa'
    await page.waitForTimeout(1400)
    await hazlo().click()
    await page.getByRole('heading', { name: 'Agregar mesa' }).waitFor({ timeout: 10000 })
    await page.waitForFunction(() => Boolean(document.querySelector('#mesa-nombre')?.value))
    await page.getByRole('button', { name: 'Crear mesa' }).click()

    await page.waitForTimeout(1400)
    etapa = 'esperar la misión de carta'
    await page.locator('[data-guia-panel]').getByText(/agrega tu primer producto/).waitFor({ timeout: 10000 })
    etapa = 'solicitar el formulario de categoría'
    await hazlo().click()
    etapa = 'esperar el modal de categoría'
    await page.getByRole('heading', { name: 'Nueva categoría' }).waitFor({ timeout: 10000 })
    etapa = 'leer la categoría sugerida'
    etapa = 'guardar la categoría y abrir el producto'
    const nombreCategoria = await page.locator('#categoria-nombre').inputValue()
    await page.getByRole('button', { name: 'Crear categoría' }).click()

    await page.getByRole('heading', { name: 'Agregar producto' }).waitFor({ timeout: 10000 })
    etapa = 'verificar el producto sugerido'
    await page.waitForFunction(() => {
      return document.querySelector('#producto-nombre')?.value === 'Lomo saltado' &&
        document.querySelector('#producto-precio')?.value === '12.50'
    }, null, { timeout: 10000 })
    const categoriaProducto = await page.locator('#producto-categoria option:checked').innerText()
    check(
      'guía móvil de carta enseña y guarda la categoría antes de rellenar el producto',
      nombreCategoria === 'PROMOS' && categoriaProducto === 'PROMOS',
      `categoría creada="${nombreCategoria}", categoría de producto="${categoriaProducto}"`,
    )
  } catch (e) {
    fallos++
    checks++
    const estado = await page.evaluate(() => ({
      url: location.pathname,
      modales: [...document.querySelectorAll('[role="dialog"]')].map((el) => (el.innerText || '').slice(0, 180)),
      titulos: [...document.querySelectorAll('h1,h2,h3')].map((el) => (el.innerText || '').slice(0, 70)),
      campos: ['#categoria-nombre', '#producto-nombre'].filter((selector) => document.querySelector(selector)),
    }))
    await page.screenshot({ path: join(CAPTURAS, 'categoria-falla.png') })
    console.log(`  FALLA guía de categoría móvil al ${etapa} — ${String(e).split('\n')[0].slice(0, 180)}; estado=${JSON.stringify(estado)}`)
  } finally {
    await ctx.close()
  }
}

async function correrPantalla(browser, vp, pantalla) {
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h } })
  const page = await ctx.newPage()
  const errores = []
  page.on('pageerror', (e) => errores.push(String(e).slice(0, 160)))

  try {
    await page.goto(`${URL}${pantalla.ruta}`, { waitUntil: 'networkidle', timeout: 45000 })
    // La primera pantalla del demo abre el recorrido; se cierra para medir el
    // layout real sin la guía encima.
    const explorar = page.getByRole('button', { name: 'Explorar por mi cuenta' })
    if (await explorar.count()) await explorar.first().click()
    const cerrar = page.getByRole('button', { name: 'Minimizar guía' })
    if (await cerrar.count()) await cerrar.first().click()

    if (pantalla.tabs) {
      const adminMovil = pantalla.ruta === '/demo/admin' && vp.w < 1024
      if (adminMovil) {
        const abrir = page.locator('.admin-menu-trigger')
        await abrir.click()
        await page.locator('.admin-drawer[role="dialog"]').waitFor({ state: 'visible' })
        await page.keyboard.press('Escape')
        await page.locator('.admin-drawer[role="dialog"]').waitFor({ state: 'hidden' })
        check(`menú Admin móvil cierra con Escape ${vp.nombre}`, await abrir.getAttribute('aria-expanded') === 'false')
      }
      for (const tab of pantalla.tabs) {
        if (adminMovil) {
          await page.locator('.admin-menu-trigger').click()
          await page.locator('.admin-drawer[role="dialog"]').waitFor({ state: 'visible' })
        }
        const navSeccion = page.locator(adminMovil ? '.admin-drawer' : '.admin-sidebar')
          .getByRole('button', { name: tab, exact: true })
        await navSeccion.scrollIntoViewIfNeeded()
        await navSeccion.click()
        await page.locator('[data-admin-active-section]').waitFor({ state: 'visible' })
        if (pantalla.ruta === '/demo/admin') {
          const idPorTab = {
            Dashboard: 'dashboard',
            Ventas: 'ventas',
            Caja: 'caja',
            Cobros: 'cobros',
            'Mesas y zonas': 'mesas',
            'Menú': 'menu',
            Personal: 'personal',
            'Datos del local': 'configuracion',
            'Configuración operativa': 'configuracion-operativa',
            'Impresión automática': 'agentes-impresion',
            'Auditoría': 'auditoria',
            Soporte: 'soporte',
          }
          const esperado = idPorTab[tab]
          await page.waitForFunction((id) => document.querySelector('[data-admin-active-section]')?.getAttribute('data-admin-active-section') === id, esperado)
          check(`Admin muestra contenido de ${tab} ${vp.nombre}`,
            await page.locator('[data-admin-active-section]').getAttribute('data-admin-active-section') === esperado)
          check(`navegar por ${tab} conserva URL ${vp.nombre}`,
            new globalThis.URL(page.url()).pathname === '/demo/admin')
          if (adminMovil) {
            await page.locator('.admin-drawer[role="dialog"]').waitFor({ state: 'hidden' })
          }
        }
        await medir(page, vp, `${vp.nombre}_${pantalla.nombre}_${tab.replace(/\s+/g, '-').toLowerCase()}`)
      }
    } else {
      await page.waitForTimeout(350)
      await medir(page, vp, `${vp.nombre}_${pantalla.nombre}`)
    }
    check(`sin errores de JavaScript en ${pantalla.nombre} ${vp.nombre}`, errores.length === 0, errores.join(' | '))
  } catch (e) {
    fallos++
    checks++
    console.log(`  FALLA ${pantalla.nombre} ${vp.nombre} — ${String(e).slice(0, 200)}`)
  } finally {
    await ctx.close()
  }
}

async function correrNavegacionAdmin(browser, vp) {
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h } })
  const page = await ctx.newPage()
  page.setDefaultTimeout(8000)
  const errores = []
  page.on('pageerror', (e) => errores.push(String(e).slice(0, 160)))
  let etapa = 'abrir ruta directa'
  try {
    await page.goto(`${URL}/demo/admin`, { waitUntil: 'networkidle', timeout: 45000 })
    etapa = 'cerrar guía inicial'
    const explorar = page.getByRole('button', { name: 'Explorar por mi cuenta' })
    if (await explorar.count()) await explorar.first().click()
    etapa = 'validar encabezado directo'
    const encabezado = page.getByRole('heading', { level: 1, name: 'Panel de administración', exact: true })
    await encabezado.waitFor({ state: 'visible', timeout: 15000 })
    check(`URL directa /demo/admin ${vp.nombre}`, new globalThis.URL(page.url()).pathname === '/demo/admin' && await encabezado.isVisible())

    etapa = 'recargar Admin'
    await page.reload({ waitUntil: 'networkidle', timeout: 45000 })
    await page.getByRole('heading', { level: 1, name: 'Panel de administración', exact: true }).waitFor({ state: 'visible', timeout: 15000 })
    check(`recarga directa de Admin ${vp.nombre}`, new globalThis.URL(page.url()).pathname === '/demo/admin' && await page.locator('[data-admin-active-section="dashboard"]').count() === 1)

    if (vp.w < 1024) {
      etapa = 'abrir drawer'
      const abrir = page.locator('.admin-menu-trigger')
      await abrir.click()
      const drawer = page.locator('.admin-drawer[role="dialog"]')
      await drawer.waitFor({ state: 'visible' })
      check(`drawer Admin disponible ${vp.nombre}`, await abrir.getAttribute('aria-expanded') === 'true')
      check(`drawer Admin anuncia modalidad de diálogo ${vp.nombre}`,
        await drawer.getAttribute('aria-modal') === 'true' && Boolean(await drawer.getAttribute('aria-label')))
      etapa = 'cerrar drawer con botón'
      await page.locator('.admin-drawer-close').click()
      await drawer.waitFor({ state: 'hidden' })
      check(`drawer Admin cierra con botón visible ${vp.nombre}`, await abrir.getAttribute('aria-expanded') === 'false')
    }

    for (const tab of PANTALLAS.find((pantalla) => pantalla.ruta === '/demo/admin').tabs) {
      if (vp.w < 1024) {
        etapa = `abrir drawer para ${tab}`
        await page.locator('.admin-menu-trigger').click()
        await page.locator('.admin-drawer[role="dialog"]').waitFor({ state: 'visible' })
      }
      etapa = `abrir sección ${tab}`
      const navSeccion = page.locator(vp.w < 1024 ? '.admin-drawer' : '.admin-sidebar')
        .getByRole('button', { name: tab, exact: true })
      await navSeccion.scrollIntoViewIfNeeded()
      await navSeccion.click()
      etapa = `medir sección ${tab}`
      await medir(page, vp, `${vp.nombre}_admin_final_${tab.replace(/\s+/g, '-').toLowerCase()}`)
      const ruta = new globalThis.URL(page.url())
      const id = {
        Dashboard: 'dashboard', Ventas: 'ventas', Caja: 'caja', Cobros: 'cobros',
        'Mesas y zonas': 'mesas', 'Menú': 'menu', Personal: 'personal',
        'Datos del local': 'configuracion', 'Configuración operativa': 'configuracion-operativa',
        'Impresión automática': 'agentes-impresion', 'Auditoría': 'auditoria', Soporte: 'soporte',
      }[tab]
      check(`sección Admin ${tab} activa ${vp.nombre}`,
        await page.locator(`[data-admin-active-section="${id}"]`).count() === 1 && ruta.pathname === '/demo/admin')
      if (vp.w < 1024) await page.locator('.admin-drawer[role="dialog"]').waitFor({ state: 'hidden' })
    }

    if (vp.w === 390 || vp.w === 1280) {
      etapa = 'iniciar sesión de administrador local'
      await iniciarSesion(page, 'nuevo@mirestaurante.pe')
      etapa = 'abrir directamente /admin'
      await page.goto(`${URL}/admin`, { waitUntil: 'networkidle', timeout: 45000 })
      await page.getByRole('heading', { level: 1, name: 'Panel de administración', exact: true }).waitFor({ state: 'visible', timeout: 15000 })
      check(`/admin protegido abre con sesión válida ${vp.nombre}`,
        new globalThis.URL(page.url()).pathname === '/admin' && await page.locator('[data-admin-active-section="dashboard"]').count() === 1)
      etapa = 'recargar /admin autenticado'
      await page.reload({ waitUntil: 'networkidle', timeout: 45000 })
      await page.getByRole('heading', { level: 1, name: 'Panel de administración', exact: true }).waitFor({ state: 'visible', timeout: 15000 })
      check(`/admin sobrevive recarga autenticada ${vp.nombre}`,
        new globalThis.URL(page.url()).pathname === '/admin' && await page.locator('[data-admin-active-section="dashboard"]').count() === 1)
    }
    check(`sin errores JS en Admin ${vp.nombre}`, errores.length === 0, errores.join(' | '))
  } catch (e) {
    fallos++
    checks++
    console.log(`  FALLA navegación Admin ${vp.nombre} en ${etapa} — ${String(e).split('\n')[0].slice(0, 220)}`)
  } finally {
    await ctx.close()
  }
}

async function correrAnulacionUltimoItem(browser) {
  const vp = { w: 390, h: 844, nombre: '390x844_anulacion_ultimo_item' }
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h } })
  const page = await ctx.newPage()
  const mensajeEsperado = '\u00cdtem anulado correctamente. La mesa qued\u00f3 liberada porque no ten\u00eda m\u00e1s comandas abiertas.'
  let etapa = 'iniciar sesión local'
  try {
    page.setDefaultTimeout(6000)
    await page.goto(URL + '/demo/admin', { waitUntil: 'networkidle', timeout: 45000 })
    etapa = 'preparar una mesa y una comanda de un ítem'
    const setup = await page.evaluate(async () => {
      const { getApi } = await import('/src/lib/api.ts')
      const api = getApi()
      const zona = await api.crearZona('r-demo', 'QA visual')
      if (zona.error || !zona.data) throw new Error(zona.error ?? 'No se creó la zona QA')
      const mesa = await api.crearMesa('r-demo', { nombre: 'Mesa QA', zona_id: zona.data.id })
      if (mesa.error || !mesa.data) throw new Error(mesa.error ?? 'No se creó la mesa QA')
      const producto = await api.crearProducto('r-demo', {
        nombre: 'Cheesecake QA',
        categoria_id: null,
        precio: 9,
        disponible: true,
        es_bebida: false,
      })
      if (producto.error || !producto.data) throw new Error(producto.error ?? 'No se creó el producto QA')
      return { mesaId: mesa.data.id, productoId: producto.data.id }
    })
    await page.goto(URL + '/demo/mesero', { waitUntil: 'networkidle', timeout: 45000 })
    etapa = 'cerrar guía del demo'
    const explorar = page.getByRole('button', { name: 'Explorar por mi cuenta' })
    if (await explorar.count()) await explorar.first().click()
    const minimizar = page.getByRole('button', { name: /Minimizar gu/ })
    if (await minimizar.count()) await minimizar.first().click()

    etapa = 'abrir mesa QA libre'
    await page.locator('button[data-guia-mesa="' + setup.mesaId + '"]').click()
    etapa = 'agregar el producto desde el menú'
    await page.getByRole('button', { name: /Cheesecake QA/ }).click()
    etapa = 'enviar el pedido a cocina'
    await page.getByRole('button', { name: 'Enviar comanda a cocina', exact: true }).click()
    await page.locator('button[data-guia-mesa="' + setup.mesaId + '"]').waitFor()
    etapa = 'abrir mesa QA ocupada'
    await page.locator('button[data-guia-mesa="' + setup.mesaId + '"]').click()
    etapa = 'abrir edición del último ítem'
    await page.locator('button[aria-label^="Editar "]').first().click()
    etapa = 'iniciar anulación del último ítem'
    await page.getByRole('button', { name: 'Anular ítem', exact: true }).click()
    etapa = 'confirmar anulación del último ítem'
    await page.getByRole('heading', { name: 'Anular ítem', exact: true }).waitFor()
    await page.getByRole('button', { name: 'Anular ítem', exact: true }).last().click()

    etapa = 'comprobar aviso verde'
    const aviso = page.getByRole('status').filter({ hasText: mensajeEsperado })
    await aviso.waitFor({ timeout: 12000 })
    const clases = await aviso.getAttribute('class') ?? ''
    check('anulación del último ítem muestra el mensaje completo', (await aviso.innerText()).trim() === mensajeEsperado)
    check('anulación confirmada muestra aviso verde', clases.includes('bg-ok-500/10') && clases.includes('text-ok-500'))
    check('anulación confirmada no muestra error', await page.getByRole('alert').count() === 0)
    check('la comanda cerrada muestra el estado vacío', await page.getByText('Esta mesa no tiene comandas abiertas', { exact: true }).count() === 1)

    await page.getByRole('button', { name: /Volver a mesas/ }).click()
    const mesa = page.locator('button[data-guia-mesa="' + setup.mesaId + '"]')
    await mesa.waitFor()
    const textoMesa = await mesa.innerText()
    const mesaLibre = textoMesa.toLocaleLowerCase().includes('libre')
    check('la mesa anulada aparece libre en el mapa', mesaLibre, textoMesa)
    if (!mesaLibre) {
      await page.screenshot({ path: join(CAPTURAS, 'anulacion-mesa-no-libre.png'), fullPage: false })
    }
  } catch (e) {
    fallos++
    checks++
    const textoPantalla = await page.locator('body').innerText().catch(() => '')
    await page.screenshot({ path: join(CAPTURAS, 'anulacion-ultimo-item-falla.png'), fullPage: false }).catch(() => {})
    console.log('  FALLA flujo visual de anulación del último ítem (' + etapa + ') — ' + String(e).split('\n')[0].slice(0, 200))
    console.log('    URL=' + page.url() + ' · ' + textoPantalla.replace(/\s+/g, ' ').slice(0, 240))
  } finally {
    await ctx.close()
  }
}

async function iniciarSesion(page, email) {
  await page.goto(`${URL}/login`, { waitUntil: 'networkidle' })
  await page.fill('#email', email)
  await page.fill('#password', 'Mesora2026!')
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click()
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 25000 })
}

/**
 * Modo local (sin Supabase): tiene datos sembrados (3 mesas con dinero), así se
 * miden las pantallas con contenido real y se comprueba el flujo de caja que
 * antes bloqueaba el cierre.
 */
async function correrSesionesLocales(browser, vp) {
  // Cajero del restaurante demo: abrir turno, ver el aviso y cerrar sin bloqueo.
  {
    const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h } })
    const page = await ctx.newPage()
    try {
      await iniciarSesion(page, 'cajero@mesora.pe')
      await page.goto(`${URL}/cajero`, { waitUntil: 'networkidle' })
      await page.fill('#caja-inicial', '0')
      await page.getByRole('button', { name: 'Abrir turno' }).click()
      await page.getByRole('heading', { name: 'Turno abierto' }).waitFor({ timeout: 15000 })

      const aviso = page.getByText(/sin cobrar/).first()
      check(`cajero ${vp.nombre} · avisa las mesas con dinero pendiente`, await aviso.count() > 0)
      await medir(page, vp, `${vp.nombre}_cajero_turno_abierto`)

      await page.fill('#caja-declarado', '0')
      await page.getByRole('button', { name: 'Cerrar turno' }).click()
      await page.getByRole('heading', { name: 'Confirma el cierre de caja' }).waitFor({ timeout: 10000 })
      check(`cajero ${vp.nombre} · explica la auditoría antes del cierre`, await page.getByText(/registro de auditoría/i).count() > 0)
      await medir(page, vp, `${vp.nombre}_cajero_confirmacion_cierre`)
      await page.getByRole('button', { name: 'Confirmar cierre de caja' }).click()
      await page.getByRole('heading', { name: 'Abrir caja' }).waitFor({ timeout: 15000 })
      check(
        `cajero ${vp.nombre} · cierra la caja aunque queden mesas sin cobrar`,
        (await page.locator('[role="alert"]').count()) === 0,
      )
      await medir(page, vp, `${vp.nombre}_cajero_tras_cierre`)
    } finally {
      await ctx.close()
    }
  }

  // Super admin: todas las secciones con datos sembrados.
  {
    const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h } })
    const page = await ctx.newPage()
    try {
      await iniciarSesion(page, 'superadmin@mesora.pe')
      await page.goto(`${URL}/super-admin`, { waitUntil: 'networkidle' })
      const secciones = [
        'Dashboard',
        'Restaurantes',
        'Administradores',
        'Usuarios',
        'Suscripciones',
        'Estadísticas',
        'Auditoría',
        'Notificaciones',
        'Soporte',
        'Configuración',
      ]
      for (const seccion of secciones) {
        await page.getByRole('link', { name: seccion, exact: true }).first().click()
        await page.waitForTimeout(400)
        await medir(page, vp, `${vp.nombre}_superadmin_${seccion.toLowerCase()}`)
        if (seccion === 'Configuración') {
          await page.locator('#cfg-nombre').waitFor({ timeout: 10000 })
          await page.reload({ waitUntil: 'networkidle' })
          await page.locator('#cfg-nombre').waitFor({ timeout: 10000 })
          check(
            `superadmin ${vp.nombre} · Configuración abre y recarga directamente`,
            new globalThis.URL(page.url()).pathname === '/super-admin/configuracion' &&
              !(await page.getByText('Unexpected Application Error').count()),
          )
        }
      }
    } finally {
      await ctx.close()
    }
  }
}

async function run() {
  const vite = iniciarVite()
  let browser
  try {
    await esperarServidor()
    browser = await chromium.launch({ headless: true })
    if (process.argv.includes('--solo-guia-categoria')) {
      await correrGuiaCategoria(browser)
    } else if (process.argv.includes('--solo-demo-rutas-guia')) {
      for (const vp of [{ w: 1280, h: 800, nombre: '1280x800' }, { w: 390, h: 844, nombre: '390x844' }]) {
        await correrDemoRutas(browser, vp)
        await correrGuiaCompletada(browser, vp)
      }
    } else if (process.argv.includes('--solo-guia-movil')) {
      for (const vp of VIEWPORTS.filter((vista) => vista.w <= 768)) await correrGuiaMovil(browser, vp)
    } else if (process.argv.includes('--solo-anulacion-ultimo-item')) {
      await correrAnulacionUltimoItem(browser)
    } else if (process.argv.includes('--solo-landing')) {
      await correrLandingResponsive(browser)
    } else if (process.argv.includes('--solo-admin-nav')) {
      for (const vp of [
        { w: 390, h: 844, nombre: '390x844' },
        { w: 768, h: 1024, nombre: '768x1024' },
        { w: 1024, h: 768, nombre: '1024x768' },
        { w: 1280, h: 800, nombre: '1280x800' },
        { w: 1440, h: 900, nombre: '1440x900' },
      ]) await correrNavegacionAdmin(browser, vp)
    } else {
      await correrLandingResponsive(browser)
      await correrAnulacionUltimoItem(browser)
      for (const vp of [
        { w: 390, h: 844, nombre: '390x844' },
        { w: 768, h: 1024, nombre: '768x1024' },
        { w: 1024, h: 768, nombre: '1024x768' },
        { w: 1280, h: 800, nombre: '1280x800' },
        { w: 1440, h: 900, nombre: '1440x900' },
      ]) await correrNavegacionAdmin(browser, vp)
      for (const vp of [{ w: 1280, h: 800, nombre: '1280x800' }, { w: 390, h: 844, nombre: '390x844' }]) {
        await correrDemoRutas(browser, vp)
        await correrGuiaCompletada(browser, vp)
      }
      for (const vp of VIEWPORTS) {
        console.log(`\nViewport ${vp.nombre}`)
        for (const pantalla of PANTALLAS) await correrPantalla(browser, vp, pantalla)
        await correrGuiaMovil(browser, vp)
        try {
          await correrSesionesLocales(browser, vp)
        } catch (e) {
          fallos++
          checks++
          console.log(`  FALLA sesiones locales ${vp.nombre} — ${String(e).split('\n')[0].slice(0, 200)}`)
        }
      }
      await correrGuiaCategoria(browser)
    }
  } finally {
    if (browser) await browser.close()
    vite.kill()
    rmSync(ENV_DIR, { recursive: true, force: true })
  }

  console.log(`\n${'-'.repeat(60)}`)
  const cobertura = process.argv.includes('--solo-admin-nav')
    ? 'navegaciÃ³n Admin en 390, 768, 1024, 1280 y 1440 px'
    : process.argv.includes('--solo-guia-categoria')
    ? 'recorrido guiado de categoría en 390x844'
    : process.argv.includes('--solo-demo-rutas-guia')
      ? 'rutas del demo y guía completada en escritorio y 390x844'
    : process.argv.includes('--solo-anulacion-ultimo-item')
      ? 'flujo visual de anulación del último ítem en 390x844'
    : process.argv.includes('--solo-guia-movil')
      ? 'guía móvil en 360x640 y 390x844'
      : process.argv.includes('--solo-landing')
        ? `landing en ${LANDING_VIEWPORTS.length} anchos`
        : `${VIEWPORTS.length} viewports del sistema y ${LANDING_VIEWPORTS.length} anchos de landing`
  if (fallos === 0) {
    console.log(`RESPONSIVE OK: ${checks} comprobaciones; cobertura: ${cobertura}.`)
    rmSync(CAPTURAS, { recursive: true, force: true })
  } else {
    console.log(`${fallos} de ${checks} comprobaciones fallaron. Capturas en ${CAPTURAS}`)
    process.exitCode = 1
  }
}

run().catch((e) => {
  console.error(e)
  rmSync(ENV_DIR, { recursive: true, force: true })
  process.exit(1)
})
