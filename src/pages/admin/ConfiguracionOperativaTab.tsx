import { useCallback, useEffect, useMemo, useState } from 'react'
import PageHeader from '../../components/PageHeader'
import { Modal } from '../../components/ui'
import PoliticaCobro from './PoliticaCobro'
import { getApi } from '../../lib/api'
import { useCurrentContext } from '../../lib/useCurrentContext'
import {
  GRUPOS_DESTINO_ESTACION,
  categoriaEsMixta,
  productosConEstacionExplicita,
  type CambiosConfiguracionOperativa,
  type ConfiguracionOperativaEditor,
  type DestinoOperativoEditor,
  type EstacionOperativaEditor,
} from '../../domain/restaurant/operacion'
import type { EstacionComanda, GrupoDestinoEstacion, TipoDestinoEstacion } from '../../types/database'

const ETIQUETA_ESTACION: Record<EstacionComanda, string> = {
  cocina: 'Cocina',
  bar: 'Barra',
  otros: 'Otros',
}

function copiaConfig(config: ConfiguracionOperativaEditor): CambiosConfiguracionOperativa {
  return {
    modalidad_cobro: config.modalidad_cobro,
    estaciones: config.estaciones.map((estacion) => ({
      ...estacion,
      destinos: estacion.destinos.map((destino) => ({
        ...destino,
        configuracion: { ...destino.configuracion },
      })),
    })),
    categorias: config.categorias.map((categoria) => ({ ...categoria })),
  }
}

function nombreDestino(tipo: TipoDestinoEstacion, codigo: EstacionComanda, ordinal: number) {
  const base = tipo === 'kds' ? `KDS ${ETIQUETA_ESTACION[codigo]}` : `Impresora ${ETIQUETA_ESTACION[codigo]}`
  return ordinal > 1 ? `${base} ${ordinal}` : base
}

function destinoNuevo(tipo: TipoDestinoEstacion, estacion: EstacionOperativaEditor): DestinoOperativoEditor {
  const ordinal = estacion.destinos.filter((destino) => destino.tipo === tipo).length + 1
  return {
    id: null,
    tipo,
    grupo: 'principal',
    nombre: nombreDestino(tipo, estacion.codigo, ordinal),
    papel_mm: tipo === 'impresora' ? 80 : null,
    configuracion: tipo === 'impresora' ? { copias: 1 } : {},
    activo: true,
  }
}

export default function ConfiguracionOperativaTab() {
  const { restaurante, usuario } = useCurrentContext()
  const restauranteId = restaurante?.id
  const esAdminRestaurante = usuario?.rol === 'admin_restaurante' && usuario.restaurante_id === restauranteId
  const [config, setConfig] = useState<ConfiguracionOperativaEditor | null>(null)
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [confirmarGuardar, setConfirmarGuardar] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    if (!restauranteId || !esAdminRestaurante) {
      setCargando(false)
      setConfig(null)
      return
    }
    setCargando(true)
    setError(null)
    const resultado = await getApi().getConfiguracionOperativa(restauranteId)
    if (resultado.error || !resultado.data) {
      setConfig(null)
      setError(resultado.error ?? 'No se pudo cargar la configuración. Actualiza la página e inténtalo de nuevo.')
    } else {
      setConfig(resultado.data)
    }
    setCargando(false)
  }, [restauranteId, esAdminRestaurante])

  useEffect(() => { void cargar() }, [cargar])

  const editando = Boolean(config && !config.solo_lectura)
  const categoriasPorEstacion = useMemo(() => {
    const resultado = new Map<EstacionComanda, string[]>()
    for (const codigo of ['cocina', 'bar', 'otros'] as const) resultado.set(codigo, [])
    for (const categoria of config?.categorias ?? []) {
      if (categoria.estacion_codigo) resultado.get(categoria.estacion_codigo)?.push(categoria.nombre)
    }
    return resultado
  }, [config?.categorias])

  function cambiarEstacion(codigo: EstacionComanda, actualizar: (estacion: EstacionOperativaEditor) => EstacionOperativaEditor) {
    setAviso(null)
    setConfig((actual) => actual ? {
      ...actual,
      estaciones: actual.estaciones.map((estacion) => estacion.codigo === codigo ? actualizar(estacion) : estacion),
    } : actual)
  }

  function cambiarDestino(codigo: EstacionComanda, destinoId: string | null, indice: number, actualizar: (destino: DestinoOperativoEditor) => DestinoOperativoEditor) {
    cambiarEstacion(codigo, (estacion) => ({
      ...estacion,
      destinos: estacion.destinos.map((destino, i) =>
        i === indice && destino.id === destinoId ? actualizar(destino) : destino,
      ),
    }))
  }

  function moverEstacion(codigo: EstacionComanda, direccion: -1 | 1) {
    setConfig((actual) => {
      if (!actual) return actual
      const ordenadas = [...actual.estaciones].sort((a, b) => a.orden - b.orden)
      const indice = ordenadas.findIndex((estacion) => estacion.codigo === codigo)
      const destino = indice + direccion
      if (indice < 0 || destino < 0 || destino >= ordenadas.length) return actual
      const actualizadas = [...ordenadas]
      ;[actualizadas[indice], actualizadas[destino]] = [actualizadas[destino], actualizadas[indice]]
      return { ...actual, estaciones: actualizadas.map((estacion, i) => ({ ...estacion, orden: (i + 1) * 10 })) }
    })
    setAviso(null)
  }

  async function guardar() {
    if (!restauranteId || !config || guardando || !editando) return
    setGuardando(true)
    setError(null)
    const resultado = await getApi().guardarConfiguracionOperativa(restauranteId, copiaConfig(config))
    setGuardando(false)
    setConfirmarGuardar(false)
    if (resultado.error || !resultado.data) {
      setError(resultado.error ?? 'No se pudo confirmar el guardado. Actualiza antes de volver a intentarlo.')
      return
    }
    setConfig(resultado.data)
    setAviso('Estaciones y categorías guardadas. Los permisos de cobro se aplican en su propia sección.')
  }

  if (!esAdminRestaurante) {
    return (
      <section className="card p-5 sm:p-7" role="alert">
        <h2 className="text-lg font-extrabold text-zinc-100">Acceso restringido</h2>
        <p className="mt-2 text-sm text-zinc-400">Solo el administrador de este restaurante puede consultar y editar la configuración operativa.</p>
      </section>
    )
  }

  if (cargando) return <div className="card p-6 text-sm text-zinc-400" role="status">Cargando configuración operativa…</div>
  if (!config) {
    return (
      <section className="card p-5 sm:p-7">
        <PageHeader titulo="Configuración operativa" descripcion="Define cómo trabaja tu restaurante. Las estaciones aplican a comandas nuevas; los permisos de cobro, a cobros futuros." />
        <p className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300" role="alert">{error}</p>
        <button type="button" onClick={() => void cargar()} className="btn-secondary mt-4 min-h-11">Reintentar carga</button>
      </section>
    )
  }

  const estacionesOrdenadas = [...config.estaciones].sort((a, b) => a.orden - b.orden)
  const destinosKds = config.estaciones.flatMap((estacion) => estacion.destinos.filter((destino) => destino.tipo === 'kds' && destino.activo).map((destino) => `${estacion.nombre}: ${destino.nombre} (${destino.grupo})`))
  const destinosImpresion = config.estaciones.flatMap((estacion) => estacion.destinos.filter((destino) => destino.tipo === 'impresora' && destino.activo).map((destino) => `${estacion.nombre}: ${destino.nombre} (${destino.grupo}, ${destino.papel_mm} mm)`))
  const resumen = (
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <h4 className="font-bold text-zinc-100">Permisos de cobro</h4>
        <p className="mt-1 text-sm text-zinc-300">Se configuran y confirman por separado arriba.</p>
      </div>
      <div>
        <h4 className="font-bold text-zinc-100">Estaciones activas</h4>
        <p className="mt-1 text-sm text-zinc-300">{estacionesOrdenadas.filter((estacion) => estacion.activo).map((estacion) => estacion.nombre).join(', ') || 'Ninguna'}</p>
      </div>
      <div>
        <h4 className="font-bold text-zinc-100">Categorías por estación</h4>
        <ul className="mt-1 space-y-1 text-sm text-zinc-300">
          {estacionesOrdenadas.map((estacion) => (
            <li key={estacion.codigo}><span className="font-semibold">{estacion.nombre}:</span> {categoriasPorEstacion.get(estacion.codigo)?.join(', ') || 'Sin categorías asignadas'}</li>
          ))}
        </ul>
      </div>
      <div>
        <h4 className="font-bold text-zinc-100">Destinos KDS activos</h4>
        <p className="mt-1 text-sm text-zinc-300">{destinosKds.join(' · ') || 'Ninguno'}</p>
      </div>
      <div className="sm:col-span-2">
        <h4 className="font-bold text-zinc-100">Impresión</h4>
        <p className="mt-1 text-sm text-zinc-300">{destinosImpresion.join(' · ') || 'No hay destinos de impresora configurados.'}</p>
        <p className="mt-1 text-xs text-emerald-300">Impresión manual disponible. La impresión automática está desactivada; no hay agente local.</p>
      </div>
      <p className="sm:col-span-2 rounded-lg border border-surface-700 bg-surface-900/70 p-3 text-sm text-zinc-300">Estos cambios se preparan para comandas nuevas. No modifican comandas, pedidos, cuentas ni pagos existentes.</p>
    </div>
  )

  return (
    <section className="space-y-6" aria-label="Configuración operativa">
      <PageHeader titulo="Configuración operativa" descripcion="Define cómo trabaja tu restaurante. Las estaciones aplican a comandas nuevas; los permisos de cobro, a cobros futuros." />
      {config.solo_lectura && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm leading-relaxed text-amber-200" role="status">
          {config.limitacion ?? 'La configuración se muestra como vista previa.'} El guardado estará disponible cuando se instale la migración de esta fase.
        </div>
      )}
      {error && <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300" role="alert">{error}</div>}
      {aviso && <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-300" role="status">{aviso}</div>}

      {restauranteId && <PoliticaCobro restauranteId={restauranteId} onAplicada={(modalidad) => setConfig((actual) => actual ? { ...actual, modalidad_cobro: modalidad } : actual)} />}

      <section className="space-y-4" aria-labelledby="estaciones-titulo">
        <div>
          <h2 id="estaciones-titulo" className="text-lg font-extrabold text-zinc-100">Estaciones y destinos</h2>
          <p className="mt-1 text-sm text-zinc-400">Organiza las comandas por Cocina, Barra y Otros. Los cambios aplican a comandas nuevas.</p>
        </div>
        {estacionesOrdenadas.map((estacion, indice) => (
          <article key={estacion.codigo} className="card min-w-0 p-4 sm:p-6" aria-label={`Estación ${estacion.nombre}`}>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center">
                <label className="flex min-h-11 items-center gap-3 text-sm font-semibold text-zinc-200">
                  <input type="checkbox" checked={estacion.activo} disabled={!editando || guardando} onChange={(e) => cambiarEstacion(estacion.codigo, (actual) => ({ ...actual, activo: e.target.checked }))} className="h-7 w-7 shrink-0 accent-amber-500" aria-label={`Activar ${estacion.nombre}`} />
                  Estación activa
                </label>
                <label className="min-w-0 flex-1 text-sm font-medium text-zinc-300">
                  Nombre visible
                  <input value={estacion.nombre} maxLength={60} disabled={!editando || guardando} onChange={(e) => cambiarEstacion(estacion.codigo, (actual) => ({ ...actual, nombre: e.target.value }))} className="input mt-1 min-h-11 w-full" aria-label={`Nombre visible de ${ETIQUETA_ESTACION[estacion.codigo]}`} />
                </label>
              </div>
              <div className="flex gap-2 sm:shrink-0">
                <button type="button" disabled={!editando || indice === 0} onClick={() => moverEstacion(estacion.codigo, -1)} className="btn-secondary min-h-11 flex-1 sm:flex-none" aria-label={`Subir ${estacion.nombre}`}>Subir</button>
                <button type="button" disabled={!editando || indice === estacionesOrdenadas.length - 1} onClick={() => moverEstacion(estacion.codigo, 1)} className="btn-secondary min-h-11 flex-1 sm:flex-none" aria-label={`Bajar ${estacion.nombre}`}>Bajar</button>
              </div>
            </div>

            <div className="mt-4 rounded-lg border border-surface-700 bg-surface-900/50 p-3">
              <p className="text-xs font-bold uppercase tracking-wide text-zinc-400">Categorías asociadas</p>
              <p className="mt-1 break-words text-sm text-zinc-200">{categoriasPorEstacion.get(estacion.codigo)?.join(', ') || 'Sin categorías predeterminadas'}</p>
            </div>

            <div className="mt-5 flex flex-col gap-2 sm:flex-row">
              <button type="button" disabled={!editando || guardando} onClick={() => cambiarEstacion(estacion.codigo, (actual) => ({ ...actual, destinos: [...actual.destinos, destinoNuevo('kds', actual)] }))} className="btn-secondary min-h-11">Agregar destino KDS</button>
              <button type="button" disabled={!editando || guardando} onClick={() => cambiarEstacion(estacion.codigo, (actual) => ({ ...actual, destinos: [...actual.destinos, destinoNuevo('impresora', actual)] }))} className="btn-secondary min-h-11">Agregar destino impresora</button>
            </div>

            <div className="mt-4 space-y-3">
              {estacion.destinos.map((destino, destinoIndice) => (
                <div key={destino.id ?? `${estacion.codigo}-${destino.tipo}-${destinoIndice}`} className="grid min-w-0 gap-3 rounded-xl border border-surface-700 bg-surface-900/70 p-3 sm:p-4 lg:grid-cols-12 lg:items-end">
                  <label className="flex min-h-11 items-center gap-2 text-sm font-semibold text-zinc-200 lg:col-span-2">
                    <input type="checkbox" checked={destino.activo} disabled={!editando || guardando} onChange={(e) => cambiarDestino(estacion.codigo, destino.id, destinoIndice, (actual) => ({ ...actual, activo: e.target.checked }))} className="h-7 w-7 shrink-0 accent-amber-500" aria-label={`Activar destino ${destino.nombre}`} />
                    {destino.activo ? 'Activo' : 'Inactivo'}
                  </label>
                  <label className="min-w-0 text-sm font-medium text-zinc-300 lg:col-span-4">
                    Nombre del destino
                    <input value={destino.nombre} maxLength={80} disabled={!editando || guardando} onChange={(e) => cambiarDestino(estacion.codigo, destino.id, destinoIndice, (actual) => ({ ...actual, nombre: e.target.value }))} className="input mt-1 min-h-11 w-full" aria-label={`Nombre del destino ${destino.nombre}`} />
                  </label>
                  <label className="text-sm font-medium text-zinc-300 lg:col-span-2">
                    Tipo
                    <select value={destino.tipo} disabled={!editando || guardando} onChange={(e) => {
                      const tipo = e.target.value as TipoDestinoEstacion
                      cambiarDestino(estacion.codigo, destino.id, destinoIndice, (actual) => ({ ...actual, tipo, papel_mm: tipo === 'impresora' ? 80 : null, configuracion: tipo === 'impresora' ? { copias: 1 } : {} }))
                    }} className="input mt-1 min-h-11 w-full" aria-label={`Tipo de ${destino.nombre}`}>
                      <option value="kds">KDS</option><option value="impresora">Impresora</option>
                    </select>
                  </label>
                  <label className="text-sm font-medium text-zinc-300 lg:col-span-2">
                    Grupo
                    <select value={destino.grupo} disabled={!editando || guardando} onChange={(e) => cambiarDestino(estacion.codigo, destino.id, destinoIndice, (actual) => ({ ...actual, grupo: e.target.value as GrupoDestinoEstacion }))} className="input mt-1 min-h-11 w-full" aria-label={`Grupo de ${destino.nombre}`}>
                      {GRUPOS_DESTINO_ESTACION.map((grupo) => <option key={grupo} value={grupo}>{grupo === 'principal' ? 'Principal' : 'Respaldo'}</option>)}
                    </select>
                  </label>
                  {destino.tipo === 'impresora' && (
                    <>
                      <label className="text-sm font-medium text-zinc-300 lg:col-span-1">
                        Papel
                        <select value={destino.papel_mm ?? 80} disabled={!editando || guardando} onChange={(e) => cambiarDestino(estacion.codigo, destino.id, destinoIndice, (actual) => ({ ...actual, papel_mm: Number(e.target.value) as 58 | 80 }))} className="input mt-1 min-h-11 w-full" aria-label={`Tamaño de papel de ${destino.nombre}`}>
                          <option value={58}>58 mm</option><option value={80}>80 mm</option>
                        </select>
                      </label>
                      <label className="text-sm font-medium text-zinc-300 lg:col-span-1">
                        Copias
                        <select value={Number(destino.configuracion.copias ?? 1)} disabled={!editando || guardando} onChange={(e) => cambiarDestino(estacion.codigo, destino.id, destinoIndice, (actual) => ({ ...actual, configuracion: { ...actual.configuracion, copias: Number(e.target.value) } }))} className="input mt-1 min-h-11 w-full" aria-label={`Copias de ${destino.nombre}`}>
                          {[1, 2, 3, 4, 5].map((copias) => <option key={copias} value={copias}>{copias}</option>)}
                        </select>
                      </label>
                      <p className="text-xs text-emerald-300 sm:col-span-2 lg:col-span-12">Impresión manual disponible. No se afirma que haya una impresora conectada; la impresión automática está desactivada.</p>
                    </>
                  )}
                  {destino.tipo === 'kds' && <p className="text-xs text-zinc-400 sm:col-span-2 lg:col-span-12">Destino lógico KDS. Esta configuración aún no cambia el KDS actual.</p>}
                </div>
              ))}
            </div>
          </article>
        ))}
      </section>

      <section className="card p-4 sm:p-6" aria-labelledby="categorias-operativas-titulo">
        <div className="mb-4">
          <h2 id="categorias-operativas-titulo" className="text-lg font-extrabold text-zinc-100">Categorías y estaciones</h2>
          <p className="mt-1 text-sm text-zinc-400">La estación predeterminada se hereda solo cuando el producto no tiene una asignación explícita.</p>
        </div>
        {config.categorias.length === 0 ? (
          <p className="rounded-lg border border-surface-700 bg-surface-900/60 p-4 text-sm text-zinc-400">Aún no hay categorías. Cuando agregues categorías al menú, aparecerán aquí.</p>
        ) : (
          <div className="space-y-3">
            {config.categorias.map((categoria) => {
              const mixto = categoriaEsMixta(categoria, config.productos)
              const productosExplicitos = productosConEstacionExplicita(categoria.id, config.productos)
              return (
                <article key={categoria.id} className="grid min-w-0 gap-3 rounded-xl border border-surface-700 bg-surface-900/60 p-3 sm:grid-cols-2 sm:items-center sm:p-4">
                  <div className="min-w-0">
                    <h3 className="break-words font-bold text-zinc-100">{categoria.nombre}</h3>
                    <p className="mt-1 text-xs leading-relaxed text-zinc-400">Los productos con estación propia conservan prioridad sobre la categoría.</p>
                    {productosExplicitos.length > 0 && (
                      <p className="mt-2 text-xs text-sky-300">Asignación explícita: {productosExplicitos.map((producto) => `${producto.nombre} (${ETIQUETA_ESTACION[producto.estacion!]})`).join(', ')}</p>
                    )}
                    {mixto && <p className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-xs leading-relaxed text-amber-200" role="status">Categoría mixta: sus productos terminan en más de una estación. Las asignaciones explícitas de cada producto tienen prioridad.</p>}
                  </div>
                  <label className="text-sm font-medium text-zinc-300">
                    Estación predeterminada
                    <select value={categoria.estacion_codigo ?? ''} disabled={!editando || guardando} onChange={(e) => {
                      const codigo = e.target.value ? e.target.value as EstacionComanda : null
                      setConfig((actual) => actual ? { ...actual, categorias: actual.categorias.map((c) => c.id === categoria.id ? { ...c, estacion_codigo: codigo } : c) } : actual)
                      setAviso(null)
                    }} className="input mt-1 min-h-11 w-full" aria-label={`Estación predeterminada de ${categoria.nombre}`}>
                      <option value="">Sin estación predeterminada</option>
                      {config.estaciones.map((estacion) => <option key={estacion.codigo} value={estacion.codigo}>{estacion.nombre}{estacion.activo ? '' : ' (inactiva)'}</option>)}
                    </select>
                  </label>
                </article>
              )
            })}
          </div>
        )}
      </section>

      <section className="card p-4 sm:p-6" aria-labelledby="resumen-operativo-titulo">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 id="resumen-operativo-titulo" className="text-lg font-extrabold text-zinc-100">Resumen antes de guardar</h2>
            <p className="mt-1 text-sm text-zinc-400">Revisa destinos, estaciones y categorías antes de confirmar.</p>
          </div>
          <button type="button" disabled={!editando || guardando} onClick={() => setConfirmarGuardar(true)} className="btn-primary min-h-11 w-full sm:w-auto">Revisar y guardar</button>
        </div>
        {resumen}
      </section>

      {confirmarGuardar && (
        <Modal titulo="Confirma la configuración operativa" onCerrar={() => !guardando && setConfirmarGuardar(false)} ancho="max-w-3xl">
          <p className="mb-5 text-sm leading-relaxed text-zinc-300">Se guardarán preferencias para el restaurante <strong>{restaurante?.nombre}</strong>. Esta acción quedará en auditoría. No cambiará las autorizaciones de cobro ni los pedidos, cuentas o pagos actuales.</p>
          {resumen}
          {error && <p className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300" role="alert">{error}</p>}
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" disabled={guardando} onClick={() => setConfirmarGuardar(false)} className="btn-secondary min-h-11">Seguir editando</button>
            <button type="button" disabled={guardando} onClick={() => void guardar()} className="btn-primary min-h-11">{guardando ? 'Guardando…' : 'Confirmar y guardar'}</button>
          </div>
        </Modal>
      )}
    </section>
  )
}
