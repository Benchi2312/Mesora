// Comprueba la recuperación de imports dinámicos sobre el build de producción.
// El 404 interceptado reproduce una pestaña que conserva el nombre de un chunk
// anterior mientras el despliegue actual ya no lo contiene.
import assert from 'node:assert/strict'
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium, expect } from '@playwright/test'
import { preview } from 'vite'

const RAIZ = process.cwd()
const PUERTO = 4177
const ORIGEN = `http://127.0.0.1:${PUERTO}`
const assets = await readdir(join(RAIZ, 'dist', 'assets'))
const chunkAdmin = assets.find((archivo) => /^Admin-[\w-]+\.js$/.test(archivo))
assert(chunkAdmin, 'No se encontró el chunk de Admin en dist/assets. Ejecuta primero npm run build.')

const vite = await preview({
  preview: { host: '127.0.0.1', port: PUERTO, strictPort: true },
})
const browser = await chromium.launch({ headless: true })

async function abrirContexto() {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' })
  // Las pruebas recorren el demo local y no deben alcanzar servicios externos.
  await context.route('https://**/*', async (route) => {
    const host = new URL(route.request().url()).hostname
    if (host.endsWith('.supabase.co')) await route.abort()
    else await route.continue()
  })
  return context
}

function esImportacionDesdeBundle(request) {
  const referer = request.headers().referer
  return Boolean(referer && new URL(referer).pathname.startsWith('/assets/'))
}

try {
  // La ruta afectada debe abrirse directamente y sobrevivir a una recarga.
  {
    const context = await abrirContexto()
    const page = await context.newPage()
    let solicitudesChunkAdmin = 0
    page.on('request', (request) => {
      if (new URL(request.url()).pathname === `/assets/${chunkAdmin}`) solicitudesChunkAdmin++
    })
    for (let intento = 0; intento < 2; intento++) {
      const response = await page.goto(`${ORIGEN}/super-admin/configuracion`, { waitUntil: 'load' })
      assert(response?.ok(), 'La ruta de configuración no devolvió el shell de la aplicación.')
      await expect(page).toHaveURL(`${ORIGEN}/login`)
      await expect(page.getByRole('heading', { name: 'Iniciar sesión', exact: true })).toBeVisible()
      await expect(page.getByText('Unexpected Application Error')).toHaveCount(0)
      if (intento === 0) await page.reload({ waitUntil: 'load' })
      console.log(`OK /super-admin/configuracion ${intento === 0 ? 'apertura directa' : 'recarga'}`)
    }
    await page.goto(`${ORIGEN}/demo/admin`, { waitUntil: 'load' })
    await expect(page.getByRole('heading', { level: 1, name: 'Panel de administración' })).toBeVisible()
    await page.reload({ waitUntil: 'load' })
    await expect(page.getByRole('heading', { level: 1, name: 'Panel de administración' })).toBeVisible()
    assert(solicitudesChunkAdmin >= 1, 'La apertura directa de Admin debe cargar el chunk compilado.')
    await expect(page.getByText('Unexpected Application Error')).toHaveCount(0)
    console.log('OK /demo/admin apertura directa y recarga normal con chunk')
    await context.close()
  }

  // Fallo transitorio del chunk: una sola recarga controlada consigue la
  // versión vigente y limpia el parámetro temporal de la dirección.
  {
    const context = await abrirContexto()
    const page = await context.newPage()
    let fallosDeImportacion = 0
    let fallosDePrecarga = 0
    let solicitudesTrasReintento = 0
    let documentosDeReintento = 0
    page.on('request', (request) => {
      const url = new URL(request.url())
      if (request.resourceType() === 'document' && url.searchParams.has('__mesora_chunk_retry')) {
        documentosDeReintento++
      }
    })
    await context.route(`**/assets/${chunkAdmin}`, async (route) => {
      // Vite precarga con fetch desde el documento. Aunque su respuesta 404 no
      // rechaza el fetch, también debe fallar el import dinámico real del bundle.
      if (documentosDeReintento > 0) {
        solicitudesTrasReintento++
        await route.continue()
        return
      }
      if (esImportacionDesdeBundle(route.request())) fallosDeImportacion++
      else fallosDePrecarga++
      await route.fulfill({
        status: 404,
        contentType: 'text/html; charset=utf-8',
        body: '<!doctype html><title>Not Found</title>',
      })
    })
    await page.goto(`${ORIGEN}/demo/admin`, { waitUntil: 'load' })
    await expect(page.getByRole('heading', { level: 1, name: 'Panel de administración' })).toBeVisible({ timeout: 20_000 })
    await expect.poll(() => new URL(page.url()).searchParams.has('__mesora_chunk_retry')).toBe(false)
    assert(fallosDePrecarga >= 1, 'Debe fallar la precarga inicial del chunk obsoleto.')
    assert.equal(fallosDeImportacion, 1, 'El import dinámico real debe fallar una sola vez antes de recuperar.')
    assert(solicitudesTrasReintento >= 1, 'Tras la recarga debe solicitarse el chunk vigente.')
    assert.equal(documentosDeReintento, 1, 'Debe producirse una única recarga automática.')
    await expect(page.getByText('Unexpected Application Error')).toHaveCount(0)
    console.log('OK chunk obsoleto: una recarga automática, módulo nuevo cargado y URL limpia')
    await context.close()
  }

  // Fallo persistente: no hay bucle; la segunda carga presenta el mensaje
  // propio del router y una acción manual para volver a intentarlo.
  {
    const context = await abrirContexto()
    const page = await context.newPage()
    let fallosDeImportacion = 0
    let fallosDePrecarga = 0
    let documentosDeReintento = 0
    page.on('request', (request) => {
      const url = new URL(request.url())
      if (request.resourceType() === 'document' && url.searchParams.has('__mesora_chunk_retry')) {
        documentosDeReintento++
      }
    })
    await context.route(`**/assets/${chunkAdmin}`, async (route) => {
      // Fallar la precarga y el import garantiza que el módulo no se satisfaga
      // desde el mapa de módulos antes de probar la recuperación del router.
      if (esImportacionDesdeBundle(route.request())) fallosDeImportacion++
      else fallosDePrecarga++
      await route.fulfill({
        status: 404,
        contentType: 'text/html; charset=utf-8',
        body: '<!doctype html><title>Not Found</title>',
      })
    })
    await page.goto(`${ORIGEN}/demo/admin`, { waitUntil: 'load' })
    await expect(page.getByRole('heading', { name: 'No pudimos actualizar esta pantalla' })).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText('Unexpected Application Error')).toHaveCount(0)
    await expect(page.getByText('Failed to fetch dynamically imported module')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Recargar página' })).toBeVisible()
    assert(fallosDePrecarga >= 2, 'El escenario debe fallar la precarga inicial y la del reintento.')
    assert.equal(fallosDeImportacion, 2, 'El import dinámico debe fallar una vez por carga de página.')
    assert.equal(documentosDeReintento, 1, 'Un fallo persistente no debe producir un bucle de recargas.')
    console.log('OK segundo fallo: mensaje amigable, sin pantalla técnica ni bucle')
    await context.close()
  }
} finally {
  await browser.close()
  await vite.close()
}
