import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getApi } from '../../lib/api'
import type { AdminRestaurante, UsuarioPlataforma } from '../../lib/api'
import { fmtFecha, fmtHora } from '../../lib/format'
import { rolLabel } from '../../domain/security/roles'
import { suSuscripcionVencida } from '../../store/auth'
import type { Restaurante } from '../../types/database'
import SuperAdminCarga from './SuperAdminCarga'
import EstadoVacio from '../../components/EstadoVacio'
import {
  PRESETS_RANGO,
  etiquetaDia,
  rangoDePreset,
  type EstadisticasGlobales,
  type PresetRango,
} from '../../domain/reporting/estadisticas'

/** Ventana de "próximos a vencer" que mira el dashboard. */
const DIAS_PARA_VENCER = 30
const MS_POR_DIA = 86_400_000

type Evento = {
  id: string
  fecha: string
  tipo: 'restaurante' | 'usuario'
  texto: string
}

function Tarjeta({
  etiqueta,
  valor,
  clase,
  nota,
}: {
  etiqueta: string
  valor: string | number
  clase: string
  nota?: string
}) {
  return (
    <div className="card sa-metric-card p-5">
      <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">{etiqueta}</p>
      <p className={`mt-2 text-3xl font-extrabold ${clase}`}>{valor}</p>
      {nota && <p className="mt-1 text-xs text-zinc-500">{nota}</p>}
    </div>
  )
}

export default function SuperAdmin() {
  const [restaurantes, setRestaurantes] = useState<Restaurante[]>([])
  const [admins, setAdmins] = useState<AdminRestaurante[]>([])
  const [usuarios, setUsuarios] = useState<UsuarioPlataforma[]>([])
  const [preset, setPreset] = useState<PresetRango>('7d')
  const [estadisticas, setEstadisticas] = useState<EstadisticasGlobales | null>(null)
  const [cargandoEstadisticas, setCargandoEstadisticas] = useState(true)
  const [errorEstadisticas, setErrorEstadisticas] = useState<string | null>(null)
  const [actualizado, setActualizado] = useState<Date | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    const api = getApi()
    const [rRes, aRes, uRes] = await Promise.all([
      api.getRestaurantes(),
      api.getAdministradores(),
      api.getUsuariosPlataforma(),
    ])
    if (rRes.error || aRes.error || uRes.error) {
      setError(rRes.error ?? aRes.error ?? uRes.error ?? 'Error al cargar el resumen')
      return
    }
    setRestaurantes(rRes.data ?? [])
    setAdmins(aRes.data ?? [])
    setUsuarios(uRes.data ?? [])
    setError(null)
  }, [])

  useEffect(() => {
    setCargando(true)
    void cargar().finally(() => setCargando(false))
  }, [cargar])

  useEffect(() => {
    let vigente = true
    const { desde, hasta } = rangoDePreset(preset)
    setCargandoEstadisticas(true)
    void getApi().getEstadisticasGlobales(desde, hasta).then((res) => {
      if (!vigente) return
      if (res.error) {
        setErrorEstadisticas(res.error)
        setEstadisticas(null)
      } else {
        setErrorEstadisticas(null)
        setEstadisticas(res.data)
        setActualizado(new Date())
      }
      setCargandoEstadisticas(false)
    }).catch((e: unknown) => {
      if (!vigente) return
      setErrorEstadisticas(e instanceof Error ? e.message : 'No se pudieron cargar las métricas del periodo.')
      setEstadisticas(null)
      setCargandoEstadisticas(false)
    })
    return () => { vigente = false }
  }, [preset])

  if (cargando) return <SuperAdminCarga recurso="el resumen de la plataforma" />

  if (error)
    return (
      <div role="alert" className="aviso border-danger-500/40 bg-danger-500/10 text-danger-500">
        No se pudo cargar el resumen de la plataforma. {error}
      </div>
    )

  const activos = restaurantes.filter((r) => !suSuscripcionVencida(r)).length
  const inactivos = restaurantes.length - activos
  const conVencimiento = restaurantes.filter((r) => r.fecha_vencimiento)
  const ahora = Date.now()
  const proximos = restaurantes.filter((r) => {
    if (!r.suscripcion_activa || !r.fecha_vencimiento) return false
    const t = new Date(r.fecha_vencimiento).getTime()
    return !Number.isNaN(t) && t >= ahora && t <= ahora + DIAS_PARA_VENCER * MS_POR_DIA
  })

  const recientes = [...restaurantes]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 5)
  const adminDe = (rid: string) => admins.find((a) => a.restaurante_id === rid) ?? null

  // Actividad derivada de datos reales (fechas de alta de `restaurantes` y
  // `usuarios`): no hay tabla de auditoría todavía y no se fabrican registros.
  const eventos: Evento[] = [
    ...restaurantes.map((r) => ({
      id: `r-${r.id}`,
      fecha: r.created_at,
      tipo: 'restaurante' as const,
      texto: `Restaurante «${r.nombre}» creado`,
    })),
    ...usuarios.map((u) => ({
      id: `u-${u.id}`,
      fecha: u.created_at,
      tipo: 'usuario' as const,
      texto: `${u.nombre} registrado como ${rolLabel(u.rol).toLowerCase()}`,
    })),
  ]
    .sort((a, b) => b.fecha.localeCompare(a.fecha))
    .slice(0, 8)

  return (
    <div>
      <section className="card sa-dashboard-pulse mb-6 space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-300">Pulso de la plataforma</h2>
            <p className="mt-1 text-xs text-zinc-500">
              Actividad de los restaurantes clientes; estas ventas no representan ingresos de Mesora.
              {actualizado && (
                <span className="sa-dashboard-updated">
                  Actualizado {new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit' }).format(actualizado)} (Lima)
                </span>
              )}
            </p>
          </div>
          <Link to="/super-admin/estadisticas" className="btn btn-outline min-h-10 px-3 py-2 text-sm">Ver estadísticas</Link>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Periodo del pulso de la plataforma">
          {PRESETS_RANGO.filter((p) => p.clave !== 'hoy').map((p) => (
            <button key={p.clave} type="button" aria-pressed={preset === p.clave} onClick={() => setPreset(p.clave)} className={`btn min-h-10 px-3 py-2 text-sm ${preset === p.clave ? 'btn-primary' : 'btn-outline'}`}>
              {p.etiqueta}
            </button>
          ))}
          {estadisticas && <span className="self-center text-xs text-zinc-500">
            {etiquetaDia(estadisticas.desde.slice(0, 10))} – {etiquetaDia(estadisticas.hasta.slice(0, 10))}
          </span>}
        </div>
        {cargandoEstadisticas && !estadisticas && !errorEstadisticas && (
          <p role="status" aria-live="polite" className="text-sm text-zinc-500">Cargando métricas del periodo…</p>
        )}
        {errorEstadisticas && <p role="alert" className="text-sm text-danger-400">No se pudieron cargar las métricas del periodo. {errorEstadisticas}</p>}
        <div className="sa-dashboard-metrics grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Tarjeta etiqueta="Restaurantes activos" valor={estadisticas ? estadisticas.resumen.restaurantesActivos : '—'} clase="text-ok-500" nota="Con suscripción vigente hoy" />
          <Tarjeta etiqueta="Ventas de clientes" valor={estadisticas ? `S/ ${estadisticas.resumen.ventas.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'} clase="text-brand-400" nota="Cuentas pagadas en el periodo" />
          <Tarjeta etiqueta="Pedidos de clientes" valor={estadisticas ? estadisticas.resumen.pedidos.toLocaleString('es-PE') : '—'} clase="text-zinc-100" nota="Comandas creadas en el periodo" />
          <Tarjeta etiqueta="Restaurantes nuevos" valor={estadisticas ? estadisticas.resumen.restaurantesNuevos : '—'} clase="text-brand-400" nota="Altas dentro del periodo" />
        </div>
        {estadisticas && <div className="sa-dashboard-reports grid gap-4 lg:grid-cols-2">
          <section className="rounded-xl border border-surface-700 bg-surface-900/60 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-xs font-semibold uppercase tracking-widest text-zinc-400">Ventas procesadas por clientes</h3>
              <span className="text-sm font-semibold text-zinc-200">S/ {estadisticas.resumen.ventas.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
            {estadisticas.evolucion.ventas.some((p) => p.valor > 0) ? <div className="flex h-28 items-end gap-1" role="img" aria-label="Tendencia diaria de ventas procesadas por restaurantes clientes">
              {estadisticas.evolucion.ventas.map((p) => {
                const max = Math.max(...estadisticas.evolucion.ventas.map((x) => x.valor), 1)
                return <div key={p.fecha} className="flex h-full flex-1 items-end" title={`${etiquetaDia(p.fecha)} · S/ ${p.valor.toFixed(2)}`}>
                  <div className={`w-full rounded-t-sm ${p.valor ? 'bg-brand-500' : 'bg-surface-700'}`} style={{ height: p.valor ? `${Math.max(4, p.valor / max * 100)}%` : '2px' }} />
                </div>
              })}
            </div> : <p className="py-6 text-center text-sm text-zinc-500">Sin ventas de clientes en este periodo.</p>}
            <div className="mt-2 flex justify-between text-[10px] text-zinc-500">
              <span>{estadisticas.evolucion.ventas[0] ? etiquetaDia(estadisticas.evolucion.ventas[0].fecha) : ''}</span>
              <span>{estadisticas.evolucion.ventas.at(-1) ? etiquetaDia(estadisticas.evolucion.ventas.at(-1)!.fecha) : ''}</span>
            </div>
          </section>
          <section className="rounded-xl border border-surface-700 bg-surface-900/60 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-xs font-semibold uppercase tracking-widest text-zinc-400">Clientes con más actividad</h3>
              <Link to="/super-admin/estadisticas" className="text-xs font-semibold text-brand-400 hover:text-brand-300">Ranking completo</Link>
            </div>
            {estadisticas.ranking.length ? <ol className="space-y-2">
              {estadisticas.ranking.slice(0, 5).map((r, i) => <li key={r.restauranteId} className="flex items-center gap-3 text-sm">
                <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold ${i === 0 ? 'bg-brand-500 text-surface-950' : 'bg-surface-700 text-zinc-300'}`}>{i + 1}</span>
                <span className="min-w-0 flex-1 truncate text-zinc-200">{r.nombre}</span>
                <span className="text-xs text-zinc-500">{r.pedidos} pedidos</span>
                <span className="shrink-0 font-semibold text-brand-400">S/ {r.ventas.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </li>)}
            </ol> : <EstadoVacio titulo="Sin actividad de clientes en el periodo." className="py-5" />}
          </section>
        </div>}
      </section>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Tarjeta
          etiqueta="Restaurantes registrados"
          valor={restaurantes.length}
          clase="text-zinc-100"
          nota="Altas totales de la plataforma"
        />
        <Tarjeta etiqueta="Restaurantes activos" valor={activos} clase="text-ok-500" nota="Pueden operar en la app" />
        <Tarjeta etiqueta="Restaurantes inactivos" valor={inactivos} clase="text-danger-500" nota="Vencidos o desactivados" />
        <Tarjeta
          etiqueta="Próximos a vencer"
          valor={conVencimiento.length > 0 ? proximos.length : '—'}
          clase="text-warn-400"
          nota={
            conVencimiento.length > 0
              ? `Vencen en los próximos ${DIAS_PARA_VENCER} días`
              : 'Sin fechas de vencimiento registradas'
          }
        />
        <Tarjeta etiqueta="Administradores registrados" valor={admins.length} clase="text-brand-400" nota="Cuentas de administrador de locales" />
        <Tarjeta etiqueta="Usuarios totales" valor={usuarios.length} clase="text-zinc-100" nota="Perfiles de todas las cuentas" />
      </div>

      <div className="mt-8 grid gap-5 lg:grid-cols-2">
        <section className="card min-w-0 p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-400">
              Restaurantes recientes
            </h2>
            <Link
              to="/super-admin/restaurantes"
              className="btn btn-outline min-h-9 px-3 py-1.5 text-sm"
            >
              Ver todos
            </Link>
          </div>

          {recientes.length === 0 ? (
            <EstadoVacio
              titulo="Aún no hay restaurantes"
              descripcion="Cuando des de alta el primer cliente aparecerá aquí."
            />
          ) : (
            <ul className="divide-y divide-surface-800">
              {recientes.map((r) => {
                const vencida = suSuscripcionVencida(r)
                const admin = adminDe(r.id)
                return (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3.5">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-zinc-100">{r.nombre}</p>
                      <p className="truncate text-xs text-zinc-500">
                        {admin ? `${admin.nombre} · ${admin.email ?? 'sin correo'}` : 'Sin administrador'}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${
                          vencida
                            ? 'border-danger-500/40 bg-danger-500/10 text-danger-500'
                            : 'border-ok-500/40 bg-ok-500/10 text-ok-500'
                        }`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${vencida ? 'bg-danger-500' : 'bg-ok-500'}`} />
                        {vencida ? 'Vencida' : r.suscripcion_activa ? 'Activa' : 'Suspendida'}
                      </span>
                      <span className="text-xs text-zinc-500">Alta {fmtFecha(r.created_at)}</span>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <section className="card min-w-0 p-5">
          <h2 className="mb-4 text-sm font-bold uppercase tracking-widest text-zinc-400">
            Actividad general
          </h2>

          {eventos.length === 0 ? (
            <EstadoVacio
              titulo="Todavía no hay actividad registrada"
              descripcion="Los altas de restaurantes y usuarios aparecerán aquí a medida que ocurran."
            />
          ) : (
            <ul className="space-y-3">
              {eventos.map((e) => (
                <li key={e.id} className="flex items-start gap-3">
                  <span
                    aria-hidden="true"
                    className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                      e.tipo === 'restaurante' ? 'bg-brand-500' : 'bg-ok-500'
                    }`}
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm text-zinc-200">{e.texto}</p>
                    <p className="text-xs text-zinc-500">
                      {fmtFecha(e.fecha)} · {fmtHora(e.fecha)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
