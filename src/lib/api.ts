// CAPA DE DATOS — Tres modos.
// Todas las vistas piden datos a través de `getApi()`.
//   * apiMode.demo = true                          → mockApi (modo /demo, datos falsos)
//   * VITE_MESORA_MODO_LOCAL=true (y no /demo)     → localApi (QA opt-in)
//   * demás rutas                             → realApi (Supabase, falla cerrada)
//
// El modo "local" permite probar el flujo real de login y las restricciones por
// rol sin Supabase: las credenciales y el dataset viven en src/lib/localSeed.ts.
//
// Para remover el demo: borra src/demo/, src/lib/mockData.ts, la rama `demo`
// de getApi() y este comentario. Ver README → "Quitar el modo demo".

import { modoLocalHabilitado, supabase, supabaseConfigurado } from './supabase'
import { computeMetricas, type MetricasAdmin } from '../domain/reporting/metricas'
import { arqueoTurno, errorAlAbrirTurno, errorAlCerrarTurno, redondear } from '../domain/cashier/caja'
import { completarPartes, resumirPago, type PagoParte } from '../domain/cashier/pagos'
import { MENSAJE_PIN_INCORRECTO, errorAlAnularCobro } from '../domain/security/autorizacion'
import { mensajeOperacion } from '../domain/security/mensajeOperacion'
import { normalizarContenidoUtf8 } from '../domain/platform/normalizarUtf8'
import type { RolPersonal } from '../domain/security/personal'
export type { RolPersonal } from '../domain/security/personal'
import { esMetodoPagoValido } from '../types/database'
import { calcularEstadisticasGlobales, type EstadisticasGlobales } from '../domain/reporting/estadisticas'
import type {
  AuditLog,
  CategoriaProducto,
  ConfiguracionGlobal,
  BandejaComercial,
  ConsultaComercial,
  Cuenta,
  EstacionComanda,
  Mesa,
  MetodoPago,
  Pago,
  Pedido,
  PedidoItem,
  Plan,
  Producto,
  Restaurante,
  Rol,
  SoporteTicket,
  SoporteMensaje,
  SuscripcionHistorial,
  TicketEstado,
  TicketPrioridad,
  TicketTipo,
  TurnoCaja,
  Usuario,
  Zona,
} from '../types/database'
import { estacionDeProducto } from '../domain/restaurant/impresionComandas'
import {
  calcularAlertas,
  type AlertaAdministrativa,
} from '../domain/platform/notificaciones'
import {
  CONFIGURACION_POR_DEFECTO,
  normalizarConfiguracionGlobal,
  validarConfiguracionGlobal,
  type DatosConfiguracionGlobal,
} from '../domain/restaurant/configuracion'
import { PRIORIDADES_TICKET, ESTADOS_TICKET, TIPOS_TICKET } from '../domain/platform/soporte'
import {
  mockPlanes,
  mockRestaurante,
  mockRestauranteExtra,
  mockUsuarios,
} from './mockData'
import { guardarDatosLocal, hashCredencialLocal, localCredenciales, localSeed, PASSWORD_DE_PRUEBA } from './localSeed'
import type { LocalSeedData } from './localSeed'
import { formatearNumeroBoleta } from '../domain/cashier/boleta'
import { prepararDatosLocal, type CambiosDatosLocal } from '../domain/restaurant/datosLocal'
import { buscarMesaConNombre, mensajeNombreMesaDuplicado } from '../domain/restaurant/mesas'
import { registrarDiagnostico } from './diagnostico'
import type { RangoReporteVentas, ReporteVentas } from '../domain/reporting/ventas'
import {
  registrarFalloDeSincronizacion,
  registrarServidorAlcanzable,
  registrarSincronizacionExitosa,
} from './estadoConexion'

// -------------------------------------------------------------- Tipos comunes
export interface Res<T> {
  data: T | null
  error: string | null
}

export type FiltrosCobros = {
  desde: string
  hasta: string
  estado: 'todas' | 'pagada' | 'anulada'
  metodo: MetodoPago | 'todos'
  busqueda: string
  offset: number
  limite: number
}

export type PaginaCobros = { items: Cuenta[]; total: number }

export type FiltrosAuditoriaRestaurante = {
  desde: string | null
  hasta: string | null
  busqueda: string
  categoria: 'todas' | 'usuarios' | 'mesas' | 'caja' | 'cuentas' | 'pedidos' | 'configuracion'
  offset: number
  limite: number
}

export type PaginaAuditoria = { items: AuditLog[]; total: number }

/** Detecta errores de transporte cuya operacion pudo confirmarse en el servidor. */
export function esFalloDeRed(error: string | null | undefined): boolean {
  return Boolean(error && /network|fetch|timeout|timed out|connection|conexi[oó]n|offline|aborted|request may have completed/i.test(error))
}

const apiConErroresNormalizados = new WeakMap<DataApi, DataApi>()

function envolverErroresApi(api: DataApi): DataApi {
  const existente = apiConErroresNormalizados.get(api)
  if (existente) return existente
  const seguro = new Proxy(api, {
    get(objetivo, propiedad, receptor) {
      const miembro = Reflect.get(objetivo, propiedad, receptor)
      if (!Object.prototype.hasOwnProperty.call(objetivo, propiedad) || typeof miembro !== 'function') return miembro
      return (...args: unknown[]) =>
        Promise.resolve()
          .then(() => miembro.apply(objetivo, args))
          .then((resultado) => {
            if (resultado?.error) {
              if (esFalloDeRed(String(resultado.error))) registrarFalloDeSincronizacion()
              else registrarServidorAlcanzable()
            } else {
              registrarSincronizacionExitosa()
            }
            if (resultado?.error) registrarDiagnostico('api', String(propiedad))
            return resultado
          })
          .catch((causa: unknown) => {
            registrarDiagnostico('api', String(propiedad))
            const mensaje = causa instanceof Error ? causa.message : ''
            if (esFalloDeRed(mensaje)) registrarFalloDeSincronizacion()
            else registrarServidorAlcanzable()
            return {
              data: null,
              error: esFalloDeRed(mensaje)
                ? 'La conexión se interrumpió. Actualiza los datos antes de repetir la operación; la solicitud pudo haberse completado.'
                : mensaje || 'No se pudo completar la operación. Inténtalo de nuevo.',
            }
          })
    },
  })
  apiConErroresNormalizados.set(api, seguro)
  return seguro
}

export type ItemComanda = {
  producto_id: string
  nombre_producto: string
  cantidad: number
  precio_unitario: number
  nota?: string
}

export type ItemResumen = Pick<
  PedidoItem,
  'id' | 'pedido_id' | 'producto_id' | 'nombre_producto' | 'cantidad' | 'precio_unitario' | 'nota' | 'anulado' | 'estacion'
> & { es_bebida?: boolean }

export type ResultadoRegistroImpresion =
  | { estado: 'requiere_motivo' }
  | { estado: 'registrada'; accion: 'comanda_imprimir' | 'comanda_reimprimir' }

/**
 * Campos editables de un ítem ya enviado a cocina. Se mandan SIEMPRE los dos
 * (no es un patch parcial): así el backend nunca tiene que adivinar si un `null`
 * significa "no lo cambies" o "quítale la nota".
 */
export type CambiosItem = { cantidad: number; nota: string | null }

/**
 * Mesa con dinero pendiente de cobro. No es lo mismo que una mesa `ocupada`:
 * una mesa puede seguir ocupada con todos sus pedidos ya cobrados o anulados,
 * y en ese caso NO debe aparecer acá. `total` es la suma de los ítems vigentes
 * (sin anulados) de los pedidos que todavía no entraron en ninguna cuenta pagada.
 */
export type MesaPorCobrar = {
  mesa_id: string
  mesa_nombre: string
  total: number
  pedidos: number
}

/** Datos originales guardados para reimprimir un recibo interno ya cobrado. */
export type BoletaReimpresion = {
  cuenta: Cuenta
  restauranteNombre: string
  direccion: string | null
  ruc: string | null
  telefono: string | null
  mesaNombre: string
  meseroNombre: string | null
  items: ItemResumen[]
}

/** Ítems que siguen vigentes: los anulados no suman ni se muestran. */
export function itemsVigentes(items: readonly ItemResumen[]): ItemResumen[] {
  return items.filter((it) => it.anulado !== true)
}

/** Total a cobrar de un conjunto de ítems, ignorando los anulados. */
export function totalItems(items: readonly ItemResumen[]): number {
  return itemsVigentes(items).reduce((acc, it) => acc + it.cantidad * it.precio_unitario, 0)
}

export type PedidoResumen = Pick<Pedido, 'id' | 'mesa_id' | 'estado' | 'created_at'>

export type UsuarioResumen = Pick<Usuario, 'id' | 'nombre' | 'email' | 'activo' | 'rol'>
/** Datos mínimos de compañeros que se muestran en cocina y en el traspaso de mesa. */
export type MeseroResumen = Pick<Usuario, 'id' | 'nombre' | 'activo' | 'rol'>

function traducirErrorMesa(error: { code?: string; message: string }, nombre: string): string {
  if (error.code === '23505' && error.message.includes('mesas_un_nombre_por_restaurante')) {
    return mensajeNombreMesaDuplicado(nombre)
  }
  return error.message
}

// --------------------------------------------------- Entrada de datos (CRUD)
/** Datos para crear una zona. */
export type DatosZona = { nombre: string }

/** Datos para crear una mesa. */
export type DatosMesa = { nombre: string; zona_id: string }

/** Datos para crear una categoría de productos. */
export type DatosCategoria = { nombre: string }

/** Datos para crear un producto. */
export type DatosProducto = {
  nombre: string
  descripcion?: string | null
  categoria_id: string | null
  precio: number
  precio_promocion?: number | null
  es_promocion?: boolean | null
  disponible: boolean
  /** El producto se prepara en la barra, no en la cocina (gaseosas, jugos, cafés…). */
  es_bebida?: boolean | null
  estacion?: EstacionComanda
  imagen_url?: string | null
}

/** Roles que un administrador puede tocar (crear, editar, borrar). */
export const ROLES_PERSONAL: readonly RolPersonal[] = ['mesero', 'cocina', 'admin_restaurante', 'cajero']

function esRolPersonal(rol: string): rol is RolPersonal {
  return (ROLES_PERSONAL as readonly string[]).includes(rol)
}

/** Datos para crear un miembro del personal (mesero o cocina). */
export type DatosPersonal = { nombre: string; email?: string | null; password?: string; rol: RolPersonal }

/**
 * Alta de un restaurante con su administrador de cuenta. Solo el super_admin la
 * dispara y viaja a la Edge Function `crear-restaurante`: el rol del admin lo
 * asigna el servidor (`admin_restaurante`), nunca viene del formulario.
 */
export type DatosRestauranteConAdmin = {
  nombre: string
  ruc?: string | null
  direccion?: string | null
  telefono?: string | null
  email_contacto?: string | null
  suscripcion_activa: boolean
  fecha_vencimiento?: string | null
  admin: { nombre: string; email: string; password: string }
}

/**
 * Datos administrativos que el super admin edita desde su panel. Viajan por la
 * RPC `admin_actualizar_restaurante`: el JWT del super admin no tiene UPDATE
 * directo sobre `restaurantes` (ni siquiera en las columnas de la boleta) — la
 * policy de update es solo para `admin_restaurante` y el grant columnario de
 * `authenticated` no incluye la suscripción.
 */
export type DatosEdicionRestaurante = {
  nombre: string
  ruc?: string | null
  direccion?: string | null
  telefono?: string | null
  email_contacto?: string | null
}

/** Administrador principal de un restaurante (para el panel del super_admin). */
export type AdminRestaurante = UsuarioResumen & { restaurante_id: string | null }

/** Usuario de cualquier restaurante con su fecha de alta (panel super_admin). */
export type UsuarioPlataforma = UsuarioResumen & {
  restaurante_id: string | null
  created_at: string
}

/**
 * Alta de un usuario de la plataforma desde el panel del super admin. Viaja a
 * la Edge Function `crear-usuario`: el navegador nunca tiene la service_role
 * para crear cuentas de Auth, y el rol se valida contra la lista blanca del
 * servidor (nunca `super_admin`).
 */
export type DatosUsuarioPlataforma = {
  nombre: string
  email: string
  password: string
  rol: RolPersonal
  restauranteId: string
}

/** Alta de un ticket de soporte desde el panel del super admin. */
export type DatosTicket = {
  restauranteId?: string | null
  usuarioId?: string | null
  asunto: string
  descripcion: string
  tipo?: TicketTipo
  prioridad: TicketPrioridad
  responsable?: string | null
}

/** Cambios parciales permitidos al editar un ticket (estado, prioridad, responsable). */
export type CambiosTicket = Partial<{
  estado: TicketEstado
  prioridad: TicketPrioridad
  responsable: string | null
}>

export type { DatosConfiguracionGlobal } from '../domain/restaurant/configuracion'

/** Mapa usuario → último acceso (auth.users.last_sign_in_at); null = nunca ingresó. */
export type UltimosAccesos = Record<string, string | null>

/** Una parte del pago de una cuenta (ver `cerrarCuentaDividida`). */
export type PagoEntrada = {
  metodo_pago: MetodoPago
  /** 0 = "exactamente lo que se le pide". > 0 = billete entregado (hay vuelto). */
  monto: number
  referencia?: string | null
}

/** Cambios parciales permitidos al editar una mesa. */
export type CambiosMesa = Partial<Pick<DatosMesa, 'nombre' | 'zona_id'>>

/** Cambios parciales permitidos al editar un producto. */
export type CambiosProducto = Partial<DatosProducto>

/** Cambios parciales permitidos al editar un miembro del personal. */
export type CambiosPersonal = Partial<Pick<DatosPersonal, 'nombre' | 'email' | 'rol'>>

/**
 * Datos del local que el Admin edita y que salen impresos en la boleta. No
 * incluye `suscripcion_activa` ni `fecha_vencimiento`: eso es de la plataforma
 * (super admin), no del restaurante.
 */
export type CambiosRestaurante = CambiosDatosLocal

/** Pedido + sus ítems. Para cocina. */
export type PedidoConItems = Pedido & {
  /** Solo lo vigente: lo que hay que preparar. */
  items: ItemResumen[]
  /** Ítems anulados por el mesero: cocina debe enterarse, no verlos desaparecer. */
  anulados: ItemResumen[]
}

const SIGUIENTE_ESTADO: Record<Pedido['estado'], Pedido['estado']> = {
  pendiente: 'en_preparacion',
  en_preparacion: 'listo',
  listo: 'entregado',
  entregado: 'entregado',
  anulado: 'anulado',
}

export function siguienteEstado(e: Pedido['estado']): Pedido['estado'] {
  return SIGUIENTE_ESTADO[e] ?? e
}

// ------------------------------------------------------------------ DataApi
export interface DataApi {
  getZonas(rid: string): Promise<Res<Zona[]>>
  getMesas(rid: string): Promise<Res<Mesa[]>>
  /**
   * Mesas que todavía tienen dinero sin cobrar (pedidos abiertos con ítems
   * vigentes que no están en una cuenta pagada). Se usa para avisar en Caja
   * antes de cerrar el turno; NO bloquea el cierre: las cuentas impagas no son
   * efectivo y se cobrarán en el turno en que efectivamente se paguen.
   */
  getMesasPorCobrar(rid: string): Promise<Res<MesaPorCobrar[]>>
  getCategorias(rid: string): Promise<Res<CategoriaProducto[]>>
  /** Solo productos disponibles. */
  getProductos(rid: string, opciones?: { incluirAgotados?: boolean }): Promise<Res<Producto[]>>
  getMeseros(rid: string): Promise<Res<MeseroResumen[]>>
  /** Reasigna una mesa ocupada con autorización PIN (si está configurado) y motivo auditable. */
  asignarMesaMesero(rid: string, mesaId: string, meseroId: string, pin: string | null, motivo: string): Promise<Res<null>>
  /** Mueve comandas no cobradas con autorización PIN (si está configurado) y motivo auditable. */
  moverConsumoMesa(rid: string, origenId: string, destinoId: string, pin: string | null, motivo: string): Promise<Res<null>>
  /** Meseros + cocina del restaurante (personal), para el panel de admin. */
  getPersonal(rid: string): Promise<Res<UsuarioResumen[]>>
  getPedidosDeMesa(rid: string, mesaId: string): Promise<Res<PedidoResumen[]>>
  /**
   * Pedidos de la mesa que AÚN NO fueron cobrados: excluye los que ya están
   * asociados a una cuenta pagada (para no permitir cobrarlos dos veces).
   * Incluye los que cocina ya marcó como `entregado` (= servidos), porque
   * entregado no significa pagado.
   */
  getPedidoItems(ids: string[]): Promise<Res<ItemResumen[]>>
  /** Pedidos activos (no 'entregado') para la pantalla de cocina. */
  getPedidosActivos(rid: string): Promise<Res<PedidoConItems[]>>
  /** Registra impresión/reimpresión de una estación; la solicitud es idempotente. */
  registrarImpresionComanda(
    rid: string,
    pedidoId: string,
    estacion: EstacionComanda,
    solicitudId: string,
    motivo?: string | null,
  ): Promise<Res<ResultadoRegistroImpresion>>
  crearPedido(rid: string, mesaId: string, items: ItemComanda[]): Promise<Res<string>>
  /**
   * Corrige cantidad y nota de un ítem de una comanda ABIERTA (no cobrada).
   * El precio unitario queda congelado: solo cambia lo que el mesero puede
   * cambiar en el salón. Rechaza ítems de otra comanda, de otro restaurante,
   * ya cobrados o ya anulados.
   */
  editarItem(rid: string, pedidoId: string, itemId: string, cambios: CambiosItem): Promise<Res<null>>
  /**
   * Anula un ítem de una comanda abierta. No lo borra: queda el rastro de lo
   * que se pidió y lo que se canceló. Si era el último ítem vigente, la comanda
   * queda `anulado` y la mesa se libera si no tiene más comandas por cobrar.
   * Es idempotente: anular dos veces el mismo ítem no falla.
   *
   * `pin`: si el restaurante tiene PIN de autorización, hace falta. Lo valida
   * el servidor (`validar_pin_autorizacion`); sin PIN configurado se ignora.
   */
  anularItem(rid: string, pedidoId: string, itemId: string, pin?: string | null): Promise<Res<null>>
  /**
   * Anula un cobro ya emitido (admin o cajero; con PIN si el restaurante lo
   * configuró). La cuenta no se borra: queda `anulada` con motivo, autor y
   * monto devuelto, sale de las ventas y su efectivo sale de la gaveta.
   */
  anularCuenta(
    rid: string,
    cuentaId: string,
    motivo: string,
    pin?: string | null,
  ): Promise<Res<Pick<Cuenta, 'id' | 'estado' | 'total' | 'vuelto' | 'monto_reembolsado' | 'motivo_anulacion'>>>
  /** ¿El restaurante tiene PIN de autorización? Solo para decidir si hay que pedirlo. */
  tienePinAutorizacion(rid: string): Promise<Res<boolean>>
  /** Solo admin: define o rota el PIN (4 a 6 dígitos). El valor nunca se devuelve. */
  configurarPinAutorizacion(rid: string, pin: string): Promise<Res<null>>
  /** Solo admin: deja el restaurante sin PIN. */
  quitarPinAutorizacion(rid: string): Promise<Res<null>>
  avanzarPedido(rid: string, pedidoId: string): Promise<Res<null>>
  /**
   * Cierra la cuenta de los pedidos indicados: inserta la cuenta pagada, guarda
   * el subtotal de cada pedido, marca esos pedidos como `entregado` y libera la
   * mesa. Rechaza métodos de pago inválidos y pedidos ya cobrados.
   *
   * Devuelve la cuenta YA GUARDADA (no el total recalculado en el navegador):
   * la boleta tiene que salir del mismo dato que quedó en la caja, o el papel
   * discrepa de la base.
   */
  cerrarCuenta(rid: string, mesaId: string, pedidos: string[], metodo: MetodoPago): Promise<Res<Cuenta>>
  /**
   * Pago dividido + propina + vuelto. `monto: 0` en una parte significa "el
   * cliente entregó exactamente lo que se le pide" (el backend completa el
   * importe con el total real); `monto > 0` es un billete recibido, y el
   * excedente queda como vuelto.
   */
  cerrarCuentaDividida(
    rid: string,
    mesaId: string,
    pedidos: string[],
    pagos: readonly PagoEntrada[],
    propina?: number,
  ): Promise<Res<Cuenta>>
  liberarMesa(rid: string, mesaId: string): Promise<Res<null>>
  getMetricasAdmin(rid: string): Promise<Res<MetricasAdmin>>
  getReporteVentas(rid: string, rango: RangoReporteVentas): Promise<Res<ReporteVentas>>
  /**
   * Cuentas pagadas del restaurante (para el reporte CSV). Se expone aparte y
   * no se mete en `getMetricasAdmin` porque el dashboard no necesita el detalle
   * y esta lista crece con la historia del local.
   */
  getCuentasPagadas(rid: string): Promise<Res<Pick<Cuenta, 'id' | 'total' | 'metodo_pago' | 'estado' | 'pagado_at' | 'created_at' | 'propina' | 'vuelto'>[]>>
  /**
   * Boletas del día, pagadas y anuladas (de más nueva a más antigua). Es lo que
   * ve el Admin para anular un cobro: sin esto no hay forma de elegir una
   * boleta y devolverla. `getCuentasPagadas` sigue siendo solo de pagadas
   * porque alimenta el reporte de ventas, que no debe contar anuladas.
   */
  getCuentasDelDia(rid: string): Promise<Res<Cuenta[]>>
  /** Búsqueda y paginación servidor/tenant-scoped de boletas. */
  getCuentasFiltradas(rid: string, filtros: FiltrosCobros): Promise<Res<PaginaCobros>>
  /** Valida el rol/PIN en el servidor y devuelve el recibo original para reimpresión. */
  getBoletaReimpresion(rid: string, cuentaId: string, pin?: string | null): Promise<Res<BoletaReimpresion>>
  /**
   * Detalle de pagos de las cuentas del restaurante (pago dividido). Lo usa el
   * arqueo de caja: conMethods divididas, solo el efectivo suma en la gaveta.
   */
  getPagosDeCuentas(rid: string): Promise<Res<Pick<Pago, 'cuenta_id' | 'metodo_pago' | 'monto'>[]>>
  getRestaurantes(): Promise<Res<Restaurante[]>>
  /** Administradores de cuenta de todos los restaurantes (panel super_admin). */
  getAdministradores(): Promise<Res<AdminRestaurante[]>>
  /** Todos los usuarios de la plataforma, con fecha de alta (panel super_admin). */
  getUsuariosPlataforma(): Promise<Res<UsuarioPlataforma[]>>
  /**
   * Alta completa de un cliente de la plataforma: restaurante + cuenta Auth del
   * administrador + perfil enlazado. En Supabase la hace la Edge Function
   * `crear-restaurante` con la service_role (nunca desde este bundle).
   */
  crearRestauranteConAdmin(datos: DatosRestauranteConAdmin): Promise<Res<Restaurante>>
  /** Edición del super admin sobre un restaurante (RPC, el cliente no tiene UPDATE directo). */
  adminActualizarRestaurante(rid: string, datos: DatosEdicionRestaurante): Promise<Res<Restaurante>>
  /** Suscripción del super admin: activar/desactivar + fecha de vencimiento (RPC). */
  adminCambiarSuscripcion(rid: string, activa: boolean, fechaVencimiento: string | null): Promise<Res<Restaurante>>

  // ----------------------------------------------------------- Suscripciones
  /** Catálogo de planes (solo lectura; lo administra la BD, no la app). */
  getPlanes(): Promise<Res<Plan[]>>
  /** Historial append-only de acciones de suscripción de un restaurante (super admin). */
  getHistorialSuscripciones(rid: string): Promise<Res<SuscripcionHistorial[]>>
  /** Renueva: fija la nueva fecha de vencimiento (y reactiva si estaba apagada). */
  suscripcionesRenovar(rid: string, fechaVencimiento: string, creadoPor?: string | null): Promise<Res<Restaurante>>
  /** Cambia el plan; el anterior queda registrado en el historial. */
  suscripcionesCambiarPlan(rid: string, planId: string, creadoPor?: string | null): Promise<Res<Restaurante>>
  /** Suspende sin tocar fechas ni plan (el motivo queda en el historial). */
  suscripcionesSuspender(rid: string, motivo: string | null, creadoPor?: string | null): Promise<Res<Restaurante>>
  /** Reactiva; opcionalmente con nuevo vencimiento. No reinicia el periodo. */
  suscripcionesReactivar(rid: string, fechaVencimiento: string | null, creadoPor?: string | null): Promise<Res<Restaurante>>

  // --------------------------------------------------------------- Usuarios
  /** Último acceso de cada usuario (RPC solo super_admin; el schema auth no es visible al cliente). */
  getUltimosAccesos(): Promise<Res<UltimosAccesos>>
  /** Activa/desactiva un usuario sin borrarlo (RPC; solo super admin). */
  adminCambiarEstadoUsuario(usuarioId: string, activo: boolean): Promise<Res<UsuarioPlataforma>>
  /** Designa a un usuario YA del restaurante como administrador (solo cambia el rol, nunca el vínculo). */
  adminDesignarAdministrador(restauranteId: string, usuarioId: string): Promise<Res<UsuarioPlataforma>>
  /** Alta de usuario con su cuenta Auth (Edge Function `crear-usuario`; solo super admin). */
  crearUsuarioPlataforma(datos: DatosUsuarioPlataforma): Promise<Res<UsuarioPlataforma>>

  // ----------------------------------------------------------- Estadísticas
  /**
   * Estadísticas globales de la plataforma entre dos instantes ISO (solo super
   * admin). En Supabase las agrega la RPC `admin_estadisticas_globales`; nunca
   * se descargan las tablas al navegador.
   */
  getEstadisticasGlobales(desde: string, hasta: string): Promise<Res<EstadisticasGlobales>>

  // -------------------------------------------------------------- Auditoría
  /**
   * Registro de auditoría de la plataforma (más reciente primero, tope 500).
   * Solo super admin. Es append-only: no hay forma de editar ni borrar filas.
   */
  getAuditoria(): Promise<Res<AuditLog[]>>
  /** Auditoría del restaurante del admin actual, limitada y paginada. */
  getAuditoriaRestaurante(filtros: FiltrosAuditoriaRestaurante): Promise<Res<PaginaAuditoria>>

  // ----------------------------------------------------------------- Soporte
  /** Tickets de soporte (más reciente primero). Solo super admin. */
  getTickets(): Promise<Res<SoporteTicket[]>>
  /** Crea un ticket; el código (TK-XXXXXX) lo asigna el servidor. */
  crearTicket(datos: DatosTicket): Promise<Res<SoporteTicket>>
  /** Actualiza estado/prioridad/responsable de un ticket. */
  actualizarTicket(ticketId: string, cambios: CambiosTicket): Promise<Res<SoporteTicket>>
  getMensajesSoporte(ticketId: string): Promise<Res<SoporteMensaje[]>>
  enviarMensajeSoporte(ticketId: string, autorId: string, autorSuperAdmin: boolean, mensaje: string): Promise<Res<SoporteMensaje>>
  /** Consultas anónimas de la landing, solo superadministrador. */
  getBandejaComercial(): Promise<Res<BandejaComercial>>
  actualizarConsultaComercial(id: string, estado: ConsultaComercial['estado']): Promise<Res<void>>
  actualizarSeguimientoComercial(id: string, responsable: string, nota: string, fecha: string | null): Promise<Res<void>>

  // ----------------------------------------------------------- Notificaciones
  /** Alertas administrativas agregadas. Solo super admin. */
  getAlertas(): Promise<Res<AlertaAdministrativa[]>>

  // -------------------------------------------------------- Configuración
  /** Configuración general de la plataforma (fila única). Solo super admin. */
  getConfiguracionGlobal(): Promise<Res<ConfiguracionGlobal>>
  /** Actualiza la configuración general. Solo super admin. */
  actualizarConfiguracionGlobal(datos: DatosConfiguracionGlobal): Promise<Res<ConfiguracionGlobal>>

  /** Datos del local que salen impresos en la boleta. */
  actualizarRestaurante(rid: string, cambios: CambiosRestaurante): Promise<Res<Restaurante>>

  // ---------------------------------------------------------------- Gestión
  crearZona(rid: string, nombre: string): Promise<Res<Zona>>
  actualizarZona(rid: string, id: string, nombre: string): Promise<Res<Zona>>
  eliminarZona(rid: string, id: string): Promise<Res<null>>

  crearMesa(rid: string, datos: DatosMesa): Promise<Res<Mesa>>
  actualizarMesa(rid: string, id: string, cambios: CambiosMesa): Promise<Res<Mesa>>
  eliminarMesa(rid: string, id: string): Promise<Res<null>>

  crearCategoria(rid: string, nombre: string): Promise<Res<CategoriaProducto>>
  actualizarCategoria(rid: string, id: string, nombre: string): Promise<Res<CategoriaProducto>>
  eliminarCategoria(rid: string, id: string): Promise<Res<null>>

  crearProducto(rid: string, datos: DatosProducto): Promise<Res<Producto>>
  actualizarProducto(rid: string, id: string, cambios: CambiosProducto): Promise<Res<Producto>>
  eliminarProducto(rid: string, id: string): Promise<Res<null>>

  crearPersonal(rid: string, datos: DatosPersonal): Promise<Res<UsuarioResumen>>
  actualizarPersonal(rid: string, id: string, cambios: CambiosPersonal): Promise<Res<UsuarioResumen>>
  cambiarEstadoPersonal(usuarioId: string, activo: boolean, motivo?: string): Promise<Res<UsuarioResumen>>
  /**
   * Aplica una clave temporal enmascarada, no persistida ni devuelta. La Edge
   * Function usa service_role solo en servidor y obliga al usuario a cambiarla.
   */
  resetPasswordPersonal(trabajadorId: string, passwordTemporal: string): Promise<Res<null>>

  // -------------------------------------------------------------------- Caja
  /** Turno abierto del restaurante, o `null` si la caja está cerrada. */
  getTurnoAbierto(rid: string): Promise<Res<TurnoCaja | null>>
  /** Historial de turnos (más reciente primero) para el arqueo del día. */
  getTurnos(rid: string): Promise<Res<TurnoCaja[]>>
  /**
   * Abre la gaveta con `montoInicial`. Solo puede haber un turno abierto por
   * restaurante. Devuelve el turno YA GUARDADO.
   */
  abrirTurno(rid: string, usuarioId: string, montoInicial: number): Promise<Res<TurnoCaja>>
  /**
   * Cierra el turno con el efectivo declarado. Calcula `monto_esperado` y
   * `diferencia` en el servidor (o en el backend local) a partir de las cuentas
   * pagadas en la ventana del turno, y los congela: el histórico no se recalcula
   * después. Devuelve el turno YA CERRADO.
   */
  cerrarTurno(
    rid: string,
    usuarioId: string,
    montoDeclarado: number,
    observaciones?: string | null,
  ): Promise<Res<TurnoCaja>>
}

// ---------------------------------------------------------------- realApi
/**
 * El error de una Edge Function llega con el `Response` adentro de `context`
 * y el motivo real en el cuerpo (`{ error: "..." }`); sin esto el usuario ve
 * un "Edge Function returned a non-2xx status code" sin saber qué falló.
 */
async function mensajeDeErrorFuncion(error: unknown): Promise<string> {
  const e = error as { message?: string; context?: Response }
  try {
    const cuerpo = await e?.context?.clone?.().text()
    if (cuerpo) {
      const motivo = (JSON.parse(cuerpo) as { error?: string })?.error
      if (motivo) return motivo
    }
  } catch {
    // Cuerpo vacío o no JSON: se usa el mensaje genérico de abajo.
  }
  return e?.message ?? 'No se pudo completar la operación.'
}

/**
 * Marca los ítems como bebida usando el campo explícito `productos.es_bebida`.
 * Ya no se adivina por el nombre de la categoría: el admin marca cada producto
 * como "bebida" al crearlo o editarlo.
 */
async function mapaEsBebida(
  rid: string,
  items: { producto_id: string | null }[],
): Promise<(productoId: string | null) => boolean> {
  const productoIds = [...new Set(items.map((it) => it.producto_id).filter((v): v is string => !!v))]
  if (productoIds.length === 0) return () => false
  const { data } = await supabase
    .from('productos')
    .select('id, es_bebida')
    .in('id', productoIds)
    .eq('restaurante_id', rid)
  const esBebidaDe = new Map<string, boolean>((data ?? []).map((p) => [p.id, Boolean(p.es_bebida)]))
  return (productoId: string | null) => (productoId ? esBebidaDe.get(productoId) === true : false)
}

const realApi: DataApi = {
  async getZonas(rid) {
    const { data, error } = await supabase.from('zonas').select('*').eq('restaurante_id', rid).order('nombre')
    return { data, error: error?.message ?? null }
  },
  async getMesas(rid) {
    const { data, error } = await supabase.from('mesas').select('*').eq('restaurante_id', rid).order('nombre')
    return { data, error: error?.message ?? null }
  },
  async getMesasPorCobrar(rid) {
    const { data, error } = await supabase.rpc('mesas_por_cobrar', { p_restaurante_id: rid })
    return { data: data as MesaPorCobrar[] | null, error: error?.message ?? null }
  },
  async getCategorias(rid) {
    const { data, error } = await supabase
      .from('categorias_productos')
      .select('*')
      .eq('restaurante_id', rid)
      .order('nombre')
    return { data, error: error?.message ?? null }
  },
  async getProductos(rid, opciones) {
    let consulta = supabase.from('productos').select('*').eq('restaurante_id', rid)
    // El menú del mesero solo ve lo disponible; el Admin necesita ver también lo
    // agotado (para reponerlo) y para saber qué bloquea el borrado de categorías.
    if (!opciones?.incluirAgotados) consulta = consulta.eq('disponible', true)
    const { data, error } = await consulta.order('nombre')
    return { data, error: error?.message ?? null }
  },
  async getMeseros(rid) {
    const { data, error } = await supabase.rpc('listar_meseros_activos_restaurante', {
      p_restaurante_id: rid,
    })
    return { data: data as MeseroResumen[] | null, error: error?.message ?? null }
  },
  async asignarMesaMesero(rid, mesaId, meseroId, pin, motivo) {
    const { error } = await supabase.rpc('asignar_mesa_mesero', {
      p_restaurante_id: rid,
      p_mesa_id: mesaId,
      p_mesero_id: meseroId,
      p_pin: pin,
      p_motivo: motivo,
    })
    return { data: null, error: mensajeOperacion(error?.message, 'No se pudo pasar la mesa. Actualiza las mesas e inténtalo de nuevo.') }
  },
  async moverConsumoMesa(rid, origenId, destinoId, pin, motivo) {
    const { error } = await supabase.rpc('mover_consumo_mesa', {
      p_restaurante_id: rid,
      p_mesa_origen_id: origenId,
      p_mesa_destino_id: destinoId,
      p_pin: pin,
      p_motivo: motivo,
    })
    return { data: null, error: mensajeOperacion(error?.message, 'No se pudo mover el consumo. Actualiza las mesas e inténtalo de nuevo.') }
  },
  async getPersonal(rid) {
    const { data, error } = await supabase
      .from('usuarios')
      .select('id, nombre, email, activo, rol')
      .eq('restaurante_id', rid)
      .in('rol', ROLES_PERSONAL)
      .order('nombre')
    return { data, error: error?.message ?? null }
  },
  async getPedidosDeMesa(rid, mesaId) {
    const { data, error } = await supabase.rpc('pedidos_pendientes_mesa', {
      p_restaurante_id: rid,
      p_mesa_id: mesaId,
    })
    return { data, error: error?.message ?? null }
  },
  async getPedidoItems(ids) {
    if (ids.length === 0) return { data: [], error: null }
    // Devuelve también los anulados (con su marca): el mesero debe ver qué
    // anuló, y quien llama decide si los cuenta o no.
    const { data, error } = await supabase
      .from('pedido_items')
      .select('id, pedido_id, producto_id, nombre_producto, cantidad, precio_unitario, nota, anulado')
      .in('pedido_id', ids)
    return { data, error: error?.message ?? null }
  },
  async getPedidosActivos(rid) {
    const { data: pedidosRaw, error: pedErr } = await supabase
      .from('pedidos')
      .select('*')
      .eq('restaurante_id', rid)
      .in('estado', ['pendiente', 'en_preparacion', 'listo'])
      .order('created_at')
    if (pedErr) return { data: null, error: pedErr.message }
    const pList = (pedidosRaw ?? []) as Pedido[]
    if (pList.length === 0) return { data: [], error: null }
    const { data: items, error: itErr } = await supabase
      .from('pedido_items')
      .select('id, pedido_id, producto_id, nombre_producto, cantidad, precio_unitario, nota, anulado, es_bebida, estacion')
      .in('pedido_id', pList.map((p) => p.id))
    if (itErr) return { data: null, error: itErr.message }

    // Cocina solo ve lo que hay que preparar: los ítems anulados desaparecen.
    const marcaBebida = await mapaEsBebida(rid, (items ?? []) as PedidoItem[])
    const todos = ((items ?? []) as PedidoItem[]).map((it) => ({
      ...it,
      es_bebida: it.es_bebida ?? marcaBebida(it.producto_id),
      estacion: it.estacion ?? estacionDeProducto({ estacion: it.estacion, es_bebida: it.es_bebida ?? marcaBebida(it.producto_id) }),
    }))
    const conItems = pList
      .map((p) => {
        const suyos = todos.filter((it) => it.pedido_id === p.id)
        return {
          ...p,
          items: suyos.filter((it) => it.anulado !== true),
          anulados: suyos.filter((it) => it.anulado === true),
        }
      })
      .filter((p) => p.items.length > 0)
    return { data: conItems, error: null }
  },
  async registrarImpresionComanda(rid, pedidoId, estacion, solicitudId, motivo) {
    const { data, error } = await supabase.rpc('registrar_impresion_comanda', {
      p_restaurante_id: rid,
      p_pedido_id: pedidoId,
      p_estacion: estacion,
      p_solicitud_id: solicitudId,
      p_motivo: motivo ?? null,
    })
    return { data: data as ResultadoRegistroImpresion | null, error: error?.message ?? null }
  },
  async crearPedido(rid, mesaId, items) {
    const { data, error } = await supabase.rpc('crear_pedido', {
      p_restaurante_id: rid,
      p_mesa_id: mesaId,
      // Solo qué producto y cuánto: el precio y el nombre los resuelve la RPC
      // leyendo `productos` (ver supabase/rpc_crear_pedido.sql).
      p_items: items.map((it) => ({ producto_id: it.producto_id, cantidad: it.cantidad, nota: it.nota ?? '' })),
    })
    return { data, error: error?.message ?? null }
  },
  async editarItem(rid, pedidoId, itemId, cambios) {
    const { error } = await supabase.rpc('editar_item_comanda', {
      p_restaurante_id: rid,
      p_pedido_id: pedidoId,
      p_item_id: itemId,
      p_cantidad: cambios.cantidad,
      p_nota: cambios.nota,
    })
    return { data: null, error: error?.message ?? null }
  },
  async anularItem(rid, pedidoId, itemId, pin = null) {
    const { error } = await supabase.rpc('anular_item_comanda', {
      p_restaurante_id: rid,
      p_pedido_id: pedidoId,
      p_item_id: itemId,
      p_pin: pin,
    })
    return { data: null, error: mensajeOperacion(error?.message, 'No se pudo anular el ítem. Actualiza la comanda e inténtalo de nuevo.') }
  },
  async anularCuenta(rid, cuentaId, motivo, pin = null) {
    const controller = new AbortController()
    let vencio = false
    const timeout = setTimeout(() => {
      vencio = true
      controller.abort()
    }, 25_000)
    try {
      const { data, error } = await supabase
        .rpc('anular_cuenta', {
          p_restaurante_id: rid,
          p_cuenta_id: cuentaId,
          p_motivo: motivo,
          p_pin: pin,
        })
        .abortSignal(controller.signal)
      if (!error) return { data: data as Cuenta | null, error: null }

      if (vencio || esFalloDeRed(error.message)) {
        // La desconexión puede ocurrir después del COMMIT. Lee el estado antes
        // de pedir al usuario que repita una acción que mueve dinero.
        const verificacion = await supabase
          .from('cuentas')
          .select('*')
          .eq('id', cuentaId)
          .eq('restaurante_id', rid)
          .maybeSingle()
        if (!verificacion.error && verificacion.data?.estado === 'anulada') {
          return { data: verificacion.data as Cuenta, error: null }
        }
        return {
          data: null,
          error: 'La operación tardó más de 25 segundos y no se pudo confirmar. Actualiza las boletas antes de volver a intentarlo.',
        }
      }
      return { data: null, error: mensajeOperacion(error.message, 'No se pudo anular la boleta. Actualiza la lista e inténtalo de nuevo.') }
    } catch (causa) {
      const mensaje = causa instanceof Error ? causa.message : ''
      if (vencio || esFalloDeRed(mensaje)) {
        const verificacion = await supabase
          .from('cuentas')
          .select('*')
          .eq('id', cuentaId)
          .eq('restaurante_id', rid)
          .maybeSingle()
        if (!verificacion.error && verificacion.data?.estado === 'anulada') {
          return { data: verificacion.data as Cuenta, error: null }
        }
        return {
          data: null,
          error: 'La operación tardó más de 25 segundos y no se pudo confirmar. Actualiza las boletas antes de volver a intentarlo.',
        }
      }
      return { data: null, error: mensaje || 'No se pudo completar la anulación.' }
    } finally {
      clearTimeout(timeout)
    }
  },
  async tienePinAutorizacion(rid) {
    const { data, error } = await supabase.rpc('tiene_pin_autorizacion', { p_restaurante_id: rid })
    if (error) return { data: true, error: error.message }
    // Ante cualquier duda se pide el PIN: es la opción que no deja pasar una
    // anulación indebida.
    return { data: data !== false, error: null }
  },
  async configurarPinAutorizacion(rid, pin) {
    const { error } = await supabase.rpc('configurar_pin_autorizacion', {
      p_restaurante_id: rid,
      p_pin: pin,
    })
    return { data: null, error: error?.message ?? null }
  },
  async quitarPinAutorizacion(rid) {
    const { error } = await supabase.rpc('quitar_pin_autorizacion', { p_restaurante_id: rid })
    return { data: null, error: error?.message ?? null }
  },
  async avanzarPedido(rid, pedidoId) {
    const { data: ped } = await supabase
      .from('pedidos')
      .select('estado')
      .eq('id', pedidoId)
      .eq('restaurante_id', rid)
      .maybeSingle()
    if (!ped) return { data: null, error: 'Pedido no encontrado' }
    // Compare-and-set: si otra pantalla (o otro device) ya avanzó el estado,
    // el UPDATE no matchea y avisamos en vez de saltarnos un estado.
    const siguiente = siguienteEstado(ped.estado)
    if (siguiente === ped.estado) return { data: null, error: 'La comanda ya no tiene estados pendientes' }
    const { data: actualizado, error } = await supabase
      .from('pedidos')
      .update({ estado: siguiente, updated_at: new Date().toISOString() })
      .eq('id', pedidoId)
      .eq('restaurante_id', rid)
      .eq('estado', ped.estado)
      .select('id')
      .maybeSingle()
    if (error) return { data: null, error: error.message }
    if (!actualizado) return { data: null, error: 'La comanda cambió de estado en otro momento. Actualiza la pantalla.' }
    return { data: null, error: null }
  },
  async cerrarCuenta(rid, mesaId, pedidos, metodo) {
    return realApi.cerrarCuentaDividida(rid, mesaId, pedidos, [{ metodo_pago: metodo, monto: 0 }], 0)
  },
  async cerrarCuentaDividida(rid, mesaId, pedidos, pagos, propina = 0) {
    if (pagos.length === 0) return { data: null, error: 'Agrega al menos un método de pago.' }
    if (pagos.some((p) => !esMetodoPagoValido(p.metodo_pago)))
      return { data: null, error: 'Método de pago no válido.' }
    if (pagos.some((p) => !Number.isFinite(p.monto) || p.monto < 0))
      return { data: null, error: 'Los montos del pago no son válidos.' }
    if (!Number.isFinite(propina) || propina < 0) return { data: null, error: 'La propina no puede ser negativa.' }
    // `monto: 0` significa "el cliente entregó exactamente lo que se le pide":
    // la RPC calcula el importe real a partir del total de la comanda. Es el
    // camino del pago simple y evita que el total dependa de lo que tecleó el
    // mesero en el navegador.
    const { data: cuentaId, error } = await supabase.rpc('cerrar_cuenta', {
      p_restaurante_id: rid,
      p_mesa_id: mesaId,
      p_pedidos: pedidos,
      p_pagos: pagos.map((p) => ({
        metodo_pago: p.metodo_pago,
        monto: p.monto > 0 ? p.monto : null,
        referencia: p.referencia ?? null,
      })),
      p_propina: propina,
    })
    if (error || !cuentaId) return { data: null, error: error?.message ?? 'No se pudo cerrar la cuenta' }
    // Se relee la cuenta: la boleta se arma con lo guardado, no con lo que el
    // navegador calculó antes de cobrar.
    const { data: cuenta, error: cErr } = await supabase
      .from('cuentas')
      .select('*')
      .eq('id', cuentaId)
      .single()
    if (cErr) return { data: null, error: cErr.message }
    return { data: cuenta as Cuenta, error: null }
  },
  async liberarMesa(rid, mesaId) {
    const { error } = await supabase
      .from('mesas')
      .update({ estado: 'libre' })
      .eq('id', mesaId)
      .eq('restaurante_id', rid)
    return { data: null, error: error?.message ?? null }
  },
  async getMetricasAdmin(rid) {
    // Trae pagadas Y anuladas: computeMetricas separa ambas (las anuladas no
    // cuentan como venta) y las muestra aparte para que el Admin vea los
    // reembolsos del mes.
    const { data: cuentas, error: cErr } = await supabase
      .from('cuentas')
      .select('*')
      .eq('restaurante_id', rid)
      .in('estado', ['pagada', 'anulada'])
    if (cErr) return { data: null, error: cErr.message }
    const cList = cuentas ?? []

    const cuentaIds = cList.map((c) => c.id)
    let pedidoIds: string[] = []
    // Detalle de pagos: sin él, una cuenta dividida se reportaría entera como
    // "su primer método" (tarjeta + efectivo se vería 100% tarjeta).
    let pagos: Pago[] = []
    if (cuentaIds.length > 0) {
      const { data: pg, error: pgErr } = await supabase
        .from('cuenta_pagos')
        .select('cuenta_id, metodo_pago, monto')
        .in('cuenta_id', cuentaIds)
      if (pgErr) return { data: null, error: pgErr.message }
      pagos = (pg ?? []) as Pago[]
    }
    if (cuentaIds.length > 0) {
      const { data: cps, error: cpErr } = await supabase
        .from('cuenta_pedidos')
        .select('pedido_id')
        .in('cuenta_id', cuentaIds)
      if (cpErr) return { data: null, error: cpErr.message }
      pedidoIds = (cps ?? []).map((cp) => cp.pedido_id)
    }

    let pedidos: Pedido[] = []
    let items: PedidoItem[] = []
    if (pedidoIds.length > 0) {
      const [pRes, iRes] = await Promise.all([
        supabase.from('pedidos').select('*').in('id', pedidoIds),
        supabase
          .from('pedido_items')
          .select('id, pedido_id, producto_id, nombre_producto, cantidad, precio_unitario, nota, anulado')
          // `.eq('anulado', false)` excluiría los NULL (PostgREST no los trae), pero
          // `itemsVigentes` trata NULL como vigente: el dashboard terminaría
          // contando menos que la caja. Por eso el OR explícito.
          .or('anulado.is.null,anulado.eq.false')
          .in('pedido_id', pedidoIds),
      ])
      if (pRes.error) return { data: null, error: pRes.error.message }
      if (iRes.error) return { data: null, error: iRes.error.message }
      pedidos = (pRes.data ?? []) as Pedido[]
      items = (iRes.data ?? []) as PedidoItem[]
    }

    const { data: usuarios, error: uErr } = await supabase
      .from('usuarios')
      .select('id, nombre')
      .eq('restaurante_id', rid)
    if (uErr) return { data: null, error: uErr.message }

    return { data: computeMetricas(cList, pedidos, items, usuarios ?? [], pagos), error: null }
  },
  async getReporteVentas(rid, rango) {
    const { data, error } = await supabase.rpc('reporte_ventas_restaurante', {
      p_restaurante_id: rid,
      p_desde: rango.desde,
      p_hasta: rango.hasta,
      p_estado: rango.estado,
      p_busqueda: rango.busqueda,
      p_offset: rango.offset,
      p_limite: rango.limite,
    })
    return { data: data as ReporteVentas | null, error: error?.message ?? null }
  },
  async getCuentasPagadas(rid) {
    const { data, error } = await supabase
      .from('cuentas')
      // `vuelto` y `propina` van incluidos: el arqueo de caja los necesita para
      // no contar como efectivo lo que se devolvió al cliente.
      .select('id, total, metodo_pago, estado, pagado_at, created_at, propina, vuelto')
      .eq('restaurante_id', rid)
      .eq('estado', 'pagada')
      .order('pagado_at')
    return { data: data ?? [], error: error?.message ?? null }
  },
  async getCuentasDelDia(rid) {
    const { data, error } = await supabase
      .from('cuentas')
      .select('*')
      .eq('restaurante_id', rid)
      .in('estado', ['pagada', 'anulada'])
      .not('pagado_at', 'is', null)
      .order('pagado_at', { ascending: false })
      .limit(200)
    return { data: (data ?? []) as Cuenta[], error: error?.message ?? null }
  },
  async getCuentasFiltradas(_rid, filtros) {
    const { data, error } = await supabase.rpc('admin_buscar_cobros', {
      p_desde: filtros.desde,
      p_hasta: filtros.hasta,
      p_estado: filtros.estado,
      p_metodo: filtros.metodo,
      p_busqueda: filtros.busqueda,
      p_offset: filtros.offset,
      p_limite: filtros.limite,
    })
    if (error) return { data: null, error: error.message }
    const resultado = data as unknown as PaginaCobros | null
    return { data: { items: resultado?.items ?? [], total: resultado?.total ?? 0 }, error: null }
  },
  async getBoletaReimpresion(rid, cuentaId, pin = null) {
    const { data, error } = await supabase.rpc('reimprimir_boleta', {
      p_restaurante_id: rid,
      p_cuenta_id: cuentaId,
      p_pin: pin,
    })
    return { data: data as BoletaReimpresion | null, error: error?.message ?? null }
  },
  async getPagosDeCuentas(rid) {
    const { data, error } = await supabase
      .from('cuenta_pagos')
      .select('cuenta_id, metodo_pago, monto')
      .eq('restaurante_id', rid)
    return { data: (data ?? []) as Pago[], error: error?.message ?? null }
  },
  async getRestaurantes() {
    const { data, error } = await supabase.from('restaurantes').select('*').order('nombre')
    return { data, error: error?.message ?? null }
  },
  async getAdministradores() {
    const { data, error } = await supabase
      .from('usuarios')
      .select('id, nombre, email, activo, rol, restaurante_id')
      .eq('rol', 'admin_restaurante')
      .order('nombre')
    if (error) return { data: null, error: error.message }
    return { data: (data ?? []) as AdminRestaurante[], error: null }
  },
  async getUsuariosPlataforma() {
    const { data, error } = await supabase
      .from('usuarios')
      .select('id, nombre, email, activo, rol, restaurante_id, created_at')
      .order('created_at', { ascending: false })
    if (error) return { data: null, error: error.message }
    return { data: (data ?? []) as UsuarioPlataforma[], error: null }
  },
  async getUltimosAccesos() {
    const { data, error } = await supabase.rpc('admin_ultimos_accesos')
    if (error) return { data: null, error: error.message }
    const mapa: UltimosAccesos = {}
    for (const fila of (data ?? []) as { id: string; ultimo_acceso: string | null }[]) {
      mapa[fila.id] = fila.ultimo_acceso
    }
    return { data: mapa, error: null }
  },
  async adminCambiarEstadoUsuario(usuarioId, activo) {
    const { data, error } = await supabase.rpc('admin_cambiar_estado_usuario', {
      p_usuario_id: usuarioId,
      p_activo: activo,
    })
    if (error) return { data: null, error: error.message }
    const fila = (Array.isArray(data) ? data[0] : data) as UsuarioPlataforma | undefined
    if (!fila) return { data: null, error: 'Usuario no encontrado.' }
    return { data: fila, error: null }
  },
  async adminDesignarAdministrador(restauranteId, usuarioId) {
    const { data, error } = await supabase.rpc('admin_designar_administrador', {
      p_restaurante_id: restauranteId,
      p_usuario_id: usuarioId,
    })
    if (error) return { data: null, error: error.message }
    const fila = (Array.isArray(data) ? data[0] : data) as UsuarioPlataforma | undefined
    if (!fila) return { data: null, error: 'Usuario no encontrado.' }
    return { data: fila, error: null }
  },
  async crearUsuarioPlataforma(datos) {
    // La cuenta de Auth la crea la Edge Function con service_role; el
    // navegador solo envía el formulario con su JWT de super_admin.
    const { data, error } = await supabase.functions.invoke('crear-usuario', {
      body: {
        nombre: datos.nombre,
        email: datos.email,
        password: datos.password,
        rol: datos.rol,
        restaurante_id: datos.restauranteId,
      },
    })
    if (error) return { data: null, error: await mensajeDeErrorFuncion(error) }
    const usuario = (data as { usuario?: UsuarioPlataforma } | null)?.usuario
    if (!usuario) return { data: null, error: 'Respuesta inesperada de la función.' }
    return { data: usuario, error: null }
  },
  async getEstadisticasGlobales(desde, hasta) {
    const { data, error } = await supabase.rpc('admin_estadisticas_globales', {
      p_desde: desde,
      p_hasta: hasta,
    })
    if (error) return { data: null, error: error.message }
    // La RPC devuelve un jsonb. Si la base quedó con una versión anterior (a la
    // que le falta algún campo, p. ej. `administradores`), completamos el resumen
    // con 0 para que la vista no reviente por un campo indefinido.
    const datos = data as EstadisticasGlobales | null
    return {
      data: {
        ...(datos ?? ({} as EstadisticasGlobales)),
        resumen: {
          restaurantesRegistrados: 0,
          restaurantesActivos: 0,
          usuarios: 0,
          usuariosActivos: 0,
          administradores: 0,
          pedidos: 0,
          ventas: 0,
          restaurantesNuevos: 0,
          ...datos?.resumen,
        },
      },
      error: null,
    }
  },
  // -------------------------------------------------------- Auditoría (real)
  async getAuditoria() {
    const { data, error } = await supabase
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500)
    if (error) return { data: null, error: error.message }
    return { data: normalizarContenidoUtf8((data ?? []) as AuditLog[]), error: null }
  },
  async getAuditoriaRestaurante(filtros) {
    const { data, error } = await supabase.rpc('admin_listar_auditoria_restaurante', {
      p_desde: filtros.desde,
      p_hasta: filtros.hasta,
      p_busqueda: filtros.busqueda,
      p_categoria: filtros.categoria,
      p_offset: filtros.offset,
      p_limite: filtros.limite,
    })
    if (error) return { data: null, error: error.message }
    const resultado = data as unknown as PaginaAuditoria | null
    return {
      data: { items: normalizarContenidoUtf8(resultado?.items ?? []), total: resultado?.total ?? 0 },
      error: null,
    }
  },
  // ---------------------------------------------------------- Soporte (real)
  async getTickets() {
    const { data, error } = await supabase
      .from('soporte_tickets')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) return { data: null, error: error.message }
    return { data: (data ?? []) as SoporteTicket[], error: null }
  },
  async crearTicket(datos) {
    const asunto = datos.asunto.trim()
    const descripcion = datos.descripcion.trim()
    if (!asunto) return { data: null, error: 'El asunto del ticket es obligatorio.' }
    if (!descripcion) return { data: null, error: 'La descripción del ticket es obligatoria.' }
    if (!PRIORIDADES_TICKET.includes(datos.prioridad)) {
      return { data: null, error: 'Prioridad de ticket no válida.' }
    }
    if (!TIPOS_TICKET.includes(datos.tipo ?? 'error')) return { data: null, error: 'Tipo de ticket no válido.' }
    const { data, error } = await supabase
      .from('soporte_tickets')
      .insert({
        restaurante_id: datos.restauranteId ?? null,
        usuario_id: datos.usuarioId ?? null,
        asunto,
        descripcion,
        tipo: datos.tipo ?? 'error',
        prioridad: datos.prioridad,
      })
      .select('*')
      .single()
    if (error) return { data: null, error: error.message }
    return { data: data as SoporteTicket, error: null }
  },
  async actualizarTicket(ticketId, cambios) {
    if (cambios.estado && !ESTADOS_TICKET.includes(cambios.estado)) {
      return { data: null, error: 'Estado de ticket no válido.' }
    }
    if (cambios.prioridad && !PRIORIDADES_TICKET.includes(cambios.prioridad)) {
      return { data: null, error: 'Prioridad de ticket no válida.' }
    }
    const cambiosU: Partial<Pick<SoporteTicket, 'estado' | 'prioridad' | 'responsable'>> = {}
    if (cambios.estado !== undefined) cambiosU.estado = cambios.estado
    if (cambios.prioridad !== undefined) cambiosU.prioridad = cambios.prioridad
    if (cambios.responsable !== undefined) {
      cambiosU.responsable = cambios.responsable?.trim() || null
    }
    if (Object.keys(cambiosU).length === 0) {
      return { data: null, error: 'No hay cambios para guardar.' }
    }
    const { data, error } = await supabase
      .from('soporte_tickets')
      .update(cambiosU)
      .eq('id', ticketId)
      .select('*')
      .single()
    if (error) return { data: null, error: error.message }
    return { data: data as SoporteTicket, error: null }
  },
  async getBandejaComercial() {
    const { data, error } = await supabase.rpc('mesora_commercial_inbox')
    if (error) return { data: null, error: error.message }
    return { data: data as BandejaComercial, error: null }
  },
  async getMensajesSoporte(ticketId) {
    const { data, error } = await supabase.from('soporte_mensajes').select('*').eq('ticket_id', ticketId).order('created_at')
    return { data: error ? null : (data ?? []) as SoporteMensaje[], error: error?.message ?? null }
  },
  async enviarMensajeSoporte(ticketId, autorId, autorSuperAdmin, mensaje) {
    const texto = mensaje.trim()
    if (!texto || texto.length > 2000) return { data: null, error: 'Escribe un mensaje de hasta 2000 caracteres.' }
    const { data, error } = await supabase.from('soporte_mensajes')
      .insert({ ticket_id: ticketId, autor_id: autorId, autor_super_admin: autorSuperAdmin, mensaje: texto })
      .select('*').single()
    return { data: error ? null : data as SoporteMensaje, error: error?.message ?? null }
  },
  async actualizarConsultaComercial(id, estado) {
    const { error } = await supabase.rpc('mesora_update_commercial_lead', { p_id: id, p_estado: estado })
    return { data: error ? null : undefined, error: error?.message ?? null }
  },
  async actualizarSeguimientoComercial(id, responsable, nota, fecha) {
    const { error } = await supabase.rpc('mesora_update_commercial_followup', {
      p_id: id, p_responsable: responsable, p_nota_interna: nota, p_proximo_contacto: fecha || null,
    })
    return { data: error ? null : undefined, error: error?.message ?? null }
  },
  // --------------------------------------------------- Notificaciones (real)
  async getAlertas() {
    const [administrativas, sistema] = await Promise.all([
      supabase.rpc('admin_alertas'),
      supabase.rpc('mesora_system_alerts'),
    ])
    if (administrativas.error) return { data: null, error: administrativas.error.message }
    if (sistema.error) return { data: null, error: sistema.error.message }
    return { data: [...((sistema.data ?? []) as AlertaAdministrativa[]), ...((administrativas.data ?? []) as AlertaAdministrativa[])], error: null }
  },
  // --------------------------------------------------- Configuración (real)
  async getConfiguracionGlobal() {
    const { data, error } = await supabase
      .from('configuracion_global')
      .select('*')
      .eq('id', 1)
      .single()
    if (error) return { data: null, error: error.message }
    return { data: data as ConfiguracionGlobal, error: null }
  },
  async actualizarConfiguracionGlobal(datos) {
    const errorValidacion = validarConfiguracionGlobal(datos)
    if (errorValidacion) return { data: null, error: errorValidacion }
    const { data, error } = await supabase
      .from('configuracion_global')
      .update(normalizarConfiguracionGlobal(datos))
      .eq('id', 1)
      .select('*')
      .single()
    if (error) return { data: null, error: error.message }
    return { data: data as ConfiguracionGlobal, error: null }
  },
  async crearRestauranteConAdmin(datos) {
    // La creación de la cuenta de Auth vive en la Edge Function: el navegador
    // solo manda los datos del formulario con su propio JWT de super_admin.
    const { data, error } = await supabase.functions.invoke('crear-restaurante', {
      body: JSON.parse(JSON.stringify(datos)),
    })
    if (error) {
      return { data: null, error: await mensajeDeErrorFuncion(error) }
    }
    const restaurante = (data as { restaurante?: Restaurante } | null)?.restaurante
    if (!restaurante) return { data: null, error: 'Respuesta inesperada de la función.' }
    return { data: restaurante, error: null }
  },
  async actualizarRestaurante(rid, cambios) {
    const preparados = prepararDatosLocal(cambios)
    if (preparados.error || !preparados.data) return { data: null, error: preparados.error }
    const { data, error } = await supabase
      .from('restaurantes')
      .update(preparados.data)
      .eq('id', rid)
      .select('*')
      .single()
    if (error) return { data: null, error: error.message }
    return { data: data as Restaurante, error: null }
  },
  async adminActualizarRestaurante(rid, datos) {
    const { data, error } = await supabase.rpc('admin_actualizar_restaurante', {
      p_restaurante_id: rid,
      p_nombre: datos.nombre,
      p_ruc: datos.ruc ?? null,
      p_direccion: datos.direccion ?? null,
      p_telefono: datos.telefono ?? null,
      p_email_contacto: datos.email_contacto ?? null,
    })
    if (error) return { data: null, error: error.message }
    const fila = (Array.isArray(data) ? data[0] : data) as Restaurante | undefined
    if (!fila) return { data: null, error: 'Restaurante no encontrado.' }
    return { data: fila, error: null }
  },
  async adminCambiarSuscripcion(rid, activa, fechaVencimiento) {
    const { data, error } = await supabase.rpc('admin_cambiar_suscripcion', {
      p_restaurante_id: rid,
      p_activa: activa,
      p_fecha_vencimiento: fechaVencimiento,
    })
    if (error) return { data: null, error: error.message }
    const fila = (Array.isArray(data) ? data[0] : data) as Restaurante | undefined
    if (!fila) return { data: null, error: 'Restaurante no encontrado.' }
    return { data: fila, error: null }
  },
  // -------------------------------------------------------- Suscripciones (real)
  async getPlanes() {
    const { data, error } = await supabase.from('planes').select('*').order('orden')
    if (error) return { data: null, error: error.message }
    return { data: (data ?? []) as Plan[], error: null }
  },
  async getHistorialSuscripciones(rid) {
    const { data, error } = await supabase
      .from('suscripciones_historial')
      .select('*')
      .eq('restaurante_id', rid)
      .order('created_at', { ascending: false })
    if (error) return { data: null, error: error.message }
    return { data: (data ?? []) as SuscripcionHistorial[], error: null }
  },
  async suscripcionesRenovar(rid, fechaVencimiento, creadoPor) {
    const { data, error } = await supabase.rpc('suscripciones_renovar', {
      p_restaurante_id: rid,
      p_fecha_vencimiento: fechaVencimiento,
      p_creado_por: creadoPor ?? null,
    })
    if (error) return { data: null, error: error.message }
    const fila = (Array.isArray(data) ? data[0] : data) as Restaurante | undefined
    if (!fila) return { data: null, error: 'Restaurante no encontrado.' }
    return { data: fila, error: null }
  },
  async suscripcionesCambiarPlan(rid, planId, creadoPor) {
    const { data, error } = await supabase.rpc('suscripciones_cambiar_plan', {
      p_restaurante_id: rid,
      p_plan_id: planId,
      p_creado_por: creadoPor ?? null,
    })
    if (error) return { data: null, error: error.message }
    const fila = (Array.isArray(data) ? data[0] : data) as Restaurante | undefined
    if (!fila) return { data: null, error: 'Restaurante no encontrado.' }
    return { data: fila, error: null }
  },
  async suscripcionesSuspender(rid, motivo, creadoPor) {
    const { data, error } = await supabase.rpc('suscripciones_suspender', {
      p_restaurante_id: rid,
      p_motivo: motivo,
      p_creado_por: creadoPor ?? null,
    })
    if (error) return { data: null, error: error.message }
    const fila = (Array.isArray(data) ? data[0] : data) as Restaurante | undefined
    if (!fila) return { data: null, error: 'Restaurante no encontrado.' }
    return { data: fila, error: null }
  },
  async suscripcionesReactivar(rid, fechaVencimiento, creadoPor) {
    const { data, error } = await supabase.rpc('suscripciones_reactivar', {
      p_restaurante_id: rid,
      p_fecha_vencimiento: fechaVencimiento,
      p_creado_por: creadoPor ?? null,
    })
    if (error) return { data: null, error: error.message }
    const fila = (Array.isArray(data) ? data[0] : data) as Restaurante | undefined
    if (!fila) return { data: null, error: 'Restaurante no encontrado.' }
    return { data: fila, error: null }
  },
  // ------------------------------------------------------------ Gestión (real)
  async crearZona(rid, nombre) {
    const { data, error } = await supabase
      .from('zonas')
      .insert({ restaurante_id: rid, nombre })
      .select()
      .single()
    if (error) return { data: null, error: error.message }
    return { data: data as Zona, error: null }
  },
  async actualizarZona(rid, id, nombre) {
    const { data, error } = await supabase
      .from('zonas')
      .update({ nombre })
      .eq('id', id)
      .eq('restaurante_id', rid)
      .select()
      .single()
    if (error) return { data: null, error: error.message }
    return { data: data as Zona, error: null }
  },
  async eliminarZona(rid, id) {
    const { count } = await supabase
      .from('mesas')
      .select('*', { count: 'exact', head: true })
      .eq('restaurante_id', rid)
      .eq('zona_id', id)
    if (count) return { data: null, error: 'La zona tiene mesas asociadas. Elimina primero sus mesas.' }
    const { error } = await supabase.from('zonas').delete().eq('id', id).eq('restaurante_id', rid)
    return { data: null, error: error?.message ?? null }
  },
  async crearMesa(rid, datos) {
    const { data, error } = await supabase
      .from('mesas')
      .insert({ ...datos, restaurante_id: rid, estado: 'libre' })
      .select()
      .single()
    if (error) return { data: null, error: traducirErrorMesa(error, datos.nombre) }
    return { data: data as Mesa, error: null }
  },
  async actualizarMesa(rid, id, cambios) {
    const { data, error } = await supabase
      .from('mesas')
      .update(cambios)
      .eq('id', id)
      .eq('restaurante_id', rid)
      .select()
      .single()
    if (error) return { data: null, error: traducirErrorMesa(error, cambios.nombre ?? 'ese nombre') }
    return { data: data as Mesa, error: null }
  },
  async eliminarMesa(rid, id) {
    const pendientes = await realApi.getPedidosDeMesa(rid, id)
    if (pendientes.error) return { data: null, error: pendientes.error }
    if (pendientes.data?.length) return { data: null, error: 'La mesa tiene comandas por cobrar. No se puede eliminar a?n.' }
    const { error } = await supabase.from('mesas').delete().eq('id', id).eq('restaurante_id', rid)
    return { data: null, error: error?.message ?? null }
  },
  async crearCategoria(rid, nombre) {
    const { data, error } = await supabase
      .from('categorias_productos')
      .insert({ restaurante_id: rid, nombre })
      .select()
      .single()
    if (error) return { data: null, error: error.message }
    return { data: data as CategoriaProducto, error: null }
  },
  async actualizarCategoria(rid, id, nombre) {
    const { data, error } = await supabase
      .from('categorias_productos')
      .update({ nombre })
      .eq('id', id)
      .eq('restaurante_id', rid)
      .select()
      .single()
    if (error) return { data: null, error: error.message }
    return { data: data as CategoriaProducto, error: null }
  },
  async eliminarCategoria(rid, id) {
    const { count } = await supabase
      .from('productos')
      .select('*', { count: 'exact', head: true })
      .eq('restaurante_id', rid)
      .eq('categoria_id', id)
    if (count) return { data: null, error: 'La categoría tiene productos asociados. Elimina primero sus productos.' }
    const { error } = await supabase
      .from('categorias_productos')
      .delete()
      .eq('id', id)
      .eq('restaurante_id', rid)
    return { data: null, error: error?.message ?? null }
  },
  async crearProducto(rid, datos) {
    const { data, error } = await supabase
      .from('productos')
      .insert({ ...datos, restaurante_id: rid })
      .select()
      .single()
    if (error) return { data: null, error: error.message }
    return { data: data as Producto, error: null }
  },
  async actualizarProducto(rid, id, cambios) {
    const { data, error } = await supabase
      .from('productos')
      .update(cambios)
      .eq('id', id)
      .eq('restaurante_id', rid)
      .select()
      .single()
    if (error) return { data: null, error: error.message }
    return { data: data as Producto, error: null }
  },
  async eliminarProducto(rid, id) {
    const { error } = await supabase
      .from('productos')
      .delete()
      .eq('id', id)
      .eq('restaurante_id', rid)
    return { data: null, error: error?.message ?? null }
  },
  async crearPersonal(_rid, datos) {
    const { data, error } = await supabase.functions.invoke('crear-personal', {
      body: { nombre: datos.nombre, email: datos.email, password: (datos as DatosPersonal).password, rol: datos.rol },
    })
    if (error) return { data: null, error: await mensajeDeErrorFuncion(error) }
    const usuario = (data as { usuario?: UsuarioResumen } | null)?.usuario
    if (!usuario) return { data: null, error: 'Respuesta inesperada de la función.' }
    return { data: usuario, error: null }
  },
  async actualizarPersonal(rid, id, cambios) {
    if ('activo' in cambios) return { data: null, error: 'Usa la confirmación segura para cambiar el acceso del personal.' }
    const actualizacion = {
      ...(cambios.nombre !== undefined ? { nombre: cambios.nombre } : {}),
      ...(cambios.rol !== undefined ? { rol: cambios.rol } : {}),
    }
    const { data, error } = await supabase
      .from('usuarios')
      .update(actualizacion)
      .eq('id', id)
      .eq('restaurante_id', rid)
      .in('rol', ROLES_PERSONAL)
      .select('id, nombre, email, activo, rol')
      .single()
    if (error) return { data: null, error: error.message }
    return { data: data as UsuarioResumen, error: null }
  },
  async cambiarEstadoPersonal(usuarioId, activo, motivo = '') {
    const { data, error } = await supabase.functions.invoke('personal-cambiar-estado', {
      body: { usuario_id: usuarioId, activo, motivo },
    })
    if (error) return { data: null, error: await mensajeDeErrorFuncion(error) }
    const usuario = (data as { usuario?: UsuarioResumen } | null)?.usuario
    return usuario ? { data: usuario, error: null } : { data: null, error: 'No se pudo confirmar el cambio de acceso.' }
  },
  async resetPasswordPersonal(trabajadorId, passwordTemporal) {
    // La cuenta de Auth la toca la Edge Function con service_role; no devuelve ni registra la clave.
    const { data, error } = await supabase.functions.invoke('reset-password-personal', {
      body: { trabajador_id: trabajadorId, password_temporal: passwordTemporal },
    })
    if (error) return { data: null, error: await mensajeDeErrorFuncion(error) }
    if (!(data as { ok?: boolean } | null)?.ok) return { data: null, error: 'No se pudo confirmar el cambio de contraseña.' }
    return { data: null, error: null }
  },
  async getTurnoAbierto(rid) {
    const { data, error } = await supabase
      .from('caja_turnos')
      .select('*')
      .eq('restaurante_id', rid)
      .eq('estado', 'abierto')
      .maybeSingle()
    return { data: data as TurnoCaja | null, error: error?.message ?? null }
  },
  async getTurnos(rid) {
    const { data, error } = await supabase
      .from('caja_turnos')
      .select('*')
      .eq('restaurante_id', rid)
      .order('fecha_apertura', { ascending: false })
    return { data: (data ?? []) as TurnoCaja[], error: error?.message ?? null }
  },
  async abrirTurno(rid, usuarioId, montoInicial) {
    // La RPC (y no un INSERT directo) porque el "un solo turno abierto" lo
    // decide un índice único parcial: dos cajas abiertas a la vez tienen que
    // ser un error de la base, no una condición de carrera del front.
    const { data, error } = await supabase.rpc('abrir_turno_caja', {
      p_restaurante_id: rid,
      p_usuario_id: usuarioId,
      p_monto_inicial: montoInicial,
    })
    if (error) return { data: null, error: error.message }
    if (!data) return { data: null, error: 'No se pudo abrir el turno de caja.' }
    const { data: guardado, error: gErr } = await supabase
      .from('caja_turnos')
      .select('*')
      .eq('id', data)
      .single()
    if (gErr) return { data: null, error: gErr.message }
    return { data: guardado as TurnoCaja, error: null }
  },
  async cerrarTurno(rid, usuarioId, montoDeclarado, observaciones) {
    const { data, error } = await supabase.rpc('cerrar_turno_caja', {
      p_restaurante_id: rid,
      p_usuario_id: usuarioId,
      p_monto_declarado: montoDeclarado,
      p_observaciones: observaciones ?? null,
    })
    if (error) return { data: null, error: mensajeOperacion(error.message, 'No se pudo cerrar la caja. Actualiza el turno e inténtalo de nuevo.') }
    if (!data) return { data: null, error: 'No se pudo cerrar el turno de caja.' }
    // La RPC devuelve la fila ya congelada (esperado/diferencia); se relee para
    // que el tipo sea el de la app y no el del cliente de Supabase.
    const { data: guardado, error: gErr } = await supabase
      .from('caja_turnos')
      .select('*')
      .eq('id', (data as TurnoCaja).id)
      .single()
    if (gErr) return { data: null, error: mensajeOperacion(gErr.message, 'El cierre se guardó, pero no se pudo mostrar el resumen. Actualiza caja para revisarlo.') }
    return { data: guardado as TurnoCaja, error: null }
  },
}

// --------------------------------------------------- mockApi / localApi
/** Dataset en memoria que alimenta a un api simulado (mismo shape de localSeed). */
type Dataset = LocalSeedData

const espera = (ms = 200) => new Promise((r) => setTimeout(r, ms))

/** Estado mutable del modo demo. Arranca VACÍO: el recorrido guiado lo llena. */
const db: Dataset = {
  zonas: [],
  mesas: [],
  categorias: [],
  productos: [],
  usuarios: [...mockUsuarios],
  pedidos: [],
  items: [],
  cuentas: [],
  cuentaPedidos: [],
  pagos: [],
  restaurantes: [mockRestaurante, mockRestauranteExtra],
  cajaTurnos: [],
  planes: [...mockPlanes],
  historialSuscripciones: [],
  auditLogs: [],
  tickets: [],
  configuracion: {
    ...CONFIGURACION_POR_DEFECTO,
    updated_at: new Date().toISOString(),
    updated_by: null,
  },
}

/**
 * Estado mutable del backend local simulado. Referencia DIRECTAMENTE los arrays
 * de localSeed (misma fuente de verdad), así los usuarios que crea el Admin se
 * comparten con el mecanismo de login local.
 */
const localDb: Dataset = {
  zonas: localSeed.zonas,
  mesas: localSeed.mesas,
  categorias: localSeed.categorias,
  productos: localSeed.productos,
  usuarios: localSeed.usuarios,
  pedidos: localSeed.pedidos,
  items: localSeed.items,
  cuentas: localSeed.cuentas,
  cuentaPedidos: localSeed.cuentaPedidos,
  pagos: localSeed.pagos,
  restaurantes: localSeed.restaurantes,
  cajaTurnos: localSeed.cajaTurnos,
  planes: localSeed.planes,
  historialSuscripciones: localSeed.historialSuscripciones,
  auditLogs: localSeed.auditLogs,
  tickets: localSeed.tickets,
  configuracion: localSeed.configuracion,
}

/** True si el producto tiene marcado `es_bebida` (se prepara en la barra). */
function esBebidaEn(ds: Dataset, rid: string, productoId: string | null): boolean {
  if (!productoId) return false
  const producto = ds.productos.find((p) => p.id === productoId && p.restaurante_id === rid)
  return producto?.es_bebida === true
}

/** Ids de pedidos que ya pertenecen a una cuenta pagada de este restaurante. */
function idsPedidosCobradosEn(ds: Dataset, rid: string): Set<string> {
  const cuentasPagadas = new Set(
    ds.cuentas.filter((c) => c.restaurante_id === rid && c.estado === 'pagada').map((c) => c.id),
  )
  return new Set(
    ds.cuentaPedidos.filter((cp) => cuentasPagadas.has(cp.cuenta_id)).map((cp) => cp.pedido_id),
  )
}

/**
 * Siguiente número de boleta del restaurante (correlativo por local). Espejo
 * local del contador `correlativos` de `cerrar_cuenta`: toma el mayor `numero`
 * ya emitido y suma 1. En SQL lo serializa el upsert; acá el cierre corre bajo
 * el lock de mesa y un solo hilo, así que el `max` es suficiente.
 */
function siguienteNumeroBoleta(ds: Dataset, rid: string): string {
  let max = 0
  for (const c of ds.cuentas) {
    if (c.restaurante_id !== rid || !c.numero) continue
    const m = /-(\d+)$/.exec(c.numero)
    if (m) max = Math.max(max, Number(m[1]))
  }
  return formatearNumeroBoleta(max + 1)
}

/**
 * Control de acceso del backend local: ESPEJO de `validar_acceso_restaurante`
 * (supabase/00_seguridad_rpcs.sql).
 *
 * Por qué está en la API y no solo en la UI: el bloqueo por suscripción vencida
 * o por usuario desactivado era un if en el ProtectedRoute, o sea una puerta que
 * solo cierra la pantalla. Quien llama a la API (otra pestaña, un script, el
 * futuro modo test) la esquivaba. Toda escritura pasa por acá, y la RPC real lo
 * vuelve a hacer en SQL: el navegador no es la frontera de confianza.
 *
 * `usuarioId` es el análogo local de `auth.uid()`: el usuario de la sesión
 * (apiMode.operadorId). Los mensajes son los mismos que lanza el SQL, para que
 * un test no vea un texto en local y otro distinto en producción.
 */
function errorDeAcceso(ds: Dataset, rid: string, usuarioId: string): string | null {
  const restaurante = ds.restaurantes.find((r) => r.id === rid)
  if (!restaurante) return 'El restaurante no existe'
  // `activo` nullable: un NULL (usuario previo al campo) cuenta como activo,
  // igual que en SQL (`coalesce(activo, true)`).
  const usuario = ds.usuarios.find((u) => u.id === usuarioId)
  if (usuario && usuario.activo !== true) return 'Usuario desactivado'
  if (restaurante.suscripcion_activa !== true) return 'Suscripción inactiva'
  // Sin fecha = plan indefinido: no se bloquea.
  if (
    restaurante.fecha_vencimiento &&
    new Date(restaurante.fecha_vencimiento).getTime() < Date.now()
  ) {
    return 'Suscripción vencida'
  }
  return null
}

/**
 * Serializa las escrituras de una mesa: el equivalente en memoria del
 * `for update` de `cerrar_cuenta` en SQL.
 *
 * Por qué hace falta aquí: el backend local es asíncrono y el dataset es
 * compartido. `cerrarCuenta` espera (`espera`) entre el chequeo "este pedido ya
 * fue cobrado" y el marcado como 'entregado', así que dos llamadas en paralelo
 *aban a leer el mismo estado, a pasar el chequeo las dos y a crear DOS cuentas
 * con el mismo total. La cadena de promesas hace que la segunda espere a que la
 * primera termine y vuelva a leer el estado ya actualizado: la que pierde ve el
 * pedido cobrado y devuelve el error de "ya fue cobrado", igual que en Postgres.
 */
const locksPorMesa = new Map<string, Promise<void>>()

function conLockClave<T>(clave: string, tarea: () => Promise<T>): Promise<T> {
  const anterior = locksPorMesa.get(clave) ?? Promise.resolve()
  // La cadena no se rompe si una tarea falla: la siguiente entra igual, como una
  // transacción abortada que libera el lock en Postgres sin romper a la cola.
  const mio = anterior.then(tarea, tarea)
  // Ambos ramos liberan la clave: si nadie se enganchó después, el mapa no
  // acumula entradas (el rechazo lo absorbe el que espera, no queda suelto).
  const liberar = () => {
    if (locksPorMesa.get(clave) === turno) locksPorMesa.delete(clave)
  }
  const turno: Promise<void> = mio.then(liberar, liberar)
  locksPorMesa.set(clave, turno)
  return mio
}

function conLockDeMesa<T>(rid: string, mesaId: string, tarea: () => Promise<T>): Promise<T> {
  return conLockClave(`${rid}:${mesaId}`, tarea)
}

/** Adquiere los locks de varias mesas en orden fijo, como los FOR UPDATE del servidor. */
function conLocksDeMesas<T>(rid: string, mesaIds: string[], tarea: () => Promise<T>): Promise<T> {
  const claves = [...new Set(mesaIds)].sort().map((id) => `${rid}:${id}`)
  const adquirir = (indice: number): Promise<T> =>
    indice >= claves.length
      ? tarea()
      : conLockClave(claves[indice], () => adquirir(indice + 1))
  return adquirir(0)
}

/**
 * Pedidos de una mesa que siguen por cobrar: ni cobrados ni anulados.
 * `entregado` cuenta como abierto (servido no es pagado).
 */
function pedidosAbiertosDeMesa(ds: Dataset, rid: string, mesaId: string): Pedido[] {
  const cobrados = idsPedidosCobradosEn(ds, rid)
  return ds.pedidos.filter(
    (p) => p.restaurante_id === rid && p.mesa_id === mesaId && p.estado !== 'anulado' && !cobrados.has(p.id),
  )
}

/** Suma cantidad × precio de los ítems VIGENTES de los pedidos indicados. */
function totalDePedidos(ds: Dataset, pedidoIds: string[]): number {
  return ds.items
    .filter((it) => pedidoIds.includes(it.pedido_id) && it.anulado !== true)
    .reduce((acc, it) => acc + it.cantidad * it.precio_unitario, 0)
}

/**
 * Mesas con dinero pendiente de cobro, ordenadas por nombre. Es el MISMO
 * criterio que `realApi.getMesasPorCobrar`: pedidos no anulados que no están en
 * una cuenta pagada y que aún tienen ítems vigentes con importe. Una mesa
 * `ocupada` con todo cobrado o anulado NO aparece.
 */
function mesasPorCobrarEn(ds: Dataset, rid: string): MesaPorCobrar[] {
  const cobrados = idsPedidosCobradosEn(ds, rid)
  const porMesa = new Map<string, { total: number; pedidos: number }>()
  for (const pedido of ds.pedidos) {
    if (pedido.restaurante_id !== rid) continue
    if (pedido.estado === 'anulado' || cobrados.has(pedido.id)) continue
    const total = totalDePedidos(ds, [pedido.id])
    if (total <= 0.004) continue
    const acumulado = porMesa.get(pedido.mesa_id) ?? { total: 0, pedidos: 0 }
    acumulado.total += total
    acumulado.pedidos += 1
    porMesa.set(pedido.mesa_id, acumulado)
  }
  return [...porMesa.entries()]
    .map(([mesa_id, valor]) => ({
      mesa_id,
      mesa_nombre: ds.mesas.find((m) => m.id === mesa_id)?.nombre ?? 'Mesa',
      total: Math.round(valor.total * 100) / 100,
      pedidos: valor.pedidos,
    }))
    .sort((a, b) => a.mesa_nombre.localeCompare(b.mesa_nombre, 'es'))
}

/**
 * ¿El restaurante tiene PIN de autorización? En el backend local vive en
 * `restaurante.pin_autorizacion` en claro (es una simulación en memoria: no hay
 * hash que proteger). La comparación de verdad es la del servidor.
 */
function pinDeRestaurante(ds: Dataset, rid: string): string | null {
  return ds.restaurantes.find((r) => r.id === rid)?.pin_autorizacion ?? null
}

/**
 * Equivalente en memoria de `public.validar_pin_autorizacion`: si el
 * restaurante tiene PIN, sin él la acción no pasa. Devuelve `null` (puede) o el
 * mensaje de error, con los MISMOS mensajes que el SQL para que el modo local
 * y Supabase no discrepen.
 */
function errorDePin(ds: Dataset, rid: string, pin: string | null | undefined): string | null {
  const configurado = pinDeRestaurante(ds, rid)
  if (!configurado) return null
  if (pin && pin === configurado) return null
  return MENSAJE_PIN_INCORRECTO
}

/**
 * Localiza el ��tem dentro de la comanda. Mismo orden y mismos mensajes que las
 * RPC `editar_item_comanda` / `anular_item_comanda` para que el modo local y
 * Supabase se comporten exactamente igual.
 */
function buscarItemComanda(
  ds: Dataset,
  rid: string,
  pedidoId: string,
  itemId: string,
): { item: PedidoItem; pedido: Pedido } | { error: string } {
  const pedido = ds.pedidos.find((p) => p.id === pedidoId && p.restaurante_id === rid)
  if (!pedido) return { error: 'La comanda no pertenece al restaurante' }
  const item = ds.items.find((it) => it.id === itemId && it.pedido_id === pedidoId)
  if (!item) return { error: 'El ítem no pertenece a esta comanda' }
  return { item, pedido }
}

/**
 * Cierre de cuenta del backend simulado (lo usan localApi y mockApi).
 *
 * Reproduce las mismas validaciones y el mismo orden que la RPC
 * `cerrar_cuenta` de Supabase, incluido el pago dividido:
 *   - `monto: 0` en una parte = "el cliente entregó exactamente lo que se le
 *     pide" (se completa con el total real, para que el papel no dependa de lo
 *     que tecleó el mesero).
 *   - `monto > 0` = entrega explícita (billete recibido), y el excedente es
 *     vuelto, que solo puede salir del efectivo.
 *
 * El cuerpo va dentro de `conLockDeMesa`, igual que en la RPC real: desde el
 * chequeo de pedidos ya cobrados hasta el `persistir()` hay estado del dataset
 * que se lee y se escribe, y si dos cierres de la misma mesa se intercalan
 * aparecería el mismo doble cobro que el `for update` evita en Postgres. El lock
 * es por mesa (no por pedido) para ser el mismo recurso que bloquea el SQL: así
 * el comportamiento local y el de producción coinciden.
 */
async function cerrarCuentaDivididaEn(
  ds: Dataset,
  rid: string,
  mesaId: string,
  pedidoIds: string[],
  pagos: readonly PagoEntrada[],
  propina: number,
  opciones?: { credenciales?: boolean; persistir?: boolean; demo?: boolean },
): Promise<Res<Cuenta>> {
  const acceso = errorDeAcceso(ds, rid, apiMode.operadorId)
  if (acceso) return { data: null, error: acceso }
  return conLockDeMesa(rid, mesaId, () =>
    cerrarCuentaDivididaConLock(ds, rid, mesaId, pedidoIds, pagos, propina, opciones),
  )
}

/** Cuerpo real del cierre de cuenta; ya se tiene el candado de la mesa. */
async function cerrarCuentaDivididaConLock(
  ds: Dataset,
  rid: string,
  mesaId: string,
  pedidoIds: string[],
  pagos: readonly PagoEntrada[],
  propina: number,
  opciones?: { credenciales?: boolean; persistir?: boolean; demo?: boolean },
): Promise<Res<Cuenta>> {
  const persiste = () => {
    if (opciones?.persistir) {
      if (opciones.demo) guardarDatosDemo()
      else guardarDatosLocal()
    }
  }
  if (pagos.length === 0) return { data: null, error: 'Agrega al menos un método de pago.' }
  if (pagos.some((p) => !esMetodoPagoValido(p.metodo_pago))) {
    return { data: null, error: 'Método de pago no válido.' }
  }
  if (pagos.some((p) => !Number.isFinite(p.monto) || p.monto < 0)) {
    return { data: null, error: 'Los montos del pago no son válidos.' }
  }
  if (!Number.isFinite(propina) || propina < 0) return { data: null, error: 'La propina no puede ser negativa.' }
  if (!ds.mesas.some((m) => m.id === mesaId && m.restaurante_id === rid)) {
    return { data: null, error: 'La mesa no pertenece al restaurante' }
  }
  const actor = ds.usuarios.find((u) => u.id === apiMode.operadorId && u.restaurante_id === rid && u.activo !== false)
  if (!actor || !['mesero', 'admin_restaurante'].includes(actor.rol)) {
    return { data: null, error: 'Sin permiso para cerrar cuentas en este restaurante' }
  }
  const mesaActual = ds.mesas.find((m) => m.id === mesaId && m.restaurante_id === rid)
  if (actor.rol === 'mesero' && mesaActual?.mesero_responsable_id && mesaActual.mesero_responsable_id !== actor.id) {
    return { data: null, error: 'Esta mesa esta asignada a otro mesero.' }
  }
  const aCobrar = pedidoIds.filter((id) =>
    ds.pedidos.some((x) => x.id === id && x.restaurante_id === rid && x.mesa_id === mesaId && x.estado !== 'anulado'),
  )
  if (aCobrar.length === 0) {
    return { data: null, error: 'Los pedidos indicados no pertenecen a esta mesa.' }
  }
  // Rechaza (no filtra en silencio) para que la boleta nunca discrepe de la cuenta guardada.
  const cobrados = idsPedidosCobradosEn(ds, rid)
  if (aCobrar.some((id) => cobrados.has(id))) {
    return { data: null, error: 'Alguno de los pedidos ya fue cobrado en otra cuenta.' }
  }

  await espera(400)
  const id = crypto.randomUUID()
  const ahora = new Date().toISOString()
  const total = totalDePedidos(ds, aCobrar)
  // Una comanda sin ítems vigentes no se cobra: evita guardar cuentas en cero.
  if (total <= 0) return { data: null, error: 'No hay pedidos por cobrar en esta mesa.' }

  // El resumen se calcula con el total REAL (el del backend), no con el que
  // tenía el navegador: si divergen, la boleta describiría una cuenta que no
  // es la que se cobró.
  const completadas = completarPartes(
    pagos.map((p) => ({ metodo: p.metodo_pago, monto: p.monto, referencia: p.referencia ?? null })),
    total + propina,
  )
  if (completadas.error) return { data: null, error: completadas.error }
  const partes: PagoParte[] = completadas.partes
  const resumen = resumirPago(total, partes, propina)
  if (!resumen.valido) return { data: null, error: resumen.error }

  const cuenta: Cuenta = {
    id,
    restaurante_id: rid,
    mesa_id: mesaId,
    total,
    metodo_pago: partes[0].metodo,
    estado: 'pagada',
    pagado_at: ahora,
    created_at: ahora,
    numero: siguienteNumeroBoleta(ds, rid),
    propina: redondear(propina),
    vuelto: resumen.vuelto,
    mesero_id_snapshot: apiMode.operadorId ?? null,
    mesero_nombre_snapshot: ds.usuarios.find((u) => u.id === apiMode.operadorId)?.nombre ?? null,
    mesa_nombre_snapshot: ds.mesas.find((m) => m.id === mesaId)?.nombre ?? null,
    restaurante_nombre_snapshot: ds.restaurantes.find((r) => r.id === rid)?.nombre ?? null,
    restaurante_direccion_snapshot: ds.restaurantes.find((r) => r.id === rid)?.direccion ?? null,
    restaurante_ruc_snapshot: ds.restaurantes.find((r) => r.id === rid)?.ruc ?? null,
    restaurante_telefono_snapshot: ds.restaurantes.find((r) => r.id === rid)?.telefono ?? null,
  }
  ds.cuentas.push(cuenta)
  // El detalle del pago dividido se guarda parte por parte: el arqueo de caja
  // necesita saber cuánta plata fue en efectivo, no solo "cuál fue el primer
  // método".
  for (const p of partes) {
    ds.pagos.push({
      id: crypto.randomUUID(),
      cuenta_id: id,
      restaurante_id: rid,
      metodo_pago: p.metodo,
      monto: redondear(p.monto),
      referencia: p.referencia ?? null,
      created_at: ahora,
    })
  }
  for (const pid of aCobrar) {
    ds.cuentaPedidos.push({
      id: crypto.randomUUID(),
      cuenta_id: id,
      pedido_id: pid,
      subtotal: totalDePedidos(ds, [pid]),
    })
    const pedido = ds.pedidos.find((x) => x.id === pid)
    if (pedido) {
      pedido.estado = 'entregado'
      pedido.updated_at = ahora
    }
  }
  const mesa = ds.mesas.find((m) => m.id === mesaId)
  if (mesa) {
    mesa.estado = 'libre'
    mesa.mesero_responsable_id = null
  }
  persiste()
  // Se devuelve la cuenta guardada: la boleta sale del mismo dato que la caja.
  return { data: cuenta, error: null }
}

/**
 * Crea un DataApi que lee/escribe sobre un dataset en memoria.
 * `opciones.credenciales` registra la clave de prueba al crear/editar/eliminar
 * personal (solo backend local). `opciones.persistir` vuelca el dataset tras
 * cada escritura: al backend local (localStorage + credenciales) o al demo
 * (`demo: true`, solo el dataset), para que el demo no pierda los cambios al
 * recargar. El backend demo se reinicia con `reiniciarDemoDatos()`.
 */
function crearApiDesde(
  ds: Dataset,
  opciones?: { credenciales?: boolean; persistir?: boolean; demo?: boolean },
): DataApi {
  const persiste = () => {
    if (!opciones?.persistir) return
    if (opciones.demo) guardarDatosDemo()
    else guardarDatosLocal()
  }
  // Control de rol local que replica a soy_super_admin() de las RPC: con un
  // operador identificado que NO es super admin, la gestión global de usuarios
  // se niega. Sin operador (suite de verificación / SSR) se permite, igual que
  // el resto de las APIs locales.
  const denialSuperAdmin = (mensaje: string): string | null => {
    if (!apiMode.operadorId) return null
    const operador = ds.usuarios.find((u) => u.id === apiMode.operadorId)
    if (operador && operador.rol !== 'super_admin') return mensaje
    return null
  }
  // Replica local de registrar_auditoria() de la BD: las altas importantes dejan
  // fila en `audit_logs` (append-only). El actor es el operador identificado.
  const registrarAuditoria = (
    accion: string,
    opciones: {
      restauranteId?: string | null
      entidad?: string | null
      entidadId?: string | null
      descripcion?: string
      detalle?: Record<string, unknown> | null
    } = {},
  ): void => {
    const operador = apiMode.operadorId
      ? (ds.usuarios.find((u) => u.id === apiMode.operadorId) ?? null)
      : null
    const restauranteId = opciones.restauranteId ?? null
    ds.auditLogs.unshift({
      id: crypto.randomUUID(),
      actor_id: operador?.id ?? null,
      actor_rol: operador?.rol ?? null,
      actor_nombre: operador?.nombre ?? null,
      restaurante_id: restauranteId,
      restaurante_nombre: restauranteId
        ? (ds.restaurantes.find((r) => r.id === restauranteId)?.nombre ?? null)
        : null,
      entidad: opciones.entidad ?? null,
      entidad_id: opciones.entidadId ?? null,
      accion,
      descripcion: opciones.descripcion ?? null,
      detalle: opciones.detalle ?? null,
      created_at: new Date().toISOString(),
    })
  }
  const aPlataforma = (u: Usuario): UsuarioPlataforma => ({
    id: u.id,
    nombre: u.nombre,
    email: u.email,
    activo: u.activo,
    rol: u.rol,
    restaurante_id: u.restaurante_id,
    created_at: u.created_at,
  })
  return {
  async getZonas(rid) {
    await espera()
    return { data: ds.zonas.filter((z) => z.restaurante_id === rid), error: null }
  },
  async getMesas(rid) {
    await espera()
    return { data: ds.mesas.filter((m) => m.restaurante_id === rid), error: null }
  },
  async getMesasPorCobrar(rid) {
    const acceso = errorDeAcceso(ds, rid, apiMode.operadorId)
    if (acceso) return { data: null, error: acceso }
    await espera()
    return { data: mesasPorCobrarEn(ds, rid), error: null }
  },
  async getCategorias(rid) {
    await espera()
    return { data: ds.categorias.filter((c) => c.restaurante_id === rid), error: null }
  },
  async getProductos(rid, opciones) {
    await espera()
    const productos = ds.productos.filter((p) => p.restaurante_id === rid)
    return {
      data: opciones?.incluirAgotados ? productos : productos.filter((p) => p.disponible),
      error: null,
    }
  },
  async getMeseros(rid) {
    await espera()
    return {
      data: ds.usuarios
        .filter((u) => u.restaurante_id === rid && u.rol === 'mesero' && u.activo !== false)
        .map(({ id, nombre, activo, rol }) => ({ id, nombre, activo, rol })),
      error: null,
    }
  },
  async asignarMesaMesero(rid, mesaId, meseroId, pin, motivo) {
    const acceso = errorDeAcceso(ds, rid, apiMode.operadorId)
    if (acceso) return { data: null, error: acceso }
    const motivoLimpio = motivo.trim()
    if (motivoLimpio.length < 5 || motivoLimpio.length > 300) {
      return { data: null, error: 'Escribe un motivo de entre 5 y 300 caracteres.' }
    }
    return conLockDeMesa(rid, mesaId, async () => {
    await espera(250)
    const actor = ds.usuarios.find((u) => u.id === apiMode.operadorId && u.restaurante_id === rid && u.activo !== false)
    if (!actor || !['mesero', 'admin_restaurante'].includes(actor.rol)) {
      return { data: null, error: 'Solo el mesero responsable o el administrador puede pasar esta mesa.' }
    }
    const mesa = ds.mesas.find((m) => m.id === mesaId && m.restaurante_id === rid)
    if (!mesa || mesa.estado !== 'ocupada') return { data: null, error: 'La mesa no está ocupada.' }
    const destino = ds.usuarios.find((u) => u.id === meseroId && u.restaurante_id === rid && u.rol === 'mesero' && u.activo !== false)
    if (!destino) return { data: null, error: 'El mesero elegido no está activo en este restaurante.' }
    if (destino.id === mesa.mesero_responsable_id) return { data: null, error: 'Esa persona ya es responsable de la mesa.' }
    const pedidosAbiertos = pedidosAbiertosDeMesa(ds, rid, mesaId).filter((p) => totalDePedidos(ds, [p.id]) > 0.004)
    if (pedidosAbiertos.length === 0) return { data: null, error: 'La mesa no tiene consumo pendiente para transferir.' }
    if (actor.rol === 'mesero') {
      if (mesa.mesero_responsable_id && mesa.mesero_responsable_id !== actor.id) {
        return { data: null, error: 'Esta mesa está asignada a otro mesero.' }
      }
      if (!mesa.mesero_responsable_id && pedidosAbiertos.some((p) => p.mesero_id !== actor.id)) {
        return { data: null, error: 'Solo el administrador puede asignar esta mesa porque tiene comandas de otro mesero.' }
      }
    }
    const errorPin = errorDePin(ds, rid, pin)
    if (errorPin) return { data: null, error: errorPin }
    const responsableAnterior = ds.usuarios.find((u) => u.id === mesa.mesero_responsable_id)
    mesa.mesero_responsable_id = destino.id
    registrarAuditoria('mesa_transferir_responsable', {
      restauranteId: rid,
      entidad: 'mesa',
      entidadId: mesa.id,
      descripcion: `Responsabilidad de ${mesa.nombre} transferida${responsableAnterior ? ` de ${responsableAnterior.nombre}` : ''} a ${destino.nombre}.`,
      detalle: {
        mesa_id: mesa.id,
        mesa_nombre: mesa.nombre,
        mesero_anterior_id: responsableAnterior?.id ?? null,
        mesero_anterior_nombre: responsableAnterior?.nombre ?? null,
        mesero_nuevo_id: destino.id,
        mesero_nuevo_nombre: destino.nombre,
        motivo: motivoLimpio,
      },
    })
    persiste()
    return { data: null, error: null }
    })
  },
  async moverConsumoMesa(rid, origenId, destinoId, pin, motivo) {
    const acceso = errorDeAcceso(ds, rid, apiMode.operadorId)
    if (acceso) return { data: null, error: acceso }
    if (origenId === destinoId) return { data: null, error: 'Elige una mesa distinta.' }
    const motivoLimpio = motivo.trim()
    if (motivoLimpio.length < 5 || motivoLimpio.length > 300) {
      return { data: null, error: 'Escribe un motivo de entre 5 y 300 caracteres.' }
    }
    return conLocksDeMesas(rid, [origenId, destinoId], async () => {
      await espera(300)
      const actor = ds.usuarios.find((u) => u.id === apiMode.operadorId && u.restaurante_id === rid && u.activo !== false)
      if (!actor || !['mesero', 'admin_restaurante'].includes(actor.rol)) {
        return { data: null, error: 'Solo el mesero responsable o el administrador puede mover este consumo.' }
      }
      const errorPin = errorDePin(ds, rid, pin)
      if (errorPin) return { data: null, error: errorPin }
      const origen = ds.mesas.find((m) => m.id === origenId && m.restaurante_id === rid)
      const destino = ds.mesas.find((m) => m.id === destinoId && m.restaurante_id === rid)
      if (!origen || !destino) return { data: null, error: 'Una de las mesas no pertenece al restaurante.' }
      if (origen.estado !== 'ocupada') return { data: null, error: 'La mesa de origen ya no está ocupada.' }
      if (destino.estado !== 'libre' || pedidosAbiertosDeMesa(ds, rid, destinoId).some((p) => totalDePedidos(ds, [p.id]) > 0.004)) {
        return { data: null, error: 'La mesa de destino debe estar libre y sin consumo pendiente.' }
      }
      const pedidos = pedidosAbiertosDeMesa(ds, rid, origenId).filter((p) => totalDePedidos(ds, [p.id]) > 0.004)
      if (pedidos.length === 0) return { data: null, error: 'La mesa no tiene consumo pendiente para mover.' }
      if (actor.rol === 'mesero') {
        if (origen.mesero_responsable_id && origen.mesero_responsable_id !== actor.id) {
          return { data: null, error: 'Esta mesa está asignada a otro mesero.' }
        }
        if (!origen.mesero_responsable_id && pedidos.some((p) => p.mesero_id !== actor.id)) {
          return { data: null, error: 'Solo el administrador puede mover esta mesa porque tiene comandas de otro mesero.' }
        }
      }
      const ahora = new Date().toISOString()
      for (const pedido of pedidos) {
        pedido.mesa_id = destinoId
        pedido.updated_at = ahora
      }
      const responsable = origen.mesero_responsable_id ?? (actor.rol === 'mesero' ? actor.id : pedidos[0]?.mesero_id ?? null)
      origen.estado = 'libre'
      origen.mesero_responsable_id = null
      destino.estado = 'ocupada'
      destino.mesero_responsable_id = responsable
      const responsableNombre = ds.usuarios.find((u) => u.id === responsable)?.nombre ?? null
      registrarAuditoria('mesa_mover_consumo', {
        restauranteId: rid,
        entidad: 'mesa',
        entidadId: origen.id,
        descripcion: `Consumo movido de ${origen.nombre} a ${destino.nombre}.`,
        detalle: {
          mesa_origen_id: origen.id,
          mesa_origen_nombre: origen.nombre,
          mesa_destino_id: destino.id,
          mesa_destino_nombre: destino.nombre,
          mesero_responsable_id: responsable,
          mesero_responsable_nombre: responsableNombre,
          motivo: motivoLimpio,
          pedidos_movidos: pedidos.length,
        },
      })
      persiste()
      return { data: null, error: null }
    })
  },
  async getPersonal(rid) {
    await espera()
    return {
      data: ds.usuarios.filter((u) => u.restaurante_id === rid && esRolPersonal(u.rol)),
      error: null,
    }
  },
  async getPedidosDeMesa(rid, mesaId) {
    await espera()
    return { data: pedidosAbiertosDeMesa(ds, rid, mesaId).sort((a, b) => a.created_at.localeCompare(b.created_at)), error: null }
  },
  async getPedidoItems(ids) {
    await espera()
    // Incluye los anulados (con su marca): el mesero debe ver qué anuló.
    return { data: ds.items.filter((it) => ids.includes(it.pedido_id)), error: null }
  },
  async getPedidosActivos(rid) {
    await espera()
    const activos = ds.pedidos
      .filter((p) => p.restaurante_id === rid && p.estado !== 'entregado' && p.estado !== 'anulado')
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
    const conItems = activos
      .map((p) => {
        const suyos = ds.items
          .filter((it) => it.pedido_id === p.id)
          .map((it) => {
            const es_bebida = it.es_bebida ?? esBebidaEn(ds, rid, it.producto_id)
            return {
              ...it,
              es_bebida,
              estacion: it.estacion ?? estacionDeProducto({ estacion: it.estacion, es_bebida }),
            }
          })
        return {
          ...p,
          items: suyos.filter((it) => it.anulado !== true),
          anulados: suyos.filter((it) => it.anulado === true),
        }
      })
      .filter((p) => p.items.length > 0)
    return { data: conItems, error: null }
  },
  async registrarImpresionComanda(rid, pedidoId, estacion, solicitudId, motivo) {
    const acceso = errorDeAcceso(ds, rid, apiMode.operadorId)
    if (acceso) return { data: null, error: acceso }
    await espera(80)
    const actor = ds.usuarios.find((u) => u.id === apiMode.operadorId && u.restaurante_id === rid && u.activo !== false)
    if (!actor || !['admin_restaurante', 'mesero', 'cocina'].includes(actor.rol)) {
      return { data: null, error: 'Tu perfil no tiene permiso para imprimir comandas.' }
    }
    const pedido = ds.pedidos.find((p) => p.id === pedidoId && p.restaurante_id === rid)
    if (!pedido) return { data: null, error: 'No se encontró la comanda de este restaurante.' }
    if (pedido.estado === 'anulado') return { data: null, error: 'La comanda está anulada y no se puede imprimir.' }

    const itemsVigentes = ds.items.filter((it) => it.pedido_id === pedidoId && it.anulado !== true)
    const tieneEstacion = itemsVigentes.some((it) => {
      const fallback = it.es_bebida ?? esBebidaEn(ds, rid, it.producto_id)
      return (it.estacion ?? estacionDeProducto({ estacion: it.estacion, es_bebida: fallback })) === estacion
    })
    if (!tieneEstacion) return { data: null, error: 'Esta comanda no tiene productos pendientes para esa estación.' }

    const solicitudExistente = ds.auditLogs.find((l) => l.detalle?.solicitud_id === solicitudId)
    if (solicitudExistente) {
      if (solicitudExistente.actor_id === actor.id && solicitudExistente.restaurante_id === rid && solicitudExistente.entidad_id === pedidoId && solicitudExistente.detalle?.estacion === estacion) {
        return {
          data: { estado: 'registrada', accion: solicitudExistente.accion as 'comanda_imprimir' | 'comanda_reimprimir' },
          error: null,
        }
      }
      return { data: null, error: 'La solicitud de impresión ya se usó para otra comanda.' }
    }

    const anteriores = ds.auditLogs.filter((l) =>
      l.restaurante_id === rid && l.entidad === 'pedido' && l.entidad_id === pedidoId &&
      ['comanda_imprimir', 'comanda_reimprimir'].includes(l.accion) && l.detalle?.estacion === estacion,
    )
    const motivoLimpio = motivo?.trim() ?? ''
    if (anteriores.length > 0 && !motivoLimpio) {
      return { data: { estado: 'requiere_motivo' }, error: null }
    }
    if (anteriores.length > 0 && (motivoLimpio.length < 5 || motivoLimpio.length > 300)) {
      return { data: null, error: 'Escribe un motivo de reimpresión de entre 5 y 300 caracteres.' }
    }

    const mesa = ds.mesas.find((m) => m.id === pedido.mesa_id && m.restaurante_id === rid)
    const accion = anteriores.length > 0 ? 'comanda_reimprimir' : 'comanda_imprimir'
    registrarAuditoria(accion, {
      restauranteId: rid,
      entidad: 'pedido',
      entidadId: pedidoId,
      descripcion: `${accion === 'comanda_reimprimir' ? 'Comanda reimpresa' : 'Comanda enviada a impresión'} en ${estacion}, mesa ${mesa?.nombre ?? 'sin mesa'}.`,
      detalle: {
        solicitud_id: solicitudId,
        pedido_id: pedidoId,
        mesa_id: pedido.mesa_id,
        mesa_nombre: mesa?.nombre ?? null,
        estacion,
        motivo: accion === 'comanda_reimprimir' ? motivoLimpio : null,
      },
    })
    persiste()
    return { data: { estado: 'registrada', accion }, error: null }
  },
  async crearPedido(rid, mesaId, items) {
    const acceso = errorDeAcceso(ds, rid, apiMode.operadorId)
    if (acceso) return { data: null, error: acceso }
    return conLockDeMesa(rid, mesaId, async () => {
    await espera(350)
    const mesaActual = ds.mesas.find((m) => m.id === mesaId && m.restaurante_id === rid)
    if (!mesaActual) {
      return { data: null, error: 'La mesa no pertenece al restaurante' }
    }
    const actor = ds.usuarios.find((u) => u.id === apiMode.operadorId && u.restaurante_id === rid && u.activo !== false)
    if (!actor || !['mesero', 'admin_restaurante'].includes(actor.rol)) {
      return { data: null, error: 'Sin permiso para crear pedidos en este restaurante' }
    }
    if (actor.rol === 'mesero' && mesaActual.mesero_responsable_id && mesaActual.mesero_responsable_id !== actor.id) {
      return { data: null, error: 'Esta mesa está asignada a otro mesero.' }
    }
    const pedidosPrevios = pedidosAbiertosDeMesa(ds, rid, mesaId).filter((p) => totalDePedidos(ds, [p.id]) > 0.004)
    if (actor.rol === 'mesero' && !mesaActual.mesero_responsable_id && pedidosPrevios.some((p) => p.mesero_id !== actor.id)) {
      return { data: null, error: 'Esta mesa tiene comandas de otro mesero. Pide al administrador que asigne la mesa.' }
    }
    if (items.length === 0) return { data: null, error: 'El pedido no tiene ítems' }
    const id = crypto.randomUUID()
    const ahora = new Date().toISOString()
    ds.pedidos.push({
      id,
      restaurante_id: rid,
      mesa_id: mesaId,
      mesero_id: actor.id,
      estado: 'pendiente',
      observacion: null,
      created_at: ahora,
      updated_at: ahora,
    })
    for (const it of items) {
      const producto = ds.productos.find((p) => p.id === it.producto_id && p.restaurante_id === rid)
      const es_bebida = producto?.es_bebida ?? false
      ds.items.push({
        id: crypto.randomUUID(),
        pedido_id: id,
        producto_id: it.producto_id,
        nombre_producto: it.nombre_producto,
        cantidad: it.cantidad,
        precio_unitario: it.precio_unitario,
        nota: it.nota ?? null,
        anulado: false,
        es_bebida,
        estacion: producto ? estacionDeProducto(producto) : estacionDeProducto({ es_bebida }),
        created_at: ahora,
      })
    }
    const mesa = ds.mesas.find((m) => m.id === mesaId)
    if (mesa) {
      mesa.estado = 'ocupada'
      if (actor.rol === 'mesero' && !mesa.mesero_responsable_id) mesa.mesero_responsable_id = actor.id
    }
    persiste()
    return { data: id, error: null }
    })
  },
  async editarItem(rid, pedidoId, itemId, cambios) {
    const acceso = errorDeAcceso(ds, rid, apiMode.operadorId)
    if (acceso) return { data: null, error: acceso }
    await espera(250)
    // Mismas validaciones, en el mismo orden y con los mismos mensajes que la
    // RPC `editar_item_comanda` de Supabase.
    const cantidad = Number(cambios.cantidad)
    if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > 99) {
      return { data: null, error: 'La cantidad debe ser un número entre 1 y 99' }
    }
    const r = buscarItemComanda(ds, rid, pedidoId, itemId)
    if ('error' in r) return { data: null, error: r.error }
    const { item, pedido } = r
    const actor = ds.usuarios.find((u) => u.id === apiMode.operadorId)
    const mesa = ds.mesas.find((m) => m.id === pedido.mesa_id && m.restaurante_id === rid)
    if (actor?.rol === 'mesero' && ((mesa?.mesero_responsable_id && mesa.mesero_responsable_id !== actor.id) || (!mesa?.mesero_responsable_id && pedido.mesero_id !== actor.id))) {
      return { data: null, error: 'Esta mesa está asignada a otro mesero.' }
    }
    if (item.anulado === true) return { data: null, error: 'El ítem está anulado' }
    if (pedido.estado === 'anulado') return { data: null, error: 'La comanda está anulada' }
    if (idsPedidosCobradosEn(ds, rid).has(pedidoId)) {
      return { data: null, error: 'La comanda ya fue cobrada' }
    }
    item.cantidad = cantidad
    item.nota = cambios.nota?.trim() || null
    pedido.updated_at = new Date().toISOString()
    persiste()
    return { data: null, error: null }
  },
  async anularItem(rid, pedidoId, itemId, pin = null) {
    const acceso = errorDeAcceso(ds, rid, apiMode.operadorId)
    if (acceso) return { data: null, error: acceso }
    await espera(250)
    const r = buscarItemComanda(ds, rid, pedidoId, itemId)
    if ('error' in r) return { data: null, error: r.error }
    const { item, pedido } = r
    const actor = ds.usuarios.find((u) => u.id === apiMode.operadorId)
    const mesaActual = ds.mesas.find((m) => m.id === pedido.mesa_id && m.restaurante_id === rid)
    if (actor?.rol === 'mesero' && ((mesaActual?.mesero_responsable_id && mesaActual.mesero_responsable_id !== actor.id) || (!mesaActual?.mesero_responsable_id && pedido.mesero_id !== actor.id))) {
      return { data: null, error: 'Esta mesa está asignada a otro mesero.' }
    }
    // Idempotente: anular dos veces el mismo ítem no es un error.
    if (item.anulado === true) return { data: null, error: null }
    if (pedido.estado === 'anulado') return { data: null, error: 'La comanda está anulada' }
    if (idsPedidosCobradosEn(ds, rid).has(pedidoId)) {
      return { data: null, error: 'La comanda ya fue cobrada' }
    }
    // Autorización del Admin (ver validar_pin_autorizacion). Va después de los
    // chequeos de la comanda, igual que en el SQL: primero "no puedes", después
    // "falta el PIN".
    const errorPin = errorDePin(ds, rid, pin)
    if (errorPin) return { data: null, error: errorPin }

    const ahora = new Date().toISOString()
    item.anulado = true
    item.anulado_por = apiMode.operadorId
    item.anulado_at = ahora
    pedido.updated_at = ahora
    registrarAuditoria('comanda_item_anular', {
      restauranteId: rid,
      entidad: 'pedido_item',
      entidadId: item.id,
      descripcion: '\u00cdtem \u00ab' + item.nombre_producto + '\u00bb anulado en ' + (mesaActual?.nombre ?? 'una mesa') + '.',
      detalle: {
        pedido_id: pedido.id,
        mesa_id: pedido.mesa_id,
        mesa_nombre: mesaActual?.nombre ?? null,
        producto: item.nombre_producto,
        cantidad: item.cantidad,
        precio_unitario: item.precio_unitario,
      },
    })

    // Si era el último ítem vigente, la comanda deja de existir para cocina y caja.
    if (!ds.items.some((it) => it.pedido_id === pedidoId && it.anulado !== true)) {
      pedido.estado = 'anulado'
    }
    // Si la mesa se quedó sin comandas por cobrar, vuelve a estar libre.
    if (pedidosAbiertosDeMesa(ds, rid, pedido.mesa_id).length === 0) {
      const mesa = ds.mesas.find((m) => m.id === pedido.mesa_id && m.restaurante_id === rid)
      if (mesa) mesa.estado = 'libre'
      if (mesa) mesa.mesero_responsable_id = null
    }
    persiste()
    return { data: null, error: null }
  },
  async avanzarPedido(rid, pedidoId) {
    await espera(250)
    const p = ds.pedidos.find((x) => x.id === pedidoId && x.restaurante_id === rid)
    if (!p) return { data: null, error: 'Pedido no encontrado' }
    if (p.estado === 'anulado') return { data: null, error: 'La comanda está anulada' }
    const siguiente = siguienteEstado(p.estado)
    if (siguiente === p.estado) return { data: null, error: 'La comanda ya no tiene estados pendientes' }
    p.estado = siguiente
    p.updated_at = new Date().toISOString()
    persiste()
    return { data: null, error: null }
  },
  async cerrarCuenta(rid, mesaId, pedidoIds, metodo) {
    return cerrarCuentaDivididaEn(ds, rid, mesaId, pedidoIds, [{ metodo_pago: metodo, monto: 0 }], 0, opciones)
  },
  async cerrarCuentaDividida(rid, mesaId, pedidoIds, pagos, propina = 0) {
    return cerrarCuentaDivididaEn(ds, rid, mesaId, pedidoIds, pagos, propina, opciones)
  },
  async anularCuenta(rid, cuentaId, motivo, pin = null) {
    const acceso = errorDeAcceso(ds, rid, apiMode.operadorId)
    if (acceso) return { data: null, error: acceso }
    await espera(250)
    const cuenta = ds.cuentas.find((c) => c.id === cuentaId && c.restaurante_id === rid)
    if (!cuenta) return { data: null, error: 'La cuenta no pertenece al restaurante' }
    const errorMotivo = errorAlAnularCobro(motivo)
    if (errorMotivo) return { data: null, error: errorMotivo }
    // Autorización antes de tocar nada, igual que en el SQL.
    const errorPin = errorDePin(ds, rid, pin)
    if (errorPin) return { data: null, error: errorPin }
    if (cuenta.estado === 'anulada') return { data: null, error: 'Esta boleta ya fue anulada' }
    if (cuenta.estado !== 'pagada') return { data: null, error: 'Solo se puede anular una cuenta cobrada' }

    // Lo que se devuelve al cliente es el total MÁS la propina (también se
    // cobró). Por cómo arma los pagos `cerrarCuentaDivididaEn`, la suma de las
    // partes es `total + propina + vuelto`, así que no hace falta sumarlas: con
    // eso sale bien en cualquier caso y también en las cuentas viejas, que no
    // tienen detalle de pagos. Lo que sí mira el arqueo es la parte en efectivo.
    cuenta.estado = 'anulada'
    cuenta.anulada_at = new Date().toISOString()
    cuenta.anulada_por = apiMode.operadorId
    cuenta.motivo_anulacion = motivo.trim()
    cuenta.monto_reembolsado = redondear(cuenta.total + (cuenta.propina ?? 0))
    registrarAuditoria('cuenta_anular', {
      restauranteId: rid,
      entidad: 'cuenta',
      entidadId: cuenta.id,
      descripcion: `Boleta ${cuenta.numero ?? cuenta.id} anulada; se registró la devolución.`,
      detalle: {
        numero: cuenta.numero ?? null,
        total: cuenta.total,
        propina: cuenta.propina ?? 0,
        reembolso: cuenta.monto_reembolsado,
        motivo: cuenta.motivo_anulacion,
      },
    })
    persiste()
    return { data: cuenta, error: null }
  },
  async tienePinAutorizacion(rid) {
    await espera(150)
    return { data: Boolean(pinDeRestaurante(ds, rid)), error: null }
  },
  async configurarPinAutorizacion(rid, pin) {
    const acceso = errorDeAcceso(ds, rid, apiMode.operadorId)
    if (acceso) return { data: null, error: acceso }
    await espera(250)
    const restaurante = ds.restaurantes.find((r) => r.id === rid)
    if (!restaurante) return { data: null, error: 'El restaurante no existe' }
    if (!/^[0-9]{4,6}$/.test(pin)) return { data: null, error: 'El PIN debe tener entre 4 y 6 dígitos.' }
    restaurante.pin_autorizacion = pin
    persiste()
    return { data: null, error: null }
  },
  async quitarPinAutorizacion(rid) {
    const acceso = errorDeAcceso(ds, rid, apiMode.operadorId)
    if (acceso) return { data: null, error: acceso }
    await espera(250)
    const restaurante = ds.restaurantes.find((r) => r.id === rid)
    if (!restaurante) return { data: null, error: 'El restaurante no existe' }
    restaurante.pin_autorizacion = null
    persiste()
    return { data: null, error: null }
  },
  async liberarMesa(rid, mesaId) {
    return conLockDeMesa(rid, mesaId, async () => {
      await espera(200)
      const mesa = ds.mesas.find((m) => m.id === mesaId && m.restaurante_id === rid)
      if (mesa) {
        mesa.estado = 'libre'
        mesa.mesero_responsable_id = null
      }
      persiste()
      return { data: null, error: null }
    })
  },
  async getMetricasAdmin(rid) {
    await espera(250)
    const cuentas = ds.cuentas.filter((c) => c.restaurante_id === rid)
    const cuentaIds = cuentas.filter((c) => c.estado === 'pagada').map((c) => c.id)
    const pedidoIds = ds.cuentaPedidos.filter((cp) => cuentaIds.includes(cp.cuenta_id)).map((cp) => cp.pedido_id)
    const pedidos = ds.pedidos.filter((p) => pedidoIds.includes(p.id))
    // Un ítem anulado no es venta: no entra al top de productos ni al subtotal del mesero.
    const items = ds.items.filter((it) => pedidoIds.includes(it.pedido_id) && it.anulado !== true)
    const pagos = ds.pagos.filter((p) => cuentaIds.includes(p.cuenta_id))
    return { data: computeMetricas(cuentas, pedidos, items, ds.usuarios, pagos), error: null }
  },
  async getReporteVentas(rid, rango) {
    await espera(180)
    const desde = Date.parse(rango.desde)
    const hasta = Date.parse(rango.hasta)
    const cuentasRango = ds.cuentas.filter((c) => {
      if (c.restaurante_id !== rid || !['pagada', 'anulada'].includes(c.estado)) return false
      const fecha = Date.parse(c.estado === 'anulada' ? (c.anulada_at ?? c.pagado_at ?? c.created_at) : (c.pagado_at ?? c.created_at))
      return fecha >= desde && fecha < hasta && (rango.estado === 'todas' || c.estado === rango.estado)
    })
    const vinculos = ds.cuentaPedidos
    const detalles = cuentasRango.map((cuenta) => {
      const pedidos = vinculos.filter((cp) => cp.cuenta_id === cuenta.id).flatMap((cp) => {
        const pedido = ds.pedidos.find((p) => p.id === cp.pedido_id)
        if (!pedido) return []
        const mesa = ds.mesas.find((m) => m.id === pedido.mesa_id)
        const mesero = ds.usuarios.find((u) => u.id === pedido.mesero_id)
        const items = ds.items.filter((i) => i.pedido_id === pedido.id)
        return [{ pedido, mesa, mesero, items }]
      })
      const nombres = [...new Set(pedidos.map((p) => p.mesa?.nombre).filter(Boolean))].join(', ') || 'Sin mesa'
      const meseros = [...new Set(pedidos.map((p) => p.mesero?.nombre).filter(Boolean))].join(', ') || '—'
      const texto = [cuenta.numero, nombres, meseros, ...pedidos.flatMap((p) => p.items.map((i) => i.nombre_producto))].join(' ').toLocaleLowerCase()
      return { cuenta, pedidos, nombres, meseros, texto }
    })
    const coincidencias = detalles.filter((x) => !rango.busqueda || x.texto.includes(rango.busqueda.toLocaleLowerCase()))
    const validos = detalles.filter((d) => d.cuenta.estado === 'pagada')
    const articulos = validos.flatMap((d) => d.pedidos.flatMap((p) => p.items.filter((i) => !i.anulado).map((item) => ({
      ...item,
      bebida: item.es_bebida ?? esBebidaEn(ds, rid, item.producto_id),
      meseroId: p.pedido.mesero_id,
      mesero: p.mesero?.nombre ?? '—',
      mesaId: p.pedido.mesa_id,
      mesa: p.mesa?.nombre ?? '—',
      pedidoId: p.pedido.id,
      fecha: p.pedido.created_at,
      cuentaId: d.cuenta.id,
    }))))
    const productos = new Map<string, ReporteVentas['productos'][number]>()
    for (const i of articulos) {
      const key = `${i.nombre_producto}|${i.bebida}`
      const x = productos.get(key) ?? { nombre: i.nombre_producto, es_bebida: i.bebida, cantidad: 0, total: 0 }
      x.cantidad += i.cantidad
      x.total += i.cantidad * i.precio_unitario
      productos.set(key, x)
    }
    const mapaMeseros = new Map<string, ReporteVentas['meseros'][number]>()
    const mapaMesas = new Map<string, ReporteVentas['mesas'][number]>()
    for (const i of articulos) {
      const mesero = mapaMeseros.get(i.meseroId) ?? { id: i.meseroId, nombre: i.mesero, pedidos: 0, unidades: 0, ventas: 0 }
      mesero.unidades += i.cantidad
      mesero.ventas += i.cantidad * i.precio_unitario
      mapaMeseros.set(i.meseroId, mesero)
      const mesa = mapaMesas.get(i.mesaId) ?? { id: i.mesaId, nombre: i.mesa, cuentas: 0, ventas: 0 }
      mesa.ventas += i.cantidad * i.precio_unitario
      mapaMesas.set(i.mesaId, mesa)
    }
    const meseros = [...mapaMeseros.values()]
    for (const m of meseros) m.pedidos = new Set(articulos.filter((i) => i.meseroId === m.id).map((i) => i.pedidoId)).size
    const mesas = [...mapaMesas.values()]
    for (const m of mesas) m.cuentas = new Set(articulos.filter((i) => i.mesaId === m.id).map((i) => i.cuentaId)).size
    const cuentas = coincidencias.map(({ cuenta: c, pedidos, nombres, meseros: nombresMeseros }) => ({
      id: c.id, numero: c.numero ?? null, estado: c.estado as 'pagada' | 'anulada', total: c.total,
      propina: c.propina ?? null, vuelto: c.vuelto ?? null, metodo_pago: c.metodo_pago,
      pagado_at: c.pagado_at, anulada_at: c.anulada_at ?? null, motivo_anulacion: c.motivo_anulacion ?? null,
      monto_reembolsado: c.monto_reembolsado ?? null, created_at: c.created_at, mesas: nombres, meseros: nombresMeseros,
      pagos: ds.pagos.filter((p) => p.cuenta_id === c.id).map((p) => ({ metodo_pago: p.metodo_pago, monto: p.monto })),
      pedidos: pedidos.map(({ pedido, mesa, mesero, items }) => ({ pedido_id: pedido.id, created_at: pedido.created_at,
        mesa: mesa?.nombre ?? '—', mesero: mesero?.nombre ?? '—', items: items.map((i) => ({ nombre: i.nombre_producto,
          cantidad: i.cantidad, precio_unitario: i.precio_unitario, total: i.cantidad * i.precio_unitario,
          es_bebida: i.es_bebida ?? esBebidaEn(ds, rid, i.producto_id), anulado: i.anulado === true, nota: i.nota ?? null })) })),
    })).sort((a, b) => Date.parse(b.pagado_at ?? b.anulada_at ?? b.created_at) - Date.parse(a.pagado_at ?? a.anulada_at ?? a.created_at))
      .slice(rango.offset, rango.offset + rango.limite)
    const porDia = new Map<string, { fecha: string; ventas: number; cuentas: number }>()
    const porHora = new Map<string, { hora: string; ventas: number; cuentas: number }>()
    const porMetodo = new Map<string, { metodo_pago: string; ventas: number; cuentas: number }>()
    const partesFecha = (valor: string) => Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date(valor)).map((p) => [p.type, p.value]))
    for (const cuenta of cuentasRango.filter((c) => c.estado === 'pagada' && c.pagado_at)) {
      const fecha = partesFecha(cuenta.pagado_at as string)
      const dia = `${fecha.year}-${fecha.month}-${fecha.day}`
      const hora = `${fecha.hour}:00`
      const filaDia = porDia.get(dia) ?? { fecha: dia, ventas: 0, cuentas: 0 }
      filaDia.ventas += cuenta.total; filaDia.cuentas++; porDia.set(dia, filaDia)
      const filaHora = porHora.get(hora) ?? { hora, ventas: 0, cuentas: 0 }
      filaHora.ventas += cuenta.total; filaHora.cuentas++; porHora.set(hora, filaHora)
      const partes = ds.pagos.filter((p) => p.cuenta_id === cuenta.id)
      const sumaPagos = partes.reduce((s, p) => s + p.monto, 0)
      const asignacion = partes.length && sumaPagos > 0
        ? partes.map((p) => ({ metodo: p.metodo_pago, total: cuenta.total * p.monto / sumaPagos }))
        : [{ metodo: cuenta.metodo_pago, total: cuenta.total }]
      const porCuentaMetodo = new Map<string, number>()
      for (const p of asignacion) porCuentaMetodo.set(p.metodo, (porCuentaMetodo.get(p.metodo) ?? 0) + p.total)
      for (const [metodo, total] of porCuentaMetodo) {
        const fila = porMetodo.get(metodo) ?? { metodo_pago: metodo, ventas: 0, cuentas: 0 }
        fila.ventas += total; fila.cuentas++; porMetodo.set(metodo, fila)
      }
    }
    return { data: {
      resumen: { ventas: cuentasRango.filter((c) => c.estado === 'pagada').reduce((s, c) => s + c.total, 0),
        cuentas_pagadas: cuentasRango.filter((c) => c.estado === 'pagada').length,
        cuentas_anuladas: cuentasRango.filter((c) => c.estado === 'anulada').length,
        reembolsos: cuentasRango.filter((c) => c.estado === 'anulada').reduce((s, c) => s + (c.monto_reembolsado ?? 0), 0),
        neto: cuentasRango.filter((c) => c.estado === 'pagada').reduce((s, c) => s + c.total, 0)
          - cuentasRango.filter((c) => c.estado === 'anulada').reduce((s, c) => s + (c.monto_reembolsado ?? 0), 0),
        propinas: cuentasRango.filter((c) => c.estado === 'pagada').reduce((s, c) => s + (c.propina ?? 0), 0),
        ticket_promedio: cuentasRango.filter((c) => c.estado === 'pagada').length ? cuentasRango.filter((c) => c.estado === 'pagada').reduce((s, c) => s + c.total, 0) / cuentasRango.filter((c) => c.estado === 'pagada').length : 0 },
      productos: [...productos.values()].sort((a, b) => b.total - a.total),
      meseros: meseros.sort((a, b) => b.ventas - a.ventas), mesas: mesas.sort((a, b) => b.ventas - a.ventas),
      ventas_por_dia: [...porDia.values()].sort((a, b) => a.fecha.localeCompare(b.fecha)),
      ventas_por_hora: [...porHora.values()].sort((a, b) => a.hora.localeCompare(b.hora)),
      ventas_por_metodo: [...porMetodo.values()].sort((a, b) => b.ventas - a.ventas),
      cuentas, total_cuentas: coincidencias.length,
    }, error: null }
  },
  async getCuentasPagadas(rid) {
    await espera(250)
    const cuentas = ds.cuentas.filter(
      (c) => c.restaurante_id === rid && c.estado === 'pagada' && c.pagado_at,
    )
    return {
      data: [...cuentas].sort((a, b) => String(a.pagado_at).localeCompare(String(b.pagado_at))),
      error: null,
    }
  },
  async getCuentasDelDia(rid) {
    await espera(250)
    const inicioDia = (() => {
      const d = new Date()
      return new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString()
    })()
    return {
      data: ds.cuentas
        .filter((c) => c.restaurante_id === rid && c.estado !== 'pendiente' && c.pagado_at)
        .filter((c) => String(c.pagado_at) >= inicioDia)
        .sort((a, b) => String(b.pagado_at).localeCompare(String(a.pagado_at))),
      error: null,
    }
  },
  async getCuentasFiltradas(_rid, filtros) {
    await espera(150)
    const actor = apiMode.operadorId ? ds.usuarios.find((u) => u.id === apiMode.operadorId) : null
    if (!actor || actor.activo === false || !['admin_restaurante', 'cajero'].includes(actor.rol) || !actor.restaurante_id) {
      return { data: null, error: 'Solo el administrador o el cajero activo puede consultar los cobros.' }
    }
    const restauranteId = actor.restaurante_id
    const termino = filtros.busqueda.trim().toLocaleLowerCase()
    const coincidencias = ds.cuentas.filter((c) => {
      if (c.restaurante_id !== restauranteId || !c.pagado_at || !['pagada', 'anulada'].includes(c.estado)) return false
      const fecha = new Date(c.pagado_at).getTime()
      if (fecha < new Date(filtros.desde).getTime() || fecha >= new Date(filtros.hasta).getTime()) return false
      if (filtros.estado !== 'todas' && c.estado !== filtros.estado) return false
      if (filtros.metodo !== 'todos') {
        const pagos = ds.pagos.filter((p) => p.cuenta_id === c.id)
        const metodos = pagos.length ? pagos.map((p) => p.metodo_pago) : [c.metodo_pago]
        if (!metodos.includes(filtros.metodo)) return false
      }
      if (!termino) return true
      const mesa = c.mesa_nombre_snapshot ?? ds.mesas.find((m) => m.id === c.mesa_id)?.nombre ?? ''
      const mesero = c.mesero_nombre_snapshot ?? ''
      return [c.numero ?? '', mesa, mesero].some((x) => x.toLocaleLowerCase().includes(termino))
        || String(c.total).includes(termino.replace(',', '.'))
    }).sort((a, b) => String(b.pagado_at).localeCompare(String(a.pagado_at)))
    return { data: { items: coincidencias.slice(filtros.offset, filtros.offset + filtros.limite), total: coincidencias.length }, error: null }
  },
  async getBoletaReimpresion(rid, cuentaId, pin = null) {
    const acceso = errorDeAcceso(ds, rid, apiMode.operadorId)
    if (acceso) return { data: null, error: acceso }
    await espera(250)
    const actor = ds.usuarios.find((u) => u.id === apiMode.operadorId && u.restaurante_id === rid && u.activo !== false)
    if (!actor || !['admin_restaurante', 'cajero'].includes(actor.rol)) {
      return { data: null, error: 'Solo el administrador o el cajero pueden reimprimir boletas.' }
    }
    if (actor.rol === 'cajero') {
      if (!pinDeRestaurante(ds, rid)) {
        return { data: null, error: 'El administrador debe configurar un PIN de autorización antes de permitir reimpresiones desde caja.' }
      }
      const errorPin = errorDePin(ds, rid, pin)
      if (errorPin) return { data: null, error: errorPin }
    }
    const cuenta = ds.cuentas.find((c) => c.id === cuentaId && c.restaurante_id === rid)
    if (!cuenta || cuenta.estado !== 'pagada') return { data: null, error: 'Solo se puede reimprimir una boleta pagada.' }
    const pedidosIds = ds.cuentaPedidos.filter((cp) => cp.cuenta_id === cuenta.id).map((cp) => cp.pedido_id)
    const items = ds.items
      .filter((it) => pedidosIds.includes(it.pedido_id) && it.anulado !== true)
      .map((it) => ({ ...it, es_bebida: esBebidaEn(ds, rid, it.producto_id) }))
    if (items.length === 0) return { data: null, error: 'La boleta no tiene ítems disponibles para reimprimir.' }
    const restaurante = ds.restaurantes.find((r) => r.id === rid)
    const mesa = ds.mesas.find((m) => m.id === cuenta.mesa_id && m.restaurante_id === rid)
    const mesero = cuenta.mesero_id_snapshot
      ? ds.usuarios.find((u) => u.id === cuenta.mesero_id_snapshot)?.nombre
      : ds.usuarios.find((u) => u.id === ds.pedidos.find((p) => pedidosIds.includes(p.id))?.mesero_id)?.nombre ?? null
    return {
      data: {
        cuenta,
        restauranteNombre: cuenta.restaurante_nombre_snapshot ?? restaurante?.nombre ?? 'Restaurante',
        direccion: cuenta.restaurante_direccion_snapshot ?? restaurante?.direccion ?? null,
        ruc: cuenta.restaurante_ruc_snapshot ?? restaurante?.ruc ?? null,
        telefono: cuenta.restaurante_telefono_snapshot ?? restaurante?.telefono ?? null,
        mesaNombre: cuenta.mesa_nombre_snapshot ?? mesa?.nombre ?? 'Mesa',
        meseroNombre: cuenta.mesero_nombre_snapshot ?? mesero ?? '—',
        items,
      },
      error: null,
    }
  },
  async getPagosDeCuentas(rid) {
    await espera(250)
    return { data: ds.pagos.filter((p) => p.restaurante_id === rid), error: null }
  },
  async getRestaurantes() {
    await espera()
    return { data: [...ds.restaurantes], error: null }
  },
  async getAdministradores() {
    await espera()
    return {
      data: ds.usuarios
        .filter((u) => u.rol === 'admin_restaurante')
        .map((u) => ({
          id: u.id,
          nombre: u.nombre,
          email: u.email,
          activo: u.activo,
          rol: u.rol,
          restaurante_id: u.restaurante_id,
        })),
      error: null,
    }
  },
  async getUsuariosPlataforma() {
    await espera()
    return {
      data: [...ds.usuarios]
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .map((u) => ({
          id: u.id,
          nombre: u.nombre,
          email: u.email,
          activo: u.activo,
          rol: u.rol,
          restaurante_id: u.restaurante_id,
          created_at: u.created_at,
        })),
      error: null,
    }
  },
  async getUltimosAccesos() {
    await espera()
    // No hay Auth local: nadie "ingresa" desde este backend, así que el mapa
    // queda vacío y la UI muestra «Nunca ingresó».
    return { data: {} as UltimosAccesos, error: null }
  },
  async adminCambiarEstadoUsuario(usuarioId, activo) {
    const denegado = denialSuperAdmin('Solo el super administrador puede gestionar usuarios.')
    if (denegado) return { data: null, error: denegado }
    await espera()
    const u = ds.usuarios.find((x) => x.id === usuarioId)
    if (!u) return { data: null, error: 'Usuario no encontrado.' }
    if (!activo && apiMode.operadorId === usuarioId) {
      return { data: null, error: 'No puedes desactivar tu propia cuenta.' }
    }
    if (!activo && u.rol === 'super_admin') {
      const otroActivo = ds.usuarios.some(
        (x) => x.rol === 'super_admin' && x.activo !== false && x.id !== usuarioId
      )
      if (!otroActivo) return { data: null, error: 'Debe quedar al menos un super administrador activo.' }
    }
    u.activo = activo
    registrarAuditoria('usuario_estado', {
      restauranteId: u.restaurante_id,
      entidad: 'usuario',
      entidadId: u.id,
      descripcion: `${activo ? 'Activó' : 'Desactivó'} al usuario ${u.nombre}`,
      detalle: { activo },
    })
    persiste()
    return { data: aPlataforma(u), error: null }
  },
  async adminDesignarAdministrador(restauranteId, usuarioId) {
    const denegado = denialSuperAdmin('Solo el super administrador puede designar administradores.')
    if (denegado) return { data: null, error: denegado }
    await espera()
    if (!ds.restaurantes.some((r) => r.id === restauranteId)) {
      return { data: null, error: 'Restaurante no encontrado.' }
    }
    const u = ds.usuarios.find((x) => x.id === usuarioId)
    if (!u) return { data: null, error: 'Usuario no encontrado.' }
    if ((u.restaurante_id ?? null) !== restauranteId) {
      return { data: null, error: 'El usuario no pertenece a este restaurante.' }
    }
    if (u.activo === false) {
      return {
        data: null,
        error: 'El usuario está desactivado: actívalo antes de designarlo administrador.',
      }
    }
    // Solo cambia el rol: el vínculo usuario → restaurante queda intacto.
    const rolAnterior = u.rol
    if (u.rol !== 'admin_restaurante') u.rol = 'admin_restaurante'
    if (u.rol !== rolAnterior) {
      registrarAuditoria('usuario_cambiar_rol', {
        restauranteId,
        entidad: 'usuario',
        entidadId: u.id,
        descripcion: `Designó a ${u.nombre} como administrador`,
        detalle: { rol_anterior: rolAnterior, rol_nuevo: u.rol },
      })
    }
    persiste()
    return { data: aPlataforma(u), error: null }
  },
  async crearUsuarioPlataforma(datos) {
    const denegado = denialSuperAdmin('Solo el super administrador puede dar de alta usuarios.')
    if (denegado) return { data: null, error: denegado }
    await espera()
    const nombre = datos.nombre.trim()
    if (!nombre) return { data: null, error: 'El nombre del usuario es obligatorio.' }
    const email = datos.email.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { data: null, error: 'Ingresa un correo válido.' }
    if (datos.password.length < 8) {
      return { data: null, error: 'La contraseña inicial debe tener al menos 8 caracteres.' }
    }
    if ((datos.rol as string) === 'super_admin') {
      return { data: null, error: 'No se puede crear un super administrador desde el panel.' }
    }
    if (!esRolPersonal(datos.rol)) return { data: null, error: 'Rol no permitido.' }
    if (!datos.restauranteId.trim()) {
      return { data: null, error: 'Elegí el restaurante al que pertenece el usuario.' }
    }
    if (!ds.restaurantes.some((r) => r.id === datos.restauranteId)) {
      return { data: null, error: 'Restaurante no encontrado.' }
    }
    if (ds.usuarios.some((x) => x.email?.toLowerCase() === email)) {
      return { data: null, error: 'Ya existe una cuenta con ese correo.' }
    }
    const usuario: Usuario = {
      id: crypto.randomUUID(),
      restaurante_id: datos.restauranteId,
      rol: datos.rol,
      nombre,
      email,
      activo: true,
      created_at: new Date().toISOString(),
    }
    ds.usuarios.push(usuario)
    // Misma "cuenta" que crearPersonal: la clave queda registrada para el
    // login local (solo si el backend de prueba pidió credenciales).
    if (opciones?.credenciales) localCredenciales[email] = await hashCredencialLocal(datos.password)
    registrarAuditoria(datos.rol === 'admin_restaurante' ? 'administrador_crear' : 'usuario_crear', {
      restauranteId: datos.restauranteId,
      entidad: 'usuario',
      entidadId: usuario.id,
      descripcion:
        datos.rol === 'admin_restaurante'
          ? `Dio de alta al administrador ${nombre}`
          : `Dio de alta al usuario ${nombre}`,
      detalle: { email },
    })
    persiste()
    return { data: aPlataforma(usuario), error: null }
  },
  async getEstadisticasGlobales(desde, hasta) {
    const denegado = denialSuperAdmin('Solo el super administrador puede ver las estadísticas globales.')
    if (denegado) return { data: null, error: denegado }
    await espera()
    // Misma fórmula que la RPC `admin_estadisticas_globales` (ver estadisticas.ts):
    // el modo local agrega en memoria lo que en producción agrega la base.
    return { data: calcularEstadisticasGlobales(ds, desde, hasta), error: null }
  },
  // ---------------------------------------------------- Auditoría (mock)
  async getAuditoria() {
    const denegado = denialSuperAdmin('Solo el super administrador puede ver la auditoría.')
    if (denegado) return { data: null, error: denegado }
    await espera()
    return { data: ds.auditLogs.map((l) => ({ ...l })), error: null }
  },
  async getAuditoriaRestaurante(filtros) {
    await espera(120)
    const admin = apiMode.operadorId ? ds.usuarios.find((u) => u.id === apiMode.operadorId) : null
    if (!admin || admin.rol !== 'admin_restaurante' || admin.activo === false || !admin.restaurante_id) {
      return { data: null, error: 'Solo un administrador activo puede consultar la auditoría de su restaurante.' }
    }
    const termino = filtros.busqueda.trim().toLocaleLowerCase()
    const coincideCategoria = (l: AuditLog) => {
      if (filtros.categoria === 'todas') return true
      if (filtros.categoria === 'usuarios') return l.entidad === 'usuario'
      if (filtros.categoria === 'mesas') return l.entidad === 'mesa' || l.accion.startsWith('mesa_')
      if (filtros.categoria === 'caja') return l.entidad === 'caja_turno' || l.accion.startsWith('caja_')
      if (filtros.categoria === 'cuentas') return l.entidad === 'cuenta' || l.accion.startsWith('cuenta_')
      if (filtros.categoria === 'pedidos') return ['pedido', 'pedido_item'].includes(l.entidad ?? '') || l.accion.startsWith('comanda_')
      return ['restaurante', 'configuracion'].includes(l.entidad ?? '') || l.accion.startsWith('configuracion_')
    }
    const coincidencias = ds.auditLogs.filter((l) => {
      if (l.restaurante_id !== admin.restaurante_id) return false
      if (filtros.desde && l.created_at < filtros.desde) return false
      if (filtros.hasta && l.created_at >= filtros.hasta) return false
      if (!coincideCategoria(l)) return false
      if (!termino) return true
      return [l.actor_nombre, l.actor_rol, l.entidad, l.entidad_id, l.accion, l.descripcion, JSON.stringify(l.detalle ?? {})]
        .some((x) => String(x ?? '').toLocaleLowerCase().includes(termino))
    }).sort((a, b) => b.created_at.localeCompare(a.created_at))
    return { data: { items: coincidencias.slice(filtros.offset, filtros.offset + filtros.limite), total: coincidencias.length }, error: null }
  },
  // ------------------------------------------------------ Soporte (mock)
  async getTickets() {
    await espera()
    const operador = apiMode.operadorId
      ? (ds.usuarios.find((u) => u.id === apiMode.operadorId) ?? null)
      : null
    const ordenados = [...ds.tickets]
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((t) => ({ ...t }))
    if (!operador) return { data: ordenados, error: null }
    if (operador.rol === 'super_admin') return { data: ordenados, error: null }
    if (operador.rol === 'admin_restaurante') {
      return { data: ordenados.filter((t) => t.restaurante_id === operador.restaurante_id), error: null }
    }
    return { data: null, error: 'Solo el administrador del restaurante puede ver el soporte.' }
  },
  async crearTicket(datos) {
    await espera()
    const asunto = datos.asunto.trim()
    if (!asunto) return { data: null, error: 'El asunto del ticket es obligatorio.' }
    const descripcion = datos.descripcion.trim()
    if (!descripcion) return { data: null, error: 'La descripción del ticket es obligatoria.' }
    if (!PRIORIDADES_TICKET.includes(datos.prioridad)) {
      return { data: null, error: 'Prioridad de ticket no válida.' }
    }
    if (!TIPOS_TICKET.includes(datos.tipo ?? 'error')) return { data: null, error: 'Tipo de ticket no válido.' }
    const operador = apiMode.operadorId
      ? (ds.usuarios.find((u) => u.id === apiMode.operadorId) ?? null)
      : null
    // El ticket lo reporta el admin del restaurante para SU local: el
    // restaurante y el usuario salen del operador, no del formulario.
    let restauranteId = datos.restauranteId ?? null
    let usuarioId = datos.usuarioId ?? null
    if (operador) {
      if (operador.rol === 'super_admin') {
        return { data: null, error: 'Solo el administrador del restaurante puede reportar incidencias.' }
      }
      if (operador.rol !== 'admin_restaurante') {
        return { data: null, error: 'Solo el administrador del restaurante puede reportar incidencias.' }
      }
      restauranteId = operador.restaurante_id
      usuarioId = operador.id
    }
    if (restauranteId && !ds.restaurantes.some((r) => r.id === restauranteId)) {
      return { data: null, error: 'Restaurante no encontrado.' }
    }
    const ahora = new Date().toISOString()
    const ticket: SoporteTicket = {
      id: crypto.randomUUID(),
      codigo: `TK-${Math.random().toString(16).slice(2, 8).toUpperCase()}`,
      restaurante_id: restauranteId,
      usuario_id: usuarioId,
      responsable_id: null,
      asunto,
      descripcion,
      tipo: datos.tipo ?? 'error',
      prioridad: datos.prioridad,
      estado: 'abierto',
      responsable: operador ? null : datos.responsable?.trim() || null,
      created_at: ahora,
      updated_at: ahora,
      resuelto_at: null,
    }
    ds.tickets.push(ticket)
    persiste()
    return { data: { ...ticket }, error: null }
  },
  async actualizarTicket(ticketId, cambios) {
    await espera()
    const operador = apiMode.operadorId
      ? (ds.usuarios.find((u) => u.id === apiMode.operadorId) ?? null)
      : null
    if (operador && operador.rol !== 'super_admin') {
      return { data: null, error: 'Solo el super administrador puede gestionar los tickets.' }
    }
    const t = ds.tickets.find((x) => x.id === ticketId)
    if (!t) return { data: null, error: 'Ticket no encontrado.' }
    if (cambios.estado !== undefined) {
      if (!ESTADOS_TICKET.includes(cambios.estado)) return { data: null, error: 'Estado de ticket no válido.' }
      t.estado = cambios.estado
      if (cambios.estado === 'resuelto' && t.resuelto_at === null) {
        t.resuelto_at = new Date().toISOString()
      }
    }
    if (cambios.prioridad !== undefined) {
      if (!PRIORIDADES_TICKET.includes(cambios.prioridad)) {
        return { data: null, error: 'Prioridad de ticket no válida.' }
      }
      t.prioridad = cambios.prioridad
    }
    if (cambios.responsable !== undefined) t.responsable = cambios.responsable?.trim() || null
    t.updated_at = new Date().toISOString()
    persiste()
    return { data: { ...t }, error: null }
  },
  async getBandejaComercial() {
    await espera()
    const operador = apiMode.operadorId ? ds.usuarios.find((u) => u.id === apiMode.operadorId) : null
    if (operador?.rol !== 'super_admin') return { data: null, error: 'Solo el superadministrador puede ver consultas comerciales.' }
    return { data: { resumen: { hoy: 0, ultimos_30_dias: 0, nuevas: 0, correo_pendiente: 0, correo_fallido: 0, contactos_vencidos: 0 }, consultas: [] }, error: null }
  },
  async getMensajesSoporte() {
    await espera()
    return { data: [], error: null }
  },
  async enviarMensajeSoporte() {
    return { data: null, error: 'Los mensajes de soporte requieren una cuenta real.' }
  },
  async actualizarConsultaComercial() {
    return { data: null, error: 'Las consultas comerciales solo existen en el servidor real.' }
  },
  async actualizarSeguimientoComercial() {
    return { data: null, error: 'Las consultas comerciales solo existen en el servidor real.' }
  },
  // ------------------------------------------------- Notificaciones (mock)
  async getAlertas() {
    const denegado = denialSuperAdmin('Solo el super administrador puede ver las alertas.')
    if (denegado) return { data: null, error: denegado }
    await espera()
    return { data: calcularAlertas(ds), error: null }
  },
  // -------------------------------------------------- Configuración (mock)
  async getConfiguracionGlobal() {
    const denegado = denialSuperAdmin('Solo el super administrador puede ver la configuración.')
    if (denegado) return { data: null, error: denegado }
    await espera()
    return { data: { ...ds.configuracion }, error: null }
  },
  async actualizarConfiguracionGlobal(datos) {
    const denegado = denialSuperAdmin('Solo el super administrador puede editar la configuración.')
    if (denegado) return { data: null, error: denegado }
    await espera()
    const errorValidacion = validarConfiguracionGlobal(datos)
    if (errorValidacion) return { data: null, error: errorValidacion }
    const normalizado = normalizarConfiguracionGlobal(datos)
    const campos: string[] = []
    if (ds.configuracion.nombre_app !== normalizado.nombre_app) campos.push('nombre_app')
    if ((ds.configuracion.correo_soporte ?? null) !== normalizado.correo_soporte) campos.push('correo_soporte')
    if ((ds.configuracion.telefono_soporte ?? null) !== normalizado.telefono_soporte) campos.push('telefono_soporte')
    if ((ds.configuracion.logo_url ?? null) !== normalizado.logo_url) campos.push('logo_url')
    if ((ds.configuracion.informacion ?? null) !== normalizado.informacion) campos.push('informacion')
    if (ds.configuracion.precio_plan_mensual !== normalizado.precio_plan_mensual) campos.push('precio_plan_mensual')
    // Mutación en el mismo objeto compartido (localDb === localSeed): si se
    // reemplazara la referencia, localSeed quedaría con una config desfasada.
    Object.assign(ds.configuracion, {
      ...normalizado,
      updated_at: new Date().toISOString(),
      updated_by: apiMode.operadorId ?? null,
    })
    if (campos.length > 0) {
      registrarAuditoria('configuracion_actualizar', {
        entidad: 'configuracion',
        descripcion: 'Actualizó la configuración global de Mesora',
        detalle: { campos },
      })
    }
    persiste()
    return { data: { ...ds.configuracion }, error: null }
  },
  async crearRestauranteConAdmin(datos) {
    // Backend local: no hay Auth, así que la "cuenta" es el perfil + la clave
    // registrada en localCredenciales (mismo mecanismo que crearPersonal).
    await espera()
    const nombre = datos.nombre.trim()
    if (!nombre) return { data: null, error: 'El nombre del restaurante es obligatorio.' }
    const adminNombre = datos.admin.nombre.trim()
    if (!adminNombre) return { data: null, error: 'El nombre del administrador es obligatorio.' }
    const email = datos.admin.email.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { data: null, error: 'Ingresa un correo válido para el administrador.' }
    }
    if (datos.admin.password.length < 8) {
      return { data: null, error: 'La contraseña inicial debe tener al menos 8 caracteres.' }
    }
    if (ds.usuarios.some((u) => u.email?.toLowerCase() === email)) {
      return { data: null, error: 'Ya existe una cuenta con ese correo.' }
    }
    const restaurante: Restaurante = {
      id: crypto.randomUUID(),
      nombre,
      ruc: datos.ruc?.trim() || null,
      direccion: datos.direccion?.trim() || null,
      telefono: datos.telefono?.trim() || null,
      email_contacto: datos.email_contacto?.trim() || null,
      suscripcion_activa: datos.suscripcion_activa,
      fecha_vencimiento: datos.fecha_vencimiento || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      // Mismos defaults que la BD: plan único Mesora Pro e inicio del periodo al alta.
      plan_id: ds.planes.find((p) => p.clave === 'mesora_pro')?.id ?? null,
      fecha_inicio: new Date().toISOString(),
      created_at: new Date().toISOString(),
    }
    ds.restaurantes.push(restaurante)
    const adminId = crypto.randomUUID()
    ds.usuarios.push({
      id: adminId,
      restaurante_id: restaurante.id,
      rol: 'admin_restaurante',
      nombre: adminNombre,
      email,
      activo: true,
      created_at: new Date().toISOString(),
    })
    if (opciones?.credenciales && datos.admin.password) {
      localCredenciales[email] = await hashCredencialLocal(datos.admin.password)
    }
    registrarAuditoria('restaurante_crear', {
      restauranteId: restaurante.id,
      entidad: 'restaurante',
      entidadId: restaurante.id,
      descripcion: `Creó el restaurante «${nombre}»`,
      detalle: { nombre },
    })
    registrarAuditoria('administrador_crear', {
      restauranteId: restaurante.id,
      entidad: 'usuario',
      entidadId: adminId,
      descripcion: `Creó el administrador «${adminNombre}»`,
      detalle: { email },
    })
    persiste()
    return { data: { ...restaurante }, error: null }
  },
  async actualizarRestaurante(rid, cambios) {
    await espera()
    const r = ds.restaurantes.find((x) => x.id === rid)
    if (!r) return { data: null, error: 'Restaurante no encontrado' }
    const preparados = prepararDatosLocal(cambios)
    if (preparados.error || !preparados.data) return { data: null, error: preparados.error }
    Object.assign(r, preparados.data)
    persiste()
    return { data: { ...r }, error: null }
  },
  async adminActualizarRestaurante(rid, datos) {
    await espera()
    const r = ds.restaurantes.find((x) => x.id === rid)
    if (!r) return { data: null, error: 'Restaurante no encontrado' }
    const nombre = datos.nombre.trim()
    if (!nombre) return { data: null, error: 'El nombre del restaurante no puede quedar vacío' }
    const previos = {
      nombre: r.nombre,
      ruc: r.ruc ?? null,
      direccion: r.direccion ?? null,
      telefono: r.telefono ?? null,
      email_contacto: r.email_contacto ?? null,
    }
    r.nombre = nombre
    r.ruc = datos.ruc?.trim() || null
    r.direccion = datos.direccion?.trim() || null
    r.telefono = datos.telefono?.trim() || null
    r.email_contacto = datos.email_contacto?.trim() || null
    const campos: string[] = []
    if (r.nombre !== previos.nombre) campos.push('nombre')
    if ((r.ruc ?? null) !== previos.ruc) campos.push('ruc')
    if ((r.direccion ?? null) !== previos.direccion) campos.push('direccion')
    if ((r.telefono ?? null) !== previos.telefono) campos.push('telefono')
    if ((r.email_contacto ?? null) !== previos.email_contacto) campos.push('email_contacto')
    if (campos.length > 0) {
      registrarAuditoria('restaurante_editar', {
        restauranteId: rid,
        entidad: 'restaurante',
        entidadId: rid,
        descripcion: `Editó el restaurante «${r.nombre}»`,
        detalle: { campos },
      })
    }
    persiste()
    return { data: { ...r }, error: null }
  },
  async adminCambiarSuscripcion(rid, activa, fechaVencimiento) {
    await espera()
    const r = ds.restaurantes.find((x) => x.id === rid)
    if (!r) return { data: null, error: 'Restaurante no encontrado' }
    const prevActiva = r.suscripcion_activa
    const prevFecha = r.fecha_vencimiento
    r.suscripcion_activa = activa
    r.fecha_vencimiento = fechaVencimiento || null
    // Mismo criterio que admin_cambiar_suscripcion en la BD: un cambio real
    // (estado o fecha) deja fila en el historial append-only.
    if (prevActiva !== r.suscripcion_activa || prevFecha !== r.fecha_vencimiento) {
      const accion = prevActiva && !r.suscripcion_activa
        ? 'suspension'
        : !prevActiva && r.suscripcion_activa
          ? 'reactivacion'
          : 'ajuste'
      ds.historialSuscripciones.push({
        id: crypto.randomUUID(),
        restaurante_id: rid,
        accion,
        plan_id: r.plan_id ?? null,
        plan_anterior_id: r.plan_id ?? null,
        fecha_inicio: r.fecha_inicio ?? null,
        fecha_vencimiento: r.fecha_vencimiento,
        suscripcion_activa: r.suscripcion_activa,
        motivo: accion === 'ajuste' ? 'Ajuste de vencimiento desde la ficha del restaurante' : null,
        creado_por: null,
        created_at: new Date().toISOString(),
      })
      registrarAuditoria(
        accion === 'suspension' ? 'suscripcion_suspender'
          : accion === 'reactivacion' ? 'suscripcion_reactivar'
          : 'suscripcion_ajuste',
        {
          restauranteId: rid,
          entidad: 'suscripcion',
          entidadId: rid,
          descripcion: accion === 'suspension' ? `Suspendió la suscripción de «${r.nombre}»`
            : accion === 'reactivacion' ? `Reactivó la suscripción de «${r.nombre}»`
            : `Ajustó la suscripción de «${r.nombre}»`,
          detalle: { suscripcion_activa: r.suscripcion_activa },
        },
      )
    }
    persiste()
    return { data: { ...r }, error: null }
  },
  // ------------------------------------------------------- Suscripciones (mock)
  async getPlanes() {
    await espera()
    return { data: [...ds.planes].sort((a, b) => a.orden - b.orden), error: null }
  },
  async getHistorialSuscripciones(rid) {
    await espera()
    return {
      data: ds.historialSuscripciones
        .filter((h) => h.restaurante_id === rid)
        .sort((a, b) => b.created_at.localeCompare(a.created_at)),
      error: null,
    }
  },
  async suscripcionesRenovar(rid, fechaVencimiento, creadoPor) {
    await espera()
    const r = ds.restaurantes.find((x) => x.id === rid)
    if (!r) return { data: null, error: 'Restaurante no encontrado' }
    if (!fechaVencimiento) return { data: null, error: 'Debe indicar la nueva fecha de vencimiento.' }
    const ahora = Date.now()
    // El estado PREVIO decide si arranca un periodo nuevo (misma regla que la
    // RPC de la BD): sin fecha, vencido o apagado → fecha_inicio = ahora.
    const previoTerminado =
      !r.fecha_vencimiento ||
      !r.suscripcion_activa ||
      new Date(r.fecha_vencimiento).getTime() < ahora
    r.suscripcion_activa = true
    r.fecha_vencimiento = fechaVencimiento
    if (previoTerminado) r.fecha_inicio = new Date(ahora).toISOString()
    ds.historialSuscripciones.push({
      id: crypto.randomUUID(),
      restaurante_id: rid,
      accion: 'renovacion',
      plan_id: r.plan_id ?? null,
      plan_anterior_id: r.plan_id ?? null,
      fecha_inicio: r.fecha_inicio ?? null,
      fecha_vencimiento: r.fecha_vencimiento,
      suscripcion_activa: r.suscripcion_activa,
      motivo: null,
      creado_por: creadoPor ?? null,
      created_at: new Date().toISOString(),
    })
    registrarAuditoria('suscripcion_renovar', {
      restauranteId: rid,
      entidad: 'suscripcion',
      entidadId: rid,
      descripcion: `Renovó la suscripción de «${r.nombre}»`,
      detalle: { fecha_vencimiento: r.fecha_vencimiento },
    })
    persiste()
    return { data: { ...r }, error: null }
  },
  async suscripcionesCambiarPlan(rid, planId, creadoPor) {
    await espera()
    const r = ds.restaurantes.find((x) => x.id === rid)
    if (!r) return { data: null, error: 'Restaurante no encontrado' }
    const plan = ds.planes.find((p) => p.id === planId && p.activo)
    if (!plan) return { data: null, error: 'Plan no encontrado.' }
    const anterior = r.plan_id ?? null
    r.plan_id = plan.id
    ds.historialSuscripciones.push({
      id: crypto.randomUUID(),
      restaurante_id: rid,
      accion: 'cambio_plan',
      plan_id: r.plan_id ?? null,
      plan_anterior_id: anterior,
      fecha_inicio: r.fecha_inicio ?? null,
      fecha_vencimiento: r.fecha_vencimiento,
      suscripcion_activa: r.suscripcion_activa,
      motivo: null,
      creado_por: creadoPor ?? null,
      created_at: new Date().toISOString(),
    })
    registrarAuditoria('suscripcion_cambiar_plan', {
      restauranteId: rid,
      entidad: 'suscripcion',
      entidadId: rid,
      descripcion: `Cambió el plan de «${r.nombre}»`,
      detalle: { plan_id: plan.id, plan_anterior_id: anterior },
    })
    persiste()
    return { data: { ...r }, error: null }
  },
  async suscripcionesSuspender(rid, motivo, creadoPor) {
    await espera()
    const r = ds.restaurantes.find((x) => x.id === rid)
    if (!r) return { data: null, error: 'Restaurante no encontrado' }
    r.suscripcion_activa = false
    ds.historialSuscripciones.push({
      id: crypto.randomUUID(),
      restaurante_id: rid,
      accion: 'suspension',
      plan_id: r.plan_id ?? null,
      plan_anterior_id: r.plan_id ?? null,
      fecha_inicio: r.fecha_inicio ?? null,
      fecha_vencimiento: r.fecha_vencimiento,
      suscripcion_activa: r.suscripcion_activa,
      motivo: motivo?.trim() || null,
      creado_por: creadoPor ?? null,
      created_at: new Date().toISOString(),
    })
    registrarAuditoria('suscripcion_suspender', {
      restauranteId: rid,
      entidad: 'suscripcion',
      entidadId: rid,
      descripcion: `Suspendió la suscripción de «${r.nombre}»`,
      detalle: { motivo: motivo?.trim() || null },
    })
    persiste()
    return { data: { ...r }, error: null }
  },
  async suscripcionesReactivar(rid, fechaVencimiento, creadoPor) {
    await espera()
    const r = ds.restaurantes.find((x) => x.id === rid)
    if (!r) return { data: null, error: 'Restaurante no encontrado' }
    // La suspensión pausa el acceso pero no reinicia el periodo.
    r.suscripcion_activa = true
    r.fecha_vencimiento = fechaVencimiento || r.fecha_vencimiento || null
    ds.historialSuscripciones.push({
      id: crypto.randomUUID(),
      restaurante_id: rid,
      accion: 'reactivacion',
      plan_id: r.plan_id ?? null,
      plan_anterior_id: r.plan_id ?? null,
      fecha_inicio: r.fecha_inicio ?? null,
      fecha_vencimiento: r.fecha_vencimiento,
      suscripcion_activa: r.suscripcion_activa,
      motivo: null,
      creado_por: creadoPor ?? null,
      created_at: new Date().toISOString(),
    })
    registrarAuditoria('suscripcion_reactivar', {
      restauranteId: rid,
      entidad: 'suscripcion',
      entidadId: rid,
      descripcion: `Reactivó la suscripción de «${r.nombre}»`,
      detalle: { fecha_vencimiento: r.fecha_vencimiento },
    })
    persiste()
    return { data: { ...r }, error: null }
  },
  // ------------------------------------------------------------ Gestión (mock)
  async crearZona(rid, nombre) {
    await espera()
    const zona: Zona = {
      id: crypto.randomUUID(),
      restaurante_id: rid,
      nombre: nombre.trim(),
      created_at: new Date().toISOString(),
    }
    ds.zonas.push(zona)
    persiste()
    return { data: zona, error: null }
  },
  async actualizarZona(rid, id, nombre) {
    await espera()
    const zona = ds.zonas.find((z) => z.id === id && z.restaurante_id === rid)
    if (!zona) return { data: null, error: 'Zona no encontrada' }
    zona.nombre = nombre.trim()
    persiste()
    return { data: zona, error: null }
  },
  async eliminarZona(rid, id) {
    await espera()
    const idx = ds.zonas.findIndex((z) => z.id === id && z.restaurante_id === rid)
    if (idx === -1) return { data: null, error: 'Zona no encontrada' }
    if (ds.mesas.some((m) => m.zona_id === id && m.restaurante_id === rid)) {
      return { data: null, error: 'La zona tiene mesas asociadas. Elimina primero sus mesas.' }
    }
    ds.zonas.splice(idx, 1)
    persiste()
    return { data: null, error: null }
  },
  async crearMesa(rid, datos) {
    await espera()
    if (!ds.zonas.some((z) => z.id === datos.zona_id && z.restaurante_id === rid)) {
      return { data: null, error: 'La zona no existe' }
    }
    if (buscarMesaConNombre(ds.mesas, rid, datos.nombre)) {
      return { data: null, error: mensajeNombreMesaDuplicado(datos.nombre) }
    }
    const mesa: Mesa = {
      id: crypto.randomUUID(),
      restaurante_id: rid,
      zona_id: datos.zona_id,
      nombre: datos.nombre.trim(),
      estado: 'libre',
      created_at: new Date().toISOString(),
    }
    ds.mesas.push(mesa)
    persiste()
    return { data: mesa, error: null }
  },
  async actualizarMesa(rid, id, cambios) {
    await espera()
    const mesa = ds.mesas.find((m) => m.id === id && m.restaurante_id === rid)
    if (!mesa) return { data: null, error: 'Mesa no encontrada' }
    if (cambios.nombre !== undefined && buscarMesaConNombre(ds.mesas, rid, cambios.nombre, id)) {
      return { data: null, error: mensajeNombreMesaDuplicado(cambios.nombre) }
    }
    if (cambios.zona_id && !ds.zonas.some((z) => z.id === cambios.zona_id && z.restaurante_id === rid)) {
      return { data: null, error: 'La zona no existe' }
    }
    if (cambios.nombre !== undefined) mesa.nombre = cambios.nombre.trim()
    if (cambios.zona_id !== undefined) mesa.zona_id = cambios.zona_id
    persiste()
    return { data: mesa, error: null }
  },
  async eliminarMesa(rid, id) {
    await espera()
    const idx = ds.mesas.findIndex((m) => m.id === id && m.restaurante_id === rid)
    if (idx === -1) return { data: null, error: 'Mesa no encontrada' }
    // Misma regla que la implementación real: si le queda algo por cobrar
    // (incluido lo entregado y no cobrado), la mesa no se borra.
    if (pedidosAbiertosDeMesa(ds, rid, id).length > 0) {
      return { data: null, error: 'La mesa tiene comandas por cobrar. No se puede eliminar aún.' }
    }
    ds.mesas.splice(idx, 1)
    persiste()
    return { data: null, error: null }
  },
  async crearCategoria(rid, nombre) {
    await espera()
    const categoria: CategoriaProducto = {
      id: crypto.randomUUID(),
      restaurante_id: rid,
      nombre: nombre.trim(),
      created_at: new Date().toISOString(),
    }
    ds.categorias.push(categoria)
    persiste()
    return { data: categoria, error: null }
  },
  async actualizarCategoria(rid, id, nombre) {
    await espera()
    const categoria = ds.categorias.find((c) => c.id === id && c.restaurante_id === rid)
    if (!categoria) return { data: null, error: 'Categoría no encontrada' }
    categoria.nombre = nombre.trim()
    persiste()
    return { data: categoria, error: null }
  },
  async eliminarCategoria(rid, id) {
    await espera()
    const idx = ds.categorias.findIndex((c) => c.id === id && c.restaurante_id === rid)
    if (idx === -1) return { data: null, error: 'Categoría no encontrada' }
    if (ds.productos.some((p) => p.categoria_id === id && p.restaurante_id === rid)) {
      return { data: null, error: 'La categoría tiene productos asociados. Elimina primero sus productos.' }
    }
    ds.categorias.splice(idx, 1)
    persiste()
    return { data: null, error: null }
  },
  async crearProducto(rid, datos) {
    await espera()
    if (datos.categoria_id && !ds.categorias.some((c) => c.id === datos.categoria_id && c.restaurante_id === rid)) {
      return { data: null, error: 'La categoría no existe' }
    }
    const producto: Producto = {
      id: crypto.randomUUID(),
      restaurante_id: rid,
      categoria_id: datos.categoria_id,
      nombre: datos.nombre.trim(),
      descripcion: datos.descripcion?.trim() || null,
      imagen_url: datos.imagen_url?.trim() || null,
      precio: datos.precio,
      disponible: datos.disponible,
      es_promocion: datos.es_promocion ?? false,
      precio_promocion: datos.es_promocion && datos.precio_promocion ? datos.precio_promocion : null,
      es_bebida: datos.es_bebida ?? false,
      estacion: datos.estacion ?? (datos.es_bebida ? 'bar' : 'cocina'),
      created_at: new Date().toISOString(),
    }
    ds.productos.push(producto)
    persiste()
    return { data: producto, error: null }
  },
  async actualizarProducto(rid, id, cambios) {
    await espera()
    const producto = ds.productos.find((p) => p.id === id && p.restaurante_id === rid)
    if (!producto) return { data: null, error: 'Producto no encontrado' }
    if (cambios.categoria_id && !ds.categorias.some((c) => c.id === cambios.categoria_id && c.restaurante_id === rid)) {
      return { data: null, error: 'La categoría no existe' }
    }
    if (cambios.nombre !== undefined) producto.nombre = cambios.nombre.trim()
    if (cambios.descripcion !== undefined) producto.descripcion = cambios.descripcion?.trim() || null
    if (cambios.imagen_url !== undefined) producto.imagen_url = cambios.imagen_url?.trim() || null
    if (cambios.precio !== undefined) producto.precio = cambios.precio
    if (cambios.disponible !== undefined) producto.disponible = cambios.disponible
    if (cambios.categoria_id !== undefined) producto.categoria_id = cambios.categoria_id
    if (cambios.es_promocion !== undefined) producto.es_promocion = cambios.es_promocion
    if (cambios.precio_promocion !== undefined) {
      producto.precio_promocion = cambios.precio_promocion ? cambios.precio_promocion : null
    }
    if (cambios.es_bebida !== undefined) producto.es_bebida = cambios.es_bebida === true
    if (cambios.estacion !== undefined) producto.estacion = cambios.estacion
    persiste()
    return { data: producto, error: null }
  },
  async eliminarProducto(rid, id) {
    await espera()
    const idx = ds.productos.findIndex((p) => p.id === id && p.restaurante_id === rid)
    if (idx === -1) return { data: null, error: 'Producto no encontrado' }
    ds.productos.splice(idx, 1)
    persiste()
    return { data: null, error: null }
  },
  async crearPersonal(rid, datos) {
    await espera()
    // En modo local, aplicamos el límite de administradores.
    if (datos.rol === 'admin_restaurante') {
      const admins = ds.usuarios.filter(
        (u) => u.restaurante_id === rid && u.rol === 'admin_restaurante' && u.activo !== false,
      )
      const limite = ds.planes.find((p) => ds.restaurantes.find((r) => r.id === rid)?.plan_id === p.id)?.max_administradores ?? 3
      if (limite >= 0 && admins.length >= limite) {
        return { data: null, error: `Límite alcanzado: el plan permite hasta ${limite} administrador${limite !== 1 ? 'es' : ''}.` }
      }
    }
    const usuario: Usuario = {
      id: crypto.randomUUID(),
      restaurante_id: rid,
      rol: datos.rol,
      nombre: datos.nombre.trim(),
      email: datos.email?.trim() || null,
      activo: true,
      created_at: new Date().toISOString(),
    }
    ds.usuarios.push(usuario)
    if (opciones?.credenciales && usuario.email) {
      localCredenciales[usuario.email.trim().toLowerCase()] = await hashCredencialLocal(PASSWORD_DE_PRUEBA)
    }
    persiste()
    return { data: { id: usuario.id, nombre: usuario.nombre, email: usuario.email, activo: usuario.activo, rol: usuario.rol }, error: null }
  },
  async actualizarPersonal(rid, id, cambios) {
    await espera()
    if ('activo' in cambios) return { data: null, error: 'Usa la confirmación segura para cambiar el acceso del personal.' }
    const u = ds.usuarios.find((x) => x.id === id && x.restaurante_id === rid && esRolPersonal(x.rol))
    if (!u) return { data: null, error: 'Personal no encontrado' }
    if (cambios.nombre !== undefined) u.nombre = cambios.nombre.trim()
    if (cambios.email !== undefined) {
      if (opciones?.credenciales && u.email) delete localCredenciales[u.email.trim().toLowerCase()]
      u.email = cambios.email?.trim() || null
      if (opciones?.credenciales && u.email) {
        localCredenciales[u.email.trim().toLowerCase()] = await hashCredencialLocal(PASSWORD_DE_PRUEBA)
      }
    }
    if (cambios.rol !== undefined) u.rol = cambios.rol
    persiste()
    return { data: { id: u.id, nombre: u.nombre, email: u.email, activo: u.activo, rol: u.rol }, error: null }
  },
  async cambiarEstadoPersonal(usuarioId, activo, motivo = '') {
    await espera()
    const actor = apiMode.operadorId ? ds.usuarios.find((u) => u.id === apiMode.operadorId) : null
    if (!actor || actor.rol !== 'admin_restaurante' || actor.activo === false || !actor.restaurante_id) {
      return { data: null, error: 'Solo un administrador activo puede gestionar su personal.' }
    }
    const usuario = ds.usuarios.find((u) => u.id === usuarioId)
    if (!usuario || usuario.restaurante_id !== actor.restaurante_id || !esRolPersonal(usuario.rol)) {
      return { data: null, error: 'Ese usuario no pertenece a tu restaurante.' }
    }
    if (usuario.id === actor.id) return { data: null, error: 'No puedes desactivar tu propio acceso.' }
    if ((usuario.activo !== false) === activo) return { data: null, error: 'El acceso ya tiene ese estado. Actualiza la lista.' }
    const anterior = usuario.activo !== false
    usuario.activo = activo
    registrarAuditoria(activo ? 'usuario_reactivar' : 'usuario_desactivar', {
      restauranteId: actor.restaurante_id,
      entidad: 'usuario',
      entidadId: usuario.id,
      descripcion: `${activo ? 'Reactivó' : 'Desactivó'} el acceso de ${usuario.nombre}`,
      detalle: { rol: usuario.rol, activo_anterior: anterior, activo_nuevo: activo, motivo: motivo.trim().slice(0, 240) || null },
    })
    persiste()
    return { data: { id: usuario.id, nombre: usuario.nombre, email: usuario.email, activo: usuario.activo, rol: usuario.rol }, error: null }
  },
  async resetPasswordPersonal(trabajadorId, passwordTemporal) {
    await espera()
    // Espejo de la Edge Function `reset-password-personal`: las mismas reglas
    // y los mismos mensajes, para que un test no vea un texto en local y otro
    // distinto en producción.
    const operador = apiMode.operadorId
      ? (ds.usuarios.find((u) => u.id === apiMode.operadorId) ?? null)
      : null
    if (!operador || operador.rol !== 'admin_restaurante' || operador.activo === false) {
      return {
        data: null,
        error: 'Solo un administrador activo puede restablecer contraseñas de su personal.',
      }
    }
    const rid = operador.restaurante_id
    if (!rid) return { data: null, error: 'El administrador no tiene restaurante asignado.' }

    const trabajador = ds.usuarios.find((u) => u.id === trabajadorId)
    if (!trabajador) return { data: null, error: 'El usuario no existe.' }
    if (trabajador.restaurante_id !== rid) {
      return { data: null, error: 'Ese usuario pertenece a otro restaurante.' }
    }
    if (trabajador.id === operador.id) {
      return { data: null, error: 'No puedes restablecer tu propia contraseña.' }
    }
    if (trabajador.rol === 'admin_restaurante') {
      return {
        data: null,
        error: 'No se puede restablecer la contraseña de otro administrador.',
      }
    }
    if (trabajador.activo === false) return { data: null, error: 'Reactiva el acceso del trabajador antes de cambiar su contraseña.' }
    if (passwordTemporal.length < 10 || passwordTemporal.length > 128 || !passwordTemporal.trim()) {
      return { data: null, error: 'La clave temporal debe tener entre 10 y 128 caracteres.' }
    }

    // El modo de prueba persiste solo un verificador PBKDF2 con sal, nunca la clave en claro.
    if (opciones?.credenciales && trabajador.email) {
      localCredenciales[trabajador.email.trim().toLowerCase()] = await hashCredencialLocal(passwordTemporal)
    }
    trabajador.debe_cambiar_password = true
    registrarAuditoria('usuario_password_reset', {
      restauranteId: rid,
      entidad: 'usuario',
      entidadId: trabajador.id,
      descripcion: `Restableció la contraseña del ${trabajador.rol} ${trabajador.nombre}`,
      detalle: { rol: trabajador.rol },
    })
    persiste()
    return { data: null, error: null }
  },
  async getTurnoAbierto(rid) {
    await espera()
    return { data: ds.cajaTurnos.find((t) => t.restaurante_id === rid && t.estado === 'abierto') ?? null, error: null }
  },
  async getTurnos(rid) {
    await espera()
    return {
      data: ds.cajaTurnos
        .filter((t) => t.restaurante_id === rid)
        .slice()
        .sort((a, b) => b.fecha_apertura.localeCompare(a.fecha_apertura)),
      error: null,
    }
  },
  async abrirTurno(rid, usuarioId, montoInicial) {
    const acceso = errorDeAcceso(ds, rid, apiMode.operadorId)
    if (acceso) return { data: null, error: acceso }
    await espera()
    const abierto = ds.cajaTurnos.find((t) => t.restaurante_id === rid && t.estado === 'abierto')
    const error = errorAlAbrirTurno(montoInicial, abierto ?? null)
    if (error) return { data: null, error }
    if (!ds.usuarios.some((u) => u.id === usuarioId && u.restaurante_id === rid)) {
      return { data: null, error: 'El usuario que abre la caja no pertenece a este restaurante.' }
    }
    const ahora = new Date().toISOString()
    const turno: TurnoCaja = {
      id: crypto.randomUUID(),
      restaurante_id: rid,
      usuario_apertura_id: usuarioId,
      monto_inicial: redondear(montoInicial),
      estado: 'abierto',
      fecha_apertura: ahora,
      fecha_cierre: null,
      usuario_cierre_id: null,
      monto_declarado: null,
      monto_esperado: null,
      diferencia: null,
      observaciones: null,
      created_at: ahora,
    }
    ds.cajaTurnos.push(turno)
    persiste()
    return { data: turno, error: null }
  },
  async cerrarTurno(rid, usuarioId, montoDeclarado, observaciones) {
    const acceso = errorDeAcceso(ds, rid, apiMode.operadorId)
    if (acceso) return { data: null, error: acceso }
    await espera()
    const turno = ds.cajaTurnos.find((t) => t.restaurante_id === rid && t.estado === 'abierto')
    const error = errorAlCerrarTurno(montoDeclarado, turno ?? null)
    if (error) return { data: null, error }
    if (!ds.usuarios.some((u) => u.id === usuarioId && u.restaurante_id === rid)) {
      return { data: null, error: 'El usuario que cierra la caja no pertenece a este restaurante.' }
    }
    const t = turno as TurnoCaja
    // El declarado se escribe ANTES de calcular el arqueo: `arqueoTurno` lo lee
    // del turno, y si se calculara antes de asignarlo compararía contra 0 y
    // reportaría el faltante completo.
    t.monto_declarado = redondear(montoDeclarado)
    // Se pasa el detalle de pagos para que el arqueo sume solo el efectivo de
    // un pago dividido, ya descontado el vuelto.
    const arqueo = arqueoTurno(
      t,
      ds.cuentas.filter((c) => c.restaurante_id === rid),
      ds.pagos.filter((p) => p.restaurante_id === rid),
    )
    t.estado = 'cerrado'
    t.fecha_cierre = new Date().toISOString()
    t.usuario_cierre_id = usuarioId
    t.monto_esperado = arqueo.esperado
    t.diferencia = arqueo.diferencia
    t.observaciones = observaciones?.trim() || null
    registrarAuditoria('caja_turno_cerrar', {
      restauranteId: rid,
      entidad: 'caja_turno',
      entidadId: t.id,
      descripcion: 'Turno de caja cerrado con el arqueo declarado.',
      detalle: {
        turno_id: t.id,
        monto_declarado: t.monto_declarado,
        monto_esperado: t.monto_esperado,
        diferencia: t.diferencia,
        observaciones: t.observaciones,
      },
    })
    persiste()
    return { data: t, error: null }
  },
}
}

const KEY_DATOS_DEMO = 'mesora.demo.datos.v2'

/** Vuelca el estado vivo del demo a localStorage (el demo ya no pierde cambios). */
function guardarDatosDemo(): void {
  try {
    localStorage.setItem(KEY_DATOS_DEMO, JSON.stringify(db))
  } catch {
    // Sin storage: el demo sigue solo en memoria.
  }
}

/** Vuelca campo a campo (arrays in-place, objetos por assign) para conservar la referencia de `db`. */
function rellenarDataset(dest: Dataset, src: Partial<Dataset>): void {
  const objetivo = dest as unknown as Record<string, unknown>
  const fuente = src as Record<string, unknown>
  for (const clave of Object.keys(dest) as (keyof Dataset)[]) {
    const valor = fuente[clave]
    if (valor === undefined) continue
    const actual = objetivo[clave]
    if (Array.isArray(actual) && Array.isArray(valor)) {
      ;(actual as unknown[]).splice(0, actual.length, ...(valor as unknown[]))
    } else if (actual && typeof actual === 'object' && valor && typeof valor === 'object') {
      Object.assign(actual as object, valor)
    }
  }
}

/** Restaura el demo guardado (si lo hay) tras recargar la pestaña. */
function cargarDatosDemo(): void {
  try {
    const raw = localStorage.getItem(KEY_DATOS_DEMO)
    if (!raw) return
    rellenarDataset(db, JSON.parse(raw) as Partial<Dataset>)
  } catch {
    // JSON corrupto: se conserva la semilla.
  }
}

cargarDatosDemo()

const mockApi = crearApiDesde(db, { persistir: true, demo: true })
const localApi = crearApiDesde(localDb, { credenciales: true, persistir: true })

/**
 * Deja el modo demo como recién abierto: vacío, listo para que el recorrido lo
 * construya paso a paso. Es exclusivo del demo (el backend local se reinicia
 * con restablecerDatosLocal y conserva su dataset completo).
 */
export function reiniciarDemoDatos(): void {
  db.zonas = []
  db.mesas = []
  db.categorias = []
  db.productos = []
  db.usuarios = mockUsuarios.map((u) => ({ ...u }))
  db.pedidos = []
  db.items = []
  db.cuentas = []
  db.cuentaPedidos = []
  db.pagos = []
  db.restaurantes = [{ ...mockRestaurante }, { ...mockRestauranteExtra }]
  db.cajaTurnos = []
  db.planes = mockPlanes.map((p) => ({ ...p }))
  db.historialSuscripciones = []
  db.auditLogs = []
  db.tickets = []
  db.configuracion = {
    ...CONFIGURACION_POR_DEFECTO,
    updated_at: new Date().toISOString(),
    updated_by: null,
  }
  // Se borra lo persistido para que el demo arranque de la semilla, no del
  // último estado guardado.
  try {
    localStorage.removeItem(KEY_DATOS_DEMO)
  } catch {
    // Sin storage: el reset en memoria es suficiente.
  }
}

// ----------------------------------------------------------- selección de API
/** Modo activo. DemoMode lo pone en `true` mientras existe (rutas /demo/*). */
export const apiMode = {
  demo: false,
  demoRol: null as Rol | null,
  /** Id del usuario que hace writes (demo: rol seleccionado; local: usuario de sesión). */
  operadorId: 'u-mesero-1',
}

/**
 * True cuando la app está en el demo.
 *
 * En el navegador la ÚNICA fuente de verdad es la ruta (`/demo...`). Antes se
 * leía `apiMode.demo`, un flag mutable que DemoMode apagaba en el cleanup de su
 * efecto: al navegar entre roles o al salir del demo quedaba momentáneamente en
 * false mientras el contexto seguía mostrando el restaurante mock (`r-demo`),
 * y las vistas disparaban consultas reales con ese id inválido. Derivarlo de la
 * ruta hace imposible ese desfase. En SSR/tests (sin `window`) se mantiene el
 * flag, que la suite de verificación controla a mano.
 */
export function enDemo(): boolean {
  if (typeof window !== 'undefined') {
    const { pathname } = window.location
    return pathname === '/demo' || pathname.startsWith('/demo/')
  }
  return apiMode.demo
}

/** True cuando NO estamos en /demo y Supabase no está configurado. */
export function esModoLocal(): boolean {
  return !enDemo() && modoLocalHabilitado
}

export function getApi(): DataApi {
  if (typeof window !== 'undefined' && window.location.pathname.startsWith('/demo')) {
    return envolverErroresApi(mockApi)
  }
  if (apiMode.demo) return envolverErroresApi(mockApi)
  if (esModoLocal()) return envolverErroresApi(localApi)
  return envolverErroresApi(realApi)
}

if (import.meta.env.DEV) {
  ;(globalThis as any).__mesoraDebug = () => ({
    demo: enDemo(),
    supabaseConfigurado,
    api: getApi().constructor.name,
  })
}
