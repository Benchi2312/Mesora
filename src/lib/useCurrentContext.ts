import { useLocation } from 'react-router-dom'
import { useDemoStore } from '../demo/demoStore'
import { useAuthStore } from '../store/auth'
import { mockRestaurante, mockUsuarios } from '../lib/mockData'
import type { Restaurante, Usuario } from '../types/database'

export interface CurrentContext {
  usuario: Usuario | null
  restaurante: Restaurante | null
  signOut: () => void
}

function esRutaDemo(pathname: string): boolean {
  return pathname === '/demo' || pathname.startsWith('/demo/')
}

function rolDemoDesdeRuta(pathname: string): Usuario['rol'] {
  const rolesPorRuta: Record<string, Usuario['rol']> = {
    admin: 'admin_restaurante',
    mesero: 'mesero',
    cocina: 'cocina',
    cajero: 'cajero',
  }
  return rolesPorRuta[pathname.split('/')[2] ?? ''] ?? 'mesero'
}

/**
 * Contexto del usuario actual.
 *   * Modo demo → usuario mock según el rol seleccionado + restaurante demo.
 *   * Normal     → datos de la sesión (auth store de Supabase).
 *
 * El modo demo se decide por la RUTA (igual que `getApi().enDemo()`), no por el
 * flag del store: así, al salir del demo hacia una ruta real, el contexto ya
 * entrega el restaurante real en el primer render y ninguna vista consulta la
 * base real con el id mock (`r-demo`).
 */
export function useCurrentContext(): CurrentContext {
  const { pathname } = useLocation()
  const restauranteDemo = useDemoStore((s) => s.restaurante)
  const auth = useAuthStore()

  if (esRutaDemo(pathname)) {
    // Deriva el usuario del rol de la ruta para que no se muestre el perfil
    // anterior mientras el efecto de DemoMode sincroniza el store.
    const rol = rolDemoDesdeRuta(pathname)
    const usuario = mockUsuarios.find((u) => u.rol === rol) ?? null
    return { usuario, restaurante: restauranteDemo ?? mockRestaurante, signOut: () => {} }
  }

  return {
    usuario: auth.usuario,
    restaurante: auth.restaurante,
    signOut: () => void auth.signOut(),
  }
}
