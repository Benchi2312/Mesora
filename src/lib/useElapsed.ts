import { useEffect, useState } from 'react'

function diffMs(iso: string): number {
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return 0
  return Math.max(0, Date.now() - t)
}

/** Formatea una duración en minutos/horas, ej. "3 min" o "1 h 24 min". */
export function fmtDuracion(ms: number): string {
  const min = Math.floor(ms / 60_000)
  if (min < 1) return 'recién'
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m === 0 ? `${h} h` : `${h} h ${m} min`
}

/**
 * Devuelve el tiempo transcurrido desde una fecha ISO, actualizándose cada
 * `intervaloMs`. Útil para el cronómetro de la pantalla de cocina.
 */
export function useElapsed(desdeIso: string | null | undefined, intervaloMs = 30_000): string {
  const [, setTick] = useState(0)

  useEffect(() => {
    if (!desdeIso) return
    const id = setInterval(() => setTick((t) => t + 1), intervaloMs)
    return () => clearInterval(id)
  }, [desdeIso, intervaloMs])

  return desdeIso ? fmtDuracion(diffMs(desdeIso)) : '—'
}