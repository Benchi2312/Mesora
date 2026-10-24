import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth'
import { esModoLocal } from '../lib/api'
import { homeForRole } from '../lib/roles'

export default function Restablecer() {
  const { session, usuario, loading, initDone, initialize, cambiarPassword, confirmarCambioPassword, signOut } = useAuthStore()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [listo, setListo] = useState(false)
  const [confirmacionPendiente, setConfirmacionPendiente] = useState(false)

  useEffect(() => {
    if (!initDone) void initialize()
  }, [initDone, initialize])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.')
      return
    }
    if (password !== confirmar) {
      setError('Las contraseñas no coinciden.')
      return
    }
    setSubmitting(true)
    const err = await cambiarPassword(password)
    setSubmitting(false)
    if (err) {
      if (err.startsWith('CONFIRMACION_PENDIENTE:')) {
        setConfirmacionPendiente(true)
        setError(err.slice('CONFIRMACION_PENDIENTE:'.length))
      } else setError(err)
      return
    }
    setListo(true)
  }

  async function handleConfirmarCambio() {
    setSubmitting(true)
    setError(null)
    const err = await confirmarCambioPassword()
    setSubmitting(false)
    if (err) {
      setError(err)
      return
    }
    setConfirmacionPendiente(false)
    setListo(true)
  }

  async function volverAlInicio() {
    // Si llegó aquí tras iniciar sesión con una clave temporal, ir a /login
    // sin cerrar sesión provoca que Login lo redirija de vuelta a esta ruta.
    await signOut()
    navigate('/login', { replace: true })
  }

  const sinEnlace = !loading && initDone && !session

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-surface-950 px-4 py-16">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-0 h-72 w-72 -translate-x-1/2 rounded-full bg-brand-500/15 blur-3xl" />
        <div className="absolute bottom-0 right-1/4 h-64 w-64 rounded-full bg-brand-500/10 blur-3xl" />
      </div>

      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-brand-500 shadow-lg shadow-brand-500/30">
            <svg viewBox="0 0 24 24" className="h-7 w-7 text-surface-950" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M6 19V5M10 19V9M14 19V5M18 19V7" />
            </svg>
          </div>
          <div className="text-center">
            <h1 className="text-3xl font-black tracking-tight text-zinc-100">Mesora</h1>
            <p className="mt-1 text-sm text-zinc-500">Nueva contraseña</p>
          </div>
        </div>

        <div className="card p-6 shadow-xl shadow-black/40 sm:p-7">
          {esModoLocal() ? (
            <p className="text-sm leading-relaxed text-zinc-400">
              El restablecimiento de contraseña no aplica al entorno de pruebas local.
            </p>
          ) : sinEnlace ? (
            <p className="text-sm leading-relaxed text-zinc-400">
              Este enlace no es válido o ya venció. Solicita uno nuevo desde la pantalla de inicio de sesión.
            </p>
          ) : listo ? (
            <>
              <h2 className="mb-3 text-xl font-bold tracking-tight text-zinc-100">Contraseña actualizada</h2>
              <p className="mb-5 text-sm leading-relaxed text-zinc-400">
                Tu contraseña se cambió correctamente. Ya puedes entrar con ella.
              </p>
              <button
                type="button"
                onClick={() => {
                  if (usuario) navigate(homeForRole(usuario.rol), { replace: true })
                  else void signOut()
                }}
                className="btn btn-primary w-full py-3 text-base"
              >
                Continuar
              </button>
            </>
          ) : confirmacionPendiente ? (
            <div>
              <h2 className="mb-3 text-xl font-bold tracking-tight text-zinc-100">Confirma tu contraseña nueva</h2>
              <p className="mb-4 text-sm leading-relaxed text-zinc-400">
                La contraseña ya se actualizó. Reintenta la confirmación del perfil; no volveremos a cambiarla.
              </p>
              {error && (
                <div className="aviso mb-4 border-danger-500/40 bg-danger-500/10 text-danger-500">
                  {error}
                </div>
              )}
              <button type="button" disabled={submitting} onClick={() => void handleConfirmarCambio()} className="btn btn-primary w-full py-3 text-base">
                {submitting ? 'Confirmando…' : 'Reintentar confirmación'}
              </button>
            </div>
          ) : (
            <form onSubmit={(e) => void handleSubmit(e)}>
              <h2 className="mb-5 text-xl font-bold tracking-tight text-zinc-100">Crea tu nueva contraseña</h2>

              {usuario?.debe_cambiar_password && (
                <p className="aviso mb-4 border-brand-500/40 bg-brand-500/10 text-brand-300">
                  Por seguridad, debes cambiar tu contraseña temporal antes de continuar. La nueva debe ser distinta a la actual.
                </p>
              )}

              {error && (
                <div className="aviso mb-4 border-danger-500/40 bg-danger-500/10 text-danger-500">
                  {error}
                </div>
              )}

              <label className="label" htmlFor="nueva-password">
                Nueva contraseña
              </label>
              <input
                id="nueva-password"
                type="password"
                required
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input mb-4"
                placeholder="Mínimo 8 caracteres"
              />

              <label className="label" htmlFor="confirmar-password">
                Repite la contraseña
              </label>
              <input
                id="confirmar-password"
                type="password"
                required
                autoComplete="new-password"
                value={confirmar}
                onChange={(e) => setConfirmar(e.target.value)}
                className="input mb-6"
                placeholder="••••••••"
              />

              <button type="submit" disabled={submitting} className="btn btn-primary w-full py-3 text-base">
                {submitting ? 'Guardando…' : 'Guardar contraseña'}
              </button>
            </form>
          )}

          {!listo && (
            <p className="mt-5 border-t border-surface-800 pt-4 text-center text-xs text-zinc-500">
              <button
                type="button"
                disabled={submitting}
                onClick={() => void volverAlInicio()}
                className="font-semibold text-brand-400 transition hover:text-brand-300 disabled:opacity-50"
              >
                {session ? 'Cerrar sesión y volver al inicio de sesión' : 'Volver a iniciar sesión'}
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
