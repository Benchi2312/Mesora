/** Una precuenta es una fotografía del consumo abierto; no crea una cuenta ni un pago. */
type PedidoPrecuenta = { id: string; mesa_id: string; estado: string }
type ItemPrecuenta = {
  id: string
  pedido_id: string
  nombre_producto: string
  cantidad: number
  precio_unitario: number
  anulado?: boolean | null
}

export type Precuenta = {
  fecha: string
  mesaId: string
  mesaNombre: string
  pedidos: number
  items: (ItemPrecuenta & { importe: number })[]
  total: number
}

export function crearPrecuenta(
  mesa: { id: string; nombre: string },
  pedidos: readonly PedidoPrecuenta[],
  items: readonly ItemPrecuenta[],
  fecha = new Date().toISOString(),
): Precuenta {
  if (pedidos.some((p) => p.mesa_id !== mesa.id)) {
    throw new Error('La cuenta contiene pedidos de otra mesa. Actualiza antes de continuar.')
  }
  const ids = new Set(pedidos.filter((p) => p.estado !== 'anulado').map((p) => p.id))
  const vigentes = items.filter((it) => ids.has(it.pedido_id) && it.anulado !== true)
  if (!vigentes.length) throw new Error('Esta mesa ya no tiene consumo pendiente de cobro.')
  if (vigentes.some((it) => !Number.isInteger(it.cantidad) || it.cantidad <= 0 ||
    !Number.isFinite(it.precio_unitario) || it.precio_unitario < 0)) {
    throw new Error('Hay importes inválidos en la comanda. Revisa los pedidos antes de emitir la precuenta.')
  }
  const lineas = vigentes.map((it) => ({ ...it, importe: Math.round(it.cantidad * it.precio_unitario * 100) / 100 }))
  return {
    fecha,
    mesaId: mesa.id,
    mesaNombre: mesa.nombre,
    pedidos: new Set(vigentes.map((it) => it.pedido_id)).size,
    items: lineas,
    total: lineas.reduce((suma, it) => suma + Math.round(it.importe * 100), 0) / 100,
  }
}
