import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore, suSuscripcionVencida } from '../store/auth'
import { homeForRole } from '../domain/security/roles'

export default function SuscripcionVencida() {
  const { usuario, restaurante, signOut, refreshSubscription } = useAuthStore()
  const navigate = useNavigate()
  const [comprobando, setComprobando] = useState(false)
  const [mensaje, setMensaje] = useState('')

  useEffect(() => {
    if (!usuario || !restaurante) return
    if (!suSuscripcionVencida(restaurante)) navigate(homeForRole(usuario.rol), { replace: true })
  }, [usuario, restaurante, navigate])

  useEffect(() => {
    if (!usuario || usuario.rol === 'super_admin' || !restaurante) return
    const comprobar = () => { void refreshSubscription() }
    const timer = window.setInterval(comprobar, 60_000)
    window.addEventListener('focus', comprobar)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', comprobar)
    }
  }, [usuario?.id, usuario?.rol, restaurante?.id, refreshSubscription])

  async function comprobarAcceso() {
    setComprobando(true)
    setMensaje('')
    const actualizado = await refreshSubscription()
    setComprobando(false)
    if (!actualizado) setMensaje('No pudimos comprobar el estado. Revisa tu conexión e inténtalo de nuevo.')
    else if (suSuscripcionVencida(useAuthStore.getState().restaurante)) {
      setMensaje('La suscripción todavía no figura como vigente. Si ya renovaste, vuelve a comprobar en unos minutos.')
    }
  }

  const suspendida = restaurante?.suscripcion_activa === false
  const esAdmin = usuario?.rol === 'admin_restaurante'

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-surface-950 px-4">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-1/3 h-72 w-72 -translate-x-1/2 rounded-full bg-brand-500/10 blur-3xl" />
      </div>
      <div className="card w-full max-w-md p-8 text-center shadow-xl shadow-black/40 sm:p-9">
        <span className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl border border-brand-500/40 bg-brand-500/10 text-3xl font-bold text-brand-400 shadow-lg shadow-brand-500/10">
          !
        </span>
        <h1 className="text-2xl font-extrabold tracking-tight text-zinc-100">{suspendida ? 'Suscripción suspendida' : 'Suscripción vencida'}</h1>
        <p className="mt-3 text-sm leading-relaxed text-zinc-400">
          {usuario?.rol === 'super_admin'
            ? 'El acceso del super admin no se bloquea por suscripción.'
            : restaurante
              ? `El acceso de todo el equipo de «${restaurante.nombre}» está pausado porque su suscripción está ${suspendida
                  ? 'suspendida'
                  : restaurante.fecha_vencimiento
                    ? `vencida desde el ${new Date(restaurante.fecha_vencimiento).toLocaleDateString('es-PE', { timeZone: 'America/Lima' })}`
                    : 'vencida'}. Los datos permanecen intactos. ${esAdmin ? 'Consulta la renovación con Mesora.' : 'Contacta al administrador de tu restaurante.'}`
              : 'No se pudo verificar la suscripción de tu restaurante. Contacta al soporte de Mesora.'}
        </p>
        {esAdmin && <a className="btn btn-primary mt-6 w-full justify-center" href="mailto:mesoratech@gmail.com?subject=Renovaci%C3%B3n%20de%20Mesora">
          Consultar renovación
        </a>}
        {usuario && restaurante && <button type="button" disabled={comprobando} onClick={() => void comprobarAcceso()}
          className="btn btn-outline mt-3 w-full justify-center">
          {comprobando ? 'Comprobando…' : 'Comprobar acceso'}
        </button>}
        {mensaje && <p role="status" className="mt-3 text-sm text-zinc-400">{mensaje}</p>}
        <button
          type="button"
          onClick={async () => {
            await signOut()
            navigate('/login', { replace: true })
          }}
          className="btn btn-danger-ghost mt-3 rounded-lg px-5 py-2.5"
        >
          Salir
        </button>
      </div>
    </div>
  )
}
