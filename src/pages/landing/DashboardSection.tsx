import SectionHeading from './SectionHeading'
import { IconChartBar, IconTrendingUp, IconUsers, IconWallet } from './Icons'

const puntos = [
  {
    icon: IconTrendingUp,
    titulo: 'Ventas que se ven de un vistazo',
    desc: 'Compara el día con el mes y detecta tendencias al instante.',
  },
  {
    icon: IconChartBar,
    titulo: 'Tu plato estrella claro',
    desc: 'El producto más vendido deja de ser una intuición.',
  },
  {
    icon: IconUsers,
    titulo: 'Rendimiento por mesero',
    desc: 'Reconoce a tu mejor equipo y mejora el servicio.',
  },
  {
    icon: IconWallet,
    titulo: 'Control total del cierre',
    desc: 'Cuentas cerradas y métodos de pago siempre al día.',
  },
]

const barras = [42, 68, 55, 84, 60, 96, 74]
const dias = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

export default function DashboardSection() {
  return (
    <section id="decisiones" className="mx-auto w-full max-w-7xl scroll-mt-16 px-4 py-24 sm:px-6">
      <div className="grid items-center gap-14 lg:grid-cols-2">
        <div className="flex flex-col items-start gap-3">
          <SectionHeading
            align="left"
            eyebrow="Dashboard"
            title="Convierte la información en mejores decisiones"
            subtitle="Tu operación produce datos todos los días. Mesora los ordena para que ganes tiempo y pierdas menos."
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

        <div className="rounded-3xl border border-surface-700 bg-surface-900 p-6 shadow-2xl shadow-black/40">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-widest text-zinc-500">
                Dashboard
              </p>
              <p className="text-lg font-bold text-white">Resumen del día</p>
            </div>
            <span className="rounded-full bg-ok-500/15 px-3 py-1 text-xs font-semibold text-ok-500">
              Actualizado hace 2 min
            </span>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-2xl border border-surface-800 bg-surface-950/60 p-4">
              <p className="text-xs text-zinc-500">Ventas hoy</p>
              <p className="mt-1 text-xl font-bold text-white">S/ 1,286</p>
              <p className="mt-1 text-xs font-semibold text-ok-500">+12% vs ayer</p>
            </div>
            <div className="rounded-2xl border border-surface-800 bg-surface-950/60 p-4">
              <p className="text-xs text-zinc-500">Ventas mes</p>
              <p className="mt-1 text-xl font-bold text-white">S/ 24,350</p>
              <p className="mt-1 text-xs font-semibold text-brand-500">On track</p>
            </div>
            <div className="rounded-2xl border border-surface-800 bg-surface-950/60 p-4">
              <p className="text-xs text-zinc-500">Ticket promedio</p>
              <p className="mt-1 text-xl font-bold text-white">S/ 58</p>
              <p className="mt-1 text-xs font-semibold text-zinc-500">+3.2%</p>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-surface-800 bg-surface-950/60 p-5">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm font-semibold text-white">Ventas de la semana</p>
              <p className="text-sm font-bold text-brand-500">S/ 7,940</p>
            </div>
            <div className="flex h-32 items-end gap-2.5">
              {barras.map((h, i) => (
                <div key={`${dias[i]}-${h}`} className="flex flex-1 flex-col items-center gap-2">
                  <div
                    className={`w-full rounded-md ${
                      i === 5
                        ? 'bg-gradient-to-t from-brand-600 to-brand-400'
                        : 'bg-gradient-to-t from-surface-700 to-surface-600'
                    }`}
                    style={{ height: `${h}%` }}
                  />
                  <span className="text-xs text-zinc-500">{dias[i]}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}