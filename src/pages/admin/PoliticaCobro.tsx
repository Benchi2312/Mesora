import { useCallback, useEffect, useRef, useState } from 'react'
import { getApi, type UsuarioResumen } from '../../lib/api'
import { validarPoliticaCobro, type PoliticaCobro as Politica } from '../../domain/cashier/permisosCobro'
import type { ModalidadCobro } from '../../types/database'
import { Modal } from '../../components/ui'

const OPCIONES: { id: ModalidadCobro; nombre: string; ayuda: string }[] = [
  { id: 'solo_cajero', nombre: 'Solo caja', ayuda: 'Solo cobran los cajeros que selecciones.' },
  { id: 'cobro_por_mesero', nombre: 'Meseros', ayuda: 'Solo cobran los meseros que selecciones.' },
  { id: 'caja_central_meseros_autorizados', nombre: 'Mixto', ayuda: 'Cobran los cajeros y meseros que selecciones.' },
]

export default function PoliticaCobro({ restauranteId, onAplicada }: {
  restauranteId: string
  onAplicada: (modalidad: ModalidadCobro) => void
}) {
  const [politica, setPolitica] = useState<Politica | null>(null)
  const [personal, setPersonal] = useState<UsuarioResumen[]>([])
  const [modalidad, setModalidad] = useState<ModalidadCobro>('cobro_por_mesero')
  const [seleccionados, setSeleccionados] = useState<string[]>([])
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [confirmar, setConfirmar] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const personalRef = useRef<HTMLFieldSetElement>(null)

  const cargar = useCallback(async () => {
    setCargando(true)
    setError(null)
    const [config, gente] = await Promise.all([
      getApi().getPoliticaCobro(restauranteId), getApi().getPersonal(restauranteId),
    ])
    if (config.error || gente.error || !config.data) {
      setError(config.error ?? gente.error ?? 'No se pudieron cargar los permisos de cobro.')
      setCargando(false)
      return
    }
    setPolitica(config.data)
    setPersonal(gente.data ?? [])
    const modo = config.data.modalidad_aplicada ?? 'cobro_por_mesero'
    setModalidad(modo)
    // Antes de activar la política, todos los meseros activos conservan el
    // comportamiento heredado. El admin puede acotar la lista antes de aplicar.
    setSeleccionados(config.data.modalidad_aplicada
      ? config.data.usuarios_autorizados
      : (gente.data ?? []).filter((u) => u.rol === 'mesero' && u.activo !== false).map((u) => u.id))
    setCargando(false)
  }, [restauranteId])

  useEffect(() => { void cargar() }, [cargar])

  const elegibles = personal.filter((u) => u.activo !== false && (
    modalidad === 'solo_cajero' ? u.rol === 'cajero' :
      modalidad === 'cobro_por_mesero' ? u.rol === 'mesero' :
        u.rol === 'cajero' || u.rol === 'mesero'
  ))
  const validacion = validarPoliticaCobro(restauranteId, modalidad, seleccionados,
    personal.map((u) => ({ ...u, restaurante_id: restauranteId })))
  const seleccion = personal.filter((u) => seleccionados.includes(u.id))

  async function aplicar() {
    if (guardando || validacion) return
    setGuardando(true)
    setError(null)
    const resultado = await getApi().guardarPoliticaCobro(restauranteId, modalidad, seleccionados)
    setGuardando(false)
    if (resultado.error || !resultado.data) {
      setError(resultado.error ?? 'No se pudo confirmar el cambio. Actualiza los permisos antes de volver a intentarlo.')
      return
    }
    setConfirmar(false)
    setPolitica(resultado.data)
    setSeleccionados(resultado.data.usuarios_autorizados)
    setAviso('Permisos de cobro aplicados. Rigen para los próximos cobros; los recibos anteriores no cambian.')
    onAplicada(resultado.data.modalidad_cobro)
  }

  return (
    <section className="card p-4 sm:p-6" aria-labelledby="modalidad-cobro-titulo">
      <h2 id="modalidad-cobro-titulo" className="text-lg font-extrabold text-zinc-100">¿Quién puede cobrar?</h2>
      <p className="mt-1 text-sm leading-relaxed text-zinc-400">Define quién puede cerrar la cuenta y entregar el recibo interno de Mesora. No es un comprobante electrónico SUNAT.</p>
      {cargando && <p className="mt-4 text-sm text-zinc-300" role="status">Cargando permisos de cobro…</p>}
      {error && <p className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300" role="alert">{error} {!politica && <button type="button" className="underline" onClick={() => void cargar()}>Reintentar carga</button>}</p>}
      {aviso && <p className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300" role="status">{aviso}</p>}
      {politica && (
        <>
          <p className={`mt-4 rounded-lg border p-3 text-sm ${politica.modalidad_aplicada ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200' : 'border-amber-500/30 bg-amber-500/10 text-amber-200'}`} role="status">
            {politica.modalidad_aplicada
              ? `Regla activa: ${OPCIONES.find((o) => o.id === politica.modalidad_aplicada)?.nombre} · ${politica.usuarios_autorizados.length} persona(s) autorizada(s)${politica.actualizado_at ? ` · Actualizada el ${new Date(politica.actualizado_at).toLocaleString('es-PE')}` : ''}. El administrador conserva el cobro de contingencia auditado.`
              : 'Regla aún no activada: se conserva el cobro anterior por meseros activos y administrador. Para cambiarla, selecciona una modalidad y confirma quiénes pueden cobrar.'}
          </p>
          <fieldset className="mt-5">
            <legend className="text-sm font-bold text-zinc-200">¿Quién cobrará?</legend>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              {OPCIONES.map((opcion) => (
                <label key={opcion.id} className={`flex min-w-0 cursor-pointer gap-3 rounded-xl border p-3 ${modalidad === opcion.id ? 'border-brand-500 bg-brand-500/10' : 'border-surface-700'}`}>
                  <input type="radio" name="modalidad-cobro" value={opcion.id} checked={modalidad === opcion.id} disabled={guardando} onChange={() => {
                    setModalidad(opcion.id)
                    setSeleccionados((actual) => actual.filter((id) => personal.some((u) => u.id === id && u.activo !== false && (
                      opcion.id === 'solo_cajero' ? u.rol === 'cajero' : opcion.id === 'cobro_por_mesero' ? u.rol === 'mesero' : u.rol === 'mesero' || u.rol === 'cajero'
                    ))))
                    setAviso(null)
                  }} className="mt-1 h-6 w-6 shrink-0 accent-amber-500" />
                  <span className="min-w-0"><strong className="block text-sm text-zinc-100">{opcion.nombre}</strong><span className="mt-1 block text-xs leading-relaxed text-zinc-400">{opcion.ayuda}</span></span>
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset ref={personalRef} tabIndex={-1} className={`mt-5 rounded-xl outline-none focus:ring-2 focus:ring-amber-500 ${validacion ? 'ring-1 ring-amber-500/40 p-3' : ''}`}>
            <legend className="text-sm font-bold text-zinc-200">Personal autorizado</legend>
            <p className="mt-1 text-xs text-zinc-400">Selecciona personas activas del rol elegido. Cocina, administradores y personal inactivo no pueden incluirse; el administrador conserva su contingencia auditada.</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {elegibles.map((u) => (
                <label key={u.id} className="flex min-w-0 items-center gap-3 rounded-lg border border-surface-700 p-3 text-sm text-zinc-200">
                  <input type="checkbox" checked={seleccionados.includes(u.id)} disabled={guardando} onChange={(e) => {
                    setSeleccionados((actual) => e.target.checked ? [...actual, u.id] : actual.filter((id) => id !== u.id))
                    setAviso(null)
                  }} className="h-6 w-6 shrink-0 accent-amber-500" />
                  <span className="min-w-0 break-words">{u.nombre} <span className="text-xs text-zinc-400">· {u.rol === 'cajero' ? 'Cajero' : 'Mesero'}</span></span>
                </label>
              ))}
            </div>
            {elegibles.length === 0 && <p className="mt-3 text-sm text-amber-300">Primero crea o activa personal para esta modalidad.</p>}
          </fieldset>
          {validacion && <p className="mt-4 text-sm text-amber-300" role="status">{validacion} {modalidad === 'caja_central_meseros_autorizados' && 'Marca por lo menos un cajero y un mesero en «Personal autorizado».'}</p>}
          <p className="mt-4 text-xs leading-relaxed text-zinc-400">El administrador puede cobrar por contingencia y cada uso queda en auditoría. Los cambios aplican a cobros futuros; cuentas y recibos anteriores conservan sus datos.</p>
          <div className="mt-4 flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
            <button type="button" disabled={guardando || Boolean(validacion)} aria-describedby={validacion ? 'ayuda-activacion-cobro' : undefined} onClick={() => { setError(null); setConfirmar(true) }} className="btn-primary min-h-11 w-full disabled:cursor-not-allowed disabled:opacity-45 sm:w-auto">{politica.modalidad_aplicada ? 'Guardar cambios de permisos' : 'Revisar y activar modalidad'}</button>
            {validacion && <button type="button" onClick={() => personalRef.current?.focus()} className="btn-secondary min-h-11 sm:w-auto">Ir al personal pendiente</button>}
          </div>
          {validacion && <p id="ayuda-activacion-cobro" className="mt-2 text-xs text-amber-200">Completa la selección indicada arriba para habilitar la revisión.</p>}
        </>
      )}
      {confirmar && (
        <Modal titulo="Confirmar permisos de cobro" onCerrar={() => { if (!guardando) setConfirmar(false) }}>
          <div className="space-y-3 text-sm text-zinc-300">
            <p><strong>Acción:</strong> activar {OPCIONES.find((o) => o.id === modalidad)?.nombre} para los próximos cobros.</p>
            <p><strong>Personas autorizadas:</strong> {seleccion.map((u) => u.nombre).join(', ')}.</p>
            <p>Se aplicará a cobros futuros; los recibos y pagos anteriores no cambian. Mesora genera recibos internos, no boletas electrónicas SUNAT.</p>
            <p>El administrador conservará el cobro de contingencia auditado. Cocina y usuarios inactivos no podrán cobrar.</p>
            <p>El cambio y sus autorizaciones quedarán registrados en auditoría.</p>
          </div>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button type="button" disabled={guardando} onClick={() => setConfirmar(false)} className="btn-secondary min-h-11">Cancelar</button>
            <button type="button" disabled={guardando || Boolean(validacion)} onClick={() => void aplicar()} className="btn-primary min-h-11">{guardando ? 'Guardando…' : politica.modalidad_aplicada ? 'Confirmar cambios' : 'Activar modalidad de cobro'}</button>
          </div>
        </Modal>
      )}
    </section>
  )
}
