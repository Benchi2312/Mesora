import SectionHeading from './SectionHeading'

const preguntas = [
  {
    q: '¿Mesora reemplaza mi sistema de facturación electrónica?',
    r: 'Mesora gestiona pedidos, cuentas y cobros internos. El restaurante sigue emitiendo sus comprobantes con el proveedor de facturación que ya utiliza.',
  },
  {
    q: '¿La demo usa datos reales?',
    r: 'No. La demo trabaja con datos de ejemplo para recorrer las vistas de administración, mesero, cocina y caja.',
  },
  {
    q: '¿Qué necesito para poner Mesora en marcha en mi local?',
    r: 'Se configura el restaurante, sus usuarios, dispositivos, conexión a internet y el flujo de impresión que utiliza.',
  },
  {
    q: '¿El precio publicado incluye soporte y puesta en marcha?',
    r: 'El precio publicado es la referencia mensual del plan. La propuesta debe detallar el alcance, soporte y puesta en marcha.',
  },
]

export default function PreguntasFrecuentes() {
  return (
    <section id="preguntas" className="mx-auto w-full max-w-7xl scroll-mt-16 px-4 py-24 sm:px-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <SectionHeading
          eyebrow="Preguntas frecuentes"
          title="Lo importante antes de probar Mesora"
          subtitle="Alcance claro para que puedas evaluar si encaja con la operación de tu restaurante."
        />
      </div>
      <div className="mx-auto mt-10 max-w-3xl divide-y divide-surface-800 rounded-2xl border border-surface-800 bg-surface-900/60 px-5 sm:px-7">
        {preguntas.map(({ q, r }) => (
          <details key={q} className="group py-5">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold text-white marker:hidden">
              {q}
              <span aria-hidden="true" className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-surface-700 text-brand-400 transition group-open:rotate-45">+</span>
            </summary>
            <p className="max-w-2xl pt-3 text-sm leading-relaxed text-zinc-400">{r}</p>
          </details>
        ))}
      </div>
    </section>
  )
}
