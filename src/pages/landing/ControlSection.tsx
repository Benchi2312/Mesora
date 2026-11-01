import SectionHeading from './SectionHeading'
import { IconCheck } from './Icons'

const items = [
  { titulo: 'Organiza el salón', desc: 'Configura zonas y mesas según el espacio de tu local.' },
  { titulo: 'Mantén la carta al día', desc: 'Administra categorías, productos, precios y promociones.' },
  { titulo: 'Consulta cada cuenta', desc: 'Revisa los pedidos asociados, el pago y el estado del cierre.' },
]

export default function ControlSection() {
  return (
    <section id="rentabilidad" className="scroll-mt-16 overflow-hidden border-y border-white/5 bg-gradient-to-b from-surface-950 to-surface-900/60">
      <div className="mx-auto grid w-full max-w-7xl items-center gap-14 px-4 py-24 sm:px-6 lg:grid-cols-2">
        <div className="relative order-2 overflow-hidden rounded-3xl border border-surface-700 bg-surface-900 p-6 lg:order-1 sm:p-8">
          <p className="relative text-xs font-semibold uppercase tracking-widest text-zinc-500">Flujo de una cuenta</p>
          <div className="relative mt-5 space-y-3">
            {[
              ['Consumo', 'Pedidos agrupados por mesa'],
              ['Revisión', 'Detalle disponible para caja'],
              ['Cierre', 'Pago y estado registrados'],
            ].map(([title, description], index) => (
              <div key={title} className="flex items-center gap-4 rounded-2xl border border-surface-700 bg-surface-950/70 p-4">
                <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-bold ${index === 2 ? 'bg-ok-500/15 text-ok-500' : 'bg-brand-500/10 text-brand-400'}`}>
                  {index + 1}
                </span>
                <div>
                  <p className="font-semibold text-white">{title}</p>
                  <p className="mt-0.5 text-sm text-zinc-400">{description}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="relative mt-4 text-xs text-zinc-500">Esquema ilustrativo del proceso; no representa una cuenta real.</p>
        </div>

        <div className="order-1 flex flex-col items-start gap-3 lg:order-2">
          <SectionHeading
            align="left"
            eyebrow="Control del local"
            title="Cada área sabe qué tiene que hacer"
            subtitle="Mesora conecta la toma del pedido con cocina, caja y el seguimiento administrativo del local."
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
