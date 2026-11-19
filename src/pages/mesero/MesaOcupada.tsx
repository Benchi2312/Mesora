import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { esFalloDeRed, getApi, itemsVigentes, totalItems, type ItemResumen, type MeseroResumen, type PedidoResumen } from '../../lib/api'
import { useCurrentContext } from '../../lib/useCurrentContext'
import type { Mesa } from '../../types/database'
import { estadoPedidoLabel, fmtFecha, fmtPEN } from '../../lib/format'
import { Spinner } from '../../components/LoadingScreen'
import EstadoVacio from '../../components/EstadoVacio'
import { Campo, ConfirmDialog, IconoLapiz, Modal } from '../../components/ui'
import { CampoPin, usePinAutorizacion } from '../../components/pin'
import { ResumenConfirmacionAccion } from '../../components/ui'
import {
  confirmarAnulacionItem,
  confirmarCambioMesero,
  confirmarMovimientoConsumo,
} from '../../domain/security/confirmaciones'
import { mensajeOperacion } from '../../domain/security/mensajeOperacion'
import { errorAlAnularItem } from '../../domain/security/autorizacion'
import { ejecutarAnulacionItem } from '../../domain/security/anulacionItem'
import {
  esErrorDestinoOcupadoTraslado,
  esErrorPinIncorrectoTraslado,
  evaluarTrasladoConsumo,
  ejecutarTrasladoConReconciliacion,
  mensajeDestinoNoDisponible,
  validarPrecondicionesTraslado,
  type EstadoPrevalidacionTraslado,
  type ObservacionTrasladoConsumo,
} from '../../domain/restaurant/trasladoConsumo'
import Precuenta from '../../components/Precuenta'
import type { Zona } from '../../types/database'

type OperacionMesa = 'pasar-mesero' | 'mover-consumo' | null

const CANTIDAD_MAXIMA = 99
const NOTA_MAXIMA = 120
const MENSAJE_TRASLADO_INCIERTO = 'No se pudo confirmar el resultado. Actualiza las mesas antes de volver a intentarlo'

type TrasladoPendiente = {
  restauranteId: string
  actorId: string
  origenId: string
  origenNombre: string
  destinoId: string
  destinoNombre: string
  pedidoIds: string[]
  iniciadoAt: string
}

function claveTrasladoPendiente(restauranteId: string, actorId: string, origenId: string) {
  return `mesora:traslado-consumo-pendiente:v1:${restauranteId}:${actorId}:${origenId}`
}

function guardarTrasladoPendiente(traslado: TrasladoPendiente) {
  try {
    sessionStorage.setItem(
      claveTrasladoPendiente(traslado.restauranteId, traslado.actorId, traslado.origenId),
      JSON.stringify(traslado),
    )
  } catch {
    // La reconciliación en pantalla sigue activa aunque el navegador no permita almacenamiento de sesión.
  }
}

function leerTrasladoPendiente(restauranteId: string, actorId: string, origenId: string): TrasladoPendiente | null {
  try {
    const guardado = sessionStorage.getItem(claveTrasladoPendiente(restauranteId, actorId, origenId))
    if (!guardado) return null
    const valor = JSON.parse(guardado) as Partial<TrasladoPendiente>
    if (
      valor.restauranteId !== restauranteId || valor.actorId !== actorId || valor.origenId !== origenId ||
      typeof valor.destinoId !== 'string' || typeof valor.origenNombre !== 'string' ||
      typeof valor.destinoNombre !== 'string' || !Array.isArray(valor.pedidoIds) ||
      !valor.pedidoIds.every((id) => typeof id === 'string') || typeof valor.iniciadoAt !== 'string'
    ) return null
    return valor as TrasladoPendiente
  } catch {
    return null
  }
}

function limpiarTrasladoPendiente(traslado: Pick<TrasladoPendiente, 'restauranteId' | 'actorId' | 'origenId'>) {
  try {
    sessionStorage.removeItem(claveTrasladoPendiente(traslado.restauranteId, traslado.actorId, traslado.origenId))
  } catch {
    // No se bloquea la UI por una limitación del almacenamiento del navegador.
  }
}

interface MesaOcupadaProps {
  mesa: Mesa
  onVolver: () => void
  onConsumoMovido: (mensaje: string) => void
  onAgregarPedido: () => void
  onCerrarCuenta: () => void
}

/** Ítem que se está editando, con la comanda a la que pertenece. */
type EnEdicion = { pedidoId: string; item: ItemResumen }

/**
 * Pantalla intermedia de una mesa ocupada: muestra las comandas abiertas y deja
 * elegir entre agregar otra comanda (segunda ronda), corregir/anular lo que se
 * pidió o cerrar la cuenta.
 */
export default function MesaOcupada({
  mesa,
  onVolver,
  onConsumoMovido,
  onAgregarPedido,
  onCerrarCuenta,
}: MesaOcupadaProps) {
  const { restaurante, usuario } = useCurrentContext()
  const [pedidos, setPedidos] = useState<PedidoResumen[]>([])
  const [items, setItems] = useState<ItemResumen[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [verPrecuenta, setVerPrecuenta] = useState(false)
  const [flash, setFlash] = useState<string | null>(null)
  const [editando, setEditando] = useState<EnEdicion | null>(null)
  const [anulando, setAnulando] = useState<EnEdicion | null>(null)
  const [anulandoEnCurso, setAnulandoEnCurso] = useState(false)
  const anulacionEnCursoRef = useRef(false)
  const [motivoAnulacion, setMotivoAnulacion] = useState('')
  const [errorAnulacion, setErrorAnulacion] = useState<string | null>(null)
  const [meseros, setMeseros] = useState<MeseroResumen[]>([])
  const [mesasLibres, setMesasLibres] = useState<Mesa[]>([])
  const [zonas, setZonas] = useState<Zona[]>([])
  const [meseroResponsableId, setMeseroResponsableId] = useState<string | null>(mesa.mesero_responsable_id ?? null)
  const [operacionMesa, setOperacionMesa] = useState<OperacionMesa>(null)
  const [meseroSeleccionado, setMeseroSeleccionado] = useState('')
  const [mesaSeleccionada, setMesaSeleccionada] = useState('')
  const [motivoOperacion, setMotivoOperacion] = useState('')
  const [guardandoOperacion, setGuardandoOperacion] = useState(false)
  const [trasladoPendiente, setTrasladoPendiente] = useState<TrasladoPendiente | null>(null)
  const [verificandoTraslado, setVerificandoTraslado] = useState(false)
  const guardandoOperacionRef = useRef(false)
  const verificandoTrasladoRef = useRef(false)
  const [errorOperacion, setErrorOperacion] = useState<string | null>(null)
  const [cargandoOpcionesMesa, setCargandoOpcionesMesa] = useState(false)
  const [confirmandoOperacion, setConfirmandoOperacion] = useState(false)
  const [prevalidandoTraslado, setPrevalidandoTraslado] = useState(false)
  // El servidor vuelve a validar el PIN en las operaciones sensibles.
  const debeConsultarPin = Boolean(anulando || (operacionMesa && (operacionMesa === 'pasar-mesero' || confirmandoOperacion)))
  const { pin, setPin, requierePin, cargando: cargandoPin } = usePinAutorizacion(debeConsultarPin ? restaurante?.id : null)
  const meseroResponsable = meseros.find((m) => m.id === meseroResponsableId)
  const meserosDisponibles = meseros.filter((m) => m.id !== meseroResponsableId)
  const asignadaAOtro = usuario?.rol === 'mesero' && Boolean(meseroResponsableId) && meseroResponsableId !== usuario?.id

  async function abrirOperacionMesa(operacion: Exclude<OperacionMesa, null>) {
    const rid = restaurante?.id
    if (!rid) return
    setCargandoOpcionesMesa(true)
    setErrorOperacion(null)
    setMeseroSeleccionado('')
    setMesaSeleccionada('')
    setMotivoOperacion('')
    setPin('')
    setConfirmandoOperacion(false)
    try {
      const [usuarios, mesasActualizadas] = await Promise.all([
        getApi().getMeseros(rid),
        operacion === 'mover-consumo' ? getApi().getMesas(rid) : Promise.resolve(null),
      ])
      if (usuarios.error || mesasActualizadas?.error) {
        setErrorOperacion(mensajeOperacion(usuarios.error ?? mesasActualizadas?.error, 'No se pudieron actualizar las opciones. Revisa tu conexión e inténtalo de nuevo.'))
        return
      }
      setMeseros((usuarios.data ?? []).filter((u) => u.activo !== false && u.rol === 'mesero'))
      if (mesasActualizadas) {
        const listaMesas = mesasActualizadas.data ?? []
        setMesasLibres(listaMesas.filter((m) => m.id !== mesa.id && m.estado === 'libre' && !m.mesero_responsable_id))
        setMeseroResponsableId(listaMesas.find((m) => m.id === mesa.id)?.mesero_responsable_id ?? mesa.mesero_responsable_id ?? null)
      }
      setOperacionMesa(operacion)
    } catch {
      setErrorOperacion('No se pudieron actualizar las opciones. Revisa tu conexión e inténtalo de nuevo.')
    } finally {
      setCargandoOpcionesMesa(false)
    }
  }

  useEffect(() => {
    const rid = restaurante?.id
    if (!rid) return
    let activo = true
    setCargandoOpcionesMesa(true)
    void Promise.all([getApi().getMeseros(rid), getApi().getMesas(rid), getApi().getZonas(rid)]).then(([uRes, mRes, zRes]) => {
      if (!activo) return
      if (uRes.error || mRes.error || zRes.error) {
        setErrorOperacion(uRes.error ?? mRes.error ?? zRes.error ?? 'No se pudieron cargar las opciones de mesa.')
        return
      }
      const listaMeseros = (uRes.data ?? []).filter((u) => u.activo !== false)
      const listaMesas = mRes.data ?? []
      setMeseros(listaMeseros)
      setMesasLibres(listaMesas.filter((m) => m.id !== mesa.id && m.estado === 'libre' && !m.mesero_responsable_id))
      setZonas(zRes.data ?? [])
      setMeseroResponsableId(listaMesas.find((m) => m.id === mesa.id)?.mesero_responsable_id ?? mesa.mesero_responsable_id ?? null)
      setErrorOperacion(null)
    }).catch(() => {
      if (activo) setErrorOperacion('No se pudieron cargar las opciones de mesa. Inténtalo de nuevo.')
    }).finally(() => {
      if (activo) setCargandoOpcionesMesa(false)
    })
    return () => { activo = false }
  }, [restaurante?.id, mesa.id, mesa.mesero_responsable_id])

  /** Evita escribir estado si la pantalla ya se cerró (o si cambió la mesa). */
  const vivo = useRef(true)

  async function leerEstadoTraslado(traslado: Pick<TrasladoPendiente, 'restauranteId' | 'origenId' | 'destinoId'>) {
    const api = getApi()
    try {
      const [mesasRes, origenRes, destinoRes] = await Promise.all([
        api.getMesas(traslado.restauranteId),
        api.getPedidosDeMesa(traslado.restauranteId, traslado.origenId),
        api.getPedidosDeMesa(traslado.restauranteId, traslado.destinoId),
      ])
      if (mesasRes.error || origenRes.error || destinoRes.error || !mesasRes.data || !origenRes.data || !destinoRes.data) {
        return { mesas: null, observacion: { ok: false } satisfies ObservacionTrasladoConsumo }
      }
      const origen = mesasRes.data.find((m) => m.id === traslado.origenId)
      const destino = mesasRes.data.find((m) => m.id === traslado.destinoId)
      if (!origen || !destino) return { mesas: mesasRes.data, observacion: { ok: false } satisfies ObservacionTrasladoConsumo }
      return {
        mesas: mesasRes.data,
        observacion: {
          ok: true,
          origenEstado: origen.estado,
          destinoEstado: destino.estado,
          destinoResponsableId: destino.mesero_responsable_id,
          pedidosOrigen: origenRes.data.map(({ id }) => ({ id })),
          pedidosDestino: destinoRes.data.map(({ id }) => ({ id })),
        } satisfies ObservacionTrasladoConsumo,
      }
    } catch {
      return { mesas: null, observacion: { ok: false } satisfies ObservacionTrasladoConsumo }
    }
  }

  async function observarTraslado(traslado: TrasladoPendiente): Promise<ObservacionTrasladoConsumo> {
    return (await leerEstadoTraslado(traslado)).observacion
  }

  function aplicarMesasActualizadas(mesas: readonly Mesa[] | null) {
    if (!mesas) return
    setMesasLibres(mesas.filter((m) => m.id !== mesa.id && m.estado === 'libre' && !m.mesero_responsable_id))
  }

  async function prevalidarTraslado(destinoId: string, pedidoIds: readonly string[]) {
    if (!restaurante) return { estado: 'incierto' as EstadoPrevalidacionTraslado, destinoNombre: null as string | null }
    const lectura = await leerEstadoTraslado({ restauranteId: restaurante.id, origenId: mesa.id, destinoId })
    aplicarMesasActualizadas(lectura.mesas)
    const destino = lectura.mesas?.find((fila) => fila.id === destinoId)
    return {
      estado: validarPrecondicionesTraslado(pedidoIds, lectura.observacion),
      destinoNombre: destino?.nombre ?? null,
    }
  }

  function explicarPrevalidacion(estado: EstadoPrevalidacionTraslado, destinoNombre: string | null) {
    setConfirmandoOperacion(false)
    setPin('')
    if (estado === 'destino_no_disponible') {
      setMesaSeleccionada('')
      setErrorOperacion(mensajeDestinoNoDisponible(destinoNombre ?? 'seleccionada'))
    } else if (estado === 'origen_cambio') {
      setErrorOperacion('La mesa de origen cambió o sus comandas ya no coinciden. Actualiza las mesas antes de continuar.')
      void cargar(true)
    } else if (estado === 'incierto') {
      setErrorOperacion('No se pudo verificar el estado actual de ambas mesas. Actualízalas antes de continuar.')
    }
  }

  function cerrarTrasladoConfirmado(traslado: TrasladoPendiente) {
    limpiarTrasladoPendiente(traslado)
    setTrasladoPendiente(null)
    setOperacionMesa(null)
    setMesaSeleccionada('')
    setMotivoOperacion('')
    setPin('')
    setConfirmandoOperacion(false)
    setErrorOperacion(null)
    onConsumoMovido(`Consumo movido correctamente de ${traslado.origenNombre} a ${traslado.destinoNombre}`)
  }

  async function verificarTrasladoPendiente(traslado: TrasladoPendiente, automatico = false) {
    if (verificandoTrasladoRef.current) return
    verificandoTrasladoRef.current = true
    setVerificandoTraslado(true)
    setErrorOperacion(MENSAJE_TRASLADO_INCIERTO)
    try {
      const observacion = await observarTraslado(traslado)
      const estado = evaluarTrasladoConsumo(traslado.pedidoIds, observacion)
      if (estado === 'confirmado') {
        cerrarTrasladoConfirmado(traslado)
      } else if (estado === 'sin_cambios' && !automatico) {
        limpiarTrasladoPendiente(traslado)
        setTrasladoPendiente(null)
        setConfirmandoOperacion(false)
        setErrorOperacion('Las mesas siguen en su estado original; el traslado no se registró. Ya puedes revisar y volver a intentar.')
        setPin('')
      } else {
        setTrasladoPendiente(traslado)
        setErrorOperacion(MENSAJE_TRASLADO_INCIERTO)
      }
    } finally {
      verificandoTrasladoRef.current = false
      setVerificandoTraslado(false)
    }
  }

  /**
   * Carga comandas e ítems de la mesa. `silencioso` se usa tras editar o anular
   * para recargar sin volver a tapar la pantalla con el spinner.
   */
  const cargar = useCallback(
    async (
      silencioso: boolean,
      opciones?: { silenciarErrores?: boolean },
    ): Promise<{ ok: boolean; pedidos: PedidoResumen[] }> => {
      const rid = restaurante?.id
      if (!rid) return { ok: false, pedidos: [] }
      if (!silencioso) setCargando(true)
      try {
        const api = getApi()
        const pedRes = await api.getPedidosDeMesa(rid, mesa.id)
        if (!vivo.current) return { ok: false, pedidos: [] }
        if (pedRes.error) {
          if (!opciones?.silenciarErrores) setError(pedRes.error)
          return { ok: false, pedidos: [] }
        }
        const pList = pedRes.data ?? []
        setPedidos(pList)
        if (pList.length === 0) {
          setItems([])
          setError(null)
          return { ok: true, pedidos: pList }
        }
        const itsRes = await api.getPedidoItems(pList.map((p) => p.id))
        if (!vivo.current) return { ok: false, pedidos: [] }
        if (itsRes.error) {
          if (!opciones?.silenciarErrores) setError(itsRes.error)
          return { ok: false, pedidos: pList }
        }
        setItems(itsRes.data ?? [])
        setError(null)
        return { ok: true, pedidos: pList }
      } catch {
        if (vivo.current && !opciones?.silenciarErrores) {
          setError('No se pudieron actualizar las comandas. Comprueba tu conexión e inténtalo de nuevo.')
        }
        return { ok: false, pedidos: [] }
      } finally {
        if (vivo.current) setCargando(false)
      }
    },
    [restaurante?.id, mesa.id],
  )

  useEffect(() => {
    vivo.current = true
    void cargar(false)
    return () => {
      vivo.current = false
    }
  }, [cargar])

  useEffect(() => {
    if (!restaurante?.id || !usuario?.id) return
    const pendiente = leerTrasladoPendiente(restaurante.id, usuario.id, mesa.id)
    if (!pendiente) return
    setTrasladoPendiente(pendiente)
    setOperacionMesa('mover-consumo')
    setMesaSeleccionada(pendiente.destinoId)
    setConfirmandoOperacion(true)
    setErrorOperacion(MENSAJE_TRASLADO_INCIERTO)
    void verificarTrasladoPendiente(pendiente, true)
    // Solo se restaura al entrar a esta mesa; la verificación manual evita reenvíos a ciegas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurante?.id, usuario?.id, mesa.id])

  useEffect(() => {
    if (!flash) return
    const t = setTimeout(() => setFlash(null), 4000)
    return () => clearTimeout(t)
  }, [flash])

  const itemsPorPedido = useMemo(() => {
    const map = new Map<string, ItemResumen[]>()
    for (const it of items) {
      const arr = map.get(it.pedido_id) ?? []
      arr.push(it)
      map.set(it.pedido_id, arr)
    }
    return map
  }, [items])

  const total = useMemo(() => totalItems(items), [items])
  const hayPedidos = pedidos.length > 0

  async function confirmarAnulacion() {
    if (!restaurante || !anulando || anulacionEnCursoRef.current) return
    const motivo = motivoAnulacion.trim()
    const errorMotivo = errorAlAnularItem(motivo)
    if (errorMotivo) {
      setErrorAnulacion(errorMotivo)
      return
    }
    anulacionEnCursoRef.current = true
    setAnulandoEnCurso(true)
    setErrorAnulacion(null)
    const api = getApi()
    try {
      const resultado = await ejecutarAnulacionItem({
        anular: async () => {
          const { error: apiErr } = await api.anularItem(restaurante.id, anulando.pedidoId, anulando.item.id, motivo, pin)
          return { error: apiErr }
        },
        verificarAnulado: async () => {
          const lectura = await api.getPedidoItems([anulando.pedidoId])
          return !lectura.error && Boolean(lectura.data?.some((item) => item.id === anulando.item.id && item.anulado))
        },
        recargar: async () => {
          const lectura = await cargar(true, { silenciarErrores: true })
          return { ok: lectura.ok, comandasAbiertas: lectura.pedidos.length }
        },
      })
      if (resultado.estado === 'error') {
        setErrorAnulacion(mensajeOperacion(resultado.mensaje, 'No se pudo anular el ítem. Actualiza la comanda e inténtalo de nuevo.'))
        return
      }
      setAnulando(null)
      setMotivoAnulacion('')
      setPin('')
      setError(null)
      setFlash(resultado.mensaje)
    } catch {
      setErrorAnulacion('No se pudo confirmar la respuesta. El motivo se conservó; puedes reintentar de forma segura.')
    } finally {
      anulacionEnCursoRef.current = false
      setAnulandoEnCurso(false)
    }
  }

  async function confirmarOperacionMesa() {
    if (!restaurante || !operacionMesa || guardandoOperacionRef.current || verificandoTrasladoRef.current || (operacionMesa === 'mover-consumo' && trasladoPendiente)) return
    const motivo = motivoOperacion.trim()
    if (motivo.length < 5 || motivo.length > 300) {
      setErrorOperacion('Escribe un motivo de entre 5 y 300 caracteres.')
      return
    }
    guardandoOperacionRef.current = true
    setGuardandoOperacion(true)
    setErrorOperacion(null)
    try {
      const api = getApi()
      if (operacionMesa === 'pasar-mesero') {
        const destino = meseros.find((m) => m.id === meseroSeleccionado)
        if (!destino) {
          setErrorOperacion('Elige el mesero que recibirá la mesa.')
          return
        }
        const res = await api.asignarMesaMesero(restaurante.id, mesa.id, destino.id, requierePin ? pin : null, motivo)
        if (res.error) {
          setErrorOperacion(mensajeOperacion(res.error, 'No se pudo pasar la mesa. Actualiza las mesas e inténtalo de nuevo.'))
          return
        }
        setMeseroResponsableId(destino.id)
        setOperacionMesa(null)
        setMeseroSeleccionado('')
        setMotivoOperacion('')
        setPin('')
        setConfirmandoOperacion(false)
        setFlash(`Mesa asignada a ${destino.nombre}. Las comandas anteriores conservan su mesero original.`)
        await cargar(true)
        return
      }

      const destino = mesasLibres.find((m) => m.id === mesaSeleccionada)
      if (!destino) {
        setErrorOperacion('Elige una mesa libre para recibir el consumo.')
        return
      }
      const pedidoIds = pedidos.map(({ id }) => id)
      if (pedidoIds.length === 0) {
        setErrorOperacion('No hay comandas abiertas para mover. Actualiza las mesas antes de continuar.')
        return
      }
      if (!usuario?.id) {
        setErrorOperacion('No se pudo verificar tu sesión. Actualiza la pantalla antes de mover el consumo.')
        return
      }
      const traslado: TrasladoPendiente = {
        restauranteId: restaurante.id,
        actorId: usuario.id,
        origenId: mesa.id,
        origenNombre: mesa.nombre,
        destinoId: destino.id,
        destinoNombre: destino.nombre,
        pedidoIds,
        iniciadoAt: new Date().toISOString(),
      }
      setPrevalidandoTraslado(true)
      const prevalidacion = await prevalidarTraslado(destino.id, pedidoIds)
      setPrevalidandoTraslado(false)
      if (prevalidacion.estado !== 'disponible') {
        explicarPrevalidacion(prevalidacion.estado, prevalidacion.destinoNombre ?? destino.nombre)
        return
      }
      guardarTrasladoPendiente(traslado)
      const resultado = await ejecutarTrasladoConReconciliacion(
        () => api.moverConsumoMesa(restaurante.id, mesa.id, destino.id, requierePin ? pin : null, motivo),
        () => observarTraslado(traslado),
        pedidoIds,
        esFalloDeRed,
      )
      if (resultado.estado === 'confirmado') {
        cerrarTrasladoConfirmado(traslado)
        return
      }
      if (resultado.estado === 'rechazado') {
        limpiarTrasladoPendiente(traslado)
        if (esErrorPinIncorrectoTraslado(resultado.error)) {
          setPin('')
          setErrorOperacion('PIN incorrecto. No se realizó el traslado')
          return
        }
        if (esErrorDestinoOcupadoTraslado(resultado.error)) {
          const estadoActual = await prevalidarTraslado(destino.id, pedidoIds)
          setPin('')
          setConfirmandoOperacion(false)
          if (estadoActual.estado === 'destino_no_disponible') {
            setMesaSeleccionada('')
            setErrorOperacion(mensajeDestinoNoDisponible(estadoActual.destinoNombre ?? destino.nombre))
          } else {
            setErrorOperacion('El estado de la mesa cambió durante la operación. Actualiza las mesas antes de volver a intentarlo.')
          }
          return
        }
        setErrorOperacion(mensajeOperacion(resultado.error, 'No se pudo completar el traslado. Revisa los datos e inténtalo de nuevo.'))
        return
      }
      setTrasladoPendiente(traslado)
      setPin('')
      setErrorOperacion(MENSAJE_TRASLADO_INCIERTO)
    } catch {
      setErrorOperacion(MENSAJE_TRASLADO_INCIERTO)
    } finally {
      setPrevalidandoTraslado(false)
      guardandoOperacionRef.current = false
      setGuardandoOperacion(false)
    }
  }

  async function revisarYConfirmarOperacion() {
    if (operacionMesa !== 'mover-consumo') {
      setErrorOperacion(null)
      setConfirmandoOperacion(true)
      return
    }
    if (!restaurante || !mesaSeleccionada || pedidos.length === 0 || guardandoOperacionRef.current) return
    guardandoOperacionRef.current = true
    setPrevalidandoTraslado(true)
    setErrorOperacion(null)
    try {
      const destino = mesasLibres.find((fila) => fila.id === mesaSeleccionada)
      if (!destino) {
        setErrorOperacion('Elige una mesa disponible para recibir el consumo.')
        return
      }
      const estado = await prevalidarTraslado(destino.id, pedidos.map(({ id }) => id))
      if (estado.estado !== 'disponible') {
        explicarPrevalidacion(estado.estado, estado.destinoNombre ?? destino.nombre)
        return
      }
      setErrorOperacion(null)
      setConfirmandoOperacion(true)
    } finally {
      guardandoOperacionRef.current = false
      setPrevalidandoTraslado(false)
    }
  }

  if (verPrecuenta) {
    return <Precuenta mesa={mesa} onVolver={() => { setVerPrecuenta(false); void cargar(false) }} />
  }

  return (
    <div>
      <button
        type="button"
        onClick={onVolver}
        className="-mx-2 -mt-1 mb-3 inline-flex min-h-11 touch-manipulation items-center gap-1 rounded-lg px-2 text-base text-zinc-400 transition hover:text-brand-500"
      >
        ← Volver a mesas
      </button>

      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Mesa abierta</p>
          <h1 className="text-xl font-extrabold tracking-tight text-zinc-100">{mesa.nombre}</h1>
          <p className="mt-1 text-xs text-zinc-500">Responsable: {meseroResponsable?.nombre ?? (meseroResponsableId ? 'Mesero inactivo' : 'Sin asignar')}</p>
        </div>
        {hayPedidos && (
          <div className="text-right">
            <p className="text-xs uppercase tracking-widest text-zinc-500">
              {pedidos.length} {pedidos.length === 1 ? 'comanda' : 'comandas'} por cobrar
            </p>
            <p className="text-2xl font-bold tabular-nums text-brand-400">{fmtPEN(total)}</p>
          </div>
        )}
      </div>

      {error && (
        <div className="aviso mb-4 border-danger-500/40 bg-danger-500/10 text-danger-500">
          {error}<button type="button" onClick={() => void cargar(false)} className="ml-3 underline">Actualizar</button>
        </div>
      )}
      {flash && (
        <div role="status" aria-live="polite" className="aviso mb-4 border-ok-500/40 bg-ok-500/10 text-ok-500">{flash}</div>
      )}
      {asignadaAOtro && (
        <div role="status" className="aviso mb-4 border-brand-500/30 bg-brand-500/10 text-brand-300">
          Esta mesa ahora está asignada a {meseroResponsable?.nombre ?? 'otro mesero'}. Puedes consultar el consumo, pero el responsable debe gestionar las comandas.
        </div>
      )}

      {cargando ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : !hayPedidos ? (
        <EstadoVacio
          titulo="Esta mesa no tiene comandas abiertas"
          descripcion="Puede que ya se cobraran. Agrega una nueva comanda o vuelve al mapa de mesas."
        />
      ) : (
        <div className="space-y-3">
          {pedidos.map((p) => {
            const its = itemsPorPedido.get(p.id) ?? []
            const sub = totalItems(its)
            const anulados = its.length - itemsVigentes(its).length
            return (
              <div key={p.id} className="rounded-xl border border-surface-800 bg-surface-900 p-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
                    Comanda · {fmtFecha(p.created_at)}
                  </p>
                  <span className="flex items-center gap-2">
                    {anulados > 0 && (
                      <span className="chip chip-neutral">
                        {anulados} {anulados === 1 ? 'anulado' : 'anulados'}
                      </span>
                    )}
                    <span className="text-xs text-zinc-500">{estadoPedidoLabel(p.estado)}</span>
                  </span>
                </div>
                <ul className="divide-y divide-surface-700/60 text-sm">
                  {its.map((it) => (
                    <FilaItem
                      key={it.id}
                      item={it}
                      onEditar={() => setEditando({ pedidoId: p.id, item: it })}
                      editable={!asignadaAOtro}
                    />
                  ))}
                </ul>
                <div className="mt-2 flex justify-end border-t border-surface-700 pt-2 text-sm">
                  <span className="text-zinc-300">
                    Subtotal: <span className="text-zinc-200">{fmtPEN(sub)}</span>
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <section className="mt-5" aria-labelledby="acciones-cuenta-titulo">
        <h2 id="acciones-cuenta-titulo" className="text-sm font-semibold text-zinc-200">Siguiente paso</h2>
        <p className="mt-1 text-xs text-zinc-500">Agrega otro pedido si hace falta, revisa la precuenta y luego cierra la cuenta.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3" role="group" aria-label="Acciones principales de la cuenta">
          <button
            type="button"
            disabled={asignadaAOtro}
            onClick={onAgregarPedido}
            className="min-h-14 touch-manipulation rounded-xl border-2 border-brand-500/50 bg-brand-500/10 px-4 py-3.5 text-base font-semibold text-brand-400 transition hover:border-brand-500 hover:bg-brand-500/15 active:scale-[0.98]"
          >
            + Agregar otro pedido
          </button>
          <button
            type="button"
            disabled={cargando || Boolean(error) || !hayPedidos || total <= 0}
            onClick={() => setVerPrecuenta(true)}
            className="btn btn-outline min-h-14 px-4 py-3.5 text-base"
          >
            Ver precuenta
          </button>
          <button
            type="button"
            data-guia="cerrar-cuenta"
            onClick={onCerrarCuenta}
            disabled={!hayPedidos || asignadaAOtro}
            className="min-h-14 touch-manipulation rounded-xl bg-brand-500 px-4 py-3.5 text-base font-semibold text-surface-950 transition hover:bg-brand-400 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {hayPedidos ? `Cerrar cuenta · ${fmtPEN(total)}` : 'Cerrar cuenta'}
          </button>
        </div>
      </section>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          disabled={!hayPedidos || asignadaAOtro || cargandoOpcionesMesa}
          onClick={() => void abrirOperacionMesa('pasar-mesero')}
          className="btn btn-outline min-h-12 px-4 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Pasar a otro mesero
        </button>
        <button
          type="button"
          disabled={!hayPedidos || asignadaAOtro || cargandoOpcionesMesa || mesasLibres.length === 0}
          onClick={() => void abrirOperacionMesa('mover-consumo')}
          className="btn btn-outline min-h-12 px-4 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Mover consumo a otra mesa
        </button>
      </div>
      <p className="mt-2 text-center text-xs text-zinc-500">
        Toca un ítem para corregirlo o anularlo. Puedes mandar varias comandas a la misma mesa antes de
        cobrar: todo se suma en una sola cuenta.
      </p>

      {editando && (
        <ModalEditarItem
          edicion={editando}
          onCerrar={() => setEditando(null)}
          onAnular={() => {
            setMotivoAnulacion('')
            setErrorAnulacion(null)
            setAnulando(editando)
            setEditando(null)
          }}
          onGuardado={async (mensaje) => {
            setEditando(null)
            setFlash(mensaje)
            await cargar(true)
          }}
        />
      )}

      {anulando && (
        <ConfirmDialog
          titulo="Anular ítem"
          confirmLabel="Anular ítem"
          cargandoLabel="Anulando…"
          cargando={anulandoEnCurso}
          mensaje={
            <>
              <strong className="text-zinc-100">{anulando.item.nombre_producto}</strong> ({anulando.item.cantidad}×{' '}
              {fmtPEN(anulando.item.cantidad * anulando.item.precio_unitario)}) dejará de enviarse a cocina y
              no se cobra. Si era el único ítem de la comanda, la mesa se libera.
            </>
          }
          extra={
            <>
              <label className="label mt-4" htmlFor="motivo-anulacion-item">Motivo de anulación</label>
              <textarea
                id="motivo-anulacion-item"
                aria-describedby="motivo-anulacion-item-ayuda"
                aria-invalid={Boolean(errorAlAnularItem(motivoAnulacion))}
                rows={3}
                maxLength={200}
                value={motivoAnulacion}
                onChange={(e) => { setMotivoAnulacion(e.target.value); setErrorAnulacion(null) }}
                placeholder="Ej.: producto duplicado o cambio solicitado por el cliente"
                className="input resize-y py-3"
              />
              <p id="motivo-anulacion-item-ayuda" className="mt-1 text-xs text-zinc-500" role={errorAlAnularItem(motivoAnulacion) ? 'alert' : undefined}>
                {errorAlAnularItem(motivoAnulacion) ?? 'Obligatorio. Máximo 200 caracteres. Quedará registrado en auditoría.'}
              </p>
              <ResumenConfirmacionAccion pinVerificando={cargandoPin} resumen={confirmarAnulacionItem({
                producto: anulando.item.nombre_producto,
                cantidad: anulando.item.cantidad,
                importe: fmtPEN(anulando.item.cantidad * anulando.item.precio_unitario),
                mesa: mesa.nombre,
                liberaMesa: itemsVigentes(items).filter((item) => item.id !== anulando.item.id).length === 0,
                requierePin,
                motivo: motivoAnulacion,
              })} />
              {requierePin ? <CampoPin pin={pin} onChange={setPin} /> : null}
            </>
          }
          disabled={cargandoPin || Boolean(errorAlAnularItem(motivoAnulacion)) || (requierePin && pin.length === 0)}
          error={errorAnulacion}
          onConfirmar={() => void confirmarAnulacion()}
          onCancelar={() => {
            setAnulando(null)
            setMotivoAnulacion('')
            setErrorAnulacion(null)
            setPin('')
          }}
        />
      )}

      {operacionMesa && (
        <Modal
          titulo={operacionMesa === 'pasar-mesero' ? 'Pasar mesa a otro mesero' : 'Mover consumo a otra mesa'}
          onCerrar={() => { if (!guardandoOperacion && !trasladoPendiente && !verificandoTraslado) { setOperacionMesa(null); setMotivoOperacion(''); setPin(''); setConfirmandoOperacion(false) } }}
        >
          {!confirmandoOperacion && operacionMesa === 'pasar-mesero' ? (
            <>
              <p className="text-sm leading-relaxed text-zinc-300">
                La mesa seguirá siendo la misma. El nuevo responsable recibirá las próximas comandas; los pedidos y ventas anteriores conservan el mesero que los registró.
              </p>
              <label className="label mt-4" htmlFor="mesa-nuevo-mesero">Mesero que recibe</label>
              <select id="mesa-nuevo-mesero" value={meseroSeleccionado} onChange={(e) => setMeseroSeleccionado(e.target.value)} className="input">
                <option value="">Selecciona un mesero</option>
                {meserosDisponibles.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
              </select>
              {meserosDisponibles.length === 0 ? <p className="mt-2 text-xs text-zinc-500">No hay otros meseros activos disponibles.</p> : null}
            </>
          ) : !confirmandoOperacion ? (
            <>
              <p className="text-sm leading-relaxed text-zinc-300">
                Moveremos las comandas aún no cobradas a una mesa libre. Los pagos ya emitidos y su historial no cambian.
              </p>
              <label className="label mt-4" htmlFor="mesa-destino-consumo">Mesa libre</label>
              <select id="mesa-destino-consumo" value={mesaSeleccionada} onChange={(e) => setMesaSeleccionada(e.target.value)} className="input">
                <option value="">Selecciona una mesa</option>
                {mesasLibres.map((m) => {
                  const zona = zonas.find((z) => z.id === m.zona_id)?.nombre
                  return <option key={m.id} value={m.id}>{m.nombre}{zona ? ` · ${zona}` : ''}</option>
                })}
              </select>
              {mesasLibres.length === 0 ? <p className="mt-2 text-xs text-zinc-500">No hay mesas libres para recibir el consumo.</p> : null}
            </>
          ) : null}
          {!confirmandoOperacion ? (
            <>
              <label className="label mt-4" htmlFor="mesa-motivo-operacion">Motivo</label>
              <textarea
                id="mesa-motivo-operacion"
                value={motivoOperacion}
                onChange={(e) => { setMotivoOperacion(e.target.value.slice(0, 300)); setErrorOperacion(null) }}
                className="input min-h-20 resize-y"
                maxLength={300}
                placeholder={operacionMesa === 'pasar-mesero' ? 'Ej. Cambio de turno' : 'Ej. Cliente pidió cambiar de mesa'}
              />
            </>
          ) : trasladoPendiente ? (
            <div className="rounded-xl border border-brand-500/30 bg-brand-500/10 p-4 text-sm leading-relaxed text-zinc-200">
              <p className="font-semibold text-brand-300">Resultado del traslado pendiente de confirmar</p>
              <p className="mt-2">{MENSAJE_TRASLADO_INCIERTO}</p>
              <p className="mt-2 text-zinc-400">
                Estamos verificando {trasladoPendiente.origenNombre} y {trasladoPendiente.destinoNombre}. No vuelvas a enviar el traslado hasta completar esta comprobación.
              </p>
            </div>
          ) : (
            <>
              <ResumenConfirmacionAccion pinVerificando={cargandoPin} resumen={operacionMesa === 'pasar-mesero'
                ? confirmarCambioMesero({
                  mesa: mesa.nombre,
                  anterior: meseroResponsable?.nombre ?? 'Sin asignar',
                  nuevo: meseros.find((m) => m.id === meseroSeleccionado)?.nombre ?? 'Mesero seleccionado',
                  comandas: pedidos.length,
                  importe: fmtPEN(total),
                  motivo: motivoOperacion.trim(),
                  requierePin,
                })
                : confirmarMovimientoConsumo({
                  origen: mesa.nombre,
                  destino: mesasLibres.find((m) => m.id === mesaSeleccionada)?.nombre ?? 'Mesa seleccionada',
                  comandas: pedidos.length,
                  importe: fmtPEN(total),
                  motivo: motivoOperacion.trim(),
                  requierePin,
                })} />
              {requierePin ? <CampoPin pin={pin} onChange={setPin} etiqueta="PIN del administrador o gerente" /> : null}
            </>
          )}
          {errorOperacion && !trasladoPendiente ? <div role="alert" className="aviso mt-4 border-danger-500/40 bg-danger-500/10 text-danger-500">{errorOperacion}</div> : null}
          {trasladoPendiente ? <div role="status" aria-live="polite" className="sr-only">{MENSAJE_TRASLADO_INCIERTO}</div> : null}
          {guardandoOperacion ? (
            <div role="status" aria-live="polite" className="aviso mt-4 border-brand-500/30 bg-brand-500/10 text-brand-300"><Spinner className="mr-2 h-4 w-4 align-middle" />Guardando el cambio de mesa…</div>
          ) : null}
          {verificandoTraslado || prevalidandoTraslado ? (
            <div role="status" aria-live="polite" className="aviso mt-4 border-brand-500/30 bg-brand-500/10 text-brand-300"><Spinner className="mr-2 h-4 w-4 align-middle" />Verificando el estado de ambas mesas…</div>
          ) : null}
          <div className="mt-6 flex flex-wrap justify-end gap-2">
            <button type="button" disabled={guardandoOperacion || verificandoTraslado || Boolean(trasladoPendiente)} onClick={() => { setOperacionMesa(null); setMotivoOperacion(''); setPin(''); setConfirmandoOperacion(false) }} className="btn btn-outline min-h-11 px-4">Cancelar</button>
            {confirmandoOperacion ? (
              <>
                {!trasladoPendiente ? <button type="button" disabled={guardandoOperacion || verificandoTraslado} onClick={() => { setConfirmandoOperacion(false); setErrorOperacion(null) }} className="btn btn-outline min-h-11 px-4">Volver a editar</button> : null}
                {trasladoPendiente ? (
                  <button type="button" disabled={guardandoOperacion || verificandoTraslado} onClick={() => void verificarTrasladoPendiente(trasladoPendiente)} className="btn min-h-11 px-4">
                    {verificandoTraslado ? 'Verificando…' : 'Verificar resultado'}
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={guardandoOperacion || verificandoTraslado || prevalidandoTraslado || cargandoPin || (requierePin && pin.length === 0)}
                    onClick={() => void confirmarOperacionMesa()}
                    className="btn min-h-11 px-4"
                  >
                    {guardandoOperacion ? 'Guardando…' : 'Confirmar y guardar'}
                  </button>
                )}
              </>
            ) : (
              <button
                type="button"
                disabled={guardandoOperacion || prevalidandoTraslado || (operacionMesa === 'pasar-mesero' && cargandoPin) || motivoOperacion.trim().length < 5 || (operacionMesa === 'pasar-mesero' && requierePin && pin.length === 0) || (operacionMesa === 'pasar-mesero' ? !meseroSeleccionado : !mesaSeleccionada)}
                onClick={() => void revisarYConfirmarOperacion()}
                className="btn min-h-11 px-4"
              >
                Revisar y confirmar
              </button>
            )}
          </div>
        </Modal>
      )}
    </div>
  )
}

/** Fila de un ítem: los vigentes se pueden tocar, los anulados se muestran tachados. */
function FilaItem({ item, onEditar, editable = true }: { item: ItemResumen; onEditar: () => void; editable?: boolean }) {
  const anulado = item.anulado === true
  const importe = item.cantidad * item.precio_unitario

  if (anulado) {
    return (
      <li className="flex items-center justify-between gap-2 py-1.5">
        <span className="text-zinc-600 line-through">
          <span className="text-zinc-600">{item.cantidad}×</span> {item.nombre_producto}
        </span>
        <span className="chip chip-neutral shrink-0">Anulado</span>
      </li>
    )
  }

  return (
    <li className="flex items-center justify-between gap-2 py-1.5">
      <span className="min-w-0 text-zinc-300">
        <span className="text-zinc-500">{item.cantidad}×</span> {item.nombre_producto}
        {item.nota ? <span className="text-zinc-500"> · {item.nota}</span> : null}
      </span>
      <span className="flex shrink-0 items-center gap-1">
        <span className="text-zinc-400">{fmtPEN(importe)}</span>
        {editable ? (
          <button
            type="button"
            onClick={onEditar}
            aria-label={`Editar ${item.nombre_producto}`}
            className="grid h-9 w-9 touch-manipulation place-items-center rounded-lg text-zinc-500 transition hover:bg-surface-800 hover:text-brand-400"
          >
            <IconoLapiz />
          </button>
        ) : null}
      </span>
    </li>
  )
}

/** Modal de corrección de un ítem: cantidad, nota y anulación. */
function ModalEditarItem({
  edicion,
  onCerrar,
  onAnular,
  onGuardado,
}: {
  edicion: EnEdicion
  onCerrar: () => void
  onAnular: () => void
  onGuardado: (mensaje: string) => Promise<void>
}) {
  const { restaurante } = useCurrentContext()
  const [cantidad, setCantidad] = useState(edicion.item.cantidad)
  const [nota, setNota] = useState(edicion.item.nota ?? '')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sinCambios = cantidad === edicion.item.cantidad && nota.trim() === (edicion.item.nota ?? '').trim()

  async function guardar() {
    if (!restaurante) return
    setGuardando(true)
    setError(null)
    try {
      const { error: apiErr } = await getApi().editarItem(restaurante.id, edicion.pedidoId, edicion.item.id, {
        cantidad,
        nota: nota.trim() || null,
      })
      if (apiErr) {
        setError(apiErr)
        return
      }
      await onGuardado(`Se actualizó ${edicion.item.nombre_producto}.`)
    } catch {
      setError('No se pudo confirmar el cambio. Actualiza la comanda antes de volver a intentarlo.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Modal titulo={edicion.item.nombre_producto} onCerrar={onCerrar}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void guardar()
        }}
      >
        <p className="mb-4 text-sm text-zinc-500">
          {fmtPEN(edicion.item.precio_unitario)} c/u · cambia la cantidad o la nota de preparación.
        </p>

        <Campo etiqueta="Cantidad" htmlFor="edit-cantidad">
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label="Quitar uno"
              disabled={cantidad <= 1 || guardando}
              onClick={() => setCantidad((c) => Math.max(1, c - 1))}
              className="grid h-12 w-12 shrink-0 touch-manipulation place-items-center rounded-xl border border-surface-700 bg-surface-800 text-xl text-zinc-300 transition hover:border-brand-500 hover:text-brand-400 active:scale-95 disabled:opacity-40"
            >
              −
            </button>
            <input
              id="edit-cantidad"
              type="number"
              inputMode="numeric"
              min={1}
              max={CANTIDAD_MAXIMA}
              value={cantidad}
              onChange={(e) => {
                const n = Number(e.target.value)
                if (Number.isFinite(n)) setCantidad(Math.min(CANTIDAD_MAXIMA, Math.max(1, Math.trunc(n))))
              }}
              className="input h-12 flex-1 text-center text-lg font-bold tabular-nums"
            />
            <button
              type="button"
              aria-label="Agregar uno"
              disabled={cantidad >= CANTIDAD_MAXIMA || guardando}
              onClick={() => setCantidad((c) => Math.min(CANTIDAD_MAXIMA, c + 1))}
              className="grid h-12 w-12 shrink-0 touch-manipulation place-items-center rounded-xl border border-surface-700 bg-surface-800 text-xl text-zinc-300 transition hover:border-brand-500 hover:text-brand-400 active:scale-95 disabled:opacity-40"
            >
              +
            </button>
          </div>
        </Campo>

        <Campo etiqueta="Nota para cocina" htmlFor="edit-nota">
          <textarea
            id="edit-nota"
            rows={2}
            maxLength={NOTA_MAXIMA}
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Ej.: sin cebolla, término medio"
            className="input resize-none py-3"
          />
        </Campo>

        {error && (
          <div className="aviso mb-4 border-danger-500/40 bg-danger-500/10 text-danger-500">{error}</div>
        )}

        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={onAnular}
            className="btn btn-danger-ghost min-h-11 px-3"
          >
            Anular ítem
          </button>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={onCerrar} className="btn btn-outline min-h-11 px-4">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={guardando || sinCambios}
              className="btn btn-primary min-h-11 px-5"
            >
              {guardando ? 'Guardando…' : 'Guardar cambios'}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  )
}
