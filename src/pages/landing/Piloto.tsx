import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { IconArrowRight } from './Icons'
import SectionHeading from './SectionHeading'
import { useLandingConfig } from './useLandingConfig'

export default function Piloto() {
  const { correo, telefono } = useLandingConfig()
  const [enviado, setEnviado] = useState(false)

  function solicitarPiloto(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!correo) return
    const form = new FormData(event.currentTarget)
    const asunto = `Información del piloto Mesora — ${form.get('restaurante')}`
    const cuerpo = [
      `Nombre: ${form.get('nombre')}`,
      `Restaurante: ${form.get('restaurante')}`,
      `Correo de contacto: ${form.get('email')}`,
      '',
      String(form.get('mensaje') || 'Quiero recibir información sobre el piloto de Mesora.'),
    ].join('\n')
    window.location.href = `mailto:${correo}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo)}`
    setEnviado(true)
  }

  return (
    <section id="piloto" className="scroll-mt-16 border-y border-white/5 bg-gradient-to-b from-surface-900/70 to-surface-950">
      <div className="mx-auto grid w-full max-w-7xl gap-12 px-4 py-24 sm:px-6 lg:grid-cols-[0.9fr_1.1fr]">
        <div>
          <SectionHeading
            align="left"
            eyebrow="Piloto Mesora"
            title="Conversemos sobre tu operación"
            subtitle="Cuéntanos qué tipo de local tienes y qué te gustaría ordenar. Revisaremos juntos el alcance antes de iniciar."
          />
          <div className="mt-7 space-y-3 text-sm text-zinc-400">
            <p>El piloto conserva el sistema de facturación electrónica que ya utiliza el restaurante.</p>
            {correo && <p>Contacto: <a className="font-medium text-brand-400 hover:text-brand-300" href={`mailto:${correo}`}>{correo}</a></p>}
            {telefono && <p>Teléfono de contacto: <a className="font-medium text-brand-400 hover:text-brand-300" href={`tel:${telefono.replace(/[^+\d]/g, '')}`}>{telefono}</a></p>}
          </div>
          <Link to="/demo" className="mt-7 inline-flex items-center gap-2 text-sm font-semibold text-brand-400 hover:text-brand-300">
            También puedes explorar la demo <IconArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="rounded-3xl border border-surface-700 bg-surface-900 p-6 shadow-2xl shadow-black/30 sm:p-8">
          {correo ? (
            <form onSubmit={solicitarPiloto} className="space-y-4">
              <div>
                <label htmlFor="piloto-nombre" className="mb-1.5 block text-sm font-medium text-zinc-300">Tu nombre</label>
                <input id="piloto-nombre" name="nombre" autoComplete="name" required maxLength={100} className="w-full rounded-xl border border-surface-700 bg-surface-950 px-4 py-3 text-white outline-none transition focus:border-brand-500" />
              </div>
              <div>
                <label htmlFor="piloto-restaurante" className="mb-1.5 block text-sm font-medium text-zinc-300">Nombre del restaurante</label>
                <input id="piloto-restaurante" name="restaurante" required maxLength={120} className="w-full rounded-xl border border-surface-700 bg-surface-950 px-4 py-3 text-white outline-none transition focus:border-brand-500" />
              </div>
              <div>
                <label htmlFor="piloto-email" className="mb-1.5 block text-sm font-medium text-zinc-300">Correo para responderte</label>
                <input id="piloto-email" name="email" type="email" autoComplete="email" required maxLength={160} className="w-full rounded-xl border border-surface-700 bg-surface-950 px-4 py-3 text-white outline-none transition focus:border-brand-500" />
              </div>
              <div>
                <label htmlFor="piloto-mensaje" className="mb-1.5 block text-sm font-medium text-zinc-300">¿Qué te gustaría mejorar?</label>
                <textarea id="piloto-mensaje" name="mensaje" rows={3} maxLength={1000} className="w-full resize-y rounded-xl border border-surface-700 bg-surface-950 px-4 py-3 text-white outline-none transition focus:border-brand-500" />
              </div>
              <button type="submit" className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 px-6 py-3.5 font-bold text-surface-950 transition hover:bg-brand-400">
                Preparar correo de solicitud <IconArrowRight className="h-5 w-5" />
              </button>
              <p className="text-center text-xs leading-relaxed text-zinc-500">Se abrirá tu aplicación de correo con el mensaje listo para revisar y enviar.</p>
              {enviado && <p role="status" className="text-center text-sm text-ok-500">Revisa la aplicación de correo para completar el envío.</p>}
            </form>
          ) : (
            <div className="flex h-full min-h-64 flex-col items-center justify-center text-center">
              <p className="text-lg font-bold text-white">El contacto para pilotos aún no está configurado.</p>
              <p className="mt-2 max-w-sm text-sm leading-relaxed text-zinc-400">Puedes recorrer las funciones del sistema mientras se publica el correo de contacto desde la configuración de Mesora.</p>
              <Link to="/demo" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-brand-500 px-5 py-3 font-bold text-surface-950 hover:bg-brand-400">
                Explorar demo <IconArrowRight className="h-4 w-4" />
              </Link>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
