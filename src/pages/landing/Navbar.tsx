import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { IconArrowRight } from './Icons'

const links = [
  { href: '#inicio', label: 'Inicio' },
  { href: '#soluciones', label: 'Funciones' },
  { href: '#como-funciona', label: 'Cómo funciona' },
  { href: '#planes', label: 'Precio' },
  { href: '#preguntas', label: 'Preguntas' },
]

export function Logo({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <Link to="/" onClick={onNavigate} className="flex shrink-0 items-center gap-2.5">
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
  const [menuAbierto, setMenuAbierto] = useState(false)
  const cabecera = useRef<HTMLElement>(null)
  const botonMenu = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!menuAbierto) return
    const cerrarFuera = (event: PointerEvent) => {
      if (event.target instanceof Node && !cabecera.current?.contains(event.target)) setMenuAbierto(false)
    }
    const escritorio = window.matchMedia('(min-width: 1280px)')
    const cerrarEnEscritorio = (event: MediaQueryListEvent) => {
      if (event.matches) setMenuAbierto(false)
    }
    document.addEventListener('pointerdown', cerrarFuera)
    escritorio.addEventListener('change', cerrarEnEscritorio)
    return () => {
      document.removeEventListener('pointerdown', cerrarFuera)
      escritorio.removeEventListener('change', cerrarEnEscritorio)
    }
  }, [menuAbierto])

  return (
    <header
      ref={cabecera}
      className="fixed inset-x-0 top-0 z-50 border-b border-white/5 bg-surface-950/95 backdrop-blur-md"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && menuAbierto) {
          setMenuAbierto(false)
          botonMenu.current?.focus()
        }
      }}
    >
      <nav aria-label="Navegación principal" className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-2 px-3 sm:gap-4 sm:px-6">
        <Logo onNavigate={() => setMenuAbierto(false)} />
        <div className="hidden min-w-0 flex-1 justify-center xl:flex">
          <div className="flex items-center gap-1 rounded-full border border-white/10 bg-white/5 p-1">
            {links.map((l) => (
              <a
                key={l.href}
                href={l.href}
                className="whitespace-nowrap rounded-full px-3 py-2 text-sm font-medium text-zinc-300 transition hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-300"
              >
                {l.label}
              </a>
            ))}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <Link
            to="/login"
            className="hidden whitespace-nowrap text-sm font-semibold text-zinc-300 transition hover:text-white xl:inline-flex"
          >
            Ingresar
          </Link>
          <Link
            to="/demo"
            className="inline-flex min-h-11 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-brand-500 px-2.5 py-2 text-xs font-bold text-surface-950 shadow-lg shadow-brand-500/25 transition hover:bg-brand-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-300 sm:px-4 sm:text-sm"
          >
            Probar demo
            <IconArrowRight className="hidden h-4 w-4 sm:block" />
          </Link>
          <a
            href="#contacto"
            className="hidden min-h-11 items-center whitespace-nowrap rounded-lg border border-brand-500/40 px-3 py-2 text-sm font-semibold text-brand-300 transition hover:bg-brand-500/10 xl:inline-flex"
          >
            Hablar con Mesora
          </a>
          <button
            ref={botonMenu}
            type="button"
            aria-label={menuAbierto ? 'Cerrar menú' : 'Abrir menú'}
            aria-expanded={menuAbierto}
            aria-controls={menuAbierto ? 'menu-landing-movil' : undefined}
            onClick={() => setMenuAbierto((abierto) => !abierto)}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-white/15 text-zinc-100 transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-300 xl:hidden"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-5 w-5" aria-hidden="true">
              {menuAbierto ? <path d="M5 5l14 14M19 5L5 19" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>
        </div>
      </nav>
      {menuAbierto && (
        <div id="menu-landing-movil" className="absolute inset-x-0 top-full border-b border-white/10 bg-surface-950 shadow-2xl shadow-black/50 xl:hidden">
          <nav aria-label="Menú de navegación" className="mx-auto max-h-[calc(100dvh-4rem)] w-full max-w-7xl overflow-y-auto px-4 pb-5 pt-2 sm:px-6">
            <div className="grid gap-1">
              {links.map((l) => (
                <a key={l.href} href={l.href} onClick={() => setMenuAbierto(false)} className="flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-zinc-200 transition hover:bg-white/5 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-300">
                  {l.label}
                </a>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 border-t border-white/10 pt-4">
              <Link to="/login" onClick={() => setMenuAbierto(false)} className="flex min-h-11 items-center justify-center rounded-lg border border-white/15 px-3 text-center text-sm font-semibold text-white transition hover:bg-white/5">Ingresar</Link>
              <a href="#contacto" onClick={() => setMenuAbierto(false)} className="flex min-h-11 items-center justify-center rounded-lg border border-brand-500/40 px-3 text-center text-sm font-semibold text-brand-300 transition hover:bg-brand-500/10">Hablar con Mesora</a>
            </div>
          </nav>
        </div>
      )}
    </header>
  )
}
