import { useCallback, useEffect, useState } from 'react'
import { getApi } from '../lib/api'
import { fmtFecha } from '../lib/format'
import type { SoporteMensaje, SoporteTicket } from '../types/database'

export default function ConversacionSoporte({ ticket, autorId, superAdmin }: {
  ticket: SoporteTicket; autorId: string | null; superAdmin: boolean
}) {
  const [mensajes, setMensajes] = useState<SoporteMensaje[]>([])
  const [texto, setTexto] = useState('')
  const [cargando, setCargando] = useState(true)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    const res = await getApi().getMensajesSoporte(ticket.id)
    if (res.error) setError(res.error)
    else { setMensajes(res.data ?? []); setError(null) }
    setCargando(false)
  }, [ticket.id])

  useEffect(() => { void cargar() }, [cargar])

  async function enviar() {
    if (!autorId || !texto.trim()) return
    setEnviando(true)
    const res = await getApi().enviarMensajeSoporte(ticket.id, autorId, superAdmin, texto)
    setEnviando(false)
    if (res.error) { setError(res.error); return }
    setTexto('')
    await cargar()
  }

  return (
    <section className="mt-4 border-t border-surface-800 pt-4" aria-label={`Conversación del ticket ${ticket.codigo}`}>
      <h3 className="text-sm font-semibold text-zinc-100">Conversación</h3>
      {cargando ? <p className="mt-2 text-sm text-zinc-400">Cargando mensajes…</p> :
        mensajes.length === 0 ? <p className="mt-2 text-sm text-zinc-400">Aún no hay respuestas.</p> :
          <ol className="mt-3 max-h-72 space-y-2 overflow-y-auto" aria-live="polite">
            {mensajes.map((m) => <li key={m.id} className="rounded-xl border border-surface-700 bg-surface-800/60 p-3">
              <div className="flex flex-wrap justify-between gap-1 text-xs">
                <strong className={m.autor_super_admin ? 'text-brand-400' : 'text-zinc-200'}>{m.autor_super_admin ? 'Mesora' : 'Restaurante'}</strong>
                <span className="text-zinc-500">{fmtFecha(m.created_at)}</span>
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
