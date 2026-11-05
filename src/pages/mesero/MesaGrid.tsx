import { useEffect, useState } from 'react'
import { useCurrentContext } from '../../lib/useCurrentContext'
import { getApi } from '../../lib/api'
import type { Mesa, Zona } from '../../types/database'
import { Spinner } from '../../components/LoadingScreen'
import EstadoVacio from '../../components/EstadoVacio'

interface MesaGridProps {
  onSelectMesa: (mesa: Mesa, ocupada: boolean) => void
}

export default function MesaGrid({ onSelectMesa }: MesaGridProps) {
  const { restaurante } = useCurrentContext()
  const [zonas, setZonas] = useState<Zona[]>([])
  const [mesas, setMesas] = useState<Mesa[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [intento, setIntento] = useState(0)
  const [nombreMeseros, setNombreMeseros] = useState<Map<string, string>>(() => new Map())

  useEffect(() => {
    const rid = restaurante?.id
    if (!rid) {
      setCargando(false)
      return
    }
    let activo = true
    setCargando(true)
    ;(async () => {
      try {
        const api = getApi()
        const [zRes, mRes, meserosRes] = await Promise.all([api.getZonas(rid), api.getMesas(rid), api.getMeseros(rid)])

        if (!activo) return
        if (zRes.error || mRes.error) {
          setError(zRes.error ?? mRes.error ?? 'Error al cargar mesas')
          return
        }
        setZonas(zRes.data ?? [])
        setMesas(mRes.data ?? [])
        setNombreMeseros(new Map((meserosRes.data ?? []).filter((u) => u.activo !== false).map((u) => [u.id, u.nombre])))
        setError(null)
      } catch {
        if (activo) setError('No se pudo conectar para cargar las mesas. Inténtalo de nuevo.')
      } finally {
        if (activo) setCargando(false)
      }
    })()
    return () => {
      activo = false
    }
  }, [restaurante?.id, intento])

  if (cargando)
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    )

  if (error)
    return (
      <div className="aviso border-danger-500/40 bg-danger-500/10 text-danger-500">
        No se pudieron cargar las mesas. {error}
        <button type="button" onClick={() => setIntento((n) => n + 1)} className="ml-3 underline">Reintentar</button>
      </div>
    )

  const mesasPorZona = zonas.map((z) => ({
    zona: z,
    mesas: mesas.filter((m) => m.zona_id === z.id),
  }))
  const sinZona = mesas.filter((m) => !zonas.some((z) => z.id === m.zona_id))

  return (
    <div className="space-y-8">
      <p className="text-xs text-zinc-500">
        Toca una mesa libre para tomar el pedido. Las mesas ocupadas abren el cierre de cuenta.
      </p>

      {mesas.length === 0 && (
        <EstadoVacio
          icono={
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="3" width="7" height="7" rx="1.5" />
              <rect x="14" y="3" width="7" height="7" rx="1.5" />
              <rect x="3" y="14" width="7" height="7" rx="1.5" />
              <rect x="14" y="14" width="7" height="7" rx="1.5" />
            </svg>
          }
          titulo="No hay mesas configuradas"
          descripcion="Pide al administrador que cree mesas desde el panel."
        />
      )}

      {mesasPorZona.map(({ zona, mesas: ms }) =>
        ms.length > 0 ? (
          <section key={zona.id}>
            <h2 className="titulo-seccion mb-4 text-xs font-semibold">
              {zona.nombre}
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
              {ms.map((mesa) => (
                <MesaButton key={mesa.id} mesa={mesa} meseroNombre={mesa.mesero_responsable_id ? nombreMeseros.get(mesa.mesero_responsable_id) : undefined} onSelect={onSelectMesa} />
              ))}
            </div>
          </section>
        ) : null,
      )}

      {sinZona.length > 0 && (
        <section>
          <h2 className="titulo-seccion mb-4 text-xs font-semibold">
            General
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {sinZona.map((mesa) => (
              <MesaButton key={mesa.id} mesa={mesa} meseroNombre={mesa.mesero_responsable_id ? nombreMeseros.get(mesa.mesero_responsable_id) : undefined} onSelect={onSelectMesa} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function MesaButton({ mesa, meseroNombre, onSelect }: { mesa: Mesa; meseroNombre?: string; onSelect: MesaGridProps['onSelectMesa'] }) {
  const ocupada = mesa.estado === 'ocupada'
  return (
    <button
      type="button"
      data-guia={ocupada ? 'mesa-ocupada' : 'mesa-libre'}
      data-guia-mesa={mesa.id}
      onClick={() => onSelect(mesa, ocupada)}
      className={`relative flex min-h-24 touch-manipulation flex-col items-center justify-center gap-1.5 rounded-xl border px-2 py-3 transition active:scale-[0.98] ${
        ocupada
          ? 'border-surface-700 bg-surface-800 text-zinc-400'
          : 'border-brand-500/50 bg-surface-800 text-zinc-100 hover:border-brand-500 hover:bg-brand-500/10'
      }`}
    >
      <span className={`h-2.5 w-2.5 rounded-full ${ocupada ? 'bg-brand-500' : 'bg-ok-500'}`} />
      <span className="text-base font-bold">{mesa.nombre}</span>
      <span className="text-xs uppercase tracking-wider text-zinc-500">
        {ocupada ? 'Ocupada' : 'Libre'}
      </span>
      {meseroNombre ? <span className="max-w-full truncate text-[11px] text-zinc-500">{meseroNombre}</span> : null}
    </button>
  )
}
