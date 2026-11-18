import { useCallback, useEffect, useRef, useState } from 'react'
import { getApi } from '../lib/api'
import { fmtFecha } from '../lib/format'
import type { SoporteMensaje, SoporteTicket } from '../types/database'
import { aplicarLecturasMensajesSoporte, idsMensajesSoporteNoLeidos } from '../domain/platform/soporteMensajes'

export default function ConversacionSoporte({ ticket, autorId, superAdmin, onMensajesLeidos }: {
  ticket: SoporteTicket
  autorId: string | null
  superAdmin: boolean
  onMensajesLeidos?: () => Promise<void>
}) {
  const [mensajes, setMensajes] = useState<SoporteMensaje[]>([])
  const [texto, setTexto] = useState('')
  const [cargando, setCargando] = useState(true)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const versionCargaRef = useRef(0)

  const cargar = useCallback(async (marcarAlAbrir = false) => {
    const version = ++versionCargaRef.current
    setCargando(true)
    const api = getApi()
    const res = await api.getMensajesSoporte(ticket.id)
    if (version !== versionCargaRef.current) return
    if (res.error) {
      setError(res.error)
      setCargando(false)
      return
    }

    let filas = res.data ?? []
    let errorFinal: string | null = null

    // Al abrir marcamos únicamente los IDs entrantes observados en esta carga.
    // Un mensaje que llegue después queda sin leer y suma al contador global.
    const idsNoLeidos = marcarAlAbrir && superAdmin && autorId
      ? idsMensajesSoporteNoLeidos(filas)
      : []
    if (idsNoLeidos.length > 0 && autorId) {
      const lectura = await api.marcarMensajesSoporteLeidos(ticket.id, idsNoLeidos)
      if (version !== versionCargaRef.current) return
      if (lectura.error) {
        errorFinal = lectura.error
      } else {
        // Recargar después de marcar trae también cualquier mensaje que haya
        // llegado durante la operación, sin marcarlo como leído por accidente.
        const releida = await api.getMensajesSoporte(ticket.id)
        if (version !== versionCargaRef.current) return
        if (releida.error) {
          errorFinal = releida.error
          setMensajes(aplicarLecturasMensajesSoporte(filas, lectura.data ?? [], autorId))
          setError(errorFinal)
          setCargando(false)
          await onMensajesLeidos?.()
          return
        }
        filas = releida.data ?? []
        await onMensajesLeidos?.()
      }
    }
    if (version !== versionCargaRef.current) return
    setMensajes(filas)
    setError(errorFinal)
    setCargando(false)
  }, [autorId, onMensajesLeidos, superAdmin, ticket.id])

  useEffect(() => {
    void cargar(true)
    if (!superAdmin) return

    let activo = true
    let cancelarRealtime: (() => void) | null = null
    let temporizador: ReturnType<typeof setTimeout> | null = null
    getApi().subscribeSoporteMensajes(() => {
      if (!activo) return
      if (temporizador) clearTimeout(temporizador)
      temporizador = setTimeout(() => void cargar(false), 80)
    }, () => {
      if (activo) setError('La conversación no pudo actualizarse automáticamente.')
    }, ticket.id).then((cancelar) => {
      if (!activo) cancelar()
      else cancelarRealtime = cancelar
    }).catch(() => {
      if (activo) setError('La conversación no pudo activar la actualización en vivo.')
    })

    return () => {
      activo = false
      if (temporizador) clearTimeout(temporizador)
      cancelarRealtime?.()
    }
  }, [cargar, superAdmin, ticket.id])

  useEffect(() => () => {
    versionCargaRef.current++
  }, [])

  async function enviar() {
    if (!autorId || !texto.trim()) return
    setEnviando(true)
    const res = await getApi().enviarMensajeSoporte(ticket.id, autorId, superAdmin, texto)
    setEnviando(false)
    if (res.error) { setError(res.error); return }
    setTexto('')
    await cargar(false)
  }

  const noLeidos = superAdmin ? mensajes.filter((mensaje) => !mensaje.autor_super_admin && mensaje.leido_superadmin_at === null).length : 0

  return (
    <section className="mt-4 border-t border-surface-800 pt-4" aria-label={`Conversación del ticket ${ticket.codigo}`}>
      <h3 className="text-sm font-semibold text-zinc-100">Conversación</h3>
      {superAdmin && mensajes.length > 0 && (
        <p className="mt-1 text-xs text-zinc-400" aria-live="polite">
          {noLeidos === 0 ? 'No hay mensajes pendientes de lectura.' : `${noLeidos} ${noLeidos === 1 ? 'mensaje no leído' : 'mensajes no leídos'} en esta conversación.`}
        </p>
      )}
      {cargando ? <p className="mt-2 text-sm text-zinc-400">Cargando mensajes…</p> :
        mensajes.length === 0 ? <p className="mt-2 text-sm text-zinc-400">Aún no hay respuestas.</p> :
          <ol className="mt-3 max-h-72 space-y-2 overflow-y-auto" aria-live="polite">
            {mensajes.map((m) => <li key={m.id} className="rounded-xl border border-surface-700 bg-surface-800/60 p-3">
              <div className="flex flex-wrap justify-between gap-1 text-xs">
                <strong className={m.autor_super_admin ? 'text-brand-400' : 'text-zinc-200'}>{m.autor_super_admin ? 'Mesora' : 'Restaurante'}</strong>
                <span className="flex items-center gap-2 text-zinc-500">
                  {superAdmin && !m.autor_super_admin && (
                    <span className={m.leido_superadmin_at ? 'text-zinc-500' : 'font-semibold text-brand-400'}>
                      {m.leido_superadmin_at ? 'Leído' : 'No leído'}
                    </span>
                  )}
                  <span>{fmtFecha(m.created_at)}</span>
                </span>
              </div>
              <p className="mt-1 whitespace-pre-wrap break-words text-sm text-zinc-200">{m.mensaje}</p>
            </li>) }
          </ol>}
      {error && <p className="mt-3 text-sm text-danger-500" role="alert">{error}</p>}
      {ticket.estado === 'cerrado' ? <p className="mt-3 text-xs text-zinc-500">Este ticket está cerrado. Abre otra solicitud si necesitas ayuda.</p> :
        <form className="mt-3 space-y-2" onSubmit={(e) => { e.preventDefault(); void enviar() }}>
          <label className="block text-xs font-medium text-zinc-300" htmlFor={`mensaje-${ticket.id}`}>Tu respuesta</label>
          <textarea id={`mensaje-${ticket.id}`} className="input min-h-24" maxLength={2000} required value={texto}
            onChange={(e) => setTexto(e.target.value)} placeholder="Escribe tu respuesta. No compartas contraseñas ni PIN." />
          <button className="btn btn-primary min-h-11 px-4" type="submit" disabled={enviando || !autorId}>
            {enviando ? 'Enviando…' : 'Enviar respuesta'}
          </button>
        </form>}
    </section>
  )
}
