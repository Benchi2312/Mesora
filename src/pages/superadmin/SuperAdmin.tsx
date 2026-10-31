import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getApi } from '../../lib/api'
import type { AdminRestaurante, UsuarioPlataforma } from '../../lib/api'
import { fmtFecha, fmtHora } from '../../lib/format'
import { rolLabel } from '../../domain/security/roles'
import { suSuscripcionVencida } from '../../store/auth'
import type { Restaurante } from '../../types/database'
import { Spinner } from '../../components/LoadingScreen'
import EstadoVacio from '../../components/EstadoVacio'

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
    <div className="card p-5">
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

  if (cargando)
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    )

  if (error)
    return (
      <div className="aviso border-danger-500/40 bg-danger-500/10 text-danger-500">
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
