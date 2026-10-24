import { create } from 'zustand'
import type { Session } from '@supabase/supabase-js'
import { apiMode, enDemo } from '../lib/api'
import {
  modoLocalHabilitado,
  supabase,
  supabaseConfigurado,
  supabaseFaltaConfig,
} from '../lib/supabase'
import { cargarDatosLocal, localCredenciales, localSeed } from '../lib/localSeed'
import type { Restaurante, Usuario } from '../types/database'

/** Clave en localStorage que persiste la sesión del backend local simulado. */
const KEY_SESION_LOCAL = 'mesora.local.sesion'

function mensajeErrorAuth(mensaje: string): string {
  if (/invalid login credentials/i.test(mensaje)) return 'El correo o la contraseña no son correctos.'
  if (/email not confirmed/i.test(mensaje)) return 'Confirma tu correo antes de iniciar sesión.'
  if (/too many requests|rate limit/i.test(mensaje)) return 'Demasiados intentos. Espera un momento y vuelve a intentarlo.'
  if (/new password should be different from the old password|new password.*same as.*old password/i.test(mensaje)) {
    return 'La nueva contraseña debe ser distinta a la contraseña actual. Elige una que no hayas usado antes.'
  }
  if (/password should be at least|password is too short/i.test(mensaje)) return 'La contraseña debe tener al menos 8 caracteres.'
  if (/fetch|network|timeout|connection/i.test(mensaje)) return 'No se pudo conectar con el servidor. Revisa tu conexión e intenta de nuevo.'
  return mensaje
}

/** Devuelve true si la suscripción del restaurante está vencida o inactiva. */
export function suSuscripcionVencida(r: Restaurante | null): boolean {
  if (!r) return false
  if (!r.suscripcion_activa) return true
  if (r.fecha_vencimiento) {
    const t = new Date(r.fecha_vencimiento).getTime()
    if (!Number.isNaN(t)) return t < Date.now()
  }
  return false
}

/**
 * Construye una sesión con la misma forma que la de Supabase, pero para el
 * backend local simulado. Solo se usa en modo local (Sin supabase configurado).
 */
function sesionDeUsuario(usuario: Usuario): Session {
  const ahora = Math.floor(Date.now() / 1000)
  return {
    access_token: 'sesion-local',
    refresh_token: 'sesion-local-refresh',
    expires_in: 3600,
    expires_at: ahora + 3600,
    token_type: 'bearer',
    user: {
      id: usuario.id,
      aud: 'authenticated',
      role: usuario.rol,
      email: usuario.email ?? undefined,
      app_metadata: {},
      user_metadata: {},
      created_at: usuario.created_at,
      updated_at: usuario.created_at,
    },
  } as Session
}

function restauranteDeUsuario(usuario: Usuario): Restaurante | null {
  if (!usuario.restaurante_id) return null
  return localSeed.restaurantes.find((r) => r.id === usuario.restaurante_id) ?? null
}

interface AuthState {
  session: Session | null
  usuario: Usuario | null
  restaurante: Restaurante | null
  loading: boolean
  initDone: boolean
  authError: string | null
  initialize: () => Promise<void>
  refresh: () => Promise<void>
  signIn: (email: string, password: string) => Promise<string | null>
  signOut: () => Promise<void>
  pedirRecuperacion: (email: string) => Promise<string | null>
  cambiarPassword: (password: string) => Promise<string | null>
  confirmarCambioPassword: () => Promise<string | null>
}

export const useAuthStore = create<AuthState>()((set, get) => {
  const refresh = async () => {
    // DEMO MODE: sin sesión real; el demo override el contexto con mock.
    if (enDemo()) {
      set({ session: null, usuario: null, restaurante: null, loading: false, initDone: true })
      return
    }

    if (supabaseFaltaConfig) {
      set({
        session: null,
        usuario: null,
        restaurante: null,
        loading: false,
        initDone: true,
        authError: 'Supabase no está configurado. Contacta al administrador del sistema.',
      })
      return
    }

    // MODO LOCAL: restaura el dataset + credenciales persistidos (una sola vez)
    // y luego la sesión guardada del backend local simulado.
    if (modoLocalHabilitado) {
      cargarDatosLocal()
      try {
        const raw = localStorage.getItem(KEY_SESION_LOCAL)
        if (raw) {
          const email = (JSON.parse(raw) as { email?: string })?.email?.toLowerCase()
          const usuario = localSeed.usuarios.find(
            (u) => u.email?.toLowerCase() === email && u.activo !== false,
          )
          if (usuario) {
            set({
              session: sesionDeUsuario(usuario),
              usuario,
              restaurante: restauranteDeUsuario(usuario),
              loading: false,
              initDone: true,
            })
            return
          }
        }
      } catch {
        // JSON inválido: se ignora y queda sin sesión.
      }
      set({ session: null, usuario: null, restaurante: null, loading: false, initDone: true })
      return
    }

    // SUPABASE: sesión real.
    try {
      const { data, error: errorSesion } = await supabase.auth.getSession()
      if (errorSesion) throw errorSesion
      const session = data.session

      if (!session) {
        set({ session: null, usuario: null, restaurante: null, loading: false, initDone: true })
        return
      }

      const { data: usuario, error: errorUsuario } = await supabase
        .from('usuarios')
        .select('*')
        .eq('id', session.user.id)
        .maybeSingle()
      if (errorUsuario) throw errorUsuario

      if (!usuario) {
        set({
          session: null,
          usuario: null,
          restaurante: null,
          loading: false,
          initDone: true,
          authError: 'Esta cuenta no tiene un perfil activo en Mesora. Contacta al administrador.',
        })
        return
      }

      let restaurante: Restaurante | null = null
      if (usuario?.restaurante_id) {
        const { data: res, error: errorRestaurante } = await supabase
          .from('restaurantes')
          .select('*')
          .eq('id', usuario.restaurante_id)
          .maybeSingle()
        if (errorRestaurante) throw errorRestaurante
        restaurante = res ?? null
      }

      set({
        session,
        usuario: usuario ?? null,
        restaurante,
        loading: false,
        initDone: true,
      })
    } catch {
      // Sin conexión / backend no configurado: falla en silencio, no rompe la app.
      set({
        session: null,
        usuario: null,
        restaurante: null,
        loading: false,
        initDone: true,
        authError: 'No se pudo validar la sesión con el servidor. Revisa tu conexión e inténtalo de nuevo.',
      })
    }
  }

  return {
    session: null,
    usuario: null,
    restaurante: null,
    loading: true,
    initDone: false,
    authError: null,

    initialize: async () => {
      set({ loading: true })
      await get().refresh()
    },

    refresh,

    signIn: async (email, password) => {
      if (supabaseFaltaConfig) {
        return 'Supabase no está configurado. Contacta al administrador del sistema.'
      }

      // MODO LOCAL — validación contra las credenciales de localSeed.ts.
      if (modoLocalHabilitado) {
        const emailNorm = email.trim().toLowerCase()
        const usuario = localSeed.usuarios.find(
          (u) => u.email?.toLowerCase() === emailNorm && u.activo !== false,
        )
        if (!usuario || localCredenciales[emailNorm] !== password) {
          return 'Correo o contraseña incorrectos.'
        }
        apiMode.operadorId = usuario.id
        localStorage.setItem(KEY_SESION_LOCAL, JSON.stringify({ email: usuario.email }))
        set({
          session: sesionDeUsuario(usuario),
          usuario,
          restaurante: restauranteDeUsuario(usuario),
          loading: false,
          initDone: true,
          authError: null,
        })
        return null
      }

      // SUPABASE — autenticación real.
      set({ authError: null })
      try {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) return mensajeErrorAuth(error.message)
        await get().refresh()
        return get().authError
      } catch {
        return 'No se pudo conectar con el servidor. Revisa tu conexión e intenta de nuevo.'
      }
    },

    signOut: async () => {
      localStorage.removeItem(KEY_SESION_LOCAL)
      if (supabaseConfigurado && !modoLocalHabilitado) {
        try {
          await supabase.auth.signOut()
        } catch {
          // Sin conexión: se limpia la sesión local igualmente.
        }
      }
      set({ session: null, usuario: null, restaurante: null, loading: false, initDone: true })
    },

    pedirRecuperacion: async (email) => {
      if (!supabaseConfigurado || modoLocalHabilitado) {
        return 'La recuperación de contraseña solo está disponible con el servidor conectado.'
      }
      try {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/restablecer`,
        })
        if (error) return mensajeErrorAuth(error.message)
        return null
      } catch {
        return 'No se pudo conectar con el servidor. Revisa tu conexión e intenta de nuevo.'
      }
    },

    confirmarCambioPassword: async () => {
      const usuarioActual = get().usuario
      if (!usuarioActual?.debe_cambiar_password) return null
      try {
        const { error } = await supabase.rpc('confirmar_cambio_password')
        if (!error) {
          set({ usuario: { ...usuarioActual, debe_cambiar_password: false } })
          return null
        }

        // La RPC pudo completar la escritura y perder solo la respuesta.
        // Releer el flag evita dejar al usuario bloqueado en ese caso.
        const { data: perfil, error: errorLectura } = await supabase
          .from('usuarios')
          .select('debe_cambiar_password')
          .eq('id', usuarioActual.id)
          .maybeSingle()
        if (!errorLectura && perfil && perfil.debe_cambiar_password === false) {
          set({ usuario: { ...usuarioActual, debe_cambiar_password: false } })
          return null
        }

        const detalle = /could not find the function|function .* does not exist|schema cache/i.test(error.message)
          ? 'Falta instalar o actualizar la migración de recuperación de contraseñas en Supabase.'
          : `Detalle de Supabase: ${error.message}`
        return `La contraseña ya está actualizada, pero falta confirmar el cambio en el perfil. ${detalle}`
      } catch {
        return 'La contraseña ya está actualizada, pero no se pudo confirmar el cambio por un problema de conexión. Reintenta la confirmación.'
      }
    },

    cambiarPassword: async (password) => {
      if (!supabaseConfigurado || modoLocalHabilitado) {
        return 'El cambio de contraseña solo está disponible con el servidor conectado.'
      }
      try {
        const { error } = await supabase.auth.updateUser({ password })
        if (error) {
          if (
            get().usuario?.debe_cambiar_password &&
            /new password should be different from the old password|new password.*same as.*old password/i.test(error.message)
          ) {
            return `CONFIRMACION_PENDIENTE:La contraseña ingresada ya es la actual. Si ya la habías guardado y solo falló la confirmación, puedes reintentar esa confirmación sin cambiarla otra vez.`
          }
          return mensajeErrorAuth(error.message)
        }
        const usuarioActual = get().usuario
        if (usuarioActual?.debe_cambiar_password) {
          const errorConfirmacion = await get().confirmarCambioPassword()
          if (errorConfirmacion) return `CONFIRMACION_PENDIENTE:${errorConfirmacion}`
        }
        return null
      } catch {
        return 'No se pudo conectar con el servidor. Revisa tu conexión e intenta de nuevo.'
      }
    },
  }
})

// Solo se escuchan eventos de sesión reales cuando el backend está configurado.
if (supabaseConfigurado && !modoLocalHabilitado) {
  supabase.auth.onAuthStateChange((event, session) => {
    // DEMO MODE: no procesar eventos de sesión real en el modo demo.
    if (enDemo()) return
    const state = useAuthStore.getState()
    if (event === 'SIGNED_OUT') {
      useAuthStore.setState({ session: null, usuario: null, restaurante: null, loading: false, initDone: true })
    } else if (event === 'PASSWORD_RECOVERY') {
      // Enlace de recuperación abierto: hay sesión temporal para cambiar la clave.
      if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/restablecer')) {
        window.location.assign('/restablecer')
      }
    } else if (session) {
      useAuthStore.setState({ session })
      void state.refresh()
    }
  })
}
