import type { Restaurante } from '../../types/database'
import { esDominioValido, normalizarDominio } from '../security/dominio'

/** Columnas editables por el administrador del restaurante. */
export type CambiosDatosLocal = Partial<Pick<Restaurante,
  'nombre' | 'ruc' | 'direccion' | 'telefono' | 'email_contacto' | 'dominio'
>>

const CAMPOS = ['nombre', 'ruc', 'direccion', 'telefono', 'email_contacto', 'dominio'] as const

/** Valida antes de escribir: evita cambios parciales y payloads fuera del contrato. */
export function prepararDatosLocal(cambios: CambiosDatosLocal): {
  data: CambiosDatosLocal | null; error: string | null
} {
  if (Object.keys(cambios).some((campo) => !CAMPOS.includes(campo as typeof CAMPOS[number]))) {
    return { data: null, error: 'Hay campos que no se pueden modificar desde Datos del local.' }
  }
  const data: CambiosDatosLocal = {}
  for (const campo of CAMPOS) {
    const valor = cambios[campo]
    if (valor === undefined) continue
    if (valor !== null && typeof valor !== 'string') {
      return { data: null, error: 'Los datos del local deben contener texto válido.' }
    }
    const limpio = valor?.trim() ?? ''
    if (campo === 'nombre') {
      if (!limpio) return { data: null, error: 'El nombre no puede quedar vacío' }
      data.nombre = limpio
    } else if (campo === 'dominio') {
      const dominio = normalizarDominio(limpio)
      if (dominio && (dominio.length > 253 || !esDominioValido(dominio))) {
        return { data: null, error: 'Ingresa un dominio válido (ej. litoral.pe).' }
      }
      data.dominio = dominio || null
    } else {
      data[campo] = limpio || null
    }
  }
  if (data.ruc && !/^\d{11}$/.test(data.ruc)) return { data: null, error: 'El RUC debe tener 11 dígitos.' }
  if (data.telefono && !/^[+()\d\s.-]{6,20}$/.test(data.telefono)) return { data: null, error: 'Ingresa un teléfono válido.' }
  if (data.email_contacto && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email_contacto)) return { data: null, error: 'Ingresa un correo válido.' }
  if (!Object.keys(data).length) return { data: null, error: 'No hay datos del local para actualizar.' }
  return { data, error: null }
}
