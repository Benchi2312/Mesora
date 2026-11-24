import SectionHeading from './SectionHeading'
import { IconCheck, IconClipboard, IconGrid, IconChartBar, IconUsers } from './Icons'

const beneficios = [
  {
    number: '02',
    title: 'Áreas coordinadas',
    text: 'Mejor coordinación entre salón, Cocina y Barra.',
    icon: IconUsers,
  },
  {
    number: '03',
    title: 'Caja a la vista',
    text: 'Más control sobre la caja y las ventas del restaurante.',
    icon: IconGrid,
  },
  {
    number: '04',
    title: 'Acciones trazables',
    text: 'Historial y auditoría de acciones sensibles.',
    icon: IconCheck,
  },
  {
    number: '05',
    title: 'Datos para decidir',
    text: 'Reportes para revisar el desempeño del restaurante.',
    icon: IconChartBar,
  },
]

export default function Beneficios() {
  return (
    <section className="border-y border-white/5 bg-surface-900/35">
      <div className="mx-auto w-full max-w-7xl px-4 py-20 sm:px-6 sm:py-24">
        <SectionHeading
          eyebrow="Beneficios"
          title="Más claridad durante el servicio"
          subtitle="La información de cada mesa acompaña al equipo desde el pedido hasta el cierre y la revisión del periodo."
          align="left"
        />
        <div className="mt-12 border-y border-white/10">
          <article className="grid min-w-0 grid-cols-[1.5rem_minmax(0,1fr)] gap-x-4 gap-y-3 border-b border-l-2 border-white/10 border-l-brand-500 bg-surface-950/60 px-5 py-7 sm:grid-cols-[1.5rem_minmax(0,0.38fr)_minmax(0,1fr)] sm:items-center sm:gap-x-7 sm:px-8 sm:py-8">
            <span className="self-start pt-1 text-xs font-semibold tracking-[0.16em] text-brand-300 sm:self-center">01</span>
            <div className="min-w-0">
              <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-brand-300">
                <IconClipboard className="h-5 w-5 shrink-0" />Servicio
              </span>
              <h3 className="mt-2 text-2xl font-bold tracking-tight text-white">Comandas claras desde el inicio</h3>
            </div>
            <p className="col-start-2 max-w-xl text-base leading-relaxed text-zinc-300 sm:col-start-3 sm:row-start-1">
              Menos errores al registrar y enviar comandas.
            </p>
          </article>

          <ul>
            {beneficios.map(({ number, title, text, icon: Icon }) => (
              <li key={title} className="grid min-w-0 grid-cols-[1.5rem_minmax(0,1fr)] gap-x-4 gap-y-2 border-b border-white/10 px-5 py-5 transition-colors last:border-b-0 sm:grid-cols-[1.5rem_minmax(0,0.38fr)_minmax(0,1fr)] sm:items-center sm:gap-x-7 sm:px-8 lg:hover:bg-white/[0.025]">
                <span className="pt-0.5 text-xs font-semibold tracking-[0.16em] text-zinc-500">{number}</span>
                <div className="flex min-w-0 items-center gap-3">
                  <Icon className="h-5 w-5 shrink-0 text-brand-300" />
                  <h3 className="text-base font-bold text-white">{title}</h3>
                </div>
                <p className="col-start-2 text-sm leading-relaxed text-zinc-400 sm:col-start-3 sm:row-start-1">{text}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
