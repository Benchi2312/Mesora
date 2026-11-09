import { ESTACIONES_COMANDA, NOMBRES_ESTACION_COMANDA } from './impresionComandas'
import type {
  ConfiguracionOperativa,
  DestinoEstacion,
  EstadoDestinoEstacion,
  EstacionComanda,
  GrupoDestinoEstacion,
  ModoDestinoEstacion,
  ModalidadCobro,
  Producto,
  CategoriaProducto,
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

export type DestinoOperativoEditor = {
  id: string | null
  tipo: TipoDestinoEstacion
  grupo: GrupoDestinoEstacion
  nombre: string
  papel_mm: 58 | 80 | null
  configuracion: Record<string, unknown>
  activo: boolean
}

export type EstacionOperativaEditor = {
  id: string | null
  codigo: EstacionComanda
  nombre: string
  activo: boolean
  orden: number
  destinos: DestinoOperativoEditor[]
}

export type CategoriaOperativaEditor = Pick<CategoriaProducto, 'id' | 'nombre'> & {
  estacion_codigo: EstacionComanda | null
}

export type ProductoOperativoEditor = Pick<Producto, 'id' | 'nombre' | 'categoria_id' | 'estacion' | 'es_bebida'>

export type ConfiguracionOperativaEditor = {
  restaurante_id: string
  modalidad_cobro: ModalidadCobro
  version: number
  estaciones: EstacionOperativaEditor[]
  categorias: CategoriaOperativaEditor[]
  productos: ProductoOperativoEditor[]
  solo_lectura?: boolean
  limitacion?: string
}

export type CambiosConfiguracionOperativa = Pick<
  ConfiguracionOperativaEditor,
  'modalidad_cobro' | 'estaciones' | 'categorias'
>

/** Crea la primera vista del editor con los defaults que ya usa Mesora. */
export function crearEditorOperativoPredeterminado(
  restauranteId: string,
  categorias: readonly CategoriaProducto[] = [],
  productos: readonly Producto[] = [],
): ConfiguracionOperativaEditor {
  const inicial = crearConfiguracionOperativaPredeterminada(restauranteId)
  return {
    restaurante_id: restauranteId,
    modalidad_cobro: inicial.configuracion.modalidad_cobro,
    version: inicial.configuracion.version,
    estaciones: inicial.estaciones.map((estacion) => ({
      ...estacion,
      nombre: estacion.codigo === 'bar' ? 'Barra' : estacion.nombre,
      id: null,
      destinos: estacion.destinos.map((destino) => ({ ...destino, id: null })),
    })),
    categorias: categorias.map((categoria) => ({
      id: categoria.id,
      nombre: categoria.nombre,
      estacion_codigo: null,
    })),
    productos: productos.map(({ id, nombre, categoria_id, estacion, es_bebida }) => ({
      id, nombre, categoria_id, estacion, es_bebida,
    })),
  }
}

/** Convierte respuestas RPC a un modelo defensivo y rellena defaults faltantes. */
export function normalizarEditorOperativo(
  restauranteId: string,
  valor: unknown,
): ConfiguracionOperativaEditor | null {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return null
  const bruto = valor as Partial<ConfiguracionOperativaEditor>
  if (bruto.restaurante_id !== restauranteId || !Array.isArray(bruto.estaciones) ||
      !Array.isArray(bruto.categorias) || !Array.isArray(bruto.productos) ||
      !MODALIDADES_COBRO.includes(bruto.modalidad_cobro as ModalidadCobro)) return null
  const porCodigo = new Map(bruto.estaciones.map((e) => [e.codigo, e]))
  const base = crearEditorOperativoPredeterminado(restauranteId)
  return {
    restaurante_id: restauranteId,
    modalidad_cobro: bruto.modalidad_cobro as ModalidadCobro,
    version: Number.isInteger(bruto.version) && (bruto.version ?? 0) > 0 ? bruto.version! : 1,
    estaciones: base.estaciones.map((predeterminada) => {
      const recibida = porCodigo.get(predeterminada.codigo)
      if (!recibida) return predeterminada
      return {
        id: recibida.id ?? null,
        codigo: predeterminada.codigo,
        nombre: typeof recibida.nombre === 'string' && recibida.nombre.trim()
          ? (recibida.codigo === 'bar' && recibida.nombre === 'Bar' ? 'Barra' : recibida.nombre)
          : predeterminada.nombre,
        activo: recibida.activo !== false,
        orden: Number.isInteger(recibida.orden) && recibida.orden >= 0 ? recibida.orden : predeterminada.orden,
        destinos: Array.isArray(recibida.destinos) ? recibida.destinos.map((d) => ({
          id: d.id ?? null,
          tipo: d.tipo,
          grupo: d.grupo,
          nombre: d.nombre,
          papel_mm: d.papel_mm,
          configuracion: d.configuracion && typeof d.configuracion === 'object' ? d.configuracion : {},
          activo: d.activo !== false,
        })) : predeterminada.destinos,
      }
    }),
    categorias: bruto.categorias.filter((c) => c && typeof c.id === 'string').map((c) => ({
      id: c.id,
      nombre: c.nombre,
      estacion_codigo: ESTACIONES_COMANDA.includes(c.estacion_codigo as EstacionComanda) ? c.estacion_codigo as EstacionComanda : null,
    })),
    productos: bruto.productos.filter((p) => p && typeof p.id === 'string').map((p) => ({
      id: p.id,
      nombre: p.nombre,
      categoria_id: p.categoria_id ?? null,
      estacion: ESTACIONES_COMANDA.includes(p.estacion as EstacionComanda) ? p.estacion as EstacionComanda : null,
      es_bebida: p.es_bebida === true,
    })),
    solo_lectura: bruto.solo_lectura === true,
    limitacion: typeof bruto.limitacion === 'string' ? bruto.limitacion : undefined,
  }
}

export function validarCambiosConfiguracionOperativa(
  restauranteId: string,
  cambios: CambiosConfiguracionOperativa,
): string | null {
  if (!MODALIDADES_COBRO.includes(cambios.modalidad_cobro)) return 'Elige una modalidad de cobro válida.'
  if (!Array.isArray(cambios.estaciones) || cambios.estaciones.length !== ESTACIONES_COMANDA.length ||
      new Set(cambios.estaciones.map((e) => e.codigo)).size !== ESTACIONES_COMANDA.length ||
      !ESTACIONES_COMANDA.every((codigo) => cambios.estaciones.some((e) => e.codigo === codigo))) {
    return 'La configuración debe conservar Cocina, Barra y Otros.'
  }
  for (const estacion of cambios.estaciones) {
    if (!estacion.nombre.trim() || estacion.nombre.trim().length > 60 || !Number.isInteger(estacion.orden) || estacion.orden < 0) {
      return 'Revisa el nombre y el orden de las estaciones.'
    }
    for (const destino of estacion.destinos) {
      if (!destino.nombre.trim() || destino.nombre.trim().length > 80 || !TIPOS_DESTINO_ESTACION.includes(destino.tipo) ||
          !GRUPOS_DESTINO_ESTACION.includes(destino.grupo)) return 'Revisa el nombre y el tipo de los destinos.'
      if (destino.tipo === 'impresora') {
        const copias = Number(destino.configuracion.copias ?? 1)
        if ((destino.papel_mm !== 58 && destino.papel_mm !== 80) || !Number.isInteger(copias) || copias < 1 || copias > 5) {
          return 'Configura papel de 58 u 80 mm y entre 1 y 5 copias para cada impresora.'
        }
      } else if (destino.papel_mm !== null) return 'Los destinos KDS no llevan tamaño de papel.'
    }
  }
  const idsCategorias = cambios.categorias.map((c) => c.id)
  if (new Set(idsCategorias).size !== idsCategorias.length ||
      cambios.categorias.some((c) => !c.id || (c.estacion_codigo !== null && !ESTACIONES_COMANDA.includes(c.estacion_codigo)))) {
    return 'Hay una categoría o estación predeterminada inválida.'
  }
  // El identificador de restaurante llega separado y se valida en el backend;
  // este argumento documenta que el cliente no lo puede cambiar dentro del payload.
  if (!restauranteId) return 'No se encontró el restaurante de esta configuración.'
  return null
}

export function estacionEfectivaProducto(
  producto: ProductoOperativoEditor,
  categoria: CategoriaOperativaEditor | undefined,
): EstacionComanda {
  if (producto.estacion && ESTACIONES_COMANDA.includes(producto.estacion)) return producto.estacion
  if (categoria?.estacion_codigo) return categoria.estacion_codigo
  return producto.es_bebida ? 'bar' : 'cocina'
}

export function categoriaEsMixta(
  categoria: CategoriaOperativaEditor,
  productos: readonly ProductoOperativoEditor[],
): boolean {
  const asociados = productos.filter((producto) => producto.categoria_id === categoria.id)
  const estaciones = new Set(asociados.map((producto) => estacionEfectivaProducto(producto, categoria)))
  return estaciones.size > 1
}

export function productosConEstacionExplicita(
  categoriaId: string,
  productos: readonly ProductoOperativoEditor[],
): ProductoOperativoEditor[] {
  return productos.filter((producto) => producto.categoria_id === categoriaId && producto.estacion != null)
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
