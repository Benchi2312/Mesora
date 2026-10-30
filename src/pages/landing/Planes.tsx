import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import SectionHeading from './SectionHeading'
import { IconArrowRight, IconCheck } from './Icons'
import { supabase, supabaseConfigurado } from '../../lib/supabase'
import { mostrarPrecioPlan, PRECIO_PLAN_DEFECTO } from '../../domain/restaurant/configuracion'

const beneficios = [
  'Acceso a las 4 vistas: mesero, cocina, administración y mesas',
  'Dashboard de ventas con indicadores en tiempo real',
  'Mesas y zonas ilimitadas',
  'Métodos de pago: efectivo, Yape, Plin, tarjeta y link de pago',
  'Soporte por WhatsApp y correo',
]

export default function Planes() {
  const [precio, setPrecio] = useState<number>(PRECIO_PLAN_DEFECTO)

  useEffect(() => {
    let activo = true
    async function cargarPrecio() {
      const { data } = await supabase
        .from('configuracion_global')
        .select('precio_plan_mensual')
        .eq('id', 1)
        .maybeSingle()
      if (activo && data?.precio_plan_mensual != null) setPrecio(Number(data.precio_plan_mensual))
    }
    if (supabaseConfigurado) void cargarPrecio().catch(() => {})
    return () => {
      activo = false
    }
  }, [])

  return (
    <section id="planes" className="mx-auto w-full max-w-7xl scroll-mt-16 px-4 py-24 sm:px-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <SectionHeading
          eyebrow="Plan"
          title="Un solo plan, sin sorpresas"
          subtitle="Todo lo que tu restaurante necesita está incluido. Sin costos ocultos, sin cláusulas raras."
        />
      </div>

      <div className="mx-auto mt-10 max-w-xl">
        <div className="relative overflow-hidden rounded-3xl border border-brand-500/40 bg-surface-900 p-8 shadow-2xl shadow-brand-500/5 sm:p-10">
          <span className="absolute right-0 top-0 rounded-bl-2xl bg-brand-500 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-surface-950">
            Plan único
          </span>

          <h3 className="text-xl font-bold text-white">Mesora Pro</h3>
          <p className="mt-1 text-sm text-zinc-400">
            Para restaurantes que quieren crecer con orden y datos.
          </p>

          <div className="mt-6 flex items-end gap-1">
            <span className="text-5xl font-black tracking-tight text-white">{mostrarPrecioPlan(precio)}</span>
            <span className="pb-1.5 text-sm text-zinc-500">/mes</span>
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            Facturación mensual, sin permanencia. Cancela cuando quieras.
          </p>

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

          <Link
            to="/demo"
            className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 px-6 py-3.5 text-base font-bold text-surface-950 shadow-lg shadow-brand-500/25 transition hover:bg-brand-400"
          >
            Probar gratis
            <IconArrowRight className="h-5 w-5" />
          </Link>
          <p className="mt-3 text-center text-xs text-zinc-500">
            Sin tarjeta. Explora la demo completa antes de decidir.
          </p>
        </div>
      </div>
    </section>
  )
}