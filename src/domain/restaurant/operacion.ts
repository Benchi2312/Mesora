import { ESTACIONES_COMANDA, NOMBRES_ESTACION_COMANDA } from './impresionComandas'
import type {
  ConfiguracionOperativa,
  DestinoEstacion,
  EstadoDestinoEstacion,
  EstacionComanda,
  GrupoDestinoEstacion,
  ModoDestinoEstacion,
  ModalidadCobro,
  TipoDestinoEstacion,
} from '../../types/database'

export const MODALIDADES_COBRO: readonly ModalidadCobro[] = [
  'solo_cajero',
  'cobro_por_mesero',
  'caja_central_meseros_autorizados',
]

export const TIPOS_DESTINO_ESTACION: readonly TipoDestinoEstacion[] = ['kds', 'impresora']
export const GRUPOS_DESTINO_ESTACION: readonly GrupoDestinoEstacion[] = ['principal', 'respaldo']
export const MODOS_DESTINO_ESTACION: readonly ModoDestinoEstacion[] = [
  'kds',
  'impresora',
  'ambos',
  'ninguno',
]

export const MODALIDAD_COBRO_PREDETERMINADA: ModalidadCobro = 'cobro_por_mesero'

export type DestinoConfiguradoInicial = Pick<
  DestinoEstacion,
  'tipo' | 'grupo' | 'nombre' | 'papel_mm' | 'configuracion' | 'activo'
>

export type EstacionConfiguradaInicial = {
  codigo: EstacionComanda
  nombre: string
  activo: boolean
  orden: number
  destinos: DestinoConfiguradoInicial[]
}

export type ConfiguracionOperativaInicial = {
  configuracion: Pick<ConfiguracionOperativa, 'restaurante_id' | 'modalidad_cobro' | 'version'>
  estaciones: EstacionConfiguradaInicial[]
}

/**
 * Defaults que mantienen el comportamiento actual: las tres estaciones siguen
 * disponibles en el KDS, el cobro continúa por mesero y no se habilita impresión.
 */
export function crearConfiguracionOperativaPredeterminada(
  restauranteId: string,
): ConfiguracionOperativaInicial {
  return {
    configuracion: {
      restaurante_id: restauranteId,
      modalidad_cobro: MODALIDAD_COBRO_PREDETERMINADA,
      version: 1,
    },
    estaciones: ESTACIONES_COMANDA.map((codigo, indice) => ({
      codigo,
      nombre: NOMBRES_ESTACION_COMANDA[codigo],
      activo: true,
      orden: (indice + 1) * 10,
      destinos: [{
        tipo: 'kds',
        grupo: 'principal',
        nombre: `KDS ${NOMBRES_ESTACION_COMANDA[codigo]}`,
        papel_mm: null,
        configuracion: {},
        activo: true,
      }],
    })),
  }
}

export function estadoDeDestino(activo: boolean): EstadoDestinoEstacion {
  return activo ? 'activo' : 'inactivo'
}

export function destinosActivosDelGrupo<T extends Pick<DestinoEstacion, 'activo' | 'grupo'>>(
  destinos: readonly T[],
  grupo: GrupoDestinoEstacion,
): T[] {
  return destinos.filter((destino) => destino.activo && destino.grupo === grupo)
}

/** Resuelve los destinos principales activos; los respaldos no se suman al envío paralelo. */
export function modoDestinoEstacion(
  destinos: readonly Pick<DestinoEstacion, 'activo' | 'grupo' | 'tipo'>[],
): ModoDestinoEstacion {
  const tipos = new Set(
    destinosActivosDelGrupo(destinos, 'principal').map((destino) => destino.tipo),
  )
  const tieneKds = tipos.has('kds')
  const tieneImpresora = tipos.has('impresora')

  if (tieneKds && tieneImpresora) return 'ambos'
  if (tieneKds) return 'kds'
  if (tieneImpresora) return 'impresora'
  return 'ninguno'
}
