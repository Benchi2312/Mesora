import { useCallback, useEffect, useRef, useState } from 'react'
import { useCurrentContext } from '../../lib/useCurrentContext'
import { getApi } from '../../lib/api'
import { useDemoStore } from '../../demo/demoStore'
import { PREFILL_GUIA, prefillDe } from '../../demo/guia'
import { escribirSecuencia } from '../../demo/escritura'
import type { DatosProducto } from '../../lib/api'
import type { CategoriaProducto, Producto } from '../../types/database'
import { Spinner } from '../../components/LoadingScreen'
import EstadoVacio from '../../components/EstadoVacio'
import { fmtPEN } from '../../lib/format'
import { Campo, ConfirmDialog, IconoBasura, IconoLapiz, IconoMas, Modal, PieAcciones } from '../../components/ui'

type ModalCategoria = { accion: 'crear' | 'editar'; id?: string; nombre: string } | null
type ModalProducto = {
  accion: 'crear' | 'editar'
  id?: string
  categoriaId: string
  nombre: string
  descripcion: string
  imagenUrl: string
  precio: string
  disponible: boolean
  esPromocion: boolean
  precioPromocion: string
  esBebida: boolean
} | null
type Confirmar = { tipo: 'categoria' | 'producto'; id: string; nombre: string } | null
/** Campo del formulario que el autocompletado está rellenando ahora mismo. */
type CampoAuto = 'categoria' | 'nombre' | 'precio'

function precioValido(s: string): number | null {
  const n = Number.parseFloat(s)
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.round(n * 100) / 100
}

export default function MenuTab() {
  const { restaurante } = useCurrentContext()
  const rid = restaurante?.id
  const isDemo = useDemoStore((s) => s.isDemo)
  const prefillGuia = useDemoStore((s) => s.prefillGuia)
  const solicitud = useDemoStore((s) => s.solicitud)
  const limpiarSolicitud = useDemoStore((s) => s.limpiarSolicitud)
  const setAutoLlenado = useDemoStore((s) => s.setAutoLlenado)
  const prefill = prefillDe(isDemo, prefillGuia)

  const [categorias, setCategorias] = useState<CategoriaProducto[]>([])
  const [productos, setProductos] = useState<Producto[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [modalCategoria, setModalCategoria] = useState<ModalCategoria>(null)
  const [categoriaError, setCategoriaError] = useState<string | null>(null)
  const [modalProducto, setModalProducto] = useState<ModalProducto>(null)
  const [productoError, setProductoError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const [confirmar, setConfirmar] = useState<Confirmar>(null)
  const [confirmError, setConfirmError] = useState<string | null>(null)
  const [confirmCargando, setConfirmCargando] = useState(false)

  const cargar = useCallback(async () => {
    if (!rid) return
    const api = getApi()
    // El Admin sí ve los agotados: tiene que poder reponerlos.
    const [cRes, pRes] = await Promise.all([
      api.getCategorias(rid),
      api.getProductos(rid, { incluirAgotados: true }),
    ])
    if (cRes.error || pRes.error) {
      setError(cRes.error ?? pRes.error ?? 'Error al cargar el menú')
      return
    }
    setCategorias(cRes.data ?? [])
    setProductos(pRes.data ?? [])
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

  // ------------------------------------------------------- autocompletado demo
  // «Hazlo por mí» rellena el formulario de producto a la vista del usuario:
  // elige la categoría, escribe el nombre letra a letra y el precio número por
  // número. El campo que se está rellenando brilla, y al terminar el botón de
  // guardar late para que el usuario lo pulse él.
  const [autoLlenando, setAutoLlenando] = useState(false)
  const [campoActivo, setCampoActivo] = useState<CampoAuto | null>(null)
  const [pulsoGuardar, setPulsoGuardar] = useState(false)
  const [categoriaAuto, setCategoriaAuto] = useState('')
  // Cada «Hazlo por mí» es una corrida nueva: el número reinicia la secuencia
  // aunque el formulario siga abierto.
  const [corrida, setCorrida] = useState(0)
  // Canceladores: el de la secuencia en curso y el de la preparación (crear la
  // categoría). Ambos se limpian al cerrar el modal, al pedir otra simulación
  // o al desmontar: nunca puede quedar un temporizador vivo.
  const secuenciaRef = useRef<(() => void) | null>(null)
  const autoRef = useRef<object | null>(null)
  const categoriasRef = useRef(categorias)
  categoriasRef.current = categorias

  const detenerAutoLlenado = useCallback(() => {
    autoRef.current = null
    secuenciaRef.current?.()
    secuenciaRef.current = null
    setAutoLlenando(false)
    setCampoActivo(null)
    setPulsoGuardar(false)
    setAutoLlenado(false)
  }, [setAutoLlenado])

  // Al desmontar (o al cambiar de pestaña) se corta la simulación.
  useEffect(
    () => () => {
      autoRef.current = null
      secuenciaRef.current?.()
      secuenciaRef.current = null
      // Si el usuario cambia de pestaña a media simulación, el panel de la guía
      // tiene que volver a su sitio.
      setAutoLlenado(false)
    },
    [setAutoLlenado],
  )

  // «Hazlo por mí»: abre el formulario del plato y lo deja a medio camino de
  // guardarse. Si el restaurante no tiene la categoría «PROMOS» se crea
  // primero: el demo arranca con el menú vacío.
  useEffect(() => {
    if (!solicitud || solicitud.form !== 'producto') return
    // Se espera a que el menú esté cargado: si la simulación empieza con el
    // spinner en pantalla, el modal aparece ya relleno y el usuario se pierde
    // exactamente lo que quería ver (cómo se escribe solo).
    if (cargando) return
    // La solicitud se consume de inmediato: la simulación sigue sola.
    limpiarSolicitud()
    // Si ya había una simulación en curso, se corta antes de empezar otra.
    secuenciaRef.current?.()
    secuenciaRef.current = null
    // Tras recargar el navegador el recorrido se restaura pero `prefillGuia`
    // vuelve a false; PREFILL_GUIA garantiza que siempre haya datos que escribir.
    const sugerido = prefill ?? PREFILL_GUIA
    const nombreCategoria = sugerido.producto.categoria
    const estado = {}
    autoRef.current = estado
    void (async () => {
      const actuales = categoriasRef.current
      const exacta = actuales.find(
        (c) => c.nombre.trim().toLowerCase() === nombreCategoria.toLowerCase(),
      )
      const parecida = actuales.find((c) =>
        c.nombre.toLowerCase().includes(nombreCategoria.toLowerCase()),
      )
      let categoriaId = exacta?.id ?? parecida?.id
      if (!categoriaId && rid) {
        const creada = await getApi().crearCategoria(rid, nombreCategoria)
        if (autoRef.current !== estado) return // otra simulación empezó o se canceló
        if (creada.error || !creada.data) {
          setProductoError(creada.error ?? 'No se pudo preparar la categoría del producto.')
          return
        }
        setCategorias((prev) => [...prev, creada.data as CategoriaProducto])
        categoriaId = creada.data.id
      }
      if (autoRef.current !== estado || !categoriaId) return
      setProductoError(null)
      setModalProducto({
        accion: 'crear',
        categoriaId,
        nombre: '',
        descripcion: '',
        imagenUrl: '',
        precio: '',
        disponible: true,
        esPromocion: false,
        precioPromocion: '',
        esBebida: false,
      })
      setCategoriaAuto(categoriaId)
      setCorrida((n) => n + 1)
      setAutoLlenando(true)
      setAutoLlenado(true)
    })()
  }, [solicitud, cargando, prefill, rid, limpiarSolicitud, setAutoLlenado])

  // La secuencia de escritura: un campo detrás de otro, con una pausa para que
  // se vea. Al terminar, el botón de guardar late.
  useEffect(() => {
    if (!autoLlenando) return
    const sugerido = prefill ?? PREFILL_GUIA
    const nombre = sugerido.producto.nombre
    const precio = sugerido.producto.precio
    let vivo = true
    const temporizadores: ReturnType<typeof setTimeout>[] = []
    const cancelar = escribirSecuencia(
      [
        {
          // La categoría es un desplegable: no hay letra a letra, se elige sola.
          texto: '',
          aplicar: () => setModalProducto((m) => (m ? { ...m, categoriaId: categoriaAuto } : m)),
        },
        {
          texto: nombre,
          aplicar: (texto) => setModalProducto((m) => (m ? { ...m, nombre: texto } : m)),
        },
        {
          texto: precio,
          msPorLetra: 95,
          aplicar: (texto) => setModalProducto((m) => (m ? { ...m, precio: texto } : m)),
        },
      ],
      (indice) => {
        if (!vivo) return
        if (indice < 0) {
          setCampoActivo(null)
          // Ya está listo: el botón late para que el usuario lo pulse.
          setPulsoGuardar(true)
          temporizadores.push(
            setTimeout(() => {
              if (vivo) setPulsoGuardar(false)
            }, 4200),
          )
          return
        }
        setCampoActivo(indice === 0 ? 'categoria' : indice === 1 ? 'nombre' : 'precio')
      },
      { pausaEntreCampos: 340 },
    )
    secuenciaRef.current = cancelar
    return () => {
      vivo = false
      cancelar()
      temporizadores.forEach((t) => clearTimeout(t))
      if (secuenciaRef.current === cancelar) secuenciaRef.current = null
    }
  }, [autoLlenando, categoriaAuto, prefill, corrida])

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

  async function guardarCategoria() {
    if (!rid || !modalCategoria) return
    const nombre = modalCategoria.nombre.trim()
    if (!nombre) {
      setCategoriaError('El nombre es obligatorio.')
      return
    }
    setCategoriaError(null)
    setEnviando(true)
    const api = getApi()
    const res =
      modalCategoria.accion === 'crear'
        ? await api.crearCategoria(rid, nombre)
        : await api.actualizarCategoria(rid, modalCategoria.id as string, nombre)
    setEnviando(false)
    if (res.error) {
      setCategoriaError(res.error)
      return
    }
    setModalCategoria(null)
    await cargar()
  }

  async function guardarProducto() {
    if (!rid || !modalProducto) return
    const m = modalProducto
    const nombre = m.nombre.trim()
    if (!nombre) {
      setProductoError('El nombre es obligatorio.')
      return
    }
    const precio = precioValido(m.precio)
    if (precio === null) {
      setProductoError('El precio debe ser un número mayor a 0.')
      return
    }
    let precioPromocion: number | null = null
    if (m.esPromocion) {
      precioPromocion = precioValido(m.precioPromocion)
      if (precioPromocion === null) {
        setProductoError('El precio de promoción debe ser un número mayor a 0.')
        return
      }
      if (precioPromocion >= precio) {
        setProductoError('El precio de promoción debe ser menor al precio regular.')
        return
      }
    }
    setProductoError(null)
    setEnviando(true)
    const datos: DatosProducto = {
      categoria_id: m.categoriaId || null,
      nombre,
      descripcion: m.descripcion.trim() || null,
      imagen_url: m.imagenUrl.trim() || null,
      precio,
      disponible: m.disponible,
      es_promocion: m.esPromocion,
      precio_promocion: precioPromocion,
      es_bebida: m.esBebida,
    }
    const api = getApi()
    const res =
      m.accion === 'crear'
        ? await api.crearProducto(rid, datos)
        : await api.actualizarProducto(rid, m.id as string, datos)
    setEnviando(false)
    if (res.error) {
      setProductoError(res.error)
      return
    }
    // El producto quedó guardado: el recorrido lo detecta por los datos.
    detenerAutoLlenado()
    setModalProducto(null)
    await cargar()
  }

  async function ejecutarEliminacion() {
    if (!rid || !confirmar) return
    setConfirmCargando(true)
    setConfirmError(null)
    const api = getApi()
    const res =
      confirmar.tipo === 'categoria'
        ? await api.eliminarCategoria(rid, confirmar.id)
        : await api.eliminarProducto(rid, confirmar.id)
    setConfirmCargando(false)
    if (res.error) {
      setConfirmError(res.error)
      return
    }
    setConfirmar(null)
    await cargar()
  }

  function abrirProductoCrear(categoriaId: string) {
    setProductoError(null)
    const catDemo = prefill
      ? categorias.find((c) =>
          c.nombre.toLowerCase().includes(prefill.producto.categoria.toLowerCase()),
        )?.id
      : undefined
    setModalProducto({
      accion: 'crear',
      categoriaId: catDemo ?? categoriaId,
      nombre: prefill?.producto.nombre ?? '',
      descripcion: '',
      imagenUrl: '',
      precio: prefill?.producto.precio ?? '',
      disponible: true,
      esPromocion: false,
      precioPromocion: '',
      esBebida: false,
    })
  }

  function abrirProductoEditar(p: Producto) {
    setProductoError(null)
    setModalProducto({
      accion: 'editar',
      id: p.id,
      categoriaId: p.categoria_id ?? '',
      nombre: p.nombre,
      descripcion: p.descripcion ?? '',
      imagenUrl: p.imagen_url ?? '',
      precio: String(p.precio),
      disponible: p.disponible,
      esPromocion: Boolean(p.es_promocion),
      precioPromocion: p.precio_promocion != null ? String(p.precio_promocion) : '',
      esBebida: p.es_bebida === true,
    })
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-zinc-100">Menú</h2>
          <p className="mt-0.5 text-sm text-zinc-500">Organiza tus categorías y productos a la carta.</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setCategoriaError(null)
            setModalCategoria({ accion: 'crear', nombre: '' })
          }}
          className="btn btn-primary min-h-11 px-4"
        >
          <IconoMas />
          Nueva categoría
        </button>
      </div>

      {categorias.length === 0 && (
        <EstadoVacio
          titulo="El menú está vacío"
          descripcion="Crea tu primera categoría (Bebidas, Platos fuertes…) para empezar a agregar productos."
        />
      )}

      <div className="space-y-6">
        {categorias.map((cat) => {
          const ps = productos.filter((p) => p.categoria_id === cat.id)
          const bloqueada = ps.length > 0
          return (
            <section key={cat.id} className="card p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="flex items-center gap-2 text-base font-bold tracking-tight text-zinc-100">
                  {cat.nombre}
                  <span className="chip chip-neutral px-2 py-0.5 text-xs">
                    {ps.length} {ps.length === 1 ? 'producto' : 'productos'}
                  </span>
                </h3>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setCategoriaError(null)
                      setModalCategoria({ accion: 'editar', id: cat.id, nombre: cat.nombre })
                    }}
                    className="btn btn-ghost min-h-11 border border-surface-800 px-3"
                  >
                    <IconoLapiz />
                    Editar
                  </button>
                  <button
                    type="button"
                    disabled={bloqueada}
                    title={bloqueada ? `Elimina primero los productos de «${cat.nombre}»` : `Eliminar ${cat.nombre}`}
                    onClick={() => setConfirmar({ tipo: 'categoria', id: cat.id, nombre: cat.nombre })}
                    className="btn btn-ghost h-11 w-11 p-0 text-zinc-400 hover:text-danger-500 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-zinc-400"
                  >
                    <IconoBasura />
                  </button>
                </div>
              </div>

              {bloqueada && (
                <p className="mt-2 text-xs text-danger-500/80">
                  Esta categoría tiene productos asociados. Elimínalos primero para poder quitarla.
                </p>
              )}

              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {ps.map((p) => {
                  const enPromo = Boolean(p.es_promocion) && p.precio_promocion != null
                  return (
                    <div
                      key={p.id}
                      className={`flex items-center justify-between gap-2 rounded-xl border px-3.5 py-2.5 ${
                        p.disponible
                          ? 'border-surface-800 bg-surface-950/40'
                          : 'border-surface-800 bg-surface-950/40 opacity-60'
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 text-sm font-semibold text-zinc-200">
                          <span className="truncate">{p.nombre}</span>
                          <span className="chip chip-neutral shrink-0 px-1.5 py-0.5 text-[10px]">
                            {p.disponible ? 'Disponible' : 'Agotado'}
                          </span>
                          {p.es_bebida === true && (
                            <span className="chip shrink-0 bg-sky-500/15 px-1.5 py-0.5 text-[10px] text-sky-300">
                              BARRA
                            </span>
                          )}
                        </p>
                        {p.descripcion && (
                          <p className="mt-0.5 truncate text-xs text-zinc-500">{p.descripcion}</p>
                        )}
                        <p className="mt-1 text-sm font-bold text-brand-400">
                          {enPromo ? (
                            <>
                              {fmtPEN(p.precio_promocion!)}{' '}
                              <span className="mr-1 align-middle text-xs font-semibold text-emerald-400">PROMO</span>
                              <span className="text-xs font-medium text-zinc-500 line-through">{fmtPEN(p.precio)}</span>
                            </>
                          ) : (
                            fmtPEN(p.precio)
                          )}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <button
                          type="button"
                          aria-label={`Editar ${p.nombre}`}
                          onClick={() => abrirProductoEditar(p)}
                          className="btn btn-ghost h-11 w-11 p-0"
                        >
                          <IconoLapiz />
                        </button>
                        <button
                          type="button"
                          aria-label={`Eliminar ${p.nombre}`}
                          onClick={() => setConfirmar({ tipo: 'producto', id: p.id, nombre: p.nombre })}
                          className="btn btn-ghost h-11 w-11 p-0 text-zinc-400 hover:text-danger-500"
                        >
                          <IconoBasura />
                        </button>
                      </div>
                    </div>
                  )
                })}

                <button
                  type="button"
                  data-guia="agregar-producto"
                  onClick={() => abrirProductoCrear(cat.id)}
                  className="flex min-h-11 touch-manipulation items-center justify-center gap-1.5 rounded-xl border border-dashed border-surface-700 px-3 text-sm font-semibold text-zinc-400 transition hover:border-brand-500/60 hover:bg-brand-500/5 hover:text-brand-400 active:scale-[0.99]"
                >
                  <IconoMas className="h-4 w-4" />
                  Agregar producto
                </button>
              </div>
            </section>
          )
        })}
      </div>

      {/* Modal categoría */}
      {modalCategoria && (
        <Modal
          titulo={modalCategoria.accion === 'crear' ? 'Nueva categoría' : 'Editar categoría'}
          onCerrar={() => setModalCategoria(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void guardarCategoria()
            }}
          >
            <Campo etiqueta="Nombre" htmlFor="categoria-nombre" error={categoriaError}>
              <input
                id="categoria-nombre"
                autoFocus
                value={modalCategoria.nombre}
                onChange={(e) => setModalCategoria({ ...modalCategoria, nombre: e.target.value })}
                className="input"
                placeholder="Ej. Bebidas"
              />
            </Campo>
            <PieAcciones
              onCancelar={() => setModalCategoria(null)}
              enviando={enviando}
              textoEnvio="Guardando…"
              labelGuardar={modalCategoria.accion === 'crear' ? 'Crear categoría' : 'Guardar cambios'}
              guia="categoria-guardar"
            />
          </form>
        </Modal>
      )}

      {/* Modal producto */}
      {modalProducto && (
        <Modal
          titulo={modalProducto.accion === 'crear' ? 'Agregar producto' : 'Editar producto'}
          onCerrar={() => {
            detenerAutoLlenado()
            setModalProducto(null)
          }}
          ancho="max-w-lg"
        >
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void guardarProducto()
            }}
          >
            <Campo etiqueta="Categoría" htmlFor="producto-categoria" error={null}>
              <select
                id="producto-categoria"
                value={modalProducto.categoriaId}
                onChange={(e) =>
                  setModalProducto({ ...modalProducto, categoriaId: e.target.value })
                }
                className={`input h-11 ${
                  campoActivo === 'categoria' ? 'ring-2 ring-brand-500' : ''
                }`}
              >
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo etiqueta="Nombre" htmlFor="producto-nombre" error={null}>
              <input
                id="producto-nombre"
                autoFocus
                value={modalProducto.nombre}
                onFocus={(e) => {
                  if (prefill) e.currentTarget.select()
                }}
                onChange={(e) => setModalProducto({ ...modalProducto, nombre: e.target.value })}
                className={`input ${campoActivo === 'nombre' ? 'ring-2 ring-brand-500' : ''}`}
                placeholder="Ej. Lomo saltado"
              />
            </Campo>
            <Campo etiqueta="Descripción" htmlFor="producto-descripcion" error={null}>
              <textarea
                id="producto-descripcion"
                value={modalProducto.descripcion}
                onChange={(e) => setModalProducto({ ...modalProducto, descripcion: e.target.value })}
                className="input min-h-[5rem] resize-y"
                placeholder="Opcional"
              />
            </Campo>
            <Campo etiqueta="URL de imagen" htmlFor="producto-imagen" error={null}>
              <input
                id="producto-imagen"
                value={modalProducto.imagenUrl}
                onChange={(e) => setModalProducto({ ...modalProducto, imagenUrl: e.target.value })}
                className="input"
                placeholder="https://… (opcional)"
              />
            </Campo>
            <Campo etiqueta="Precio (S/)" htmlFor="producto-precio" error={null}>
              <input
                id="producto-precio"
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                value={modalProducto.precio}
                onFocus={(e) => {
                  if (prefill) e.currentTarget.select()
                }}
                onChange={(e) => setModalProducto({ ...modalProducto, precio: e.target.value })}
                className={`input ${campoActivo === 'precio' ? 'ring-2 ring-brand-500' : ''}`}
                placeholder="12.50"
              />
            </Campo>

            <Campo etiqueta={null} htmlFor={undefined} error={null}>
              <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-sm text-zinc-300">
                <input
                  type="checkbox"
                  checked={modalProducto.esPromocion}
                  onChange={(e) =>
                    setModalProducto({ ...modalProducto, esPromocion: e.target.checked })
                  }
                  className="peer sr-only"
                />
                <span className="grid h-6 w-10 shrink-0 touch-manipulation items-center rounded-full bg-surface-700 p-0.5 transition peer-checked:bg-brand-500">
                  <span
                    className={`h-5 w-5 rounded-full bg-white shadow transition-transform ${
                      modalProducto.esPromocion ? 'translate-x-4' : ''
                    }`}
                  />
                </span>
                Activar precio de promoción
              </label>
            </Campo>

            {modalProducto.esPromocion && (
              <Campo etiqueta="Precio de promoción (S/)" htmlFor="producto-promo" error={null}>
                <input
                  id="producto-promo"
                  type="number"
                  step="0.01"
                  min="0"
                  inputMode="decimal"
                  value={modalProducto.precioPromocion}
                  onChange={(e) =>
                    setModalProducto({ ...modalProducto, precioPromocion: e.target.value })
                  }
                  className="input"
                  placeholder="9.90"
                />
              </Campo>
            )}

            <Campo etiqueta={null} htmlFor={undefined} error={null}>
              <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-sm text-zinc-300">
                <input
                  type="checkbox"
                  checked={modalProducto.disponible}
                  onChange={(e) => setModalProducto({ ...modalProducto, disponible: e.target.checked })}
                  className="sr-only"
                />
                <span
                  className={`grid h-5 w-5 shrink-0 place-items-center rounded-md border transition ${
                    modalProducto.disponible
                      ? 'border-brand-500 bg-brand-500 text-surface-950'
                      : 'border-surface-600 bg-surface-800'
                  }`}
                >
                  {modalProducto.disponible && (
                    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </span>
                Disponible (visible en el menú del mesero)
              </label>
            </Campo>

            <Campo etiqueta={null} htmlFor={undefined} error={null}>
              <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-sm text-zinc-300">
                <input
                  type="checkbox"
                  checked={modalProducto.esBebida}
                  onChange={(e) => setModalProducto({ ...modalProducto, esBebida: e.target.checked })}
                  className="sr-only"
                />
                <span
                  className={`grid h-5 w-5 shrink-0 place-items-center rounded-md border transition ${
                    modalProducto.esBebida
                      ? 'border-brand-500 bg-brand-500 text-surface-950'
                      : 'border-surface-600 bg-surface-800'
                  }`}
                >
                  {modalProducto.esBebida && (
                    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </span>
                Es bebida (se prepara en la barra, no en la cocina)
              </label>
            </Campo>

            {productoError && (
              <div className="aviso mb-4 border-danger-500/40 bg-danger-500/10 text-danger-500">
                {productoError}
              </div>
            )}

            <PieAcciones
              onCancelar={() => {
                detenerAutoLlenado()
                setModalProducto(null)
              }}
              enviando={enviando}
              textoEnvio="Guardando…"
              labelGuardar={modalProducto.accion === 'crear' ? 'Crear producto' : 'Guardar cambios'}
              guia="producto-guardar"
              pulso={pulsoGuardar}
            />
          </form>
        </Modal>
      )}

      {/* Confirmación de eliminación */}
      {confirmar && (
        <ConfirmDialog
          titulo={confirmar.tipo === 'categoria' ? 'Eliminar categoría' : 'Eliminar producto'}
          mensaje={
            confirmar.tipo === 'categoria'
              ? `¿Eliminar la categoría «${confirmar.nombre}»? Esta acción no se puede deshacer.`
              : `¿Eliminar el producto «${confirmar.nombre}»? Esta acción no se puede deshacer.`
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