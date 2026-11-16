import type { EstadoFiltroVentas, RangoReporteAdmin } from './ventas'

export const ZONA_HORARIA_REPORTES = 'America/Lima'

export type RangoFechas = { desde: string; hasta: string }
export type PeriodoRapido = 'hoy' | 'ultimos7' | 'esteMes' | 'mesAnterior' | 'mesSeleccionado' | 'personalizado'

function fechaCalendarioEnZona(date: Date, zona = ZONA_HORARIA_REPORTES): string {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date)
  const mapa = Object.fromEntries(partes.map((parte) => [parte.type, parte.value]))
  return `${mapa.year}-${mapa.month}-${mapa.day}`
}

export function sumarDiasCalendario(fecha: string, dias: number): string {
  const [year, month, day] = fecha.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day + dias))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
}

export function diasEntreFechas(desde: string, hastaExclusivo: string): number {
  const [y1, m1, d1] = desde.split('-').map(Number)
  const [y2, m2, d2] = hastaExclusivo.split('-').map(Number)
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000)
}

/** Convierte medianoche civil de una zona a instante UTC, sin asumir la zona del navegador. */
export function inicioDeDiaEnZona(fecha: string, zona = ZONA_HORARIA_REPORTES): string {
  const [year, month, day] = fecha.split('-').map(Number)
  const objetivoLocal = Date.UTC(year, month - 1, day)
  let candidato = objetivoLocal
  for (let intento = 0; intento < 4; intento++) {
    const partes = new Intl.DateTimeFormat('en-CA', {
      timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date(candidato))
    const mapa = Object.fromEntries(partes.map((parte) => [parte.type, Number(parte.value)]))
    const representadoLocal = Date.UTC(mapa.year, mapa.month - 1, mapa.day, mapa.hour, mapa.minute, mapa.second)
    const diferencia = representadoLocal - objetivoLocal
    if (diferencia === 0) break
    candidato -= diferencia
  }
  return new Date(candidato).toISOString()
}

export function fechaDeHoy(zona = ZONA_HORARIA_REPORTES, ahora = new Date()): string {
  return fechaCalendarioEnZona(ahora, zona)
}

export function rangoRapido(periodo: PeriodoRapido, hoy = fechaDeHoy(), mes = hoy.slice(0, 7), personalizado?: RangoFechas): RangoFechas {
  const inicioMes = `${mes}-01`
  if (periodo === 'hoy') return { desde: hoy, hasta: hoy }
  if (periodo === 'ultimos7') return { desde: sumarDiasCalendario(hoy, -6), hasta: hoy }
  if (periodo === 'esteMes') return { desde: `${hoy.slice(0, 7)}-01`, hasta: hoy }
  if (periodo === 'mesAnterior') {
    const primerDiaEsteMes = `${hoy.slice(0, 7)}-01`
    const finAnterior = sumarDiasCalendario(primerDiaEsteMes, -1)
    return { desde: `${finAnterior.slice(0, 7)}-01`, hasta: finAnterior }
  }
  if (periodo === 'mesSeleccionado') {
    const primerDiaSiguiente = sumarDiasCalendario(inicioMes, 32).slice(0, 7) + '-01'
    return { desde: inicioMes, hasta: sumarDiasCalendario(primerDiaSiguiente, -1) }
  }
  return personalizado ?? { desde: hoy, hasta: hoy }
}

export function rangoUtc(rango: RangoFechas, zona = ZONA_HORARIA_REPORTES): { desde: string; hasta: string } {
  return {
    desde: inicioDeDiaEnZona(rango.desde, zona),
    hasta: inicioDeDiaEnZona(sumarDiasCalendario(rango.hasta, 1), zona),
  }
}

export function periodoAnterior(rango: RangoFechas): RangoFechas {
  if (rango.desde.endsWith('-01')) {
    const primerDiaSiguiente = sumarDiasCalendario(rango.desde, 32).slice(0, 7) + '-01'
    if (sumarDiasCalendario(primerDiaSiguiente, -1) === rango.hasta) {
      const finMesAnterior = sumarDiasCalendario(rango.desde, -1)
      return { desde: `${finMesAnterior.slice(0, 7)}-01`, hasta: finMesAnterior }
    }
  }
  const finExclusivo = sumarDiasCalendario(rango.hasta, 1)
  const dias = Math.max(1, diasEntreFechas(rango.desde, finExclusivo))
  return { desde: sumarDiasCalendario(rango.desde, -dias), hasta: sumarDiasCalendario(rango.desde, -1) }
}

export function rangoApi(rango: RangoFechas, filtros: {
  estado?: EstadoFiltroVentas; mesero_id?: string | null; producto_id?: string | null
  busqueda?: string; offset?: number; limite?: number; zona?: string
} = {}): RangoReporteAdmin {
  const utc = rangoUtc(rango, filtros.zona)
  return {
    ...utc,
    estado: filtros.estado ?? 'todas',
    mesero_id: filtros.mesero_id ?? null,
    producto_id: filtros.producto_id ?? null,
    busqueda: filtros.busqueda ?? '',
    offset: filtros.offset ?? 0,
    limite: filtros.limite ?? 25,
  }
}

export function nombrePeriodoArchivo(rango: RangoFechas): string {
  if (rango.desde.endsWith('-01')) {
    const siguiente = sumarDiasCalendario(rango.desde, 32).slice(0, 7) + '-01'
    if (sumarDiasCalendario(siguiente, -1) === rango.hasta) return rango.desde.slice(0, 7)
  }
  return `${rango.desde}-a-${rango.hasta}`
}

export type CsvValor = string | number | null | undefined

function protegerFormula(valor: string): string {
  return /^[\s]*[=+@\-\t\r]/.test(valor) ? `'${valor}` : valor
}

function celdaCsv(valor: CsvValor): string {
  if (valor == null) return ''
  const texto = typeof valor === 'number' && Number.isFinite(valor)
    ? valor.toFixed(2).replace('.', ',')
    : protegerFormula(String(valor))
  return `"${texto.replace(/"/g, '""')}"`
}

/** CSV delimitado por punto y coma, BOM UTF-8 y decimal con coma para Excel en español. */
export function crearCsv(columnas: string[], filas: CsvValor[][]): string {
  const contenido = [columnas, ...filas].map((fila) => fila.map(celdaCsv).join(';')).join('\r\n')
  return `\uFEFF${contenido}\r\n`
}

export function crearNombreCsv(tipo: string, rango: RangoFechas): string {
  return `mesora-${tipo}-${nombrePeriodoArchivo(rango)}.csv`
}
