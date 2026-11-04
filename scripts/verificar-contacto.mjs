// Navegador con Supabase simulado. No entrega correos ni usa la base real.
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, resolve, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import { chromium, expect } from '@playwright/test'

const entorno = mkdtempSync(join(tmpdir(), 'mesora-contacto-'))
const safe = relative(resolve(tmpdir()), resolve(entorno))
assert(safe && !safe.startsWith('..') && !isAbsolute(safe))
const endpoint = 'https://mesora-contacto-qa.supabase.co'
const server = await createServer({
  root: fileURLToPath(new URL('..', import.meta.url)), envDir: entorno, logLevel: 'error',
  define: {
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(endpoint),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('qa-public-key'),
    'import.meta.env.VITE_MESORA_DIAGNOSTICO': JSON.stringify('false'),
  }, server: { host: '127.0.0.1', port: 0 },
})
let browser
try {
  await server.listen()
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`
  browser = await chromium.launch({ headless: true })
  for (const width of [360, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } })
    let calls = 0
    let release
    const held = new Promise((resolve) => { release = resolve })
    const mailto = []
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.route('**/*', async (route) => {
      const url = route.request().url()
      if (url.startsWith('mailto:')) { mailto.push(url); return route.abort() }
      if (url.startsWith(`${endpoint}/functions/v1/contacto-comercial`)) {
        calls++
        if (calls === 1) {
          await held
          return route.fulfill({ status: 502, contentType: 'application/json', body: '{"error":"fixture"}' })
        }
        return route.fulfill({ status: calls === 2 ? 200 : 202, contentType: 'application/json', body: calls === 2 ? '{"ok":true,"correo":"enviado"}' : '{"ok":true,"correo":"en_cola"}' })
      }
      if (url.startsWith(endpoint)) return route.fulfill({ status: 200, contentType: 'application/json', body: 'null' })
      if (url.startsWith(origin)) return route.continue()
      return route.abort()
    })
    await page.goto(`${origin}/#contacto`)
    await page.getByLabel('Tu nombre', { exact: true }).fill('Ana QA')
    await page.getByLabel('Restaurante', { exact: true }).fill('Local QA')
    await page.getByLabel('Tu correo', { exact: true }).fill('ana@example.invalid')
    await page.getByLabel('¿Qué te gustaría mejorar?', { exact: false }).fill('Pedido & cocina')
    await page.getByRole('button', { name: 'Enviar consulta', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Enviando consulta…' })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Enviando consulta…' })).toHaveAttribute('aria-busy', 'true')
    await expect(page.getByLabel('Tu nombre', { exact: true })).toBeDisabled()
    await page.locator('#contacto form').evaluate((form) => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })
    release()
    await expect(page.getByRole('alert')).toContainText('Tus datos siguen aquí')
    assert.equal(calls, 1, 'Doble evento no duplica la petición')
    assert.equal(mailto.length, 0, 'No debe abrir un cliente de correo automáticamente')
    await expect(page.getByLabel('Tu nombre', { exact: true })).toHaveValue('Ana QA')
    const manual = await page.getByRole('link', { name: 'Abrir correo con mi consulta' }).getAttribute('href')
    assert(decodeURIComponent(manual).includes('Pedido & cocina'))
    await page.getByRole('button', { name: 'Reintentar envío' }).click()
    await expect(page.getByRole('status')).toContainText('Tu consulta llegó a Mesora')
    await expect(page.getByLabel('Tu nombre', { exact: true })).toHaveValue('')
    assert.equal(calls, 2)
    await page.getByLabel('Tu nombre', { exact: true }).fill('Ana QA')
    await page.getByLabel('Restaurante', { exact: true }).fill('Local QA')
    await page.getByLabel('Tu correo', { exact: true }).fill('ana@example.invalid')
    await page.getByRole('button', { name: 'Enviar consulta', exact: true }).click()
    await expect(page.getByRole('status')).toContainText('pendiente y se reintentará automáticamente')
    assert.equal(calls, 3)
    assert.deepEqual(errors, [])
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Sin desborde horizontal')
    await page.close()
  }
  console.log('Contacto aprobado a 360 y 1280 px: carga, doble envío, fallo, respaldo manual, reintento, éxito y correo pendiente.')
} finally {
  await browser?.close()
  await server.close()
  rmSync(entorno, { recursive: true, force: true })
}
