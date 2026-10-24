import { useCallback, useEffect, useRef, useState } from 'react'
import { useCurrentContext } from '../../lib/useCurrentContext'
import { getApi } from '../../lib/api'
import { useDemoStore } from '../../demo/demoStore'
import { PREFILL_GUIA, prefillDe } from '../../demo/guia'
import { escribirSecuencia } from '../../demo/escritura'
import type { Mesa, Zona } from '../../types/database'
import { Spinner } from '../../components/LoadingScreen'
import EstadoVacio from '../../components/EstadoVacio'
import { Campo, ConfirmDialog, IconoBasura, IconoLapiz, IconoMas, Modal, PieAcciones } from '../../components/ui'

type ModalZona = { accion: 'crear' | 'editar'; id?: string; nombre: string } | null
type ModalMesa = { accion: 'crear' | 'editar'; id?: string; zonaId: string; nombre: string } | null
type Confirmar = { tipo: 'zona' | 'mesa'; id: string; nombre: string } | null

export default function MesasZonasTab() {
  const { restaurante } = useCurrentContext()
  const rid = restaurante?.id
  const isDemo = useDemoStore((s) => s.isDemo)
  const prefillGuia = useDemoStore((s) => s.prefillGuia)
  const solicitud = useDemoStore((s) => s.solicitud)
  const limpiarSolicitud = useDemoStore((s) => s.limpiarSolicitud)
  const setAutoLlenado = useDemoStore((s) => s.setAutoLlenado)
  const prefill = prefillDe(isDemo, prefillGuia)

  const [zonas, setZonas] = useState<Zona[]>([])
  const [mesas, setMesas] = useState<Mesa[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [modalZona, setModalZona] = useState<ModalZona>(null)
  const [zonaError, setZonaError] = useState<string | null>(null)
  const [modalMesa, setModalMesa] = useState<ModalMesa>(null)
  const [mesaError, setMesaError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const [confirmar, setConfirmar] = useState<Confirmar>(null)
  const [confirmError, setConfirmError] = useState<string | null>(null)
  const [confirmCargando, setConfirmCargando] = useState(false)

  const cargar = useCallback(async () => {
    if (!rid) return
    const api = getApi()
    const [zRes, mRes] = await Promise.all([api.getZonas(rid), api.getMesas(rid)])
    if (zRes.error || mRes.error) {
      setError(zRes.error ?? mRes.error ?? 'Error al cargar mesas y zonas')
      return
    }
    setZonas(zRes.data ?? [])
    setMesas(mRes.data ?? [])
    setError(null)
  }, [rid])

  useEffect(() => {
    if (!rid) {
      setCargando(false)
      return
    }
    setCargando(true)
    void cargar().finally(() => setCargando(false))
  }, [rid, cargar])

  // «Hazlo por mí»: abre el formulario de zona o de mesa y escribe los datos
  // letra a letra para que el usuario VEA cómo se rellenan antes de confirmar.
  // La solicitud se limpia al consumirla y la animación se cancela al cerrar.
  const escrituraRef = useRef<(() => void) | null>(null)
  const [campoActivo, setCampoActivo] = useState(false)

  const detenerEscritura = useCallback(() => {
    escrituraRef.current?.()
    escrituraRef.current = null
    setCampoActivo(false)
    setAutoLlenado(false)
  }, [setAutoLlenado])

  // Al desmontar (cambiar de pestaña) no puede quedar ningún temporizador vivo:
  // el panel de la guía tiene que volver a su sitio.
  useEffect(() => () => detenerEscritura(), [detenerEscritura])

  useEffect(() => {
    // Se espera a que el tab haya cargado: si se escribe mientras se ve el
    // spinner, el usuario se pierde la animación y el modal aparece ya lleno.
    if (!solicitud || cargando) return
    // El demo siempre escribe los datos sugeridos. `prefill` puede ser null
    // tras recargar el navegador (el recorrido se restaura, el flag no), así
    // que se usa PREFILL_GUIA como respaldo: la simulación nunca queda vacía.
    const datos = prefill ?? PREFILL_GUIA
    const escribir = (texto: string, aplicar: (t: string) => void) => {
      detenerEscritura()
      setAutoLlenado(true)
      setCampoActivo(true)
      escrituraRef.current = escribirSecuencia(
        [{ texto, aplicar }],
        (indice) => {
          if (indice < 0) {
            setCampoActivo(false)
            setAutoLlenado(false)
          }
        },
        { msPorLetra: 55 },
      )
    }
    if (solicitud.form === 'zona') {
      setZonaError(null)
      setModalZona({ accion: 'crear', nombre: '' })
      limpiarSolicitud()
      escribir(datos.zona, (texto) => setModalZona((m) => (m ? { ...m, nombre: texto } : m)))
      return
    }
    if (solicitud.form === 'mesa') {
      const zonaId = zonas[0]?.id
      // Sin zonas no se puede crear una mesa: se ofrece crear la zona primero
      // para que la guía no se quede esperando una solicitud que no puede usar.
      if (!zonaId) {
        setZonaError(null)
        setModalZona({ accion: 'crear', nombre: '' })
        limpiarSolicitud()
        escribir(datos.zona, (texto) => setModalZona((m) => (m ? { ...m, nombre: texto } : m)))
        return
      }
      setMesaError(null)
      setModalMesa({ accion: 'crear', zonaId, nombre: '' })
      limpiarSolicitud()
      escribir(datos.mesa, (texto) => setModalMesa((m) => (m ? { ...m, nombre: texto } : m)))
    }
  }, [solicitud, cargando, zonas, prefill, limpiarSolicitud, detenerEscritura, setAutoLlenado])

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

  async function guardarZona() {
    if (!rid || !modalZona) return
    detenerEscritura()
    const nombre = modalZona.nombre.trim()
    if (!nombre) {
      setZonaError('El nombre es obligatorio.')
      return
    }
    setZonaError(null)
    setEnviando(true)
    const api = getApi()
    const res =
      modalZona.accion === 'crear'
        ? await api.crearZona(rid, nombre)
        : await api.actualizarZona(rid, modalZona.id as string, nombre)
    setEnviando(false)
    if (res.error) {
      setZonaError(res.error)
      return
    }
    setModalZona(null)
    await cargar()
  }

  async function guardarMesa() {
    if (!rid || !modalMesa) return
    detenerEscritura()
    const nombre = modalMesa.nombre.trim()
    if (!nombre) {
      setMesaError('El nombre es obligatorio.')
      return
    }
    if (!modalMesa.zonaId) {
      setMesaError('Elige una zona para la mesa.')
      return
    }
    setMesaError(null)
    setEnviando(true)
    const api = getApi()
    const res =
      modalMesa.accion === 'crear'
        ? await api.crearMesa(rid, { nombre, zona_id: modalMesa.zonaId })
        : await api.actualizarMesa(rid, modalMesa.id as string, { nombre, zona_id: modalMesa.zonaId })
    setEnviando(false)
    if (res.error) {
      setMesaError(res.error)
      return
    }
    setModalMesa(null)
    await cargar()
  }

  async function ejecutarEliminacion() {
    if (!rid || !confirmar) return
    setConfirmCargando(true)
    setConfirmError(null)
    const api = getApi()
    const res =
      confirmar.tipo === 'zona'
        ? await api.eliminarZona(rid, confirmar.id)
        : await api.eliminarMesa(rid, confirmar.id)
    setConfirmCargando(false)
    if (res.error) {
      setConfirmError(res.error)
      return
    }
    setConfirmar(null)
    await cargar()
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-zinc-100">Mesas y zonas</h2>
          <p className="mt-0.5 text-sm text-zinc-500">Organiza el salón en zonas y agrega tus mesas.</p>
        </div>
        <button
          type="button"
          data-guia="nueva-zona"
          onClick={() => {
            detenerEscritura()
            setZonaError(null)
            setModalZona({ accion: 'crear', nombre: prefill?.zona ?? '' })
          }}
          className="btn btn-primary min-h-11 px-4"
        >
          <IconoMas />
          Nueva zona
        </button>
      </div>

      {zonas.length === 0 && (
        <EstadoVacio
          titulo="No hay zonas creadas todavía"
          descripcion="Crea tu primera zona (Salón, Terraza…) para agrupar tus mesas."
        />
      )}

      <div className="space-y-5">
        {zonas.map((zona) => {
          const ms = mesas.filter((m) => m.zona_id === zona.id)
          const bloqueada = ms.length > 0
          return (
            <section key={zona.id} className="card p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="flex items-center gap-2 text-base font-bold tracking-tight text-zinc-100">
                    {zona.nombre}
                    <span className="chip chip-neutral px-2 py-0.5 text-xs">
                      {ms.length} {ms.length === 1 ? 'mesa' : 'mesas'}
                    </span>
                  </h3>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setZonaError(null)
                      setModalZona({ accion: 'editar', id: zona.id, nombre: zona.nombre })
                    }}
                    className="btn btn-ghost min-h-11 border border-surface-800 px-3"
                  >
                    <IconoLapiz />
                    Editar
                  </button>
                  <button
                    type="button"
                    disabled={bloqueada}
                    title={bloqueada ? `Elimina primero las mesas de «${zona.nombre}»` : `Eliminar ${zona.nombre}`}
                    onClick={() => setConfirmar({ tipo: 'zona', id: zona.id, nombre: zona.nombre })}
                    className="btn btn-ghost h-11 w-11 p-0 text-zinc-400 hover:text-danger-500 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-zinc-400"
                  >
                    <IconoBasura />
                  </button>
                </div>
              </div>

              {bloqueada && (
                <p className="mt-2 text-xs text-danger-500/80">
                  Esta zona tiene mesas asociadas. Elimínalas primero para poder quitar la zona.
                </p>
              )}

              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {ms.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-surface-800 bg-surface-950/40 px-3.5 py-1.5"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span
                        className={`h-2 w-2 shrink-0 rounded-full ${m.estado === 'ocupada' ? 'bg-brand-500' : 'bg-ok-500'}`}
                      />
                      <span className="truncate text-sm font-semibold text-zinc-200">{m.nombre}</span>
                      <span className="shrink-0 text-xs text-zinc-500">
                        {m.estado === 'ocupada' ? 'Ocupada' : 'Libre'}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <button
                        type="button"
                        aria-label={`Editar ${m.nombre}`}
                        onClick={() => {
                          setMesaError(null)
                          setModalMesa({ accion: 'editar', id: m.id, zonaId: m.zona_id, nombre: m.nombre })
                        }}
                        className="btn btn-ghost h-11 w-11 p-0"
                      >
                        <IconoLapiz />
                      </button>
                      <button
                        type="button"
                        aria-label={`Eliminar ${m.nombre}`}
                        onClick={() => setConfirmar({ tipo: 'mesa', id: m.id, nombre: m.nombre })}
                        className="btn btn-ghost h-11 w-11 p-0 text-zinc-400 hover:text-danger-500"
                      >
                        <IconoBasura />
                      </button>
                    </div>
                  </div>
                ))}

                <button
                  type="button"
                  data-guia="agregar-mesa"
                  onClick={() => {
                    detenerEscritura()
                    setMesaError(null)
                    setModalMesa({ accion: 'crear', zonaId: zona.id, nombre: prefill?.mesa ?? '' })
                  }}
                  className="flex min-h-11 touch-manipulation items-center justify-center gap-1.5 rounded-xl border border-dashed border-surface-700 px-3 text-sm font-semibold text-zinc-400 transition hover:border-brand-500/60 hover:bg-brand-500/5 hover:text-brand-400 active:scale-[0.99]"
                >
                  <IconoMas className="h-4 w-4" />
                  Agregar mesa
                </button>
              </div>
            </section>
          )
        })}
      </div>

      {/* Modal zona */}
      {modalZona && (
        <Modal
          titulo={modalZona.accion === 'crear' ? 'Nueva zona' : 'Editar zona'}
          onCerrar={() => {
            detenerEscritura()
            setModalZona(null)
          }}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void guardarZona()
            }}
          >
            <Campo etiqueta="Nombre" htmlFor="zona-nombre" error={zonaError}>
              <input
                id="zona-nombre"
                autoFocus
                value={modalZona.nombre}
                onFocus={(e) => {
                  if (prefill) e.currentTarget.select()
                }}
                onChange={(e) => setModalZona({ ...modalZona, nombre: e.target.value })}
                className={`input ${campoActivo ? 'ring-2 ring-brand-500' : ''}`}
                placeholder="Ej. Salón principal"
              />
            </Campo>
            {campoActivo && (
              <p className="mt-2 text-xs font-medium text-brand-400">
                Mesora está escribiendo por ti… confirma con «Crear zona».
              </p>
            )}
            <PieAcciones
              onCancelar={() => {
                detenerEscritura()
                setModalZona(null)
              }}
              enviando={enviando}
              textoEnvio="Guardando…"
              labelGuardar={modalZona.accion === 'crear' ? 'Crear zona' : 'Guardar cambios'}
              guia="zona-guardar"
            />
          </form>
        </Modal>
      )}

      {/* Modal mesa */}
      {modalMesa && (
        <Modal
          titulo={modalMesa.accion === 'crear' ? 'Agregar mesa' : 'Editar mesa'}
          onCerrar={() => {
            detenerEscritura()
            setModalMesa(null)
          }}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void guardarMesa()
            }}
          >
            <Campo etiqueta="Zona" htmlFor="mesa-zona" error={null}>
              <select
                id="mesa-zona"
                value={modalMesa.zonaId}
                onChange={(e) => setModalMesa({ ...modalMesa, zonaId: e.target.value })}
                className="input h-11"
              >
                {zonas.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.nombre}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo etiqueta="Nombre" htmlFor="mesa-nombre" error={mesaError}>
              <input
                id="mesa-nombre"
                autoFocus
                value={modalMesa.nombre}
                onFocus={(e) => {
                  if (prefill) e.currentTarget.select()
                }}
                onChange={(e) => setModalMesa({ ...modalMesa, nombre: e.target.value })}
                className={`input ${campoActivo ? 'ring-2 ring-brand-500' : ''}`}
                placeholder="Ej. Mesa 10"
              />
            </Campo>
            {campoActivo && (
              <p className="mt-2 text-xs font-medium text-brand-400">
                Mesora está escribiendo por ti… confirma con «Crear mesa».
              </p>
            )}
            <PieAcciones
              onCancelar={() => {
                detenerEscritura()
                setModalMesa(null)
              }}
              enviando={enviando}
              textoEnvio="Guardando…"
              labelGuardar={modalMesa.accion === 'crear' ? 'Crear mesa' : 'Guardar cambios'}
              guia="mesa-guardar"
            />
          </form>
        </Modal>
      )}

      {/* Confirmación de eliminación */}
      {confirmar && (
        <ConfirmDialog
          titulo={confirmar.tipo === 'zona' ? 'Eliminar zona' : 'Eliminar mesa'}
          mensaje={
            confirmar.tipo === 'zona'
              ? `¿Eliminar la zona «${confirmar.nombre}»? Esta acción no se puede deshacer.`
              : `¿Eliminar la mesa «${confirmar.nombre}»? Esta acción no se puede deshacer.`
          }
          error={confirmError}
          onCancelar={() => {
            setConfirmar(null)
            setConfirmError(null)
          }}
          onConfirmar={() => void ejecutarEliminacion()}
          cargando={confirmCargando}
        />
      )}
    </div>
  )
}