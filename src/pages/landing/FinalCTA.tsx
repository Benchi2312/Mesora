import { Link } from 'react-router-dom'
import { IconArrowRight } from './Icons'

export default function FinalCTA() {
  return (
    <section className="px-4 py-16 sm:px-6 sm:py-20">
      <div className="relative mx-auto max-w-7xl overflow-hidden rounded-3xl border border-brand-500/25 bg-[radial-gradient(ellipse_at_top_right,rgba(255,149,0,0.16),transparent_50%),#111418] px-5 py-10 text-center shadow-2xl shadow-black/20 sm:px-10 sm:py-14">
        <div className="relative mx-auto max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-300">Mesora para restaurantes</p>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">Conoce Mesora</h2>
          <p className="mt-3 text-base leading-relaxed text-zinc-300">
            Explora el demo o abre la aplicación para conocer la plataforma.
          </p>
          <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
            <a
              href="https://mesora-sistema.vercel.app"
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-brand-500 px-6 py-3 text-sm font-bold text-surface-950 shadow-lg shadow-brand-500/20 transition hover:-translate-y-0.5 hover:bg-brand-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-300"
            >
              Ir a Mesora <IconArrowRight className="h-4 w-4" />
            </a>
            <Link
              to="/demo"
              className="inline-flex min-h-12 items-center justify-center rounded-xl border border-white/15 bg-white/[0.04] px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/[0.08] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-300"
            >
              Explorar demo
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
