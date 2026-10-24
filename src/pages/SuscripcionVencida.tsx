import { useAuthStore } from '../store/auth'

export default function SuscripcionVencida() {
  const { usuario, restaurante, signOut } = useAuthStore()

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-surface-950 px-4">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-1/3 h-72 w-72 -translate-x-1/2 rounded-full bg-brand-500/10 blur-3xl" />
      </div>
      <div className="card w-full max-w-md p-8 text-center shadow-xl shadow-black/40 sm:p-9">
        <span className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl border border-brand-500/40 bg-brand-500/10 text-3xl font-bold text-brand-400 shadow-lg shadow-brand-500/10">
          !
        </span>
        <h1 className="text-2xl font-extrabold tracking-tight text-zinc-100">Suscripción vencida</h1>
        <p className="mt-3 text-sm leading-relaxed text-zinc-400">
          {usuario?.rol === 'super_admin'
            ? 'El acceso del super admin no se bloquea por suscripción.'
            : restaurante
              ? `La suscripción de «${restaurante.nombre}» está ${!restaurante.suscripcion_activa
                  ? 'suspendida'
                  : restaurante.fecha_vencimiento
                    ? `vencida el ${new Date(restaurante.fecha_vencimiento).toLocaleDateString('es-PE')}`
                    : 'vencida'}. Renueva para volver a operar con Mesora.`
              : 'No se pudo verificar la suscripción de tu restaurante. Contacta al soporte de Mesora.'}
        </p>
        <button
          type="button"
          onClick={() => void signOut()}
          className="btn btn-outline mt-7 rounded-lg px-5 py-2.5"
        >
          Salir
        </button>
      </div>
    </div>
  )
}