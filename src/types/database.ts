export type Rol = 'super_admin' | 'admin_restaurante' | 'mesero' | 'cocina' | 'cajero'

/**
 * Estados de una comanda. `anulado` no es un estado de trabajo: es una comanda
 * que se quedó sin ítems vigentes (el mesero anuló todo lo que tenía) y por eso
 * ya no se prepara, no se cobra y no ocupa la mesa.
 */
export type EstadoPedido = 'pendiente' | 'en_preparacion' | 'listo' | 'entregado' | 'anulado'

export type EstadoMesa = 'libre' | 'ocupada'

/**
 * `anulada` es una cuenta que se cobró y después se anuló (error de cobro, meal
 * devuelto). No se borra: sale de las ventas —los reportes filtran por
 * 'pagada'— pero queda el registro con su motivo, quién la anuló y cuánto se
 * devolvió.
 */
export type EstadoCuenta = 'pendiente' | 'pagada' | 'anulada'

/**
 * Métodos de pago admitidos. `cuentas.metodo_pago` debe tener un CHECK
 * constraint con esta misma lista (ver supabase/rpc_cerrar_cuenta.sql).
 */
export const METODOS_PAGO = ['efectivo', 'tarjeta', 'yape_plin', 'otro'] as const

export type MetodoPago = (typeof METODOS_PAGO)[number]

/** Whitelist en runtime: ningún otro valor puede llegar a `cuentas.metodo_pago`. */
export function esMetodoPagoValido(valor: unknown): valor is MetodoPago {
  return typeof valor === 'string' && (METODOS_PAGO as readonly string[]).includes(valor)
}

export type Restaurante = {
  id: string
  nombre: string
  ruc?: string | null
  telefono?: string | null
  direccion?: string | null
  email_contacto?: string | null
  /**
   * Dominio de correo del local (ej. litoral.pe). Lo define el admin desde su
   * panel: su personal entra como usuario@dominio (carlos@litoral.pe).
   */
  dominio?: string | null
  suscripcion_activa: boolean
  fecha_vencimiento: string | null
  /** Plan de suscripción vigente (FK a planes). Solo lo cambia el super admin. */
  plan_id?: string | null
  /** Inicio del periodo de suscripción vigente. */
  fecha_inicio?: string | null
  pin_autorizacion?: string | null
  created_at: string
}

/** Catálogo de planes. Precio/límites NULL = todavía sin definir. */
export type Plan = {
  id: string
  clave: string
  nombre: string
  orden: number
  precio_mensual: number | null
  max_usuarios: number | null
  /** Máximo de administradores activos; los valores negativos indican que no hay límite. */
  max_administradores: number | null
  duracion_dias: number | null
  funcionalidades: string[] | null
  /** false = plan retirado: se conserva para el historial pero no se asigna. */
  activo: boolean
  created_at: string
}

export type SuscripcionAccion =
  | 'renovacion'
  | 'cambio_plan'
  | 'suspension'
  | 'reactivacion'
  | 'ajuste'

/** Auditoría append-only de acciones de suscripción (nunca se borra). */
export type SuscripcionHistorial = {
  id: string
  restaurante_id: string
  accion: SuscripcionAccion
  plan_id: string | null
  plan_anterior_id: string | null
  fecha_inicio: string | null
  fecha_vencimiento: string | null
  suscripcion_activa: boolean | null
  motivo: string | null
  creado_por: string | null
  created_at: string
}

export type Usuario = {
  id: string
  restaurante_id: string | null
  rol: Rol
  nombre: string
  email?: string | null
  activo?: boolean | null
  /**
   * El Admin le restableció la contraseña: el usuario tiene que poner una
   * nueva antes de entrar. Lo enciende el reset administrativo de personal.
   */
  debe_cambiar_password?: boolean | null
  /** Correo alternativo, propiedad del administrador, solo tras verificarlo. */
  correo_recuperacion?: string | null
  correo_recuperacion_verificado?: boolean | null
  created_at: string
}

export type Zona = {
  id: string
  restaurante_id: string
  nombre: string
  created_at: string
}

export type Mesa = {
  id: string
  restaurante_id: string
  zona_id: string
  nombre: string
  estado: EstadoMesa
  /** Mesero responsable actual; las comandas anteriores conservan su autor original. */
  mesero_responsable_id?: string | null
  created_at: string
}

export type CategoriaProducto = {
  id: string
  restaurante_id: string
  nombre: string
  created_at: string
}

export type Producto = {
  id: string
  restaurante_id: string
  categoria_id: string | null
  nombre: string
  descripcion?: string | null
  imagen_url?: string | null
  precio: number
  disponible: boolean
  es_promocion?: boolean | null
  precio_promocion?: number | null
  /** El producto se prepara en la barra, no en la cocina. Lo define el admin. */
  es_bebida?: boolean | null
  created_at: string
}

export type Pedido = {
  id: string
  restaurante_id: string
  mesa_id: string
  mesero_id: string
  estado: EstadoPedido
  observacion?: string | null
  created_at: string
  updated_at: string
}

export type PedidoItem = {
  id: string
  pedido_id: string
  producto_id: string | null
  nombre_producto: string
  cantidad: number
  precio_unitario: number
  nota?: string | null
  /**
   * Ítem anulado por el mesero. No se borra (deja rastro de qué se pidió y qué
   * se canceló): simplemente deja de sumar, de aparecer en cocina y de entrar en
   * la boleta. Opcional para tolerate datos guardados antes de existir el campo.
   */
  anulado?: boolean | null
  anulado_por?: string | null
  anulado_at?: string | null
  /** Clasificación histórica para reportes, congelada al crear la comanda. */
  es_bebida?: boolean | null
  created_at: string
}

export type Cuenta = {
  id: string
  restaurante_id: string
  mesa_id: string
  total: number
  metodo_pago: MetodoPago
  estado: EstadoCuenta
  pagado_at: string | null
  created_at: string
  /**
   * Número correlativo de la boleta, asignado por el servidor al cerrar la
   * cuenta (p. ej. `B001-000123`). Único por restaurante. Null en cuentas
   * anteriores a esta columna.
   */
  numero?: string | null
  /**
   * Propina del turno, si el cliente dejó propina. Se guarda APARTE del total
   * (no se suma a `total`) para que el reporte de ventas no la cuente como
   * venta de comida.
   */
  propina?: number | null
  /** Efectivo devuelto al cliente. 0 si no hubo vuelto. */
  vuelto?: number | null
  /** Cuándo se anuló el cobro. Null si la cuenta sigue vigente. */
  anulada_at?: string | null
  /** Quién anuló el cobro (admin o cajero). */
  anulada_por?: string | null
  /** Por qué se anuló. Es parte del registro: una boleta anulada sin motivo no sirve. */
  motivo_anulacion?: string | null
  /** Total devuelto al cliente (todos los métodos). El arqueo solo descuenta el efectivo. */
  monto_reembolsado?: number | null
  /** Datos congelados al emitir la boleta para que una reimpresión sea idéntica. */
  mesero_id_snapshot?: string | null
  mesero_nombre_snapshot?: string | null
  mesa_nombre_snapshot?: string | null
  restaurante_nombre_snapshot?: string | null
  restaurante_direccion_snapshot?: string | null
  restaurante_ruc_snapshot?: string | null
  restaurante_telefono_snapshot?: string | null
}

/**
 * Una de las partes de un pago dividido. Siempre hay al menos una por cuenta:
 * el pago simple genera una sola fila. El detalle vive acá (y no en
 * `cuentas.metodo_pago`) para poder registrar "50 en efectivo + 30 con Yape" sin
 * inventar un método de pago nuevo ni perder el vuelto.
 */
export type Pago = {
  id: string
  cuenta_id: string
  restaurante_id: string
  metodo_pago: MetodoPago
  /** Dinero entregado por el cliente con este método (incluye lo que es vuelto). */
  monto: number
  /** Nro de operación de tarjeta/Yape. Informativo. */
  referencia?: string | null
  created_at: string
}

export type CuentaPedido = {
  id: string
  cuenta_id: string
  pedido_id: string
  subtotal: number
}

/** Un turno de caja va `abierto` → `cerrado` y nunca se reabre. */
export type EstadoTurno = 'abierto' | 'cerrado'

/**
 * Turno de caja (apertura + arqueo). Es la única fuente de verdad de "cuánto
 * efectivo debería haber en la gaveta": `monto_declarado`, `monto_esperado` y
 * `diferencia` se congelan al cerrar, así el histórico no cambia si mañana se
 * corrige una cuenta vieja.
 *
 * `diferencia` positiva = sobrante; negativa = faltante.
 */
export type TurnoCaja = {
  id: string
  restaurante_id: string
  /** Quién abrió la gaveta. */
  usuario_apertura_id: string
  monto_inicial: number
  estado: EstadoTurno
  fecha_apertura: string
  fecha_cierre: string | null
  usuario_cierre_id: string | null
  monto_declarado: number | null
  monto_esperado: number | null
  diferencia: number | null
  observaciones: string | null
  created_at: string
}

/**
 * Registro de auditoría (append-only). Guarda quién hizo qué, cuándo y sobre
 * qué restaurante. Nunca contiene contraseñas ni secretos.
 */
export type AuditLog = {
  id: string
  actor_id: string | null
  actor_rol: string | null
  actor_nombre: string | null
  restaurante_id: string | null
  restaurante_nombre: string | null
  entidad: string | null
  entidad_id: string | null
  accion: string
  descripcion: string | null
  detalle: Record<string, unknown> | null
  created_at: string
}

export type TicketPrioridad = 'baja' | 'media' | 'alta' | 'urgente'
export type TicketEstado = 'abierto' | 'en_progreso' | 'resuelto' | 'cerrado'
export type TicketTipo = 'error' | 'consulta' | 'sugerencia'

export type ConsultaComercial = {
  id: string
  nombre: string
  restaurante: string
  email: string
  mensaje: string
  estado: 'nuevo' | 'en_seguimiento' | 'cerrado'
  correo_estado: 'enviado' | 'pendiente' | 'fallido'
  responsable: string | null
  nota_interna: string | null
  proximo_contacto: string | null
  created_at: string
  updated_at: string
}

export type BandejaComercial = {
  resumen: { hoy: number; ultimos_30_dias: number; nuevas: number; correo_pendiente: number; correo_fallido: number; contactos_vencidos: number }
  consultas: ConsultaComercial[]
}

/** Ticket de soporte de la plataforma (solo super admin). */
export type SoporteTicket = {
  id: string
  codigo: string
  restaurante_id: string | null
  usuario_id: string | null
  asunto: string
  descripcion: string
  tipo: TicketTipo
  prioridad: TicketPrioridad
  estado: TicketEstado
  responsable_id: string | null
  responsable: string | null
  created_at: string
  updated_at: string
  resuelto_at: string | null
}

export type SoporteMensaje = {
  id: string
  ticket_id: string
  autor_id: string
  autor_super_admin: boolean
  mensaje: string
  created_at: string
}

/** Configuración general de la plataforma (fila única id = 1). */
export type ConfiguracionGlobal = {
  id: number
  nombre_app: string
  correo_soporte: string | null
  telefono_soporte: string | null
  logo_url: string | null
  informacion: string | null
  /** Precio mensual en soles del plan único Mesora Pro (editable). */
  precio_plan_mensual: number
  updated_at: string
  updated_by: string | null
}

/** Para que el cliente tipado de supabase-js acepte el schema. */
interface Tbl<R, I, U> {
  Row: R
  Insert: I
  Update: U
  Relationships: never[]
}

export interface Database {
  public: {
    Tables: {
      restaurantes: Tbl<Restaurante, Partial<Restaurante>, Partial<Restaurante>>
      usuarios: Tbl<Usuario, Partial<Usuario>, Partial<Usuario>>
      zonas: Tbl<Zona, Partial<Zona>, Partial<Zona>>
      mesas: Tbl<Mesa, Partial<Mesa>, Partial<Mesa>>
      categorias_productos: Tbl<CategoriaProducto, Partial<CategoriaProducto>, Partial<CategoriaProducto>>
      productos: Tbl<Producto, Partial<Producto>, Partial<Producto>>
      pedidos: Tbl<Pedido, Partial<Pedido>, Partial<Pedido>>
      pedido_items: Tbl<PedidoItem, Partial<PedidoItem>, Partial<PedidoItem>>
      cuentas: Tbl<Cuenta, Partial<Cuenta>, Partial<Cuenta>>
      cuenta_pedidos: Tbl<CuentaPedido, Partial<CuentaPedido>, Partial<CuentaPedido>>
      cuenta_pagos: Tbl<Pago, Partial<Pago>, Partial<Pago>>
      caja_turnos: Tbl<TurnoCaja, Partial<TurnoCaja>, Partial<TurnoCaja>>
      planes: Tbl<Plan, Partial<Plan>, Partial<Plan>>
      suscripciones_historial: Tbl<SuscripcionHistorial, Partial<SuscripcionHistorial>, Partial<SuscripcionHistorial>>
      audit_logs: Tbl<AuditLog, Partial<AuditLog>, Partial<AuditLog>>
      soporte_tickets: Tbl<SoporteTicket, Partial<SoporteTicket>, Partial<SoporteTicket>>
      soporte_mensajes: Tbl<SoporteMensaje, Partial<SoporteMensaje>, Partial<SoporteMensaje>>
      configuracion_global: Tbl<ConfiguracionGlobal, Partial<ConfiguracionGlobal>, Partial<ConfiguracionGlobal>>
    }
    Views: Record<string, never>
    Functions: {
      registrar_error_cliente: {
        Args: { p_tipo: string; p_ruta: string; p_contexto: string }
        Returns: undefined
      }
      pedidos_pendientes_mesa: {
        Args: { p_restaurante_id: string; p_mesa_id: string }
        Returns: { id: string; mesa_id: string; estado: EstadoPedido; created_at: string }[]
      }
      mesas_por_cobrar: {
        Args: { p_restaurante_id: string }
        Returns: { mesa_id: string; mesa_nombre: string; total: number; pedidos: number }[]
      }
      reporte_ventas_restaurante: {
        Args: {
          p_restaurante_id: string
          p_desde: string
          p_hasta: string
          p_estado?: string
          p_busqueda?: string
          p_offset?: number
          p_limite?: number
        }
        Returns: Record<string, unknown>
      }
      /** Solo super admin. Edita los datos administrativos de un restaurante (RPC de gestión del panel). */
      admin_actualizar_restaurante: {
        Args: {
          p_restaurante_id: string
          p_nombre: string
          p_ruc: string | null
          p_direccion: string | null
          p_telefono: string | null
          p_email_contacto: string | null
        }
        Returns: Restaurante[]
      }
      /** Solo super admin. Activa/desactiva la suscripción y fija el vencimiento. */
      admin_cambiar_suscripcion: {
        Args: { p_restaurante_id: string; p_activa: boolean; p_fecha_vencimiento: string | null }
        Returns: Restaurante[]
      }
      /** Solo super admin. Renueva: nueva fecha de vencimiento (+ reactiva). */
      suscripciones_renovar: {
        Args: { p_restaurante_id: string; p_fecha_vencimiento: string; p_creado_por?: string | null }
        Returns: Restaurante[]
      }
      /** Solo super admin. Cambia el plan; el anterior queda en el historial. */
      suscripciones_cambiar_plan: {
        Args: { p_restaurante_id: string; p_plan_id: string; p_creado_por?: string | null }
        Returns: Restaurante[]
      }
      /** Solo super admin. Suspende sin tocar fechas ni plan. */
      suscripciones_suspender: {
        Args: { p_restaurante_id: string; p_motivo?: string | null; p_creado_por?: string | null }
        Returns: Restaurante[]
      }
      /** Solo super admin. Reactiva; opcionalmente fija nuevo vencimiento. */
      suscripciones_reactivar: {
        Args: { p_restaurante_id: string; p_fecha_vencimiento?: string | null; p_creado_por?: string | null }
        Returns: Restaurante[]
      }
      /** Solo super admin. Activa/desactiva un usuario sin borrarlo. */
      admin_cambiar_estado_usuario: {
        Args: { p_usuario_id: string; p_activo: boolean }
        Returns: Usuario[]
      }
      /** Solo super admin. Designa a un usuario YA del restaurante como admin_restaurante (solo cambia el rol). */
      admin_designar_administrador: {
        Args: { p_restaurante_id: string; p_usuario_id: string }
        Returns: Usuario[]
      }
      /** Solo super admin. Último acceso (auth.users.last_sign_in_at) por usuario; null = nunca ingresó. */
      admin_ultimos_accesos: {
        Args: Record<string, never>
        Returns: { id: string; ultimo_acceso: string | null }[]
      }
      /** Solo super admin. Estadísticas globales agregadas en la base (JSON). */
      admin_estadisticas_globales: {
        Args: { p_desde: string; p_hasta: string }
        Returns: unknown
      }
      /** Solo service_role (Edge Functions). Alta explícita en la auditoría. */
      registrar_auditoria: {
        Args: {
          p_actor_id: string | null
          p_accion: string
          p_restaurante_id?: string | null
          p_entidad?: string | null
          p_entidad_id?: string | null
          p_descripcion?: string | null
          p_detalle?: Record<string, unknown> | null
        }
        Returns: AuditLog
      }
      /** Solo super admin. Alertas administrativas agregadas (JSON). */
      admin_alertas: {
        Args: Record<string, never>
        Returns: unknown
      }
      /** Solo super admin. Incidencias operativas de los últimos siete días. */
      mesora_system_alerts: {
        Args: Record<string, never>
        Returns: unknown
      }
      mesora_commercial_inbox: { Args: Record<string, never>; Returns: unknown }
      mesora_update_commercial_lead: { Args: { p_id: string; p_estado: ConsultaComercial['estado'] }; Returns: void }
      mesora_update_commercial_followup: { Args: { p_id: string; p_responsable: string; p_nota_interna: string; p_proximo_contacto: string | null }; Returns: void }
      crear_pedido: { Args: { p_restaurante_id: string; p_mesa_id: string; p_items: { producto_id: string; cantidad: number; nota?: string }[] }; Returns: string }
      listar_meseros_activos_restaurante: {
        Args: { p_restaurante_id: string }
        Returns: { id: string; nombre: string; activo: boolean; rol: string }[]
      }
      asignar_mesa_mesero: { Args: { p_restaurante_id: string; p_mesa_id: string; p_mesero_id: string; p_pin?: string | null; p_motivo?: string | null }; Returns: undefined }
      mover_consumo_mesa: { Args: { p_restaurante_id: string; p_mesa_origen_id: string; p_mesa_destino_id: string; p_pin?: string | null; p_motivo?: string | null }; Returns: undefined }
      reimprimir_boleta: { Args: { p_restaurante_id: string; p_cuenta_id: string; p_pin?: string | null }; Returns: unknown }
      abrir_turno_caja: { Args: { p_restaurante_id: string; p_usuario_id: string; p_monto_inicial: number }; Returns: string }
      cerrar_turno_caja: {
        Args: {
          p_restaurante_id: string
          p_usuario_id: string
          p_monto_declarado: number
          p_observaciones: string | null
        }
        Returns: TurnoCaja
      }
      editar_item_comanda: {
        Args: {
          p_restaurante_id: string
          p_pedido_id: string
          p_item_id: string
          p_cantidad: number
          p_nota: string | null
        }
        Returns: undefined
      }
      anular_item_comanda: {
        Args: {
          p_restaurante_id: string
          p_pedido_id: string
          p_item_id: string
          /**
           * PIN del restaurante. Si el restaurante no tiene PIN configurado se
           * ignora; si lo tiene, sin él la RPC no anula nada
           * (ver supabase/pin_autorizacion.sql).
           */
          p_pin?: string | null
        }
        Returns: undefined
      }
      /**
       * Anula una boleta ya cobrada (admin o cajero, con PIN si el
       * restaurante lo configuró). La cuenta queda `anulada` con su motivo y el
       * monto devuelto: sale de las ventas y su efectivo sale de la gaveta.
       */
      anular_cuenta: {
        Args: { p_restaurante_id: string; p_cuenta_id: string; p_motivo: string; p_pin?: string | null }
        Returns: Cuenta
      }
      /** ¿El restaurante tiene PIN de autorización? Lo usa la UI para pedirlo. */
      tiene_pin_autorizacion: { Args: { p_restaurante_id: string }; Returns: boolean }
      /** Solo admin. Guarda el hash del PIN (el valor nunca se devuelve). */
      configurar_pin_autorizacion: { Args: { p_restaurante_id: string; p_pin: string }; Returns: undefined }
      /** Solo admin. Deja el restaurante sin PIN (las anulaciones quedan libres). */
      quitar_pin_autorizacion: { Args: { p_restaurante_id: string }; Returns: undefined }
      /** Solo limpia el flag del propio usuario tras cambiar su contrasena. */
      confirmar_cambio_password: { Args: Record<string, never>; Returns: undefined }
      cerrar_cuenta: {
        Args: {
          p_restaurante_id: string
          p_mesa_id: string
          p_pedidos: string[]
          /** Partes del pago dividido: [{ metodo_pago, monto, referencia }]. */
          p_pagos: { metodo_pago: MetodoPago; monto: number; referencia?: string | null }[]
          p_propina: number
        }
        Returns: string
      }
    }
    Enums: Record<string, never>
  }
}
