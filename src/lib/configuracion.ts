// Lógica pura de la sección "Configuración" del super admin: datos editables y
// validación. El backend solo persiste/configura; las reglas viven acá.
//
// Incluye el precio mensual del plan único "Mesora Pro": el super admin lo
// edita desde el panel y la landing lo muestra en público en soles.

import type { ConfiguracionGlobal } from '../types/database'

/** Campos que el super admin puede editar. */
export type DatosConfiguracionGlobal = {
  nombre_app: string
  correo_soporte?: string | null
  telefono_soporte?: string | null
  logo_url?: string | null
  informacion?: string | null
  /**
   * Precio mensual del plan (soles). Opcional porque la validación también se
   * usa con "patches" parciales en los tests; si no viene, se conserva el
   * actual (por defecto 120).
   */
  precio_plan_mensual?: number | null
}

/** Precio mensual por defecto del plan único (igual que la siembra de la BD). */
export const PRECIO_PLAN_DEFECTO = 120

/** Configuración por defecto (igual que la siembra de la BD). */
export const CONFIGURACION_POR_DEFECTO: Omit<ConfiguracionGlobal, 'updated_at' | 'updated_by'> = {
  id: 1,
  nombre_app: 'Mesora',
  correo_soporte: null,
  telefono_soporte: null,
  logo_url: null,
  informacion: null,
  precio_plan_mensual: PRECIO_PLAN_DEFECTO,
}

const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function limpiar(v: string | null | undefined): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

function centimos(v: number): number {
  return Math.round(v * 100) / 100
}

/**
 * Valida los datos de configuración. Devuelve el mensaje de error o `null`.
 * Los mensajes son los mismos que usa el backend local para que no discrepen.
 */
export function validarConfiguracionGlobal(datos: DatosConfiguracionGlobal): string | null {
  if (!datos.nombre_app || !datos.nombre_app.trim()) {
    return 'El nombre de la aplicación no puede quedar vacío.'
  }
  const correo = limpiar(datos.correo_soporte)
  if (correo && !EMAIL_OK.test(correo)) {
    return 'Ingresa un correo de soporte válido.'
  }
  const precio = datos.precio_plan_mensual
  if (precio === null) {
    return 'El precio del plan mensual debe ser mayor que cero.'
  }
  if (precio !== undefined && (!Number.isFinite(precio) || precio <= 0)) {
    return 'El precio del plan mensual debe ser mayor que cero.'
  }
  return null
}

/** Normaliza los datos antes de guardarlos (trim + vacíos a null). */
export function normalizarConfiguracionGlobal(
  datos: DatosConfiguracionGlobal,
): Required<DatosConfiguracionGlobal> {
  return {
    nombre_app: datos.nombre_app.trim(),
    correo_soporte: limpiar(datos.correo_soporte),
    telefono_soporte: limpiar(datos.telefono_soporte),
    logo_url: limpiar(datos.logo_url),
    informacion: limpiar(datos.informacion),
    precio_plan_mensual:
      datos.precio_plan_mensual === undefined || datos.precio_plan_mensual === null
        ? PRECIO_PLAN_DEFECTO
        : centimos(datos.precio_plan_mensual),
  }
}

/** Muestra el precio en soles para la landing (S/ 120 o S/ 120,50). */
export function mostrarPrecioPlan(precio: number): string {
  const n = centimos(Number.isFinite(precio) ? precio : PRECIO_PLAN_DEFECTO)
  const entero = Math.trunc(n)
  const decimales = Math.round((n - entero) * 100)
  const textoSinMiles = decimales > 0 ? `${entero},${String(decimales).padStart(2, '0')}` : `${entero}`
  return `S/ ${textoSinMiles}`
}