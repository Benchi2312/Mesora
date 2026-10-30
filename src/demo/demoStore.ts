import { create } from 'zustand'
import type { Restaurante, Rol } from '../types/database'
import type { SolicitudForm } from './guia'

/**
 * «Hazlo por mí» en los pasos con formulario no crea el registro en silencio:
 * pide al panel que abra ese formulario con datos sugeridos. La pestaña de
 * administración escucha la solicitud para activarse y el propio formulario la
 * consume y la limpia. Nunca afecta al modo local ni real.
 */
interface SolicitudPendiente extends SolicitudForm {
  n: number
}

interface DemoState {
  isDemo: boolean
  demoRol: Rol | null
  restaurante: Restaurante | null
  actualizarRestaurante: (restaurante: Restaurante) => void
  /**
   * Recorrido guiado activo: los formularios del demo abren con valores
   * sugeridos (ver `prefillDe` en guia.ts). Nunca afecta al modo local ni real.
   */
  prefillGuia: boolean
  /**
   * Autocompletado en curso: el formulario se está rellenando sola. La guía
   * se aparta mientras dura, para no tapar el modal. Nunca afecta al modo local
   * ni real.
   */
  autoLlenado: boolean
  solicitud: SolicitudPendiente | null
  enterDemo: (rol: Rol) => void
  exitDemo: () => void
  activarPrefillGuia: (activo: boolean) => void
  setAutoLlenado: (activo: boolean) => void
  solicitarFormulario: (s: SolicitudForm) => void
  limpiarSolicitud: () => void
}

export const useDemoStore = create<DemoState>()((set) => ({
  isDemo: false,
  demoRol: null,
  restaurante: null,
  actualizarRestaurante: (restaurante) => set({ restaurante }),
  prefillGuia: false,
  autoLlenado: false,
  solicitud: null,
  enterDemo: (rol) => set({ isDemo: true, demoRol: rol }),
  exitDemo: () =>
    set({ isDemo: false, demoRol: null, restaurante: null, prefillGuia: false, autoLlenado: false, solicitud: null }),
  activarPrefillGuia: (activo) => set({ prefillGuia: activo }),
  setAutoLlenado: (activo) => set({ autoLlenado: activo }),
  solicitarFormulario: (s) =>
    set((estado) => ({ solicitud: { ...s, n: (estado.solicitud?.n ?? 0) + 1 } })),
  limpiarSolicitud: () => set({ solicitud: null }),
}))
