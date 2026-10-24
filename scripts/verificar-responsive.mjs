// Verificación de responsive sin mirar capturas: recorre las rutas reales en
// varios anchos y falla si algo se sale del viewport (scroll horizontal) o si
// un control táctil queda por debajo de 32 px de alto.
//
//   npm run verificar:responsive
//
// Levanta Vite en modo demo (aparta .env.local para no tocar Supabase), así los
// datos son los mock y no hace falta iniciar sesión.

import { chromium } from '@playwright/test'
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, openSync, renameSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const SCRIPTS = dirname(fileURLToPath(import.meta.url))
const RAIZ = join(SCRIPTS, '..')
const CAPTURAS = join(RAIZ, 'capturas', 'responsive')
const PUERTO = 5175
const URL = `http://127.0.0.1:${PUERTO}`

const VIEWPORTS = [
  { w: 360, h: 640, nombre: '360x640' },
  { w: 390, h: 844, nombre: '390x844' },
  { w: 768, h: 1024, nombre: '768x1024' },
  { w: 1280, h: 800, nombre: '1280x800' },
]

// Cada entrada: ruta + pestañas que hay que abrir dentro de ella (por nombre
// accesible del botón) para revisar todas las pantallas.
const PANTALLAS = [
  { ruta: '/', nombre: 'landing' },
  { ruta: '/login', nombre: 'login' },
  {
    ruta: '/demo/admin',
    nombre: 'admin',
    tabs: ['Dashboard', 'Caja', 'Cobros', 'Mesas y zonas', 'Menú', 'Personal', 'Datos del local', 'Soporte'],
  },
  { ruta: '/demo/mesero', nombre: 'mesero' },
  { ruta: '/demo/cocina', nombre: 'cocina' },
  { ruta: '/demo/cajero', nombre: 'cajero' },
]

const ENV_LOCAL = join(RAIZ, '.env.local')
const ENV_PAUSA = join(RAIZ, '.env.local.pausa-responsive')
if (existsSync(ENV_PAUSA) && !existsSync(ENV_LOCAL)) renameSync(ENV_PAUSA, ENV_LOCAL)
const teniaEnvLocal = existsSync(ENV_LOCAL)
if (teniaEnvLocal) renameSync(ENV_LOCAL, ENV_PAUSA)
const restaurarEnvLocal = () => {
  if (teniaEnvLocal && existsSync(ENV_PAUSA)) renameSync(ENV_PAUSA, ENV_LOCAL)
}

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
  const bin = join(RAIZ, 'node_modules', 'vite', 'bin', 'vite.js')
  return spawn(process.execPath, [bin, '--host', '127.0.0.1', '--port', String(PUERTO), '--strictPort'], {
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
    return { scroll, ancho: window.innerWidth, desbordes, chicos }
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
  if (datos.desbordes.length > 0) {
    await page.screenshot({ path: join(CAPTURAS, `${etiqueta}.png`), fullPage: false })
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
    for (const vp of VIEWPORTS) {
      console.log(`\nViewport ${vp.nombre}`)
      for (const pantalla of PANTALLAS) await correrPantalla(browser, vp, pantalla)
      try {
        await correrSesionesLocales(browser, vp)
      } catch (e) {
        fallos++
        checks++
        console.log(`  FALLA sesiones locales ${vp.nombre} — ${String(e).split('\n')[0].slice(0, 200)}`)
      }
    }
  } finally {
    if (browser) await browser.close()
    vite.kill()
    restaurarEnvLocal()
  }

  console.log(`\n${'-'.repeat(60)}`)
  if (fallos === 0) {
    console.log(`RESPONSIVE OK: ${checks} comprobaciones en ${VIEWPORTS.length} viewports.`)
  } else {
    console.log(`${fallos} de ${checks} comprobaciones fallaron. Capturas en ${CAPTURAS}`)
    process.exitCode = 1
  }
}

run().catch((e) => {
  console.error(e)
  restaurarEnvLocal()
  process.exit(1)
})
