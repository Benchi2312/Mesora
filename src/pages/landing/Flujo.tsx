import SectionHeading from './SectionHeading'
import {
  IconCard,
  IconChartBar,
  IconClipboard,
  IconPot,
} from './Icons'

const pasos = [
  {
    icon: IconClipboard,
    titulo: '1. El mesero registra',
    desc: 'Toma el pedido desde la mesa con tus productos y precios actualizados.',
  },
  {
    icon: IconPot,
    titulo: '2. La cocina recibe',
    desc: 'La comanda aparece al instante y la cocina avanza su preparación.',
  },
  {
    icon: IconCard,
    titulo: '3. La cuenta se cierra',
    desc: 'El cliente paga en efectivo, Yape, Plin, tarjeta o con link de pago.',
  },
  {
    icon: IconChartBar,
    titulo: '4. La administración decide',
    desc: 'Ventas y estadísticas listas para tomar mejores decisiones.',
  },
]

export default function Flujo() {
  return (
    <section
      id="como-funciona"
      className="scroll-mt-16 border-y border-white/5 bg-gradient-to-b from-surface-900/60 to-surface-950"
    >
      <div className="mx-auto w-full max-w-7xl px-4 py-24 sm:px-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <SectionHeading
            eyebrow="Cómo funciona"
            title="Todo en sincronía, de la mesa a la gerencia"
            subtitle="Cuatro pasos, cero papeles. Cada cambio se refleja al instante en todas las vistas."
          />
        </div>

        <div className="mt-14 grid items-center gap-10 lg:grid-cols-[1fr_1.1fr]">
          <div className="relative overflow-hidden rounded-3xl border border-surface-700">
            <img
              src="https://images.unsplash.com/photo-1556910103-1c02745aae4d?auto=format&fit=crop&w=1200&q=80"
              alt="Cocina de restaurante en pleno servicio"
              className="h-full min-h-[320px] w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-surface-950/80 to-transparent" />
            <div className="absolute bottom-5 left-5 rounded-2xl border border-white/10 bg-surface-950/80 px-4 py-3 backdrop-blur">
              <p className="text-sm font-bold text-white">Comanda #00124</p>
              <p className="text-xs text-ok-500">Estado: en preparación · actualizado hace 8 s</p>
            </div>
          </div>

          <ol className="relative flex flex-col gap-4">
            {pasos.map((p) => (
              <li key={p.titulo} className="grid grid-cols-[auto_1fr] items-center gap-4">
                <span className="grid h-12 w-12 place-items-center rounded-xl border border-brand-500/30 bg-brand-500/10 text-brand-500">
                  <p.icon className="h-6 w-6" />
                </span>
                <div className="rounded-2xl border border-surface-800 bg-surface-900/60 p-5">
                  <h3 className="font-bold text-white">{p.titulo}</h3>
                  <p className="mt-1 text-sm text-zinc-400">{p.desc}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  )
}