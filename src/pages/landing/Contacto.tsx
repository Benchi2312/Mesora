import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { IconArrowRight, IconCheck } from './Icons'
import SectionHeading from './SectionHeading'
import { useLandingConfig } from './useLandingConfig'

const campos = 'w-full rounded-xl border border-white/10 bg-surface-950 px-4 py-3 text-white placeholder:text-zinc-600 outline-none transition focus:border-brand-500/70 focus:ring-2 focus:ring-brand-500/15'

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
    <section id="contacto" className="scroll-mt-16 border-y border-white/[0.07] bg-[radial-gradient(ellipse_at_0%_100%,rgba(255,149,0,0.08),transparent_42%),linear-gradient(to_bottom,rgba(17,20,24,0.82),#090b0e)]">
      <div className="mx-auto grid w-full max-w-7xl gap-10 px-4 py-20 sm:px-6 sm:py-24 lg:grid-cols-[0.85fr_1.15fr] lg:items-center lg:gap-16">
        <div>
          <SectionHeading
            align="left"
            eyebrow="Contacto comercial"
            title="Conversemos sobre el servicio de tu restaurante"
            subtitle="Cuéntanos cómo trabajan hoy tu salón, cocina y caja. Coordinemos una demostración para que conozcas el flujo completo de Mesora."
          />
          <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.035] p-5 sm:p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Escríbenos</p>
            {correo && !correoTemporal && (
              <a className="mt-2 inline-flex break-all text-lg font-semibold text-brand-300 transition hover:text-brand-200 sm:text-xl" href={`mailto:${correo}`}>
                {correo}
              </a>
            )}
            {telefono && <p className="mt-2 text-sm text-zinc-400">Teléfono: <a className="text-zinc-200 hover:text-white" href={`tel:${telefono.replace(/[^+\d]/g, '')}`}>{telefono}</a></p>}
            <div className="mt-5 space-y-2.5 border-t border-white/[0.07] pt-4 text-sm text-zinc-400">
              {['Demo interactivo con datos de ejemplo', 'Alcance y puesta en marcha conversados contigo', 'El restaurante conserva su sistema de facturación electrónica'].map((item) => (
                <p key={item} className="flex items-start gap-2.5">
                  <IconCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                  <span>{item}</span>
                </p>
              ))}
            </div>
          </div>
          <Link to="/demo" className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-zinc-300 transition hover:text-white">
            Prefieres probarlo primero: explora el demo <IconArrowRight className="h-4 w-4 text-brand-400" />
          </Link>
        </div>

        <div className="rounded-3xl border border-white/10 bg-[#111418] p-5 shadow-2xl shadow-black/30 ring-1 ring-white/[0.03] sm:p-8">
          {correo && !correoTemporal ? (
            <form onSubmit={solicitarDemo} className="space-y-4">
              <div className="mb-5">
                <p className="text-xl font-bold text-white">Solicita una demostración</p>
                <p className="mt-1 text-sm leading-relaxed text-zinc-400">Completa tus datos y prepararemos un correo para enviarlo a Mesora.</p>
              </div>
              <div>
                <label htmlFor="contacto-nombre" className="mb-1.5 block text-sm font-medium text-zinc-300">Tu nombre</label>
                <input id="contacto-nombre" name="nombre" autoComplete="name" placeholder="¿Cómo te llamas?" required maxLength={100} className={campos} />
              </div>
              <div>
                <label htmlFor="contacto-restaurante" className="mb-1.5 block text-sm font-medium text-zinc-300">Restaurante</label>
                <input id="contacto-restaurante" name="restaurante" placeholder="Nombre del restaurante" required maxLength={120} className={campos} />
              </div>
              <div>
                <label htmlFor="contacto-email" className="mb-1.5 block text-sm font-medium text-zinc-300">Tu correo</label>
                <input id="contacto-email" name="email" type="email" autoComplete="email" placeholder="tucorreo@ejemplo.com" required maxLength={160} className={campos} />
              </div>
              <div>
                <label htmlFor="contacto-mensaje" className="mb-1.5 block text-sm font-medium text-zinc-300">¿Qué te gustaría mejorar? <span className="font-normal text-zinc-500">(opcional)</span></label>
                <textarea id="contacto-mensaje" name="mensaje" rows={3} maxLength={1000} placeholder="Pedidos, cocina, caja, reportes…" className={`${campos} resize-y`} />
              </div>
              <button type="submit" className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand-500 px-6 py-3.5 font-bold text-surface-950 shadow-lg shadow-brand-500/15 transition hover:-translate-y-0.5 hover:bg-brand-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-300">
                Preparar consulta por correo <IconArrowRight className="h-5 w-5" />
              </button>
              <p className="text-center text-xs leading-relaxed text-zinc-500">Se abrirá tu aplicación de correo. Revisa el mensaje y envíalo para completar la consulta.</p>
              {enviado && <p role="status" className="text-center text-sm text-emerald-400">El correo quedó preparado; envíalo desde tu aplicación para que podamos recibirlo.</p>}
            </form>
          ) : (
            <div className="flex min-h-72 flex-col items-center justify-center px-4 text-center">
              <p className="text-lg font-bold text-white">Contacto comercial no disponible</p>
              <p className="mt-2 max-w-sm text-sm leading-relaxed text-zinc-400">
                El correo comercial aún no está disponible en esta versión. Puedes recorrer el demo mientras tanto.
              </p>
              <Link to="/demo" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-brand-500 px-5 py-3 font-bold text-surface-950 transition hover:bg-brand-400">
                Explorar demo <IconArrowRight className="h-4 w-4" />
              </Link>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
