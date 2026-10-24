import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getApi } from '../../lib/api'
import type { AdminRestaurante, UsuarioPlataforma } from '../../lib/api'
import { fmtFecha } from '../../lib/format'
import { rolLabel } from '../../lib/roles'
import { diasParaVencimiento, estadoOperativo, venceEnDias } from '../../lib/restaurantes'
import type { Restaurante } from '../../types/database'
import { Spinner } from '../../components/LoadingScreen'
import EstadoVacio from '../../components/EstadoVacio'
import { Campo, ConfirmDialog, IconoLapiz, Modal, PieAcciones } from '../../components/ui'
import { ChipOperativo, ChipSuscripcion, ChipUsuario } from './Chips'

type FormEdicion = {
  nombre: string
  ruc: string
  direccion: string
  telefono: string
  email_contacto: string
}

type Evento = { id: string; fecha: string; tipo: 'restaurante' | 'usuario'; texto: string }

export default function SuperAdminRestauranteDetalle() {
  const { rid } = useParams<{ rid: string }>()
  const [restaurantes, setRestaurantes] = useState<Restaurante[]>([])
  const [admins, setAdmins] = useState<AdminRestaurante[]>([])
  const [usuarios, setUsuarios] = useState<UsuarioPlataforma[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [editando, setEditando] = useState(false)
  const [formEdit, setFormEdit] = useState<FormEdicion>({
    nombre: '',
    ruc: '',
    direccion: '',
    telefono: '',
    email_contacto: '',
  })
  const [enviandoEdit, setEnviandoEdit] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const [editOk, setEditOk] = useState<string | null>(null)

  const [formVence, setFormVence] = useState('')
  const [confirmarDesactivar, setConfirmarDesactivar] = useState(false)
  const [enviandoSub, setEnviandoSub] = useState(false)
  const [subError, setSubError] = useState<string | null>(null)
  const [subOk, setSubOk] = useState<string | null>(null)

  const [perfilId, setPerfilId] = useState<string | null>(null)

  const [cambiandoAdmin, setCambiandoAdmin] = useState(false)
  const [candidatoSel, setCandidatoSel] = useState('')
  const [enviandoAdmin, setEnviandoAdmin] = useState(false)
  const [adminError, setAdminError] = useState<string | null>(null)
  const [adminOk, setAdminOk] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    const api = getApi()
    const [rRes, aRes, uRes] = await Promise.all([
      api.getRestaurantes(),
      api.getAdministradores(),
      api.getUsuariosPlataforma(),
    ])
    if (rRes.error || aRes.error || uRes.error) {
      setError(rRes.error ?? aRes.error ?? uRes.error ?? 'Error al cargar el restaurante')
      return
    }
    setRestaurantes(rRes.data ?? [])
    setAdmins(aRes.data ?? [])
    setUsuarios(uRes.data ?? [])
    setError(null)
  }, [])

  useEffect(() => {
    setCargando(true)
    void cargar().finally(() => setCargando(false))
  }, [cargar])

  const r = restaurantes.find((x) => x.id === rid) ?? null
  const adminsDel = rid ? admins.filter((a) => a.restaurante_id === rid) : []
  const perfilAdmin = perfilId ? usuarios.find((u) => u.id === perfilId) ?? null : null
  const usuariosDel = rid ? usuarios.filter((u) => u.restaurante_id === rid) : []
  const candidatosAdmin = usuariosDel.filter((u) => u.activo && u.rol !== 'admin_restaurante')

  useEffect(() => {
    if (r) setFormVence(r.fecha_vencimiento ? r.fecha_vencimiento.slice(0, 10) : '')
  }, [r?.id, r?.fecha_vencimiento])

  function abrirEdicion() {
    if (!r) return
    setFormEdit({
      nombre: r.nombre,
      ruc: r.ruc ?? '',
      direccion: r.direccion ?? '',
      telefono: r.telefono ?? '',
      email_contacto: r.email_contacto ?? '',
    })
    setEditError(null)
    setEditOk(null)
    setEditando(true)
  }

  function guardarEnLista(actualizado: Restaurante) {
    setRestaurantes((prev) => prev.map((x) => (x.id === actualizado.id ? actualizado : x)))
  }

  async function guardarEdicion() {
    if (!r) return
    const nombre = formEdit.nombre.trim()
    if (!nombre) {
      setEditError('El nombre no puede quedar vacío.')
      return
    }
    setEditError(null)
    setEditOk(null)
    setEnviandoEdit(true)
    const res = await getApi().adminActualizarRestaurante(r.id, {
      nombre,
      ruc: formEdit.ruc.trim() || null,
      direccion: formEdit.direccion.trim() || null,
      telefono: formEdit.telefono.trim() || null,
      email_contacto: formEdit.email_contacto.trim() || null,
    })
    setEnviandoEdit(false)
    if (res.error) {
      setEditError(res.error)
      return
    }
    guardarEnLista(res.data!)
    setEditando(false)
    setEditOk('Datos guardados.')
  }

  async function guardarVencimiento() {
    if (!r) return
    setSubError(null)
    setSubOk(null)
    setEnviandoSub(true)
    const res = await getApi().adminCambiarSuscripcion(
      r.id,
      r.suscripcion_activa,
      formVence ? new Date(formVence).toISOString() : null,
    )
    setEnviandoSub(false)
    if (res.error) {
      setSubError(res.error)
      return
    }
    guardarEnLista(res.data!)
    setSubOk('Fecha de vencimiento actualizada.')
  }

  async function cambiarSuscripcion(activa: boolean): Promise<boolean> {
    if (!r) return false
    setSubError(null)
    setSubOk(null)
    setEnviandoSub(true)
    const res = await getApi().adminCambiarSuscripcion(r.id, activa, r.fecha_vencimiento)
    setEnviandoSub(false)
    if (res.error) {
      setSubError(res.error)
      return false
    }
    guardarEnLista(res.data!)
    setSubOk(
      activa
        ? 'Restaurante activado: sus usuarios ya pueden operar de nuevo.'
        : 'Restaurante desactivado. Ningún dato se borró: el acceso queda bloqueado hasta reactivarlo.',
    )
    return true
  }

  function abrirCambioAdmin() {
    setCandidatoSel('')
    setAdminError(null)
    setCambiandoAdmin(true)
  }

  async function designarAdmin() {
    if (!rid || !candidatoSel) return
    setEnviandoAdmin(true)
    setAdminError(null)
    const res = await getApi().adminDesignarAdministrador(rid, candidatoSel)
    setEnviandoAdmin(false)
    if (res.error) {
      setAdminError(res.error)
      return
    }
    const nombre = res.data?.nombre ?? 'La persona elegida'
    setCambiandoAdmin(false)
    setAdminOk(
      `«${nombre}» ya es administrador de este restaurante. El admin anterior conserva su rol: pueden convivir varios administradores.`,
    )
    await cargar()
  }

  if (cargando)
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    )

  if (error)
    return (
      <div className="aviso border-danger-500/40 bg-danger-500/10 text-danger-500">
        No se pudo cargar el restaurante. {error}
      </div>
    )

  if (!r || !rid)
    return (
      <EstadoVacio
        icono={
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" />
          </svg>
        }
        titulo="Restaurante no encontrado"
        descripcion="Puede que el restaurante haya salido de la plataforma o que el enlace ya no sea válido."
      />
    )

  const dias = diasParaVencimiento(r)
  const porVencer = venceEnDias(r)
  const vencidaPorFecha = r.suscripcion_activa && dias !== null && dias < 0
  const operando = estadoOperativo(r) === 'operando'

  const eventos: Evento[] = [
    {
      id: `r-${r.id}`,
      fecha: r.created_at,
      tipo: 'restaurante' as const,
      texto: `Restaurante «${r.nombre}» creado`,
    },
    ...usuariosDel.map((u) => ({
      id: `u-${u.id}`,
      fecha: u.created_at,
      tipo: 'usuario' as const,
      texto: `${u.nombre} registrado como ${rolLabel(u.rol).toLowerCase()}`,
    })),
  ]
    .sort((a, b) => b.fecha.localeCompare(a.fecha))
    .slice(0, 8)

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Link to="/super-admin/restaurantes" className="btn btn-outline min-h-11 px-4 text-sm">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 6l-6 6 6 6" />
          </svg>
          Volver a restaurantes
        </Link>
        <div className="flex flex-wrap gap-2">
          <ChipOperativo r={r} />
          <ChipSuscripcion r={r} />
        </div>
      </div>

      <h2 className="text-2xl font-extrabold tracking-tight text-zinc-100">{r.nombre}</h2>
      <p className="mt-1 text-sm text-zinc-500">
        {[r.email_contacto, r.telefono].filter(Boolean).join(' · ') || 'Sin datos de contacto'}
      </p>

      {editOk && <div className="aviso mt-4 border-ok-500/30 bg-ok-500/10 text-ok-500">{editOk}</div>}
      {subOk && <div className="aviso mt-4 border-ok-500/30 bg-ok-500/10 text-ok-500">{subOk}</div>}
      {adminOk && <div className="aviso mt-4 border-ok-500/30 bg-ok-500/10 text-ok-500">{adminOk}</div>}

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <section className="card p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h3 className="text-sm font-bold uppercase tracking-widest text-zinc-400">
              Datos generales
            </h3>
            {!editando && (
              <button type="button" onClick={abrirEdicion} className="btn btn-outline min-h-11 px-4 text-sm">
                <IconoLapiz />
                Editar
              </button>
            )}
          </div>

          {editando ? (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                void guardarEdicion()
              }}
            >
              <Campo etiqueta="Nombre" htmlFor="e-nombre" error={null}>
                <input
                  id="e-nombre"
                  className="input"
                  required
                  value={formEdit.nombre}
                  onChange={(e) => setFormEdit({ ...formEdit, nombre: e.target.value })}
                />
              </Campo>
              <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
                <Campo etiqueta="RUC" htmlFor="e-ruc">
                  <input
                    id="e-ruc"
                    className="input"
                    value={formEdit.ruc}
                    onChange={(e) => setFormEdit({ ...formEdit, ruc: e.target.value })}
                    inputMode="numeric"
                  />
                </Campo>
                <Campo etiqueta="Teléfono" htmlFor="e-tel">
                  <input
                    id="e-tel"
                    className="input"
                    value={formEdit.telefono}
                    onChange={(e) => setFormEdit({ ...formEdit, telefono: e.target.value })}
                  />
                </Campo>
              </div>
              <Campo etiqueta="Dirección" htmlFor="e-dir">
                <input
                  id="e-dir"
                  className="input"
                  value={formEdit.direccion}
                  onChange={(e) => setFormEdit({ ...formEdit, direccion: e.target.value })}
                />
              </Campo>
              <Campo etiqueta="Email de contacto" htmlFor="e-email">
                <input
                  id="e-email"
                  type="email"
                  className="input"
                  value={formEdit.email_contacto}
                  onChange={(e) => setFormEdit({ ...formEdit, email_contacto: e.target.value })}
                />
              </Campo>
              {editError && (
                <div className="aviso border-danger-500/40 bg-danger-500/10 text-danger-500">
                  {editError}
                </div>
              )}
              <PieAcciones
                onCancelar={() => setEditando(false)}
                enviando={enviandoEdit}
                textoEnvio="Guardando…"
                labelGuardar="Guardar cambios"
              />
            </form>
          ) : (
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {[
                ['Nombre', r.nombre],
                ['RUC', r.ruc ?? '—'],
                ['Teléfono', r.telefono ?? '—'],
                ['Dirección', r.direccion ?? '—'],
                ['Email de contacto', r.email_contacto ?? '—'],
                ['Fecha de creación', fmtFecha(r.created_at)],
              ].map(([etiqueta, valor]) => (
                <div key={etiqueta}>
                  <dt className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
                    {etiqueta}
                  </dt>
                  <dd className="mt-0.5 text-sm text-zinc-200">{valor}</dd>
                </div>
              ))}
            </dl>
          )}
        </section>

        <section className="card p-5">
          <h3 className="mb-4 text-sm font-bold uppercase tracking-widest text-zinc-400">
            Estado y suscripción
          </h3>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
                Estado
              </p>
              <div className="mt-1.5">
                <ChipOperativo r={r} />
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
                Suscripción
              </p>
              <div className="mt-1.5">
                <ChipSuscripcion r={r} />
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
                Registrado
              </p>
              <p className="mt-0.5 text-sm text-zinc-200">{fmtFecha(r.created_at)}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
                Vence
              </p>
              <p className="mt-0.5 text-sm text-zinc-200">
                {r.fecha_vencimiento ? fmtFecha(r.fecha_vencimiento) : 'Sin fecha de vencimiento'}
                {r.fecha_vencimiento && dias !== null && (
                  <span
                    className={`ml-2 text-xs font-medium ${
                      dias < 0 ? 'text-danger-500' : porVencer ? 'text-warn-400' : 'text-zinc-500'
                    }`}
                  >
                    {dias < 0
                      ? `vencida hace ${Math.abs(dias)} día${Math.abs(dias) === 1 ? '' : 's'}`
                      : porVencer
                        ? `vence en ${dias} día${dias === 1 ? '' : 's'}`
                        : ''}
                  </span>
                )}
              </p>
            </div>
          </div>

          {vencidaPorFecha && (
            <div className="aviso mt-4 border-warn-400/40 bg-warn-400/10 text-warn-400">
              La suscripción venció: actualiza la fecha de vencimiento para que el restaurante
              vuelva a poder operar.
            </div>
          )}

          <form
            className="mt-4 flex flex-wrap items-end gap-3 border-t border-surface-800 pt-4"
            onSubmit={(e) => {
              e.preventDefault()
              void guardarVencimiento()
            }}
          >
            <div>
              <label className="label" htmlFor="edit-vence">
                Fecha de vencimiento
              </label>
              <input
                id="edit-vence"
                type="date"
                className="input min-h-11 w-auto"
                value={formVence}
                onChange={(e) => setFormVence(e.target.value)}
              />
            </div>
            <button
              type="submit"
              disabled={enviandoSub}
              className="btn btn-outline min-h-11 px-4"
            >
              {enviandoSub ? 'Guardando…' : 'Guardar fecha'}
            </button>
          </form>

          <div className="mt-5 border-t border-surface-800 pt-4">
            {r.suscripcion_activa ? (
              <button
                type="button"
                onClick={() => setConfirmarDesactivar(true)}
                className="btn min-h-11 bg-danger-500 px-4 text-white transition-colors hover:bg-danger-500/90"
              >
                Desactivar restaurante
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void cambiarSuscripcion(true)}
                disabled={enviandoSub}
                className="btn min-h-11 bg-ok-500 px-4 text-white transition-colors hover:bg-ok-500/90"
              >
                {enviandoSub ? 'Activando…' : 'Activar restaurante'}
              </button>
            )}
            <p className="mt-2 text-xs leading-relaxed text-zinc-500">
              {operando
                ? 'Al desactivar no se borra nada: los usuarios de este restaurante dejarán de poder operar y sus escrituras quedarán bloqueadas hasta que lo reactives.'
                : 'Mientras esté desactivado, los usuarios de este restaurante ven la pantalla de suscripción vencida y no pueden escribir en la app. Sus datos quedan intactos.'}
            </p>
            {subError && (
              <div className="aviso mt-3 border-danger-500/40 bg-danger-500/10 text-danger-500">
                {subError}
              </div>
            )}
          </div>
        </section>

        <section className="card p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-bold uppercase tracking-widest text-zinc-400">
              {adminsDel.length === 1 ? 'Administrador' : 'Administradores'}
            </h3>
            <button
              type="button"
              onClick={abrirCambioAdmin}
              className="btn btn-outline min-h-11 px-4 text-sm"
            >
              Cambiar administrador
            </button>
          </div>
          {adminsDel.length === 0 ? (
            <p className="text-sm text-zinc-500">
              Este restaurante todavía no tiene administrador de cuenta.
            </p>
          ) : (
            <ul className="space-y-4">
              {adminsDel.map((a) => (
                <li key={a.id} className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-zinc-100">{a.nombre}</p>
                    <p className="text-sm text-zinc-400">{a.email ?? '—'}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <ChipUsuario activo={a.activo} />
                      <span className="text-xs text-zinc-500">{rolLabel(a.rol)}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPerfilId(a.id)}
                    className="btn btn-outline min-h-11 px-4 text-sm"
                  >
                    Ver perfil
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs leading-relaxed text-zinc-500">
            «Cambiar administrador» designa a otra persona del restaurante sin quitarle el rol al
            actual: pueden convivir varios administradores por restaurante.
          </p>
        </section>

        <section className="card p-5">
          <h3 className="mb-4 text-sm font-bold uppercase tracking-widest text-zinc-400">
            Actividad básica
          </h3>
          {eventos.length === 0 ? (
            <p className="text-sm text-zinc-500">Sin información de actividad disponible.</p>
          ) : (
            <ul className="space-y-3">
              {eventos.map((e) => (
                <li key={e.id} className="flex items-start gap-3">
                  <span
                    aria-hidden="true"
                    className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                      e.tipo === 'restaurante' ? 'bg-brand-500' : 'bg-ok-500'
                    }`}
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm text-zinc-200">{e.texto}</p>
                    <p className="text-xs text-zinc-500">{fmtFecha(e.fecha)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="card mt-5 p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-bold uppercase tracking-widest text-zinc-400">
            Usuarios del restaurante
          </h3>
          <span className="text-xs text-zinc-500">{usuariosDel.length} en total</span>
        </div>

        {usuariosDel.length === 0 ? (
          <p className="text-sm text-zinc-500">
            Aún no hay usuarios registrados en este restaurante.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-700 text-left text-xs uppercase tracking-widest text-zinc-400">
                  <th className="px-4 py-3 font-semibold">Nombre</th>
                  <th className="hidden px-4 py-3 font-semibold sm:table-cell">Email</th>
                  <th className="px-4 py-3 font-semibold">Rol</th>
                  <th className="px-4 py-3 font-semibold">Estado</th>
                  <th className="hidden px-4 py-3 font-semibold md:table-cell">Alta</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-800">
                {usuariosDel.map((u) => (
                  <tr key={u.id} className="transition-colors hover:bg-surface-800/60">
                    <td className="px-4 py-3 text-zinc-100">{u.nombre}</td>
                    <td className="hidden px-4 py-3 text-zinc-400 sm:table-cell">
                      {u.email ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-zinc-300">{rolLabel(u.rol)}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${
                          u.activo === false
                            ? 'border-danger-500/40 bg-danger-500/10 text-danger-500'
                            : 'border-ok-500/40 bg-ok-500/10 text-ok-500'
                        }`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${u.activo === false ? 'bg-danger-500' : 'bg-ok-500'}`}
                        />
                        {u.activo === false ? 'Desactivado' : 'Activo'}
                      </span>
                    </td>
                    <td className="hidden px-4 py-3 text-zinc-400 md:table-cell">
                      {fmtFecha(u.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {confirmarDesactivar && (
        <ConfirmDialog
          titulo="¿Desactivar restaurante?"
          mensaje={
            <>
              Se desactiva la suscripción de <strong>{r.nombre}</strong>. No se borra ningún dato:
              sus usuarios no podrán operar en la app (verán la pantalla de suscripción vencida) y
              las escrituras quedarán bloqueadas hasta que reactives la cuenta.
            </>
          }
          confirmLabel="Sí, desactivar"
          cargandoLabel="Desactivando…"
          cargando={enviandoSub}
          error={subError}
          onConfirmar={() => {
            void cambiarSuscripcion(false).then((ok) => {
              if (ok) setConfirmarDesactivar(false)
            })
          }}
          onCancelar={() => {
            setConfirmarDesactivar(false)
            setSubError(null)
          }}
        />
      )}

      {cambiandoAdmin && r && (
        <Modal titulo="Cambiar administrador" onCerrar={() => setCambiandoAdmin(false)}>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void designarAdmin()
            }}
          >
            <p className="mb-5 rounded-xl border border-brand-500/30 bg-brand-500/10 px-4 py-3 text-sm text-brand-300">
              {r.nombre} · Se designa a un usuario de este restaurante como administrador. Solo
              cambia su rol: su restaurante y el del admin actual quedan intactos.
            </p>

            {candidatosAdmin.length === 0 ? (
              <p className="text-sm text-zinc-500">
                No hay más usuarios activos en este restaurante para designar. Crea usuarios nuevos
                desde el panel de Usuarios.
              </p>
            ) : (
              <Campo etiqueta="Elegí a la persona" htmlFor="sel-admin" error={null}>
                <select
                  id="sel-admin"
                  className="input"
                  required
                  value={candidatoSel}
                  onChange={(e) => setCandidatoSel(e.target.value)}
                >
                  <option value="" disabled>
                    Seleccioná un usuario…
                  </option>
                  {candidatosAdmin.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre} — {rolLabel(c.rol)}
                      {c.email ? ` · ${c.email}` : ''}
                    </option>
                  ))}
                </select>
              </Campo>
            )}

            {adminError && (
              <div className="aviso border-danger-500/40 bg-danger-500/10 text-danger-500">
                {adminError}
              </div>
            )}

            <PieAcciones
              onCancelar={() => setCambiandoAdmin(false)}
              enviando={enviandoAdmin}
              textoEnvio="Designando…"
              labelGuardar="Designar administrador"
            />
          </form>
        </Modal>
      )}

      {perfilId && perfilAdmin && (
        <Modal titulo="Perfil del administrador" onCerrar={() => setPerfilId(null)}>
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {[
              ['Nombre', perfilAdmin.nombre],
              ['Email', perfilAdmin.email ?? '—'],
              ['Rol', rolLabel(perfilAdmin.rol)],
              ['Estado', perfilAdmin.activo ? 'Activo' : 'Desactivado'],
              ['Alta', fmtFecha(perfilAdmin.created_at)],
              ['Restaurante', r.nombre],
            ].map(([etiqueta, valor]) => (
              <div key={etiqueta}>
                <dt className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
                  {etiqueta}
                </dt>
                <dd className="mt-0.5 text-sm text-zinc-200">{valor}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-6 flex justify-end">
            <button type="button" onClick={() => setPerfilId(null)} className="btn btn-outline min-h-11 px-4">
              Cerrar
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
