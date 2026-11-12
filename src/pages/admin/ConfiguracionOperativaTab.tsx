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

function destinoPrincipalActivo(estacion: EstacionOperativaEditor, tipo: TipoDestinoEstacion): boolean {
  return estacion.activo && estacion.destinos.some((destino) =>
    destino.tipo === tipo && destino.grupo === 'principal' && destino.activo,
  )
}

function resumenDestinos(estacion: EstacionOperativaEditor): string {
  const kds = destinoPrincipalActivo(estacion, 'kds')
  const ticketera = destinoPrincipalActivo(estacion, 'impresora')
  if (kds && ticketera) return 'Pantalla KDS y ticketera'
  if (kds) return 'Solo pantalla KDS'
  if (ticketera) return 'Solo ticketera'
  return 'Sin salida operativa'
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

  function cambiarDestinoPrincipal(codigo: EstacionComanda, tipo: TipoDestinoEstacion, activo: boolean) {
    cambiarEstacion(codigo, (actual) => {
      // Si una estación había sido desactivada desde el bloque avanzado, al
      // reactivarla con un switch básico empezamos solo con el destino elegido.
      const existentes = !actual.activo && activo
        ? actual.destinos.map((destino) => destino.grupo === 'principal' ? { ...destino, activo: false } : destino)
        : actual.destinos
      const tieneDestino = existentes.some((destino) => destino.tipo === tipo && destino.grupo === 'principal')
      const destinos = tieneDestino
        ? existentes.map((destino) => destino.tipo === tipo && destino.grupo === 'principal'
          ? { ...destino, activo }
          : destino)
        : activo
          ? [...existentes, destinoNuevo(tipo, actual)]
          : existentes
      return { ...actual, activo: activo ? true : actual.activo, destinos }
    })
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
    if (resultado.error || !resultado.data) {
      setError(resultado.error ?? 'No se pudo confirmar el guardado. Actualiza antes de volver a intentarlo.')
      return
    }
    setConfirmarGuardar(false)
    setConfig(resultado.data)
    setAviso('Configuración de comandas guardada correctamente. Queda activa para comandas nuevas; las existentes conservan su ruta.')
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
  const estacionesPrincipales = (['cocina', 'bar'] as const).map((codigo) =>
    config.estaciones.find((estacion) => estacion.codigo === codigo)!,
  )
  const resumen = (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {estacionesPrincipales.map((estacion) => {
          const sinSalida = resumenDestinos(estacion) === 'Sin salida operativa'
          return (
            <article key={estacion.codigo} className={`rounded-xl border p-4 ${sinSalida ? 'border-amber-500/40 bg-amber-500/10' : 'border-surface-700 bg-surface-900/70'}`}>
              <h4 className="font-bold text-zinc-100">{ETIQUETA_ESTACION[estacion.codigo]}</h4>
              <p className="mt-1 text-sm text-zinc-300">{resumenDestinos(estacion)}</p>
              {sinSalida && <p className="mt-2 text-xs leading-relaxed text-amber-200">Los pedidos nuevos de esta área no tendrán salida operativa.</p>}
            </article>
          )
        })}
      </div>
      <p className="rounded-lg border border-surface-700 bg-surface-900/70 p-3 text-sm text-zinc-300">La configuración solo se aplicará a comandas nuevas. Las rutas y salidas de comandas anteriores no cambian.</p>
    </div>
  )

  return (
    <section className="space-y-6" aria-label="Configuración operativa">
      <PageHeader titulo="Configuración operativa" descripcion="Define cómo trabajan las comandas de tu restaurante. Los cambios aplican a las nuevas." />
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
          <h2 id="estaciones-titulo" className="text-lg font-extrabold text-zinc-100">Cómo reciben comandas Cocina y Barra</h2>
          <p className="mt-1 text-sm text-zinc-400">La pantalla KDS es un área de trabajo: Cocina o Barra puede avanzar el estado de sus comandas. Desde el celular, Ventas y Auditoría sirven para consulta administrativa; no reemplazan el KDS ni permiten avanzar comandas.</p>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {estacionesPrincipales.map((estacion) => {
            const kdsActivo = destinoPrincipalActivo(estacion, 'kds')
            const ticketeraActiva = destinoPrincipalActivo(estacion, 'impresora')
            const sinSalida = !kdsActivo && !ticketeraActiva
            return (
              <article key={estacion.codigo} className="card min-w-0 p-4 sm:p-6" aria-label={`Comandas de ${ETIQUETA_ESTACION[estacion.codigo]}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-xl font-extrabold text-zinc-100">{ETIQUETA_ESTACION[estacion.codigo]}</h3>
                    <p className="mt-1 text-sm text-zinc-400">Ahora: {resumenDestinos(estacion)}</p>
                  </div>
                  <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${sinSalida ? 'border-amber-500/40 bg-amber-500/10 text-amber-200' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'}`}>
                    {sinSalida ? 'Revisar salidas' : 'Configurado'}
                  </span>
                </div>
                <div className="mt-5 space-y-3">
                  <label className="flex min-h-14 cursor-pointer items-start gap-3 rounded-xl border border-surface-700 bg-surface-900/60 p-3">
                    <input type="checkbox" checked={kdsActivo} disabled={!editando || guardando} onChange={(e) => cambiarDestinoPrincipal(estacion.codigo, 'kds', e.target.checked)} className="mt-0.5 h-7 w-7 shrink-0 accent-amber-500" aria-label={`Pantalla KDS de ${ETIQUETA_ESTACION[estacion.codigo]}`} />
                    <span>
                      <span className="block text-sm font-semibold text-zinc-100">Pantalla KDS</span>
                      <span className="mt-0.5 block text-xs leading-relaxed text-zinc-400">Área de trabajo donde se ven y avanzan las comandas de {ETIQUETA_ESTACION[estacion.codigo]}.</span>
                    </span>
                  </label>
                  <label className="flex min-h-14 cursor-pointer items-start gap-3 rounded-xl border border-surface-700 bg-surface-900/60 p-3">
                    <input type="checkbox" checked={ticketeraActiva} disabled={!editando || guardando} onChange={(e) => cambiarDestinoPrincipal(estacion.codigo, 'impresora', e.target.checked)} className="mt-0.5 h-7 w-7 shrink-0 accent-amber-500" aria-label={`Ticketera de ${ETIQUETA_ESTACION[estacion.codigo]}`} />
                    <span>
                      <span className="block text-sm font-semibold text-zinc-100">Ticketera</span>
                      <span className="mt-0.5 block text-xs leading-relaxed text-zinc-400">Crea una salida para imprimir. Si ya hay un agente vinculado puede enviarla a la cola; Mesora no confirma que haya salido papel.</span>
                    </span>
                  </label>
                </div>
                {sinSalida ? (
                  <p className="mt-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm leading-relaxed text-amber-200" role="status">
                    No hay salida activa. Los pedidos nuevos de {ETIQUETA_ESTACION[estacion.codigo]} no aparecerán en KDS ni crearán una salida de impresión.
                  </p>
                ) : (
                  <p className="mt-4 rounded-lg border border-surface-700 bg-surface-900/50 p-3 text-sm leading-relaxed text-zinc-300">Resultado: {resumenDestinos(estacion)} recibirán las comandas nuevas de esta área.</p>
                )}
              </article>
            )
          })}
        </div>
      </section>

      <details className="card p-4 sm:p-6">
        <summary className="min-h-11 cursor-pointer select-none font-semibold text-zinc-200">Opciones avanzadas y compatibilidad</summary>
        <p className="mt-2 text-sm leading-relaxed text-zinc-400">Aquí se conservan los nombres de destinos, papel, copias, destinos de respaldo, categorías y la estación Otros. Los productos nuevos asignan su ruta según “Es bebida”; los productos existentes mantienen la prioridad histórica: estación explícita, categoría heredada y luego regla de bebida. Los cambios siguen aplicando solo a comandas nuevas.</p>
        <section className="mt-5 space-y-4" aria-labelledby="estaciones-avanzadas-titulo">
          <div>
            <h3 id="estaciones-avanzadas-titulo" className="text-base font-bold text-zinc-100">Destinos y ajustes heredados</h3>
            <p className="mt-1 text-sm text-zinc-400">Impresión manual disponible cuando no se usa un agente vinculado. Activar un destino no abre el diálogo de impresión del navegador.</p>
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
                      <p className="text-xs text-zinc-400 sm:col-span-2 lg:col-span-12">Salida para impresión. No se afirma que haya una impresora conectada ni que el papel haya salido.</p>
                    </>
                  )}
                  {destino.tipo === 'kds' && <p className="text-xs text-zinc-400 sm:col-span-2 lg:col-span-12">Las comandas nuevas de este destino aparecen en la estación KDS correspondiente.</p>}
                </div>
              ))}
            </div>
          </article>
        ))}
          <section className="mt-6 border-t border-surface-700 pt-5" aria-labelledby="categorias-operativas-titulo">
        <div className="mb-4">
          <h3 id="categorias-operativas-titulo" className="text-base font-bold text-zinc-100">Asignaciones heredadas por categoría</h3>
          <p className="mt-1 text-sm text-zinc-400">La asignación explícita del producto gana; luego se usa la categoría; si ninguna existe, las bebidas van a Barra y los demás productos a Cocina.</p>
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
                    <p className="mt-1 text-xs leading-relaxed text-zinc-400">La categoría conserva su regla histórica para productos sin estación propia.</p>
                    {productosExplicitos.length > 0 && (
                      <p className="mt-2 text-xs text-sky-300">Asignación explícita: {productosExplicitos.map((producto) => `${producto.nombre} (${ETIQUETA_ESTACION[producto.estacion!]})`).join(', ')}</p>
                    )}
                    {mixto && <p className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-xs leading-relaxed text-amber-200" role="status">Categoría mixta: sus productos terminan en más de una estación por sus asignaciones anteriores.</p>}
                  </div>
                  <label className="text-sm font-medium text-zinc-300">
                    Compatibilidad heredada de categoría
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
        </section>
      </details>

      <section className="card p-4 sm:p-6" aria-labelledby="resumen-operativo-titulo">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 id="resumen-operativo-titulo" className="text-lg font-extrabold text-zinc-100">Revisa el resultado</h2>
            <p className="mt-1 text-sm text-zinc-400">Confirma cómo recibirán Cocina y Barra las comandas nuevas.</p>
          </div>
          <button type="button" disabled={!editando || guardando} onClick={() => { setError(null); setConfirmarGuardar(true) }} className="btn-primary min-h-11 w-full sm:w-auto">Revisar y guardar configuración</button>
        </div>
        {resumen}
      </section>

      {confirmarGuardar && (
        <Modal titulo="Revisa la configuración de comandas" onCerrar={() => !guardando && setConfirmarGuardar(false)} ancho="max-w-3xl">
          <p className="mb-5 text-sm leading-relaxed text-zinc-300">Se guardarán estos destinos para <strong>{restaurante?.nombre}</strong>. La configuración cambiará solo las comandas nuevas; los pedidos y las rutas históricas se conservan.</p>
          {resumen}
          {error && <p className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300" role="alert">{error}</p>}
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" disabled={guardando} onClick={() => setConfirmarGuardar(false)} className="btn-secondary min-h-11">Seguir editando</button>
            <button type="button" disabled={guardando} onClick={() => void guardar()} className="btn-primary min-h-11">{guardando ? 'Guardando…' : 'Confirmar y guardar configuración'}</button>
          </div>
        </Modal>
      )}
    </section>
  )
}
