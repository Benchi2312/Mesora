export type ObservacionAsignacionMesa = {
  ok: boolean
  estadoMesa?: string | null
  meseroResponsableId?: string | null
}

export type EstadoReconciliacionAsignacion = 'confirmado' | 'sin_cambios' | 'otro_cambio' | 'incierto'

export type ResultadoReconciliacionAsignacion = {
  estado: EstadoReconciliacionAsignacion
  meseroResponsableId?: string | null
}

export function evaluarAsignacionMesaMesero(
  meseroAnteriorId: string | null,
  meseroDestinoId: string,
  observacion: ObservacionAsignacionMesa,
): EstadoReconciliacionAsignacion {
  if (!observacion.ok || !observacion.estadoMesa || !('meseroResponsableId' in observacion)) return 'incierto'
  if (observacion.estadoMesa !== 'ocupada') return 'otro_cambio'
  if (observacion.meseroResponsableId === meseroDestinoId) return 'confirmado'
  if (observacion.meseroResponsableId === meseroAnteriorId) return 'sin_cambios'
  return 'otro_cambio'
}

const ESPERAS_MS = [200, 400, 800, 1200] as const

/**
 * Tras una respuesta incierta, observa el responsable persistido varias veces.
 * Solo informa éxito si una lectura reciente muestra la mesa ocupada y al
 * mesero solicitado; nunca reejecuta la RPC.
 */
export async function reconciliarAsignacionMesaMesero(
  meseroAnteriorId: string | null,
  meseroDestinoId: string,
  observar: () => Promise<ObservacionAsignacionMesa>,
  esperar: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<ResultadoReconciliacionAsignacion> {
  let lecturasInciertas = false
  let ultimoResponsableId: string | null | undefined

  for (let intento = 0; intento <= ESPERAS_MS.length; intento++) {
    if (intento > 0) await esperar(ESPERAS_MS[intento - 1])
    let observacion: ObservacionAsignacionMesa
    try {
      observacion = await observar()
    } catch {
      lecturasInciertas = true
      continue
    }

    if (!observacion.ok || !observacion.estadoMesa || !('meseroResponsableId' in observacion)) {
      lecturasInciertas = true
      continue
    }
    ultimoResponsableId = observacion.meseroResponsableId ?? null
    const estado = evaluarAsignacionMesaMesero(meseroAnteriorId, meseroDestinoId, observacion)
    if (estado === 'confirmado' || estado === 'otro_cambio') {
      return { estado, meseroResponsableId: ultimoResponsableId }
    }
  }

  return {
    estado: lecturasInciertas ? 'incierto' : 'sin_cambios',
    ...(ultimoResponsableId !== undefined ? { meseroResponsableId: ultimoResponsableId } : {}),
  }
}
