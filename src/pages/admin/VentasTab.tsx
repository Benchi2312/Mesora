import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fmtFecha, fmtPEN } from '../../lib/format'
import { getApi } from '../../lib/api'
import { useCurrentContext } from '../../lib/useCurrentContext'
import { METODOS_PAGO_LABEL } from '../../domain/cashier/pagos'
import type { EstadoFiltroVentas, ReporteVentas } from '../../domain/reporting/ventas'
import { Spinner } from '../../components/LoadingScreen'
import EstadoVacio from '../../components/EstadoVacio'

type Periodo = 'hoy' | 'mes' | 'personalizado'
const hoyInput = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const fechaLocalIso = (valor: string, sumarDias = 0) => {
  const [y, m, d] = valor.split('-').map(Number)
  return new Date(y, m - 1, d + sumarDias).toISOString()
}
const inicioMes = () => `${hoyInput().slice(0, 7)}-01`

export default function VentasTab() {
  const { restaurante } = useCurrentContext()
  const rid = restaurante?.id
  const [periodo, setPeriodo] = useState<Periodo>('hoy')
  const [desde, setDesde] = useState(hoyInput)
  const [hasta, setHasta] = useState(hoyInput)
  const [estado, setEstado] = useState<EstadoFiltroVentas>('todas')
  const [busqueda, setBusqueda] = useState('')
  const [busquedaAplicada, setBusquedaAplicada] = useState('')
  const [pagina, setPagina] = useState(0)
  const [abierta, setAbierta] = useState<string | null>(null)
  const [reporte, setReporte] = useState<ReporteVentas | null>(null)
  const [cargando, setCargando] = useState(true)
  const secuencia = useRef(0)
  const [error, setError] = useState<string | null>(null)
  const limite = 25

  useEffect(() => {
    const timer = setTimeout(() => { setBusquedaAplicada(busqueda.trim()); setPagina(0) }, 250)
    return () => clearTimeout(timer)
  }, [busqueda])

  const rango = useMemo(() => {
    const desdeReal = periodo === 'mes' ? inicioMes() : desde
    const hastaReal = periodo === 'mes' ? hoyInput() : hasta
    return { desde: fechaLocalIso(desdeReal), hasta: fechaLocalIso(hastaReal, 1) }
  }, [periodo, desde, hasta])

  const cargar = useCallback(async () => {
    if (!rid || !desde || !hasta) return
    if (rango.desde >= rango.hasta) {
      setError('La fecha final debe ser igual o posterior a la fecha inicial.')
      setCargando(false)
      return
    }
    const peticion = ++secuencia.current
    setCargando(true)
    const res = await getApi().getReporteVentas(rid, {
      ...rango, estado, busqueda: busquedaAplicada, offset: pagina * limite, limite,
    })
    if (peticion !== secuencia.current) return
    if (res.error) setError(res.error)
    else { setReporte(res.data); setError(null) }
    setCargando(false)
  }, [rid, rango, estado, busquedaAplicada, pagina])

  useEffect(() => { void cargar() }, [cargar])

  const seleccionarPeriodo = (valor: Periodo) => {
    setPeriodo(valor)
    setPagina(0)
    if (valor === 'hoy') { setDesde(hoyInput()); setHasta(hoyInput()) }
    if (valor === 'mes') { setDesde(inicioMes()); setHasta(hoyInput()) }
  }

  const totalPaginas = Math.max(1, Math.ceil((reporte?.total_cuentas ?? 0) / limite))

  return (
    <section className="space-y-5" aria-label="Reporte detallado de ventas">
      <div className="aviso border-brand-500/30 bg-brand-500/10 text-brand-300">
        Reporte interno de Mesora. La facturación electrónica sigue realizándose en el sistema fiscal que usa el restaurante.
      </div>

      <div className="card space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap gap-2" aria-label="Periodo del reporte">
          {([['hoy', 'Hoy'], ['mes', 'Este mes'], ['personalizado', 'Fechas']] as const).map(([id, label]) => (
            <button key={id} type="button" aria-pressed={periodo === id} onClick={() => seleccionarPeriodo(id)}
              className={`btn min-h-11 px-4 ${periodo === id ? 'btn-primary' : 'btn-outline'}`}>{label}</button>
          ))}
          {periodo === 'personalizado' && <div className="flex flex-wrap items-center gap-2">
            <label className="text-sm text-zinc-400">Desde <input aria-label="Fecha desde" type="date" value={desde} onChange={(e) => { setDesde(e.target.value); setPagina(0) }} className="input ml-2 min-h-11 w-auto" /></label>
            <label className="text-sm text-zinc-400">Hasta <input aria-label="Fecha hasta" type="date" value={hasta} onChange={(e) => { setHasta(e.target.value); setPagina(0) }} className="input ml-2 min-h-11 w-auto" /></label>
          </div>}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm text-zinc-400">Buscar cuenta, mesa, mesero o producto
            <input className="input mt-1 min-h-11 w-full" type="search" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Ej. B001-000124 o Lomo saltado" />
          </label>
          <label className="text-sm text-zinc-400">Estado de la cuenta
            <select className="input mt-1 min-h-11 w-full" value={estado} onChange={(e) => { setEstado(e.target.value as EstadoFiltroVentas); setPagina(0) }}>
              <option value="todas">Pagadas y anuladas</option><option value="pagada">Solo cobradas</option><option value="anulada">Solo anuladas</option>
            </select>
          </label>
        </div>
      </div>

      {error && <div role="alert" className="aviso border-danger-500/40 bg-danger-500/10 text-danger-400">No se pudo cargar el reporte: {error}</div>}
      {cargando && !reporte ? <div className="flex justify-center py-12"><Spinner /></div> : reporte && <>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <Resumen titulo="Ventas cobradas" valor={fmtPEN(reporte.resumen.ventas)} detalle={`${reporte.resumen.cuentas_pagadas} cuentas`} />
          <Resumen titulo="Ticket promedio" valor={fmtPEN(reporte.resumen.ticket_promedio)} detalle="Solo cuentas cobradas" />
          <Resumen titulo="Propinas" valor={fmtPEN(reporte.resumen.propinas)} detalle="Separadas de las ventas" />
          <Resumen titulo="Anulaciones" valor={String(reporte.resumen.cuentas_anuladas)} detalle={`Reembolsos ${fmtPEN(reporte.resumen.reembolsos)}`} />
          <Resumen titulo="Productos vendidos" valor={String(reporte.productos.filter((p) => !p.es_bebida).reduce((s, p) => s + p.cantidad, 0))} detalle={`${fmtPEN(reporte.productos.filter((p) => !p.es_bebida).reduce((s, p) => s + p.total, 0))} en comida`} />
          <Resumen titulo="Bebidas vendidas" valor={String(reporte.productos.filter((p) => p.es_bebida).reduce((s, p) => s + p.cantidad, 0))} detalle={`${fmtPEN(reporte.productos.filter((p) => p.es_bebida).reduce((s, p) => s + p.total, 0))} en bebidas`} />
        </div>

        <div className="grid gap-5 xl:grid-cols-3">
          <Lista titulo="Más vendidos" vacio="No hay productos cobrados en este periodo." columnas={['Producto', 'Unid.', 'Venta']}>
            {reporte.productos.slice(0, 8).map((p) => <tr key={`${p.nombre}-${p.es_bebida}`} className="border-t border-surface-700/60"><td className="py-2 pr-2 text-zinc-200">{p.nombre}<span className="ml-2 text-xs text-zinc-500">{p.es_bebida ? 'Bebida' : 'Comida'}</span></td><td className="py-2 pr-2 text-right tabular-nums">{p.cantidad}</td><td className="py-2 text-right tabular-nums">{fmtPEN(p.total)}</td></tr>)}
          </Lista>
          <Lista titulo="Ventas por mesero" vacio="No hay ventas atribuidas en este periodo." columnas={['Mesero', 'Pedidos', 'Venta']}>
            {reporte.meseros.slice(0, 8).map((m) => <tr key={m.id} className="border-t border-surface-700/60"><td className="py-2 pr-2 text-zinc-200">{m.nombre}<span className="block text-xs text-zinc-500">{m.unidades} artículos</span></td><td className="py-2 pr-2 text-right tabular-nums">{m.pedidos}</td><td className="py-2 text-right tabular-nums">{fmtPEN(m.ventas)}</td></tr>)}
          </Lista>
          <Lista titulo="Ventas por mesa" vacio="No hay consumos cobrados en este periodo." columnas={['Mesa', 'Cuentas', 'Venta']}>
            {reporte.mesas.slice(0, 8).map((m) => <tr key={m.id} className="border-t border-surface-700/60"><td className="py-2 text-zinc-200">{m.nombre}</td><td className="py-2 text-right tabular-nums">{m.cuentas}</td><td className="py-2 text-right tabular-nums">{fmtPEN(m.ventas)}</td></tr>)}
          </Lista>
        </div>

        <div className="card overflow-hidden p-4 sm:p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div><h2 className="titulo-seccion">Cuentas y consumo</h2><p className="mt-1 text-sm text-zinc-500">Abre una cuenta para ver sus pedidos e ítems.</p></div>
            {cargando && <span className="text-sm text-zinc-500">Actualizando…</span>}
          </div>
          {!reporte.cuentas.length ? <EstadoVacio titulo="No hay cuentas para estos filtros." /> : <div className="space-y-2">
            {reporte.cuentas.map((c) => <article key={c.id} className="rounded-xl border border-surface-700 bg-surface-900/60">
              <button type="button" aria-expanded={abierta === c.id} onClick={() => setAbierta(abierta === c.id ? null : c.id)} className="flex min-h-14 w-full flex-wrap items-center justify-between gap-2 p-3 text-left sm:p-4">
                <span><strong className="text-zinc-100">{c.numero || `Cuenta ${c.id.slice(0, 8)}`}</strong><span className="ml-2 text-sm text-zinc-400">{c.mesas} · {fmtFecha(c.pagado_at ?? c.anulada_at ?? c.created_at)}</span><span className="mt-1 block text-sm text-zinc-500">Atendió: {c.meseros}</span></span>
                <span className="flex items-center gap-2"><span className={c.estado === 'pagada' ? 'chip chip-ok' : 'chip chip-danger'}>{c.estado === 'pagada' ? 'Cobrada' : 'Anulada'}</span><strong className="tabular-nums text-zinc-100">{fmtPEN(c.total)}</strong><span aria-hidden="true" className="text-zinc-500">{abierta === c.id ? '−' : '+'}</span></span>
              </button>
              {abierta === c.id && <div className="space-y-4 border-t border-surface-700 p-3 sm:p-4">
                <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-zinc-400"><span>Pago: {c.pagos.length ? c.pagos.map((p) => `${METODOS_PAGO_LABEL[p.metodo_pago as keyof typeof METODOS_PAGO_LABEL] ?? p.metodo_pago} ${fmtPEN(p.monto)}`).join(' · ') : METODOS_PAGO_LABEL[c.metodo_pago as keyof typeof METODOS_PAGO_LABEL] ?? c.metodo_pago}</span>{c.propina ? <span>Propina {fmtPEN(c.propina)}</span> : null}{c.vuelto ? <span>Vuelto {fmtPEN(c.vuelto)}</span> : null}</div>
                {c.estado === 'anulada' && <div className="rounded-lg border border-danger-500/30 bg-danger-500/5 p-3 text-sm text-danger-300">Anulada: {c.motivo_anulacion || 'Sin motivo registrado'}{c.monto_reembolsado != null ? ` · Reembolsado ${fmtPEN(c.monto_reembolsado)}` : ''}</div>}
                {c.pedidos.map((p) => <section key={p.pedido_id} className="rounded-lg border border-surface-700 p-3"><h3 className="mb-2 text-sm font-semibold text-zinc-300">Pedido · {p.mesa} · {p.mesero} · {fmtFecha(p.created_at)}</h3><div className="divide-y divide-surface-700/60">{p.items.map((i, n) => <div key={`${p.pedido_id}-${n}`} className={`flex flex-wrap justify-between gap-2 py-2 text-sm ${i.anulado ? 'text-zinc-500 line-through' : 'text-zinc-200'}`}><span>{i.cantidad} × {i.nombre}<span className="ml-2 text-xs no-underline text-zinc-500">{i.es_bebida ? 'Bebida' : 'Comida'}{i.anulado ? ' · anulado' : ''}{i.nota ? ` · ${i.nota}` : ''}</span></span><span className="tabular-nums">{fmtPEN(i.total)}</span></div>)}</div></section>)}
              </div>}
            </article>)}
          </div>}
          <div className="mt-4 flex items-center justify-between border-t border-surface-700 pt-3 text-sm text-zinc-400"><span>{reporte.total_cuentas} cuentas · página {pagina + 1} de {totalPaginas}</span><div className="flex gap-2"><button type="button" className="btn btn-outline min-h-11 px-3" disabled={pagina === 0 || cargando} onClick={() => setPagina((x) => x - 1)}>Anterior</button><button type="button" className="btn btn-outline min-h-11 px-3" disabled={pagina + 1 >= totalPaginas || cargando} onClick={() => setPagina((x) => x + 1)}>Siguiente</button></div></div>
        </div>
      </>}
    </section>
  )
}

function Resumen({ titulo, valor, detalle }: { titulo: string; valor: string; detalle: string }) {
  return <article className="card p-4"><p className="text-sm text-zinc-400">{titulo}</p><p className="mt-1 text-2xl font-bold tabular-nums text-zinc-100">{valor}</p><p className="mt-1 text-xs text-zinc-500">{detalle}</p></article>
}

function Lista({ titulo, vacio, columnas, children }: { titulo: string; vacio: string; columnas: string[]; children: React.ReactNode }) {
  const esVacia = !children || (Array.isArray(children) && children.length === 0)
  return <section className="card overflow-hidden p-4"><h2 className="titulo-seccion mb-3">{titulo}</h2>{esVacia ? <p className="py-4 text-sm text-zinc-500">{vacio}</p> : <table className="w-full text-sm"><thead><tr className="text-left text-xs text-zinc-500">{columnas.map((c, i) => <th key={c} className={`pb-2 font-medium ${i > 0 ? 'text-right' : ''}`}>{c}</th>)}</tr></thead><tbody>{children}</tbody></table>}</section>
}
