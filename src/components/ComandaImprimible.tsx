import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Modal } from './ui'
import { fmtFecha } from '../lib/format'
import { esFalloDeRed, type PedidoConItems, type ResultadoRegistroImpresion } from '../lib/api'
import { itemsDeEstacion, MENSAJE_IMPRESION_NO_CONFIRMADA, NOMBRES_ESTACION_COMANDA, validarMotivoReimpresion, type AnchoPapelComanda, type EstacionComanda } from '../domain/restaurant/impresionComandas'

type Props = {
  pedido: PedidoConItems
  restauranteNombre: string
  mesaNombre: string
  meseroNombre: string
  estacion: EstacionComanda
  impresorasConfiguradas?: { nombre: string; papel_mm: 58 | 80 | null; copias: number }[]
  onCerrar: () => void
  registrarImpresion: (solicitudId: string, motivo: string | null) => Promise<{
    data: ResultadoRegistroImpresion | null
    error: string | null
  }>
}

/** Vista térmica y confirmación de impresión; nunca modifica el pedido. */
export default function ComandaImprimible({
  pedido,
  restauranteNombre,
  mesaNombre,
  meseroNombre,
  estacion,
  impresorasConfiguradas = [],
  onCerrar,
  registrarImpresion,
}: Props) {
  const [ancho, setAncho] = useState<AnchoPapelComanda>(impresorasConfiguradas[0]?.papel_mm ?? 80)
  const [impresoraSeleccionada, setImpresoraSeleccionada] = useState(impresorasConfiguradas[0]?.nombre ?? '')
  const [estado, setEstado] = useState<'preparando' | 'enviado' | 'impreso' | 'reimpresion'>('preparando')
  const [accion, setAccion] = useState<'comanda_imprimir' | 'comanda_reimprimir' | null>(null)
  const [motivo, setMotivo] = useState('')
  const [requiereMotivo, setRequiereMotivo] = useState(false)
  const [confirmarSalida, setConfirmarSalida] = useState(false)
  const [printListo, setPrintListo] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [mensaje, setMensaje] = useState('')
  const [error, setError] = useState('')
  const [errorRed, setErrorRed] = useState(false)
  const solicitudId = useRef(globalThis.crypto.randomUUID())
  const registrando = useRef(false)
  const abriendoImpresion = useRef(false)

  useEffect(() => {
    const limpiarModoImpresion = () => document.body.classList.remove('imprimir-comanda')
    window.addEventListener('afterprint', limpiarModoImpresion)
    return () => {
      window.removeEventListener('afterprint', limpiarModoImpresion)
      limpiarModoImpresion()
    }
  }, [])

  const items = itemsDeEstacion(pedido.items, estacion)
  const impresoraActiva = impresorasConfiguradas.find((impresora) => impresora.nombre === impresoraSeleccionada) ?? impresorasConfiguradas[0]
  const fecha = new Date(pedido.created_at)
  const fechaLegible = Number.isNaN(fecha.getTime()) ? fmtFecha(pedido.created_at) : fecha.toLocaleDateString('es-PE')
  const horaLegible = Number.isNaN(fecha.getTime()) ? '' : fecha.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })

  async function registrarSolicitudImpresion() {
    if (registrando.current || abriendoImpresion.current || printListo) return
    registrando.current = true
    setEnviando(true)
    setEstado('preparando')
    setError('')
    setErrorRed(false)
    setMensaje('Preparando la comanda y registrando la solicitud…')
    try {
      const respuesta = await registrarImpresion(solicitudId.current, requiereMotivo ? motivo.trim() : null)
      if (respuesta.error) {
        setError(respuesta.error)
        setErrorRed(esFalloDeRed(respuesta.error))
        setMensaje('')
        return
      }
      if (respuesta.data?.estado === 'requiere_motivo') {
        setRequiereMotivo(true)
        setError('')
        setMensaje('Esta comanda ya se imprimió. Escribe el motivo para registrar la reimpresión.')
        return
      }
      if (!respuesta.data || respuesta.data.estado !== 'registrada') {
        setError('No se pudo confirmar el registro de impresión. Puedes reintentar con seguridad.')
        setErrorRed(true)
        setMensaje('')
        return
      }

      setAccion(respuesta.data.accion)
      setEstado(respuesta.data.accion === 'comanda_reimprimir' ? 'reimpresion' : 'preparando')
      setRequiereMotivo(false)
      setPrintListo(true)
      setMensaje(respuesta.data.accion === 'comanda_reimprimir' ? 'Reimpresión registrada en auditoría. Abre el diálogo de impresión cuando estés listo.' : 'Comanda registrada. Abre el diálogo de impresión cuando estés listo.')
    } catch (causa) {
      const texto = causa instanceof Error ? causa.message : 'No se pudo contactar con el servicio de impresión.'
      setError(texto)
      setErrorRed(esFalloDeRed(texto))
      setMensaje('')
    } finally {
      registrando.current = false
      setEnviando(false)
    }
  }

  function imprimirAhora() {
    if (!printListo || abriendoImpresion.current) return
    abriendoImpresion.current = true
    setPrintListo(false)
    setEstado(accion === 'comanda_reimprimir' ? 'reimpresion' : 'enviado')
    setMensaje('Enviado al diálogo de impresión del navegador.')
    document.body.classList.add('imprimir-comanda')
    try {
      window.print()
      setConfirmarSalida(true)
    } catch {
      document.body.classList.remove('imprimir-comanda')
      abriendoImpresion.current = false
      solicitudId.current = globalThis.crypto.randomUUID()
      setMotivo('')
      setRequiereMotivo(true)
      setMensaje(MENSAJE_IMPRESION_NO_CONFIRMADA)
      setConfirmarSalida(false)
    }
  }

  function confirmarImpresion(salio: boolean) {
    setConfirmarSalida(false)
    abriendoImpresion.current = false
    if (salio) {
      setEstado(accion === 'comanda_reimprimir' ? 'reimpresion' : 'impreso')
      setMensaje(accion === 'comanda_reimprimir' ? 'Reimpresión confirmada por el usuario.' : 'Impresión confirmada por el usuario.')
      setError('')
      return
    }
    setMensaje(MENSAJE_IMPRESION_NO_CONFIRMADA)
    setError('')
    solicitudId.current = globalThis.crypto.randomUUID()
    setMotivo('')
    setRequiereMotivo(true)
    setPrintListo(false)
  }

  const motivoValido = validarMotivoReimpresion(motivo)
  const estadoTexto = estado === 'preparando'
    ? 'Preparando'
    : estado === 'enviado'
      ? 'Enviado a impresión'
      : estado === 'impreso'
        ? 'Impreso (confirmado por usuario)'
        : 'Reimpresión'

  return createPortal(
    <div className="comanda-portal-root">
      <Modal titulo={`Comanda · ${NOMBRES_ESTACION_COMANDA[estacion]}`} onCerrar={onCerrar} ancho="max-w-md">
      <div className="comanda-panel">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
          <label className="flex items-center gap-2 text-sm text-zinc-300">
            Papel
            <select
              aria-label="Ancho de papel térmico"
              className="input h-11 w-28"
              value={ancho}
              onChange={(e) => setAncho(Number(e.target.value) as AnchoPapelComanda)}
            >
              <option value={58}>58 mm</option>
              <option value={80}>80 mm</option>
            </select>
          </label>
          {impresorasConfiguradas.length > 1 ? (
            <label className="flex items-center gap-2 text-sm text-zinc-300">
              Impresora configurada
              <select
                aria-label="Impresora configurada"
                className="input h-11 min-w-36"
                value={impresoraActiva?.nombre ?? ''}
                onChange={(e) => {
                  const elegida = impresorasConfiguradas.find((impresora) => impresora.nombre === e.target.value)
                  setImpresoraSeleccionada(e.target.value)
                  if (elegida?.papel_mm) setAncho(elegida.papel_mm)
                }}
              >
                {impresorasConfiguradas.map((impresora) => <option key={impresora.nombre} value={impresora.nombre}>{impresora.nombre}</option>)}
              </select>
            </label>
          ) : impresoraActiva ? (
            <span className="text-xs text-zinc-400">Impresora configurada: {impresoraActiva.nombre}</span>
          ) : null}
          <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${estado === 'impreso' || estado === 'reimpresion' ? 'border-ok-500/40 bg-ok-500/10 text-ok-400' : 'border-brand-500/40 bg-brand-500/10 text-brand-400'}`} role="status" aria-live="polite">
            {estadoTexto}
          </span>
        </div>
        {impresoraActiva && <p className="mb-3 text-xs text-zinc-500 print:hidden">Papel sugerido: {impresoraActiva.papel_mm ?? ancho} mm · {impresoraActiva.copias} {impresoraActiva.copias === 1 ? 'copia configurada' : 'copias configuradas'}. Confirma impresora y cantidad en el diálogo del navegador.</p>}

        <article className="comanda-print mx-auto" data-paper-width={ancho} data-comanda-id={pedido.id} aria-label="Vista imprimible de la comanda">
          <header className="comanda-cabecera">
            <strong className="comanda-restaurante">{restauranteNombre || 'Restaurante'}</strong>
            <div className="comanda-estacion">COMANDA · {NOMBRES_ESTACION_COMANDA[estacion].toUpperCase()}</div>
            <div className="comanda-numero">N.º {pedido.id.slice(0, 8).toUpperCase()}</div>
          </header>
          <section className="comanda-metadatos">
            <div><span>Mesa</span><strong>{mesaNombre}</strong></div>
            <div><span>Mesero</span><strong>{meseroNombre || 'No asignado'}</strong></div>
            <div><span>Fecha</span><strong>{fechaLegible}</strong></div>
            <div><span>Hora</span><strong>{horaLegible || '—'}</strong></div>
          </section>
          <ul className="comanda-items">
            {items.map((item) => (
              <li key={item.id}>
                <div className="comanda-item-linea">
                  <strong>{item.cantidad} ×</strong>
                  <span>{item.nombre_producto}</span>
                </div>
                {item.nota && <p className="comanda-observacion">Nota: {item.nota}</p>}
              </li>
            ))}
          </ul>
          <footer className="comanda-pie">Comanda interna · {pedido.id.slice(0, 8).toUpperCase()}</footer>
        </article>

        {requiereMotivo && (
          <label className="mt-4 block text-sm font-medium text-zinc-200 print:hidden" htmlFor="motivo-reimpresion">
            Motivo de reimpresión
            <textarea
              id="motivo-reimpresion"
              className="input mt-2 min-h-20 resize-y"
              maxLength={300}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ej. El papel se atascó"
            />
            <span className="mt-1 block text-xs text-zinc-500">Escribe entre 5 y 300 caracteres. Quedará guardado en auditoría.</span>
          </label>
        )}

        {mensaje && <p className={`mt-4 text-sm ${mensaje === MENSAJE_IMPRESION_NO_CONFIRMADA ? 'rounded-lg border border-warn-500/30 bg-warn-500/10 p-3 text-warn-300' : 'text-zinc-300'} print:hidden`} role="status" aria-live="polite">{mensaje}</p>}
        {error && <div className="aviso mt-4 border-danger-500/40 bg-danger-500/10 text-danger-400 print:hidden" role="alert">
          <div>
            <p>{error}</p>
            {errorRed && <p className="mt-1 text-xs">La solicitud pudo llegar al servidor. Puedes reintentar con seguridad: este mismo identificador evita duplicar la auditoría y no crea otra comanda.</p>}
          </div>
        </div>}

        {confirmarSalida ? (
          <div className="mt-4 rounded-xl border border-surface-700 p-3 print:hidden">
            <p className="text-sm font-semibold text-zinc-200">¿La comanda salió impresa?</p>
            <p className="mt-1 text-xs text-zinc-500">El navegador no puede verificar si hay papel en la impresora. Confírmalo según lo que viste.</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" className="btn btn-primary min-h-11" onClick={() => confirmarImpresion(true)}>Sí, salió</button>
              <button type="button" className="btn btn-outline min-h-11" onClick={() => confirmarImpresion(false)}>No se imprimió</button>
            </div>
          </div>
        ) : (
          <div className="mt-4 flex flex-wrap justify-end gap-2 print:hidden">
            <button type="button" className="btn btn-outline min-h-11" onClick={onCerrar}>Cerrar</button>
            <button
              type="button"
              className="btn btn-primary min-h-11"
              disabled={enviando || (requiereMotivo && !motivoValido)}
              onClick={() => printListo ? imprimirAhora() : void registrarSolicitudImpresion()}
            >
              {enviando ? 'Preparando…' : printListo ? 'Abrir diálogo de impresión' : errorRed ? 'Reintentar de forma segura' : requiereMotivo ? 'Registrar reimpresión' : 'Registrar impresión'}
            </button>
          </div>
        )}
      </div>
      </Modal>
    </div>,
    document.body,
  )
}
