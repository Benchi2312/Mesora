import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { strToU8, zipSync } from 'fflate'
import { fmtFecha, fmtPEN } from '../../lib/format'
import { getApi } from '../../lib/api'
import { useCurrentContext } from '../../lib/useCurrentContext'
import { METODOS_PAGO_LABEL } from '../../domain/cashier/pagos'
import type { CuentaReporteAdmin, ReporteAdminDetallado } from '../../domain/reporting/ventas'
import {
  crearCsv, crearNombreCsv, fechaDeHoy, nombrePeriodoArchivo, periodoAnterior, rangoApi, rangoRapido,
  ZONA_HORARIA_REPORTES,
  type PeriodoRapido, type RangoFechas,
} from '../../domain/reporting/reportesAdmin'
import { Spinner } from '../../components/LoadingScreen'
import EstadoVacio from '../../components/EstadoVacio'
import { GraficoDiario, GraficoMeseros, GraficoProductos } from './GraficosReportes'

type Pestana = 'resumen' | 'ventas' | 'meseros' | 'productos' | 'anulaciones'
type TipoExportacion = 'resumen' | 'ventas' | 'meseros' | 'productos' | 'anulaciones' | 'todo'
type ArchivoCsv = { nombre: string; contenido: string }
const LIMITE = 25
const money = (valor: number | null | undefined) => fmtPEN(Number(valor ?? 0))
const hoyInicial = fechaDeHoy()

function metodoCuenta(cuenta: CuentaReporteAdmin): string {
  if (cuenta.pagos.length) return cuenta.pagos.map((pago) => `${METODOS_PAGO_LABEL[pago.metodo_pago as keyof typeof METODOS_PAGO_LABEL] ?? pago.metodo_pago} ${money(pago.monto)}`).join(' + ')
  return METODOS_PAGO_LABEL[cuenta.metodo_pago as keyof typeof METODOS_PAGO_LABEL] ?? cuenta.metodo_pago
}

function etiquetaEstado(cuenta: CuentaReporteAdmin): string {
  if (cuenta.estado === 'pagada') return 'Cobrado'
  if ((cuenta.monto_reembolsado ?? 0) > 0) return `Anulado · devuelto ${money(cuenta.monto_reembolsado)}`
  return 'Anulado'
}

function descargarArchivo(nombre: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const enlace = document.createElement('a')
  enlace.href = url
  enlace.download = nombre
  enlace.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default function VentasTab() {
  const { restaurante } = useCurrentContext()
  const rid = restaurante?.id
  const [pestana, setPestana] = useState<Pestana>('resumen')
  const [periodo, setPeriodo] = useState<PeriodoRapido>('esteMes')
  const [mes, setMes] = useState(hoyInicial.slice(0, 7))
  const [rangoPersonalizado, setRangoPersonalizado] = useState<RangoFechas>({ desde: hoyInicial, hasta: hoyInicial })
  const [comparar, setComparar] = useState(true)
  const [estado, setEstado] = useState<'todas' | 'pagada' | 'anulada'>('todas')
  const [meseroId, setMeseroId] = useState('')
  const [productoId, setProductoId] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [busquedaAplicada, setBusquedaAplicada] = useState('')
  const [pagina, setPagina] = useState(0)
  const [abierta, setAbierta] = useState<string | null>(null)
  const [reporte, setReporte] = useState<ReporteAdminDetallado | null>(null)
  const [anterior, setAnterior] = useState<ReporteAdminDetallado | null>(null)
  const [meseros, setMeseros] = useState<{ id: string; nombre: string }[]>([])
  const [productos, setProductos] = useState<{ id: string; nombre: string; disponible: boolean }[]>([])
  const [cargando, setCargando] = useState(true)
  const [cargandoCatalogos, setCargandoCatalogos] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [errorCatalogos, setErrorCatalogos] = useState<string | null>(null)
  const [errorExportar, setErrorExportar] = useState<string | null>(null)
  const [exportando, setExportando] = useState<TipoExportacion | null>(null)
  const menuExportacionRef = useRef<HTMLDetailsElement>(null)
  const secuencia = useRef(0)

  const rango = useMemo(() => rangoRapido(periodo, fechaDeHoy(), mes, rangoPersonalizado), [periodo, mes, rangoPersonalizado])
  const rangoPrevio = useMemo(() => periodoAnterior(rango), [rango])

  useEffect(() => {
    const timer = setTimeout(() => { setBusquedaAplicada(busqueda.trim()); setPagina(0) }, 250)
    return () => clearTimeout(timer)
  }, [busqueda])

  useEffect(() => {
    if (!rid) return
    let vigente = true
    setCargandoCatalogos(true)
    void Promise.all([getApi().getPersonal(rid), getApi().getProductos(rid, { incluirAgotados: true })]).then(([personal, productosRes]) => {
      if (!vigente) return
      const errorActual = personal.error ?? productosRes.error
      setErrorCatalogos(errorActual)
      setMeseros((personal.data ?? []).filter((u) => u.rol === 'mesero').map(({ id, nombre }) => ({ id, nombre })))
      setProductos((productosRes.data ?? []).map(({ id, nombre, disponible }) => ({ id, nombre, disponible })))
      setCargandoCatalogos(false)
    }).catch((causa: unknown) => {
      if (!vigente) return
      setErrorCatalogos(causa instanceof Error ? causa.message : 'No se pudieron cargar los filtros.')
      setCargandoCatalogos(false)
    })
    return () => { vigente = false }
  }, [rid])

  const cargar = useCallback(async () => {
    if (!rid) return
    if (!rango.desde || !rango.hasta || rango.desde > rango.hasta) {
      setError('La fecha final debe ser igual o posterior a la fecha inicial.')
      setReporte(null)
      setAnterior(null)
      setCargando(false)
      return
    }
    const solicitud = ++secuencia.current
    setCargando(true)
    setError(null)
    setReporte(null)
    setAnterior(null)
    try {
      const filtros = { estado, mesero_id: meseroId || null, producto_id: productoId || null, busqueda: busquedaAplicada, offset: pagina * LIMITE, limite: LIMITE }
      const actual = getApi().getReporteAdminDetallado(rid, rangoApi(rango, filtros))
      const previo = comparar
        ? getApi().getReporteAdminDetallado(rid, rangoApi(rangoPrevio, { ...filtros, offset: 0, limite: 1 }))
        : Promise.resolve(null)
      const [resActual, resAnterior] = await Promise.all([actual, previo])
      if (solicitud !== secuencia.current) return
      if (resActual.error || !resActual.data) {
        setError(resActual.error ?? 'No se recibieron datos del reporte.')
      } else {
        setReporte(resActual.data)
        setError(null)
      }
      if (resAnterior && !resAnterior.error) setAnterior(resAnterior.data)
      else if (!comparar) setAnterior(null)
      else if (resAnterior?.error) setError((actualError) => actualError ?? `No se pudo consultar el periodo anterior: ${resAnterior.error}`)
    } catch (causa) {
      if (solicitud !== secuencia.current) return
      setError(causa instanceof Error ? causa.message : 'No se pudo cargar el reporte. Inténtalo nuevamente.')
    } finally {
      if (solicitud === secuencia.current) setCargando(false)
    }
  }, [rid, rango, rangoPrevio, estado, meseroId, productoId, busquedaAplicada, pagina, comparar])

  useEffect(() => { void cargar() }, [cargar])

  const elegirPeriodo = (nuevo: PeriodoRapido) => {
    setPeriodo(nuevo)
    setPagina(0)
    setAbierta(null)
    if (nuevo === 'personalizado') setRangoPersonalizado(rango)
    if (nuevo === 'mesSeleccionado') setMes(rango.desde.slice(0, 7))
  }
  const actualizarRango = (cambios: Partial<RangoFechas>) => {
    setRangoPersonalizado((valor) => ({ ...valor, ...cambios }))
    setPeriodo('personalizado')
    setPagina(0)
  }
  const limpiarFiltros = () => {
    setPeriodo('esteMes')
    setMes(fechaDeHoy().slice(0, 7))
    setRangoPersonalizado({ desde: fechaDeHoy(), hasta: fechaDeHoy() })
    setEstado('todas'); setMeseroId(''); setProductoId(''); setBusqueda(''); setBusquedaAplicada('')
    setPagina(0); setAbierta(null); setComparar(true)
  }

  const exportar = async (tipo: TipoExportacion) => {
    if (!rid || !reporte) return
    setErrorExportar(null)
    setExportando(tipo)
    try {
      const filtros = { estado, mesero_id: meseroId || null, producto_id: productoId || null, busqueda: busquedaAplicada, offset: 0, limite: 100 }
      const necesitaDetalle = tipo === 'todo' || tipo === 'ventas' || tipo === 'anulaciones'
      const cuentas: CuentaReporteAdmin[] = []
      if (necesitaDetalle) {
        let offset = 0
        let total = 0
        do {
          const res = await getApi().getReporteAdminDetallado(rid, rangoApi(rango, { ...filtros, offset }))
          if (res.error || !res.data) throw new Error(res.error ?? 'No se recibió el reporte detallado.')
          cuentas.push(...res.data.cuentas)
          total = res.data.total_cuentas
          offset += filtros.limite
        } while (offset < total)
      }
      const nombreMesero = meseroId ? meseros.find((fila) => fila.id === meseroId)?.nombre ?? meseroId : 'Todos'
      const nombreProducto = productoId ? productos.find((fila) => fila.id === productoId)?.nombre ?? productoId : 'Todos'
      const contexto = (alcance: string) => crearCsv(['Filtro', 'Valor'], [
        ['Restaurante', restaurante?.nombre ?? 'Restaurante activo'],
        ['Desde', rango.desde], ['Hasta', rango.hasta], ['Zona horaria', ZONA_HORARIA_REPORTES],
        ['Estado del detalle', estado === 'todas' ? 'Cobradas y anuladas' : estado === 'pagada' ? 'Solo cobradas' : 'Solo anuladas'],
        ['Mesero', nombreMesero], ['Producto', nombreProducto], ['Búsqueda', busquedaAplicada || 'Sin búsqueda'],
        ['Alcance', alcance],
      ])
      const csvConContexto = (columnas: string[], filas: (string | number | null)[][], alcance: string) =>
        `${contexto(alcance)}\r\n${crearCsv(columnas, filas).slice(1)}`
      const construir = (seleccion: Exclude<TipoExportacion, 'todo'>): ArchivoCsv => {
        const nombre = crearNombreCsv(seleccion, rango)
        if (seleccion === 'ventas' || seleccion === 'anulaciones') {
          const filas = seleccion === 'anulaciones' ? cuentas.filter((cuenta) => cuenta.estado === 'anulada') : cuentas
          return { nombre, contenido: csvConContexto(
            ['Fecha y hora (Lima)', 'Número de recibo/cuenta', 'Mesa', 'Mesero', 'Productos', 'Cantidad', 'Importe', 'Método de pago', 'Estado', 'Monto devuelto', 'Motivo de anulación'],
            filas.map((cuenta) => [
              new Intl.DateTimeFormat('es-PE', { timeZone: ZONA_HORARIA_REPORTES, dateStyle: 'short', timeStyle: 'medium' }).format(new Date(cuenta.fecha_operacion)),
              cuenta.numero ?? cuenta.id, cuenta.mesas, cuenta.meseros,
              cuenta.pedidos.flatMap((pedido) => pedido.items.map((item) => `${item.cantidad} × ${item.nombre}`)).join(' | '),
              cuenta.cantidad_productos, cuenta.total, metodoCuenta(cuenta), etiquetaEstado(cuenta),
              cuenta.monto_reembolsado ?? 0, cuenta.motivo_anulacion ?? '',
            ]), 'Detalle filtrado por estado, mesero, producto y búsqueda.') }
        }
        if (seleccion === 'resumen') {
          const filas: (string | number)[][] = [
            ['Total cobrado', reporte.resumen.ventas], ['Neto (cobrado menos devoluciones)', reporte.resumen.neto],
            ['Total devuelto/anulado', reporte.resumen.reembolsos], ['Cuentas pagadas', reporte.resumen.cuentas_pagadas],
            ['Cuentas anuladas', reporte.resumen.cuentas_anuladas], ['Ticket promedio', reporte.resumen.ticket_promedio], ['Propinas', reporte.resumen.propinas],
            ...reporte.ventas_por_metodo.map((fila) => [`Método: ${METODOS_PAGO_LABEL[fila.metodo_pago as keyof typeof METODOS_PAGO_LABEL] ?? fila.metodo_pago}`, fila.ventas]),
          ]
          return { nombre, contenido: csvConContexto(['Indicador', 'Valor'], filas, 'Indicadores del periodo completo; los filtros de detalle no cambian este resumen.') }
        }
        if (seleccion === 'meseros') {
          return { nombre, contenido: csvConContexto(
            ['Puesto', 'Mesero', 'Total vendido atribuido', 'Cuentas atendidas', 'Comandas', 'Unidades', 'Ticket promedio atribuido', 'Propinas atribuidas'],
            reporte.meseros.map((fila, indice) => [indice + 1, fila.nombre, fila.ventas, fila.cuentas, fila.comandas, fila.unidades, fila.ticket_promedio, fila.propinas]),
            'Ranking del periodo; mesero y producto afinan el ranking. Estado y búsqueda aplican solo al detalle.',
          ) }
        }
        const filasProductos = reporte.productos.map((fila) => ['Producto', fila.nombre, fila.categoria, fila.cantidad, fila.total, fila.es_bebida ? 'Bebida' : 'Comida'])
        const filasCategorias = reporte.categorias.map((fila) => ['Categoría actual', fila.categoria, '—', fila.cantidad, fila.total, ''])
        const filasEstaciones = reporte.comandas_por_estacion.map((fila) => ['Estación', fila.estacion, '—', fila.unidades, fila.ventas, `${fila.comandas} comandas`])
        const filasSinVentas = reporte.productos_sin_ventas.map((fila) => ['Sin ventas', fila.nombre, fila.categoria, 0, 0, fila.disponible ? 'Disponible' : 'No disponible'])
        return { nombre, contenido: csvConContexto(
          ['Tipo', 'Producto / categoría / estación', 'Categoría actual del menú', 'Cantidad', 'Importe', 'Clasificación'],
          [...filasProductos, ...filasCategorias, ...filasEstaciones, ...filasSinVentas],
          'Productos del periodo; mesero y producto afinan los vendidos. Categorías y productos sin ventas usan el menú actual.',
        ) }
      }
      const selecciones: Exclude<TipoExportacion, 'todo'>[] = tipo === 'todo'
        ? ['resumen', 'ventas', 'meseros', 'productos', 'anulaciones'] : [tipo]
      const archivos = selecciones.map(construir)
      if (tipo === 'todo') {
        const contenido = zipSync(Object.fromEntries(archivos.map((archivo) => [archivo.nombre, strToU8(archivo.contenido)])), { level: 1 })
        descargarArchivo(`mesora-reportes-${nombrePeriodoArchivo(rango)}.zip`, new Blob([new Uint8Array(contenido)], { type: 'application/zip' }))
      } else {
        descargarArchivo(archivos[0].nombre, new Blob([archivos[0].contenido], { type: 'text/csv;charset=utf-8' }))
      }
      if (menuExportacionRef.current) menuExportacionRef.current.open = false
    } catch (causa) {
      setErrorExportar(causa instanceof Error ? causa.message : 'No se pudo preparar el archivo. Puedes reintentar.')
    } finally {
      setExportando(null)
    }
  }
  const paginas = Math.max(1, Math.ceil((reporte?.total_cuentas ?? 0) / LIMITE))
  const variacion = comparar && anterior
    ? anterior.resumen.ventas > 0
      ? ((reporte?.resumen.ventas ?? 0) - anterior.resumen.ventas) / anterior.resumen.ventas * 100
      : (reporte?.resumen.ventas ?? 0) > 0 ? null : 0
    : null

  return (
    <section className="space-y-5" aria-label="Reportes de ventas">
      <div className="aviso border-brand-500/30 bg-brand-500/10 text-brand-300">
        Reportes internos de este restaurante. Los importes de ventas no son comprobantes electrónicos; la facturación electrónica se gestiona en el sistema fiscal del local.
      </div>

      <section className="card space-y-4 p-4 sm:p-5" aria-label="Filtros del reporte">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="titulo-seccion">Periodo y filtros</h2>
            <p className="mt-1 text-sm text-zinc-500">Fechas de operación en {ZONA_HORARIA_REPORTES}. El resumen muestra el periodo completo; los filtros afinan tablas y rankings.</p>
          </div>
          <button type="button" className="btn btn-outline min-h-11 px-3" onClick={limpiarFiltros}>Limpiar filtros</button>
        </div>
        <div className="flex flex-wrap gap-2" aria-label="Periodos rápidos">
          {([
            ['hoy', 'Hoy'], ['ultimos7', 'Últimos 7 días'], ['esteMes', 'Este mes'], ['mesAnterior', 'Mes anterior'],
            ['mesSeleccionado', 'Elegir mes'], ['personalizado', 'Rango personalizado'],
          ] as const).map(([id, label]) => <button key={id} type="button" aria-pressed={periodo === id} onClick={() => elegirPeriodo(id)} className={`btn min-h-11 px-3 ${periodo === id ? 'btn-primary' : 'btn-outline'}`}>{label}</button>)}
        </div>
        {periodo === 'mesSeleccionado' && <label className="block max-w-xs text-sm text-zinc-400">Mes completo
          <input aria-label="Mes del reporte" className="input mt-1 min-h-11 w-full" type="month" value={mes} onChange={(e) => { setMes(e.target.value); setPeriodo('mesSeleccionado'); setPagina(0) }} />
        </label>}
        {periodo === 'personalizado' && <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm text-zinc-400">Desde
            <input aria-label="Fecha desde" className="input mt-1 min-h-11 w-full" type="date" value={rangoPersonalizado.desde} onChange={(e) => actualizarRango({ desde: e.target.value })} />
          </label>
          <label className="text-sm text-zinc-400">Hasta (incluido)
            <input aria-label="Fecha hasta" className="input mt-1 min-h-11 w-full" type="date" value={rangoPersonalizado.hasta} onChange={(e) => actualizarRango({ hasta: e.target.value })} />
          </label>
        </div>}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <label className="text-sm text-zinc-400">Buscar cuenta, mesa, mesero o producto
            <input aria-label="Buscar operaciones" className="input mt-1 min-h-11 w-full" type="search" value={busqueda} onChange={(e) => { setBusqueda(e.target.value); setPagina(0) }} placeholder="N.° de recibo o nombre" />
          </label>
          <label className="text-sm text-zinc-400">Estado del detalle
            <select aria-label="Estado de operación" className="input mt-1 min-h-11 w-full" value={estado} onChange={(e) => { setEstado(e.target.value as typeof estado); setPagina(0) }}>
              <option value="todas">Cobradas y anuladas</option><option value="pagada">Solo cobradas</option><option value="anulada">Solo anuladas</option>
            </select>
          </label>
          <label className="text-sm text-zinc-400">Mesero
            <select aria-label="Filtrar por mesero" className="input mt-1 min-h-11 w-full" value={meseroId} onChange={(e) => { setMeseroId(e.target.value); setPagina(0) }}>
              <option value="">Todos los meseros</option>{meseros.map((fila) => <option key={fila.id} value={fila.id}>{fila.nombre}</option>)}
            </select>
          </label>
          <label className="text-sm text-zinc-400">Producto
            <select aria-label="Filtrar por producto" className="input mt-1 min-h-11 w-full" value={productoId} onChange={(e) => { setProductoId(e.target.value); setPagina(0) }}>
              <option value="">Todos los productos</option>{productos.map((fila) => <option key={fila.id} value={fila.id}>{fila.nombre}{fila.disponible ? '' : ' · no disponible'}</option>)}
            </select>
          </label>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-surface-700 pt-3">
          <label className="flex min-h-11 items-center gap-2 text-sm text-zinc-300">
            <input type="checkbox" checked={comparar} onChange={(e) => setComparar(e.target.checked)} />
            Comparar con el periodo anterior de igual duración
          </label>
          <details ref={menuExportacionRef} className="relative">
            <summary className="btn btn-outline min-h-11 cursor-pointer list-none px-4">Exportar reportes CSV</summary>
            <div role="group" aria-label="Elegir reporte para exportar" className="absolute left-0 z-20 mt-2 grid max-h-[60vh] w-max min-w-64 max-w-[calc(100vw-2rem)] gap-1 overflow-y-auto rounded-xl border border-surface-700 bg-surface-900 p-2 shadow-xl sm:left-auto sm:right-0">
              <p className="px-2 py-1 text-xs text-zinc-400">Elige un reporte. Todos conservan el periodo y muestran sus filtros.</p>
              {([['resumen', 'Resumen'], ['ventas', 'Ventas detalladas'], ['meseros', 'Meseros'], ['productos', 'Productos y categorías'], ['anulaciones', 'Anulaciones y devoluciones'], ['todo', 'Exportar todo']] as const).map(([tipo, label]) => <button key={tipo} type="button" disabled={!reporte || exportando !== null} className="btn btn-outline min-h-11 justify-start px-3 text-left" onClick={() => void exportar(tipo)}>{exportando === tipo ? 'Preparando…' : label}{tipo === 'todo' && exportando !== tipo ? <span className="ml-1 text-xs text-zinc-400">· ZIP con cinco CSV</span> : null}</button>)}
            </div>
          </details>
        </div>
        {errorCatalogos && <p role="status" className="text-sm text-warning-400">No se pudieron cargar los filtros de mesero y producto: {errorCatalogos}</p>}
        {errorExportar && <p role="alert" className="text-sm text-danger-400">{errorExportar}</p>}
        {cargandoCatalogos && <span className="sr-only">Cargando opciones de filtro</span>}
      </section>

      {error && <div role="alert" className="aviso border-danger-500/40 bg-danger-500/10 text-danger-400 flex flex-wrap items-center justify-between gap-3"><span>No se pudo cargar el reporte: {error}</span><button type="button" className="btn btn-outline min-h-10 px-3" onClick={() => void cargar()}>Reintentar</button></div>}
      {cargando && !reporte ? <div className="flex min-h-56 items-center justify-center gap-3 text-sm text-zinc-400"><Spinner /> Cargando reportes del periodo…</div> : reporte && <>
        <div className="flex flex-wrap gap-2 border-b border-surface-700" role="tablist" aria-label="Reportes del restaurante">
          {([
            ['resumen', 'Resumen'], ['ventas', 'Ventas detalladas'], ['meseros', 'Meseros'], ['productos', 'Productos y categorías'], ['anulaciones', 'Anulaciones'],
          ] as const).map(([id, label]) => <button key={id} id={`reportes-tab-${id}`} role="tab" type="button" aria-controls={`reportes-panel-${id}`} aria-selected={pestana === id} tabIndex={pestana === id ? 0 : -1} onClick={() => { setPestana(id); setPagina(0); setAbierta(null) }} onKeyDown={(event) => {
            const tabs: Pestana[] = ['resumen', 'ventas', 'meseros', 'productos', 'anulaciones']
            const indice = tabs.indexOf(id)
            const siguiente = event.key === 'ArrowRight' ? tabs[(indice + 1) % tabs.length]
              : event.key === 'ArrowLeft' ? tabs[(indice - 1 + tabs.length) % tabs.length]
                : event.key === 'Home' ? tabs[0] : event.key === 'End' ? tabs[tabs.length - 1] : null
            if (siguiente) {
              event.preventDefault()
              setPestana(siguiente); setPagina(0); setAbierta(null)
              document.getElementById(`reportes-tab-${siguiente}`)?.focus()
            }
          }} className={`btn min-h-11 px-3 ${pestana === id ? 'btn-primary' : 'btn-outline'}`}>{label}</button>)}
          {cargando && <span role="status" className="self-center text-sm text-zinc-500">Actualizando periodo…</span>}
        </div>

        <div role="tabpanel" id={`reportes-panel-${pestana}`} aria-labelledby={`reportes-tab-${pestana}`} tabIndex={0}>
          {pestana === 'resumen' && <ResumenPeriodo reporte={reporte} anterior={anterior} comparar={comparar} variacion={variacion} rango={rango} />}
          {pestana === 'ventas' && <VentasDetalladas reporte={reporte} abierta={abierta} setAbierta={setAbierta} pagina={pagina} paginas={paginas} cargando={cargando} setPagina={setPagina} />}
          {pestana === 'meseros' && <ReporteMeseros reporte={reporte} alFiltrar={(id) => { setMeseroId(id); setPestana('ventas'); setPagina(0); setAbierta(null) }} />}
          {pestana === 'productos' && <ReporteProductos reporte={reporte} />}
          {pestana === 'anulaciones' && <Anulaciones reporte={reporte} abierta={abierta} setAbierta={setAbierta} pagina={pagina} paginas={paginas} cargando={cargando} setPagina={setPagina} />}
        </div>
      </>}
      <p className="text-xs text-zinc-600">Periodo consultado: {rango.desde} a {rango.hasta} · {ZONA_HORARIA_REPORTES}. Las categorías se muestran según el menú actual; los productos conservan sus nombres y estación guardados en la comanda.</p>
    </section>
  )
}

function ResumenPeriodo({ reporte, anterior, comparar, variacion, rango }: { reporte: ReporteAdminDetallado; anterior: ReporteAdminDetallado | null; comparar: boolean; variacion: number | null; rango: RangoFechas }) {
  return <div className="space-y-5">
    <header className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="titulo-seccion">Resumen del periodo</h2><p className="mt-1 text-sm text-zinc-500">{rango.desde} — {rango.hasta}. Cobros sin propinas; el neto descuenta reembolsos de cuentas anuladas.</p></div>{comparar && anterior && <span className={`chip ${variacion === null ? 'chip-neutral' : variacion >= 0 ? 'chip-ok' : 'chip-danger'}`}>{variacion === null ? 'Sin base de comparación' : `${variacion > 0 ? '+' : ''}${variacion.toFixed(1)}% vs. periodo anterior`}</span>}</header>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      <Kpi titulo="Total cobrado" valor={money(reporte.resumen.ventas)} detalle={`${reporte.resumen.cuentas_pagadas} cuentas pagadas`} />
      <Kpi titulo="Neto del periodo" valor={money(reporte.resumen.neto)} detalle="Cobrado menos devoluciones reportadas" />
      <Kpi titulo="Anulado o devuelto" valor={money(reporte.resumen.reembolsos)} detalle={`${reporte.resumen.cuentas_anuladas} cuentas anuladas`} />
      <Kpi titulo="Cuentas pagadas" valor={String(reporte.resumen.cuentas_pagadas)} detalle="Recibos internos emitidos" />
      <Kpi titulo="Ticket promedio" valor={money(reporte.resumen.ticket_promedio)} detalle="Total cobrado / cuentas pagadas" />
      <Kpi titulo="Propinas" valor={money(reporte.resumen.propinas)} detalle="Separadas del importe de venta" />
    </div>
    {!reporte.resumen.cuentas_pagadas && <EstadoVacio titulo="No hay ventas cobradas en este periodo." descripcion="Prueba otro mes o amplía el rango para ver operaciones." />}
    <div className="grid gap-4 xl:grid-cols-2">
      <section className="card p-4 sm:p-5"><h3 className="titulo-seccion">Ventas por método de pago</h3><p className="mt-1 text-sm text-zinc-500">Los pagos divididos se distribuyen proporcionalmente al importe cobrado; propinas y vuelto quedan fuera.</p>
        {!reporte.ventas_por_metodo.length ? <p className="py-5 text-sm text-zinc-500">No hay pagos registrados.</p> : <div className="mt-4 space-y-3">{reporte.ventas_por_metodo.map((fila) => <Barra key={fila.metodo_pago} titulo={METODOS_PAGO_LABEL[fila.metodo_pago as keyof typeof METODOS_PAGO_LABEL] ?? fila.metodo_pago} valor={fila.ventas} maximo={Math.max(...reporte.ventas_por_metodo.map((x) => x.ventas))} detalle={`${fila.cuentas} cuentas`} />)}</div>}
      </section>
      <GraficoDiario reporte={reporte} />
      <ListaSimple titulo="Ventas por hora" vacio="No hay ventas cobradas en el periodo." columnas={['Hora', 'Cuentas', 'Importe']} filas={reporte.ventas_por_hora.map((fila) => [fila.hora, String(fila.cuentas), money(fila.ventas)])} />
      <ListaSimple titulo="Ventas por mesa" vacio="No hay consumos cobrados en el periodo." columnas={['Mesa', 'Cuentas', 'Importe']} filas={reporte.mesas.slice(0, 12).map((fila) => [fila.nombre, String(fila.cuentas), money(fila.ventas)])} />
      <ListaSimple titulo="Comandas por estación" vacio="No hay productos con estación histórica en el periodo." columnas={['Estación', 'Comandas', 'Unidades', 'Importe']} filas={reporte.comandas_por_estacion.map((fila) => [nombreEstacion(fila.estacion), String(fila.comandas), String(fila.unidades), money(fila.ventas)])} />
      <ListaSimple titulo="Productos sin ventas en el periodo" vacio="Todos los productos del menú tuvieron ventas o no hay productos registrados." columnas={['Producto', 'Categoría actual', 'Precio actual', 'Estado actual']} filas={reporte.productos_sin_ventas.map((fila) => [fila.nombre, fila.categoria, money(fila.precio_actual), fila.disponible ? 'Disponible' : 'No disponible'])} nota="Incluye productos disponibles y no disponibles; categoría, precio y disponibilidad corresponden al menú actual." />
    </div>
  </div>
}

function VentasDetalladas({ reporte, abierta, setAbierta, pagina, paginas, cargando, setPagina }: { reporte: ReporteAdminDetallado; abierta: string | null; setAbierta: (id: string | null) => void; pagina: number; paginas: number; cargando: boolean; setPagina: (cambiar: (valor: number) => number) => void }) {
  return <section className="card overflow-hidden p-4 sm:p-5">
    <div className="mb-4 flex flex-wrap items-end justify-between gap-2"><div><h2 className="titulo-seccion">Operaciones</h2><p className="mt-1 text-sm text-zinc-500">Abre una fila para revisar productos, comandas y pagos.</p></div><span className="text-sm text-zinc-500">{reporte.total_cuentas} resultados</span></div>
    {!reporte.cuentas.length ? <EstadoVacio titulo="No hay operaciones con estos filtros." /> : <>
      <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[850px] text-sm"><thead><tr className="text-left text-xs text-zinc-500"><th className="p-2">Fecha y hora</th><th className="p-2">Cuenta / recibo</th><th className="p-2">Mesa</th><th className="p-2">Mesero</th><th className="p-2 text-right">Productos</th><th className="p-2">Pago</th><th className="p-2">Estado</th><th className="p-2 text-right">Importe</th></tr></thead><tbody>{reporte.cuentas.map((cuenta) => <tr key={cuenta.id} className="border-t border-surface-700"><td className="p-2 text-zinc-300">{fmtFecha(cuenta.fecha_operacion)}</td><td className="p-2"><button className="font-semibold text-brand-300 underline-offset-4 hover:underline" aria-expanded={abierta === cuenta.id} onClick={() => setAbierta(abierta === cuenta.id ? null : cuenta.id)}>{cuenta.numero ?? `Cuenta ${cuenta.id.slice(0, 8)}`}</button></td><td className="p-2">{cuenta.mesas}</td><td className="p-2">{cuenta.meseros}</td><td className="p-2 text-right tabular-nums">{cuenta.cantidad_productos}</td><td className="p-2">{metodoCuenta(cuenta)}</td><td className="p-2"><span className={cuenta.estado === 'pagada' ? 'chip chip-ok' : 'chip chip-danger'}>{etiquetaEstado(cuenta)}</span></td><td className="p-2 text-right font-semibold tabular-nums">{money(cuenta.total)}</td></tr>)}</tbody></table></div>
      <div className="space-y-2 md:hidden">{reporte.cuentas.map((cuenta) => <article key={cuenta.id} className="rounded-xl border border-surface-700 bg-surface-900/50">
        <button type="button" className="flex min-h-16 w-full flex-wrap items-start justify-between gap-2 p-3 text-left" aria-expanded={abierta === cuenta.id} onClick={() => setAbierta(abierta === cuenta.id ? null : cuenta.id)}>
          <span className="min-w-0"><strong className="block break-all text-zinc-100">{cuenta.numero ?? `Cuenta ${cuenta.id.slice(0, 8)}`}</strong><span className="mt-1 block text-sm text-zinc-400">{fmtFecha(cuenta.fecha_operacion)} · {cuenta.mesas}</span><span className="block text-xs text-zinc-500">{cuenta.meseros} · {cuenta.cantidad_productos} productos</span></span>
          <span className="flex shrink-0 flex-col items-end gap-1"><strong className="tabular-nums">{money(cuenta.total)}</strong><span className={cuenta.estado === 'pagada' ? 'chip chip-ok' : 'chip chip-danger'}>{etiquetaEstado(cuenta)}</span></span>
        </button>
        {abierta === cuenta.id && <DetalleCuenta cuenta={cuenta} />}
      </article>)}</div>
      <div className="mt-3 hidden border-t border-surface-700 pt-3 md:block">{reporte.cuentas.map((cuenta) => abierta === cuenta.id && <DetalleCuenta key={cuenta.id} cuenta={cuenta} />)}</div>
    </>}
    <Paginacion total={reporte.total_cuentas} pagina={pagina} paginas={paginas} cargando={cargando} setPagina={setPagina} />
  </section>
}

function Anulaciones({ reporte, abierta, setAbierta, pagina, paginas, cargando, setPagina }: Parameters<typeof VentasDetalladas>[0]) {
  const anuladas = reporte.cuentas.filter((cuenta) => cuenta.estado === 'anulada')
  return <section className="card overflow-hidden p-4 sm:p-5"><h2 className="titulo-seccion">Historial de anulaciones y devoluciones</h2><p className="mb-4 mt-1 text-sm text-zinc-500">Las cuentas permanecen en el historial y no se consideran cobrables.</p>
    {!anuladas.length ? <EstadoVacio titulo="No hay cuentas anuladas en esta página." descripcion="Ajusta el estado o el periodo para buscar anulaciones." /> : <div className="space-y-2">{anuladas.map((cuenta) => <article key={cuenta.id} className="rounded-xl border border-danger-500/20 bg-surface-900/40"><button type="button" className="flex min-h-14 w-full flex-wrap items-center justify-between gap-2 p-3 text-left" aria-expanded={abierta === cuenta.id} onClick={() => setAbierta(abierta === cuenta.id ? null : cuenta.id)}><span><strong>{cuenta.numero ?? `Cuenta ${cuenta.id.slice(0, 8)}`}</strong><span className="ml-2 text-sm text-zinc-400">{fmtFecha(cuenta.anulada_at ?? cuenta.fecha_operacion)} · {cuenta.mesas}</span></span><span className="text-right"><span className="chip chip-danger">Anulada</span><strong className="ml-3 tabular-nums">{money(cuenta.total)}</strong></span></button>{abierta === cuenta.id && <><div className="mx-3 rounded-lg border border-danger-500/20 p-3 text-sm text-zinc-300">Motivo: {cuenta.motivo_anulacion || 'No hay motivo disponible.'} · Devuelto: {money(cuenta.monto_reembolsado)}</div><DetalleCuenta cuenta={cuenta} /></>}</article>)}</div>}
    <Paginacion total={reporte.total_cuentas} pagina={pagina} paginas={paginas} cargando={cargando} setPagina={setPagina} />
  </section>
}

function ReporteMeseros({ reporte, alFiltrar }: { reporte: ReporteAdminDetallado; alFiltrar: (id: string) => void }) {
  const [verTodos, setVerTodos] = useState(false)
  return <section className="card overflow-hidden p-4 sm:p-5"><div className="mb-4"><h2 className="titulo-seccion">Rendimiento por mesero</h2><p className="mt-1 text-sm text-zinc-500">Ventas atribuidas según los productos de sus comandas. Las comandas y ventas se muestran por separado; la propina se prorratea por aporte al importe del pedido.</p></div>
    <GraficoMeseros meseros={reporte.meseros} verTodos={verTodos} alCambiar={() => setVerTodos((valor) => !valor)} />
    {!reporte.meseros.length ? <EstadoVacio titulo="No hay ventas atribuidas a meseros en el periodo." /> : <div className="grid gap-3 xl:grid-cols-2">{reporte.meseros.map((fila, indice) => <article key={fila.id ?? fila.nombre} className="rounded-xl border border-surface-700 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2"><div><span className="chip chip-neutral">Puesto {indice + 1}</span><h3 className="mt-2 text-lg font-semibold text-zinc-100">{fila.nombre}</h3></div><strong className="text-xl tabular-nums">{money(fila.ventas)}</strong></div>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3"><Dato titulo="Cuentas atendidas" valor={fila.cuentas} /><Dato titulo="Comandas" valor={fila.comandas} /><Dato titulo="Unidades" valor={fila.unidades} /><Dato titulo="Ticket promedio atribuido" valor={money(fila.ticket_promedio)} /><Dato titulo="Propinas atribuidas" valor={money(fila.propinas)} /></dl>
      {fila.id && <button type="button" className="btn btn-outline mt-4 min-h-11 px-3" onClick={() => alFiltrar(fila.id)}>Ver sus cuentas</button>}
    </article>)}</div>}
  </section>
}

function ReporteProductos({ reporte }: { reporte: ReporteAdminDetallado }) {
  const [orden, setOrden] = useState<'cantidad' | 'importe'>('cantidad')
  const productos = [...reporte.productos].sort((a, b) => orden === 'cantidad' ? b.cantidad - a.cantidad || b.total - a.total : b.total - a.total || b.cantidad - a.cantidad)
  return <div className="space-y-4">
    <section className="card p-4 sm:p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="titulo-seccion">Productos más vendidos</h2><p className="mt-1 text-sm text-zinc-500">Categoría según el menú actual; nombre, cantidad, precio y estación proceden de la comanda.</p></div><label className="text-sm text-zinc-400">Ordenar por <select aria-label="Orden de productos" className="input ml-2 min-h-11" value={orden} onChange={(e) => setOrden(e.target.value as typeof orden)}><option value="cantidad">Cantidad</option><option value="importe">Importe</option></select></label></div>
      <GraficoProductos productos={productos} orden={orden} />
      {!productos.length ? <EstadoVacio titulo="No hay productos cobrados en este periodo." /> : <div className="mt-4 grid gap-2 sm:grid-cols-2">{productos.map((fila, indice) => <article key={`${fila.id ?? fila.nombre}-${fila.es_bebida}`} className="flex min-h-16 items-center justify-between gap-3 rounded-lg border border-surface-700 p-3"><span className="min-w-0"><span className="mr-2 text-xs text-zinc-500">#{indice + 1}</span><strong className="break-words">{fila.nombre}</strong><span className="mt-1 block text-xs text-zinc-500">{fila.categoria} · {fila.es_bebida ? 'Bebida' : 'Comida'}</span></span><span className="shrink-0 text-right"><strong>{fila.cantidad} unid.</strong><span className="block text-sm tabular-nums text-zinc-400">{money(fila.total)}</span></span></article>)}</div>}
    </section>
    <ListaSimple titulo="Ventas por categoría" vacio="No hay categorías con ventas cobradas." nota="Las categorías reflejan la clasificación actual del menú, porque esa etiqueta no se guarda históricamente en cada ítem." columnas={['Categoría actual', 'Unidades', 'Importe']} filas={reporte.categorias.map((fila) => [fila.categoria, String(fila.cantidad), money(fila.total)])} />
  </div>
}

function DetalleCuenta({ cuenta }: { cuenta: CuentaReporteAdmin }) {
  return <div className="space-y-3 border-t border-surface-700 p-3 sm:p-4">
    <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-zinc-400"><span>Pago: {metodoCuenta(cuenta)}</span>{cuenta.propina ? <span>Propina {money(cuenta.propina)}</span> : null}{cuenta.vuelto ? <span>Vuelto {money(cuenta.vuelto)}</span> : null}</div>
    {cuenta.estado === 'anulada' && <div className="rounded-lg border border-danger-500/30 bg-danger-500/5 p-3 text-sm text-danger-300">Motivo: {cuenta.motivo_anulacion || 'No hay motivo disponible.'} · Devuelto {money(cuenta.monto_reembolsado)}</div>}
    {!cuenta.pedidos.length ? <p className="text-sm text-zinc-500">No hay comandas vinculadas a esta cuenta.</p> : cuenta.pedidos.map((pedido) => <section key={pedido.pedido_id} className="rounded-lg border border-surface-700 p-3"><h3 className="mb-2 text-sm font-semibold text-zinc-300">Comanda · {pedido.mesa} · {pedido.mesero} · {fmtFecha(pedido.created_at)}</h3><div className="divide-y divide-surface-700/60">{pedido.items.map((item) => <div key={item.id} className={`flex flex-wrap justify-between gap-2 py-2 text-sm ${item.anulado ? 'text-zinc-500 line-through' : 'text-zinc-200'}`}><span>{item.cantidad} × {item.nombre}<span className="ml-2 text-xs no-underline text-zinc-500">{item.categoria}{item.estacion ? ` · ${nombreEstacion(item.estacion)}` : ''}{item.anulado ? ' · anulado' : ''}{item.nota ? ` · ${item.nota}` : ''}</span></span><span className="tabular-nums">{money(item.total)}</span></div>)}</div></section>)}
  </div>
}

function Paginacion({ total, pagina, paginas, cargando, setPagina }: { total: number; pagina: number; paginas: number; cargando: boolean; setPagina: (cambiar: (valor: number) => number) => void }) {
  return <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-surface-700 pt-3 text-sm text-zinc-400"><span>{total} operaciones · página {pagina + 1} de {paginas}</span><div className="flex gap-2"><button type="button" className="btn btn-outline min-h-11 px-3" disabled={pagina === 0 || cargando} onClick={() => setPagina((valor) => valor - 1)}>Anterior</button><button type="button" className="btn btn-outline min-h-11 px-3" disabled={pagina + 1 >= paginas || cargando} onClick={() => setPagina((valor) => valor + 1)}>Siguiente</button></div></div>
}

function Kpi({ titulo, valor, detalle }: { titulo: string; valor: string; detalle: string }) {
  return <article className="card p-4"><p className="text-sm text-zinc-400">{titulo}</p><p className="mt-1 text-2xl font-bold tabular-nums text-zinc-100">{valor}</p><p className="mt-1 text-xs text-zinc-500">{detalle}</p></article>
}

function Barra({ titulo, valor, maximo, detalle }: { titulo: string; valor: number; maximo: number; detalle: string }) {
  const ancho = maximo > 0 ? Math.min(100, Math.max(4, valor / maximo * 100)) : 0
  return <div><div className="mb-1 flex justify-between gap-3 text-sm"><span className="truncate text-zinc-300">{titulo}</span><span className="shrink-0 tabular-nums text-zinc-200">{money(valor)} <span className="text-xs text-zinc-500">· {detalle}</span></span></div><div className="h-2 overflow-hidden rounded-full bg-surface-700"><div className="h-full rounded-full bg-brand-500" style={{ width: `${ancho}%` }} /></div></div>
}

function Dato({ titulo, valor }: { titulo: string; valor: string | number }) {
  return <div className="rounded-lg bg-surface-900/60 p-2"><dt className="text-xs text-zinc-500">{titulo}</dt><dd className="mt-1 font-semibold tabular-nums text-zinc-200">{valor}</dd></div>
}

function ListaSimple({ titulo, vacio, columnas, filas, nota }: { titulo: string; vacio: string; columnas: string[]; filas: string[][]; nota?: string }) {
  return <section className="card overflow-hidden p-4 sm:p-5"><h3 className="titulo-seccion">{titulo}</h3>{nota && <p className="mt-1 text-xs text-zinc-500">{nota}</p>}{!filas.length ? <p className="py-5 text-sm text-zinc-500">{vacio}</p> : <><div className="mt-3 hidden overflow-x-auto sm:block"><table className="w-full min-w-[400px] text-sm"><thead><tr className="text-left text-xs text-zinc-500">{columnas.map((col) => <th key={col} className="pb-2 pr-3 font-medium">{col}</th>)}</tr></thead><tbody>{filas.map((fila, i) => <tr key={`${i}-${fila[0]}`} className="border-t border-surface-700/60">{fila.map((celda, j) => <td key={`${i}-${j}`} className="py-2 pr-3 text-zinc-300">{celda}</td>)}</tr>)}</tbody></table></div><div className="mt-3 space-y-2 sm:hidden">{filas.map((fila, i) => <article key={`${i}-${fila[0]}`} className="rounded-lg border border-surface-700 p-3"><strong className="block break-words text-zinc-100">{fila[0]}</strong><div className="mt-2 grid grid-cols-2 gap-2 text-sm">{fila.slice(1).map((celda, j) => <span key={j} className="break-words text-zinc-400"><span className="text-xs text-zinc-500">{columnas[j + 1]}: </span>{celda}</span>)}</div></article>)}</div></>}</section>
}

function nombreEstacion(estacion: string): string {
  if (estacion === 'bar') return 'Barra'
  if (estacion === 'sin_clasificar') return 'Sin clasificar'
  return estacion.charAt(0).toUpperCase() + estacion.slice(1)
}
