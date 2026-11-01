import type { Cuenta, MetodoPago, Pago, Pedido, PedidoItem, Usuario } from '../../types/database'

export interface TopProducto {
  nombre: string
  cantidad: number
  total: number
}

export interface VentaMesero {
  meseroId: string
  nombre: string
  ventas: number
  pedidos: number
}

export interface VentaMetodo {
  metodo: MetodoPago | 'desconocido'
  total: number
  cuentas: number
}

export interface VentaHora {
  hora: string
  total: number
  cuentas: number
}

export interface MetricasAdmin {
  ventaHoy: number
  cuentasHoy: number
  ventaMes: number
  cuentasMes: number
  ticketPromedio: number
  /**
   * Propinas cobradas en el mes. NO son venta (no inflan la ventaMes ni el
   * margen), pero en efectivo sí entran a la gaveta, así que caja y reporte
   * necesitan verlas.
   */
  propinasMes: number
  /** Vuelto entregado en el mes: dinero que salió de la gaveta. */
  vueltoMes: number
  /**
   * Boletas anuladas del mes (las que se cobraron y después se devolvieron). No
   * son venta: ya salen de `ventaMes` porque solo se cuentan las 'pagada'. Se
   * muestran aparte para que el Admin vea por qué el turno cuadra con menos
   * plata de la que entró.
   */
  anulacionesMes: number
  /** Dinero devuelto por esas anulaciones en el mes (todos los métodos). */
  reembolsosMes: number
  topProductos: TopProducto[]
  porMesero: VentaMesero[]
  porMetodo: VentaMetodo[]
  porHora: VentaHora[]
}

function empezarDeDia(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

function mismoMes(iso: string, ref: Date): boolean {
  const d = new Date(iso)
  return d.getMonth() === ref.getMonth() && d.getFullYear() === ref.getFullYear()
}

/**
 * Calcula las métricas del dashboard del admin a partir de las cuentas
 * pagadas y sus pedidos/íems. Es la MISMA función que usan los datos reales
 * (Supabase) y el modo demo, garantizando resultados consistentes.
 *
 * `pagos` es el detalle por método (cuenta_pagos). Sin él se cae al método
 * principal de la cuenta, que es lo único que hay en las cuentas viejas; con
 * él, una cuenta dividida reparte su venta entre los métodos que la pagaron
 * (y el vuelto no se le carga a nadie, porque nunca fue una venta).
 */
export function computeMetricas(
  cuentas: ReadonlyArray<
    Pick<
      Cuenta,
      | 'id'
      | 'total'
      | 'metodo_pago'
      | 'estado'
      | 'pagado_at'
      | 'propina'
      | 'vuelto'
      | 'monto_reembolsado'
      | 'anulada_at'
    >
  >,
  pedidos: ReadonlyArray<Pick<Pedido, 'id' | 'mesero_id'>>,
  items: ReadonlyArray<Pick<PedidoItem, 'pedido_id' | 'nombre_producto' | 'cantidad' | 'precio_unitario'>>,
  usuarios: ReadonlyArray<Pick<Usuario, 'id' | 'nombre'>>,
  pagos: ReadonlyArray<Pick<Pago, 'cuenta_id' | 'metodo_pago' | 'monto'>> = [],
): MetricasAdmin {
  const ahora = new Date()

  const pagadas = cuentas.filter((c) => c.estado === 'pagada' && c.pagado_at)
  const hoy = empezarDeDia(ahora)

  const ventaHoy = pagadas
    .filter((c) => new Date(c.pagado_at as string).getTime() >= hoy)
    .reduce((acc, c) => acc + c.total, 0)
  const cuentasHoy = pagadas.filter((c) => new Date(c.pagado_at as string).getTime() >= hoy).length

  const delMes = pagadas.filter((c) => mismoMes(c.pagado_at as string, ahora))
  const ventaMes = delMes.reduce((acc, c) => acc + c.total, 0)
  const cuentasMes = delMes.length
  const ticketPromedio = cuentasMes > 0 ? ventaMes / cuentasMes : 0
  const propinasMes = c2(delMes.reduce((acc, c) => acc + (c.propina ?? 0), 0))
  const vueltoMes = c2(delMes.reduce((acc, c) => acc + (c.vuelto ?? 0), 0))

  // Boletas anuladas: por `anulada_at` (cuándo se anuló, no cuándo se cobró),
  // porque el efecto en la gaveta ocurre al anular.
  const anuladas = cuentas.filter((c) => c.estado === 'anulada' && c.anulada_at && mismoMes(c.anulada_at, ahora))
  const anulacionesMes = anuladas.length
  const reembolsosMes = c2(anuladas.reduce((acc, c) => acc + (c.monto_reembolsado ?? 0), 0))

  // Productos más vendidos (solo de cuentas pagadas)
  const pedidoIdsPagados = new Set(pedidos.map((p) => p.id))
  const porProducto = new Map<string, TopProducto>()
  for (const it of items) {
    if (!pedidoIdsPagados.has(it.pedido_id)) continue
    const cur = porProducto.get(it.nombre_producto) ?? { nombre: it.nombre_producto, cantidad: 0, total: 0 }
    cur.cantidad += it.cantidad
    cur.total += it.cantidad * it.precio_unitario
    porProducto.set(it.nombre_producto, cur)
  }
  const topProductos = [...porProducto.values()]
    .sort((a, b) => b.cantidad - a.cantidad || b.total - a.total)
    .slice(0, 5)

  // Ventas por mesero
  const subtotalPorPedido = new Map<string, number>()
  for (const it of items) {
    subtotalPorPedido.set(it.pedido_id, (subtotalPorPedido.get(it.pedido_id) ?? 0) + it.cantidad * it.precio_unitario)
  }
  const nombreMesero = new Map(usuarios.map((u) => [u.id, u.nombre]))
  const porMesero = new Map<string, VentaMesero>()
  for (const p of pedidos) {
    const sub = subtotalPorPedido.get(p.id)
    if (sub === undefined) continue
    const cur = porMesero.get(p.mesero_id) ?? {
      meseroId: p.mesero_id,
      nombre: nombreMesero.get(p.mesero_id) ?? '—',
      ventas: 0,
      pedidos: 0,
    }
    cur.ventas += sub
    cur.pedidos += 1
    porMesero.set(p.mesero_id, cur)
  }
  const ventasPorMesero = [...porMesero.values()].sort((a, b) => b.ventas - a.ventas)

  // Métodos de pago
  const pagosPorCuenta = new Map<string, Pick<Pago, 'metodo_pago' | 'monto'>[]>()
  for (const p of pagos) {
    const arr = pagosPorCuenta.get(p.cuenta_id) ?? []
    arr.push(p)
    pagosPorCuenta.set(p.cuenta_id, arr)
  }
  const porMetodoMap = new Map<string, VentaMetodo>()
  // Este desglose acompaña al resumen mensual del CSV; mantenerlo en el mismo
  // periodo evita mezclar cuentas históricas con `ventaMes` al cambiar de mes.
  for (const c of delMes) {
    const partes = pagosPorCuenta.get(c.id)
    if (partes && partes.length > 0) {
      // Los pagos pueden incluir propina y el efectivo puede incluir vuelto.
      // Reparte solo el valor de la cuenta entre métodos, proporcionalmente.
      const recibidoPorMetodo = new Map<string, number>()
      for (const parte of partes) {
        const recibido = Math.max(0, parte.monto - (parte.metodo_pago === 'efectivo' ? (c.vuelto ?? 0) : 0))
        recibidoPorMetodo.set(parte.metodo_pago, (recibidoPorMetodo.get(parte.metodo_pago) ?? 0) + recibido)
      }
      const recibidoTotal = [...recibidoPorMetodo.values()].reduce((s, n) => s + n, 0)
      if (recibidoTotal <= 0) continue
      const repartos = [...recibidoPorMetodo.entries()].sort((a, b) => b[1] - a[1])
      let asignado = 0
      repartos.forEach(([metodo, recibido], indice) => {
        const venta = indice === repartos.length - 1
          ? c2(c.total - asignado)
          : c2(c.total * recibido / recibidoTotal)
        asignado += venta
        const cur = porMetodoMap.get(metodo) ?? { metodo: metodo as MetodoPago, total: 0, cuentas: 0 }
        cur.total = c2(cur.total + venta)
        cur.cuentas += 1
        porMetodoMap.set(metodo, cur)
      })
      continue
    }
    const cur = porMetodoMap.get(c.metodo_pago) ?? { metodo: c.metodo_pago, total: 0, cuentas: 0 }
    cur.total += c.total
    cur.cuentas += 1
    porMetodoMap.set(c.metodo_pago, cur)
  }
  const porMetodo = [...porMetodoMap.values()].sort((a, b) => b.total - a.total)

  // Horarios pico
  const porHoraMap = new Map<string, VentaHora>()
  for (const c of delMes) {
    const h = new Date(c.pagado_at as string).getHours()
    const key = `${String(h).padStart(2, '0')}:00`
    const cur = porHoraMap.get(key) ?? { hora: key, total: 0, cuentas: 0 }
    cur.total += c.total
    cur.cuentas += 1
    porHoraMap.set(key, cur)
  }
  const porHora = [...porHoraMap.values()].sort((a, b) => a.hora.localeCompare(b.hora))

  return {
    ventaHoy,
    cuentasHoy,
    ventaMes,
    cuentasMes,
    ticketPromedio,
    propinasMes,
    vueltoMes,
    anulacionesMes,
    reembolsosMes,
    topProductos,
    porMesero: ventasPorMesero,
    porMetodo,
    porHora,
  }
}

/** Redondeo a 2 decimales (los soles no tienen centavos menores a 1/100). */
function c2(n: number): number {
  return Math.round(n * 100) / 100
}
