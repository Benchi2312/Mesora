import { Link } from 'react-router-dom'
import SectionHeading from './SectionHeading'
import { IconArrowRight, IconCheck } from './Icons'
import { mostrarPrecioPlan } from '../../domain/restaurant/configuracion'
import { useLandingConfig } from './useLandingConfig'

const beneficios = [
  'Vistas para mesero, cocina, caja y administración',
  'Pedidos, comandas y cuentas por mesa',
  'Registro de pagos y seguimiento de cierres',
  'Reportes de ventas, productos y equipo',
]

export default function Planes() {
  const { precio } = useLandingConfig()

  return (
    <section id="planes" className="mx-auto w-full max-w-7xl scroll-mt-16 px-4 py-24 sm:px-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <SectionHeading
          eyebrow="Plan mensual"
          title="Conoce el plan y pruébalo antes de decidir"
          subtitle="Explora el demo y conversemos sobre la puesta en marcha para tu restaurante."
        />
      </div>
      <div className="mx-auto mt-10 max-w-xl">
        <div className="relative overflow-hidden rounded-3xl border border-brand-500/40 bg-surface-900 p-8 shadow-2xl shadow-brand-500/5 sm:p-10">
          <span className="absolute right-0 top-0 rounded-bl-2xl bg-brand-500 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-surface-950">
            Mesora Pro
          </span>
          <p className="text-sm text-zinc-400">Plan mensual Mesora Pro</p>
          <div className="mt-3 flex items-end gap-2">
            <span className="text-5xl font-black tracking-tight text-white">{mostrarPrecioPlan(precio)}</span>
            <span className="pb-1.5 text-sm text-zinc-500">/mes</span>
          </div>
          <ul className="mt-8 flex flex-col gap-3">
            {beneficios.map((b) => (
              <li key={b} className="flex items-start gap-3 text-sm text-zinc-300">
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand-500/15 text-brand-500">
                  <IconCheck className="h-3.5 w-3.5" />
                </span>
                {b}
              </li>
            ))}
          </ul>
          <div className="mt-7 rounded-xl border border-surface-700 bg-surface-950/60 p-4 text-sm leading-relaxed text-zinc-400">
            El restaurante conserva su proveedor actual de facturación electrónica. El alcance, soporte y puesta en marcha se detallan antes de contratar.
          </div>
          <a href="#contacto" className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 px-6 py-3.5 text-base font-bold text-surface-950 shadow-lg shadow-brand-500/25 transition hover:bg-brand-400">
            Solicitar una demostración <IconArrowRight className="h-5 w-5" />
          </a>
          <Link to="/demo" className="mt-4 block text-center text-sm font-semibold text-zinc-400 transition hover:text-white">
            Explorar demo primero
          </Link>
        </div>
      </div>
    </section>
  )
}
