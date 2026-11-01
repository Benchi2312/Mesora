import SectionHeading from './SectionHeading'
import { IconChartBar, IconTrendingUp, IconUsers, IconWallet } from './Icons'

const puntos = [
  { icon: IconTrendingUp, titulo: 'Ventas y cierres', desc: 'Consulta las cuentas pagadas y anuladas en un periodo.' },
  { icon: IconChartBar, titulo: 'Productos y bebidas', desc: 'Revisa qué artículos generan más ventas.' },
  { icon: IconUsers, titulo: 'Desempeño del equipo', desc: 'Compara las ventas registradas por mesero.' },
  { icon: IconWallet, titulo: 'Detalle por cuenta', desc: 'Inspecciona consumos, pagos y anulaciones.' },
]

export default function DashboardSection() {
  return (
    <section id="decisiones" className="mx-auto w-full max-w-7xl scroll-mt-16 px-4 py-24 sm:px-6">
      <div className="grid items-center gap-14 lg:grid-cols-2">
        <div className="flex flex-col items-start gap-3">
          <SectionHeading
            align="left"
            eyebrow="Administración"
            title="Entiende qué se vendió y cómo cerró el día"
            subtitle="Consulta el detalle de las cuentas y resume la actividad del local con filtros por periodo."
          />
          <ul className="mt-4 flex flex-col gap-4">
            {puntos.map((p) => (
              <li key={p.titulo} className="flex items-start gap-3.5">
                <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-500/10 text-brand-500">
                  <p.icon className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="font-bold text-white">{p.titulo}</h3>
                  <p className="text-sm text-zinc-400">{p.desc}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-3xl border border-surface-700 bg-surface-900 p-5 shadow-2xl shadow-black/40 sm:p-6">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-widest text-zinc-500">Panel de administración</p>
              <p className="mt-1 text-lg font-bold text-white">Ventas del local</p>
            </div>
            <span className="rounded-full bg-surface-800 px-3 py-1 text-xs font-medium text-zinc-300">Filtra por fecha</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[
              ['Resumen', 'Cobros, devoluciones y propinas'],
              ['Productos', 'Platos y bebidas más vendidos'],
              ['Equipo', 'Ventas por mesero'],
              ['Cuentas', 'Consumos y métodos de pago'],
            ].map(([title, description]) => (
              <div key={title} className="min-h-28 rounded-2xl border border-surface-800 bg-surface-950/70 p-4">
                <p className="font-semibold text-white">{title}</p>
                <p className="mt-2 text-sm leading-relaxed text-zinc-400">{description}</p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-center text-xs text-zinc-500">
            Funciones mostradas; los valores dependen de los registros del restaurante.
          </p>
        </div>
      </div>
    </section>
  )
}
