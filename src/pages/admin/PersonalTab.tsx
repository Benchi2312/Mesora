import { useCallback, useEffect, useState } from 'react'
import { useCurrentContext } from '../../lib/useCurrentContext'
import { esModoLocal, getApi } from '../../lib/api'
import type { DatosPersonal, RolPersonal } from '../../lib/api'
import { PASSWORD_DE_PRUEBA } from '../../lib/localSeed'
import { construirEmail, esUsuarioValido, separarEmail } from '../../lib/dominio'
import { rolLabel } from '../../lib/roles'
import { Spinner } from '../../components/LoadingScreen'
import EstadoVacio from '../../components/EstadoVacio'
import { Campo, ConfirmDialog, IconoBasura, IconoInfo, IconoLapiz, IconoLlave, IconoMas, Modal, PieAcciones } from '../../components/ui'

type ModalPersonal = {
  accion: 'crear' | 'editar'
  id?: string
  nombre: string
  email: string
  password: string
  rol: RolPersonal
} | null
type Confirmar = { id: string; nombre: string } | null
type PersonalCreado = { nombre: string; email: string | null; password: string | null; rol: RolPersonal } | null
/** A quién se le va a restablecer la contraseña (misma forma que `Confirmar`). */
type Resetear = { id: string; nombre: string } | null
/** La contraseña temporal que se muestra UNA sola vez, al Admin que la pidió. */
type PasswordTemporal = { nombre: string; password: string } | null

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

  const [modal, setModal] = useState<ModalPersonal>(null)
  const [modalError, setModalError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const [confirmar, setConfirmar] = useState<Confirmar>(null)
  const [confirmError, setConfirmError] = useState<string | null>(null)
  const [confirmCargando, setConfirmCargando] = useState(false)

  const [resetear, setResetear] = useState<Resetear>(null)
  const [resetError, setResetError] = useState<string | null>(null)
  const [resetCargando, setResetCargando] = useState(false)
  const [passwordTemporal, setPasswordTemporal] = useState<PasswordTemporal>(null)
  const [copiado, setCopiado] = useState(false)

  const [personalCreado, setPersonalCreado] = useState<PersonalCreado>(null)

  const cargar = useCallback(async () => {
    if (!rid) return
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
        activo: Boolean(u.activo),
        rol: u.rol === 'cocina' ? 'cocina' : u.rol === 'admin_restaurante' ? 'admin_restaurante' : u.rol === 'cajero' ? 'cajero' : 'mesero',
      })),
    )
    setError(null)
  }, [rid])

  const adminsActivos = personal.filter((m) => m.rol === 'admin_restaurante' && m.activo).length
  const puedeCrearAdmin = adminsActivos < (limiteAdmins >= 0 ? limiteAdmins : 999)

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
    if (modal.accion === 'crear') {
      const datos: DatosPersonal = { nombre, email: emailFinal, password, rol: modal.rol }
      const res = await api.crearPersonal(rid, datos)
      setEnviando(false)
      if (res.error) {
        setModalError(res.error)
        return
      }
      setPersonalCreado({
        nombre: res.data?.nombre ?? nombre,
        email: res.data?.email ?? null,
        password: esModoLocal() ? PASSWORD_DE_PRUEBA : password,
        rol: modal.rol,
      })
    } else {
      const datos: DatosPersonal = { nombre, email: emailFinal, rol: modal.rol }
      const res = await api.actualizarPersonal(rid, modal.id as string, datos)
      setEnviando(false)
      if (res.error) {
        setModalError(res.error)
        return
      }
    }
    setModal(null)
    await cargar()
  }

  async function ejecutarEliminacion() {
    if (!rid || !confirmar) return
    if (confirmar.id === yoId) {
      setConfirmError('No puedes eliminar tu propio acceso.')
      return
    }
    setConfirmCargando(true)
    setConfirmError(null)
    const api = getApi()
    const res = await api.eliminarPersonal(rid, confirmar.id)
    setConfirmCargando(false)
    if (res.error) {
      setConfirmError(res.error)
      return
    }
    setConfirmar(null)
    await cargar()
  }

  /** Activa/desactiva el acceso sin entrar al modal de edición. */
  async function alternarActivo(m: { id: string; nombre: string; activo: boolean }) {
    if (!rid) return
    setConfirmError(null)
    const res = await getApi().actualizarPersonal(rid, m.id, { activo: !m.activo })
    if (res.error) {
      setError(`${m.nombre}: ${res.error}`)
      return
    }
    await cargar()
  }

  /**
   * Restablece la contraseña de un trabajador. La clave nueva la genera el
   * servidor y vuelve en la respuesta: es la única vez que se muestra.
   */
  async function ejecutarReset() {
    if (!resetear) return
    setResetCargando(true)
    setResetError(null)
    const res = await getApi().resetPasswordPersonal(resetear.id)
    setResetCargando(false)
    if (res.error) {
      setResetError(res.error)
      return
    }
    const password = res.data?.password_temporal
    if (!password) {
      setResetError('No se pudo obtener la contraseña nueva.')
      return
    }
    setResetear(null)
    setCopiado(false)
    setPasswordTemporal({ nombre: resetear.nombre, password })
  }

  /** Copia la contraseña temporal al portapapeles. */
  async function copiarPassword() {
    if (!passwordTemporal) return
    try {
      await navigator.clipboard.writeText(passwordTemporal.password)
      setCopiado(true)
    } catch {
      setCopiado(false)
    }
  }

  return (
    <div>
      <div className="aviso mb-5 border-brand-500/30 bg-brand-500/10 text-brand-300">
        <span className="flex items-start gap-2.5">
          <IconoInfo className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Las personas que agregues aquí podrán iniciar sesión en la app. Desactiva a
            alguien para quitarle el acceso sin borrar su historial.
          </span>
        </span>
      </div>

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-zinc-100">Personal</h2>
          <p className="mt-0.5 text-sm text-zinc-500">
            Meseros, cocina y admins con acceso a Mesora. Administradores: {adminsActivos} de {limiteAdmins >= 0 ? limiteAdmins : '∞'}.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setModalError(null)
            setModal({ accion: 'crear', nombre: '', email: '', password: '', rol: 'mesero' })
          }}
          className="btn btn-primary min-h-11 px-4"
        >
          <IconoMas />
          Agregar personal
        </button>
      </div>

      {personal.length === 0 ? (
        <EstadoVacio
          titulo="Aún no tienes personal"
          descripcion="Agrega meseros y cocina para que puedan tomar comandas, preparar pedidos y gestionar mesas."
        />
      ) : (
        <ul className="card divide-y divide-zinc-800/70 p-0 sm:p-0">
          {personal.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-500/15 text-sm font-bold text-brand-400">
                  {m.nombre
                    .split(/\s+/)
                    .filter(Boolean)
                    .slice(0, 2)
                    .map((x) => x[0]?.toUpperCase() ?? '')
                    .join('')}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-zinc-100">{m.nombre}</p>
                  <p className="truncate text-xs text-zinc-500">{m.email ?? 'Sin correo'}</p>
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
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
                  className={`chip min-h-7 ${m.activo ? 'chip-ok' : 'chip-danger'} disabled:cursor-not-allowed disabled:opacity-60`}
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
                      setResetear({ id: m.id, nombre: m.nombre })
                    }}
                    className="btn btn-ghost h-11 w-11 p-0"
                  >
                    <IconoLlave />
                  </button>
                )}
                <button
                  type="button"
                  aria-label={`Eliminar ${m.nombre}`}
                  disabled={yoId === m.id}
                  title={yoId === m.id ? 'No puedes eliminar tu propio acceso' : undefined}
                  onClick={() => setConfirmar({ id: m.id, nombre: m.nombre })}
                  className="btn btn-ghost h-11 w-11 p-0 text-zinc-400 hover:text-danger-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <IconoBasura />
                </button>
              </div>
            </li>
          ))}
        </ul>
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
                />
              </Campo>
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
            {esModoLocal()
              ? 'ya puede iniciar sesión en la app con las credenciales de abajo.'
              : 'ya puede iniciar sesión en la app con las credenciales de abajo.'}
          </p>

          <div className="mb-4 rounded-xl border border-surface-800 bg-surface-950/60 p-4">
            <p className="text-xs uppercase tracking-widest text-zinc-500">Credenciales de acceso</p>
            <p className="mt-2 break-all font-mono text-sm text-zinc-100">{personalCreado.email ?? 'Sin correo'}</p>
            {personalCreado.password && (
              <>
                <p className="mt-3 text-xs uppercase tracking-widest text-zinc-500">
                  {esModoLocal() ? 'Contraseña de prueba' : 'Contraseña inicial'}
                </p>
                <p className="mt-2 break-all font-mono text-sm text-brand-400">{personalCreado.password}</p>
              </>
            )}
          </div>

          {esModoLocal() ? (
            <p className="mb-4 flex items-start gap-2 text-xs leading-relaxed text-zinc-500">
              <IconoInfo className="mt-0.5 h-4 w-4 shrink-0" />
              En este entorno de pruebas no se envían correos. La persona usa estas credenciales
              para entrar desde /login y verá solo {VISTA_POR_ROL[personalCreado.rol]}.
            </p>
          ) : (
            <p className="mb-4 flex items-start gap-2 text-xs leading-relaxed text-zinc-500">
              <IconoInfo className="mt-0.5 h-4 w-4 shrink-0" />
              Ya puede iniciar sesión con las credenciales mostradas.
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

      {/* Confirmación de eliminación */}
      {confirmar && (
        <ConfirmDialog
          titulo="Eliminar personal"
          mensaje={`¿Eliminar a «${confirmar.nombre}»? Perderá el acceso a la app. Esta acción no se puede deshacer.`}
          error={confirmError}
          onCancelar={() => {
            setConfirmar(null)
            setConfirmError(null)
          }}
          onConfirmar={() => void ejecutarEliminacion()}
          cargando={confirmCargando}
        />
      )}

      {/* Confirmación del restablecimiento de contraseña */}
      {resetear && (
        <ConfirmDialog
          titulo="Restablecer contraseña"
          mensaje={`¿Restablecer contraseña de ${resetear.nombre}? Se van a revocar sus sesiones activas en todos los dispositivos. La contraseña nueva se muestra una sola vez.`}
          confirmLabel="Restablecer"
          cargandoLabel="Restableciendo…"
          error={resetError}
          onCancelar={() => {
            setResetear(null)
            setResetError(null)
          }}
          onConfirmar={() => void ejecutarReset()}
          cargando={resetCargando}
        />
      )}

      {/* Contraseña temporal: se muestra una sola vez */}
      {passwordTemporal && (
        <Modal
          titulo={`Contraseña restablecida para ${passwordTemporal.nombre}`}
          onCerrar={() => setPasswordTemporal(null)}
          ancho="max-w-md"
        >
          <p className="mb-4 text-sm leading-relaxed text-zinc-300">
            Esta es la contraseña temporal de{' '}
            <strong className="font-semibold text-zinc-100">{passwordTemporal.nombre}</strong>.
            Entrégasela para que pueda entrar a la app.
          </p>

          <div className="mb-4 rounded-xl border border-surface-800 bg-surface-950/60 p-4">
            <p className="text-xs uppercase tracking-widest text-zinc-500">
              Contraseña temporal
            </p>
            <div className="mt-2 flex items-center gap-2">
              <code className="min-w-0 flex-1 break-all font-mono text-sm text-brand-400">
                {passwordTemporal.password}
              </code>
              <button
                type="button"
                onClick={() => void copiarPassword()}
                className="btn btn-ghost shrink-0 px-3 text-xs"
              >
                {copiado ? 'Copiado' : 'Copiar'}
              </button>
            </div>
          </div>

          <p className="mb-4 flex items-start gap-2 text-xs leading-relaxed text-warn-500">
            <IconoInfo className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              No se vuelve a mostrar. Si la pierdes, hay que restablecerla otra vez.
            </span>
          </p>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => {
                setPasswordTemporal(null)
                setCopiado(false)
                void cargar()
              }}
              className="btn btn-primary min-h-11 px-5"
            >
              Entendido
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}