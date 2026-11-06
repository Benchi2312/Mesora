import type { Mesa } from '../../types/database'

/** Misma comparación de nombres que `mesas_un_nombre_por_restaurante`. */
export function claveNombreMesa(nombre: string): string {
  return nombre.trim().normalize('NFKC').toLocaleLowerCase('es')
}

export function buscarMesaConNombre(
  mesas: readonly Mesa[],
  restauranteId: string,
  nombre: string,
  excluirMesaId?: string,
): Mesa | undefined {
  const clave = claveNombreMesa(nombre)
  if (!clave) return undefined
  return mesas.find(
    (mesa) => mesa.restaurante_id === restauranteId
      && mesa.id !== excluirMesaId
      && claveNombreMesa(mesa.nombre) === clave,
  )
}

export function mensajeNombreMesaDuplicado(nombre: string, zona?: string | null): string {
  const donde = zona ? ` en «${zona}»` : ''
  return `Ya existe una mesa llamada «${nombre}»${donde}. El nombre debe ser único en todo el restaurante, incluso entre zonas.`
}
