import type { EstacionComanda, PedidoItem, Producto } from '../../types/database'
export type { EstacionComanda } from '../../types/database'

export const ESTACIONES_COMANDA: readonly EstacionComanda[] = ['cocina', 'bar', 'otros']

export const NOMBRES_ESTACION_COMANDA: Record<EstacionComanda, string> = {
  cocina: 'Cocina',
  bar: 'Bar',
  otros: 'Otros',
}

export const ANCHOS_PAPEL_COMANDA = [58, 80] as const
export type AnchoPapelComanda = (typeof ANCHOS_PAPEL_COMANDA)[number]

export type EstadoImpresionComanda = 'preparando' | 'enviado' | 'impreso' | 'reimpresion'

export const ETIQUETAS_ESTADO_IMPRESION: Record<EstadoImpresionComanda, string> = {
  preparando: 'Preparando impresión',
  enviado: 'Enviado a la impresora',
  impreso: 'Impresión confirmada',
  reimpresion: 'Reimpresión',
}

/** Mantiene los productos existentes: bebidas van a bar y el resto a cocina. */
export function estacionDeProducto(
  producto: Pick<Producto, 'estacion' | 'es_bebida'> | Pick<PedidoItem, 'estacion' | 'es_bebida'>,
): EstacionComanda {
  const estacion = producto.estacion
  if (estacion === 'cocina' || estacion === 'bar' || estacion === 'otros') return estacion
  return producto.es_bebida === true ? 'bar' : 'cocina'
}

export function itemsDeEstacion<T extends Pick<PedidoItem, 'estacion' | 'es_bebida'>>(
  items: readonly T[],
  estacion: EstacionComanda,
): T[] {
  return items.filter((item) => estacionDeProducto(item) === estacion)
}

export function validarMotivoReimpresion(motivo: string): boolean {
  const limpio = motivo.trim()
  return limpio.length >= 5 && limpio.length <= 300
}

export const MENSAJE_IMPRESION_NO_CONFIRMADA =
  'La comanda fue registrada, pero no se pudo confirmar la impresión.'
