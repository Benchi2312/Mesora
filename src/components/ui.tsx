import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import type { ResumenConfirmacion } from '../domain/security/confirmaciones'

type IconoProps = { className?: string }

export function IconoLapiz({ className = 'h-4 w-4' }: IconoProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 20l4-1L19.5 7.5a2.1 2.1 0 0 0-3-3L5 15z" />
      <path d="M14.5 6.5l3 3" />
    </svg>
  )
}

export function IconoBasura({ className = 'h-4 w-4' }: IconoProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
      <path d="M10 11v5M14 11v5" />
    </svg>
  )
}

export function IconoMas({ className = 'h-4 w-4' }: IconoProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

/** Llave: restablecer la contraseña de un miembro del personal. */
export function IconoLlave({ className = 'h-4 w-4' }: IconoProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="8" cy="12" r="4" />
      <path d="M12 12h8" />
      <path d="M17 12v3" />
      <path d="M20 12v2" />
    </svg>
  )
}

export function IconoInfo({ className = 'h-4 w-4' }: IconoProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v4M12 16h.01" />
    </svg>
  )
}

/** Modal base reutilizable, respetando el sistema de diseño de la app. */
export function Modal({
  titulo,
  onCerrar,
  children,
  ancho = 'max-w-md',
}: {
  titulo: string
  onCerrar: () => void
  children: ReactNode
  ancho?: string
}) {
  const panel = useRef<HTMLDivElement>(null)

  // Escape cierra el modal: sin esto, en un móvil o con un teclado el usuario
  // se queda atrapado dentro del diálogo.
  useEffect(() => {
    function alPulsar(e: KeyboardEvent) {
      if (e.key === 'Escape') onCerrar()
    }
    document.addEventListener('keydown', alPulsar)
    return () => document.removeEventListener('keydown', alPulsar)
  }, [onCerrar])

  // El foco entra al modal al abrirlo (si algo dentro es focusable), para que
  // el lector de pantalla anuncie el diálogo y no se quede en la página de atrás.
  // Al cerrar se devuelve el foco a donde estaba (el botón que abrió el modal).
  useEffect(() => {
    const anterior = document.activeElement as HTMLElement | null
    const primero = panel.current?.querySelector<HTMLElement>(
      'input, select, textarea, button:not([aria-label="Cerrar"])',
    )
    primero?.focus()
    return () => {
      // `isConnected` evita robar el foco a un elemento que ya salió del DOM
      // (por ejemplo, la fila que se acaba de eliminar).
      if (anterior?.isConnected) anterior.focus()
    }
  }, [])

  // Focus trap: con el modal abierto, Tab y Shift+Tab circulan SOLO entre sus
  // controles. Sin esto, el foco se escapa a la página de atrás y el usuario de
  // teclado/lector de pantalla opera controles que no ve.
  useEffect(() => {
    const contenedor = panel.current
    if (!contenedor) return
    const SELECTOR_FOCUS =
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    function alTabulador(e: KeyboardEvent) {
      if (e.key !== 'Tab') return
      const focusables = Array.from(contenedor!.querySelectorAll<HTMLElement>(SELECTOR_FOCUS))
      if (focusables.length === 0) return
      const primero = focusables[0]
      const ultimo = focusables[focusables.length - 1]
      const activo = document.activeElement
      if (e.shiftKey) {
        if (activo === primero || !contenedor!.contains(activo)) {
          e.preventDefault()
          ultimo.focus()
        }
      } else if (activo === ultimo || !contenedor!.contains(activo)) {
        e.preventDefault()
        primero.focus()
      }
    }
    document.addEventListener('keydown', alTabulador)
    return () => document.removeEventListener('keydown', alTabulador)
  }, [])

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 px-4 pb-4 pt-10 backdrop-blur-sm sm:items-center sm:py-8"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCerrar()
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        className={`card max-h-[90vh] w-full ${ancho} overflow-y-auto p-5 shadow-2xl shadow-black/60 sm:p-6`}
      >
        <div className="mb-5 flex items-center justify-between gap-3">
          <h3 className="text-lg font-extrabold tracking-tight text-zinc-100">{titulo}</h3>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="grid h-11 w-11 shrink-0 touch-manipulation place-items-center rounded-lg text-zinc-400 transition hover:bg-surface-800 hover:text-white"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

/** Diálogo de confirmación para acciones destructivas (no usa window.confirm). */
export function ConfirmDialog({
  titulo,
  mensaje,
  confirmLabel = 'Eliminar',
  cargandoLabel = 'Eliminando…',
  error,
  onConfirmar,
  onCancelar,
  cargando = false,
  extra,
  disabled = false,
}: {
  titulo: string
  mensaje: ReactNode
  confirmLabel?: string
  /** Texto del botón mientras corre la acción ("Guardando…", "Anulando…"). */
  cargandoLabel?: string
  error?: string | null
  onConfirmar: () => void
  onCancelar: () => void
  cargando?: boolean
  /** Contenido entre el mensaje y los botones (un campo de PIN, por ejemplo). */
  extra?: ReactNode
  /** Deshabilita el botón de confirmar sin cerrar el diálogo. */
  disabled?: boolean
}) {
  return (
    <Modal titulo={titulo} onCerrar={onCancelar} ancho="max-w-sm">
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 touch-manipulation place-items-center rounded-xl border border-danger-500/40 bg-danger-500/10 text-danger-500">
          <IconoBasura className="h-5 w-5" />
        </span>
        <p className="pt-1.5 text-sm leading-relaxed text-zinc-300">{mensaje}</p>
      </div>

      {extra}

      {error && (
        <div className="aviso mt-4 border-danger-500/40 bg-danger-500/10 text-danger-500">
          {error}
        </div>
      )}

      <div className="mt-6 flex flex-wrap justify-end gap-2">
        <button type="button" onClick={onCancelar} className="btn btn-outline min-h-11 px-4">
          Cancelar
        </button>
        <button
          type="button"
          onClick={onConfirmar}
          disabled={cargando || disabled}
          className="btn min-h-11 bg-danger-500 px-4 text-white transition-colors hover:bg-danger-500/90"
        >
          {cargando ? cargandoLabel : confirmLabel}
        </button>
      </div>
    </Modal>
  )
}

/** Resumen obligatorio para confirmar una operación sensible antes de enviarla. */
export function ResumenConfirmacionAccion({ resumen, pinVerificando = false }: { resumen: ResumenConfirmacion; pinVerificando?: boolean }) {
  const filas = [
    ['Acción', resumen.accion],
    ['Datos afectados', resumen.datosAfectados],
    ['PIN del gerente', pinVerificando ? 'Comprobando la configuración de seguridad de este restaurante…' : resumen.pinGerente],
    ['Auditoría', resumen.auditoria],
  ] as const

  return (
    <dl data-testid="resumen-confirmacion" className="mt-4 divide-y divide-surface-700 rounded-xl border border-surface-700 bg-surface-900/80 px-3">
      {filas.map(([titulo, detalle]) => (
        <div key={titulo} className="py-2.5">
          <dt className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">{titulo}</dt>
          <dd className="mt-0.5 text-sm leading-relaxed text-zinc-200">{detalle}</dd>
        </div>
      ))}
    </dl>
  )
}

/** Campo de formulario con etiqueta y mensaje de error. */
export function Campo({
  etiqueta,
  htmlFor,
  error,
  children,
}: {
  etiqueta?: string
  htmlFor?: string
  error?: string | null
  children: ReactNode
}) {
  return (
    <div className="mb-4">
      {etiqueta && (
        <label className="label" htmlFor={htmlFor}>
          {etiqueta}
        </label>
      )}
      {children}
      {error && <p className="mt-1 text-xs text-danger-500">{error}</p>}
    </div>
  )
}

/** Pie de acciones de un formulario de modal. */
export function PieAcciones({
  onCancelar,
  enviando,
  textoEnvio,
  labelGuardar,
  guia,
  disabledGuardar,
  pulso,
}: {
  onCancelar: () => void
  enviando: boolean
  textoEnvio: string
  labelGuardar: string
  /** Marca el botón para el resaltado del recorrido guiado del demo. */
  guia?: string
  disabledGuardar?: boolean
  /**
   * El botón late y brilla: avisa al usuario de que ya puede pulsarlo. Lo usa
   * el autocompletado del demo al terminar de rellenar el formulario.
   */
  pulso?: boolean
}) {
  return (
    <div className="mt-6 flex flex-wrap justify-end gap-2">
      <button type="button" onClick={onCancelar} className="btn btn-outline min-h-11 px-4">
        Cancelar
      </button>
      <button
        type="submit"
        disabled={enviando || disabledGuardar}
        data-guia={guia}
        className={`btn btn-primary min-h-11 px-5 ${
          pulso ? 'animate-pulse ring-2 ring-brand-500/70' : ''
        }`}
      >
        {enviando ? textoEnvio : labelGuardar}
      </button>
    </div>
  )
}
