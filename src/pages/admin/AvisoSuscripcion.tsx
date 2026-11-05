import { useEffect, useState } from 'react'
import { useCurrentContext } from '../../lib/useCurrentContext'

const DIA = 86_400_000

function tiempoRestante(milisegundos: number): string {
  if (milisegundos <= 0) return 'El plazo terminó'
  if (milisegundos > DIA) {
    const dias = Math.ceil(milisegundos / DIA)
    return `${dias} día${dias === 1 ? '' : 's'}`
  }
  const totalMinutos = Math.max(1, Math.ceil(milisegundos / 60_000))
  const horas = Math.floor(totalMinutos / 60)
  const minutos = totalMinutos % 60
  return horas ? `${horas} h${minutos ? ` ${minutos} min` : ''}` : `${minutos} min`
}

export default function AvisoSuscripcion() {
  const { restaurante } = useCurrentContext()
  const [ahora, setAhora] = useState(Date.now)

  useEffect(() => {
    const timer = window.setInterval(() => setAhora(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  const fecha = restaurante?.fecha_vencimiento
  if (!restaurante || !restaurante.suscripcion_activa) return null
  if (!fecha) return (
    <section aria-label="Estado de la suscripción" className="mb-6 rounded-2xl border border-surface-700 bg-surface-900 px-4 py-4 sm:px-5">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-zinc-400">Suscripción activa</p>
      <p className="mt-1 text-sm text-zinc-200">Tu restaurante puede operar. No hay una fecha de vencimiento programada.</p>
    </section>
  )
  const vence = new Date(fecha).getTime()
  if (!Number.isFinite(vence)) return null
  const restante = vence - ahora
  if (restante <= 0) return null // ProtectedRoute mostrará el bloqueo.
  const urgente = restante <= DIA
  const pronto = restante <= 7 * DIA
  const aviso = restante <= 30 * DIA
  const fechaTexto = new Intl.DateTimeFormat('es-PE', {
    timeZone: 'America/Lima', day: '2-digit', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(vence))
  const asunto = encodeURIComponent(`Renovación de Mesora · ${restaurante.nombre}`)

  return (
    <section aria-label="Estado de la suscripción" role={aviso ? 'status' : undefined}
      className={`mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border px-4 py-4 sm:px-5 ${
        urgente ? 'border-red-500/35 bg-red-500/10'
          : pronto ? 'border-amber-500/35 bg-amber-500/10'
            : aviso ? 'border-brand-500/30 bg-brand-500/10'
              : 'border-surface-700 bg-surface-900'
      }`}>
      <div>
        <p className={`text-xs font-bold uppercase tracking-[0.14em] ${urgente ? 'text-red-300' : aviso ? 'text-brand-300' : 'text-zinc-400'}`}>
          {urgente ? 'Último día de suscripción' : aviso ? 'Aviso de renovación' : 'Suscripción activa'}
        </p>
        <p className="mt-1 text-sm text-zinc-200">
          {aviso ? 'Renueva para que tu equipo siga operando sin interrupciones.' : 'Tu restaurante puede operar con normalidad.'}
          {' '}Vence el <time dateTime={fecha} className="font-semibold">{fechaTexto}</time> (hora de Perú).
        </p>
      </div>
      <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto">
        <span className={`rounded-xl px-3 py-2 text-sm font-bold ${urgente ? 'bg-red-500/15 text-red-200' : 'bg-surface-800 text-zinc-100'}`}>
          Quedan {tiempoRestante(restante)}
        </span>
        {aviso && <a className="btn btn-outline min-h-10 px-3 text-sm" href={`mailto:mesoratech@gmail.com?subject=${asunto}`}>
          Consultar renovación
        </a>}
      </div>
    </section>
  )
}
