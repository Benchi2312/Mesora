import { useEffect, useState, type ReactNode } from 'react'
import { getApi } from '../../lib/api'
import { useCurrentContext } from '../../lib/useCurrentContext'
import { fmtPEN } from '../../lib/format'
import { METODOS_PAGO_LABEL } from '../../domain/cashier/pagos'
import type { MetricasAdmin } from '../../domain/reporting/metricas'
import { construirReporte, descargarReporte } from '../../domain/reporting/reporte'
import type { MetodoPago } from '../../types/database'
import { Spinner } from '../../components/LoadingScreen'
import EstadoVacio from '../../components/EstadoVacio'

const METODO_LABEL: Record<MetodoPago | 'desconocido', string> = {
  ...METODOS_PAGO_LABEL,
  desconocido: '—',
}

const PALETA_AVATAR = ['#f59e0b', '#6366f1', '#10b981', '#8b5cf6', '#ec4899', '#14b8a6']

function hashStr(s: string) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h
}

function colorDe(nombre: string) {
  return PALETA_AVATAR[hashStr(nombre) % PALETA_AVATAR.length]
}

function letraColor(_nombre: string) {
  return '#0a0a0a'
}

function iniciales(nombre: string) {
  return nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((x) => x[0]?.toUpperCase() ?? '')
    .join('')
}

export default function DashboardTab() {
  const { restaurante } = useCurrentContext()
  const [metricas, setMetricas] = useState<MetricasAdmin | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [exportando, setExportando] = useState(false)
  const [avisoExport, setAvisoExport] = useState<string | null>(null)

  useEffect(() => {
    const rid = restaurante?.id
    if (!rid) {
      setCargando(false)
      return
    }
    let activo = true
    setCargando(true)
    setError(null)
    ;(async () => {
      const { data, error: apiErr } = await getApi().getMetricasAdmin(rid)
      if (!activo) return
      if (apiErr) {
        setError(apiErr)
      } else {
        setMetricas(data)
        setError(null)
      }
      setCargando(false)
    })()
    return () => {
      activo = false
    }
  }, [restaurante?.id])

  /**
   * Exporta el reporte. Se piden las cuentas pagadas aparte (y no se guarda en
   * estado) porque el CSV solo se arma en el momento de descargar: mantener
   * la lista en memoria no aporta y duplica lo que ya vive en la API.
   */
  async function exportarCsv() {
    if (!restaurante || !metricas) return
    setExportando(true)
    setAvisoExport(null)
    const { data: cuentas, error: apiErr } = await getApi().getCuentasPagadas(restaurante.id)
    if (apiErr) {
      setAvisoExport(`No se pudo generar el reporte: ${apiErr}`)
      setExportando(false)
      return
    }
    descargarReporte(construirReporte(restaurante.nombre, cuentas ?? [], metricas))
    setExportando(false)
    setAvisoExport('Reporte descargado.')
  }

  if (cargando)
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    )

  if (error)
    return (
      <div className="aviso border-danger-500/40 bg-danger-500/10 text-danger-500">
        No se pudieron cargar las ventas. {error}
      </div>
    )

  /**
   * Imprime el panel completo. El CSS por defecto solo deja visible la boleta
   * (todo lo demás es `visibility: hidden`), así que hay que marcar el body
   * mientras dura la impresión y quitarlo al terminar.
   */
  function imprimirReporte() {
    document.body.classList.add('imprimir-reporte')
    const limpiar = () => document.body.classList.remove('imprimir-reporte')
    window.addEventListener('afterprint', limpiar, { once: true })
    window.print()
    // Safari no siempre dispara afterprint si el diálogo se cancela con Esc.
    setTimeout(limpiar, 1000)
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-zinc-500">
          Números del mes en curso. El CSV incluye el detalle diario.
        </p>
        <div className="no-print flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-guia="exportar-csv"
            onClick={() => void exportarCsv()}
            disabled={exportando || !metricas}
            className="min-h-11 touch-manipulation rounded-xl border border-surface-700 bg-surface-800 px-4 py-2.5 text-sm font-semibold text-zinc-200 transition hover:border-brand-500 hover:text-brand-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {exportando ? 'Generando…' : 'Exportar CSV'}
          </button>
          <button
            type="button"
            onClick={imprimirReporte}
            className="min-h-11 touch-manipulation rounded-xl border border-surface-700 bg-surface-800 px-4 py-2.5 text-sm font-semibold text-zinc-200 transition hover:border-surface-500 hover:text-zinc-100"
          >
            Imprimir
          </button>
        </div>
      </div>

      {avisoExport && (
        <p
          role="status"
          className={`no-print aviso ${
            avisoExport.startsWith('No se pudo')
              ? 'border-danger-500/40 bg-danger-500/10 text-danger-500'
              : 'border-ok-500/40 bg-ok-500/10 text-ok-500'
          }`}
        >
          {avisoExport}
        </p>
      )}

      {/* Tarjetas resumen */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <TarjetaResumen
          etiqueta="Ventas hoy"
          valor={fmtPEN(metricas?.ventaHoy ?? 0)}
          detalle={`${metricas?.cuentasHoy ?? 0} cuentas`}
          acento="text-brand-400"
          guia="panel-ventas"
        />
        <TarjetaResumen
          etiqueta="Ventas del mes"
          valor={fmtPEN(metricas?.ventaMes ?? 0)}
          detalle={`${metricas?.cuentasMes ?? 0} cuentas`}
          acento="text-ok-500"
        />
        <TarjetaResumen
          etiqueta="Ticket promedio"
          valor={fmtPEN(metricas?.ticketPromedio ?? 0)}
          detalle="por cuenta (mes)"
          acento="text-zinc-100"
        />
        <TarjetaResumen
          etiqueta="Propinas del mes"
          valor={fmtPEN(metricas?.propinasMes ?? 0)}
          detalle={`${fmtPEN(metricas?.vueltoMes ?? 0)} de vuelto`}
          acento="text-zinc-300"
        />
        <TarjetaResumen
          etiqueta="Cuentas pagadas hoy"
          valor={String(metricas?.cuentasHoy ?? 0)}
          detalle={`${metricas?.cuentasMes ?? 0} en el mes`}
          acento="text-brand-400"
        />
        {/* Las anulaciones no son venta (ya no están en "Ventas del mes"), pero
            mostrarlas evita el "¿por qué el arqueo no cuadra con lo que dice el
            dashboard?": el dinero devuelto tiene que verse en algún lado. */}
        <TarjetaResumen
          etiqueta="Anulaciones del mes"
          valor={String(metricas?.anulacionesMes ?? 0)}
          detalle={
            (metricas?.anulacionesMes ?? 0) > 0
              ? `${fmtPEN(metricas?.reembolsosMes ?? 0)} devueltos`
              : 'ninguna boleta anulada'
          }
          acento={(metricas?.anulacionesMes ?? 0) > 0 ? 'text-danger-500' : 'text-zinc-500'}
        />
      </div>

      {/* Top productos y meseros */}
      <div className="grid gap-5 lg:grid-cols-2">
        <Seccion titulo="Top productos">
          {metricas && metricas.topProductos.length > 0 ? (
            <ul className="space-y-2">
              {metricas.topProductos.map((tp, i) => (
                <li key={tp.nombre} className="flex items-center gap-3 text-sm">
                  <span
                    className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold ${
                      i === 0 ? 'bg-brand-500 text-surface-950' : 'bg-surface-700 text-zinc-300'
                    }`}
                  >
                    {i + 1}
                  </span>
                  <span className="flex-1 text-zinc-200">{tp.nombre}</span>
                  <span className="text-zinc-400">{tp.cantidad} u.</span>
                  <span className="w-20 text-right font-semibold text-brand-400">{fmtPEN(tp.total)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <EstadoVacio titulo="Aún no hay ventas para mostrar." className="py-10" />
          )}
        </Seccion>

        <Seccion titulo="Ventas por mesero">
          {metricas && metricas.porMesero.length > 0 ? (
            <ul className="space-y-2">
              {metricas.porMesero.map((m) => (
                <li key={m.meseroId} className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex min-w-0 items-center gap-2.5">
                    <span
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[11px] font-bold uppercase"
                      style={{ backgroundColor: colorDe(m.nombre), color: letraColor(m.nombre) }}
                      title={m.nombre}
                    >
                      {iniciales(m.nombre)}
                    </span>
                    <span className="truncate text-zinc-200">{m.nombre}</span>
                  </span>
                  <span className="shrink-0 text-xs text-zinc-500">{m.pedidos} {m.pedidos === 1 ? 'comanda' : 'comandas'}</span>
                  <span className="shrink-0 font-semibold text-brand-400">{fmtPEN(m.ventas)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <EstadoVacio titulo="Sin ventas registradas." className="py-10" />
          )}
        </Seccion>
      </div>

      {/* Métodos de pago y horarios */}
      <div className="grid gap-5 lg:grid-cols-2">
        <Seccion titulo="Métodos de pago">
          {metricas && metricas.porMetodo.length > 0 ? (
            <ul className="space-y-3">
              {metricas.porMetodo.map((m) => {
                const totalMetodos = metricas.porMetodo.reduce((a, x) => a + x.total, 0)
                const pct = totalMetodos > 0 ? Math.round((m.total / totalMetodos) * 100) : 0
                return (
                  <li key={m.metodo}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="text-zinc-200">{METODO_LABEL[m.metodo] ?? m.metodo}</span>
                      <span className="text-xs text-zinc-500">{m.cuentas} cuentas</span>
                      <span className="font-semibold text-zinc-100">{fmtPEN(m.total)} · {pct}%</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-surface-700">
                      <div className="h-full rounded-full bg-brand-500" style={{ width: `${pct}%` }} />
                    </div>
                  </li>
                )
              })}
            </ul>
          ) : (
            <EstadoVacio titulo="Sin pagos registrados." className="py-10" />
          )}
        </Seccion>

        <Seccion titulo="Horarios pico">
          {metricas && metricas.porHora.length > 0 ? (
            <ul className="space-y-2">
              {metricas.porHora.map((h) => {
                const max = Math.max(...metricas.porHora.map((x) => x.total), 1)
                const pct = Math.round((h.total / max) * 100)
                return (
                  <li key={h.hora} className="text-sm">
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-zinc-300">{h.hora}</span>
                      <span className="text-zinc-500">{h.cuentas} cuentas</span>
                      <span className="font-semibold text-brand-400">{fmtPEN(h.total)}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-surface-700">
                      <div className="h-full rounded-full bg-ok-500" style={{ width: `${pct}%` }} />
                    </div>
                  </li>
                )
              })}
            </ul>
          ) : (
            <EstadoVacio titulo="Sin ventas para mostrar." className="py-10" />
          )}
        </Seccion>
      </div>
    </div>
  )
}

function TarjetaResumen({
  etiqueta,
  valor,
  detalle,
  acento,
  guia,
}: {
  etiqueta: string
  valor: string
  detalle: string
  acento: string
  /** Marca la tarjeta para el resaltado del recorrido guiado del demo. */
  guia?: string
}) {
  return (
    <div data-guia={guia} className="card card-hover p-5 transition-transform duration-150 hover:-translate-y-0.5">
      <p className="text-xs font-medium uppercase tracking-widest text-zinc-500">{etiqueta}</p>
      <p className={`mt-2.5 text-2xl font-extrabold tracking-tight sm:text-[1.75rem] ${acento}`}>{valor}</p>
      <p className="mt-1.5 text-xs text-zinc-500">{detalle}</p>
    </div>
  )
}

function Seccion({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="card p-5 sm:p-6">
      <h2 className="titulo-seccion mb-4 text-xs font-semibold">{titulo}</h2>
      {children}
    </section>
  )
}