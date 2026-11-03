const formatter = new Intl.NumberFormat('es-PE', {
  style: 'currency',
  currency: 'PEN',
})

export function fmtPEN(n: number): string {
  return formatter.format(Number.isFinite(n) ? n : 0)
}

export function fmtFecha(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('es-PE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Una fecha de vencimiento se muestra como día natural en Perú. */
export function fmtFechaVencimiento(iso: string | null | undefined): string {
  if (!iso) return '—'
  const fecha = new Date(iso)
  if (Number.isNaN(fecha.getTime())) return '—'
  return fecha.toLocaleDateString('es-PE', {
    timeZone: 'America/Lima', day: '2-digit', month: '2-digit', year: 'numeric',
  })
}

/** Solo la hora y los minutos: para las boletas del día, donde la fecha no aporta. */
export function fmtHora(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })
}

const ETIQUETA_ESTADO: Record<string, string> = {
  pendiente: 'Pendiente',
  en_preparacion: 'En preparación',
  listo: 'Listo',
  entregado: 'Entregado',
  anulado: 'Anulada',
}

/** Nombre legible del estado de una comanda (única fuente: el mesero y la cocina). */
export function estadoPedidoLabel(estado: string): string {
  return ETIQUETA_ESTADO[estado] ?? estado
}
