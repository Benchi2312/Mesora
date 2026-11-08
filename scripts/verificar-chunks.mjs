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

try {
  // La ruta afectada debe abrirse directamente y sobrevivir a una recarga.
  {
    const context = await abrirContexto()
    const page = await context.newPage()
    for (let intento = 0; intento < 2; intento++) {
      const response = await page.goto(`${ORIGEN}/super-admin/configuracion`, { waitUntil: 'load' })
      assert(response?.ok(), 'La ruta de configuración no devolvió el shell de la aplicación.')
      await expect(page).toHaveURL(`${ORIGEN}/login`)
      await expect(page.getByRole('heading', { name: 'Iniciar sesión', exact: true })).toBeVisible()
      await expect(page.getByText('Unexpected Application Error')).toHaveCount(0)
      if (intento === 0) await page.reload({ waitUntil: 'load' })
      console.log(`OK /super-admin/configuracion ${intento === 0 ? 'apertura directa' : 'recarga'}`)
    }
    await context.close()
  }

  // Fallo transitorio del chunk: una sola recarga controlada consigue la
  // versión vigente y limpia el parámetro temporal de la dirección.
  {
    const context = await abrirContexto()
    const page = await context.newPage()
    let fallosChunk = 0
    let documentosDeReintento = 0
    page.on('request', (request) => {
      const url = new URL(request.url())
      if (request.resourceType() === 'document' && url.searchParams.has('__mesora_chunk_retry')) {
        documentosDeReintento++
      }
    })
    await context.route(`**/assets/${chunkAdmin}`, async (route) => {
      fallosChunk++
      if (fallosChunk === 1) {
        await route.fulfill({
          status: 404,
          contentType: 'text/html; charset=utf-8',
          body: '<!doctype html><title>Not Found</title>',
        })
      } else {
        await route.continue()
      }
    })
    await page.goto(`${ORIGEN}/demo/admin`, { waitUntil: 'load' })
    await expect(page.getByRole('heading', { level: 1, name: 'Panel de administración' })).toBeVisible({ timeout: 20_000 })
    await expect.poll(() => new URL(page.url()).searchParams.has('__mesora_chunk_retry')).toBe(false)
    assert.equal(fallosChunk, 2, 'El chunk fallido debe volver a solicitarse una sola vez tras recargar.')
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
    let fallosChunk = 0
    let documentosDeReintento = 0
    page.on('request', (request) => {
      const url = new URL(request.url())
      if (request.resourceType() === 'document' && url.searchParams.has('__mesora_chunk_retry')) {
        documentosDeReintento++
      }
    })
    await context.route(`**/assets/${chunkAdmin}`, async (route) => {
      fallosChunk++
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
    assert.equal(fallosChunk, 2, 'Un fallo persistente debe detenerse tras dos solicitudes del chunk.')
    assert.equal(documentosDeReintento, 1, 'Un fallo persistente no debe producir un bucle de recargas.')
    console.log('OK segundo fallo: mensaje amigable, sin pantalla técnica ni bucle')
    await context.close()
  }
} finally {
  await browser.close()
  await vite.close()
}
