import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center gap-6 bg-surface-950 px-4 text-center">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-1/3 h-64 w-64 -translate-x-1/2 rounded-full bg-brand-500/10 blur-3xl" />
      </div>
      <p className="bg-gradient-to-b from-brand-400 to-brand-600 bg-clip-text text-7xl font-black tracking-tight text-transparent">
        404
      </p>
      <div>
        <p className="text-lg font-semibold text-zinc-200">Página no encontrada</p>
        <p className="mt-1 text-sm text-zinc-500">
          La página que buscas no existe o fue movida.
        </p>
      </div>
      <Link
        to="/"
        className="btn btn-primary rounded-lg px-5 py-2.5"
      >
        Volver al inicio
      </Link>
    </div>
  )
}