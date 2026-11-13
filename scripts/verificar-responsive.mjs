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
  { w: 1440, h: 900, nombre: '1440x900' },
]

const VIEWPORTS_SUPERADMIN = [
  { w: 390, h: 844, nombre: '390x844' },
  { w: 768, h: 1024, nombre: '768x1024' },
  { w: 1024, h: 768, nombre: '1024x768' },
  { w: 1280, h: 800, nombre: '1280x800' },
  { w: 1440, h: 900, nombre: '1440x900' },
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
    { ruta: 'admin', enlace: 'Admin', titulo: 'Resumen de ventas' },
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
    const dashboard = page.getByRole('heading', { level: 1, name: 'Resumen de ventas', exact: true })
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
    const panelGuia = page.getByRole('dialog', { name: 'Recorrido guiado del demo' })
    if (await explorar.count()) {
      await explorar.first().click()
      await panelGuia.waitFor({ state: 'hidden' })
    }
    const cerrar = page.getByRole('button', { name: 'Minimizar guía' })
    if (await cerrar.count()) {
      await cerrar.first().click()
      await panelGuia.waitFor({ state: 'hidden' })
    }

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
    const panelGuia = page.getByRole('dialog', { name: 'Recorrido guiado del demo' })
    if (await explorar.count()) {
      await explorar.first().click()
      await panelGuia.waitFor({ state: 'hidden' })
    }
    etapa = 'validar encabezado directo'
    const encabezado = page.getByRole('heading', { level: 1, name: 'Resumen de ventas', exact: true })
    await encabezado.waitFor({ state: 'visible', timeout: 15000 })
    check(`URL directa /demo/admin ${vp.nombre}`, new globalThis.URL(page.url()).pathname === '/demo/admin' && await encabezado.isVisible())

    etapa = 'recargar Admin'
    await page.reload({ waitUntil: 'networkidle', timeout: 45000 })
    await page.getByRole('heading', { level: 1, name: 'Resumen de ventas', exact: true }).waitFor({ state: 'visible', timeout: 15000 })
    check(`recarga directa de Admin ${vp.nombre}`, new globalThis.URL(page.url()).pathname === '/demo/admin' && await page.locator('[data-admin-active-section="dashboard"]').count() === 1)
    etapa = 'cerrar guía tras recargar Admin'
    await panelGuia.waitFor({ state: 'visible', timeout: 15000 })
    const explorarTrasRecarga = panelGuia.getByRole('button', { name: 'Explorar por mi cuenta', exact: true })
    if (await explorarTrasRecarga.count()) await explorarTrasRecarga.click()
    await panelGuia.waitFor({ state: 'hidden' })

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
      if (tab === 'Cobros') {
        etapa = 'probar acceso de Cobros a Caja'
        const irACaja = page.getByRole('button', { name: 'Ir a Caja', exact: true })
        await irACaja.waitFor({ state: 'visible' })
        await irACaja.click({ noWaitAfter: true })
        await page.locator('[data-admin-active-section="caja"]').waitFor({ state: 'attached' })
        check(`Cobros lleva a Caja desde Admin ${vp.nombre}`,
          await page.locator('[data-admin-active-section="caja"]').count() === 1 && await page.getByRole('heading', { level: 1, name: 'Caja del turno' }).isVisible())
      }
    }

    if (vp.w === 390 || vp.w === 1280) {
      etapa = 'iniciar sesión de administrador local'
      await iniciarSesion(page, 'nuevo@mirestaurante.pe')
      etapa = 'abrir directamente /admin'
      await page.goto(`${URL}/admin`, { waitUntil: 'networkidle', timeout: 45000 })
      await page.getByRole('heading', { level: 1, name: 'Resumen de ventas', exact: true }).waitFor({ state: 'visible', timeout: 15000 })
      check(`/admin protegido abre con sesión válida ${vp.nombre}`,
        new globalThis.URL(page.url()).pathname === '/admin' && await page.locator('[data-admin-active-section="dashboard"]').count() === 1)
      etapa = 'recargar /admin autenticado'
      await page.reload({ waitUntil: 'networkidle', timeout: 45000 })
      await page.getByRole('heading', { level: 1, name: 'Resumen de ventas', exact: true }).waitFor({ state: 'visible', timeout: 15000 })
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
    await page.getByRole('button', { name: 'Enviar comanda', exact: true }).click()
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

async function correrFlujoMeseroMovil(browser) {
  const vp = { w: 390, h: 844, nombre: '390x844_mesero_operativo' }
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h } })
  const page = await ctx.newPage()
  let etapa = 'preparar fixture local de demo'
  try {
    page.setDefaultTimeout(10000)
    await page.goto(URL + '/demo/admin', { waitUntil: 'networkidle', timeout: 45000 })
    const setup = await page.evaluate(async (sufijo) => {
      const { getApi, apiMode } = await import('/src/lib/api.ts')
      const api = getApi()
      const actorAnterior = apiMode.operadorId
      apiMode.operadorId = 'u-admin'
      try {
        const zona = await api.crearZona('r-demo', `QA móvil ${sufijo}`)
        if (zona.error || !zona.data) throw new Error(zona.error ?? 'No se creó la zona de prueba local')
        const mesa = await api.crearMesa('r-demo', { nombre: `Mesa QA ${sufijo}`, zona_id: zona.data.id })
        if (mesa.error || !mesa.data) throw new Error(mesa.error ?? 'No se creó la mesa de prueba local')
        const [comidas, bebidas, postres] = await Promise.all([
          api.crearCategoria('r-demo', `Comidas QA ${sufijo}`),
          api.crearCategoria('r-demo', `Bebidas QA ${sufijo}`),
          api.crearCategoria('r-demo', `Postres QA ${sufijo}`),
        ])
        if (comidas.error || !comidas.data || bebidas.error || !bebidas.data || postres.error || !postres.data) {
          throw new Error('No se crearon las categorías de prueba local')
        }
        const productos = await Promise.all([
          ...Array.from({ length: 4 }, (_, i) => api.crearProducto('r-demo', {
            nombre: `Comida ${i + 1} QA ${sufijo}`, categoria_id: comidas.data.id, precio: 11, disponible: true, es_bebida: false,
          })),
          ...Array.from({ length: 2 }, (_, i) => api.crearProducto('r-demo', {
            nombre: `Bebida ${i + 1} QA ${sufijo}`, categoria_id: bebidas.data.id, precio: 5, disponible: true, es_bebida: true,
          })),
          ...Array.from({ length: 2 }, (_, i) => api.crearProducto('r-demo', {
            nombre: `Postre ${i + 1} QA ${sufijo}`, categoria_id: postres.data.id, precio: 8, disponible: true, es_bebida: false,
          })),
        ])
        if (productos.some((resultado) => resultado.error || !resultado.data)) throw new Error('No se crearon todos los productos de prueba local')
        return {
          mesaId: mesa.data.id,
          mesaNombre: mesa.data.nombre,
          comidas: productos.slice(0, 4).map((resultado) => resultado.data.nombre),
          bebidas: productos.slice(4, 6).map((resultado) => resultado.data.nombre),
          postres: productos.slice(6).map((resultado) => resultado.data.nombre),
        }
      } finally {
        apiMode.operadorId = actorAnterior
      }
    }, String(Date.now()))

    etapa = 'abrir ruta del mesero y confirmar recarga directa'
    await page.goto(URL + '/demo/mesero', { waitUntil: 'networkidle', timeout: 45000 })
    const guiaInicial = page.locator('[data-guia-panel]')
    await guiaInicial.waitFor({ state: 'visible' })
    await guiaInicial.getByRole('button', { name: 'Explorar por mi cuenta' }).click()
    await guiaInicial.waitFor({ state: 'detached' })
    const mesa = page.locator(`button[data-guia-mesa="${setup.mesaId}"]`)
    await mesa.waitFor({ state: 'visible' })
    await page.reload({ waitUntil: 'networkidle', timeout: 45000 })
    const guiaTrasRecarga = page.locator('[data-guia-panel]')
    await guiaTrasRecarga.waitFor({ state: 'visible' })
    await guiaTrasRecarga.getByRole('button', { name: 'Explorar por mi cuenta' }).click()
    await guiaTrasRecarga.waitFor({ state: 'detached' })
    await page.locator(`button[data-guia-mesa="${setup.mesaId}"]`).waitFor({ state: 'visible' })
    check('Mesero carga mesa demo por URL directa y después de recargar', await page.evaluate(() => window.location.pathname === '/demo/mesero'))

    etapa = 'comprobar filtros Todos, Bebidas, Comidas y Postres'
    const filtros = page.getByRole('group', { name: 'Filtrar productos por tipo' })
    const abrirMesa = page.locator(`button[data-guia-mesa="${setup.mesaId}"]`)
    await abrirMesa.click()
    await filtros.waitFor({ state: 'visible' })
    const conteoProductos = () => page.locator('[data-guia="producto"]').count()
    check('el filtro Todos muestra el menú completo', await conteoProductos() === 8)
    await filtros.getByRole('button', { name: 'Bebidas', exact: true }).click()
    check('el filtro Bebidas muestra únicamente productos marcados como bebida', await conteoProductos() === 2)
    await filtros.getByRole('button', { name: 'Comidas', exact: true }).click()
    check('el filtro Comidas excluye bebidas y categorías de postres', await conteoProductos() === 4)
    await filtros.getByRole('button', { name: 'Postres', exact: true }).click()
    check('el filtro Postres usa categorías existentes cuyo nombre lo identifica', await conteoProductos() === 2)
    await filtros.getByRole('button', { name: 'Todos', exact: true }).click()

    etapa = 'agregar varios productos y validar resumen móvil persistente'
    async function agregarProducto(nombre) {
      await page.locator('[data-guia="producto"]').filter({ hasText: nombre }).click()
    }
    await agregarProducto(setup.comidas[0])
    await agregarProducto(setup.comidas[0])
    await agregarProducto(setup.bebidas[0])
    await agregarProducto(setup.postres[0])
    const resumen = page.getByRole('region', { name: 'Resumen de la comanda' })
    await resumen.waitFor({ state: 'visible' })
    await resumen.getByText('4 ítems en la comanda', { exact: true }).waitFor()
    check('el resumen móvil muestra cantidad y total de los productos seleccionados',
      /35[.,]00/.test((await resumen.innerText()).replace(/\u00a0/g, ' ')))
    await page.locator('[data-guia="producto"]').last().scrollIntoViewIfNeeded()
    await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }))
    await page.waitForFunction(() => Math.abs(window.scrollY + window.innerHeight - document.documentElement.scrollHeight) < 2)
    const geometria = await page.evaluate(() => {
      const barra = document.querySelector('[data-resumen-pedido-movil]')?.getBoundingClientRect()
      const ultimoProducto = [...document.querySelectorAll('[data-guia="producto"]')].at(-1)?.getBoundingClientRect()
      return {
        anchoDocumento: document.documentElement.scrollWidth,
        anchoVentana: window.innerWidth,
        barraVisible: Boolean(barra && barra.top >= 0 && barra.bottom <= window.innerHeight),
        productoSobreBarra: Boolean(barra && ultimoProducto && ultimoProducto.bottom <= barra.top),
        barraTop: barra ? Math.round(barra.top) : null,
        productoTop: ultimoProducto ? Math.round(ultimoProducto.top) : null,
        productoBottom: ultimoProducto ? Math.round(ultimoProducto.bottom) : null,
        desplazamiento: window.scrollY,
        altoDocumento: document.documentElement.scrollHeight,
        elementosFuera: [...document.querySelectorAll('body *')].flatMap((elemento) => {
          const rect = elemento.getBoundingClientRect()
          return rect.width > 0 && (rect.right > window.innerWidth + 1 || rect.left < -1)
            ? [{ elemento: elemento.tagName, clase: typeof elemento.className === 'string' ? elemento.className.slice(0, 100) : '', texto: (elemento.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 55), izquierda: Math.round(rect.left), derecha: Math.round(rect.right) }]
            : []
        }).slice(0, 12),
      }
    })
    check('la barra fija respeta scroll, espacio inferior y ancho de móvil', geometria.anchoDocumento <= geometria.anchoVentana + 1 && geometria.barraVisible && geometria.productoSobreBarra, JSON.stringify(geometria))

    etapa = 'demostrar un único envío ante doble clic'
    await page.evaluate(async () => {
      const { getApi } = await import('/src/lib/api.ts')
      const api = getApi()
      const crearOriginal = api.crearPedido
      window.__mesoraCrearPedidoCalls = 0
      api.crearPedido = async (...args) => {
        window.__mesoraCrearPedidoCalls++
        await new Promise((resolve) => setTimeout(resolve, 120))
        return crearOriginal(...args)
      }
    })
    await resumen.getByRole('button', { name: 'Enviar comanda' }).evaluate((button) => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    const mesaOcupada = page.locator(`button[data-guia-mesa="${setup.mesaId}"]`)
    await page.waitForFunction((id) => document.querySelector(`button[data-guia-mesa="${id}"]`)?.textContent?.includes('1 comanda'), setup.mesaId, { timeout: 15000 })
    const textoMesa = await mesaOcupada.innerText()
    const cantidadEnvios = await page.evaluate(() => window.__mesoraCrearPedidoCalls)
    check('doble clic del CTA móvil crea una sola comanda', cantidadEnvios === 1, `solicitudes=${cantidadEnvios}`)
    check('mesa ocupada resume saldo, comanda, responsable y preparación',
      /Ocupada/i.test(textoMesa) && /35[.,]00/.test(textoMesa.replace(/\u00a0/g, ' ')) && textoMesa.includes('1 comanda') && textoMesa.includes('Mesero ·') && textoMesa.includes('Por preparar'),
      textoMesa.replace(/\s+/g, ' '))

    etapa = 'recargar mesa ocupada y sumar una segunda comanda'
    await page.reload({ waitUntil: 'networkidle', timeout: 45000 })
    const guiaTrasPedido = page.locator('[data-guia-panel]')
    await guiaTrasPedido.waitFor({ state: 'visible' })
    await guiaTrasPedido.getByRole('button', { name: 'Explorar por mi cuenta' }).click()
    await guiaTrasPedido.waitFor({ state: 'detached' })
    const mesaTrasRecarga = page.locator(`button[data-guia-mesa="${setup.mesaId}"]`)
    await page.waitForFunction((id) => document.querySelector(`button[data-guia-mesa="${id}"]`)?.textContent?.includes('1 comanda'), setup.mesaId, { timeout: 15000 })
    check('el resumen de mesa ocupada persiste después de recargar', /35[.,]00/.test((await mesaTrasRecarga.innerText()).replace(/\u00a0/g, ' ')))
    etapa = 'abrir mesa ocupada después de recargar'
    await mesaTrasRecarga.click()
    etapa = 'iniciar segundo pedido desde la mesa ocupada'
    await page.getByRole('button', { name: '+ Agregar otro pedido', exact: true }).click()
    etapa = 'seleccionar producto para el segundo pedido'
    await agregarProducto(setup.comidas[1])
    etapa = 'simular respuesta perdida después de crear la segunda comanda'
    await page.evaluate(async () => {
      const { getApi } = await import('/src/lib/api.ts')
      const api = getApi()
      const crearOriginal = api.crearPedido
      api.crearPedido = async (...args) => {
        const resultado = await crearOriginal(...args)
        api.crearPedido = crearOriginal
        if (resultado.error) return resultado
        throw new Error('network timeout: respuesta perdida después del commit')
      }
    })
    etapa = 'pulsar enviar con respuesta de red perdida'
    await page.getByRole('button', { name: 'Enviar comanda', exact: true }).click()
    etapa = 'esperar mensaje de respuesta incierta'
    await page.getByText('No se pudo confirmar la respuesta. Puedes reintentar de forma segura.').waitFor().catch(async (error) => {
      throw new Error(`${error.message}; pedido=${(await page.locator('[data-mesero-pedido]').innerText()).slice(0, 900)}`)
    })
    const pendienteAntesDeRecarga = await page.evaluate(() => Object.keys(sessionStorage).filter((k) => k.startsWith('mesora:comanda-pendiente:')).length)
    check('un timeout posterior al commit conserva una clave mínima para el reintento', pendienteAntesDeRecarga === 1)
    etapa = 'recargar durante la solicitud pendiente'
    await page.reload({ waitUntil: 'networkidle', timeout: 45000 })
    const guiaTrasTimeout = page.locator('[data-guia-panel]')
    if (await guiaTrasTimeout.isVisible()) {
      await guiaTrasTimeout.getByRole('button', { name: 'Explorar por mi cuenta' }).click()
      await guiaTrasTimeout.waitFor({ state: 'detached' })
    }
    const mesaTrasTimeout = page.locator(`button[data-guia-mesa="${setup.mesaId}"]`)
    await page.waitForFunction((id) => document.querySelector(`button[data-guia-mesa="${id}"]`)?.textContent?.includes('2 comandas'), setup.mesaId, { timeout: 15000 })
    etapa = 'abrir mesa con solicitud pendiente tras recarga'
    await mesaTrasTimeout.click()
    etapa = 'abrir segundo pedido pendiente tras recarga'
    await page.getByRole('button', { name: '+ Agregar otro pedido', exact: true }).click()
    etapa = 'rechazar cambio de contenido con la misma clave'
    await agregarProducto(setup.comidas[0])
    await page.getByRole('button', { name: 'Enviar comanda', exact: true }).click()
    await page.getByText('La solicitud cambió y no coincide con la comanda original.').waitFor()
    check('contenido distinto conserva la clave pendiente sin crear otra comanda',
      await page.evaluate(() => Object.keys(sessionStorage).filter((k) => k.startsWith('mesora:comanda-pendiente:')).length) === 1)
    await page.getByRole('button', { name: `Restar ${setup.comidas[0]}` }).click()
    etapa = 'reconstruir la misma comanda tras recarga'
    await agregarProducto(setup.comidas[1])
    check('tras recargar se muestra el reintento seguro de la solicitud pendiente', await page.getByText('Hay un envío sin confirmar para esta mesa.', { exact: false }).isVisible())
    etapa = 'reintentar con la misma clave tras recarga'
    await page.getByRole('button', { name: 'Enviar comanda', exact: true }).click()
    await page.getByText('2 comandas por cobrar', { exact: true }).waitFor({ timeout: 15000 })
    check('reintentar con la misma clave conserva dos comandas, sin crear una tercera',
      (await page.evaluate(() => Object.keys(sessionStorage).filter((k) => k.startsWith('mesora:comanda-pendiente:')).length)) === 0)
    await page.getByText(/46[.,]00/).first().waitFor({ timeout: 15000 })
    const textoCuentaDosComandas = (await page.locator('body').innerText()).replace(/\u00a0/g, ' ')
    const resumenCuentaDosComandas = await page.getByText('2 comandas por cobrar', { exact: true }).locator('..').innerText()
    check('mesa ocupada resume dos comandas y el total actualizado', /46[.,]00/.test(resumenCuentaDosComandas.replace(/\u00a0/g, ' ')), resumenCuentaDosComandas.replace(/\s+/g, ' '))

    etapa = 'verificar prioridad de acciones y precuenta'
    const agregar = page.getByRole('button', { name: '+ Agregar otro pedido', exact: true })
    const precuentaButton = page.getByRole('button', { name: 'Ver precuenta', exact: true })
    const cerrar = page.getByRole('button', { name: /Cerrar cuenta/ })
    const indices = await Promise.all([agregar, precuentaButton, cerrar].map((locator) => locator.evaluate((element) => {
      const parent = element.parentElement
      return parent ? [...parent.children].indexOf(element) : -1
    })))
    check('Agregar pedido, precuenta y cierre aparecen en esa secuencia operativa', indices[0] >= 0 && indices[0] < indices[1] && indices[1] < indices[2], JSON.stringify(indices))
    await precuentaButton.click()
    const precuenta = page.getByRole('region', { name: 'Precuenta' })
    await precuenta.waitFor({ state: 'visible' })
    await precuenta.getByText('No es un comprobante de pago.', { exact: true }).waitFor()
    check('la precuenta aclara que no es comprobante de pago', await precuenta.getByRole('heading', { name: 'PRECUENTA' }).count() === 1)
    check('Mesero no presenta overflow horizontal en la operación móvil', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1))
  } catch (e) {
    fallos++
    checks++
    const textoPantalla = await page.locator('body').innerText().catch(() => '')
    await page.screenshot({ path: join(CAPTURAS, 'mesero-operativo-falla.png'), fullPage: false }).catch(() => {})
    console.log(`  FALLA flujo operativo de Mesero en ${etapa} — ${String(e).split('\n')[0].slice(0, 220)}; pantalla=${textoPantalla.replace(/\s+/g, ' ').slice(0, 900)}`)
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


}

async function correrSuperAdminResponsive(browser, vp) {
  // Superadmin: navegaci\u00f3n responsive y las diez rutas existentes.
  {
    const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h } })
    const page = await ctx.newPage()
    try {
      await iniciarSesion(page, 'superadmin@mesora.pe')
      await page.goto(URL + '/super-admin', { waitUntil: 'networkidle' })
      await page.getByRole('heading', { name: 'Búsqueda rápida' }).waitFor({ state: 'visible' })
      await page.getByRole('heading', { name: 'Requiere atención' }).waitFor({ state: 'visible' })
      const busquedaCentro = page.getByRole('searchbox', { name: 'Buscar en la plataforma' })
      await busquedaCentro.fill('Restaurante Demo')
      const resultadoRestaurante = page.getByRole('link', { name: /Restaurante Demo/ }).first()
      await resultadoRestaurante.waitFor({ state: 'visible' })
      check('superadmin ' + vp.nombre + ' · búsqueda rápida agrupa y enlaza restaurante', (await resultadoRestaurante.getAttribute('href') ?? '').startsWith('/super-admin/restaurantes/'))
      await resultadoRestaurante.click()
      await page.getByRole('heading', { name: 'Resumen operativo · últimos 30 días' }).waitFor({ state: 'visible' })
      check('superadmin ' + vp.nombre + ' · el resultado abre detalle operativo del restaurante', await page.getByRole('heading', { name: 'Restaurante Demo' }).count() > 0)
      await page.goto(URL + '/super-admin', { waitUntil: 'networkidle' })
      await busquedaCentro.fill('Carlos Nuevo')
      const resultadoAdmin = page.getByRole('region', { name: /Administradores:/ }).getByRole('link').first()
      await resultadoAdmin.waitFor({ state: 'visible' })
      check('superadmin ' + vp.nombre + ' · búsqueda de administrador abre perfil identificable', (await resultadoAdmin.getAttribute('href') ?? '').includes('/super-admin/usuarios?usuario='))
      await resultadoAdmin.click()
      await page.getByRole('heading', { name: 'Detalle del usuario' }).waitFor({ state: 'visible' })
      await page.goto(URL + '/super-admin', { waitUntil: 'networkidle' })
      const secciones = [
        { label: 'Dashboard', ruta: '/super-admin' },
        { label: 'Restaurantes', ruta: '/super-admin/restaurantes' },
        { label: 'Administradores', ruta: '/super-admin/administradores' },
        { label: 'Usuarios', ruta: '/super-admin/usuarios' },
        { label: 'Suscripciones', ruta: '/super-admin/suscripciones' },
        { label: 'Estad\u00edsticas', ruta: '/super-admin/estadisticas' },
        { label: 'Auditor\u00eda', ruta: '/super-admin/auditoria' },
        { label: 'Notificaciones', ruta: '/super-admin/notificaciones' },
        { label: 'Soporte', ruta: '/super-admin/soporte' },
        { label: 'Configuraci\u00f3n', ruta: '/super-admin/configuracion' },
      ]

      const esMovilOTablet = vp.w < 1024
      const botonMenu = page.getByRole('button', { name: 'Abrir men\u00fa de superadministraci\u00f3n' })
      if (esMovilOTablet) {
        await botonMenu.waitFor({ state: 'visible' })
        await botonMenu.click()
        const dialogo = page.getByRole('dialog', { name: 'Men\u00fa de superadministraci\u00f3n' })
        await dialogo.waitFor({ state: 'visible' })
        check('superadmin ' + vp.nombre + ' \u00b7 drawer anuncia estado abierto', await botonMenu.getAttribute('aria-expanded') === 'true')
        await dialogo.locator(':focus').waitFor({ state: 'visible' })
        check('superadmin ' + vp.nombre + ' \u00b7 foco inicial queda en el men\u00fa', await dialogo.locator(':focus').count() === 1)
        await page.keyboard.press('Escape')
        await dialogo.waitFor({ state: 'hidden' })
        check('superadmin ' + vp.nombre + ' \u00b7 Escape cierra el drawer', await botonMenu.getAttribute('aria-expanded') === 'false')
        check('superadmin ' + vp.nombre + ' \u00b7 foco vuelve al bot\u00f3n', await botonMenu.evaluate((el) => el === document.activeElement))
      } else {
        const barra = page.getByRole('complementary', { name: 'Navegaci\u00f3n de Superadmin' })
        check('superadmin ' + vp.nombre + ' \u00b7 sidebar visible', await barra.isVisible())
      }

      for (const seccion of secciones) {
        let enlace
        if (esMovilOTablet) {
          if (await botonMenu.getAttribute('aria-expanded') !== 'true') await botonMenu.click()
          const dialogo = page.getByRole('dialog', { name: 'Men\u00fa de superadministraci\u00f3n' })
          await dialogo.waitFor({ state: 'visible' })
          enlace = dialogo.getByRole('link', { name: seccion.label, exact: true })
        } else {
          enlace = page.getByRole('complementary', { name: 'Navegaci\u00f3n de Superadmin' })
            .getByRole('link', { name: seccion.label, exact: true })
        }
        await enlace.waitFor({ state: 'visible' })
        await enlace.click()
        await page.waitForURL((url) => url.pathname === seccion.ruta)
        await page.getByRole('heading', { level: 1 }).first().waitFor({ state: 'visible' })
        if (seccion.ruta === '/super-admin/suscripciones') {
          await page.getByRole('heading', { name: 'Estado de suscripciones' }).waitFor({ state: 'visible' })
          check('superadmin ' + vp.nombre + ' · resumen de vencimientos visible', await page.getByText('Vencen ≤ 7 días').count() === 1)
        }
        if (seccion.ruta === '/super-admin/soporte') {
          await page.getByRole('heading', { name: 'Estado de soporte' }).waitFor({ state: 'visible' })
          check('superadmin ' + vp.nombre + ' · resumen de tickets visible', await page.getByText('Urgentes abiertos', { exact: true }).count() === 1)
        }
        let navegacionActiva
        let cantidadNavegacionActiva = 0
        if (esMovilOTablet) {
          await page.getByRole('dialog', { name: 'Men\u00fa de superadministraci\u00f3n' }).waitFor({ state: 'hidden' })
          check('superadmin ' + vp.nombre + ' \u00b7 drawer cierra al elegir ' + seccion.label,
            await botonMenu.getAttribute('aria-expanded') === 'false')
          await botonMenu.click()
          const dialogo = page.getByRole('dialog', { name: 'Men\u00fa de superadministraci\u00f3n' })
          await dialogo.waitFor({ state: 'visible' })
          navegacionActiva = dialogo.locator('[aria-current="page"]').filter({ hasText: seccion.label })
          await navegacionActiva.waitFor({ state: 'visible' })
          cantidadNavegacionActiva = await navegacionActiva.count()
          await page.keyboard.press('Escape')
          await dialogo.waitFor({ state: 'hidden' })
        } else {
          navegacionActiva = page.getByRole('complementary', { name: 'Navegaci\u00f3n de Superadmin' })
            .locator('[aria-current="page"]').filter({ hasText: seccion.label })
          await navegacionActiva.waitFor({ state: 'visible' })
          cantidadNavegacionActiva = await navegacionActiva.count()
        }
        check('superadmin ' + vp.nombre + ' \u00b7 ' + seccion.label + ' activa en URL y navegaci\u00f3n',
          new globalThis.URL(page.url()).pathname === seccion.ruta && cantidadNavegacionActiva === 1)
        await medir(page, vp, vp.nombre + '_superadmin_' + seccion.label.toLowerCase())
      }

      // Cubre carga directa y recarga real de cada URL preservada sin ejecutar acciones.
      if (vp.w === 390) {
        for (const seccion of secciones) {
          await page.goto(URL + seccion.ruta, { waitUntil: 'networkidle' })
          await page.getByRole('heading', { level: 1 }).first().waitFor({ state: 'visible' })
          check('superadmin ' + vp.nombre + ' \u00b7 abre ruta directa ' + seccion.ruta,
            new globalThis.URL(page.url()).pathname === seccion.ruta &&
            await page.getByText('Unexpected Application Error').count() === 0)
          await page.reload({ waitUntil: 'networkidle' })
          await page.getByRole('heading', { level: 1 }).first().waitFor({ state: 'visible' })
          check('superadmin ' + vp.nombre + ' \u00b7 recarga ' + seccion.ruta,
            new globalThis.URL(page.url()).pathname === seccion.ruta &&
            await page.getByText('Unexpected Application Error').count() === 0)
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
    } else if (process.argv.includes('--solo-roles-operativos')) {
      await correrFlujoMeseroMovil(browser)
    } else if (process.argv.includes('--solo-landing')) {
      await correrLandingResponsive(browser)
    } else if (process.argv.includes('--solo-superadmin-responsive')) {
      for (const vp of VIEWPORTS_SUPERADMIN) await correrSuperAdminResponsive(browser, vp)
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
      await correrFlujoMeseroMovil(browser)
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
      for (const vp of VIEWPORTS_SUPERADMIN) await correrSuperAdminResponsive(browser, vp)
      await correrGuiaCategoria(browser)
    }
  } finally {
    if (browser) await browser.close()
    vite.kill()
    rmSync(ENV_DIR, { recursive: true, force: true })
  }

  console.log(`\n${'-'.repeat(60)}`)
  const cobertura = process.argv.includes('--solo-superadmin-responsive')
    ? 'Superadmin en 390, 768, 1024, 1280 y 1440 px'
    : process.argv.includes('--solo-admin-nav')
    ? 'navegaciÃ³n Admin en 390, 768, 1024, 1280 y 1440 px'
    : process.argv.includes('--solo-guia-categoria')
    ? 'recorrido guiado de categoría en 390x844'
    : process.argv.includes('--solo-demo-rutas-guia')
      ? 'rutas del demo y guía completada en escritorio y 390x844'
    : process.argv.includes('--solo-anulacion-ultimo-item')
      ? 'flujo visual de anulación del último ítem en 390x844'
    : process.argv.includes('--solo-roles-operativos')
      ? 'pedido móvil, resumen persistente, envío único, mesa ocupada y precuenta en 390x844'
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
