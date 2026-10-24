import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../types/database'

const url = import.meta.env?.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env?.VITE_SUPABASE_ANON_KEY as string | undefined

// Detecta credenciales ausentes o de relleno para no propagar errores de red
// ("TypeError: Failed to fetch") hacia la UI.
const hayUrlReal =
  !!url &&
  url !== 'https://placeholder.supabase.co' &&
  url !== 'https://TU-PROYECTO.supabase.co' &&
  url.startsWith('https://') &&
  url.includes('.supabase.')
const hayKeyReal = !!anonKey && anonKey !== 'placeholder-anon-key' && anonKey !== 'tu-anon-public-key'

/** Indica si hay credenciales reales de Supabase configuradas en env. */
export const supabaseConfigurado = hayUrlReal && hayKeyReal
/** El backend local solo se activa por opt-in en desarrollo; nunca en el piloto. */
export const modoLocalHabilitado =
  import.meta.env.DEV && import.meta.env.VITE_MESORA_MODO_LOCAL === 'true'
/** Sin backend configurado, la app falla cerrada en cualquier entorno. */
export const supabaseFaltaConfig = !supabaseConfigurado && !modoLocalHabilitado

if (!supabaseConfigurado && import.meta.env.DEV) {
  console.warn(
    'Faltan VITE_SUPABASE_URL y/o VITE_SUPABASE_ANON_KEY. Configura Supabase; el backend local requiere VITE_MESORA_MODO_LOCAL=true y solo funciona en desarrollo.',
  )
}

export const supabase: SupabaseClient<Database> = createClient<Database>(
  url ?? 'https://placeholder.supabase.co',
  anonKey ?? 'placeholder-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
)
