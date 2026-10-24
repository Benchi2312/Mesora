import { useCallback, useEffect, useRef, useState } from 'react'
import { getApi } from '../../lib/api'
import { useCurrentContext } from '../../lib/useCurrentContext'
import { fmtHora, fmtPEN } from '../../lib/format'
import { METODOS_PAGO_LABEL } from '../../lib/pagos'
import { MOTIVOS_ANULACION_COBRO, errorAlAnularCobro } from '../../lib/autorizacion'
import type { Cuenta } from '../../types/database'
import { Spinner } from '../../components/LoadingScreen'
import EstadoVacio from '../../components/EstadoVacio'
import { IconoInfo, Modal } from '../../components/ui'
import { CampoPin, usePinAutorizacion } from '../../components/pin'

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
export default function CobrosTab() {
  const { restaurante } = useCurrentContext()
  const rid = restaurante?.id
  const [cuentas, setCuentas] = useState<Cuenta[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [anulando, setAnulando] = useState<Cuenta | null>(null)
  const [flash, setFlash] = useState<string | null>(null)

  const cargar = useCallback(
    async (silencioso = false) => {
      if (!rid) return
      if (!silencioso) setCargando(true)
      const { data, error: apiErr } = await getApi().getCuentasDelDia(rid)
      if (apiErr) setError(apiErr)
      else {
        setCuentas(data ?? [])
        setError(null)
      }
      setCargando(false)
    },
    [rid],
  )

  useEffect(() => {
    void cargar()
  }, [cargar])

  const anuladas = cuentas.filter((c) => c.estado === 'anulada')
  const vigentes = cuentas.filter((c) => c.estado === 'pagada')

  return (
    <div className="space-y-5">
      <div className="aviso border-brand-500/30 bg-brand-500/10 text-brand-300">
        <span className="flex items-start gap-2.5">
          <IconoInfo className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Anular un cobro devuelve el dinero y lo saca de las ventas del mes. Queda registrado quién lo anuló y
            por qué, y el efectivo devuelto descuenta del arqueo del turno.
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

      <div className="card p-5 sm:p-6">
        <h2 className="titulo-seccion mb-4 text-xs font-semibold">Boletas de hoy</h2>
        {cargando ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : cuentas.length === 0 ? (
          <EstadoVacio titulo="Todavía no se cobró nada hoy." className="py-8" />
        ) : (
          <div className="-mx-5 overflow-x-auto px-5 sm:mx-0 sm:px-0">
            <table className="w-full min-w-[36rem] text-sm">
              <thead>
                <tr className="border-b border-surface-700 text-left text-xs uppercase tracking-widest text-zinc-500">
                  <th scope="col" className="py-2 pr-3 font-semibold">Hora</th>
                  <th scope="col" className="py-2 pr-3 font-semibold">Método</th>
                  <th scope="col" className="py-2 pr-3 text-right font-semibold">Total</th>
                  <th scope="col" className="py-2 pr-3 font-semibold">Estado</th>
                  <th scope="col" className="py-2 text-right font-semibold">
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-700/60">
                {[...vigentes, ...anuladas].map((c) => (
                  <tr key={c.id} className={c.estado === 'anulada' ? 'opacity-60' : undefined}>
                    <td className="py-2.5 pr-3 text-zinc-300">{c.pagado_at ? fmtHora(c.pagado_at) : '—'}</td>
                    <td className="py-2.5 pr-3 text-zinc-400">
                      {METODOS_PAGO_LABEL[c.metodo_pago] ?? c.metodo_pago}
                      {c.propina ? <span className="text-xs text-zinc-500"> + {fmtPEN(c.propina)} propina</span> : null}
                    </td>
                    <td className="py-2.5 pr-3 text-right font-semibold tabular-nums text-zinc-100">
                      {fmtPEN(c.total)}
                    </td>
                    <td className="py-2.5 pr-3">
                      {c.estado === 'anulada' ? (
                        <span className="chip chip-danger" title={c.motivo_anulacion ?? undefined}>
                          Anulada
                        </span>
                      ) : (
                        <span className="chip chip-ok">Cobrada</span>
                      )}
                      {c.estado === 'anulada' && c.motivo_anulacion ? (
                        <p className="mt-1 max-w-[18rem] text-xs text-zinc-500">{c.motivo_anulacion}</p>
                      ) : null}
                    </td>
                    <td className="py-2.5 text-right">
                      {c.estado === 'pagada' ? (
                        <button
                          type="button"
                          onClick={() => {
                            setFlash(null)
                            setAnulando(c)
                          }}
                          className="btn btn-danger-ghost min-h-11 px-3"
                        >
                          Anular
                        </button>
                      ) : (
                        <span className="text-xs text-zinc-500">
                          {c.monto_reembolsado != null ? `devuelto ${fmtPEN(c.monto_reembolsado)}` : ''}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
  const { pin, setPin, requierePin } = usePinAutorizacion(rid)
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
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
    if (res.error) return setError(res.error)
    await onAnulada(`Se anuló la boleta de ${fmtPEN(cuenta.total)}. Devuelve ${fmtPEN(res.data?.monto_reembolsado ?? cuenta.total)}.`)
  }

  return (
    <Modal titulo="Anular cobro" onCerrar={onCerrar} ancho="max-w-sm">
      <p className="text-sm leading-relaxed text-zinc-300">
        La boleta de <strong className="text-zinc-100">{fmtPEN(cuenta.total)}</strong> queda anulada: sale de las
        ventas del mes y el efectivo devuelto descuenta del arqueo de la gaveta. No se borra.
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

      {requierePin ? <CampoPin pin={pin} onChange={setPin} /> : null}

      {error && (
        <div className="aviso mt-4 border-danger-500/40 bg-danger-500/10 text-danger-500">{error}</div>
      )}

      <div className="mt-6 flex flex-wrap justify-end gap-2">
        <button type="button" onClick={onCerrar} className="btn btn-outline min-h-11 px-4">
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => void confirmar()}
          disabled={enviando || (requierePin && pin.length === 0)}
          className="btn min-h-11 bg-danger-500 px-4 text-white transition-colors hover:bg-danger-500/90"
        >
          {enviando ? 'Anulando…' : 'Anular cobro'}
        </button>
      </div>
    </Modal>
  )
}
