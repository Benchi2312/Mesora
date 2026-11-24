import SectionHeading from './SectionHeading'
import { IconCard, IconChartBar, IconClipboard, IconPot, IconUsers, IconWallet } from './Icons'

const roles = [
  {
    number: '02',
    area: 'Salón',
    icon: IconClipboard,
    title: 'Mesero',
    detail: 'Gestiona mesas, registra pedidos y consulta el consumo de sus mesas.',
    accent: 'text-sky-300',
  },
  {
    number: '03',
    area: 'Cobros',
    icon: IconWallet,
    title: 'Cajero',
    detail: 'Atiende cobros y caja de acuerdo con la modalidad y los permisos configurados.',
    accent: 'text-emerald-300',
  },
  {
    number: '04',
    area: 'Preparación',
    icon: IconPot,
    title: 'Cocina',
    detail: 'Prepara los productos de su área y actualiza el avance en pantalla cuando está configurada.',
    accent: 'text-amber-300',
  },
  {
    number: '05',
    area: 'Bebidas',
    icon: IconCard,
    title: 'Barra',
    detail: 'Consulta o recibe las comandas asignadas a Barra según la configuración del local.',
    accent: 'text-cyan-300',
  },
  {
    number: '06',
    area: 'Plataforma',
    icon: IconUsers,
    title: 'Superadmin',
    detail: 'Administra la plataforma, los restaurantes, las suscripciones y el soporte.',
    accent: 'text-zinc-300',
  },
]

export default function Roles() {
  return (
    <section id="roles" className="mx-auto w-full max-w-7xl scroll-mt-16 px-4 py-20 sm:px-6 sm:py-24">
      <SectionHeading
        eyebrow="Para cada equipo"
        title="Un espacio de trabajo para cada rol"
        subtitle="Cada persona accede a las funciones que necesita según su perfil y los permisos configurados."
        align="left"
      />
      <div className="mt-12 border-y border-white/10">
        <article className="grid min-w-0 grid-cols-[1.5rem_minmax(0,1fr)] gap-x-4 gap-y-3 border-b border-l-2 border-white/10 border-l-brand-500 bg-surface-900/70 px-5 py-7 sm:grid-cols-[1.5rem_minmax(0,0.38fr)_minmax(0,1fr)] sm:items-center sm:gap-x-7 sm:px-8 sm:py-8">
          <span className="self-start pt-1 text-xs font-semibold tracking-[0.16em] text-brand-300 sm:self-center">01</span>
          <div className="min-w-0">
            <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-brand-300">
              <IconChartBar className="h-5 w-5 shrink-0" />Gestión del local
            </span>
            <h3 className="mt-2 text-2xl font-bold tracking-tight text-white">Administrador</h3>
          </div>
          <p className="col-start-2 max-w-xl text-base leading-relaxed text-zinc-300 sm:col-start-3 sm:row-start-1">
            Configura el restaurante, su menú y equipo, y consulta reportes y auditoría.
          </p>
        </article>

        <ul>
          {roles.map(({ number, area, icon: Icon, title, detail, accent }) => (
            <li key={title} className="grid min-w-0 grid-cols-[1.5rem_minmax(0,1fr)] gap-x-4 gap-y-2 border-b border-white/10 px-5 py-5 transition-colors last:border-b-0 sm:grid-cols-[1.5rem_minmax(0,0.38fr)_minmax(0,1fr)] sm:items-center sm:gap-x-7 sm:px-8 lg:hover:bg-white/[0.025]">
              <span className="pt-0.5 text-xs font-semibold tracking-[0.16em] text-zinc-500">{number}</span>
              <div className="min-w-0">
                <span className={`flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] ${accent}`}>
                  <Icon className="h-4 w-4 shrink-0" />{area}
                </span>
                <h3 className="mt-1 text-lg font-bold text-white">{title}</h3>
              </div>
              <p className="col-start-2 text-sm leading-relaxed text-zinc-400 sm:col-start-3 sm:row-start-1">{detail}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
