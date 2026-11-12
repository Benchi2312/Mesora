import { useCallback, useEffect, useRef, useState } from 'react'
import { useCurrentContext } from '../../lib/useCurrentContext'
import { getApi } from '../../lib/api'
import { useDemoStore } from '../../demo/demoStore'
import { PREFILL_GUIA, prefillDe } from '../../demo/guia'
import { escribirSecuencia } from '../../demo/escritura'
import type { DatosProducto } from '../../lib/api'
import type { CategoriaProducto, Producto } from '../../types/database'
import { NOMBRES_ESTACION_COMANDA, type EstacionComanda } from '../../domain/restaurant/impresionComandas'
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
  estacion: EstacionComanda | null
} | null
type Confirmar = { tipo: 'categoria' | 'producto'; id: string; nombre: string } | null
/** Campo del formulario que el autocompletado está rellenando ahora mismo. */
type CampoAuto = 'categoria' | 'nombre' | 'precio'

function normalizarBusquedaMenu(texto: string) {
  return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase()
}

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
  const [busquedaMenu, setBusquedaMenu] = useState('')
  const [filtroDisponibilidad, setFiltroDisponibilidad] = useState<'todos' | 'disponibles' | 'agotados'>('todos')
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
  // La secuencia de escritura se cancela al cerrar el formulario, iniciar otra
  // simulación o desmontar el panel.
  const secuenciaRef = useRef<(() => void) | null>(null)
  const categoriasRef = useRef(categorias)
  const categoriaGuiadaRef = useRef(false)
  categoriasRef.current = categorias

  const iniciarAutocompletadoProducto = useCallback((categoriaId: string) => {
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
      estacion: null,
    })
    setCategoriaAuto(categoriaId)
    setCorrida((n) => n + 1)
    setAutoLlenando(true)
    setAutoLlenado(true)
  }, [setAutoLlenado])

  function cerrarModalCategoria() {
    setModalCategoria(null)
    if (categoriaGuiadaRef.current) {
      categoriaGuiadaRef.current = false
      setAutoLlenado(false)
    }
  }

  const detenerAutoLlenado = useCallback(() => {
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
      secuenciaRef.current?.()
      secuenciaRef.current = null
      categoriaGuiadaRef.current = false
      // Si el usuario cambia de pestaña a media simulación, el panel de la guía
      // tiene que volver a su sitio.
      setAutoLlenado(false)
    },
    [setAutoLlenado],
  )

  // «Hazlo por mí» muestra primero la categoría sugerida si no existe; al
  // confirmarla abre el producto y lo rellena para que el usuario lo revise.
  useEffect(() => {
    if (!solicitud || (solicitud.form !== 'producto' && solicitud.form !== 'categoria')) return
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
    if (solicitud.form === 'categoria') {
      categoriaGuiadaRef.current = true
      setCategoriaError(null)
      setAutoLlenado(true)
      setModalCategoria({ accion: 'crear', nombre: sugerido.producto.categoria })
      return
    }
    const nombreCategoria = sugerido.producto.categoria
    const actuales = categoriasRef.current
    const exacta = actuales.find(
      (c) => c.nombre.trim().toLowerCase() === nombreCategoria.toLowerCase(),
    )
    const parecida = actuales.find((c) =>
      c.nombre.toLowerCase().includes(nombreCategoria.toLowerCase()),
    )
    const categoriaId = exacta?.id ?? parecida?.id
    if (!categoriaId) {
      categoriaGuiadaRef.current = true
      setCategoriaError(null)
      setAutoLlenado(true)
      setModalCategoria({ accion: 'crear', nombre: nombreCategoria })
      return
    }
    iniciarAutocompletadoProducto(categoriaId)
  }, [solicitud, cargando, prefill, limpiarSolicitud, setAutoLlenado, iniciarAutocompletadoProducto])

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
    if (categoriaGuiadaRef.current && res.data?.id) {
      categoriaGuiadaRef.current = false
      iniciarAutocompletadoProducto(res.data.id)
    } else if (categoriaGuiadaRef.current) {
      categoriaGuiadaRef.current = false
      setAutoLlenado(false)
    }
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
      // Los productos nuevos siguen la regla sencilla del formulario. En una
      // edición se conserva la asignación histórica, incluso si es explícita.
      estacion: m.accion === 'crear' ? (m.esBebida ? 'bar' : 'cocina') : m.estacion,
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
      estacion: null,
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
      estacion: p.estacion ?? null,
    })
  }

  const busquedaNormalizada = normalizarBusquedaMenu(busquedaMenu.trim())
  const productosDisponibles = productos.filter((producto) => producto.disponible).length
  const productosAgotados = productos.length - productosDisponibles
  const bebidas = productos.filter((producto) => producto.es_bebida === true).length
  const coincideProducto = (producto: Producto, categoria: CategoriaProducto) => {
    const coincideTexto = !busquedaNormalizada || normalizarBusquedaMenu(
      [producto.nombre, producto.descripcion ?? '', categoria.nombre].join(' '),
    ).includes(busquedaNormalizada)
    const coincideEstado = filtroDisponibilidad === 'todos'
      || (filtroDisponibilidad === 'disponibles' && producto.disponible)
      || (filtroDisponibilidad === 'agotados' && !producto.disponible)
    return coincideTexto && coincideEstado
  }

  return (
    <div className="admin-managed-section admin-menu-section">
      <div className="admin-module-heading">
        <div className="admin-module-copy">
          <span className="admin-section-kicker">Productos y categorías</span>
          <h2>Tu oferta, organizada</h2>
          <p>Los platos se envían a Cocina y las bebidas a Barra, según la regla actual del producto.</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setCategoriaError(null)
            setModalCategoria({ accion: 'crear', nombre: '' })
          }}
          className="btn btn-primary min-h-11 px-4 admin-module-primary"
        >
          <IconoMas />
          Nueva categoría
        </button>
      </div>

      <div className="admin-summary-grid" aria-label="Resumen del menú">
        <div className="admin-summary-item">
          <span>Productos</span>
          <strong>{productos.length}</strong>
          <small>En {categorias.length} {categorias.length === 1 ? 'categoría' : 'categorías'}</small>
        </div>
        <div className="admin-summary-item admin-summary-availability">
          <span>Disponibles</span>
          <strong>{productosDisponibles}</strong>
          <small>{productosAgotados} agotados</small>
        </div>
        <div className="admin-summary-item">
          <span>Bebidas</span>
          <strong>{bebidas}</strong>
          <small>Asignadas a Barra por defecto</small>
        </div>
      </div>

      {categorias.length > 0 && (
        <div className="admin-menu-filters">
          <label className="admin-menu-search">
            <span>Buscar productos</span>
            <input
              type="search"
              className="input min-h-11"
              value={busquedaMenu}
              onChange={(evento) => setBusquedaMenu(evento.target.value)}
              placeholder="Nombre, descripción o categoría"
              aria-label="Buscar productos por nombre, descripción o categoría"
            />
          </label>
          <label>
            <span>Disponibilidad</span>
            <select
              className="input min-h-11"
              value={filtroDisponibilidad}
              onChange={(evento) => setFiltroDisponibilidad(evento.target.value as typeof filtroDisponibilidad)}
              aria-label="Filtrar productos por disponibilidad"
            >
              <option value="todos">Todos los estados</option>
              <option value="disponibles">Disponibles</option>
              <option value="agotados">Agotados</option>
            </select>
          </label>
          {(busquedaMenu || filtroDisponibilidad !== 'todos') && (
            <button
              type="button"
              className="btn btn-outline min-h-11 px-4 admin-filter-reset"
              onClick={() => { setBusquedaMenu(''); setFiltroDisponibilidad('todos') }}
            >
              Limpiar filtros
            </button>
          )}
        </div>
      )}

      {categorias.length === 0 && (
        <EstadoVacio
          titulo="El menú está vacío"
          descripcion="Crea tu primera categoría (Bebidas, Platos fuertes…) para empezar a agregar productos."
        />
      )}

      <div className="space-y-6">
        {categorias.map((cat) => {
          const productosCategoria = productos.filter((producto) => producto.categoria_id === cat.id)
          const ps = productosCategoria.filter((producto) => coincideProducto(producto, cat))
          const bloqueada = productosCategoria.length > 0
          return (
            <section key={cat.id} className="card admin-entity-section admin-category-section">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="admin-entity-title">
                  {cat.nombre}
                  <span className="chip chip-neutral admin-count-chip">
                    {productosCategoria.length} {productosCategoria.length === 1 ? 'producto' : 'productos'}
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

              <div className="admin-product-grid">
                {ps.map((p) => {
                  const enPromo = Boolean(p.es_promocion) && p.precio_promocion != null
                  const rutaProducto = p.estacion
                    ? p.estacion === 'bar' ? 'Barra' : NOMBRES_ESTACION_COMANDA[p.estacion]
                    : p.es_bebida === true ? 'Barra' : 'Cocina'
                  return (
                    <div
                      key={p.id}
                      className={`admin-product-item ${
                        p.disponible
                          ? 'is-available'
                          : 'is-unavailable'
                      }`}
                    >
                      <div className="admin-product-details">
                        <div className="admin-product-heading">
                          <p>{p.nombre}</p>
                          <span className={`admin-product-status ${p.disponible ? 'is-available' : 'is-unavailable'}`}>
                            {p.disponible ? 'Disponible' : 'Agotado'}
                          </span>
                          {p.es_bebida === true && <span className="admin-product-kind">Bebida</span>}
                          <span className="admin-product-route">{rutaProducto}</span>
                        </div>
                        {p.descripcion && <p className="admin-product-description">{p.descripcion}</p>}
                        <p className="admin-product-price">
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

                {ps.length === 0 && (
                  <p className="admin-filter-empty">
                    {busquedaMenu || filtroDisponibilidad !== 'todos'
                      ? 'No hay productos que coincidan en esta categoría.'
                      : 'Todavía no hay productos en esta categoría.'}
                  </p>
                )}

                <button
                  type="button"
                  data-guia="agregar-producto"
                  onClick={() => abrirProductoCrear(cat.id)}
                  className="admin-add-item"
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
          onCerrar={cerrarModalCategoria}
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
              onCancelar={cerrarModalCategoria}
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

            {modalProducto.accion === 'editar' && modalProducto.estacion && (
              <details className="rounded-xl border border-surface-700 bg-surface-900/60 p-3">
                <summary className="min-h-11 cursor-pointer select-none text-sm font-semibold text-zinc-300">Compatibilidad avanzada de asignación heredada</summary>
                <p className="mt-2 text-xs leading-relaxed text-zinc-400">
                  Este producto conserva su ruta explícita anterior a {NOMBRES_ESTACION_COMANDA[modalProducto.estacion]}. Tiene prioridad sobre la categoría y sobre “Es bebida”. Las comandas históricas mantienen su ruta guardada.
                </p>
              </details>
            )}

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
                Es bebida
              </label>
              <p className="mt-1 text-xs leading-relaxed text-zinc-500">En productos nuevos, las bebidas van a Barra y los demás a Cocina. Los productos existentes conservan su ruta explícita o heredada; puedes revisarla en Configuración operativa → Opciones avanzadas y compatibilidad.</p>
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
