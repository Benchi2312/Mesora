import type { ReactNode } from 'react'

interface EstadoVacioProps {
  icono?: ReactNode
  titulo: string
  descripcion?: string
  className?: string
}

export default function EstadoVacio({ icono, titulo, descripcion, className = '' }: EstadoVacioProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-surface-700 bg-surface-900/40 px-6 py-12 text-center ${className}`}
    >
      {icono && (
        <span className="mb-1 grid h-12 w-12 place-items-center rounded-2xl border border-surface-700 bg-surface-800/60 text-zinc-400">
          {icono}
        </span>
      )}
      <p className="text-sm font-semibold text-zinc-300">{titulo}</p>
      {descripcion && <p className="max-w-sm text-sm text-zinc-500">{descripcion}</p>}
    </div>
  )
}