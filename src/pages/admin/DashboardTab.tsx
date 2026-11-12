import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { getApi } from '../../lib/api'
import { useCurrentContext } from '../../lib/useCurrentContext'
import { fmtFecha, fmtPEN } from '../../lib/format'
import { METODOS_PAGO_LABEL } from '../../domain/cashier/pagos'
import type { MetricasAdmin } from '../../domain/reporting/metricas'
import type { ReporteVentas } from '../../domain/reporting/ventas'
import { construirReporte, descargarReporte } from '../../domain/reporting/reporte'
import type { MetodoPago } from '../../types/database'
import { Spinner } from '../../components/LoadingScreen'
import EstadoVacio from '../../components/EstadoVacio'

const METODO_LABEL: Record<MetodoPago | 'desconocido', string> = {
  ...METODOS_PAGO_LABEL,
  desconocido: '—',
}
const PALETA_AVATAR = ['#f59e0b', '#6366f1', '#10b981', '#8b5cf6', '#ec4899', '#14b8a6']
type Periodo = 'hoy' | '7dias' | 'mes' | 'personalizado'

function fechaLimaHoy() {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date())
  const p = Object.fromEntries(partes.map((x) => [x.type, x.value]))
  return `${p.year}-${p.month}-${p.day}`
}

function sumarDias(fecha: string, cantidad: number) {
  const d = new Date(`${fecha}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + cantidad)
  return d.toISOString().slice(0, 10)
}

function primerDiaMes(fecha: string) { return `${fecha.slice(0, 7)}-01` }
function isoInicioLima(fecha: string) { return new Date(`${fecha}T00:00:00-05:00`).toISOString() }
function nombrePeriodo(periodo: Periodo, desde: string, hasta: string) {
  if (periodo === 'hoy') return 'Hoy'
  if (periodo === '7dias') return 'Últimos 7 días'
  if (periodo === 'mes') return 'Este mes'
  return desde === hasta ? fmtFecha(isoInicioLima(desde)) : `${desde} a ${hasta}`
}

function hashStr(s: string) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h
}
function colorDe(nombre: string) { return PALETA_AVATAR[hashStr(nombre) % PALETA_AVATAR.length] }
function iniciales(nombre: string) {
  return nombre.split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]?.toUpperCase() ?? '').join('')
}

export default function DashboardTab() {
  const { restaurante } = useCurrentContext()
  const rid = restaurante?.id
  const hoy = fechaLimaHoy()
  const [periodo, setPeriodo] = useState<Periodo>('mes')
  const [fechaDesde, setFechaDesde] = useState(primerDiaMes(hoy))
  const [fechaHasta, setFechaHasta] = useState(hoy)
  const [reporte, setReporte] = useState<ReporteVentas | null>(null)
  const [metricasCsv, setMetricasCsv] = useState<MetricasAdmin | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [errorCsv, setErrorCsv] = useState<string | null>(null)
  const [actualizado, setActualizado] = useState<Date | null>(null)
  const [exportando, setExportando] = useState(false)
  const [avisoExport, setAvisoExport] = useState<string | null>(null)

  const rango = useMemo(() => {
    const hoyActual = fechaLimaHoy()
    const desde = periodo === 'hoy' ? hoyActual
      : periodo === '7dias' ? sumarDias(hoyActual, -6)
        : periodo === 'mes' ? primerDiaMes(hoyActual) : fechaDesde
    const hasta = periodo === 'personalizado' ? fechaHasta : hoyActual
    return { desde, hasta, desdeIso: isoInicioLima(desde), hastaIso: isoInicioLima(sumarDias(hasta, 1)) }
  }, [periodo, fechaDesde, fechaHasta])

  useEffect(() => {
    if (!rid) { setCargando(false); return }
    let activo = true
    setCargando(true)
    setError(null)
    if (rango.desde > rango.hasta) {
      setError('La fecha final debe ser igual o posterior a la fecha inicial.')
      setCargando(false)
      return () => { activo = false }
    }
    void getApi().getReporteVentas(rid, {
      desde: rango.desdeIso, hasta: rango.hastaIso, estado: 'todas', busqueda: '', offset: 0, limite: 1,
    }).then((res) => {
      if (!activo) return
      if (res.error) setError(res.error)
      else { setReporte(res.data); setActualizado(new Date()) }
      setCargando(false)
    })
    return () => { activo = false }
  }, [rid, rango])

  // El CSV mantiene su alcance histórico (mes actual) y se etiqueta así para
  // que no se confunda con el periodo elegido para las tarjetas del Dashboard.
  useEffect(() => {
    if (!rid) return
    let activo = true
    void getApi().getMetricasAdmin(rid).then(({ data, error: err }) => {
      if (!activo) return
      setMetricasCsv(err ? null : data)
      setErrorCsv(err)
    })
    return () => { activo = false }
  }, [rid])

  const diasGrafica = useMemo(() => {
    if (!reporte) return []
    const diasEnRango = Math.floor((Date.parse(`${rango.hasta}T12:00:00Z`) - Date.parse(`${rango.desde}T12:00:00Z`)) / 86_400_000) + 1
    // Evita crear miles de botones en rangos históricos extensos; en ese caso
    // mostramos los días con ventas que ya devuelve el reporte.
    if (diasEnRango > 370) return reporte.ventas_por_dia
    const mapa = new Map(reporte.ventas_por_dia.map((d) => [d.fecha, d]))
    const dias: { fecha: string; ventas: number; cuentas: number }[] = []
    let actual = rango.desde
    while (actual <= rango.hasta) {
      dias.push(mapa.get(actual) ?? { fecha: actual, ventas: 0, cuentas: 0 })
      actual = sumarDias(actual, 1)
    }
    return dias
  }, [reporte, rango.desde, rango.hasta])

  const resumen = reporte?.resumen
  const maxDia = Math.max(...diasGrafica.map((d) => d.ventas), 1)
  const maxHora = Math.max(...(reporte?.ventas_por_hora ?? []).map((h) => h.ventas), 1)
  const maxMetodo = Math.max(...(reporte?.ventas_por_metodo ?? []).map((m) => m.ventas), 1)

  const elegirPeriodo = (valor: Periodo) => {
    const hoyActual = fechaLimaHoy()
    setPeriodo(valor)
    if (valor === 'personalizado') {
      setFechaDesde(primerDiaMes(hoyActual))
      setFechaHasta(hoyActual)
    }
  }

  async function exportarCsv() {
    if (!restaurante || !metricasCsv) return
    setExportando(true)
    setAvisoExport(null)
    const { data: cuentas, error: apiErr } = await getApi().getCuentasPagadas(restaurante.id)
    if (apiErr) {
      setAvisoExport(`No se pudo generar el reporte: ${apiErr}`)
      setExportando(false)
      return
    }
    const ahora = new Date()
    const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1).getTime()
    const inicioMesSiguiente = new Date(ahora.getFullYear(), ahora.getMonth() + 1, 1).getTime()
    const cuentasDelMes = (cuentas ?? []).filter((cuenta) => {
      if (!cuenta.pagado_at) return false
      const pago = Date.parse(cuenta.pagado_at)
      return pago >= inicioMes && pago < inicioMesSiguiente
    })
    descargarReporte(construirReporte(restaurante.nombre, cuentasDelMes, metricasCsv))
    setExportando(false)
    setAvisoExport('CSV mensual descargado.')
  }

  function imprimirReporte() {
    document.body.classList.add('imprimir-reporte')
    const limpiar = () => document.body.classList.remove('imprimir-reporte')
    window.addEventListener('afterprint', limpiar, { once: true })
    window.print()
    setTimeout(limpiar, 1000)
  }

  if (cargando && !reporte)
    return <div className="flex justify-center py-16"><Spinner /></div>

  if (error && !reporte)
    return <div className="aviso border-danger-500/40 bg-danger-500/10 text-danger-500">No se pudo cargar el Dashboard. {error}</div>

  return (
    <div className="space-y-6">
      <div className="card space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm text-zinc-300">Periodo: <strong className="text-zinc-100">{nombrePeriodo(periodo, rango.desde, rango.hasta)}</strong></p>
            <p className="mt-1 text-xs text-zinc-500">Hora local de Lima{actualizado ? ` · Actualizado a las ${new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit' }).format(actualizado)}` : ''}{cargando ? ' · Actualizando…' : ''}</p>
          </div>
          <div className="no-print flex flex-wrap gap-2">
            <button type="button" data-guia="exportar-csv" onClick={() => void exportarCsv()} disabled={exportando || !metricasCsv} title="El CSV contiene el mes en curso" className="btn btn-outline min-h-11 px-3 disabled:opacity-50 sm:px-4">{exportando ? 'Generando…' : 'Exportar CSV del mes'}</button>
            <button type="button" onClick={imprimirReporte} className="btn btn-outline min-h-11 px-3 sm:px-4">Imprimir</button>
          </div>
        </div>

        <div className="no-print flex flex-wrap gap-2 border-t border-surface-800 pt-4" role="group" aria-label="Periodo del Dashboard">
          {([['hoy', 'Hoy'], ['7dias', 'Últimos 7 días'], ['mes', 'Este mes'], ['personalizado', 'Fechas']] as const).map(([id, texto]) => (
            <button key={id} type="button" aria-pressed={periodo === id} onClick={() => elegirPeriodo(id)} className={`btn min-h-11 px-4 ${periodo === id ? 'btn-primary' : 'btn-outline'}`}>{texto}</button>
          ))}
          {periodo === 'personalizado' && <div className="flex flex-wrap items-center gap-2">
            <label className="label mb-0 flex items-center gap-2">Desde<input className="input min-h-11 w-auto" type="date" value={fechaDesde} max={fechaHasta} onChange={(e) => setFechaDesde(e.target.value)} /></label>
            <label className="label mb-0 flex items-center gap-2">Hasta<input className="input min-h-11 w-auto" type="date" value={fechaHasta} min={fechaDesde} max={fechaLimaHoy()} onChange={(e) => setFechaHasta(e.target.value)} /></label>
          </div>}
        </div>
        {error && <p role="alert" className="text-sm text-danger-400">No se pudo actualizar este periodo: {error}</p>}
        {errorCsv && <p className="text-xs text-zinc-500">La exportación CSV no está disponible ahora.</p>}
      </div>

      {avisoExport && <p role="status" className={`no-print aviso ${avisoExport.startsWith('No se pudo') ? 'border-danger-500/40 bg-danger-500/10 text-danger-500' : 'border-ok-500/40 bg-ok-500/10 text-ok-500'}`}>{avisoExport}</p>}

      {reporte && resumen && <>
        <section aria-label="Indicadores del periodo" className="card overflow-hidden border-brand-500/20 bg-[radial-gradient(ellipse_at_top_left,rgba(255,149,0,0.10),transparent_48%),linear-gradient(145deg,#18181b,#111113)]">
          <div className="p-4 sm:p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Ventas del periodo</p>
                <p className="mt-1 text-sm text-zinc-500">Cobros y devoluciones en las fechas seleccionadas</p>
              </div>
              <span className="chip chip-neutral">{nombrePeriodo(periodo, rango.desde, rango.hasta)}</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div data-guia="panel-ventas" className="rounded-xl border border-ok-500/20 bg-surface-950/55 p-4 sm:p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">Cobrado</p>
                <p className="mt-2 text-3xl font-extrabold tracking-tight text-ok-500 sm:text-4xl">{fmtPEN(resumen.ventas)}</p>
                <p className="mt-1.5 text-sm text-zinc-500">{resumen.cuentas_pagadas} cuentas pagadas</p>
              </div>
              <div className="rounded-xl border border-brand-500/20 bg-surface-950/45 p-4 sm:p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">Neto de caja</p>
                <p className="mt-2 text-3xl font-extrabold tracking-tight text-brand-400 sm:text-4xl">{fmtPEN(resumen.neto)}</p>
                <p className="mt-1.5 text-sm text-zinc-500">Cobrado menos reembolsos</p>
              </div>
            </div>
          </div>
          <dl className="grid grid-cols-2 border-t border-surface-700/70 sm:grid-cols-4">
            <MetricaCompacta etiqueta="Reembolsado" valor={fmtPEN(resumen.reembolsos)} detalle={`${resumen.cuentas_anuladas} anuladas`} tono={resumen.reembolsos > 0 ? 'text-danger-400' : 'text-zinc-200'} />
            <MetricaCompacta etiqueta="Ticket promedio" valor={fmtPEN(resumen.ticket_promedio)} detalle="por cuenta pagada" />
            <MetricaCompacta etiqueta="Propinas" valor={fmtPEN(resumen.propinas)} detalle="separadas de las ventas" />
            <MetricaCompacta etiqueta="Cuentas pagadas" valor={String(resumen.cuentas_pagadas)} detalle="en este periodo" />
          </dl>
        </section>

        <div className="aviso border-surface-700 bg-surface-900 text-zinc-400">
          <strong className="text-zinc-300">Cómo leerlo:</strong> “Cobrado” suma las cuentas pagadas en las fechas elegidas. “Reembolsado” suma las cuentas anuladas en esas fechas, aunque se hubieran cobrado antes. “Neto de caja” resta ambos movimientos; las propinas y el vuelto no se consideran ventas.
        </div>

        <Seccion titulo="Ventas por día" detalle="Selecciona un día para filtrar el Dashboard a esa fecha.">
          {diasGrafica.length > 0 && diasGrafica.some((d) => d.ventas > 0) ? <>
            <div className="overflow-x-auto pb-2">
              <div className="flex h-56 min-w-[680px] items-end gap-1.5 border-b border-surface-700 px-2 sm:gap-2">
                {diasGrafica.map((dia, i) => {
                  const alto = dia.ventas > 0 ? Math.max(5, dia.ventas / maxDia * 100) : 0
                  const mostrarFecha = diasGrafica.length <= 10 || i === 0 || i === diasGrafica.length - 1 || i % Math.ceil(diasGrafica.length / 8) === 0
                  return <button key={dia.fecha} type="button" title={`${dia.fecha}: ${fmtPEN(dia.ventas)} · ${dia.cuentas} cuentas`} aria-label={`Filtrar por ${dia.fecha}: ${fmtPEN(dia.ventas)}, ${dia.cuentas} cuentas`} onClick={() => { setFechaDesde(dia.fecha); setFechaHasta(dia.fecha); setPeriodo('personalizado') }} className="group flex h-full min-w-4 flex-1 flex-col items-center justify-end gap-1 rounded-t-md outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
                    <span className="flex h-44 w-full items-end justify-center rounded-t-sm bg-[linear-gradient(to_top,rgba(63,63,70,.35)_1px,transparent_1px)] bg-[length:100%_25%]">
                      <span className={`w-[min(70%,2rem)] rounded-t-sm transition-colors ${dia.ventas > 0 ? 'bg-brand-500 group-hover:bg-brand-400' : 'bg-surface-700'}`} style={{ height: `${alto}%` }} />
                    </span>
                    <span className={`h-4 text-[10px] text-zinc-500 ${mostrarFecha ? '' : 'invisible'}`}>{dia.fecha.slice(5)}</span>
                  </button>
                })}
              </div>
            </div>
            <p className="mt-3 text-xs text-zinc-500">Mayor venta diaria del periodo: {fmtPEN(maxDia)}. Pulsa una barra para ver ese día.</p>
          </> : <EstadoVacio titulo="No hay ventas cobradas en este periodo." className="py-6" />}
        </Seccion>

        <div className="grid gap-5 lg:grid-cols-2">
          <Seccion titulo="Productos más vendidos" detalle="Ordenados por importe vendido en el periodo.">
            {reporte.productos.length ? <ul className="space-y-2">{reporte.productos.slice(0, 5).map((p, i) => <li key={`${p.nombre}-${p.es_bebida}`} className="flex items-center gap-3 text-sm">
              <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold ${i === 0 ? 'bg-brand-500 text-surface-950' : 'bg-surface-700 text-zinc-300'}`}>{i + 1}</span>
              <span className="min-w-0 flex-1 truncate text-zinc-200">{p.nombre}<span className="ml-2 text-xs text-zinc-500">{p.es_bebida ? 'Bebida' : 'Comida'}</span></span>
              <span className="text-zinc-400">{p.cantidad} u.</span><span className="w-20 text-right font-semibold text-brand-400">{fmtPEN(p.total)}</span>
            </li>)}</ul> : <EstadoVacio titulo="Aún no hay productos cobrados." className="py-8" />}
          </Seccion>

          <Seccion titulo="Ventas por mesero" detalle="Ranking por importe vendido en el periodo.">
            {reporte.meseros.length ? <ul className="space-y-2">{reporte.meseros.slice(0, 8).map((m) => <li key={m.id} className="flex items-center justify-between gap-3 text-sm">
              <span className="flex min-w-0 items-center gap-2.5"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[11px] font-bold uppercase" style={{ backgroundColor: colorDe(m.nombre), color: '#0a0a0a' }}>{iniciales(m.nombre)}</span><span className="truncate text-zinc-200">{m.nombre}</span></span>
              <span className="shrink-0 text-xs text-zinc-500">{m.pedidos} {m.pedidos === 1 ? 'comanda' : 'comandas'}</span><span className="shrink-0 font-semibold text-brand-400">{fmtPEN(m.ventas)}</span>
            </li>)}</ul> : <EstadoVacio titulo="Sin ventas registradas en este periodo." className="py-8" />}
          </Seccion>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <Seccion titulo="Métodos de pago" detalle="El importe se distribuye entre los métodos usados; no incluye propinas ni vuelto.">
            {reporte.ventas_por_metodo.length ? <ul className="space-y-3">{reporte.ventas_por_metodo.map((m) => <li key={m.metodo_pago}>
              <div className="mb-1 flex items-center justify-between gap-3 text-sm"><span className="text-zinc-200">{METODO_LABEL[m.metodo_pago as MetodoPago] ?? m.metodo_pago}</span><span className="text-xs text-zinc-500">{m.cuentas} cuentas</span><span className="font-semibold text-zinc-100">{fmtPEN(m.ventas)} · {Math.round(m.ventas / maxMetodo * 100)}%</span></div>
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-700"><div className="h-full rounded-full bg-brand-500" style={{ width: `${m.ventas / maxMetodo * 100}%` }} /></div>
            </li>)}</ul> : <EstadoVacio titulo="Sin pagos en este periodo." className="py-8" />}
          </Seccion>

          <Seccion titulo="Horas con más ventas" detalle="Según la hora local de Lima en que se pagó la cuenta.">
            {reporte.ventas_por_hora.length ? <ul className="space-y-2">{reporte.ventas_por_hora.map((h) => <li key={h.hora} className="text-sm">
              <div className="mb-1 flex items-center justify-between gap-3"><span className="text-zinc-300">{h.hora}</span><span className="text-zinc-500">{h.cuentas} cuentas</span><span className="font-semibold text-brand-400">{fmtPEN(h.ventas)}</span></div>
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-700"><div className="h-full rounded-full bg-ok-500" style={{ width: `${h.ventas / maxHora * 100}%` }} /></div>
            </li>)}</ul> : <EstadoVacio titulo="Sin ventas en este periodo." className="py-8" />}
          </Seccion>
        </div>
      </>}
    </div>
  )
}

function MetricaCompacta({ etiqueta, valor, detalle, tono = 'text-zinc-100' }: { etiqueta: string; valor: string; detalle: string; tono?: string }) {
  return <div className="min-w-0 border-b border-surface-800 p-4 sm:border-b-0 sm:border-r sm:p-5 [&:nth-child(even)]:border-r-0 sm:[&:nth-child(even)]:border-r sm:[&:nth-child(4)]:border-r-0 [&:nth-child(n+3)]:border-b-0">
    <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-zinc-500">{etiqueta}</dt>
    <dd className={`mt-1.5 truncate text-lg font-bold tabular-nums ${tono}`}>{valor}</dd>
    <p className="mt-1 text-xs text-zinc-500">{detalle}</p>
  </div>
}

function Seccion({ titulo, detalle, children }: { titulo: string; detalle?: string; children: ReactNode }) {
  return <section className="card p-4 sm:p-6">
    <div className="mb-4"><h2 className="titulo-seccion text-xs font-semibold">{titulo}</h2>{detalle && <p className="mt-1 text-xs text-zinc-500">{detalle}</p>}</div>
    {children}
  </section>
}
