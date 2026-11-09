import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const envDir = mkdtempSync(join(tmpdir(), 'mesora-enrutamiento-'))
const storage = new Map()
globalThis.localStorage = {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: (key) => storage.delete(key),
  clear: () => storage.clear(),
  key: (index) => [...storage.keys()][index] ?? null,
  get length() { return storage.size },
}

const server = await createServer({
  root,
  envDir,
  define: { 'import.meta.env.VITE_MESORA_MODO_LOCAL': JSON.stringify('true') },
  logLevel: 'error',
  appType: 'custom',
  server: { middlewareMode: true },
})
const logError = console.error
console.error = (...args) => {
  if (!String(args[0]).includes('VITE_SUPABASE_URL')) logError(...args)
}

try {
  const { getApi, apiMode } = await server.ssrLoadModule('/src/lib/api.ts')
  const { localSeed } = await server.ssrLoadModule('/src/lib/localSeed.ts')
  const { mockRestaurante } = await server.ssrLoadModule('/src/lib/mockData.ts')
  const api = getApi()
  const now = new Date().toISOString()
  const rid = 'qa-enrutamiento-operativo'
  const actorId = 'qa-enrutamiento-admin'
  const categoryId = 'qa-enrutamiento-category'
  const zoneId = 'qa-enrutamiento-zone'
  const tableId = 'qa-enrutamiento-table'
  const explicitId = 'qa-enrutamiento-explicit'
  const inheritedId = 'qa-enrutamiento-inherited'
  const fallbackDrinkId = 'qa-enrutamiento-fallback-drink'
  const producto = (id, nombre, category, bebida, estacion) => ({
    id, restaurante_id: rid, categoria_id: category, nombre, descripcion: null, precio: 10,
    disponible: true, es_bebida: bebida, estacion, created_at: now,
  })

  localSeed.restaurantes.push({ ...mockRestaurante, id: rid, nombre: 'QA Enrutamiento', suscripcion_activa: true, fecha_vencimiento: null, pin_autorizacion: null })
  localSeed.usuarios.push({ id: actorId, restaurante_id: rid, rol: 'admin_restaurante', nombre: 'Admin QA', activo: true, created_at: now })
  localSeed.categorias.push({ id: categoryId, restaurante_id: rid, nombre: 'Platos QA', estacion_id: null, created_at: now })
  localSeed.zonas.push({ id: zoneId, restaurante_id: rid, nombre: 'Zona QA', created_at: now })
  localSeed.mesas.push({ id: tableId, restaurante_id: rid, zona_id: zoneId, nombre: 'Mesa QA', estado: 'libre', created_at: now })
  localSeed.productos.push(
    producto(explicitId, 'Estación explícita', categoryId, false, 'bar'),
    producto(inheritedId, 'Hereda categoría', categoryId, false, null),
    producto(fallbackDrinkId, 'Bebida fallback', null, true, null),
  )
  apiMode.operadorId = actorId

  const defaults = await api.getConfiguracionOperativa(rid)
  assert.ifError(defaults.error)
  const changes = {
    ...defaults.data,
    estaciones: defaults.data.estaciones.map((station) => {
      if (station.codigo === 'cocina') return {
        ...station,
        destinos: [
          ...station.destinos,
          { id: null, tipo: 'impresora', grupo: 'principal', nombre: 'Impresora Cocina QA', papel_mm: 80, configuracion: { copias: 1 }, activo: true },
          { id: null, tipo: 'impresora', grupo: 'respaldo', nombre: 'Respaldo Cocina QA', papel_mm: 58, configuracion: { copias: 2 }, activo: true },
        ],
      }
      if (station.codigo === 'bar') return {
        ...station,
        destinos: [
          ...station.destinos.map((destination) => ({ ...destination, activo: false })),
          { id: null, tipo: 'impresora', grupo: 'principal', nombre: 'Impresora Barra QA', papel_mm: 58, configuracion: { copias: 1 }, activo: true },
        ],
      }
      return station
    }),
    categorias: defaults.data.categorias.map((category) => ({ ...category, estacion_codigo: 'cocina' })),
  }
  const saved = await api.guardarConfiguracionOperativa(rid, changes)
  assert.ifError(saved.error)
  const created = await api.crearPedido(rid, tableId, [
    { producto_id: explicitId, nombre_producto: 'Estación explícita', cantidad: 1, precio_unitario: 10 },
    { producto_id: inheritedId, nombre_producto: 'Hereda categoría', cantidad: 1, precio_unitario: 10 },
    { producto_id: fallbackDrinkId, nombre_producto: 'Bebida fallback', cantidad: 1, precio_unitario: 10 },
  ])
  assert.ifError(created.error)
  const items = localSeed.items.filter((item) => item.pedido_id === created.data)
  assert.equal(items.find((item) => item.producto_id === explicitId)?.estacion, 'bar')
  assert.equal(items.find((item) => item.producto_id === inheritedId)?.estacion, 'cocina')
  assert.equal(items.find((item) => item.producto_id === fallbackDrinkId)?.estacion, 'bar')

  const deliveries = localSeed.entregasComanda.filter((row) => row.pedido_id === created.data)
  assert.equal(deliveries.length, 3)
  assert.equal(deliveries.filter((row) => row.estacion_codigo === 'cocina' && row.grupo === 'principal').length, 2)
  assert.equal(deliveries.filter((row) => row.grupo === 'respaldo').length, 0)
  assert.equal(deliveries.find((row) => row.estacion_codigo === 'cocina' && row.tipo_destino === 'impresora')?.configuracion_destino.copias, 1)
  assert.equal(deliveries.find((row) => row.estacion_codigo === 'cocina' && row.tipo_destino === 'impresora')?.configuracion_destino.papel_mm, 80)
  assert.equal(deliveries.find((row) => row.estacion_codigo === 'bar')?.tipo_destino, 'impresora')
  assert.equal(localSeed.estadosComandaEstacion.filter((row) => row.pedido_id === created.data).length, 2)

  const advance = await api.avanzarPedido(rid, created.data, 'cocina')
  assert.ifError(advance.error)
  let active = (await api.getPedidosActivos(rid)).data.find((row) => row.id === created.data)
  assert.equal(active.rutasPorEstacion.cocina.estado, 'en_preparacion')
  assert.equal(active.rutasPorEstacion.bar.estado, 'pendiente')

  const itemBar = items.find((item) => item.producto_id === explicitId)
  const cancelled = await api.anularItem(rid, created.data, itemBar.id)
  assert.ifError(cancelled.error)
  const itemBebidaBar = items.find((item) => item.producto_id === fallbackDrinkId)
  const cancelledLastBarItem = await api.anularItem(rid, created.data, itemBebidaBar.id)
  assert.ifError(cancelledLastBarItem.error)
  const barStationId = saved.data.estaciones.find((row) => row.codigo === 'bar').id
  const kitchenStationId = saved.data.estaciones.find((row) => row.codigo === 'cocina').id
  assert.equal(localSeed.estadosComandaEstacion.find((row) => row.pedido_id === created.data && row.estacion_id === barStationId)?.estado, 'anulado')
  assert.equal(deliveries.find((row) => row.estacion_codigo === 'bar')?.estado, 'cancelada')
  assert.equal(localSeed.estadosComandaEstacion.find((row) => row.pedido_id === created.data && row.estacion_id === kitchenStationId)?.estado, 'en_preparacion')
  assert.equal(localSeed.pedidos.find((row) => row.id === created.data)?.estado, 'en_preparacion')

  const categoryChanged = await api.guardarConfiguracionOperativa(rid, {
    ...saved.data,
    categorias: saved.data.categorias.map((category) => ({ ...category, estacion_codigo: 'bar' })),
  })
  assert.ifError(categoryChanged.error)
  const future = await api.crearPedido(rid, tableId, [
    { producto_id: inheritedId, nombre_producto: 'Hereda categoría', cantidad: 1, precio_unitario: 10 },
  ])
  assert.ifError(future.error)
  assert.equal(localSeed.items.find((item) => item.pedido_id === future.data)?.estacion, 'bar')
  assert.equal(items.find((item) => item.producto_id === inheritedId)?.estacion, 'cocina')

  const beforeFailed = { orders: localSeed.pedidos.length, items: localSeed.items.length }
  const disabled = await api.guardarConfiguracionOperativa(rid, {
    ...categoryChanged.data,
    estaciones: categoryChanged.data.estaciones.map((station) => ({ ...station, activo: station.codigo === 'bar' ? false : station.activo })),
  })
  assert.ifError(disabled.error)
  const rejected = await api.crearPedido(rid, tableId, [
    { producto_id: inheritedId, nombre_producto: 'Hereda categoría', cantidad: 1, precio_unitario: 10 },
  ])
  assert.match(rejected.error ?? '', /está desactivada/i)
  assert.equal(localSeed.pedidos.length, beforeFailed.orders)
  assert.equal(localSeed.items.length, beforeFailed.items)
  console.log('Enrutamiento local: resolución, destinos principal/respaldo, estados, anulación, snapshots y rechazo atómico aprobados')
} finally {
  console.error = logError
  await server.close()
  rmSync(envDir, { recursive: true, force: true })
}
