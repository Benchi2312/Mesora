import { Link } from 'react-router-dom'
import { IconArrowRight, IconCheck, IconPlay } from './Icons'

const comanda = [
  { nombre: 'Ceviche Clásico', cantidad: '2 ×', precio: 'S/ 56' },
  { nombre: 'Lomo Saltado', cantidad: '1 ×', precio: 'S/ 34' },
  { nombre: 'Limonada Frozen', cantidad: '2 ×', precio: 'S/ 20' },
  { nombre: 'Chicha Morada', cantidad: '1 ×', precio: 'S/ 8' },
]

export default function Hero() {
  return (
    <section id="inicio" className="relative overflow-hidden pt-16">
      <div className="absolute inset-0 -z-10">
        <img
          src="https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=2000&q=80"
          alt=""
          className="h-full w-full object-cover opacity-25"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-surface-950/70 via-surface-950 to-surface-950" />
      </div>

      <div className="mx-auto grid w-full max-w-7xl items-center gap-14 px-4 pb-24 pt-20 sm:px-6 lg:grid-cols-2 lg:pb-32 lg:pt-28">
        <div className="flex flex-col items-start gap-6">
          <span className="inline-flex items-center gap-2 rounded-full border border-brand-500/40 bg-brand-500/10 px-3.5 py-1.5 text-xs font-semibold text-brand-500">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
            Toma de pedidos para restaurantes
          </span>
          <h1 className="text-4xl font-black leading-[1.05] tracking-tight text-white sm:text-5xl lg:text-6xl">
            Tu restaurante,
            <br />
            <span className="text-brand-500">orden y rentabilidad</span>
          </h1>
          <p className="max-w-lg text-lg leading-relaxed text-zinc-400">
            Registra pedidos desde la mesa, mantén la cocina en sincronía, cierra
            cuentas en segundos y decide con datos reales. Todo desde un solo panel.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              to="/demo"
              className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-6 py-3 text-base font-bold text-surface-950 shadow-lg shadow-brand-500/25 transition hover:-translate-y-0.5 hover:bg-brand-400"
            >
              Probar el demo
              <IconArrowRight className="h-5 w-5" />
            </Link>
            <a
              href="#como-funciona"
              className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-6 py-3 text-base font-semibold text-white transition hover:-translate-y-0.5 hover:bg-white/10"
            >
              <IconPlay className="h-5 w-5" />
              Ver cómo funciona
            </a>
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 pt-4 text-sm text-zinc-400">
            <span className="inline-flex items-center gap-2">
              <IconCheck className="h-4 w-4 text-ok-500" />
              Sin instalación
            </span>
            <span className="inline-flex items-center gap-2">
              <IconCheck className="h-4 w-4 text-ok-500" />
              Ideal para MYPEs
            </span>
            <span className="inline-flex items-center gap-2">
              <IconCheck className="h-4 w-4 text-ok-500" />
              Demo funcional disponible
            </span>
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-md">
          <div className="absolute inset-0 rounded-[2.5rem] bg-brand-500/20 blur-3xl" />
          <div className="relative overflow-hidden rounded-3xl border border-surface-700 bg-surface-900 shadow-2xl shadow-black/60">
            <div className="flex items-center justify-between border-b border-surface-700 px-5 py-4">
              <div className="flex items-center gap-2.5">
                <span className="h-2.5 w-2.5 rounded-full bg-ok-500" />
                <p className="text-sm font-semibold text-white">Comanda · Mesa 3</p>
              </div>
              <span className="rounded-full bg-brand-500/15 px-2.5 py-1 text-xs font-semibold text-brand-500">
                En cocina
              </span>
            </div>
            <div className="space-y-3 px-5 py-5">
              {comanda.map((item) => (
                <div key={item.nombre} className="flex items-center justify-between text-sm">
                  <div>
                    <p className="font-medium text-zinc-100">{item.nombre}</p>
                    <p className="text-xs text-zinc-500">{item.cantidad}</p>
                  </div>
                  <p className="font-semibold text-white">{item.precio}</p>
                </div>
              ))}
              <div className="flex items-center justify-between border-t border-dashed border-surface-700 pt-4 text-sm">
                <p className="font-semibold text-zinc-300">Total</p>
                <p className="text-lg font-bold text-brand-500">S/ 118</p>
              </div>
            </div>
            <div className="flex gap-2 border-t border-surface-700 px-5 py-4">
              <span className="rounded-lg bg-ok-500/15 px-3 py-1.5 text-xs font-semibold text-ok-500">
                Cuenta cerrada
              </span>
              <span className="rounded-lg bg-surface-800 px-3 py-1.5 text-xs font-semibold text-zinc-300">
                4 métodos de pago
              </span>
            </div>
          </div>
          <div className="absolute -right-4 -top-4 hidden rotate-6 rounded-2xl border border-surface-700 bg-surface-900 px-4 py-3 shadow-xl lg:block">
            <p className="text-xs text-zinc-500">Venta de hoy</p>
            <p className="text-xl font-bold text-white">S/ 1,286</p>
          </div>
        </div>
      </div>
    </section>
  )
}