import type { Cuenta, Pedido, Restaurante, Usuario } from '../../types/database'

/**
 * Rangos que ofrece el panel de estadísticas globales del super admin. `mes` es
 * el mes calendario en curso; el resto son ventanas móviles que terminan hoy.
 */
export type PresetRango = 'hoy' | '7d' | 'mes' | '30d'

export const PRESETS_RANGO: { clave: PresetRango; etiqueta: string }[] = [
  { clave: 'hoy', etiqueta: 'Hoy' },
  { clave: '7d', etiqueta: 'Últimos 7 días' },
  { clave: 'mes', etiqueta: 'Este mes' },
  { clave: '30d', etiqueta: 'Últimos 30 días' },
]

const DIA = 86_400_000

/** Un punto del gráfico de evolución: un día (YYYY-MM-DD) y su valor agregado. */
export type PuntoSerie = { fecha: string; valor: number }

/** Una fila del ranking de restaurantes por actividad en el periodo. */
export type FilaRankingRestaurante = {
  restauranteId: string
  nombre: string
  pedidos: number
  ventas: number
}

export type CriterioRanking = 'ventas' | 'pedidos'

/** Totales de un mismo indicador en hoy, esta semana (lunes) y este mes. */
export type ComparacionRango = { hoy: number; semana: number; mes: number }

export type EstadisticasGlobales = {
  /** ISO del inicio del periodo consultado. */
  desde: string
  /** ISO del fin del periodo consultado. */
  hasta: string
  resumen: {
    /** Altas totales de restaurantes (acumulado, no depende del periodo). */
    restaurantesRegistrados: number
    /** Restaurantes con suscripción vigente AHORA (estado, no periodo). */
    restaurantesActivos: number
    /** Perfiles totales de la plataforma (estado, no periodo). */
    usuarios: number
    /** Perfiles con `activo = true` AHORA (estado, no periodo). */
    usuariosActivos: number
    /** Perfiles con rol de administrador (de restaurante o de plataforma) AHORA (estado, no periodo). */
    administradores: number
    /** Comandas creadas DENTRO del periodo. */
    pedidos: number
    /** Suma de cuentas `pagada` con `pagado_at` DENTRO del periodo. */
    ventas: number
    /** Restaurantes dados de alta DENTRO del periodo. */
    restaurantesNuevos: number
  }
  comparaciones: {
    pedidos: ComparacionRango
    ventas: ComparacionRango
    restaurantesNuevos: ComparacionRango
  }
  /** Solo restaurantes con pedidos o ventas en el periodo; ventas desc. */
  ranking: FilaRankingRestaurante[]
  evolucion: {
    restaurantes: PuntoSerie[]
    pedidos: PuntoSerie[]
    ventas: PuntoSerie[]
  }
}

function inicioDeDia(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

/** Lunes de la semana de `d` (la semana ISO empieza el lunes). */
function inicioDeSemana(d: Date): Date {
  const diasDesdeLunes = (d.getDay() + 6) % 7
  const x = inicioDeDia(d)
  x.setDate(x.getDate() - diasDesdeLunes)
  return x
}

function inicioDeMes(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

/**
 * Traduce el preset de la UI al rango `[desde, hasta]` que consume la RPC. Las
 * ventanas móviles arrancan al inicio del día para no cortar a mitad de jornada
 * (7d = hoy + 6 días previos).
 */
export function rangoDePreset(
  preset: PresetRango,
  ahora: Date = new Date(),
): { desde: string; hasta: string } {
  let desde: Date
  switch (preset) {
    case 'hoy':
      desde = inicioDeDia(ahora)
      break
    case '7d':
      desde = inicioDeDia(new Date(ahora.getTime() - 6 * DIA))
      break
    case '30d':
      desde = inicioDeDia(new Date(ahora.getTime() - 29 * DIA))
      break
    case 'mes':
      desde = inicioDeMes(ahora)
      break
  }
  return { desde: desde.toISOString(), hasta: ahora.toISOString() }
}

function enRango(iso: string | null | undefined, desdeMs: number, hastaMs: number): boolean {
  if (!iso) return false
  const t = new Date(iso).getTime()
  return !Number.isNaN(t) && t >= desdeMs && t <= hastaMs
}

/** ¿El restaurante puede operar ahora? (misma regla que `suSuscripcionVencida` invertida). */
function restauranteActivo(r: Restaurante, ahoraMs: number): boolean {
  if (!r.suscripcion_activa) return false
  if (!r.fecha_vencimiento) return true
  const t = new Date(r.fecha_vencimiento).getTime()
  return Number.isNaN(t) ? true : t >= ahoraMs
}

/** Días (YYYY-MM-DD, hora local) que abarca el rango, inclusive. */
export function diasDelRango(desde: string, hasta: string): string[] {
  const inicio = inicioDeDia(new Date(desde))
  const fin = inicioDeDia(new Date(hasta))
  const dias: string[] = []
  for (let t = inicio.getTime(); t <= fin.getTime(); t += DIA) {
    dias.push(claveDia(new Date(t)))
  }
  return dias
}

function claveDia(d: Date): string {
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mes}-${dia}`
}

/** `YYYY-MM-DD` → `DD/MM`, sin pasar por Date (evita corrimientos de zona horaria). */
export function etiquetaDia(fecha: string): string {
  const [, mes, dia] = fecha.split('-')
  return `${dia}/${mes}`
}

export function ordenarRanking(
  ranking: ReadonlyArray<FilaRankingRestaurante>,
  criterio: CriterioRanking,
): FilaRankingRestaurante[] {
  const secundario: CriterioRanking = criterio === 'ventas' ? 'pedidos' : 'ventas'
  return [...ranking].sort(
    (a, b) =>
      b[criterio] - a[criterio] || b[secundario] - a[secundario] || a.nombre.localeCompare(b.nombre),
  )
}

/**
 * Datos mínimos que necesita el cálculo para el backend local: los mismos
 * campos que agrega la RPC `admin_estadisticas_globales` en la base real.
 */
export type FuenteEstadisticas = {
  restaurantes: ReadonlyArray<
    Pick<Restaurante, 'id' | 'nombre' | 'suscripcion_activa' | 'fecha_vencimiento' | 'created_at'>
  >
  usuarios: ReadonlyArray<Pick<Usuario, 'activo' | 'created_at' | 'rol'>>
  pedidos: ReadonlyArray<Pick<Pedido, 'restaurante_id' | 'created_at'>>
  cuentas: ReadonlyArray<Pick<Cuenta, 'restaurante_id' | 'estado' | 'total' | 'pagado_at'>>
}

/**
 * Calcula las estadísticas globales en memoria. Es la MISMA fórmula que aplica
 * la RPC en la base (no se descarga ninguna tabla al navegador en producción);
 * acá solo la usa el backend local y la suite de verificación.
 *
 * Definiciones (idénticas al SQL):
 *   * venta   = `cuentas.total` con `estado = 'pagada'`, fechada por `pagado_at`;
 *   * pedido  = comanda creada en el periodo (`created_at`), sin importar estado;
 *   * activo  = `suscripcion_activa` y vencimiento nulo o futuro.
 */
export function calcularEstadisticasGlobales(
  fuente: FuenteEstadisticas,
  desde: string,
  hasta: string,
  ahora: Date = new Date(),
): EstadisticasGlobales {
  const desdeMs = new Date(desde).getTime()
  const hastaMs = new Date(hasta).getTime()
  const ahoraMs = ahora.getTime()
  const inicioHoy = inicioDeDia(ahora).getTime()
  const inicioSemana = inicioDeSemana(ahora).getTime()
  const inicioMes = inicioDeMes(ahora).getTime()

  const pagadas = fuente.cuentas.filter(
    (c) => c.estado === 'pagada' && c.pagado_at && enRango(c.pagado_at, desdeMs, hastaMs),
  )
  const pedidosPeriodo = fuente.pedidos.filter((p) => enRango(p.created_at, desdeMs, hastaMs))
  const nuevosPeriodo = fuente.restaurantes.filter((r) => enRango(r.created_at, desdeMs, hastaMs))

  const contar = (
    registros: ReadonlyArray<{ created_at: string }>,
    desdeComparacion: number,
  ): number =>
    registros.filter((r) => enRango(r.created_at, desdeComparacion, ahoraMs)).length

  const sumarVentas = (desdeComparacion: number): number =>
    c2(
      fuente.cuentas
        .filter((c) => c.estado === 'pagada' && enRango(c.pagado_at, desdeComparacion, ahoraMs))
        .reduce((a, c) => a + c.total, 0),
    )

  // Ranking: una fila por restaurante con actividad en el periodo.
  const ranking: FilaRankingRestaurante[] = fuente.restaurantes
    .map((r) => {
      const pedidos = pedidosPeriodo.filter((p) => p.restaurante_id === r.id).length
      const ventas = c2(
        pagadas.filter((c) => c.restaurante_id === r.id).reduce((a, c) => a + c.total, 0),
      )
      return { restauranteId: r.id, nombre: r.nombre, pedidos, ventas }
    })
    .filter((f) => f.pedidos > 0 || f.ventas > 0)
    .sort(
      (a, b) =>
        b.ventas - a.ventas || b.pedidos - a.pedidos || a.nombre.localeCompare(b.nombre),
    )

  // Evolución diaria del periodo.
  const dias = diasDelRango(desde, hasta)
  const serieConteo = (fechas: string[]): PuntoSerie[] => {
    const mapa = new Map<string, number>()
    for (const iso of fechas) {
      if (!iso) continue
      const clave = claveDia(new Date(iso))
      mapa.set(clave, (mapa.get(clave) ?? 0) + 1)
    }
    return dias.map((fecha) => ({ fecha, valor: mapa.get(fecha) ?? 0 }))
  }
  const serieVentas = (): PuntoSerie[] => {
    const mapa = new Map<string, number>()
    for (const c of pagadas) {
      const clave = claveDia(new Date(c.pagado_at as string))
      mapa.set(clave, (mapa.get(clave) ?? 0) + c.total)
    }
    return dias.map((fecha) => ({ fecha, valor: c2(mapa.get(fecha) ?? 0) }))
  }

  return {
    desde,
    hasta,
    resumen: {
      restaurantesRegistrados: fuente.restaurantes.length,
      restaurantesActivos: fuente.restaurantes.filter((r) => restauranteActivo(r, ahoraMs)).length,
      usuarios: fuente.usuarios.length,
      usuariosActivos: fuente.usuarios.filter((u) => u.activo !== false).length,
      administradores: fuente.usuarios.filter(
        (u) => u.rol === 'admin_restaurante' || u.rol === 'super_admin',
      ).length,
      pedidos: pedidosPeriodo.length,
      ventas: c2(pagadas.reduce((a, c) => a + c.total, 0)),
      restaurantesNuevos: nuevosPeriodo.length,
    },
    comparaciones: {
      pedidos: {
        hoy: contar(fuente.pedidos, inicioHoy),
        semana: contar(fuente.pedidos, inicioSemana),
        mes: contar(fuente.pedidos, inicioMes),
      },
      ventas: { hoy: sumarVentas(inicioHoy), semana: sumarVentas(inicioSemana), mes: sumarVentas(inicioMes) },
      restaurantesNuevos: {
        hoy: contar(fuente.restaurantes, inicioHoy),
        semana: contar(fuente.restaurantes, inicioSemana),
        mes: contar(fuente.restaurantes, inicioMes),
      },
    },
    ranking,
    evolucion: {
      restaurantes: serieConteo(nuevosPeriodo.map((r) => r.created_at)),
      pedidos: serieConteo(pedidosPeriodo.map((p) => p.created_at)),
      ventas: serieVentas(),
    },
  }
}

/** Redondeo a 2 decimales (los soles no tienen centavos menores a 1/100). */
function c2(n: number): number {
  return Math.round(n * 100) / 100
}
