import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { mensajeErrorFuncion } from '../lib/mensajeErrorFuncion'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/auth'

export default function VerificarCorreoRecuperacion() {
  const [token] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get('token') ?? '')
  const [procesando, setProcesando] = useState(false)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (token) window.history.replaceState(null, '', window.location.pathname)
  }, [token])

  async function confirmar() {
    setProcesando(true)
    setError(null)
    setMensaje(null)
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('admin-password-recovery', {
        body: { accion: 'confirmar_verificacion', token },
      })
      if (invokeError) throw new Error(await mensajeErrorFuncion(invokeError, 'No se pudo verificar el correo.'))
      if (typeof data?.error === 'string') throw new Error(data.error)
      setMensaje(data?.message ?? 'Correo de recuperación verificado.')
      await useAuthStore.getState().refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'El enlace no es válido o ya venció.')
    } finally {
      setProcesando(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface-950 px-4 py-12">
      <section className="card w-full max-w-md p-6 sm:p-8">
        <img src="/marca/isotipo.svg" className="mb-6 h-12 w-12" alt="" aria-hidden="true" />
        <p className="text-sm font-semibold uppercase tracking-widest text-brand-400">Mesora</p>
        <h1 className="mt-2 text-2xl font-bold text-white">Verifica tu correo</h1>
        <p className="mt-3 text-sm leading-relaxed text-zinc-400">
          Confirma la dirección para usarla si olvidas la contraseña de administrador. El enlace se consume solo al pulsar el botón y vence en 30 minutos.
        </p>
        {error && <p role="alert" className="aviso mt-5 border-danger-500/40 bg-danger-500/10 text-danger-400">{error}</p>}
        {mensaje && <p role="status" className="aviso mt-5 border-ok-500/40 bg-ok-500/10 text-ok-400">{mensaje}</p>}
        {!mensaje && (
          <button type="button" onClick={() => void confirmar()} disabled={procesando || !token} className="btn btn-primary mt-6 w-full py-3 disabled:opacity-50">
            {procesando ? 'Verificando…' : 'Confirmar correo'}
          </button>
        )}
        <Link to="/login" className="mt-5 block text-center text-sm font-semibold text-brand-400 hover:text-brand-300">Volver al inicio de sesión</Link>
      </section>
    </main>
  )
}
