// Smoke público del despliegue: rutas, recursos y aislamiento del demo.
// No inicia sesión, envía formularios ni modifica la base de datos real.
// No sustituye las pruebas de caja, recuperación por correo o impresora física.
// Uso: node scripts/verificar-despliegue.mjs https://mesora-piloto.vercel.app
import assert from 'node:assert/strict'
import { chromium, expect } from '@playwright/test'

assert(process.argv[2], 'Indica la URL HTTPS del despliegue como primer argumento.')
const destino = new URL(process.argv[2])
assert.equal(destino.protocol, 'https:', 'El smoke público requiere HTTPS.')
assert(!destino.username && !destino.password && !destino.search && !destino.hash,
  'La URL debe estar libre de credenciales, parámetros y fragmentos.')
assert.equal(destino.pathname, '/', 'Indica el origen del despliegue, sin ruta.')
const origen = destino.origin
const esLocal = (host) => host === 'localhost' || host.endsWith('.localhost') ||
  host === '0.0.0.0' || host === '[::1]' || /^127\./.test(host)
assert(!esLocal(destino.hostname), 'El destino debe ser un despliegue público.')
const esSupabase = (host) => /(^|\.)supabase\.(co|com|in)$/.test(host)
const recursoApp = (request) => {
  const url = new URL(request.url())
  return url.origin === origen && (url.pathname.startsWith('/assets/') ||
    ['script', 'stylesheet', 'font', 'image'].includes(request.resourceType())) &&
    !url.pathname.startsWith('/_vercel/')
}
const describir = (url) => {
  const parsed = new URL(url)
  return `${parsed.hostname}${parsed.pathname}`
}

const casos = [
  { ruta: '/', tipo: 'landing' },
  { ruta: '/login', tipo: 'login' },
  { ruta: '/demo/admin', tipo: 'demo', titulo: 'Panel de administración' },
  { ruta: '/demo/mesero', tipo: 'demo', texto: 'Toma de pedidos y cierre de cuentas' },
  { ruta: '/demo/cocina', tipo: 'demo', titulo: 'Cocina y barra' },
  { ruta: '/demo/cajero', tipo: 'demo', titulo: 'Caja' },
  { ruta: '/restablecer', tipo: 'restablecer' },
  ...['/admin', '/mesero', '/cocina', '/cajero', '/super-admin'].map((ruta) => ({ ruta, tipo: 'privada' })),
]

const browser = await chromium.launch({ headless: true })
let comprobados = 0
try {
  for (const caso of casos) {
    // Cada ruta empieza sin sesión, cookies ni datos de un caso anterior.
    const context = await browser.newContext({ serviceWorkers: 'block' })
    const fallos = []
    try {
      // Las llamadas inesperadas al backend se bloquean antes de enviarse.
      // Los servicios opcionales de analítica no forman parte del smoke.
      await context.route('**/*', async (route) => {
        const request = route.request()
        const url = new URL(request.url())
        const backend = esSupabase(url.hostname)
        if (esLocal(url.hostname) || (backend && (caso.tipo === 'demo' ||
          !['GET', 'HEAD', 'OPTIONS'].includes(request.method())))) {
          fallos.push(`Solicitud inesperada: ${request.method()} ${describir(request.url())}`)
          await route.abort()
          return
        }
        await route.continue()
      })
      const page = await context.newPage()
      page.setDefaultTimeout(20_000)
      page.on('pageerror', (error) => fallos.push(`JavaScript: ${error.message}`))
      page.on('response', (response) => {
        if (response.status() >= 400 && recursoApp(response.request())) {
          fallos.push(`Recurso ${response.status()}: ${describir(response.url())}`)
        }
      })
      page.on('requestfailed', (request) => {
        if (recursoApp(request) && !request.failure()?.errorText.includes('ERR_ABORTED')) {
          fallos.push(`Recurso fallido: ${describir(request.url())}`)
        }
      })
      page.on('websocket', (socket) => {
        const url = new URL(socket.url())
        if (esLocal(url.hostname) || (caso.tipo === 'demo' && esSupabase(url.hostname))) {
          fallos.push(`WebSocket inesperado: ${describir(socket.url())}`)
        }
      })

      const response = await page.goto(`${origen}${caso.ruta}`, { waitUntil: 'load', timeout: 45_000 })
      assert(response?.ok(), `${caso.ruta}: el documento no respondió correctamente (${response?.status()}).`)
      assert.equal(new URL(page.url()).origin, origen, `${caso.ruta}: redirección fuera del despliegue; revisa su protección de acceso.`)

      if (caso.tipo === 'landing') {
        await expect(page.getByRole('heading', { level: 1, name: /Tu restaurante/ })).toBeVisible()
        await expect(page.getByRole('link', { name: 'Probar el demo', exact: true })).toBeVisible()
      } else if (caso.tipo === 'login' || caso.tipo === 'privada') {
        await expect(page).toHaveURL(`${origen}/login`)
        await expect(page.getByRole('heading', { name: 'Iniciar sesión', exact: true })).toBeVisible()
        await expect(page.getByLabel('Email', { exact: true })).toBeEnabled()
        await expect(page.getByLabel('Contraseña', { exact: true })).toBeEnabled()
        await expect(page.getByText('Entorno de pruebas', { exact: true })).toHaveCount(0)
        await expect(page.getByRole('alert')).toHaveCount(0)
      } else if (caso.tipo === 'demo') {
        await expect(page).toHaveURL(`${origen}${caso.ruta}`)
        const explorar = page.getByRole('button', { name: 'Explorar por mi cuenta', exact: true })
        if (await explorar.count()) await explorar.click()
        await expect(page.getByText('Modo demo', { exact: true })).toBeVisible()
        if (caso.titulo) await expect(page.getByRole('heading', { level: 1, name: caso.titulo, exact: true })).toBeVisible()
        if (caso.texto) await expect(page.getByText(caso.texto, { exact: true })).toBeVisible()
      } else {
        await expect(page.getByText('Este enlace no es válido o ya venció.', { exact: false })).toBeVisible()
        await expect(page.getByRole('button', { name: 'Volver a iniciar sesión', exact: true })).toBeVisible()
      }

      // Espera dos frames para capturar fallos del render sin depender de
      // networkidle, que puede quedar abierto por servicios externos opcionales.
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
      assert.deepEqual(fallos, [], `${caso.ruta}: errores detectados`)
      comprobados++
      console.log(`OK ${caso.ruta}${caso.tipo === 'privada' ? ' → /login' : ''}`)
    } finally {
      await context.close()
    }
  }
  console.log(`Despliegue verificado: ${comprobados} rutas en ${origen}; sin iniciar sesión ni escribir datos reales.`)
} finally {
  await browser.close()
}
