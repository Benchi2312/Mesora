import SectionHeading from './SectionHeading'
import { IconCheck, IconUsers, IconClipboard, IconCard } from './Icons'

const controles = [
  { icon: IconUsers, title: 'Roles y permisos', text: 'El acceso a las funciones depende del rol asignado a cada usuario.' },
  { icon: IconCheck, title: 'Aislamiento por restaurante', text: 'Supabase aplica políticas RLS para separar la información de cada restaurante.' },
  { icon: IconClipboard, title: 'Auditoría', text: 'Las acciones sensibles y los cambios relevantes quedan registrados para su consulta.' },
  { icon: IconCard, title: 'Confirmaciones con PIN', text: 'Algunas operaciones sensibles solicitan el PIN configurado para confirmar la acción.' },
]

export default function Seguridad() {
  return (
    <section id="seguridad" className="border-y border-white/5 bg-gradient-to-b from-surface-900/50 to-surface-950">
      <div className="mx-auto w-full max-w-7xl px-4 py-20 sm:px-6 sm:py-24">
        <SectionHeading
          eyebrow="Seguridad y transparencia"
          title="Controles claros para la operación"
          subtitle="Mesora combina permisos por rol, aislamiento de datos y trazabilidad para apoyar el trabajo diario."
        />
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {controles.map(({ icon: Icon, title, text }) => (
            <article key={title} className="rounded-2xl border border-surface-800 bg-surface-900/60 p-5">
              <span className="mb-4 inline-grid h-10 w-10 place-items-center rounded-xl bg-brand-500/10 text-brand-300">
                <Icon className="h-5 w-5" />
              </span>
              <h3 className="font-bold text-white">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">{text}</p>
            </article>
          ))}
        </div>
        <p className="mx-auto mt-8 max-w-3xl rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-center text-sm leading-relaxed text-zinc-300">
          Mesora emite recibos internos. No genera comprobantes electrónicos ni boletas electrónicas de SUNAT.
        </p>
      </div>
    </section>
  )
}
