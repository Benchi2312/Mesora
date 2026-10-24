import type { Restaurante } from '../../types/database'
import { estadoOperativo, estadoSuscripcion } from '../../lib/restaurantes'

/** "Operando" / "Detenido": si el restaurante puede entrar y trabajar hoy. */
export function ChipOperativo({ r }: { r: Restaurante }) {
  const operando = estadoOperativo(r) === 'operando'
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${
        operando ? 'border-ok-500/40 bg-ok-500/10 text-ok-500' : 'border-danger-500/40 bg-danger-500/10 text-danger-500'
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${operando ? 'bg-ok-500' : 'bg-danger-500'}`} />
      {operando ? 'Operando' : 'Detenido'}
    </span>
  )
}

/** Estado de la suscripción: Activa / Por vencer / Vencida / Suspendida. */
export function ChipSuscripcion({ r }: { r: Restaurante }) {
  const estado = estadoSuscripcion(r)
  const estilo = {
    activa: 'border-ok-500/40 bg-ok-500/10 text-ok-500',
    por_vencer: 'border-warn-500/40 bg-warn-500/10 text-warn-500',
    vencida: 'border-danger-500/40 bg-danger-500/10 text-danger-500',
    suspendida: 'border-zinc-500/40 bg-zinc-500/10 text-zinc-400',
  }[estado]
  const punto = {
    activa: 'bg-ok-500',
    por_vencer: 'bg-warn-500',
    vencida: 'bg-danger-500',
    suspendida: 'bg-zinc-500',
  }[estado]
  const texto = {
    activa: 'Activa',
    por_vencer: 'Por vencer',
    vencida: 'Vencida',
    suspendida: 'Suspendida',
  }[estado]
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${estilo}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${punto}`} />
      {texto}
    </span>
  )
}

/**
 * Activo / Desactivado de una cuenta de usuario. Desactivar nunca borra: la
 * persona deja de poder operar, pero su fila y su cuenta de Auth siguen ahí.
 */
export function ChipUsuario({ activo }: { activo: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${
        activo ? 'border-ok-500/40 bg-ok-500/10 text-ok-500' : 'border-danger-500/40 bg-danger-500/10 text-danger-500'
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${activo ? 'bg-ok-500' : 'bg-danger-500'}`} />
      {activo ? 'Activo' : 'Desactivado'}
    </span>
  )
}
