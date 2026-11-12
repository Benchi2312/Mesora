import { useEffect, useMemo, useRef, useState } from 'react'
import { esFalloDeRed, getApi, type ItemComanda } from '../../lib/api'
import { useCurrentContext } from '../../lib/useCurrentContext'
import type { CategoriaProducto, Mesa, Producto } from '../../types/database'
import { fmtPEN } from '../../lib/format'
import { Spinner } from '../../components/LoadingScreen'

const IMG_DEFAULT = 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=400&q=80'

/**
 * Tope por ítem. Tiene que coincidir con el CHECK de la RPC `crear_pedido`
 * (y con `editar_item_comanda`): si el front permite más de lo que el servidor
 * acepta, el error llega tarde y sin decir qué producto fue.
 */
export const CANTIDAD_MAXIMA = 99

interface CartItem {
  producto_id: string
  nombre_producto: string
  precio_unitario: number
  cantidad: number
  nota: string
}

type FiltroMenu = 'todos' | 'bebidas' | 'comidas' | 'postres'

interface MenuPickerProps {
  mesa: Mesa
  onVolver: () => void
  onComandaEnviada: () => void
  /** Texto del botón de regreso: cambia si se llegó desde la mesa ya ocupada. */
  textoVolver?: string
}

export default function MenuPicker({
  mesa,
  onVolver,
  onComandaEnviada,
  textoVolver = '← Volver a mesas',
}: MenuPickerProps) {
  const { restaurante, usuario } = useCurrentContext()
  const [categorias, setCategorias] = useState<CategoriaProducto[]>([])
  const [productos, setProductos] = useState<Producto[]>([])
  const [filtroMenu, setFiltroMenu] = useState<FiltroMenu>('todos')
  const [catActiva, setCatActiva] = useState<string | null>(null)
  const [cart, setCart] = useState<CartItem[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [envioIncierto, setEnvioIncierto] = useState(false)
  const [intentoCarga, setIntentoCarga] = useState(0)
  const [exito, setExito] = useState(false)
  /** Aviso no bloqueante (tope de cantidad, etc.). */
  const [aviso, setAviso] = useState<string | null>(null)
  const envioEnCurso = useRef(false)

  useEffect(() => {
    const rid = restaurante?.id
    if (!rid) return
    let activo = true
    setCargando(true)
    ;(async () => {
      try {
        const api = getApi()
        const [cRes, pRes] = await Promise.all([api.getCategorias(rid), api.getProductos(rid)])

        if (!activo) return
        if (cRes.error || pRes.error) {
          setError(cRes.error ?? pRes.error ?? 'Error al cargar el menú')
          return
        }
        setCategorias(cRes.data ?? [])
        setProductos(pRes.data ?? [])
        setError(null)
      } catch {
        if (activo) setError('No se pudo cargar el menú. Revisa tu conexión e inténtalo de nuevo.')
      } finally {
        if (activo) setCargando(false)
      }
    })()
    return () => {
      activo = false
    }
  }, [restaurante?.id, intentoCarga])

  const categoriasPostres = useMemo(() => {
    const ids = new Set(categorias
      .filter((categoria) => /postr|dessert/i.test(categoria.nombre.normalize('NFD').replace(/[\u0300-\u036f]/g, '')))
      .map((categoria) => categoria.id))
    return ids
  }, [categorias])

  const productosVisibles = useMemo(() => {
    const filtrados = productos.filter((producto) => {
      if (filtroMenu === 'bebidas') return producto.es_bebida === true
      if (filtroMenu === 'postres') return Boolean(producto.categoria_id && categoriasPostres.has(producto.categoria_id))
      if (filtroMenu === 'comidas') return producto.es_bebida !== true && !(producto.categoria_id && categoriasPostres.has(producto.categoria_id))
      return true
    })
    return catActiva ? filtrados.filter((producto) => producto.categoria_id === catActiva) : filtrados
  }, [productos, filtroMenu, catActiva, categoriasPostres])

  const total = useMemo(
    () => cart.reduce((acc, it) => acc + it.cantidad * it.precio_unitario, 0),
    [cart],
  )
  const cantidadItems = useMemo(() => cart.reduce((acc, item) => acc + item.cantidad, 0), [cart])

  function precioFinal(p: Producto): number {
    return p.es_promocion && p.precio_promocion ? p.precio_promocion : p.precio
  }

  function agregar(p: Producto) {
    setCart((prev) => {
      const idx = prev.findIndex((it) => it.producto_id === p.id)
      if (idx >= 0) {
        // Tope 99: es lo que valida la RPC crear_pedido (y editar_item_comanda).
        // Sin este tope el mesero puede acumular 150 unidades y el envío entero
        // falla con un error que no dice qué ítem pasó.
        if (prev[idx].cantidad >= CANTIDAD_MAXIMA) {
          setAviso(`Máximo ${CANTIDAD_MAXIMA} unidades por producto en una comanda.`)
          return prev
        }
        const next = [...prev]
        next[idx] = { ...next[idx], cantidad: next[idx].cantidad + 1 }
        return next
      }
      return [...prev, { producto_id: p.id, nombre_producto: p.nombre, precio_unitario: precioFinal(p), cantidad: 1, nota: '' }]
    })
  }

  function cambiarCantidad(id: string, delta: number) {
    setCart((prev) =>
      prev
        .map((it) => (it.producto_id === id ? { ...it, cantidad: Math.max(0, it.cantidad + delta) } : it))
        .filter((it) => it.cantidad > 0),
    )
  }

  function cambiarNota(id: string, nota: string) {
    setCart((prev) => prev.map((it) => (it.producto_id === id ? { ...it, nota } : it)))
  }

  /** Un ítem por encima del tope no se envía: se avisa antes de perder la comanda. */
  const itemFueraDeRango = cart.find((it) => it.cantidad > CANTIDAD_MAXIMA)

  async function enviarComanda() {
    if (!restaurante || !usuario || cart.length === 0 || envioEnCurso.current) return
    // Se valida antes de tocar la red: un envío con un ítem fuera de rango
    // wastea un round-trip y vuelve con un error genérico del servidor.
    if (itemFueraDeRango) {
      setAviso(`«${itemFueraDeRango.nombre_producto}» supera el máximo de ${CANTIDAD_MAXIMA} unidades.`)
      return
    }
    setEnviando(true)
    envioEnCurso.current = true
    setError(null)
    setAviso(null)

    const items: ItemComanda[] = cart.map((it) => ({
      producto_id: it.producto_id,
      nombre_producto: it.nombre_producto,
      cantidad: it.cantidad,
      precio_unitario: it.precio_unitario,
      nota: it.nota,
    }))

    let pedidoId: string | null = null
    let apiErr: string | null = null
    try {
      const resultado = await getApi().crearPedido(restaurante.id, mesa.id, items)
      pedidoId = resultado.data
      apiErr = resultado.error
    } catch {
      setEnvioIncierto(true)
      apiErr = 'No se pudo confirmar el envío. Revisa las comandas antes de volver a intentarlo.'
    }

    setEnviando(false)
    if (apiErr || !pedidoId) {
      if (esFalloDeRed(apiErr)) {
        setEnvioIncierto(true)
        setError('No se pudo confirmar el envío. Vuelve a mesas y revisa la comanda antes de reenviarla.')
        return
      }
      envioEnCurso.current = false
      setError(apiErr ?? 'No se pudo enviar la comanda')
      return
    }
    setExito(true)
    setTimeout(onComandaEnviada, 1200)
  }

  if (cargando)
    return (
      <div role="status" aria-live="polite" className="flex flex-col items-center justify-center gap-3 py-16 text-sm text-zinc-400">
        <Spinner />
        <span>Cargando menú para {mesa.nombre}…</span>
      </div>
    )

  if (exito) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-ok-500/40 bg-ok-500/10 px-6 py-16 text-center">
        <span className="grid h-14 w-14 place-items-center rounded-full border border-ok-500 bg-ok-500/20 text-2xl font-bold text-ok-500">
          ✓
        </span>
        <p className="text-lg font-semibold text-zinc-100">Comanda enviada</p>
        <p className="text-sm text-zinc-400">Mesa {mesa.nombre}</p>
      </div>
    )
  }

  return (
    <div className="pb-[calc(6.5rem+env(safe-area-inset-bottom))] lg:pb-0" data-mesero-pedido>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <button
            type="button"
            onClick={onVolver}
            className="-mx-2 -mt-1 mb-2 inline-flex min-h-11 touch-manipulation items-center gap-1 rounded-lg px-2 text-base text-zinc-400 transition hover:text-brand-500"
          >
            {textoVolver}
          </button>
          <h1 className="text-xl font-extrabold tracking-tight text-zinc-100">
            Tomar pedido · {mesa.nombre}
          </h1>
        </div>
        {error && (
          <div className="w-full rounded-lg border border-danger-500/40 bg-danger-500/10 px-3 py-2 text-sm text-danger-500 sm:w-auto">
            {error}
            {categorias.length === 0 && productos.length === 0 && (
              <button type="button" onClick={() => setIntentoCarga((n) => n + 1)} className="ml-3 underline">Reintentar carga</button>
            )}
          </div>
        )}
      </div>

      <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* Menú */}
        <div className="min-w-0">
          <div className="mb-4 min-w-0 space-y-2">
            <div className="flex max-w-full gap-2 overflow-x-auto pb-1" role="group" aria-label="Filtrar productos por tipo">
              {([
                ['todos', 'Todos'],
                ['bebidas', 'Bebidas'],
                ['comidas', 'Comidas'],
                ['postres', 'Postres'],
              ] as const).map(([filtro, etiqueta]) => (
                <button
                  key={filtro}
                  type="button"
                  aria-pressed={filtroMenu === filtro}
                  onClick={() => { setFiltroMenu(filtro); setCatActiva(null) }}
                  className={`min-h-11 shrink-0 touch-manipulation rounded-full border px-4 py-2 text-sm font-medium transition ${
                    filtroMenu === filtro
                      ? 'border-brand-500 bg-brand-500/15 text-brand-400'
                      : 'border-surface-700 bg-surface-800 text-zinc-300 hover:border-surface-500'
                  }`}
                >
                  {etiqueta}
                </button>
              ))}
            </div>
            {categorias.length > 0 && <div className="flex max-w-full gap-2 overflow-x-auto pb-1" role="group" aria-label="Filtrar productos por categoría">
              {categorias.map((categoria) => (
                <button
                  key={categoria.id}
                  type="button"
                  aria-pressed={catActiva === categoria.id}
                  onClick={() => { setFiltroMenu('todos'); setCatActiva(catActiva === categoria.id ? null : categoria.id) }}
                  className={`min-h-10 shrink-0 touch-manipulation rounded-full border px-3 py-1.5 text-sm transition ${
                    catActiva === categoria.id
                      ? 'border-brand-500 bg-brand-500/15 text-brand-400'
                      : 'border-surface-700 bg-surface-800 text-zinc-400 hover:border-surface-500'
                  }`}
                >
                  {categoria.nombre}
                </button>
              ))}
            </div>}
          </div>

          <div className="grid min-w-0 gap-3 sm:grid-cols-2">
            {productosVisibles.length === 0 && (
              <p className="text-sm text-zinc-500 sm:col-span-2">
                No hay productos disponibles en esta categoría.
              </p>
            )}
            {productosVisibles.map((p) => {
              const promo = p.es_promocion && p.precio_promocion
              return (
                <button
                  key={p.id}
                  type="button"
                  data-guia="producto"
                  onClick={() => agregar(p)}
                  className="group flex min-h-[5.25rem] touch-manipulation items-center gap-2.5 rounded-xl border border-surface-800 bg-surface-900 p-2.5 text-left transition hover:border-brand-500/60 hover:bg-surface-800 active:scale-[0.99] sm:gap-3 sm:p-3"
                >
                  <img
                    src={p.imagen_url ?? IMG_DEFAULT}
                    alt={p.nombre}
                    loading="lazy"
                    className="h-16 w-16 shrink-0 rounded-lg object-cover sm:h-20 sm:w-20"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-base font-semibold text-zinc-100">{p.nombre}</span>
                    {p.descripcion && (
                      <span className="mt-0.5 line-clamp-2 block text-sm text-zinc-500">
                        {p.descripcion}
                      </span>
                    )}
                    <span className="mt-1 flex flex-wrap items-center gap-2">
                      {promo ? (
                        <>
                          <span className="text-base font-bold text-brand-400">
                            {fmtPEN(p.precio_promocion as number)}
                          </span>
                          <span className="text-sm text-zinc-500 line-through">
                            {fmtPEN(p.precio)}
                          </span>
                          <span className="rounded-full bg-brand-500/10 px-2 py-0.5 text-xs font-semibold uppercase text-brand-500">
                            Promo
                          </span>
                        </>
                      ) : (
                        <span className="text-base font-bold text-zinc-200">{fmtPEN(p.precio)}</span>
                      )}
                    </span>
                  </span>
                  <span className="grid h-12 w-12 shrink-0 touch-manipulation place-items-center rounded-full border border-surface-600 text-xl text-brand-400 transition group-hover:border-brand-500 group-hover:bg-brand-500/10">
                    +
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Carrito / comanda */}
        <div className="min-w-0 lg:sticky lg:top-20 lg:self-start">
          <div className="rounded-2xl border border-surface-800 bg-surface-900 p-4">
            <h2 className="titulo-seccion mb-3 text-xs font-semibold">
              Comanda · {cantidadItems} {cantidadItems === 1 ? 'ítem' : 'ítems'}
            </h2>

            {cart.length === 0 && (
              <p className="py-6 text-center text-sm text-zinc-500">
                Toca los productos para agregarlos.
              </p>
            )}

            <div className="space-y-3">
              {cart.map((it) => (
                <div key={it.producto_id} className="rounded-lg bg-surface-800 p-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-base font-medium text-zinc-100">{it.nombre_producto}</p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        aria-label={`Restar ${it.nombre_producto}`}
                        onClick={() => cambiarCantidad(it.producto_id, -1)}
                        className="grid h-11 w-11 touch-manipulation place-items-center rounded-lg border border-surface-600 text-xl leading-none text-zinc-300 hover:border-brand-500 hover:text-brand-500 active:scale-[0.95]"
                      >
                        −
                      </button>
                      <span className="w-8 text-center text-lg font-semibold tabular-nums">
                        {it.cantidad}
                      </span>
                      <button
                        type="button"
                        aria-label={`Agregar ${it.nombre_producto}`}
                        disabled={it.cantidad >= CANTIDAD_MAXIMA}
                        onClick={() => cambiarCantidad(it.producto_id, 1)}
                        className="grid h-11 w-11 touch-manipulation place-items-center rounded-lg border border-surface-600 text-xl leading-none text-zinc-300 hover:border-brand-500 hover:text-brand-500 active:scale-[0.95] disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        +
                      </button>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <input
                      aria-label={`Nota de ${it.nombre_producto}`}
                      value={it.nota}
                      onChange={(e) => cambiarNota(it.producto_id, e.target.value)}
                      placeholder="Nota (ej. sin sal)"
                      className="w-full min-h-11 rounded-lg border border-surface-600 bg-surface-900 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 outline-none focus:border-brand-500"
                    />
                    <span className="shrink-0 text-sm text-zinc-400">
                      {fmtPEN(it.cantidad * it.precio_unitario)}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 flex items-center justify-between border-t border-surface-700 pt-3">
              <span className="text-base text-zinc-400">Total</span>
              <span className="text-xl font-bold text-brand-400">{fmtPEN(total)}</span>
            </div>

            {aviso && (
              <p className="mt-3 rounded-lg border border-warn-500/40 bg-warn-500/10 px-3 py-2 text-sm text-warn-400">
                {aviso}
              </p>
            )}

            <button
              type="button"
              data-guia="enviar-comanda"
              disabled={cart.length === 0 || enviando || envioIncierto || Boolean(itemFueraDeRango)}
              onClick={() => void enviarComanda()}
              className="mt-4 hidden min-h-14 w-full touch-manipulation rounded-xl bg-brand-500 py-3.5 text-base font-semibold text-surface-950 transition hover:bg-brand-400 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 lg:flex lg:items-center lg:justify-center"
            >
              {enviando ? 'Enviando…' : 'Enviar comanda'}
            </button>
            {envioIncierto && (
              <button type="button" onClick={onVolver} className="mt-2 min-h-11 w-full rounded-xl border border-surface-700 px-4 text-sm text-zinc-300">
                Volver a mesas y revisar antes de reenviar
              </button>
            )}
          </div>
        </div>
      </div>

      <div role="region" aria-label="Resumen de la comanda" className="fixed inset-x-0 bottom-0 z-40 border-t border-surface-700 bg-surface-950/95 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-[0_-12px_32px_rgba(0,0,0,0.35)] backdrop-blur lg:hidden" data-resumen-pedido-movil>
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <div className="min-w-0 flex-1" aria-live="polite">
            <p className="truncate text-xs text-zinc-400">{cantidadItems} {cantidadItems === 1 ? 'ítem' : 'ítems'} en la comanda</p>
            <p className="text-lg font-bold tabular-nums text-brand-400">{fmtPEN(total)}</p>
          </div>
          <button
            type="button"
            aria-label="Enviar comanda"
            disabled={cart.length === 0 || enviando || envioIncierto || Boolean(itemFueraDeRango)}
            onClick={() => void enviarComanda()}
            className="min-h-12 min-w-40 touch-manipulation rounded-xl bg-brand-500 px-4 py-3 text-sm font-semibold text-surface-950 transition hover:bg-brand-400 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {enviando ? 'Enviando…' : 'Enviar comanda'}
          </button>
        </div>
        {envioIncierto && <button type="button" onClick={onVolver} className="mx-auto mt-2 block min-h-11 rounded-lg px-3 text-xs text-zinc-300 underline">Volver a mesas y revisar antes de reenviar</button>}
      </div>
    </div>
  )
}
