import type { ReactNode } from 'react'

interface PageHeaderProps {
  titulo: string
  descripcion?: string
  actions?: ReactNode
}

export default function PageHeader({ titulo, descripcion, actions }: PageHeaderProps) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-extrabold tracking-tight text-zinc-100 sm:text-3xl">
          {titulo}
        </h1>
        {descripcion && <p className="mt-1.5 text-sm text-zinc-500">{descripcion}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  )
}