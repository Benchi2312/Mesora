import { useCallback, useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useCurrentContext } from '../../lib/useCurrentContext'

type Panel = NonNullable<Awaited<ReturnType<typeof cargarPanel>>>
type Area = 'cocina' | 'bar'
type Destino = { id: string; nombre: string; estacion: Area; grupo: string; activo: boolean }
type Seleccion = { agente_id: string; cola_windows: string; activa: boolean; max_intentos: number; reintento_base_seg: number }

async function cargarPanel(restauranteId: string) {
  const { data, error } = await supabase.rpc('admin_impresion_panel', { p_restaurante_id: restauranteId })
  if (error) throw error
  return data
}

function textoError(error: unknown, alternativa: string) {
  const mensaje = error instanceof Error
    ? error.message
    : typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string'
      ? error.message
      : ''
  if (/fetch|network|timeout|connection/i.test(mensaje)) {
    return 'No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.'
  }
  return mensaje || alternativa
}

function etiquetaEstadoTrabajo(estado: string) {
  const etiquetas: Record<string, string> = {
    pendiente: 'Pendiente',
    reclamado: 'En proceso',
    enviado: 'Enviado al equipo',
    fallido: 'No se pudo enviar',
    cancelado: 'Cancelado',
  }
  return etiquetas[estado] ?? 'Estado actualizado'
}

function claseEstado(conectado: boolean, revocado = false) {
  if (revocado) return 'border-surface-600 bg-surface-800 text-zinc-400'
  return conectado
    ? 'border-green-700/70 bg-green-950/40 text-green-300'
    : 'border-amber-700/70 bg-amber-950/30 text-amber-200'
}

export default function AgentesImpresionTab() {
  const { pathname } = useLocation()
  const { usuario, restaurante } = useCurrentContext()
  const restauranteId = restaurante?.id
  const autorizado = usuario?.rol === 'admin_restaurante' && usuario.restaurante_id === restauranteId
  const demo = pathname.startsWith('/demo')
  const [panel, setPanel] = useState<Panel | null>(null)
  const [destinos, setDestinos] = useState<Destino[]>([])
  const [selecciones, setSelecciones] = useState<Record<string, Seleccion>>({})
  const [codigo, setCodigo] = useState<{ codigo: string; expira_at: string } | null>(null)
  const [cargando, setCargando] = useState(true)
  const [operacion, setOperacion] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [mensaje, setMensaje] = useState('')

  const recargar = useCallback(async () => {
    if (!restauranteId || !autorizado || demo) return false
    setCargando(true)
    setError('')
    try {
      const [datos, estaciones] = await Promise.all([
        cargarPanel(restauranteId),
        supabase.from('estaciones_restaurante').select('id,codigo').eq('restaurante_id', restauranteId),
      ])
      if (estaciones.error) throw estaciones.error
      const mapa = new Map((estaciones.data ?? []).map((estacion) => [estacion.id, estacion.codigo]))
      const { data: filas, error: destinosError } = await supabase.from('destinos_estacion')
        .select('id,nombre,estacion_id,grupo,activo').eq('restaurante_id', restauranteId).eq('tipo', 'impresora')
      if (destinosError) throw destinosError
      const lista = (filas ?? []).flatMap((fila) => {
        const estacion = mapa.get(fila.estacion_id)
        return estacion === 'cocina' || estacion === 'bar'
          ? [{ id: fila.id, nombre: fila.nombre, estacion, grupo: fila.grupo, activo: fila.activo }]
          : []
      }) as Destino[]
      setDestinos(lista)
      setPanel(datos)
      setSelecciones(Object.fromEntries(lista.map((destino) => {
        const asignacion = datos.asignaciones.find((fila) => fila.destino_id === destino.id)
        return [destino.id, {
          agente_id: asignacion?.agente_id ?? '',
          cola_windows: asignacion?.cola_windows ?? '',
          activa: asignacion?.activa ?? false,
          max_intentos: asignacion?.max_intentos ?? 3,
          reintento_base_seg: asignacion?.reintento_base_seg ?? 15,
        }]
      })))
      return true
    } catch (fallo) {
      setError(textoError(fallo, 'No se pudo actualizar la información de impresoras. Inténtalo de nuevo.'))
      return false
    } finally {
      setCargando(false)
    }
  }, [restauranteId, autorizado, demo])

  useEffect(() => { void recargar() }, [recargar])

  async function ejecutar(id: string, accion: () => Promise<void>, correcto: string) {
    setOperacion(id)
    setError('')
    setMensaje('')
    try {
      await accion()
      const actualizado = await recargar()
      setMensaje(actualizado ? correcto : correcto + ' Pulsa “Actualizar estado” para revisar la información.')
    } catch (fallo) {
      setError(textoError(fallo, 'No se pudo completar la acción. Revisa la conexión e inténtalo de nuevo.'))
    } finally {
      setOperacion(null)
    }
  }

  function cambiarSeleccion(destinoId: string, cambios: Partial<Seleccion>) {
    setSelecciones((actuales) => ({
      ...actuales,
      [destinoId]: {
        ...(actuales[destinoId] ?? { agente_id: '', cola_windows: '', activa: false, max_intentos: 3, reintento_base_seg: 15 }),
        ...cambios,
      },
    }))
  }

  if (!autorizado) {
    return <section className="card p-5" role="alert">Solo el administrador del restaurante puede gestionar la impresión automática.</section>
  }

  if (demo) {
    return <section className="space-y-4" aria-label="Impresión automática de comandas">
      <header className="card p-5 sm:p-6">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-400">Función opcional</p>
        <h2 className="mt-2 text-xl font-bold text-white">Impresión automática de comandas (opcional)</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-300">Conecta una computadora Windows para enviar automáticamente las comandas de Cocina y Barra a sus impresoras. Si no activas esta función, puedes seguir usando las pantallas o imprimir manualmente.</p>
      </header>
      <p className="card border border-surface-700 p-4 text-sm leading-6 text-zinc-300">La conexión con computadoras está disponible en un restaurante real. En el demo puedes explorar las pantallas e impresión manual.</p>
    </section>
  }

  if (!restauranteId) return null

  const computadoras = panel?.agentes ?? []
  const vinculadas = computadoras.filter((agente) => agente.estado !== 'revocado')
  const conectadas = vinculadas.filter((agente) => agente.conectado)
  const destinosPrincipales = destinos.filter((destino) => destino.grupo === 'principal')
  const existeImpresoraConfigurada = destinosPrincipales.some((destino) =>
    panel?.asignaciones.some((asignacion) =>
      asignacion.destino_id === destino.id && Boolean(asignacion.agente_id) && Boolean(asignacion.cola_windows),
    ),
  )
  const pasoOcupado = (prefijo: string) => Boolean(operacion?.startsWith(prefijo))

  return <section className="space-y-5" aria-label="Impresión automática de comandas">
    <header className="card p-5 sm:p-6">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-400">Función opcional</p>
      <h2 className="mt-2 text-xl font-bold text-white sm:text-2xl">Impresión automática de comandas (opcional)</h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-300">Conecta una computadora Windows para enviar automáticamente las comandas de Cocina y Barra a sus impresoras. Si no activas esta función, puedes seguir usando las pantallas o imprimir manualmente.</p>
      <p className="mt-4 rounded-xl border border-surface-700 bg-surface-800/70 p-3 text-sm leading-6 text-zinc-300">Mesora confirma el envío al equipo, pero no puede confirmar que haya salido papel.</p>
    </header>

    {error && <p className="rounded-xl border border-red-700 bg-red-950/50 p-3 text-sm text-red-200" role="alert" aria-live="assertive">{error}</p>}
    {mensaje && <p className="rounded-xl border border-green-700 bg-green-950/40 p-3 text-sm text-green-200" role="status" aria-live="polite">{mensaje}</p>}

    {!cargando && !error && !existeImpresoraConfigurada && (
      <p className="rounded-xl border border-amber-700/70 bg-amber-950/30 p-4 text-sm leading-6 text-amber-100" role="status">Aún no hay impresoras configuradas. Puedes seguir usando las pantallas y la impresión manual.</p>
    )}

    <section className="card p-5 sm:p-6" aria-labelledby="paso-conectar">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-brand-500/50 bg-brand-500/10 text-sm font-bold text-brand-300" aria-hidden="true">1</span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-brand-400">Paso 1</p>
            <h3 id="paso-conectar" className="mt-1 text-lg font-bold text-white">Conectar una computadora</h3>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-zinc-400">El código se usa una sola vez y vence en 10 minutos.</p>
          </div>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <button type="button" className="btn btn-outline min-h-11 w-full rounded-xl px-4 py-2.5 sm:w-auto" onClick={() => void recargar()} disabled={cargando || Boolean(operacion)} aria-busy={cargando}>
            {cargando ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" /> Actualizando estado…</> : 'Actualizar estado'}
          </button>
          <button type="button" className="btn btn-primary min-h-11 w-full rounded-xl px-4 py-2.5 shadow-md shadow-brand-500/15 sm:w-auto" disabled={cargando || Boolean(operacion)} aria-busy={pasoOcupado('codigo')} onClick={() => void ejecutar('codigo', async () => {
            const { data, error: fallo } = await supabase.rpc('admin_impresion_crear_codigo', { p_restaurante_id: restauranteId })
            if (fallo) throw fallo
            setCodigo(data)
          }, 'Código generado. Escríbelo en la computadora que vas a conectar.')}>
            {pasoOcupado('codigo') ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" /> Generando código…</> : 'Generar código de conexión'}
          </button>
        </div>
      </div>

      {codigo && <div className="mt-5 rounded-xl border border-brand-500/40 bg-brand-500/10 p-4" role="status">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-300">Código de un solo uso · vence {new Date(codigo.expira_at).toLocaleTimeString('es-PE')}</p>
        <code className="mt-2 block break-all text-xl font-bold tracking-widest text-white">{codigo.codigo}</code>
        <p className="mt-2 text-sm leading-6 text-zinc-300">Escríbelo en la computadora que deseas conectar. No lo compartas fuera del restaurante; al cerrar esta pestaña no volverá a mostrarse.</p>
      </div>}

      <div className="mt-5 rounded-xl border border-surface-700 bg-surface-800/40 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="font-semibold text-white">Computadoras vinculadas</h4>
          <span className="chip border-surface-600 bg-surface-800 text-zinc-300" aria-live="polite">
            {vinculadas.length} {vinculadas.length === 1 ? 'computadora vinculada' : 'computadoras vinculadas'}
            {vinculadas.length > 0 ? ' · ' + conectadas.length + ' ' + (conectadas.length === 1 ? 'conectada' : 'conectadas') : ''}
          </span>
        </div>
        {cargando && <div className="mt-3 h-12 animate-pulse rounded-lg bg-surface-800" aria-label="Cargando computadoras" />}
        {!cargando && !vinculadas.length && <p className="mt-3 text-sm leading-6 text-zinc-400">Aún no hay una computadora vinculada. Puedes generar un código para comenzar.</p>}
        {!cargando && vinculadas.length > 0 && <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {computadoras.map((agente) => {
            const revocado = agente.estado === 'revocado'
            const idRevocar = 'revocar:' + agente.id
            return <article key={agente.id} className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-xl border border-surface-700 bg-surface-900 p-3">
              <div className="min-w-0">
                <h5 className="break-words font-semibold text-white">{agente.nombre}</h5>
                <span className={'mt-1 inline-flex min-h-7 items-center rounded-full border px-2.5 text-xs font-medium ' + claseEstado(agente.conectado, revocado)}>
                  {revocado ? 'Vinculación revocada' : agente.conectado ? 'Conectada' : 'Sin conexión'}
                </span>
              </div>
              {!revocado && agente.estado === 'activo' && <button type="button" disabled={Boolean(operacion)} className="btn btn-outline min-h-11 rounded-xl border-red-800/70 px-3 py-2.5 text-red-200 hover:border-red-600 hover:text-white" onClick={() => {
                if (!window.confirm('¿Desconectar ' + agente.nombre + '? Dejará de recibir comandas automáticamente.')) return
                void ejecutar(idRevocar, async () => {
                  const { error: fallo } = await supabase.rpc('admin_impresion_revocar', { p_restaurante_id: restauranteId, p_agente_id: agente.id })
                  if (fallo) throw fallo
                }, 'Computadora desconectada.')
              }}>{pasoOcupado(idRevocar) ? 'Desconectando…' : 'Desconectar'}</button>}
            </article>
          })}
        </div>}
      </div>
    </section>

    <section className="space-y-4" aria-labelledby="paso-impresoras">
      <div className="flex gap-3 px-1">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-brand-500/50 bg-brand-500/10 text-sm font-bold text-brand-300" aria-hidden="true">2</span>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-400">Paso 2</p>
          <h3 id="paso-impresoras" className="mt-1 text-lg font-bold text-white">Elegir las impresoras</h3>
          <p className="mt-1 text-sm leading-6 text-zinc-400">Selecciona en qué computadora está instalada cada impresora.</p>
        </div>
      </div>

      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        {(['cocina', 'bar'] as const).map((area) => {
          const nombreArea = area === 'bar' ? 'Barra' : 'Cocina'
          const destino = destinosPrincipales.find((item) => item.estacion === area)
          const seleccion = destino
            ? selecciones[destino.id] ?? { agente_id: '', cola_windows: '', activa: false, max_intentos: 3, reintento_base_seg: 15 }
            : null
          const agenteSeleccionado = seleccion ? panel?.agentes.find((item) => item.id === seleccion.agente_id) : undefined
          const agentesActivos = panel?.agentes.filter((item) => item.estado === 'activo') ?? []
          return <article key={area} className="card min-w-0 p-4 sm:p-5" aria-label={'Impresora de ' + nombreArea}>
            <h4 className="text-base font-bold text-white">Impresora de {nombreArea}</h4>
            <p className="mt-1 text-sm leading-6 text-zinc-400">Selecciona la computadora y la impresora que recibirán sus comandas.</p>
            {!destino && <p className="mt-4 rounded-lg border border-surface-700 bg-surface-800/70 p-3 text-sm leading-6 text-zinc-300">Todavía no hay una impresora disponible para {nombreArea}. Puedes seguir usando la pantalla de pedidos y la impresión manual.</p>}
            {destino && seleccion && <>
              <label className="label mt-4" htmlFor={'computadora-' + area}>Computadora</label>
              <select id={'computadora-' + area} className="input min-h-11" value={seleccion.agente_id} disabled={cargando || Boolean(operacion)} onChange={(evento) => cambiarSeleccion(destino.id, { agente_id: evento.target.value, cola_windows: '' })}>
                <option value="">Seleccionar computadora</option>
                {agentesActivos.map((agente) => <option key={agente.id} value={agente.id}>{agente.nombre}{agente.conectado ? ' · Conectada' : ' · Sin conexión'}</option>)}
                {seleccion.agente_id && !agentesActivos.some((agente) => agente.id === seleccion.agente_id) && <option value={seleccion.agente_id}>{agenteSeleccionado?.nombre ?? 'Computadora guardada'} · No disponible</option>}
              </select>
              <label className="label mt-3" htmlFor={'impresora-' + area}>Impresora</label>
              <select id={'impresora-' + area} className="input min-h-11" value={seleccion.cola_windows} disabled={!seleccion.agente_id || cargando || Boolean(operacion)} onChange={(evento) => cambiarSeleccion(destino.id, { cola_windows: evento.target.value })}>
                <option value="">Seleccionar impresora</option>
                {agenteSeleccionado?.impresoras_detectadas.map((nombre) => <option key={nombre} value={nombre}>{nombre}</option>)}
                {seleccion.cola_windows && !agenteSeleccionado?.impresoras_detectadas.includes(seleccion.cola_windows) && <option value={seleccion.cola_windows}>{seleccion.cola_windows} · Guardada</option>}
              </select>
              {agenteSeleccionado?.conectado && agenteSeleccionado.impresoras_detectadas.length === 0 && <p className="mt-2 text-sm text-amber-200">La computadora está conectada, pero aún no muestra impresoras disponibles.</p>}
            </>}
          </article>
        })}
      </div>
      <p className="rounded-xl border border-amber-700/60 bg-amber-950/20 p-4 text-sm leading-6 text-amber-100">Una impresora de oficina puede usarse para probar la conexión, pero las impresoras térmicas utilizan un formato diferente de 58 u 80 mm.</p>
    </section>

    <section className="card p-5 sm:p-6" aria-labelledby="paso-activar">
      <div className="flex gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-brand-500/50 bg-brand-500/10 text-sm font-bold text-brand-300" aria-hidden="true">3</span>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-400">Paso 3</p>
          <h3 id="paso-activar" className="mt-1 text-lg font-bold text-white">Activar impresión automática</h3>
          <p className="mt-1 text-sm leading-6 text-zinc-400">Solo las comandas nuevas se enviarán automáticamente. Puedes apagar esta opción cuando quieras.</p>
        </div>
      </div>

      <div className="mt-5 grid min-w-0 gap-4 lg:grid-cols-2">
        {(['cocina', 'bar'] as const).map((area) => {
          const nombreArea = area === 'bar' ? 'Barra' : 'Cocina'
          const destino = destinosPrincipales.find((item) => item.estacion === area)
          const seleccion = destino
            ? selecciones[destino.id] ?? { agente_id: '', cola_windows: '', activa: false, max_intentos: 3, reintento_base_seg: 15 }
            : null
          const lista = Boolean(destino && seleccion?.agente_id && seleccion.cola_windows)
          const asignacionGuardada = Boolean(destino && panel?.asignaciones.some((item) => item.destino_id === destino.id && item.activa))
          const idGuardar = destino ? 'guardar:' + destino.id : ''
          const idPrueba = destino ? 'prueba:' + destino.id : ''
          return <article key={area} className="min-w-0 rounded-xl border border-surface-700 bg-surface-800/35 p-4 sm:p-5" aria-label={'Activación para ' + nombreArea}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h4 className="font-bold text-white">{nombreArea}</h4>
                <p className="mt-1 break-words text-sm text-zinc-400">{seleccion?.cola_windows ? 'Impresora: ' + seleccion.cola_windows : 'Primero elige una computadora y una impresora.'}</p>
              </div>
              <span className={'chip ' + (seleccion?.activa ? 'border-green-700/70 bg-green-950/40 text-green-300' : 'border-surface-600 bg-surface-800 text-zinc-400')} aria-live="polite">{seleccion?.activa ? 'Activo' : 'Desactivado'}</span>
            </div>
            <label className="mt-4 flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-xl border border-surface-700 bg-surface-900 px-3 py-2.5 focus-within:ring-2 focus-within:ring-brand-500/60">
              <span className="text-sm font-semibold text-zinc-100">Enviar comandas automáticamente</span>
              <span className="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full bg-surface-600 transition-colors has-[:checked]:bg-brand-500 has-[:disabled]:opacity-50">
                <input
                  type="checkbox"
                  role="switch"
                  aria-label={'Enviar comandas automáticamente a ' + nombreArea}
                  className="peer sr-only"
                  checked={Boolean(seleccion?.activa)}
                  disabled={Boolean(operacion) || cargando || (!lista && !seleccion?.activa)}
                  onChange={(evento) => { if (destino) cambiarSeleccion(destino.id, { activa: evento.target.checked }) }}
                />
                <span aria-hidden="true" className="pointer-events-none absolute left-1 h-4 w-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
              </span>
            </label>
            {destino && seleccion && <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <button type="button" className="btn btn-primary min-h-11 flex-1 rounded-xl px-4 py-2.5 shadow-md shadow-brand-500/10" disabled={Boolean(operacion) || cargando || !seleccion.agente_id || !seleccion.cola_windows} aria-busy={pasoOcupado(idGuardar)} onClick={() => void ejecutar(idGuardar, async () => {
                const { error: fallo } = await supabase.rpc('admin_impresion_asignar', {
                  p_restaurante_id: restauranteId,
                  p_destino_id: destino.id,
                  p_agente_id: seleccion.agente_id,
                  p_cola_windows: seleccion.cola_windows,
                  p_activa: seleccion.activa,
                  p_max_intentos: seleccion.max_intentos,
                  p_reintento_base_seg: seleccion.reintento_base_seg,
                })
                if (fallo) throw fallo
              }, 'Configuración de ' + nombreArea + ' guardada. Solo se aplicará a comandas nuevas.')}>
                {pasoOcupado(idGuardar) ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" /> Guardando…</> : 'Guardar configuración'}
              </button>
              <button type="button" className="btn btn-outline min-h-11 flex-1 rounded-xl px-4 py-2.5 sm:flex-none" disabled={Boolean(operacion) || cargando || !asignacionGuardada} onClick={() => {
                if (!window.confirm('Se imprimirá una hoja física de prueba en la impresora de ' + nombreArea + '. ¿Deseas continuar?')) return
                void ejecutar(idPrueba, async () => {
                  const { error: fallo } = await supabase.rpc('admin_impresion_prueba', { p_restaurante_id: restauranteId, p_destino_id: destino.id })
                  if (fallo) throw fallo
                }, 'Prueba solicitada para ' + nombreArea + '. Revisa físicamente la impresora para confirmar que salió el papel.')
              }}>{pasoOcupado(idPrueba) ? 'Enviando prueba…' : 'Probar impresión'}</button>
            </div>}
            {!destino && <p className="mt-4 text-sm leading-6 text-zinc-400">No hay una impresora de comandas configurada para esta área.</p>}
          </article>
        })}
      </div>
    </section>

    <section className="card p-5 sm:p-6" aria-labelledby="actividad-impresion">
      <h3 id="actividad-impresion" className="text-lg font-bold text-white">Actividad reciente</h3>
      <p className="mt-1 text-sm leading-6 text-zinc-400">Consulta el estado de las últimas comandas y pruebas enviadas.</p>
      {cargando && <div className="mt-4 h-12 animate-pulse rounded-lg bg-surface-800" aria-label="Cargando actividad de impresoras" />}
      {!cargando && !panel?.trabajos.length && <p className="mt-4 text-sm text-zinc-400">Todavía no hay actividad de impresoras.</p>}
      {!cargando && Boolean(panel?.trabajos.length) && <div className="mt-4 space-y-2">
        {panel?.trabajos.map((trabajo) => <article key={trabajo.id} className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-xl border border-surface-700 bg-surface-800/35 p-3">
          <div className="min-w-0">
            <p className="break-words text-sm font-medium text-white">{trabajo.estacion === 'bar' ? 'Barra' : 'Cocina'} · Impresora: {trabajo.cola_windows}</p>
            <p className="mt-1 text-xs text-zinc-400">{trabajo.tipo === 'prueba' ? 'Hoja de prueba' : 'Comanda'} · {new Date(trabajo.creado_at).toLocaleString('es-PE')}</p>
          </div>
          <span className={'chip ' + (trabajo.estado === 'enviado' ? 'border-green-700/70 bg-green-950/40 text-green-300' : trabajo.estado === 'fallido' ? 'border-red-700/70 bg-red-950/40 text-red-200' : 'border-surface-600 bg-surface-800 text-zinc-300')}>{etiquetaEstadoTrabajo(trabajo.estado)}</span>
          {trabajo.error_final && <details className="w-full text-sm text-zinc-400">
            <summary className="min-h-11 cursor-pointer py-3 font-medium text-zinc-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60">Ver detalle del problema</summary>
            <p className="break-words pb-2 text-xs leading-5">{trabajo.error_final}</p>
          </details>}
        </article>)}
      </div>}
    </section>
  </section>
}
