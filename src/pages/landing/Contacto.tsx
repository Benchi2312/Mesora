import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { IconArrowRight } from './Icons'
import SectionHeading from './SectionHeading'
import { useLandingConfig } from './useLandingConfig'

export default function Contacto() {
  const { correo, telefono } = useLandingConfig()
  const [enviado, setEnviado] = useState(false)
  const correoTemporal = correo?.toLowerCase().endsWith('.invalid') ?? false

  function solicitarDemo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!correo || correoTemporal) return
    const form = new FormData(event.currentTarget)
    const asunto = `Demostración de Mesora — ${form.get('restaurante')}`
    const cuerpo = [
      `Nombre: ${form.get('nombre')}`,
      `Restaurante: ${form.get('restaurante')}`,
      `Correo de contacto: ${form.get('email')}`,
      '',
      String(form.get('mensaje') || 'Quiero conocer Mesora para mi restaurante.'),
    ].join('\n')
    window.location.href = `mailto:${correo}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo)}`
    setEnviado(true)
  }

  return (
    <section id="contacto" className="scroll-mt-16 border-y border-white/5 bg-gradient-to-b from-surface-900/70 to-surface-950">
      <div className="mx-auto grid w-full max-w-7xl gap-12 px-4 py-24 sm:px-6 lg:grid-cols-[0.9fr_1.1fr]">
        <div>
          <SectionHeading
            align="left"
            eyebrow="Mesora para restaurantes"
            title="Conoce Mesora en tu operación"
            subtitle="Cuéntanos sobre tu restaurante y coordinemos una demostración del flujo de pedidos, cocina, caja y administración."
          />
          <div className="mt-7 space-y-3 text-sm text-zinc-400">
            <p>Mesora gestiona la operación interna; el restaurante conserva su proveedor actual de facturación electrónica.</p>
            {correo && <p>{correoTemporal ? 'Correo provisional: ' : 'Contacto: '}{correoTemporal ? <span className="font-medium text-brand-400">{correo}</span> : <a className="font-medium text-brand-400 hover:text-brand-300" href={`mailto:${correo}`}>{correo}</a>}</p>}
            {telefono && <p>Teléfono de contacto: <a className="font-medium text-brand-400 hover:text-brand-300" href={`tel:${telefono.replace(/[^+\d]/g, '')}`}>{telefono}</a></p>}
          </div>
          <Link to="/demo" className="mt-7 inline-flex items-center gap-2 text-sm font-semibold text-brand-400 hover:text-brand-300">
            También puedes explorar la demo <IconArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="rounded-3xl border border-surface-700 bg-surface-900 p-6 shadow-2xl shadow-black/30 sm:p-8">
          {correo && !correoTemporal ? (
            <form onSubmit={solicitarDemo} className="space-y-4">
              <div>
                <label htmlFor="contacto-nombre" className="mb-1.5 block text-sm font-medium text-zinc-300">Tu nombre</label>
                <input id="contacto-nombre" name="nombre" autoComplete="name" required maxLength={100} className="w-full rounded-xl border border-surface-700 bg-surface-950 px-4 py-3 text-white outline-none transition focus:border-brand-500" />
              </div>
              <div>
                <label htmlFor="contacto-restaurante" className="mb-1.5 block text-sm font-medium text-zinc-300">Nombre del restaurante</label>
                <input id="contacto-restaurante" name="restaurante" required maxLength={120} className="w-full rounded-xl border border-surface-700 bg-surface-950 px-4 py-3 text-white outline-none transition focus:border-brand-500" />
              </div>
              <div>
                <label htmlFor="contacto-email" className="mb-1.5 block text-sm font-medium text-zinc-300">Correo para responderte</label>
                <input id="contacto-email" name="email" type="email" autoComplete="email" required maxLength={160} className="w-full rounded-xl border border-surface-700 bg-surface-950 px-4 py-3 text-white outline-none transition focus:border-brand-500" />
              </div>
              <div>
                <label htmlFor="contacto-mensaje" className="mb-1.5 block text-sm font-medium text-zinc-300">¿Qué te gustaría mejorar?</label>
                <textarea id="contacto-mensaje" name="mensaje" rows={3} maxLength={1000} className="w-full resize-y rounded-xl border border-surface-700 bg-surface-950 px-4 py-3 text-white outline-none transition focus:border-brand-500" />
              </div>
              <button type="submit" className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 px-6 py-3.5 font-bold text-surface-950 transition hover:bg-brand-400">
                Solicitar una demostración <IconArrowRight className="h-5 w-5" />
              </button>
              <p className="text-center text-xs leading-relaxed text-zinc-500">Se abrirá tu aplicación de correo con el mensaje listo para revisar y enviar.</p>
              {enviado && <p role="status" className="text-center text-sm text-ok-500">Revisa la aplicación de correo para completar el envío.</p>}
            </form>
          ) : (
            <div className="flex h-full min-h-64 flex-col items-center justify-center text-center">
              <p className="text-lg font-bold text-white">Contacto comercial provisional</p>
              <p className="mt-2 max-w-sm text-sm leading-relaxed text-zinc-400">
                {correoTemporal
                  ? `Usamos ${correo} como marcador. No recibe mensajes; lo reemplazaremos antes de captar solicitudes.`
                  : 'El correo comercial todavía no está configurado. Puedes recorrer la demo mientras lo definimos.'}
              </p>
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
