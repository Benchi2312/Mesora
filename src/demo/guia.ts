// Motor del recorrido guiado del modo demo.
//
// Idea central: el tour NO instrumenta la app. Toma una foto de los datos al
// arrancar y después solo observa (sondeo cada ~1,2 s) qué cambió de verdad.
// Si el usuario creó una mesa, apareció una comanda o se cobró una cuenta, el
// paso se marca solo. Un clic en un elemento marcado con `data-guia` también
// cuenta como señal (así se confirma la descarga de la boleta).
//
// Todo el módulo es lógica pura salvo las dos funciones de almacenamiento, para
// poder verificar la detección en `npm run verificar` sin navegador.

export type PasoId = 'salon' | 'carta' | 'comanda' | 'cocina' | 'cobro' | 'panel'

export interface Logro {
  icono: string
  titulo: string
  detalle: string
}

export interface Paso {
  id: PasoId
  titulo: string
  donde: string
  resumen: string
  /** El detalle ("por qué"): se muestra plegado, nunca compite con la pista. */
  porque: string
  ruta: string
  /** Puntos de experiencia que otorga completar la misión. */
  xp: number
  logro: Logro
}

export const PASOS: Paso[] = [
  {
    id: 'salon',
    titulo: 'Abre tu salón',
    donde: 'Administrador · Mesas y zonas',
    resumen: 'Zona y mesa listas en el salón',
    porque:
      'La mesa aparece en el salón del mesero en cuanto la guardas. Con zona y mesa ya puedes tomar pedidos.',
    ruta: '/demo/admin',
    xp: 100,
    logro: { icono: 'salon', titulo: 'Salón abierto', detalle: 'Creaste tu primera zona y mesa.' },
  },
  {
    id: 'carta',
    titulo: 'Carga tu carta',
    donde: 'Administrador · Menú',
    resumen: 'Un producto nuevo en el menú',
    porque:
      'El precio y la marca «bebida» deciden si lo prepara la cocina o la barra.',
    ruta: '/demo/admin',
    xp: 120,
    logro: { icono: 'carta', titulo: 'Producto en carta', detalle: 'Tu carta ya tiene un producto tuyo.' },
  },
  {
    id: 'comanda',
    titulo: 'Toma el pedido',
    donde: 'Mesero · Salón',
    resumen: 'Comanda enviada a cocina',
    porque:
      'La mesa pasa a ocupada en cuanto envías la comanda, sin recargar.',
    ruta: '/demo/mesero',
    xp: 140,
    logro: { icono: 'comanda', titulo: 'Primera comanda', detalle: 'Un mesero tomó un pedido real.' },
  },
  {
    id: 'cocina',
    titulo: 'La cocina se pone',
    donde: 'Cocina · Comandas',
    resumen: 'La comanda avanzó de estado',
    porque:
      'El salón ve el estado actualizado al momento: pendiente → preparando → listo.',
    ruta: '/demo/cocina',
    xp: 160,
    logro: { icono: 'cocina', titulo: 'Mesa en cocina', detalle: 'La comanda salió de la cola.' },
  },
  {
    id: 'cobro',
    titulo: 'Cobra y entrega la boleta',
    donde: 'Mesero · Cierre de cuenta',
    resumen: 'Cuenta pagada y boleta en PDF',
    porque:
      'Cobra con el método que quieras y descarga la boleta en PDF para el cliente.',
    ruta: '/demo/mesero',
    xp: 180,
    logro: { icono: 'cobro', titulo: 'Venta cerrada', detalle: 'Cobraste tu primera cuenta en Mesora.' },
  },
  {
    id: 'panel',
    titulo: 'Mira el resultado',
    donde: 'Administrador · Dashboard',
    resumen: 'La venta ya está en el panel',
    porque:
      'La venta aparece en ventas de hoy, en el ticket promedio y en los métodos de pago.',
    ruta: '/demo/admin',
    xp: 200,
    logro: { icono: 'panel', titulo: 'Ciclo completo', detalle: 'Del salón al panel, sin papeles.' },
  },
]

export const TOTAL_PASOS = PASOS.length

// ------------------------------------------------------------------ niveles
//
// Cada misión otorga XP y, en la práctica, cada paso completa sube de nivel:
// los umbrales están alineados con el XP acumulado (100, 220, 360, 520, 700) de
// modo que el recorrido se siente como un juego sin dejar de ser una explicación.

export interface Nivel {
  nivel: number
  titulo: string
  /** XP acumulado mínimo para alcanzar el nivel. */
  xpMin: number
}

export const NIVELES: Nivel[] = [
  { nivel: 1, titulo: 'Aprendiz', xpMin: 0 },
  { nivel: 2, titulo: 'Ayudante de salón', xpMin: 100 },
  { nivel: 3, titulo: 'Anfitrión', xpMin: 220 },
  { nivel: 4, titulo: 'Mesero estrella', xpMin: 360 },
  { nivel: 5, titulo: 'Jefe de salón', xpMin: 520 },
  { nivel: 6, titulo: 'Maestro Mesora', xpMin: 700 },
]

/** XP máximo que se puede ganar en el recorrido. */
export const XP_TOTAL = PASOS.reduce((s, p) => s + p.xp, 0)

export function xpDePaso(id: PasoId): number {
  return PASOS.find((p) => p.id === id)?.xp ?? 0
}

/** XP ganado según las misiones ya completadas. */
export function xpTotal(progreso: Progreso): number {
  return progreso.hechos.reduce((s, id) => s + xpDePaso(id), 0)
}

export function nivelDe(xp: number): Nivel {
  let actual = NIVELES[0]
  for (const n of NIVELES) if (xp >= n.xpMin) actual = n
  return actual
}

export function nivelSiguiente(xp: number): Nivel | null {
  const actual = nivelDe(xp)
  return NIVELES.find((n) => n.nivel === actual.nivel + 1) ?? null
}

/** Fracción 0..1 del avance dentro del nivel actual (para la barra de XP). */
export function progresoNivel(xp: number): number {
  const actual = nivelDe(xp)
  const siguiente = nivelSiguiente(xp)
  if (!siguiente) return 1
  const tramo = siguiente.xpMin - actual.xpMin
  if (tramo <= 0) return 1
  return Math.max(0, Math.min(1, (xp - actual.xpMin) / tramo))
}

/** Cuántos logros (pasos) se han desbloqueado. */
export function logrosDe(progreso: Progreso): number {
  return progreso.hechos.length
}

// --------------------------------------------------------------------- datos

/** Foto de los datos del demo en un instante dado. */
export interface Instantanea {
  zonas: number
  mesas: number
  mesaIds: string[]
  mesaEstados: Record<string, 'libre' | 'ocupada'>
  categorias: number
  productos: number
  pedidoIds: string[]
  pedidoEstados: Record<string, string>
  /** Mesa a la que pertenece cada comanda (para resaltar la mesa correcta). */
  pedidoMesas: Record<string, string>
  cuentasMes: number
  ventaMes: number
}

export interface Progreso {
  version: 2
  iniciado: boolean
  base: Instantanea | null
  hechos: PasoId[]
  mesaTour: string | null
  pedidoTour: string | null
  /** Estados de las comandas observadas (acumula: no se pierde al releer). */
  pedidoEstados: Record<string, string>
  nuevaZona: boolean
  boleta: boolean
}

export const PROGRESO_VACIO: Progreso = {
  version: 2,
  iniciado: false,
  base: null,
  hechos: [],
  mesaTour: null,
  pedidoTour: null,
  pedidoEstados: {},
  nuevaZona: false,
  boleta: false,
}

const ORDEN_ESTADO: Record<string, number> = {
  pendiente: 0,
  en_preparacion: 1,
  listo: 2,
  entregado: 3,
}

export function gradoEstado(estado: string | undefined): number {
  return estado ? (ORDEN_ESTADO[estado] ?? -1) : -1
}

// ----------------------------------------------------------------- detección

/**
 * Fusiona una observación nueva con el progreso acumulado.
 * Nunca "deshace" un paso ya completado.
 */
export function observar(anterior: Progreso, ahora: Instantanea, ruta: string, clics: string[]): Progreso {
  const base = anterior.base
  if (!base) return anterior

  const p: Progreso = {
    ...anterior,
    pedidoEstados: { ...anterior.pedidoEstados, ...ahora.pedidoEstados },
  }

  const idsBase = new Set(base.mesaIds)
  const mesaNueva = ahora.mesaIds.find((id) => !idsBase.has(id)) ?? null
  if (mesaNueva && !p.mesaTour) p.mesaTour = mesaNueva
  if (ahora.zonas > base.zonas) p.nuevaZona = true

  const idsPedidoBase = new Set(base.pedidoIds)
  const pedidoNuevo =
    ahora.pedidoIds.find((id) => !idsPedidoBase.has(id)) ??
    Object.keys(p.pedidoEstados).find((id) => !idsPedidoBase.has(id)) ??
    null
  if (pedidoNuevo && !p.pedidoTour) {
    p.pedidoTour = pedidoNuevo
    // La mesa real de la comanda manda sobre la mesa creada en el paso 1.
    if (ahora.pedidoMesas[pedidoNuevo]) p.mesaTour = ahora.pedidoMesas[pedidoNuevo]
  }

  const estadoPedidoTour = p.pedidoTour ? p.pedidoEstados[p.pedidoTour] : undefined
  const pedidoAvanzado = gradoEstado(estadoPedidoTour) > 0
  // La comanda sale de `getPedidosActivos` cuando llega a entregado o cuando se
  // cobra. En ambos casos pasó por cocina: sirve de red si el sondeo la dejó
  // pasar entre dos lecturas.
  const pedidoCerrado = p.pedidoTour ? !ahora.pedidoIds.includes(p.pedidoTour) : false
  const cuentaNueva = ahora.cuentasMes > base.cuentasMes
  if (clics.includes('boleta-pdf')) p.boleta = true

  const hechos = new Set(p.hechos)
  if (ahora.mesas > base.mesas) hechos.add('salon')
  if (ahora.productos > base.productos) hechos.add('carta')
  if (p.pedidoTour) hechos.add('comanda')
  if (p.pedidoTour && (pedidoAvanzado || pedidoCerrado || cuentaNueva)) hechos.add('cocina')
  if (cuentaNueva && p.boleta) hechos.add('cobro')
  if (cuentaNueva && ruta === '/demo/admin') hechos.add('panel')

  p.hechos = PASOS.filter((s) => hechos.has(s.id)).map((s) => s.id)
  return p
}

export function pasoActual(progreso: Progreso): Paso | null {
  return PASOS.find((s) => !progreso.hechos.includes(s.id)) ?? null
}

export function progresoFraccion(progreso: Progreso): number {
  return progreso.hechos.length / TOTAL_PASOS
}

export function logroDe(id: PasoId): Logro {
  return PASOS.find((s) => s.id === id)?.logro ?? { icono: 'check', titulo: id, detalle: '' }
}

/** Datos que el resumen final puede mostrar (deltas contra la foto inicial). */
export interface Resumen {
  zonas: number
  mesas: number
  productos: number
  comandas: number
  venta: number
}

export function resumen(progreso: Progreso, ahora: Instantanea): Resumen {
  const base = progreso.base
  return {
    zonas: base ? Math.max(0, ahora.zonas - base.zonas) : 0,
    mesas: base ? Math.max(0, ahora.mesas - base.mesas) : 0,
    productos: base ? Math.max(0, ahora.productos - base.productos) : 0,
    comandas: base ? Math.max(0, ahora.pedidoIds.length - base.pedidoIds.length) : 0,
    venta: base ? Math.max(0, ahora.ventaMes - base.ventaMes) : 0,
  }
}

// ------------------------------------------------------------------- anclas

export interface ContextoGuiado {
  mesaTour: string | null
  pedidoTour: string | null
  nuevaZona: boolean
  boleta: boolean
  /** Categorías de menú que ya existen (el demo arranca con 0). */
  categorias: number
}

/**
 * Selectores CSS candidatos para el resaltado, en orden de prioridad.
 * El primero que exista en el DOM (y no esté deshabilitado ni fuera de
 * pantalla) es el que se resalta. Así el tour camina solo por los sub‑pasos:
 * abrir la pestaña, abrir el modal, guardar, enviar.
 */
export function anclasDe(paso: PasoId, ctx: ContextoGuiado): string[] {
  const mesa = ctx.mesaTour ? [`[data-guia-mesa="${ctx.mesaTour}"]`] : []
  switch (paso) {
    case 'salon':
      return ctx.nuevaZona
        ? ['[data-guia="mesa-guardar"]', '[data-guia="agregar-mesa"]', '[data-guia="admin-tab-mesas"]']
        : ['[data-guia="zona-guardar"]', '[data-guia="nueva-zona"]', '[data-guia="admin-tab-mesas"]']
    case 'carta':
      return [
        '[data-guia="categoria-guardar"]',
        '[data-guia="producto-guardar"]',
        '[data-guia="agregar-producto"]',
        '[data-guia="admin-tab-menu"]',
      ]
    case 'comanda':
      return [
        '[data-guia="enviar-comanda"]',
        '[data-guia="producto"]',
        ...mesa,
        '[data-guia="mesa-libre"]',
      ]
    case 'cocina':
      return ctx.pedidoTour
        ? [`[data-guia-avanzar="${ctx.pedidoTour}"]`, '[data-guia="avanzar-pedido"]']
        : ['[data-guia="avanzar-pedido"]']
    case 'cobro':
      return [
        '[data-guia="boleta-pdf"]',
        '[data-guia="cobrar-mesa"]',
        '[data-guia="cerrar-cuenta"]',
        ...mesa,
        '[data-guia="mesa-ocupada"]',
      ]
    case 'panel':
      return ['[data-guia="panel-ventas"]', '[data-guia="admin-tab-dashboard"]']
  }
}

/**
 * Pista corta: la ÚNICA instrucción del paso, adaptada a lo que ya se hizo.
 * Nunca se repite con `porque`: el detalle queda plegado en el paso.
 */
export function pista(paso: PasoId, ctx: ContextoGuiado): string {
  switch (paso) {
    case 'salon':
      return ctx.nuevaZona
        ? 'Crea la mesa dentro de la zona.'
        : 'Crea una zona y una mesa dentro de ella.'
    case 'carta':
      return 'Abre Menú y agrega tu primer producto.'
    case 'comanda':
      return 'Toca una mesa libre y envía la comanda.'
    case 'cocina':
      return 'Avanza la comanda: pendiente → preparando → listo.'
    case 'cobro':
      return ctx.boleta
        ? 'Descarga la boleta en PDF.'
        : 'Abre la mesa ocupada y cobra la cuenta.'
    case 'panel':
      return 'Vuelve al panel y mira la venta.'
  }
}

// ------------------------------------------------------------------ layout

/** Rectángulo en coordenadas de viewport (mismo formato que getBoundingClientRect). */
export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface TamanoViewport {
  w: number
  h: number
}

export type Esquina = 'inferior-derecha' | 'inferior-izquierda' | 'superior-derecha' | 'superior-izquierda'

export const GUI_MARGEN = 16
export const GUI_ANCHO = 352
export const GUI_ALTO_COMPACTO = 76
/**
 * Alto estimado del panel expandido, usado para decidir si taparía el ancla.
 * El panel real se limita por CSS a esta misma altura (con scroll interno), así
 * que el cálculo nunca miente. Si no cabe en ninguna esquina libre, la guía pasa
 * a modo compacto. No se mide en vivo para no crear un bucle de realimentación
 * (la posición depende del propio tamaño).
 */
export const GUI_ALTO_EXPANDIDO = 560

function seSolapan(a: Rect, b: Rect): boolean {
  return !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y)
}

/** Rectángulo (compacto) que ocuparía el panel en una esquina del viewport. */
export function rectEnEsquina(
  esquina: Esquina,
  vp: TamanoViewport,
  ancho = GUI_ANCHO,
  alto = GUI_ALTO_COMPACTO,
): Rect {
  const w = Math.max(160, Math.min(ancho, vp.w - GUI_MARGEN * 2))
  const h = alto
  const x = esquina.endsWith('derecha') ? vp.w - GUI_MARGEN - w : GUI_MARGEN
  const y = esquina.startsWith('superior') ? GUI_MARGEN : vp.h - GUI_MARGEN - h
  return { x, y, w, h }
}

const ESQUINAS_PREFERIDAS: Esquina[] = [
  'inferior-derecha',
  'inferior-izquierda',
  'superior-derecha',
  'superior-izquierda',
]

/**
 * ¿Existe alguna esquina donde quepa un panel de `alto` sin tapar el ancla ni un
 * modal abierto? Se usa para decidir si la guía puede mostrarse expandida: si la
 * altura grande no entra en ninguna esquina, se repliega a la barra compacta.
 * Es pura (sin DOM) para poder verificarla en `npm run verificar`.
 */
export function hayEsquinaLibre(
  rectAncla: Rect | null,
  rectModal: Rect | null,
  vp: TamanoViewport,
  alto = GUI_ALTO_COMPACTO,
): boolean {
  return ESQUINAS_PREFERIDAS.some((esquina) => {
    const r = rectEnEsquina(esquina, vp, GUI_ANCHO, alto)
    if (rectAncla && seSolapan(r, rectAncla)) return false
    if (rectModal && seSolapan(r, rectModal)) return false
    return true
  })
}

/**
 * Elige la esquina donde el panel de la guía NO tape ni el ancla resaltada ni un
 * modal abierto. El `alto` debe ser el del panel que realmente se va a pintar
 * (compacto o expandido): reservar la altura equivocada hacía que el panel grande
 * se solapara con el modal aunque la barra pequeña no lo hiciera.
 * Si ninguna esquina libre existe, devuelve la de preferencia (inferior-derecha).
 */
export function elegirEsquina(
  rectAncla: Rect | null,
  rectModal: Rect | null,
  vp: TamanoViewport,
  alto = GUI_ALTO_COMPACTO,
): Esquina {
  for (const esquina of ESQUINAS_PREFERIDAS) {
    const r = rectEnEsquina(esquina, vp, GUI_ANCHO, alto)
    if (rectAncla && seSolapan(r, rectAncla)) continue
    if (rectModal && seSolapan(r, rectModal)) continue
    return esquina
  }
  return 'inferior-derecha'
}

export type LadoEtiqueta = 'abajo' | 'arriba' | 'derecha' | 'izquierda'

export interface ColocacionEtiqueta {
  left: number
  top: number
  lado: LadoEtiqueta
}

/**
 * Coloca la etiqueta del spotlight pegada al ancla, volteando arriba/abajo/
 * izquierda/derecha para no salirse del viewport ni pisar el panel de la guía.
 */
export function colocarEtiqueta(
  ancla: Rect,
  etiqueta: { w: number; h: number },
  vp: TamanoViewport,
  guia: Rect | null,
  margen = 10,
): ColocacionEtiqueta {
  const clampX = (v: number) => Math.max(8, Math.min(v, vp.w - etiqueta.w - 8))
  const clampY = (v: number) => Math.max(8, Math.min(v, vp.h - etiqueta.h - 8))
  const opciones: { lado: LadoEtiqueta; left: number; top: number }[] = [
    { lado: 'abajo', left: ancla.x + ancla.w / 2 - etiqueta.w / 2, top: ancla.y + ancla.h + margen },
    { lado: 'arriba', left: ancla.x + ancla.w / 2 - etiqueta.w / 2, top: ancla.y - etiqueta.h - margen },
    { lado: 'derecha', left: ancla.x + ancla.w + margen, top: ancla.y + ancla.h / 2 - etiqueta.h / 2 },
    { lado: 'izquierda', left: ancla.x - etiqueta.w - margen, top: ancla.y + ancla.h / 2 - etiqueta.h / 2 },
  ]
  const enViewport = (o: { left: number; top: number }) =>
    o.left >= 4 && o.top >= 4 && o.left + etiqueta.w <= vp.w - 4 && o.top + etiqueta.h <= vp.h - 4
  const noChocaGuia = (o: { left: number; top: number }) =>
    !guia || !seSolapan({ x: o.left, y: o.top, w: etiqueta.w, h: etiqueta.h }, guia)
  for (const o of opciones) {
    if (enViewport(o) && noChocaGuia(o)) return { left: clampX(o.left), top: clampY(o.top), lado: o.lado }
  }
  const primera = opciones[0]
  return { left: clampX(primera.left), top: clampY(primera.top), lado: primera.lado }
}

// ------------------------------------------------------------------ prefill

/** Datos sugeridos que el demo deja listos al abrir cada formulario. */
export interface PrefillGuia {
  zona: string
  mesa: string
  producto: { nombre: string; precio: string; categoria: string }
}

export const PREFILL_GUIA: PrefillGuia = {
  zona: 'Salón principal',
  mesa: 'Mesa 10',
  producto: { nombre: 'Lomo saltado', precio: '12.50', categoria: 'PROMOS' },
}

/**
 * Solo el demo con el recorrido activo recibe datos sugeridos: el modo local y
 * el real abren sus formularios vacíos, igual que siempre.
 */
export function prefillDe(isDemo: boolean, activo: boolean): PrefillGuia | null {
  return isDemo && activo ? PREFILL_GUIA : null
}

/** Formulario del panel que puede abrir «Hazlo por mí» con datos sugeridos. */
export type FormSolicitado = 'zona' | 'mesa' | 'categoria' | 'producto'

export interface SolicitudForm {
  tab: 'mesas' | 'menu'
  form: FormSolicitado
}

/**
 * Para los pasos que se resuelven rellenando un formulario, «Hazlo por mí» en
 * vez de crear el registro en silencio abre ese formulario con los datos por
 * defecto, para que el usuario vea cómo se rellena y solo confirme.
 *
 * Si el menú está vacío, la carta muestra primero el formulario de categoría.
 * Al confirmarla, el panel abre el producto sugerido para que el usuario lo
 * revise y lo guarde. El resto de pasos (comanda, cocina, cobro…) no tienen
 * formulario.
 */
export function formularioDePaso(paso: PasoId, ctx: ContextoGuiado): SolicitudForm | null {
  switch (paso) {
    case 'salon':
      return { tab: 'mesas', form: ctx.nuevaZona ? 'mesa' : 'zona' }
    case 'carta':
      return { tab: 'menu', form: ctx.categorias === 0 ? 'categoria' : 'producto' }
    default:
      return null
  }
}

// -------------------------------------------------------------- persistencia

const CLAVE = 'mesora.demo.guia.v2'

function almacen(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

export function leerProgreso(): Progreso | null {
  const s = almacen()
  if (!s) return null
  try {
    const crudo = s.getItem(CLAVE)
    if (!crudo) return null
    const p = JSON.parse(crudo) as Progreso
    if (p?.version !== 2 || !p.base || !Array.isArray(p.hechos)) return null
    return { ...PROGRESO_VACIO, ...p }
  } catch {
    return null
  }
}

export function guardarProgreso(p: Progreso): void {
  const s = almacen()
  if (!s) return
  try {
    s.setItem(CLAVE, JSON.stringify(p))
  } catch {
    /* almacenamiento lleno o bloqueado: el tour sigue igual en memoria */
  }
}

export function borrarProgreso(): void {
  const s = almacen()
  if (!s) return
  try {
    s.removeItem(CLAVE)
  } catch {
    /* sin efecto */
  }
}

/**
 * El demo vive en memoria: recargar la página devuelve los datos a su estado
 * inicial. Si el progreso guardado ya no se sostiene en los datos reales
 * (nada nuevo, mismos conteos), se descarta para no prometer un recorrido que
 * el usuario ya no puede terminar. Los logros ganados sí sobreviven.
 */
export function progresoVigente(p: Progreso | null, ahora: Instantanea): Progreso | null {
  if (!p?.base || !p.iniciado) return p
  const b = p.base
  const sinNadaNuevo =
    ahora.mesas <= b.mesas &&
    ahora.zonas <= b.zonas &&
    ahora.productos <= b.productos &&
    ahora.cuentasMes <= b.cuentasMes &&
    !ahora.pedidoIds.some((id) => !b.pedidoIds.includes(id))
  return sinNadaNuevo ? null : p
}
