export const ESTACIONES_ALERTA_COMANDAS = ['cocina', 'bar', 'otros'] as const

export type EstacionAlertaComanda = typeof ESTACIONES_ALERTA_COMANDAS[number]
export type SnapshotComandasPendientes = Readonly<Record<EstacionAlertaComanda, ReadonlySet<string>>>

export type TonoAlertaComanda = {
  tipo: 'inicio' | 'pulso' | 'cierre'
  inicioMs: number
  duracionMs: number
  frecuenciasHz: readonly number[]
  volumen: number
}

/** Secuencia sintetizada con Web Audio; no utiliza grabaciones ni material con copyright. */
export const SECUENCIA_ALERTA_COMANDA: readonly TonoAlertaComanda[] = [
  { tipo: 'inicio', inicioMs: 0, duracionMs: 500, frecuenciasHz: [784, 988, 1175], volumen: 0.24 },
  { tipo: 'pulso', inicioMs: 690, duracionMs: 290, frecuenciasHz: [1175], volumen: 0.23 },
  { tipo: 'pulso', inicioMs: 1320, duracionMs: 290, frecuenciasHz: [988], volumen: 0.23 },
  { tipo: 'cierre', inicioMs: 2600, duracionMs: 400, frecuenciasHz: [659, 880], volumen: 0.18 },
]

export const DURACION_ALERTA_COMANDA_MS = Math.max(
  ...SECUENCIA_ALERTA_COMANDA.map((tono) => tono.inicioMs + tono.duracionMs),
)

export type ResultadoDeteccionComandas = {
  primeraCarga: boolean
  idsNuevos: ReadonlySet<string>
  nuevasPorEstacion: SnapshotComandasPendientes
  idsConocidos: ReadonlySet<string>
  debeAlertar: boolean
}

/**
 * Compara una instantánea completa de estaciones. La primera lectura solo arma
 * la base; una llegada simultánea a varias estaciones sigue siendo un único lote.
 */
export function detectarComandasNuevas(
  idsConocidos: ReadonlySet<string> | null,
  idsActivos: ReadonlySet<string>,
  pendientes: SnapshotComandasPendientes,
): ResultadoDeteccionComandas {
  const nuevasPorEstacion = Object.fromEntries(
    ESTACIONES_ALERTA_COMANDAS.map((estacion) => [estacion, new Set<string>()]),
  ) as Record<EstacionAlertaComanda, Set<string>>

  if (idsConocidos === null) {
    return {
      primeraCarga: true,
      idsNuevos: new Set(),
      nuevasPorEstacion,
      idsConocidos: new Set(idsActivos),
      debeAlertar: false,
    }
  }

  const idsNuevos = new Set<string>()
  for (const estacion of ESTACIONES_ALERTA_COMANDAS) {
    for (const id of pendientes[estacion]) {
      if (idsConocidos.has(id)) continue
      nuevasPorEstacion[estacion].add(id)
      idsNuevos.add(id)
    }
  }

  return {
    primeraCarga: false,
    idsNuevos,
    nuevasPorEstacion,
    idsConocidos: new Set([...idsConocidos, ...idsActivos]),
    debeAlertar: idsNuevos.size > 0,
  }
}

/** Programa cada tono en una única llamada, con envolvente para evitar clics. */
export function programarAlertaComanda(contexto: AudioContext): void {
  const base = contexto.currentTime
  for (const tono of SECUENCIA_ALERTA_COMANDA) {
    const inicio = base + tono.inicioMs / 1000
    const fin = inicio + tono.duracionMs / 1000
    for (const frecuencia of tono.frecuenciasHz) {
      const oscilador = contexto.createOscillator()
      const volumen = contexto.createGain()
      oscilador.type = 'sine'
      oscilador.frequency.value = frecuencia
      volumen.gain.setValueAtTime(0.0001, inicio)
      volumen.gain.exponentialRampToValueAtTime(tono.volumen / tono.frecuenciasHz.length, inicio + 0.025)
      volumen.gain.setValueAtTime(tono.volumen / tono.frecuenciasHz.length, Math.max(inicio + 0.026, fin - 0.065))
      volumen.gain.exponentialRampToValueAtTime(0.0001, fin)
      oscilador.connect(volumen)
      volumen.connect(contexto.destination)
      oscilador.start(inicio)
      oscilador.stop(fin + 0.005)
    }
  }
}
