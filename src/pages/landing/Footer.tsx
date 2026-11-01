import { Link } from 'react-router-dom'
import { Logo } from './Navbar'
import { IconArrowRight } from './Icons'
import { useLandingConfig } from './useLandingConfig'

const enlaces = [
  { href: '#inicio', label: 'Inicio' },
  { href: '#soluciones', label: 'Funciones' },
  { href: '#como-funciona', label: 'Cómo funciona' },
  { href: '#planes', label: 'Precio' },
  { href: '#preguntas', label: 'Preguntas frecuentes' },
  { href: '#piloto', label: 'Piloto' },
]

export default function Footer() {
  const { correo, telefono } = useLandingConfig()

  return (
    <footer id="contacto" className="scroll-mt-16 border-t border-white/5 bg-surface-950">
      <div className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6">
        <div className="flex flex-col items-start justify-between gap-8 sm:flex-row sm:items-center">
          <div className="flex max-w-md flex-col items-start gap-3">
            <Logo />
            <p className="text-sm leading-relaxed text-zinc-400">
              Gestión de pedidos, cocina, caja y ventas para restaurantes.
            </p>
            {correo && <a href={`mailto:${correo}`} className="text-sm text-brand-400 hover:text-brand-300">{correo}</a>}
            {telefono && <a href={`tel:${telefono.replace(/[^+\d]/g, '')}`} className="text-sm text-brand-400 hover:text-brand-300">{telefono}</a>}
          </div>
          <div className="flex flex-col items-start gap-3 sm:items-end">
            <p className="text-sm font-semibold text-white">¿Quieres conocer el piloto?</p>
            <a href="#piloto" className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-bold text-surface-950 shadow-lg shadow-brand-500/25 transition hover:bg-brand-400">
              Solicitar información <IconArrowRight className="h-4 w-4" />
            </a>
          </div>
        </div>
        <div className="mt-10 flex flex-col items-start justify-between gap-5 border-t border-white/5 pt-7 sm:flex-row sm:items-center">
          <nav aria-label="Enlaces del pie de página" className="flex flex-wrap gap-x-5 gap-y-2">
            {enlaces.map((l) => (
              <a key={l.href} href={l.href} className="text-sm text-zinc-500 transition hover:text-white">{l.label}</a>
            ))}
          </nav>
          <Link to="/demo" className="text-sm font-semibold text-zinc-400 transition hover:text-white">Explorar demo</Link>
        </div>
        <p className="mt-8 text-center text-xs text-zinc-600">
          © {new Date().getFullYear()} Mesora. La demo utiliza datos de ejemplo.
        </p>
      </div>
    </footer>
  )
}
