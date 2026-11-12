import { useCallback, useEffect, useState } from 'react'
import { useCurrentContext } from '../../lib/useCurrentContext'
import { esModoLocal, getApi } from '../../lib/api'
import type { DatosPersonal } from '../../lib/api'
import { PASSWORD_DE_PRUEBA } from '../../lib/localSeed'
import { construirEmail, esUsuarioValido, separarEmail } from '../../domain/security/dominio'
import { rolLabel } from '../../domain/security/roles'
import { filtrarPersonal, type RolPersonal } from '../../domain/security/personal'
import { Spinner } from '../../components/LoadingScreen'
import EstadoVacio from '../../components/EstadoVacio'
import { Campo, IconoInfo, IconoLapiz, IconoLlave, IconoMas, Modal, PieAcciones } from '../../components/ui'

type ModalPersonal = {
  accion: 'crear' | 'editar'
  id?: string
  nombre: string
  email: string
  password: string
  rol: RolPersonal
} | null
type Confirmar = { id: string; nombre: string; activoAnterior: boolean; activoNuevo: boolean } | null
type PersonalCreado = { nombre: string; email: string | null; rol: RolPersonal } | null
/** A quién se le va a restablecer la contraseña (misma forma que `Confirmar`). */
type Resetear = { id: string; nombre: string } | null

const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const OPCIONES_ROL: { rol: RolPersonal; descripcion: string }[] = [
  { rol: 'mesero', descripcion: 'Atiende el salón y toma comandas' },
  { rol: 'cocina', descripcion: 'Cocina y barra, preparan los pedidos' },
  { rol: 'admin_restaurante', descripcion: 'Gestiona el local: menú, personal y caja' },
  { rol: 'cajero', descripcion: 'Solo apertura, arqueo y cierre de caja' },
]

/** Vista a la que entra cada rol tras iniciar sesión. */
const VISTA_POR_ROL: Record<RolPersonal, string> = {
  mesero: '/mesero (vista de mesero)',
  cocina: '/cocina (vista de cocina)',
  admin_restaurante: '/admin (panel del restaurante)',
  cajero: '/cajero (vista de caja)',
}

export default function PersonalTab() {
  const { restaurante, usuario } = useCurrentContext()
  const rid = restaurante?.id
  const yoId = usuario?.id ?? null
  const planId = restaurante?.plan_id
  const dominio = restaurante?.dominio ?? null
  const [limiteAdmins, setLimiteAdmins] = useState<number>(3)

  useEffect(() => {
    let activo = true
    async function cargarPlan() {
      const api = getApi()
      const { data } = await api.getPlanes()
      if (activo && data) {
        const p = data.find((pl) => pl.id === planId) ?? data.find((pl) => pl.activo) ?? data[0]
        setLimiteAdmins(p?.max_administradores ?? 3)
      }
    }
    void cargarPlan().catch(() => {})
    return () => {
      activo = false
    }
  }, [planId])

  const [personal, setPersonal] = useState<
    { id: string; nombre: string; email: string | null; activo: boolean; rol: RolPersonal }[]
  >([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [filtroRol, setFiltroRol] = useState<'todos' | RolPersonal>('todos')
  const [filtroEstado, setFiltroEstado] = useState<'todos' | 'activos' | 'inactivos'>('activos')

  const [modal, setModal] = useState<ModalPersonal>(null)
  const [modalError, setModalError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const [confirmar, setConfirmar] = useState<Confirmar>(null)
  const [confirmError, setConfirmError] = useState<string | null>(null)
  const [confirmCargando, setConfirmCargando] = useState(false)

  const [resetear, setResetear] = useState<Resetear>(null)
  const [resetError, setResetError] = useState<string | null>(null)
  const [resetCargando, setResetCargando] = useState(false)
  const [passwordTemporal, setPasswordTemporal] = useState('')
  const [passwordConfirmacion, setPasswordConfirmacion] = useState('')
  const [mensajePassword, setMensajePassword] = useState<string | null>(null)
  const [motivoEstado, setMotivoEstado] = useState('')

  const [personalCreado, setPersonalCreado] = useState<PersonalCreado>(null)

  const cargar = useCallback(async () => {
    if (!rid) return
    try {
      const api = getApi()
      const { data, error: apiErr } = await api.getPersonal(rid)
      if (apiErr) {
        setError(apiErr)
        return
      }
      setPersonal(
        (data ?? []).map((u) => ({
          id: u.id,
          nombre: u.nombre,
          email: u.email ?? null,
          activo: u.activo !== false,
          rol: u.rol === 'cocina' ? 'cocina' : u.rol === 'admin_restaurante' ? 'admin_restaurante' : u.rol === 'cajero' ? 'cajero' : 'mesero',
        })),
      )
      setError(null)
    } catch {
      setError('No se pudo cargar el personal. Revisa tu conexión e inténtalo de nuevo.')
    }
  }, [rid])

  const adminsActivos = personal.filter((m) => m.rol === 'admin_restaurante' && m.activo).length
  const personasActivas = personal.filter((m) => m.activo).length
  const personasInactivas = personal.length - personasActivas
  const puedeCrearAdmin = adminsActivos < (limiteAdmins >= 0 ? limiteAdmins : 999)
  const personalFiltrado = filtrarPersonal(personal, { busqueda, rol: filtroRol, estado: filtroEstado })

  useEffect(() => {
    if (!rid) {
      setCargando(false)
      return
    }
    setCargando(true)
    void cargar().finally(() => setCargando(false))
  }, [rid, cargar])

  if (cargando)
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    )

  if (error)
    return (
      <div className="aviso border-danger-500/40 bg-danger-500/10 text-danger-500">
        {error}
      </div>
    )

  async function guardar() {
    if (!rid || !modal) return
    const nombre = modal.nombre.trim()
    if (!nombre) {
      setModalError('El nombre es obligatorio.')
      return
    }
    const email = modal.email.trim()
    if (dominio) {
      if (email !== '' && !esUsuarioValido(email)) {
        setModalError('Ingresa un usuario válido (letras, números, punto, guion o guion bajo).')
        return
      }
    } else if (email !== '' && !EMAIL_OK.test(email)) {
      setModalError('Ingresa un correo válido (ej. nombre@correo.com).')
      return
    }
    const emailFinal = dominio ? (email ? construirEmail(email, dominio) : null) : email || null
    // En modo real la persona entra con esta contraseña; en local usamos la de prueba.
    const password = esModoLocal() ? PASSWORD_DE_PRUEBA : modal.password
    if (modal.accion === 'crear' && !esModoLocal()) {
      if (password.length < 8) {
        setModalError('La contraseña inicial debe tener al menos 8 caracteres.')
        return
      }
    }
    setModalError(null)
    setEnviando(true)
    const api = getApi()
    try {
      if (modal.accion === 'crear') {
        const datos: DatosPersonal = { nombre, email: emailFinal, password, rol: modal.rol }
        const res = await api.crearPersonal(rid, datos)
        if (res.error) {
          setModalError(res.error)
          await cargar()
          return
        }
        setPersonalCreado({
          nombre: res.data?.nombre ?? nombre,
          email: res.data?.email ?? null,
          rol: modal.rol,
        })
      } else {
        const datos: DatosPersonal = { nombre, rol: modal.rol }
        const res = await api.actualizarPersonal(rid, modal.id as string, datos)
        if (res.error) {
          setModalError(res.error)
          return
        }
      }
      setModal(null)
      await cargar()
    } catch {
      setModalError('No se pudo confirmar la operación. Actualiza el listado antes de volver a intentarlo.')
      await cargar()
    } finally {
      setEnviando(false)
    }
  }

  async function ejecutarCambioEstado() {
    if (!rid || !confirmar) return
    if (confirmar.id === yoId) {
      setConfirmError('No puedes cambiar el estado de tu propio acceso.')
      return
    }
    setConfirmCargando(true)
    setConfirmError(null)
    try {
      const api = getApi()
      const res = await api.cambiarEstadoPersonal(confirmar.id, confirmar.activoNuevo, motivoEstado)
      if (res.error) {
        setConfirmError(res.error.includes('network') || res.error.includes('conexi')
          ? 'No se pudo confirmar el cambio por un problema de conexión. Actualiza la lista antes de volver a intentarlo.'
          : res.error)
        return
      }
      setConfirmar(null)
      setMotivoEstado('')
      await cargar()
    } catch {
      setConfirmError('No se pudo confirmar el cambio. Actualiza la lista antes de volver a intentarlo.')
      await cargar()
    } finally {
      setConfirmCargando(false)
    }
  }

  /** Toda baja o reactivación necesita confirmar el alcance antes de cambiar Auth. */
  async function alternarActivo(m: { id: string; nombre: string; activo: boolean }) {
    if (!rid || m.id === yoId) return
    setConfirmError(null)
    setMotivoEstado('')
    setConfirmar({ id: m.id, nombre: m.nombre, activoAnterior: m.activo, activoNuevo: !m.activo })
  }

  /**
   * Establece una clave temporal elegida por el admin. Solo se ve en un input
   * enmascarado, se limpia al enviar y se entrega al trabajador en persona.
   */
  async function ejecutarReset() {
    if (!resetear) return
    if (passwordTemporal.length < 10 || passwordTemporal.length > 128 || !passwordTemporal.trim()) {
      setResetError('La clave temporal debe tener entre 10 y 128 caracteres.')
      return
    }
    if (passwordTemporal !== passwordConfirmacion) {
      setResetError('Las claves no coinciden. Revísalas e inténtalo de nuevo.')
      return
    }
    setResetCargando(true)
    setResetError(null)
    try {
      const res = await getApi().resetPasswordPersonal(resetear.id, passwordTemporal)
      if (res.error) {
        setResetError(res.error)
        return
      }
      setResetear(null)
      setMensajePassword(`Se actualizó la clave de ${resetear.nombre}. Entrégale la clave temporal en persona; al ingresar tendrá que cambiarla.`)
      await cargar()
    } catch {
      setResetError('No se pudo confirmar el cambio. Revisa la conexión antes de volver a intentarlo.')
    } finally {
      setResetCargando(false)
      setPasswordTemporal('')
      setPasswordConfirmacion('')
    }
  }

  return (
    <div className="admin-managed-section admin-personal-section">
      <div className="aviso admin-personal-notice border-brand-500/30 bg-brand-500/10 text-brand-300">
        <span className="flex items-start gap-2.5">
          <IconoInfo className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Las personas que agregues aquí podrán iniciar sesión en la app. Desactiva a
            alguien para quitarle el acceso sin borrar su historial.
          </span>
        </span>
      </div>

      {mensajePassword && <div role="status" className="aviso mb-5 border-ok-500/40 bg-ok-500/10 text-ok-400">{mensajePassword}</div>}

      <div className="admin-module-heading">
        <div className="admin-module-copy">
          <span className="admin-section-kicker">Equipo y accesos</span>
          <h2>Personas del restaurante</h2>
          <p>
            Revisa roles y estado de acceso. Administradores activos: {adminsActivos} de {limiteAdmins >= 0 ? limiteAdmins : '∞'}.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setModalError(null)
            setModal({ accion: 'crear', nombre: '', email: '', password: '', rol: 'mesero' })
          }}
          className="btn btn-primary min-h-11 px-4 admin-module-primary"
        >
          <IconoMas />
          Agregar personal
        </button>
      </div>

      <div className="admin-summary-grid" aria-label="Resumen del equipo">
        <div className="admin-summary-item admin-summary-availability">
          <span>Accesos activos</span>
          <strong>{personasActivas}</strong>
          <small>Personas habilitadas</small>
        </div>
        <div className="admin-summary-item">
          <span>Accesos inactivos</span>
          <strong>{personasInactivas}</strong>
          <small>Historial conservado</small>
        </div>
        <div className="admin-summary-item">
          <span>Administradores activos</span>
          <strong>{adminsActivos}<small> / {limiteAdmins >= 0 ? limiteAdmins : '∞'}</small></strong>
          <small>Límite según el plan</small>
        </div>
      </div>

      {personal.length === 0 ? (
        <EstadoVacio
          titulo="Aún no tienes personal"
          descripcion="Agrega meseros y cocina para que puedan tomar comandas, preparar pedidos y gestionar mesas."
        />
      ) : (
        <>
        <div className="admin-person-filters">
          <label className="admin-person-search">Buscar por nombre, correo o rol
            <input type="search" className="input mt-1 min-h-11 w-full" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Ej. María o cocina" />
          </label>
          <label className="text-sm text-zinc-400">Rol
            <select className="input mt-1 min-h-11 w-full" value={filtroRol} onChange={(e) => setFiltroRol(e.target.value as typeof filtroRol)}>
              <option value="todos">Todos los roles</option>
              {OPCIONES_ROL.map((op) => <option key={op.rol} value={op.rol}>{rolLabel(op.rol)}</option>)}
            </select>
          </label>
          <label className="text-sm text-zinc-400">Estado de acceso
            <select className="input mt-1 min-h-11 w-full" value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value as typeof filtroEstado)}>
              <option value="todos">Activos e inactivos</option><option value="activos">Solo activos</option><option value="inactivos">Solo inactivos</option>
            </select>
          </label>
          {(busqueda || filtroRol !== 'todos' || filtroEstado !== 'activos') && <button type="button" className="btn btn-outline min-h-11 px-4 admin-filter-reset" onClick={() => { setBusqueda(''); setFiltroRol('todos'); setFiltroEstado('activos') }}>Limpiar filtros</button>}
        </div>
        {personalFiltrado.length === 0 ? <EstadoVacio titulo="Ninguna persona coincide con estos filtros." descripcion="Cambia la búsqueda o limpia los filtros para volver a ver el personal." /> : <ul className="admin-people-list">
          {personalFiltrado.map((m) => (
            <li key={m.id} className={`admin-person-row ${m.activo ? 'is-active' : 'is-inactive'}`}>
              <div className="admin-person-identity">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-500/15 text-sm font-bold text-brand-400">
                  {m.nombre
                    .split(/\s+/)
                    .filter(Boolean)
                    .slice(0, 2)
                    .map((x) => x[0]?.toUpperCase() ?? '')
                    .join('')}
                </span>
                <div className="admin-person-copy">
                  <p>{m.nombre}</p>
                  <p>{m.email ?? 'Sin correo'}</p>
                </div>
              </div>
              <div className="admin-person-actions">
                <span
                  className={`chip ${
                    m.rol === 'cocina'
                      ? 'chip-warn'
                      : m.rol === 'admin_restaurante'
                        ? 'chip-info'
                        : m.rol === 'cajero'
                          ? 'chip-neutral'
                          : 'chip-neutral'
                  }`}
                >
                  {rolLabel(m.rol)}
                </span>
                <button
                  type="button"
                  onClick={() => void alternarActivo(m)}
                  disabled={yoId === m.id}
                  aria-label={m.activo ? `Desactivar a ${m.nombre}` : `Reactivar a ${m.nombre}`}
                  title={yoId === m.id ? 'No puedes desactivar tu propio acceso' : undefined}
                  className={`chip min-h-9 touch-manipulation admin-person-status ${m.activo ? 'chip-ok' : 'chip-danger'} disabled:cursor-not-allowed disabled:opacity-60`}
                >
                  {m.activo ? 'Activo' : 'Inactivo'}
                </button>
                <button
                  type="button"
                  aria-label={`Editar ${m.nombre}`}
                  onClick={() => {
                    setModalError(null)
                    setModal({
                      accion: 'editar',
                      id: m.id,
                      nombre: m.nombre,
                      email: dominio ? separarEmail(m.email, dominio) : (m.email ?? ''),
                      password: '',
                      rol: m.rol,
                    })
                  }}
                  className="btn btn-ghost h-11 w-11 p-0"
                >
                  <IconoLapiz />
                </button>
                {/* El reset de contraseña es solo para el personal de sala:
                    ni otro administrador ni el propio Admin se resetean. */}
                {m.rol !== 'admin_restaurante' && m.id !== yoId && (
                  <button
                    type="button"
                    aria-label={`Restablecer contraseña de ${m.nombre}`}
                    title={`Restablecer contraseña de ${m.nombre}`}
                    onClick={() => {
                      setResetError(null)
                      setPasswordTemporal('')
                      setPasswordConfirmacion('')
                      setResetear({ id: m.id, nombre: m.nombre })
                    }}
                    className="btn btn-ghost h-11 w-11 p-0"
                  >
                    <IconoLlave />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>}
        </>
      )}

      {/* Modal crear/editar personal */}
      {modal && (
        <Modal
          titulo={modal.accion === 'crear' ? 'Agregar personal' : 'Editar personal'}
          onCerrar={() => setModal(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void guardar()
            }}
          >
            <Campo etiqueta="Rol" htmlFor="personal-rol">
              <div className="grid grid-cols-2 gap-2" id="personal-rol">
                {OPCIONES_ROL.map((op) => (
                  <button
                    key={op.rol}
                    type="button"
                    onClick={() => {
                      if (op.rol === 'admin_restaurante' && modal.accion === 'crear' && !puedeCrearAdmin) return
                      setModal({ ...modal, rol: op.rol })
                    }}
                    className={`min-h-12 touch-manipulation rounded-lg border px-3 py-2.5 text-left transition active:scale-[0.98] ${
                      modal.rol === op.rol
                        ? 'border-brand-500 bg-brand-500/15 text-brand-400'
                        : 'border-surface-700 bg-surface-800 text-zinc-300 hover:border-surface-500'
                    } ${op.rol === 'admin_restaurante' && modal.accion === 'crear' && !puedeCrearAdmin ? 'cursor-not-allowed opacity-60' : ''}`}
                  >
                    <span className="block text-sm font-semibold">{rolLabel(op.rol)}</span>
                    <span className="block text-xs text-zinc-500">{op.descripcion}</span>
                  </button>
                ))}
              </div>
              {modal.accion === 'crear' && !puedeCrearAdmin && (
                <p className="mt-2 text-xs text-warn-500">
                  Límite de administradores alcanzado ({adminsActivos}/{limiteAdmins}).
                </p>
              )}
            </Campo>
            <Campo etiqueta="Nombre" htmlFor="personal-nombre" error={null}>
              <input
                id="personal-nombre"
                autoFocus
                value={modal.nombre}
                onChange={(e) => setModal({ ...modal, nombre: e.target.value })}
                className="input"
                placeholder="Ej. Carlos Ramírez"
              />
            </Campo>
            {dominio ? (
              <Campo etiqueta="Usuario" htmlFor="personal-email" error={null}>
                <div className="flex items-stretch">
                  <input
                    id="personal-email"
                    autoComplete="off"
                    value={modal.email}
                    onChange={(e) => setModal({ ...modal, email: e.target.value })}
                    className="input rounded-r-none"
                    placeholder="carlos"
                    disabled={modal.accion === 'editar'}
                  />
                  <span className="grid place-items-center rounded-r-xl border border-l-0 border-surface-700 bg-surface-800 px-3 text-sm text-zinc-400">
                    @{dominio}
                  </span>
                </div>
              </Campo>
            ) : (
              <Campo etiqueta="Correo" htmlFor="personal-email" error={null}>
                <input
                  id="personal-email"
                  type="email"
                  inputMode="email"
                  value={modal.email}
                  onChange={(e) => setModal({ ...modal, email: e.target.value })}
                  className="input"
                  placeholder="nombre@correo.com"
                  disabled={modal.accion === 'editar'}
                />
              </Campo>
            )}
            {modal.accion === 'editar' && (
              <p className="text-xs text-zinc-500">El correo de acceso no se puede cambiar desde esta pantalla.</p>
            )}

            {modal.accion === 'crear' && !esModoLocal() && (
              <Campo etiqueta="Contraseña inicial" htmlFor="personal-password" error={null}>
                <input
                  id="personal-password"
                  type="text"
                  autoComplete="new-password"
                  value={modal.password}
                  onChange={(e) => setModal({ ...modal, password: e.target.value })}
                  className="input"
                  placeholder="Mínimo 8 caracteres"
                />
              </Campo>
            )}

            {modal.accion === 'crear' && (
              <p className="mb-4 flex items-start gap-2 text-xs leading-relaxed text-zinc-500">
                <IconoInfo className="mt-0.5 h-4 w-4 shrink-0" />
                {esModoLocal()
                  ? 'En este entorno de pruebas la persona puede entrar con la contraseña de prueba.'
                  : 'Se crea su cuenta de acceso con esta contraseña inicial. Compártela con la persona; podrá cambiarla luego.'}
              </p>
            )}

            {modalError && (
              <div className="aviso mb-4 border-danger-500/40 bg-danger-500/10 text-danger-500">
                {modalError}
              </div>
            )}

            <PieAcciones
              onCancelar={() => setModal(null)}
              enviando={enviando}
              textoEnvio="Guardando…"
              labelGuardar={modal.accion === 'crear' ? 'Agregar personal' : 'Guardar cambios'}
              disabledGuardar={modal.accion === 'crear' && modal.rol === 'admin_restaurante' && !puedeCrearAdmin}
            />
          </form>
        </Modal>
      )}

      {/* Confirmación de creación */}
      {personalCreado && (
        <Modal titulo={`${rolLabel(personalCreado.rol)} creado`} onCerrar={() => setPersonalCreado(null)} ancho="max-w-md">
          <p className="mb-4 text-sm leading-relaxed text-zinc-300">
            <strong className="font-semibold text-zinc-100">{personalCreado.nombre}</strong>{' '}
            ya tiene una cuenta de acceso en Mesora.
          </p>

          <div className="mb-4 rounded-xl border border-surface-800 bg-surface-950/60 p-4">
            <p className="text-xs uppercase tracking-widest text-zinc-500">Usuario de acceso</p>
            <p className="mt-2 break-all font-mono text-sm text-zinc-100">{personalCreado.email ?? 'Sin correo'}</p>
          </div>

          {esModoLocal() ? (
            <p className="mb-4 flex items-start gap-2 text-xs leading-relaxed text-zinc-500">
              <IconoInfo className="mt-0.5 h-4 w-4 shrink-0" />
              En este entorno de pruebas no se envían correos. La persona usará la clave definida en el formulario para entrar desde /login y verá solo {VISTA_POR_ROL[personalCreado.rol]}.
            </p>
          ) : (
            <p className="mb-4 flex items-start gap-2 text-xs leading-relaxed text-zinc-500">
              <IconoInfo className="mt-0.5 h-4 w-4 shrink-0" />
              Comparte en persona la clave inicial que ingresaste. No se vuelve a mostrar ni se guarda en el historial.
            </p>
          )}

          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setPersonalCreado(null)}
              className="btn btn-primary min-h-11 px-5"
            >
              Entendido
            </button>
          </div>
        </Modal>
      )}

      {/* Confirmación de baja o reactivación reversible */}
      {confirmar && (
        <Modal
          titulo={confirmar.activoNuevo ? 'Reactivar acceso' : 'Desactivar acceso'}
          onCerrar={() => { if (!confirmCargando) { setConfirmar(null); setConfirmError(null); setMotivoEstado('') } }}
          ancho="max-w-lg"
        >
          <div className="space-y-3 text-sm leading-relaxed text-zinc-300">
            <p><strong className="text-zinc-100">Acción:</strong> {confirmar.activoNuevo ? 'permitir de nuevo el inicio de sesión' : 'bloquear el inicio de sesión y revocar las sesiones activas'} de <strong className="text-zinc-100">{confirmar.nombre}</strong>.</p>
            <p><strong className="text-zinc-100">Datos afectados:</strong> solo cambiará el estado de acceso. Sus cuentas, pedidos y registros históricos se conservarán.</p>
            <p><strong className="text-zinc-100">PIN del gerente:</strong> no requerido; se solicita una sesión activa de administrador.</p>
            <p><strong className="text-zinc-100">Auditoría:</strong> se registrará actor, hora, estado anterior y nuevo, y motivo opcional.</p>
          </div>
          <label className="mt-4 block text-sm text-zinc-400">Motivo (opcional)
            <input className="input mt-1 min-h-11 w-full" value={motivoEstado} maxLength={240} onChange={(e) => setMotivoEstado(e.target.value)} placeholder={confirmar.activoNuevo ? 'Ej. Regresó al equipo' : 'Ej. Fin de contrato'} />
          </label>
          {confirmError && <div role="alert" className="aviso mt-4 border-danger-500/40 bg-danger-500/10 text-danger-400">{confirmError}</div>}
          {confirmCargando && <div role="status" className="mt-3 text-sm text-zinc-400">Actualizando acceso y cerrando sesiones…</div>}
          <div className="mt-6 flex flex-wrap justify-end gap-2">
            <button type="button" disabled={confirmCargando} className="btn btn-outline min-h-11 px-4" onClick={() => { setConfirmar(null); setConfirmError(null); setMotivoEstado('') }}>Cancelar</button>
            <button type="button" disabled={confirmCargando} className={`btn min-h-11 px-4 ${confirmar.activoNuevo ? 'btn-primary' : 'btn-danger'}`} onClick={() => void ejecutarCambioEstado()}>{confirmCargando ? 'Guardando…' : confirmar.activoNuevo ? 'Confirmar reactivación' : 'Confirmar desactivación'}</button>
          </div>
        </Modal>
      )}

      {/* Confirmación del restablecimiento de contraseña */}
      {resetear && (
        <Modal
          titulo={`Restablecer clave · ${resetear.nombre}`}
          onCerrar={() => { if (!resetCargando) { setResetear(null); setResetError(null); setPasswordTemporal(''); setPasswordConfirmacion('') } }}
          ancho="max-w-lg"
        >
          <p className="mb-4 text-sm leading-relaxed text-zinc-300">La clave temporal se mantendrá enmascarada y no se guardará en Mesora. Entrégasela en persona; al iniciar sesión, la persona tendrá que cambiarla. Sus sesiones actuales se cerrarán.</p>
          <label className="mb-4 block text-sm text-zinc-400">Nueva clave temporal
            <input type="password" autoComplete="new-password" className="input mt-1 min-h-11 w-full" value={passwordTemporal} minLength={10} maxLength={128} onChange={(e) => setPasswordTemporal(e.target.value)} />
          </label>
          <label className="block text-sm text-zinc-400">Repite la clave temporal
            <input type="password" autoComplete="new-password" className="input mt-1 min-h-11 w-full" value={passwordConfirmacion} minLength={10} maxLength={128} onChange={(e) => setPasswordConfirmacion(e.target.value)} />
          </label>
          <p className="mt-2 text-xs text-zinc-500">Usa al menos 10 caracteres. La clave no aparecerá en auditoría, mensajes ni historial.</p>
          {resetError && <div role="alert" className="aviso mt-4 border-danger-500/40 bg-danger-500/10 text-danger-400">{resetError}</div>}
          {resetCargando && <div role="status" className="mt-3 text-sm text-zinc-400">Actualizando Auth, cerrando sesiones y registrando auditoría…</div>}
          <div className="mt-6 flex flex-wrap justify-end gap-2">
            <button type="button" disabled={resetCargando} className="btn btn-outline min-h-11 px-4" onClick={() => { setResetear(null); setResetError(null); setPasswordTemporal(''); setPasswordConfirmacion('') }}>Cancelar</button>
            <button type="button" disabled={resetCargando || passwordTemporal.length < 10 || passwordTemporal !== passwordConfirmacion} className="btn btn-primary min-h-11 px-4" onClick={() => void ejecutarReset()}>{resetCargando ? 'Restableciendo…' : 'Guardar clave temporal'}</button>
          </div>
        </Modal>
      )}

    </div>
  )
}
