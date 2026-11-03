import SectionHeading from './SectionHeading'

const preguntas = [
  {
    q: '¿Puedo probar Mesora antes de contratar?',
    r: 'Sí. El demo interactivo es público, no necesita cuenta y usa datos de ejemplo. Puedes recorrer las vistas de administración, mesero, cocina y caja.',
  },
  {
    q: '¿Mesora reemplaza mi sistema de facturación electrónica?',
    r: 'No. Mesora organiza pedidos, cuentas y cobros internos. El restaurante sigue emitiendo sus comprobantes con el proveedor de facturación que ya utiliza.',
  },
  {
    q: '¿El demo modifica los datos de mi restaurante?',
    r: 'No. Trabaja con datos de ejemplo en el navegador y no registra ventas reales ni modifica la base de datos operativa.',
  },
  {
    q: '¿Qué se necesita para empezar a usar Mesora?',
    r: 'Se configura el restaurante, sus usuarios y dispositivos, y se valida el flujo de trabajo e impresión con el equipo del local.',
  },
  {
    q: '¿El precio publicado incluye soporte y puesta en marcha?',
    r: 'El monto publicado es la referencia mensual del plan. Antes de contratar, se confirma contigo el alcance, la puesta en marcha y el soporte.',
  },
]

export default function PreguntasFrecuentes() {
  return (
    <section id="preguntas" className="mx-auto w-full max-w-7xl scroll-mt-16 px-4 py-24 sm:px-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <SectionHeading
          eyebrow="Preguntas frecuentes"
          title="Respuestas claras para evaluar Mesora"
          subtitle="Revisa el alcance del sistema y prueba el demo antes de conversar sobre la puesta en marcha."
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
