export type EstadoFiltroVentas = 'todas' | 'pagada' | 'anulada'

export type RangoReporteVentas = {
  desde: string
  hasta: string
  estado: EstadoFiltroVentas
  busqueda: string
  offset: number
  limite: number
}

export type RangoReporteAdmin = {
  desde: string
  hasta: string
  estado: EstadoFiltroVentas
  mesero_id: string | null
  producto_id: string | null
  busqueda: string
  offset: number
  limite: number
}

export type ItemReporteVenta = {
  nombre: string
  cantidad: number
  precio_unitario: number
  total: number
  es_bebida: boolean
  anulado: boolean
  nota: string | null
}

export type PedidoReporteVenta = {
  pedido_id: string
  created_at: string
  mesa: string
  mesero: string
  items: ItemReporteVenta[]
}

export type CuentaReporteVenta = {
  id: string
  numero: string | null
  estado: 'pagada' | 'anulada'
  total: number
  propina: number | null
  vuelto: number | null
  metodo_pago: string
  pagado_at: string | null
  anulada_at: string | null
  motivo_anulacion: string | null
  monto_reembolsado: number | null
  created_at: string
  mesas: string
  meseros: string
  pagos: { metodo_pago: string; monto: number }[]
  pedidos: PedidoReporteVenta[]
}

export type ReporteVentas = {
  resumen: {
    ventas: number
    cuentas_pagadas: number
    cuentas_anuladas: number
    reembolsos: number
    neto: number
    propinas: number
    ticket_promedio: number
  }
  productos: { nombre: string; es_bebida: boolean; cantidad: number; total: number }[]
  meseros: { id: string; nombre: string; pedidos: number; unidades: number; ventas: number }[]
  mesas: { id: string; nombre: string; cuentas: number; ventas: number }[]
  ventas_por_dia: { fecha: string; ventas: number; cuentas: number }[]
  ventas_por_hora: { hora: string; ventas: number; cuentas: number }[]
  ventas_por_metodo: { metodo_pago: string; ventas: number; cuentas: number }[]
  cuentas: CuentaReporteVenta[]
  total_cuentas: number
}

export type ItemReporteAdmin = ItemReporteVenta & {
  id: string
  producto_id: string | null
  categoria_id: string | null
  categoria: string
  estacion: string | null
}

export type PedidoReporteAdmin = Omit<PedidoReporteVenta, 'items'> & {
  mesero_id: string | null
  zona: string | null
  items: ItemReporteAdmin[]
}

export type CuentaReporteAdmin = Omit<CuentaReporteVenta, 'pedidos'> & {
  fecha_operacion: string
  cantidad_productos: number
  pedidos: PedidoReporteAdmin[]
}

export type ReporteAdminDetallado = Omit<ReporteVentas, 'cuentas' | 'productos' | 'meseros'> & {
  cuentas: CuentaReporteAdmin[]
  productos: { id: string | null; nombre: string; categoria_id: string | null; categoria: string; es_bebida: boolean; cantidad: number; total: number }[]
  categorias: { id: string | null; categoria: string; cantidad: number; total: number }[]
  meseros: { id: string | null; nombre: string; cuentas: number; comandas: number; unidades: number; ventas: number; ticket_promedio: number; propinas: number }[]
  comandas_por_estacion: { estacion: string; comandas: number; unidades: number; ventas: number }[]
  productos_sin_ventas: { id: string; nombre: string; categoria_id: string | null; categoria: string; precio_actual: number; disponible: boolean }[]
}
