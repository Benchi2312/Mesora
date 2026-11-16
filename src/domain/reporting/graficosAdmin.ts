import type { ReporteAdminDetallado } from './ventas'

export type MovimientoDiario = { fecha: string; cobrado: number; reembolsado: number; cuentas: number }

/** Une las dos series completas del RPC por fecha, sin depender del detalle paginado. */
export function movimientosPorDia(reporte: Pick<ReporteAdminDetallado, 'ventas_por_dia' | 'reembolsos_por_dia'>): MovimientoDiario[] {
  const dias = new Map<string, MovimientoDiario>()
  for (const fila of reporte.ventas_por_dia) {
    const dia = dias.get(fila.fecha) ?? { fecha: fila.fecha, cobrado: 0, reembolsado: 0, cuentas: 0 }
    dia.cobrado += fila.ventas
    dia.cuentas += fila.cuentas
    dias.set(fila.fecha, dia)
  }
  for (const fila of reporte.reembolsos_por_dia) {
    const dia = dias.get(fila.fecha) ?? { fecha: fila.fecha, cobrado: 0, reembolsado: 0, cuentas: 0 }
    dia.reembolsado += fila.reembolsos
    dias.set(fila.fecha, dia)
  }
  return [...dias.values()].sort((a, b) => a.fecha.localeCompare(b.fecha))
}
