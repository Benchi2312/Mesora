import SectionHeading from './SectionHeading'
import { IconCheck } from './Icons'

const items = [
  {
    titulo: 'Mesas y zonas ilimitadas',
    desc: 'Organiza el salón como prefieras, sin topes ni cargos extra.',
  },
  {
    titulo: 'Promociones y precios flexibles',
    desc: 'Aplica ofertas por plato, mantén precios especiales y gana más margen.',
  },
  {
    titulo: 'Control sobre cada cierre',
    desc: 'Libera mesas y valida cada cuenta para que nada se escape.',
  },
]

export default function ControlSection() {
  return (
    <section
      id="rentabilidad"
      className="scroll-mt-16 border-y border-white/5 bg-gradient-to-b from-surface-950 to-surface-900/60"
    >
      <div className="mx-auto grid w-full max-w-7xl items-center gap-14 px-4 py-24 sm:px-6 lg:grid-cols-2">
        <div className="relative order-2 overflow-hidden rounded-3xl border border-surface-700 lg:order-1">
          <img
            src="https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=1200&q=80"
            alt="Plato de restaurante emplatado"
            className="h-full min-h-[320px] w-full object-cover"
          />
          <div className="absolute bottom-5 left-5 right-5 rounded-2xl border border-white/10 bg-surface-950/80 px-5 py-4 backdrop-blur">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-white">Mesa 3</p>
                <p className="text-xs text-zinc-400">Cuenta cerrada · Yape</p>
              </div>
              <p className="text-lg font-black text-brand-500">S/ 118</p>
            </div>
          </div>
        </div>

        <div className="order-1 flex flex-col items-start gap-3 lg:order-2">
          <SectionHeading
            align="left"
            eyebrow="Control"
            title="Más control, más rentabilidad"
            subtitle="Menos comandas en papel perdidas, menos cuentas mal cobradas y menos horas de arqueo al cerrar el local."
          />
          <ul className="mt-4 flex flex-col gap-4">
            {items.map((m) => (
              <li key={m.titulo} className="flex items-start gap-3.5">
                <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-500/15 text-brand-500">
                  <IconCheck className="h-4 w-4" />
                </span>
                <div>
                  <h3 className="font-bold text-white">{m.titulo}</h3>
                  <p className="text-sm text-zinc-400">{m.desc}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}