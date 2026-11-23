import SectionHeading from './SectionHeading'
import { IconCard, IconChartBar, IconClipboard, IconPot, IconUsers, IconWallet } from './Icons'

const roles = [
  {
    icon: IconChartBar,
    title: 'Administrador',
    detail: 'Configura el restaurante, su menú y equipo, y consulta reportes y auditoría.',
  },
  {
    icon: IconClipboard,
    title: 'Mesero',
    detail: 'Gestiona mesas, registra pedidos y consulta el consumo de sus mesas.',
  },
  {
    icon: IconWallet,
    title: 'Cajero',
    detail: 'Atiende cobros y caja de acuerdo con la modalidad y los permisos configurados.',
  },
  {
    icon: IconPot,
    title: 'Cocina',
    detail: 'Prepara los productos de su área y actualiza el avance en pantalla cuando está configurada.',
  },
  {
    icon: IconCard,
    title: 'Barra',
    detail: 'Consulta o recibe las comandas asignadas a Barra según la configuración del local.',
  },
  {
    icon: IconUsers,
    title: 'Superadmin',
    detail: 'Administra la plataforma, los restaurantes, las suscripciones y el soporte.',
    platform: true,
  },
]

export default function Roles() {
  return (
    <section id="roles" className="mx-auto w-full max-w-7xl scroll-mt-16 px-4 py-20 sm:px-6 sm:py-24">
      <SectionHeading
        eyebrow="Para cada equipo"
        title="Un espacio de trabajo para cada rol"
        subtitle="Cada persona accede a las funciones que necesita según su perfil y los permisos configurados."
      />
      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {roles.map(({ icon: Icon, title, detail, platform }) => (
          <article key={title} className="relative rounded-2xl border border-surface-800 bg-surface-900/50 p-5 sm:p-6">
            {platform && <span className="absolute right-4 top-4 rounded-full border border-brand-500/25 bg-brand-500/10 px-2.5 py-1 text-[11px] font-semibold text-brand-300">Plataforma</span>}
            <span className="mb-4 inline-grid h-11 w-11 place-items-center rounded-xl border border-brand-500/20 bg-brand-500/10 text-brand-300">
              <Icon className="h-5 w-5" />
            </span>
            <h3 className="text-lg font-bold text-white">{title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-zinc-400">{detail}</p>
          </article>
        ))}
      </div>
    </section>
  )
}
