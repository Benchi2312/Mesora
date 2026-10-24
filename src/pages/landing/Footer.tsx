import { Link } from 'react-router-dom'
import { Logo } from './Navbar'
import { IconArrowRight, IconFacebook, IconInstagram, IconLinkedIn, IconXSocial } from './Icons'

const enlaces = [
  { href: '#inicio', label: 'Inicio' },
  { href: '#soluciones', label: 'Soluciones' },
  { href: '#como-funciona', label: 'Cómo funciona' },
  { href: '#planes', label: 'Planes' },
  { href: '#contacto', label: 'Contacto' },
]

const redes = [IconInstagram, IconFacebook, IconXSocial, IconLinkedIn]

export default function Footer() {
  return (
    <footer id="contacto" className="scroll-mt-16 border-t border-white/5 bg-surface-950">
      <div className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6">
        <div className="flex flex-col items-start justify-between gap-8 sm:flex-row sm:items-center">
          <div className="flex max-w-md flex-col items-start gap-3">
            <Logo />
            <p className="text-sm text-zinc-400">
              Tecnología para restaurantes que quieren crecer. Lleva tu operación
              al siguiente nivel con datos, orden y sincronía.
            </p>
          </div>
          <div className="flex flex-col items-start gap-3 sm:items-end">
            <p className="text-sm font-semibold text-white">¿Listo para probar Mesora?</p>
            <Link
              to="/demo"
              className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-bold text-surface-950 shadow-lg shadow-brand-500/25 transition hover:bg-brand-400"
            >
              Solicitar demo
              <IconArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-start justify-between gap-6 border-t border-white/5 pt-8 sm:flex-row sm:items-center">
          <nav className="flex flex-wrap gap-x-6 gap-y-2">
            {enlaces.map((l) => (
              <a
                key={l.href}
                href={l.href}
                className="text-sm text-zinc-500 transition hover:text-white"
              >
                {l.label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            {redes.map((Icon, i) => (
              <a
                key={i}
                href="#contacto"
                aria-label="Red social"
                className="grid h-9 w-9 place-items-center rounded-lg border border-surface-800 text-zinc-400 transition hover:border-brand-500/50 hover:text-brand-500"
              >
                <Icon className="h-4.5 w-4.5" />
              </a>
            ))}
          </div>
        </div>

        <p className="mt-8 text-center text-xs text-zinc-600">
          © {new Date().getFullYear()} Mesora. Todos los derechos reservados.
        </p>
      </div>
    </footer>
  )
}