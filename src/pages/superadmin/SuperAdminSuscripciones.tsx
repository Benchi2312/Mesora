import { useCallback, useEffect, useMemo, useState } from 'react'
import { getApi } from '../../lib/api'
import type { AdminRestaurante } from '../../lib/api'
import { fmtFecha } from '../../lib/format'
import { diasParaVencimiento } from '../../domain/restaurant/restaurantes'
import {
  CRITERIOS_SUSCRIPCIONES_VACIOS,
  etiquetaAccion,
  filtrarSuscripciones,
  hayFiltrosSuscripciones,
  nombrePlan,
} from '../../domain/restaurant/suscripciones'
import type { CriteriosSuscripciones } from '../../domain/restaurant/suscripciones'
import type { Plan, Restaurante, SuscripcionHistorial } from '../../types/database'
import { useAuthStore } from '../../store/auth'
import { Spinner } from '../../components/LoadingScreen'
import EstadoVacio from '../../components/EstadoVacio'
import { Campo, Modal, PieAcciones } from '../../components/ui'
import { ChipSuscripcion } from './Chips'

type TipoAccion = 'renovar' | 'cambiar_plan' | 'suspender' | 'reactivar' | 'historial'

/** Fecha (yyyy-mm-dd) para el input type=date, en la zona horaria local. */
function fechaInput(dias: number): string {
  const d = new Date(Date.now() + dias * 86_400_000)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
}

const ESTADOS: { valor: 'todos' | 'activa' | 'por_vencer' | 'vencida' | 'suspendida'; texto: string }[] = [
  { valor: 'todos', texto: 'Estado: todos' },
  { valor: 'activa', texto: 'Estado: activa' },
  { valor: 'por_vencer', texto: 'Estado: por vencer' },
  { valor: 'vencida', texto: 'Estado: vencida' },
  { valor: 'suspendida', texto: 'Estado: suspendida' },
]

export default function SuperAdminSuscripciones() {
  const usuario = useAuthStore((s) => s.usuario)

  const [restaurantes, setRestaurantes] = useState<Restaurante[]>([])
  const [admins, setAdmins] = useState<AdminRestaurante[]>([])
  const [planes, setPlanes] = useState<Plan[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [criterios, setCriterios] = useState<CriteriosSuscripciones>(CRITERIOS_SUSCRIPCIONES_VACIOS)
  const [aviso, setAviso] = useState<string | null>(null)

  const [accion, setAccion] = useState<{ tipo: TipoAccion; r: Restaurante } | null>(null)
  const [fecha, setFecha] = useState('')
  const [planSel, setPlanSel] = useState('')
  const [motivo, setMotivo] = useState('')
  const [errorAccion, setErrorAccion] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const [historial, setHistorial] = useState<SuscripcionHistorial[] | null>(null)
  const [cargandoHistorial, setCargandoHistorial] = useState(false)

  const cargar = useCallback(async () => {
    const api = getApi()
    const [rRes, aRes, pRes] = await Promise.all([
      api.getRestaurantes(),
      api.getAdministradores(),
      api.getPlanes(),
    ])
    if (rRes.error) {
      setError(rRes.error)
      return
    }
    setRestaurantes(rRes.data ?? [])
    setAdmins(aRes.data ?? [])
    setPlanes(pRes.data ?? [])
    setError(null)
  }, [])

  useEffect(() => {
    setCargando(true)
    void cargar().finally(() => setCargando(false))
  }, [cargar])

  const filtrados = useMemo(
    () => filtrarSuscripciones(restaurantes, criterios, admins),
    [restaurantes, criterios, admins],
  )
  const conFiltros = hayFiltrosSuscripciones(criterios)

  function cambiar<K extends keyof CriteriosSuscripciones>(campo: K, valor: CriteriosSuscripciones[K]) {
    setCriterios((c) => ({ ...c, [campo]: valor }))
  }

  async function cargarHistorial(rid: string) {
    setCargandoHistorial(true)
    const res = await getApi().getHistorialSuscripciones(rid)
    setHistorial(res.data ?? [])
    setCargandoHistorial(false)
  }

  function abrir(tipo: TipoAccion, r: Restaurante) {
    setAccion({ tipo, r })
    setErrorAccion(null)
    setAviso(null)
    if (tipo === 'renovar') setFecha(fechaInput(30))
    if (tipo === 'reactivar') setFecha(fechaInput(30))
    if (tipo === 'cambiar_plan') setPlanSel(r.plan_id ?? planes[0]?.id ?? '')
    if (tipo === 'suspender') setMotivo('')
    if (tipo === 'historial') {
      setHistorial(null)
      void cargarHistorial(r.id)
    }
  }

  async function confirmar() {
    if (!accion) return
    const api = getApi()
    const creador = usuario?.id ?? null
    setEnviando(true)
    setErrorAccion(null)

    let res
    if (accion.tipo === 'renovar') {
      if (!fecha) {
        setEnviando(false)
        setErrorAccion('Elige la nueva fecha de vencimiento.')
        return
      }
      res = await api.suscripcionesRenovar(
        accion.r.id,
        new Date(`${fecha}T23:59:59`).toISOString(),
        creador,
      )
    } else if (accion.tipo === 'cambiar_plan') {
      if (!planSel) {
        setEnviando(false)
        setErrorAccion('Elige el plan nuevo.')
        return
      }
      res = await api.suscripcionesCambiarPlan(accion.r.id, planSel, creador)
    } else if (accion.tipo === 'suspender') {
      res = await api.suscripcionesSuspender(accion.r.id, motivo, creador)
    } else {
      res = await api.suscripcionesReactivar(accion.r.id, fecha || null, creador)
    }

    setEnviando(false)
    if (res.error) {
      setErrorAccion(res.error)
      return
    }
    const nombre = accion.r.nombre
    const mensajes: Record<TipoAccion, string> = {
      renovar: `Suscripción de «${nombre}» renovada.`,
      cambiar_plan: `Plan de «${nombre}» actualizado.`,
      suspender: `Suscripción de «${nombre}» suspendida. Sus usuarios quedan bloqueados sin borrar nada.`,
      reactivar: `Suscripción de «${nombre}» reactivada.`,
      historial: '',
    }
    setAccion(null)
    setAviso(mensajes[accion.tipo])
    await cargar()
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
        No se pudieron cargar las suscripciones. {error}
      </div>
    )

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <input
          type="search"
          className="input min-h-11 w-full sm:max-w-xs"
          placeholder="Buscar por nombre, correo o admin…"
          aria-label="Buscar suscripciones"
          value={criterios.busqueda}
          onChange={(e) => cambiar('busqueda', e.target.value)}
        />

        <select
          className="input min-h-11 w-auto"
          aria-label="Filtrar por estado"
          value={criterios.estado}
          onChange={(e) => cambiar('estado', e.target.value as CriteriosSuscripciones['estado'])}
        >
          {ESTADOS.map((e) => (
            <option key={e.valor} value={e.valor}>
              {e.texto}
            </option>
          ))}
        </select>

        <select
          className="input min-h-11 w-auto"
          aria-label="Filtrar por plan"
          value={criterios.plan}
          onChange={(e) => cambiar('plan', e.target.value)}
        >
          <option value="todos">Plan: todos</option>
          {planes.filter((p) => p.activo).map((p) => (
            <option key={p.id} value={p.id}>
              Plan: {p.nombre}
            </option>
          ))}
        </select>

        {conFiltros && (
          <button
            type="button"
            className="btn btn-outline min-h-11 px-4"
            onClick={() => setCriterios(CRITERIOS_SUSCRIPCIONES_VACIOS)}
          >
            Limpiar filtros
          </button>
        )}

        <span className="ml-auto text-xs text-zinc-500" aria-live="polite">
          {filtrados.length} de {restaurantes.length}
        </span>
      </div>

      {aviso && <div className="aviso mb-5 border-ok-500/30 bg-ok-500/10 text-ok-500">{aviso}</div>}

      {planes.length === 0 ? (
        <EstadoVacio
          icono={
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 7h16v3a2 2 0 0 0 0 4v3H4v-3a2 2 0 0 0 0-4z" />
              <path d="M12 7v10" />
            </svg>
          }
          titulo="No hay planes cargados"
          descripcion="El catálogo activo (plan único Mesora Pro) se siembra desde la base de datos."
        />
      ) : restaurantes.length === 0 ? (
        <EstadoVacio
          icono={
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 11h16M4 11V7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
            </svg>
          }
          titulo="Todavía no hay restaurantes"
          descripcion="Da de alta un cliente desde el módulo de restaurantes para gestionar su suscripción."
        />
      ) : filtrados.length === 0 ? (
        <EstadoVacio
          icono={
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4.3-4.3" />
            </svg>
          }
          titulo="Ninguna suscripción coincide con los filtros"
          descripcion="Ajusta los filtros o límpialos para volver a ver toda la lista."
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-surface-800 bg-surface-900 shadow-sm shadow-black/30">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-700 bg-surface-800/60 text-left text-xs uppercase tracking-widest text-zinc-400">
                  <th className="px-4 py-3.5 font-semibold">Restaurante</th>
                  <th className="px-4 py-3.5 font-semibold">Plan</th>
                  <th className="px-4 py-3.5 font-semibold">Estado</th>
                  <th className="hidden px-4 py-3.5 font-semibold md:table-cell">Inicio</th>
                  <th className="px-4 py-3.5 font-semibold">Vencimiento</th>
                  <th className="px-4 py-3.5 font-semibold">
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-800">
                {filtrados.map((r) => {
                  const dias = diasParaVencimiento(r)
                  const vencido = dias !== null && dias < 0
                  return (
                    <tr key={r.id} className="transition-colors hover:bg-surface-800/60">
                      <td className="px-4 py-3.5">
                        <p className="font-semibold text-zinc-100">{r.nombre}</p>
                        {r.email_contacto && <p className="text-xs text-zinc-500">{r.email_contacto}</p>}
                      </td>
                      <td className="px-4 py-3.5 text-zinc-300">{nombrePlan(planes, r.plan_id ?? null)}</td>
                      <td className="px-4 py-3.5">
                        <ChipSuscripcion r={r} />
                      </td>
                      <td className="hidden px-4 py-3.5 text-zinc-400 md:table-cell">
                        {fmtFecha(r.fecha_inicio ?? null)}
                      </td>
                      <td className="px-4 py-3.5 text-zinc-400">
                        {r.fecha_vencimiento ? (
                          <>
                            <p>{fmtFecha(r.fecha_vencimiento)}</p>
                            {dias !== null && (
                              <p
                                className={`text-xs font-medium ${
                                  vencido ? 'text-danger-400' : 'text-warn-400'
                                }`}
                              >
                                {vencido
                                  ? `hace ${Math.abs(dias)} día${Math.abs(dias) === 1 ? '' : 's'}`
                                  : dias === 0
                                    ? 'vence hoy'
                                    : `en ${dias} día${dias === 1 ? '' : 's'}`}
                              </p>
                            )}
                          </>
                        ) : (
                          <span className="text-zinc-600">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex flex-wrap justify-end gap-2">
                          <button
                            type="button"
                            className="btn btn-outline min-h-11 px-3 text-xs"
                            onClick={() => abrir('renovar', r)}
                          >
                            Renovar
                          </button>
                          <button
                            type="button"
                            className="btn btn-outline min-h-11 px-3 text-xs"
                            onClick={() => abrir('cambiar_plan', r)}
                          >
                            Cambiar plan
                          </button>
                          {r.suscripcion_activa ? (
                            <button
                              type="button"
                              className="btn min-h-11 bg-danger-500 px-3 text-xs text-white transition-colors hover:bg-danger-500/90"
                              onClick={() => abrir('suspender', r)}
                            >
                              Suspender
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="btn min-h-11 bg-ok-500 px-3 text-xs text-white transition-colors hover:bg-ok-500/90"
                              onClick={() => abrir('reactivar', r)}
                            >
                              Reactivar
                            </button>
                          )}
                          <button
                            type="button"
                            className="btn btn-outline min-h-11 px-3 text-xs"
                            aria-label={`Ver historial de ${r.nombre}`}
                            onClick={() => abrir('historial', r)}
                          >
                            Historial
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {accion && accion.tipo !== 'historial' && (
        <Modal
          titulo={
            accion.tipo === 'renovar'
              ? 'Renovar suscripción'
              : accion.tipo === 'cambiar_plan'
                ? 'Cambiar de plan'
                : accion.tipo === 'suspender'
                  ? 'Suspender suscripción'
                  : 'Reactivar suscripción'
          }
          onCerrar={() => setAccion(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void confirmar()
            }}
          >
            <p className="mb-5 rounded-xl border border-brand-500/30 bg-brand-500/10 px-4 py-3 text-sm text-brand-300">
              {accion.r.nombre}
              {' · '}
              {nombrePlan(planes, accion.r.plan_id)}
              {' · '}
              Actual: {fmtFecha(accion.r.fecha_vencimiento)}
            </p>

            {(accion.tipo === 'renovar' || accion.tipo === 'reactivar') && (
              <Campo
                etiqueta={
                  accion.tipo === 'renovar'
                    ? 'Nueva fecha de vencimiento'
                    : 'Nuevo vencimiento (opcional — vacío = mantener el actual)'
                }
                htmlFor="s-fecha"
                error={null}
              >
                <input
                  id="s-fecha"
                  type="date"
                  className="input"
                  required={accion.tipo === 'renovar'}
                  value={fecha}
                  onChange={(e) => setFecha(e.target.value)}
                />
              </Campo>
            )}

            {accion.tipo === 'cambiar_plan' && (
              <Campo etiqueta="Plan nuevo" htmlFor="s-plan" error={null}>
                <select
                  id="s-plan"
                  className="input"
                  required
                  value={planSel}
                  onChange={(e) => setPlanSel(e.target.value)}
                >
                  {planes.filter((p) => p.activo).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre}
                      {p.id === accion.r.plan_id ? ' (actual)' : ''}
                    </option>
                  ))}
                </select>
              </Campo>
            )}

            {accion.tipo === 'suspender' && (
              <div className="mb-4 rounded-xl border border-warn-500/30 bg-warn-500/10 px-4 py-3 text-sm text-warn-400">
                Los usuarios de este restaurante quedarán en la pantalla de suscripción
                vencida y no podrán escribir en la app. No se borra ningún dato: fechas,
                plan e historial se conservan.
              </div>
            )}

            {accion.tipo === 'suspender' && (
              <Campo etiqueta="Motivo (opcional, queda en el historial)" htmlFor="s-motivo" error={null}>
                <textarea
                  id="s-motivo"
                  className="input min-h-20"
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Incumplimiento del contrato, pedido del cliente…"
                />
              </Campo>
            )}

            {errorAccion && (
              <div className="aviso border-danger-500/40 bg-danger-500/10 text-danger-500">
                {errorAccion}
              </div>
            )}

            <PieAcciones
              onCancelar={() => setAccion(null)}
              enviando={enviando}
              textoEnvio="Aplicando…"
              labelGuardar={
                accion.tipo === 'renovar'
                  ? 'Renovar'
                  : accion.tipo === 'cambiar_plan'
                    ? 'Cambiar plan'
                    : accion.tipo === 'suspender'
                      ? 'Suspender'
                      : 'Reactivar'
              }
            />
          </form>
        </Modal>
      )}

      {accion && accion.tipo === 'historial' && (
        <Modal titulo={`Historial — ${accion.r.nombre}`} onCerrar={() => setAccion(null)} ancho="max-w-3xl">
          <p className="mb-4 rounded-xl border border-surface-700 bg-surface-800/40 px-4 py-3 text-xs text-zinc-400">
            Registro de solo lectura: cada renovación, cambio de plan, suspensión o
            reactivación queda guardado y no se puede borrar desde la app.
          </p>
          {cargandoHistorial ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : !historial || historial.length === 0 ? (
            <p className="py-4 text-sm text-zinc-500">
              Este restaurante todavía no tiene acciones de suscripción registradas.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-700 text-left text-xs uppercase tracking-widest text-zinc-400">
                    <th className="px-3 py-2.5 font-semibold">Fecha</th>
                    <th className="px-3 py-2.5 font-semibold">Acción</th>
                    <th className="px-3 py-2.5 font-semibold">Plan</th>
                    <th className="hidden px-3 py-2.5 font-semibold sm:table-cell">Plan anterior</th>
                    <th className="hidden px-3 py-2.5 font-semibold md:table-cell">Motivo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-800">
                  {historial.map((h) => (
                    <tr key={h.id}>
                      <td className="px-3 py-2.5 text-zinc-300">{fmtFecha(h.created_at)}</td>
                      <td className="px-3 py-2.5">
                        <span className="rounded-full border border-brand-500/40 bg-brand-500/10 px-2.5 py-1 text-xs font-medium text-brand-300">
                          {etiquetaAccion(h.accion)}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-zinc-300">{nombrePlan(planes, h.plan_id)}</td>
                      <td className="hidden px-3 py-2.5 text-zinc-400 sm:table-cell">
                        {nombrePlan(planes, h.plan_anterior_id)}
                      </td>
                      <td className="hidden px-3 py-2.5 text-zinc-500 md:table-cell">
                        {h.motivo ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Modal>
      )}
    </div>
  )
}
