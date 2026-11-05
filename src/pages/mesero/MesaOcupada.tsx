import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getApi, itemsVigentes, totalItems, type ItemResumen, type PedidoResumen, type UsuarioResumen } from '../../lib/api'
import { useCurrentContext } from '../../lib/useCurrentContext'
import type { Mesa } from '../../types/database'
import { estadoPedidoLabel, fmtFecha, fmtPEN } from '../../lib/format'
import { Spinner } from '../../components/LoadingScreen'
import EstadoVacio from '../../components/EstadoVacio'
import { Campo, ConfirmDialog, IconoLapiz, Modal } from '../../components/ui'
import { CampoPin, usePinAutorizacion } from '../../components/pin'
import Precuenta from '../../components/Precuenta'
import type { Zona } from '../../types/database'

type OperacionMesa = 'pasar-mesero' | 'mover-consumo' | null

const CANTIDAD_MAXIMA = 99
const NOTA_MAXIMA = 120

interface MesaOcupadaProps {
  mesa: Mesa
  onVolver: () => void
  onConsumoMovido: (mensaje: string) => void
  onAgregarPedido: () => void
  onCerrarCuenta: () => void
}

/** Ítem que se está editando, con la comanda a la que pertenece. */
type EnEdicion = { pedidoId: string; item: ItemResumen }

/**
 * Pantalla intermedia de una mesa ocupada: muestra las comandas abiertas y deja
 * elegir entre agregar otra comanda (segunda ronda), corregir/anular lo que se
 * pidió o cerrar la cuenta.
 */
export default function MesaOcupada({
  mesa,
  onVolver,
  onConsumoMovido,
  onAgregarPedido,
  onCerrarCuenta,
}: MesaOcupadaProps) {
  const { restaurante, usuario } = useCurrentContext()
  const [pedidos, setPedidos] = useState<PedidoResumen[]>([])
  const [items, setItems] = useState<ItemResumen[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [verPrecuenta, setVerPrecuenta] = useState(false)
  const [flash, setFlash] = useState<string | null>(null)
  const [editando, setEditando] = useState<EnEdicion | null>(null)
  const [anulando, setAnulando] = useState<EnEdicion | null>(null)
  const [anulandoEnCurso, setAnulandoEnCurso] = useState(false)
  const [errorAnulacion, setErrorAnulacion] = useState<string | null>(null)
  const [meseros, setMeseros] = useState<UsuarioResumen[]>([])
  const [mesasLibres, setMesasLibres] = useState<Mesa[]>([])
  const [zonas, setZonas] = useState<Zona[]>([])
  const [meseroResponsableId, setMeseroResponsableId] = useState<string | null>(mesa.mesero_responsable_id ?? null)
  const [operacionMesa, setOperacionMesa] = useState<OperacionMesa>(null)
  const [meseroSeleccionado, setMeseroSeleccionado] = useState('')
  const [mesaSeleccionada, setMesaSeleccionada] = useState('')
  const [guardandoOperacion, setGuardandoOperacion] = useState(false)
  const [errorOperacion, setErrorOperacion] = useState<string | null>(null)
  const [cargandoOpcionesMesa, setCargandoOpcionesMesa] = useState(false)
  // Si el restaurante configuró PIN, el mesero tiene que pedirlo antes de anular:
  // es el número de quien autoriza. El campo solo aparece si hace falta (y el
  // backend lo valida igual, por si alguien lo salta desde la consola).
  const { pin, setPin, requierePin } = usePinAutorizacion(anulando ? restaurante?.id : null)
  const meseroResponsable = meseros.find((m) => m.id === meseroResponsableId)
  const asignadaAOtro = usuario?.rol === 'mesero' && Boolean(meseroResponsableId) && meseroResponsableId !== usuario?.id

  useEffect(() => {
    const rid = restaurante?.id
    if (!rid) return
    let activo = true
    setCargandoOpcionesMesa(true)
    void Promise.all([getApi().getMeseros(rid), getApi().getMesas(rid), getApi().getZonas(rid)]).then(([uRes, mRes, zRes]) => {
      if (!activo) return
      if (uRes.error || mRes.error || zRes.error) {
        setErrorOperacion(uRes.error ?? mRes.error ?? zRes.error ?? 'No se pudieron cargar las opciones de mesa.')
        return
      }
      const listaMeseros = (uRes.data ?? []).filter((u) => u.activo !== false)
      const listaMesas = mRes.data ?? []
      setMeseros(listaMeseros)
      setMesasLibres(listaMesas.filter((m) => m.id !== mesa.id && m.estado === 'libre'))
      setZonas(zRes.data ?? [])
      setMeseroResponsableId(listaMesas.find((m) => m.id === mesa.id)?.mesero_responsable_id ?? mesa.mesero_responsable_id ?? null)
      setErrorOperacion(null)
    }).catch(() => {
      if (activo) setErrorOperacion('No se pudieron cargar las opciones de mesa. Inténtalo de nuevo.')
    }).finally(() => {
      if (activo) setCargandoOpcionesMesa(false)
    })
    return () => { activo = false }
  }, [restaurante?.id, mesa.id, mesa.mesero_responsable_id])

  /** Evita escribir estado si la pantalla ya se cerró (o si cambió la mesa). */
  const vivo = useRef(true)

  /**
   * Carga comandas e ítems de la mesa. `silencioso` se usa tras editar o anular
   * para recargar sin volver a tapar la pantalla con el spinner.
   */
  const cargar = useCallback(
    async (silencioso: boolean) => {
      const rid = restaurante?.id
      if (!rid) return
      if (!silencioso) setCargando(true)
      try {
        const api = getApi()
        const pedRes = await api.getPedidosDeMesa(rid, mesa.id)
        if (!vivo.current) return
        if (pedRes.error) {
          setError(pedRes.error)
          return
        }
        const pList = pedRes.data ?? []
        setPedidos(pList)
        if (pList.length === 0) {
          setItems([])
          setError(null)
          return
        }
        const itsRes = await api.getPedidoItems(pList.map((p) => p.id))
        if (!vivo.current) return
        if (itsRes.error) {
          setError(itsRes.error)
          return
        }
        setItems(itsRes.data ?? [])
        setError(null)
      } catch {
        if (vivo.current) setError('No se pudieron actualizar las comandas. Comprueba tu conexión e inténtalo de nuevo.')
      } finally {
        if (vivo.current) setCargando(false)
      }
    },
    [restaurante?.id, mesa.id],
  )

  useEffect(() => {
    vivo.current = true
    void cargar(false)
    return () => {
      vivo.current = false
    }
  }, [cargar])

  useEffect(() => {
    if (!flash) return
    const t = setTimeout(() => setFlash(null), 4000)
    return () => clearTimeout(t)
  }, [flash])

  const itemsPorPedido = useMemo(() => {
    const map = new Map<string, ItemResumen[]>()
    for (const it of items) {
      const arr = map.get(it.pedido_id) ?? []
      arr.push(it)
      map.set(it.pedido_id, arr)
    }
    return map
  }, [items])

  const total = useMemo(() => totalItems(items), [items])
  const hayPedidos = pedidos.length > 0

  async function confirmarAnulacion() {
    if (!restaurante || !anulando) return
    setAnulandoEnCurso(true)
    setErrorAnulacion(null)
    try {
      const { error: apiErr } = await getApi().anularItem(restaurante.id, anulando.pedidoId, anulando.item.id, pin)
      if (apiErr) {
        setErrorAnulacion(apiErr)
        return
      }
      setAnulando(null)
      setPin('')
      setFlash(`Se anuló ${anulando.item.nombre_producto}.`)
      await cargar(true)
    } catch {
      setErrorAnulacion('No se pudo confirmar la anulación. Actualiza la comanda antes de volver a intentarlo.')
      await cargar(true)
    } finally {
      setAnulandoEnCurso(false)
    }
  }

  async function confirmarOperacionMesa() {
    if (!restaurante || !operacionMesa) return
    setGuardandoOperacion(true)
    setErrorOperacion(null)
    try {
      const api = getApi()
      if (operacionMesa === 'pasar-mesero') {
        const destino = meseros.find((m) => m.id === meseroSeleccionado)
        if (!destino) {
          setErrorOperacion('Elige el mesero que recibirá la mesa.')
          return
        }
        const res = await api.asignarMesaMesero(restaurante.id, mesa.id, destino.id)
        if (res.error) {
          setErrorOperacion(res.error)
          return
        }
        setMeseroResponsableId(destino.id)
        setOperacionMesa(null)
        setMeseroSeleccionado('')
        setFlash(`Mesa asignada a ${destino.nombre}. Las comandas anteriores conservan su mesero original.`)
        await cargar(true)
        return
      }

      const destino = mesasLibres.find((m) => m.id === mesaSeleccionada)
      if (!destino) {
        setErrorOperacion('Elige una mesa libre para recibir el consumo.')
        return
      }
      const res = await api.moverConsumoMesa(restaurante.id, mesa.id, destino.id)
      if (res.error) {
        setErrorOperacion(res.error)
        return
      }
      const zona = zonas.find((z) => z.id === destino.zona_id)?.nombre
      const ubicacion = zona ? `${destino.nombre} · ${zona}` : destino.nombre
      setOperacionMesa(null)
      setMesaSeleccionada('')
      onConsumoMovido(`Consumo movido de ${mesa.nombre} a ${ubicacion}. Cocina verá las comandas bajo la mesa nueva.`)
    } catch {
      setErrorOperacion('No se pudo completar la operación. Actualiza las mesas antes de volver a intentarlo.')
    } finally {
      setGuardandoOperacion(false)
    }
  }

  if (verPrecuenta) {
    return <Precuenta mesa={mesa} onVolver={() => { setVerPrecuenta(false); void cargar(false) }} />
  }

  return (
    <div>
      <button
        type="button"
        onClick={onVolver}
        className="-mx-2 -mt-1 mb-3 inline-flex min-h-11 touch-manipulation items-center gap-1 rounded-lg px-2 text-base text-zinc-400 transition hover:text-brand-500"
      >
        ← Volver a mesas
      </button>

      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Mesa abierta</p>
          <h1 className="text-xl font-extrabold tracking-tight text-zinc-100">{mesa.nombre}</h1>
          <p className="mt-1 text-xs text-zinc-500">Responsable: {meseroResponsable?.nombre ?? (meseroResponsableId ? 'Mesero inactivo' : 'Sin asignar')}</p>
        </div>
        {hayPedidos && (
          <div className="text-right">
            <p className="text-xs uppercase tracking-widest text-zinc-500">
              {pedidos.length} {pedidos.length === 1 ? 'comanda' : 'comandas'} por cobrar
            </p>
            <p className="text-2xl font-bold tabular-nums text-brand-400">{fmtPEN(total)}</p>
          </div>
        )}
      </div>

      {error && (
        <div className="aviso mb-4 border-danger-500/40 bg-danger-500/10 text-danger-500">
          {error}<button type="button" onClick={() => void cargar(false)} className="ml-3 underline">Actualizar</button>
        </div>
      )}
      {flash && (
        <div className="aviso mb-4 border-ok-500/40 bg-ok-500/10 text-ok-500">{flash}</div>
      )}
      {asignadaAOtro && (
        <div role="status" className="aviso mb-4 border-brand-500/30 bg-brand-500/10 text-brand-300">
          Esta mesa ahora está asignada a {meseroResponsable?.nombre ?? 'otro mesero'}. Puedes consultar el consumo, pero el responsable debe gestionar las comandas.
        </div>
      )}

      {cargando ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : !hayPedidos ? (
        <EstadoVacio
          titulo="Esta mesa no tiene comandas abiertas"
          descripcion="Puede que ya se cobraran. Agrega una nueva comanda o vuelve al mapa de mesas."
        />
      ) : (
        <div className="space-y-3">
          {pedidos.map((p) => {
            const its = itemsPorPedido.get(p.id) ?? []
            const sub = totalItems(its)
            const anulados = its.length - itemsVigentes(its).length
            return (
              <div key={p.id} className="rounded-xl border border-surface-800 bg-surface-900 p-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
                    Comanda · {fmtFecha(p.created_at)}
                  </p>
                  <span className="flex items-center gap-2">
                    {anulados > 0 && (
                      <span className="chip chip-neutral">
                        {anulados} {anulados === 1 ? 'anulado' : 'anulados'}
                      </span>
                    )}
                    <span className="text-xs text-zinc-500">{estadoPedidoLabel(p.estado)}</span>
                  </span>
                </div>
                <ul className="divide-y divide-surface-700/60 text-sm">
                  {its.map((it) => (
                    <FilaItem
                      key={it.id}
                      item={it}
                      onEditar={() => setEditando({ pedidoId: p.id, item: it })}
                      editable={!asignadaAOtro}
                    />
                  ))}
                </ul>
                <div className="mt-2 flex justify-end border-t border-surface-700 pt-2 text-sm">
                  <span className="text-zinc-300">
                    Subtotal: <span className="text-zinc-200">{fmtPEN(sub)}</span>
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <button
          type="button"
          disabled={asignadaAOtro}
          onClick={onAgregarPedido}
          className="min-h-14 touch-manipulation rounded-xl border-2 border-brand-500/50 bg-brand-500/10 px-4 py-3.5 text-base font-semibold text-brand-400 transition hover:border-brand-500 hover:bg-brand-500/15 active:scale-[0.98]"
        >
          + Agregar otro pedido
        </button>
        <button
          type="button"
          disabled={cargando || Boolean(error) || !hayPedidos || total <= 0}
          onClick={() => setVerPrecuenta(true)}
          className="btn btn-outline min-h-14 px-4 py-3.5 text-base"
        >
          Ver precuenta
        </button>
        <button
          type="button"
          data-guia="cerrar-cuenta"
          onClick={onCerrarCuenta}
          disabled={!hayPedidos || asignadaAOtro}
          className="min-h-14 touch-manipulation rounded-xl bg-brand-500 px-4 py-3.5 text-base font-semibold text-surface-950 transition hover:bg-brand-400 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {hayPedidos ? `Cerrar cuenta · ${fmtPEN(total)}` : 'Cerrar cuenta'}
        </button>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          disabled={!hayPedidos || asignadaAOtro || cargandoOpcionesMesa}
          onClick={() => { setErrorOperacion(null); setOperacionMesa('pasar-mesero') }}
          className="btn btn-outline min-h-12 px-4 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Pasar a otro mesero
        </button>
        <button
          type="button"
          disabled={!hayPedidos || asignadaAOtro || cargandoOpcionesMesa || mesasLibres.length === 0}
          onClick={() => { setErrorOperacion(null); setOperacionMesa('mover-consumo') }}
          className="btn btn-outline min-h-12 px-4 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Mover consumo a otra mesa
        </button>
      </div>
      <p className="mt-2 text-center text-xs text-zinc-500">
        Toca un ítem para corregirlo o anularlo. Puedes mandar varias comandas a la misma mesa antes de
        cobrar: todo se suma en una sola cuenta.
      </p>

      {editando && (
        <ModalEditarItem
          edicion={editando}
          onCerrar={() => setEditando(null)}
          onAnular={() => {
            setAnulando(editando)
            setEditando(null)
          }}
          onGuardado={async (mensaje) => {
            setEditando(null)
            setFlash(mensaje)
            await cargar(true)
          }}
        />
      )}

      {anulando && (
        <ConfirmDialog
          titulo="Anular ítem"
          confirmLabel="Anular ítem"
          cargandoLabel="Anulando…"
          cargando={anulandoEnCurso}
          mensaje={
            <>
              <strong className="text-zinc-100">{anulando.item.nombre_producto}</strong> ({anulando.item.cantidad}×{' '}
              {fmtPEN(anulando.item.cantidad * anulando.item.precio_unitario)}) dejará de enviarse a cocina y
              no se cobra. Si era el único ítem de la comanda, la mesa se libera.
            </>
          }
          extra={
            requierePin ? (
              <CampoPin pin={pin} onChange={setPin} />
            ) : null
          }
          disabled={requierePin && pin.length === 0}
          error={errorAnulacion}
          onConfirmar={() => void confirmarAnulacion()}
          onCancelar={() => {
            setAnulando(null)
            setErrorAnulacion(null)
            setPin('')
          }}
        />
      )}

      {operacionMesa && (
        <Modal
          titulo={operacionMesa === 'pasar-mesero' ? 'Pasar mesa a otro mesero' : 'Mover consumo a otra mesa'}
          onCerrar={() => { if (!guardandoOperacion) setOperacionMesa(null) }}
        >
          {operacionMesa === 'pasar-mesero' ? (
            <>
              <p className="text-sm leading-relaxed text-zinc-300">
                La mesa seguirá siendo la misma. El nuevo responsable recibirá las próximas comandas; los pedidos y ventas anteriores conservan el mesero que los registró.
              </p>
              <label className="label mt-4" htmlFor="mesa-nuevo-mesero">Mesero que recibe</label>
              <select id="mesa-nuevo-mesero" value={meseroSeleccionado} onChange={(e) => setMeseroSeleccionado(e.target.value)} className="input">
                <option value="">Selecciona un mesero</option>
                {meseros.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
              </select>
              {meseros.length === 0 ? <p className="mt-2 text-xs text-zinc-500">No hay meseros activos disponibles.</p> : null}
            </>
          ) : (
            <>
              <p className="text-sm leading-relaxed text-zinc-300">
                Moveremos las comandas aún no cobradas a una mesa libre. Los pagos ya emitidos y su historial no cambian.
              </p>
              <label className="label mt-4" htmlFor="mesa-destino-consumo">Mesa libre</label>
              <select id="mesa-destino-consumo" value={mesaSeleccionada} onChange={(e) => setMesaSeleccionada(e.target.value)} className="input">
                <option value="">Selecciona una mesa</option>
                {mesasLibres.map((m) => {
                  const zona = zonas.find((z) => z.id === m.zona_id)?.nombre
                  return <option key={m.id} value={m.id}>{m.nombre}{zona ? ` · ${zona}` : ''}</option>
                })}
              </select>
              {mesasLibres.length === 0 ? <p className="mt-2 text-xs text-zinc-500">No hay mesas libres para recibir el consumo.</p> : null}
            </>
          )}
          {errorOperacion ? <div role="alert" className="aviso mt-4 border-danger-500/40 bg-danger-500/10 text-danger-500">{errorOperacion}</div> : null}
          {guardandoOperacion ? (
            <div role="status" aria-live="polite" className="aviso mt-4 border-brand-500/30 bg-brand-500/10 text-brand-300"><Spinner className="mr-2 h-4 w-4 align-middle" />Guardando el cambio de mesa…</div>
          ) : null}
          <div className="mt-6 flex flex-wrap justify-end gap-2">
            <button type="button" disabled={guardandoOperacion} onClick={() => setOperacionMesa(null)} className="btn btn-outline min-h-11 px-4">Cancelar</button>
            <button
              type="button"
              disabled={guardandoOperacion || (operacionMesa === 'pasar-mesero' ? !meseroSeleccionado : !mesaSeleccionada)}
              onClick={() => void confirmarOperacionMesa()}
              className="btn min-h-11 px-4"
            >
              {guardandoOperacion ? 'Guardando…' : operacionMesa === 'pasar-mesero' ? 'Pasar mesa' : 'Mover consumo'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}

/** Fila de un ítem: los vigentes se pueden tocar, los anulados se muestran tachados. */
function FilaItem({ item, onEditar, editable = true }: { item: ItemResumen; onEditar: () => void; editable?: boolean }) {
  const anulado = item.anulado === true
  const importe = item.cantidad * item.precio_unitario

  if (anulado) {
    return (
      <li className="flex items-center justify-between gap-2 py-1.5">
        <span className="text-zinc-600 line-through">
          <span className="text-zinc-600">{item.cantidad}×</span> {item.nombre_producto}
        </span>
        <span className="chip chip-neutral shrink-0">Anulado</span>
      </li>
    )
  }

  return (
    <li className="flex items-center justify-between gap-2 py-1.5">
      <span className="min-w-0 text-zinc-300">
        <span className="text-zinc-500">{item.cantidad}×</span> {item.nombre_producto}
        {item.nota ? <span className="text-zinc-500"> · {item.nota}</span> : null}
      </span>
      <span className="flex shrink-0 items-center gap-1">
        <span className="text-zinc-400">{fmtPEN(importe)}</span>
        {editable ? (
          <button
            type="button"
            onClick={onEditar}
            aria-label={`Editar ${item.nombre_producto}`}
            className="grid h-9 w-9 touch-manipulation place-items-center rounded-lg text-zinc-500 transition hover:bg-surface-800 hover:text-brand-400"
          >
            <IconoLapiz />
          </button>
        ) : null}
      </span>
    </li>
  )
}

/** Modal de corrección de un ítem: cantidad, nota y anulación. */
function ModalEditarItem({
  edicion,
  onCerrar,
  onAnular,
  onGuardado,
}: {
  edicion: EnEdicion
  onCerrar: () => void
  onAnular: () => void
  onGuardado: (mensaje: string) => Promise<void>
}) {
  const { restaurante } = useCurrentContext()
  const [cantidad, setCantidad] = useState(edicion.item.cantidad)
  const [nota, setNota] = useState(edicion.item.nota ?? '')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sinCambios = cantidad === edicion.item.cantidad && nota.trim() === (edicion.item.nota ?? '').trim()

  async function guardar() {
    if (!restaurante) return
    setGuardando(true)
    setError(null)
    try {
      const { error: apiErr } = await getApi().editarItem(restaurante.id, edicion.pedidoId, edicion.item.id, {
        cantidad,
        nota: nota.trim() || null,
      })
      if (apiErr) {
        setError(apiErr)
        return
      }
      await onGuardado(`Se actualizó ${edicion.item.nombre_producto}.`)
    } catch {
      setError('No se pudo confirmar el cambio. Actualiza la comanda antes de volver a intentarlo.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Modal titulo={edicion.item.nombre_producto} onCerrar={onCerrar}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void guardar()
        }}
      >
        <p className="mb-4 text-sm text-zinc-500">
          {fmtPEN(edicion.item.precio_unitario)} c/u · cambia la cantidad o la nota de preparación.
        </p>

        <Campo etiqueta="Cantidad" htmlFor="edit-cantidad">
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label="Quitar uno"
              disabled={cantidad <= 1 || guardando}
              onClick={() => setCantidad((c) => Math.max(1, c - 1))}
              className="grid h-12 w-12 shrink-0 touch-manipulation place-items-center rounded-xl border border-surface-700 bg-surface-800 text-xl text-zinc-300 transition hover:border-brand-500 hover:text-brand-400 active:scale-95 disabled:opacity-40"
            >
              −
            </button>
            <input
              id="edit-cantidad"
              type="number"
              inputMode="numeric"
              min={1}
              max={CANTIDAD_MAXIMA}
              value={cantidad}
              onChange={(e) => {
                const n = Number(e.target.value)
                if (Number.isFinite(n)) setCantidad(Math.min(CANTIDAD_MAXIMA, Math.max(1, Math.trunc(n))))
              }}
              className="input h-12 flex-1 text-center text-lg font-bold tabular-nums"
            />
            <button
              type="button"
              aria-label="Agregar uno"
              disabled={cantidad >= CANTIDAD_MAXIMA || guardando}
              onClick={() => setCantidad((c) => Math.min(CANTIDAD_MAXIMA, c + 1))}
              className="grid h-12 w-12 shrink-0 touch-manipulation place-items-center rounded-xl border border-surface-700 bg-surface-800 text-xl text-zinc-300 transition hover:border-brand-500 hover:text-brand-400 active:scale-95 disabled:opacity-40"
            >
              +
            </button>
          </div>
        </Campo>

        <Campo etiqueta="Nota para cocina" htmlFor="edit-nota">
          <textarea
            id="edit-nota"
            rows={2}
            maxLength={NOTA_MAXIMA}
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Ej.: sin cebolla, término medio"
            className="input resize-none py-3"
          />
        </Campo>

        {error && (
          <div className="aviso mb-4 border-danger-500/40 bg-danger-500/10 text-danger-500">{error}</div>
        )}

        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={onAnular}
            className="btn btn-danger-ghost min-h-11 px-3"
          >
            Anular ítem
          </button>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={onCerrar} className="btn btn-outline min-h-11 px-4">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={guardando || sinCambios}
              className="btn btn-primary min-h-11 px-5"
            >
              {guardando ? 'Guardando…' : 'Guardar cambios'}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  )
}
