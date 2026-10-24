// Capturas del recorrido guiado del demo con Playwright, en 3 viewports.
//
//   npm run capturas:demo
//
// Levanta Vite, entra a /demo/admin, arranca el recorrido y crea una zona y una
// mesa usando el prefill. Deja los PNG en `capturas/` y falla (código 1) si el
// panel de la guía se solapa con el modal abierto o con el ancla resaltada: es
// el bug que este recorrido existe para evitar.

import { chromium } from '@playwright/test'
import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, openSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'

const SCRIPTS = dirname(fileURLToPath(import.meta.url))
const RAIZ = join(SCRIPTS, '..')
const CAPTURAS = join(RAIZ, 'capturas')
const PUERTO = 5174
const URL = `http://127.0.0.1:${PUERTO}`
const VIEWPORTS = [
  { w: 1366, h: 768 },
  { w: 1024, h: 768 },
  { w: 820, h: 1180 },
  { w: 768, h: 1024 },
  { w: 390, h: 844 },
]

// Modo demo: Vite usa un directorio de entorno temporal y vacÃ­o, sin mover
// .env.local ni alterar la configuraciÃ³n de otros servidores abiertos.
const ENV_DIR = mkdtempSync(join(tmpdir(), 'mesora-capturas-env-'))

mkdirSync(CAPTURAS, { recursive: true })

const fallos = []
function check(nombre, condicion, detalle = '') {
  if (condicion) {
    console.log(`  ok   ${nombre}`)
  } else {
    fallos.push(`${nombre}${detalle ? ` — ${detalle}` : ''}`)
    console.log(`  FALLA ${nombre}${detalle ? ` — ${detalle}` : ''}`)
  }
}

function solapa(a, b) {
  if (!a || !b) return false
  return !(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y)
}

function iniciarVite() {
  const log = openSync(join(RAIZ, 'vite-capturas.log'), 'a')
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

async function capturar(page, vp, nombre) {
  const archivo = `demo_admin_${vp.w}x${vp.h}_${nombre}.png`
  await page.screenshot({ path: join(CAPTURAS, archivo) })
  console.log(`  · ${archivo}`)
}

async function correrViewport(browser, vp) {
  console.log(`\nViewport ${vp.w}x${vp.h}`)
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h } })
  const page = await ctx.newPage()
  await page.goto(`${URL}/demo/admin`, { waitUntil: 'networkidle' })

  const panel = page.locator('[data-guia-panel]')
  const modal = page.locator('[role="dialog"][aria-modal="true"]')
  await capturar(page, vp, '01_inicio')

  await page.getByRole('button', { name: 'Empezar recorrido' }).click()
  await page.waitForTimeout(500)
  await capturar(page, vp, '02_recorrido')

  // Paso 1: abrir "Mesas y zonas" y crear una zona con el prefill.
  await page.locator('[data-guia="admin-tab-mesas"]').click()
  await page.waitForTimeout(600)
  const boxPanelPre = await panel.boundingBox()
  const boxNuevaZona = await page.locator('[data-guia="nueva-zona"]').boundingBox()
  check(
    `${vp.w}x${vp.h} · la guía no tapa el botón "Nueva zona"`,
    !solapa(boxPanelPre, boxNuevaZona),
    JSON.stringify({ boxPanelPre, boxNuevaZona }),
  )
  await page.locator('[data-guia="nueva-zona"]').click()
  await modal.waitFor({ state: 'visible' })
  await page.waitForTimeout(700)
  await capturar(page, vp, '03_modal_zona')

  const nombreZona = await page.locator('#zona-nombre').inputValue()
  check(`${vp.w}x${vp.h} · el prefill de zona llega al formulario`, nombreZona === 'Salón principal', nombreZona)
  const boxModal = await modal.boundingBox()
  const boxPanel = await panel.boundingBox()
  check(`${vp.w}x${vp.h} · la guía no tapa el modal`, !solapa(boxPanel, boxModal), JSON.stringify({ boxPanel, boxModal }))
  const ancla = page.locator('[data-guia="zona-guardar"]')
  const boxAncla = await ancla.boundingBox()
  check(`${vp.w}x${vp.h} · la guía no tapa el botón resaltado`, !solapa(boxPanel, boxAncla), JSON.stringify({ boxPanel, boxAncla }))

  // La guía puede mostrarse expandida o compacta (según quepa): en cualquier
  // estado debe seguir sin tapar el modal ni el botón que hay que pulsar.
  const btnExpandir = page.getByRole('button', { name: 'Expandir guía' })
  const btnCompactar = page.getByRole('button', { name: 'Compactar guía' })
  let toggled = false
  if (await btnExpandir.count()) {
    await btnExpandir.first().click()
    toggled = true
  } else if (await btnCompactar.count()) {
    await btnCompactar.first().click()
    toggled = true
  }
  if (toggled) {
    await page.waitForTimeout(500)
    const boxPanelToggle = await panel.boundingBox()
    const boxModalToggle = await modal.boundingBox()
    const boxAnclaToggle = await ancla.boundingBox()
    check(
      `${vp.w}x${vp.h} · tras cambiar el tamaño, la guía sigue sin tapar el modal`,
      !solapa(boxPanelToggle, boxModalToggle),
      JSON.stringify({ boxPanelToggle, boxModalToggle }),
    )
    check(
      `${vp.w}x${vp.h} · tras cambiar el tamaño, la guía sigue sin tapar el botón`,
      !solapa(boxPanelToggle, boxAnclaToggle),
      JSON.stringify({ boxPanelToggle, boxAnclaToggle }),
    )
    await capturar(page, vp, '03b_modal_zona_guia_redimensionada')
  }

  await page.locator('[data-guia="zona-guardar"]').click()
  await modal.waitFor({ state: 'hidden' })
  await page.waitForTimeout(500)
  await capturar(page, vp, '04_zona_creada')

  // Paso 1b: crear la mesa dentro de la zona nueva.
  await page.locator('[data-guia="agregar-mesa"]').first().click()
  await modal.waitFor({ state: 'visible' })
  await page.waitForTimeout(700)
  await capturar(page, vp, '05_modal_mesa')

  const nombreMesa = await page.locator('#mesa-nombre').inputValue()
  check(`${vp.w}x${vp.h} · el prefill de mesa llega al formulario`, nombreMesa === 'Mesa 10', nombreMesa)
  const boxPanelMesa = await panel.boundingBox()
  const boxModalMesa = await modal.boundingBox()
  check(`${vp.w}x${vp.h} · la guía no tapa el modal de mesa`, !solapa(boxPanelMesa, boxModalMesa))

  await page.locator('[data-guia="mesa-guardar"]').click()
  await modal.waitFor({ state: 'hidden' })
  await page.waitForTimeout(500)
  await capturar(page, vp, '06_mesa_creada')

  await ctx.close()
}

async function run() {
  const vite = iniciarVite()
  let browser
  try {
    await esperarServidor()
    browser = await chromium.launch({ headless: true })
    for (const vp of VIEWPORTS) await correrViewport(browser, vp)
  } finally {
    if (browser) await browser.close()
    vite.kill()
    rmSync(ENV_DIR, { recursive: true, force: true })
  }

  console.log(`\n${'-'.repeat(60)}`)
  if (fallos.length === 0) {
    console.log(`CAPTURAS LISTAS en ${CAPTURAS}`)
  } else {
    console.log(`${fallos.length} comprobaciones fallaron:`)
    for (const f of fallos) console.log(`  · ${f}`)
    process.exitCode = 1
  }
}

run().catch((e) => {
  console.error(e)
  rmSync(ENV_DIR, { recursive: true, force: true })
  process.exit(1)
})
