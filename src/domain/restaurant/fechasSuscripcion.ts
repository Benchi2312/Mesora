/** Fechas de suscripción expresadas como días naturales de Perú. */
const FECHA_PERU = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Lima',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

export function fechaEnPeru(valor: string | Date): string {
  const fecha = typeof valor === 'string' ? new Date(valor) : valor
  if (Number.isNaN(fecha.getTime())) return ''
  const partes = FECHA_PERU.formatToParts(fecha)
  const obtener = (tipo: Intl.DateTimeFormatPartTypes) => partes.find((parte) => parte.type === tipo)?.value ?? ''
  return `${obtener('year')}-${obtener('month')}-${obtener('day')}`
}

/** La fecha elegida permanece vigente hasta el último milisegundo de ese día en Perú. */
export function finDeDiaEnPeru(fecha: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw new Error('Fecha de vencimiento inválida.')
  const fin = new Date(`${fecha}T23:59:59.999-05:00`)
  if (Number.isNaN(fin.getTime()) || fechaEnPeru(fin) !== fecha) {
    throw new Error('Fecha de vencimiento inválida.')
  }
  return fin.toISOString()
}

export function diasCalendarioPeru(desde: string | Date, hasta: string | Date): number | null {
  const fechaDesde = fechaEnPeru(desde)
  const fechaHasta = fechaEnPeru(hasta)
  if (!fechaDesde || !fechaHasta) return null
  return (Date.parse(`${fechaHasta}T00:00:00Z`) - Date.parse(`${fechaDesde}T00:00:00Z`)) / 86_400_000
}
