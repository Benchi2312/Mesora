import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import PageHeader from '../../components/PageHeader'
import { getApi, type EstacionEnrutamiento, type ItemResumen, type MeseroResumen, type PedidoConItems, type RutaComandaEstacion } from '../../lib/api'
import { useCurrentContext } from '../../lib/useCurrentContext'
import { fmtPEN } from '../../lib/format'
import { useElapsed } from '../../lib/useElapsed'
import { enDemo } from '../../lib/api'
import type { EstadoPedido, Mesa } from '../../types/database'
import { Spinner } from '../../components/LoadingScreen'
import EstadoVacio from '../../components/EstadoVacio'
import ComandaImprimible from '../../components/ComandaImprimible'
import { ESTACIONES_COMANDA, NOMBRES_ESTACION_COMANDA, estacionDeProducto, itemsDeEstacion, type EstacionComanda } from '../../domain/restaurant/impresionComandas'
import { detectarComandasNuevas, ESTACIONES_ALERTA_COMANDAS, programarAlertaComanda, type EstacionAlertaComanda } from '../../domain/restaurant/alertaComandas'

/* Íconos SVG de línea (consistentes con el resto de la app) */
function IconoOlla({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 9h14v6a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3z" />
      <path d="M8 3.5V7M12 3.5V7M16 3.5V7" />
    </svg>
  )
}
function IconoVaso({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 3h14l-4.5 9.5a2.2 2.2 0 0 1-2 1.2h-1a2.2 2.2 0 0 1-2-1.2Z" />
      <path d="M12 13.7v4.8M8.5 21h7" />
    </svg>
  )
}

function IconoReloj({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  )
}

function IconoNota({ className = 'h-3.5 w-3.5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 4h12a1 1 0 0 1 1 1v11l-5 4H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z" />
      <path d="M9 8.5h6M9 12h6M9 15.5h3" />
    </svg>
  )
}

function IconoImpresora({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 9V4h10v5" />
      <path d="M5 9h14a1 1 0 0 1 1 1v6h-3v4H7v-4H4v-6a1 1 0 0 1 1-1Z" />
      <path d="M7 16h10" />
    </svg>
  )
}

const COLUMNAS: { estado: EstadoPedido; titulo: string; ayuda: string; boton: string; color: string }[] = [
  {
    estado: 'pendiente',
    titulo: 'Pendientes',
    ayuda: 'Aún no empieza',
    boton: 'Empezar preparación',
    color: 'bg-warn-500',
  },
  {
    estado: 'en_preparacion',
    titulo: 'En preparación',
    ayuda: 'Se está preparando',
    boton: 'Marcar listo',
    color: 'bg-brand-500',
  },
  {
    estado: 'listo',
    titulo: 'Listos',
    ayuda: 'Preparación terminada',
    boton: 'Entregar',
    color: 'bg-ok-500',
  },
]

function etiquetaEstacion(nombre: string, codigo: EstacionComanda): string {
  if (codigo === 'bar' && nombre === 'Bar') return 'Barra'
  return nombre
}

function nombreVisibleEstacion(codigo: EstacionComanda): string {
  return codigo === 'bar' ? 'Barra' : NOMBRES_ESTACION_COMANDA[codigo]
}

function estacionesParaMostrar(
  configuradas: readonly EstacionEnrutamiento[],
  pedidos: readonly PedidoConItems[],
): EstacionEnrutamiento[] {
  const porCodigo = new Map<EstacionComanda, EstacionEnrutamiento>()
  for (const estacion of configuradas) {
    const destinos = estacion.destinos.filter((destino) => destino.activo && destino.grupo === 'principal')
    if (estacion.activo && destinos.length > 0) porCodigo.set(estacion.codigo, estacion)
  }
  for (const pedido of pedidos) {
    for (const codigo of ESTACIONES_COMANDA) {
      const ruta = pedido.rutasPorEstacion?.[codigo]
      if (!ruta || ruta.estado === 'entregado' || ruta.estado === 'anulado') continue
      if (!porCodigo.has(codigo)) {
        porCodigo.set(codigo, {
          id: null,
          codigo,
          nombre: ruta.nombre ?? NOMBRES_ESTACION_COMANDA[codigo],
          activo: true,
          orden: (ESTACIONES_COMANDA.indexOf(codigo) + 1) * 10,
          destinos: ruta.destinos.map((tipo) => ({
            id: null,
            tipo,
            grupo: 'principal',
            nombre: `${tipo === 'kds' ? 'KDS' : 'Impresora'} ${ruta.nombre ?? NOMBRES_ESTACION_COMANDA[codigo]}`,
            activo: true,
          })),
        })
      }
    }
  }
  return [...porCodigo.values()].sort((a, b) => a.orden - b.orden || a.codigo.localeCompare(b.codigo))
}

export default function Cocina() {
  const { restaurante } = useCurrentContext()
  const [pedidos, setPedidos] = useState<PedidoConItems[]>([])
  const [estacionesOperativas, setEstacionesOperativas] = useState<EstacionEnrutamiento[]>([])
  const [mesas, setMesas] = useState<Mesa[]>([])
  const [meseros, setMeseros] = useState<MeseroResumen[]>([])
  const [estacion, setEstacion] = useState<EstacionComanda>('cocina')
  const [sonidoActivo, setSonidoActivo] = useState(false)
  const [estadoSonido, setEstadoSonido] = useState<'desactivado' | 'activo' | 'bloqueado' | 'no-disponible'>('desactivado')
  const [avisoNuevo, setAvisoNuevo] = useState('')
  const audioContext = useRef<AudioContext | null>(null)
  const pedidosConocidos = useRef<Set<string> | null>(null)
  const cargaEnCurso = useRef<Promise<void> | null>(null)
  const sonidoActivoRef = useRef(sonidoActivo)
  sonidoActivoRef.current = sonidoActivo
  const [nuevasPorEstacion, setNuevasPorEstacion] = useState<Record<EstacionAlertaComanda, ReadonlySet<string>>>(() => ({
    cocina: new Set(), bar: new Set(), otros: new Set(),
  }))
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  /** Ids de comandas cuyo avance está en vuelo (evita el doble toque). */
  const [avanzando, setAvanzando] = useState<ReadonlySet<string>>(() => new Set())
  /** Comanda que se está previsualizando para imprimir en la impresora de la estación. */
  const [ticket, setTicket] = useState<{ p: PedidoConItems; mesaNombre: string; meseroNombre: string; estacion: EstacionComanda; salida?: RutaComandaEstacion['impresoras'][number]; impresoras: { nombre: string; papel_mm: 58 | 80 | null; copias: number }[] } | null>(null)

  const cargar = useCallback(async () => {
    const rid = restaurante?.id
    if (!rid) return
    if (cargaEnCurso.current) {
      await cargaEnCurso.current
      return
    }
    let completarCarga!: () => void
    const solicitudCarga = new Promise<void>((resolve) => { completarCarga = resolve })
    cargaEnCurso.current = solicitudCarga
    try {
      const api = getApi()
      const rutasRes = await api.getEstacionesEnrutamiento(rid)
      if (rutasRes.error) {
        setError(rutasRes.error)
        return
      }
      const [pRes, mRes, uRes] = await Promise.all([
        api.getPedidosActivos(rid),
        api.getMesas(rid),
        api.getMeseros(rid),
      ])
      if (pRes.error || mRes.error || uRes.error) {
        setError(pRes.error ?? mRes.error ?? uRes.error ?? 'Error al cargar comandas')
        return
      }
      const pedidosNuevos = pRes.data ?? []
      const idsActivos = new Set<string>()
      const pendientes = { cocina: new Set<string>(), bar: new Set<string>(), otros: new Set<string>() }
      for (const pedido of pedidosNuevos) {
        if (pedido.cuentaAnulada) continue
        for (const destino of ESTACIONES_ALERTA_COMANDAS) {
          const ruta = pedido.rutasPorEstacion?.[destino]
          if (!ruta || ruta.estado === 'entregado' || ruta.estado === 'anulado') continue
          if (!pedido.items.some((item) => estacionDeProducto(item) === destino)) continue
          idsActivos.add(pedido.id)
          if (ruta.estado === 'pendiente') pendientes[destino].add(pedido.id)
        }
      }
      const deteccion = detectarComandasNuevas(pedidosConocidos.current, idsActivos, pendientes)
      pedidosConocidos.current = new Set(deteccion.idsConocidos)
      setNuevasPorEstacion((anteriores) => {
        const siguientes: Record<EstacionAlertaComanda, ReadonlySet<string>> = {
          cocina: new Set([...anteriores.cocina].filter((id) => pendientes.cocina.has(id))),
          bar: new Set([...anteriores.bar].filter((id) => pendientes.bar.has(id))),
          otros: new Set([...anteriores.otros].filter((id) => pendientes.otros.has(id))),
        }
        for (const destino of ESTACIONES_ALERTA_COMANDAS) {
          const vigentes = new Set(siguientes[destino])
          for (const id of deteccion.nuevasPorEstacion[destino]) vigentes.add(id)
          siguientes[destino] = vigentes
        }
        return siguientes
      })
      if (deteccion.debeAlertar) {
        const cantidad = deteccion.idsNuevos.size
        const estacionesNuevas = ESTACIONES_ALERTA_COMANDAS
          .filter((destino) => deteccion.nuevasPorEstacion[destino].size > 0)
          .map((destino) => destino === 'bar' ? 'Barra' : NOMBRES_ESTACION_COMANDA[destino])
        setAvisoNuevo(`${cantidad === 1 ? 'Nueva comanda' : `${cantidad} comandas nuevas`} en ${estacionesNuevas.join(' y ')}.`)
        if (sonidoActivoRef.current) void reproducirAviso()
      }
      setPedidos(pedidosNuevos)
      setEstacionesOperativas(rutasRes.data ?? [])
      const estacionesConRuta = estacionesParaMostrar(rutasRes.data ?? [], pedidosNuevos)
      if (estacionesConRuta.length && !estacionesConRuta.some((fila) => fila.codigo === estacion)) {
        setEstacion(estacionesConRuta[0].codigo)
      }
      setMesas(mRes.data ?? [])
      setMeseros(uRes.data ?? [])
      setError(null)
    } catch {
      setError('No se pudo actualizar cocina. Comprueba tu conexión e inténtalo de nuevo.')
    } finally {
      if (cargaEnCurso.current === solicitudCarga) cargaEnCurso.current = null
      completarCarga()
    }
  }, [restaurante?.id])

  useEffect(() => {
    const rid = restaurante?.id
    if (!rid) return
    pedidosConocidos.current = null
    setNuevasPorEstacion({ cocina: new Set(), bar: new Set(), otros: new Set() })
    let activo = true
    setCargando(true)
    ;(async () => {
      await cargar()
      if (activo) setCargando(false)
    })()

    // En producción, refetch periódico (equivalente simple al realtime).
    const intervalo = enDemo() ? null : setInterval(() => void cargar(), 10_000)
    return () => {
      activo = false
      if (intervalo) clearInterval(intervalo)
    }
  }, [cargar, restaurante?.id])

  async function avanzar(p: PedidoConItems) {
    const rid = restaurante?.id
    if (!rid) return
    // Bloqueo mientras corre: sin esto, un doble toque o dos cocineros sobre la
    // misma tarjeta advancing dos veces se salta un estado de la comanda.
    if (avanzando.has(p.id)) return
    setAvanzando((prev) => new Set(prev).add(p.id))
    try {
      const { error: apiErr } = await getApi().avanzarPedido(rid, p.id, estacion)
      if (apiErr) {
        setError(apiErr)
        await cargar()
        setError(apiErr)
        return
      }
      await cargar()
    } catch {
      await cargar()
      setError('No se pudo confirmar el cambio. Verifica el estado actualizado en el tablero.')
    } finally {
      setAvanzando((prev) => {
        const next = new Set(prev)
        next.delete(p.id)
        return next
      })
    }
  }

  async function reproducirAviso() {
    try {
      const ContextoAudio = window.AudioContext
      if (!ContextoAudio) return
      const contexto = audioContext.current ?? new ContextoAudio()
      audioContext.current = contexto
      if (contexto.state === 'suspended') await contexto.resume()
      programarAlertaComanda(contexto)
    } catch {
      setAvisoNuevo('El navegador bloqueó el sonido. Pulsa “Activar sonido” otra vez.')
      setSonidoActivo(false)
      sonidoActivoRef.current = false
      setEstadoSonido('bloqueado')
    }
  }

  async function alternarSonido() {
    if (sonidoActivo) {
      setSonidoActivo(false)
      sonidoActivoRef.current = false
      setEstadoSonido('desactivado')
      setAvisoNuevo('Aviso sonoro desactivado.')
      const contexto = audioContext.current
      if (contexto?.state === 'running') void contexto.suspend().catch(() => undefined)
      return
    }
    try {
      const ContextoAudio = window.AudioContext
      if (!ContextoAudio) { setAvisoNuevo('Este navegador no admite avisos sonoros.'); setEstadoSonido('no-disponible'); return }
      const contexto = audioContext.current ?? new ContextoAudio()
      audioContext.current = contexto
      if (contexto.state === 'suspended') await contexto.resume()
      setSonidoActivo(true)
      sonidoActivoRef.current = true
      setEstadoSonido('activo')
      setAvisoNuevo('Aviso sonoro activado para esta estación en este dispositivo.')
      // Tono de confirmación: verifica el volumen y desbloquea el audio del navegador.
      const oscilador = contexto.createOscillator()
      const volumen = contexto.createGain()
      oscilador.frequency.value = 660
      volumen.gain.setValueAtTime(0.12, contexto.currentTime)
      volumen.gain.exponentialRampToValueAtTime(0.0001, contexto.currentTime + 0.12)
      oscilador.connect(volumen); volumen.connect(contexto.destination)
      oscilador.start(); oscilador.stop(contexto.currentTime + 0.13)
    } catch {
      setSonidoActivo(false)
      sonidoActivoRef.current = false
      setEstadoSonido('bloqueado')
      setAvisoNuevo('No se pudo activar el sonido. Revisa los permisos del navegador y vuelve a intentarlo.')
    }
  }

  const nombreMesa = new Map(mesas.map((m) => [m.id, m.nombre]))
  const nombreMesero = new Map(meseros.map((u) => [u.id, u.nombre]))

  // Conserva la estación capturada al crear cada ítem; admite otros destinos.
  const pedidosPorEstacion = useMemo(() => {
    const resultado: Record<EstacionComanda, PedidoConItems[]> = { cocina: [], bar: [], otros: [] }
    for (const p of pedidos) {
      if (p.cuentaAnulada) continue
      for (const destino of ESTACIONES_COMANDA) {
        const ruta = p.rutasPorEstacion?.[destino]
        if (!ruta || (!ruta.legado && !ruta.destinos.includes('kds')) || ruta.estado === 'entregado' || ruta.estado === 'anulado') continue
        const items = p.items.filter((it) => estacionDeProducto(it) === destino)
        const anulados = p.anulados.filter((it) => estacionDeProducto(it) === destino)
        if (items.length > 0 || anulados.length > 0) resultado[destino].push({ ...p, estado: ruta.estado, items, anulados })
      }
    }
    return resultado
  }, [pedidos])

  const impresionesPorEstacion = useMemo(() => {
    const resultado: Record<EstacionComanda, { pedido: PedidoConItems; salida: RutaComandaEstacion['impresoras'][number] }[]> = { cocina: [], bar: [], otros: [] }
    for (const pedido of pedidos) {
      for (const codigo of ESTACIONES_COMANDA) {
        const ruta = pedido.rutasPorEstacion?.[codigo]
        if (!ruta?.destinos.includes('impresora')) continue
        for (const salida of ruta.impresoras) {
          resultado[codigo].push({ pedido, salida })
        }
      }
    }
    return resultado
  }, [pedidos])

  const estacionesVisibles = useMemo(
    () => estacionesParaMostrar(estacionesOperativas, pedidos),
    [estacionesOperativas, pedidos],
  )
  const activos = pedidosPorEstacion[estacion]
  const salidasManuales = impresionesPorEstacion[estacion]
  const salidasCanceladas = salidasManuales.filter(({ salida, pedido }) => salida.cancelada_por_anulacion_cuenta || pedido.cuentaAnulada)
  const salidasPendientes = salidasManuales.filter(({ salida, pedido }) => !salida.cancelada_por_anulacion_cuenta && !pedido.cuentaAnulada && salida.estado !== 'confirmada' && salida.estado !== 'cancelada')
  const comandasPendientesImpresion = new Set(salidasPendientes.map(({ pedido }) => pedido.id)).size
  const salidasConfirmadas = salidasManuales.filter(({ salida, pedido }) => !salida.cancelada_por_anulacion_cuenta && !pedido.cuentaAnulada && salida.estado === 'confirmada')
  const configuracionEstacion = estacionesOperativas.find((fila) => fila.codigo === estacion)
  const tieneKds = Boolean(configuracionEstacion?.activo && configuracionEstacion.destinos.some((destino) => destino.activo && destino.grupo === 'principal' && destino.tipo === 'kds')) || pedidos.some((p) => p.rutasPorEstacion?.[estacion]?.destinos.includes('kds') || p.rutasPorEstacion?.[estacion]?.legado)
  const tieneImpresora = Boolean(configuracionEstacion?.activo && configuracionEstacion.destinos.some((destino) => destino.activo && destino.grupo === 'principal' && destino.tipo === 'impresora')) || pedidos.some((p) => p.rutasPorEstacion?.[estacion]?.destinos.includes('impresora'))
  const porEstado = (estado: EstadoPedido) => activos.filter((p) => p.estado === estado)
  const totalComandasNuevas = new Set(ESTACIONES_ALERTA_COMANDAS.flatMap((destino) => [...nuevasPorEstacion[destino]])).size
  const estacionesConNuevas = ESTACIONES_ALERTA_COMANDAS
    .filter((destino) => nuevasPorEstacion[destino].size > 0)
    .map((destino) => destino === 'bar' ? 'Barra' : NOMBRES_ESTACION_COMANDA[destino])

  if (cargando)
    return (
      <div>
        <PageHeader
          titulo="Estaciones de preparación"
          descripcion="Cocina, Barra y Otros: cada estación recibe sus comandas según la configuración del restaurante."
        />
        <div role="status" aria-live="polite" className="flex flex-col items-center justify-center gap-3 py-16 text-sm text-zinc-400">
          <Spinner />
          <span>Cargando comandas y destinos de impresión…</span>
        </div>
      </div>
    )

  return (
    <div>
      <PageHeader
        titulo="Estaciones de preparación"
        descripcion="Cada estación recibe las comandas según la configuración operativa del restaurante."
      />

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-surface-700 bg-surface-900 px-4 py-3">
        <div className="min-w-0">
          <p className="font-semibold text-zinc-200">Aviso de nuevas comandas</p>
          <p className="text-sm text-zinc-500">Se configura por separado en cada dispositivo. El navegador puede bloquear el audio hasta que lo actives.</p>
          <p className="mt-1 text-xs text-zinc-400" data-estado-sonido>
            {estadoSonido === 'activo' ? 'Sonido activo en este dispositivo.'
              : estadoSonido === 'bloqueado' ? 'El navegador no permitió el sonido. Actívalo de nuevo cuando estés listo.'
                : estadoSonido === 'no-disponible' ? 'Este navegador no admite avisos sonoros.'
                  : 'Sonido desactivado.'}
          </p>
        </div>
        <button type="button" aria-pressed={sonidoActivo} onClick={() => void alternarSonido()} className={`btn min-h-11 shrink-0 px-4 ${sonidoActivo ? 'btn-primary' : 'btn-outline'}`}>
          {sonidoActivo ? 'Desactivar sonido' : 'Activar sonido'}
        </button>
      </div>
      <p role="status" aria-live="polite" className="sr-only">{avisoNuevo}</p>

      {totalComandasNuevas > 0 && <div
        role="status"
        aria-live="polite"
        data-aviso-comandas-nuevas
        className="mb-5 flex items-start gap-3 rounded-xl border-2 border-brand-500/70 bg-brand-500/10 px-4 py-3 text-zinc-100 shadow-sm"
      >
        <span className="mt-1 h-3 w-3 shrink-0 rounded-full bg-brand-400 motion-safe:animate-pulse" aria-hidden="true" />
        <div>
          <p className="font-semibold">{totalComandasNuevas === 1 ? 'Nueva comanda pendiente' : `${totalComandasNuevas} comandas nuevas pendientes`}</p>
          <p className="mt-0.5 text-sm text-zinc-300">Revisa las tarjetas resaltadas en {estacionesConNuevas.join(' y ')}.</p>
          {!sonidoActivo && <p className="mt-1 text-xs text-zinc-400">
            {estadoSonido === 'bloqueado'
              ? 'El navegador bloqueó el audio. Activa el sonido para oír el aviso; las comandas seguirán resaltadas.'
              : 'El sonido está desactivado en este dispositivo. Las comandas seguirán resaltadas.'}
          </p>}
        </div>
      </div>}

      {error && (
        <div className="aviso mb-6 border-danger-500/40 bg-danger-500/10 text-danger-500">
          {error}
        </div>
      )}

      {/* Selector táctil de estación */}
      {estacionesVisibles.length > 0 ? <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3" role="group" aria-label="Seleccionar estación">
        {estacionesVisibles.map((estacionOperativa) => {
          const destino = estacionOperativa.codigo
          const destinosPrincipales = estacionOperativa.destinos.filter((d) => d.activo && d.grupo === 'principal')
          const soloImpresora = destinosPrincipales.length > 0 && destinosPrincipales.every((d) => d.tipo === 'impresora')
          const tieneKdsEstacion = destinosPrincipales.some((d) => d.tipo === 'kds') || pedidos.some((pedido) => pedido.rutasPorEstacion?.[destino]?.destinos.includes('kds') || pedido.rutasPorEstacion?.[destino]?.legado)
          const tieneImpresoraEstacion = destinosPrincipales.some((d) => d.tipo === 'impresora') || pedidos.some((pedido) => pedido.rutasPorEstacion?.[destino]?.destinos.includes('impresora'))
          const salidasPendientesEstacion = impresionesPorEstacion[destino].filter(({ salida, pedido }) => !salida.cancelada_por_anulacion_cuenta && !pedido.cuentaAnulada && salida.estado !== 'confirmada' && salida.estado !== 'cancelada').length
          return (
          <button
            key={destino}
            type="button"
            onClick={() => setEstacion(destino)}
            aria-pressed={estacion === destino}
            className={`flex min-h-20 touch-manipulation flex-col items-start justify-center gap-2 rounded-xl border-2 px-4 py-3 text-left transition active:scale-[0.98] ${estacion === destino ? 'border-brand-500 bg-brand-500/15 text-brand-400 shadow-sm shadow-brand-500/10' : 'border-surface-700 bg-surface-800 text-zinc-300 hover:border-surface-500'}`}
          >
            <span className="flex w-full items-center gap-2 text-base font-semibold">
              {destino === 'cocina' ? <IconoOlla /> : destino === 'bar' ? <IconoVaso /> : <IconoNota />}
              <span className="truncate">{etiquetaEstacion(estacionOperativa.nombre, destino)}</span>
            </span>
            <span className="flex flex-wrap gap-x-3 gap-y-1 pl-7 text-xs font-normal text-zinc-400">
              {tieneKdsEstacion && <span>{pedidosPorEstacion[destino].length} {pedidosPorEstacion[destino].length === 1 ? 'comanda en pantalla' : 'comandas en pantalla de preparación'}</span>}
              {tieneImpresoraEstacion && <span>{salidasPendientesEstacion} {salidasPendientesEstacion === 1 ? 'salida de impresión pendiente' : 'salidas de impresión pendientes'}</span>}
              {nuevasPorEstacion[destino].size > 0 && <span className="font-semibold text-brand-400">{nuevasPorEstacion[destino].size} nuevas</span>}
              {soloImpresora && <span>Ticketera manual</span>}
            </span>
          </button>
          )
        })}
      </div> : <EstadoVacio icono={<IconoNota />} titulo="No hay estaciones con destino principal" descripcion="Pide al administrador que active un destino para que las nuevas comandas puedan llegar a preparación." />}

      {tieneKds && activos.length === 0 && (
        <EstadoVacio
          icono={estacion === 'cocina' ? <IconoOlla className="h-6 w-6" /> : estacion === 'bar' ? <IconoVaso className="h-6 w-6" /> : <IconoNota className="h-6 w-6" />}
          titulo={`No hay comandas en ${nombreVisibleEstacion(estacion).toLowerCase()}`}
          descripcion={`Cuando un mesero envíe una comanda para ${nombreVisibleEstacion(estacion).toLowerCase()}, aparecerá aquí.`}
        />
      )}

      {!tieneKds && tieneImpresora && <section className="mb-5 rounded-xl border border-warn-500/30 bg-warn-500/5 p-4" data-estacion-solo-ticketera={estacion} aria-label={`${nombreVisibleEstacion(estacion)} trabaja solo con ticketera`}>
        <h2 className="font-semibold text-zinc-100">{nombreVisibleEstacion(estacion)} trabaja solo con ticketera</h2>
        <p className="mt-1 text-sm text-zinc-300">No hay pantalla KDS configurada.</p>
        <p className="mt-2 text-sm font-medium text-zinc-200">{comandasPendientesImpresion} {comandasPendientesImpresion === 1 ? 'comanda pendiente' : 'comandas pendientes'} de impresión.</p>
        <p className="mt-1 text-xs text-zinc-400">La impresión se realiza manualmente desde el navegador. Mesora no puede confirmar si salió papel.</p>
      </section>}

      {tieneKds ? <section aria-label={`KDS de ${nombreVisibleEstacion(estacion)}`}>
      <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-semibold text-zinc-100">KDS · {nombreVisibleEstacion(estacion)}</h2><span className="text-xs text-zinc-500">Estados de esta estación</span></div>
      <div className="grid gap-5 md:grid-cols-3">
        {COLUMNAS.map((col) => {
          const lista = porEstado(col.estado)
          return (
            <section
              key={col.estado}
              className="card p-4 sm:p-5"
            >
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-zinc-300">
                    <span className={`h-2 w-2 rounded-full ${col.color}`} />
                    {col.titulo}
                  </h2>
                  <p className="mt-1 pl-4 text-xs normal-case tracking-normal text-zinc-500">{col.ayuda}</p>
                </div>
                <span className="rounded-full border border-surface-700 px-2 py-0.5 text-xs text-zinc-400">
                  {lista.length}
                </span>
              </div>

              <div className="space-y-3">
                {lista.length === 0 && (
                  <p className="py-6 text-center text-sm text-zinc-600">Sin comandas</p>
                )}
                {lista.map((p) => (
                   <TarjetaComanda
                     key={p.id}
                     p={p}
                     mesaNombre={nombreMesa.get(p.mesa_id) ?? '—'}
                     meseroNombre={nombreMesero.get(p.mesero_id)}
                     boton={col.boton}
                     onAvanzar={() => void avanzar(p)}
                     avanzando={avanzando.has(p.id)}
                     nueva={nuevasPorEstacion[estacion].has(p.id)}
                     onImprimir={p.rutasPorEstacion?.[estacion]?.legado ? () => setTicket({ p, mesaNombre: nombreMesa.get(p.mesa_id) ?? '—', meseroNombre: nombreMesero.get(p.mesero_id) ?? 'No asignado', estacion, impresoras: [] }) : undefined}
                   />
                 ))}
               </div>
             </section>
           )
         })}
       </div>
      </section> : null}

      {tieneImpresora && <section className="mt-6 rounded-2xl border border-warn-500/20 bg-surface-900 p-4 sm:p-5" aria-label={`Cola de impresión manual de ${nombreVisibleEstacion(estacion)}`}>
        <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
          <div><h2 className="text-lg font-semibold text-zinc-100">Cola de impresión manual · {nombreVisibleEstacion(estacion)}</h2><p className="mt-1 text-sm text-zinc-500">La impresora no se detecta automáticamente. Abre cada salida y pulsa Imprimir en el navegador. Mesora no puede confirmar si salió papel.</p></div>
          <span className="rounded-full border border-warn-500/30 px-3 py-1 text-xs text-warn-300">{salidasPendientes.length} {salidasPendientes.length === 1 ? 'pendiente' : 'pendientes'}</span>
        </div>
        {salidasPendientes.length === 0 ? <p className="py-5 text-center text-sm text-zinc-500">No hay salidas pendientes de impresión.</p> : <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {salidasPendientes.map(({ pedido, salida }) => <TarjetaSalidaManual
            key={salida.entrega_id}
            pedido={pedido}
            salida={salida}
            mesaNombre={nombreMesa.get(pedido.mesa_id) ?? '—'}
            meseroNombre={nombreMesero.get(pedido.mesero_id) ?? 'No asignado'}
            estacion={estacion}
            onImprimir={() => setTicket({ p: pedido, mesaNombre: nombreMesa.get(pedido.mesa_id) ?? '—', meseroNombre: nombreMesero.get(pedido.mesero_id) ?? 'No asignado', estacion, salida, impresoras: [salida] })}
          />)}
        </div>}
        {salidasConfirmadas.length > 0 && <details className="mt-4 rounded-xl border border-surface-700 bg-surface-950/50 p-3">
          <summary className="cursor-pointer py-2 text-sm font-semibold text-zinc-300">Salidas recientes · reimpresión con motivo ({salidasConfirmadas.length})</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {salidasConfirmadas.map(({ pedido, salida }) => <TarjetaSalidaManual
              key={salida.entrega_id}
              pedido={pedido}
              salida={salida}
              mesaNombre={nombreMesa.get(pedido.mesa_id) ?? '—'}
              meseroNombre={nombreMesero.get(pedido.mesero_id) ?? 'No asignado'}
              estacion={estacion}
              onImprimir={() => setTicket({ p: pedido, mesaNombre: nombreMesa.get(pedido.mesa_id) ?? '—', meseroNombre: nombreMesero.get(pedido.mesero_id) ?? 'No asignado', estacion, salida, impresoras: [salida] })}
            />)}
          </div>
        </details>}
        {salidasCanceladas.length > 0 && <details className="mt-4 rounded-xl border border-danger-500/20 bg-surface-950/50 p-3">
          <summary className="cursor-pointer py-2 text-sm font-semibold text-zinc-300">Salidas canceladas por anulación de cuenta ({salidasCanceladas.length})</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {salidasCanceladas.map(({ pedido, salida }) => <TarjetaSalidaManual
              key={salida.entrega_id}
              pedido={pedido}
              salida={salida}
              mesaNombre={nombreMesa.get(pedido.mesa_id) ?? '—'}
              meseroNombre={nombreMesero.get(pedido.mesero_id) ?? 'No asignado'}
              estacion={estacion}
              onImprimir={() => undefined}
            />)}
          </div>
        </details>}
      </section>}
      {ticket && restaurante && (
         <ComandaImprimible
           pedido={ticket.p}
           restauranteNombre={restaurante?.nombre ?? 'Restaurante'}
           mesaNombre={ticket.mesaNombre}
           meseroNombre={ticket.meseroNombre}
           estacion={ticket.estacion}
           salidaImpresora={ticket.salida}
           impresorasConfiguradas={ticket.impresoras}
           onCerrar={() => setTicket(null)}
           registrarImpresion={(solicitudId, motivo) => ticket.salida
             ? getApi().registrarImpresionSalidaComanda(restaurante.id, ticket.p.id, ticket.estacion, ticket.salida.entrega_id, solicitudId, motivo)
             : getApi().registrarImpresionComanda(restaurante.id, ticket.p.id, ticket.estacion, solicitudId, motivo)}
           actualizarSalida={ticket.salida ? async (solicitudId, estado) => {
             const resultado = await getApi().actualizarEstadoSalidaComanda(restaurante.id, ticket.salida!.entrega_id, solicitudId, estado)
             if (!resultado.error) await cargar()
             return resultado
           } : undefined}
         />
       )}
     </div>
   )
}

function TarjetaComanda({
  p,
  mesaNombre,
  meseroNombre,
  boton,
  onAvanzar,
  avanzando,
  nueva,
  onImprimir,
}: {
  p: PedidoConItems
  mesaNombre: string
  meseroNombre?: string
  boton: string
  onAvanzar: () => void
  avanzando: boolean
  nueva: boolean
  onImprimir?: () => void
}) {
  const tiempo = useElapsed(p.created_at)
  const tiempoProlongado = Date.now() - Date.parse(p.created_at) >= 15 * 60_000
  const total = p.items.reduce((a, it) => a + it.cantidad * it.precio_unitario, 0)

  return (
    <div className={`rounded-xl border bg-surface-800 p-4 ${nueva ? 'border-brand-500 ring-2 ring-brand-500/40' : 'border-surface-700'}`} data-comanda-kds={p.id} data-nueva-comanda={nueva ? 'true' : undefined}>
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-lg font-bold tracking-tight text-zinc-100">{mesaNombre}{nueva && <span className="rounded-full bg-brand-500 px-2 py-0.5 text-xs font-bold text-surface-950">Nueva</span>}</p>
        <span className={`inline-flex items-center gap-1.5 rounded-full border bg-surface-900 px-3 py-1 text-sm tabular-nums ${tiempoProlongado ? 'border-warn-500/50 text-warn-300' : 'border-surface-600 text-brand-400'}`} aria-label={`Tiempo en cola: ${tiempo}${tiempoProlongado ? ', tiempo prolongado' : ''}`}>
          <IconoReloj />
          {tiempo}
        </span>
      </div>
      <p className="mt-0.5 text-sm text-zinc-500">
        {meseroNombre ? `${meseroNombre} · ` : ''}Hace {tiempo}
      </p>
      {tiempoProlongado && <p className="mt-1 text-xs font-medium text-warn-300">Tiempo prolongado · revisa esta comanda</p>}

      <ul className="mt-3 divide-y divide-surface-700/60 text-base">
        {p.items.map((it: ItemResumen) => (
          <li key={it.id} className="py-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-zinc-100">
                <span className="font-semibold text-brand-400">{it.cantidad}×</span> {it.nombre_producto}
              </span>
            </div>
            {it.nota && (
              <p className="mt-1 flex items-center gap-1.5 text-sm text-warn-400">
                <IconoNota />
                {it.nota}
              </p>
            )}
          </li>
        ))}
      </ul>

      {p.anulados.length > 0 && (
        <ul className="mt-2 space-y-1 rounded-lg border border-danger-500/30 bg-danger-500/5 px-3 py-2 text-sm text-danger-500">
          {p.anulados.map((it) => (
            <li key={it.id} className="line-through">
              {it.cantidad}× {it.nombre_producto}
              <span className="ml-1 no-underline">— anulado por el mesero</span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex flex-col gap-2 border-t border-surface-700 pt-3">
        <span className="text-sm text-zinc-500">{fmtPEN(total)}</span>
        <button
          type="button"
          data-guia="avanzar-pedido"
          data-guia-avanzar={p.id}
          onClick={onAvanzar}
          disabled={avanzando}
          aria-busy={avanzando}
          className="min-h-14 w-full touch-manipulation rounded-xl bg-brand-500 px-4 py-3 text-base font-semibold text-surface-950 transition hover:bg-brand-400 active:scale-[0.98] disabled:cursor-wait disabled:opacity-60"
        >
          {avanzando ? 'Guardando…' : boton}
        </button>
        {onImprimir && <button
          type="button"
          data-imprimir-comanda={p.id}
          onClick={onImprimir}
          className="min-h-12 touch-manipulation rounded-xl border border-surface-700 px-4 py-2.5 text-sm font-medium text-zinc-300 transition hover:border-brand-500 hover:text-brand-500 active:scale-[0.98]"
        ><span className="inline-flex items-center justify-center gap-2"><IconoImpresora />Impresión manual de histórico</span></button>}
      </div>
    </div>
  )
}

function etiquetaEstadoSalida(estado: RutaComandaEstacion['impresoras'][number]['estado']): string {
  if (estado === 'enviada') return 'Registrada · falta confirmar papel'
  if (estado === 'fallida') return 'No confirmada · requiere motivo para reintentar'
  if (estado === 'confirmada') return 'Confirmada por usuario'
  if (estado === 'cancelada') return 'Cancelada'
  return 'Pendiente de impresión manual'
}

function TarjetaSalidaManual({
  pedido,
  salida,
  mesaNombre,
  meseroNombre,
  estacion,
  onImprimir,
}: {
  pedido: PedidoConItems
  salida: RutaComandaEstacion['impresoras'][number]
  mesaNombre: string
  meseroNombre: string
  estacion: EstacionComanda
  onImprimir: () => void
}) {
  const tiempo = useElapsed(pedido.created_at)
  const items = itemsDeEstacion(pedido.items, estacion)
  const canceladaPorCuenta = salida.cancelada_por_anulacion_cuenta === true || pedido.cuentaAnulada === true
  return <article className="rounded-xl border border-surface-700 bg-surface-800 p-4" data-salida-impresion={salida.entrega_id}>
    <div className="flex items-start justify-between gap-3">
      <div><h3 className="text-lg font-bold text-zinc-100">{mesaNombre}</h3><p className="mt-0.5 text-sm text-zinc-500">{meseroNombre} · hace {tiempo}</p></div>
      <span className={`rounded-full border px-2.5 py-1 text-xs ${canceladaPorCuenta ? 'border-red-500/30 bg-red-500/10 text-red-300' : 'border-warn-500/30 bg-warn-500/10 text-warn-300'}`}>{canceladaPorCuenta ? 'Cancelada por anulación de cuenta' : etiquetaEstadoSalida(salida.estado)}</span>
    </div>
    <p className="mt-3 flex items-center gap-2 text-sm font-medium text-zinc-300"><IconoImpresora />{salida.nombre}</p>
    <p className="mt-1 text-xs text-zinc-500">{nombreVisibleEstacion(estacion)} · papel {salida.papel_mm ?? 'sin ancho guardado'} mm · {salida.copias} {salida.copias === 1 ? 'copia' : 'copias'} · configuración v{salida.configuracion_version}</p>
    <ul className="mt-3 space-y-1 border-t border-surface-700 pt-3 text-sm text-zinc-300">
      {items.map((item) => <li key={item.id}><span className="font-semibold text-brand-400">{item.cantidad}×</span> {item.nombre_producto}{item.nota ? <span className="block pl-6 text-xs text-warn-400">{item.nota}</span> : null}</li>)}
    </ul>
    {!canceladaPorCuenta && <button type="button" className={`btn ${salida.estado === 'confirmada' ? 'btn-outline' : 'btn-primary'} mt-4 min-h-12 w-full`} data-imprimir-salida={salida.entrega_id} data-reimprimir-salida={salida.estado === 'confirmada' ? salida.entrega_id : undefined} onClick={onImprimir}>
      {salida.estado === 'confirmada' ? 'Reimprimir' : salida.estado === 'fallida' ? 'Abrir impresión manual para reintentar' : salida.estado === 'enviada' ? 'Abrir vista de impresión' : 'Abrir impresión manual'}
    </button>}
  </article>
}
