import { useCallback, useEffect, useState } from 'react'
import { esFalloDeRed, getApi } from '../../lib/api'
import { useCurrentContext } from '../../lib/useCurrentContext'
import { arqueoTurno, errorAlAbrirTurno, errorAlCerrarTurno, parseMonto } from '../../domain/cashier/caja'
import { fmtFecha, fmtPEN } from '../../lib/format'
import type { MesaPorCobrar } from '../../lib/api'
import type { Cuenta, Mesa, Pago, TurnoCaja } from '../../types/database'
import { Spinner } from '../../components/LoadingScreen'
import EstadoVacio from '../../components/EstadoVacio'
import { IconoInfo, Modal, ResumenConfirmacionAccion } from '../../components/ui'
import Precuenta from '../../components/Precuenta'
import CerrarCuenta from '../mesero/CerrarCuenta'
import { confirmarCierreCaja } from '../../domain/security/confirmaciones'

/**
 * Caja por turnos del Admin: abrir la gaveta, ver cuánto debería haber y cerrar
 * con arqueo. Todo el cálculo del "¿cuánto debería haber?" está en
 * domain/cashier/caja.ts
 * (misma función que usa el backend), así que la pantalla no inventa números.
 */
export default function CajaTab({ adminExperience = false }: { adminExperience?: boolean } = {}) {
  const { restaurante, usuario } = useCurrentContext()
  const rid = restaurante?.id

  const [turno, setTurno] = useState<TurnoCaja | null>(null)
  const [turnos, setTurnos] = useState<TurnoCaja[]>([])
  const [cuentas, setCuentas] = useState<Cuenta[]>([])
  const [pagos, setPagos] = useState<Pick<Pago, 'cuenta_id' | 'metodo_pago' | 'monto'>[]>([])
  const [porCobrar, setPorCobrar] = useState<MesaPorCobrar[]>([])
  const [mesas, setMesas] = useState<Mesa[]>([])
  const [puedeCobrar, setPuedeCobrar] = useState(false)
  const [errorPermisoCobro, setErrorPermisoCobro] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [inicial, setInicial] = useState('')
  const [declarado, setDeclarado] = useState('')
  const [observaciones, setObservaciones] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [mesaPrecuenta, setMesaPrecuenta] = useState<MesaPorCobrar | null>(null)
  const [mesaCobro, setMesaCobro] = useState<Mesa | null>(null)
  const [confirmarCierre, setConfirmarCierre] = useState(false)

  const cargar = useCallback(async () => {
    if (!rid) {
      setCargando(false)
      return
    }
    try {
      const api = getApi()
      const [t, hist, c, pg, porCobrarRes, mesasRes, permisoRes] = await Promise.all([
        api.getTurnoAbierto(rid),
        api.getTurnos(rid),
        api.getCuentasPagadas(rid),
        api.getPagosDeCuentas(rid),
        api.getMesasPorCobrar(rid),
        api.getMesas(rid),
        api.puedeCobrar(rid),
      ])
      const errorCarga = t.error ?? hist.error ?? c.error ?? pg.error ?? porCobrarRes.error
      if (errorCarga) {
        setError(errorCarga)
        return
      }
      setTurno(t.data)
      setTurnos(hist.data ?? [])
      // getCuentasPagadas devuelve el resumen; para el arqueo solo total/método/
      // estado/pagado_at/vuelto, que es exactamente lo que pide arqueoTurno.
      setCuentas((c.data ?? []) as Cuenta[])
      setPagos(pg.data ?? [])
      setPorCobrar(porCobrarRes.data ?? [])
      setMesas(mesasRes.data ?? [])
      setPuedeCobrar(permisoRes.data === true)
      setErrorPermisoCobro(permisoRes.error ?? mesasRes.error)
      setError(null)
    } catch {
      setError('No se pudo cargar la información de caja. Revisa tu conexión e inténtalo de nuevo.')
    } finally {
      setCargando(false)
    }
  }, [rid])

  useEffect(() => {
    void cargar()
  }, [cargar])

  if (cargando)
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    )

  const arqueo = turno ? arqueoTurno(turno, cuentas, pagos) : null
  const montoInicial = parseMonto(inicial)
  const montoDeclarado = parseMonto(declarado)
  const totalPendiente = porCobrar.reduce((acc, m) => acc + m.total, 0)
  const cajaCerrada = !turno && turnos.some((t) => Boolean(t.fecha_cierre))

  async function abrir() {
    if (!rid || !usuario) return
    // Mismo mensaje que el backend: si el front acepta algo que la base no, el
    // error llega tarde y sin contexto.
    const falla = errorAlAbrirTurno(montoInicial, turno)
    if (falla) return setError(falla)
    setGuardando(true)
    setError(null)
    try {
      const res = await getApi().abrirTurno(rid, usuario.id, montoInicial)
      if (res.error) {
        if (esFalloDeRed(res.error)) {
          setCargando(true)
          await cargar()
          setError('La respuesta de apertura se perdió. Revisa si el turno quedó abierto antes de volver a intentarlo.')
        } else setError(res.error)
        return
      }
      setInicial('')
      setCargando(true)
      await cargar()
    } catch {
      setCargando(true)
      await cargar()
      setError('No se pudo confirmar la apertura. Revisa si el turno quedó abierto antes de intentarlo de nuevo.')
    } finally {
      setGuardando(false)
    }
  }

  async function cerrar() {
    if (!rid || !usuario) return
    const falla = errorAlCerrarTurno(montoDeclarado, turno)
    if (falla) return setError(falla)
    setGuardando(true)
    setError(null)
    try {
      const res = await getApi().cerrarTurno(rid, usuario.id, montoDeclarado, observaciones.trim() || null)
      if (res.error) {
        if (esFalloDeRed(res.error)) {
          setCargando(true)
          await cargar()
          setError('La respuesta de cierre se perdió. Revisa el historial y el turno abierto antes de repetirlo.')
          setConfirmarCierre(false)
        } else setError(res.error)
        return
      }
      setConfirmarCierre(false)
      setDeclarado('')
      setObservaciones('')
      setCargando(true)
      await cargar()
    } catch {
      setCargando(true)
      await cargar()
      setError('No se pudo confirmar el cierre. Revisa el historial y el turno abierto antes de repetirlo.')
    } finally {
      setGuardando(false)
    }
  }

  if (mesaPrecuenta) {
    return <Precuenta mesa={{ id: mesaPrecuenta.mesa_id, nombre: mesaPrecuenta.mesa_nombre }} onVolver={() => { setMesaPrecuenta(null); void cargar() }} />
  }
  if (mesaCobro) {
    return <CerrarCuenta mesa={mesaCobro} onVolver={() => { setMesaCobro(null); void cargar() }} onCuentaCerrada={() => { setMesaCobro(null); void cargar() }} />
  }

  return (
    <div className={adminExperience ? 'flex flex-col gap-5' : 'space-y-6'}>
      {error && (
        <div role="alert" className={`aviso border-danger-500/40 bg-danger-500/10 text-danger-500 ${adminExperience ? 'order-0' : ''}`}>
          {error}
          <button type="button" onClick={() => { setCargando(true); void cargar() }} className="ml-3 underline">Actualizar caja</button>
        </div>
      )}

      {porCobrar.length > 0 && (
        <section aria-label="Precuentas de mesas" className={`card p-4 ${adminExperience ? 'order-4 sm:p-5' : ''}`}>
          <h2 className="font-semibold text-zinc-100">Precuentas</h2>
          <p className="mt-1 text-sm text-zinc-400">Consulta e imprime el consumo pendiente de cada mesa antes de cobrar.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {porCobrar.map((m) => (
              <button key={m.mesa_id} type="button" disabled={guardando || Boolean(error)} onClick={() => setMesaPrecuenta(m)} className="btn btn-outline min-h-12 px-4">
                Precuenta {m.mesa_nombre} · {fmtPEN(m.total)}
              </button>
            ))}
          </div>
        </section>
      )}

      <section aria-label="Cobrar mesas" className={`card p-4 ${adminExperience ? 'order-3 overflow-hidden border-brand-500/20 sm:p-5' : ''}`}>
        {adminExperience ? <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold text-zinc-100">Cobrar una mesa</h2>
            <p className="mt-1 text-sm text-zinc-400">Cierra la cuenta y entrega el recibo interno de Mesora. La facturación electrónica se realiza en el sistema del restaurante.</p>
          </div>
          <span className="chip chip-neutral">{porCobrar.length} {porCobrar.length === 1 ? 'mesa pendiente' : 'mesas pendientes'}</span>
        </div> : <>
          <h2 className="font-semibold text-zinc-100">Cobrar una mesa</h2>
          <p className="mt-1 text-sm text-zinc-400">Cierra la cuenta y entrega el recibo interno de Mesora. La facturación electrónica se realiza en el sistema del restaurante.</p>
        </>}
        {errorPermisoCobro && <p className="mt-2 text-sm text-amber-300" role="alert">No se pudieron confirmar tus permisos de cobro. Actualiza esta página antes de cobrar.</p>}
        {!errorPermisoCobro && !puedeCobrar && <p className="mt-2 text-sm text-amber-300">Tu cuenta no está autorizada para cobrar. Pide al administrador que revise Configuración operativa.</p>}
        {puedeCobrar && <div className="mt-3 flex flex-wrap gap-2">
          {porCobrar.map((pendiente) => {
            const mesa = mesas.find((fila) => fila.id === pendiente.mesa_id)
            return <button key={pendiente.mesa_id} type="button" disabled={!mesa || guardando} onClick={() => { if (mesa) setMesaCobro(mesa) }} className="btn btn-outline min-h-12 px-4">
              Cobrar {pendiente.mesa_nombre} · {fmtPEN(pendiente.total)}
            </button>
          })}
          {porCobrar.length === 0 && <p className="text-sm text-zinc-400">No hay mesas pendientes de cobro.</p>}
        </div>}
      </section>

      {turno && porCobrar.length > 0 && (
        <div
          role="status"
          className={`aviso border-warn-500/40 bg-warn-500/10 text-warn-500 ${adminExperience ? 'order-2' : ''}`}
        >
          <div className="flex items-start gap-2.5">
            <IconoInfo className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="min-w-0">
              <p className="font-semibold text-warn-500">
                {porCobrar.length === 1
                  ? `Queda 1 mesa con ${fmtPEN(totalPendiente)} sin cobrar`
                  : `Quedan ${porCobrar.length} mesas con ${fmtPEN(totalPendiente)} sin cobrar`}
              </p>
              <p className="mt-0.5 text-xs leading-relaxed text-zinc-400">
                Puedes cerrar el turno igualmente: ese dinero entrará al arqueo del turno en el que
                se cobre.
              </p>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {porCobrar.map((m) => (
                  <li
                    key={m.mesa_id}
                    className="rounded-lg border border-warn-500/30 bg-surface-900/60 px-2 py-1 text-xs font-medium text-zinc-300"
                  >
                    {m.mesa_nombre} · <span className="tabular-nums">{fmtPEN(m.total)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {!turno ? (
        <div className={`card p-5 sm:p-6 ${adminExperience ? 'order-1 overflow-hidden border-brand-500/20 bg-[linear-gradient(135deg,rgba(255,149,0,0.07),transparent_55%)]' : ''}`}>
          {adminExperience && <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Estado de caja</p>
              <h2 className="mt-1 text-lg font-bold tracking-tight text-zinc-100">{cajaCerrada ? 'Caja cerrada' : 'Sin turno abierto'}</h2>
            </div>
            <span className={`chip ${cajaCerrada ? 'chip-neutral' : 'chip-warn'}`}>{cajaCerrada ? 'Cerrada' : 'Lista para abrir'}</span>
          </div>}
          <h2 className="text-lg font-bold tracking-tight text-zinc-100">{adminExperience ? 'Abrir un turno' : 'Abrir caja'}</h2>
          <p className="mt-0.5 mb-5 text-sm text-zinc-500">
            Registra el efectivo con el que arranca el turno. Es la base del arqueo.
          </p>

          <label htmlFor="caja-inicial" className="mb-1.5 block text-sm font-medium text-zinc-300">
            Efectivo inicial
          </label>
          <div className="flex flex-wrap gap-2">
            <input
              id="caja-inicial"
              inputMode="decimal"
              value={inicial}
              onChange={(e) => setInicial(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void abrir()
              }}
              placeholder="0.00"
              className="input max-w-[12rem] text-lg font-semibold tabular-nums"
            />
            <button
              type="button"
              data-guia="abrir-caja"
              onClick={() => void abrir()}
              disabled={guardando || Number.isNaN(montoInicial)}
              className="btn btn-primary min-h-11 px-5"
            >
              {guardando ? 'Abriendo…' : 'Abrir turno'}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className={`card p-5 sm:p-6 ${adminExperience ? 'order-1 overflow-hidden border-ok-500/20' : ''}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold tracking-tight text-zinc-100">Turno abierto</h2>
                <p className="mt-0.5 text-sm text-zinc-500">
                  Desde {fmtFecha(turno.fecha_apertura)} · base {fmtPEN(arqueo?.inicial ?? 0)}
                </p>
              </div>
              <span className="chip chip-ok">
                <span className="h-1.5 w-1.5 rounded-full bg-ok-500" />
                Caja abierta
              </span>
            </div>

            <dl className="mt-5 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl bg-surface-800 p-4">
                <dt className="text-xs uppercase tracking-widest text-zinc-500">Efectivo cobrado</dt>
                <dd className="mt-1 text-xl font-bold tabular-nums text-zinc-100">{fmtPEN(arqueo?.ventas ?? 0)}</dd>
              </div>
              <div className="rounded-xl bg-surface-800 p-4">
                <dt className="text-xs uppercase tracking-widest text-zinc-500">Debería haber</dt>
                <dd className="mt-1 text-xl font-bold tabular-nums text-brand-400">
                  {fmtPEN(arqueo?.esperado ?? 0)}
                </dd>
              </div>
              <div className="rounded-xl bg-surface-800 p-4">
                <dt className="text-xs uppercase tracking-widest text-zinc-500">Faltante / sobrante</dt>
                <dd className="mt-1 text-xl font-bold tabular-nums text-zinc-400">
                  {Number.isNaN(montoDeclarado) || !declarado ? '—' : fmtPEN((montoDeclarado || 0) - (arqueo?.esperado ?? 0))}
                </dd>
              </div>
            </dl>

            <div className="mt-6 border-t border-surface-700 pt-5">
              <h3 className="text-sm font-semibold text-zinc-200">Cerrar turno con arqueo</h3>
              <p className="mt-0.5 text-sm text-zinc-500">
                Cuenta el efectivo de la gaveta y decláralo. La diferencia queda registrada.
              </p>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="caja-declarado" className="mb-1.5 block text-sm font-medium text-zinc-300">
                    Efectivo contado
                  </label>
                  <input
                    id="caja-declarado"
                    inputMode="decimal"
                    value={declarado}
                    onChange={(e) => setDeclarado(e.target.value)}
                    placeholder="0.00"
                    className="input text-lg font-semibold tabular-nums"
                  />
                </div>
                <div>
                  <label htmlFor="caja-obs" className="mb-1.5 block text-sm font-medium text-zinc-300">
                    Observaciones (opcional)
                  </label>
                  <input
                    id="caja-obs"
                    value={observaciones}
                    onChange={(e) => setObservaciones(e.target.value)}
                    placeholder="Ej. faltante por cambio de billete"
                    className="input"
                  />
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  data-guia="cerrar-caja"
                  onClick={() => {
                    const falla = errorAlCerrarTurno(montoDeclarado, turno)
                    if (falla) setError(falla)
                    else { setError(null); setConfirmarCierre(true) }
                  }}
                  disabled={guardando || declarado.trim() === ''}
                  className="btn btn-primary min-h-11 px-5"
                >
                  {guardando ? 'Cerrando…' : 'Cerrar turno'}
                </button>
                {declarado.trim() !== '' && !Number.isNaN(montoDeclarado) && arqueo && (
                  <span
                    className={`chip ${(montoDeclarado - arqueo.esperado === 0 ? 'chip-ok' : 'chip-warn')}`}
                  >
                    {(montoDeclarado - arqueo.esperado === 0
                      ? 'Cuadra'
                      : `${montoDeclarado - arqueo.esperado > 0 ? 'Sobrante' : 'Faltante'} ${fmtPEN(Math.abs(montoDeclarado - arqueo.esperado))}`)}
                  </span>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      <div className={`card p-5 sm:p-6 ${adminExperience ? 'order-5' : ''}`}>
        {adminExperience ? <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
          <h2 className="text-base font-semibold text-zinc-100">Historial de turnos</h2>
          <p className="text-xs text-zinc-500">Aperturas, cierres y diferencias registradas</p>
        </div> : <h2 className="titulo-seccion mb-4 text-xs font-semibold">Historial de turnos</h2>}
        {turnos.length === 0 ? (
          <EstadoVacio titulo="Todavía no hay turnos registrados." className="py-8" />
        ) : (
          <>
          <div className={adminExperience ? '-mx-5 hidden overflow-x-auto px-5 sm:mx-0 sm:px-0 md:block' : '-mx-5 overflow-x-auto px-5 sm:mx-0 sm:px-0'}>
            <table className="w-full min-w-[34rem] text-sm">
              <thead>
                <tr className="border-b border-surface-700 text-left text-xs uppercase tracking-widest text-zinc-500">
                  <th scope="col" className="py-2 pr-3 font-semibold">Apertura</th>
                  <th scope="col" className="py-2 pr-3 font-semibold">Cierre</th>
                  <th scope="col" className="py-2 pr-3 text-right font-semibold">Inicial</th>
                  <th scope="col" className="py-2 pr-3 text-right font-semibold">Esperado</th>
                  <th scope="col" className="py-2 pr-3 text-right font-semibold">Declarado</th>
                  <th scope="col" className="py-2 text-right font-semibold">Diferencia</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-700/60">
                {turnos.map((t) => (
                  <tr key={t.id}>
                    <td className="py-2.5 pr-3 text-zinc-300">{fmtFecha(t.fecha_apertura)}</td>
                    <td className="py-2.5 pr-3 text-zinc-500">{t.fecha_cierre ? fmtFecha(t.fecha_cierre) : 'Abierto'}</td>
                    <td className="py-2.5 pr-3 text-right tabular-nums text-zinc-300">{fmtPEN(t.monto_inicial)}</td>
                    <td className="py-2.5 pr-3 text-right tabular-nums text-zinc-300">
                      {t.monto_esperado == null ? '—' : fmtPEN(t.monto_esperado)}
                    </td>
                    <td className="py-2.5 pr-3 text-right tabular-nums text-zinc-300">
                      {t.monto_declarado == null ? '—' : fmtPEN(t.monto_declarado)}
                    </td>
                    <td
                      className={`py-2.5 text-right font-semibold tabular-nums ${
                        t.diferencia == null
                          ? 'text-zinc-500'
                          : t.diferencia === 0
                            ? 'text-ok-500'
                            : 'text-danger-500'
                      }`}
                    >
                      {t.diferencia == null ? '—' : fmtPEN(t.diferencia)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {adminExperience && <ul className="grid gap-3 md:hidden">
            {turnos.map((t) => (
              <li key={t.id} className="rounded-xl border border-surface-800 bg-surface-950/50 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Apertura</p>
                    <p className="mt-1 text-sm font-semibold text-zinc-100">{fmtFecha(t.fecha_apertura)}</p>
                  </div>
                  <span className={`chip ${t.fecha_cierre ? 'chip-neutral' : 'chip-ok'}`}>{t.fecha_cierre ? 'Cerrado' : 'Abierto'}</span>
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-surface-800 pt-3 text-sm">
                  <div><dt className="text-xs text-zinc-500">Cierre</dt><dd className="mt-1 text-zinc-300">{t.fecha_cierre ? fmtFecha(t.fecha_cierre) : 'En curso'}</dd></div>
                  <div><dt className="text-xs text-zinc-500">Inicial</dt><dd className="mt-1 tabular-nums text-zinc-300">{fmtPEN(t.monto_inicial)}</dd></div>
                  <div><dt className="text-xs text-zinc-500">Esperado</dt><dd className="mt-1 tabular-nums text-zinc-300">{t.monto_esperado == null ? '—' : fmtPEN(t.monto_esperado)}</dd></div>
                  <div><dt className="text-xs text-zinc-500">Declarado</dt><dd className="mt-1 tabular-nums text-zinc-300">{t.monto_declarado == null ? '—' : fmtPEN(t.monto_declarado)}</dd></div>
                  <div className="col-span-2"><dt className="text-xs text-zinc-500">Diferencia</dt><dd className={`mt-1 font-semibold tabular-nums ${t.diferencia == null ? 'text-zinc-500' : t.diferencia === 0 ? 'text-ok-500' : 'text-danger-500'}`}>{t.diferencia == null ? '—' : fmtPEN(t.diferencia)}</dd></div>
                </dl>
              </li>
            ))}
          </ul>}
          </>
        )}
      </div>

      {turno && arqueo && confirmarCierre ? (
        <Modal titulo="Confirma el cierre de caja" onCerrar={() => { if (!guardando) setConfirmarCierre(false) }} ancho="max-w-lg">
          <p className="text-sm leading-relaxed text-zinc-300">Revisa el arqueo y las mesas pendientes. La caja se cerrará cuando confirmes.</p>
          <ResumenConfirmacionAccion resumen={confirmarCierreCaja({
            declarado: fmtPEN(montoDeclarado),
            esperado: fmtPEN(arqueo.esperado),
            diferencia: fmtPEN(montoDeclarado - arqueo.esperado),
            mesasPendientes: porCobrar.length,
            totalPendiente: fmtPEN(totalPendiente),
            observaciones: observaciones.trim(),
          })} />
          {error ? <div role="alert" className="aviso mt-4 border-danger-500/40 bg-danger-500/10 text-danger-500">{error}</div> : null}
          {guardando ? <div role="status" aria-live="polite" className="aviso mt-4 border-brand-500/30 bg-brand-500/10 text-brand-300"><Spinner className="mr-2 h-4 w-4 align-middle" />Guardando el arqueo y la auditoría…</div> : null}
          <div className="mt-6 flex flex-wrap justify-end gap-2">
            <button type="button" disabled={guardando} onClick={() => setConfirmarCierre(false)} className="btn btn-outline min-h-11 px-4">Volver a caja</button>
            <button type="button" disabled={guardando || !declarado.trim() || Number.isNaN(montoDeclarado)} onClick={() => void cerrar()} className="btn btn-primary min-h-11 px-4">
              {guardando ? 'Cerrando…' : 'Confirmar cierre de caja'}
            </button>
          </div>
        </Modal>
      ) : null}
    </div>
  )
}
