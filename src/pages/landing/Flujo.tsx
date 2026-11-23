import SectionHeading from './SectionHeading'
import { IconCard, IconChartBar, IconClipboard, IconPot } from './Icons'

const pasos = [
  { icon: IconClipboard, titulo: 'El mesero registra el pedido', desc: 'Selecciona la mesa, agrega productos y envía la comanda.' },
  { icon: IconPot, titulo: 'Cocina y Barra preparan los productos', desc: 'Cada área trabaja con las comandas que le corresponden.' },
  { icon: IconCard, titulo: 'Se realiza el cobro y cierre de caja', desc: 'El personal autorizado registra el pago y el responsable cierra el turno.' },
  { icon: IconChartBar, titulo: 'El administrador revisa reportes y auditoría', desc: 'Consulta la actividad del restaurante y las acciones registradas.' },
]

export default function Flujo() {
  return (
    <section id="como-funciona" className="scroll-mt-16 border-y border-white/5 bg-gradient-to-b from-surface-900/60 to-surface-950">
      <div className="mx-auto w-full max-w-7xl px-4 py-24 sm:px-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <SectionHeading
            eyebrow="Cómo funciona"
            title="Cómo funciona"
            subtitle="Cada rol participa en una secuencia clara, desde la toma del pedido hasta la revisión administrativa."
          />
        </div>
        <ol className="relative mx-auto mt-14 grid max-w-5xl gap-4 sm:grid-cols-2">
          {pasos.map((p, index) => (
            <li key={p.titulo} className="flex items-start gap-4 rounded-2xl border border-surface-800 bg-surface-900/70 p-5 sm:p-6">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-brand-500/30 bg-brand-500/10 text-brand-500">
                <p.icon className="h-6 w-6" />
              </span>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-brand-400">Paso {index + 1}</p>
                <h3 className="mt-1 font-bold text-white">{p.titulo}</h3>
                <p className="mt-1 text-sm leading-relaxed text-zinc-400">{p.desc}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
