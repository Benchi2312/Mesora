import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { getApi } from '../../lib/api'
import type { AuditLog, Restaurante, Rol } from '../../types/database'
import { fmtFecha } from '../../lib/format'
import { normalizarContenidoUtf8, normalizarTextoUtf8 } from '../../domain/platform/normalizarUtf8'
import { rolLabel } from '../../domain/security/roles'
import {
  CATEGORIAS_AUDITORIA,
  CRITERIOS_AUDITORIA_VACIOS,
  categoriaDeAccion,
  etiquetaAccionAuditoria,
  etiquetaCategoria,
  filtrarAuditoria,
  hayFiltrosAuditoria,
} from '../../domain/platform/auditoria'
import type { CategoriaAuditoria, CriteriosAuditoria } from '../../domain/platform/auditoria'
import SuperAdminCarga from './SuperAdminCarga'
import EstadoVacio from '../../components/EstadoVacio'

const COLOR_CATEGORIA: Record<CategoriaAuditoria, string> = {
  restaurantes: 'border-brand-500/30 bg-brand-500/10 text-brand-400',
  usuarios: 'border-ok-500/30 bg-ok-500/10 text-ok-500',
  suscripciones: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
  configuracion: 'border-sky-500/30 bg-sky-500/10 text-sky-400',
  otros: 'border-surface-600 bg-surface-800 text-zinc-400',
}

export default function SuperAdminAuditoria() {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [restaurantes, setRestaurantes] = useState<Restaurante[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [criterios, setCriterios] = useState<CriteriosAuditoria>(CRITERIOS_AUDITORIA_VACIOS)
  const [detalles, setDetalles] = useState<Set<string>>(new Set())

  const cargar = useCallback(async () => {
    const api = getApi()
    const [aRes, rRes] = await Promise.all([api.getAuditoria(), api.getRestaurantes()])
    if (aRes.error || rRes.error) {
      setError(aRes.error ?? rRes.error ?? 'Error al cargar la auditoría')
      return
    }
    setLogs(aRes.data ?? [])
    setRestaurantes(rRes.data ?? [])
    setError(null)
  }, [])

  useEffect(() => {
    setCargando(true)
    void cargar().finally(() => setCargando(false))
  }, [cargar])

  const filtrados = useMemo(() => filtrarAuditoria(logs, criterios), [logs, criterios])
  const conFiltros = hayFiltrosAuditoria(criterios)

  const nombreRestaurante = (rid: string | null) =>
    restaurantes.find((r) => r.id === rid)?.nombre ?? null

  function cambiar<K extends keyof CriteriosAuditoria>(campo: K, valor: CriteriosAuditoria[K]) {
    setCriterios((c) => ({ ...c, [campo]: valor }))
  }

  function alternarDetalle(id: string) {
    setDetalles((prev) => {
      const nuevo = new Set(prev)
      if (nuevo.has(id)) nuevo.delete(id)
      else nuevo.add(id)
      return nuevo
    })
  }

  if (cargando) return <SuperAdminCarga recurso="el registro de auditoría" />

  if (error)
    return (
      <div role="alert" className="aviso border-danger-500/40 bg-danger-500/10 text-danger-500">
        No se pudo cargar la auditoría. {error}
      </div>
    )

  return (
    <div>
      <p className="mb-5 text-sm text-zinc-500">
        Registro append-only de las acciones importantes de la plataforma: quién las hizo, cuándo
        y sobre qué. Nadie puede editar ni borrar estas filas.
      </p>

      <div className="sa-controls mb-5 flex flex-wrap items-center gap-3">
        <input
          type="search"
          className="input min-h-11 w-full sm:max-w-xs"
          placeholder="Buscar por actor, acción o detalle…"
          aria-label="Buscar en la auditoría"
          value={criterios.busqueda}
          onChange={(e) => cambiar('busqueda', e.target.value)}
        />

        <select
          className="input min-h-11 w-auto"
          aria-label="Filtrar por categoría"
          value={criterios.categoria}
          onChange={(e) => cambiar('categoria', e.target.value as CriteriosAuditoria['categoria'])}
        >
          {CATEGORIAS_AUDITORIA.map((c) => (
            <option key={c.valor} value={c.valor}>
              {c.texto}
            </option>
          ))}
        </select>

        <select
          className="input min-h-11 w-auto"
          aria-label="Filtrar por restaurante"
          value={criterios.restauranteId}
          onChange={(e) => cambiar('restauranteId', e.target.value)}
        >
          <option value="todos">Restaurante: todos</option>
          {restaurantes.map((r) => (
            <option key={r.id} value={r.id}>
              Restaurante: {r.nombre}
            </option>
          ))}
        </select>

        {conFiltros && (
          <button
            type="button"
            className="btn btn-outline min-h-11 px-4"
            onClick={() => setCriterios(CRITERIOS_AUDITORIA_VACIOS)}
          >
            Limpiar filtros
          </button>
        )}

        <span className="ml-auto text-xs text-zinc-500" aria-live="polite">
          {filtrados.length} de {logs.length}
        </span>
      </div>

      {logs.length === 0 ? (
        <EstadoVacio
          titulo="Todavía no hay movimientos"
          descripcion="Las altas y los cambios de la plataforma quedarán registrados acá automáticamente."
        />
      ) : filtrados.length === 0 ? (
        <EstadoVacio
          titulo="Ningún movimiento coincide con los filtros"
          descripcion="Ajusta los filtros o límpialos para volver a ver el registro."
        />
      ) : (
        <div className="sa-table-shell overflow-hidden rounded-2xl border border-surface-800 bg-surface-900 shadow-sm shadow-black/30">
          <div className="sa-table-scroll overflow-x-auto">
            <table className="sa-mobile-table sa-table-auditoria w-full text-sm">
              <thead>
                <tr className="border-b border-surface-700 bg-surface-800/60 text-left text-xs uppercase tracking-widest text-zinc-400">
                  <th className="px-4 py-3.5 font-semibold">Fecha</th>
                  <th className="px-4 py-3.5 font-semibold">Acción</th>
                  <th className="px-4 py-3.5 font-semibold">Quién</th>
                  <th className="px-4 py-3.5 font-semibold">Restaurante</th>
                  <th className="px-4 py-3.5 font-semibold">
                    <span className="sr-only">Ver detalle</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-800">
                {filtrados.map((l) => {
                  const categoria = categoriaDeAccion(l.accion)
                  const abierto = detalles.has(l.id)
                  const descripcion = l.descripcion ? normalizarTextoUtf8(l.descripcion) : null
                  const detalle = normalizarContenidoUtf8(l.detalle)
                  const detalleJson =
                    detalle && Object.keys(detalle).length > 0
                      ? JSON.stringify(detalle, null, 2)
                      : null
                  return (
                      <Fragment key={l.id}>
                      <tr className="transition-colors hover:bg-surface-800/60">
                        <td className="whitespace-nowrap px-4 py-3.5 text-zinc-400">
                          {fmtFecha(l.created_at)}
                        </td>
                        <td className="px-4 py-3.5">
                          <p className="font-semibold text-zinc-100">
                            {etiquetaAccionAuditoria(l.accion)}
                          </p>
                          <span
                            className={`mt-1 inline-block rounded-full border px-2 py-0.5 text-[11px] font-semibold ${COLOR_CATEGORIA[categoria]}`}
                          >
                            {etiquetaCategoria(categoria)}
                          </span>
                        </td>
                        <td className="px-4 py-3.5">
                          <p className="font-semibold text-zinc-200">{l.actor_nombre ?? '—'}</p>
                          <p className="text-xs text-zinc-500">
                            {l.actor_rol ? rolLabel(l.actor_rol as Rol) : 'Sin sesión'}
                          </p>
                        </td>
                        <td className="px-4 py-3.5 text-zinc-300">
                          {nombreRestaurante(l.restaurante_id) ?? '—'}
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex justify-end">
                            {(descripcion || detalleJson) && (
                              <button
                                type="button"
                                className="btn btn-outline min-h-11 px-3 text-xs"
                                aria-expanded={abierto}
                                onClick={() => alternarDetalle(l.id)}
                              >
                                {abierto ? 'Ocultar' : 'Detalle'}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {abierto && (descripcion || detalleJson) && (
                        <tr>
                          <td colSpan={5} className="bg-surface-950/60 px-4 py-4">
                            {descripcion && (
                              <p className="text-sm leading-relaxed text-zinc-200">
                                {descripcion}
                              </p>
                            )}
                            {detalleJson && (
                              <pre className="mt-3 overflow-x-auto rounded-xl bg-surface-900 p-4 text-xs leading-relaxed text-zinc-400">
                                {detalleJson}
                              </pre>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
