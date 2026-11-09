import { useCallback, useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useCurrentContext } from '../../lib/useCurrentContext'

type Panel = NonNullable<Awaited<ReturnType<typeof cargarPanel>>>
type Destino = { id: string; nombre: string; estacion: 'cocina' | 'bar'; grupo: string; activo: boolean }
type Seleccion = { agente_id: string; cola_windows: string; activa: boolean; max_intentos: number; reintento_base_seg: number }

async function cargarPanel(restauranteId: string) {
  const { data, error } = await supabase.rpc('admin_impresion_panel', { p_restaurante_id: restauranteId })
  if (error) throw error
  return data
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
  const [cargando, setCargando] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')
  const [mensaje, setMensaje] = useState('')

  const recargar = useCallback(async () => {
    if (!restauranteId || !autorizado || demo) return
    setCargando(true)
    setError('')
    try {
      const [datos, estaciones] = await Promise.all([
        cargarPanel(restauranteId),
        supabase.from('estaciones_restaurante').select('id,codigo').eq('restaurante_id', restauranteId),
      ])
      if (estaciones.error) throw estaciones.error
      const mapa = new Map((estaciones.data ?? []).map((e) => [e.id, e.codigo]))
      const { data: filas, error: destinosError } = await supabase.from('destinos_estacion')
        .select('id,nombre,estacion_id,grupo,activo').eq('restaurante_id', restauranteId).eq('tipo', 'impresora')
      if (destinosError) throw destinosError
      const lista = (filas ?? []).flatMap((f) => {
        const estacion = mapa.get(f.estacion_id)
        return estacion === 'cocina' || estacion === 'bar'
          ? [{ id: f.id, nombre: f.nombre, estacion, grupo: f.grupo, activo: f.activo }]
          : []
      }) as Destino[]
      setDestinos(lista)
      setPanel(datos)
      setSelecciones(Object.fromEntries(lista.map((d) => {
        const a = datos.asignaciones.find((x) => x.destino_id === d.id)
        return [d.id, { agente_id: a?.agente_id ?? '', cola_windows: a?.cola_windows ?? '', activa: a?.activa ?? false,
          max_intentos: a?.max_intentos ?? 3, reintento_base_seg: a?.reintento_base_seg ?? 15 }]
      })))
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo cargar el panel de impresión.') }
    finally { setCargando(false) }
  }, [restauranteId, autorizado, demo])

  useEffect(() => { void recargar() }, [recargar])

  async function ejecutar(accion: () => Promise<void>, correcto: string) {
    setOcupado(true); setError(''); setMensaje('')
    try { await accion(); setMensaje(correcto); await recargar() }
    catch (e) { setError(e instanceof Error ? e.message : 'No se completó la operación. Inténtalo de nuevo.') }
    finally { setOcupado(false) }
  }

  if (!autorizado) return <section className="card p-5" role="alert">Solo el administrador del restaurante puede gestionar agentes de impresión.</section>
  if (demo) return <section className="card p-5"><h2 className="text-xl font-bold">Agentes de impresión</h2><p className="mt-2 text-zinc-400">La vinculación de computadoras está disponible en un restaurante real. El demo conserva la impresión manual.</p></section>
  if (!restauranteId) return null

  return <section className="space-y-5" aria-label="Agentes de impresión">
    <header className="card p-5 sm:p-6">
      <h2 className="text-xl font-bold text-white">Agentes de impresión</h2>
      <p className="mt-2 text-sm text-zinc-400">Conecta una computadora Windows para enviar automáticamente comandas de Cocina y Barra a sus tiqueteras. La impresión manual sigue disponible.</p>
      <p className="mt-2 text-sm text-amber-300">“Enviado a cola” significa que Windows aceptó el trabajo; no confirma que salió papel.</p>
      <p className="mt-2 text-sm text-zinc-400">La impresora de respaldo queda desactivada hasta que exista una política segura de tiempo de espera y reconocimiento KDS.</p>
    </header>
    {error && <p className="rounded-xl border border-red-700 bg-red-950/50 p-3 text-sm text-red-300" role="alert">{error}</p>}
    {mensaje && <p className="rounded-xl border border-green-700 bg-green-950/50 p-3 text-sm text-green-300" role="status">{mensaje}</p>}
    <section className="card p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h3 className="font-bold text-white">Vincular computadora</h3><p className="text-sm text-zinc-400">El código vence en 10 minutos y se usa una sola vez.</p></div>
        <button type="button" disabled={ocupado || cargando} onClick={() => void ejecutar(async () => {
          const { data, error: fallo } = await supabase.rpc('admin_impresion_crear_codigo', { p_restaurante_id: restauranteId })
          if (fallo) throw fallo
          setCodigo(data)
        }, 'Código temporal creado. Escríbelo en la computadora que vas a vincular.')} className="btn-primary min-h-11 px-4">Generar código</button>
      </div>
      {codigo && <div className="mt-4 rounded-xl border border-amber-700 bg-amber-950/30 p-4">
        <p className="text-xs text-zinc-400">Código de un solo uso · vence {new Date(codigo.expira_at).toLocaleTimeString('es-PE')}</p>
        <code className="mt-2 block break-all text-lg font-bold tracking-widest text-amber-300">{codigo.codigo}</code>
        <p className="mt-2 text-xs text-zinc-400">No compartas el código fuera del equipo del restaurante. Al cerrar esta pestaña no volverá a mostrarse.</p>
      </div>}
    </section>
    <section className="card p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-bold text-white">Computadoras vinculadas</h3><button type="button" className="btn-secondary min-h-11 px-4" onClick={() => void recargar()} disabled={cargando || ocupado}>Actualizar estado</button></div>
      {cargando && <p className="mt-3 text-sm text-zinc-400">Cargando agentes…</p>}
      {!cargando && panel?.agentes.length === 0 && <p className="mt-3 text-sm text-zinc-400">No hay agentes vinculados todavía.</p>}
      <div className="mt-4 grid gap-3 lg:grid-cols-2">{panel?.agentes.map((a) => <article key={a.id} className="rounded-xl border border-surface-700 p-4">
        <div className="flex flex-wrap justify-between gap-3"><div><h4 className="font-semibold text-white">{a.nombre}</h4><p className="text-sm text-zinc-400">{a.estado === 'revocado' ? 'Revocado' : a.conectado ? 'Conectado' : 'Desconectado'}</p></div>
        {a.estado === 'activo' && <button type="button" disabled={ocupado} className="min-h-11 rounded-lg border border-red-700 px-3 text-sm text-red-300" onClick={() => {
          if (!window.confirm(`Revocar ${a.nombre}? Dejará de reclamar y confirmar trabajos; las comandas conservarán salida manual.`)) return
          void ejecutar(async () => { const { error: fallo } = await supabase.rpc('admin_impresion_revocar', { p_restaurante_id: restauranteId, p_agente_id: a.id }); if (fallo) throw fallo }, 'Agente revocado.')
        }}>Revocar</button>}</div>
        <p className="mt-2 text-xs text-zinc-500">Último heartbeat: {a.ultimo_heartbeat_at ? new Date(a.ultimo_heartbeat_at).toLocaleString('es-PE') : 'todavía no recibido'}</p>
        <p className="mt-2 break-words text-xs text-zinc-400">Impresoras detectadas: {a.impresoras_detectadas.length ? a.impresoras_detectadas.join(', ') : 'ninguna'}</p>
      </article>)}</div>
    </section>
    <section className="card p-5 sm:p-6"><h3 className="font-bold text-white">Tiqueteras de Cocina y Barra</h3>
      <p className="mt-1 text-sm text-zinc-400">Selecciona el nombre exacto de la cola instalada en Windows. Los cambios solo afectan comandas nuevas.</p>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">{destinos.map((d) => {
        const sel = selecciones[d.id] ?? { agente_id: '', cola_windows: '', activa: false, max_intentos: 3, reintento_base_seg: 15 }
        const agente = panel?.agentes.find((a) => a.id === sel.agente_id)
        return <article key={d.id} className="min-w-0 rounded-xl border border-surface-700 p-4">
          <h4 className="font-semibold text-white">{d.estacion === 'bar' ? 'Barra' : 'Cocina'} · {d.nombre}</h4>
          <p className="text-xs text-zinc-400">{d.grupo === 'respaldo' ? 'Respaldo automático no disponible' : d.activo ? 'Destino principal activo' : 'Destino inactivo'}</p>
          <label className="mt-3 block text-sm text-zinc-300">Computadora<select className="mt-1 w-full rounded-lg bg-surface-800 p-3" value={sel.agente_id} onChange={(e) => setSelecciones((s) => ({ ...s, [d.id]: { ...sel, agente_id: e.target.value, cola_windows: '' } }))}><option value="">Seleccionar…</option>{panel?.agentes.filter((a) => a.estado === 'activo').map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}</select></label>
          <label className="mt-3 block text-sm text-zinc-300">Cola de Windows<select className="mt-1 w-full rounded-lg bg-surface-800 p-3" value={sel.cola_windows} onChange={(e) => setSelecciones((s) => ({ ...s, [d.id]: { ...sel, cola_windows: e.target.value } }))}><option value="">Seleccionar…</option>{agente?.impresoras_detectadas.map((nombre) => <option key={nombre} value={nombre}>{nombre}</option>)}{sel.cola_windows && !agente?.impresoras_detectadas.includes(sel.cola_windows) && <option value={sel.cola_windows}>{sel.cola_windows} (no detectada)</option>}</select></label>
          <label className="mt-3 flex min-h-11 items-center gap-2 text-sm text-zinc-300"><input type="checkbox" checked={sel.activa} disabled={d.grupo === 'respaldo'} onChange={(e) => setSelecciones((s) => ({ ...s, [d.id]: { ...sel, activa: e.target.checked } }))} /> Activar envío automático</label>
          <div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-sm text-zinc-300">Máximo de intentos (1–10)<input type="number" min="1" max="10" value={sel.max_intentos} onChange={(e) => setSelecciones((s) => ({ ...s, [d.id]: { ...sel, max_intentos: Number(e.target.value) } }))} className="mt-1 w-full rounded-lg bg-surface-800 p-3" /></label>
          <label className="text-sm text-zinc-300">Espera inicial, segundos (5–300)<input type="number" min="5" max="300" value={sel.reintento_base_seg} onChange={(e) => setSelecciones((s) => ({ ...s, [d.id]: { ...sel, reintento_base_seg: Number(e.target.value) } }))} className="mt-1 w-full rounded-lg bg-surface-800 p-3" /></label></div>
          <div className="mt-3 flex flex-wrap gap-2"><button type="button" className="btn-primary min-h-11 px-4" disabled={ocupado || !sel.agente_id || !sel.cola_windows || d.grupo === 'respaldo' || sel.max_intentos < 1 || sel.max_intentos > 10 || sel.reintento_base_seg < 5 || sel.reintento_base_seg > 300} onClick={() => void ejecutar(async () => { const { error: fallo } = await supabase.rpc('admin_impresion_asignar', { p_restaurante_id: restauranteId, p_destino_id: d.id, p_agente_id: sel.agente_id, p_cola_windows: sel.cola_windows, p_activa: sel.activa, p_max_intentos: sel.max_intentos, p_reintento_base_seg: sel.reintento_base_seg }); if (fallo) throw fallo }, 'Asignación guardada. Se aplicará a comandas nuevas.')}>Guardar</button>
          <button type="button" className="btn-secondary min-h-11 px-4" disabled={ocupado || !panel?.asignaciones.find((a) => a.destino_id === d.id && a.activa)} onClick={() => { if (!window.confirm(`Enviar una prueba a la impresora de ${d.estacion === 'bar' ? 'Barra' : 'Cocina'}?`)) return; void ejecutar(async () => { const { error: fallo } = await supabase.rpc('admin_impresion_prueba', { p_restaurante_id: restauranteId, p_destino_id: d.id }); if (fallo) throw fallo }, 'Prueba solicitada. Comprueba el papel físicamente en la impresora.') }}>Prueba de impresión</button></div>
        </article>
      })}</div>
      {!destinos.length && <p className="mt-3 text-sm text-zinc-400">Agrega primero un destino de impresora principal en Configuración operativa.</p>}
    </section>
    <section className="card p-5 sm:p-6"><h3 className="font-bold text-white">Últimos trabajos</h3><div className="mt-3 space-y-2">{panel?.trabajos.map((t) => <div key={t.id} className="flex flex-wrap justify-between gap-2 rounded-lg border border-surface-700 p-3 text-sm"><span>{t.estacion === 'bar' ? 'Barra' : 'Cocina'} · {t.cola_windows} · {t.tipo === 'prueba' ? 'Prueba' : 'Comanda'}</span><span className="text-zinc-400">{t.estado} · intento {t.intentos}/{t.max_intentos}</span>{t.error_final && <p className="w-full text-red-300">{t.error_final}</p>}</div>)}{!panel?.trabajos.length && <p className="text-sm text-zinc-400">Aún no hay trabajos.</p>}</div></section>
  </section>
}
