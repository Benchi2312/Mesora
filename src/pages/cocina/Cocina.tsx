import { useCallback, useEffect, useMemo, useState } from 'react'
import PageHeader from '../../components/PageHeader'
import { getApi, type ItemResumen, type PedidoConItems, type UsuarioResumen } from '../../lib/api'
import { useCurrentContext } from '../../lib/useCurrentContext'
import { fmtFecha, fmtPEN } from '../../lib/format'
import { useElapsed } from '../../lib/useElapsed'
import { enDemo } from '../../lib/api'
import type { EstadoPedido, Mesa } from '../../types/database'
import { Spinner } from '../../components/LoadingScreen'
import EstadoVacio from '../../components/EstadoVacio'
import { Modal } from '../../components/ui'

/* Íconos SVG de línea (consistentes con el resto de la app) */
function IconoOlla({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 9h14v6a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3z" />
      <path d="M8 3.5V7M12 3.5V7M16 3.5V7" />
    </svg>
  )
}

function IconoVaso({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 3h14l-4.5 9.5a2.2 2.2 0 0 1-2 1.2h-1a2.2 2.2 0 0 1-2-1.2Z" />
      <path d="M12 13.7v4.8M8.5 21h7" />
    </svg>
  )
}

function IconoReloj({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  )
}

function IconoNota({ className = 'h-3.5 w-3.5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 4h12a1 1 0 0 1 1 1v11l-5 4H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z" />
      <path d="M9 8.5h6M9 12h6M9 15.5h3" />
    </svg>
  )
}

function IconoImpresora({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 9V4h10v5" />
      <path d="M5 9h14a1 1 0 0 1 1 1v6h-3v4H7v-4H4v-6a1 1 0 0 1 1-1Z" />
      <path d="M7 16h10" />
    </svg>
  )
}

const COLUMNAS: { estado: EstadoPedido; titulo: string; boton: string; color: string }[] = [
  {
    estado: 'pendiente',
    titulo: 'Pendientes',
    boton: 'Empezar preparación',
    color: 'bg-warn-500',
  },
  {
    estado: 'en_preparacion',
    titulo: 'En preparación',
    boton: 'Marcar listo',
    color: 'bg-brand-500',
  },
  {
    estado: 'listo',
    titulo: 'Listos',
    boton: 'Entregar',
    color: 'bg-ok-500',
  },
]

type Estacion = 'cocina' | 'barra'

export default function Cocina() {
  const { restaurante } = useCurrentContext()
  const [pedidos, setPedidos] = useState<PedidoConItems[]>([])
  const [mesas, setMesas] = useState<Mesa[]>([])
  const [meseros, setMeseros] = useState<UsuarioResumen[]>([])
  const [estacion, setEstacion] = useState<Estacion>('cocina')
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  /** Ids de comandas cuyo avance está en vuelo (evita el doble toque). */
  const [avanzando, setAvanzando] = useState<ReadonlySet<string>>(() => new Set())
  /** Comanda que se está previsualizando para imprimir en la impresora de la estación. */
  const [ticket, setTicket] = useState<{ p: PedidoConItems; mesaNombre: string } | null>(null)

  const cargar = useCallback(async () => {
    const rid = restaurante?.id
    if (!rid) return
    const api = getApi()
    const [pRes, mRes, uRes] = await Promise.all([
      api.getPedidosActivos(rid),
      api.getMesas(rid),
      api.getMeseros(rid),
    ])
    if (pRes.error || mRes.error || uRes.error) {
      setError(pRes.error ?? mRes.error ?? uRes.error ?? 'Error al cargar comandas')
      return
    }
    setPedidos(pRes.data ?? [])
    setMesas(mRes.data ?? [])
    setMeseros(uRes.data ?? [])
    // Refetch OK: el error anterior era de la corrida previa, no de esta.
    // Sin esto, un fallo puntual queda pegado en pantalla para siempre.
    setError(null)
  }, [restaurante?.id])

  useEffect(() => {
    const rid = restaurante?.id
    if (!rid) return
    let activo = true
    setCargando(true)
    ;(async () => {
      await cargar()
      if (activo) setCargando(false)
    })()

    // En producción, refetch periódico (equivalente simple al realtime).
    const intervalo = enDemo() ? null : setInterval(() => void cargar(), 10_000)
    return () => {
      activo = false
      if (intervalo) clearInterval(intervalo)
    }
  }, [cargar, restaurante?.id])

  async function avanzar(p: PedidoConItems) {
    const rid = restaurante?.id
    if (!rid) return
    // Bloqueo mientras corre: sin esto, un doble toque o dos cocineros sobre la
    // misma tarjeta advancing dos veces se salta un estado de la comanda.
    if (avanzando.has(p.id)) return
    setAvanzando((prev) => new Set(prev).add(p.id))
    const { error: apiErr } = await getApi().avanzarPedido(rid, p.id)
    if (apiErr) {
      setError(apiErr)
      setAvanzando((prev) => {
        const next = new Set(prev)
        next.delete(p.id)
        return next
      })
      return
    }
    await cargar()
    setAvanzando((prev) => {
      const next = new Set(prev)
      next.delete(p.id)
      return next
    })
  }

  const nombreMesa = new Map(mesas.map((m) => [m.id, m.nombre]))
  const nombreMesero = new Map(meseros.map((u) => [u.id, u.nombre]))

  // Divide cada pedido en sus ítems de cocina (comida) y de barra (bebidas).
  const { cocina, barra } = useMemo(() => {
    const cocina: PedidoConItems[] = []
    const barra: PedidoConItems[] = []
    for (const p of pedidos) {
      const itemsComida = p.items.filter((it) => !it.es_bebida)
      const itemsBebida = p.items.filter((it) => it.es_bebida)
      // Lo anulado se muestra en la estación donde se prepara, para que nadie
      // lo cocine por error ni se entere a medias.
      const anuladosComida = p.anulados.filter((it) => !it.es_bebida)
      const anuladosBebida = p.anulados.filter((it) => it.es_bebida)
      if (itemsComida.length > 0 || anuladosComida.length > 0) {
        cocina.push({ ...p, items: itemsComida, anulados: anuladosComida })
      }
      if (itemsBebida.length > 0 || anuladosBebida.length > 0) {
        barra.push({ ...p, items: itemsBebida, anulados: anuladosBebida })
      }
    }
    return { cocina, barra }
  }, [pedidos])

  const activos = estacion === 'cocina' ? cocina : barra
  const porEstado = (estado: EstadoPedido) => activos.filter((p) => p.estado === estado)

  if (cargando)
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    )

  return (
    <div>
      <PageHeader
        titulo="Cocina y barra"
        descripcion="Comandas en vivo, separadas por estación y tiempo de espera."
      />

      {error && (
        <div className="aviso mb-6 border-danger-500/40 bg-danger-500/10 text-danger-500">
          {error}
        </div>
      )}

      {/* Selector de estación (Cocina / Barra) — táctil */}
      <div className="mb-6 grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => setEstacion('cocina')}
          aria-pressed={estacion === 'cocina'}
          className={`flex min-h-14 touch-manipulation items-center justify-center gap-2 rounded-xl border-2 px-4 py-3 text-base font-semibold transition active:scale-[0.98] ${
            estacion === 'cocina'
              ? 'border-brand-500 bg-brand-500/15 text-brand-400 shadow-sm shadow-brand-500/10'
              : 'border-surface-700 bg-surface-800 text-zinc-300 hover:border-surface-500'
          }`}
        >
          <IconoOlla />
          Cocina
          <span className="rounded-full border border-surface-600 px-2.5 py-0.5 text-sm tabular-nums">
            {cocina.length}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setEstacion('barra')}
          aria-pressed={estacion === 'barra'}
          className={`flex min-h-14 touch-manipulation items-center justify-center gap-2 rounded-xl border-2 px-4 py-3 text-base font-semibold transition active:scale-[0.98] ${
            estacion === 'barra'
              ? 'border-brand-500 bg-brand-500/15 text-brand-400 shadow-sm shadow-brand-500/10'
              : 'border-surface-700 bg-surface-800 text-zinc-300 hover:border-surface-500'
          }`}
        >
          <IconoVaso />
          Barra
          <span className="rounded-full border border-surface-600 px-2.5 py-0.5 text-sm tabular-nums">
            {barra.length}
          </span>
        </button>
      </div>

      {activos.length === 0 && (
        <EstadoVacio
          icono={estacion === 'cocina' ? <IconoOlla className="h-6 w-6" /> : <IconoVaso className="h-6 w-6" />}
          titulo={`No hay comandas en ${estacion === 'cocina' ? 'cocina' : 'la barra'}`}
          descripcion={
            estacion === 'cocina'
              ? 'Cuando un mesero envíe una comanda con comida aparecerá aquí.'
              : 'Cuando un mesero envíe una comanda con bebidas aparecerá aquí.'
          }
        />
      )}

      <div className="grid gap-5 md:grid-cols-3">
        {COLUMNAS.map((col) => {
          const lista = porEstado(col.estado)
          return (
            <section
              key={col.estado}
              className="card p-4 sm:p-5"
            >
              <div className="mb-3 flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-zinc-300">
                  <span className={`h-2 w-2 rounded-full ${col.color}`} />
                  {col.titulo}
                </h2>
                <span className="rounded-full border border-surface-700 px-2 py-0.5 text-xs text-zinc-400">
                  {lista.length}
                </span>
              </div>

              <div className="space-y-3">
                {lista.length === 0 && (
                  <p className="py-6 text-center text-sm text-zinc-600">Sin comandas</p>
                )}
                {lista.map((p) => (
                   <TarjetaComanda
                     key={p.id}
                     p={p}
                     mesaNombre={nombreMesa.get(p.mesa_id) ?? '—'}
                     meseroNombre={nombreMesero.get(p.mesero_id)}
                     boton={col.boton}
                     onAvanzar={() => void avanzar(p)}
                     avanzando={avanzando.has(p.id)}
                     onImprimir={() => setTicket({ p, mesaNombre: nombreMesa.get(p.mesa_id) ?? '—' })}
                   />
                 ))}
               </div>
             </section>
           )
         })}
       </div>
       {ticket && (
         <TicketComanda
           pedido={ticket.p}
           mesaNombre={ticket.mesaNombre}
           estacion={estacion}
           onCerrar={() => setTicket(null)}
         />
       )}
     </div>
   )
}

function TarjetaComanda({
  p,
  mesaNombre,
  meseroNombre,
  boton,
  onAvanzar,
  avanzando,
  onImprimir,
}: {
  p: PedidoConItems
  mesaNombre: string
  meseroNombre?: string
  boton: string
  onAvanzar: () => void
  avanzando: boolean
  onImprimir: () => void
}) {
  const tiempo = useElapsed(p.created_at)
  const total = p.items.reduce((a, it) => a + it.cantidad * it.precio_unitario, 0)

  return (
    <div className="rounded-xl border border-surface-700 bg-surface-800 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-lg font-bold tracking-tight text-zinc-100">{mesaNombre}</p>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-surface-600 bg-surface-900 px-3 py-1 text-sm tabular-nums text-brand-400">
          <IconoReloj />
          {tiempo}
        </span>
      </div>
      <p className="mt-0.5 text-sm text-zinc-500">
        {meseroNombre ? `${meseroNombre} · ` : ''}Hace {tiempo}
      </p>

      <ul className="mt-3 divide-y divide-surface-700/60 text-base">
        {p.items.map((it: ItemResumen) => (
          <li key={it.id} className="py-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-zinc-100">
                <span className="font-semibold text-brand-400">{it.cantidad}×</span> {it.nombre_producto}
              </span>
            </div>
            {it.nota && (
              <p className="mt-1 flex items-center gap-1.5 text-sm text-warn-400">
                <IconoNota />
                {it.nota}
              </p>
            )}
          </li>
        ))}
      </ul>

      {p.anulados.length > 0 && (
        <ul className="mt-2 space-y-1 rounded-lg border border-danger-500/30 bg-danger-500/5 px-3 py-2 text-sm text-danger-500">
          {p.anulados.map((it) => (
            <li key={it.id} className="line-through">
              {it.cantidad}× {it.nombre_producto}
              <span className="ml-1 no-underline">— anulado por el mesero</span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex flex-col gap-2 border-t border-surface-700 pt-3">
        <span className="text-sm text-zinc-500">{fmtPEN(total)}</span>
        <button
          type="button"
          data-guia="avanzar-pedido"
          data-guia-avanzar={p.id}
          onClick={onAvanzar}
          disabled={avanzando}
          aria-busy={avanzando}
          className="min-h-14 w-full touch-manipulation rounded-xl bg-brand-500 px-4 py-3 text-base font-semibold text-surface-950 transition hover:bg-brand-400 active:scale-[0.98] disabled:cursor-wait disabled:opacity-60"
        >
          {avanzando ? 'Guardando…' : boton}
        </button>
        <button
          type="button"
          onClick={onImprimir}
          className="min-h-12 touch-manipulation rounded-xl border border-surface-700 px-4 py-2.5 text-sm font-medium text-zinc-300 transition hover:border-brand-500 hover:text-brand-500 active:scale-[0.98]"
        >
          <span className="inline-flex items-center justify-center gap-2">
            <IconoImpresora />
            Imprimir comanda
          </span>
        </button>
      </div>
    </div>
  )
}

function TicketComanda({
  pedido,
  mesaNombre,
  estacion,
  onCerrar,
}: {
  pedido: PedidoConItems
  mesaNombre: string
  estacion: Estacion
  onCerrar: () => void
}) {
  const { restaurante } = useCurrentContext()
  const nombreMesero = useMeseroNombre(pedido.mesero_id)
  useEffect(() => {
    const id = setTimeout(() => {
      window.print()
      onCerrar()
    }, 150)
    return () => clearTimeout(id)
  }, [onCerrar])

  const items = pedido.items
  const anulados = pedido.anulados

  return (
    <Modal titulo={`Comanda de ${estacion === 'cocina' ? 'cocina' : 'barra'}`} onCerrar={onCerrar} ancho="max-w-xs">
      <div className="boleta-print mx-auto w-full max-w-xs overflow-hidden rounded-xl border border-surface-800 bg-surface-900 text-xs shadow-lg shadow-black/30">
        <div className="border-b border-dashed border-surface-700 p-3 text-center">
          <p className="text-sm font-extrabold tracking-tight text-zinc-100">{restaurante?.nombre ?? 'Restaurante'}</p>
          <p className="mt-0.5 text-[10px] uppercase tracking-widest text-zinc-400">
            Comanda · {estacion === 'cocina' ? 'Cocina' : 'Barra'}
          </p>
          <p className="mt-1 font-mono text-[10px] text-brand-400">{pedido.id.slice(0, 8).toUpperCase()}</p>
        </div>
        <div className="space-y-0.5 border-b border-dashed border-surface-700 px-3 py-2 text-[10px] text-zinc-400">
          <div className="flex items-center justify-between">
            <span>Mesa</span>
            <span className="text-zinc-200">{mesaNombre}</span>
          </div>
          {nombreMesero && (
            <div className="flex items-center justify-between">
              <span>Mesero</span>
              <span className="text-zinc-200">{nombreMesero}</span>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span>Hora</span>
            <span className="text-zinc-200">{fmtFecha(pedido.created_at)}</span>
          </div>
        </div>
        <div className="border-b border-dashed border-surface-700 px-3 py-2">
          <ul className="space-y-1.5 text-[11px]">
            {items.map((it) => (
              <li key={it.id}>
                <div className="flex items-start justify-between gap-2">
                  <span className="text-zinc-100">
                    <span className="font-semibold text-brand-400">{it.cantidad}×</span> {it.nombre_producto}
                  </span>
                </div>
                {it.nota && (
                  <p className="mt-0.5 flex items-center gap-1.5 text-[10px] text-warn-400">
                    <IconoNota />
                    {it.nota}
                  </p>
                )}
              </li>
            ))}
          </ul>
          {anulados.length > 0 && (
            <ul className="mt-2 space-y-1 rounded-md border border-danger-500/40 bg-danger-500/10 px-2 py-1.5 text-[10px] text-danger-500">
              {anulados.map((it) => (
                <li key={it.id} className="line-through">
                  {it.cantidad}× {it.nombre_producto} — anulado
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="p-3 text-center text-[10px] text-zinc-600">--- Listo para imprimir ---</div>
      </div>
    </Modal>
  )
}

function useMeseroNombre(meseroId: string): string | undefined {
  const { restaurante } = useCurrentContext()
  const [nombre, setNombre] = useState<string | undefined>()
  useEffect(() => {
    let activo = true
    async function cargar() {
      if (!restaurante) return
      const api = getApi()
      const res = await api.getMeseros(restaurante.id)
      if (activo && res.data) {
        const u = res.data.find((x) => x.id === meseroId)
        setNombre(u?.nombre)
      }
    }
    void cargar()
    return () => { activo = false }
  }, [restaurante, meseroId])
  return nombre
}