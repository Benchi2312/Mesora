import { useEffect, useRef, useState } from 'react'
import { colocarEtiqueta, type Rect } from './guia'

/**
 * Resalta el control exacto que toca sin oscurecer la app: solo un aro naranja
 * de 2px, un glow suave y un pulso. No intercepta clics (`pointer-events-none`),
 * así que el usuario sigue operando con normalidad mientras lo ve guiado.
 *
 * La etiqueta («Guarda la zona») se coloca pegada al ancla, volteando arriba,
 * abajo, izquierda o derecha para no salirse del viewport ni pisar el panel de
 * la guía.
 */

interface Caja {
  x: number
  y: number
  w: number
  h: number
  firma: string
}

/** Tiene tamaño renderizable (los paneles ocultos miden 0). */
function renderizado(el: Element): boolean {
  const r = el.getBoundingClientRect()
  return r.width >= 4 && r.height >= 4
}

function habilitado(el: Element): boolean {
  if ((el as HTMLButtonElement).disabled) return false
  return el.getAttribute('aria-disabled') !== 'true'
}

/** ¿El elemento está (total o parcialmente) fuera del viewport? */
function fueraDeVista(el: Element): boolean {
  const r = el.getBoundingClientRect()
  return r.top < 8 || r.bottom > window.innerHeight - 8 || r.left < 8 || r.right > window.innerWidth - 8
}

/**
 * Primer selector que exista en el DOM, tenga tamaño y no esté deshabilitado.
 * NO se descartan los que están fuera de pantalla: el recorrido los resuelve y
 * los trae a la vista con `scrollIntoView`.
 */
export function resolverAncla(selectores: string[]): Element | null {
  for (const sel of selectores) {
    const el = document.querySelector(sel)
    if (el && renderizado(el) && habilitado(el)) return el
  }
  return null
}

/** Instrucción corta según el control resaltado. */
const ETIQUETAS: Record<string, string> = {
  'zona-guardar': 'Guarda la zona',
  'nueva-zona': 'Crea tu primera zona',
  'agregar-mesa': 'Agrega una mesa',
  'mesa-guardar': 'Guarda la mesa',
  'admin-tab-mesas': 'Abre «Mesas y zonas»',
  'producto-guardar': 'Guarda el producto',
  'agregar-producto': 'Agrega un producto',
  'admin-tab-menu': 'Abre «Menú»',
  'enviar-comanda': 'Envía la comanda',
  producto: 'Toca productos para armar la comanda',
  'mesa-libre': 'Toca una mesa libre',
  'avanzar-pedido': 'Avanza la comanda',
  'boleta-pdf': 'Descarga la boleta en PDF',
  'cobrar-mesa': 'Cobra la cuenta',
  'cerrar-cuenta': 'Abre el cierre de cuenta',
  'mesa-ocupada': 'Toca la mesa ocupada',
  'panel-ventas': 'Tu venta ya está aquí',
  'admin-tab-dashboard': 'Abre «Dashboard»',
}

function etiquetaDe(el: Element | null): string {
  if (!el) return ''
  const clave = el.getAttribute('data-guia') ?? el.getAttribute('data-guia-mesa')
  return ETIQUETAS[clave ?? ''] ?? 'Toca aquí'
}

function rectDe(el: Element): Rect {
  const r = el.getBoundingClientRect()
  return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }
}

export function useAnclaResuelta(selectores: string[], activo: boolean): Element | null {
  const [ancla, setAncla] = useState<Element | null>(null)
  const ultimoScrolleado = useRef<Element | null>(null)

  useEffect(() => {
    if (!activo || selectores.length === 0) {
      setAncla(null)
      return
    }
    let vivo = true
    let pendiente = 0
    // Las mutaciones llegan a ráfaga: se agrupan en un solo frame para no
    // re-evaluar los selectores en cada nodo tocado.
    const revisar = () => {
      if (!vivo || pendiente) return
      pendiente = requestAnimationFrame(() => {
        pendiente = 0
        if (!vivo) return
        const el = resolverAncla(selectores)
        setAncla((prev) => (prev === el ? prev : el))
        // Ancla nueva fuera de pantalla: se trae al centro, una sola vez.
        if (el && el !== ultimoScrolleado.current && fueraDeVista(el)) {
          ultimoScrolleado.current = el
          el.scrollIntoView({ block: 'center', behavior: 'smooth' })
        }
        if (!el) ultimoScrolleado.current = null
      })
    }
    revisar()
    // El ancla cambia por clics del usuario, navegación interna y animaciones:
    // un observador de mutaciones + eventos de scroll cubre todo sin
    // tener que re‑renderizar en cada frame.
    const mo = new MutationObserver(revisar)
    mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'disabled'] })
    window.addEventListener('resize', revisar)
    window.addEventListener('scroll', revisar, true)
    const id = window.setInterval(revisar, 700)
    return () => {
      vivo = false
      if (pendiente) cancelAnimationFrame(pendiente)
      mo.disconnect()
      window.removeEventListener('resize', revisar)
      window.removeEventListener('scroll', revisar, true)
      window.clearInterval(id)
    }
  }, [selectores, activo])

  return ancla
}

export default function Spotlight({ ancla }: { ancla: Element | null }) {
  const [caja, setCaja] = useState<Caja | null>(null)
  const [colocacion, setColocacion] = useState<{ left: number; top: number } | null>(null)
  const etiquetaRef = useRef<HTMLSpanElement>(null)
  const texto = etiquetaDe(ancla)

  useEffect(() => {
    if (!ancla) {
      setCaja(null)
      setColocacion(null)
      return
    }
    let raf = 0
    let ultima = ''
    let ultimaCol = ''
    const medir = () => {
      const r = ancla.getBoundingClientRect()
      const x = Math.round(r.left)
      const y = Math.round(r.top)
      const w = Math.round(r.width)
      const h = Math.round(r.height)
      const firma = `${x}|${y}|${w}|${h}`
      if (firma !== ultima) {
        ultima = firma
        setCaja({ x, y, w, h, firma })
      }
      const el = etiquetaRef.current
      if (el && w >= 4 && h >= 4) {
        const guiaEl = document.querySelector('[data-guia-panel]')
        const c = colocarEtiqueta(
          { x, y, w, h },
          { w: el.offsetWidth, h: el.offsetHeight },
          { w: window.innerWidth, h: window.innerHeight },
          guiaEl ? rectDe(guiaEl) : null,
        )
        const firmaCol = `${c.left}|${c.top}`
        if (firmaCol !== ultimaCol) {
          ultimaCol = firmaCol
          setColocacion({ left: c.left, top: c.top })
        }
      }
      raf = requestAnimationFrame(medir)
    }
    raf = requestAnimationFrame(medir)
    return () => cancelAnimationFrame(raf)
  }, [ancla])

  if (!ancla || !caja) return null

  const margen = 6
  const x = caja.x - margen
  const y = caja.y - margen
  const w = caja.w + margen * 2
  const h = caja.h + margen * 2

  return (
    <div className="pointer-events-none fixed inset-0 z-[55]" aria-hidden="true">
      <div className="absolute transition-all duration-150 ease-out" style={{ left: x, top: y, width: w, height: h }}>
        <span
          className="absolute inset-0 rounded-2xl outline-2 -outline-offset-2 outline-brand-500"
          style={{ boxShadow: '0 0 0 6px rgba(255, 149, 0, 0.14), 0 0 28px 8px rgba(255, 149, 0, 0.38)' }}
        />
        <span className="absolute inset-0 animate-ping rounded-2xl border-2 border-brand-500/60" />
      </div>

      <span
        ref={etiquetaRef}
        className="absolute inline-flex max-w-[16rem] items-center gap-1.5 rounded-full bg-brand-500 px-3 py-1.5 text-xs font-bold text-surface-950 shadow-lg shadow-black/40"
        style={{
          left: colocacion?.left ?? 0,
          top: colocacion?.top ?? 0,
          visibility: colocacion ? 'visible' : 'hidden',
        }}
      >
        {texto}
      </span>
    </div>
  )
}
