-- Mesora: schema base para instalaciones NUEVAS.
-- En bases existentes se aplican ?nicamente migraciones revisadas.
-- Estados y roles son text + CHECK; importes numeric(12,2).
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.restaurantes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (length(btrim(nombre)) > 0),
  ruc text,
  telefono text,
  direccion text,
  email_contacto text,
  suscripcion_activa boolean not null default true,
  fecha_vencimiento timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.usuarios (
  id uuid primary key references auth.users(id) on delete cascade,
  restaurante_id uuid references public.restaurantes(id) on delete cascade,
  rol text not null check (rol in ('super_admin','admin_restaurante','mesero','cocina','cajero')),
  nombre text not null check (length(btrim(nombre)) > 0),
  email text,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  constraint usuarios_restaurante_requerido check (rol = 'super_admin' or restaurante_id is not null)
);
create index if not exists idx_usuarios_restaurante on public.usuarios(restaurante_id);

create table if not exists public.zonas (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes(id) on delete cascade,
  nombre text not null check (length(btrim(nombre)) > 0),
  created_at timestamptz not null default now()
);
create unique index if not exists zonas_un_nombre_por_restaurante on public.zonas(restaurante_id, lower(nombre));
create unique index if not exists zonas_id_restaurante_unique on public.zonas(id, restaurante_id);

create table if not exists public.mesas (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes(id) on delete cascade,
  zona_id uuid not null references public.zonas(id) on delete restrict,
  nombre text not null check (length(btrim(nombre)) > 0),
  estado text not null default 'libre' check (estado in ('libre','ocupada')),
  created_at timestamptz not null default now(),
  constraint mesas_zona_del_mismo_restaurante_fk foreign key(zona_id, restaurante_id)
    references public.zonas(id, restaurante_id)
);
create index if not exists idx_mesas_restaurante on public.mesas(restaurante_id, nombre);
create index if not exists idx_mesas_zona on public.mesas(zona_id);
create unique index if not exists mesas_un_nombre_por_restaurante on public.mesas(restaurante_id, lower(nombre));

create table if not exists public.categorias_productos (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes(id) on delete cascade,
  nombre text not null check (length(btrim(nombre)) > 0),
  created_at timestamptz not null default now()
);
create index if not exists idx_categorias_restaurante on public.categorias_productos(restaurante_id);

create table if not exists public.productos (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes(id) on delete cascade,
  categoria_id uuid references public.categorias_productos(id) on delete set null,
  nombre text not null check (length(btrim(nombre)) > 0),
  descripcion text,
  imagen_url text,
  precio numeric(12,2) not null check (precio >= 0),
  disponible boolean not null default true,
  es_promocion boolean not null default false,
  precio_promocion numeric(12,2) check (precio_promocion >= 0),
  created_at timestamptz not null default now()
);
create index if not exists idx_productos_restaurante on public.productos(restaurante_id);
create index if not exists idx_productos_categoria on public.productos(categoria_id);

create table if not exists public.pedidos (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes(id) on delete cascade,
  mesa_id uuid not null references public.mesas(id) on delete restrict,
  mesero_id uuid not null references public.usuarios(id) on delete restrict,
  estado text not null default 'pendiente',
  constraint pedidos_estado_check check (estado in ('pendiente','en_preparacion','listo','entregado','anulado')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_pedidos_restaurante_estado on public.pedidos(restaurante_id, estado, created_at);
create index if not exists idx_pedidos_restaurante_mesa on public.pedidos(restaurante_id, mesa_id, created_at);
create index if not exists idx_pedidos_mesero on public.pedidos(mesero_id);

create table if not exists public.pedido_items (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.pedidos(id) on delete cascade,
  producto_id uuid references public.productos(id) on delete set null,
  nombre_producto text not null,
  cantidad integer not null check (cantidad between 1 and 99),
  precio_unitario numeric(12,2) not null check (precio_unitario >= 0),
  nota text,
  created_at timestamptz not null default now()
);
create index if not exists idx_pedido_items_pedido on public.pedido_items(pedido_id);

create table if not exists public.cuentas (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes(id) on delete cascade,
  mesa_id uuid not null references public.mesas(id) on delete restrict,
  total numeric(12,2) not null check (total >= 0),
  metodo_pago text not null,
  constraint cuentas_metodo_pago_check check (metodo_pago in ('efectivo','tarjeta','yape_plin','otro')),
  estado text not null default 'pendiente',
  constraint cuentas_estado_check check (estado in ('pendiente','pagada','anulada')),
  pagado_at timestamptz,
  numero text,
  propina numeric(12,2) not null default 0 check (propina >= 0),
  vuelto numeric(12,2) not null default 0 check (vuelto >= 0),
  anulada_at timestamptz,
  anulada_por uuid references public.usuarios(id) on delete set null,
  motivo_anulacion text,
  monto_reembolsado numeric(12,2) check (monto_reembolsado >= 0),
  created_at timestamptz not null default now(),
  constraint cuentas_pagada_con_fecha check (estado = 'pendiente' or pagado_at is not null)
);
create index if not exists idx_cuentas_restaurante on public.cuentas(restaurante_id, estado);
create index if not exists idx_cuentas_pagadas on public.cuentas(restaurante_id, pagado_at desc) where estado = 'pagada';
create unique index if not exists cuentas_numero_por_restaurante on public.cuentas(restaurante_id, numero) where numero is not null;

create table if not exists public.cuenta_pedidos (
  id uuid primary key default gen_random_uuid(),
  cuenta_id uuid not null references public.cuentas(id) on delete cascade,
  pedido_id uuid not null references public.pedidos(id) on delete restrict,
  subtotal numeric(12,2) not null check (subtotal >= 0)
);
create index if not exists idx_cuenta_pedidos_cuenta on public.cuenta_pedidos(cuenta_id);
create index if not exists idx_cuenta_pedidos_pedido on public.cuenta_pedidos(pedido_id);

create table if not exists public.correlativos (
  restaurante_id uuid not null references public.restaurantes(id) on delete cascade,
  tipo text not null,
  ultimo integer not null default 0,
  primary key (restaurante_id, tipo)
);

create or replace function public.tocar_updated_at()
returns trigger language plpgsql set search_path = pg_catalog, public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists trg_pedidos_updated_at on public.pedidos;
create trigger trg_pedidos_updated_at before update on public.pedidos
for each row execute function public.tocar_updated_at();
revoke all on function public.tocar_updated_at() from public, anon, authenticated;

-- Cerradas desde su creaci?n; 01_rls_completo agrega las policies y grants.
do $$
declare t text;
begin
  foreach t in array array['restaurantes','usuarios','zonas','mesas','categorias_productos',
    'productos','pedidos','pedido_items','cuentas','cuenta_pedidos','correlativos'] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end;
$$;
