// MODO LOCAL — Backend simulado en memoria para probar el flujo real de login
// y las restricciones por rol sin necesidad de Supabase.
//
// Se activa cuando la ruta NO es /demo y Supabase no está configurado.
// El dataset de aquí es INDEPENDIENTE del de mockData.ts (modo /demo): son dos
// fuentes de datos separadas para no mezclar las pruebas.
//
// Persistencia: en modo local, el dataset (localSeed) y las credenciales
// (localCredenciales) se guardan en localStorage tras cada operación de
// escritura (ver guardarDatosLocal) y se restauran al cargar la app
// (cargarDatosLocal). El modo /demo NO persiste nada: siempre arranca desde
// mockData.ts con datos frescos de ejemplo.
//
// Credenciales de prueba (ver PASSWORD_DE_PRUEBA):
//   * Super Admin: superadmin@mesora.pe / Mesora2026!
//   * Admin del restaurante vacío: nuevo@mirestaurante.pe / Mesora2026!
//   * Cajero del restaurante demo: cajero@mesora.pe / Mesora2026!

import type {
  AuditLog,
  CategoriaProducto,
  ConfiguracionGlobal,
  Cuenta,
  CuentaPedido,
  Mesa,
  Pago,
  Pedido,
  PedidoItem,
  Plan,
  Producto,
  Restaurante,
  SoporteTicket,
  SuscripcionHistorial,
  TurnoCaja,
  Usuario,
  Zona,
} from '../types/database'
import { CONFIGURACION_POR_DEFECTO } from '../domain/restaurant/configuracion'
import {
  mockCategorias,
  mockCuentaPedidos,
  mockCuentas,
  mockMesas,
  mockPedidoItems,
  mockPedidos,
  mockPlanes,
  mockProductos,
  mockRestaurante,
  mockRestauranteExtra,
  mockZonas,
} from './mockData'

/** Contraseña única de las cuentas de prueba del backend local. */
export const PASSWORD_DE_PRUEBA = 'Mesora2026!'

const MIN = 60_000
const AHORA = Date.now()
const enDias = (dias: number) => new Date(AHORA + dias * 24 * 60 * MIN).toISOString()
const haceDias = (dias: number) => new Date(AHORA - dias * 24 * 60 * MIN).toISOString()

// ------------------------------------------------------ Restaurantes del local
/**
 * Restaurante 1 (el que administra Mesora, para el Super Admin):
 * se reutilizan los restaurantes del mock para darle contenido que listar.
 *   * "Restaurante Demo"  → activo, con todo su dataset (zonas, mesas, menú…).
 *   * "La Esquina Grill"  → suscripción vencida.
 */
export const restauranteDemostracion = mockRestaurante
export const restauranteVencido = mockRestauranteExtra

/**
 * Restaurante 2 — 100% vacío, para probar el estado de un restaurante nuevo:
 * sin zonas, mesas, categorías, productos, pedidos ni cuentas.
 */
export const restauranteNuevoVacio: Restaurante = {
  id: 'r-nuevo',
  nombre: 'Mi Restaurante Nuevo',
  ruc: null,
  telefono: null,
  direccion: null,
  email_contacto: 'nuevo@mirestaurante.pe',
  dominio: 'mirestaurante.pe',
  suscripcion_activa: true,
  fecha_vencimiento: enDias(30),
  plan_id: 'plan-mesora-pro',
  fecha_inicio: haceDias(1),
  created_at: haceDias(1),
}

export const localRestaurantes: Restaurante[] = [
  restauranteDemostracion,
  restauranteVencido,
  restauranteNuevoVacio,
]

// --------------------------------------------------------------------- Usuarios
export const localUsuarioSuperAdmin: Usuario = {
  id: 'u-local-super',
  restaurante_id: null,
  rol: 'super_admin',
  nombre: 'Ana Plataforma',
  email: 'superadmin@mesora.pe',
  activo: true,
  created_at: haceDias(400),
}

export const localUsuarioAdminNuevo: Usuario = {
  id: 'u-local-admin-nuevo',
  restaurante_id: 'r-nuevo',
  rol: 'admin_restaurante',
  nombre: 'Carlos Nuevo',
  email: 'nuevo@mirestaurante.pe',
  activo: true,
  created_at: haceDias(1),
}

export const localUsuarioCajero: Usuario = {
  id: 'u-local-cajero',
  restaurante_id: 'r-demo',
  rol: 'cajero',
  nombre: 'Rosa Caja',
  email: 'cajero@mesora.pe',
  activo: true,
  created_at: haceDias(5),
}

export const localUsuarios: Usuario[] = [
  localUsuarioSuperAdmin,
  localUsuarioAdminNuevo,
  localUsuarioCajero,
]

const credencialesSemilla: Record<string, string> = {
  'superadmin@mesora.pe': PASSWORD_DE_PRUEBA,
  'nuevo@mirestaurante.pe': PASSWORD_DE_PRUEBA,
  'cajero@mesora.pe': PASSWORD_DE_PRUEBA,
}

/**
 * Credenciales locales: email → contraseña.
 * Este mapa es MUTABLE a propósito: cuando el Admin crea personal desde el
 * panel (modo local), `crearPersonal` registra aquí la clave de prueba para
 * que el signIn local lo reconozca. Los usuarios creados desde la UI se
 * autentican igual que las cuentas semilla de este archivo.
 */
export const localCredenciales: Record<string, string> = { ...credencialesSemilla }

// ------------------------------------------------------------ Dataset completo
/** Forma exacta del dataset del backend local simulado. */
export interface LocalSeedData {
  zonas: Zona[]
  mesas: Mesa[]
  categorias: CategoriaProducto[]
  productos: Producto[]
  usuarios: Usuario[]
  pedidos: Pedido[]
  items: PedidoItem[]
  cuentas: Cuenta[]
  cuentaPedidos: CuentaPedido[]
  /** Detalle de pago por cuenta (pago dividido). Siempre ≥ 1 fila por cuenta. */
  pagos: Pago[]
  restaurantes: Restaurante[]
  cajaTurnos: TurnoCaja[]
  /** Catálogo de planes (mismo contenido que la siembra de la BD). */
  planes: Plan[]
  /** Historial append-only de acciones de suscripción por restaurante. */
  historialSuscripciones: SuscripcionHistorial[]
  /** Registro append-only de acciones importantes de la plataforma. */
  auditLogs: AuditLog[]
  /** Tickets de soporte de la plataforma (solo super admin). */
  tickets: SoporteTicket[]
  /** Configuración general de la plataforma (fila única). */
  configuracion: ConfiguracionGlobal
}

/**
 * Sincroniza el alcance de la concha de "bebida" al que usa cocina y barra.
 *
 * `es_bebida` es un flag explícito del producto (lo define el admin), pero los
 * datos guardados antes de que este campo existiera no lo tienen. Para esos
 * casos heredados se infiere una sola vez desde el nombre de la categoría
 * ("bebidas"); a partir de ahí manda siempre el valor explícito.
 */
function normalizarProductosBebida(ds: LocalSeedData): void {
  const nombreBebidas = new Map(
    ds.categorias
      .filter((c) => c.nombre.trim().toLowerCase() === 'bebidas')
      .map((c) => [c.id, true]),
  )
  for (const p of ds.productos) {
    if (typeof p.es_bebida === 'boolean') continue
    p.es_bebida = p.categoria_id != null && nombreBebidas.has(p.categoria_id)
  }
}

/**
 * Crea una semilla nueva e independiente del modo /demo: cada array es una
 * copia fresca (objetos clonados), así los CRUD y las mutaciones del modo
 * local (p. ej. cambiar el estado de una mesa) jamás alteran mockData.ts.
 */
const clonar = <T,>(lista: T[]): T[] => lista.map((x) => ({ ...(x as object) })) as T[]

export function crearLocalSeed(): LocalSeedData {
  const ds: LocalSeedData = {
    zonas: clonar(mockZonas),
    mesas: clonar(mockMesas),
    categorias: clonar(mockCategorias),
    productos: clonar(mockProductos),
    usuarios: clonar(localUsuarios),
    pedidos: clonar(mockPedidos),
    items: clonar(mockPedidoItems),
    cuentas: clonar(mockCuentas),
    cuentaPedidos: clonar(mockCuentaPedidos),
    // Las cuentas semilla solo tienen un método, así que su detalle es una fila
    // por cuenta con el importe completo.
    pagos: clonar(mockCuentas).map((c, i) => ({
      id: `pago-seed-${i + 1}`,
      cuenta_id: c.id,
      restaurante_id: c.restaurante_id,
      metodo_pago: c.metodo_pago,
      monto: c.total,
      referencia: null,
      created_at: c.pagado_at ?? c.created_at,
    })),
    restaurantes: clonar(localRestaurantes),
    // Sin turno abierto: el Admin tiene que abrir la caja al empezar el día.
    cajaTurnos: [],
    planes: clonar(mockPlanes),
    historialSuscripciones: [],
    auditLogs: [],
    tickets: [],
    configuracion: {
      ...CONFIGURACION_POR_DEFECTO,
      updated_at: new Date().toISOString(),
      updated_by: null,
    },
  }
  normalizarProductosBebida(ds)
  return ds
}

/** Estado vivo del backend local. `localDb` (src/lib/api.ts) referencia estos arrays. */
export const localSeed: LocalSeedData = crearLocalSeed()

// --------------------------------------------------------------- Persistencia
const KEY_DATOS_LOCAL = 'mesora.local.datos'
const KEY_CREDENCIALES_LOCAL = 'mesora.local.credenciales'
/** Misma clave que usa src/store/auth.ts para la sesión local (se limpia al resetear). */
const KEY_SESION_LOCAL = 'mesora.local.sesion'

function rellenarDestino(dest: LocalSeedData, src: Partial<LocalSeedData>): void {
  const objetivo = dest as unknown as Record<string, unknown>
  const fuente = src as Record<string, unknown>
  for (const clave of Object.keys(dest) as (keyof LocalSeedData)[]) {
    const valor = fuente[clave]
    if (valor === undefined) continue
    const actual = objetivo[clave]
    if (Array.isArray(actual) && Array.isArray(valor)) {
      ;(actual as unknown[]).splice(0, actual.length, ...(valor as unknown[]))
    } else if (actual && typeof actual === 'object' && valor && typeof valor === 'object') {
      // Objetos sueltos (p. ej. `configuracion`) se vuelcan campo a campo.
      Object.assign(actual as object, valor)
    }
  }
}

function reemplazarCredenciales(nuevas: Record<string, string>): void {
  for (const email of Object.keys(localCredenciales)) delete localCredenciales[email]
  Object.assign(localCredenciales, nuevas)
}

/**
 * Guarda el dataset completo del modo local + las credenciales en localStorage.
 * Se llama tras cada operación de escritura del backend local (ver api.ts).
 * Nunca se guarda nada en modo /demo (ese modo no llama esta función).
 */
export function guardarDatosLocal(): void {
  try {
    localStorage.setItem(KEY_DATOS_LOCAL, JSON.stringify(localSeed))
    localStorage.setItem(KEY_CREDENCIALES_LOCAL, JSON.stringify(localCredenciales))
  } catch {
    // Almacenamiento no disponible: se sigue trabajando solo en memoria.
  }
}

let hidratado = false

/**
 * Restaura el dataset y las credenciales guardados en localStorage (una sola
 * vez por sesión de la pestaña). Si no hay nada guardado, se queda con la
 * semilla de localSeed. Se invoca desde auth.refresh() solo en modo local
 * (nunca en /demo). `fuerza` se usa por tests / casos concretos.
 */
export function cargarDatosLocal(fuerza = false): void {
  if (hidratado && !fuerza) return
  hidratado = true
  try {
    const rawDatos = localStorage.getItem(KEY_DATOS_LOCAL)
    if (rawDatos) {
      const guardados = JSON.parse(rawDatos) as Partial<LocalSeedData>
      rellenarDestino(localSeed, guardados)
    }
    const rawCred = localStorage.getItem(KEY_CREDENCIALES_LOCAL)
    const credencialesGuardadas = rawCred ? (JSON.parse(rawCred) as Record<string, string>) : {}
    // Las cuentas semilla siempre existen aunque alguien las borrara del storage.
    reemplazarCredenciales({ ...credencialesSemilla, ...credencialesGuardadas })
    normalizarProductosBebida(localSeed)
  } catch {
    // JSON corrupto / storage no disponible: se conserva el estado en memoria.
  }
}

/**
 * Borra lo persistido y devuelve el backend local a su estado inicial
 * (localSeed de fábrica + cuentas semilla). También limpia la sesión local.
 * Útil para reiniciar una demo entre pruebas.
 */
export function restablecerDatosLocal(): void {
  const semilla = crearLocalSeed()
  rellenarDestino(localSeed, semilla)
  reemplazarCredenciales({ ...credencialesSemilla })
  hidratado = true
  try {
    localStorage.removeItem(KEY_DATOS_LOCAL)
    localStorage.removeItem(KEY_CREDENCIALES_LOCAL)
    localStorage.removeItem(KEY_SESION_LOCAL)
  } catch {
    // Sin storage: el reset en memoria es suficiente.
  }
}