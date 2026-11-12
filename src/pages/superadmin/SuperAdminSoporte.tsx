import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { getApi } from '../../lib/api'
import type { SoporteTicket, TicketEstado, TicketPrioridad, Restaurante } from '../../types/database'
import { fmtFecha } from '../../lib/format'
import {
  CRITERIOS_TICKETS_VACIOS,
  ESTADOS_TICKET,
  PRIORIDADES_TICKET,
  etiquetaEstadoTicket,
  etiquetaPrioridadTicket,
  filtrarTickets,
  hayFiltrosTickets,
  ordenarTickets,
  ticketAbierto,
} from '../../domain/platform/soporte'
import type { CriteriosTickets } from '../../domain/platform/soporte'
import SuperAdminCarga from './SuperAdminCarga'
import EstadoVacio from '../../components/EstadoVacio'
import { Campo, Modal, PieAcciones } from '../../components/ui'
import BandejaComercial from './BandejaComercial'
import { etiquetaTipoTicket } from '../../domain/platform/soporte'
import { useCurrentContext } from '../../lib/useCurrentContext'
import ConversacionSoporte from '../../components/ConversacionSoporte'

const COLOR_PRIORIDAD: Record<TicketPrioridad, string> = {
  baja: 'border-surface-600 bg-surface-800 text-zinc-400',
  media: 'border-sky-500/30 bg-sky-500/10 text-sky-400',
  alta: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
  urgente: 'border-danger-500/40 bg-danger-500/10 text-danger-500',
}

const COLOR_ESTADO: Record<TicketEstado, string> = {
  abierto: 'border-ok-500/30 bg-ok-500/10 text-ok-500',
  en_progreso: 'border-sky-500/30 bg-sky-500/10 text-sky-400',
  resuelto: 'border-brand-500/30 bg-brand-500/10 text-brand-400',
  cerrado: 'border-surface-600 bg-surface-800 text-zinc-400',
}

const ESTADOS_FILTRO: { valor: CriteriosTickets['estado']; texto: string }[] = [
  { valor: 'todos', texto: 'Estado: todos' },
  ...ESTADOS_TICKET.map((e) => ({ valor: e as CriteriosTickets['estado'], texto: `Estado: ${etiquetaEstadoTicket(e)}` })),
]

const PRIORIDADES_FILTRO: { valor: CriteriosTickets['prioridad']; texto: string }[] = [
  { valor: 'todas', texto: 'Prioridad: todas' },
  ...PRIORIDADES_TICKET.map((p) => ({ valor: p as CriteriosTickets['prioridad'], texto: `Prioridad: ${etiquetaPrioridadTicket(p)}` })),
]

type TicketEditando = {
  ticket: SoporteTicket
  estado: TicketEstado
  prioridad: TicketPrioridad
  responsable: string
}

function ResumenSoporte({ etiqueta, valor, alerta = false }: { etiqueta: string; valor: number; alerta?: boolean }) {
  return (
    <div className="card min-w-0 p-4">
      <p className="text-xs font-medium text-zinc-500">{etiqueta}</p>
      <p className={`mt-1 text-2xl font-extrabold ${alerta ? 'text-danger-500' : 'text-zinc-100'}`}>{valor}</p>
    </div>
  )
}

function BandejaTickets() {
  const { usuario } = useCurrentContext()
  const [searchParams] = useSearchParams()
  const ticketQuery = searchParams.get('ticket')
  const busquedaQuery = searchParams.get('busqueda') ?? ''
  const ticketQueryAbierto = useRef<string | null>(null)
  const [tickets, setTickets] = useState<SoporteTicket[]>([])
  const [restaurantes, setRestaurantes] = useState<Restaurante[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [intentoCarga, setIntentoCarga] = useState(0)
  const [criterios, setCriterios] = useState<CriteriosTickets>(() => ({ ...CRITERIOS_TICKETS_VACIOS, busqueda: busquedaQuery }))
  const [aviso, setAviso] = useState<string | null>(null)

  const [editando, setEditando] = useState<TicketEditando | null>(null)
  const [editarError, setEditarError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  const cargar = useCallback(async () => {
    const api = getApi()
    const [tRes, rRes] = await Promise.all([api.getTickets(), api.getRestaurantes()])
    if (tRes.error || rRes.error) {
      setError(tRes.error ?? rRes.error ?? 'Error al cargar el soporte')
      return
    }
    setTickets(tRes.data ?? [])
    setRestaurantes(rRes.data ?? [])
    setError(null)
  }, [])

  useEffect(() => {
    setCargando(true)
    void cargar().catch((e: unknown) => setError(e instanceof Error ? e.message : 'No se pudieron cargar los tickets.')).finally(() => setCargando(false))
  }, [cargar, intentoCarga])

  useEffect(() => {
    if (busquedaQuery) setCriterios((c) => c.busqueda === busquedaQuery ? c : { ...c, busqueda: busquedaQuery })
  }, [busquedaQuery])

  const nombreRestaurante = (rid: string | null) =>
    restaurantes.find((r) => r.id === rid)?.nombre ?? null

  const filtrados = useMemo(
    () => ordenarTickets(filtrarTickets(tickets, criterios, nombreRestaurante)),
    [tickets, criterios],
  )
  const conFiltros = hayFiltrosTickets(criterios)
  const abiertos = tickets.filter((ticket) => ticketAbierto(ticket.estado))
  const urgentes = abiertos.filter((ticket) => ticket.prioridad === 'urgente')
  const enProgreso = tickets.filter((ticket) => ticket.estado === 'en_progreso')
  const sinResponsable = abiertos.filter((ticket) => !ticket.responsable_id && !ticket.responsable?.trim())
  const recientes = [...tickets].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 5)

  function cambiar<K extends keyof CriteriosTickets>(campo: K, valor: CriteriosTickets[K]) {
    setCriterios((c) => ({ ...c, [campo]: valor }))
  }

  function abrirEdicion(t: SoporteTicket) {
    setEditarError(null)
    setEditando({
      ticket: t,
      estado: t.estado,
      prioridad: t.prioridad,
      responsable: t.responsable ?? '',
    })
  }

  useEffect(() => {
    if (cargando || !ticketQuery || ticketQueryAbierto.current === ticketQuery) return
    const coincidencia = tickets.find((ticket) => ticket.id === ticketQuery)
    if (!coincidencia) return
    ticketQueryAbierto.current = ticketQuery
    abrirEdicion(coincidencia)
  }, [cargando, ticketQuery, tickets])

  async function guardarEdicion() {
    if (!editando) return
    setGuardando(true)
    setEditarError(null)
    const res = await getApi().actualizarTicket(editando.ticket.id, {
      estado: editando.estado,
      prioridad: editando.prioridad,
      responsable: editando.responsable,
    })
    setGuardando(false)
    if (res.error) {
      setEditarError(res.error)
      return
    }
    setEditando(null)
    setAviso(`Ticket ${editando.ticket.codigo} actualizado.`)
    await cargar()
  }

  if (cargando) return <SuperAdminCarga recurso="los tickets de soporte" />

  if (error)
    return (
      <div role="alert" className="aviso border-danger-500/40 bg-danger-500/10 text-danger-500">
        <p>No se pudieron cargar los tickets. {error}</p>
        <button type="button" onClick={() => { setError(null); setCargando(true); setIntentoCarga((n) => n + 1) }} className="btn btn-outline mt-3 min-h-11 px-4">Reintentar</button>
      </div>
    )

  return (
    <div>
      <section className="mb-6" aria-labelledby="resumen-soporte-titulo">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 id="resumen-soporte-titulo" className="text-sm font-bold uppercase tracking-widest text-zinc-300">Estado de soporte</h2>
            <p className="mt-1 text-xs text-zinc-500">Vista general de los tickets recibidos por los restaurantes.</p>
          </div>
          <span className="text-xs text-zinc-500">{tickets.length} tickets registrados</span>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <ResumenSoporte etiqueta="Abiertos" valor={abiertos.length} />
          <ResumenSoporte etiqueta="Urgentes abiertos" valor={urgentes.length} alerta={urgentes.length > 0} />
          <ResumenSoporte etiqueta="En progreso" valor={enProgreso.length} />
          <ResumenSoporte etiqueta="Sin responsable" valor={sinResponsable.length} alerta={sinResponsable.length > 0} />
        </div>
        {recientes.length > 0 && <div className="mt-4 rounded-xl border border-surface-800 p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Tickets recientes</h3>
          <ul className="mt-2 divide-y divide-surface-800">
            {recientes.map((ticket) => <li key={ticket.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-zinc-200">{ticket.codigo} · {ticket.asunto}</p>
                <p className="text-xs text-zinc-500">{nombreRestaurante(ticket.restaurante_id) ?? 'Sin restaurante'} · {fmtFecha(ticket.created_at)}</p>
              </div>
              <button type="button" onClick={() => abrirEdicion(ticket)} className="btn btn-outline min-h-10 px-3 text-xs">Abrir</button>
            </li>)}
          </ul>
        </div>}
      </section>
      <div className="sa-controls mb-5 flex flex-wrap items-center gap-3">
        <input
          type="search"
          className="input min-h-11 w-full sm:max-w-xs"
          placeholder="Buscar por código, asunto o responsable…"
          aria-label="Buscar tickets"
          value={criterios.busqueda}
          onChange={(e) => cambiar('busqueda', e.target.value)}
        />

        <select
          className="input min-h-11 w-auto"
          aria-label="Filtrar por estado"
          value={criterios.estado}
          onChange={(e) => cambiar('estado', e.target.value as CriteriosTickets['estado'])}
        >
          {ESTADOS_FILTRO.map((e) => (
            <option key={e.valor} value={e.valor}>
              {e.texto}
            </option>
          ))}
        </select>

        <select
          className="input min-h-11 w-auto"
          aria-label="Filtrar por prioridad"
          value={criterios.prioridad}
          onChange={(e) => cambiar('prioridad', e.target.value as CriteriosTickets['prioridad'])}
        >
          {PRIORIDADES_FILTRO.map((p) => (
            <option key={p.valor} value={p.valor}>
              {p.texto}
            </option>
          ))}
        </select>

        <select
          className="input min-h-11 w-auto"
          aria-label="Filtrar por restaurante"
          value={criterios.restaurante}
          onChange={(e) => cambiar('restaurante', e.target.value)}
        >
          <option value="todos">Restaurante: todos</option>
          <option value="sin">Restaurante: sin asignar</option>
          {restaurantes.map((r) => (
            <option key={r.id} value={r.id}>
              Restaurante: {r.nombre}
            </option>
          ))}
        </select>

        {conFiltros && (
          <button
            type="button"
            className="btn btn-outline min-h-11 px-4"
            onClick={() => setCriterios(CRITERIOS_TICKETS_VACIOS)}
          >
            Limpiar filtros
          </button>
        )}

        <span className="ml-auto text-xs text-zinc-500" aria-live="polite">
          {filtrados.length} de {tickets.length}
        </span>
      </div>

      {aviso && <div className="aviso mb-5 border-ok-500/30 bg-ok-500/10 text-ok-500">{aviso}</div>}

      {tickets.length === 0 ? (
        <EstadoVacio
          titulo="No hay tickets todavía"
          descripcion="Acá aparecen las incidencias que reportan los administradores de cada restaurante."
        />
      ) : filtrados.length === 0 ? (
        <EstadoVacio
          titulo="Ningún ticket coincide con los filtros"
          descripcion="Ajustá los filtros o límpialos para ver todos los tickets."
        />
      ) : (
        <div className="sa-table-shell overflow-hidden rounded-2xl border border-surface-800 bg-surface-900 shadow-sm shadow-black/30">
          <div className="sa-table-scroll overflow-x-auto">
            <table className="sa-mobile-table sa-table-soporte w-full text-sm">
              <thead>
                <tr className="border-b border-surface-700 bg-surface-800/60 text-left text-xs uppercase tracking-widest text-zinc-400">
                  <th className="px-4 py-3.5 font-semibold">Código</th>
                  <th className="px-4 py-3.5 font-semibold">Asunto</th>
                  <th className="px-4 py-3.5 font-semibold">Restaurante</th>
                  <th className="px-4 py-3.5 font-semibold">Prioridad</th>
                  <th className="px-4 py-3.5 font-semibold">Estado</th>
                  <th className="hidden px-4 py-3.5 font-semibold md:table-cell">Responsable</th>
                  <th className="hidden px-4 py-3.5 font-semibold lg:table-cell">Fecha</th>
                  <th className="px-4 py-3.5 font-semibold">
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-800">
                {filtrados.map((t) => (
                  <tr key={t.id} className="transition-colors hover:bg-surface-800/60">
                    <td className="px-4 py-3.5 font-mono text-xs font-semibold text-brand-400">
                      {t.codigo}
                    </td>
                    <td className="px-4 py-3.5">
                      <p className="font-semibold text-zinc-100">{t.asunto}</p>
                      <p className="max-w-xs truncate text-xs text-zinc-500">{etiquetaTipoTicket(t.tipo ?? 'error')} · {t.descripcion}</p>
                    </td>
                    <td className="px-4 py-3.5 text-zinc-300">
                      {nombreRestaurante(t.restaurante_id) ?? '—'}
                    </td>
                    <td className="px-4 py-3.5">
                      <span
                        className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-semibold ${COLOR_PRIORIDAD[t.prioridad]}`}
                      >
                        {etiquetaPrioridadTicket(t.prioridad)}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span
                        className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-semibold ${COLOR_ESTADO[t.estado]}`}
                      >
                        {etiquetaEstadoTicket(t.estado)}
                      </span>
                    </td>
                    <td className="hidden px-4 py-3.5 text-zinc-300 md:table-cell">
                      {t.responsable ?? '—'}
                    </td>
                    <td className="hidden px-4 py-3.5 text-zinc-400 lg:table-cell">
                      {fmtFecha(t.created_at)}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex justify-end">
                        <button
                          type="button"
                          className="btn btn-outline min-h-11 px-3 text-xs"
                          onClick={() => abrirEdicion(t)}
                        >
                          {ticketAbierto(t.estado) ? 'Editar' : 'Ver'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {editando && (
        <Modal titulo={`Ticket ${editando.ticket.codigo}`} onCerrar={() => setEditando(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void guardarEdicion()
            }}
          >
            <div className="mb-4 rounded-xl bg-surface-800/60 px-4 py-3">
              <p className="text-sm font-semibold text-zinc-100">{editando.ticket.asunto}</p>
              <p className="mt-1 text-xs leading-relaxed text-zinc-400">
                {editando.ticket.descripcion} · {nombreRestaurante(editando.ticket.restaurante_id) ?? 'Sin restaurante'}
              </p>
            </div>

            <Campo etiqueta="Estado" htmlFor="tk-estado" error={null}>
              <select
                id="tk-estado"
                className="input"
                required
                value={editando.estado}
                onChange={(e) =>
                  setEditando((ed) => ({ ...ed!, estado: e.target.value as TicketEstado }))
                }
              >
                {ESTADOS_TICKET.map((es) => (
                  <option key={es} value={es}>
                    {etiquetaEstadoTicket(es)}
                  </option>
                ))}
              </select>
            </Campo>

            <Campo etiqueta="Prioridad" htmlFor="tk-prio2" error={null}>
              <select
                id="tk-prio2"
                className="input"
                required
                value={editando.prioridad}
                onChange={(e) =>
                  setEditando((ed) => ({ ...ed!, prioridad: e.target.value as TicketPrioridad }))
                }
              >
                {PRIORIDADES_TICKET.map((p) => (
                  <option key={p} value={p}>
                    {etiquetaPrioridadTicket(p)}
                  </option>
                ))}
              </select>
            </Campo>

            <Campo etiqueta="Responsable" htmlFor="tk-resp" error={null}>
              <input
                id="tk-resp"
                className="input"
                maxLength={120}
                placeholder="Quién quedó a cargo (opcional)"
                value={editando.responsable}
                onChange={(e) => setEditando((ed) => ({ ...ed!, responsable: e.target.value }))}
              />
            </Campo>

            {editarError && (
              <div className="aviso mt-4 border-danger-500/40 bg-danger-500/10 text-danger-500">
                {editarError}
              </div>
            )}

            <PieAcciones
              onCancelar={() => setEditando(null)}
              enviando={guardando}
              textoEnvio="Guardando…"
              labelGuardar="Guardar cambios"
            />
          </form>
          <ConversacionSoporte ticket={editando.ticket} autorId={usuario?.id ?? null} superAdmin />
        </Modal>
      )}
    </div>
  )
}

export default function SuperAdminSoporte() {
  const [seccion, setSeccion] = useState<'tickets' | 'comercial'>('tickets')
  return (
    <div>
      <div className="mb-6 flex flex-wrap gap-2" role="tablist" aria-label="Bandejas de Mesora">
        <button type="button" role="tab" aria-selected={seccion === 'tickets'}
          className={`btn min-h-11 px-4 ${seccion === 'tickets' ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setSeccion('tickets')}>Soporte de restaurantes</button>
        <button type="button" role="tab" aria-selected={seccion === 'comercial'}
          className={`btn min-h-11 px-4 ${seccion === 'comercial' ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setSeccion('comercial')}>Consultas comerciales</button>
      </div>
      {seccion === 'tickets' ? <BandejaTickets /> : <BandejaComercial />}
    </div>
  )
}
