import { computeMetricas, type MetricasAdmin } from './metricas'
import type { Cuenta, MetodoPago } from '../types/database'
import { METODOS_PAGO } from '../types/database'

/**
 * Exporta a CSV los datos del dashboard para que el administrador los abra en
 * Excel/Sheets. Todo se arma en el navegador (sin librería): el CSV es texto
 * plano con separador `;`, que es el que Excel en español abre sin asistente
 * de importación.
 *
 * Por qué `;` y no `,`: en es-PE la coma es separador decimal, así que un CSV
 * con `,` pone "12,50" en dos columnas y el monto se pierde.
 */

/** Escapa un valor para CSV: comillas dobles, separadores y saltos de línea. */
function celda(valor: unknown): string {
  const texto = valor == null ? '' : String(valor)
  // Se entrecomilla si contiene el separador (`;`), una coma (que en es-PE es
  // separador decimal y rompería la columna), comillas o salto de línea.
  const escapado = texto.replace(/"/g, '""')
  return /[";,\n\r]/.test(texto) ? `"${escapado}"` : escapado
}

/** Redondea a 2 decimales y devuelve string (los floats no deben ir sueltos). */
function dinero(valor: number): string {
  return (Math.round(valor * 100) / 100).toFixed(2)
}

function linea(celdas: readonly unknown[]): string {
  return celdas.map(celda).join(';')
}

/** UTF-8 BOM: sin él, Excel abre los acentos ("Ceviche à la") rotos. */
const BOM = '\uFEFF'

export type ReporteVentas = {
  generadoEn: string
  restauranteNombre: string
  metricas: MetricasAdmin
  /** Ventas por día, para el reporte tener una columna temporal. */
  ventasPorDia: { fecha: string; total: number; cuentas: number }[]
  /** Total de propinas cobradas (no son venta). */
  propinas: number
  /** Total de vuelto entregado (sale de la gaveta). */
  vuelto: number
}

const ETIQUETA_METODO: Record<string, string> = {
  efectivo: 'Efectivo',
  tarjeta: 'Tarjeta',
  yape_plin: 'Yape / Plin',
  otro: 'Otro',
}

/**
 * Arma el reporte a partir de las cuentas pagadas (la misma fuente que el
 * dashboard) y de las métricas ya calculadas.
 */
export function construirReporte(
  restauranteNombre: string,
  cuentas: ReadonlyArray<
    Pick<Cuenta, 'id' | 'total' | 'metodo_pago' | 'estado' | 'pagado_at' | 'created_at' | 'propina' | 'vuelto'>
  >,
  metricas: MetricasAdmin,
  ahora: Date = new Date(),
): ReporteVentas {
  const pagadas = cuentas.filter((c) => c.estado === 'pagada' && c.pagado_at)

  // Agrupar por día local (no por UTC): "la venta del lunes" es del lunes aquí.
  const porDia = new Map<string, { total: number; cuentas: number }>()
  for (const c of pagadas) {
    const d = new Date(c.pagado_at as string)
    const clave = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const cur = porDia.get(clave) ?? { total: 0, cuentas: 0 }
    cur.total += c.total
    cur.cuentas += 1
    porDia.set(clave, cur)
  }

  const ventasPorDia = [...porDia.entries()]
    .map(([fecha, v]) => ({ fecha, total: v.total, cuentas: v.cuentas }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha))

  // Propinas y vueltos salen de las métricas (misma fuente que el dashboard):
  // no son venta, pero el admin necesita ver cuánto se repartió y cuánto salió
  // de la gaveta por dar cambio.
  return {
    generadoEn: ahora.toISOString(),
    restauranteNombre,
    metricas,
    ventasPorDia,
    propinas: metricas.propinasMes,
    vuelto: metricas.vueltoMes,
  }
}

/** Texto CSV completo (sin BOM): el mismo contenido para descargar o previsualizar. */
export function reporteACsv(reporte: ReporteVentas): string {
  const m = reporte.metricas
  const filas: string[] = []

  filas.push(linea(['REPORTE DE VENTAS', reporte.restauranteNombre]))
  filas.push(linea(['Generado', new Date(reporte.generadoEn).toLocaleString('es-PE')]))
  filas.push('')

  // --- Resumen
  filas.push(linea(['RESUMEN']))
  filas.push(linea(['Indicador', 'Valor']))
  filas.push(linea(['Venta de hoy', dinero(m.ventaHoy)]))
  filas.push(linea(['Cuentas de hoy', m.cuentasHoy]))
  filas.push(linea(['Venta del mes', dinero(m.ventaMes)]))
  filas.push(linea(['Cuentas del mes', m.cuentasMes]))
  filas.push(linea(['Ticket promedio', dinero(m.ticketPromedio)]))
  filas.push(linea(['Propinas (no son venta)', dinero(reporte.propinas)]))
  filas.push(linea(['Vuelto entregado', dinero(reporte.vuelto)]))
  filas.push('')

  // --- Ventas por día
  filas.push(linea(['VENTAS POR DÍA']))
  filas.push(linea(['Fecha', 'Total', 'Cuentas']))
  for (const d of reporte.ventasPorDia) filas.push(linea([d.fecha, dinero(d.total), d.cuentas]))
  filas.push('')

  // --- Métodos de pago (en el orden de la whitelist, no por monto)
  filas.push(linea(['MÉTODOS DE PAGO']))
  filas.push(linea(['Método', 'Total', 'Cuentas']))
  for (const metodo of METODOS_PAGO) {
    const fila = m.porMetodo.find((x) => x.metodo === metodo)
    filas.push(linea([ETIQUETA_METODO[metodo] ?? metodo, dinero(fila?.total ?? 0), fila?.cuentas ?? 0]))
  }
  filas.push('')

  // --- Horarios pico
  filas.push(linea(['HORARIOS PICO']))
  filas.push(linea(['Hora', 'Total', 'Cuentas']))
  for (const h of m.porHora) filas.push(linea([h.hora, dinero(h.total), h.cuentas]))
  filas.push('')

  // --- Top productos
  filas.push(linea(['TOP PRODUCTOS']))
  filas.push(linea(['Producto', 'Unidades', 'Total']))
  for (const p of m.topProductos) filas.push(linea([p.nombre, p.cantidad, dinero(p.total)]))
  filas.push('')

  // --- Ventas por mesero
  filas.push(linea(['VENTAS POR MESERO']))
  filas.push(linea(['Mesero', 'Pedidos', 'Ventas']))
  for (const v of m.porMesero) filas.push(linea([v.nombre, v.pedidos, dinero(v.ventas)]))

  return filas.join('\r\n')
}

/** Nombre de archivo con sello de fecha: reportes-2026-09-21.csv */
export function nombreArchivoReporte(generadoEn: string): string {
  return `reporte-ventas-${generadoEn.slice(0, 10)}.csv`
}

/**
 * Dispara la descarga del CSV. Se hace con Blob + enlace temporal en vez de
 * `data:` porque some navegadores recortan los URIs data largos.
 */
export function descargarReporte(reporte: ReporteVentas): void {
  const csv = BOM + reporteACsv(reporte)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombreArchivoReporte(reporte.generadoEn)
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // Liberar el object URL: si no, el blob queda retenido en memoria.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

/** Reexportado por comodidad: el dashboard ya lo importa. */
export { computeMetricas }
export type { MetodoPago }
