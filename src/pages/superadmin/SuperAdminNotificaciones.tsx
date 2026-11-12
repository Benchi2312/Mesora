import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getApi } from '../../lib/api'
import { contarPorNivel, type AlertaAdministrativa, type NivelAlerta } from '../../domain/platform/notificaciones'
import { fmtFecha } from '../../lib/format'
import SuperAdminCarga from './SuperAdminCarga'
import EstadoVacio from '../../components/EstadoVacio'

const NIVELES: { nivel: NivelAlerta; titulo: string; descripcion: string }[] = [
  { nivel: 'critico', titulo: 'Críticas', descripcion: 'Incidencias, vencimientos y tickets urgentes' },
  { nivel: 'advertencia', titulo: 'Advertencias', descripcion: 'Suscripciones y suspensiones' },
  { nivel: 'info', titulo: 'Información', descripcion: 'Altas recientes de la plataforma' },
]

const ESTILO_NIVEL: Record<NivelAlerta, { tarjeta: string; barra: string; pulso: string }> = {
  critico: {
    tarjeta: 'border-danger-500/40 bg-danger-500/10',
    barra: 'border-l-4 border-danger-500 bg-surface-900',
    pulso: 'text-danger-500',
  },
  advertencia: {
    tarjeta: 'border-amber-500/40 bg-amber-500/10',
    barra: 'border-l-4 border-amber-500 bg-surface-900',
    pulso: 'text-amber-400',
  },
  info: {
    tarjeta: 'border-sky-500/40 bg-sky-500/10',
    barra: 'border-l-4 border-sky-500 bg-surface-900',
    pulso: 'text-sky-400',
  },
}

const TEXTO_NIVEL: Record<NivelAlerta, string> = {
  critico: 'Crítico',
  advertencia: 'Advertencia',
  info: 'Información',
}

export default function SuperAdminNotificaciones() {
  const [alertas, setAlertas] = useState<AlertaAdministrativa[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [intentoCarga, setIntentoCarga] = useState(0)

  const cargar = useCallback(async () => {
    const res = await getApi().getAlertas()
    if (res.error) {
      setError(res.error)
      return
    }
    setAlertas(res.data ?? [])
    setError(null)
  }, [])

  useEffect(() => {
    setCargando(true)
    void cargar().catch((e: unknown) => setError(e instanceof Error ? e.message : 'No se pudieron cargar las alertas.')).finally(() => setCargando(false))
  }, [cargar, intentoCarga])

  const porNivel = useMemo(() => contarPorNivel(alertas), [alertas])

  if (cargando) return <SuperAdminCarga recurso="las notificaciones" />

  if (error)
    return (
      <div role="alert" className="aviso border-danger-500/40 bg-danger-500/10 text-danger-500">
        <p>No se pudieron cargar las alertas. {error}</p>
        <button type="button" onClick={() => { setError(null); setCargando(true); setIntentoCarga((n) => n + 1) }} className="btn btn-outline mt-3 min-h-11 px-4">Reintentar</button>
      </div>
    )

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-300">Alertas activas</h2>
          <p className="mt-1 text-xs text-zinc-500">Condiciones detectadas por las fuentes operativas actuales; no son una bandeja de lectura pendiente.</p>
        </div>
        <span className="text-xs text-zinc-500">{alertas.length} alertas</span>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {NIVELES.map(({ nivel, titulo, descripcion }) => (
          <div key={nivel} className={`card rounded-2xl border p-5 ${ESTILO_NIVEL[nivel].tarjeta}`}>
            <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400">{titulo}</p>
            <p className={`mt-2 text-3xl font-extrabold ${ESTILO_NIVEL[nivel].pulso}`}>
              {porNivel[nivel]}
            </p>
            <p className="mt-1 text-xs text-zinc-500">{descripcion}</p>
          </div>
        ))}
      </div>

      {alertas.length === 0 ? (
        <div className="mt-8">
          <EstadoVacio
            titulo="No hay alertas activas"
            descripcion="Las fuentes consultadas no reportan incidencias, vencimientos próximos, suspensiones, altas recientes ni tickets urgentes."
          />
        </div>
      ) : (
        <div className="mt-8 space-y-3">
          {alertas.map((a) => (
            <div
              key={a.id}
              className={`rounded-r-2xl border-y border-r border-surface-800 p-4 ${ESTILO_NIVEL[a.nivel].barra}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-zinc-100">
                    <span className={`text-[11px] font-bold uppercase tracking-widest ${ESTILO_NIVEL[a.nivel].pulso}`}>
                      {TEXTO_NIVEL[a.nivel]}
                    </span>
                    {a.titulo}
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-zinc-400">{a.detalle}</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {fmtFecha(a.fecha)}
                    {a.restaurante_nombre && ` · ${a.restaurante_nombre}`}
                  </p>
                </div>
                {a.tipo === 'ticket_urgente' && a.referencia_id ? (
                  <Link to={`/super-admin/soporte?ticket=${encodeURIComponent(a.referencia_id)}`} className="btn btn-outline min-h-11 px-3 text-xs">Abrir ticket</Link>
                ) : a.tipo === 'administrador_nuevo' && a.referencia_id ? (
                  <div className="flex flex-wrap gap-2">
                    <Link to={`/super-admin/usuarios?usuario=${encodeURIComponent(a.referencia_id)}`} className="btn btn-outline min-h-11 px-3 text-xs">Ver usuario</Link>
                    {a.restaurante_id && <Link to={`/super-admin/restaurantes/${a.restaurante_id}`} className="btn btn-outline min-h-11 px-3 text-xs">Ver restaurante</Link>}
                  </div>
                ) : a.restaurante_id && (
                  <Link
                    to={`/super-admin/restaurantes/${a.restaurante_id}`}
                    className="btn btn-outline min-h-11 px-3 text-xs"
                  >
                    Ver restaurante
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
