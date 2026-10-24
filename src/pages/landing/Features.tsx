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
    desc: 'Registra las comandas desde la mesa en tablet o celular, con productos por categoría y precios en promoción.',
  },
  {
    icon: IconPot,
    title: 'Cocina sincronizada',
    desc: 'La cocina recibe cada comanda en tiempo real y actualiza el estado de preparación sin papeles.',
  },
  {
    icon: IconCard,
    title: 'Cierre de cuenta',
    desc: 'Cobra al instante en efectivo, Yape, Plin, tarjeta o link de pago, con vuelto y propina.',
  },
  {
    icon: IconChartBar,
    title: 'Dashboard de ventas',
    desc: 'Ventas por mesero, plato más vendido y ticket promedio para entender tu operación.',
  },
  {
    icon: IconGrid,
    title: '100% configurable',
    desc: 'Zonas, mesas, categorías, productos y meseros. Tu restaurante, a tu manera.',
  },
  {
    icon: IconRocket,
    title: 'Hecho para MYPEs',
    desc: 'Simple de usar, rápido de poner en marcha y con precios pensados para negocios que crecen.',
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