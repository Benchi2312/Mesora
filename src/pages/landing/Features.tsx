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
    title: 'Pedidos y mesas',
    desc: 'Registra pedidos por mesa y consulta el consumo que corresponde a cada cuenta.',
  },
  {
    icon: IconPot,
    title: 'Cocina y Barra',
    desc: 'Cada equipo consulta o recibe las comandas de su área según la configuración del restaurante.',
  },
  {
    icon: IconCard,
    title: 'Caja',
    desc: 'Consulta cuentas, registra cobros autorizados y organiza la apertura y el cierre de turno.',
  },
  {
    icon: IconChartBar,
    title: 'Reportes',
    desc: 'Revisa ventas y actividad del restaurante por periodos con filtros y exportaciones disponibles.',
  },
  {
    icon: IconGrid,
    title: 'Auditoría',
    desc: 'Consulta el historial de acciones sensibles y cambios registrados durante la operación.',
  },
  {
    icon: IconRocket,
    title: 'Soporte',
    desc: 'Administra conversaciones de soporte desde el panel de Superadmin de la plataforma.',
  },
]

export default function Features() {
  return (
    <section id="soluciones" className="mx-auto w-full max-w-7xl scroll-mt-16 px-4 py-24 sm:px-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <SectionHeading
          eyebrow="La plataforma"
          title="¿Qué es Mesora?"
          subtitle="Mesora permite administrar pedidos, mesas, Cocina, Barra, caja, reportes, auditoría y soporte desde espacios de trabajo pensados para cada rol."
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
