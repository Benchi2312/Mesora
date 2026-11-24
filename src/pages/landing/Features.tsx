import SectionHeading from './SectionHeading'
import { IconCard, IconChartBar, IconClipboard, IconGrid, IconPot, IconRocket } from './Icons'

export default function Features() {
  return (
    <section id="soluciones" className="mx-auto w-full max-w-7xl scroll-mt-16 px-4 py-24 sm:px-6">
      <SectionHeading
        eyebrow="La plataforma"
        title="¿Qué es Mesora?"
        subtitle="Mesora permite administrar pedidos, mesas, Cocina, Barra, caja, reportes, auditoría y soporte desde espacios de trabajo pensados para cada rol."
        align="left"
      />

      <div className="mt-12 grid gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:items-start lg:gap-10">
        <article className="relative flex flex-col overflow-hidden rounded-3xl border border-white/10 bg-surface-900 p-7 sm:p-9 lg:min-h-[24rem]">
          <div className="absolute inset-x-0 top-0 h-1 bg-brand-500" aria-hidden="true" />
          <div className="flex items-center justify-between gap-4">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-300">01 / Salón</span>
            <IconClipboard className="h-8 w-8 text-brand-300" />
          </div>
          <div className="mt-14 max-w-md">
            <h3 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">Pedidos y mesas</h3>
            <p className="mt-4 text-base leading-relaxed text-zinc-300">
              Registra pedidos por mesa y consulta el consumo que corresponde a cada cuenta.
            </p>
          </div>
          <div className="mt-10 flex flex-wrap items-center gap-3 border-t border-white/10 pt-5 text-xs font-semibold uppercase tracking-wider text-zinc-400 lg:mt-auto">
            <span>Mesa</span><span aria-hidden="true" className="text-brand-400">→</span>
            <span>Pedido</span><span aria-hidden="true" className="text-brand-400">→</span>
            <span>Cuenta</span>
          </div>
        </article>

        <div className="border-t border-white/10">
          <article className="grid gap-4 border-b border-white/10 py-6 transition-colors lg:hover:bg-white/[0.025] sm:grid-cols-[auto_1fr] sm:gap-5">
            <IconPot className="h-7 w-7 text-sky-300" />
            <div>
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-300">02 / Preparación</span>
              <h3 className="mt-2 text-xl font-bold text-white">Cocina y Barra</h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                Cada equipo consulta o recibe las comandas de su área según la configuración del restaurante.
              </p>
            </div>
          </article>

          <article className="grid gap-4 border-b border-white/10 py-6 transition-colors lg:hover:bg-white/[0.025] sm:grid-cols-[auto_1fr] sm:gap-5">
            <IconCard className="h-7 w-7 text-emerald-300" />
            <div>
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-300">03 / Control</span>
              <h3 className="mt-2 text-xl font-bold text-white">Caja y reportes</h3>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <div>
                  <h4 className="text-sm font-semibold text-zinc-200">Caja</h4>
                  <p className="mt-1 text-sm leading-relaxed text-zinc-400">Consulta cuentas, registra cobros autorizados y organiza la apertura y el cierre de turno.</p>
                </div>
                <div>
                  <h4 className="flex items-center gap-2 text-sm font-semibold text-zinc-200"><IconChartBar className="h-4 w-4 text-emerald-300" />Reportes</h4>
                  <p className="mt-1 text-sm leading-relaxed text-zinc-400">Revisa ventas y actividad del restaurante por periodos con filtros y exportaciones disponibles.</p>
                </div>
              </div>
            </div>
          </article>

          <article className="grid gap-4 border-b border-white/10 py-6 transition-colors lg:hover:bg-white/[0.025] sm:grid-cols-[auto_1fr] sm:gap-5">
            <IconGrid className="h-7 w-7 text-zinc-300" />
            <div>
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">04 / Seguimiento</span>
              <h3 className="mt-2 text-xl font-bold text-white">Auditoría y soporte</h3>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <div>
                  <h4 className="text-sm font-semibold text-zinc-200">Auditoría</h4>
                  <p className="mt-1 text-sm leading-relaxed text-zinc-400">Consulta el historial de acciones sensibles y cambios registrados durante la operación.</p>
                </div>
                <div>
                  <h4 className="flex items-center gap-2 text-sm font-semibold text-zinc-200"><IconRocket className="h-4 w-4 text-zinc-300" />Soporte</h4>
                  <p className="mt-1 text-sm leading-relaxed text-zinc-400">Administra conversaciones de soporte desde el panel de Superadmin de la plataforma.</p>
                </div>
              </div>
            </div>
          </article>
        </div>
      </div>
    </section>
  )
}
