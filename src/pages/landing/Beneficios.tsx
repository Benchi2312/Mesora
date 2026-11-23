import SectionHeading from './SectionHeading'
import { IconCheck, IconClipboard, IconGrid, IconChartBar, IconUsers } from './Icons'

const beneficios = [
  { icon: IconClipboard, texto: 'Menos errores al registrar y enviar comandas.' },
  { icon: IconUsers, texto: 'Mejor coordinación entre salón, Cocina y Barra.' },
  { icon: IconGrid, texto: 'Más control sobre la caja y las ventas del restaurante.' },
  { icon: IconCheck, texto: 'Historial y auditoría de acciones sensibles.' },
  { icon: IconChartBar, texto: 'Reportes para revisar el desempeño del restaurante.' },
]

export default function Beneficios() {
  return (
    <section className="border-y border-white/5 bg-surface-900/35">
      <div className="mx-auto grid w-full max-w-7xl gap-10 px-4 py-20 sm:px-6 sm:py-24 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
        <SectionHeading
          eyebrow="Beneficios"
          title="Más claridad durante el servicio"
          subtitle="La información de cada mesa acompaña al equipo desde el pedido hasta el cierre y la revisión del periodo."
          align="left"
        />
        <ul className="grid gap-3 sm:grid-cols-2">
          {beneficios.map(({ icon: Icon, texto }) => (
            <li key={texto} className="flex min-h-20 items-center gap-4 rounded-xl border border-surface-800 bg-surface-900/70 p-4">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-brand-500/10 text-brand-300">
                <Icon className="h-5 w-5" />
              </span>
              <span className="text-sm font-medium leading-relaxed text-zinc-200">{texto}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
