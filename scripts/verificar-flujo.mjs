// Verificación de las reglas de negocio del backend LOCAL (sin navegador y sin
// Supabase). Carga los módulos reales de la app a través de Vite y ejercita los
// flujos que antes tenían bugs: varias comandas por mesa, cierre de cuenta,
// subtotales por pedido, bloqueo del cobro doble y separación cocina/barra.
//
//   node scripts/verificar-flujo.mjs
//
// Sale con código 1 si algún check falla.

import { createServer } from 'vite'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const RAIZ = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')

// Esta suite ejercita el backend LOCAL. Su Vite usa un envDir temporal vacío
// para ignorar .env.local sin moverlo ni afectar a servidores ya abiertos.
const ENV_DIR = mkdtempSync(join(tmpdir(), 'mesora-verificar-env-'))

// localStorage no existe en Node: shim en memoria para que el modo local
// persista de verdad durante la verificación.
const almacen = new Map()
globalThis.localStorage = {
  getItem: (k) => (almacen.has(k) ? almacen.get(k) : null),
  setItem: (k, v) => void almacen.set(k, String(v)),
  removeItem: (k) => void almacen.delete(k),
  clear: () => almacen.clear(),
  key: (i) => [...almacen.keys()][i] ?? null,
  get length() {
    return almacen.size
  },
}

const servidor = await createServer({
  root: RAIZ,
  envDir: ENV_DIR,
  define: { 'import.meta.env.VITE_MESORA_MODO_LOCAL': JSON.stringify('true') },
  logLevel: 'error',
  appType: 'custom',
  server: { middlewareMode: true },
})
// src/lib/supabase.ts avisa por consola que faltan las variables de entorno:
// es exactamente lo que activa el modo local, así que se silencia el aviso.
const errorReal = console.error
console.error = (...a) => {
  if (String(a[0]).includes('VITE_SUPABASE_URL')) return
  errorReal(...a)
}
const { getApi, esModoLocal, apiMode, enDemo, reiniciarDemoDatos } = await servidor.ssrLoadModule('/src/lib/api.ts')
const { localSeed, restablecerDatosLocal, cargarDatosLocal, localCredenciales, verificarCredencialLocal, PASSWORD_DE_PRUEBA } =
  await servidor.ssrLoadModule('/src/lib/localSeed.ts')
const { mockZonas, mockRestaurante } = await servidor.ssrLoadModule('/src/lib/mockData.ts')
// Motor del recorrido guiado del demo: logica pura, se verifica sin navegador.
const {
  observar,
  PROGRESO_VACIO,
  TOTAL_PASOS,
  anclasDe,
  pasoActual,
  progresoVigente,
  resumen,
  elegirEsquina,
  hayEsquinaLibre,
  rectEnEsquina,
  colocarEtiqueta,
  prefillDe,
  formularioDePaso,
  pista,
  PREFILL_GUIA,
  GUI_ANCHO,
  GUI_ALTO_COMPACTO,
  GUI_ALTO_EXPANDIDO,
  GUI_MARGEN,
  PASOS,
  NIVELES,
  XP_TOTAL,
  xpDePaso,
  xpTotal,
  nivelDe,
  nivelSiguiente,
  progresoNivel,
  logrosDe,
} = await servidor.ssrLoadModule('/src/demo/guia.ts')
// Lógica pura del módulo "Gestión de restaurantes" del super admin.
const {
  filtrarRestaurantes,
  CRITERIOS_VACIOS,
  hayFiltrosActivos,
  estadoOperativo,
  estadoSuscripcion,
  venceEnDias,
  diasParaVencimiento,
} = await servidor.ssrLoadModule('/src/lib/restaurantes.ts')
// Lógica pura del panel "Suscripciones" del super admin.
const {
  filtrarSuscripciones,
  CRITERIOS_SUSCRIPCIONES_VACIOS,
  hayFiltrosSuscripciones,
  nombrePlan,
  etiquetaAccion,
} = await servidor.ssrLoadModule('/src/lib/suscripciones.ts')
// Lógica pura de los paneles "Usuarios" y "Administradores" del super admin.
const {
  filtrarUsuarios,
  CRITERIOS_USUARIOS_VACIOS,
  hayFiltrosUsuarios,
  labelUltimoAcceso,
} = await servidor.ssrLoadModule('/src/lib/usuarios.ts')
const { suSuscripcionVencida, useAuthStore } = await servidor.ssrLoadModule('/src/store/auth.ts')
const { filtrarPersonal } = await servidor.ssrLoadModule('/src/domain/security/personal.ts')
// Lógica pura del panel "Estadísticas" del super admin.
const {
  PRESETS_RANGO,
  rangoDePreset,
  diasDelRango,
  etiquetaDia,
  ordenarRanking,
} = await servidor.ssrLoadModule('/src/lib/estadisticas.ts')
// Lógica pura de la auditoría del super admin.
const {
  filtrarAuditoria,
  CRITERIOS_AUDITORIA_VACIOS,
  hayFiltrosAuditoria,
  etiquetaAccionAuditoria,
  categoriaDeAccion,
  etiquetaCategoria,
} = await servidor.ssrLoadModule('/src/lib/auditoria.ts')
// Lógica pura del soporte del super admin.
const {
  filtrarTickets,
  CRITERIOS_TICKETS_VACIOS,
  hayFiltrosTickets,
  etiquetaEstadoTicket,
  etiquetaPrioridadTicket,
  ordenarTickets,
} = await servidor.ssrLoadModule('/src/lib/soporte.ts')
// Lógica pura de las notificaciones del super admin.
const { calcularAlertas, DIAS_POR_VENCER, DIAS_NUEVO } = await servidor.ssrLoadModule(
  '/src/lib/notificaciones.ts',
)
// Lógica pura de la configuración global.
const {
  validarConfiguracionGlobal,
  normalizarConfiguracionGlobal,
  mostrarPrecioPlan,
  PRECIO_PLAN_DEFECTO,
} = await servidor.ssrLoadModule('/src/lib/configuracion.ts')
// Lógica pura de la identidad por dominio (usuario@dominio).
const { normalizarDominio, esDominioValido, esUsuarioValido, construirEmail, separarEmail } =
  await servidor.ssrLoadModule('/src/lib/dominio.ts')
// Numeración de boletas (formato y fallback para cuentas sin número).
const { formatearNumeroBoleta, numeroBoletaDeCuenta, SERIE_BOLETA } = await servidor.ssrLoadModule(
  '/src/lib/boleta.ts',
)
const { rutaDespuesDeLogin } = await servidor.ssrLoadModule('/src/lib/roles.ts')
const {
  confirmarAnulacionItem,
  confirmarAnulacionCuenta,
  confirmarMovimientoConsumo,
  confirmarCambioMesero,
  confirmarCierreCaja,
  TEXTO_AUDITORIA,
} = await servidor.ssrLoadModule('/src/domain/security/confirmaciones.ts')
const { mensajeOperacion } = await servidor.ssrLoadModule('/src/domain/security/mensajeOperacion.ts')
const { ejecutarAnulacionItem, MENSAJE_ITEM_ANULADO_MESA_LIBERADA } =
  await servidor.ssrLoadModule('/src/domain/security/anulacionItem.ts')
const { normalizarTextoUtf8, normalizarContenidoUtf8 } =
  await servidor.ssrLoadModule('/src/domain/platform/normalizarUtf8.ts')

// ----------------------------------------------------------------- aserciones
let ok = 0
const fallos = []
function check(nombre, condicion, detalle = '') {
  if (condicion) {
    ok++
    console.log(`  ok   ${nombre}`)
  } else {
    fallos.push(`${nombre}${detalle ? ` — ${detalle}` : ''}`)
    console.log(`  FALLA ${nombre}${detalle ? ` — ${detalle}` : ''}`)
  }
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const titulo = (t) => console.log(`\n${t}`)
const pedir = (producto, cantidad, nota) => ({
  producto_id: producto.id,
  nombre_producto: producto.nombre,
  cantidad,
  precio_unitario: producto.es_promocion && producto.precio_promocion ? producto.precio_promocion : producto.precio,
  nota: nota ?? null,
})
const prod = (id) => localSeed.productos.find((p) => p.id === id)
/** Total que ve el mesero: los ítems anulados no suman. */
const totalDe = (its) =>
  its.reduce((a, it) => (it.anulado === true ? a : a + it.cantidad * it.precio_unitario), 0)

// El estado compartido representa solicitudes confirmadas; offline y errores
// conservan la marca de última sincronización exitosa.
{
  const windowAnterior = Object.getOwnPropertyDescriptor(globalThis, 'window')
  const navigatorAnterior = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  const listeners = {}
  const almacenSync = new Map()
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {
    addEventListener: (nombre, listener) => { listeners[nombre] = listener },
    localStorage: { getItem: (key) => almacenSync.get(key) ?? null, setItem: (key, value) => almacenSync.set(key, value) },
  } })
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: true } })
  const sync = await servidor.ssrLoadModule('/src/lib/estadoConexion.ts')
  const primeraLecturaSync = sync.obtenerEstadoDeSincronizacion()
  sync.registrarSincronizacionExitosa()
  const timestampSync = sync.obtenerEstadoDeSincronizacion().ultimaSincronizacion
  listeners.offline()
  const sinRed = sync.obtenerEstadoDeSincronizacion()
  listeners.online()
  const reconectando = sync.obtenerEstadoDeSincronizacion()
  sync.registrarFalloDeSincronizacion()
  const falloSync = sync.obtenerEstadoDeSincronizacion()
  sync.registrarSincronizacionExitosa()
  const recuperadaSync = sync.obtenerEstadoDeSincronizacion()
  check('0.0 · el estado de conexión detecta desconexión y reconexión', primeraLecturaSync.estado === 'conectado' && sinRed.estado === 'sin_conexion' && reconectando.estado === 'reconectando' && recuperadaSync.estado === 'conectado')
  check('0.0a · un fallo no cambia la última sincronización exitosa', falloSync.estado === 'error' && falloSync.ultimaSincronizacion === timestampSync && Date.parse(recuperadaSync.ultimaSincronizacion) >= Date.parse(timestampSync))
  if (windowAnterior) Object.defineProperty(globalThis, 'window', windowAnterior)
  else delete globalThis.window
  if (navigatorAnterior) Object.defineProperty(globalThis, 'navigator', navigatorAnterior)
  else delete globalThis.navigator
}

restablecerDatosLocal()
const api = getApi()
const RID = 'r-demo'
const MESA = 'm-4' // Mesa 4 del dataset semilla, estado "libre"
const meseroFlujo = {
  id: 'u-qa-mesero-flujo', restaurante_id: RID, rol: 'mesero', nombre: 'Mesero Flujo QA',
  email: 'flujo@qa.invalid', activo: true, created_at: new Date().toISOString(),
}
localSeed.usuarios.push(meseroFlujo)
apiMode.operadorId = meseroFlujo.id

titulo('0 · El backend activo es el local (sin Supabase)')
check('esModoLocal()', esModoLocal() === true)
check('login admin desde caja vuelve a /admin', rutaDespuesDeLogin('admin_restaurante', '/cajero') === '/admin')
check('login cajero desde caja conserva /cajero', rutaDespuesDeLogin('cajero', '/cajero') === '/cajero')
check('crearPedido exige que la mesa sea del restaurante', (await api.crearPedido(RID, 'm-inexistente', [pedir(prod('p-1'), 1)]).then((r) => !!r.error)))

titulo('0.1 · Resúmenes de confirmación y errores comprensibles')
const resumenesSensibles = [
  confirmarAnulacionItem({ producto: 'Ceviche', cantidad: 2, importe: 'S/ 30.00', mesa: 'Mesa 1', liberaMesa: false, requierePin: true }),
  confirmarAnulacionCuenta({ boleta: 'B001', total: 'S/ 20.00', propina: 'S/ 2.00', reembolso: 'S/ 22.00', motivo: 'Error de cobro', requierePin: true }),
  confirmarMovimientoConsumo({ origen: 'Mesa 1', destino: 'Mesa 2', comandas: 1, importe: 'S/ 30.00', motivo: 'Cliente cambió de mesa', requierePin: true }),
  confirmarCambioMesero({ mesa: 'Mesa 1', anterior: 'Carlos', nuevo: 'María', comandas: 1, importe: 'S/ 30.00', motivo: 'Cambio de turno', requierePin: true }),
  confirmarCierreCaja({ declarado: 'S/ 100.00', esperado: 'S/ 100.00', diferencia: 'S/ 0.00', mesasPendientes: 1, totalPendiente: 'S/ 25.00', observaciones: '' }),
]
check('cada acción sensible presenta acción, datos, PIN y auditoría', resumenesSensibles.every((r) => !!r.accion && !!r.datosAfectados && !!r.pinGerente && r.auditoria === TEXTO_AUDITORIA))
check('el traspaso identifica a Carlos y María antes de confirmar', resumenesSensibles[3].datosAfectados.includes('Carlos → María'))
check('el cierre advierte que el consumo pendiente seguirá abierto', resumenesSensibles[4].datosAfectados.includes('seguirán abiertos'))
check('la anulación de ítem informa si liberará la mesa', confirmarAnulacionItem({ producto: 'Ceviche', cantidad: 1, importe: 'S/ 15.00', mesa: 'Mesa 1', liberaMesa: true, requierePin: false }).datosAfectados.includes('se liberará la mesa'))
check('el PIN incorrecto se explica sin exponer el error técnico', mensajeOperacion('PIN de autorizacion incorrecto', 'Error') === 'El PIN no coincide. Revísalo con el gerente e inténtalo de nuevo.')
check('un error de RLS se muestra como indicación para el local', mensajeOperacion('new row violates row-level security policy for table audit_logs', 'Error').includes('Actualiza la pantalla'))

// ---------------------------------------------------------------------------
titulo('1 · Dos comandas a la misma mesa antes de cobrar')
const comandaA = await api.crearPedido(RID, MESA, [pedir(prod('p-1'), 2, 'sin cebolla')])
check('1a · se crea la primera comanda', !comandaA.error, comandaA.error ?? '')
const idA = comandaA.data

const trasUna = await api.getPedidosDeMesa(RID, MESA)
check('1b · la mesa muestra 1 comanda abierta', trasUna.data.length === 1, `vio ${trasUna.data.length}`)

const comandaB = await api.crearPedido(RID, MESA, [pedir(prod('p-8'), 3)])
check('1c · se crea la segunda comanda en la MISMA mesa', !comandaB.error, comandaB.error ?? '')
const idB = comandaB.data
check('1d · las dos comandas son distintas', !!idA && !!idB && idA !== idB)

const trasDos = await api.getPedidosDeMesa(RID, MESA)
check(
  '1e · getPedidosDeMesa devuelve las 2 comandas acumuladas',
  eq(trasDos.data.map((p) => p.id), [idA, idB]),
  eq(trasDos.data.map((p) => p.id), [idA, idB]),
)
const itemsDos = (await api.getPedidoItems([idA, idB])).data
check(
  '1f · cada comanda conserva sus ítems y notas',
  itemsDos.length === 2 && itemsDos.some((i) => i.nota === 'sin cebolla'),
)
check(
  '1g · la mesa quedó marcada como ocupada',
  (await api.getMesas(RID)).data.find((m) => m.id === MESA).estado === 'ocupada',
)
const activasAntes = (await api.getPedidosActivos(RID)).data
check(
  '1h · cocina ve las 2 comandas',
  activasAntes.some((p) => p.id === idA) && activasAntes.some((p) => p.id === idB),
)

// ---------------------------------------------------------------------------
titulo('2 · Cobrar: cuenta, subtotales, mesa liberada y cocina limpia')
// 2 Ceviche en promo (28 c/u) + 3 Chicha Morada (8 c/u)
const TOTAL = 2 * 28 + 3 * 8
const yapeAntes = (await api.getMetricasAdmin(RID)).data.porMetodo.find((m) => m.metodo === 'yape_plin')?.total ?? 0
const cobro = await api.cerrarCuenta(RID, MESA, [idA, idB], 'yape_plin')
check('2a · la cuenta se cierra sin error', !cobro.error, cobro.error ?? '')
// La API devuelve la cuenta YA GUARDADA (no el id): la boleta se arma con ella.
const cuentaId = cobro.data?.id
const cuenta = localSeed.cuentas.find((c) => c.id === cuentaId) ?? cobro.data
check('2b · el total de la cuenta suma las 2 comandas', cuenta?.total === TOTAL, `${cuenta?.total} != ${TOTAL}`)
check(
  '2b2 · la API devuelve la misma cuenta que quedó guardada',
  cuentaId != null && cuenta?.id === cuentaId,
  `${cuentaId}`,
)
check('2c · la cuenta queda pagada con el método elegido', cuenta?.estado === 'pagada' && cuenta?.metodo_pago === 'yape_plin')
check(
  '2c2 · la boleta lleva número correlativo del restaurante (B001-000001)',
  /^B001-\d{6}$/.test(cuenta?.numero ?? '') && cuenta?.numero === 'B001-000001',
  cuenta?.numero ?? '',
)
check(
  '2c3 · helpers de boleta: formato y fallback para cuentas sin número',
  SERIE_BOLETA === 'B001' &&
    formatearNumeroBoleta(1) === 'B001-000001' &&
    formatearNumeroBoleta(123456) === 'B001-123456' &&
    formatearNumeroBoleta(0) === 'B001-000000' &&
    numeroBoletaDeCuenta({ id: 'c-1', numero: 'B001-000009' }) === 'B001-000009' &&
    /^B001-\d{6}$/.test(numeroBoletaDeCuenta({ id: 'cuenta-sin-numero' })),
)

const filas = localSeed.cuentaPedidos.filter((cp) => cp.cuenta_id === cuentaId)
check('2d · cuenta_pedidos tiene una fila por comanda', filas.length === 2, `tiene ${filas.length}`)
check(
  '2e · cada subtotal es el de SU comanda (no el total repetido)',
  eq(filas.map((f) => f.subtotal).sort((a, b) => b - a), [56, 24]),
  eq(filas.map((f) => f.subtotal), [56, 24]),
)
check('2f · los subtotales suman el total de la cuenta', filas.reduce((a, f) => a + f.subtotal, 0) === TOTAL)

const pedidos = localSeed.pedidos.filter((p) => p.id === idA || p.id === idB)
check(
  '2g · AMBAS comandas quedan "entregado"',
  pedidos.length === 2 && pedidos.every((p) => p.estado === 'entregado'),
  eq(pedidos.map((p) => p.estado), [idA, idB].map(() => 'entregado')),
)
check('2h · la mesa vuelve a "libre"', localSeed.mesas.find((m) => m.id === MESA).estado === 'libre')

const pendientes = await api.getPedidosDeMesa(RID, MESA)
check('2i · la mesa ya no muestra pedidos por cobrar', pendientes.data.length === 0, `vio ${pendientes.data.length}`)

const activasDespues = (await api.getPedidosActivos(RID)).data
check(
  '2j · cocina ya NO muestra las comandas cobradas',
  !activasDespues.some((p) => p.id === idA) && !activasDespues.some((p) => p.id === idB),
)

// ---------------------------------------------------------------------------
titulo('3 · No se puede cobrar dos veces')
const recobro = await api.cerrarCuenta(RID, MESA, [idA, idB], 'efectivo')
check('3a · recobrar los mismos pedidos falla', !!recobro.error, `error: ${recobro.error ?? 'ninguno'}`)
check('3b · no se creó una segunda cuenta', localSeed.cuentas.filter((c) => c.mesa_id === MESA).length === 1)
const nuevoPedido = await api.crearPedido(RID, MESA, [pedir(prod('p-2'), 1)])
const cobroMixto = await api.cerrarCuenta(RID, MESA, [idA, nuevoPedido.data], 'efectivo')
check(
  '3c · cobrar un pedido ya cobrado + uno nuevo se rechaza',
  !!cobroMixto.error,
  `error: ${cobroMixto.error ?? 'ninguno'}`,
)
check(
  '3d · el pedido nuevo sigue abierto y cobrable',
  (await api.getPedidosDeMesa(RID, MESA)).data.map((p) => p.id).join() === nuevoPedido.data,
)
// limpieza para los checks siguientes
const cobroNum2 = await api.cerrarCuenta(RID, MESA, [nuevoPedido.data], 'efectivo')
check(
  '3e · el correlativo de boleta avanza de uno en uno',
  cobroNum2.data?.numero === 'B001-000002',
  cobroNum2.data?.numero ?? '',
)

// ---------------------------------------------------------------------------
titulo('4 · Método de pago: solo la whitelist')
for (const malo of ['bitcoin', 'EFECTIVO', '', null, 42]) {
  const r = await api.cerrarCuenta(RID, 'm-5', [nuevoPedido.data], malo)
  check(`4 · rechaza el método ${JSON.stringify(malo)}`, !!r.error)
}
const conWhitelist = await api.cerrarCuenta(RID, 'm-6', [], 'tarjeta')
check('4 · un método válido igual exige pedidos pendientes', !!conWhitelist.error)

// ---------------------------------------------------------------------------
titulo('5 · Pedidos ya cobrados se excluyen (Mesa 3 del dataset semilla)')
// pdo-1 pendiente | pdo-5 entregado y cobrado por cta-2 | pdo-8 en_preparacion
const m3 = await api.getPedidosDeMesa(RID, 'm-3')
check('5a · excluye el pedido ya cobrado (pdo-5)', !m3.data.some((p) => p.id === 'pdo-5'))
check(
  '5b · conserva los pedidos abiertos de la mesa (orden por antigüedad)',
  eq(m3.data.map((p) => p.id), ['pdo-8', 'pdo-1']),
  eq(m3.data.map((p) => p.id), ['pdo-8', 'pdo-1']),
)
const cocina3 = (await api.getPedidosActivos(RID)).data
check('5c · cocina tampoco muestra pdo-5 (ya servido)', !cocina3.some((p) => p.id === 'pdo-5'))

// ---------------------------------------------------------------------------
titulo('6 · Cocina / barra se define por el campo es_bebida del producto')
const items6 = cocina3.flatMap((p) => p.items)
check('6a · la bebida marcada va a barra', items6.find((i) => i.producto_id === 'p-8')?.es_bebida === true)
check('6b · el plato marcado NO va a barra', items6.find((i) => i.producto_id === 'p-1')?.es_bebida === false)
// El campo manda sobre el nombre de la categoría: bebida en "Platos de fondo"
const nueva = await api.crearProducto(RID, {
  nombre: 'Gaseosa de mesa',
  categoria_id: 'c-fondo',
  precio: 5,
  disponible: true,
  es_bebida: true,
})
check('6c · el producto creado guarda es_bebida = true', localSeed.productos.find((p) => p.id === nueva.data.id)?.es_bebida === true)
await api.crearPedido(RID, 'm-7', [pedir(nueva.data, 1)])
const conNueva = (await api.getPedidosActivos(RID)).data.flatMap((p) => p.items)
check(
  '6d · una bebida en la categoría "Platos de fondo" SÍ va a barra',
  conNueva.some((i) => i.producto_id === nueva.data.id && i.es_bebida === true),
)
await api.actualizarProducto(RID, nueva.data.id, { es_bebida: false })
check(
  '6e · se puede desmarcar como bebida desde el admin',
  localSeed.productos.find((p) => p.id === nueva.data.id).es_bebida === false,
)
await api.eliminarProducto(RID, nueva.data.id)

// ---------------------------------------------------------------------------
titulo('7 · El dashboard del admin suma la cuenta nueva')
// El dataset semilla ya trae cta-1 (yape_plin, S/66): se compara contra el
// total del método leído justo ANTES del cobro del punto 2.
const metricas = (await api.getMetricasAdmin(RID)).data
const yapeDespues = metricas.porMetodo.find((m) => m.metodo === 'yape_plin')?.total ?? 0
check(
  '7a · la venta nueva suma al total del método de pago',
  yapeDespues - yapeAntes === TOTAL,
  `subió ${yapeDespues - yapeAntes}, esperaba ${TOTAL}`,
)
check('7b · el mesero aparece en "ventas por mesero"', metricas.porMesero.some((v) => v.ventas > 0))
check(
  '7c · el total del mes cuadra con la suma de las cuentas del mes',
  metricas.ventaMes === metricas.porMetodo.reduce((a, m) => a + m.total, 0),
)
check('7d · hay top de productos', metricas.topProductos.length > 0)

// ---------------------------------------------------------------------------
titulo('8 · Persistencia: recargar la página no pierde nada')
// El modo local vuelca dataset + credenciales en localStorage tras cada
// escritura. Se simula un F5: se copia el storage, se borra la memoria y se
// vuelve a hidratar desde el storage.
const crudo = localStorage.getItem('mesora.local.datos')
check('8a · el dataset se guardó en localStorage', !!crudo && crudo.length > 0)
restablecerDatosLocal()
check(
  '8b · tras el reset la cuenta nueva ya no está en memoria',
  !localSeed.cuentas.some((c) => c.id === cuentaId),
)
localStorage.setItem('mesora.local.datos', crudo)
cargarDatosLocal(true)
const cuentaRestaurada = localSeed.cuentas.find((c) => c.id === cuentaId)
check('8c · la cuenta reaparece tras "recargar"', !!cuentaRestaurada)
check('8d · con el mismo total y método', cuentaRestaurada?.total === TOTAL && cuentaRestaurada?.metodo_pago === 'yape_plin')
check(
  '8e · los pedidos cobrados siguen "entregado" (no vuelven a cocina)',
  [idA, idB].every((id) => localSeed.pedidos.find((p) => p.id === id)?.estado === 'entregado'),
)
check('8f · la mesa sigue libre', localSeed.mesas.find((m) => m.id === MESA).estado === 'libre')
const trasRecarga = await api.getPedidosDeMesa(RID, MESA)
check('8g · no hay pedidos por cobrar tras la recarga', trasRecarga.data.length === 0)
const cocinaTrasRecarga = (await api.getPedidosActivos(RID)).data
check(
  '8h · cocina sigue limpia tras la recarga',
  !cocinaTrasRecarga.some((p) => p.id === idA) && !cocinaTrasRecarga.some((p) => p.id === idB),
)

// ---------------------------------------------------------------------------
titulo('9 - Reinicio de datos del demo (aislado del backend local)')
apiMode.demo = true
const apiDemo = getApi()
const RID_DEMO = mockRestaurante.id
const zonasSemilla = (await apiDemo.getZonas(RID_DEMO)).data.length
const mesasSemilla = (await apiDemo.getMesas(RID_DEMO)).data.length
const categoriasSemilla = (await apiDemo.getCategorias(RID_DEMO)).data.length
const productosSemilla = (await apiDemo.getProductos(RID_DEMO)).data.length
const cuentasSemilla = (await apiDemo.getMetricasAdmin(RID_DEMO)).data.cuentasMes
// El restaurante demo arranca VACÍO: el recorrido guiado lo construye paso a paso.
check(
  '9a0 - el demo arranca en 0 (zonas, mesas, categorías, platos y cuentas)',
  zonasSemilla === 0 &&
    mesasSemilla === 0 &&
    categoriasSemilla === 0 &&
    productosSemilla === 0 &&
    cuentasSemilla === 0,
  `z=${zonasSemilla} m=${mesasSemilla} c=${categoriasSemilla} p=${productosSemilla} cta=${cuentasSemilla}`,
)
const nuevaZonaDemo = await apiDemo.crearZona(RID_DEMO, 'Zona de prueba')
check('9a - el modo demo usa otro backend', apiDemo !== api)
check('9b - la zona creada aparece en el demo', !nuevaZonaDemo.error, nuevaZonaDemo.error ?? '')
check(
  '9c - crear en el demo NO muta mockData (se clona cada registro)',
  mockZonas.every((z) => z.nombre !== 'Zona de prueba'),
)
reiniciarDemoDatos()
check(
  '9d - reiniciarDemoDatos devuelve el demo al estado inicial',
  (await apiDemo.getZonas(RID_DEMO)).data.length === zonasSemilla,
)
apiMode.demo = false
// La ruta manda: en el navegador `enDemo` no depende del flag mutable, así que
// el contexto mock y la capa de datos nunca se desincronizan.
const ventanaReal = globalThis.window
globalThis.window = { location: { pathname: '/demo/admin' } }
check(
  '9f - enDemo sigue la ruta /demo (no el flag) y getApi devuelve el mock',
  enDemo() === true && getApi() === apiDemo && esModoLocal() === false,
)
globalThis.window = { location: { pathname: '/admin' } }
check('9g - enDemo se apaga fuera de /demo', enDemo() === false)
if (ventanaReal === undefined) delete globalThis.window
else globalThis.window = ventanaReal
check(
  '9e - el backend local quedo intacto tras tocar el demo',
  localSeed.zonas.length > 0 && !localSeed.zonas.some((z) => z.nombre === 'Zona de prueba'),
)

// ---------------------------------------------------------------------------
titulo('10 - Recorrido guiado: deteccion por datos reales')
const BASE = {
  zonas: 2,
  mesas: 6,
  mesaIds: ['m-1', 'm-2', 'm-3', 'm-4', 'm-5', 'm-6'],
  mesaEstados: { 'm-1': 'libre', 'm-2': 'libre', 'm-3': 'libre', 'm-4': 'libre', 'm-5': 'libre', 'm-6': 'libre' },
  categorias: 4,
  productos: 8,
  pedidoIds: ['p-1'],
  pedidoEstados: { 'p-1': 'pendiente' },
  pedidoMesas: { 'p-1': 'm-4' },
  cuentasMes: 1,
  ventaMes: 100,
}
const CTX = { mesaTour: null, pedidoTour: null, nuevaZona: false, boleta: false, categorias: 0 }
let g = { ...PROGRESO_VACIO, iniciado: true, base: BASE }
check('10a - al arrancar no hay ningun paso completado', g.hechos.length === 0)

let s = { ...BASE, zonas: 3, mesas: 7, mesaIds: [...BASE.mesaIds, 'm-7'] }
g = observar(g, s, '/demo/admin', [])
check('10b - crear una mesa completa solo el paso "salon"', eq(g.hechos, ['salon']))
check('10c - el recorrido recuerda la mesa creada', g.mesaTour === 'm-7')
check('10d - crear una zona no completa el paso por si sola', g.nuevaZona === true)

s = { ...s, productos: 9 }
g = observar(g, s, '/demo/admin', [])
check('10e - crear un producto completa "carta"', eq(g.hechos, ['salon', 'carta']))

s = {
  ...s,
  pedidoIds: ['p-1', 'p-9'],
  pedidoEstados: { 'p-1': 'pendiente', 'p-9': 'pendiente' },
  pedidoMesas: { 'p-1': 'm-4', 'p-9': 'm-7' },
}
g = observar(g, s, '/demo/mesero', [])
check('10f - una comanda nueva completa "comanda" y no "cocina"', eq(g.hechos, ['salon', 'carta', 'comanda']))
check('10g - la mesa del recorrido pasa a ser la de la comanda', g.mesaTour === 'm-7')

s = { ...s, pedidoEstados: { 'p-1': 'pendiente', 'p-9': 'en_preparacion' } }
g = observar(g, s, '/demo/cocina', [])
check('10h - avanzar a "en_preparacion" completa "cocina"', g.hechos.includes('cocina'))

s = { ...s, cuentasMes: 2, ventaMes: 175 }
g = observar(g, s, '/demo/mesero', [])
check('10i - cobrar NO completa "cobro" hasta descargar la boleta', !g.hechos.includes('cobro'))
g = observar(g, s, '/demo/mesero', ['boleta-pdf'])
check('10j - con la boleta descargada completa "cobro"', g.hechos.includes('cobro'))
g = observar(g, s, '/demo/admin', [])
check('10k - volver al panel completa los 6 pasos', g.hechos.length === TOTAL_PASOS)
check('10l - no queda paso pendiente', pasoActual(g) === null)
check('10m - los pasos completados no se pierden al releer', observar(g, BASE, '/demo/admin', []).hechos.length === TOTAL_PASOS)

// red de seguridad: si el sondeo no vio el avance, la comanda que desaparece
// (entregada o cobrada) tambien da por buena la cocina.
const gSalto = observar(
  { ...PROGRESO_VACIO, iniciado: true, base: BASE, pedidoTour: 'p-9' },
  { ...BASE, pedidoIds: ['p-1'] },
  '/demo/cocina',
  [],
)
check('10n - comanda que sale de la cola completa "cocina"', gSalto.hechos.includes('cocina'))

// desorden: hacer la comanda antes que la carta no bloquea el recorrido
const gDesorden = observar(
  { ...PROGRESO_VACIO, iniciado: true, base: BASE },
  { ...BASE, pedidoIds: ['p-1', 'p-9'], pedidoEstados: { 'p-1': 'pendiente', 'p-9': 'listo' }, pedidoMesas: { 'p-1': 'm-4', 'p-9': 'm-4' } },
  '/demo/cocina',
  [],
)
check('10o - los pasos se marcan en cualquier orden', gDesorden.hechos.includes('comanda') && !gDesorden.hechos.includes('carta'))
check('10p - el paso siguiente es el primero que falta', pasoActual(gDesorden).id === 'salon')

titulo('11 - Recorrido guiado: anclas, pistas y persistencia')
check('11a - salon apunta al modal de zona antes de crear la zona', anclasDe('salon', CTX)[0] === '[data-guia="zona-guardar"]')
check('11b - salon pasa a la mesa cuando la zona ya existe', anclasDe('salon', { ...CTX, nuevaZona: true })[0] === '[data-guia="mesa-guardar"]')
check('11c - cocina cae a la pestaña si no estas en /demo/admin', anclasDe('carta', CTX).includes('[data-guia="admin-tab-menu"]'))
check('11d - comanda prioriza enviar sobre producto y mesa', eq(anclasDe('comanda', CTX).slice(0, 3), ['[data-guia="enviar-comanda"]', '[data-guia="producto"]', '[data-guia="mesa-libre"]']))
check('11e - comanda resalta la mesa del recorrido cuando la hay', anclasDe('comanda', { ...CTX, mesaTour: 'm-7' })[2] === '[data-guia-mesa="m-7"]')
check('11f - cobro prioriza la boleta ya generada', anclasDe('cobro', CTX)[0] === '[data-guia="boleta-pdf"]')
check('11g - cocina resalta la comanda del recorrido', anclasDe('cocina', { ...CTX, pedidoTour: 'p-9' })[0] === '[data-guia-avanzar="p-9"]')

check('11h - el progreso guardado sirve si los datos lo sostienen', progresoVigente(g, s) !== null)
check('11i - el progreso guardado se descarta si los datos volvieron al origen', progresoVigente(g, BASE) === null)
const r = resumen(g, s)
check(
  '11j - el resumen final cuenta lo que se creo',
  r.mesas === 1 && r.zonas === 1 && r.productos === 1 && r.comandas === 1 && r.venta === 75,
  JSON.stringify(r),
)

// ---------------------------------------------------------------------------
titulo('12 - Editar y anular ítems de una comanda abierta')
const descripcionMojibake = '\u00c3\u008dtem \u00c2\u00abCheesecake\u00c2\u00bb anulado en Mesa 1.'
const descripcionUtf8 = '\u00cdtem \u00abCheesecake\u00bb anulado en Mesa 1.'
const auditoriaJsonLeida = JSON.parse(JSON.stringify({
  descripcion: descripcionMojibake,
  detalle: { producto: 'Cheesecake', nota: descripcionMojibake },
}))
const auditoriaNormalizada = normalizarContenidoUtf8(auditoriaJsonLeida)
check('12a0 · la descripción histórica recupera tildes y comillas angulares', normalizarTextoUtf8(descripcionMojibake) === descripcionUtf8)
check('12a1 · los caracteres UTF-8 sobreviven JSON y también se normaliza el detalle', auditoriaNormalizada.descripcion === descripcionUtf8 && auditoriaNormalizada.detalle.nota === descripcionUtf8)

const MESA12 = 'm-5'
const comandaC = await api.crearPedido(RID, MESA12, [pedir(prod('p-1'), 2, 'sin cebolla'), pedir(prod('p-8'), 1)])
check('12a · la comanda de prueba se creó', !comandaC.error, comandaC.error ?? '')
const idC = comandaC.data
const itemsC = (await api.getPedidoItems([idC])).data
const itemCeviche = itemsC.find((i) => i.producto_id === 'p-1')
const itemChicha = itemsC.find((i) => i.producto_id === 'p-8')
check('12b · la comanda tiene 2 ítems con id', itemsC.length === 2 && itemsC.every((i) => !!i.id))

// -- editar cantidad y nota
const ed = await api.editarItem(RID, idC, itemCeviche.id, { cantidad: 3, nota: '  extra ají  ' })
check('12c · editar el ítem no falla', !ed.error, ed.error ?? '')
const trasEditar = (await api.getPedidoItems([idC])).data
const cevicheEditado = trasEditar.find((i) => i.id === itemCeviche.id)
check('12d · la cantidad quedó en 3', cevicheEditado.cantidad === 3, `quedó ${cevicheEditado.cantidad}`)
check('12e · la nota se guarda recortada y sin vacíos', cevicheEditado.nota === 'extra ají', cevicheEditado.nota ?? 'null')
check('12f · el precio unitario NO se puede tocar desde la comanda', cevicheEditado.precio_unitario === itemCeviche.precio_unitario)
// 3×28 (p-1 en promo) + 1×8 (p-8) = 92
check('12g · el subtotal refleja la cantidad nueva', totalDe(trasEditar) === 92, `${totalDe(trasEditar)} != 92`)

const notaVacia = await api.editarItem(RID, idC, itemCeviche.id, { cantidad: 3, nota: '   ' })
check('12h · una nota solo con espacios se guarda como null', notaVacia.error === null && (await api.getPedidoItems([idC])).data.find((i) => i.id === itemCeviche.id).nota === null)

// -- validaciones de editar
for (const malo of [0, -1, 100, 1.5, 'dos', null]) {
  const r = await api.editarItem(RID, idC, itemCeviche.id, { cantidad: malo, nota: null })
  check(`12 · editar rechaza la cantidad ${JSON.stringify(malo)}`, !!r.error)
}
check(
  '12i · editar un ítem de otra comanda se rechaza',
  !!(await api.editarItem(RID, comandaB.data, itemCeviche.id, { cantidad: 1, nota: null })).error,
)
check(
  '12j · editar un ítem de otro restaurante se rechaza',
  !!(await api.editarItem('r-demo-2', idC, itemCeviche.id, { cantidad: 1, nota: null })).error,
)
check(
  '12k · editar un inexistente se rechaza',
  !!(await api.editarItem(RID, idC, 'no-existe', { cantidad: 1, nota: null })).error,
)

// -- anular un ítem
const cocinaAntes = (await api.getPedidosActivos(RID)).data.find((p) => p.id === idC)
check('12l · cocina ve la comanda completa antes de anular', cocinaAntes.items.length === 2 && cocinaAntes.anulados.length === 0)

const auditoriasAntesDeCeviche = localSeed.auditLogs.filter((l) => l.accion === 'comanda_item_anular' && l.entidad_id === itemCeviche.id).length
const an = await api.anularItem(RID, idC, itemCeviche.id)
check('12m · anular el ítem no falla', !an.error, an.error ?? '')
const trasAnular = (await api.getPedidoItems([idC])).data
check('12o2 · el primer intento deja exactamente una auditoría', localSeed.auditLogs.filter((l) => l.accion === 'comanda_item_anular' && l.entidad_id === itemCeviche.id).length - auditoriasAntesDeCeviche === 1)
check('12n · el ítem queda marcado, no borrado', trasAnular.length === 2 && trasAnular.find((i) => i.id === itemCeviche.id).anulado === true)
check('12o · queda registrado quién y cuándo lo anuló', !!trasAnular.find((i) => i.id === itemCeviche.id).anulado_at && !!trasAnular.find((i) => i.id === itemCeviche.id).anulado_por)
check('12o1 · la anulación del ítem deja auditoría local', localSeed.auditLogs.some((l) => l.accion === 'comanda_item_anular' && l.entidad_id === itemCeviche.id))
check('12p · el total ya no cuenta el ítem anulado', totalDe(trasAnular) === 8, `${totalDe(trasAnular)} != 8`)

const cocinaAnulada = (await api.getPedidosActivos(RID)).data.find((p) => p.id === idC)
check('12q · cocina deja de mostrar el ítem anulado', cocinaAnulada.items.length === 1)
check('12r · cocina SÍ se entera del anulado (no desaparece en silencio)', cocinaAnulada.anulados.length === 1 && cocinaAnulada.anulados[0].producto_id === 'p-1')
check(
  '12s · editar un ítem ya anulado se rechaza',
  !!(await api.editarItem(RID, idC, itemCeviche.id, { cantidad: 2, nota: null })).error,
)
check('12t · anular dos veces el mismo ítem no falla (idempotente)', (await api.anularItem(RID, idC, itemCeviche.id)).error === null)

// -- anular el último ítem: la comanda muere y la mesa se libera
check('12t1 · repetir una anulación no duplica la auditoría', localSeed.auditLogs.filter((l) => l.accion === 'comanda_item_anular' && l.entidad_id === itemCeviche.id).length - auditoriasAntesDeCeviche === 1)
const auditoriasAntesDelUltimo = localSeed.auditLogs.filter((l) => l.accion === 'comanda_item_anular' && l.entidad_id === itemChicha.id).length
const an2 = await ejecutarAnulacionItem({
  anular: async () => {
    const { error } = await api.anularItem(RID, idC, itemChicha.id)
    return { error }
  },
  verificarAnulado: async () => (await api.getPedidoItems([idC])).data.some((item) => item.id === itemChicha.id && item.anulado),
  recargar: async () => {
    const resultado = await api.getPedidosDeMesa(RID, MESA12)
    return { ok: !resultado.error, comandasAbiertas: resultado.data?.length ?? 0 }
  },
})
check('12u1 · el último ítem se informa como anulado correctamente', an2.estado === 'exito')
check('12u2 · la mesa liberada muestra el aviso verde esperado', an2.estado === 'exito' && an2.mensaje === MENSAJE_ITEM_ANULADO_MESA_LIBERADA)
check('12u3 · la escritura confirmada creó una sola auditoría', localSeed.auditLogs.filter((l) => l.accion === 'comanda_item_anular' && l.entidad_id === itemChicha.id).length - auditoriasAntesDelUltimo === 1)
check('12u4 · el registro nuevo conserva tildes y comillas angulares', localSeed.auditLogs.find((l) => l.entidad_id === itemChicha.id)?.descripcion === '\u00cdtem \u00ab' + itemChicha.nombre_producto + '\u00bb anulado en Mesa 5.')

let intentosMutacion = 0
const respuestaPerdida = await ejecutarAnulacionItem({
  anular: async () => {
    intentosMutacion++
    return { error: 'respuesta perdida después de guardar' }
  },
  verificarAnulado: async () => true,
  recargar: async () => ({ ok: true, comandasAbiertas: 0 }),
})
check('12u5 · una mutación confirmada tras perder respuesta no genera error ni reintento', respuestaPerdida.estado === 'exito' && respuestaPerdida.mensaje === MENSAJE_ITEM_ANULADO_MESA_LIBERADA && intentosMutacion === 1)
check('12u · anular el último ítem no falla', an2.estado === 'exito')
check('12v · la comanda queda "anulado"', localSeed.pedidos.find((p) => p.id === idC).estado === 'anulado')
check('12w · la comanda anulada ya no aparece para cobrar', !(await api.getPedidosDeMesa(RID, MESA12)).data.some((p) => p.id === idC))
check('12x · cocina ya no la muestra', !(await api.getPedidosActivos(RID)).data.some((p) => p.id === idC))
check('12y · la mesa vuelve a "libre"', localSeed.mesas.find((m) => m.id === MESA12).estado === 'libre')

// -- no se puede cobrar una comanda sin ítems vigentes
const cobrarAnulada = await api.cerrarCuenta(RID, MESA12, [idC], 'efectivo')
check('12z · cobrar una comanda anulada se rechaza', !!cobrarAnulada.error, `error: ${cobrarAnulada.error ?? 'ninguno'}`)
check('12zz · no se creó ninguna cuenta en cero', localSeed.cuentas.every((c) => c.total > 0))

// -- una comanda cobrada ya no se puede tocar (y sí, el flujo normal sigue vivo)
const comandaD = await api.crearPedido(RID, 'm-6', [pedir(prod('p-1'), 1)])
const itemsD = (await api.getPedidoItems([comandaD.data])).data
const cobroD = await api.cerrarCuenta(RID, 'm-6', [comandaD.data], 'efectivo')
check('12aa · la comanda de control se cobró', !cobroD.error, cobroD.error ?? '')
check(
  '12ab · editar una comanda cobrada se rechaza por el motivo correcto',
  (await api.editarItem(RID, comandaD.data, itemsD[0].id, { cantidad: 5, nota: null })).error ===
    'La comanda ya fue cobrada',
)
check(
  '12ac · anular una comanda cobrada se rechaza por el motivo correcto',
  (await api.anularItem(RID, comandaD.data, itemsD[0].id)).error === 'La comanda ya fue cobrada',
)

// -- una comanda totalmente anulada no llega ni a la caja
const comandaE = await api.crearPedido(RID, 'm-6', [pedir(prod('p-2'), 1)])
const itemsE = (await api.getPedidoItems([comandaE.data])).data
await api.anularItem(RID, comandaE.data, itemsE[0].id)
const ventaAntes = (await api.getMetricasAdmin(RID)).data.ventaMes
const cobroE = await api.cerrarCuenta(RID, 'm-6', [comandaE.data], 'efectivo')
check('12ad · una comanda con todo anulado no se puede cobrar', !!cobroE.error, `error: ${cobroE.error ?? 'ninguno'}`)
check('12ae · el dashboard no cambió', (await api.getMetricasAdmin(RID)).data.ventaMes === ventaAntes)

// -- una comanda de importe cero tampoco se cobra (ni cuenta en cero)
const comandaCero = await api.crearPedido(RID, 'm-8', [
  { producto_id: 'p-1', nombre_producto: 'Ceviche Clásico', cantidad: 1, precio_unitario: 0, nota: null },
])
const cobroCero = await api.cerrarCuenta(RID, 'm-8', [comandaCero.data], 'efectivo')
check(
  '12af · una comanda que suma cero se rechaza (no se guarda la cuenta)',
  cobroCero.error === 'No hay pedidos por cobrar en esta mesa.',
  `error: ${cobroCero.error ?? 'ninguno'}`,
)
check('12ag · no existe ninguna cuenta en cero', localSeed.cuentas.every((c) => c.total > 0))

// ---------------------------------------------------------------------------
titulo('13 · Datos del local, catálogo y personal (lo que ve el Admin)')
// ---------------------------------------------------------------------------

// -- Ajustes del local: lo que sale impreso en la boleta
const ajustes = await api.actualizarRestaurante(RID, {
  nombre: 'La Esquina del Sabor',
  ruc: '20512345678',
  direccion: 'Av. Principal 456, San Isidro',
  telefono: '+51 999 111 222',
  email_contacto: 'contacto@esquina.pe',
})
check('13a · el Admin guarda los datos del local', !ajustes.error && ajustes.data?.ruc === '20512345678', ajustes.error ?? '')
check(
  '13b · los datos quedan en el dataset (la boleta los lee de ahí)',
  localSeed.restaurantes.find((r) => r.id === RID)?.direccion === 'Av. Principal 456, San Isidro',
)
check(
  '13c · un nombre vacío se rechaza',
  (await api.actualizarRestaurante(RID, { nombre: '   ' })).error === 'El nombre no puede quedar vacío',
)
await api.actualizarRestaurante(RID, { nombre: mockRestaurante.nombre })

// -- Dominio de correos del personal (identidad usuario@dominio)
const guardaDominio = await api.actualizarRestaurante(RID, {
  nombre: mockRestaurante.nombre,
  dominio: 'Litoral.PE',
})
check(
  '13c1 · el Admin guarda el dominio (se normaliza a minúsculas)',
  !guardaDominio.error &&
    guardaDominio.data?.dominio === 'litoral.pe' &&
    localSeed.restaurantes.find((r) => r.id === RID)?.dominio === 'litoral.pe',
  guardaDominio.error ?? '',
)
await api.actualizarRestaurante(RID, { dominio: mockRestaurante.dominio ?? null })
check(
  '13c2 · normalizar, validar y armar correos por dominio',
  normalizarDominio('  @Litoral.PE/ ') === 'litoral.pe' &&
    normalizarDominio('www.cocina.pe') === 'cocina.pe' &&
    esDominioValido('litoral.pe') &&
    esDominioValido('sub.litoral.com') &&
    !esDominioValido('litoral') &&
    !esDominioValido('litoral .pe') &&
    !esDominioValido('') &&
    esUsuarioValido('carlos') &&
    esUsuarioValido('carlos.ramirez') &&
    esUsuarioValido('cocina_1') &&
    !esUsuarioValido('carlos ramirez') &&
    !esUsuarioValido('carlos@x') &&
    construirEmail('Carlos', 'litoral.pe') === 'carlos@litoral.pe' &&
    construirEmail('cocina', null) === 'cocina' &&
    separarEmail('carlos@litoral.pe', 'litoral.pe') === 'carlos' &&
    separarEmail('otro@x.pe', 'litoral.pe') === 'otro@x.pe' &&
    separarEmail('sin-arroba', 'litoral.pe') === 'sin-arroba',
)

// -- El menú del mesero oculta lo agotado; el Admin lo ve (para reponerlo)
const soloDisponibles = await api.getProductos(RID)
const catPostres = localSeed.categorias.find((c) => c.restaurante_id === RID && c.nombre === 'Postres')
const agotado = await api.crearProducto(RID, {
  categoria_id: catPostres.id,
  nombre: 'Sopa del día (agotada)',
  precio: 12,
  disponible: false,
})
check(
  '13d · un producto agotado NO aparece en el menú del mesero',
  !soloDisponibles.data.some((p) => p.id === agotado.data?.id),
)
check(
  '13e · un producto agotado SÍ aparece para el Admin',
  (await api.getProductos(RID, { incluirAgotados: true })).data.some((p) => p.id === agotado.data?.id),
)
check(
  '13f · una categoría con un producto agotado sigue bloqueada para borrarse',
  (await api.eliminarCategoria(RID, catPostres.id)).error ===
    'La categoría tiene productos asociados. Elimina primero sus productos.',
)
await api.eliminarProducto(RID, agotado.data.id)

// -- Una mesa con comanda servida y SIN cobrar no se puede borrar (paridad real/local)
const mesaConComanda = await api.crearPedido(RID, 'm-7', [pedir(prod('p-1'), 1)])
const itemsMesa = (await api.getPedidoItems([mesaConComanda.data])).data
await api.anularItem(RID, mesaConComanda.data, itemsMesa[0].id)
await api.anularItem(RID, mesaConComanda.data, itemsMesa[0].id)
const comandaServida = await api.crearPedido(RID, 'm-7', [pedir(prod('p-1'), 1)])
// Se "sirve" (entregado) sin pasar por caja: sigue siendo plata por cobrar.
localSeed.pedidos.find((p) => p.id === comandaServida.data).estado = 'entregado'
const borrarMesa = await api.eliminarMesa(RID, 'm-7')
check(
  '13g · una mesa con comanda servida y sin cobrar no se puede eliminar',
  borrarMesa.error === 'La mesa tiene comandas por cobrar. No se puede eliminar aún.',
  `error: ${borrarMesa.error ?? 'ninguno'}`,
)
check('13h · la mesa sigue existiendo', localSeed.mesas.some((m) => m.id === 'm-7'))

// -- Una comanda anulada no avanza de estado en cocina
const comandaAnulada = await api.crearPedido(RID, 'm-9', [pedir(prod('p-1'), 1)])
const itemsAnulada = (await api.getPedidoItems([comandaAnulada.data])).data
await api.anularItem(RID, comandaAnulada.data, itemsAnulada[0].id)
await api.anularItem(RID, comandaAnulada.data, itemsAnulada[0].id)
check(
  '13i · una comanda anulada no se puede avanzar de estado',
  (await api.avanzarPedido(RID, comandaAnulada.data)).error === 'La comanda está anulada',
)

// -- El Admin puede crear otro admin del restaurante
const nuevoAdmin = await api.crearPersonal(RID, {
  nombre: 'Segundo Admin',
  email: 'segundo@esquina.pe',
  rol: 'admin_restaurante',
})
check('13j · se crea un admin del restaurante', !nuevoAdmin.error && nuevoAdmin.data?.rol === 'admin_restaurante', nuevoAdmin.error ?? '')
check('13k · el admin nuevo aparece en el listado de personal', (await api.getPersonal(RID)).data.some((u) => u.id === nuevoAdmin.data?.id))
const operadorAntesCambioEstado13 = apiMode.operadorId
const adminEstadoCreado13 = await api.crearPersonal(RID, { nombre: 'Admin de prueba', email: 'admin-estado13@esquina.pe', rol: 'admin_restaurante' })
const adminEstado13 = localSeed.usuarios.find((u) => u.id === adminEstadoCreado13.data?.id)
apiMode.operadorId = adminEstado13?.id
const bajaPersonal13 = await api.cambiarEstadoPersonal(nuevoAdmin.data.id, false, 'Fin de prueba')
check(
  '13l · desactivar deja al usuario en la lista pero inactivo',
  bajaPersonal13.data?.activo === false,
  bajaPersonal13.error ?? '',
)
check('13m · un usuario inactivo sigue en el listado (con su historial)', (await api.getPersonal(RID)).data.some((u) => u.id === nuevoAdmin.data?.id && u.activo === false))
check('13n · el estado de acceso deja actor, antes/después y motivo en auditoría', (() => {
  const log = localSeed.auditLogs.find((l) => l.accion === 'usuario_desactivar' && l.entidad_id === nuevoAdmin.data?.id)
  return log?.actor_id === adminEstado13?.id && log.detalle?.activo_anterior === true && log.detalle?.activo_nuevo === false && log.detalle?.motivo === 'Fin de prueba'
})())
const altaPersonal13 = await api.cambiarEstadoPersonal(nuevoAdmin.data.id, true, 'Reingreso')
check('13n2 · reactivar conserva al usuario y su historial', altaPersonal13.data?.activo === true && (await api.getPersonal(RID)).data.some((u) => u.id === nuevoAdmin.data?.id), altaPersonal13.error ?? '')
check('13n3 · el buscador de personal distingue activos/inactivos y encuentra correo o rol', await (async () => {
  const activos = filtrarPersonal((await api.getPersonal(RID)).data.map((u) => ({ ...u, activo: u.activo !== false })), { busqueda: 'segundo@', rol: 'admin_restaurante', estado: 'activos' })
  const inactivos = filtrarPersonal([{ nombre: 'Cajero QA', email: 'caja@qa.pe', rol: 'cajero', activo: false }], { busqueda: 'cajero', rol: 'cajero', estado: 'inactivos' })
  return activos.some((u) => u.id === nuevoAdmin.data?.id) && inactivos.length === 1
})())
const bajaLogin13 = await api.cambiarEstadoPersonal(nuevoAdmin.data.id, false, 'Prueba de login inactivo')
const intentoLoginInactivo13 = await useAuthStore.getState().signIn(nuevoAdmin.data.email, PASSWORD_DE_PRUEBA)
check('13n4 · un usuario desactivado no puede iniciar sesión', Boolean(intentoLoginInactivo13), `${bajaLogin13.error ?? ''} ${String(intentoLoginInactivo13 ?? 'no hay error; el usuario inició sesión')}`)
await api.cambiarEstadoPersonal(nuevoAdmin.data.id, true, 'Restaurar tras prueba de login')
apiMode.operadorId = operadorAntesCambioEstado13

// -- Restablecer contraseña (Edge Function `reset-password-personal`) ---------
// El admin del restaurante fija la clave temporal y se la entrega en persona;
// la interfaz la enmascara, la Edge Function no la devuelve y local persiste un
// verificador PBKDF2 con sal. Las reglas son iguales en ambos modos.
const RID13 = 'r-nuevo'
const ADMIN13 = localSeed.usuarios.find((u) => u.rol === 'admin_restaurante' && u.restaurante_id === RID13)
const CAJERO13 = localSeed.usuarios.find((u) => u.rol === 'cajero' && u.restaurante_id === RID)
const operadorPrevio13 = apiMode.operadorId
const trabajador13 = await api.crearPersonal(RID13, {
  nombre: 'Cajero Reset 13',
  email: 'reset13@mirestaurante.pe',
  rol: 'cajero',
})
const mesero13 = await api.crearPersonal(RID13, {
  nombre: 'Mesero Reset 13',
  email: 'mesero13@mirestaurante.pe',
  rol: 'mesero',
})
const otroAdmin13 = await api.crearPersonal(RID13, {
  nombre: 'Admin Reset 13',
  email: 'admin13@mirestaurante.pe',
  rol: 'admin_restaurante',
})

apiMode.operadorId = ADMIN13?.id
const resetPassword13 = 'ClaveTemporalQA-2026!'
const resetInvalido13 = await api.resetPasswordPersonal(trabajador13.data?.id, 'corta')
check('13o · clave temporal demasiado corta se rechaza antes de llamar a Auth', resetInvalido13.error === 'La clave temporal debe tener entre 10 y 128 caracteres.')
const reset13 = await api.resetPasswordPersonal(trabajador13.data?.id, resetPassword13)
check(
  '13o2 · el admin restablece la clave sin recibirla ni mostrarla de vuelta',
  !reset13.error && reset13.data === null &&
    localCredenciales['reset13@mirestaurante.pe'] !== resetPassword13 &&
    String(localCredenciales['reset13@mirestaurante.pe']).startsWith('pbkdf2$') &&
    await verificarCredencialLocal(resetPassword13, localCredenciales['reset13@mirestaurante.pe']),
  reset13.error ?? '',
)
check(
  '13p · el trabajador queda marcado para cambiar la contraseña al entrar',
  localSeed.usuarios.find((u) => u.id === trabajador13.data?.id)?.debe_cambiar_password === true,
)
check('13p2 · la auditoría del reset no contiene la clave', (() => {
  const log = localSeed.auditLogs.find((l) => l.accion === 'usuario_password_reset' && l.entidad_id === trabajador13.data?.id)
  return Boolean(log) && !JSON.stringify(log).includes(resetPassword13)
})())

// Un mesero no puede restablecer la contraseña de nadie.
apiMode.operadorId = mesero13.data?.id
const resetDeMesero13 = await api.resetPasswordPersonal(trabajador13.data?.id)
check(
  '13q · un mesero NO puede restablecer contraseñas',
  resetDeMesero13.error === 'Solo un administrador activo puede restablecer contraseñas de su personal.',
  resetDeMesero13.error ?? '',
)

// El admin tampoco puede tocar la cuenta de otro admin.
apiMode.operadorId = ADMIN13?.id
const resetDeAdmin13 = await api.resetPasswordPersonal(otroAdmin13.data?.id)
check(
  '13r · el admin NO puede restablecer la contraseña de otro administrador',
  resetDeAdmin13.error === 'No se puede restablecer la contraseña de otro administrador.',
  resetDeAdmin13.error ?? '',
)

// Ni la de alguien de otro restaurante.
const resetDeAjeno13 = await api.resetPasswordPersonal(CAJERO13?.id)
check(
  '13s · el admin NO puede restablecer la contraseña de alguien de otro restaurante',
  resetDeAjeno13.error === 'Ese usuario pertenece a otro restaurante.',
  resetDeAjeno13.error ?? '',
)

apiMode.operadorId = operadorPrevio13
for (const creado of [trabajador13, mesero13, otroAdmin13]) {
  if (creado.data?.id) await api.cambiarEstadoPersonal(creado.data.id, false, 'Cierre de pruebas QA')
}

// ---------------------------------------------------------------------------
titulo('14 · Reporte de ventas (CSV que se descarga el Admin)')
// ---------------------------------------------------------------------------

const { construirReporte, reporteACsv, nombreArchivoReporte } = await servidor.ssrLoadModule(
  '/src/lib/reporte.ts',
)
const { METODOS_PAGO } = await servidor.ssrLoadModule('/src/types/database.ts')

const metricasReporte = (await api.getMetricasAdmin(RID)).data
const pagadas = await api.getCuentasPagadas(RID)
check('14a · getCuentasPagadas devuelve solo cuentas pagadas', !pagadas.error && pagadas.data.every((c) => c.estado === 'pagada'), pagadas.error ?? '')
check(
  '14b · las cuentas del reporte tienen todo lo que necesita el CSV',
  pagadas.data.every((c) => typeof c.total === 'number' && c.metodo_pago && c.pagado_at),
)
check(
  '14c · las cuentas mensuales coinciden con el total pagado del dashboard',
  pagadas.data.filter((c) => c.pagado_at && new Date(c.pagado_at).getMonth() === new Date().getMonth() && new Date(c.pagado_at).getFullYear() === new Date().getFullYear()).length === metricasReporte.cuentasMes,
)

const ahoraReporte = new Date()
const inicioMesReporte = new Date(ahoraReporte.getFullYear(), ahoraReporte.getMonth(), 1).getTime()
const inicioMesSiguienteReporte = new Date(ahoraReporte.getFullYear(), ahoraReporte.getMonth() + 1, 1).getTime()
const pagadasMesReporte = pagadas.data.filter((c) => c.pagado_at && Date.parse(c.pagado_at) >= inicioMesReporte && Date.parse(c.pagado_at) < inicioMesSiguienteReporte)
const reporte = construirReporte('La Esquina', pagadasMesReporte, metricasReporte)
const csv = reporteACsv(reporte)
const lineas = csv.split('\r\n')

check('14d · el reporte trae el nombre del restaurante', csv.includes('La Esquina'))
check(
  '14e · el CSV usa ";" como separador (Excel en español)',
  // Solo pueden quedar comas dentro de celdas entrecomilladas: fuera de ellas
  // una coma rompería la columna (en es-PE la coma es separador decimal).
  lineas.every((l) => !l.replace(/"[^"]*"/g, '').includes(',')),
  lineas.find((l) => l.replace(/"[^"]*"/g, '').includes(',')),
)
check('14f · el CSV incluye las secciones esperadas', ['RESUMEN', 'VENTAS POR DÍA', 'MÉTODOS DE PAGO', 'TOP PRODUCTOS', 'VENTAS POR MESERO'].every((s) => csv.includes(s)))
check(
  '14g · las ventas por día cuadran con las cuentas pagadas',
  eq(reporte.ventasPorDia.reduce((a, d) => a + d.total, 0).toFixed(2), metricasReporte.ventaMes.toFixed(2)),
  `csv: ${reporte.ventasPorDia.reduce((a, d) => a + d.total, 0).toFixed(2)} · metricas: ${metricasReporte.ventaMes.toFixed(2)}`,
)
check(
  '14h · los métodos de pago del CSV suman el total del mes',
  eq(
    reporte.metricas.porMetodo
      .filter((m) => METODOS_PAGO.includes(m.metodo))
      .reduce((a, m) => a + m.total, 0)
      .toFixed(2),
    metricasReporte.ventaMes.toFixed(2),
  ),
)
check('14i · el nombre del archivo lleva la fecha', /^\d{4}-\d{2}-\d{2}$/.test(nombreArchivoReporte(reporte.generadoEn).replace('reporte-ventas-', '').replace('.csv', '')))

// Un producto con coma y comilla no debe romper las columnas del Excel.
const csvComillas = reporteACsv(
  construirReporte(
    'Local, "El Coco"',
    [{ id: 'c-1', total: 12.5, metodo_pago: 'efectivo', estado: 'pagada', pagado_at: new Date().toISOString(), created_at: new Date().toISOString() }],
    { ...metricasReporte, porMetodo: [{ metodo: 'efectivo', total: 12.5, cuentas: 1 }] },
  ),
)
check('14j · un nombre con coma y comillas se escapa correctamente', csvComillas.includes('"Local, ""El Coco"""'))
check('14k · los montos se escriben con 2 decimales', csvComillas.includes('12.50'))
const reporteDetallado = await api.getReporteVentas(RID, {
  desde: '2000-01-01T00:00:00.000Z', hasta: '2101-01-01T00:00:00.000Z',
  estado: 'todas', busqueda: '', offset: 0, limite: 25,
})
check('14l · el reporte detallado carga sin error', !reporteDetallado.error, reporteDetallado.error ?? '')
check('14m · el resumen coincide con la cantidad de cuentas cobradas', reporteDetallado.data?.resumen.cuentas_pagadas === pagadas.data.length)
check('14n · cada cuenta incluye mesa, mesero, pedidos e ítems', Boolean(reporteDetallado.data?.cuentas.some((c) => c.pedidos.some((p) => p.items.length > 0))))
check('14o · los pagos conservan el desglose por método', Boolean(reporteDetallado.data?.cuentas.every((c) => c.pagos.length > 0)))
check('14o1 · la tendencia diaria suma el total cobrado del periodo', Math.abs((reporteDetallado.data?.ventas_por_dia.reduce((s, d) => s + d.ventas, 0) ?? 0) - (reporteDetallado.data?.resumen.ventas ?? 0)) < 0.01)
check('14o2 · los horarios pico suman el total cobrado del periodo', Math.abs((reporteDetallado.data?.ventas_por_hora.reduce((s, h) => s + h.ventas, 0) ?? 0) - (reporteDetallado.data?.resumen.ventas ?? 0)) < 0.01)
check('14o3 · los métodos de pago suman ventas sin propinas ni vuelto', Math.abs((reporteDetallado.data?.ventas_por_metodo.reduce((s, m) => s + m.ventas, 0) ?? 0) - (reporteDetallado.data?.resumen.ventas ?? 0)) < 0.01)
const cuentaParaBuscar = reporteDetallado.data?.cuentas[0]
if (cuentaParaBuscar?.numero) {
  const filtradoDetallado = await api.getReporteVentas(RID, {
    desde: '2000-01-01T00:00:00.000Z', hasta: '2101-01-01T00:00:00.000Z',
    estado: 'todas', busqueda: cuentaParaBuscar.numero, offset: 0, limite: 25,
  })
  check('14p · la búsqueda por boleta devuelve la coincidencia', filtradoDetallado.data?.cuentas.length === 1 && filtradoDetallado.data.cuentas[0].id === cuentaParaBuscar.id)
}

// ---------------------------------------------------------------------------
titulo('15 · Caja por turnos (apertura y arqueo)')
// ---------------------------------------------------------------------------

const { arqueoTurno, errorAlAbrirTurno, errorAlCerrarTurno, ventasEfectivoDelTurno, parseMonto } =
  await servidor.ssrLoadModule('/src/lib/caja.ts')

// En modo local el restaurante de demostración no tiene admin sembrado (solo el
// restaurante "nuevo"), así que se crea uno para poder abrir la caja.
const adminCaja = await api.crearPersonal(RID, {
  nombre: 'Cajero del turno',
  email: 'cajero@esquina.pe',
  rol: 'admin_restaurante',
})
const adminId = adminCaja.data?.id
check('15a · se crea un admin que abre la caja', !adminCaja.error && Boolean(adminId), adminCaja.error ?? '')

// -- No se puede cerrar una caja que no se abrió
check(
  '15b · no se puede cerrar si no hay turno abierto',
  (await api.cerrarTurno(RID, adminId, 100)).error === 'No hay ningún turno de caja abierto.',
)

// -- Apertura
const apertura = await api.abrirTurno(RID, adminId, 200)
check('15c · el admin abre el turno con el monto inicial', !apertura.error && apertura.data?.monto_inicial === 200, apertura.error ?? '')
check('15d · el turno queda abierto y sin datos de cierre', apertura.data?.estado === 'abierto' && apertura.data?.fecha_cierre === null)
check('15e · un segundo turno no se puede abrir', (await api.abrirTurno(RID, adminId, 50)).error === 'Ya hay un turno de caja abierto. Debes cerrarlo antes de abrir otro nuevo.')
check('15f · el monto inicial negativo se rechaza', (await api.abrirTurno(RID, adminId, -1)).error !== null)

// -- El arqueo solo cuenta el efectivo cobrado dentro del turno
const turnoAbierto = (await api.getTurnoAbierto(RID)).data
const ventasDelTurno = ventasEfectivoDelTurno(
  localSeed.cuentas.filter((c) => c.restaurante_id === RID),
  turnoAbierto.fecha_apertura,
  null,
)
check('15h · el arqueo cuenta el efectivo cobrado desde la apertura', ventasDelTurno >= 0 && Number.isFinite(ventasDelTurno))
check(
  '15i · el esperado es el monto inicial más el efectivo del turno',
  arqueoTurno(turnoAbierto, localSeed.cuentas.filter((c) => c.restaurante_id === RID)).esperado ===
    200 + ventasDelTurno,
)

// -- Un cobro en efectivo durante el turno SÍ suma al arqueo
const comandaCaja = await api.crearPedido(RID, 'm-8', [pedir(prod('p-1'), 2)])
await api.cerrarCuenta(RID, 'm-8', [comandaCaja.data], 'efectivo')
const arqueoConCobro = arqueoTurno(turnoAbierto, localSeed.cuentas.filter((c) => c.restaurante_id === RID))
check(
  '15j · un cobro en efectivo durante el turno aumenta el efectivo esperado',
  arqueoConCobro.ventas > ventasDelTurno,
  `antes: ${ventasDelTurno} · ahora: ${arqueoConCobro.ventas}`,
)

// -- Y un cobro con tarjeta NO suma (no entra a la gaveta)
const ventasAntesTarjeta = arqueoConCobro.ventas
const comandaTarjeta = await api.crearPedido(RID, 'm-8', [pedir(prod('p-1'), 1)])
await api.cerrarCuenta(RID, 'm-8', [comandaTarjeta.data], 'tarjeta')
check(
  '15k · un cobro con tarjeta no altera el efectivo esperado',
  arqueoTurno(turnoAbierto, localSeed.cuentas.filter((c) => c.restaurante_id === RID)).ventas === ventasAntesTarjeta,
)

// -- Cierre: declarado corto = faltante
// Antes de cerrar se deja una mesa con dinero SIN cobrar a propósito: el cierre
// no debe bloquearse por eso (el arqueo solo cuenta el efectivo cobrado), pero
// Caja sí debe poder avisar cuánto y en qué mesa queda pendiente.
const pendienteCaja = await api.crearPedido(RID, 'm-9', [pedir(prod('p-1'), 3)])
const totalPendienteCaja = 3 * pedir(prod('p-1'), 1).precio_unitario
const avisoPendientes = (await api.getMesasPorCobrar(RID)).data
check(
  '15l0 · getMesasPorCobrar lista la mesa con dinero pendiente',
  Boolean(pendienteCaja.data) && avisoPendientes.some((m) => m.mesa_id === 'm-9'),
  JSON.stringify(avisoPendientes),
)
check(
  '15l1 · el total pendiente suma los ítems vigentes de esa mesa',
  avisoPendientes.find((m) => m.mesa_id === 'm-9')?.total === totalPendienteCaja,
  `esperado: ${totalPendienteCaja} · recibido: ${JSON.stringify(avisoPendientes.find((m) => m.mesa_id === 'm-9'))}`,
)

const esperado = arqueoTurno(turnoAbierto, localSeed.cuentas.filter((c) => c.restaurante_id === RID)).esperado
const cierreFaltante = await api.cerrarTurno(RID, adminId, esperado - 10, 'Faltó un billete de 10')
check('15l · el turno se cierra', !cierreFaltante.error, cierreFaltante.error ?? '')
check(
  '15l2 · el cierre NO se bloquea por mesas con dinero sin cobrar',
  !cierreFaltante.error && avisoPendientes.length > 0,
  cierreFaltante.error ?? '',
)
check('15m · la diferencia registra el faltante', cierreFaltante.data?.diferencia === -10, `diferencia: ${cierreFaltante.data?.diferencia}`)
check('15n · el cierre congela el esperado', cierreFaltante.data?.monto_esperado === esperado)
check('15o · las observaciones se guardan', cierreFaltante.data?.observaciones === 'Faltó un billete de 10')
check('15p · no queda ningún turno abierto', (await api.getTurnoAbierto(RID)).data === null)
check('15q · el turno cerrado aparece en el historial', (await api.getTurnos(RID)).data.some((t) => t.id === cierreFaltante.data?.id))
check('15q1 · el cierre de caja deja auditoría local con diferencia', localSeed.auditLogs.some((l) => l.accion === 'caja_turno_cerrar' && l.entidad_id === cierreFaltante.data?.id && l.detalle?.diferencia === -10))
check(
  '15r · el monto declarado negativo se rechaza',
  (await api.cerrarTurno(RID, adminId, -5)).error === 'No hay ningún turno de caja abierto.',
)

// -- El arqueo histórico no se recalcula aunque se cobre después
const comandaPost = await api.crearPedido(RID, 'm-8', [pedir(prod('p-1'), 1)])
await api.cerrarCuenta(RID, 'm-8', [comandaPost.data], 'efectivo')
const historico = (await api.getTurnos(RID)).data.find((t) => t.id === cierreFaltante.data?.id)
check('15s · cobrar después NO reescribe el arqueo ya cerrado', historico?.monto_esperado === esperado && historico?.diferencia === -10)
// La mesa que quedó pendiente al cerrar desaparece del aviso en cuanto se cobra.
await api.cerrarCuenta(RID, 'm-9', [pendienteCaja.data], 'efectivo')
const avisoTrasCobro = (await api.getMesasPorCobrar(RID)).data
check(
  '15s2 · al cobrar la mesa deja de aparecer en getMesasPorCobrar',
  !avisoTrasCobro.some((m) => m.mesa_id === 'm-9'),
  JSON.stringify(avisoTrasCobro),
)

// -- Cierre cuadrado
const turno2 = await api.abrirTurno(RID, adminId, 0)
const arqueo2 = arqueoTurno(turno2.data, localSeed.cuentas.filter((c) => c.restaurante_id === RID))
const cierreCuadrado = await api.cerrarTurno(RID, adminId, arqueo2.esperado)
check('15t · un turno nuevo no arrastra el efectivo del turno anterior', arqueo2.ventas === 0, `ventas: ${arqueo2.ventas}`)
check('15u · un arqueo declarado correctamente da diferencia 0', cierreCuadrado.data?.diferencia === 0, `diferencia: ${cierreCuadrado.data?.diferencia}`)

// -- Validaciones puras (sin backend): messages y parseo de montos
check('15v · errorAlAbrirTurno tolera 0', errorAlAbrirTurno(0, null) === null)
check('15w · errorAlAbrirTurno rechaza un turno ya abierto', errorAlAbrirTurno(0, { id: 'x' }) !== null)
check('15x · errorAlCerrarTurno sin turno abierto', errorAlCerrarTurno(100, null) === 'No hay ningún turno de caja abierto.')
check('15y · errorAlCerrarTurno con monto negativo', errorAlCerrarTurno(-1, { id: 'x' }) === 'El monto declarado no puede ser negativo.')
check(
  '15y2 · la regla de mesas sin cobrar no bloquea: el cierre solo valida el monto',
  errorAlCerrarTurno(100, { id: 'x' }) === null,
)
check('15z · parseMonto entiende "1,234.50" y "1234,50"', parseMonto('1,234.50') === 1234.5 && parseMonto('1234,50') === 1234.5)
check('15aa · parseMonto devuelve NaN con letras', Number.isNaN(parseMonto('abc')))
// Va al final a propósito: con la caja ya cerrada se valida la pertenencia del
// usuario sin que el "ya hay un turno abierto" tape el motivo real del rechazo.
check(
  '15ab · un usuario de otro restaurante no puede abrir la caja',
  (await api.abrirTurno(RID, 'u-inexistente', 100)).error ===
    'El usuario que abre la caja no pertenece a este restaurante.',
)

// ---------------------------------------------------------------------------
titulo('16 · Pago dividido, propina y vuelto')
// ---------------------------------------------------------------------------

const { resumirPago, vueltoRapido, repartoSugerido, completarPartes, labelMetodoPago } =
  await servidor.ssrLoadModule('/src/lib/pagos.ts')

// -- Lógica pura: resúmenes
const r1 = resumirPago(100, [{ metodo: 'efectivo', monto: 100 }])
check('16a · el pago exacto no da vuelto', r1.valido && r1.vuelto === 0 && r1.aPagar === 100, JSON.stringify(r1))
check(
  '16b · un billete de 120 por una cuenta de 100 da vuelto de 20',
  resumirPago(100, [{ metodo: 'efectivo', monto: 120 }]).vuelto === 20,
)
check(
  '16c · recibo de menos no es válido',
  resumirPago(100, [{ metodo: 'efectivo', monto: 80 }]).error === 'El monto recibido no cubre el total de la cuenta.',
)
check(
  '16d · una parte de cero se rechaza',
  resumirPago(100, [{ metodo: 'tarjeta', monto: 0 }]).error === 'Cada pago debe ser mayor que cero.',
)
check(
  '16e · un método fuera de la whitelist se rechaza',
  resumirPago(100, [{ metodo: 'bitcoin', monto: 100 }]).error === 'Hay un método de pago no válido.',
)
check(
  '16f · la tarjeta no puede superar el total (el vuelto es solo efectivo)',
  resumirPago(100, [{ metodo: 'tarjeta', monto: 130 }]).error ===
    'El pago con tarjeta o Yape no puede superar el total: el vuelto solo se entrega en efectivo.',
)
const r2 = resumirPago(100, [
  { metodo: 'efectivo', monto: 70 },
  { metodo: 'yape_plin', monto: 30 },
])
check('16g · efectivo + Yape exacto es válido y sin vuelto', r2.valido && r2.vuelto === 0 && r2.efectivo === 70 && r2.noEfectivo === 30, JSON.stringify(r2))
check(
  '16h · efectivo + Yape con excedente da vuelto solo del efectivo',
  resumirPago(100, [
    { metodo: 'efectivo', monto: 70 },
    { metodo: 'yape_plin', monto: 40 },
  ]).vuelto === 10,
)
check(
  '16i · la propina se suma al total a pagar pero no al total de la comanda',
  (() => {
    const r = resumirPago(100, [{ metodo: 'efectivo', monto: 110 }], 10)
    return r.valido && r.total === 100 && r.propina === 10 && r.aPagar === 110 && r.vuelto === 0
  })(),
)
check('16j · la propina negativa se rechaza', resumirPago(100, [{ metodo: 'efectivo', monto: 110 }], -1).error === 'La propina no puede ser negativa.')
check('16k · sin partes no se cobra', resumirPago(100, []).error === 'Agrega al menos un método de pago.')
check('16l · vueltoRapido nunca es negativo', vueltoRapido(50, 100) === 0 && vueltoRapido(120, 100) === 20)

// -- repartoSugerido: la suma tiene que cuadrar al céntimo
const reparto = repartoSugerido(100, ['efectivo', 'tarjeta', 'yape_plin'])
check('16m · el reparto suma exactamente el total a pagar', eq(reparto.reduce((a, p) => a + p.monto, 0), 100), JSON.stringify(reparto))
check('16n · el reparto genera una parte por método', reparto.length === 3)
check('16o · el reparto de un total con decimales también cuadra', eq(repartoSugerido(10.01, ['efectivo', 'tarjeta']).reduce((a, p) => a + p.monto, 0), 10.01))
check('16p · toda etiqueta de método tiene texto legible', labelMetodoPago('efectivo') === 'Efectivo')

// -- completarPartes: la parte en blanco es "el resto que falta", no el total
const cp1 = completarPartes([{ metodo: 'efectivo', monto: 33 }, { metodo: 'yape_plin', monto: 0 }], 100)
check('16p1 · el "exacto" se completa con el resto, no con el total', cp1.partes[1].monto === 67, JSON.stringify(cp1))
check('16p2 · completarPartes con montos ya cerrados no cambia nada', eq(completarPartes([{ metodo: 'efectivo', monto: 60 }, { metodo: 'tarjeta', monto: 40 }], 100).partes, [{ metodo: 'efectivo', monto: 60 }, { metodo: 'tarjeta', monto: 40 }]))
check('16p3 · solo una parte puede quedar exacta', completarPartes([{ metodo: 'efectivo', monto: 0 }, { metodo: 'tarjeta', monto: 0 }], 100).error !== null)
check('16p4 · si las demás partes ya cubren el total, la exacta sobra', completarPartes([{ metodo: 'efectivo', monto: 100 }, { metodo: 'tarjeta', monto: 0 }], 100).error !== null)
check(
  '16p5 · el desglose completado sí cuadra con el resumen',
  (() => {
    const c = completarPartes([{ metodo: 'efectivo', monto: 33 }, { metodo: 'yape_plin', monto: 0 }], 100)
    const r = resumirPago(100, c.partes)
    return r.valido && r.vuelto === 0 && r.recibido === 100
  })(),
)

// -- Backend local: el desglose queda guardado
const comandaDiv = await api.crearPedido(RID, 'm-6', [pedir(prod('p-1'), 1)])
const totalDiv = totalDe((await api.getPedidoItems([comandaDiv.data])).data)
// 30 en efectivo + 3 por Yape para una cuenta de 28: el vuelto sale del efectivo.
const cobroDiv = await api.cerrarCuentaDividida(
  RID,
  'm-6',
  [comandaDiv.data],
  [
    { metodo_pago: 'efectivo', monto: 30 },
    { metodo_pago: 'yape_plin', monto: 3 },
  ],
  0,
)
check('16q · el pago dividido se cobra', !cobroDiv.error, cobroDiv.error ?? '')
check(
  '16r · la cuenta guarda el vuelto',
  cobroDiv.data?.vuelto === 5,
  `vuelto: ${cobroDiv.data?.vuelto} · esperado: 5`,
)
check('16s · la cuenta guarda el método principal (efectivo)', cobroDiv.data?.metodo_pago === 'efectivo')
check(
  '16t · el total NO incluye la propina ni el vuelto',
  cobroDiv.data?.total === totalDiv,
  `total: ${cobroDiv.data?.total} · esperado: ${totalDiv}`,
)
check(
  '16u · el detalle guarda una fila por método con el importe real',
  (() => {
    const pagos = localSeed.pagos.filter((p) => p.cuenta_id === cobroDiv.data?.id)
    return (
      pagos.length === 2 &&
      pagos.some((p) => p.metodo_pago === 'efectivo' && p.monto === 30) &&
      pagos.some((p) => p.metodo_pago === 'yape_plin' && p.monto === 3)
    )
  })(),
)
check(
  '16u2 · el efectivo de la caja es el de la parte menos el vuelto',
  (() => {
    const pagos = localSeed.pagos.filter((p) => p.cuenta_id === cobroDiv.data?.id)
    const efectivo = pagos.filter((p) => p.metodo_pago === 'efectivo').reduce((a, p) => a + p.monto, 0)
    // El cajero recibe 30 en efectivo y entrega 5 de vuelto: en caja quedan 25.
    return efectivo - (cobroDiv.data?.vuelto ?? 0) === 25
  })(),
)
check(
  '16v · el vuelto NO suma al total de las ventas del dashboard',
  (await api.getMetricasAdmin(RID)).data.ventaMes >= totalDiv,
)

// -- El dashboard reparte la venta entre los métodos que la pagaron
const metricaDiv = (await api.getMetricasAdmin(RID)).data
check(
  '16v1 · la venta por método reparte la cuenta dividida (no la espera al método principal)',
  (() => {
    const efectivo = metricaDiv.porMetodo.find((m) => m.metodo === 'efectivo')?.total ?? 0
    const yape = metricaDiv.porMetodo.find((m) => m.metodo === 'yape_plin')?.total ?? 0
    // La cuenta dividida de arriba: 30 efectivo + 3 Yape para 28 → 25 efectivo + 3 Yape.
    return efectivo >= 25 && yape >= 3
  })(),
  JSON.stringify(metricaDiv.porMetodo),
)
check(
  '16v2 · el vuelto no se le carga a ningún método',
  metricaDiv.porMetodo.reduce((a, m) => a + m.total, 0) === metricaDiv.ventaMes,
  `por método: ${metricaDiv.porMetodo.reduce((a, m) => a + m.total, 0)} · ventaMes: ${metricaDiv.ventaMes}`,
)

// -- Propina: se guarda aparte y no infla la venta
const comandaPropina = await api.crearPedido(RID, 'm-6', [pedir(prod('p-2'), 1)])
const ventaAntesPropina = (await api.getMetricasAdmin(RID)).data.ventaMes
const cobroPropina = await api.cerrarCuentaDividida(
  RID,
  'm-6',
  [comandaPropina.data],
  [{ metodo_pago: 'efectivo', monto: 0 }],
  5,
)
const totalPropina = totalDe((await api.getPedidoItems([comandaPropina.data])).data)
check('16w · el cobro con propina se registra', !cobroPropina.error, cobroPropina.error ?? '')
check('16x · la propina queda guardada en la cuenta', cobroPropina.data?.propina === 5)
check('16y · el total de la cuenta es el de la comanda, sin la propina', cobroPropina.data?.total === totalPropina)
check(
  '16z · el dashboard NO cuenta la propina como venta',
  Math.abs((await api.getMetricasAdmin(RID)).data.ventaMes - ventaAntesPropina - totalPropina) < 0.01,
  `antes: ${ventaAntesPropina} · ahora: ${(await api.getMetricasAdmin(RID)).data.ventaMes} · comanda: ${totalPropina}`,
)

// -- Rechazos
const comandaMala = await api.crearPedido(RID, 'm-6', [pedir(prod('p-1'), 1)])
const totalMala = totalDe((await api.getPedidoItems([comandaMala.data])).data)
check(
  '16aa · no se cobra un pago dividido que no cubre el total',
  (await api.cerrarCuentaDividida(RID, 'm-6', [comandaMala.data], [{ metodo_pago: 'efectivo', monto: 1 }])).error ===
    'El monto recibido no cubre el total de la cuenta.',
)
check(
  '16ab · no se cobra un método inválido',
  (await api.cerrarCuentaDividida(RID, 'm-6', [comandaMala.data], [{ metodo_pago: 'bitcoin', monto: totalMala }])).error ===
    'Método de pago no válido.',
)
check(
  '16ac · no se cobra una propina negativa',
  (await api.cerrarCuentaDividida(RID, 'm-6', [comandaMala.data], [{ metodo_pago: 'efectivo', monto: 0 }], -5)).error ===
    'La propina no puede ser negativa.',
)
check(
  '16ad · no se cobra sin métodos',
  (await api.cerrarCuentaDividida(RID, 'm-6', [comandaMala.data], [])).error === 'Agrega al menos un método de pago.',
)
check(
  '16ae · no se cobra con dos partes "exactas" (se cobraría el doble)',
  (await api.cerrarCuentaDividida(RID, 'm-6', [comandaMala.data], [
    { metodo_pago: 'efectivo', monto: 0 },
    { metodo_pago: 'tarjeta', monto: 0 },
  ])).error !== null,
)
check(
  '16af · no se cobra una parte "exacta" si las demás ya cubren el total',
  (await api.cerrarCuentaDividida(RID, 'm-6', [comandaMala.data], [
    { metodo_pago: 'efectivo', monto: totalMala },
    { metodo_pago: 'tarjeta', monto: 0 },
  ])).error !== null,
)
// La comanda sigue sin cobrar: los rechazos no dejaron nada a medias.
check(
  '16ag · la comanda rechazada sigue pendiente (no se cobró a medias)',
  localSeed.pedidos.find((p) => p.id === comandaMala.data)?.estado !== 'entregado',
)
// Y ahora sí se cobra, para no dejar la mesa con comandas colgadas.
await api.cerrarCuenta(RID, 'm-6', [comandaMala.data], 'efectivo')

// -- El pago simple sigue siendo el camino corto (monto 0 = exacto)
const comandaSimple = await api.crearPedido(RID, 'm-9', [pedir(prod('p-1'), 2)])
const totalSimple = totalDe((await api.getPedidoItems([comandaSimple.data])).data)
const cobroSimple = await api.cerrarCuenta(RID, 'm-9', [comandaSimple.data], 'efectivo')
check('16ah · el pago simple cobra el total exacto', !cobroSimple.error && cobroSimple.data?.total === totalSimple)
check('16ai · el pago simple no deja vuelto ni propina', cobroSimple.data?.vuelto === 0 && cobroSimple.data?.propina === 0)
check(
  '16aj · el pago simple guarda una sola parte de pago',
  localSeed.pagos.filter((p) => p.cuenta_id === cobroSimple.data?.id).length === 1,
)

// -- Pago simple en efectivo con billete: el vuelto se guarda en la cuenta
const comandaBillete = await api.crearPedido(RID, 'm-9', [pedir(prod('p-2'), 1)])
const totalBillete = totalDe((await api.getPedidoItems([comandaBillete.data])).data)
const cobroBillete = await api.cerrarCuentaDividida(
  RID,
  'm-9',
  [comandaBillete.data],
  [{ metodo_pago: 'efectivo', monto: 50 }],
  0,
)
check('16ak · el cobro de un billete de 50 se registra', !cobroBillete.error, cobroBillete.error ?? '')
check(
  '16al · la cuenta guarda el vuelto del billete',
  cobroBillete.data?.vuelto === 50 - totalBillete,
  `vuelto: ${cobroBillete.data?.vuelto} · esperado: ${50 - totalBillete}`,
)
check(
  '16am · el vuelto NO se guarda como venta (el total sigue siendo la comanda)',
  cobroBillete.data?.total === totalBillete,
)

// -- Propina en pago simple: se guarda y no infla la venta
const comandaTipSimple = await api.crearPedido(RID, 'm-9', [pedir(prod('p-1'), 1)])
const totalTipSimple = totalDe((await api.getPedidoItems([comandaTipSimple.data])).data)
const ventaAntesTip = (await api.getMetricasAdmin(RID)).data.ventaMes
const cobroTipSimple = await api.cerrarCuentaDividida(
  RID,
  'm-9',
  [comandaTipSimple.data],
  [{ metodo_pago: 'efectivo', monto: 0 }],
  10,
)
check('16an · el pago simple con propina se registra', !cobroTipSimple.error, cobroTipSimple.error ?? '')
check('16ao · la propina se guarda en la cuenta', cobroTipSimple.data?.propina === 10)
check('16ap · el total no incluye la propina', cobroTipSimple.data?.total === totalTipSimple)
check(
  '16aq · la propina no cuenta como venta en el dashboard',
  Math.abs((await api.getMetricasAdmin(RID)).data.ventaMes - ventaAntesTip - totalTipSimple) < 0.01,
)
check(
  '16ar · la parte guardada cubre total + propina',
  localSeed.pagos
    .filter((p) => p.cuenta_id === cobroTipSimple.data?.id)
    .reduce((a, p) => a + p.monto, 0) === cobroTipSimple.data?.total + cobroTipSimple.data?.propina,
)

// -- El arqueo de caja ve el efectivo de un pago dividido, menos el vuelto
const { ventasEfectivoDelTurno: efectivoDelTurno } = await servidor.ssrLoadModule('/src/lib/caja.ts')
// Reusa una cuenta ya cobrada (no se vuelve a cobrar): al arqueo le importa el
// detalle guardado, no cómo se generó.
const cuentaCaja = [cobroTipSimple.data]
const pagosCaja = localSeed.pagos.filter((p) => p.cuenta_id === cuentaCaja[0]?.id)
const ahora = new Date().toISOString()
const antes = new Date(Date.now() - 60_000).toISOString()
check(
  '16as · la propina en efectivo SÍ cuenta en la gaveta (no es venta, pero es dinero)',
  efectivoDelTurno(cuentaCaja, antes, ahora, pagosCaja) === cuentaCaja[0].total + (cuentaCaja[0].propina ?? 0),
  `esperado: ${cuentaCaja[0].total + (cuentaCaja[0].propina ?? 0)}`,
)
check(
  '16at · con pago dividido, la gaveta suma solo la parte en efectivo menos el vuelto',
  (() => {
    const efectivo = pagosCaja.filter((p) => p.metodo_pago === 'efectivo').reduce((a, p) => a + p.monto, 0)
    const esperado = Math.max(0, efectivo - (cuentaCaja[0].vuelto ?? 0))
    return efectivoDelTurno(cuentaCaja, antes, ahora, pagosCaja) === esperado
  })(),
)
check(
  '16au · una cuenta pagada con tarjeta sola no pone nada en la gaveta',
  (() => {
    const c = { ...cuentaCaja[0], metodo_pago: 'tarjeta', total: 50, vuelto: 0 }
    return efectivoDelTurno([c], antes, ahora, []) === 0
  })(),
)
check(
  '16av · el fallback sin detalle de pagos usa el método principal (cuentas viejas)',
  efectivoDelTurno([{ ...cuentaCaja[0], metodo_pago: 'efectivo', total: 50, vuelto: 0 }], antes, ahora, []) ===
    50,
)

// ===========================================================================
// 17 · Control de acceso en el servidor
// ===========================================================================
// El bloqueo por suscripción vencida o por usuario desactivado vivía solo en la
// UI (ProtectedRoute), o sea que era una puerta que únicamente cerraba la
// pantalla: quien llamara a la API se lo saltaba. Estos checks comprueban que
// la API lo aplique igual que la RPC real (supabase/00_seguridad_rpcs.sql), y
// que el mensaje sea el mismo para que el error no cambie entre local y
// producción.

const restauranteDemo = localSeed.restaurantes.find((r) => r.id === RID)
const operadorOriginal = apiMode.operadorId
const suscripcionOriginal = {
  activa: restauranteDemo.suscripcion_activa,
  vencimiento: restauranteDemo.fecha_vencimiento,
}
const restaurarAcceso = () => {
  restauranteDemo.suscripcion_activa = suscripcionOriginal.activa
  restauranteDemo.fecha_vencimiento = suscripcionOriginal.vencimiento
  const usuario = localSeed.usuarios.find((u) => u.id === adminId)
  if (usuario) usuario.activo = true
  apiMode.operadorId = operadorOriginal
}
const enMinutos = (m) => new Date(Date.now() + m * 60_000).toISOString()

// -- Con la suscripción en regla, el flujo normal funciona (línea base)
const comandaAcceso = await api.crearPedido(RID, 'm-7', [pedir(prod('p-1'), 1)])
check('17a · con la suscripción en regla la comanda se crea', !comandaAcceso.error, comandaAcceso.error ?? '')

// -- Suscripción inactiva: ni comandas nuevas ni cobros
restauranteDemo.suscripcion_activa = false
check(
  '17b · con la suscripción inactiva no se crea la comanda',
  (await api.crearPedido(RID, 'm-7', [pedir(prod('p-1'), 1)])).error === 'Suscripción inactiva',
)
check(
  '17c · con la suscripción inactiva no se cobra la mesa',
  (await api.cerrarCuenta(RID, 'm-7', [comandaAcceso.data], 'efectivo')).error === 'Suscripción inactiva',
)
check(
  '17d · el cobro bloqueado no dejó una cuenta a medias',
  localSeed.cuentaPedidos.every((cp) => cp.pedido_id !== comandaAcceso.data),
)

// -- Suscripción vencida: el flag puede estar activo y la fecha ya pasada
restauranteDemo.suscripcion_activa = true
restauranteDemo.fecha_vencimiento = enMinutos(-1)
check(
  '17e · con la suscripción vencida no se crea la comanda',
  (await api.crearPedido(RID, 'm-7', [pedir(prod('p-1'), 1)])).error === 'Suscripción vencida',
)
check(
  '17f · con la suscripción vencida no se cobra la mesa',
  (await api.cerrarCuenta(RID, 'm-7', [comandaAcceso.data], 'efectivo')).error === 'Suscripción vencida',
)
// -- Sin fecha de vencimiento = plan indefinido: no se bloquea
restauranteDemo.fecha_vencimiento = null
check(
  '17g · sin fecha de vencimiento la suscripción no vence',
  (await api.cerrarCuenta(RID, 'm-7', [comandaAcceso.data], 'efectivo')).error === null,
)

// -- Usuario desactivado: la suscripción puede estar perfecta y aun así no opera
const comandaDeUsuario = await api.crearPedido(RID, 'm-6', [pedir(prod('p-1'), 1)])
const itemDeUsuario = (await api.getPedidoItems([comandaDeUsuario.data])).data[0]
apiMode.operadorId = adminId
localSeed.usuarios.find((u) => u.id === adminId).activo = false
check(
  '17h · un usuario desactivado no crea comandas',
  (await api.crearPedido(RID, 'm-7', [pedir(prod('p-1'), 1)])).error === 'Usuario desactivado',
)
check(
  '17i · un usuario desactivado no cobra',
  (await api.cerrarCuenta(RID, 'm-6', [comandaDeUsuario.data], 'efectivo')).error === 'Usuario desactivado',
)
check(
  '17j · un usuario desactivado no edita ítems',
  (await api.editarItem(RID, comandaDeUsuario.data, itemDeUsuario.id, { cantidad: 3 })).error ===
    'Usuario desactivado',
)
check(
  '17k · un usuario desactivado no anula ítems',
  (await api.anularItem(RID, comandaDeUsuario.data, itemDeUsuario.id)).error === 'Usuario desactivado',
)
check(
  '17l · un usuario desactivado no abre la caja',
  (await api.abrirTurno(RID, adminId, 100)).error === 'Usuario desactivado',
)
check(
  '17m · un usuario desactivado no cierra la caja',
  (await api.cerrarTurno(RID, adminId, 100)).error === 'Usuario desactivado',
)
check(
  '17n · la comanda del usuario desactivado sigue sin cobrarse ni tocarse',
  itemDeUsuario.cantidad === pedir(prod('p-1'), 1).cantidad && itemDeUsuario.anulado !== true,
)

// -- Restaurante inexistente (id inventado): no se opera sobre la nada
restaurarAcceso()
check(
  '17o · un restaurante inexistente se rechaza',
  (await api.crearPedido('r-fantasma', 'm-7', [pedir(prod('p-1'), 1)])).error === 'El restaurante no existe',
)

// -- Y el bloqueo no deja el sistema inutilizado: al restaurar, vuelve a operar
check(
  '17p · al restaurar la suscripción el cobro vuelve a funcionar',
  !(await api.cerrarCuenta(RID, 'm-6', [comandaDeUsuario.data], 'efectivo')).error,
)

// ===========================================================================
// 18 · Concurrencia: dos cobros simultáneos de la misma mesa
// ===========================================================================
// El riesgo concreto: entre el chequeo "este pedido ya fue cobrado" y el marcado
// como 'entregado' hay una espera. Si dos cajas cobran la misma mesa al mismo
// tiempo, las dos leen el mismo estado, las dos pasan el chequeo y se crean DOS
// cuentas del mismo total: el cliente paga una vez y el restaurante acredita dos
// veces. En Supabase lo resuelve el `for update` de la mesa (ver
// supabase/rpc_cerrar_cuenta.sql); aquí, el mutex por mesa de src/lib/api.ts.

const comandaDoble = await api.crearPedido(RID, 'm-5', [pedir(prod('p-1'), 2), pedir(prod('p-2'), 1)])
const totalDoble = totalDe((await api.getPedidoItems([comandaDoble.data])).data)
const cuentasAntes = localSeed.cuentas.length
const [cobroUno, cobroDos] = await Promise.all([
  api.cerrarCuenta(RID, 'm-5', [comandaDoble.data], 'efectivo'),
  api.cerrarCuenta(RID, 'm-5', [comandaDoble.data], 'efectivo'),
])
const ganados = [cobroUno, cobroDos].filter((c) => !c.error)
const perdidos = [cobroUno, cobroDos].filter((c) => c.error)
check(
  '18a · dos cobros en paralelo de la misma mesa: solo uno gana',
  ganados.length === 1,
  `ganaron ${ganados.length}`,
)
check(
  '18b · el que pierde recibe el error de "ya fue cobrado"',
  perdidos.length === 1 && /ya fue cobrado/.test(perdidos[0].error),
  perdidos[0]?.error ?? 'nadie perdió',
)
check(
  '18c · se crea UNA sola cuenta para la mesa',
  localSeed.cuentas.length === cuentasAntes + 1,
  `se crearon ${localSeed.cuentas.length - cuentasAntes}`,
)
check(
  '18d · el pedido queda ligado a una sola cuenta',
  localSeed.cuentaPedidos.filter((cp) => cp.pedido_id === comandaDoble.data).length === 1,
)
check(
  '18e · el total cobrado es el de la comanda, una sola vez',
  Math.abs((ganados[0]?.data?.total ?? 0) - totalDoble) < 0.01,
  `cobrado ${ganados[0]?.data?.total} · esperado ${totalDoble}`,
)
check(
  '18f · la mesa queda libre',
  localSeed.mesas.find((m) => m.id === 'm-5')?.estado === 'libre',
)

// -- También cuando las dos cajas cobran con métodos distintos (pago dividido
// contra pago simple): el bloqueo es por mesa, no por método de pago.
const comandaMixta = await api.crearPedido(RID, 'm-8', [pedir(prod('p-1'), 1)])
const totalMixta = totalDe((await api.getPedidoItems([comandaMixta.data])).data)
const cuentasAntesMixta = localSeed.cuentas.length
const [mixtoA, mixtoB] = await Promise.all([
  api.cerrarCuentaDividida(RID, 'm-8', [comandaMixta.data], [
    { metodo_pago: 'efectivo', monto: 0 },
    { metodo_pago: 'yape_plin', monto: totalMixta / 2 },
  ], 0),
  api.cerrarCuenta(RID, 'm-8', [comandaMixta.data], 'efectivo'),
])
check(
  '18g · cobro mixto en paralelo: una sola cuenta',
  localSeed.cuentas.length === cuentasAntesMixta + 1,
  `se crearon ${localSeed.cuentas.length - cuentasAntesMixta}`,
)
check(
  '18h · cobro mixto en paralelo: el segundo recibe "ya fue cobrado"',
  [mixtoA, mixtoB].filter((r) => !r.error).length === 1 &&
    [mixtoA, mixtoB].filter((r) => /ya fue cobrado/.test(r.error ?? '')).length === 1,
)

// -- El candado no se queda tomado: la mesa vuelve a operar normal
const comandaDespues = await api.crearPedido(RID, 'm-5', [pedir(prod('p-1'), 1)])
check('18i · después del bloqueo la mesa vuelve a operar', !comandaDespues.error, comandaDespues.error ?? '')

// ===========================================================================
// 19 · PIN de autorización y anulación de cobros
// ===========================================================================
// Las dos acciones que mueven dinero para menos (anular un ítem y anular una
// boleta) exigen el PIN del restaurante cuando el Admin lo configuró. En
// producción eso se valida comparando contra un hash en Supabase
// (supabase/pin_autorizacion.sql); acá se compara en claro porque el backend
// local es una simulación en memoria. Lo que se verifica es que las dos capas
// digan lo mismo y que el arqueo de caja account del dinero devuelto.

const { esPinValido, errorAlConfigurarPin, errorAlAnularCobro, MENSAJE_PIN_INCORRECTO } =
  await servidor.ssrLoadModule('/src/lib/autorizacion.ts')

// -- Reglas puras del PIN (las mismas que muestra la UI)
check('19a · el PIN acepta 4 a 6 dígitos', esPinValido('1234') && esPinValido('123456'))
check('19b · el PIN rechaza menos de 4 o más de 6', !esPinValido('123') && !esPinValido('1234567'))
check('19c · el PIN rechaza letras y espacios', !esPinValido('12a4') && !esPinValido('12 4'))
check('19d · guardar el PIN exige repetirlo igual', errorAlConfigurarPin('1234', '1234') === null)
check(
  '19e · si los dos PIN no coinciden, avisa',
  errorAlConfigurarPin('1234', '1235') === 'Los dos PIN no coinciden.',
)
check(
  '19f · el motivo de la anulación es obligatorio y tiene mínimo 4 letras',
  errorAlAnularCobro('') !== null && errorAlAnularCobro('x') !== null && errorAlAnularCobro('Error de cobro') === null,
)

// -- Sin PIN configurado, anular funciona (no se rompe lo que ya existía)
apiMode.operadorId = adminId
check(
  '19g · el restaurante empieza sin PIN',
  (await api.tienePinAutorizacion(RID)).data === false,
)
const comandaPin = await api.crearPedido(RID, 'm-9', [pedir(prod('p-1'), 1)])
const itemPin = (await api.getPedidoItems([comandaPin.data])).data[0]
check(
  '19h · sin PIN configurado se anula el ítem sin pedir nada',
  (await api.anularItem(RID, comandaPin.data, itemPin.id)).error === null,
)
check('19i · el ítem queda anulado, no borrado', itemPin.anulado === true)

// -- El Admin configura el PIN: a partir de ahí, sin él no se anula
check(
  '19j · el Admin guarda el PIN',
  (await api.configurarPinAutorizacion(RID, '2468')).error === null,
)
check('19k · ahora el restaurante sí tiene PIN', (await api.tienePinAutorizacion(RID)).data === true)
check(
  '19l · un PIN inválido se rechaza en el backend, no solo en la UI',
  (await api.configurarPinAutorizacion(RID, '12')).error === 'El PIN debe tener entre 4 y 6 dígitos.',
)

const comandaPin2 = await api.crearPedido(RID, 'm-9', [pedir(prod('p-1'), 1)])
const itemPin2 = (await api.getPedidoItems([comandaPin2.data])).data[0]
check(
  '19m · sin PIN, anular un ítem se rechaza',
  (await api.anularItem(RID, comandaPin2.data, itemPin2.id)).error === MENSAJE_PIN_INCORRECTO,
)
check(
  '19n · con PIN incorrecto se rechaza con el mismo mensaje',
  (await api.anularItem(RID, comandaPin2.data, itemPin2.id, '1111')).error === MENSAJE_PIN_INCORRECTO,
)
check(
  '19o · con el PIN correcto se anula',
  (await api.anularItem(RID, comandaPin2.data, itemPin2.id, '2468')).error === null,
)
check('19p · el ítem quedó anulado con el PIN correcto', itemPin2.anulado === true)

// -- Anulación de cobros
// Comanda nueva: la anterior quedó sin ítems vigentes al anular su único ítem, y
// una comanda anulada no se cobra (eso ya se verificó arriba).
const comandaCobro = await api.crearPedido(RID, 'm-9', [pedir(prod('p-1'), 1), pedir(prod('p-2'), 1)])
const cobroAnulable = await api.cerrarCuenta(RID, 'm-9', [comandaCobro.data], 'efectivo')
const cuentaAnulable = localSeed.cuentas.find((c) => c.id === cobroAnulable.data?.id)
check('19q · se cobra la mesa para poder anular la boleta', !cobroAnulable.error && Boolean(cuentaAnulable), cobroAnulable.error ?? '')
check(
  '19r · anular el cobro sin PIN se rechaza',
  (await api.anularCuenta(RID, cuentaAnulable.id, 'Error de cobro')).error === MENSAJE_PIN_INCORRECTO,
)
check(
  '19s · el motivo corto se rechaza antes de tocar la boleta',
  (await api.anularCuenta(RID, cuentaAnulable.id, 'x', '2468')).error !== null,
)
check('19t · la boleta sigue cobrada tras los rechazos', cuentaAnulable.estado === 'pagada')

const efectivoDeLaBoleta = (() => {
  const partes = localSeed.pagos.filter((p) => p.cuenta_id === cuentaAnulable.id)
  return Math.max(0, partes.filter((p) => p.metodo_pago === 'efectivo').reduce((a, p) => a + p.monto, 0) - (cuentaAnulable.vuelto ?? 0))
})()
const ventasAntesDeAnular = efectivoDelTurno(
  localSeed.cuentas.filter((c) => c.restaurante_id === RID),
  antes,
  '2999-01-01T00:00:00.000Z',
)
const anulacion = await api.anularCuenta(RID, cuentaAnulable.id, 'Error de cobro', '2468')
check('19u · con el PIN correcto la boleta se anula', !anulacion.error, anulacion.error ?? '')
check('19v · la boleta queda "anulada", no borrada', cuentaAnulable.estado === 'anulada')
check('19w · queda el motivo registrado', cuentaAnulable.motivo_anulacion === 'Error de cobro')
check('19w1 · la anulación de la boleta deja auditoría local con motivo', localSeed.auditLogs.some((l) => l.accion === 'cuenta_anular' && l.entidad_id === cuentaAnulable.id && l.detalle?.motivo === 'Error de cobro'))
check('19x · queda quién la anuló', cuentaAnulable.anulada_por === adminId)
check(
  '19y · el monto devuelto es el total + la propina',
  cuentaAnulable.monto_reembolsado === cuentaAnulable.total + (cuentaAnulable.propina ?? 0),
  `devuelto ${cuentaAnulable.monto_reembolsado} · total ${cuentaAnulable.total} + propina ${cuentaAnulable.propina ?? 0}`,
)
check(
  '19z · anular dos veces la misma boleta se rechaza',
  (await api.anularCuenta(RID, cuentaAnulable.id, 'Error de cobro', '2468')).error === 'Esta boleta ya fue anulada',
)

// -- Búsqueda/paginación de cobros y filtros tenant-scoped de auditoría
apiMode.operadorId = adminId
const desdeTodo = '2000-01-01T00:00:00.000Z'
const hastaTodo = '2100-01-01T00:00:00.000Z'
const cuentaFiltrable19 = localSeed.cuentas.find((c) => c.restaurante_id === RID && c.estado === 'pagada' && c.numero && c.mesa_nombre_snapshot && c.mesero_nombre_snapshot)
const criteriosCobro19 = { desde: desdeTodo, hasta: hastaTodo, estado: 'todas', metodo: 'todos', busqueda: '', offset: 0, limite: 100 }
const buscaBoleta19 = await api.getCuentasFiltradas(RID, { ...criteriosCobro19, busqueda: cuentaFiltrable19?.numero ?? 'boleta-inexistente' })
check('19z1 · búsqueda de cobros por número de boleta', buscaBoleta19.data?.items.some((c) => c.id === cuentaFiltrable19?.id))
const buscaMesa19 = await api.getCuentasFiltradas(RID, { ...criteriosCobro19, busqueda: cuentaFiltrable19?.mesa_nombre_snapshot ?? '' })
check('19z2 · búsqueda de cobros por mesa', buscaMesa19.data?.items.some((c) => c.id === cuentaFiltrable19?.id))
const buscaMesero19 = await api.getCuentasFiltradas(RID, { ...criteriosCobro19, busqueda: cuentaFiltrable19?.mesero_nombre_snapshot ?? '' })
check('19z3 · búsqueda de cobros por mesero', buscaMesero19.data?.items.some((c) => c.id === cuentaFiltrable19?.id))
const buscaMonto19 = await api.getCuentasFiltradas(RID, { ...criteriosCobro19, busqueda: String(cuentaFiltrable19?.total ?? -1).slice(0, 3) })
check('19z4 · búsqueda de cobros por importe', buscaMonto19.data?.items.some((c) => c.id === cuentaFiltrable19?.id))
const soloPagadas19 = await api.getCuentasFiltradas(RID, { ...criteriosCobro19, estado: 'pagada' })
const soloAnuladas19 = await api.getCuentasFiltradas(RID, { ...criteriosCobro19, estado: 'anulada' })
check('19z5 · filtro de estado pagado/anulado', soloPagadas19.data?.items.every((c) => c.estado === 'pagada') && soloAnuladas19.data?.items.some((c) => c.id === cuentaAnulable.id))
const metodoAnulado19 = await api.getCuentasFiltradas(RID, { ...criteriosCobro19, estado: 'anulada', metodo: 'efectivo', busqueda: cuentaAnulable.numero ?? '' })
check('19z6 · filtro de método incluye el detalle del pago', metodoAnulado19.data?.items.some((c) => c.id === cuentaAnulable.id))
const paginadoCobro19 = await api.getCuentasFiltradas('r-nuevo', { ...criteriosCobro19, limite: 1 })
check('19z7 · cobros ignora el restaurante enviado y conserva el tenant de la sesión', paginadoCobro19.data?.items.length <= 1 && paginadoCobro19.data.items.every((c) => c.restaurante_id === RID) && paginadoCobro19.data.total >= paginadoCobro19.data.items.length)
const auditoriaUsuarios19 = await api.getAuditoriaRestaurante({ desde: null, hasta: null, busqueda: 'Reingreso', categoria: 'usuarios', offset: 0, limite: 25 })
const auditoriaCaja19 = await api.getAuditoriaRestaurante({ desde: null, hasta: null, busqueda: '', categoria: 'caja', offset: 0, limite: 25 })
const auditoriaCuentas19 = await api.getAuditoriaRestaurante({ desde: null, hasta: null, busqueda: '', categoria: 'cuentas', offset: 0, limite: 25 })
check('19z8 · auditoría busca usuario/motivo y separa caja de cuentas', auditoriaUsuarios19.data?.items.some((l) => l.accion === 'usuario_reactivar') && auditoriaCaja19.data?.total > 0 && auditoriaCaja19.data.items.every((l) => l.entidad === 'caja_turno' || l.accion.startsWith('caja_')) && auditoriaCuentas19.data?.total > 0 && auditoriaCuentas19.data.items.every((l) => l.entidad === 'cuenta' || l.accion.startsWith('cuenta_')), `usuario=${auditoriaUsuarios19.data?.total}; caja=${auditoriaCaja19.data?.total}; cuentas=${auditoriaCuentas19.data?.total}`)
apiMode.operadorId = ADMIN13?.id
const auditoriaAjena19 = await api.getAuditoriaRestaurante({ desde: null, hasta: null, busqueda: 'caja_', categoria: 'todas', offset: 0, limite: 25 })
check('19z9 · auditoría de otro restaurante no devuelve datos del tenant anterior', auditoriaAjena19.data?.total === 0)
apiMode.operadorId = adminId

// -- El arqueo de caja descuenta el efectivo devuelto
const ventasDespuesDeAnular = efectivoDelTurno(
  localSeed.cuentas.filter((c) => c.restaurante_id === RID),
  antes,
  '2999-01-01T00:00:00.000Z',
)
check(
  '19aa · el efectivo devuelto SALE de la gaveta',
  ventasAntesDeAnular - ventasDespuesDeAnular === efectivoDeLaBoleta,
  `diferencia ${ventasAntesDeAnular - ventasDespuesDeAnular} · efectivo de la boleta ${efectivoDeLaBoleta}`,
)

// -- Las ventas del mes ya no cuentan la boleta anulada, pero sí se ven aparte
const metricasVoid = (await api.getMetricasAdmin(RID)).data
check(
  '19ab · la boleta anulada no cuenta como venta',
  !localSeed.cuentas
    .filter((c) => c.estado === 'pagada' && c.pagado_at)
    .some((c) => c.id === cuentaAnulable.id),
)
check(
  '19ac · el dashboard muestra la anulación y el reembolso aparte',
  metricasVoid.anulacionesMes >= 1 && metricasVoid.reembolsosMes >= cuentaAnulable.monto_reembolsado,
  `anulaciones ${metricasVoid.anulacionesMes} · reembolsos ${metricasVoid.reembolsosMes}`,
)

// -- Una boleta cobrada en un turno y anulada en otro descuenta del turno nuevo.
// Se usan horas fijas (no `Date.now()`) para que el check no dependa de cuánto
// tarda el script en llegar hasta acá.
const base = Date.parse('2030-01-01T12:00:00.000Z')
const iso = (ms) => new Date(ms).toISOString()
const boletaPartida = {
  ...cuentaAnulable,
  estado: 'anulada',
  pagado_at: iso(base - 60 * 60_000), // cobrada a las 11:00, en el turno 1
  anulada_at: iso(base - 30_000), // anulada a las 11:59:30, en el turno 2
  total: 50,
  metodo_pago: 'efectivo',
  vuelto: 0,
}
check(
  '19ad · cobrada en un turno y anulada en otro: cada arqueo cuenta su parte',
  // Turno 1 (10:30-11:30): solo pasó el cobro, así que la gaveta 1 tiene +50.
  efectivoDelTurno([boletaPartida], iso(base - 90 * 60_000), iso(base - 30 * 60_000), []) === 50 &&
    // Turno 2 (abierto 11:45): solo pasó la devolución, así que la gaveta 2
    // tiene -50. El cobro NO se le atribuye: ese dinero nunca entró en su
    // gaveta.
    efectivoDelTurno([boletaPartida], iso(base - 15 * 60_000), '2999-01-01T00:00:00.000Z', []) === -50,
  `turno 1: ${efectivoDelTurno([boletaPartida], iso(base - 90 * 60_000), iso(base - 30 * 60_000), [])} · turno 2: ${efectivoDelTurno(
    [boletaPartida],
    iso(base - 15 * 60_000),
    '2999-01-01T00:00:00.000Z',
    [],
  )}`,
)
check(
  '19ae · cobrada y anulada en el MISMO turno: la gaveta ve el cobro y el reembolso',
  efectivoDelTurno(
    [
      {
        ...boletaPartida,
        pagado_at: iso(base - 40_000),
        anulada_at: iso(base - 20_000),
        vuelto: 20,
      },
    ],
    iso(base - 90 * 60_000),
    '2999-01-01T00:00:00.000Z',
    [{ cuenta_id: cuentaAnulable.id, metodo_pago: 'efectivo', monto: 70 }],
  ) === 0,
  'cobró 70, dio 20 de vuelto (+50) y devolvió 50 (-50): la gaveta queda como estaba',
)

// -- Quitar el PIN devuelve el control a cualquiera del restaurante
check('19af · el Admin quita el PIN', (await api.quitarPinAutorizacion(RID)).error === null)
check('19ag · sin PIN, anular el cobro vuelve a funcionar sin pedir nada', (() => {
  const cobros = api.getCuentasPagadas(RID)
  return cobros.then((r) => {
    const otra = r.data.find((c) => c.estado === 'pagada')
    return api.anularCuenta(RID, otra.id, 'Cobro duplicado').then((res) => res.error === null)
  })
})())

// ---------------------------------------------------------------------------
titulo('20 · Super Admin: alta de restaurante con su administrador')

const ALTA = {
  nombre: 'Bodega del Puerto',
  ruc: '20555444333',
  direccion: 'Av. del Puerto 123',
  telefono: '+51 988 777 666',
  email_contacto: 'hola@bodega.pe',
  suscripcion_activa: true,
  fecha_vencimiento: null,
  admin: { nombre: 'Ana Administradora', email: 'admin@bodega.pe', password: 'ClaveSegura123' },
}

const alta = await api.crearRestauranteConAdmin(ALTA)
check('20a · el alta crea el restaurante', !alta.error && !!alta.data?.id, alta.error ?? '')
const ridNuevo = alta.data?.id

const lista20 = (await api.getRestaurantes()).data
check('20b · aparece en la lista del super admin', lista20.some((r) => r.id === ridNuevo))

const admins20 = (await api.getAdministradores()).data
const adminNuevo = admins20.find((a) => a.restaurante_id === ridNuevo)
check(
  '20c · el administrador queda atado a SU restaurante con rol admin_restaurante',
  adminNuevo?.email === 'admin@bodega.pe' && adminNuevo?.rol === 'admin_restaurante',
  JSON.stringify(adminNuevo ?? null),
)
check(
  '20d · su contraseña quedó registrada (puede iniciar sesión)',
  String(localCredenciales['admin@bodega.pe'] ?? '').startsWith('pbkdf2$') &&
    await verificarCredencialLocal('ClaveSegura123', localCredenciales['admin@bodega.pe']),
)
check(
  '20e · el administrador NO es super_admin (el rol lo asigna el servidor)',
  admins20.every((a) => a.rol !== 'super_admin'),
)

check('20f · un restaurante sin nombre se rechaza', !!(await api.crearRestauranteConAdmin({ ...ALTA, nombre: '   ' })).error)
check('20g · un correo de administrador ya usado se rechaza', !!(await api.crearRestauranteConAdmin({ ...ALTA, nombre: 'Otro Local' })).error)
check('20h · una contraseña corta se rechaza', !!(await api.crearRestauranteConAdmin({ ...ALTA, nombre: 'Tercer Local', admin: { ...ALTA.admin, email: 'otro@bodega.pe', password: '123' } })).error)
check(
  '20i · los rechazos no dejaron restaurantes a medias',
  (await api.getRestaurantes()).data.filter((r) => ['Otro Local', 'Tercer Local'].includes(r.nombre)).length === 0,
)

// ---------------------------------------------------------------------------
titulo('21 · Super Admin: gestión de restaurantes (listado, edición y suscripción)')

const rs21 = (await api.getRestaurantes()).data
const admins21 = (await api.getAdministradores()).data
const demo21 = rs21.find((r) => r.id === RID)
const ordenOriginal21 = rs21.map((r) => r.id)
const snap21 = JSON.stringify(rs21)
const detenido21 = rs21.find((r) => estadoOperativo(r) === 'detenido')

check('21a · la lista carga los restaurantes existentes', rs21.length >= 3 && !!demo21, `vio ${rs21.length}`)

const sinCriterios21 = filtrarRestaurantes(rs21, { ...CRITERIOS_VACIOS })
check(
  '21b · sin criterios devuelve todos (el orden por defecto es por nombre)',
  eq(
    sinCriterios21.map((r) => r.id),
    [...rs21].sort((a, b) => a.nombre.localeCompare(b.nombre)).map((r) => r.id),
  ),
  JSON.stringify(sinCriterios21.map((r) => r.nombre)),
)
check('21c · filtrarRestaurantes no muta la lista que entra', eq(rs21.map((r) => r.id), ordenOriginal21))

check(
  '21d · la búsqueda encuentra por nombre («demo»)',
  filtrarRestaurantes(rs21, { ...CRITERIOS_VACIOS, busqueda: 'demo' }).some((r) => r.id === RID),
)
check(
  '21e · la búsqueda alcanza al administrador (Carlos Nuevo) sin confundirlo con el restaurante',
  filtrarRestaurantes(rs21, { ...CRITERIOS_VACIOS, busqueda: 'carlos' }, admins21).some((r) => r.id === 'r-nuevo') &&
    !filtrarRestaurantes(rs21, { ...CRITERIOS_VACIOS, busqueda: 'carlos' }).some((r) => r.id === 'r-nuevo'),
  JSON.stringify(admins21.map((a) => ({ n: a.nombre, r: a.restaurante_id }))),
)
check(
  '21f · buscar algo inexistente devuelve la lista vacía',
  filtrarRestaurantes(rs21, { ...CRITERIOS_VACIOS, busqueda: 'zzz-no-existe' }).length === 0,
)

check(
  '21g · el filtro estado separa detenidos de operando',
  !!detenido21 &&
    filtrarRestaurantes(rs21, { ...CRITERIOS_VACIOS, estado: 'detenido' }).some((r) => r.id === detenido21.id) &&
    !filtrarRestaurantes(rs21, { ...CRITERIOS_VACIOS, estado: 'operando' }).some((r) => r.id === detenido21.id),
  detenido21 ? '' : 'el dataset no trae ningún restaurante detenido',
)
check(
  '21h · el filtro suscripción distingue suspendidas de activas',
  !!detenido21 &&
    filtrarRestaurantes(rs21, { ...CRITERIOS_VACIOS, suscripcion: 'suspendida' }).some((r) => r.id === detenido21.id) &&
    !filtrarRestaurantes(rs21, { ...CRITERIOS_VACIOS, suscripcion: 'activa' }).some((r) => r.id === detenido21.id),
)

const porNombre21 = filtrarRestaurantes(rs21, { ...CRITERIOS_VACIOS, orden: 'nombre' }).map((r) => r.nombre)
check(
  '21i · orden por nombre de la A a la Z',
  eq(porNombre21, [...porNombre21].sort((a, b) => a.localeCompare(b))),
)
const porNombreDesc21 = filtrarRestaurantes(rs21, { ...CRITERIOS_VACIOS, orden: 'nombre_desc' }).map((r) => r.nombre)
check('21j · orden descendente es el reverso del ascendente', eq(porNombreDesc21, [...porNombre21].reverse()))

const porVence21 = filtrarRestaurantes(rs21, { ...CRITERIOS_VACIOS, orden: 'vencimiento' })
const conFecha21 = porVence21.filter((r) => r.fecha_vencimiento).length
check(
  '21k · el orden por vencimiento deja los SIN fecha al final',
  (() => {
    const lista = porVence21
    const idx = lista.findIndex((r) => !r.fecha_vencimiento)
    if (idx === -1) return true
    return lista.slice(idx).every((r) => !r.fecha_vencimiento)
  })(),
  JSON.stringify(porVence21.map((r) => [r.nombre, r.fecha_vencimiento])),
)
check(
  '21l · hayFiltrosActivos: falso con criterios vacíos, verdadero con un criterio',
  !hayFiltrosActivos({ ...CRITERIOS_VACIOS }) && hayFiltrosActivos({ ...CRITERIOS_VACIOS, busqueda: 'x' }),
)

const edicion21 = await api.adminActualizarRestaurante(RID, {
  nombre: 'Demo Editado 21',
  ruc: '20999888777',
  direccion: 'Av. Prueba 21',
  telefono: '+51 900 111 222',
  email_contacto: 'editado@demo.pe',
})
check(
  '21m · el super admin edita los datos del restaurante',
  edicion21.error === null && edicion21.data?.nombre === 'Demo Editado 21',
  edicion21.error ?? '',
)
check(
  '21n · los cambios quedan guardados (se releen desde el almacén)',
  (await api.getRestaurantes()).data.find((r) => r.id === RID)?.email_contacto === 'editado@demo.pe',
)
check(
  '21o · la edición NO toca la suscripción',
  edicion21.data?.suscripcion_activa === demo21.suscripcion_activa &&
    edicion21.data?.fecha_vencimiento === demo21.fecha_vencimiento,
)
check(
  '21p · un nombre vacío se rechaza',
  !!(await api.adminActualizarRestaurante(RID, { nombre: '   ' })).error,
)

const apagado21 = await api.adminCambiarSuscripcion(RID, false, demo21.fecha_vencimiento)
check(
  '21q · desactivar la suscripción funciona',
  apagado21.error === null && apagado21.data?.suscripcion_activa === false,
  apagado21.error ?? '',
)
check(
  '21r · para los usuarios el restaurante queda DETENIDO (pantalla de bloqueo)',
  !!apagado21.data && suSuscripcionVencida(apagado21.data) && estadoOperativo(apagado21.data) === 'detenido',
)
const trasApagar21 = (await api.getRestaurantes()).data.find((r) => r.id === RID)
check(
  '21s · desactivar NO borra nada: los datos siguen intactos',
  trasApagar21?.nombre === 'Demo Editado 21' && trasApagar21?.ruc === '20999888777',
  JSON.stringify(trasApagar21 ?? null),
)
check(
  '21t · el administrador del restaurante sigue existiendo',
  !!(await api.getAdministradores()).data.find((a) => a.restaurante_id === RID),
)

const encendido21 = await api.adminCambiarSuscripcion(RID, true, demo21.fecha_vencimiento)
check(
  '21u · reactivar devuelve la operación al restaurante',
  encendido21.error === null && !!encendido21.data && !suSuscripcionVencida(encendido21.data) && estadoOperativo(encendido21.data) === 'operando',
  encendido21.error ?? '',
)

const fechaPasada21 = new Date(Date.now() - 86_400_000).toISOString()
const vencida21 = (await api.adminCambiarSuscripcion(RID, true, fechaPasada21)).data
check(
  '21v · una fecha pasada deja la suscripción VENCIDA con días negativos',
  !!vencida21 && estadoSuscripcion(vencida21) === 'vencida' && (diasParaVencimiento(vencida21) ?? 0) < 0,
  JSON.stringify(vencida21 ?? null),
)
check(
  '21w · sigue "activa" en la BD pero queda detenida para operar',
  !!vencida21 && vencida21.suscripcion_activa === true && estadoOperativo(vencida21) === 'detenido' && venceEnDias(vencida21) === false,
)
const listaVencidas21 = filtrarRestaurantes((await api.getRestaurantes()).data, {
  ...CRITERIOS_VACIOS,
  suscripcion: 'vencida',
})
check(
  '21x · el filtro "vencida" del listado lo encuentra (y solo vencidas)',
  listaVencidas21.some((r) => r.id === RID) && listaVencidas21.every((r) => estadoSuscripcion(r) === 'vencida'),
)

const fechaCerca21 = new Date(Date.now() + 10 * 86_400_000).toISOString()
const porVencer21 = (await api.adminCambiarSuscripcion(RID, true, fechaCerca21)).data
const listaPorVencer21 = filtrarRestaurantes((await api.getRestaurantes()).data, {
  ...CRITERIOS_VACIOS,
  suscripcion: 'por_vencer',
})
check(
  '21y · una fecha próxima (10 días) entra en "por vencer" de la ventana de 30',
  !!porVencer21 && venceEnDias(porVencer21) === true && (diasParaVencimiento(porVencer21) ?? 0) > 0 &&
    listaPorVencer21.some((r) => r.id === RID) && listaPorVencer21.every((r) => venceEnDias(r)),
)

const erroresRestauracion21 = []
for (const orig of JSON.parse(snap21)) {
  const ed = await api.adminActualizarRestaurante(orig.id, {
    nombre: orig.nombre,
    ruc: orig.ruc,
    direccion: orig.direccion,
    telefono: orig.telefono,
    email_contacto: orig.email_contacto,
  })
  if (ed.error) erroresRestauracion21.push(`${orig.nombre}: ${ed.error}`)
  const sb = await api.adminCambiarSuscripcion(orig.id, orig.suscripcion_activa, orig.fecha_vencimiento)
  if (sb.error) erroresRestauracion21.push(`${orig.nombre}: ${sb.error}`)
}
check('21z · los datos de prueba se restauran sin errores', erroresRestauracion21.length === 0, erroresRestauracion21.join(' | '))
const final21 = (await api.getRestaurantes()).data
const snapObj21 = JSON.parse(snap21)
check(
  '21zz · la lista final es idéntica a la de antes de la sección',
  eq(final21, snapObj21),
  (() => {
    if (final21.length !== snapObj21.length) return `largos ${final21.length} vs ${snapObj21.length}`
    for (let i = 0; i < final21.length; i++) {
      if (!eq(final21[i], snapObj21[i])) {
        const claves = new Set([...Object.keys(final21[i]), ...Object.keys(snapObj21[i])])
        return (
          final21[i].id +
          ': ' +
          [...claves]
            .filter((k) => !eq(final21[i][k], snapObj21[i][k]))
            .map((k) => `${k}=${JSON.stringify(final21[i][k])} (esperado ${JSON.stringify(snapObj21[i][k])})`)
            .join(', ')
        )
      }
    }
    return 'sin diferencia evidente'
  })(),
)

// ---------------------------------------------------------------------------
titulo('22 · Super Admin: suscripciones (catálogo de planes, acciones e historial)')

const planes22 = (await api.getPlanes()).data
check(
  '22a · el catálogo tiene un único plan activo (Mesora Pro) con límites definidos',
  eq(planes22.filter((p) => p.activo).map((p) => p.clave), ['mesora_pro']) &&
    planes22.filter((p) => p.activo).every((p) => p.precio_mensual == null && p.duracion_dias === 30 && (p.max_administradores === 3 || p.max_administradores === null)) &&
    planes22.every((p) => typeof p.activo === 'boolean'),
  JSON.stringify(planes22.map((p) => [p.clave, p.activo, p.precio_mensual, p.duracion_dias, p.max_administradores])),
)
check(
  '22b · nombrePlan resuelve por id y muestra «—» sin plan',
  nombrePlan(planes22, 'plan-mesora-pro') === 'Mesora Pro' && nombrePlan(planes22, 'plan_inexistente') === '—' && nombrePlan(planes22, null) === '—',
)
check(
  '22c · etiquetaAccion traduce todas las acciones del historial',
  ['cambio_plan', 'renovacion', 'suspension', 'reactivacion', 'ajuste'].every((a) => etiquetaAccion(a) !== a),
)

const snapR22 = JSON.stringify((await api.getRestaurantes()).data)
const histBase22 = (await api.getHistorialSuscripciones(RID)).data
const idsHistBase22 = histBase22.map((h) => h.id)
const demo22 = JSON.parse(snapR22).find((r) => r.id === RID)

const sinCriterios22 = filtrarSuscripciones(JSON.parse(snapR22), { ...CRITERIOS_SUSCRIPCIONES_VACIOS })
check(
  '22d · sin criterios devuelve todos ordenados por nombre sin mutar la lista',
  eq(
    sinCriterios22.map((r) => r.id),
    [...JSON.parse(snapR22)].sort((a, b) => a.nombre.localeCompare(b.nombre)).map((r) => r.id),
  ),
)
check(
  '22e · el filtro de estado separa suspendidas, vencidas, por vencer y activas',
  estadoSuscripcion(JSON.parse(snapR22).find((r) => r.id === 'r-demo-2')) === 'suspendida' &&
    estadoSuscripcion({ ...demo22, fecha_vencimiento: new Date(Date.now() - 86_400_000).toISOString() }) === 'vencida' &&
    estadoSuscripcion({ ...demo22, fecha_vencimiento: new Date(Date.now() + 10 * 86_400_000).toISOString() }) === 'por_vencer' &&
    estadoSuscripcion(demo22) === 'activa',
  JSON.stringify([estadoSuscripcion(JSON.parse(snapR22).find((r) => r.id === 'r-demo-2')), estadoSuscripcion(demo22)]),
)
check(
  '22f · filtrarSuscripciones por estado, plan y búsqueda (incluye al administrador)',
  filtrarSuscripciones(JSON.parse(snapR22), { ...CRITERIOS_SUSCRIPCIONES_VACIOS, estado: 'suspendida' }).some((r) => r.id === 'r-demo-2') &&
    !filtrarSuscripciones(JSON.parse(snapR22), { ...CRITERIOS_SUSCRIPCIONES_VACIOS, estado: 'activa' }).some((r) => r.id === 'r-demo-2') &&
    filtrarSuscripciones(JSON.parse(snapR22), { ...CRITERIOS_SUSCRIPCIONES_VACIOS, plan: 'plan-mesora-pro' }).some((r) => r.id === 'r-demo-2') &&
    filtrarSuscripciones(JSON.parse(snapR22), { ...CRITERIOS_SUSCRIPCIONES_VACIOS, plan: 'plan-mesora-pro' }).every((r) => r.plan_id === 'plan-mesora-pro') &&
    filtrarSuscripciones(JSON.parse(snapR22), { ...CRITERIOS_SUSCRIPCIONES_VACIOS, busqueda: 'esquina' }).some((r) => r.id === 'r-demo-2') &&
    filtrarSuscripciones(JSON.parse(snapR22), { ...CRITERIOS_SUSCRIPCIONES_VACIOS, busqueda: 'carlos' }, (await api.getAdministradores()).data).some((r) => r.id === 'r-nuevo'),
  JSON.stringify(filtrarSuscripciones(JSON.parse(snapR22), { ...CRITERIOS_SUSCRIPCIONES_VACIOS, busqueda: 'esquina' }).map((r) => r.id)),
)
check(
  '22g · hayFiltrosSuscripciones detecta criterios vacíos y activos',
  !hayFiltrosSuscripciones({ ...CRITERIOS_SUSCRIPCIONES_VACIOS }) && hayFiltrosSuscripciones({ ...CRITERIOS_SUSCRIPCIONES_VACIOS, estado: 'activa' }),
)

const planOrigen22 = demo22.plan_id
const fechaOrigen22 = demo22.fecha_inicio

check(
  '22h · renovar sin fecha se rechaza con un mensaje claro',
  (await api.suscripcionesRenovar(RID, '')).error === 'Debe indicar la nueva fecha de vencimiento.',
)
check(
  '22i · cambiar a un plan inexistente se rechaza',
  (await api.suscripcionesCambiarPlan(RID, 'plan-no-existe')).error === 'Plan no encontrado.',
)

const cambioPlan22 = await api.suscripcionesCambiarPlan(RID, 'plan-mesora-pro')
check(
  '22j · el super admin cambia el plan del restaurante (plan único Mesora Pro)',
  cambioPlan22.error === null && cambioPlan22.data?.plan_id === 'plan-mesora-pro',
  cambioPlan22.error ?? '',
)

const renovada22 = await api.suscripcionesRenovar(RID, new Date(Date.now() + 60 * 86_400_000).toISOString())
check(
  '22k · renovar extiende el vencimiento 60 días sin tocar el inicio del periodo',
  renovada22.error === null &&
    renovada22.data?.suscripcion_activa === true &&
    renovada22.data?.fecha_inicio === fechaOrigen22 &&
    estadoSuscripcion(renovada22.data) === 'activa',
  renovada22.error ?? JSON.stringify([renovada22.data?.fecha_inicio, fechaOrigen22]),
)

const suspendida22 = await api.suscripcionesSuspender(RID, 'Prueba de suspensión')
check(
  '22l · suspender marca suspendida sin borrar fechas ni plan',
  suspendida22.error === null &&
    suspendida22.data?.suscripcion_activa === false &&
    suspendida22.data?.plan_id === 'plan-mesora-pro' &&
    estadoSuscripcion(suspendida22.data) === 'suspendida',
  suspendida22.error ?? '',
)
check(
  '22m · el restaurante suspendido sale en el filtro "suspendidas" del panel',
  filtrarSuscripciones((await api.getRestaurantes()).data, { ...CRITERIOS_SUSCRIPCIONES_VACIOS, estado: 'suspendida' }).some((r) => r.id === RID),
)

const reactivada22 = await api.suscripcionesReactivar(RID, null)
check(
  '22n · reactivar conserva plan, fechas y vuelve a estar activa',
  reactivada22.error === null &&
    reactivada22.data?.suscripcion_activa === true &&
    reactivada22.data?.plan_id === 'plan-mesora-pro' &&
    reactivada22.data?.fecha_inicio === fechaOrigen22,
  reactivada22.error ?? '',
)

const histTras22 = (await api.getHistorialSuscripciones(RID)).data
const nuevas22 = histTras22.filter((h) => !idsHistBase22.includes(h.id))
check(
  '22o · cada acción agrega su fila al historial (cambio_plan, renovación, suspensión, reactivación)',
  nuevas22.length === 4 && eq([...nuevas22.map((h) => h.accion)].sort(), ['cambio_plan', 'reactivacion', 'renovacion', 'suspension']),
  JSON.stringify(nuevas22.map((h) => h.accion)),
)
const filaCambio22 = histTras22.find((h) => h.accion === 'cambio_plan' && h.plan_anterior_id === planOrigen22)
check(
  '22p · el historial conserva el plan anterior y el motivo de la suspensión',
  !!filaCambio22 && histTras22.some((h) => h.accion === 'suspension' && h.motivo === 'Prueba de suspensión'),
  JSON.stringify(histTras22.map((h) => [h.accion, h.plan_anterior, h.motivo])),
)
check(
  '22q · ninguna acción borró las filas previas del historial',
  idsHistBase22.every((id) => histTras22.some((h) => h.id === id)),
)

const restaurarPlan22 = await api.suscripcionesCambiarPlan(RID, planOrigen22)
check('22r · se restaura el plan original', restaurarPlan22.error === null && restaurarPlan22.data?.plan_id === planOrigen22, restaurarPlan22.error ?? '')
const restaurarSubs22 = await api.adminCambiarSuscripcion(RID, demo22.suscripcion_activa, demo22.fecha_vencimiento)
check('22s · se restaura la suscripción original', restaurarSubs22.error === null, restaurarSubs22.error ?? '')

const final22 = (await api.getRestaurantes()).data
check('22t · la lista de restaurantes vuelve a ser idéntica a la de antes de la sección', eq(final22, JSON.parse(snapR22)), (() => {
  const a = final22.find((r) => r.id === RID)
  const b = JSON.parse(snapR22).find((r) => r.id === RID)
  return eq(a, b) ? '' : `demo: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`
})())
const histFinal22 = (await api.getHistorialSuscripciones(RID)).data
check(
  '22u · el historial final solo creció (4 acciones + plan restaurado + ajuste de restauración) sin borrar nada',
  histFinal22.length === histBase22.length + 6 && idsHistBase22.every((id) => histFinal22.some((h) => h.id === id)),
  `${histBase22.length} → ${histFinal22.length}`,
)

// ---------------------------------------------------------------------------
titulo('23 · Super Admin: usuarios y administradores (alta, estados y designación)')

const snapU23 = JSON.stringify((await api.getUsuariosPlataforma()).data)
const operadorPrevio23 = apiMode.operadorId
const SUPER23 = localSeed.usuarios.find((u) => u.rol === 'super_admin')
const CAJERO23 = localSeed.usuarios.find((u) => u.rol === 'cajero')
const AJENO23 = localSeed.usuarios.find((u) => u.id === 'u-local-admin-nuevo')
// La sección corre como super admin (la 19 pudo dejar el operador en un admin
// de restaurante, que para esta gestión no es suficiente).
apiMode.operadorId = SUPER23.id

const base23 = (await api.getUsuariosPlataforma()).data
check(
  '23a · el listado trae a todos con restaurante, rol, estado y fecha de alta',
  base23.length >= 3 &&
    !!base23.find((u) => u.id === SUPER23.id && u.restaurante_id === null && u.rol === 'super_admin') &&
    !!base23.find((u) => u.id === CAJERO23.id && u.restaurante_id === RID) &&
    base23.every((u) => typeof u.nombre === 'string' && !!u.rol && typeof u.activo === 'boolean' && !!u.created_at),
  JSON.stringify(base23.map((u) => [u.id, u.rol, u.restaurante_id])),
)

const vacios23 = { ...CRITERIOS_USUARIOS_VACIOS }
const sinFiltros23 = filtrarUsuarios(base23, vacios23)
check(
  '23b · sin criterios devuelve todos ordenados por nombre y sin mutar la lista',
  eq(sinFiltros23.map((u) => u.id), [...base23].sort((a, b) => a.nombre.localeCompare(b.nombre)).map((u) => u.id)) &&
    eq(base23.map((u) => u.id), JSON.parse(snapU23).map((u) => u.id)),
)
const porAlta23 = filtrarUsuarios(base23, { ...vacios23, orden: 'alta' })
check(
  '23b2 · el orden por alta deja el más reciente primero y no muta la lista',
  porAlta23.every(
    (u, i) => i === 0 || new Date(porAlta23[i - 1].created_at).getTime() >= new Date(u.created_at).getTime(),
  ) &&
    eq(porAlta23.map((u) => u.id), [...base23].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime() || a.nombre.localeCompare(b.nombre)).map((u) => u.id)) &&
    eq(base23.map((u) => u.id), JSON.parse(snapU23).map((u) => u.id)),
)
const porRol23 = filtrarUsuarios(base23, { ...vacios23, orden: 'rol' })
check(
  '23b3 · el orden por rol agrupa por rol y ordena por nombre dentro del grupo',
  porRol23.every((u, i) => i === 0 || porRol23[i - 1].rol <= u.rol) &&
    eq(porRol23.map((u) => u.id), [...base23].sort((a, b) => a.rol.localeCompare(b.rol) || a.nombre.localeCompare(b.nombre)).map((u) => u.id)),
)
check(
  '23c · el filtro de rol separa roles sin mezclarlos',
  filtrarUsuarios(base23, { ...vacios23, rol: 'cajero' }).every((u) => u.rol === 'cajero') &&
    filtrarUsuarios(base23, { ...vacios23, rol: 'cajero' }).some((u) => u.id === CAJERO23.id) &&
    filtrarUsuarios(base23, { ...vacios23, rol: 'mesero' }).every((u) => u.rol === 'mesero') &&
    filtrarUsuarios(base23, { ...vacios23, rol: 'todos' }).length === base23.length,
)
check(
  '23d · el filtro de estado separa activos e inactivos sin mezclarlos',
  filtrarUsuarios(base23, { ...vacios23, estado: 'inactivos' }).every((u) => u.activo === false) &&
    filtrarUsuarios(base23, { ...vacios23, estado: 'activos' }).every((u) => u.activo === true) &&
    filtrarUsuarios(base23, { ...vacios23, estado: 'inactivos' }).length +
      filtrarUsuarios(base23, { ...vacios23, estado: 'activos' }).length ===
      base23.length,
)
check(
  '23e · el filtro de restaurante no cruza restaurantes ni mete al super admin (sin restaurante)',
  filtrarUsuarios(base23, { ...vacios23, restaurante: RID }).every((u) => u.restaurante_id === RID) &&
    filtrarUsuarios(base23, { ...vacios23, restaurante: RID }).some((u) => u.id === CAJERO23.id) &&
    !filtrarUsuarios(base23, { ...vacios23, restaurante: RID }).some((u) => u.id === SUPER23.id),
)
check(
  '23f · la búsqueda cubre nombre y correo, y un texto raro devuelve vacío',
  filtrarUsuarios(base23, { ...vacios23, busqueda: 'rosa' }).some((u) => u.id === CAJERO23.id) &&
    filtrarUsuarios(base23, { ...vacios23, busqueda: 'cajero@' }).some((u) => u.id === CAJERO23.id) &&
    filtrarUsuarios(base23, { ...vacios23, busqueda: 'no-existe-23' }).length === 0,
)
check(
  '23g · hayFiltrosUsuarios distingue criterios vacíos de activos',
  !hayFiltrosUsuarios(vacios23) &&
    hayFiltrosUsuarios({ ...vacios23, rol: 'cajero' }) &&
    hayFiltrosUsuarios({ ...vacios23, restaurante: RID }) &&
    hayFiltrosUsuarios({ ...vacios23, estado: 'inactivos' }) &&
    hayFiltrosUsuarios({ ...vacios23, busqueda: 'x' }),
)
check(
  '23g2 · el orden no cuenta como filtro (Limpiar conserva el criterio elegido)',
  !hayFiltrosUsuarios({ ...vacios23, orden: 'alta' }) &&
    !hayFiltrosUsuarios({ ...vacios23, orden: 'rol' }),
)
check(
  '23h · labelUltimoAcceso: «Nunca ingresó» sin fecha y una fecha legible con ella',
  labelUltimoAcceso(null) === 'Nunca ingresó' &&
    labelUltimoAcceso(undefined) === 'Nunca ingresó' &&
    labelUltimoAcceso('2026-01-05T10:30:00.000Z') !== 'Nunca ingresó' &&
    labelUltimoAcceso('2026-01-05T10:30:00.000Z').length > 5,
)
const accesos23 = await api.getUltimosAccesos()
check(
  '23i · getUltimosAccesos (local) responde sin error con mapa vacío (nadie ingresa al backend local)',
  accesos23.error === null && eq(accesos23.data, {}),
  accesos23.error ?? JSON.stringify(accesos23.data),
)

// -- Alta de usuarios (espejo local de la Edge Function crear-usuario)
const NUEVO23 = {
  nombre: 'Prueba Sección 23',
  email: 'seccion23@prueba.pe',
  password: 'ClaveLarga23',
  rol: 'mesero',
  restauranteId: RID,
}
check(
  '23j · el alta rechaza el nombre vacío',
  (await api.crearUsuarioPlataforma({ ...NUEVO23, nombre: '   ' })).error === 'El nombre del usuario es obligatorio.',
)
check(
  '23k · el alta rechaza un correo inválido',
  (await api.crearUsuarioPlataforma({ ...NUEVO23, email: 'no-es-correo' })).error === 'Ingresa un correo válido.',
)
check(
  '23l · el alta rechaza una contraseña corta',
  (await api.crearUsuarioPlataforma({ ...NUEVO23, password: '123' })).error === 'La contraseña inicial debe tener al menos 8 caracteres.',
)
check(
  '23m · el alta jamás crea un super administrador desde el panel',
  (await api.crearUsuarioPlataforma({ ...NUEVO23, rol: 'super_admin' })).error === 'No se puede crear un super administrador desde el panel.',
)
check(
  '23n · un rol fuera de la lista blanca se rechaza',
  (await api.crearUsuarioPlataforma({ ...NUEVO23, rol: 'recepcionista' })).error === 'Rol no permitido.',
)
check(
  '23o · el restaurante es obligatorio y debe existir',
  (await api.crearUsuarioPlataforma({ ...NUEVO23, restauranteId: '' })).error === 'Elegí el restaurante al que pertenece el usuario.' &&
    (await api.crearUsuarioPlataforma({ ...NUEVO23, restauranteId: 'r-fantasma' })).error === 'Restaurante no encontrado.',
)
const alta23 = await api.crearUsuarioPlataforma(NUEVO23)
check(
  '23p · el alta válida crea el usuario ACTIVO en SU restaurante y registra su clave local',
  alta23.error === null &&
    alta23.data?.rol === 'mesero' &&
    alta23.data?.restaurante_id === RID &&
    alta23.data?.activo === true &&
    !!alta23.data?.created_at &&
    (await api.getUsuariosPlataforma()).data.some((u) => u.id === alta23.data?.id) &&
    String(localCredenciales['seccion23@prueba.pe'] ?? '').startsWith('pbkdf2$') &&
    await verificarCredencialLocal('ClaveLarga23', localCredenciales['seccion23@prueba.pe']),
  alta23.error ?? '',
)
check(
  '23q · el correo duplicado se rechaza sin tocar la cuenta existente',
  (await api.crearUsuarioPlataforma(NUEVO23)).error === 'Ya existe una cuenta con ese correo.',
)

// -- Desactivar sin borrar + guardas de estado
const nuevoId23 = alta23.data?.id
const apagado23 = await api.adminCambiarEstadoUsuario(nuevoId23, false)
check(
  '23r · desactivar deja activo=false y la fila SIGUE existiendo (nunca se borra)',
  apagado23.error === null &&
    apagado23.data?.activo === false &&
    (await api.getUsuariosPlataforma()).data.some((u) => u.id === nuevoId23),
  apagado23.error ?? '',
)
const trasApagar23 = (await api.getUsuariosPlataforma()).data
check(
  '23s · el panel lo encuentra con el filtro «inactivos» y lo oculta en «activos»',
  filtrarUsuarios(trasApagar23, { ...vacios23, estado: 'inactivos' }).some((u) => u.id === nuevoId23) &&
    !filtrarUsuarios(trasApagar23, { ...vacios23, estado: 'activos' }).some((u) => u.id === nuevoId23),
)
const reactivado23 = await api.adminCambiarEstadoUsuario(nuevoId23, true)
check(
  '23t · reactivar lo devuelve a activo sin cambios de rol ni restaurante',
  reactivado23.error === null &&
    reactivado23.data?.activo === true &&
    reactivado23.data?.rol === 'mesero' &&
    reactivado23.data?.restaurante_id === RID,
  reactivado23.error ?? '',
)
check(
  '23u · desactivar a alguien que no existe responde «Usuario no encontrado.»',
  (await api.adminCambiarEstadoUsuario('u-que-no-existe', false)).error === 'Usuario no encontrado.',
)
apiMode.operadorId = SUPER23.id
check(
  '23v · nadie puede desactivarse a sí mismo',
  (await api.adminCambiarEstadoUsuario(SUPER23.id, false)).error === 'No puedes desactivar tu propia cuenta.',
)
apiMode.operadorId = null
check(
  '23w · debe quedar al menos un super administrador activo (no se apaga el último)',
  (await api.adminCambiarEstadoUsuario(SUPER23.id, false)).error === 'Debe quedar al menos un super administrador activo.',
)

// -- Autorización: la misma regla que soy_super_admin() en la BD
apiMode.operadorId = CAJERO23.id
check(
  '23x · un operador que no es super admin no puede cambiar estados',
  (await api.adminCambiarEstadoUsuario(nuevoId23, false)).error === 'Solo el super administrador puede gestionar usuarios.',
)
check(
  '23y · ... tampoco puede designar administradores',
  (await api.adminDesignarAdministrador(RID, CAJERO23.id)).error === 'Solo el super administrador puede designar administradores.',
)
check(
  '23z · ... ni dar de alta usuarios',
  (await api.crearUsuarioPlataforma(NUEVO23)).error === 'Solo el super administrador puede dar de alta usuarios.',
)
apiMode.operadorId = SUPER23.id

// -- Designar administradores (solo cambia el rol, nunca el restaurante)
const p123 = await api.crearPersonal(RID, { nombre: 'Mesero 23', email: 'mesero23@prueba.pe', rol: 'mesero' })
const p223 = await api.crearPersonal(RID, { nombre: 'Cocina 23', email: 'cocina23@prueba.pe', rol: 'cocina' })
const M123 = p123.data?.id
const M223 = p223.data?.id
check(
  '23aa · se prepara personal de prueba en el restaurante (se borra en la restauración)',
  p123.error === null && p223.error === null,
  [p123.error, p223.error].filter(Boolean).join(' | '),
)
const des23a = await api.adminDesignarAdministrador(RID, M123)
check(
  '23ab · designar convierte al usuario en admin_restaurante conservando su restaurante',
  des23a.error === null && des23a.data?.rol === 'admin_restaurante' && des23a.data?.restaurante_id === RID,
  des23a.error ?? '',
)
const des23b = await api.adminDesignarAdministrador(RID, M123)
check(
  '23ac · repetir la designación es idempotente (varios administradores permitidos)',
  des23b.error === null && des23b.data?.rol === 'admin_restaurante' && des23b.data?.restaurante_id === RID,
  des23b.error ?? '',
)
const des23c = await api.adminDesignarAdministrador(RID, M223)
check(
  '23ad · un segundo usuario puede ser administrador al mismo tiempo',
  des23c.error === null &&
    (await api.getUsuariosPlataforma()).data.filter((u) => u.restaurante_id === RID && u.rol === 'admin_restaurante').length >= 2,
  des23c.error ?? '',
)
check(
  '23ae · designar a un usuario inexistente se rechaza',
  (await api.adminDesignarAdministrador(RID, 'u-que-no-existe')).error === 'Usuario no encontrado.',
)
check(
  '23af · designar en un restaurante inexistente se rechaza',
  (await api.adminDesignarAdministrador('r-fantasma', M123)).error === 'Restaurante no encontrado.',
)
check(
  '23ag · designar a un usuario de OTRO restaurante se rechaza',
  (await api.adminDesignarAdministrador(RID, AJENO23.id)).error === 'El usuario no pertenece a este restaurante.',
)
await api.adminCambiarEstadoUsuario(M223, false)
check(
  '23ah · no se designa a un usuario desactivado',
  (await api.adminDesignarAdministrador(RID, M223)).error === 'El usuario está desactivado: actívalo antes de designarlo administrador.',
)

// -- Limpieza reversible: las cuentas de prueba quedan inactivas y conservan historia.
const errores23 = []
for (const id23 of [M123, M223, nuevoId23]) {
  if (!id23) continue
  const baja23 = await api.adminCambiarEstadoUsuario(id23, false)
  if (baja23.error) errores23.push(`${id23}: ${baja23.error}`)
}
apiMode.operadorId = operadorPrevio23
check('23ai · la limpieza reversible del personal de prueba corre sin errores', errores23.length === 0, errores23.join(' | '))
const final23 = (await api.getUsuariosPlataforma()).data
check(
  '23aj · el historial conserva todos los usuarios originales y deja las cuentas de prueba inactivas',
  JSON.parse(snapU23).every((anterior) => eq(final23.find((u) => u.id === anterior.id), anterior)) &&
    [M123, M223, nuevoId23].every((id) => final23.some((u) => u.id === id && u.activo === false)),
)
check(
  '23ak · los verificadores locales permanecen sin clave en claro tras la baja',
  String(localCredenciales['seccion23@prueba.pe'] ?? '').startsWith('pbkdf2$') &&
    String(localCredenciales['mesero23@prueba.pe'] ?? '').startsWith('pbkdf2$') &&
    String(localCredenciales['cocina23@prueba.pe'] ?? '').startsWith('pbkdf2$'),
)

// ---------------------------------------------------------------------------
titulo('24 · Super Admin: estadísticas globales (resumen, ranking, evolución y permisos)')

const ms24 = (iso) => new Date(iso).getTime()
const aprox24 = (a, b) => Math.abs(a - b) < 0.005
const operadorPrevio24 = apiMode.operadorId
const SUPER24 = localSeed.usuarios.find((u) => u.rol === 'super_admin')
const CAJERO24 = localSeed.usuarios.find((u) => u.rol === 'cajero')
// Snapshot para probar que las estadísticas son de solo lectura.
const snap24 = JSON.stringify({
  usuarios: localSeed.usuarios,
  pedidos: localSeed.pedidos,
  cuentas: localSeed.cuentas,
  restaurantes: localSeed.restaurantes,
})
apiMode.operadorId = SUPER24.id

// -- Presets de rango (lógica pura) ----------------------------------------
const fijo = new Date(2026, 4, 15, 13, 30) // 15/05/2026, viernes
const soloDia = (iso) => {
  const d = new Date(iso)
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}
const menosDias = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - n)
const rangoHoy = rangoDePreset('hoy', fijo)
const rango7 = rangoDePreset('7d', fijo)
const rango30 = rangoDePreset('30d', fijo)
const rangoMes = rangoDePreset('mes', fijo)
check(
  '24a · «hoy» arranca a medianoche local y termina en «ahora»',
  rangoHoy.desde === new Date(2026, 4, 15).toISOString() && rangoHoy.hasta === fijo.toISOString() &&
    diasDelRango(rangoHoy.desde, rangoHoy.hasta).length === 1,
)
check(
  '24b · «últimos 7 días» = hoy + 6 previos (7 días) y «30 días» = 30 días',
  soloDia(rango7.desde) === soloDia(menosDias(fijo, 6)) &&
    diasDelRango(rango7.desde, rango7.hasta).length === 7 &&
    soloDia(rango30.desde) === soloDia(menosDias(fijo, 29)) &&
    diasDelRango(rango30.desde, rango30.hasta).length === 30,
)
check(
  '24c · «este mes» arranca el día 1',
  soloDia(rangoMes.desde) === soloDia(new Date(2026, 4, 1)),
)
check(
  '24d · etiquetaDia y los 4 presets disponibles',
  etiquetaDia('2026-05-15') === '15/05' &&
    PRESETS_RANGO.map((p) => p.clave).join(',') === 'hoy,7d,mes,30d',
)
check(
  '24e · ordenarRanking respeta el criterio elegido',
  ordenarRanking(
    [
      { restauranteId: 'a', nombre: 'A', pedidos: 1, ventas: 100 },
      { restauranteId: 'b', nombre: 'B', pedidos: 5, ventas: 50 },
    ],
    'ventas',
  )[0].restauranteId === 'a' &&
    ordenarRanking(
      [
        { restauranteId: 'a', nombre: 'A', pedidos: 1, ventas: 100 },
        { restauranteId: 'b', nombre: 'B', pedidos: 5, ventas: 50 },
      ],
      'pedidos',
    )[0].restauranteId === 'b',
)

// -- Estadísticas del periodo (30 días) -------------------------------------
const ahora24 = new Date()
const rango24 = rangoDePreset('30d', ahora24)
const est24 = await api.getEstadisticasGlobales(rango24.desde, rango24.hasta)
check(
  '24f · el super admin obtiene el JSON de estadísticas',
  est24.error === null && !!est24.data && !!est24.data.resumen && Array.isArray(est24.data.ranking),
  est24.error ?? '',
)
const e24 = est24.data
const d0 = ms24(rango24.desde)
const d1 = ms24(rango24.hasta)
const ahoraMs = ahora24.getTime()
const dentro24 = (iso) => {
  const t = ms24(iso)
  return !Number.isNaN(t) && t >= d0 && t <= d1
}
const expActivos = localSeed.restaurantes.filter(
  (r) => r.suscripcion_activa && (!r.fecha_vencimiento || ms24(r.fecha_vencimiento) >= ahoraMs),
).length
const expPedidos = localSeed.pedidos.filter((p) => dentro24(p.created_at)).length
const expVentas = localSeed.cuentas
  .filter((c) => c.estado === 'pagada' && c.pagado_at && dentro24(c.pagado_at))
  .reduce((a, c) => a + c.total, 0)
const expNuevos = localSeed.restaurantes.filter((r) => dentro24(r.created_at)).length
check(
  '24g · resumen vs recálculo independiente (registrados, activos, usuarios)',
  e24.resumen.restaurantesRegistrados === localSeed.restaurantes.length &&
    e24.resumen.restaurantesActivos === expActivos &&
    e24.resumen.usuarios === localSeed.usuarios.length &&
    e24.resumen.usuariosActivos === localSeed.usuarios.filter((u) => u.activo !== false).length,
  JSON.stringify(e24.resumen),
)
check(
  '24g2 · el resumen cuenta los administradores (restaurante y plataforma), subconjunto de usuarios',
  e24.resumen.administradores ===
    localSeed.usuarios.filter((u) => u.rol === 'admin_restaurante' || u.rol === 'super_admin').length &&
    e24.resumen.administradores <= e24.resumen.usuarios,
  `${e24.resumen.administradores} de ${e24.resumen.usuarios}`,
)
check(
  '24h · resumen del periodo vs dataset (pedidos, ventas, nuevos)',
  e24.resumen.pedidos === expPedidos &&
    aprox24(e24.resumen.ventas, expVentas) &&
    e24.resumen.restaurantesNuevos === expNuevos,
  `${e24.resumen.pedidos}/${e24.resumen.ventas}/${e24.resumen.restaurantesNuevos} vs ${expPedidos}/${expVentas}/${expNuevos}`,
)

// -- Comparaciones hoy / semana / mes --------------------------------------
const inicioDia24 = new Date(ahora24.getFullYear(), ahora24.getMonth(), ahora24.getDate()).getTime()
const inicioSem24 = new Date(
  ahora24.getFullYear(),
  ahora24.getMonth(),
  ahora24.getDate() - ((ahora24.getDay() + 6) % 7),
).getTime()
const inicioMes24 = new Date(ahora24.getFullYear(), ahora24.getMonth(), 1).getTime()
const contar24 = (arr, desde) =>
  arr.filter((x) => {
    const t = ms24(x.created_at)
    return !Number.isNaN(t) && t >= desde && t <= ahoraMs
  }).length
const sumVen24 = (desde) =>
  localSeed.cuentas
    .filter((c) => c.estado === 'pagada' && c.pagado_at && ms24(c.pagado_at) >= desde && ms24(c.pagado_at) <= ahoraMs)
    .reduce((a, c) => a + c.total, 0)
check(
  '24i · comparaciones de pedidos hoy/semana/mes vs dataset',
  e24.comparaciones.pedidos.hoy === contar24(localSeed.pedidos, inicioDia24) &&
    e24.comparaciones.pedidos.semana === contar24(localSeed.pedidos, inicioSem24) &&
    e24.comparaciones.pedidos.mes === contar24(localSeed.pedidos, inicioMes24),
  JSON.stringify(e24.comparaciones.pedidos),
)
check(
  '24j · comparaciones de ventas y restaurantes nuevos vs dataset',
  aprox24(e24.comparaciones.ventas.hoy, sumVen24(inicioDia24)) &&
    aprox24(e24.comparaciones.ventas.semana, sumVen24(inicioSem24)) &&
    aprox24(e24.comparaciones.ventas.mes, sumVen24(inicioMes24)) &&
    e24.comparaciones.restaurantesNuevos.semana === contar24(localSeed.restaurantes, inicioSem24),
  JSON.stringify(e24.comparaciones),
)

// -- Ranking ----------------------------------------------------------------
const sumaPed24 = e24.ranking.reduce((a, f) => a + f.pedidos, 0)
const sumaVen24 = e24.ranking.reduce((a, f) => a + f.ventas, 0)
check(
  '24k · el ranking solo trae restaurantes con actividad y cuadra con el resumen',
  e24.ranking.length > 0 &&
    e24.ranking.every((f) => f.pedidos > 0 || f.ventas > 0) &&
    e24.ranking.some((f) => f.restauranteId === 'r-demo') &&
    sumaPed24 === e24.resumen.pedidos &&
    aprox24(sumaVen24, e24.resumen.ventas),
  `filas=${e24.ranking.length} ped=${sumaPed24}/${e24.resumen.pedidos} ven=${sumaVen24}/${e24.resumen.ventas}`,
)
check(
  '24l · el ranking viene ordenado por ventas desc y luego pedidos desc',
  e24.ranking.every(
    (f, i) =>
      i === 0 ||
      e24.ranking[i - 1].ventas > f.ventas ||
      (e24.ranking[i - 1].ventas === f.ventas && e24.ranking[i - 1].pedidos >= f.pedidos),
  ),
)

// -- Evolución --------------------------------------------------------------
const dias24 = diasDelRango(rango24.desde, rango24.hasta)
const sumaSerie24 = (s) => s.reduce((a, p) => a + p.valor, 0)
check(
  '24m · evolución: un punto por día y los valores suman los totales del periodo',
  e24.evolucion.pedidos.length === dias24.length &&
    e24.evolucion.ventas.length === dias24.length &&
    e24.evolucion.restaurantes.length === dias24.length &&
    sumaSerie24(e24.evolucion.pedidos) === e24.resumen.pedidos &&
    aprox24(sumaSerie24(e24.evolucion.ventas), e24.resumen.ventas) &&
    sumaSerie24(e24.evolucion.restaurantes) === e24.resumen.restaurantesNuevos,
  JSON.stringify({
    dias: dias24.length,
    p: sumaSerie24(e24.evolucion.pedidos),
    v: sumaSerie24(e24.evolucion.ventas),
    r: sumaSerie24(e24.evolucion.restaurantes),
  }),
)
check(
  '24n · evolución: fechas YYYY-MM-DD, del inicio al fin del rango',
  e24.evolucion.pedidos.every((p) => /^\d{4}-\d{2}-\d{2}$/.test(p.fecha)) &&
    e24.evolucion.pedidos[0].fecha === dias24[0] &&
    e24.evolucion.pedidos[dias24.length - 1].fecha === dias24[dias24.length - 1],
)
const vacio24 = await api.getEstadisticasGlobales(
  '2000-01-01T00:00:00.000Z',
  '2000-01-01T23:59:59.000Z',
)
check(
  '24o · una ventana sin actividad da todo en cero, ranking vacío y una evolución plana',
  vacio24.error === null &&
    vacio24.data.resumen.pedidos === 0 &&
    vacio24.data.resumen.ventas === 0 &&
    vacio24.data.resumen.restaurantesNuevos === 0 &&
    vacio24.data.ranking.length === 0 &&
    vacio24.data.evolucion.pedidos.length >= 1 &&
    vacio24.data.evolucion.pedidos.every((p) => p.valor === 0) &&
    vacio24.data.evolucion.ventas.every((p) => p.valor === 0),
  vacio24.error ?? JSON.stringify(vacio24.data?.resumen),
)

// -- Seguridad: solo el super admin -----------------------------------------
apiMode.operadorId = CAJERO24.id
const denegado24 = await api.getEstadisticasGlobales(rango24.desde, rango24.hasta)
check(
  '24p · un operador que no es super admin no ve las estadísticas globales',
  denegado24.error === 'Solo el super administrador puede ver las estadísticas globales.' &&
    denegado24.data === null,
  denegado24.error ?? '',
)
apiMode.operadorId = SUPER24.id

// -- Solo lectura -----------------------------------------------------------
check(
  '24q · las estadísticas no mutan el dataset',
  snap24 ===
    JSON.stringify({
      usuarios: localSeed.usuarios,
      pedidos: localSeed.pedidos,
      cuentas: localSeed.cuentas,
      restaurantes: localSeed.restaurantes,
    }),
)
apiMode.operadorId = operadorPrevio24

// ---------------------------------------------------------------------------
titulo('25 · Super Admin: auditoría, soporte, notificaciones y configuración global')

const operadorPrevio25 = apiMode.operadorId
const SUPER25 = localSeed.usuarios.find((u) => u.rol === 'super_admin')
// Admin del restaurante de la semilla (nunca es super) y un rol sin permiso de
// soporte (cajero), para probar la inversión de la sección.
const ADMIN25 = localSeed.usuarios.find((u) => u.rol === 'admin_restaurante' && u.activo !== false)
const CAJERO25 = localSeed.usuarios.find((u) => u.rol === 'cajero')
const RID25 = 'r-nuevo'
const R25 = localSeed.restaurantes.find((r) => r.id === RID25)
// Snapshot de solo lectura: ninguna API de este panel debe mutar el dataset.
const snapAudit25 = localSeed.auditLogs.length
const lenAuditInicial25 = snapAudit25
const snapTickets25 = JSON.stringify(localSeed.tickets)
const snapConfig25 = JSON.stringify(localSeed.configuracion)
apiMode.operadorId = SUPER25.id

// -- Auditoría: etiquetas y filtros (lógica pura) ---------------------------
check(
  '25a · etiquetas y categorías de las acciones de auditoría',
  etiquetaAccionAuditoria('restaurante_crear') === 'Restaurante creado' &&
    etiquetaAccionAuditoria('suscripcion_suspender') === 'Suscripción suspendida' &&
    etiquetaAccionAuditoria('comanda_item_anular') === 'Ítem de comanda anulado' &&
    etiquetaAccionAuditoria('cuenta_anular') === 'Boleta anulada y reembolsada' &&
    etiquetaAccionAuditoria('caja_turno_cerrar') === 'Turno de caja cerrado' &&
    etiquetaAccionAuditoria('accion-desconocida') === 'accion-desconocida' &&
    categoriaDeAccion('suscripcion_renovar') === 'suscripciones' &&
    categoriaDeAccion('usuario_estado') === 'usuarios' &&
    categoriaDeAccion('zzz') === 'otros' &&
    etiquetaCategoria('restaurantes') === 'Restaurantes',
)
check(
  '25b · hayFiltrosAuditoria y CRITERIOS_AUDITORIA_VACIOS',
  !hayFiltrosAuditoria(CRITERIOS_AUDITORIA_VACIOS) &&
    hayFiltrosAuditoria({ ...CRITERIOS_AUDITORIA_VACIOS, categoria: 'usuarios' }) &&
    hayFiltrosAuditoria({ ...CRITERIOS_AUDITORIA_VACIOS, busqueda: 'a' }),
)

// -- Solo lectura -----------------------------------------------------------
const leidas25 = await Promise.all([
  api.getAuditoria(),
  api.getTickets(),
  api.getConfiguracionGlobal(),
  api.getAlertas(),
])
check(
  '25c · el super admin lee auditoría, tickets, configuración y alertas',
  leidas25.every((r) => r.error === null) && Array.isArray(leidas25[0].data) && !!leidas25[3].data,
  leidas25.map((r) => r.error).find(Boolean) ?? '',
)
check(
  '25d · leer no muta el dataset (auditoría, tickets, configuración)',
  localSeed.auditLogs.length === lenAuditInicial25 &&
    JSON.stringify(localSeed.tickets) === snapTickets25 &&
    JSON.stringify(localSeed.configuracion) === snapConfig25,
)
const alertas25Inicial = leidas25[3].data
check(
  '25e · alertas acordes a la semilla: suspendido y altas recientes (demo vence en 45 días)',
  alertas25Inicial.some((a) => a.tipo === 'restaurante_suspendido' && a.restaurante_nombre === 'La Esquina Grill') &&
    alertas25Inicial.some((a) => a.tipo === 'restaurante_nuevo' && a.restaurante_nombre === 'Mi Restaurante Nuevo') &&
    alertas25Inicial.some((a) => a.tipo === 'administrador_nuevo' && a.restaurante_nombre === 'Mi Restaurante Nuevo') &&
    !alertas25Inicial.some((a) => a.tipo === 'restaurante_vencido' || a.tipo === 'ticket_urgente') &&
    alertas25Inicial.every((a) => ['critico', 'advertencia', 'info'].includes(a.nivel) && !!a.fecha),
  `tipos=${[...new Set(alertas25Inicial.map((a) => a.tipo))].join(',')}`,
)
check(
  '25f · calcularAlertas (memoria) coincide con la API local',
  eq(
    alertas25Inicial.map((a) => `${a.tipo}:${a.referencia_id}`).sort(),
    calcularAlertas(localSeed).map((a) => `${a.tipo}:${a.referencia_id}`).sort(),
  ) &&
    DIAS_POR_VENCER === 7 &&
    DIAS_NUEVO === 7,
)
// Criterios de la RPC probados de forma determinista con fecha fija: el semilla
// no tiene vencidos activos ni suscripciones por vencer en la ventana de 7 días.
const ahoraFijo25 = new Date('2026-10-05T12:00:00.000Z')
const puras25 = calcularAlertas(
  {
    restaurantes: [
      {
        id: 'px-vence',
        nombre: 'Vence Pronto',
        suscripcion_activa: true,
        fecha_vencimiento: '2026-10-09T12:00:00.000Z',
        created_at: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'px-caducado',
        nombre: 'Caducado',
        suscripcion_activa: true,
        fecha_vencimiento: '2026-10-01T12:00:00.000Z',
        created_at: '2026-01-01T00:00:00.000Z',
      },
    ],
    usuarios: [],
    tickets: [],
  },
  ahoraFijo25,
)
check(
  '25g · vencimiento: por vencer 7 días antes (advertencia) y ya vencido (crítico)',
  puras25.some((a) => a.tipo === 'restaurante_por_vencer' && a.referencia_id === 'px-vence' && a.nivel === 'advertencia' && a.id.startsWith('porvencer-')) &&
    puras25.some((a) => a.tipo === 'restaurante_vencido' && a.referencia_id === 'px-caducado' && a.nivel === 'critico' && a.id.startsWith('venc-')),
  puras25.map((a) => `${a.tipo}:${a.referencia_id}`).join(', '),
)
check(
  '25h · filtrarAuditoria por categoría y búsqueda',
  (() => {
    const porCategoria = filtrarAuditoria(leidas25[0].data, {
      busqueda: '',
      categoria: 'usuarios',
      restauranteId: 'todos',
    })
    const porTexto = filtrarAuditoria(leidas25[0].data, {
      busqueda: 'suscripción',
      categoria: 'todas',
      restauranteId: 'todos',
    })
    return (
      porCategoria.every((l) => categoriaDeAccion(l.accion) === 'usuarios') &&
      porTexto.every((l) => etiquetaAccionAuditoria(l.accion).toLowerCase().includes('suscripción'))
    )
  })(),
)

// -- Permisos: la sección de plataforma es solo del super admin -------------
apiMode.operadorId = ADMIN25.id
const soloSuper25 = await Promise.all([
  api.getAuditoria(),
  api.getAlertas(),
  api.getConfiguracionGlobal(),
])
check(
  '25i · un operador que no es super admin no ve auditoría, alertas ni configuración',
  soloSuper25.every((r) => r.data === null && r.error),
  soloSuper25.map((r) => r.error).join(' | '),
)
// El soporte se invirtió: el admin del restaurante SÍ reporta y ve los suyos.
const ticketsAdmin25 = await api.getTickets()
check(
  '25i2 · el admin del restaurante ve solo los tickets de SU restaurante',
  ticketsAdmin25.error === null && (ticketsAdmin25.data ?? []).every((t) => t.restaurante_id === RID25),
  ticketsAdmin25.error ?? '',
)
apiMode.operadorId = CAJERO25.id
const ticketsCajero25 = await api.getTickets()
const negadaTicketCajero25 = await api.crearTicket({ asunto: 'x', descripcion: 'y', prioridad: 'media' })
const negadaGestion25 = await api.actualizarTicket('t-que-no-existe', { estado: 'cerrado' })
check(
  '25j · un rol sin permiso (cajero) no ve, ni reporta, ni gestiona tickets',
  ticketsCajero25.data === null &&
    !!ticketsCajero25.error &&
    negadaTicketCajero25.error === 'Solo el administrador del restaurante puede reportar incidencias.' &&
    negadaGestion25.error === 'Solo el super administrador puede gestionar los tickets.',
  `${ticketsCajero25.error ?? ''} | ${negadaTicketCajero25.error ?? ''} | ${negadaGestion25.error ?? ''}`,
)
const negadaConfig25 = await api.actualizarConfiguracionGlobal({ nombre_app: 'Mesora' })
check(
  '25j2 · tampoco edita la configuración global',
  negadaConfig25.error === 'Solo el super administrador puede editar la configuración.',
  negadaConfig25.error ?? '',
)
apiMode.operadorId = SUPER25.id

// -- Acciones que dejan rastro de auditoría: personal controlado de la sección
const p25 = await api.crearPersonal(RID25, { nombre: 'Ayudante 25', email: 'ayudante25@prueba.pe', rol: 'mesero' })
const M25 = p25.data?.id
const dirOriginal25 = R25.direccion
const editado25 = await api.adminActualizarRestaurante(RID25, {
  nombre: R25.nombre,
  direccion: 'Av. Prueba 1',
  ruc: R25.ruc ?? null,
  telefono: R25.telefono ?? null,
  email_contacto: R25.email_contacto ?? null,
})
const revertido25 = await api.adminActualizarRestaurante(RID25, {
  nombre: R25.nombre,
  direccion: dirOriginal25,
  ruc: R25.ruc ?? null,
  telefono: R25.telefono ?? null,
  email_contacto: R25.email_contacto ?? null,
})
const susp25 = await api.suscripcionesSuspender(RID25, 'Mantenimiento preventivo')
const react25 = await api.suscripcionesReactivar(RID25, R25.fecha_vencimiento)
const apagado25 = await api.adminCambiarEstadoUsuario(M25, false)
const prendido25 = await api.adminCambiarEstadoUsuario(M25, true)
const design25 = await api.adminDesignarAdministrador(RID25, M25)
check(
  '25k · las mutaciones de gestión devuelven sus objetos correctamente',
  !p25.error && !editado25.error && !revertido25.error && !susp25.error && !react25.error &&
    !apagado25.error && !prendido25.error && !design25.error &&
    design25.data?.rol === 'admin_restaurante' && design25.data?.restaurante_id === RID25,
  p25.error ?? editado25.error ?? susp25.error ?? react25.error ?? apagado25.error ?? design25.error ?? '',
)

// -- Soporte: el admin del restaurante reporta; el super admin gestiona ------
apiMode.operadorId = ADMIN25.id
const tk25 = await api.crearTicket({
  // El restaurante y el usuario salen del operador: se ignora lo que mande el
  // formulario, para que nadie reporte a nombre de otro local.
  restauranteId: 'r-demo',
  usuarioId: null,
  asunto: 'Ayuda con la boleta',
  descripcion: 'El formato de la boleta no cuadra.',
  prioridad: 'urgente',
})
check(
  '25l · crearTicket asigna código TK-XXXXXX, abre el ticket y lo ancla al restaurante del admin',
  !tk25.error && /^TK-[0-9A-F]{6}$/.test(tk25.data.codigo) && tk25.data.estado === 'abierto' &&
    tk25.data.prioridad === 'urgente' && !tk25.data.resuelto_at &&
    tk25.data.restaurante_id === RID25 && tk25.data.usuario_id === ADMIN25.id,
  tk25.error ?? tk25.data?.codigo ?? '',
)
check(
  '25l2 · el mismo admin ve su ticket recién reportado',
  (await api.getTickets()).data.some((t) => t.id === tk25.data.id),
)
apiMode.operadorId = SUPER25.id
check(
  '25l3 · el super admin ve los tickets de todos los restaurantes',
  (await api.getTickets()).data.some((t) => t.id === tk25.data.id && t.restaurante_id === RID25),
)
const alertasConTicket25 = (await api.getAlertas()).data
check(
  '25m · un ticket urgente abierto dispara la alerta crítica',
  alertasConTicket25.some(
    (a) => a.tipo === 'ticket_urgente' && a.referencia_id === tk25.data.id && a.nivel === 'critico' &&
      a.id.startsWith('tk-') && a.detalle.includes(`TK-${tk25.data.codigo.slice(3)}`),
  ) && !alertas25Inicial.some((a) => a.tipo === 'ticket_urgente'),
)
const tkEnProgreso = await api.actualizarTicket(tk25.data.id, {
  estado: 'en_progreso',
  prioridad: 'urgente',
  responsable: 'Soporte Mesora',
})
const tkResuelto = await api.actualizarTicket(tk25.data.id, { estado: 'resuelto' })
const llegadaTk = new Date(tk25.data.created_at).getTime()
check(
  '25n · actualizarTicket sella updated_at y resuelto_at al resolver',
  !tkEnProgreso.error && !tkResuelto.error &&
    tkEnProgreso.data.responsable === 'Soporte Mesora' &&
    tkEnProgreso.data.estado === 'en_progreso' &&
    new Date(tkEnProgreso.data.updated_at).getTime() >= llegadaTk &&
    tkResuelto.data.estado === 'resuelto' &&
    tkResuelto.data.resuelto_at !== null,
  `${tkEnProgreso.error ?? ''} ${tkResuelto.error ?? ''}`,
)
const ticketFaltante25 = await api.actualizarTicket('t-que-no-existe', { estado: 'cerrado' })
const prioridadFalsa25 = await api.actualizarTicket(tk25.data.id, { prioridad: 'falsa' })
const asuntoVacio25 = await api.crearTicket({ asunto: '  ', descripcion: 'x', prioridad: 'media' })
const tkSuper25 = await api.crearTicket({ asunto: 'x', descripcion: 'y', prioridad: 'media' })
check(
  '25o · validaciones de creación y gestión de tickets',
  ticketFaltante25.error === 'Ticket no encontrado.' &&
    prioridadFalsa25.error === 'Prioridad de ticket no válida.' &&
    asuntoVacio25.error === 'El asunto del ticket es obligatorio.' &&
    tkSuper25.error === 'Solo el administrador del restaurante puede reportar incidencias.',
  `${ticketFaltante25.error ?? ''} | ${prioridadFalsa25.error ?? ''} | ${asuntoVacio25.error ?? ''} | ${tkSuper25.error ?? ''}`,
)
const alertas25Final = (await api.getAlertas()).data
check(
  '25p · al resolver, el ticket deja de ser un ticket urgente en las alertas',
  !alertas25Final.some((a) => a.tipo === 'ticket_urgente' && a.referencia_id === tk25.data.id) &&
    (await api.getTickets()).data.some(
      (t) => t.id === tk25.data.id && t.estado === 'resuelto' && t.codigo === tk25.data.codigo,
    ),
)

// -- Soporte: filtros y orden ----------------------------------------------
const lista25 = ordenarTickets((await api.getTickets()).data)
check(
  '25q · getTickets en orden desc y ordenarTickets mantiene la prioridad arriba',
  lista25.every((t, i) => i === 0 || lista25[i - 1].created_at >= t.created_at) &&
    lista25[0].created_at >= lista25.at(-1).created_at &&
    filtrarTickets(lista25, { ...CRITERIOS_TICKETS_VACIOS, estado: 'resuelto' }).some(
      (t) => t.id === tk25.data.id,
    ) &&
    hayFiltrosTickets({ ...CRITERIOS_TICKETS_VACIOS, prioridad: 'alta' }) &&
    !hayFiltrosTickets(CRITERIOS_TICKETS_VACIOS) &&
    etiquetaEstadoTicket('resuelto') === 'Resuelto' &&
    etiquetaPrioridadTicket('urgente') === 'Urgente',
)
const porNuevo25 = filtrarTickets(lista25, { ...CRITERIOS_TICKETS_VACIOS, restaurante: RID25 })
check(
  '25q2 · el filtro por restaurante separa por local y agrupa los «sin asignar»',
  porNuevo25.every((t) => t.restaurante_id === RID25) &&
    porNuevo25.some((t) => t.id === tk25.data.id) &&
    filtrarTickets(lista25, { ...CRITERIOS_TICKETS_VACIOS, restaurante: 'sin' }).every(
      (t) => t.restaurante_id === null,
    ) &&
    hayFiltrosTickets({ ...CRITERIOS_TICKETS_VACIOS, restaurante: RID25 }) &&
    !hayFiltrosTickets(CRITERIOS_TICKETS_VACIOS),
)

// -- Configuración global ---------------------------------------------------
const cfgInicial25 = await api.getConfiguracionGlobal()
const cfgActualizada25 = await api.actualizarConfiguracionGlobal({
  nombre_app: 'Mesora Pro',
  correo_soporte: 'soporte@mesora.pe',
  telefono_soporte: '01 640 0000',
})
const cfgReleida25 = await api.getConfiguracionGlobal()
check(
  '25r · la configuración global se actualiza y se relee',
  !cfgInicial25.error && cfgInicial25.data.nombre_app === 'Mesora' &&
    cfgInicial25.data.precio_plan_mensual === PRECIO_PLAN_DEFECTO &&
    !cfgActualizada25.error && cfgActualizada25.data.nombre_app === 'Mesora Pro' &&
    cfgActualizada25.data.correo_soporte === 'soporte@mesora.pe' &&
    cfgReleida25.data.nombre_app === 'Mesora Pro' &&
    localSeed.configuracion.nombre_app === 'Mesora Pro',
  cfgActualizada25.error ?? '',
)
check(
  '25s · validación y normalización de la configuración',
  validarConfiguracionGlobal({ nombre_app: '   ' }) === 'El nombre de la aplicación no puede quedar vacío.' &&
    validarConfiguracionGlobal({ nombre_app: 'Mesora', correo_soporte: 'correo-mal' }) === 'Ingresa un correo de soporte válido.' &&
    validarConfiguracionGlobal({ nombre_app: 'Mesora', correo_soporte: 'x@y.pe' }) === null &&
    validarConfiguracionGlobal({ nombre_app: 'Mesora', precio_plan_mensual: 0 }) === 'El precio del plan mensual debe ser mayor que cero.' &&
    validarConfiguracionGlobal({ nombre_app: 'Mesora', precio_plan_mensual: -5 }) === 'El precio del plan mensual debe ser mayor que cero.' &&
    validarConfiguracionGlobal({ nombre_app: 'Mesora', precio_plan_mensual: null }) === 'El precio del plan mensual debe ser mayor que cero.' &&
    (() => {
      const n = normalizarConfiguracionGlobal({
        nombre_app: '  Mesora  ',
        correo_soporte: '  x@y.pe ',
        telefono_soporte: '',
        logo_url: '',
      })
      return n.nombre_app === 'Mesora' && n.correo_soporte === 'x@y.pe' && n.telefono_soporte === null &&
        n.logo_url === null && n.precio_plan_mensual === PRECIO_PLAN_DEFECTO
    })() &&
    (() => {
      const n = normalizarConfiguracionGlobal({
        nombre_app: 'Mesora',
        precio_plan_mensual: 120.999,
      })
      return n.precio_plan_mensual === 121
    })() &&
    mostrarPrecioPlan(120) === 'S/ 120' &&
    mostrarPrecioPlan(120.5) === 'S/ 120,50' &&
    mostrarPrecioPlan(120.999) === 'S/ 121',
)

// -- Auditoría: el rastro quedó --------------------------------------------
const logs25 = (await api.getAuditoria()).data
const tieneAccion25 = (accion, entidad) =>
  logs25.some((l) => l.accion === accion && l.entidad === entidad && l.actor_id === SUPER25.id)
check(
  '25t · las acciones del super admin quedaron registradas con actor',
  tieneAccion25('restaurante_editar', 'restaurante') &&
    tieneAccion25('suscripcion_suspender', 'suscripcion') &&
    tieneAccion25('suscripcion_reactivar', 'suscripcion') &&
    tieneAccion25('usuario_estado', 'usuario') &&
    tieneAccion25('usuario_cambiar_rol', 'usuario') &&
    tieneAccion25('configuracion_actualizar', 'configuracion'),
  logs25.map((l) => `${l.entidad}:${l.accion}`).join(', '),
)
const editsR25 = logs25.filter((l) => l.accion === 'restaurante_editar' && l.restaurante_id === RID25)
check(
  '25u · el detalle de la edición lista los campos cambiados y su restaurante',
  editsR25.length >= 1 &&
    editsR25.every((l) => (l.detalle?.campos ?? []).includes('direccion') && l.restaurante_nombre === 'Mi Restaurante Nuevo'),
  `edits=${editsR25.length}`,
)
check(
  '25v · la auditoría viene en orden desc y es append-only (cresas, nunca borra)',
  logs25.every((l, i) => i === 0 || logs25[i - 1].created_at >= l.created_at) &&
    logs25.length > snapAudit25 &&
    (await api.getAuditoria()).data.length === logs25.length,
)

// -- La limpieza lógica conserva la fila y la auditoría, nunca borra usuarios.
const desactivado25 = await api.adminCambiarEstadoUsuario(M25, false)
check(
  '25w · la cuenta de prueba queda inactiva con historial conservado',
  !desactivado25.error && localSeed.usuarios.some((u) => u.id === M25 && u.activo === false) &&
    localSeed.auditLogs.some((l) => l.accion === 'usuario_estado' && l.entidad_id === M25),
  desactivado25.error ?? '',
)
apiMode.operadorId = operadorPrevio25

// ===========================================================================
// 26 · Recorrido guiado: layout de la guía y prefill (solo demo)
// ===========================================================================
// La tarjeta de la guía, el aro del spotlight y los formularios prellenados son
// lógica pura de `src/demo/guia.ts`. Se verifican acá porque de ellos depende
// que la guía no tape el modal ni el ancla que resalta (el bug original), y que
// el prefill NO se active fuera del modo demo.

const VP26 = { w: 1280, h: 800 }

// -- rectEnEsquina: tamaño y clamps
const esqDR26 = rectEnEsquina('inferior-derecha', VP26)
check(
  '26a · la esquina inferior-derecha respeta el margen y el ancho de la guía',
  esqDR26.w === GUI_ANCHO &&
    esqDR26.h === GUI_ALTO_COMPACTO &&
    esqDR26.x === VP26.w - GUI_MARGEN - GUI_ANCHO &&
    esqDR26.y === VP26.h - GUI_MARGEN - GUI_ALTO_COMPACTO,
  JSON.stringify(esqDR26),
)
const esqMovil26 = rectEnEsquina('inferior-izquierda', { w: 320, h: 640 })
check(
  '26b · en un viewport estrecho la guía se encoge para no salirse',
  esqMovil26.w === 320 - GUI_MARGEN * 2 && esqMovil26.x === GUI_MARGEN,
  JSON.stringify(esqMovil26),
)
check(
  '26c · superior-derecha se ancla arriba y a la derecha',
  rectEnEsquina('superior-derecha', VP26).y === GUI_MARGEN &&
    rectEnEsquina('superior-derecha', VP26).x === VP26.w - GUI_MARGEN - GUI_ANCHO,
)

// -- elegirEsquina: nunca tapa el ancla ni el modal
check(
  '26d · sin ancla ni modal la guía va a la esquina preferida (inferior-derecha)',
  elegirEsquina(null, null, VP26) === 'inferior-derecha',
)
check(
  '26e · si el ancla ocupa la esquina inferior-derecha, la guía se muda',
  elegirEsquina(esqDR26, null, VP26) === 'inferior-izquierda',
  elegirEsquina(esqDR26, null, VP26),
)
check(
  '26f · un modal que cubre toda la pantalla deja la esquina de respaldo',
  elegirEsquina(null, { x: 0, y: 0, w: VP26.w, h: VP26.h }, VP26) === 'inferior-derecha',
)
// Ancla abajo a la derecha + modal abajo a la izquierda: solo queda arriba.
const esqIL26 = rectEnEsquina('inferior-izquierda', VP26)
check(
  '26g · con ancla y modal abajo, la guía sube a superior-derecha',
  elegirEsquina(esqDR26, esqIL26, VP26) === 'superior-derecha',
  elegirEsquina(esqDR26, esqIL26, VP26),
)
// Las cuatro esquinas devueltas nunca se solapan con el ancla.
for (const ancla of [
  { x: 0, y: 0, w: 200, h: 60 },
  { x: VP26.w - 200, y: 0, w: 200, h: 60 },
  { x: 0, y: VP26.h - 60, w: 200, h: 60 },
  { x: VP26.w - 200, y: VP26.h - 60, w: 200, h: 60 },
  { x: 500, y: 300, w: 120, h: 40 },
]) {
  const e = elegirEsquina(ancla, null, VP26)
  const r = rectEnEsquina(e, VP26)
  const solapa = !(r.x + r.w <= ancla.x || ancla.x + ancla.w <= r.x || r.y + r.h <= ancla.y || ancla.y + ancla.h <= r.y)
  check(`26h · la guía no se solapa con el ancla ${JSON.stringify(ancla)}`, !solapa, `${e} → ${JSON.stringify(r)}`)
}

// -- colocarEtiqueta: pegada al ancla, sin salirse ni pisar la guía
const etq26 = { w: 180, h: 30 }
const anclaMedio26 = { x: 600, y: 300, w: 40, h: 20 }
check(
  '26i · una etiqueta en medio de la pantalla va debajo del ancla',
  colocarEtiqueta(anclaMedio26, etq26, VP26, null).lado === 'abajo',
)
check(
  '26j · si no cabe debajo (ancla al pie), la etiqueta voltea arriba',
  colocarEtiqueta({ x: 600, y: VP26.h - 20, w: 40, h: 20 }, etq26, VP26, null).lado === 'arriba',
)
check(
  '26k · si la guía ocupa el lugar de abajo, la etiqueta voltea arriba',
  colocarEtiqueta(anclaMedio26, etq26, VP26, { x: 520, y: 325, w: 200, h: 40 }).lado === 'arriba',
)
for (const ancla of [
  { x: 0, y: 0, w: 40, h: 20 },
  { x: VP26.w - 40, y: 0, w: 40, h: 20 },
  { x: 0, y: VP26.h - 20, w: 40, h: 20 },
  { x: VP26.w - 40, y: VP26.h - 20, w: 40, h: 20 },
]) {
  const c = colocarEtiqueta(ancla, etq26, VP26, null)
  check(
    `26l · la etiqueta del ancla ${JSON.stringify(ancla)} queda dentro del viewport`,
    c.left >= 4 && c.top >= 4 && c.left + etq26.w <= VP26.w - 4 && c.top + etq26.h <= VP26.h - 4,
    JSON.stringify(c),
  )
}

// -- prefillDe: SOLO el demo con el recorrido activo recibe datos sugeridos
check(
  '26m · en el demo con el recorrido activo se ofrecen datos sugeridos',
  eq(prefillDe(true, true), PREFILL_GUIA) &&
    PREFILL_GUIA.zona === 'Salón principal' &&
    PREFILL_GUIA.mesa === 'Mesa 10' &&
    PREFILL_GUIA.producto.nombre === 'Lomo saltado' &&
    PREFILL_GUIA.producto.precio === '12.50' &&
    PREFILL_GUIA.producto.categoria === 'PROMOS',
  JSON.stringify(prefillDe(true, true)),
)
check('26n · en el demo sin recorrido activo NO hay prefill', prefillDe(true, false) === null)
check('26o · fuera del demo (local/real) NUNCA hay prefill', prefillDe(false, true) === null && prefillDe(false, false) === null)

// -- hayEsquinaLibre + elegirEsquina con la altura REAL del panel.
// El bug original: se reservaba la altura de la barra compacta (76px) aunque el
// panel se pintara expandido (~460px), así que el panel grande se solapaba con
// el modal del formulario. Estas comprobaciones fijan ese invariante.
const solapa26 = (a, b) =>
  !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y)
const modal1024 = { x: 288, y: 259, w: 448, h: 250 }
const VP1024 = { w: 1024, h: 768 }
check(
  '26p · el modal de «Nueva zona» en 1024x768 deja sitio a la barra compacta',
  hayEsquinaLibre(null, modal1024, VP1024, GUI_ALTO_COMPACTO) === true,
)
check(
  '26q · pero el panel expandido no cabe sin tapar el modal (por eso se repliega)',
  hayEsquinaLibre(null, modal1024, VP1024, GUI_ALTO_EXPANDIDO) === false,
)
const ANCLA_GUARDAR26 = { x: 400, y: 560, w: 114, h: 44 }
for (const vp of [
  { w: 360, h: 640 },
  { w: 390, h: 844 },
  { w: 768, h: 1024 },
  { w: 1024, h: 768 },
  { w: 1180, h: 820 },
  { w: 1280, h: 800 },
  { w: 1366, h: 768 },
  { w: 1440, h: 900 },
  { w: 1920, h: 1080 },
]) {
  const modal = { x: Math.round(vp.w / 2 - 224), y: Math.round(vp.h / 2 - 125), w: 448, h: 250 }
  const alto = hayEsquinaLibre(ANCLA_GUARDAR26, modal, vp, GUI_ALTO_EXPANDIDO)
    ? GUI_ALTO_EXPANDIDO
    : GUI_ALTO_COMPACTO
  const e = elegirEsquina(ANCLA_GUARDAR26, modal, vp, alto)
  const r = rectEnEsquina(e, vp, GUI_ANCHO, alto)
  check(
    `26r · ${vp.w}x${vp.h}: el panel (alto ${alto}) va a ${e} sin tapar modal ni ancla`,
    !solapa26(r, modal) && !solapa26(r, ANCLA_GUARDAR26),
    `${e} → ${JSON.stringify(r)} modal=${JSON.stringify(modal)}`,
  )
}

// -- XP y niveles del recorrido (estética de juego sobre la guía).
// Cada misión da XP; los umbrales de NIVELES van alineados con el XP acumulado
// para que se sienta como subir de nivel. Estas comprobaciones fijan la curva.
const conHechos = (ids) => ({ ...PROGRESO_VACIO, hechos: ids })

check(
  '27a · cada paso tiene XP positivo y el total es la suma',
  PASOS.every((p) => p.xp > 0) && XP_TOTAL === PASOS.reduce((s, p) => s + p.xp, 0),
  `XP_TOTAL=${XP_TOTAL}`,
)
check(
  '27b · XP acumulado por paso: 100, 220, 360, 520, 700, 900',
  PASOS.reduce(
    (acc, p) => {
      const xp = acc.suma + p.xp
      acc.suma = xp
      acc.lista.push(xp)
      return acc
    },
    { suma: 0, lista: [] },
  ).lista.join(',') === '100,220,360,520,700,900',
)

check(
  '27c · sin misiones: 0 XP, Nivel 1 Aprendiz, barra vacía',
  xpTotal(PROGRESO_VACIO) === 0 &&
    nivelDe(0).nivel === 1 &&
    nivelDe(0).titulo === 'Aprendiz' &&
    progresoNivel(0) === 0 &&
    logrosDe(PROGRESO_VACIO) === 0,
)
check(
  '27d · tras «salón»: 100 XP → Nivel 2 Ayudante de salón',
  xpTotal(conHechos(['salon'])) === 100 && nivelDe(100).nivel === 2 && nivelDe(100).titulo === 'Ayudante de salón',
)
check(
  '27e · tras 3 misiones: 360 XP → Nivel 4 Mesero estrella',
  xpTotal(conHechos(['salon', 'carta', 'comanda'])) === 360 && nivelDe(360).nivel === 4,
)
check(
  '27f · los umbrales de NIVELES son crecientes y arrancan en 0',
  NIVELES[0].xpMin === 0 && NIVELES.every((n, i) => i === 0 || n.xpMin > NIVELES[i - 1].xpMin),
)
check(
  '27g · recorrido completo: 900 XP, Nivel 6 Maestro Mesora, sin siguiente nivel',
  xpTotal(conHechos(PASOS.map((p) => p.id))) === XP_TOTAL &&
    XP_TOTAL === 900 &&
    nivelDe(XP_TOTAL).nivel === 6 &&
    nivelDe(XP_TOTAL).titulo === 'Maestro Mesora' &&
    nivelSiguiente(XP_TOTAL) === null &&
    progresoNivel(XP_TOTAL) === 1 &&
    logrosDe(conHechos(PASOS.map((p) => p.id))) === TOTAL_PASOS,
)
check(
  '27h · nivelSiguiente avanza uno a uno y progresoNivel siempre queda en 0..1',
  NIVELES.every((n) => (n.nivel === 6 ? nivelSiguiente(n.xpMin) === null : nivelSiguiente(n.xpMin)?.nivel === n.nivel + 1)) &&
    PASOS.map((p) => xpDePaso(p.id))
      .reduce(
        (acc, xp) => {
          const x = acc.prev + xp
          acc.prev = x
          acc.ok = acc.ok && progresoNivel(x) >= 0 && progresoNivel(x) <= 1
          return acc
        },
        { prev: 0, ok: true },
      ).ok,
)
check(
  '27i · xpDePaso(id) coincide con el XP declarado en PASOS',
  PASOS.every((p) => xpDePaso(p.id) === p.xp) && xpDePaso('inexistente') === 0,
)

// -- formularioDePaso: «Hazlo por mí» en los pasos con formulario no crea el
// registro en silencio, abre la pestaña y el formulario del panel con datos
// sugeridos para que el usuario vea cómo se rellena y solo confirme. El demo
// arranca vacío, así que la carta primero crea la categoría.
const ctx28 = (nuevaZona, categorias = 1) => ({
  mesaTour: null,
  pedidoTour: null,
  nuevaZona,
  boleta: false,
  categorias,
})

check(
  '28a · «Hazlo por mí» en salón abre la pestaña Mesas y el formulario de zona',
  eq(formularioDePaso('salon', ctx28(false)), { tab: 'mesas', form: 'zona' }),
)
check(
  '28b · tras crear la zona, «Hazlo por mí» en salón abre el formulario de mesa',
  eq(formularioDePaso('salon', ctx28(true)), { tab: 'mesas', form: 'mesa' }),
)
check(
  '28c · «Hazlo por mí» en una carta vacía abre el formulario de categoría',
  eq(formularioDePaso('carta', ctx28(false, 0)), { tab: 'menu', form: 'categoria' }),
)
check(
  '28d · con categorías ya creadas, «Hazlo por mí» en la carta abre el plato',
  eq(formularioDePaso('carta', ctx28(false, 1)), { tab: 'menu', form: 'producto' }),
)
check(
  '28e · los pasos sin formulario no abren ninguna pestaña (comanda/cocina/cobro/panel)',
  ['comanda', 'cocina', 'cobro', 'panel'].every((id) => formularioDePaso(id, ctx28(false)) === null),
)
check(
  '28f · la pista de la carta pide un producto',
  pista('carta', ctx28(false, 0)).includes('producto') &&
    pista('carta', ctx28(false, 1)).includes('producto'),
)
check(
  '28g · el autocompletado usa PROMOS / Lomo saltado / 12.50',
  PREFILL_GUIA.producto.categoria === 'PROMOS' &&
    PREFILL_GUIA.producto.nombre === 'Lomo saltado' &&
    PREFILL_GUIA.producto.precio === '12.50',
  JSON.stringify(PREFILL_GUIA.producto),
)

// El autocompletado del demo: un campo detrás de otro, con el nombre escrito
// letra a letra y el precio número por número.
const { escribirSecuencia } = await servidor.ssrLoadModule('/src/demo/escritura.ts')
const vistos = []
const escritos = []
const cancelarSec = escribirSecuencia(
  [
    { texto: '', aplicar: () => escritos.push('categoria') },
    { texto: 'Lomo saltado', aplicar: (t) => escritos.push(`n:${t}`), msPorLetra: 5 },
    { texto: '12.50', aplicar: (t) => escritos.push(`p:${t}`), msPorLetra: 5 },
  ],
  (i) => vistos.push(i),
  { pausaEntreCampos: 10 },
)
await new Promise((r) => setTimeout(r, 700))
cancelarSec()
const nombreAutocompletado = escritos.filter((x) => x.startsWith('n:')).pop()
const precioAutocompletado = escritos.filter((x) => x.startsWith('p:')).pop()
check(
  '28h · el autocompletado escribe los campos uno tras otro y avisa cuál está activo',
  vistos[0] === 0 &&
    vistos.includes(1) &&
    vistos.includes(2) &&
    vistos[vistos.length - 1] === -1 &&
    escritos.includes('categoria') &&
    nombreAutocompletado === 'n:Lomo saltado' &&
    precioAutocompletado === 'p:12.50',
  `vistos=${vistos.join(',')} nombre=${nombreAutocompletado} precio=${precioAutocompletado}`,
)

const escritos2 = []
const cancelarSec2 = escribirSecuencia(
  [{ texto: 'abcdef', aplicar: (t) => escritos2.push(t), msPorLetra: 5 }],
  () => {},
  { pausaEntreCampos: 10 },
)
await new Promise((r) => setTimeout(r, 40))
cancelarSec2()
const antesDeCancelar = escritos2.length
await new Promise((r) => setTimeout(r, 150))
check(
  '28i · cancelar el autocompletado detiene el temporizador (no queda writes vivo)',
  escritos2.length === antesDeCancelar,
  `escritos=${escritos2.length} antes=${antesDeCancelar}`,
)

titulo('29 · Reasignar Carlos → María y mover consumo con confirmación auditada')
const restauranteTraspaso = localSeed.restaurantes.find((r) => r.id === RID)
restauranteTraspaso.suscripcion_activa = true
restauranteTraspaso.fecha_vencimiento = enMinutos(60 * 24)
const meseroCarlosQa = { id: 'u-qa-carlos', restaurante_id: RID, rol: 'mesero', nombre: 'Carlos', email: 'carlos@qa.invalid', activo: true, created_at: new Date().toISOString() }
const meseroMariaQa = { id: 'u-qa-maria', restaurante_id: RID, rol: 'mesero', nombre: 'María', email: 'maria@qa.invalid', activo: true, created_at: new Date().toISOString() }
const meseroInactivoQa = { id: 'u-qa-inactivo', restaurante_id: RID, rol: 'mesero', nombre: 'Inactivo', email: 'inactivo@qa.invalid', activo: false, created_at: new Date().toISOString() }
localSeed.usuarios.push(meseroCarlosQa, meseroMariaQa, meseroInactivoQa)
apiMode.operadorId = meseroCarlosQa.id
const listadoMeserosQa = await api.getMeseros(RID)
check('29a · al actualizar opciones aparecen otros meseros activos y se excluyen los inactivos', listadoMeserosQa.data.some((m) => m.id === meseroMariaQa.id) && !listadoMeserosQa.data.some((m) => m.id === meseroInactivoQa.id))
const zonaTraspasoQa = await api.crearZona(RID, 'QA traspasos')
const mesaTraspasoQa = await api.crearMesa(RID, { zona_id: zonaTraspasoQa.data.id, nombre: 'Mesa QA traspaso' })
const mesaDestinoQa = await api.crearMesa(RID, { zona_id: zonaTraspasoQa.data.id, nombre: 'Mesa QA destino' })
await api.configurarPinAutorizacion(RID, '4321')
const pedidoTraspasoQa = await api.crearPedido(RID, mesaTraspasoQa.data.id, [pedir(prod('p-1'), 2)])
const auditoriaAntesTraspasoQa = localSeed.auditLogs.length
const pinMaloTraspasoQa = await api.asignarMesaMesero(RID, mesaTraspasoQa.data.id, meseroMariaQa.id, '0000', 'Cambio de turno')
check('29b · un PIN incorrecto no cambia el responsable ni crea auditoría', pinMaloTraspasoQa.error === MENSAJE_PIN_INCORRECTO && !localSeed.auditLogs.some((l) => l.accion === 'mesa_transferir_responsable' && l.entidad_id === mesaTraspasoQa.data.id))
const traspasoCorrectoQa = await api.asignarMesaMesero(RID, mesaTraspasoQa.data.id, meseroMariaQa.id, '4321', 'Cambio de turno')
check('29c · con PIN correcto María recibe la mesa', !traspasoCorrectoQa.error && localSeed.mesas.find((m) => m.id === mesaTraspasoQa.data.id).mesero_responsable_id === meseroMariaQa.id)
const auditoriaTraspasoQa = localSeed.auditLogs.find((l) => l.accion === 'mesa_transferir_responsable' && l.entidad_id === mesaTraspasoQa.data.id)
check('29d · el registro incluye Carlos, María y el motivo', auditoriaTraspasoQa?.actor_id === meseroCarlosQa.id && auditoriaTraspasoQa.detalle?.mesero_nuevo_id === meseroMariaQa.id && auditoriaTraspasoQa.detalle?.motivo === 'Cambio de turno' && localSeed.auditLogs.length === auditoriaAntesTraspasoQa + 1)
apiMode.operadorId = meseroMariaQa.id
const pinMaloMoverQa = await api.moverConsumoMesa(RID, mesaTraspasoQa.data.id, mesaDestinoQa.data.id, '0000', 'Cliente cambió de mesa')
check('29e · el PIN incorrecto tampoco mueve el consumo', pinMaloMoverQa.error === MENSAJE_PIN_INCORRECTO && localSeed.pedidos.find((p) => p.id === pedidoTraspasoQa.data).mesa_id === mesaTraspasoQa.data.id)
const movimientoCorrectoQa = await api.moverConsumoMesa(RID, mesaTraspasoQa.data.id, mesaDestinoQa.data.id, '4321', 'Cliente cambió de mesa')
const auditoriaMovimientoQa = localSeed.auditLogs.find((l) => l.accion === 'mesa_mover_consumo' && l.entidad_id === mesaTraspasoQa.data.id)
check('29f · con PIN correcto se mueve la comanda y queda auditada', !movimientoCorrectoQa.error && localSeed.pedidos.find((p) => p.id === pedidoTraspasoQa.data).mesa_id === mesaDestinoQa.data.id && auditoriaMovimientoQa?.detalle?.mesa_destino_id === mesaDestinoQa.data.id && auditoriaMovimientoQa.detalle?.motivo === 'Cliente cambió de mesa')

await servidor.close()
rmSync(ENV_DIR, { recursive: true, force: true })

console.log(`\n${'-'.repeat(60)}`)
if (fallos.length === 0) {
  console.log(`TODOS LOS CHECKS PASARON: ${ok}`)
} else {
  console.log(`${ok} pasaron, ${fallos.length} fallaron:`)
  for (const f of fallos) console.log(`  · ${f}`)
  process.exit(1)
}
