import { useSyncExternalStore } from 'react'

export type EstadoConexion = 'conectado' | 'sin_conexion' | 'reconectando' | 'error'

export type EstadoDeSincronizacion = {
  estado: EstadoConexion
  ultimaSincronizacion: string | null
}

const CLAVE = 'mesora.ultima-sincronizacion'
const oyentes = new Set<() => void>()
let escuchando = false
let snapshot: EstadoDeSincronizacion = { estado: 'conectado', ultimaSincronizacion: null }

function emitir(estado: EstadoConexion, ultimaSincronizacion = snapshot.ultimaSincronizacion) {
  if (snapshot.estado === estado && snapshot.ultimaSincronizacion === ultimaSincronizacion) return
  snapshot = { estado, ultimaSincronizacion }
  oyentes.forEach((oyente) => oyente())
}

function iniciar() {
  if (escuchando || typeof window === 'undefined') return
  escuchando = true
  let ultima: string | null = null
  try {
    ultima = window.localStorage.getItem(CLAVE)
  } catch {
    // El estado sigue funcionando si el navegador bloquea el almacenamiento.
  }
  snapshot = { estado: navigator.onLine ? 'conectado' : 'sin_conexion', ultimaSincronizacion: ultima }
  window.addEventListener('offline', () => emitir('sin_conexion'))
  window.addEventListener('online', () => emitir('reconectando'))
}

function subscribe(oyente: () => void) {
  iniciar()
  oyentes.add(oyente)
  return () => oyentes.delete(oyente)
}

function getSnapshot() {
  iniciar()
  return snapshot
}

export function useEstadoDeSincronizacion() {
  return useSyncExternalStore(subscribe, getSnapshot, () => snapshot)
}

/** Lectura observable para QA no visual y diagnósticos de la sesión. */
export function obtenerEstadoDeSincronizacion() {
  iniciar()
  return snapshot
}

export function registrarSincronizacionExitosa() {
  const ahora = new Date().toISOString()
  try {
    if (typeof window !== 'undefined') window.localStorage.setItem(CLAVE, ahora)
  } catch {
    // El indicador de esta sesión no depende del almacenamiento local.
  }
  emitir(typeof navigator === 'undefined' || navigator.onLine ? 'conectado' : 'sin_conexion', ahora)
}

export function registrarServidorAlcanzable() {
  emitir(typeof navigator === 'undefined' || navigator.onLine ? 'conectado' : 'sin_conexion')
}

export function registrarFalloDeSincronizacion() {
  emitir(typeof navigator !== 'undefined' && navigator.onLine ? 'error' : 'sin_conexion')
}
