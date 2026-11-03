// Regresión de acceso: Auth y REST simulados en navegador aislado.
// No usa cuentas, sesiones, correos ni operaciones de la base real.
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import { chromium, expect } from '@playwright/test'

const entorno = mkdtempSync(join(tmpdir(), 'mesora-acceso-'))
const temporalRelativo = relative(resolve(tmpdir()), resolve(entorno))
assert(temporalRelativo && !temporalRelativo.startsWith('..') && !isAbsolute(temporalRelativo),
  'El entorno temporal debe quedar dentro del directorio temporal del sistema.')
const endpoint = 'https://mesora-acceso-qa.supabase.co'
const server = await createServer({
  root: fileURLToPath(new URL('..', import.meta.url)), envDir: entorno, logLevel: 'error',
  define: {
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(endpoint),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('qa-public-key'),
    'import.meta.env.VITE_MESORA_MODO_LOCAL': JSON.stringify('false'),
    'import.meta.env.VITE_MESORA_DIAGNOSTICO': JSON.stringify('false'),
  },
  server: { host: '127.0.0.1', port: 0 },
})
let browser
try {
  await server.listen()
  const origen = `http://127.0.0.1:${server.httpServer.address().port}`
  browser = await chromium.launch({ headless: true })
  for (const escenario of ['inactivo', 'desactivado-tras-refresh', 'password-temporal']) {
    const context = await browser.newContext({ serviceWorkers: 'block' })
    const errores = []
    const operaciones = []
    const perfil = {
      id: '10000000-0000-4000-8000-000000000001',
      restaurante_id: '20000000-0000-4000-8000-000000000001',
      nombre: 'Cajero QA', email: 'qa@example.invalid', rol: 'cajero',
      activo: escenario !== 'inactivo',
      // El bloqueo por inactividad debe ganar al cambio de clave obligatorio.
      debe_cambiar_password: escenario !== 'desactivado-tras-refresh',
      created_at: new Date().toISOString(),
    }
    const usuarioAuth = {
      id: perfil.id, email: perfil.email, aud: 'authenticated', role: 'authenticated',
      app_metadata: {}, user_metadata: {}, created_at: perfil.created_at,
    }
    const exp = Math.floor(Date.now() / 1000) + 3600
    const token = [
      { alg: 'HS256', typ: 'JWT' }, { sub: perfil.id, exp, role: 'authenticated' },
    ].map((part) => Buffer.from(JSON.stringify(part)).toString('base64url')).join('.') + '.firma-simulada'
    let clavesActualizadas = 0
    let confirmaciones = 0
    try {
      await context.route('**/*', async (route) => {
        const request = route.request()
        if (request.url().startsWith(origen + '/')) return route.continue()
        if (!request.url().startsWith(endpoint + '/')) {
          const inesperada = new URL(request.url())
          if (inesperada.hostname === 'fonts.googleapis.com') {
            return route.fulfill({ status: 200, contentType: 'text/css', body: '' })
          }
          errores.push(`Solicitud fuera de QA: ${inesperada.hostname}${inesperada.pathname}`)
          return route.abort()
        }
        const path = new URL(request.url()).pathname
        const json = (data) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) })
        if (path === '/auth/v1/token') return json({
          access_token: token, refresh_token: 'refresh-qa', token_type: 'bearer',
          expires_in: 3600, expires_at: exp, user: usuarioAuth,
        })
        if (path === '/auth/v1/logout') return route.fulfill({ status: 204 })
        if (path === '/auth/v1/user') {
          if (request.method() === 'PUT') clavesActualizadas++
          return json(usuarioAuth)
        }
        if (path === '/rest/v1/usuarios') return json([perfil])
        if (path === '/rest/v1/restaurantes') return json(perfil.activo === false ? [] : [{
          id: perfil.restaurante_id, nombre: 'Local QA', suscripcion_activa: true,
          fecha_vencimiento: null, created_at: perfil.created_at,
        }])
        if (path === '/rest/v1/rpc/confirmar_cambio_password') {
          confirmaciones++
          perfil.debe_cambiar_password = false
          return json(null)
        }
        operaciones.push(path)
        return json([])
      })
      const page = await context.newPage()
      page.setDefaultTimeout(15_000)
      page.on('pageerror', (error) => errores.push(error.message))
      await page.goto(`${origen}/login`)
      await page.getByLabel('Email', { exact: true }).fill(perfil.email)
      await page.getByLabel('Contraseña', { exact: true }).fill('Clave-solo-QA-123')
      await page.getByRole('button', { name: 'Ingresar', exact: true }).click()

      if (escenario === 'password-temporal') {
        await expect(page).toHaveURL(`${origen}/restablecer`)
        await expect(page.getByRole('heading', { name: 'Crea tu nueva contraseña', exact: true })).toBeVisible()
        await page.getByLabel('Nueva contraseña', { exact: true }).fill('Nueva-clave-QA-456')
        await page.getByLabel('Repite la contraseña', { exact: true }).fill('Nueva-clave-QA-456')
        await page.getByRole('button', { name: 'Guardar contraseña', exact: true }).click()
        await expect(page.getByRole('heading', { name: 'Contraseña actualizada', exact: true })).toBeVisible()
        assert.equal(clavesActualizadas, 1, 'La contraseña debe guardarse una sola vez.')
        assert.equal(confirmaciones, 1, 'El perfil debe confirmar el cambio una sola vez.')
        await page.getByRole('button', { name: 'Continuar', exact: true }).click()
        await expect(page).toHaveURL(`${origen}/cajero`)
        await expect(page.getByRole('heading', { level: 1, name: 'Caja', exact: true })).toBeVisible()
      } else {
        if (escenario === 'desactivado-tras-refresh') {
          await expect(page).toHaveURL(`${origen}/cajero`)
          await expect(page.getByRole('heading', { level: 1, name: 'Caja', exact: true })).toBeVisible()
          perfil.activo = false
          await page.evaluate(async () => {
            const { useAuthStore } = await import('/src/store/auth.ts')
            await useAuthStore.getState().refresh()
          })
        } else {
          assert.equal(operaciones.length, 0, 'Una cuenta inactiva no debe consultar operaciones.')
        }
        await expect(page.getByRole('heading', { name: 'Cuenta desactivada', exact: true })).toBeVisible()
        await expect(page.getByRole('heading', { level: 1, name: 'Caja', exact: true })).toHaveCount(0)
        await expect(page.getByRole('heading', { name: 'Crea tu nueva contraseña', exact: true })).toHaveCount(0)
        await page.getByRole('button', { name: 'Cerrar sesión y volver al inicio', exact: true }).click()
        await expect(page).toHaveURL(`${origen}/login`)
        await expect(page.getByRole('heading', { name: 'Iniciar sesión', exact: true })).toBeVisible()
        // La sesión se cerró realmente: recargar no vuelve al bloqueo.
        await page.reload()
        await expect(page).toHaveURL(`${origen}/login`)
        await expect(page.getByRole('heading', { name: 'Iniciar sesión', exact: true })).toBeVisible()
      }
      assert.deepEqual(errores, [], 'No debe haber fallos de JavaScript ni solicitudes externas.')
      console.log(`OK acceso: ${escenario}`)
    } finally {
      await context.close()
    }
  }

  const context = await browser.newContext({ serviceWorkers: 'block' })
  const errores = []
  let llamadas = 0
  let solicitud
  try {
    await context.route('**/*', async (route) => {
      const request = route.request()
      if (request.url().startsWith(origen + '/')) return route.continue()
      const url = new URL(request.url())
      if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ status: 200, contentType: 'text/css', body: '' })
      if (url.origin === endpoint && url.pathname === '/functions/v1/admin-password-recovery') {
        if (request.method() === 'OPTIONS') {
          return route.fulfill({ status: 200, headers: {
            'Access-Control-Allow-Origin': origen,
            'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
          }, body: 'ok' })
        }
        llamadas++
        solicitud = JSON.parse(request.postData() ?? '{}')
        return route.fulfill({
          status: 200,
          headers: { 'Access-Control-Allow-Origin': origen, 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: 'Si corresponde a una cuenta de administrador activa, enviaremos instrucciones al correo de recuperación configurado.' }),
        })
      }
      errores.push(`Solicitud fuera de QA: ${url.hostname}${url.pathname}`)
      return route.abort()
    })
    const page = await context.newPage()
    page.setDefaultTimeout(15_000)
    page.on('pageerror', (error) => errores.push(error.message))
    await page.goto(`${origen}/login`)
    await page.getByRole('button', { name: '¿Olvidaste tu contraseña?', exact: true }).click()
    await page.locator('#recovery-email').fill('ADMIN@MESORA.EXAMPLE')
    await page.getByRole('button', { name: 'Enviar enlace', exact: true }).click()
    await expect(page.getByText(/Si corresponde a una cuenta de administrador activa/)).toBeVisible()
    assert.equal(llamadas, 1, 'Debe enviar una solicitud al endpoint una sola vez.')
    assert.deepEqual(solicitud, { accion: 'solicitar', email: 'ADMIN@MESORA.EXAMPLE' }, 'La UI debe usar la Edge Function y no escribir en Auth directamente.')
    assert.deepEqual(errores, [], 'No debe haber fallos de JavaScript ni solicitudes externas.')
    console.log('OK recuperación: diálogo, envío por Edge Function y respuesta genérica para evitar enumeración.')
  } finally {
    await context.close()
  }

  console.log('Acceso verificado: inactividad, sesión activa, refresco, salida sin bucle, contraseña temporal y solicitud de recuperación.')
} finally {
  await browser?.close()
  await server.close()
  rmSync(entorno, { recursive: true, force: true })
}
