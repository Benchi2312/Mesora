import { useEffect, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth'
import { esModoLocal } from '../lib/api'
import { supabaseConfigurado } from '../lib/supabase'
import { localUsuarios, PASSWORD_DE_PRUEBA, restablecerDatosLocal } from '../lib/localSeed'
import { rutaDespuesDeLogin, rolLabel } from '../domain/security/roles'
import { Spinner } from '../components/LoadingScreen'

export default function Login() {
  const { session, usuario, loading, initDone, authError, signIn, signOut, initialize, pedirRecuperacion } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [confirmandoReset, setConfirmandoReset] = useState(false)
  const [resetOk, setResetOk] = useState<string | null>(null)
  const [recuperando, setRecuperando] = useState(false)
  const [recuperarOk, setRecuperarOk] = useState<string | null>(null)

  const from = (location.state as { from?: string } | null)?.from
  const backendSinConfigurar = !supabaseConfigurado && !esModoLocal()

  useEffect(() => {
    if (session && usuario) {
      navigate(rutaDespuesDeLogin(usuario.rol, from), { replace: true })
    }
  }, [session, usuario, navigate, from])

  // Si la app inició en /demo/*, el store nunca se inicializó: al llegar a
  // /login (modo local o real) hay que prepararlo para poder autenticar.
  useEffect(() => {
    if (!initDone) void initialize()
  }, [initDone, initialize])

  if (!loading && session && usuario) {
    return <Navigate to={rutaDespuesDeLogin(usuario.rol, from)} replace />
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const err = await signIn(email.trim(), password)
    setSubmitting(false)
    if (err) setError(err)
  }

  async function ejecutarReset() {
    restablecerDatosLocal()
    await signOut()
    setConfirmandoReset(false)
    setResetOk('Datos de prueba restablecidos: vuelven a su estado inicial.')
    setEmail('')
    setPassword('')
  }

  async function handleRecuperar(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setRecuperarOk(null)
    setSubmitting(true)
    const err = await pedirRecuperacion(email)
    setSubmitting(false)
    if (err) {
      setError(err)
      return
    }
    setRecuperarOk('Si corresponde a una cuenta de administrador activa, enviaremos instrucciones al correo asociado a la cuenta o al correo de recuperación verificado. El personal debe pedir el cambio al administrador.')
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-surface-950 px-4 py-16">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-0 h-72 w-72 -translate-x-1/2 rounded-full bg-brand-500/15 blur-3xl" />
        <div className="absolute bottom-0 right-1/4 h-64 w-64 rounded-full bg-brand-500/10 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,149,0,0.06),transparent_60%)]" />
      </div>

      <Link
        to="/"
        className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full border border-transparent px-3 py-2 text-sm font-medium text-zinc-400 transition hover:border-surface-800 hover:bg-surface-900 hover:text-white sm:left-6 sm:top-6"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M19 12H5M11 18l-6-6 6-6" />
        </svg>
        Volver al inicio
      </Link>

      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3">
          <Link
            to="/"
            aria-label="Mesora, inicio"
            className="rounded-2xl shadow-lg shadow-brand-500/30 transition hover:scale-105"
          >
            <img src="/marca/isotipo.svg" className="h-14 w-14" alt="" aria-hidden="true" />
          </Link>
          <div className="text-center">
            <h1 className="text-3xl font-black tracking-tight text-zinc-100">Mesora</h1>
            <p className="mt-1 text-sm text-zinc-500">Gestión para restaurantes</p>
          </div>
        </div>

        {loading && !initDone ? (
          <div className="card flex flex-col items-center gap-4 px-6 py-14 shadow-xl">
            <Spinner className="h-9 w-9" />
            <p className="text-sm text-zinc-500">Preparando tu sesión…</p>
          </div>
        ) : (
          <form
            onSubmit={(e) => void handleSubmit(e)}
            className="card p-6 shadow-xl shadow-black/40 sm:p-7"
          >
            <h2 className="mb-5 text-xl font-bold tracking-tight text-zinc-100">Iniciar sesión</h2>

            {(backendSinConfigurar || authError) && (
              <div role="alert" className="aviso mb-5 border-danger-500/40 bg-danger-500/10 text-danger-500">
                {backendSinConfigurar
                  ? 'El servidor de acceso no está configurado. Contacta al administrador del sistema.'
                  : authError}
              </div>
            )}

            {esModoLocal() && (
              <div className="aviso mb-5 items-start border-brand-500/30 bg-brand-500/10 text-brand-300">
                <svg viewBox="0 0 24 24" className="mt-0.5 h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 8v4M12 16h.01" />
                </svg>
                <span>
                  <strong className="font-semibold">Entorno de pruebas</strong>
                  <span className="block">El acceso aún no está conectado a un servidor real. Usa una de las cuentas del backend local:</span>
                  <span className="mt-2 block space-y-1 font-mono text-xs">
                    {localUsuarios.map((u) => (
                      <span key={u.id} className="block">
                        {u.email} · {rolLabel(u.rol)} · {PASSWORD_DE_PRUEBA}
                      </span>
                    ))}
                  </span>
                </span>
              </div>
            )}

            {error && (
              <div className="aviso mb-5 border-danger-500/40 bg-danger-500/10 text-danger-500">
                <svg viewBox="0 0 24 24" className="mt-0.5 h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 8v4M12 16h.01" />
                </svg>
                {error}
              </div>
            )}

            <label className="label" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              disabled={backendSinConfigurar}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input mb-4"
              placeholder="tu@restaurante.com"
            />

            <label className="label" htmlFor="password">
              Contraseña
            </label>
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              disabled={backendSinConfigurar}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input mb-6"
              placeholder="••••••••"
            />

            <button type="submit" disabled={submitting || backendSinConfigurar} className="btn btn-primary w-full py-3 text-base">
              {submitting ? 'Ingresando…' : 'Ingresar'}
            </button>

            {!esModoLocal() && (
              <button
                type="button"
                onClick={() => {
                  setRecuperando(true)
                  setError(null)
                  setRecuperarOk(null)
                }}
                className="mt-3 w-full text-center text-xs text-zinc-500 underline decoration-zinc-700 underline-offset-2 transition hover:text-zinc-300"
              >
                ¿Olvidaste tu contraseña?
              </button>
            )}

            {esModoLocal() && (
              <div className="mt-6 border-t border-surface-800 pt-4 text-center">
                {resetOk && <p className="mb-3 text-xs text-ok-500">{resetOk}</p>}
                {confirmandoReset ? (
                  <>
                    <p className="mb-3 text-xs leading-relaxed text-zinc-400">
                      ¿Restablecer todos los datos de prueba? Se borrará lo creado en este navegador
                      (mesas, menú, personal, comandas, cuentas) y volverá al estado inicial.
                    </p>
                    <div className="flex justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => void ejecutarReset()}
                        className="btn min-h-10 bg-danger-500 px-4 text-white transition-colors hover:bg-danger-500/90"
                      >
                        Sí, restablecer
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmandoReset(false)}
                        className="btn btn-outline min-h-10 px-4"
                      >
                        Cancelar
                      </button>
                    </div>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmandoReset(true)
                      setResetOk(null)
                    }}
                    className="py-2 text-xs text-zinc-500 underline decoration-zinc-700 underline-offset-2 transition hover:text-zinc-300"
                  >
                    Restablecer datos de prueba
                  </button>
                )}
              </div>
            )}

            <p className="mt-5 text-center text-xs text-zinc-500">
              Acceso exclusivo para el personal del restaurante.
            </p>

            <p className="mt-3 border-t border-surface-800 pt-4 text-center text-xs text-zinc-500">
              <Link to="/demo" className="font-semibold text-brand-400 transition hover:text-brand-300">
                ¿Quieres ver una demo? →
              </Link>
            </p>
          </form>
        )}

        {recuperando && (
          <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 px-4">
            <form
              onSubmit={(e) => void handleRecuperar(e)}
              className="card w-full max-w-sm p-6 shadow-xl shadow-black/40 sm:p-7"
            >
              <h2 className="mb-2 text-xl font-bold tracking-tight text-zinc-100">
                Restablecer contraseña
              </h2>
              <p className="mb-5 text-sm leading-relaxed text-zinc-500">
                Escribe tu correo de inicio de sesión o el correo alternativo verificado. El personal debe pedir al administrador que restablezca su contraseña.
              </p>

              {error && (
                <div className="aviso mb-4 border-danger-500/40 bg-danger-500/10 text-danger-500">
                  {error}
                </div>
              )}
              {recuperarOk && (
                <div className="aviso mb-4 border-ok-500/40 bg-ok-500/10 text-ok-500">
                  {recuperarOk}
                </div>
              )}

              <label className="label" htmlFor="recovery-email">
                Email
              </label>
              <input
                id="recovery-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input mb-6"
                placeholder="tu@restaurante.com"
              />

              <button type="submit" disabled={submitting} className="btn btn-primary w-full py-3 text-base">
                {submitting ? 'Enviando…' : 'Enviar enlace'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setRecuperando(false)
                  setError(null)
                  setRecuperarOk(null)
                }}
                className="btn btn-outline mt-3 w-full py-3 text-base"
              >
                Volver
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}
