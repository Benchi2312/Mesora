import { useCallback, useEffect, useMemo, useState } from 'react'
import { getApi } from '../../lib/api'
import type { UsuarioPlataforma } from '../../lib/api'
import { fmtFecha } from '../../lib/format'
import {
  CRITERIOS_USUARIOS_VACIOS,
  filtrarUsuarios,
  hayFiltrosUsuarios,
  labelUltimoAcceso,
} from '../../domain/platform/usuarios'
import type { CriteriosUsuarios, FiltroEstadoUsuarios } from '../../domain/platform/usuarios'
import type { Restaurante } from '../../types/database'
import { useAuthStore } from '../../store/auth'
import SuperAdminCarga from './SuperAdminCarga'
import EstadoVacio from '../../components/EstadoVacio'
import { ConfirmDialog } from '../../components/ui'
import { ChipUsuario } from './Chips'

const ESTADOS: { valor: FiltroEstadoUsuarios; texto: string }[] = [
  { valor: 'todos', texto: 'Estado: todos' },
  { valor: 'activos', texto: 'Estado: activos' },
  { valor: 'inactivos', texto: 'Estado: inactivos' },
]

export default function SuperAdminAdministradores() {
  const usuario = useAuthStore((s) => s.usuario)

  const [usuarios, setUsuarios] = useState<UsuarioPlataforma[]>([])
  const [restaurantes, setRestaurantes] = useState<Restaurante[]>([])
  const [ultimosAccesos, setUltimosAccesos] = useState<Record<string, string | null>>({})
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [criterios, setCriterios] = useState<CriteriosUsuarios>(CRITERIOS_USUARIOS_VACIOS)
  const [aviso, setAviso] = useState<string | null>(null)

  const [cambio, setCambio] = useState<{ u: UsuarioPlataforma; activar: boolean } | null>(null)
  const [cambiando, setCambiando] = useState(false)
  const [cambioError, setCambioError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    const api = getApi()
    const [uRes, rRes, aRes] = await Promise.all([
      api.getUsuariosPlataforma(),
      api.getRestaurantes(),
      api.getUltimosAccesos(),
    ])
    if (uRes.error || rRes.error || aRes.error) {
      setError(uRes.error ?? rRes.error ?? aRes.error ?? 'Error al cargar los administradores')
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

  // Solo administradores de cuenta: el resto de usuarios vive en el panel Usuarios.
  const administradores = useMemo(
    () => usuarios.filter((u) => u.rol === 'admin_restaurante'),
    [usuarios],
  )
  const filtrados = useMemo(
    () => filtrarUsuarios(administradores, criterios),
    [administradores, criterios],
  )
  const conFiltros = hayFiltrosUsuarios(criterios)

  function cambiar<K extends keyof CriteriosUsuarios>(campo: K, valor: CriteriosUsuarios[K]) {
    setCriterios((c) => ({ ...c, [campo]: valor }))
  }

  const nombreRestaurante = (rid: string | null) =>
    restaurantes.find((r) => r.id === rid)?.nombre ?? 'Sin restaurante'

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

  if (cargando) return <SuperAdminCarga recurso="los administradores" />

  if (error)
    return (
      <div role="alert" className="aviso border-danger-500/40 bg-danger-500/10 text-danger-500">
        No se pudieron cargar los administradores. {error}
      </div>
    )

  return (
    <div>
      <div className="sa-controls mb-5 flex flex-wrap items-center gap-3">
        <input
          type="search"
          className="input min-h-11 w-full sm:max-w-xs"
          placeholder="Buscar por nombre o correo…"
          aria-label="Buscar administradores"
          value={criterios.busqueda}
          onChange={(e) => cambiar('busqueda', e.target.value)}
        />

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
          onChange={(e) => cambiar('estado', e.target.value as CriteriosUsuarios['estado'])}
        >
          {ESTADOS.map((e) => (
            <option key={e.valor} value={e.valor}>
              {e.texto}
            </option>
          ))}
        </select>

        {conFiltros && (
          <button
            type="button"
            className="btn btn-outline min-h-11 px-4"
            onClick={() => setCriterios(CRITERIOS_USUARIOS_VACIOS)}
          >
            Limpiar filtros
          </button>
        )}

        <span className="ml-auto text-xs text-zinc-500" aria-live="polite">
          {filtrados.length} de {administradores.length}
        </span>
      </div>

      {aviso && <div className="aviso mb-5 border-ok-500/30 bg-ok-500/10 text-ok-500">{aviso}</div>}
      {!aviso && cambioError && !cambio && (
        <div className="aviso mb-5 border-danger-500/40 bg-danger-500/10 text-danger-500">
          {cambioError}
        </div>
      )}

      {administradores.length === 0 ? (
        <EstadoVacio
          icono={
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          }
          titulo="No hay administradores registrados todavía"
          descripcion="Los administradores se crean al dar de alta un restaurante o designándolos desde el detalle de cada restaurante."
        />
      ) : filtrados.length === 0 ? (
        <EstadoVacio
          icono={
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4.3-4.3" />
            </svg>
          }
          titulo="Ningún administrador coincide con los filtros"
          descripcion="Ajusta los filtros o límpialos para volver a ver toda la lista."
        />
      ) : (
        <div className="sa-table-shell overflow-hidden rounded-2xl border border-surface-800 bg-surface-900 shadow-sm shadow-black/30">
          <div className="sa-table-scroll overflow-x-auto">
            <table className="sa-mobile-table sa-table-administradores w-full text-sm">
              <thead>
                <tr className="border-b border-surface-700 bg-surface-800/60 text-left text-xs uppercase tracking-widest text-zinc-400">
                  <th className="px-4 py-3.5 font-semibold">Administrador</th>
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
                {filtrados.map((a) => (
                  <tr key={a.id} className="transition-colors hover:bg-surface-800/60">
                    <td className="px-4 py-3.5">
                      <p className="font-semibold text-zinc-100">{a.nombre}</p>
                      <p className="text-xs text-zinc-500">{a.email ?? '—'}</p>
                    </td>
                    <td className="px-4 py-3.5 text-zinc-300">
                      {nombreRestaurante(a.restaurante_id)}
                    </td>
                    <td className="px-4 py-3.5">
                      <ChipUsuario activo={a.activo} />
                    </td>
                    <td className="hidden px-4 py-3.5 text-zinc-400 md:table-cell">
                      {fmtFecha(a.created_at)}
                    </td>
                    <td className="hidden px-4 py-3.5 text-zinc-400 lg:table-cell">
                      {labelUltimoAcceso(ultimosAccesos[a.id])}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex justify-end">
                        {a.activo ? (
                          <button
                            type="button"
                            className="btn btn-outline min-h-11 px-3 text-xs"
                            onClick={() => pedirDesactivacion(a)}
                            disabled={a.id === usuario?.id}
                            title={a.id === usuario?.id ? 'No puedes desactivar tu propia cuenta.' : undefined}
                          >
                            Desactivar
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="btn min-h-11 bg-ok-500 px-3 text-xs text-white transition-colors hover:bg-ok-500/90"
                            onClick={() => void reactivar(a)}
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
    </div>
  )
}
