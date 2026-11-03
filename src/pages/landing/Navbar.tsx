import { Link } from 'react-router-dom'
import { IconArrowRight } from './Icons'

const links = [
  { href: '#inicio', label: 'Inicio' },
  { href: '#soluciones', label: 'Funciones' },
  { href: '#como-funciona', label: 'Cómo funciona' },
  { href: '#planes', label: 'Precio' },
  { href: '#preguntas', label: 'Preguntas' },
]

export function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2.5">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-500">
        <svg viewBox="0 0 24 24" className="h-5 w-5 text-surface-950" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 19V5M10 19V9M14 19V5M18 19V7" />
        </svg>
      </span>
      <span className="text-xl font-extrabold tracking-tight text-white">
        Mesora
      </span>
    </Link>
  )
}

export default function Navbar() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-white/5 bg-surface-950/80 backdrop-blur-md">
      <nav className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4 sm:px-6">
        <Logo />
        <div className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-1 rounded-full border border-white/10 bg-white/5 p-1 md:flex">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="rounded-full px-4 py-1.5 text-sm font-medium text-zinc-300 transition hover:bg-white/10 hover:text-white"
            >
              {l.label}
            </a>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <Link
            to="/login"
            className="hidden text-sm font-semibold text-zinc-300 transition hover:text-white sm:block"
          >
            Ingresar
          </Link>
          <Link
            to="/demo"
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-500 px-4 py-2 text-sm font-bold text-surface-950 shadow-lg shadow-brand-500/25 transition hover:bg-brand-400"
          >
            Probar demo
            <IconArrowRight className="h-4 w-4" />
          </Link>
          <a
            href="#contacto"
            className="hidden rounded-lg border border-brand-500/40 px-3 py-2 text-sm font-semibold text-brand-300 transition hover:bg-brand-500/10 sm:inline-flex"
          >
            Hablar con Mesora
          </a>
        </div>
      </nav>
    </header>
  )
}
