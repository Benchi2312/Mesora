import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { getApi, ROLES_PERSONAL } from '../../lib/api'
import type { RolPersonal, UsuarioPlataforma } from '../../lib/api'
import { fmtFecha } from '../../lib/format'
import { rolLabel } from '../../domain/security/roles'
import {
  CRITERIOS_USUARIOS_VACIOS,
  ORDENES_USUARIOS,
  filtrarUsuarios,
  hayFiltrosUsuarios,
  labelUltimoAcceso,
} from '../../domain/platform/usuarios'
import type {
  CriteriosUsuarios,
  FiltroEstadoUsuarios,
  FiltroRolUsuarios,
  OrdenUsuarios,
} from '../../domain/platform/usuarios'
import type { Restaurante } from '../../types/database'
import { useAuthStore } from '../../store/auth'
import SuperAdminCarga from './SuperAdminCarga'
import EstadoVacio from '../../components/EstadoVacio'
import { Campo, ConfirmDialog, Modal, PieAcciones } from '../../components/ui'
import { ChipUsuario } from './Chips'

const ESTADOS: { valor: FiltroEstadoUsuarios; texto: string }[] = [
  { valor: 'todos', texto: 'Estado: todos' },
  { valor: 'activos', texto: 'Estado: activos' },
  { valor: 'inactivos', texto: 'Estado: inactivos' },
]

export default function SuperAdminUsuarios() {
  const usuario = useAuthStore((s) => s.usuario)
  const [searchParams] = useSearchParams()
  const usuarioQuery = searchParams.get('usuario')
  const busquedaQuery = searchParams.get('busqueda') ?? ''
  const usuarioQueryAbierto = useRef<string | null>(null)

  const [usuarios, setUsuarios] = useState<UsuarioPlataforma[]>([])
  const [restaurantes, setRestaurantes] = useState<Restaurante[]>([])
  const [ultimosAccesos, setUltimosAccesos] = useState<Record<string, string | null>>({})
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [criterios, setCriterios] = useState<CriteriosUsuarios>(() => ({ ...CRITERIOS_USUARIOS_VACIOS, busqueda: busquedaQuery }))
  const [aviso, setAviso] = useState<string | null>(null)
  const [detalle, setDetalle] = useState<UsuarioPlataforma | null>(null)

  const [cambio, setCambio] = useState<{ u: UsuarioPlataforma; activar: boolean } | null>(null)
  const [cambiando, setCambiando] = useState(false)
  const [cambioError, setCambioError] = useState<string | null>(null)

  const [nuevo, setNuevo] = useState(false)
  const [form, setForm] = useState({ nombre: '', email: '', password: '', rol: 'mesero', restauranteId: '' })
  const [formError, setFormError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const cargar = useCallback(async () => {
    const api = getApi()
    const [uRes, rRes, aRes] = await Promise.all([
      api.getUsuariosPlataforma(),
      api.getRestaurantes(),
      api.getUltimosAccesos(),
    ])
    if (uRes.error || rRes.error || aRes.error) {
      setError(uRes.error ?? rRes.error ?? aRes.error ?? 'Error al cargar los usuarios')
      return
    }
    setUsuarios(uRes.data ?? [])
    setRestaurantes(rRes.data ?? [])
    setUltimosAccesos(aRes.data ?? {})
    setError(null)
  }, [])

  useEffect(() => {
    setCargando(true)
    void cargar().finally(() => setCargando(false))
  }, [cargar])

  useEffect(() => {
    if (busquedaQuery) setCriterios((c) => c.busqueda === busquedaQuery ? c : { ...c, busqueda: busquedaQuery })
  }, [busquedaQuery])

  useEffect(() => {
    if (cargando || !usuarioQuery || usuarioQueryAbierto.current === usuarioQuery) return
    const coincidencia = usuarios.find((u) => u.id === usuarioQuery)
    if (!coincidencia) return
    usuarioQueryAbierto.current = usuarioQuery
    setDetalle(coincidencia)
  }, [cargando, usuarioQuery, usuarios])

  const filtrados = useMemo(() => filtrarUsuarios(usuarios, criterios), [usuarios, criterios])
  const conFiltros = hayFiltrosUsuarios(criterios)

  function cambiar<K extends keyof CriteriosUsuarios>(campo: K, valor: CriteriosUsuarios[K]) {
    setCriterios((c) => ({ ...c, [campo]: valor }))
  }

  const nombreRestaurante = (rid: string | null) =>
    restaurantes.find((r) => r.id === rid)?.nombre ?? 'Sin restaurante'

  function abrirNuevo() {
    setForm({ nombre: '', email: '', password: '', rol: 'mesero', restauranteId: '' })
    setFormError(null)
    setNuevo(true)
  }

  async function crearUsuario() {
    setEnviando(true)
    setFormError(null)
    const res = await getApi().crearUsuarioPlataforma({
      nombre: form.nombre,
      email: form.email,
      password: form.password,
      rol: form.rol as RolPersonal,
      restauranteId: form.restauranteId,
    })
    setEnviando(false)
    if (res.error) {
      setFormError(res.error)
      return
    }
    setNuevo(false)
    setAviso(`Usuario «${res.data?.nombre}» creado con su cuenta de acceso.`)
    await cargar()
  }

  function pedirDesactivacion(u: UsuarioPlataforma) {
    setAviso(null)
    setCambioError(null)
    setCambio({ u, activar: false })
  }

  async function reactivar(u: UsuarioPlataforma) {
    setAviso(null)
    setCambioError(null)
    const res = await getApi().adminCambiarEstadoUsuario(u.id, true)
    if (res.error) {
      setCambioError(res.error)
      return
    }
    setAviso(`«${u.nombre}» vuelve a estar activo.`)
    await cargar()
  }

  async function aplicarCambio() {
    if (!cambio) return
    setCambiando(true)
    setCambioError(null)
    const res = await getApi().adminCambiarEstadoUsuario(cambio.u.id, cambio.activar)
    setCambiando(false)
    if (res.error) {
      setCambioError(res.error)
      return
    }
    const nombre = cambio.u.nombre
    const activar = cambio.activar
    setCambio(null)
    setAviso(
      activar
        ? `«${nombre}» vuelve a estar activo.`
        : `«${nombre}» quedó desactivado. No se borró nada: puede volver a activarse cuando quieras.`,
    )
    await cargar()
  }

  if (cargando) return <SuperAdminCarga recurso="los usuarios" />

  if (error)
    return (
      <div role="alert" className="aviso border-danger-500/40 bg-danger-500/10 text-danger-500">
        No se pudieron cargar los usuarios. {error}
      </div>
    )

  return (
    <div>
      <div className="sa-controls mb-5 flex flex-wrap items-center gap-3">
        <input
          type="search"
          className="input min-h-11 w-full sm:max-w-xs"
          placeholder="Buscar por nombre o correo…"
          aria-label="Buscar usuarios"
          value={criterios.busqueda}
          onChange={(e) => cambiar('busqueda', e.target.value)}
        />

        <select
          className="input min-h-11 w-auto"
          aria-label="Filtrar por rol"
          value={criterios.rol}
          onChange={(e) => cambiar('rol', e.target.value as FiltroRolUsuarios)}
        >
          <option value="todos">Rol: todos</option>
          {ROLES_PERSONAL.map((rol) => (
            <option key={rol} value={rol}>
              Rol: {rolLabel(rol)}
            </option>
          ))}
        </select>

        <select
          className="input min-h-11 w-auto"
          aria-label="Filtrar por restaurante"
          value={criterios.restaurante}
          onChange={(e) => cambiar('restaurante', e.target.value)}
        >
          <option value="todos">Restaurante: todos</option>
          {restaurantes.map((r) => (
            <option key={r.id} value={r.id}>
              Restaurante: {r.nombre}
            </option>
          ))}
        </select>

        <select
          className="input min-h-11 w-auto"
          aria-label="Filtrar por estado"
          value={criterios.estado}
          onChange={(e) => cambiar('estado', e.target.value as FiltroEstadoUsuarios)}
        >
          {ESTADOS.map((e) => (
            <option key={e.valor} value={e.valor}>
              {e.texto}
            </option>
          ))}
        </select>

        <select
          className="input min-h-11 w-auto"
          aria-label="Ordenar usuarios"
          value={criterios.orden}
          onChange={(e) => cambiar('orden', e.target.value as OrdenUsuarios)}
        >
          {ORDENES_USUARIOS.map((o) => (
            <option key={o.valor} value={o.valor}>
              {o.texto}
            </option>
          ))}
        </select>

        {conFiltros && (
          <button
            type="button"
            className="btn btn-outline min-h-11 px-4"
            onClick={() => setCriterios((c) => ({ ...CRITERIOS_USUARIOS_VACIOS, orden: c.orden }))}
          >
            Limpiar filtros
          </button>
        )}

        <button
          type="button"
          className="btn min-h-11 bg-brand-500 px-4 text-white transition-colors hover:bg-brand-500/90"
          onClick={abrirNuevo}
        >
          Nuevo usuario
        </button>

        <span className="ml-auto text-xs text-zinc-500" aria-live="polite">
          {filtrados.length} de {usuarios.length}
        </span>
      </div>

      {aviso && <div className="aviso mb-5 border-ok-500/30 bg-ok-500/10 text-ok-500">{aviso}</div>}
      {!aviso && cambioError && !cambio && (
        <div className="aviso mb-5 border-danger-500/40 bg-danger-500/10 text-danger-500">
          {cambioError}
        </div>
      )}

      {usuarios.length === 0 ? (
        <EstadoVacio
          icono={
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          }
          titulo="Todavía no hay usuarios"
          descripcion="Da de alta tu primer usuario con su cuenta de acceso desde «Nuevo usuario»."
        />
      ) : filtrados.length === 0 ? (
        <EstadoVacio
          icono={
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4.3-4.3" />
            </svg>
          }
          titulo="Ningún usuario coincide con los filtros"
          descripcion="Ajusta los filtros o límpialos para volver a ver toda la lista."
        />
      ) : (
        <div className="sa-table-shell overflow-hidden rounded-2xl border border-surface-800 bg-surface-900 shadow-sm shadow-black/30">
          <div className="sa-table-scroll overflow-x-auto">
            <table className="sa-mobile-table sa-table-usuarios w-full text-sm">
              <thead>
                <tr className="border-b border-surface-700 bg-surface-800/60 text-left text-xs uppercase tracking-widest text-zinc-400">
                  <th className="px-4 py-3.5 font-semibold">Nombre</th>
                  <th className="px-4 py-3.5 font-semibold">Rol</th>
                  <th className="px-4 py-3.5 font-semibold">Restaurante</th>
                  <th className="px-4 py-3.5 font-semibold">Estado</th>
                  <th className="hidden px-4 py-3.5 font-semibold md:table-cell">Alta</th>
                  <th className="hidden px-4 py-3.5 font-semibold lg:table-cell">Último acceso</th>
                  <th className="px-4 py-3.5 font-semibold">
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-800">
                {filtrados.map((u) => (
                  <tr key={u.id} className="transition-colors hover:bg-surface-800/60">
                    <td className="px-4 py-3.5">
                      <p className="font-semibold text-zinc-100">{u.nombre}</p>
                      <p className="text-xs text-zinc-500">{u.email ?? '—'}</p>
                    </td>
                    <td className="px-4 py-3.5 text-zinc-300">{rolLabel(u.rol)}</td>
                    <td className="px-4 py-3.5 text-zinc-300">
                      {nombreRestaurante(u.restaurante_id)}
                    </td>
                    <td className="px-4 py-3.5">
                      <ChipUsuario activo={u.activo} />
                    </td>
                    <td className="hidden px-4 py-3.5 text-zinc-400 md:table-cell">
                      {fmtFecha(u.created_at)}
                    </td>
                    <td className="hidden px-4 py-3.5 text-zinc-400 lg:table-cell">
                      {labelUltimoAcceso(ultimosAccesos[u.id])}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          className="btn btn-outline min-h-11 px-3 text-xs"
                          onClick={() => setDetalle(u)}
                        >
                          Ver
                        </button>
                        {u.activo ? (
                          <button
                            type="button"
                            className="btn btn-outline min-h-11 px-3 text-xs"
                            onClick={() => pedirDesactivacion(u)}
                            disabled={u.id === usuario?.id}
                            title={u.id === usuario?.id ? 'No puedes desactivar tu propia cuenta.' : undefined}
                          >
                            Desactivar
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="btn min-h-11 bg-ok-500 px-3 text-xs text-white transition-colors hover:bg-ok-500/90"
                            onClick={() => void reactivar(u)}
                          >
                            Reactivar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {nuevo && (
        <Modal titulo="Nuevo usuario" onCerrar={() => setNuevo(false)}>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void crearUsuario()
            }}
          >
            <Campo etiqueta="Nombre" htmlFor="u-nombre" error={null}>
              <input
                id="u-nombre"
                className="input"
                required
                maxLength={120}
                value={form.nombre}
                onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
              />
            </Campo>

            <Campo etiqueta="Correo" htmlFor="u-email" error={null}>
              <input
                id="u-email"
                type="email"
                className="input"
                required
                maxLength={160}
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
            </Campo>

            <Campo
              etiqueta="Contraseña inicial (mínimo 8 caracteres)"
              htmlFor="u-pass"
              error={null}
            >
              <input
                id="u-pass"
                type="password"
                className="input"
                required
                minLength={8}
                autoComplete="new-password"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              />
            </Campo>

            <Campo etiqueta="Rol" htmlFor="u-rol" error={null}>
              <select
                id="u-rol"
                className="input"
                required
                value={form.rol}
                onChange={(e) => setForm((f) => ({ ...f, rol: e.target.value }))}
              >
                {ROLES_PERSONAL.map((rol) => (
                  <option key={rol} value={rol}>
                    {rolLabel(rol)}
                  </option>
                ))}
              </select>
            </Campo>

            <Campo etiqueta="Restaurante" htmlFor="u-restaurante" error={null}>
              <select
                id="u-restaurante"
                className="input"
                required
                value={form.restauranteId}
                onChange={(e) => setForm((f) => ({ ...f, restauranteId: e.target.value }))}
              >
                <option value="" disabled>
                  Elegí un restaurante…
                </option>
                {restaurantes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.nombre}
                  </option>
                ))}
              </select>
            </Campo>

            <p className="rounded-xl border border-brand-500/30 bg-brand-500/10 px-4 py-3 text-xs leading-relaxed text-brand-300">
              Se crea la cuenta de acceso (Auth) y el perfil en su restaurante. El rol de super
              administrador no se asigna desde acá.
            </p>

            {formError && (
              <div className="aviso mt-4 border-danger-500/40 bg-danger-500/10 text-danger-500">
                {formError}
              </div>
            )}

            <PieAcciones
              onCancelar={() => setNuevo(false)}
              enviando={enviando}
              textoEnvio="Creando…"
              labelGuardar="Crear usuario"
            />
          </form>
        </Modal>
      )}

      {cambio && (
        <ConfirmDialog
          titulo="¿Desactivar usuario?"
          mensaje={
            <>
              Se desactiva a <strong>{cambio.u.nombre}</strong>. No se borra nada: la fila y su
              cuenta de Auth siguen existiendo, pero deja de poder operar hasta que la reactives.
            </>
          }
          confirmLabel="Sí, desactivar"
          cargandoLabel="Desactivando…"
          cargando={cambiando}
          error={cambioError}
          onConfirmar={() => {
            void aplicarCambio()
          }}
          onCancelar={() => {
            setCambio(null)
            setCambioError(null)
          }}
        />
      )}

      {detalle && (
        <Modal titulo="Detalle del usuario" onCerrar={() => setDetalle(null)}>
          <dl className="space-y-4">
            {[
              { t: 'Nombre', v: detalle.nombre },
              { t: 'Correo', v: detalle.email ?? '—' },
              { t: 'Rol', v: rolLabel(detalle.rol) },
              { t: 'Restaurante', v: nombreRestaurante(detalle.restaurante_id) },
              { t: 'Fecha de alta', v: fmtFecha(detalle.created_at) },
              { t: 'Último acceso', v: labelUltimoAcceso(ultimosAccesos[detalle.id]) },
            ].map((f) => (
              <div key={f.t} className="flex items-baseline justify-between gap-4 border-b border-surface-800 pb-3">
                <dt className="text-xs font-semibold uppercase tracking-widest text-zinc-500">{f.t}</dt>
                <dd className="text-right text-sm font-medium text-zinc-100">{f.v}</dd>
              </div>
            ))}
            <div className="flex items-center justify-between gap-4">
              <dt className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Estado</dt>
              <dd>
                <ChipUsuario activo={detalle.activo} />
              </dd>
            </div>
          </dl>

          <div className="mt-6 flex justify-end">
            <button
              type="button"
              className="btn btn-outline min-h-11 px-4"
              onClick={() => setDetalle(null)}
            >
              Cerrar
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
