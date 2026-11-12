import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getApi } from '../../lib/api'
import type { BoletaReimpresion } from '../../lib/api'
import { useCurrentContext } from '../../lib/useCurrentContext'
import { fmtHora, fmtPEN } from '../../lib/format'
import { METODOS_PAGO_LABEL, METODOS_PAGO_LISTA } from '../../domain/cashier/pagos'
import { esPinValido, MOTIVOS_ANULACION_COBRO, errorAlAnularCobro } from '../../domain/security/autorizacion'
import type { Cuenta } from '../../types/database'
import { Spinner } from '../../components/LoadingScreen'
import EstadoVacio from '../../components/EstadoVacio'
import { IconoInfo, Modal, ResumenConfirmacionAccion } from '../../components/ui'
import { AvisoPin, CampoPin, usePinAutorizacion } from '../../components/pin'
import { confirmarAnulacionCuenta } from '../../domain/security/confirmaciones'
import { mensajeOperacion } from '../../domain/security/mensajeOperacion'
import { Boleta } from '../mesero/CerrarCuenta'

const hoyInput = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const aIsoLocal = (valor: string, dias = 0) => {
  const [y, m, d] = valor.split('-').map(Number)
  return new Date(y, m - 1, d + dias).toISOString()
}

/**
 * Boletas del día con la opción de anular un cobro.
 *
 * POR QUÉ VIVE ACÁ Y NO EN EL DASHBOARD
 * El dashboard es un informe: se imprime y se exporta. Anular un cobro es una
 * operación de caja (mueve dinero y cambia el arqueo del turno), así que va en
 * una pantalla aparte, disponible para el admin y para el cajero —los dos
 * pueden, el mesero no—.
 *
 * POR QUÉ LA BOLETA NO SE BORRA
 * Una boleta emitida es un documento. Anularla la deja marcada como 'anulada',
 * con motivo, quién la anuló y cuánto se devolvió: sale de las ventas del mes y
 * su efectivo sale de la gaveta, pero el registro queda (ver
 * supabase/rpc_anular_cuenta.sql).
 */
export default function CobrosTab({ onVerCaja }: { onVerCaja?: () => void } = {}) {
  const { restaurante, usuario } = useCurrentContext()
  const rid = restaurante?.id
  const [cuentas, setCuentas] = useState<Cuenta[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [busquedaAplicada, setBusquedaAplicada] = useState('')
  const [estadoFiltro, setEstadoFiltro] = useState<'todas' | 'pagada' | 'anulada'>('todas')
  const [metodoFiltro, setMetodoFiltro] = useState<'todos' | Cuenta['metodo_pago']>('todos')
  const [desde, setDesde] = useState(hoyInput)
  const [hasta, setHasta] = useState(hoyInput)
  const [pagina, setPagina] = useState(0)
  const [total, setTotal] = useState(0)
  const [anulando, setAnulando] = useState<Cuenta | null>(null)
  const [reimprimiendo, setReimprimiendo] = useState<Cuenta | null>(null)
  const [boleta, setBoleta] = useState<BoletaReimpresion | null>(null)
  const [pinReimpresion, setPinReimpresion] = useState('')
  const [errorReimpresion, setErrorReimpresion] = useState<string | null>(null)
  const [cargandoReimpresion, setCargandoReimpresion] = useState(false)
  const [flash, setFlash] = useState<string | null>(null)
  const secuencia = useRef(0)
  const limite = 25
  const rango = useMemo(() => ({ desde: aIsoLocal(desde), hasta: aIsoLocal(hasta, 1) }), [desde, hasta])

  useEffect(() => {
    const timer = setTimeout(() => { setBusquedaAplicada(busqueda.trim()); setPagina(0) }, 250)
    return () => clearTimeout(timer)
  }, [busqueda])

  const cargar = useCallback(
    async (silencioso = false) => {
      if (!rid) return
      if (!silencioso) setCargando(true)
      if (!desde || !hasta || rango.desde >= rango.hasta) {
        setError('La fecha final debe ser igual o posterior a la fecha inicial.')
        setCargando(false)
        return
      }
      const peticion = ++secuencia.current
      const { data, error: apiErr } = await getApi().getCuentasFiltradas(rid, {
        ...rango, estado: estadoFiltro, metodo: metodoFiltro, busqueda: busquedaAplicada,
        offset: pagina * limite, limite,
      })
      if (peticion !== secuencia.current) return
      if (apiErr) setError(apiErr)
      else {
        setCuentas(data?.items ?? [])
        setTotal(data?.total ?? 0)
        setError(null)
      }
      setCargando(false)
    },
    [rid, desde, hasta, rango, estadoFiltro, metodoFiltro, busquedaAplicada, pagina],
  )

  useEffect(() => {
    void cargar()
  }, [cargar])

  const esCajero = usuario?.rol === 'cajero'
  const adminExperience = Boolean(onVerCaja)
  const paginas = Math.max(1, Math.ceil(total / limite))

  function limpiarFiltros() {
    setBusqueda('')
    setBusquedaAplicada('')
    setEstadoFiltro('todas')
    setMetodoFiltro('todos')
    setDesde(hoyInput())
    setHasta(hoyInput())
    setPagina(0)
  }

  function estadoCuenta(c: Cuenta) {
    return c.estado === 'anulada'
      ? <span className="chip chip-danger" title={c.motivo_anulacion ?? undefined}>{adminExperience ? 'Anulada · histórica' : 'Anulada'}</span>
      : <span className="chip chip-ok">Cobrada</span>
  }

  function accionesCuenta(c: Cuenta) {
    if (c.estado !== 'pagada') {
      return <span className="text-xs text-zinc-500">{c.monto_reembolsado != null ? `${adminExperience ? 'Devuelto' : 'devuelto'} ${fmtPEN(c.monto_reembolsado)}` : adminExperience ? 'Sin acciones de cobro' : ''}</span>
    }
    return <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => {
          setErrorReimpresion(null)
          setPinReimpresion('')
          setReimprimiendo(c)
        }}
        className="btn btn-outline min-h-11 px-3"
      >
        Reimprimir
      </button>
      <button
        type="button"
        onClick={() => {
          setFlash(null)
          setAnulando(c)
        }}
        className={`btn btn-danger-ghost min-h-11 px-3 ${adminExperience ? 'border border-danger-500/25' : ''}`}
      >
        Anular
      </button>
    </div>
  }

  async function confirmarReimpresion() {
    if (!rid || !reimprimiendo) return
    setCargandoReimpresion(true)
    setErrorReimpresion(null)
    const resultado = await getApi().getBoletaReimpresion(rid, reimprimiendo.id, pinReimpresion)
    setCargandoReimpresion(false)
    if (resultado.error || !resultado.data) {
      setErrorReimpresion(resultado.error ?? 'No se pudo cargar el recibo original.')
      return
    }
    setBoleta(resultado.data)
    setReimprimiendo(null)
    setPinReimpresion('')
  }

  return (
    <div className={adminExperience ? 'flex flex-col gap-5' : 'space-y-5'}>
      {adminExperience ? <section aria-label="Estado de cobros" className="card flex flex-col gap-4 border-brand-500/20 bg-[linear-gradient(120deg,rgba(255,149,0,0.07),transparent_60%)] p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Consulta de cobros</p>
          <p className="mt-1 text-sm leading-relaxed text-zinc-300">Aquí ves recibos internos cobrados o anulados. Los recibos anulados permanecen en el historial y no vuelven a Caja como pendientes.</p>
        </div>
        {onVerCaja && <button type="button" onClick={onVerCaja} className="btn btn-primary min-h-11 w-full px-4 sm:w-auto">Ir a Caja</button>}
      </section> : null}

      <div className={`aviso ${adminExperience ? 'border-surface-700 bg-surface-900 text-zinc-400' : 'border-brand-500/30 bg-brand-500/10 text-brand-300'}`}>
        <span className="flex items-start gap-2.5">
          <IconoInfo className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {adminExperience
              ? 'Al anular un cobro, el reembolso queda registrado con su motivo y se refleja en el arqueo del turno.'
              : 'Anular un cobro devuelve el dinero y lo saca de las ventas del mes. Queda registrado quién lo anuló y por qué, y el efectivo devuelto descuenta del arqueo del turno.'}
          </span>
        </span>
      </div>

      {flash && (
        <div role="status" className="aviso border-ok-500/40 bg-ok-500/10 text-ok-500">
          {flash}
        </div>
      )}
      {error && (
        <div className="aviso border-danger-500/40 bg-danger-500/10 text-danger-500">
          No se pudieron cargar las boletas. {error}
        </div>
      )}

      <div className={`card space-y-4 p-4 ${adminExperience ? 'sm:p-5' : 'sm:p-6'}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className={adminExperience ? 'text-base font-semibold text-zinc-100' : 'titulo-seccion text-base'}>{adminExperience ? 'Historial de recibos' : 'Cobros y boletas'}</h2>
            <p className="mt-1 text-sm text-zinc-500">Busca por número, mesa, mesero o importe. Se muestran {total} resultados.</p>
          </div>
          {(busqueda || estadoFiltro !== 'todas' || metodoFiltro !== 'todos' || desde !== hoyInput() || hasta !== hoyInput()) && (
            <button type="button" onClick={limpiarFiltros} className="btn btn-outline min-h-11 px-3">Limpiar filtros</button>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <label className="text-sm text-zinc-400">Buscar {adminExperience ? 'recibo' : 'boleta'}, mesa, mesero o importe
            <input type="search" className="input mt-1 min-h-11 w-full" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Ej. B001-000124, Terraza o 45.50" />
          </label>
          <label className="text-sm text-zinc-400">Estado
            <select className="input mt-1 min-h-11 w-full" value={estadoFiltro} onChange={(e) => { setEstadoFiltro(e.target.value as typeof estadoFiltro); setPagina(0) }}>
              <option value="todas">Cobradas y anuladas</option><option value="pagada">Solo cobradas</option><option value="anulada">Solo anuladas</option>
            </select>
          </label>
          <label className="text-sm text-zinc-400">Método de pago
            <select className="input mt-1 min-h-11 w-full" value={metodoFiltro} onChange={(e) => { setMetodoFiltro(e.target.value as typeof metodoFiltro); setPagina(0) }}>
              <option value="todos">Todos los métodos</option>
              {METODOS_PAGO_LISTA.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </label>
          <label className="text-sm text-zinc-400">Desde
            <input type="date" className="input mt-1 min-h-11 w-full" value={desde} max={hasta || undefined} onChange={(e) => { setDesde(e.target.value); setPagina(0) }} />
          </label>
          <label className="text-sm text-zinc-400">Hasta
            <input type="date" className="input mt-1 min-h-11 w-full" value={hasta} min={desde || undefined} onChange={(e) => { setHasta(e.target.value); setPagina(0) }} />
          </label>
        </div>

        {adminExperience && <div className="flex flex-wrap gap-2 border-t border-surface-800 pt-3 text-xs text-zinc-400" aria-label="Estados de recibos">
          <span className="chip chip-ok">Cobrada</span><span>Pago registrado</span>
          <span className="chip chip-danger">Anulada · histórica</span><span>No se cobra de nuevo</span>
        </div>}

        {cargando ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : cuentas.length === 0 ? (
          <EstadoVacio titulo={`No hay ${adminExperience ? 'recibos' : 'boletas'} para estos filtros.`} descripcion="Cambia las fechas o limpia los filtros para ver más resultados." className="py-8" />
        ) : (
          <>
          <div className={adminExperience ? '-mx-5 hidden overflow-x-auto px-5 sm:mx-0 sm:px-0 lg:block' : '-mx-5 overflow-x-auto px-5 sm:mx-0 sm:px-0'}>
            <table className="w-full min-w-[36rem] text-sm">
              <thead>
                <tr className="border-b border-surface-700 text-left text-xs uppercase tracking-widest text-zinc-500">
                  <th scope="col" className="py-2 pr-3 font-semibold">Boleta / hora</th>
                  <th scope="col" className="py-2 pr-3 font-semibold">Mesa y mesero</th>
                  <th scope="col" className="py-2 pr-3 font-semibold">Método</th>
                  <th scope="col" className="py-2 pr-3 text-right font-semibold">Total</th>
                  <th scope="col" className="py-2 pr-3 font-semibold">Estado</th>
                  <th scope="col" className="py-2 text-right font-semibold">
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-700/60">
                {cuentas.map((c) => (
                  <tr key={c.id} className={c.estado === 'anulada' ? 'opacity-60' : undefined}>
                    <td className="py-2.5 pr-3 text-zinc-300"><strong className="block text-zinc-100">{c.numero ?? `Cuenta ${c.id.slice(0, 8)}`}</strong>{c.pagado_at ? fmtHora(c.pagado_at) : '—'}</td>
                    <td className="py-2.5 pr-3 text-zinc-300">{c.mesa_nombre_snapshot ?? '—'}<span className="block text-xs text-zinc-500">{c.mesero_nombre_snapshot ?? 'Mesero sin registro'}</span></td>
                    <td className="py-2.5 pr-3 text-zinc-400">
                      {METODOS_PAGO_LABEL[c.metodo_pago] ?? c.metodo_pago}
                      {c.propina ? <span className="text-xs text-zinc-500"> + {fmtPEN(c.propina)} propina</span> : null}
                    </td>
                    <td className="py-2.5 pr-3 text-right font-semibold tabular-nums text-zinc-100">
                      {fmtPEN(c.total)}
                    </td>
                    <td className="py-2.5 pr-3">
                      {estadoCuenta(c)}
                      {c.estado === 'anulada' && c.motivo_anulacion ? (
                        <p className="mt-1 max-w-[18rem] text-xs text-zinc-500">{c.motivo_anulacion}</p>
                      ) : null}
                    </td>
                    <td className="py-2.5 text-right">
                      <div className="inline-flex justify-end">{accionesCuenta(c)}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {adminExperience && <ul className="grid gap-3 lg:hidden" aria-label="Recibos de la página">
            {cuentas.map((c) => (
              <li key={c.id}>
                <article aria-label={`Recibo ${c.numero ?? c.id.slice(0, 8)}`} className={`rounded-xl border bg-surface-950/45 p-4 ${c.estado === 'anulada' ? 'border-danger-500/20' : 'border-surface-800'}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Recibo interno</p>
                      <h3 className="mt-1 break-all text-sm font-bold text-zinc-100">{c.numero ?? `Cuenta ${c.id.slice(0, 8)}`}</h3>
                      <p className="mt-1 text-xs text-zinc-500">{c.pagado_at ? fmtHora(c.pagado_at) : '—'}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-zinc-500">Total</p>
                      <p className="mt-1 text-lg font-bold tabular-nums text-zinc-100">{fmtPEN(c.total)}</p>
                      <div className="mt-1">{estadoCuenta(c)}</div>
                    </div>
                  </div>
                  <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-surface-800 pt-3 text-sm">
                    <div><dt className="text-xs text-zinc-500">Mesa</dt><dd className="mt-1 truncate text-zinc-200">{c.mesa_nombre_snapshot ?? '—'}</dd></div>
                    <div><dt className="text-xs text-zinc-500">Mesero</dt><dd className="mt-1 truncate text-zinc-300">{c.mesero_nombre_snapshot ?? 'Mesero sin registro'}</dd></div>
                    <div><dt className="text-xs text-zinc-500">Método de pago</dt><dd className="mt-1 text-zinc-300">{METODOS_PAGO_LABEL[c.metodo_pago] ?? c.metodo_pago}</dd></div>
                    <div><dt className="text-xs text-zinc-500">Propina</dt><dd className="mt-1 tabular-nums text-zinc-300">{c.propina ? fmtPEN(c.propina) : '—'}</dd></div>
                  </dl>
                  {c.estado === 'anulada' && c.motivo_anulacion ? <p className="mt-3 rounded-lg bg-danger-500/5 px-3 py-2 text-xs leading-relaxed text-zinc-400">Motivo: {c.motivo_anulacion}</p> : null}
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-surface-800 pt-3">{accionesCuenta(c)}</div>
                </article>
              </li>
            ))}
          </ul>}
          </>
        )}
        {!cargando && total > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-surface-700 pt-3 text-sm text-zinc-400">
            <span>{total} {adminExperience ? 'recibos' : 'boletas'} · página {pagina + 1} de {paginas}</span>
            <div className={adminExperience ? 'flex w-full gap-2 sm:w-auto' : 'flex gap-2'}>
              <button type="button" className={`btn btn-outline min-h-11 px-3 ${adminExperience ? 'flex-1 sm:flex-none' : ''}`} disabled={pagina === 0 || cargando} onClick={() => setPagina((p) => p - 1)}>Anterior</button>
              <button type="button" className={`btn btn-outline min-h-11 px-3 ${adminExperience ? 'flex-1 sm:flex-none' : ''}`} disabled={pagina + 1 >= paginas || cargando} onClick={() => setPagina((p) => p + 1)}>Siguiente</button>
            </div>
          </div>
        )}
      </div>

      {anulando && (
        <ModalAnularCobro
          cuenta={anulando}
          onCerrar={() => setAnulando(null)}
          onAnulada={async (mensaje) => {
            setAnulando(null)
            setFlash(mensaje)
            await cargar(true)
          }}
        />
      )}

      {reimprimiendo && (
        <Modal titulo="Reimprimir boleta" onCerrar={() => setReimprimiendo(null)}>
          <p className="text-sm leading-relaxed text-zinc-300">
            Se volverá a imprimir el recibo interno original de <strong>{fmtPEN(reimprimiendo.total)}</strong>. No crea otro cobro ni otro número de boleta.
          </p>
          {esCajero ? (
            <>
              <CampoPin pin={pinReimpresion} onChange={setPinReimpresion} etiqueta="PIN del administrador" error={errorReimpresion} />
              <p className="mt-2 text-xs text-zinc-500">Si el restaurante aún no tiene PIN, el administrador debe configurarlo en Configuración.</p>
            </>
          ) : errorReimpresion ? (
            <div role="alert" className="aviso mt-4 border-danger-500/40 bg-danger-500/10 text-danger-500">{errorReimpresion}</div>
          ) : null}
          {!esCajero && errorReimpresion ? (
            <div role="alert" className="aviso mt-4 border-danger-500/40 bg-danger-500/10 text-danger-500">{errorReimpresion}</div>
          ) : null}
          {cargandoReimpresion ? (
            <div role="status" aria-live="polite" className="aviso mt-4 border-brand-500/30 bg-brand-500/10 text-brand-300">
              <Spinner className="mr-2 h-4 w-4 align-middle" /> Validando autorización y recuperando el recibo original…
            </div>
          ) : null}
          <div className="mt-6 flex flex-wrap justify-end gap-2">
            <button type="button" onClick={() => setReimprimiendo(null)} className="btn btn-outline min-h-11 px-4">Cancelar</button>
            <button
              type="button"
              disabled={cargandoReimpresion || (esCajero && pinReimpresion.length < 4)}
              onClick={() => void confirmarReimpresion()}
              className="btn min-h-11 px-4"
            >
              {cargandoReimpresion ? 'Validando…' : 'Continuar a la boleta'}
            </button>
          </div>
        </Modal>
      )}

      {boleta && (
        <Modal titulo={`Reimpresión · ${boleta.cuenta.numero ?? 'boleta'}`} onCerrar={() => setBoleta(null)} ancho="max-w-4xl">
          <p className="mb-4 text-sm text-zinc-400">Duplicado del recibo original. Esta acción no registra un nuevo pago.</p>
          <Boleta
            cuenta={boleta.cuenta}
            restauranteNombre={boleta.restauranteNombre}
            direccion={boleta.direccion}
            ruc={boleta.ruc}
            telefono={boleta.telefono}
            mesaNombre={boleta.mesaNombre}
            meseroNombre={boleta.meseroNombre ?? undefined}
            items={boleta.items}
            esCopia
            onListo={() => {
              setBoleta(null)
              setFlash(`Boleta ${boleta.cuenta.numero ?? ''} lista para imprimir. No se registró un nuevo cobro.`)
            }}
          />
        </Modal>
      )}
    </div>
  )
}

/**
 * Modal de anulación: motivo (obligatorio, es el registro de por qué se devolvió
 * el dinero) y PIN si el restaurante lo configuró. El PIN lo valida el servidor.
 */
function ModalAnularCobro({
  cuenta,
  onCerrar,
  onAnulada,
}: {
  cuenta: Cuenta
  onCerrar: () => void
  onAnulada: (mensaje: string) => Promise<void>
}) {
  const { restaurante } = useCurrentContext()
  const rid = restaurante?.id
  const { pin, setPin, requierePin, cargando: consultandoPin } = usePinAutorizacion(rid)
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [revisandoAnulacion, setRevisandoAnulacion] = useState(false)
  const vivo = useRef(true)

  useEffect(() => () => {
    vivo.current = false
  }, [])

  async function confirmar() {
    if (!rid) return
    const errorLocal = errorAlAnularCobro(motivo)
    if (errorLocal) return setError(errorLocal)
    setEnviando(true)
    setError(null)
    const res = await getApi().anularCuenta(rid, cuenta.id, motivo, pin)
    if (!vivo.current) return
    setEnviando(false)
    if (res.error) return setError(mensajeOperacion(res.error, 'No se pudo anular la boleta. Actualiza la lista e inténtalo de nuevo.'))
    await onAnulada(`Se anuló la boleta de ${fmtPEN(cuenta.total)}. Devuelve ${fmtPEN(res.data?.monto_reembolsado ?? cuenta.total)}.`)
  }

  function revisarAnulacion() {
    const errorLocal = errorAlAnularCobro(motivo)
    if (errorLocal) return setError(errorLocal)
    setError(null)
    setRevisandoAnulacion(true)
  }

  return (
    <Modal titulo="Anular cobro" onCerrar={onCerrar} ancho="max-w-sm">
      {!revisandoAnulacion ? (
        <>
          <p className="text-sm leading-relaxed text-zinc-300">
            Revisa el motivo y el PIN. Antes de devolver el dinero verás un resumen de la boleta y sus efectos.
          </p>

          <div className="mt-4">
        <label className="label" htmlFor="cobro-motivo">
          Motivo
        </label>
        <input
          id="cobro-motivo"
          value={motivo}
          maxLength={200}
          onChange={(e) => {
            setMotivo(e.target.value)
            setError(null)
          }}
          className="input"
          placeholder="Ej. error de cobro"
        />
        <div className="mt-2 flex flex-wrap gap-1.5">
          {MOTIVOS_ANULACION_COBRO.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMotivo(m)}
              className="chip chip-neutral min-h-9 touch-manipulation px-2.5 text-xs"
            >
              {m}
            </button>
          ))}
        </div>
          </div>

          {consultandoPin ? <AvisoPin visible /> : null}
          {requierePin ? <CampoPin pin={pin} onChange={setPin} /> : null}
        </>
      ) : (
        <>
          <p className="text-sm text-zinc-300">Confirma que estos datos estén correctos. El cobro se anulará solo después de pulsar el botón final.</p>
          <ResumenConfirmacionAccion resumen={confirmarAnulacionCuenta({
            boleta: cuenta.numero ?? cuenta.id.slice(0, 8),
            total: fmtPEN(cuenta.total),
            propina: fmtPEN(cuenta.propina ?? 0),
            reembolso: fmtPEN(cuenta.total + (cuenta.propina ?? 0)),
            motivo: motivo.trim(),
            requierePin,
          })} pinVerificando={consultandoPin} />
          {requierePin ? <CampoPin pin={pin} onChange={setPin} etiqueta="Confirma el PIN del gerente" /> : null}
        </>
      )}

      {enviando && (
        <div role="status" aria-live="polite" className="aviso mt-4 border-brand-500/30 bg-brand-500/10 text-brand-300">
          <Spinner className="mr-2 h-4 w-4 align-middle" />
          Validando el PIN y registrando la anulación. Mantén esta ventana abierta.
        </div>
      )}

      {error && (
        <div className="aviso mt-4 border-danger-500/40 bg-danger-500/10 text-danger-500">{error}</div>
      )}

      <div className="mt-6 flex flex-wrap justify-end gap-2">
        {revisandoAnulacion ? (
          <button type="button" disabled={enviando} onClick={() => { setRevisandoAnulacion(false); setError(null) }} className="btn btn-outline min-h-11 px-4">
            Volver a editar
          </button>
        ) : null}
        <button type="button" disabled={enviando} onClick={onCerrar} className="btn btn-outline min-h-11 px-4">
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => revisandoAnulacion ? void confirmar() : revisarAnulacion()}
          disabled={enviando || consultandoPin || (requierePin && !esPinValido(pin))}
          className="btn min-h-11 px-4 bg-danger-500 text-white transition-colors hover:bg-danger-500/90"
        >
          {enviando ? 'Anulando boleta…' : revisandoAnulacion ? 'Confirmar anulación y devolución' : 'Revisar antes de anular'}
        </button>
      </div>
    </Modal>
  )
}
