import { modoLocalHabilitado, supabase, supabaseConfigurado } from './supabase'

type Tipo = 'api' | 'render' | 'javascript' | 'promise'
const RUTAS = ['/admin', '/mesero', '/cajero', '/cocina', '/super-admin', '/restablecer', '/login']
const recientes = new Map<string, number>()
let ventana = 0
let enviados = 0
let iniciado = false

export function metadatosDiagnostico(tipo: Tipo, contexto: string, pathname: string) {
  const path = pathname.split(/[?#]/, 1)[0]
  return {
    p_tipo: tipo,
    p_ruta: RUTAS.find((r) => path === r || path.startsWith(`${r}/`)) ?? 'otra',
    p_contexto: /^[A-Za-z]{1,48}$/.test(contexto) ? contexto : 'aplicacion',
  }
}

/** Mejor esfuerzo: nunca retrasa una operación ni envía contenido del error. */
export function registrarDiagnostico(tipo: Tipo, contexto = 'aplicacion') {
  if (typeof window === 'undefined' || !supabaseConfigurado || modoLocalHabilitado ||
    window.location.pathname.startsWith('/demo') || import.meta.env.VITE_MESORA_DIAGNOSTICO === 'false') return
  const ahora = Date.now()
  if (ahora - ventana > 600_000) { ventana = ahora; enviados = 0; recientes.clear() }
  const datos = metadatosDiagnostico(tipo, contexto, window.location.pathname)
  const clave = JSON.stringify(datos)
  if (enviados >= 20 || ahora - (recientes.get(clave) ?? 0) < 60_000) return
  enviados++
  recientes.set(clave, ahora)
  void (async () => {
    try {
      const { data } = await supabase.auth.getSession()
      if (data.session) await supabase.rpc('registrar_error_cliente', datos)
    } catch { /* El diagnóstico nunca provoca un segundo fallo de interfaz. */ }
  })()
}

export function iniciarDiagnostico() {
  if (iniciado || typeof window === 'undefined') return
  iniciado = true
  window.addEventListener('error', () => registrarDiagnostico('javascript'))
  window.addEventListener('unhandledrejection', () => registrarDiagnostico('promise'))
}
