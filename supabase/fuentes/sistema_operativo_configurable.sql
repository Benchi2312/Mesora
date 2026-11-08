-- Mesora · Sistema operativo configurable (fases 1 y 2, esquema expansivo).
-- No conecta pedidos, KDS, impresión ni cobros a estas tablas todavía.

create table if not exists public.configuracion_operativa (
  restaurante_id uuid primary key references public.restaurantes(id) on delete cascade,
  modalidad_cobro text not null default 'cobro_por_mesero'
    check (modalidad_cobro in (
      'solo_cajero', 'cobro_por_mesero', 'caja_central_meseros_autorizados'
    )),
  version integer not null default 1 check (version >= 1),
  actualizado_por uuid references public.usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.estaciones_restaurante (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes(id) on delete cascade,
  codigo text not null check (codigo in ('cocina', 'bar', 'otros')),
  nombre text not null check (length(btrim(nombre)) > 0),
  activo boolean not null default true,
  orden integer not null default 0 check (orden >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint estaciones_restaurante_codigo_unique unique (restaurante_id, codigo),
  constraint estaciones_restaurante_id_restaurante_unique unique (id, restaurante_id)
);

create table if not exists public.destinos_estacion (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes(id) on delete cascade,
  estacion_id uuid not null,
  tipo text not null check (tipo in ('kds', 'impresora')),
  grupo text not null default 'principal' check (grupo in ('principal', 'respaldo')),
  nombre text not null check (length(btrim(nombre)) > 0),
  papel_mm smallint,
  configuracion jsonb not null default '{}'::jsonb
    check (jsonb_typeof(configuracion) = 'object'),
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint destinos_estacion_papel_check check (
    (tipo = 'kds' and papel_mm is null)
    or (tipo = 'impresora' and papel_mm is not null and papel_mm in (58, 80))
  ),
  constraint destinos_estacion_fk_estacion
    foreign key (estacion_id, restaurante_id)
    references public.estaciones_restaurante(id, restaurante_id)
    on delete restrict,
  constraint destinos_estacion_id_restaurante_unique unique (id, restaurante_id),
  constraint destinos_estacion_id_estacion_restaurante_unique
    unique (id, estacion_id, restaurante_id),
  constraint destinos_estacion_nombre_unique
    unique (estacion_id, tipo, grupo, nombre)
);

alter table public.categorias_productos
  add column if not exists estacion_id uuid;

create unique index if not exists pedidos_id_restaurante_unique
  on public.pedidos (id, restaurante_id);

create unique index if not exists usuarios_id_restaurante_unique
  on public.usuarios (id, restaurante_id);

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.categorias_productos'::regclass
       and conname = 'categorias_productos_estacion_restaurante_fk'
  ) then
    alter table public.categorias_productos
      add constraint categorias_productos_estacion_restaurante_fk
      foreign key (estacion_id, restaurante_id)
      references public.estaciones_restaurante(id, restaurante_id)
      on delete restrict;
  end if;
end;
$$;

create index if not exists categorias_productos_estacion_idx
  on public.categorias_productos (estacion_id)
  where estacion_id is not null;

create table if not exists public.entregas_comanda (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes(id) on delete cascade,
  pedido_id uuid not null,
  estacion_id uuid not null,
  destino_estacion_id uuid not null,
  grupo text not null check (grupo in ('principal', 'respaldo')),
  tipo_destino text not null check (tipo_destino in ('kds', 'impresora')),
  configuracion_version integer not null default 1 check (configuracion_version >= 1),
  clave_idempotencia uuid not null default gen_random_uuid(),
  numero_entrega integer not null default 1 check (numero_entrega >= 1),
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'enviada', 'confirmada', 'fallida', 'cancelada')),
  error_publico text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint entregas_comanda_fk_pedido_restaurante
    foreign key (pedido_id, restaurante_id)
    references public.pedidos(id, restaurante_id)
    on delete restrict,
  constraint entregas_comanda_fk_estacion_restaurante
    foreign key (estacion_id, restaurante_id)
    references public.estaciones_restaurante(id, restaurante_id)
    on delete restrict,
  constraint entregas_comanda_fk_destino_estacion_restaurante
    foreign key (destino_estacion_id, estacion_id, restaurante_id)
    references public.destinos_estacion(id, estacion_id, restaurante_id)
    on delete restrict,
  constraint entregas_comanda_idempotencia_unique
    unique (restaurante_id, clave_idempotencia),
  constraint entregas_comanda_intento_unique
    unique (restaurante_id, pedido_id, estacion_id, destino_estacion_id, numero_entrega)
);

create index if not exists entregas_comanda_pendientes_idx
  on public.entregas_comanda (restaurante_id, estado, created_at)
  where estado in ('pendiente', 'fallida');

create table if not exists public.estado_comanda_estacion (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes(id) on delete cascade,
  pedido_id uuid not null,
  estacion_id uuid not null,
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'en_preparacion', 'listo', 'entregado', 'anulado')),
  iniciado_at timestamptz,
  listo_at timestamptz,
  entregado_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint estado_comanda_estacion_fk_pedido_restaurante
    foreign key (pedido_id, restaurante_id)
    references public.pedidos(id, restaurante_id)
    on delete restrict,
  constraint estado_comanda_estacion_fk_estacion_restaurante
    foreign key (estacion_id, restaurante_id)
    references public.estaciones_restaurante(id, restaurante_id)
    on delete restrict,
  constraint estado_comanda_estacion_pedido_estacion_unique
    unique (restaurante_id, pedido_id, estacion_id)
);

create index if not exists estado_comanda_estacion_tablero_idx
  on public.estado_comanda_estacion (restaurante_id, estacion_id, estado, created_at);

create table if not exists public.autorizaciones_cobro (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes(id) on delete cascade,
  usuario_id uuid not null,
  activo boolean not null default false,
  creado_por uuid references public.usuarios(id) on delete set null,
  actualizado_por uuid references public.usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint autorizaciones_cobro_fk_usuario_restaurante
    foreign key (usuario_id, restaurante_id)
    references public.usuarios(id, restaurante_id)
    on delete restrict,
  constraint autorizaciones_cobro_usuario_unique unique (restaurante_id, usuario_id)
);

create index if not exists autorizaciones_cobro_activas_idx
  on public.autorizaciones_cobro (restaurante_id, usuario_id)
  where activo;

-- Metadatos del registro padre: el cliente no elige el actor ni la versión.
create or replace function public.mesora_config_operativa_metadata()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.version := greatest(coalesce(new.version, 1), 1);
    new.created_at := coalesce(new.created_at, now());
    new.updated_at := coalesce(new.updated_at, now());
    if auth.uid() is not null then new.actualizado_por := auth.uid(); end if;
  else
    new.version := old.version + 1;
    new.created_at := old.created_at;
    new.updated_at := now();
    new.actualizado_por := coalesce(auth.uid(), old.actualizado_por);
  end if;
  return new;
end;
$$;

revoke all on function public.mesora_config_operativa_metadata() from public, anon, authenticated;

drop trigger if exists configuracion_operativa_metadata on public.configuracion_operativa;
create trigger configuracion_operativa_metadata
before insert or update on public.configuracion_operativa
for each row execute function public.mesora_config_operativa_metadata();

-- Las modificaciones de destinos, estaciones, asignación de categoría o
-- autorizaciones avanzan la versión del agregado operativo. La inicialización
-- anidada de un restaurante nuevo no cuenta como una edición del administrador.
create or replace function public.mesora_version_config_operativa_hijo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_restaurante_id uuid;
begin
  if pg_trigger_depth() > 1 then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  if tg_table_name = 'categorias_productos' then
    if tg_op = 'UPDATE' and old.estacion_id is not distinct from new.estacion_id then
      return new;
    end if;
    if tg_op = 'INSERT' and new.estacion_id is null then return new; end if;
  end if;

  if tg_op = 'DELETE' then
    v_restaurante_id := old.restaurante_id;
  else
    v_restaurante_id := new.restaurante_id;
  end if;

  update public.configuracion_operativa
     set version = version + 1,
         actualizado_por = coalesce(auth.uid(), actualizado_por),
         updated_at = now()
   where restaurante_id = v_restaurante_id;

  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

revoke all on function public.mesora_version_config_operativa_hijo() from public, anon, authenticated;

drop trigger if exists estaciones_version_config_operativa on public.estaciones_restaurante;
create trigger estaciones_version_config_operativa
after insert or update or delete on public.estaciones_restaurante
for each row execute function public.mesora_version_config_operativa_hijo();

drop trigger if exists destinos_version_config_operativa on public.destinos_estacion;
create trigger destinos_version_config_operativa
after insert or update or delete on public.destinos_estacion
for each row execute function public.mesora_version_config_operativa_hijo();

drop trigger if exists categorias_version_config_operativa on public.categorias_productos;
create trigger categorias_version_config_operativa
after insert or update of estacion_id or delete on public.categorias_productos
for each row execute function public.mesora_version_config_operativa_hijo();

drop trigger if exists autorizaciones_version_config_operativa on public.autorizaciones_cobro;
create trigger autorizaciones_version_config_operativa
after insert or update or delete on public.autorizaciones_cobro
for each row execute function public.mesora_version_config_operativa_hijo();

-- Defaults conservadores: conservan el cobro por mesero, mantienen las tres
-- pantallas KDS actuales y no activan impresoras ni impresión automática.
insert into public.configuracion_operativa (restaurante_id, modalidad_cobro)
select r.id, 'cobro_por_mesero'
  from public.restaurantes r
on conflict (restaurante_id) do nothing;

insert into public.estaciones_restaurante (restaurante_id, codigo, nombre, activo, orden)
select r.id, e.codigo, e.nombre, true, e.orden
  from public.restaurantes r
 cross join (values
   ('cocina', 'Cocina', 10),
   ('bar', 'Bar', 20),
   ('otros', 'Otros', 30)
 ) as e(codigo, nombre, orden)
on conflict (restaurante_id, codigo) do nothing;

insert into public.destinos_estacion
  (restaurante_id, estacion_id, tipo, grupo, nombre, papel_mm, activo)
select e.restaurante_id, e.id, 'kds', 'principal', 'KDS ' || e.nombre, null, true
  from public.estaciones_restaurante e
 where not exists (
   select 1 from public.destinos_estacion d
    where d.estacion_id = e.id and d.tipo = 'kds'
      and d.grupo = 'principal' and d.nombre = 'KDS ' || e.nombre
 )
on conflict (estacion_id, tipo, grupo, nombre) do nothing;

create or replace function public.mesora_inicializar_operacion_restaurante()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.configuracion_operativa (restaurante_id, modalidad_cobro)
  values (new.id, 'cobro_por_mesero')
  on conflict (restaurante_id) do nothing;

  insert into public.estaciones_restaurante (restaurante_id, codigo, nombre, activo, orden)
  values
    (new.id, 'cocina', 'Cocina', true, 10),
    (new.id, 'bar', 'Bar', true, 20),
    (new.id, 'otros', 'Otros', true, 30)
  on conflict (restaurante_id, codigo) do nothing;

  insert into public.destinos_estacion
    (restaurante_id, estacion_id, tipo, grupo, nombre, papel_mm, activo)
  select e.restaurante_id, e.id, 'kds', 'principal', 'KDS ' || e.nombre, null, true
    from public.estaciones_restaurante e
   where e.restaurante_id = new.id
     and not exists (
       select 1 from public.destinos_estacion d
        where d.estacion_id = e.id and d.tipo = 'kds'
          and d.grupo = 'principal' and d.nombre = 'KDS ' || e.nombre
     )
  on conflict (estacion_id, tipo, grupo, nombre) do nothing;

  return new;
end;
$$;

revoke all on function public.mesora_inicializar_operacion_restaurante() from public, anon, authenticated;

drop trigger if exists restaurantes_inicializar_operacion on public.restaurantes;
create trigger restaurantes_inicializar_operacion
after insert on public.restaurantes
for each row execute function public.mesora_inicializar_operacion_restaurante();

-- El estado operativo se consulta dentro del propio restaurante. Los registros
-- financieros de autorizaciones se limitan a admin/cajero; solo admin escribe.
alter table public.configuracion_operativa enable row level security;
alter table public.estaciones_restaurante enable row level security;
alter table public.destinos_estacion enable row level security;
alter table public.entregas_comanda enable row level security;
alter table public.estado_comanda_estacion enable row level security;
alter table public.autorizaciones_cobro enable row level security;

drop policy if exists configuracion_operativa_select on public.configuracion_operativa;
create policy configuracion_operativa_select on public.configuracion_operativa
  for select to authenticated
  using ((select public.soy_del_restaurante(restaurante_id)));
drop policy if exists configuracion_operativa_insert_admin on public.configuracion_operativa;
create policy configuracion_operativa_insert_admin on public.configuracion_operativa
  for insert to authenticated
  with check ((select public.puedo_escribir_en(restaurante_id, array['admin_restaurante'])));
drop policy if exists configuracion_operativa_update_admin on public.configuracion_operativa;
create policy configuracion_operativa_update_admin on public.configuracion_operativa
  for update to authenticated
  using ((select public.puedo_escribir_en(restaurante_id, array['admin_restaurante'])))
  with check ((select public.puedo_escribir_en(restaurante_id, array['admin_restaurante'])));

drop policy if exists estaciones_restaurante_select on public.estaciones_restaurante;
create policy estaciones_restaurante_select on public.estaciones_restaurante
  for select to authenticated
  using ((select public.soy_del_restaurante(restaurante_id)));
drop policy if exists estaciones_restaurante_insert_admin on public.estaciones_restaurante;
create policy estaciones_restaurante_insert_admin on public.estaciones_restaurante
  for insert to authenticated
  with check ((select public.puedo_escribir_en(restaurante_id, array['admin_restaurante'])));
drop policy if exists estaciones_restaurante_update_admin on public.estaciones_restaurante;
create policy estaciones_restaurante_update_admin on public.estaciones_restaurante
  for update to authenticated
  using ((select public.puedo_escribir_en(restaurante_id, array['admin_restaurante'])))
  with check ((select public.puedo_escribir_en(restaurante_id, array['admin_restaurante'])));

drop policy if exists destinos_estacion_select on public.destinos_estacion;
create policy destinos_estacion_select on public.destinos_estacion
  for select to authenticated
  using ((select public.soy_del_restaurante(restaurante_id)));
drop policy if exists destinos_estacion_insert_admin on public.destinos_estacion;
create policy destinos_estacion_insert_admin on public.destinos_estacion
  for insert to authenticated
  with check ((select public.puedo_escribir_en(restaurante_id, array['admin_restaurante'])));
drop policy if exists destinos_estacion_update_admin on public.destinos_estacion;
create policy destinos_estacion_update_admin on public.destinos_estacion
  for update to authenticated
  using ((select public.puedo_escribir_en(restaurante_id, array['admin_restaurante'])))
  with check ((select public.puedo_escribir_en(restaurante_id, array['admin_restaurante'])));

drop policy if exists entregas_comanda_select on public.entregas_comanda;
create policy entregas_comanda_select on public.entregas_comanda
  for select to authenticated
  using ((select public.soy_del_restaurante(restaurante_id)));

drop policy if exists estado_comanda_estacion_select on public.estado_comanda_estacion;
create policy estado_comanda_estacion_select on public.estado_comanda_estacion
  for select to authenticated
  using ((select public.soy_del_restaurante(restaurante_id)));

drop policy if exists autorizaciones_cobro_select on public.autorizaciones_cobro;
create policy autorizaciones_cobro_select on public.autorizaciones_cobro
  for select to authenticated
  using (
    (select public.soy_del_restaurante(restaurante_id))
    and (select public.tengo_rol(array['admin_restaurante', 'cajero']))
  );
drop policy if exists autorizaciones_cobro_insert_admin on public.autorizaciones_cobro;
create policy autorizaciones_cobro_insert_admin on public.autorizaciones_cobro
  for insert to authenticated
  with check ((select public.puedo_escribir_en(restaurante_id, array['admin_restaurante'])));
drop policy if exists autorizaciones_cobro_update_admin on public.autorizaciones_cobro;
create policy autorizaciones_cobro_update_admin on public.autorizaciones_cobro
  for update to authenticated
  using ((select public.puedo_escribir_en(restaurante_id, array['admin_restaurante'])))
  with check ((select public.puedo_escribir_en(restaurante_id, array['admin_restaurante'])));

revoke all on public.configuracion_operativa, public.estaciones_restaurante,
  public.destinos_estacion, public.entregas_comanda,
  public.estado_comanda_estacion, public.autorizaciones_cobro
  from public, anon, authenticated;

grant select on public.configuracion_operativa, public.estaciones_restaurante,
  public.destinos_estacion, public.entregas_comanda,
  public.estado_comanda_estacion, public.autorizaciones_cobro to authenticated;

grant insert, update on public.configuracion_operativa,
  public.estaciones_restaurante, public.destinos_estacion,
  public.autorizaciones_cobro to authenticated;

grant all on public.configuracion_operativa, public.estaciones_restaurante,
  public.destinos_estacion, public.entregas_comanda,
  public.estado_comanda_estacion, public.autorizaciones_cobro to service_role;

revoke truncate on public.configuracion_operativa, public.estaciones_restaurante,
  public.destinos_estacion, public.entregas_comanda,
  public.estado_comanda_estacion, public.autorizaciones_cobro from authenticated;

comment on table public.configuracion_operativa is
  'Configuración operativa versionada por restaurante. La modalidad por defecto conserva el cobro actual por mesero.';
comment on table public.estaciones_restaurante is
  'Estaciones del restaurante; cocina, bar y otros se crean como valores compatibles.';
comment on table public.destinos_estacion is
  'Destinos lógicos de estación. El instalador activa KDS y deja las impresoras sin configurar.';
comment on table public.entregas_comanda is
  'Cola idempotente preparada; todavía no se escribe desde crear_pedido.';
comment on table public.estado_comanda_estacion is
  'Estado por estación preparado; el KDS actual sigue usando pedidos.estado.';
comment on table public.autorizaciones_cobro is
  'Permisos individuales preparados; cerrar_cuenta todavía no los consulta.';
