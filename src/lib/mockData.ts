// DEMO MODE — Datos falsos en memoria para visualizar las 4 vistas sin Supabase.
// Este archivo se elimina junto con src/demo/ cuando termines de configurar el backend
// (ver "Quitar el modo demo" en el README).

import type {
  CategoriaProducto,
  Cuenta,
  CuentaPedido,
  Mesa,
  Pedido,
  PedidoItem,
  Plan,
  Producto,
  Restaurante,
  Usuario,
  Zona,
} from '../types/database'

const AGORA = Date.now()
const MIN = 60_000

function fecha(deltaMin: number): string {
  return new Date(AGORA - deltaMin * MIN).toISOString()
}

// --------------------------------------------------------------------- Planes
// Plan único que siembra supabase/fuentes/suscripciones_super_admin.sql: solo
// Mesora Pro está activo (cantidad/precio/límites NULL; el precio mensual
// editable vive en configuracion_global.precio_plan_mensual).
export const mockPlanes: Plan[] = [
  { id: 'plan-mesora-pro', clave: 'mesora_pro', nombre: 'Mesora Pro', orden: 1, precio_mensual: null, max_usuarios: null, max_administradores: 3, duracion_dias: 30, funcionalidades: null, activo: true, created_at: fecha(500 * 24 * 60) },
]

// ---------------------------------------------------------------- Restaurante
export const mockRestaurante: Restaurante = {
  id: 'r-demo',
  nombre: 'Restaurante Demo',
  ruc: '20512345678',
  telefono: '+51 123 456 789',
  direccion: 'Av. Larco 123, Miraflores',
  email_contacto: 'demo@mesora.pe',
  dominio: 'demo.pe',
  suscripcion_activa: true,
  fecha_vencimiento: new Date(AGORA + 45 * 24 * 60 * MIN).toISOString(),
  plan_id: 'plan-mesora-pro',
  fecha_inicio: fecha(400 * 24 * 60),
  created_at: fecha(400 * 24 * 60),
}

// Restaurante extra para que la vista Super Admin muestre estados variados.
export const mockRestauranteExtra: Restaurante = {
  id: 'r-demo-2',
  nombre: 'La Esquina Grill',
  ruc: null,
  telefono: null,
  direccion: null,
  email_contacto: 'contacto@esquina.pe',
  dominio: 'esquina.pe',
  suscripcion_activa: false,
  fecha_vencimiento: fecha(6 * 24 * 60),
  plan_id: 'plan-mesora-pro',
  fecha_inicio: fecha(300 * 24 * 60),
  created_at: fecha(300 * 24 * 60),
}

// ----------------------------------------------------------------------- Zonas
export const mockZonas: Zona[] = [
  { id: 'z-salon', restaurante_id: 'r-demo', nombre: 'Salón', created_at: fecha(400 * 24 * 60) },
  { id: 'z-terraza', restaurante_id: 'r-demo', nombre: 'Terraza', created_at: fecha(400 * 24 * 60) },
  { id: 'z-barra', restaurante_id: 'r-demo', nombre: 'Barra', created_at: fecha(400 * 24 * 60) },
]

// ----------------------------------------------------------------------- Mesas
// Salón: Mesas 1-5 | Terraza: Mesas 6-8 | Barra: Mesa 9
export const mockMesas: Mesa[] = [
  { id: 'm-1', restaurante_id: 'r-demo', zona_id: 'z-salon', nombre: 'Mesa 1', estado: 'ocupada', created_at: fecha(300 * 24 * 60) },
  { id: 'm-2', restaurante_id: 'r-demo', zona_id: 'z-salon', nombre: 'Mesa 2', estado: 'ocupada', created_at: fecha(300 * 24 * 60) },
  { id: 'm-3', restaurante_id: 'r-demo', zona_id: 'z-salon', nombre: 'Mesa 3', estado: 'ocupada', created_at: fecha(300 * 24 * 60) },
  { id: 'm-4', restaurante_id: 'r-demo', zona_id: 'z-salon', nombre: 'Mesa 4', estado: 'libre', created_at: fecha(300 * 24 * 60) },
  { id: 'm-5', restaurante_id: 'r-demo', zona_id: 'z-salon', nombre: 'Mesa 5', estado: 'libre', created_at: fecha(300 * 24 * 60) },
  { id: 'm-6', restaurante_id: 'r-demo', zona_id: 'z-terraza', nombre: 'Mesa 6', estado: 'libre', created_at: fecha(300 * 24 * 60) },
  { id: 'm-7', restaurante_id: 'r-demo', zona_id: 'z-terraza', nombre: 'Mesa 7', estado: 'libre', created_at: fecha(300 * 24 * 60) },
  { id: 'm-8', restaurante_id: 'r-demo', zona_id: 'z-terraza', nombre: 'Mesa 8', estado: 'libre', created_at: fecha(300 * 24 * 60) },
  { id: 'm-9', restaurante_id: 'r-demo', zona_id: 'z-barra', nombre: 'Barra', estado: 'libre', created_at: fecha(300 * 24 * 60) },
]

// ------------------------------------------------------------------- Categorías
export const mockCategorias: CategoriaProducto[] = [
  { id: 'c-entradas', restaurante_id: 'r-demo', nombre: 'Entradas', created_at: fecha(300 * 24 * 60) },
  { id: 'c-fondo', restaurante_id: 'r-demo', nombre: 'Platos de fondo', created_at: fecha(300 * 24 * 60) },
  { id: 'c-bebidas', restaurante_id: 'r-demo', nombre: 'Bebidas', created_at: fecha(300 * 24 * 60) },
  { id: 'c-postres', restaurante_id: 'r-demo', nombre: 'Postres', created_at: fecha(300 * 24 * 60) },
]

// -------------------------------------------------------------------- Productos
const U = (id: string) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=400&q=80`

export const mockProductos: Producto[] = [
  {
    id: 'p-1',
    restaurante_id: 'r-demo',
    categoria_id: 'c-entradas',
    nombre: 'Ceviche Clásico',
    descripcion: 'Pescado fresco, limón, cebolla roja y canchita.',
    imagen_url: U('photo-1467003909585-2f8a72700288'),
    precio: 32,
    disponible: true,
    es_promocion: true,
    precio_promocion: 28,
    created_at: fecha(200 * 24 * 60),
    es_bebida: false,
  },
  {
    id: 'p-2',
    restaurante_id: 'r-demo',
    categoria_id: 'c-entradas',
    nombre: 'Causa Limeña',
    descripcion: 'Papa amarilla, pollo y ají amarillo.',
    imagen_url: U('photo-1512621776951-a57141f2eefd'),
    precio: 28,
    disponible: true,
    es_promocion: false,
    precio_promocion: null,
    created_at: fecha(200 * 24 * 60),
    es_bebida: false,
  },
  {
    id: 'p-3',
    restaurante_id: 'r-demo',
    categoria_id: 'c-entradas',
    nombre: 'Tequeños',
    descripcion: 'Queso, 8 unidades.',
    imagen_url: U('photo-1568901346375-23c9450c58cd'),
    precio: 24,
    disponible: true,
    es_promocion: false,
    precio_promocion: null,
    created_at: fecha(200 * 24 * 60),
    es_bebida: false,
  },
  {
    id: 'p-4',
    restaurante_id: 'r-demo',
    categoria_id: 'c-fondo',
    nombre: 'Lomo Saltado',
    descripcion: 'Lomo de res, cebolla, tomate y papas fritas.',
    imagen_url: U('photo-1504674900247-0877df9cc836'),
    precio: 38,
    disponible: true,
    es_promocion: true,
    precio_promocion: 34,
    created_at: fecha(200 * 24 * 60),
    es_bebida: false,
  },
  {
    id: 'p-5',
    restaurante_id: 'r-demo',
    categoria_id: 'c-fondo',
    nombre: 'Arroz Chaufa',
    descripcion: 'Arroz saltado con pollo y verduras.',
    imagen_url: U('photo-1540189549336-e6e99c3679fe'),
    precio: 30,
    disponible: true,
    es_promocion: false,
    precio_promocion: null,
    created_at: fecha(200 * 24 * 60),
    es_bebida: false,
  },
  {
    id: 'p-6',
    restaurante_id: 'r-demo',
    categoria_id: 'c-fondo',
    nombre: 'Aji de Gallina',
    descripcion: 'Pollo deshilachado en crema de ají amarillo.',
    imagen_url: U('photo-1546069901-ba9599a7e63c'),
    precio: 32,
    disponible: true,
    es_promocion: false,
    precio_promocion: null,
    created_at: fecha(200 * 24 * 60),
    es_bebida: false,
  },
  {
    id: 'p-7',
    restaurante_id: 'r-demo',
    categoria_id: 'c-fondo',
    nombre: 'Pollo a la Brasa',
    descripcion: 'Cuarto de pollo con papas fritas y ensalada.',
    imagen_url: U('photo-1555939594-58d7cb561ad1'),
    precio: 45,
    disponible: true,
    es_promocion: false,
    precio_promocion: null,
    created_at: fecha(200 * 24 * 60),
    es_bebida: false,
  },
  {
    id: 'p-8',
    restaurante_id: 'r-demo',
    categoria_id: 'c-bebidas',
    nombre: 'Chicha Morada',
    descripcion: 'Vaso grande.',
    imagen_url: U('photo-1556679343-c7306c1976bc'),
    precio: 8,
    disponible: true,
    es_promocion: false,
    precio_promocion: null,
    created_at: fecha(200 * 24 * 60),
    es_bebida: true,
  },
  {
    id: 'p-9',
    restaurante_id: 'r-demo',
    categoria_id: 'c-bebidas',
    nombre: 'Inca Kola 500ml',
    descripcion: null,
    imagen_url: U('photo-1527960281133-0d3ffad45b1f'),
    precio: 6,
    disponible: true,
    es_promocion: false,
    precio_promocion: null,
    created_at: fecha(200 * 24 * 60),
    es_bebida: true,
  },
  {
    id: 'p-10',
    restaurante_id: 'r-demo',
    categoria_id: 'c-bebidas',
    nombre: 'Limonada Frozen',
    descripcion: 'Limón, hierbabuena y hielo.',
    imagen_url: U('photo-1613478223719-2ab802602423'),
    precio: 12,
    disponible: true,
    es_promocion: true,
    precio_promocion: 10,
    created_at: fecha(200 * 24 * 60),
    es_bebida: true,
  },
  {
    id: 'p-11',
    restaurante_id: 'r-demo',
    categoria_id: 'c-postres',
    nombre: 'Picarones',
    descripcion: '4 unidades con miel de chancaca.',
    imagen_url: U('photo-1565958011703-44f9829ba187'),
    precio: 12,
    disponible: true,
    es_promocion: false,
    precio_promocion: null,
    created_at: fecha(200 * 24 * 60),
    es_bebida: false,
  },
  {
    id: 'p-12',
    restaurante_id: 'r-demo',
    categoria_id: 'c-postres',
    nombre: 'Suspiro a la Limeña',
    descripcion: null,
    imagen_url: U('photo-1563805042-7684c019e1cb'),
    precio: 14,
    disponible: true,
    es_promocion: false,
    precio_promocion: null,
    created_at: fecha(200 * 24 * 60),
    es_bebida: false,
  },
]

// --------------------------------------------------------------------- Usuarios
export const mockUsuarios: Usuario[] = [
  {
    id: 'u-super',
    restaurante_id: null,
    rol: 'super_admin',
    nombre: 'Ana Plataforma',
    email: 'super@mesora.pe',
    activo: true,
    created_at: fecha(500 * 24 * 60),
  },
  {
    id: 'u-mesero-1',
    restaurante_id: 'r-demo',
    rol: 'mesero',
    nombre: 'María Torres',
    email: 'maria@demo.pe',
    activo: true,
    created_at: fecha(280 * 24 * 60),
  },
  {
    id: 'u-mesero-2',
    restaurante_id: 'r-demo',
    rol: 'mesero',
    nombre: 'Carlos Pérez',
    email: 'carlos@demo.pe',
    activo: true,
    created_at: fecha(250 * 24 * 60),
  },
  {
    id: 'u-cocina',
    restaurante_id: 'r-demo',
    rol: 'cocina',
    nombre: 'Chef Ramírez',
    email: 'cocina@demo.pe',
    activo: true,
    created_at: fecha(240 * 24 * 60),
  },
  {
    id: 'u-admin',
    restaurante_id: 'r-demo',
    rol: 'admin_restaurante',
    nombre: 'Diego Ruiz',
    email: 'admin@demo.pe',
    activo: true,
    created_at: fecha(300 * 24 * 60),
  },
  {
    id: 'u-cajero',
    restaurante_id: 'r-demo',
    rol: 'cajero',
    nombre: 'Rosa Caja',
    email: 'cajero@mesora.pe',
    activo: true,
    created_at: fecha(10 * 24 * 60),
  },
]

// ---------------------------------------------------------------------- Pedidos
export const mockPedidos: Pedido[] = [
  {
    id: 'pdo-1',
    restaurante_id: 'r-demo',
    mesa_id: 'm-3',
    mesero_id: 'u-mesero-1',
    estado: 'pendiente',
    observacion: null,
    created_at: fecha(4),
    updated_at: fecha(4),
  },
  {
    id: 'pdo-2',
    restaurante_id: 'r-demo',
    mesa_id: 'm-1',
    mesero_id: 'u-mesero-2',
    estado: 'en_preparacion',
    observacion: null,
    created_at: fecha(12),
    updated_at: fecha(7),
  },
  {
    id: 'pdo-3',
    restaurante_id: 'r-demo',
    mesa_id: 'm-2',
    mesero_id: 'u-mesero-1',
    estado: 'listo',
    observacion: 'Sin cebolla',
    created_at: fecha(22),
    updated_at: fecha(15),
  },
  {
    id: 'pdo-4',
    restaurante_id: 'r-demo',
    mesa_id: 'm-5',
    mesero_id: 'u-mesero-2',
    estado: 'entregado',
    observacion: null,
    created_at: fecha(180),
    updated_at: fecha(160),
  },
  {
    id: 'pdo-5',
    restaurante_id: 'r-demo',
    mesa_id: 'm-3',
    mesero_id: 'u-mesero-1',
    estado: 'entregado',
    observacion: null,
    created_at: fecha(70),
    updated_at: fecha(55),
  },
  {
    id: 'pdo-6',
    restaurante_id: 'r-demo',
    mesa_id: 'm-6',
    mesero_id: 'u-mesero-2',
    estado: 'entregado',
    observacion: null,
    created_at: fecha(290),
    updated_at: fecha(270),
  },
  {
    id: 'pdo-7',
    restaurante_id: 'r-demo',
    mesa_id: 'm-1',
    mesero_id: 'u-mesero-1',
    estado: 'pendiente',
    observacion: 'Poco picante',
    created_at: fecha(2),
    updated_at: fecha(2),
  },
  {
    id: 'pdo-8',
    restaurante_id: 'r-demo',
    mesa_id: 'm-3',
    mesero_id: 'u-mesero-2',
    estado: 'en_preparacion',
    observacion: null,
    created_at: fecha(9),
    updated_at: fecha(5),
  },
]

function precioFinal(p: Producto): number {
  return p.es_promocion && p.precio_promocion ? p.precio_promocion : p.precio
}

function itemsPara(pedidoId: string, rows: [Producto, number, string?][]): PedidoItem[] {
  return rows.map(([p, cantidad, nota], i) => ({
    id: `it-${pedidoId}-${i}`,
    pedido_id: pedidoId,
    producto_id: p.id,
    nombre_producto: p.nombre,
    cantidad,
    precio_unitario: precioFinal(p),
    nota: nota ?? null,
    created_at: fecha(20),
  }))
}

const byId = (id: string): Producto => mockProductos.find((p) => p.id === id) as Producto

export const mockPedidoItems: PedidoItem[] = [
  ...itemsPara('pdo-1', [
    [byId('p-1'), 2],
    [byId('p-8'), 1],
  ]),
  ...itemsPara('pdo-2', [
    [byId('p-4'), 1],
    [byId('p-5'), 1],
  ]),
  ...itemsPara('pdo-3', [
    [byId('p-7'), 1],
    [byId('p-9'), 2],
  ]),
  ...itemsPara('pdo-4', [
    [byId('p-5'), 1],
    [byId('p-10'), 2],
    [byId('p-8'), 2],
  ]),
  ...itemsPara('pdo-5', [
    [byId('p-1'), 1],
    [byId('p-4'), 1],
  ]),
  ...itemsPara('pdo-6', [
    [byId('p-5'), 2],
    [byId('p-11'), 1],
    [byId('p-8'), 1],
  ]),
  ...itemsPara('pdo-7', [
    [byId('p-2'), 2],
    [byId('p-9'), 1],
  ]),
  ...itemsPara('pdo-8', [
    [byId('p-5'), 1],
    [byId('p-10'), 1],
  ]),
]

// ----------------------------------------------------------------------- Cuenta
export const mockCuentas: Cuenta[] = [
  {
    id: 'cta-1',
    restaurante_id: 'r-demo',
    mesa_id: 'm-5',
    total: 66,
    metodo_pago: 'yape_plin',
    estado: 'pagada',
    pagado_at: fecha(130),
    created_at: fecha(131),
  },
  {
    id: 'cta-2',
    restaurante_id: 'r-demo',
    mesa_id: 'm-3',
    total: 62,
    metodo_pago: 'efectivo',
    estado: 'pagada',
    pagado_at: fecha(50),
    created_at: fecha(51),
  },
  {
    id: 'cta-3',
    restaurante_id: 'r-demo',
    mesa_id: 'm-6',
    total: 80,
    metodo_pago: 'tarjeta',
    estado: 'pagada',
    pagado_at: fecha(280),
    created_at: fecha(281),
  },
  // Boleta cobrada y anulada: sirve para que la pantalla de cobros muestre el
  // estado "anulada" y el dashboard, los reembolsos del mes. No cuenta como
  // venta (computeMetricas solo mira las 'pagada').
  {
    id: 'cta-4',
    restaurante_id: 'r-demo',
    mesa_id: 'm-9',
    total: 45,
    metodo_pago: 'efectivo',
    estado: 'anulada',
    pagado_at: fecha(200),
    created_at: fecha(201),
    anulada_at: fecha(60),
    anulada_por: 'u-admin',
    motivo_anulacion: 'Cliente devolvió la comida',
    monto_reembolsado: 45,
  },
]

export const mockCuentaPedidos: CuentaPedido[] = [
  { id: 'cp-1', cuenta_id: 'cta-1', pedido_id: 'pdo-4', subtotal: 66 },
  { id: 'cp-2', cuenta_id: 'cta-2', pedido_id: 'pdo-5', subtotal: 62 },
  { id: 'cp-3', cuenta_id: 'cta-3', pedido_id: 'pdo-6', subtotal: 80 },
]