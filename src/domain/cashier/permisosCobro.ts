import type { ModalidadCobro, Usuario } from '../../types/database'

/** NULL conserva la autorización anterior hasta que el admin aplique una regla. */
export type PoliticaCobro = {
  restaurante_id: string
  modalidad_cobro: ModalidadCobro
  modalidad_aplicada: ModalidadCobro | null
  usuarios_autorizados: string[]
}

export function normalizarPoliticaCobro(restauranteId: string, valor: unknown): PoliticaCobro | null {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return null
  const bruto = valor as Partial<PoliticaCobro>
  const modalidades = ['solo_cajero', 'cobro_por_mesero', 'caja_central_meseros_autorizados']
  if (bruto.restaurante_id !== restauranteId || !modalidades.includes(bruto.modalidad_cobro as string)
      || (bruto.modalidad_aplicada != null && !modalidades.includes(bruto.modalidad_aplicada))
      || !Array.isArray(bruto.usuarios_autorizados)
      || bruto.usuarios_autorizados.some((id) => typeof id !== 'string')) return null
  return bruto as PoliticaCobro
}

export function puedeCobrarConPolitica(
  actor: Pick<Usuario, 'id' | 'restaurante_id' | 'rol' | 'activo'> | null | undefined,
  restauranteId: string,
  politica: PoliticaCobro | null | undefined,
): boolean {
  if (!actor || actor.restaurante_id !== restauranteId || actor.activo === false) return false
  if (actor.rol === 'admin_restaurante') return true
  const modalidad = politica?.modalidad_aplicada
  if (!modalidad) return actor.rol === 'mesero'
  if (modalidad === 'solo_cajero' && actor.rol !== 'cajero') return false
  if (modalidad === 'cobro_por_mesero' && actor.rol !== 'mesero') return false
  if (modalidad === 'caja_central_meseros_autorizados' && actor.rol !== 'cajero' && actor.rol !== 'mesero') return false
  return politica.usuarios_autorizados.includes(actor.id)
}

export function validarPoliticaCobro(
  restauranteId: string,
  modalidad: ModalidadCobro,
  ids: readonly string[],
  personal: readonly Pick<Usuario, 'id' | 'restaurante_id' | 'rol' | 'activo'>[],
): string | null {
  if (!['solo_cajero', 'cobro_por_mesero', 'caja_central_meseros_autorizados'].includes(modalidad)) {
    return 'Elige una modalidad de cobro válida.'
  }
  if (ids.length < 1 || ids.length > 100 || new Set(ids).size !== ids.length) {
    return 'Selecciona entre 1 y 100 personas distintas para cobrar.'
  }
  const seleccionados = ids.map((id) => personal.find((u) => u.id === id && u.restaurante_id === restauranteId && u.activo !== false))
  if (seleccionados.some((u) => !u || !['mesero', 'cajero'].includes(u.rol))) {
    return 'Selecciona personal activo de este restaurante.'
  }
  const roles = seleccionados.map((u) => u!.rol)
  if (modalidad === 'solo_cajero' && roles.some((rol) => rol !== 'cajero')) return 'Solo puedes autorizar cajeros en esta modalidad.'
  if (modalidad === 'cobro_por_mesero' && roles.some((rol) => rol !== 'mesero')) return 'Solo puedes autorizar meseros en esta modalidad.'
  if (modalidad === 'caja_central_meseros_autorizados' && (!roles.includes('cajero') || !roles.includes('mesero'))) {
    return 'Autoriza al menos un cajero y un mesero para la modalidad mixta.'
  }
  return null
}
