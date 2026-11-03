import { Link } from 'react-router-dom'
import { IconArrowRight, IconCheck } from './Icons'

const tareas = [
  { mesa: 'Mesa 04', detalle: '3 productos · 1 comanda', estado: 'En cocina', color: 'text-sky-300 bg-sky-400/10' },
  { mesa: 'Mesa 07', detalle: 'Consumo a la vista de caja', estado: 'Cuenta abierta', color: 'text-brand-300 bg-brand-400/10' },
  { mesa: 'Administración', detalle: 'Ventas y actividad del equipo', estado: 'Reporte', color: 'text-emerald-300 bg-emerald-400/10' },
]

const roles = ['Salón', 'Cocina', 'Caja', 'Administración']

export default function Hero() {
  return (
    <section id="inicio" className="relative isolate overflow-hidden pt-16">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_78%_18%,rgba(255,149,0,0.17),transparent_38%),radial-gradient(ellipse_at_10%_58%,rgba(27,90,111,0.16),transparent_35%)]" />
      <div className="mx-auto grid w-full max-w-7xl grid-cols-1 items-center gap-12 px-4 pb-20 pt-16 sm:px-6 sm:pb-24 sm:pt-24 lg:grid-cols-[0.95fr_1.05fr] lg:gap-16 lg:pb-28 lg:pt-28">
        <div className="flex min-w-0 flex-col items-start gap-6">
          <span className="inline-flex items-center gap-2 rounded-full border border-brand-500/30 bg-brand-500/10 px-3.5 py-1.5 text-xs font-semibold tracking-wide text-brand-300">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-400" />
            Gestión operativa para restaurantes
          </span>
          <h1 className="max-w-2xl text-4xl font-black leading-[1.04] tracking-tight text-white sm:text-5xl lg:text-[3.75rem]">
            De la mesa al cierre,
            <span className="mt-1 block text-brand-400">cada pedido en su lugar.</span>
          </h1>
          <p className="max-w-xl text-lg leading-relaxed text-zinc-300 sm:text-xl">
            Cuando los pedidos, cocina y caja trabajan por separado, cuesta reconstruir qué pasó
            en cada mesa. Mesora conecta salón, cocina, caja y administración, desde la comanda
            hasta el cierre.
          </p>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
            <Link
              to="/demo"
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-brand-500 px-6 py-3 text-base font-bold text-surface-950 shadow-lg shadow-brand-500/20 transition hover:-translate-y-0.5 hover:bg-brand-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-300"
            >
              Probar el demo interactivo
              <IconArrowRight className="h-5 w-5" />
            </Link>
            <a
              href="#contacto"
              className="inline-flex min-h-12 items-center justify-center rounded-xl border border-white/15 bg-white/[0.04] px-6 py-3 text-base font-semibold text-white transition hover:border-white/25 hover:bg-white/[0.08] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-300"
            >
              Solicitar una demostración
            </a>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-2 pt-1 text-sm text-zinc-400">
            {['Sin crear una cuenta', 'Datos de ejemplo', 'Vistas por rol'].map((item) => (
              <span key={item} className="inline-flex items-center gap-2">
                <IconCheck className="h-4 w-4 text-emerald-400" />
                {item}
              </span>
            ))}
          </div>
        </div>

        <div className="relative mx-auto w-full min-w-0 max-w-xl lg:max-w-none">
          <div className="absolute inset-8 rounded-[2.5rem] bg-brand-500/15 blur-3xl" />
          <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#111418]/95 shadow-2xl shadow-black/50 ring-1 ring-white/[0.03]">
            <div className="flex items-center justify-between gap-4 border-b border-white/[0.07] px-5 py-4 sm:px-6">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-500 text-sm font-black text-surface-950">M</span>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Mesora · operación</p>
                  <p className="mt-1 text-base font-bold text-white">Un turno conectado</p>
                </div>
              </div>
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-300">
                Vista ilustrativa
              </span>
            </div>
            <div className="p-4 sm:p-6">
              <div className="mb-4 flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-zinc-200">Actividad del restaurante</p>
                <span className="text-xs text-zinc-500">Datos de ejemplo</span>
              </div>
              <div className="space-y-3">
                {tareas.map((tarea) => (
                  <div key={tarea.mesa} className="flex items-center gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-3.5 sm:gap-4 sm:p-4">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/[0.05] text-xs font-bold text-zinc-300">
                      {tarea.mesa === 'Administración' ? '↗' : tarea.mesa.slice(-2)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-white">{tarea.mesa}</p>
                      <p className="mt-1 truncate text-xs text-zinc-400">{tarea.detalle}</p>
                    </div>
                    <span className={`hidden shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold sm:inline-flex ${tarea.color}`}>
                      {tarea.estado}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-5 grid grid-cols-4 gap-1 rounded-2xl border border-white/[0.07] bg-black/20 p-2">
                {roles.map((role, index) => (
                  <div key={role} className="flex min-w-0 flex-col items-center gap-1.5 rounded-xl px-1 py-2 text-center">
                    <span className={`grid h-7 w-7 place-items-center rounded-full text-[10px] font-bold ${index === 0 ? 'bg-brand-500/15 text-brand-300' : 'bg-white/[0.06] text-zinc-400'}`}>0{index + 1}</span>
                    <span className="text-[10px] font-medium text-zinc-400 sm:text-xs">{role}</span>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-center text-[11px] leading-relaxed text-zinc-500">
                Ejemplo visual. Explora las pantallas reales en el demo interactivo.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
