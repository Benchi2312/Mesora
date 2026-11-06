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
    tabs: ['Dashboard', 'Ventas', 'Caja', 'Cobros', 'Mesas y zonas', 'Menú', 'Personal', 'Datos del local', 'Soporte'],
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
    const botones = [...document.querySelectorAll('button')].filter((el) => {
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
          .map((otro) => (otro.getAttribute('aria-label') || otro.innerText || '').trim().slice(0, 40))
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
      for (const tab of pantalla.tabs) {
        await page.getByRole('button', { name: tab, exact: true }).first().click()
        await page.waitForTimeout(350)
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
    } else if (process.argv.includes('--solo-guia-movil')) {
      for (const vp of VIEWPORTS.filter((vista) => vista.w <= 768)) await correrGuiaMovil(browser, vp)
    } else if (process.argv.includes('--solo-landing')) {
      await correrLandingResponsive(browser)
    } else {
      await correrLandingResponsive(browser)
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
  const cobertura = process.argv.includes('--solo-guia-categoria')
    ? 'recorrido guiado de categoría en 390x844'
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
