import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { getApi, reiniciarDemoDatos } from '../lib/api'
import { useCurrentContext } from '../lib/useCurrentContext'
import { fmtPEN } from '../lib/format'
import { useDemoStore } from './demoStore'
import Spotlight, { useAnclaResuelta } from './Spotlight'
import {
  GUI_ALTO_COMPACTO,
  GUI_ALTO_EXPANDIDO,
  GUI_MARGEN,
  NIVELES,
  PASOS,
  PROGRESO_VACIO,
  TOTAL_PASOS,
  XP_TOTAL,
  anclasDe,
  borrarProgreso,
  elegirEsquina,
  formularioDePaso,
  guardarProgreso,
  hayEsquinaLibre,
  leerProgreso,
  nivelDe,
  nivelSiguiente,
  observar,
  pasoActual,
  pista,
  progresoNivel,
  progresoVigente,
  resumen,
  xpDePaso,
  xpTotal,
  type Esquina,
  type Instantanea,
  type Logro,
  type Nivel,
  type Progreso,
  type Rect,
} from './guia'

// Recorrido guiado del demo: 6 pasos que se completan solos mirando los datos
// reales del backend simulado (sondeo), sin instrumentar la app. El Spotlight
// señala el control exacto a tocar y el paso se marca cuando la acción ocurre.

function firma(p: Progreso): string {
  return JSON.stringify([p.hechos, p.mesaTour, p.pedidoTour, p.nuevaZona, p.boleta])
}

function rectDe(el: Element | null): Rect | null {
  if (!el) return null
  const r = el.getBoundingClientRect()
  return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }
}

function firmaRect(r: Rect | null): string {
  return r ? `${r.x},${r.y},${r.w},${r.h}` : 'null'
}

function leerInstantanea(rid: string): Promise<Instantanea> {
  const api = getApi()
  return Promise.all([
    api.getZonas(rid),
    api.getMesas(rid),
    api.getCategorias(rid),
    api.getProductos(rid),
    api.getPedidosActivos(rid),
    api.getMetricasAdmin(rid),
  ]).then(([z, m, c, p, ped, met]) => {
    const mesas = m.data ?? []
    const pedidos = ped.data ?? []
    return {
      zonas: (z.data ?? []).length,
      mesas: mesas.length,
      mesaIds: mesas.map((x) => x.id),
      mesaEstados: Object.fromEntries(mesas.map((x) => [x.id, x.estado])),
      categorias: (c.data ?? []).length,
      productos: (p.data ?? []).length,
      pedidoIds: pedidos.map((x) => x.id),
      pedidoEstados: Object.fromEntries(pedidos.map((x) => [x.id, x.estado])),
      pedidoMesas: Object.fromEntries(pedidos.map((x) => [x.id, x.mesa_id])),
      cuentasMes: met.data?.cuentasMes ?? 0,
      ventaMes: met.data?.ventaMes ?? 0,
    }
  })
}

function IconoCheck({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 13l4 4L19 7" />
    </svg>
  )
}

function IconoFlecha({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  )
}

function IconoRayo({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M13 2 4 14h6l-1 8 9-12h-6z" />
    </svg>
  )
}

const GLIFOS: Record<string, string> = {
  salon: 'M3 10.5 12 4l9 6.5M5 9.5V20h14V9.5M10 20v-5h4v5',
  carta: 'M5 4h9a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM17 7h2v13H8',
  comanda: 'M7 4h10v16l-5-3-5 3zM10 9h4M10 13h4',
  cocina: 'M6 10h12l-1.2 8.5A2 2 0 0 1 14.8 20H9.2a2 2 0 0 1-2-1.5zM9 6c0-1 1-1.5 1-2.5S9 2 9 2M13 6c0-1 1-1.5 1-2.5S13 2 13 2',
  cobro: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6',
  panel: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
}

function IconoLogro({ nombre, className = 'h-5 w-5' }: { nombre: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={GLIFOS[nombre] ?? GLIFOS.panel} />
    </svg>
  )
}

/** Insignia de nivel: el anillo muestra el avance hacia el siguiente nivel. */
function NivelBadge({ nivel, frac, size = 'md' }: { nivel: number; frac: number; size?: 'sm' | 'md' }) {
  const dim = size === 'sm' ? 34 : 46
  const pct = Math.round(Math.max(0, Math.min(1, frac)) * 360)
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full"
      style={{
        width: dim,
        height: dim,
        background: `conic-gradient(var(--color-brand-500) ${pct}deg, var(--color-surface-700) ${pct}deg)`,
      }}
    >
      <span
        className={`grid place-items-center rounded-full bg-surface-900 font-black text-brand-400 ${
          size === 'sm' ? 'h-[26px] w-[26px] text-xs' : 'h-[36px] w-[36px] text-base'
        }`}
      >
        {nivel}
      </span>
    </span>
  )
}

/** Barra de experiencia con degradado de marca. */
function BarraXp({ frac, className = '' }: { frac: number; className?: string }) {
  return (
    <div className={`h-2 overflow-hidden rounded-full bg-surface-800 ${className}`}>
      <div
        className="h-full rounded-full bg-gradient-to-r from-brand-600 via-brand-500 to-brand-300 transition-[width] duration-500"
        style={{ width: `${Math.round(Math.max(0, Math.min(1, frac)) * 100)}%` }}
      />
    </div>
  )
}

export default function GuiaDemo() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { restaurante } = useCurrentContext()
  const rid = restaurante?.id
  const isDemo = useDemoStore((s) => s.isDemo)
  const activarPrefillGuia = useDemoStore((s) => s.activarPrefillGuia)
  const solicitarFormulario = useDemoStore((s) => s.solicitarFormulario)
  const autoLlenado = useDemoStore((s) => s.autoLlenado)

  const [progreso, setProgreso] = useState<Progreso>(PROGRESO_VACIO)
  const [arrancado, setArrancado] = useState(false)
  const [cargado, setCargado] = useState(false)
  const [listo, setListo] = useState(false)
  const [abierta, setAbierta] = useState(true)
  const [verTodos, setVerTodos] = useState(false)
  const [clics, setClics] = useState<string[]>([])
  const [logro, setLogro] = useState<{ logro: Logro; xp: number; nivel: Nivel } | null>(null)
  const [ahora, setAhora] = useState<Instantanea | null>(null)
  const [confirmando, setConfirmando] = useState(false)
  const [ejecutando, setEjecutando] = useState(false)
  const [exito, setExito] = useState<string | null>(null)
  const [errorGuia, setErrorGuia] = useState<string | null>(null)
  const [vista, setVista] = useState<'auto' | 'expandido' | 'compacto'>('auto')
  const [medidas, setMedidas] = useState<{
    ancla: Rect | null
    modal: Rect | null
    panel: Rect | null
    vp: { w: number; h: number }
  }>({ ancla: null, modal: null, panel: null, vp: { w: 1280, h: 800 } })
  // ¿Cabe el panel grande sin tapar el ancla ni el modal? Se recalcula en
  // reposo (no en cada frame) para que el panel no parpadee mientras se
  // desplaza el contenido y el ancla cruza su posición.
  const [expandidoCabe, setExpandidoCabe] = useState(true)
  const panelRef = useRef<HTMLDivElement>(null)
  // Estado del panel antes de apartarlo para el autocompletado: al volver se
  // restaura tal como estaba (si el usuario lo había minimizado, se queda).
  const panelAntesRef = useRef<boolean | null>(null)
  const progresoRef = useRef(progreso)
  progresoRef.current = progreso

  const paso = useMemo(() => pasoActual(progreso), [progreso])
  const terminado = arrancado && progreso.hechos.length >= TOTAL_PASOS
  const totalHechos = progreso.hechos.length

  // ----------------------------------------------------------------- sondeo
  const sondear = useCallback(async () => {
    if (!rid) return
    const snap = await leerInstantanea(rid)
    setAhora(snap)
    if (cargado) return
    setCargado(true)
    // Al volver al demo se intenta recuperar el recorrido guardado. Como los
    // datos viven en memoria, se descarta si ya no se sostienen (p. ej. F5).
    const guardado = progresoVigente(leerProgreso(), snap)
    if (guardado) {
      setProgreso(guardado)
      setArrancado(true)
      // El recorrido se guarda en localStorage, pero `prefillGuia` vive solo en
      // memoria. Tras un F5 hay que reactivarlo: si no, «Hazlo por mí» abre el
      // formulario pero no escribe nada.
      activarPrefillGuia(true)
    }
  }, [rid, cargado, activarPrefillGuia])

  useEffect(() => {
    void sondear()
    const t = setInterval(() => void sondear(), arrancado ? 1200 : 8000)
    return () => clearInterval(t)
  }, [sondear, arrancado])

  // Clics sobre elementos marcados: descargar la boleta no cambia ningún dato,
  // así que el recorrido la acepta como confirmación explícita del usuario.
  useEffect(() => {
    if (!arrancado) return
    const alPulsar = (e: MouseEvent) => {
      const el = (e.target as Element | null)?.closest?.('[data-guia]')
      const valor = el?.getAttribute('data-guia')
      if (valor) setClics((prev) => (prev.includes(valor) ? prev : [...prev, valor]))
    }
    document.addEventListener('click', alPulsar, true)
    return () => document.removeEventListener('click', alPulsar, true)
  }, [arrancado])

  // ------------------------------------------------------ arranque y reinicios
  const empezar = useCallback(() => {
    setAbierta(true)
    setConfirmando(false)
    setVista('auto')
    activarPrefillGuia(true)
    if (!rid) {
      setArrancado(true)
      return
    }
    setArrancado(true)
    void leerInstantanea(rid).then((snap) => {
      borrarProgreso()
      setProgreso({ ...PROGRESO_VACIO, iniciado: true, base: snap })
    })
  }, [rid, activarPrefillGuia])

  const reiniciar = useCallback(() => {
    borrarProgreso()
    activarPrefillGuia(false)
    setProgreso(PROGRESO_VACIO)
    setClics([])
    setLogro(null)
    setArrancado(false)
    setVerTodos(false)
    setConfirmando(false)
    setExito(null)
    setErrorGuia(null)
    setVista('auto')
  }, [activarPrefillGuia])

  const vaciarDemo = useCallback(() => {
    reiniciarDemoDatos()
    reiniciar()
    setListo(false)
    navigate('/demo/mesero')
    if (rid) void leerInstantanea(rid).then(setAhora)
  }, [navigate, rid, reiniciar])

  // ------------------------------------------------------- detección del tour
  useEffect(() => {
    if (!arrancado || !ahora || !progreso.iniciado) return
    const siguiente = observar(progreso, ahora, pathname, clics)
    if (firma(siguiente) === firma(progreso)) return
    const nuevo = [...siguiente.hechos].reverse().find((h) => !progreso.hechos.includes(h))
    if (nuevo) {
      const ganado = PASOS.find((p) => p.id === nuevo)
      if (ganado) {
        setLogro({ logro: ganado.logro, xp: ganado.xp, nivel: nivelDe(xpTotal(siguiente)) })
        window.setTimeout(() => setLogro(null), 3800)
      }
    }
    setProgreso(siguiente)
  }, [arrancado, ahora, progreso, pathname, clics])

  useEffect(() => {
    if (progreso.iniciado) guardarProgreso(progreso)
  }, [progreso])

  useEffect(() => {
    if (terminado && !listo) setListo(true)
  }, [terminado, listo])

  useEffect(() => {
    if (!exito) return
    const t = window.setTimeout(() => setExito(null), 3200)
    return () => window.clearTimeout(t)
  }, [exito])

  // -------------------------------------------------------- panel y autocompletado
  // Mientras el autocompletado rellena el formulario, el panel de la guía se
  // aparta (se minimiza): si se queda delante tapa el modal y el usuario no ve
  // la simulación. Al cerrar el modal, el panel vuelve a su sitio.
  useEffect(() => {
    if (!autoLlenado) return
    if (panelAntesRef.current === null) {
      panelAntesRef.current = abierta
      setAbierta(false)
    }
  }, [autoLlenado, abierta])

  useEffect(() => {
    if (autoLlenado) return
    if (panelAntesRef.current === null) return
    const antes = panelAntesRef.current
    panelAntesRef.current = null
    // Si el usuario ya lo tenía minimizado, se queda minimizado.
    if (antes) setAbierta(true)
  }, [autoLlenado])

  // -------------------------------------------------------------- resaltado
  const selectores = useMemo(
    () =>
      arrancado && paso
        ? anclasDe(paso.id, {
            mesaTour: progreso.mesaTour,
            pedidoTour: progreso.pedidoTour,
            nuevaZona: progreso.nuevaZona,
            boleta: progreso.boleta,
            categorias: ahora?.categorias ?? 0,
          })
        : [],
    [arrancado, paso, progreso.mesaTour, progreso.pedidoTour, progreso.nuevaZona, progreso.boleta, ahora?.categorias],
  )
  const resaltando = arrancado && !listo
  const ancla = useAnclaResuelta(selectores, resaltando)

  // --------------------------------------------------------------- medidas
  // Se miden ancla, modal abierto y viewport para decidir si la guía va en
  // modo compacto y en qué esquina, sin tapar nunca el ancla ni el modal.
  useEffect(() => {
    let raf = 0
    const medir = () => {
      const anclaRect = rectDe(ancla)
      const modalRect = rectDe(document.querySelector('[role="dialog"][aria-modal="true"]'))
      const panelRect = rectDe(panelRef.current)
      const vp = { w: window.innerWidth, h: window.innerHeight }
      setMedidas((prev) => {
        if (
          firmaRect(prev.ancla) === firmaRect(anclaRect) &&
          firmaRect(prev.modal) === firmaRect(modalRect) &&
          firmaRect(prev.panel) === firmaRect(panelRect) &&
          prev.vp.w === vp.w &&
          prev.vp.h === vp.h
        ) {
          return prev
        }
        return { ancla: anclaRect, modal: modalRect, panel: panelRect, vp }
      })
      raf = requestAnimationFrame(medir)
    }
    raf = requestAnimationFrame(medir)
    return () => cancelAnimationFrame(raf)
  }, [ancla])

  // La decisión compacto/expandido se evalúa en reposo: si el ancla se sigue
  // moviendo (scroll, animación, arrastre), se pospone hasta que se estabilice.
  useEffect(() => {
    const t = window.setTimeout(() => {
      setExpandidoCabe(hayEsquinaLibre(medidas.ancla, medidas.modal, medidas.vp, GUI_ALTO_EXPANDIDO))
    }, 160)
    return () => window.clearTimeout(t)
  }, [medidas.ancla, medidas.modal, medidas.vp])

  const pasoIdx = paso ? PASOS.findIndex((p) => p.id === paso.id) : TOTAL_PASOS
  const ctx = useMemo(
    () => ({
      mesaTour: progreso.mesaTour,
      pedidoTour: progreso.pedidoTour,
      nuevaZona: progreso.nuevaZona,
      boleta: progreso.boleta,
      categorias: ahora?.categorias ?? 0,
    }),
    [progreso.mesaTour, progreso.pedidoTour, progreso.nuevaZona, progreso.boleta, ahora?.categorias],
  )
  const enVista = paso ? pathname === paso.ruta : true
  const mostrarIr = Boolean(paso) && (!enVista || ancla === null)

  const esMovil = medidas.vp.w < 768
  // Tamaño intrínseco: la intro y el escritorio prefieren el panel grande; el
  // móvil, la barra. El usuario puede fijarlo con los botones (`vista`).
  const vistaAuto: 'expandido' | 'compacto' = !arrancado || !esMovil ? 'expandido' : 'compacto'
  const vistaPreferida = vista === 'auto' ? vistaAuto : vista
  const compacto = vistaPreferida === 'compacto' ? true : !expandidoCabe
  // La esquina se calcula con la altura real del panel para que nunca lo solape.
  const altoPanel = compacto ? GUI_ALTO_COMPACTO : GUI_ALTO_EXPANDIDO
  const esquina: Esquina = elegirEsquina(medidas.ancla, medidas.modal, medidas.vp, altoPanel)

  const estilo: CSSProperties = {}
  if (esMovil) {
    estilo.left = 12
    estilo.right = 12
    if (esquina.startsWith('superior')) estilo.top = 12
    else estilo.bottom = 12
  } else {
    estilo.width = compacto ? 'auto' : '22rem'
    if (esquina.endsWith('derecha')) estilo.right = GUI_MARGEN
    else estilo.left = GUI_MARGEN
    if (esquina.startsWith('superior')) estilo.top = GUI_MARGEN
    else estilo.bottom = GUI_MARGEN
  }
  // Nunca más alto que la pantalla ni que la altura que usa el cálculo de
  // esquinas (`GUI_ALTO_EXPANDIDO`): el panel hace scroll interno en vez de
  // desbordarse o de solaparse con lo que hay que pulsar.
  estilo.maxHeight = compacto
    ? 'calc(100dvh - 24px)'
    : esMovil
      // En móviles, limita la introducción para que siga visible parte de la
      // pantalla detrás de la guía; el contenido de la tarjeta puede desplazarse.
      ? 'min(calc(100dvh - 24px), 60dvh)'
      : `min(calc(100dvh - 24px), ${GUI_ALTO_EXPANDIDO}px)`
  estilo.overflowY = 'auto'

  // -------------------------------------------------------------- experiencia
  const xp = xpTotal(progreso)
  const nivel = nivelDe(xp)
  const nivelSig = nivelSiguiente(xp)
  const xpFrac = progresoNivel(xp)
  const xpMision = paso ? xpDePaso(paso.id) : 0
  const pistaTexto = !arrancado
    ? 'Mesora, en 6 pasos'
    : terminado
      ? '¡Recorrido completo!'
      : paso
        ? pista(paso.id, ctx)
        : ''

  // ------------------------------------------------------------ hazlo por mí
  const hacerPorMi = useCallback(async () => {
    if (!rid || !paso || ejecutando) return
    // Los pasos que se resuelven rellenando un formulario (crear zona/mesa o un
    // plato) no se crean en silencio: abrimos el formulario del panel con datos
    // sugeridos para que el usuario solo confirme. El paso se marca al guardar,
    // igual que si lo hiciera a mano.
    const formulario = formularioDePaso(paso.id, ctx)
    if (formulario) {
      setErrorGuia(null)
      setExito(null)
      if (pathname !== paso.ruta) navigate(paso.ruta)
      solicitarFormulario(formulario)
      return
    }
    setEjecutando(true)
    setErrorGuia(null)
    setExito(null)
    try {
      const api = getApi()
      if (pathname !== paso.ruta) {
        navigate(paso.ruta)
        await new Promise((r) => window.setTimeout(r, 250))
      }
      switch (paso.id) {
        case 'comanda': {
          const mesas = (await api.getMesas(rid)).data ?? []
          const libre = mesas.find((m) => m.estado === 'libre')
          const prods = (await api.getProductos(rid)).data ?? []
          const prod = prods[0]
          if (!libre || !prod) {
            setErrorGuia('No hay una mesa libre o un producto disponible')
            return
          }
          const ped = await api.crearPedido(rid, libre.id, [
            {
              producto_id: prod.id,
              nombre_producto: prod.nombre,
              cantidad: 1,
              precio_unitario:
                prod.es_promocion && prod.precio_promocion ? prod.precio_promocion : prod.precio,
              nota: null,
            },
          ])
          if (ped.error) {
            setErrorGuia(ped.error)
            return
          }
          break
        }
        case 'cocina': {
          const pedidos = (await api.getPedidosActivos(rid)).data ?? []
          if (pedidos.length === 0) {
            setErrorGuia('No hay comandas en cocina')
            return
          }
          const objetivo = pedidos.find((p) => p.id === progresoRef.current.pedidoTour) ?? pedidos[0]
          const r = await api.avanzarPedido(rid, objetivo.id)
          if (r.error) {
            setErrorGuia(r.error)
            return
          }
          break
        }
        case 'cobro': {
          const mesas = (await api.getMesas(rid)).data ?? []
          const mesaId =
            progresoRef.current.mesaTour ?? mesas.find((m) => m.estado === 'ocupada')?.id ?? null
          if (!mesaId) {
            setErrorGuia('No hay ninguna mesa por cobrar')
            return
          }
          const pend = (await api.getPedidosDeMesa(rid, mesaId)).data ?? []
          if (pend.length === 0) {
            setErrorGuia('La mesa no tiene comandas por cobrar')
            return
          }
          const r = await api.cerrarCuenta(
            rid,
            mesaId,
            pend.map((p) => p.id),
            'efectivo',
          )
          if (r.error) {
            setErrorGuia(r.error)
            return
          }
          // La boleta se confirma con el clic, igual que si el usuario la descargara.
          setClics((prev) => (prev.includes('boleta-pdf') ? prev : [...prev, 'boleta-pdf']))
          break
        }
        case 'panel':
          break
      }
      setExito('¡Listo! Paso completado.')
      if (rid) void leerInstantanea(rid).then(setAhora)
      const siguiente = PASOS[PASOS.findIndex((p) => p.id === paso.id) + 1]
      if (siguiente && siguiente.ruta !== pathname) {
        window.setTimeout(() => navigate(siguiente.ruta), 400)
      }
    } finally {
      setEjecutando(false)
    }
  }, [rid, paso, ejecutando, pathname, navigate, ctx, solicitarFormulario])

  // -------------------------------------------------------------- minimizado
  if (!abierta) {
    // Mientras el demo rellena un formulario, la guía desaparece del todo: su
    // burbuja flota en z-[60] y taparía el botón de guardar del modal (z-50).
    if (autoLlenado) return null
    return (
      <button
        type="button"
        onClick={() => setAbierta(true)}
        className="fixed bottom-4 right-4 z-[60] flex min-h-12 touch-manipulation items-center gap-2.5 rounded-full border border-brand-500/40 bg-surface-900/95 py-2 pl-2 pr-5 text-left shadow-xl shadow-black/50 backdrop-blur transition hover:border-brand-500 hover:bg-surface-900 active:scale-95"
      >
        <NivelBadge nivel={arrancado ? nivel.nivel : 1} frac={arrancado ? (terminado ? 1 : xpFrac) : 0} size="sm" />
        <span className="grid gap-0.5 leading-tight">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-brand-400">
            {arrancado ? (terminado ? 'Nivel máximo' : `Nivel ${nivel.nivel} · ${nivel.titulo}`) : 'Demo guiado'}
          </span>
          <span className="text-xs font-bold text-zinc-100">
            {arrancado
              ? terminado
                ? '¡Recorrido completo!'
                : `${xp} XP · ${totalHechos}/${TOTAL_PASOS} misiones`
              : 'Ver el demo en 6 pasos'}
          </span>
        </span>
      </button>
    )
  }

  return (
    <>
      {resaltando && <Spotlight ancla={ancla} />}

      {logro && (
        <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-4 top-24 z-[80] mx-auto w-full max-w-sm">
          <div
            className="flex items-center gap-3 overflow-hidden rounded-2xl border border-brand-500/50 bg-surface-900/95 px-4 py-3 shadow-2xl shadow-black/60 backdrop-blur"
            style={{ animation: 'guiaEntra .25s ease-out' }}
          >
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-500 text-surface-950 shadow-lg shadow-brand-500/30">
              <IconoLogro nombre={logro.logro.icono} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-brand-400">Logro desbloqueado</p>
                <span className="rounded-full bg-brand-500/15 px-2 py-0.5 text-[11px] font-black text-brand-300">
                  +{logro.xp} XP
                </span>
              </div>
              <p className="truncate text-sm font-bold text-zinc-100">{logro.logro.titulo}</p>
              <p className="truncate text-xs text-zinc-500">{logro.logro.detalle}</p>
            </div>
            <span className="grid shrink-0 place-items-center rounded-xl border border-surface-700 bg-surface-950/60 px-2.5 py-1.5 text-center">
              <span className="block text-[9px] font-semibold uppercase tracking-widest text-zinc-500">Nivel</span>
              <span className="block text-lg font-black leading-none text-brand-400" style={{ animation: 'guiaPop .35s ease-out' }}>
                {logro.nivel.nivel}
              </span>
            </span>
          </div>
        </div>
      )}

      <div
        ref={panelRef}
        data-guia-panel
        role="dialog"
        aria-label="Recorrido guiado del demo"
        className="fixed z-[60]"
        style={estilo}
      >
        {compacto ? (
          <div className="card flex items-center gap-2.5 p-2.5 shadow-2xl shadow-black/60">
            <NivelBadge nivel={arrancado ? nivel.nivel : 1} frac={arrancado ? (terminado ? 1 : xpFrac) : 0} size="sm" />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                <span className="truncate text-xs font-medium text-zinc-300">{pistaTexto}</span>
                {arrancado && (
                  <span className="shrink-0 rounded-full bg-brand-500/15 px-1.5 py-0.5 text-[10px] font-black text-brand-300">
                    {xp} XP
                  </span>
                )}
              </span>
              {arrancado && <BarraXp frac={terminado ? 1 : xpFrac} className="mt-1.5 h-1" />}
            </span>
            {isDemo && arrancado && !terminado && (
              <button
                type="button"
                onClick={() => void hacerPorMi()}
                disabled={ejecutando}
                aria-label="Hazlo por mí"
                className="inline-flex min-h-10 shrink-0 touch-manipulation items-center gap-1.5 rounded-lg border border-brand-500/50 bg-brand-500/10 px-2.5 text-xs font-semibold text-brand-400 transition hover:border-brand-500 hover:bg-brand-500/15 active:scale-95 disabled:opacity-50"
              >
                <IconoRayo className="h-4 w-4 shrink-0" />
                <span className="whitespace-nowrap">{ejecutando ? 'Haciéndolo…' : 'Hazlo por mí'}</span>
              </button>
            )}
            {expandidoCabe && (
              <button
                type="button"
                onClick={() => setVista('expandido')}
                aria-label="Expandir guía"
                className="grid h-9 w-9 shrink-0 touch-manipulation place-items-center rounded-lg text-zinc-400 transition hover:bg-surface-800 hover:text-white"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M4 10V4h6M20 14v6h-6" />
                </svg>
              </button>
            )}
            <button
              type="button"
              onClick={() => setAbierta(false)}
              aria-label="Minimizar guía"
              className="grid h-9 w-9 shrink-0 touch-manipulation place-items-center rounded-lg text-zinc-400 transition hover:bg-surface-800 hover:text-white"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M6 12h12" />
              </svg>
            </button>
          </div>
        ) : (
          <div className="card overflow-hidden p-0 shadow-2xl shadow-black/60">
            <div className="border-b border-surface-800 bg-gradient-to-br from-brand-500/15 via-surface-900/50 to-surface-900/80 px-5 pb-3 pt-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <NivelBadge nivel={arrancado ? nivel.nivel : 1} frac={arrancado ? (terminado ? 1 : xpFrac) : 0} />
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-brand-400">
                      {arrancado ? `Nivel ${nivel.nivel}` : 'Demo guiado'}
                    </p>
                    <p className="truncate text-sm font-bold tracking-tight text-zinc-100">
                      {arrancado ? (terminado ? '¡Recorrido completo!' : nivel.titulo) : 'Mesora, en 6 pasos'}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {arrancado && !compacto && (
                    <button
                      type="button"
                      onClick={() => setVista('compacto')}
                      aria-label="Compactar guía"
                      className="grid h-9 w-9 touch-manipulation place-items-center rounded-lg text-zinc-400 transition hover:bg-surface-800 hover:text-white"
                    >
                      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M9 15l-5 5M15 9l5-5M4 20v-5h5M20 4v5h-5" />
                      </svg>
                    </button>
                  )}
                  {arrancado && !listo && (
                    <button
                      type="button"
                      onClick={reiniciar}
                      className="rounded-lg px-2 py-1.5 text-[11px] font-semibold text-zinc-500 transition hover:bg-surface-800 hover:text-zinc-300"
                    >
                      Reiniciar
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setAbierta(false)}
                    aria-label="Minimizar guía"
                    className="grid h-9 w-9 touch-manipulation place-items-center rounded-lg text-zinc-400 transition hover:bg-surface-800 hover:text-white"
                  >
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M6 12h12" />
                    </svg>
                  </button>
                </div>
              </div>

              {arrancado && (
                <>
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-[10px] font-semibold">
                      <span className="text-brand-300">{xp} XP</span>
                      <span className="text-zinc-500">
                        {nivelSig ? `${nivelSig.xpMin - xp} XP para Nivel ${nivelSig.nivel}` : 'Nivel máximo'}
                      </span>
                    </div>
                    <BarraXp frac={terminado ? 1 : xpFrac} className="mt-1.5" />
                  </div>
                  <div className="mt-3 flex h-1.5 w-full gap-1">
                    {PASOS.map((p, i) => (
                      <span
                        key={p.id}
                        className={`flex-1 rounded-full transition-all duration-500 ${
                          progreso.hechos.includes(p.id)
                            ? 'bg-ok-500'
                            : !listo && i === pasoIdx
                              ? 'bg-brand-500'
                              : 'bg-surface-800'
                        }`}
                      />
                    ))}
                  </div>
                  <p className="mt-2 text-[11px] text-zinc-500">
                    {totalHechos} de {TOTAL_PASOS} misiones · se marcan solas al hacer la acción
                  </p>
                </>
              )}
            </div>

            <div className="px-5 py-4">
              {!arrancado ? (
                <div>
                  <p className="text-xs leading-relaxed text-zinc-400">
                    Este demo es <span className="font-semibold text-zinc-200">un restaurante vivo</span>: armas el salón,
                    cargas la carta, un mesero toma el pedido, la cocina lo prepara y el cobro genera la boleta. Te
                    ilumino el control exacto y <span className="font-semibold text-zinc-200">cada paso se marca solo</span>{' '}
                    cuando haces la acción de verdad.
                  </p>
                  <div className="mt-3 flex items-center gap-3 rounded-xl border border-surface-800 bg-surface-950/40 px-3 py-2.5">
                    <NivelBadge nivel={1} frac={0} size="sm" />
                    <p className="text-[11px] leading-snug text-zinc-400">
                      Empiezas como <span className="font-semibold text-zinc-200">Nivel 1 · Aprendiz</span>. Cada misión
                      te da XP y te acerca a <span className="font-semibold text-brand-400">Maestro Mesora</span>.
                    </p>
                  </div>
                  <ul className="mt-3 flex flex-wrap gap-1.5">
                    {PASOS.map((p) => (
                      <li key={p.id} className="chip chip-neutral text-[11px]">
                        {p.titulo} <span className="font-black text-brand-400">+{p.xp}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={empezar}
                      className="inline-flex min-h-11 touch-manipulation items-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-surface-950 transition hover:bg-brand-400 active:scale-[0.98]"
                    >
                      Empezar recorrido
                      <IconoFlecha className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setAbierta(false)}
                      className="inline-flex min-h-11 touch-manipulation rounded-lg px-3 py-2.5 text-sm font-medium text-zinc-400 transition hover:bg-surface-800 hover:text-zinc-200"
                    >
                      Explorar por mi cuenta
                    </button>
                  </div>
                </div>
              ) : listo ? (
                <Celebracion progreso={progreso} ahora={ahora} onReiniciar={vaciarDemo} />
              ) : paso ? (
                <div className="flex items-start gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-500 text-sm font-black text-surface-950">
                    {pasoIdx + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-brand-400">{paso.donde}</p>
                    <p className="mt-0.5 text-sm font-semibold text-zinc-100">
                      Misión {pasoIdx + 1}: {paso.titulo}
                    </p>
                    <p className="mt-1.5 text-xs leading-relaxed text-zinc-400">{pista(paso.id, ctx)}</p>

                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <span className="chip chip-warn text-[11px]">
                        <IconoRayo className="h-3.5 w-3.5" />
                        +{xpMision} XP
                      </span>
                      <span className="chip chip-neutral text-[11px]">
                        <IconoLogro nombre={paso.logro.icono} className="h-3.5 w-3.5" />
                        {paso.logro.titulo}
                      </span>
                    </div>

                    <details key={paso.id} className="mt-2">
                      <summary className="cursor-pointer select-none text-[11px] font-medium text-zinc-500 transition hover:text-zinc-300">
                        ¿Por qué?
                      </summary>
                      <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">{paso.porque}</p>
                    </details>

                    {errorGuia && (
                      <p className="mt-2 rounded-lg border border-danger-500/40 bg-danger-500/10 px-2.5 py-1.5 text-[11px] text-danger-500">
                        {errorGuia}
                      </p>
                    )}
                    {exito && (
                      <p className="mt-2 rounded-lg border border-ok-500/40 bg-ok-500/10 px-2.5 py-1.5 text-[11px] font-medium text-ok-500">
                        {exito}
                      </p>
                    )}

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {mostrarIr && (
                        <button
                          type="button"
                          onClick={() => navigate(paso.ruta)}
                          className="group inline-flex min-h-11 touch-manipulation items-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-surface-950 transition hover:bg-brand-400 active:scale-[0.98]"
                        >
                          {enVista ? 'Ver dónde tocar' : 'Ir a esta vista'}
                          <IconoFlecha className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                        </button>
                      )}
                      {isDemo && (
                        <button
                          type="button"
                          onClick={() => void hacerPorMi()}
                          disabled={ejecutando}
                          className="inline-flex min-h-11 touch-manipulation items-center gap-2 rounded-lg border border-brand-500/50 bg-brand-500/10 px-4 py-2.5 text-sm font-semibold text-brand-400 transition hover:border-brand-500 hover:bg-brand-500/15 active:scale-[0.98] disabled:cursor-wait disabled:opacity-60"
                        >
                          <IconoRayo className="h-4 w-4" />
                          {ejecutando ? 'Haciéndolo…' : 'Hazlo por mí'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ) : null}

              {arrancado && (
                <button
                  type="button"
                  onClick={() => setVerTodos((v) => !v)}
                  className="mt-4 w-full text-center text-xs font-medium text-zinc-500 transition hover:text-zinc-300"
                >
                  {verTodos ? 'Ocultar los 6 pasos' : 'Ver los 6 pasos y sus logros'}
                </button>
              )}
            </div>

            {verTodos && arrancado && (
              <ul className="divide-y divide-surface-800 border-t border-surface-800">
                {PASOS.map((p, i) => {
                  const hecho = progreso.hechos.includes(p.id)
                  return (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => !hecho && navigate(p.ruta)}
                        disabled={hecho}
                        className="flex w-full items-center gap-3 px-5 py-3 text-left transition enabled:hover:bg-surface-900/60"
                      >
                        <span
                          className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold ${
                            hecho
                              ? 'border border-ok-500/40 bg-ok-500/10 text-ok-500'
                              : !listo && i === pasoIdx
                                ? 'bg-brand-500 text-surface-950'
                                : 'border border-surface-700 text-zinc-500'
                          }`}
                        >
                          {hecho ? <IconoCheck className="h-4 w-4" /> : i + 1}
                        </span>
                          <span className="min-w-0 flex-1">
                            <span className={`block truncate text-sm ${hecho ? 'text-zinc-500' : 'text-zinc-200'}`}>{p.titulo}</span>
                            <span className="block truncate text-[11px] text-zinc-600">
                              {hecho ? p.logro.titulo : p.resumen}
                            </span>
                          </span>
                          <span className={`shrink-0 text-[11px] font-black ${hecho ? 'text-ok-500' : 'text-brand-400'}`}>
                            +{p.xp}
                          </span>
                          <span className={`shrink-0 ${hecho ? 'text-ok-500' : 'text-zinc-700'}`}>
                            <IconoLogro nombre={p.logro.icono} className="h-4 w-4" />
                          </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}

            {ahora && (
              <div className="border-t border-surface-800 bg-surface-950/40 px-5 py-3">
                <p className="text-[11px] leading-relaxed text-zinc-500">
                  {arrancado ? 'Ahora mismo: ' : 'Ejemplos de este demo: '}
                  <span className="text-zinc-300">{ahora.mesas} mesas</span> ·{' '}
                  <span className="text-zinc-300">{ahora.productos} productos</span> ·{' '}
                  <span className="text-zinc-300">{ahora.pedidoIds.length} comandas activas</span> ·{' '}
                  <span className="text-zinc-300">{ahora.cuentasMes} cuentas del mes</span>
                </p>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <p className="text-[11px] text-zinc-600">
                    {arrancado ? 'El demo se guarda en este navegador. «Vaciar el demo» lo reinicia.' : '6 pasos · sin tocar la app real'}
                  </p>
                  <button
                    type="button"
                    onClick={() => (confirmando ? vaciarDemo() : setConfirmando(true))}
                    onBlur={() => setConfirmando(false)}
                    className={`shrink-0 text-[11px] font-semibold transition ${
                      confirmando ? 'text-danger-500' : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    {confirmando ? '¿Seguro? Vuelve a tocar para vaciar' : 'Vaciar el demo'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  )
}

function Celebracion({
  progreso,
  ahora,
  onReiniciar,
}: {
  progreso: Progreso
  ahora: Instantanea | null
  onReiniciar: () => void
}) {
  const r = ahora ? resumen(progreso, ahora) : null
  const xp = xpTotal(progreso)
  const nivel = nivelDe(xp)
  const maximo = xp >= XP_TOTAL
  const confeti = Array.from({ length: 14 })
  const colores = ['#ff9500', '#22c55e', '#38bdf8', '#ffc270', '#ffefd4']
  return (
    <div>
      <div className="relative overflow-hidden rounded-2xl border border-brand-500/40 bg-gradient-to-br from-brand-500/25 via-surface-900 to-surface-900 px-4 py-4 text-center">
        {confeti.map((_, i) => (
          <span
            key={i}
            aria-hidden="true"
            className="pointer-events-none absolute top-0 h-2 w-1.5 rounded-sm"
            style={{
              left: `${6 + i * 6.6}%`,
              background: colores[i % colores.length],
              animation: `guiaConfeti ${1.6 + (i % 5) * 0.25}s ease-in ${i * 0.06}s infinite`,
            }}
          />
        ))}
        <div className="relative mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-brand-500 text-surface-950 shadow-lg shadow-brand-500/40" style={{ animation: 'guiaPop .4s ease-out' }}>
          <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M8 3h8v5a4 4 0 0 1-8 0zM8 5H5a2 2 0 0 0 2 4M16 5h3a2 2 0 0 1-2 4M12 12v5M9 21h6M10 17h4" />
          </svg>
        </div>
        <p className="relative mt-2 text-base font-black tracking-tight text-zinc-50">
          {maximo ? '¡Maestro Mesora!' : '¡Recorrido completo!'}
        </p>
        <p className="relative mt-0.5 text-xs text-zinc-400">
          Nivel {nivel.nivel} · {nivel.titulo}
        </p>
        <div className="relative mt-3">
          <div className="flex items-center justify-between text-[10px] font-semibold">
            <span className="text-brand-300">{xp} XP</span>
            <span className="text-zinc-500">{maximo ? 'Nivel máximo' : `${xp}/${XP_TOTAL} XP`}</span>
          </div>
          <BarraXp frac={XP_TOTAL ? xp / XP_TOTAL : 0} className="mt-1.5" />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {NIVELES.map((n) => (
          <span
            key={n.nivel}
            className={`chip text-[11px] ${
              nivel.nivel >= n.nivel ? 'chip-warn' : 'chip-neutral opacity-60'
            }`}
          >
            {nivel.nivel >= n.nivel ? <IconoCheck className="h-3.5 w-3.5" /> : <LockIcono />}
            {n.titulo}
          </span>
        ))}
      </div>

      <p className="mt-3 text-xs leading-relaxed text-zinc-400">
        {maximo
          ? 'Dominaste el ciclo entero de Mesora: salón, carta, comanda, cocina, cobro y panel.'
          : 'Corriste el ciclo completo de Mesora.'}
      </p>
      <ul className="mt-3 grid grid-cols-2 gap-2">
        {PASOS.map((p) => (
          <li key={p.id} className="flex items-center gap-2 rounded-lg bg-surface-900 px-2.5 py-2">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-brand-500/15 text-brand-400">
              <IconoLogro nombre={p.logro.icono} className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-semibold text-zinc-200">{p.logro.titulo}</span>
              <span className="block truncate text-[10px] text-zinc-600">{p.logro.detalle}</span>
            </span>
            <span className="shrink-0 text-[10px] font-black text-brand-400">+{p.xp}</span>
          </li>
        ))}
      </ul>

      {r && (r.mesas > 0 || r.productos > 0 || r.venta > 0) && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {r.mesas > 0 && <span className="chip chip-neutral text-[11px]">+{r.mesas} mesas</span>}
          {r.zonas > 0 && <span className="chip chip-neutral text-[11px]">+{r.zonas} zonas</span>}
          {r.productos > 0 && <span className="chip chip-neutral text-[11px]">+{r.productos} productos</span>}
          {r.comandas > 0 && <span className="chip chip-neutral text-[11px]">+{r.comandas} comandas</span>}
          {r.venta > 0 && <span className="chip chip-neutral text-[11px]">{fmtPEN(r.venta)} vendidos</span>}
        </div>
      )}

      <p className="mt-3 text-[11px] leading-relaxed text-zinc-500">
        {ahora
          ? `El panel ya muestra ${ahora.cuentasMes} cuentas y ${fmtPEN(ahora.ventaMes)} del mes. En la app real cada rol entra con su usuario y solo ve su vista.`
          : 'En la app real cada rol entra con su usuario y solo ve su vista.'}
      </p>

      <button
        type="button"
        onClick={onReiniciar}
        className="mt-4 inline-flex min-h-11 touch-manipulation items-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-surface-950 transition hover:bg-brand-400 active:scale-[0.98]"
      >
        Correrlo otra vez
        <IconoFlecha className="h-4 w-4" />
      </button>
    </div>
  )
}

function LockIcono() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  )
}
