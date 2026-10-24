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
/** Producción debe fallar cerrada: nunca autenticar con usuarios de prueba. */
export const supabaseFaltaEnProduccion = import.meta.env.PROD && !supabaseConfigurado

if (!supabaseConfigurado && import.meta.env.DEV) {
  console.warn(
    'Faltan VITE_SUPABASE_URL y/o VITE_SUPABASE_ANON_KEY. En desarrollo se usará el backend local; en producción configura ambas variables.',
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
