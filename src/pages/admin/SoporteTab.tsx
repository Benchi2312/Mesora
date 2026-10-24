import { useCallback, useEffect, useState } from 'react'
import { useCurrentContext } from '../../lib/useCurrentContext'
import { getApi } from '../../lib/api'
import type { SoporteTicket, TicketPrioridad } from '../../types/database'
import { fmtFecha } from '../../lib/format'
import {
  PRIORIDADES_TICKET,
  etiquetaEstadoTicket,
  etiquetaPrioridadTicket,
  ticketAbierto,
} from '../../lib/soporte'
import { Spinner } from '../../components/LoadingScreen'
import EstadoVacio from '../../components/EstadoVacio'
import { Campo, IconoInfo, IconoMas, Modal, PieAcciones } from '../../components/ui'

const COLOR_PRIORIDAD: Record<TicketPrioridad, string> = {
  baja: 'border-surface-600 bg-surface-800 text-zinc-400',
  media: 'border-sky-500/30 bg-sky-500/10 text-sky-400',
  alta: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
  urgente: 'border-danger-500/40 bg-danger-500/10 text-danger-500',
}

const COLOR_ESTADO: Record<SoporteTicket['estado'], string> = {
  abierto: 'border-ok-500/30 bg-ok-500/10 text-ok-500',
  en_progreso: 'border-sky-500/30 bg-sky-500/10 text-sky-400',
  resuelto: 'border-brand-500/30 bg-brand-500/10 text-brand-400',
  cerrado: 'border-surface-600 bg-surface-800 text-zinc-400',
}

type FormTicket = { asunto: string; descripcion: string; prioridad: TicketPrioridad }

const FORM_VACIO: FormTicket = { asunto: '', descripcion: '', prioridad: 'media' }

/**
 * Soporte del restaurante: el admin reporta incidencias a la plataforma y sigue
 * su estado. Solo lectura de los tickets propios (el super admin es quien los
 * gestiona). La escritura la resuelve la API/policies por restaurante.
 */
export default function SoporteTab() {
  const { restaurante, usuario } = useCurrentContext()
  const rid = restaurante?.id
  const yoId = usuario?.id ?? null

  const [tickets, setTickets] = useState<SoporteTicket[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const [modal, setModal] = useState(false)
  const [form, setForm] = useState<FormTicket>(FORM_VACIO)
  const [formError, setFormError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const cargar = useCallback(async () => {
    const { data, error: apiErr } = await getApi().getTickets()
    if (apiErr) {
      setError(apiErr)
      return
    }
    setTickets(data ?? [])
    setError(null)
  }, [])

  useEffect(() => {
    setCargando(true)
    void cargar().finally(() => setCargando(false))
  }, [cargar])

  function abrirNuevo() {
    setForm(FORM_VACIO)
    setFormError(null)
    setModal(true)
  }

  async function reportar() {
    if (!rid) return
    setFormError(null)
    setEnviando(true)
    const res = await getApi().crearTicket({
      restauranteId: rid,
      usuarioId: yoId,
      asunto: form.asunto,
      descripcion: form.descripcion,
      prioridad: form.prioridad,
    })
    setEnviando(false)
    if (res.error) {
      setFormError(res.error)
      return
    }
    setModal(false)
    setAviso(`Incidencia ${res.data?.codigo} reportada. Nuestro equipo le dará seguimiento.`)
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
        No se pudo cargar el soporte. {error}
      </div>
    )

  return (
    <div>
      <div className="aviso mb-5 border-brand-500/30 bg-brand-500/10 text-brand-300">
        <span className="flex items-start gap-2.5">
          <IconoInfo className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            ¿Algo no funciona o necesitas un cambio? Reporta la incidencia acá y el equipo de Mesora la
            atenderá. Vas a poder seguir su estado desde esta sección.
          </span>
        </span>
      </div>

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-zinc-100">Soporte</h2>
          <p className="mt-0.5 text-sm text-zinc-500">
            {tickets.length === 0
              ? 'Aún no reportaste ninguna incidencia.'
              : `${tickets.filter((t) => ticketAbierto(t.estado)).length} de ${tickets.length} siguen abiertas.`}
          </p>
        </div>
        <button type="button" onClick={abrirNuevo} className="btn btn-primary min-h-11 px-4">
          <IconoMas />
          Reportar incidencia
        </button>
      </div>

      {aviso && <div className="aviso mb-5 border-ok-500/30 bg-ok-500/10 text-ok-500">{aviso}</div>}

      {tickets.length === 0 ? (
        <EstadoVacio
          titulo="No hay incidencias reportadas"
          descripcion="Cuando algo necesite la ayuda del equipo de Mesora, repórtalo y aparecerá acá con su estado."
        />
      ) : (
        <ul className="card divide-y divide-zinc-800/70 p-0 sm:p-0">
          {tickets.map((t) => (
            <li key={t.id} className="px-4 py-3.5 sm:px-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs font-semibold text-brand-400">{t.codigo}</span>
                <span
                  className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-semibold ${COLOR_PRIORIDAD[t.prioridad]}`}
                >
                  {etiquetaPrioridadTicket(t.prioridad)}
                </span>
                <span
                  className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-semibold ${COLOR_ESTADO[t.estado]}`}
                >
                  {etiquetaEstadoTicket(t.estado)}
                </span>
                <span className="ml-auto text-xs text-zinc-500">{fmtFecha(t.created_at)}</span>
              </div>
              <p className="mt-2 text-sm font-semibold text-zinc-100">{t.asunto}</p>
              <p className="mt-0.5 text-sm leading-relaxed text-zinc-400">{t.descripcion}</p>
              {t.responsable && (
                <p className="mt-1 text-xs text-zinc-500">Atiende: {t.responsable}</p>
              )}
            </li>
          ))}
        </ul>
      )}

      {modal && (
        <Modal titulo="Reportar incidencia" onCerrar={() => setModal(false)}>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void reportar()
            }}
          >
            <Campo etiqueta="Asunto" htmlFor="sop-asunto" error={null}>
              <input
                id="sop-asunto"
                className="input"
                required
                maxLength={120}
                placeholder="Ej. La boleta no imprime el RUC"
                value={form.asunto}
                onChange={(e) => setForm((f) => ({ ...f, asunto: e.target.value }))}
              />
            </Campo>

            <Campo etiqueta="Descripción" htmlFor="sop-desc" error={null}>
              <textarea
                id="sop-desc"
                className="input min-h-28"
                required
                maxLength={2000}
                placeholder="Cuéntanos qué pasó, dónde y desde cuándo."
                value={form.descripcion}
                onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
              />
            </Campo>

            <Campo etiqueta="Prioridad" htmlFor="sop-prio" error={null}>
              <select
                id="sop-prio"
                className="input"
                value={form.prioridad}
                onChange={(e) => setForm((f) => ({ ...f, prioridad: e.target.value as TicketPrioridad }))}
              >
                {PRIORIDADES_TICKET.map((p) => (
                  <option key={p} value={p}>
                    {etiquetaPrioridadTicket(p)}
                  </option>
                ))}
              </select>
            </Campo>

            {formError && (
              <div className="aviso mb-4 border-danger-500/40 bg-danger-500/10 text-danger-500">{formError}</div>
            )}

            <PieAcciones
              onCancelar={() => setModal(false)}
              enviando={enviando}
              textoEnvio="Enviando…"
              labelGuardar="Reportar"
            />
          </form>
        </Modal>
      )}
    </div>
  )
}
