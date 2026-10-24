import { useEffect, useMemo, useState } from 'react'
import { jsPDF } from 'jspdf'
import { getApi, itemsVigentes, totalItems, type ItemResumen, type PedidoResumen } from '../../lib/api'
import { useCurrentContext } from '../../lib/useCurrentContext'
import { esMetodoPagoValido, type Cuenta, type Mesa, type MetodoPago } from '../../types/database'
import {
  completarPartes,
  labelMetodoPago,
  METODOS_PAGO_LISTA,
  PROPINAS_SUGERIDAS,
  repartoSugerido,
  resumirPago,
  vueltoRapido,
  type PagoParte,
} from '../../lib/pagos'
import { parseMonto, redondear } from '../../lib/caja'
import { numeroBoletaDeCuenta } from '../../lib/boleta'
import { estadoPedidoLabel, fmtFecha, fmtPEN } from '../../lib/format'
import { Spinner } from '../../components/LoadingScreen'

const TASA_IGV = 0.18

interface CerrarCuentaProps {
  mesa: Mesa
  onVolver: () => void
  onCuentaCerrada: () => void
}

export default function CerrarCuenta({ mesa, onVolver, onCuentaCerrada }: CerrarCuentaProps) {
  const { restaurante, usuario } = useCurrentContext()
  const [pedidos, setPedidos] = useState<PedidoResumen[]>([])
  const [items, setItems] = useState<ItemResumen[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [intentoCarga, setIntentoCarga] = useState(0)
  const [metodo, setMetodo] = useState<MetodoPago>('efectivo')
  const [cobrando, setCobrando] = useState(false)
  const [cuenta, setCuenta] = useState<Cuenta | null>(null)
  const [liberando, setLiberando] = useState(false)

  // --- Pago dividido / propina / vuelto
  const [dividido, setDividido] = useState(false)
  const [partes, setPartes] = useState<PagoParte[]>([])
  const [montoRecibido, setMontoRecibido] = useState('')
  const [propinaPct, setPropinaPct] = useState<number | null>(null)

  useEffect(() => {
    const rid = restaurante?.id
    if (!rid) return
    let activo = true
    setCargando(true)
    ;(async () => {
      try {
        const api = getApi()
        const pedRes = await api.getPedidosDeMesa(rid, mesa.id)

        if (!activo) return
        if (pedRes.error) {
          setError(pedRes.error)
          return
        }
        const pList = pedRes.data ?? []
        setPedidos(pList)

        if (pList.length === 0) return

        const itsRes = await api.getPedidoItems(pList.map((p) => p.id))
        if (!activo) return
        if (itsRes.error) {
          setError(itsRes.error)
          return
        }
        setItems(itsRes.data ?? [])
        setError(null)
      } catch {
        if (activo) setError('No se pudo cargar la cuenta. Revisa tu conexión e inténtalo de nuevo.')
      } finally {
        if (activo) setCargando(false)
      }
    })()
    return () => {
      activo = false
    }
  }, [restaurante?.id, mesa.id, intentoCarga])

  // Un ítem anulado no se cobra: ni en el total, ni en los subtotales, ni en la boleta.
  const total = useMemo(() => totalItems(items), [items])

  const propina = useMemo(
    () => (propinaPct === null ? 0 : Math.round(total * (propinaPct / 100) * 100) / 100),
    [total, propinaPct],
  )
  const aPagar = useMemo(() => Math.round((total + propina) * 100) / 100, [total, propina])

  /**
   * Lo que se cobra ahora. Sin dividir, una sola parte con el método elegido y
   * monto 0 ("exactamente lo que se le pide"). Dividido, las partes que el
   * mesero configuró, cada una con el billete que entregó.
   */
  const partesCobro = useMemo<PagoParte[]>(() => {
    if (!dividido) return [{ metodo, monto: 0 }]
    return partes.map((p) => ({ ...p, monto: p.monto }))
  }, [dividido, metodo, partes])

  /**
   * Vista del resumen para la UI. Cuando el desglose no cuadra se devuelve
   * `resumen: null` y el motivo en `error`: es más honesto que mostrar
   * números inventados al lado del botón de cobrar.
   */
  const { resumen, errorResumen } = useMemo(() => {
    // Una parte en blanco (monto 0) significa "el resto que falta", igual que
    // en el backend: completarla con el total cobraría el doble al dividir.
    const completadas = completarPartes(partesCobro, total + propina)
    if (completadas.error) return { resumen: null, errorResumen: completadas.error }
    const r = resumirPago(total, completadas.partes, propina)
    return { resumen: r.valido ? r : null, errorResumen: r.valido ? null : r.error }
  }, [total, partesCobro, propina])

  /** A pagar siempre se muestra, haya error o no: es el dato que hay que cobrar. */
  const aPagarResumen = resumen?.aPagar ?? redondear(total + propina)

  /**
   * Lo que el mesero cuenta en efectivo. Solo tiene sentido en efectivo: con
   * tarjeta o Yape no hay billete que devolver, así que el campo se oculta (y
   * un importe mayor al total se rechaza en el backend en vez de "devolver"
   * contra un voucher).
   */
  const recibidoEfectivo = metodo === 'efectivo' ? parseMonto(montoRecibido) : Number.NaN
  const vueltoSimple = useMemo(
    () => (Number.isNaN(recibidoEfectivo) ? null : vueltoRapido(recibidoEfectivo, aPagar)),
    [recibidoEfectivo, aPagar],
  )

  const itemsPorPedido = useMemo(() => {
    const map = new Map<string, ItemResumen[]>()
    for (const it of items) {
      const arr = map.get(it.pedido_id) ?? []
      arr.push(it)
      map.set(it.pedido_id, arr)
    }
    return map
  }, [items])

  async function cobrar() {
    if (!restaurante || pedidos.length === 0) return
    // Whitelist: nunca se envía a la API un método fuera de METODOS_PAGO.
    if (!esMetodoPagoValido(metodo)) {
      setError('Elige un método de pago válido.')
      return
    }
    if (dividido && errorResumen) {
      setError(errorResumen)
      return
    }
    setCobrando(true)
    setError(null)

    const api = getApi()
    // Con división se manda el desglose; sin ella, el camino corto de un solo
    // método. Los dos terminan en la misma RPC.
    //
    // Aunque no se divida, si el mesero elige propina o teclea un billete mayor
    // al total hay que ir por el camino largo: `cerrarCuenta` cobra el exacto y
    // no tiene dónde guardar la propina ni el vuelto.
    const pagoSimpleExacto =
      !dividido && propina === 0 && (Number.isNaN(recibidoEfectivo) || recibidoEfectivo <= aPagar)

    let cuentaGuardada: Cuenta | null = null
    let apiErr: string | null = null
    try {
      const resultado = pagoSimpleExacto
        ? await api.cerrarCuenta(restaurante.id, mesa.id, pedidos.map((p) => p.id), metodo)
        : await api.cerrarCuentaDividida(
            restaurante.id,
            mesa.id,
            pedidos.map((p) => p.id),
            dividido
              ? partesCobro.map((p) => ({ metodo_pago: p.metodo, monto: p.monto, referencia: p.referencia ?? null }))
              : [{ metodo_pago: metodo, monto: Number.isNaN(recibidoEfectivo) ? 0 : recibidoEfectivo }],
            propina,
          )
      cuentaGuardada = resultado.data
      apiErr = resultado.error
    } catch {
      apiErr = 'Se perdió la respuesta del cobro. Estoy comprobando si quedó registrado.'
    }

    if (apiErr || !cuentaGuardada) {
      // El servidor pudo haber cerrado la cuenta y perderse la respuesta (caída
      // de red). Antes de mostrar error, reconciliamos con el estado real de la
      // mesa: si el cobro SÍ se consumó, se muestra la boleta y se evita que el
      // mesero reintente y cobre dos veces.
      const recuperada = await reconciliarCobro()
      if (recuperada) {
        setCuenta(recuperada)
        setCobrando(false)
        return
      }
      setError(apiErr ?? 'No se pudo cerrar la cuenta')
      setCobrando(false)
      return
    }

    // La boleta se arma con la cuenta YA GUARDADA (total y pagado_at del
    // servidor), no con lo que el navegador tenía en pantalla.
    setCuenta(cuentaGuardada)
    setCobrando(false)
  }

  /**
   * Reconcilia un cobro cuya respuesta se perdió. No es una operación de
   * escritura: solo mira el estado actual.
   *
   *   * Si alguno de los pedidos que se intentó cobrar SIGUE abierto, el cobro
   *     no ocurrió: devuelve null y el mesero puede reintentar sin riesgo.
   *   * Si ya no queda ninguno abierto, el servidor consumió el cobro (o la mesa
   *     la cerró otra terminal): devuelve la última cuenta de esta mesa para
   *     mostrar la boleta en vez de un error confuso.
   */
  async function reconciliarCobro(): Promise<Cuenta | null> {
    if (!restaurante) return null
    try {
      const api = getApi()
      const abiertos = await api.getPedidosDeMesa(restaurante.id, mesa.id)
      if (abiertos.error) return null
      const idsIntentados = pedidos.map((p) => p.id)
      if ((abiertos.data ?? []).some((p) => idsIntentados.includes(p.id))) return null
      const delDia = await api.getCuentasDelDia(restaurante.id)
      return (delDia.data ?? []).find((c) => c.mesa_id === mesa.id) ?? null
    } catch {
      return null
    }
  }

  function alternarDividido() {
    const nuevo = !dividido
    setDividido(nuevo)
    setError(null)
    if (nuevo && partes.length === 0) {
      // Arranca con el método ya elegido: el mesero solo añade el segundo.
      setPartes([{ metodo, monto: 0 }])
    }
    if (nuevo) setMontoRecibido('')
  }

  function agregarParte() {
    const usados = partes.map((p) => p.metodo)
    const siguiente = METODOS_PAGO_LISTA.find((m) => !usados.includes(m.id))?.id ?? 'efectivo'
    setPartes((prev) => [...prev, { metodo: siguiente, monto: 0 }])
  }

  function cambiarParte(i: number, cambios: Partial<PagoParte>) {
    setPartes((prev) => prev.map((p, idx) => (idx === i ? { ...p, ...cambios } : p)))
  }

  /** Reparte lo que falta entre las partes para que la suma cuadre exacta. */
  function repartir() {
    const metodos = partes.map((p) => p.metodo)
    setPartes(repartoSugerido(aPagar, metodos))
  }

  async function liberarMesa() {
    if (!restaurante) return
    setLiberando(true)
    try {
      const { error: apiErr } = await getApi().liberarMesa(restaurante.id, mesa.id)
      if (apiErr) {
        setError(apiErr)
        return
      }
      onCuentaCerrada()
    } catch {
      setError('No se pudo liberar la mesa. Actualiza la pantalla y verifica su estado.')
    } finally {
      setLiberando(false)
    }
  }

  if (cuenta) {
    return (
      <Boleta
        cuenta={cuenta}
        restauranteNombre={restaurante?.nombre}
        direccion={restaurante?.direccion}
        ruc={restaurante?.ruc}
        telefono={restaurante?.telefono}
        mesaNombre={mesa.nombre}
        meseroNombre={usuario?.nombre}
        items={itemsVigentes(items)}
        onListo={onCuentaCerrada}
      />
    )
  }

  if (cargando)
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    )

  return (
    <div>
      <button
        type="button"
        onClick={onVolver}
        className="-mx-2 -mt-1 mb-3 inline-flex min-h-11 touch-manipulation items-center gap-1 rounded-lg px-2 text-base text-zinc-400 transition hover:text-brand-500"
      >
        ← Volver a mesas
      </button>
      <h1 className="mb-5 text-xl font-extrabold tracking-tight text-zinc-100">Cerrar cuenta · Mesa {mesa.nombre}</h1>

      {error && (
        <div className="aviso mb-4 border-danger-500/40 bg-danger-500/10 text-danger-500">
          {error}
          {pedidos.length === 0 && <button type="button" onClick={() => setIntentoCarga((n) => n + 1)} className="ml-3 underline">Reintentar carga</button>}
        </div>
      )}

      {pedidos.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-surface-700 bg-surface-900/40 px-6 py-12 text-center">
          <p className="text-sm text-zinc-400">Esta mesa no tiene pedidos abiertos.</p>
          <button
            type="button"
            disabled={liberando}
            onClick={() => void liberarMesa()}
            className="mt-4 min-h-12 touch-manipulation rounded-lg border border-surface-700 px-5 py-3 text-base text-zinc-300 transition hover:border-brand-500 hover:text-brand-500 active:scale-[0.98] disabled:opacity-50"
          >
            {liberando ? 'Liberando…' : 'Marcar mesa como libre'}
          </button>
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
          <div className="space-y-4">
            {pedidos.map((p) => {
              const suyas = itemsPorPedido.get(p.id) ?? []
              const its = itemsVigentes(suyas)
              const sub = totalItems(suyas)
              const anulados = suyas.length - its.length
              return (
                <div key={p.id} className="rounded-xl border border-surface-800 bg-surface-900 p-4">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
                      Comanda · {fmtFecha(p.created_at)}
                    </p>
                    <span className="flex items-center gap-2">
                      {anulados > 0 && <span className="chip chip-neutral">{anulados} anulado</span>}
                      <span className="text-xs text-zinc-500">{estadoPedidoLabel(p.estado)}</span>
                    </span>
                  </div>
                  {its.length === 0 ? (
                    <p className="py-1.5 text-sm text-zinc-600">
                      Esta comanda ya no tiene ítems por cobrar.
                    </p>
                  ) : (
                    <ul className="divide-y divide-surface-700/60 text-sm">
                      {its.map((it) => (
                        <li key={it.id} className="flex items-center justify-between gap-2 py-1.5">
                          <span className="text-zinc-300">
                            <span className="text-zinc-500">{it.cantidad}×</span> {it.nombre_producto}
                            {it.nota ? <span className="text-zinc-500"> · {it.nota}</span> : null}
                          </span>
                          <span className="text-zinc-400">
                            {fmtPEN(it.cantidad * it.precio_unitario)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="mt-2 flex justify-end border-t border-surface-700 pt-2 text-sm">
                    <span className="text-zinc-300">Subtotal: <span className="text-zinc-200">{fmtPEN(sub)}</span></span>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="lg:sticky lg:top-20 lg:self-start">
            <div className="rounded-2xl border border-surface-800 bg-surface-900 p-4">
              <div className="mb-4 flex items-center justify-between border-b border-surface-700 pb-3">
                <span className="text-sm text-zinc-400">Total a cobrar</span>
                <span className="text-2xl font-bold text-brand-400">{fmtPEN(total)}</span>
              </div>

              {/* Propina: se suma a la cuenta pero NO al total de la comanda. */}
              <div className="mb-4">
                <p className="mb-2 text-sm text-zinc-400">Propina</p>
                <div className="grid grid-cols-4 gap-2">
                  {PROPINAS_SUGERIDAS.map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      aria-pressed={propinaPct === pct}
                      onClick={() => setPropinaPct(propinaPct === pct ? null : pct)}
                      className={`min-h-11 touch-manipulation rounded-lg border text-sm font-semibold transition ${
                        propinaPct === pct
                          ? 'border-brand-500 bg-brand-500/15 text-brand-400'
                          : 'border-surface-700 bg-surface-800 text-zinc-400 hover:border-surface-500'
                      }`}
                    >
                      {pct === 0 ? 'Sin' : `${pct}%`}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mb-4 flex items-center justify-between rounded-xl bg-surface-800 px-3 py-2.5">
                <span className="text-sm text-zinc-300">Total con propina</span>
                <span className="text-lg font-bold tabular-nums text-zinc-100">{fmtPEN(aPagar)}</span>
              </div>

              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm text-zinc-400">Método de pago</p>
                <button
                  type="button"
                  aria-pressed={dividido}
                  onClick={alternarDividido}
                  className={`min-h-9 touch-manipulation rounded-lg border px-2.5 text-xs font-semibold transition ${
                    dividido
                      ? 'border-brand-500 bg-brand-500/15 text-brand-400'
                      : 'border-surface-700 bg-surface-800 text-zinc-400 hover:border-surface-500'
                  }`}
                >
                  {dividido ? 'Dividir' : 'Pago simple'}
                </button>
              </div>

              {!dividido ? (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    {METODOS_PAGO_LISTA.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        aria-pressed={metodo === m.id}
                        onClick={() => setMetodo(m.id)}
                        className={`min-h-12 touch-manipulation rounded-lg border px-3 py-3 text-base transition active:scale-[0.98] ${
                          metodo === m.id
                            ? 'border-brand-500 bg-brand-500/15 text-brand-400'
                            : 'border-surface-700 bg-surface-800 text-zinc-300 hover:border-surface-500'
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>

                  {metodo === 'efectivo' && (
                    <>
                      <label htmlFor="cobro-recibido" className="mt-3 mb-1.5 block text-sm text-zinc-400">
                        Efectivo recibido (opcional)
                      </label>
                      <input
                        id="cobro-recibido"
                        inputMode="decimal"
                        value={montoRecibido}
                        onChange={(e) => setMontoRecibido(e.target.value)}
                        placeholder={`Para cobrar ${fmtPEN(aPagar)}`}
                        className="input tabular-nums"
                      />
                      {vueltoSimple !== null && vueltoSimple > 0 && (
                        <div className="mt-2 flex items-center justify-between rounded-lg bg-surface-800 px-3 py-2 text-sm">
                          <span className="text-zinc-400">Vuelto</span>
                          <span className="font-bold tabular-nums text-brand-400">{fmtPEN(vueltoSimple)}</span>
                        </div>
                      )}
                    </>
                  )}
                </>
              ) : (
                <div className="space-y-2">
                  {partes.map((p, i) => (
                    <div key={i} className="rounded-lg bg-surface-800 p-2.5">
                      <div className="flex items-center gap-2">
                        <select
                          aria-label={`Método del pago ${i + 1}`}
                          value={p.metodo}
                          onChange={(e) => cambiarParte(i, { metodo: e.target.value as MetodoPago })}
                          className="input min-h-11 flex-1 py-2 text-sm"
                        >
                          {METODOS_PAGO_LISTA.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.label}
                            </option>
                          ))}
                        </select>
                        <input
                          aria-label={`Monto del pago ${i + 1}`}
                          inputMode="decimal"
                          value={p.monto === 0 ? '' : String(p.monto)}
                          onChange={(e) => {
                            const n = parseMonto(e.target.value)
                            cambiarParte(i, { monto: Number.isNaN(n) ? 0 : n })
                          }}
                          placeholder="Exacto"
                          className="input min-h-11 w-24 py-2 text-right text-sm tabular-nums"
                        />
                        <button
                          type="button"
                          aria-label={`Quitar pago ${i + 1}`}
                          disabled={partes.length === 1}
                          onClick={() => setPartes((prev) => prev.filter((_, idx) => idx !== i))}
                          className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-surface-600 text-lg text-zinc-400 hover:border-danger-500 hover:text-danger-500 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          −
                        </button>
                      </div>
                    </div>
                  ))}

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={agregarParte}
                      disabled={partes.length >= METODOS_PAGO_LISTA.length}
                      className="min-h-11 flex-1 touch-manipulation rounded-lg border border-dashed border-surface-600 px-3 py-2 text-sm text-zinc-400 hover:border-brand-500 hover:text-brand-500 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      + Otro método
                    </button>
                    <button
                      type="button"
                      onClick={repartir}
                      className="min-h-11 flex-1 touch-manipulation rounded-lg border border-surface-700 px-3 py-2 text-sm text-zinc-300 hover:border-surface-500"
                    >
                      Repartir
                    </button>
                  </div>

                  <div className="mt-2 space-y-1 rounded-lg bg-surface-800 px-3 py-2.5 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-zinc-400">A pagar</span>
                      <span className="tabular-nums text-zinc-200">{fmtPEN(aPagarResumen)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-zinc-400">Recibido</span>
                      <span className="tabular-nums text-zinc-200">{fmtPEN(resumen?.recibido ?? 0)}</span>
                    </div>
                    <div className="flex items-center justify-between border-t border-surface-700 pt-1">
                      <span className="text-zinc-400">Vuelto</span>
                      <span
                        className={`font-bold tabular-nums ${(resumen?.vuelto ?? 0) > 0 ? 'text-brand-400' : 'text-zinc-500'}`}
                      >
                        {(resumen?.vuelto ?? 0) > 0 ? fmtPEN(resumen?.vuelto ?? 0) : '—'}
                      </span>
                    </div>
                  </div>

                  {dividido && errorResumen && (
                    <p className="mt-2 text-sm text-warn-400">{errorResumen}</p>
                  )}
                </div>
              )}

              <button
                type="button"
                data-guia="cobrar-mesa"
                disabled={cobrando || pedidos.length === 0 || (dividido && Boolean(errorResumen))}
                onClick={() => void cobrar()}
                className="mt-4 min-h-14 w-full touch-manipulation rounded-xl bg-brand-500 py-3.5 text-base font-semibold text-surface-950 transition hover:bg-brand-400 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {cobrando ? 'Cobrando…' : `Cobrar ${fmtPEN(aPagar)}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// --------------------------------------------------------------------- Boleta

/**
 * Infiere la base imponible y el IGV a partir del total, ya que los precios hoy
 * no separan impuesto: base * (1 + IGV) = total.
 */
function inferirBaseImponible(total: number): { base: number; igv: number } {
  const base = Math.round((total / (1 + TASA_IGV)) * 100) / 100
  const igv = Math.round((total - base) * 100) / 100
  return { base, igv }
}

/** Ej.: boleta-mesa3-2026-09-21.pdf */
function nombreArchivoBoleta(mesaNombre: string, fechaIso: string): string {
  const mesa = mesaNombre.trim().toLowerCase().replace(/\s+/g, '')
  return `boleta-${mesa}-${fechaIso.slice(0, 10)}.pdf`
}

function descargarBoletaPdf(params: {
  restauranteNombre: string
  direccionTexto: string
  ruc: string
  numero: string
  fechaIso: string
  mesa: string
  mesero: string
  metodoLabel: string
  items: ItemResumen[]
  base: number
  igv: number
  propina: number
  vuelto: number
  total: number
}) {
  const {
    restauranteNombre,
    direccionTexto,
    ruc,
    numero,
    fechaIso,
    mesa,
    mesero,
    metodoLabel,
    items,
    base,
    igv,
    propina,
    vuelto,
    total,
  } = params

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a5' })
  const ancho = doc.internal.pageSize.getWidth()
  const m = 16
  const cX = ancho / 2
  let y = 22

  const texto = (texto: string, size = 9, estilo: 'normal' | 'bold' = 'normal') => {
    doc.setFont('helvetica', estilo)
    doc.setFontSize(size)
    return String(texto ?? '')
  }
  const linea = (ex = m, hx = ancho - m, ty = y) => {
    doc.setDrawColor(160)
    doc.setLineWidth(0.2)
    doc.line(ex, ty, hx, ty)
  }

  // --- Encabezado
  doc.text(texto(restauranteNombre, 14, 'bold'), cX, y, { align: 'center' })
  y += 6
  doc.text(texto(direccionTexto, 8.5), cX, y, { align: 'center' })
  y += 4
  doc.text(texto(`RUC: ${ruc}`, 8.5), cX, y, { align: 'center' })
  y += 7
  doc.text(texto('BOLETA DE VENTA ELECTRÓNICA', 11, 'bold'), cX, y, { align: 'center' })
  y += 4.5
  doc.text(texto(`N° ${numero}`, 9), cX, y, { align: 'center' })
  y += 5
  linea()
  y += 6

  // --- Datos de la operación
  const filaInfo = (etiqueta: string, valor: string) => {
    doc.text(texto(etiqueta, 8.5), m, y)
    doc.text(texto(valor, 8.5, 'bold'), ancho - m, y, { align: 'right' })
    y += 4.6
  }
  filaInfo('Fecha y hora', fmtFecha(fechaIso))
  filaInfo('Mesa', mesa)
  filaInfo('Mesero', mesero)
  filaInfo('Método de pago', metodoLabel)
  y += 1.5

  // --- Tabla de ítems
  linea()
  y += 4.5
  doc.text(texto('CANT', 7.5, 'bold'), m, y)
  doc.text(texto('DESCRIPCIÓN', 7.5, 'bold'), m + 13, y)
  doc.text(texto('P.U.', 7.5, 'bold'), ancho - (m + 36), y, { align: 'right' })
  doc.text(texto('IMPORTE', 7.5, 'bold'), ancho - m, y, { align: 'right' })
  y += 4
  linea()
  y += 3

  for (const it of items) {
    const importe = Math.round(it.cantidad * it.precio_unitario * 100) / 100
    const desc = it.nombre_producto.length > 40 ? it.nombre_producto.slice(0, 40) + '...' : it.nombre_producto
    doc.text(texto(String(it.cantidad)), m, y)
    doc.text(texto(desc), m + 13, y)
    doc.text(texto(fmtPEN(it.precio_unitario)), ancho - (m + 36), y, { align: 'right' })
    doc.text(texto(fmtPEN(importe)), ancho - m, y, { align: 'right' })
    y += 5
    if (y > 175) {
      doc.addPage()
      y = 22
      linea()
      y += 5
    }
  }

  y += 2
  linea()
  y += 6

  // --- Desglose
  const filaTotal = (etiqueta: string, valor: string, esTotal = false) => {
    doc.text(texto(etiqueta, esTotal ? 10 : 8.5, esTotal ? 'bold' : 'normal'), ancho - (m + 42), y, {
      align: 'right',
    })
    doc.text(texto(valor, esTotal ? 10 : 8.5, 'bold'), ancho - m, y, { align: 'right' })
    y += esTotal ? 6.5 : 5
  }
  filaTotal('Subtotal', fmtPEN(base))
  filaTotal('IGV (18%)', fmtPEN(igv))
  if (propina > 0) filaTotal('Propina', fmtPEN(propina))
  filaTotal('TOTAL', fmtPEN(total), true)
  if (vuelto > 0) {
    filaTotal('Recibido', fmtPEN(total + vuelto))
    filaTotal('Vuelto', fmtPEN(vuelto))
  }

  y += 6
  linea()
  y += 9

  // --- Pie
  doc.text(texto('Gracias por su preferencia', 9.5, 'bold'), cX, y, { align: 'center' })
  y += 5
  doc.text(texto('Generado con Mesora', 7.5), cX, y, { align: 'center' })

  doc.save(nombreArchivoBoleta(mesa, fechaIso))
}

interface BoletaProps {
  cuenta: Cuenta
  restauranteNombre?: string
  direccion?: string | null
  ruc?: string | null
  telefono?: string | null
  mesaNombre: string
  meseroNombre?: string
  items: ItemResumen[]
  onListo: () => void
}

function Boleta({
  cuenta,
  restauranteNombre,
  direccion,
  ruc,
  telefono,
  mesaNombre,
  meseroNombre,
  items,
  onListo,
}: BoletaProps) {
  const { base, igv } = inferirBaseImponible(cuenta.total)
  const numero = numeroBoletaDeCuenta(cuenta)
  const metodoLabel = labelMetodoPago(cuenta.metodo_pago)
  const fechaIso = cuenta.pagado_at ?? cuenta.created_at
  // Propina y vuelto vienen guardados en la cuenta (no del navegador): la
  // boleta tiene que poder auditarse contra la caja.
  const propina = Math.round((cuenta.propina ?? 0) * 100) / 100
  const vuelto = Math.round((cuenta.vuelto ?? 0) * 100) / 100
  const totalAPagar = Math.round((cuenta.total + propina) * 100) / 100
  // Datos fiscales reales del local (ver pestaña "Datos del local"). Si faltan,
  // se omiten en vez de imprimir un placeholder: una boleta con "20XXXXXXXXX"
  // es peor que una boleta sin RUC.
  const dir = direccion?.trim() || ''
  const rucTexto = ruc?.trim() || ''
  const telTexto = telefono?.trim() || ''

  function descargar() {
    descargarBoletaPdf({
      restauranteNombre: restauranteNombre ?? 'Restaurante',
      direccionTexto: dir,
      ruc: rucTexto,
      numero,
      fechaIso,
      mesa: mesaNombre,
      mesero: meseroNombre ?? '—',
      metodoLabel,
      items,
      base,
      igv,
      propina,
      vuelto,
      total: totalAPagar,
    })
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
      <div className="boleta-print mx-auto w-full max-w-sm overflow-hidden rounded-xl border border-surface-800 bg-surface-900 text-sm shadow-lg shadow-black/30">
        {/* Encabezado */}
        <div className="border-b border-dashed border-surface-700 p-4 text-center">
          <p className="text-base font-extrabold tracking-tight text-zinc-100">
            {restauranteNombre ?? 'Restaurante'}
          </p>
          {dir && <p className="mt-0.5 text-[11px] text-zinc-500">{dir}</p>}
          {telTexto && <p className="text-[11px] text-zinc-500">Tel. {telTexto}</p>}
          {rucTexto && (
            <p className="text-[11px] text-zinc-500">
              RUC: <span className="font-mono">{rucTexto}</span>
            </p>
          )}
          <p className="mt-3 text-xs font-bold uppercase tracking-widest text-zinc-300">
            Boleta de venta electrónica
          </p>
          <p className="mt-0.5 font-mono text-xs text-brand-400">Nº {numero}</p>
        </div>

        {/* Datos de la operación */}
        <div className="space-y-1 border-b border-dashed border-surface-700 px-4 py-3 text-xs text-zinc-400">
          <FilaBoleta etiqueta="Fecha y hora" valor={fmtFecha(fechaIso)} />
          <FilaBoleta etiqueta="Mesa" valor={mesaNombre} />
          <FilaBoleta etiqueta="Mesero" valor={meseroNombre ?? '—'} />
          <FilaBoleta etiqueta="Método de pago" valor={metodoLabel} />
        </div>

        {/* Ítems */}
        <div className="border-b border-dashed border-surface-700 px-4 py-2">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-surface-700 text-left text-[10px] uppercase tracking-widest text-zinc-500">
                <th className="py-1 pr-1 font-semibold">Cant</th>
                <th className="py-1 px-1 font-semibold">Descripción</th>
                <th className="py-1 px-1 text-right font-semibold">P.U.</th>
                <th className="py-1 pl-1 text-right font-semibold">Importe</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-800/60">
              {items.map((it) => {
                const importe = Math.round(it.cantidad * it.precio_unitario * 100) / 100
                return (
                  <tr key={it.id}>
                    <td className="py-1.5 pr-1 text-zinc-500">{it.cantidad}</td>
                    <td className="py-1.5 px-1 text-zinc-200">
                      {it.nombre_producto}
                      {it.nota ? <span className="text-zinc-500"> · {it.nota}</span> : null}
                    </td>
                    <td className="py-1.5 px-1 text-right text-zinc-400">{fmtPEN(it.precio_unitario)}</td>
                    <td className="py-1.5 pl-1 text-right font-medium text-zinc-100">{fmtPEN(importe)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Totales */}
        <div className="space-y-1 px-4 py-3 text-xs">
          <FilaBoleta etiqueta="Subtotal" valor={fmtPEN(base)} />
          <FilaBoleta etiqueta="IGV (18%)" valor={fmtPEN(igv)} />
          {propina > 0 && <FilaBoleta etiqueta="Propina" valor={fmtPEN(propina)} />}
          <div className="flex items-center justify-between border-t border-surface-700 pt-2 text-base">
            <span className="font-bold text-zinc-100">Total</span>
            <span className="font-extrabold text-brand-400">{fmtPEN(totalAPagar)}</span>
          </div>
          {vuelto > 0 && (
            <>
              <FilaBoleta etiqueta="Recibido" valor={fmtPEN(totalAPagar + vuelto)} />
              <div className="flex items-center justify-between text-sm font-semibold">
                <span className="text-zinc-300">Vuelto</span>
                <span className="text-brand-400">{fmtPEN(vuelto)}</span>
              </div>
            </>
          )}
        </div>

        {/* Pie */}
        <div className="border-t border-dashed border-surface-700 p-4 text-center text-xs">
          <p className="font-medium text-zinc-300">Gracias por su preferencia</p>
          <p className="mt-1 text-[10px] text-zinc-600">Generado con Mesora</p>
        </div>
      </div>

      <div className="flex flex-col gap-2 lg:sticky lg:top-20 lg:self-start">
        <button
          type="button"
          data-guia="boleta-pdf"
          onClick={descargar}
          className="min-h-12 touch-manipulation rounded-lg bg-brand-500 px-5 py-3 text-base font-semibold text-surface-950 transition hover:bg-brand-400 active:scale-[0.98]"
        >
          Descargar boleta (PDF)
        </button>
        <button
          type="button"
          onClick={() => window.print()}
          className="min-h-12 touch-manipulation rounded-lg border border-surface-700 px-5 py-3 text-base text-zinc-300 transition hover:border-brand-500 hover:text-brand-500 active:scale-[0.98]"
        >
          Imprimir boleta
        </button>
        <button
          type="button"
          onClick={onListo}
          className="min-h-12 touch-manipulation rounded-lg border border-transparent px-5 py-3 text-base text-zinc-400 transition hover:text-white active:scale-[0.98]"
        >
          Listo
        </button>
      </div>
    </div>
  )
}

function FilaBoleta({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span>{etiqueta}</span>
      <span className="text-zinc-200">{valor}</span>
    </div>
  )
}
