import { jsPDF } from 'jspdf'
import { fmtFecha, fmtPEN } from '../../lib/format'
import type { Precuenta } from './precuenta'

export function descargarPrecuentaPdf(precuenta: Precuenta, local: {
  nombre: string; direccion?: string | null; ruc?: string | null; telefono?: string | null
}) {
  const doc = new jsPDF({ unit: 'mm', format: 'a5' })
  const ancho = doc.internal.pageSize.getWidth()
  const alto = doc.internal.pageSize.getHeight()
  const margen = 12
  let y = 15
  const texto = (valor: string, size = 9, negrita = false, centro = false) => {
    doc.setFont('helvetica', negrita ? 'bold' : 'normal')
    doc.setFontSize(size)
    const lineas = doc.splitTextToSize(valor, ancho - margen * 2) as string[]
    for (const linea of lineas) {
      if (y > alto - 15) { doc.addPage(); y = 15 }
      doc.text(linea, centro ? ancho / 2 : margen, y, centro ? { align: 'center' } : undefined)
      y += size * 0.45 + 1
    }
  }
  texto(local.nombre, 14, true, true)
  if (local.direccion) texto(local.direccion, 8, false, true)
  if (local.ruc) texto(`RUC: ${local.ruc}`, 8, false, true)
  if (local.telefono) texto(`Tel.: ${local.telefono}`, 8, false, true)
  y += 4
  texto('PRECUENTA', 13, true, true)
  texto('CONSUMO PENDIENTE DE PAGO', 9, true, true)
  texto('No es un comprobante de pago.', 8, false, true)
  y += 4
  texto(`Mesa: ${precuenta.mesaNombre}`)
  texto(`Emitida: ${fmtFecha(precuenta.fecha)}`)
  texto(`Comandas pendientes: ${precuenta.pedidos}`)
  y += 4
  for (const it of precuenta.items) {
    // Cada renglón se envuelve y pagina: también nombres largos y consumos extensos.
    texto(`${it.cantidad} x ${it.nombre_producto}`, 9, true)
    texto(`Precio unitario: ${fmtPEN(it.precio_unitario)}    Importe: ${fmtPEN(it.importe)}`, 8)
    y += 2
  }
  y += 3
  texto(`TOTAL CONSUMO: ${fmtPEN(precuenta.total)}`, 12, true)
  texto('Propina no incluida. Verifica el consumo antes de pagar.', 8)
  texto('Importes al momento de emisión; nuevos pedidos pueden modificar el total.', 8)
  y += 4
  texto('Generado con Mesora', 8, false, true)
  const mesa = precuenta.mesaNombre.replace(/[^a-z0-9_-]+/gi, '-').slice(0, 60)
  doc.save(`precuenta-${mesa}-${precuenta.fecha.slice(0, 10)}.pdf`)
}
