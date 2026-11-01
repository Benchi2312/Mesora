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
    title: 'Toma de pedidos',
    desc: 'Registra pedidos desde las mesas con productos, categorías y precios configurados para el local.',
  },
  {
    icon: IconPot,
    title: 'Cocina sincronizada',
    desc: 'La cocina consulta las comandas y actualiza su estado de preparación durante el servicio.',
  },
  {
    icon: IconCard,
    title: 'Cierre de cuenta',
    desc: 'Registra el pago con el método utilizado y consulta el detalle de la cuenta y su cierre.',
  },
  {
    icon: IconChartBar,
    title: 'Dashboard de ventas',
    desc: 'Consulta cobros, anulaciones, productos más vendidos y ventas por mesero.',
  },
  {
    icon: IconGrid,
    title: 'Configuración del local',
    desc: 'Organiza zonas, mesas, categorías, productos y personal desde administración.',
  },
  {
    icon: IconRocket,
    title: 'Hecho para MYPEs',
    desc: 'Acceso desde navegador con vistas diferenciadas para cada rol del restaurante.',
  },
]

export default function Features() {
  return (
    <section id="soluciones" className="mx-auto w-full max-w-7xl scroll-mt-16 px-4 py-24 sm:px-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <SectionHeading
          eyebrow="Soluciones"
          title="Todo lo que tu restaurante necesita, en un solo lugar"
          subtitle="Del primer pedido de la mañana hasta el cierre del día, Mesora acompaña cada paso de tu operación."
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
