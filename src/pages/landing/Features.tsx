import SectionHeading from './SectionHeading'
import {
  IconCard,
  IconChartBar,
  IconClipboard,
  IconGrid,
  IconPot,
  IconRocket,
} from './Icons'

const features = [
  {
    icon: IconClipboard,
    title: 'Pedidos ligados a cada mesa',
    desc: 'El equipo de salón registra el consumo y mantiene a la vista qué se pidió en cada cuenta.',
  },
  {
    icon: IconPot,
    title: 'Comandas para cocina',
    desc: 'Cocina consulta los pedidos y actualiza su avance para que salón pueda seguirlos.',
  },
  {
    icon: IconCard,
    title: 'Consumo y cobro claros',
    desc: 'Caja revisa el detalle de la cuenta, registra pagos y realiza el cierre del turno.',
  },
  {
    icon: IconChartBar,
    title: 'Reportes para administrar',
    desc: 'Consulta cobros, anulaciones, productos y bebidas vendidos, mesas y ventas por mesero.',
  },
  {
    icon: IconGrid,
    title: 'Un menú a la medida del local',
    desc: 'Configura zonas, mesas, categorías, productos y equipo desde administración.',
  },
  {
    icon: IconRocket,
    title: 'Cada rol, su espacio de trabajo',
    desc: 'Acceso desde navegador con vistas para salón, cocina, caja y administración.',
  },
]

export default function Features() {
  return (
    <section id="soluciones" className="mx-auto w-full max-w-7xl scroll-mt-16 px-4 py-24 sm:px-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <SectionHeading
          eyebrow="Soluciones"
          title="El mismo servicio, conectado de principio a fin"
          subtitle="Mesora reúne los pedidos, la preparación, los cobros y los reportes para que cada área trabaje con el contexto de la mesa."
        />
      </div>
      <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((f) => (
          <div
            key={f.title}
            className="group rounded-2xl border border-surface-800 bg-surface-900/60 p-7 transition duration-200 hover:-translate-y-0.5 hover:border-brand-500/40 hover:bg-surface-900 hover:shadow-xl hover:shadow-black/30"
          >
            <span className="mb-5 inline-grid h-12 w-12 place-items-center rounded-xl bg-brand-500/10 text-brand-500 transition group-hover:bg-brand-500 group-hover:text-surface-950">
              <f.icon className="h-6 w-6" />
            </span>
            <h3 className="text-lg font-bold text-white">{f.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-zinc-400">{f.desc}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
