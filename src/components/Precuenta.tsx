import { useEffect, useState } from 'react'
import { getApi } from '../lib/api'
import { useCurrentContext } from '../lib/useCurrentContext'
import { crearPrecuenta, type Precuenta as DatosPrecuenta } from '../domain/cashier/precuenta'
import { fmtFecha, fmtPEN } from '../lib/format'
import { Spinner } from './LoadingScreen'

export default function Precuenta({ mesa, onVolver }: {
  mesa: { id: string; nombre: string }
  onVolver: () => void
}) {
  const { restaurante } = useCurrentContext()
  const [datos, setDatos] = useState<DatosPrecuenta | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)
  const [descargando, setDescargando] = useState(false)
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    let activo = true
    setCargando(true)
    setDatos(null)
    setError(null)
    void (async () => {
      try {
        if (!restaurante) throw new Error('No se pudo identificar el restaurante. Vuelve a iniciar sesión.')
        const api = getApi()
        const pedidos = await api.getPedidosDeMesa(restaurante.id, mesa.id)
        if (pedidos.error) throw new Error(pedidos.error)
        const lista = pedidos.data ?? []
        if (!lista.length) throw new Error('Esta mesa ya no tiene consumo pendiente de cobro.')
        const items = await api.getPedidoItems(lista.map((p) => p.id))
        if (items.error) throw new Error(items.error)
        // Si otra terminal cobró o cambió las comandas durante la lectura, no imprimir datos obsoletos.
        const actuales = await api.getPedidosDeMesa(restaurante.id, mesa.id)
        if (actuales.error) throw new Error(actuales.error)
        const ids = (actuales.data ?? []).map((p) => p.id)
        if (ids.length !== lista.length || lista.some((p) => !ids.includes(p.id))) {
          throw new Error('La cuenta cambió en otra terminal. Actualiza la precuenta para ver el consumo pendiente.')
        }
        const precuenta = crearPrecuenta(mesa, lista, items.data ?? [])
        if (activo) setDatos(precuenta)
      } catch (e) {
        if (activo) setError(e instanceof Error ? e.message : 'No se pudo cargar la precuenta. Revisa tu conexión e inténtalo de nuevo.')
      } finally {
        if (activo) setCargando(false)
      }
    })()
    return () => { activo = false }
  }, [restaurante?.id, mesa.id, mesa.nombre, revision])

  async function descargar() {
    if (!datos || !restaurante) return
    setDescargando(true)
    try {
      const { descargarPrecuentaPdf } = await import('../domain/cashier/precuentaPdf')
      descargarPrecuentaPdf(datos, restaurante)
    } catch {
      setError('No se pudo descargar el PDF. Inténtalo de nuevo o usa Imprimir precuenta.')
    } finally {
      setDescargando(false)
    }
  }

  return (
    <section aria-label="Precuenta" className="space-y-4">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={onVolver} className="btn btn-outline min-h-11 px-4">← Volver</button>
        <button type="button" disabled={cargando} onClick={() => setRevision((n) => n + 1)} className="btn btn-outline min-h-11 px-4">Actualizar precuenta</button>
      </div>
      <p className="no-print text-sm text-zinc-400">Revisa el consumo con el cliente antes de cobrar. La mesa continúa abierta.</p>
      {error && <div role="alert" className="no-print aviso border-danger-500/40 bg-danger-500/10 text-danger-500">{error}</div>}
      {cargando ? <div role="status" className="flex items-center justify-center gap-3 py-12"><Spinner /><span>Cargando consumo pendiente…</span></div> : datos && (
        <div className="grid items-start gap-5 lg:grid-cols-[1fr_280px]">
          <article className="precuenta-print mx-auto w-full max-w-md rounded-xl bg-white p-5 text-sm text-zinc-900 shadow-lg">
            <header className="border-b border-dashed border-zinc-300 pb-4 text-center">
              <p className="break-words text-lg font-bold">{restaurante?.nombre}</p>
              {restaurante?.direccion && <p className="break-words text-xs">{restaurante.direccion}</p>}
              {restaurante?.ruc && <p className="text-xs">RUC: {restaurante.ruc}</p>}
              {restaurante?.telefono && <p className="text-xs">Tel. {restaurante.telefono}</p>}
              <h1 className="mt-4 text-lg font-extrabold tracking-widest">PRECUENTA</h1>
              <p className="text-xs font-semibold">CONSUMO PENDIENTE DE PAGO</p>
              <p className="mt-1 text-xs">No es un comprobante de pago.</p>
            </header>
            <div className="space-y-1 border-b border-dashed border-zinc-300 py-3 text-xs">
              <p className="break-words"><strong>Mesa:</strong> {datos.mesaNombre}</p>
              <p><strong>Emitida:</strong> {fmtFecha(datos.fecha)}</p>
              <p><strong>Comandas pendientes:</strong> {datos.pedidos}</p>
            </div>
            <table className="w-full table-fixed text-xs">
              <thead><tr className="border-b border-zinc-300 text-left"><th scope="col" className="w-10 py-2">Cant.</th><th scope="col" className="py-2">Descripción / P. unit.</th><th scope="col" className="w-20 py-2 text-right">Importe</th></tr></thead>
              <tbody>{datos.items.map((it) => (
                <tr key={it.id} className="border-b border-dashed border-zinc-200">
                  <td className="py-2 align-top">{it.cantidad}</td>
                  <td className="break-words py-2 pr-2">{it.nombre_producto}<span className="block text-zinc-600">{fmtPEN(it.precio_unitario)}</span></td>
                  <td className="py-2 text-right align-top tabular-nums">{fmtPEN(it.importe)}</td>
                </tr>
              ))}</tbody>
            </table>
            <div className="flex justify-between gap-2 py-4 text-lg font-bold"><span>Total consumo</span><span className="tabular-nums" data-testid="precuenta-total">{fmtPEN(datos.total)}</span></div>
            <footer className="space-y-2 border-t border-dashed border-zinc-300 pt-3 text-center text-xs">
              <p>Propina no incluida. Verifica el consumo antes de pagar.</p>
              <p>Importes al momento de emisión; nuevos pedidos pueden modificar el total.</p>
              <p className="text-zinc-600">Generado con Mesora</p>
            </footer>
          </article>
          <div className="no-print flex flex-col gap-3 lg:sticky lg:top-20">
            <button type="button" onClick={() => window.print()} className="btn btn-primary min-h-12 px-4">Imprimir precuenta</button>
            <button type="button" disabled={descargando} onClick={() => void descargar()} className="btn btn-outline min-h-12 px-4">{descargando ? 'Preparando PDF…' : 'Descargar precuenta (PDF)'}</button>
            <p className="text-xs text-zinc-500">La precuenta no registra una venta ni modifica la caja. El cobro se confirma por separado.</p>
          </div>
        </div>
      )}
    </section>
  )
}
