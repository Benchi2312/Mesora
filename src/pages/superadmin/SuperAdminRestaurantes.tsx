import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getApi } from '../../lib/api'
import type { AdminRestaurante, DatosRestauranteConAdmin } from '../../lib/api'
import { fmtFecha, fmtFechaVencimiento } from '../../lib/format'
import { finDeDiaEnPeru } from '../../domain/restaurant/fechasSuscripcion'
import {
  CRITERIOS_VACIOS,
  diasParaVencimiento,
  filtrarRestaurantes,
  hayFiltrosActivos,
  venceEnDias,
} from '../../domain/restaurant/restaurantes'
import type { CriteriosBusqueda } from '../../domain/restaurant/restaurantes'
import type { Restaurante } from '../../types/database'
import SuperAdminCarga from './SuperAdminCarga'
import EstadoVacio from '../../components/EstadoVacio'
import { Campo, IconoMas, Modal, PieAcciones } from '../../components/ui'
import { ChipOperativo, ChipSuscripcion } from './Chips'

type FormAlta = {
  nombre: string
  ruc: string
  direccion: string
  telefono: string
  emailContacto: string
  suscripcionActiva: boolean
  fechaVencimiento: string
  adminNombre: string
  adminEmail: string
  adminPassword: string
}

const FORM_VACIO: FormAlta = {
  nombre: '',
  ruc: '',
  direccion: '',
  telefono: '',
  emailContacto: '',
  suscripcionActiva: true,
  fechaVencimiento: '',
  adminNombre: '',
  adminEmail: '',
  adminPassword: '',
}

const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function SuperAdminRestaurantes() {
  const navegar = useNavigate()
  const [restaurantes, setRestaurantes] = useState<Restaurante[]>([])
  const [admins, setAdmins] = useState<AdminRestaurante[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [criterios, setCriterios] = useState<CriteriosBusqueda>(CRITERIOS_VACIOS)

  const [altaAbierta, setAltaAbierta] = useState(false)
  const [form, setForm] = useState<FormAlta>(FORM_VACIO)
  const [formError, setFormError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [creado, setCreado] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    const api = getApi()
    const [rRes, aRes] = await Promise.all([api.getRestaurantes(), api.getAdministradores()])
    if (rRes.error) {
      setError(rRes.error)
      return
    }
    setRestaurantes(rRes.data ?? [])
    setAdmins(aRes.data ?? [])
    setError(null)
  }, [])

  useEffect(() => {
    setCargando(true)
    void cargar().finally(() => setCargando(false))
  }, [cargar])

  const filtrados = useMemo(
    () => filtrarRestaurantes(restaurantes, criterios, admins),
    [restaurantes, criterios, admins],
  )
  const conFiltros = hayFiltrosActivos(criterios)

  const adminDe = (rid: string) => admins.find((a) => a.restaurante_id === rid) ?? null

  function cambiar<K extends keyof CriteriosBusqueda>(campo: K, valor: CriteriosBusqueda[K]) {
    setCriterios((c) => ({ ...c, [campo]: valor }))
  }

  function cambiarAlta<K extends keyof FormAlta>(campo: K, valor: FormAlta[K]) {
    setForm((f) => ({ ...f, [campo]: valor }))
  }

  async function guardar() {
    const nombre = form.nombre.trim()
    if (!nombre) {
      setFormError('El nombre del restaurante es obligatorio.')
      return
    }
    const adminNombre = form.adminNombre.trim()
    if (!adminNombre) {
      setFormError('El nombre del administrador es obligatorio.')
      return
    }
    const adminEmail = form.adminEmail.trim().toLowerCase()
    if (!EMAIL_OK.test(adminEmail)) {
      setFormError('Ingresa un correo válido para el administrador.')
      return
    }
    if (form.adminPassword.length < 8) {
      setFormError('La contraseña inicial debe tener al menos 8 caracteres.')
      return
    }
    setFormError(null)
    setEnviando(true)

    const datos: DatosRestauranteConAdmin = {
      nombre,
      ruc: form.ruc.trim() || null,
      direccion: form.direccion.trim() || null,
      telefono: form.telefono.trim() || null,
      email_contacto: form.emailContacto.trim() || null,
      suscripcion_activa: form.suscripcionActiva,
      fecha_vencimiento: form.fechaVencimiento
        ? finDeDiaEnPeru(form.fechaVencimiento)
        : null,
      admin: { nombre: adminNombre, email: adminEmail, password: form.adminPassword },
    }

    const res = await getApi().crearRestauranteConAdmin(datos)
    setEnviando(false)
    if (res.error) {
      setFormError(res.error)
      return
    }
    setAltaAbierta(false)
    setForm(FORM_VACIO)
    setCreado(
      `Restaurante "${res.data?.nombre ?? nombre}" creado. ${adminEmail} puede iniciar sesión con la contraseña temporal y deberá cambiarla.`,
    )
    await cargar()
  }

  if (cargando) return <SuperAdminCarga recurso="los restaurantes" />

  if (error)
    return (
      <div role="alert" className="aviso border-danger-500/40 bg-danger-500/10 text-danger-500">
        No se pudieron cargar los restaurantes. {error}
      </div>
    )

  return (
    <div>
      <div className="sa-controls mb-5 flex flex-wrap items-center gap-3">
        <input
          type="search"
          className="input min-h-11 w-full sm:max-w-xs"
          placeholder="Buscar por nombre, RUC, teléfono, correo o admin…"
          aria-label="Buscar restaurantes"
          value={criterios.busqueda}
          onChange={(e) => cambiar('busqueda', e.target.value)}
        />

        <select
          className="input min-h-11 w-auto"
          aria-label="Filtrar por estado"
          value={criterios.estado}
          onChange={(e) => cambiar('estado', e.target.value as CriteriosBusqueda['estado'])}
        >
          <option value="todos">Estado: todos</option>
          <option value="operando">Estado: operando</option>
          <option value="detenido">Estado: detenido</option>
        </select>

        <select
          className="input min-h-11 w-auto"
          aria-label="Filtrar por suscripción"
          value={criterios.suscripcion}
          onChange={(e) => cambiar('suscripcion', e.target.value as CriteriosBusqueda['suscripcion'])}
        >
          <option value="todas">Suscripción: todas</option>
          <option value="activa">Suscripción: activa</option>
          <option value="por_vencer">Suscripción: por vencer</option>
          <option value="vencida">Suscripción: vencida</option>
          <option value="suspendida">Suscripción: suspendida</option>
        </select>

        <select
          className="input min-h-11 w-auto"
          aria-label="Ordenar la lista"
          value={criterios.orden}
          onChange={(e) => cambiar('orden', e.target.value as CriteriosBusqueda['orden'])}
        >
          <option value="nombre">Orden: nombre (A→Z)</option>
          <option value="nombre_desc">Orden: nombre (Z→A)</option>
          <option value="recientes">Orden: más recientes</option>
          <option value="antiguos">Orden: más antiguos</option>
          <option value="vencimiento">Orden: vencimiento próximo</option>
        </select>

        {conFiltros && (
          <button
            type="button"
            className="btn btn-outline min-h-11 px-4"
            onClick={() => setCriterios(CRITERIOS_VACIOS)}
          >
            Limpiar filtros
          </button>
        )}

        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-zinc-500" aria-live="polite">
            {filtrados.length} de {restaurantes.length}
          </span>
          <button
            type="button"
            onClick={() => {
              setFormError(null)
              setCreado(null)
              setForm(FORM_VACIO)
              setAltaAbierta(true)
            }}
            className="btn btn-primary min-h-11 px-4"
          >
            <IconoMas />
            Nuevo restaurante
          </button>
        </div>
      </div>

      {creado && (
        <div className="aviso mb-5 border-ok-500/30 bg-ok-500/10 text-ok-500">{creado}</div>
      )}

      {restaurantes.length === 0 ? (
        <EstadoVacio
          icono={
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 11h16M4 11V7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
              <path d="M8 15h4M8 7h4" />
            </svg>
          }
          titulo="No hay restaurantes registrados todavía"
          descripcion="Da de alta el primer cliente con su administrador de cuenta para que pueda iniciar sesión."
        />
      ) : filtrados.length === 0 ? (
        <EstadoVacio
          icono={
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4.3-4.3" />
            </svg>
          }
          titulo="Ningún restaurante coincide con la búsqueda"
          descripcion="Ajusta los filtros o límpialos para volver a ver toda la lista."
        />
      ) : (
        <div className="sa-table-shell overflow-hidden rounded-2xl border border-surface-800 bg-surface-900 shadow-sm shadow-black/30">
          <div className="sa-table-scroll overflow-x-auto">
            <table className="sa-mobile-table sa-table-restaurantes w-full text-sm">
              <thead>
                <tr className="border-b border-surface-700 bg-surface-800/60 text-left text-xs uppercase tracking-widest text-zinc-400">
                  <th className="px-4 py-3.5 font-semibold">Restaurante</th>
                  <th className="hidden px-4 py-3.5 font-semibold md:table-cell">RUC</th>
                  <th className="hidden px-4 py-3.5 font-semibold lg:table-cell">Teléfono</th>
                  <th className="px-4 py-3.5 font-semibold">Administrador</th>
                  <th className="px-4 py-3.5 font-semibold">Estado</th>
                  <th className="px-4 py-3.5 font-semibold">Suscripción</th>
                  <th className="px-4 py-3.5 font-semibold">Vence</th>
                  <th className="hidden px-4 py-3.5 font-semibold xl:table-cell">Registrado</th>
                  <th className="px-4 py-3.5 font-semibold">
                    <span className="sr-only">Detalle</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-800">
                {filtrados.map((r) => {
                  const admin = adminDe(r.id)
                  const dias = diasParaVencimiento(r)
                  const porVencer = venceEnDias(r)
                  return (
                    <tr
                      key={r.id}
                      className="cursor-pointer transition-colors hover:bg-surface-800/60"
                      onClick={() => navegar(`/super-admin/restaurantes/${r.id}`)}
                    >
                      <td className="px-4 py-3.5">
                        <Link
                          to={`/super-admin/restaurantes/${r.id}`}
                          className="font-semibold text-zinc-100 hover:text-brand-400"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {r.nombre}
                        </Link>
                        {r.email_contacto && (
                          <p className="text-xs text-zinc-500">{r.email_contacto}</p>
                        )}
                      </td>
                      <td className="hidden px-4 py-3.5 text-zinc-300 md:table-cell">
                        {r.ruc ?? <span className="text-zinc-600">—</span>}
                      </td>
                      <td className="hidden px-4 py-3.5 text-zinc-300 lg:table-cell">
                        {r.telefono ?? <span className="text-zinc-600">—</span>}
                      </td>
                      <td className="px-4 py-3.5">
                        {admin ? (
                          <>
                            <p className="text-zinc-200">{admin.nombre}</p>
                            <p className="text-xs text-zinc-500">{admin.email ?? '—'}</p>
                          </>
                        ) : (
                          <span className="text-zinc-500">Sin administrador</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        <ChipOperativo r={r} />
                      </td>
                      <td className="px-4 py-3.5">
                        <ChipSuscripcion r={r} />
                      </td>
                      <td className="px-4 py-3.5 text-zinc-400">
                        {r.fecha_vencimiento ? (
                          <>
                            <p>{fmtFechaVencimiento(r.fecha_vencimiento)}</p>
                            {porVencer && dias !== null && (
                              <p className="text-xs font-medium text-warn-400">
                                {dias === 0 ? 'hoy' : `en ${dias} día${dias === 1 ? '' : 's'}`}
                              </p>
                            )}
                          </>
                        ) : (
                          <span className="text-zinc-600">—</span>
                        )}
                      </td>
                      <td className="hidden px-4 py-3.5 text-zinc-400 xl:table-cell">
                        {fmtFecha(r.created_at)}
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <Link
                          to={`/super-admin/restaurantes/${r.id}`}
                          aria-label={`Ver detalle de ${r.nombre}`}
                          className="inline-grid h-9 w-9 place-items-center rounded-lg text-zinc-500 transition hover:bg-surface-700 hover:text-brand-400"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M9 6l6 6-6 6" />
                          </svg>
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {altaAbierta && (
        <Modal
          titulo="Nuevo restaurante"
          onCerrar={() => setAltaAbierta(false)}
          ancho="max-w-2xl"
        >
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void guardar()
            }}
          >
            <p className="mb-5 rounded-xl border border-brand-500/30 bg-brand-500/10 px-4 py-3 text-sm text-brand-300">
              El alta crea el restaurante y la cuenta de su administrador. Usa un correo real al
              que tenga acceso: podrá utilizarlo para recuperar su contraseña cuando el envío de
              correos esté configurado. Deberá cambiar la contraseña temporal al entrar.
            </p>

            <h4 className="mb-3 text-sm font-bold uppercase tracking-widest text-zinc-400">
              Datos del restaurante
            </h4>

            <Campo etiqueta="Nombre del restaurante" htmlFor="r-nombre" error={null}>
              <input
                id="r-nombre"
                className="input"
                required
                value={form.nombre}
                onChange={(e) => cambiarAlta('nombre', e.target.value)}
                placeholder="La Esquina del Sabor"
              />
            </Campo>

            <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
              <Campo etiqueta="RUC" htmlFor="r-ruc">
                <input
                  id="r-ruc"
                  className="input"
                  value={form.ruc}
                  onChange={(e) => cambiarAlta('ruc', e.target.value)}
                  placeholder="20512345678"
                  inputMode="numeric"
                />
              </Campo>
              <Campo etiqueta="Teléfono" htmlFor="r-tel">
                <input
                  id="r-tel"
                  className="input"
                  value={form.telefono}
                  onChange={(e) => cambiarAlta('telefono', e.target.value)}
                  placeholder="+51 999 111 222"
                />
              </Campo>
            </div>

            <Campo etiqueta="Dirección" htmlFor="r-dir">
              <input
                id="r-dir"
                className="input"
                value={form.direccion}
                onChange={(e) => cambiarAlta('direccion', e.target.value)}
                placeholder="Av. Principal 456, San Isidro"
              />
            </Campo>

            <Campo etiqueta="Email de contacto" htmlFor="r-email">
              <input
                id="r-email"
                type="email"
                className="input"
                value={form.emailContacto}
                onChange={(e) => cambiarAlta('emailContacto', e.target.value)}
                placeholder="contacto@restaurante.pe"
              />
            </Campo>

            <div className="mb-5 rounded-xl border border-surface-700 bg-surface-800/40 p-4">
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 accent-brand-500"
                  checked={form.suscripcionActiva}
                  onChange={(e) => cambiarAlta('suscripcionActiva', e.target.checked)}
                />
                <span className="text-sm text-zinc-300">
                  <span className="font-semibold text-zinc-100">Suscripción activa</span>
                  <span className="block text-xs text-zinc-500">
                    Si está desactivada o vencida, el restaurante no puede operar en la app.
                  </span>
                </span>
              </label>
              <div className="mt-3">
                <Campo etiqueta="Vence (opcional — vacío = sin vencimiento)" htmlFor="r-vence">
                  <input
                    id="r-vence"
                    type="date"
                    className="input"
                    value={form.fechaVencimiento}
                    onChange={(e) => cambiarAlta('fechaVencimiento', e.target.value)}
                  />
                </Campo>
              </div>
            </div>

            <h4 className="mb-3 mt-6 text-sm font-bold uppercase tracking-widest text-zinc-400">
              Administrador principal
            </h4>

            <Campo etiqueta="Nombre" htmlFor="a-nombre">
              <input
                id="a-nombre"
                className="input"
                required
                value={form.adminNombre}
                onChange={(e) => cambiarAlta('adminNombre', e.target.value)}
                placeholder="Ana Torres"
              />
            </Campo>

            <Campo etiqueta="Correo real del administrador (usuario de acceso)" htmlFor="a-email">
              <input
                id="a-email"
                type="email"
                className="input"
                required
                value={form.adminEmail}
                onChange={(e) => cambiarAlta('adminEmail', e.target.value)}
                placeholder="admin@restaurante.com"
                autoComplete="off"
              />
            </Campo>

            <Campo etiqueta="Contraseña temporal (mínimo 8 caracteres)" htmlFor="a-pass">
              <input
                id="a-pass"
                type="password"
                className="input"
                required
                minLength={8}
                value={form.adminPassword}
                onChange={(e) => cambiarAlta('adminPassword', e.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
              />
            </Campo>

            {formError && (
              <div role="alert" className="aviso border-danger-500/40 bg-danger-500/10 text-danger-500">
                {formError}
              </div>
            )}

            <PieAcciones
              onCancelar={() => setAltaAbierta(false)}
              enviando={enviando}
              textoEnvio="Creando…"
              labelGuardar="Crear restaurante"
            />
          </form>
        </Modal>
      )}
    </div>
  )
}
