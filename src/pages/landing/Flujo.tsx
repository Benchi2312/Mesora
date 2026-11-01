import SectionHeading from './SectionHeading'
import { IconCard, IconChartBar, IconClipboard, IconPot } from './Icons'

const pasos = [
  { icon: IconClipboard, titulo: 'El mesero registra', desc: 'Toma el pedido desde la mesa con productos y precios configurados.' },
  { icon: IconPot, titulo: 'La cocina prepara', desc: 'Consulta las comandas y actualiza su estado durante el servicio.' },
  { icon: IconCard, titulo: 'Caja cierra la cuenta', desc: 'Revisa el consumo y registra el pago con el método utilizado.' },
  { icon: IconChartBar, titulo: 'Administración consulta', desc: 'Revisa ventas, cuentas y productos por periodo.' },
]

export default function Flujo() {
  return (
    <section id="como-funciona" className="scroll-mt-16 border-y border-white/5 bg-gradient-to-b from-surface-900/60 to-surface-950">
      <div className="mx-auto w-full max-w-7xl px-4 py-24 sm:px-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <SectionHeading
            eyebrow="Cómo funciona"
            title="Un flujo compartido, de la mesa a la gerencia"
            subtitle="Cada persona entra a su vista de trabajo y registra la parte que le corresponde."
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
