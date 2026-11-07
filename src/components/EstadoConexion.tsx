import type { EstadoDeSincronizacion } from '../lib/estadoConexion'

const etiquetas = {
  conectado: 'Conectado',
  sin_conexion: 'Sin conexión',
  reconectando: 'Reconectando…',
  error: 'Error de sincronización',
} as const

const colores = {
  conectado: 'border-ok-500/30 bg-ok-500/10 text-ok-400',
  sin_conexion: 'border-danger-500/40 bg-danger-500/10 text-danger-400',
  reconectando: 'border-brand-500/30 bg-brand-500/10 text-brand-300',
  error: 'border-danger-500/40 bg-danger-500/10 text-danger-400',
} as const

export default function EstadoConexion({ estado }: { estado: EstadoDeSincronizacion }) {
  const ultima = estado.ultimaSincronizacion
    ? new Intl.DateTimeFormat('es-PE', { hour: '2-digit', minute: '2-digit' }).format(new Date(estado.ultimaSincronizacion))
    : null

  return (
    <div
      className={`inline-flex min-h-9 max-w-[150px] items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold sm:max-w-full sm:gap-2 sm:px-3 sm:text-xs ${colores[estado.estado]}`}
      role="status"
      aria-live="polite"
      aria-label={`${etiquetas[estado.estado]}${ultima ? `. Última sincronización correcta: ${ultima}` : '. Aún no hay una sincronización correcta confirmada.'}`}
      title={ultima ? `Última sincronización correcta: ${ultima}` : 'Aún no hay una sincronización correcta confirmada.'}
    >
      <span className={`h-2 w-2 shrink-0 rounded-full ${estado.estado === 'conectado' ? 'bg-ok-500' : estado.estado === 'reconectando' ? 'animate-pulse bg-brand-500' : 'bg-danger-500'}`} aria-hidden="true" />
      <span className="truncate sm:hidden">{estado.estado === 'error' ? 'Error de sync' : etiquetas[estado.estado]}</span>
      <span className="hidden sm:inline">{etiquetas[estado.estado]}</span>
      <span className="hidden font-normal opacity-80 sm:inline">
        {ultima ? `· Actualizado ${ultima}` : '· Sin sincronización confirmada'}
      </span>
    </div>
  )
}
