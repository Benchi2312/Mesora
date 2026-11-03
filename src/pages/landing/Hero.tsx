import { Link } from 'react-router-dom'
import { IconArrowRight, IconCheck } from './Icons'

const roles = [
  { nombre: 'Mesero', detalle: 'Registra pedidos desde la mesa', estado: 'Pedido enviado' },
  { nombre: 'Cocina', detalle: 'Prepara y actualiza comandas', estado: 'En preparación' },
  { nombre: 'Caja', detalle: 'Revisa consumos y cierra cuentas', estado: 'Cuenta lista' },
]

export default function Hero() {
  return (
    <section id="inicio" className="relative overflow-hidden pt-16">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_75%_15%,rgba(255,149,0,0.14),transparent_42%)]" />
      <div className="mx-auto grid w-full max-w-7xl items-center gap-14 px-4 pb-24 pt-20 sm:px-6 lg:grid-cols-2 lg:pb-32 lg:pt-28">
        <div className="flex flex-col items-start gap-6">
          <span className="inline-flex items-center gap-2 rounded-full border border-brand-500/40 bg-brand-500/10 px-3.5 py-1.5 text-xs font-semibold text-brand-400">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
            Operación de restaurantes, en un solo flujo
          </span>
          <h1 className="text-4xl font-black leading-[1.05] tracking-tight text-white sm:text-5xl lg:text-6xl">
            Del pedido al cierre,
            <br />
            <span className="text-brand-500">con todo en orden.</span>
          </h1>
          <p className="max-w-lg text-lg leading-relaxed text-zinc-400">
            Meseros, cocina, caja y administración trabajan sobre la misma operación. Registra
            consumos por mesa, sigue las comandas y consulta las ventas del local.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              to="/demo"
              className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-6 py-3 text-base font-bold text-surface-950 shadow-lg shadow-brand-500/25 transition hover:-translate-y-0.5 hover:bg-brand-400"
            >
              Explorar demo
              <IconArrowRight className="h-5 w-5" />
            </Link>
            <a
              href="#contacto"
              className="inline-flex items-center rounded-xl border border-white/15 bg-white/5 px-6 py-3 text-base font-semibold text-white transition hover:-translate-y-0.5 hover:bg-white/10"
            >
              Solicitar una demostración
            </a>
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 pt-2 text-sm text-zinc-400">
            {['Acceso desde navegador', 'Vistas por rol', 'Demo con datos de ejemplo'].map((item) => (
              <span key={item} className="inline-flex items-center gap-2">
                <IconCheck className="h-4 w-4 text-ok-500" />
                {item}
              </span>
            ))}
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-xl">
          <div className="absolute inset-8 rounded-[2.5rem] bg-brand-500/15 blur-3xl" />
          <div className="relative overflow-hidden rounded-3xl border border-surface-700 bg-surface-900 shadow-2xl shadow-black/60">
            <div className="flex items-center justify-between border-b border-surface-700 px-5 py-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-widest text-zinc-500">Mesora</p>
                <p className="mt-1 text-lg font-bold text-white">Una operación conectada</p>
              </div>
              <span className="rounded-full border border-brand-500/30 bg-brand-500/10 px-3 py-1 text-xs font-semibold text-brand-300">
                Vista ilustrativa
              </span>
            </div>
            <div className="space-y-3 p-5 sm:p-6">
              {roles.map((role, index) => (
                <div key={role.nombre} className="flex items-center gap-4 rounded-2xl border border-surface-700 bg-surface-950/70 p-4">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-500/10 text-sm font-black text-brand-400">
                    0{index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-white">{role.nombre}</p>
                    <p className="mt-0.5 text-sm text-zinc-400">{role.detalle}</p>
                  </div>
                  <span className="hidden rounded-full bg-surface-800 px-3 py-1 text-xs font-medium text-zinc-300 sm:inline-flex">
                    {role.estado}
                  </span>
                </div>
              ))}
              <div className="rounded-2xl border border-dashed border-surface-700 px-4 py-3 text-center text-xs leading-relaxed text-zinc-500">
                Esquema del flujo de Mesora. La demo interactiva muestra datos ficticios y se puede explorar por rol.
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
