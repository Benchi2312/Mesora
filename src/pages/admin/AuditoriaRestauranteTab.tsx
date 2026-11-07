import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getApi } from '../../lib/api'
import type { FiltrosAuditoriaRestaurante } from '../../lib/api'
import type { AuditLog } from '../../types/database'
import { normalizarContenidoUtf8, normalizarTextoUtf8 } from '../../domain/platform/normalizarUtf8'
import { fmtFecha } from '../../lib/format'
import { Spinner } from '../../components/LoadingScreen'
import EstadoVacio from '../../components/EstadoVacio'

const CATEGORIAS = [
  ['todas', 'Todas las acciones'],
  ['usuarios', 'Usuarios'],
  ['mesas', 'Mesas'],
  ['caja', 'Caja'],
  ['cuentas', 'Cuentas'],
  ['pedidos', 'Comandas'],
  ['configuracion', 'Configuración'],
] as const

const isoLocal = (valor: string, dias = 0) => {
  const [y, m, d] = valor.split('-').map(Number)
  return new Date(y, m - 1, d + dias).toISOString()
}

export default function AuditoriaRestauranteTab() {
  const [items, setItems] = useState<AuditLog[]>([])
  const [total, setTotal] = useState(0)
  const [busqueda, setBusqueda] = useState('')
  const [busquedaAplicada, setBusquedaAplicada] = useState('')
  const [categoria, setCategoria] = useState<FiltrosAuditoriaRestaurante['categoria']>('todas')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [pagina, setPagina] = useState(0)
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set())
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const secuencia = useRef(0)
  const limite = 50
  const filtrosActivos = Boolean(busqueda || categoria !== 'todas' || desde || hasta)

  useEffect(() => {
    const timer = setTimeout(() => { setBusquedaAplicada(busqueda.trim()); setPagina(0) }, 250)
    return () => clearTimeout(timer)
  }, [busqueda])

  const cargar = useCallback(async () => {
    if (desde && hasta && desde > hasta) {
      setError('La fecha final debe ser igual o posterior a la fecha inicial.')
      setCargando(false)
      return
    }
    const peticion = ++secuencia.current
    setCargando(true)
    const criterios: FiltrosAuditoriaRestaurante = {
      desde: desde ? isoLocal(desde) : null,
      hasta: hasta ? isoLocal(hasta, 1) : null,
      busqueda: busquedaAplicada,
      categoria,
      offset: pagina * limite,
      limite,
    }
    const resultado = await getApi().getAuditoriaRestaurante(criterios)
    if (peticion !== secuencia.current) return
    if (resultado.error) setError(resultado.error)
    else {
      setItems(resultado.data?.items ?? [])
      setTotal(resultado.data?.total ?? 0)
      setError(null)
    }
    setCargando(false)
  }, [desde, hasta, busquedaAplicada, categoria, pagina])

  useEffect(() => { void cargar() }, [cargar])

  const paginas = Math.max(1, Math.ceil(total / limite))
  const hayDatos = useMemo(() => total > 0, [total])
  const limpiar = () => {
    setBusqueda('')
    setBusquedaAplicada('')
    setCategoria('todas')
    setDesde('')
    setHasta('')
    setPagina(0)
  }
  const alternar = (id: string) => setAbiertos((actual) => {
    const siguiente = new Set(actual)
    if (siguiente.has(id)) siguiente.delete(id)
    else siguiente.add(id)
    return siguiente
  })

  return (
    <section className="space-y-4" aria-label="Auditoría del restaurante">
      <div className="aviso border-brand-500/30 bg-brand-500/10 text-brand-300">
        Registro de operaciones de este restaurante. Los movimientos conservan actor, hora, datos anteriores y nuevos, y detalle. No se pueden editar ni borrar.
      </div>
      <div className="card grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
        <label className="text-sm text-zinc-400">Buscar usuario, acción, entidad o detalle
          <input type="search" className="input mt-1 min-h-11 w-full" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Ej. Carlos, cuenta_anular, mesa o motivo" />
        </label>
        <label className="text-sm text-zinc-400">Tipo de movimiento
          <select className="input mt-1 min-h-11 w-full" value={categoria} onChange={(e) => { setCategoria(e.target.value as typeof categoria); setPagina(0) }}>
            {CATEGORIAS.map(([valor, nombre]) => <option key={valor} value={valor}>{nombre}</option>)}
          </select>
        </label>
        <label className="text-sm text-zinc-400">Desde
          <input type="date" className="input mt-1 min-h-11 w-full" value={desde} max={hasta || undefined} onChange={(e) => { setDesde(e.target.value); setPagina(0) }} />
        </label>
        <label className="text-sm text-zinc-400">Hasta
          <input type="date" className="input mt-1 min-h-11 w-full" value={hasta} min={desde || undefined} onChange={(e) => { setHasta(e.target.value); setPagina(0) }} />
        </label>
        {filtrosActivos && <button type="button" className="btn btn-outline min-h-11 px-4 sm:col-span-2 xl:col-span-3 xl:justify-self-start" onClick={limpiar}>Limpiar filtros</button>}
      </div>

      {error && <div role="alert" className="aviso border-danger-500/40 bg-danger-500/10 text-danger-400">No se pudo cargar la auditoría. {error}</div>}
      {cargando && items.length === 0 ? <div className="flex justify-center py-10"><Spinner /></div>
        : !hayDatos ? <EstadoVacio titulo="No hay movimientos para mostrar." descripcion="Prueba otro periodo o filtro. Los movimientos nuevos aparecerán aquí automáticamente." />
          : items.length === 0 ? <EstadoVacio titulo="Ningún movimiento coincide con estos filtros." descripcion="Cambia la búsqueda o limpia los filtros." />
            : <div className="space-y-3">
              {items.map((l) => {
                const abierto = abiertos.has(l.id)
                const descripcion = normalizarTextoUtf8(l.descripcion || l.accion)
                const detalleNormalizado = normalizarContenidoUtf8(l.detalle)
                const detalle = detalleNormalizado && Object.keys(detalleNormalizado).length ? JSON.stringify(detalleNormalizado, null, 2) : null
                return <article key={l.id} className="card min-w-0 p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="break-words font-semibold text-zinc-100">{descripcion}</p>
                      <p className="mt-1 text-sm text-zinc-400">{l.actor_nombre ?? 'Usuario del sistema'}{l.actor_rol ? ` · ${l.actor_rol}` : ''}</p>
                      <p className="mt-1 text-xs text-zinc-500">{l.entidad ?? 'Registro'}{l.entidad_id ? ` · ${l.entidad_id}` : ''}</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <time className="text-xs text-zinc-500">{fmtFecha(l.created_at)}</time>
                      {(l.descripcion || detalle) && <button type="button" className="btn btn-outline min-h-10 px-3 text-xs" aria-expanded={abierto} onClick={() => alternar(l.id)}>{abierto ? 'Ocultar detalle' : 'Ver detalle'}</button>}
                    </div>
                  </div>
                  {abierto && detalle && <pre className="mt-4 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-xl border border-surface-700 bg-surface-950 p-3 text-xs leading-relaxed text-zinc-400">{detalle}</pre>}
                </article>
              })}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 text-sm text-zinc-400">
                <span>{total} movimientos · página {pagina + 1} de {paginas}</span>
                <div className="flex gap-2">
                  <button type="button" className="btn btn-outline min-h-11 px-3" disabled={pagina === 0 || cargando} onClick={() => setPagina((p) => p - 1)}>Anterior</button>
                  <button type="button" className="btn btn-outline min-h-11 px-3" disabled={pagina + 1 >= paginas || cargando} onClick={() => setPagina((p) => p + 1)}>Siguiente</button>
                </div>
              </div>
            </div>}
      {cargando && items.length > 0 && <p role="status" className="text-right text-xs text-zinc-500">Actualizando…</p>}
    </section>
  )
}
