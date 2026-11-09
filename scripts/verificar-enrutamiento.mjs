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
  assert.equal(localSeed.estadosComandaEstacion.filter((row) => row.pedido_id === created.data).length, 1)

  const advance = await api.avanzarPedido(rid, created.data, 'cocina')
  assert.ifError(advance.error)
  let active = (await api.getPedidosActivos(rid)).data.find((row) => row.id === created.data)
  assert.equal(active.rutasPorEstacion.cocina.estado, 'en_preparacion')
  assert.equal(active.rutasPorEstacion.bar.destinos.includes('impresora'), true)

  const itemBar = items.find((item) => item.producto_id === explicitId)
  const cancelled = await api.anularItem(rid, created.data, itemBar.id)
  assert.ifError(cancelled.error)
  const itemBebidaBar = items.find((item) => item.producto_id === fallbackDrinkId)
  const cancelledLastBarItem = await api.anularItem(rid, created.data, itemBebidaBar.id)
  assert.ifError(cancelledLastBarItem.error)
  const kitchenStationId = saved.data.estaciones.find((row) => row.codigo === 'cocina').id
  assert.equal(localSeed.estadosComandaEstacion.some((row) => row.pedido_id === created.data && row.estacion_id === saved.data.estaciones.find((fila) => fila.codigo === 'bar').id), false)
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
  // Matriz operativa Fase 5: rutas, salidas y estados por área.
  const matrixKitchenId = 'qa-enrutamiento-matrix-kitchen'
  const matrixBarId = 'qa-enrutamiento-matrix-bar'
  localSeed.productos.push(
    producto(matrixKitchenId, 'Plato matriz Fase 5', null, false, 'cocina'),
    producto(matrixBarId, 'Bebida matriz Fase 5', null, true, 'bar'),
  )
  const configBaseRes = await api.getConfiguracionOperativa(rid)
  assert.ifError(configBaseRes.error)
  const conImpresoras = {
    ...configBaseRes.data,
    estaciones: configBaseRes.data.estaciones.map((station) => ({
      ...station,
      activo: true,
      destinos: [
        ...station.destinos.map((destination) => destination.tipo === 'impresora' && destination.grupo === 'principal'
          ? { ...destination, nombre: `Impresora QA ${station.codigo}`, papel_mm: station.codigo === 'cocina' ? 80 : 58, configuracion: { copias: station.codigo === 'cocina' ? 2 : 3 } }
          : destination),
        ...(station.destinos.some((destination) => destination.tipo === 'impresora') ? [] : [{
          id: null,
          tipo: 'impresora',
          grupo: 'principal',
          nombre: `Impresora QA ${station.codigo}`,
          papel_mm: station.codigo === 'cocina' ? 80 : 58,
          configuracion: { copias: station.codigo === 'cocina' ? 2 : 3 },
          activo: false,
        }]),
      ].map((destination) => ({ ...destination, activo: false })),
    })),
  }
  const baseGuardada = await api.guardarConfiguracionOperativa(rid, conImpresoras)
  assert.ifError(baseGuardada.error)
  const setRutas = async (rutas) => {
    const cambios = {
      ...baseGuardada.data,
      estaciones: baseGuardada.data.estaciones.map((station) => ({
        ...station,
        activo: true,
        destinos: station.destinos.map((destination) => ({
          ...destination,
          activo: (rutas[station.codigo] ?? []).includes(destination.tipo) && destination.grupo === 'principal',
        })),
      })),
    }
    const respuesta = await api.guardarConfiguracionOperativa(rid, cambios)
    assert.ifError(respuesta.error)
    return respuesta.data
  }
  const crearCaso = async (nombre, rutas) => {
    const config = await setRutas(rutas)
    const pedido = await api.crearPedido(rid, tableId, [
      { producto_id: matrixKitchenId, nombre_producto: 'Plato matriz Fase 5', cantidad: 1, precio_unitario: 10 },
      { producto_id: matrixBarId, nombre_producto: 'Bebida matriz Fase 5', cantidad: 1, precio_unitario: 10 },
    ])
    assert.ifError(pedido.error)
    const deliveries = localSeed.entregasComanda.filter((row) => row.pedido_id === pedido.data)
    const expected = Object.entries(rutas).flatMap(([station, types]) => types.map((type) => `${station}:${type}`)).sort()
    const actual = deliveries.map((row) => `${row.estacion_codigo}:${row.tipo_destino}`).sort()
    assert.deepEqual(actual, expected, `${nombre}: destinations`)
    const kds = new Set(deliveries.filter((row) => row.tipo_destino === 'kds').map((row) => row.estacion_codigo))
    assert.equal(localSeed.estadosComandaEstacion.filter((row) => row.pedido_id === pedido.data).length, kds.size, `${nombre}: one status per KDS destination`)
    const pedidosActivos = await api.getPedidosActivos(rid)
    assert.ifError(pedidosActivos.error)
    const loaded = pedidosActivos.data.find((row) => row.id === pedido.data)
    assert.ok(loaded, `${nombre}: order loaded`)
    for (const station of ['cocina', 'bar']) {
      const route = loaded.rutasPorEstacion[station]
      assert.equal(Boolean(route?.destinos.includes('kds')), (rutas[station] ?? []).includes('kds'), `${nombre}: KDS ${station}`)
      assert.equal(Boolean(route?.destinos.includes('impresora')), (rutas[station] ?? []).includes('impresora'), `${nombre}: printer ${station}`)
    }
    console.log(`  OK ${nombre}`)
    return { id: pedido.data, config, deliveries, loaded }
  }

  const cocinaKds = await crearCaso('KDS solo Cocina', { cocina: ['kds'], bar: [] })
  const barraKds = await crearCaso('KDS solo Barra', { cocina: [], bar: ['kds'] })
  const cocinaImpresora = await crearCaso('Impresión manual solo Cocina', { cocina: ['impresora'], bar: [] })
  const barraImpresora = await crearCaso('Impresión manual solo Barra', { cocina: [], bar: ['impresora'] })
  const mixtaCocinaKdsBarraImpresora = await crearCaso('Cocina KDS y Barra impresora', { cocina: ['kds'], bar: ['impresora'] })
  const mixtaCocinaImpresoraBarraKds = await crearCaso('Cocina impresora y Barra KDS', { cocina: ['impresora'], bar: ['kds'] })
  const ambasKds = await crearCaso('Cocina y Barra en KDS', { cocina: ['kds'], bar: ['kds'] })
  const ambasImpresoras = await crearCaso('Cocina y Barra en impresora', { cocina: ['impresora'], bar: ['impresora'] })
  const ninguna = await crearCaso('Sin salida conserva pedido e ítems', { cocina: [], bar: [] })
  const ambosDestinos = await crearCaso('Ambos destinos KDS e impresora', { cocina: ['kds', 'impresora'], bar: ['kds', 'impresora'] })
  assert.equal(localSeed.items.filter((row) => row.pedido_id === ninguna.id).length, 2)
  assert.deepEqual(Object.keys(ninguna.loaded.rutasPorEstacion), [])
  assert.deepEqual(new Set(cocinaKds.deliveries.map((row) => row.estacion_codigo)), new Set(['cocina']))
  assert.deepEqual(new Set(barraKds.deliveries.map((row) => row.estacion_codigo)), new Set(['bar']))
  assert.equal(ambasKds.deliveries.filter((row) => row.tipo_destino === 'kds').length, 2)
  assert.equal(ambasImpresoras.deliveries.filter((row) => row.tipo_destino === 'impresora').length, 2)
  assert.equal(ambosDestinos.deliveries.length, 4)

  await api.avanzarPedido(rid, ambosDestinos.id, 'cocina').then((result) => assert.ifError(result.error))
  const activoAmbos = (await api.getPedidosActivos(rid)).data.find((row) => row.id === ambosDestinos.id)
  assert.equal(activoAmbos.rutasPorEstacion.cocina.estado, 'en_preparacion')
  assert.equal(activoAmbos.rutasPorEstacion.bar.estado, 'pendiente')

  // Una salida manual pendiente permanece visible tras terminar el KDS hermano.
  await setRutas({ cocina: ['kds'], bar: ['impresora'] })
  const colaMixta = await api.crearPedido(rid, tableId, [
    { producto_id: matrixKitchenId, nombre_producto: 'Plato matriz Fase 5', cantidad: 1, precio_unitario: 10 },
    { producto_id: matrixBarId, nombre_producto: 'Bebida matriz Fase 5', cantidad: 1, precio_unitario: 10 },
  ])
  assert.ifError(colaMixta.error)
  for (let i = 0; i < 3; i++) assert.ifError((await api.avanzarPedido(rid, colaMixta.data, 'cocina')).error)
  const pedidoCocinaEntregado = (await api.getPedidosActivos(rid)).data.find((row) => row.id === colaMixta.data)
  assert.ok(pedidoCocinaEntregado, 'completed KDS order remains for pending manual printer output')
  assert.equal(pedidoCocinaEntregado.rutasPorEstacion.bar.impresoras[0].estado, 'pendiente')

  const entregaImpresion = cocinaImpresora.deliveries.find((row) => row.tipo_destino === 'impresora')
  assert.equal(entregaImpresion.destino_nombre, 'Impresora QA cocina')
  assert.equal(entregaImpresion.configuracion_destino.papel_mm, 80)
  assert.equal(entregaImpresion.configuracion_destino.copias, 2)
  assert.equal(entregaImpresion.configuracion_version, cocinaImpresora.config.version)
  const snapshotHistorico = JSON.stringify({ nombre: entregaImpresion.destino_nombre, config: entregaImpresion.configuracion_destino, version: entregaImpresion.configuracion_version })
  const impresoraModificada = await api.guardarConfiguracionOperativa(rid, {
    ...cocinaImpresora.config,
    estaciones: cocinaImpresora.config.estaciones.map((station) => ({
      ...station,
      destinos: station.destinos.map((destination) => destination.tipo === 'impresora' && station.codigo === 'cocina'
        ? { ...destination, nombre: 'Impresora Cocina nueva', papel_mm: 58, configuracion: { copias: 1 } }
        : destination),
    })),
  })
  assert.ifError(impresoraModificada.error)
  assert.equal(JSON.stringify({ nombre: entregaImpresion.destino_nombre, config: entregaImpresion.configuracion_destino, version: entregaImpresion.configuracion_version }), snapshotHistorico)

  // Registro idempotente, confirmación manual, motivo y bloqueo de respuesta vieja.
  localSeed.usuarios.push({ id: 'qa-enrutamiento-cocina', restaurante_id: rid, rol: 'cocina', nombre: 'Cocina QA', activo: true, created_at: now })
  localSeed.usuarios.push({ id: 'qa-enrutamiento-cajero', restaurante_id: rid, rol: 'cajero', nombre: 'Cajero QA', activo: true, created_at: now })
  localSeed.restaurantes.push({ ...mockRestaurante, id: 'qa-enrutamiento-otro', nombre: 'Otro QA', suscripcion_activa: true, fecha_vencimiento: null, pin_autorizacion: null })
  localSeed.usuarios.push({ id: 'qa-enrutamiento-admin-otro', restaurante_id: 'qa-enrutamiento-otro', rol: 'admin_restaurante', nombre: 'Admin otro', activo: true, created_at: now })
  apiMode.operadorId = 'qa-enrutamiento-cocina'
  const solicitudInicial = crypto.randomUUID()
  const registroInicial = await api.registrarImpresionSalidaComanda(rid, cocinaImpresora.id, 'cocina', entregaImpresion.id, solicitudInicial)
  assert.ifError(registroInicial.error)
  assert.equal(registroInicial.data.accion, 'comanda_imprimir')
  const registroDuplicado = await api.registrarImpresionSalidaComanda(rid, cocinaImpresora.id, 'cocina', entregaImpresion.id, solicitudInicial)
  assert.ifError(registroDuplicado.error)
  assert.equal(registroDuplicado.data.accion, 'comanda_imprimir')
  assert.equal(localSeed.auditLogs.filter((log) => log.detalle?.solicitud_id === solicitudInicial).length, 1)
  assert.equal(entregaImpresion.estado, 'enviada')
  assert.equal(entregaImpresion.solicitud_impresion_id, solicitudInicial)
  assert.ifError((await api.actualizarEstadoSalidaComanda(rid, entregaImpresion.id, solicitudInicial, 'confirmada')).error)
  assert.ifError((await api.actualizarEstadoSalidaComanda(rid, entregaImpresion.id, solicitudInicial, 'confirmada')).error)
  assert.equal(entregaImpresion.estado, 'confirmada')
  const solicitudReimpresion = crypto.randomUUID()
  const pideMotivo = await api.registrarImpresionSalidaComanda(rid, cocinaImpresora.id, 'cocina', entregaImpresion.id, solicitudReimpresion)
  assert.ifError(pideMotivo.error)
  assert.equal(pideMotivo.data.estado, 'requiere_motivo')
  const reimpresion = await api.registrarImpresionSalidaComanda(rid, cocinaImpresora.id, 'cocina', entregaImpresion.id, solicitudReimpresion, 'Papel mal alineado')
  assert.ifError(reimpresion.error)
  assert.equal(reimpresion.data.accion, 'comanda_reimprimir')
  assert.match((await api.actualizarEstadoSalidaComanda(rid, entregaImpresion.id, solicitudInicial, 'confirmada')).error ?? '', /otra solicitud activa/)
  assert.ifError((await api.actualizarEstadoSalidaComanda(rid, entregaImpresion.id, solicitudReimpresion, 'fallida')).error)
  assert.equal(entregaImpresion.estado, 'fallida')
  const logsImpresion = localSeed.auditLogs.filter((log) => log.entidad_id === cocinaImpresora.id && ['comanda_imprimir', 'comanda_reimprimir'].includes(log.accion))
  assert.equal(logsImpresion.length, 2)
  const logReimpresion = logsImpresion.find((log) => log.accion === 'comanda_reimprimir')
  assert.equal(logReimpresion.detalle.motivo, 'Papel mal alineado')
  assert.equal(logReimpresion.detalle.configuracion_destino.papel_mm, 80)
  assert.equal(localSeed.pedidos.filter((row) => row.id === cocinaImpresora.id).length, 1)
  apiMode.operadorId = 'qa-enrutamiento-cajero'
  assert.match((await api.registrarImpresionSalidaComanda(rid, cocinaImpresora.id, 'cocina', entregaImpresion.id, crypto.randomUUID())).error ?? '', /permiso/)
  apiMode.operadorId = 'qa-enrutamiento-admin-otro'
  assert.match((await api.registrarImpresionSalidaComanda(rid, cocinaImpresora.id, 'cocina', entregaImpresion.id, crypto.randomUUID())).error ?? '', /permiso|acceso/)
  apiMode.operadorId = actorId
  console.log('Enrutamiento local: matriz Fase 5, rutas por área, impresiones manuales, KDS independiente, histórico, idempotencia, reimpresión, permisos y aislamiento aprobados')
} finally {
  console.error = logError
  await server.close()
  rmSync(envDir, { recursive: true, force: true })
}
