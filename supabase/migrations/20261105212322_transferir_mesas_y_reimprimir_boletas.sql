-- Mesora · responsabilidad de mesas, traslado de consumo y reimpresión de recibos
--
-- Las comandas mantienen su mesero de origen para que ventas históricas no
-- cambien cuando se entrega una mesa. La mesa registra quién la atiende ahora.
-- Los recibos nuevos congelan sus datos visibles al momento del cobro.

alter table public.mesas
  add column if not exists mesero_responsable_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.mesas'::regclass
       and conname = 'mesas_mesero_responsable_fk'
  ) then
    alter table public.mesas
      add constraint mesas_mesero_responsable_fk
      foreign key (mesero_responsable_id) references public.usuarios(id) on delete set null;
  end if;
end;
$$;

alter table public.cuentas add column if not exists mesero_id_snapshot uuid;
alter table public.cuentas add column if not exists mesero_nombre_snapshot text;
alter table public.cuentas add column if not exists mesa_nombre_snapshot text;
alter table public.cuentas add column if not exists restaurante_nombre_snapshot text;
alter table public.cuentas add column if not exists restaurante_direccion_snapshot text;
alter table public.cuentas add column if not exists restaurante_ruc_snapshot text;
alter table public.cuentas add column if not exists restaurante_telefono_snapshot text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.cuentas'::regclass
       and conname = 'cuentas_mesero_snapshot_fk'
  ) then
    alter table public.cuentas
      add constraint cuentas_mesero_snapshot_fk
      foreign key (mesero_id_snapshot) references public.usuarios(id) on delete set null;
  end if;
end;
$$;

-- Esta función conserva en la cuenta el texto que se imprimió al cobrar.
create or replace function public.capturar_snapshot_boleta()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_restaurante record;
  v_mesa_nombre text;
  v_mesero_nombre text;
begin
  select r.nombre, r.direccion, r.ruc, r.telefono
    into v_restaurante
    from public.restaurantes r
   where r.id = new.restaurante_id;

  select m.nombre into v_mesa_nombre
    from public.mesas m
   where m.id = new.mesa_id and m.restaurante_id = new.restaurante_id;

  select u.nombre into v_mesero_nombre
    from public.usuarios u
   where u.id = auth.uid() and u.restaurante_id = new.restaurante_id;

  new.mesero_id_snapshot := auth.uid();
  new.mesero_nombre_snapshot := coalesce(new.mesero_nombre_snapshot, v_mesero_nombre);
  new.mesa_nombre_snapshot := coalesce(new.mesa_nombre_snapshot, v_mesa_nombre);
  new.restaurante_nombre_snapshot := coalesce(new.restaurante_nombre_snapshot, v_restaurante.nombre);
  new.restaurante_direccion_snapshot := coalesce(new.restaurante_direccion_snapshot, v_restaurante.direccion);
  new.restaurante_ruc_snapshot := coalesce(new.restaurante_ruc_snapshot, v_restaurante.ruc);
  new.restaurante_telefono_snapshot := coalesce(new.restaurante_telefono_snapshot, v_restaurante.telefono);
  return new;
end;
$$;

drop trigger if exists cuentas_capturar_snapshot_boleta on public.cuentas;
create trigger cuentas_capturar_snapshot_boleta
before insert on public.cuentas
for each row execute function public.capturar_snapshot_boleta();

-- Una mesa liberada deja de tener responsable. Esto cubre cobros, anulaciones
-- del último ítem y liberaciones manuales que ya existen en la aplicación.
create or replace function public.limpiar_responsable_mesa_libre()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.estado = 'libre' then
    new.mesero_responsable_id := null;
  end if;
  return new;
end;
$$;

drop trigger if exists mesas_limpiar_responsable_libre on public.mesas;
create trigger mesas_limpiar_responsable_libre
before update of estado on public.mesas
for each row execute function public.limpiar_responsable_mesa_libre();

-- Evita que un mesero cree comandas en una mesa que ya recibió otro. Si la mesa
-- aún no tiene responsable, el primer mesero que la abre se queda con ella,
-- salvo que existan comandas abiertas de un tercero (esas requieren intervención
-- del administrador o una transferencia explícita).
create or replace function public.validar_responsable_nueva_comanda()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rol text;
  v_estado text;
  v_responsable uuid;
begin
  if auth.uid() is null then
    return new;
  end if;

  select u.rol::text into v_rol
    from public.usuarios u
   where u.id = auth.uid()
     and u.restaurante_id = new.restaurante_id
     and coalesce(u.activo, true);

  if v_rol is distinct from 'mesero' then
    return new;
  end if;

  select m.estado, m.mesero_responsable_id
    into v_estado, v_responsable
    from public.mesas m
   where m.id = new.mesa_id
     and m.restaurante_id = new.restaurante_id
   for update;

  if not found then
    raise exception 'La mesa no pertenece al restaurante';
  end if;

  if v_responsable is not null and v_responsable <> auth.uid() then
    raise exception 'Esta mesa está asignada a otro mesero.';
  end if;

  if v_responsable is null and v_estado = 'ocupada' and exists (
    select 1
      from public.pedidos p
     where p.restaurante_id = new.restaurante_id
       and p.mesa_id = new.mesa_id
       and p.estado <> 'anulado'
       and p.mesero_id <> auth.uid()
       and exists (
         select 1 from public.pedido_items pi
          where pi.pedido_id = p.id and pi.anulado is not true
       )
       and not exists (
         select 1
           from public.cuenta_pedidos cp
           join public.cuentas c on c.id = cp.cuenta_id
          where cp.pedido_id = p.id and c.estado = 'pagada'
       )
  ) then
    raise exception 'Esta mesa tiene comandas de otro mesero. Pide al administrador que asigne la mesa.';
  end if;

  if v_responsable is null then
    update public.mesas
       set mesero_responsable_id = auth.uid()
     where id = new.mesa_id
       and restaurante_id = new.restaurante_id
       and mesero_responsable_id is null;
  end if;
  return new;
end;
$$;

drop trigger if exists pedidos_validar_responsable on public.pedidos;
create trigger pedidos_validar_responsable
before insert on public.pedidos
for each row execute function public.validar_responsable_nueva_comanda();

-- Tras una entrega, el mesero anterior puede seguir viendo la comanda, pero no
-- editarla ni anularla. El nuevo responsable continúa el servicio.
create or replace function public.validar_responsable_edicion_item()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_restaurante_id uuid;
  v_mesa_id uuid;
  v_autor_id uuid;
  v_responsable uuid;
  v_rol text;
begin
  if auth.uid() is null then
    return new;
  end if;

  select p.restaurante_id, p.mesa_id, p.mesero_id
    into v_restaurante_id, v_mesa_id, v_autor_id
    from public.pedidos p
   where p.id = new.pedido_id;
  if not found then
    raise exception 'La comanda no existe';
  end if;

  select u.rol::text into v_rol
    from public.usuarios u
   where u.id = auth.uid()
     and u.restaurante_id = v_restaurante_id
     and coalesce(u.activo, true);
  if v_rol is distinct from 'mesero' then
    return new;
  end if;

  select m.mesero_responsable_id into v_responsable
    from public.mesas m
   where m.id = v_mesa_id and m.restaurante_id = v_restaurante_id
   for share;

  if (v_responsable is not null and v_responsable <> auth.uid())
     or (v_responsable is null and v_autor_id <> auth.uid()) then
    raise exception 'Esta mesa está asignada a otro mesero.';
  end if;
  return new;
end;
$$;

drop trigger if exists pedido_items_validar_responsable on public.pedido_items;
create trigger pedido_items_validar_responsable
before update on public.pedido_items
for each row execute function public.validar_responsable_edicion_item();

-- La tabla de rate limit solo la modifica la RPC de reimpresión; ningún usuario
-- puede leerla o escribirla directamente.
create table if not exists public.reimpresion_pin_intentos (
  restaurante_id uuid not null references public.restaurantes(id) on delete cascade,
  usuario_id uuid not null references public.usuarios(id) on delete cascade,
  intentos_fallidos smallint not null default 0 check (intentos_fallidos between 0 and 5),
  bloqueado_hasta timestamptz,
  actualizado_at timestamptz not null default now(),
  primary key (restaurante_id, usuario_id)
);
alter table public.reimpresion_pin_intentos enable row level security;
revoke all on public.reimpresion_pin_intentos from anon, authenticated;

-- Reasigna la responsabilidad de una mesa ocupada. Los pedidos anteriores
-- conservan `pedidos.mesero_id`, de modo que los reportes de ventas no cambian.
create or replace function public.asignar_mesa_mesero(
  p_restaurante_id uuid,
  p_mesa_id uuid,
  p_mesero_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rol text;
  v_mesa public.mesas%rowtype;
  v_hay_consumo boolean;
  v_hay_comanda_ajena boolean;
  v_hay_comanda_propia boolean;
begin
  perform public.validar_acceso_restaurante(p_restaurante_id);

  select u.rol::text into v_rol
    from public.usuarios u
   where u.id = auth.uid()
     and u.restaurante_id = p_restaurante_id
     and coalesce(u.activo, true);
  if coalesce(v_rol, '') not in ('mesero', 'admin_restaurante') then
    raise exception 'Solo el mesero responsable o el administrador puede pasar esta mesa.';
  end if;

  select m.* into v_mesa
    from public.mesas m
   where m.id = p_mesa_id and m.restaurante_id = p_restaurante_id
   for update;
  if not found or v_mesa.estado <> 'ocupada' then
    raise exception 'La mesa no está ocupada.';
  end if;

  if not exists (
    select 1 from public.usuarios u
     where u.id = p_mesero_id
       and u.restaurante_id = p_restaurante_id
       and u.rol::text = 'mesero'
       and coalesce(u.activo, true)
  ) then
    raise exception 'El mesero elegido no está activo en este restaurante.';
  end if;

  select exists (
    select 1 from public.pedidos p
     where p.restaurante_id = p_restaurante_id
       and p.mesa_id = p_mesa_id
       and p.estado <> 'anulado'
       and exists (select 1 from public.pedido_items pi where pi.pedido_id = p.id and pi.anulado is not true)
       and not exists (
         select 1 from public.cuenta_pedidos cp join public.cuentas c on c.id = cp.cuenta_id
          where cp.pedido_id = p.id and c.estado = 'pagada'
       )
  ) into v_hay_consumo;
  if not v_hay_consumo then
    raise exception 'La mesa no tiene consumo pendiente para transferir.';
  end if;

  if v_rol = 'mesero' then
    if v_mesa.mesero_responsable_id is not null and v_mesa.mesero_responsable_id <> auth.uid() then
      raise exception 'Esta mesa está asignada a otro mesero.';
    end if;

    select exists (
      select 1 from public.pedidos p
       where p.restaurante_id = p_restaurante_id
         and p.mesa_id = p_mesa_id
         and p.estado <> 'anulado'
         and p.mesero_id <> auth.uid()
         and exists (select 1 from public.pedido_items pi where pi.pedido_id = p.id and pi.anulado is not true)
         and not exists (
           select 1 from public.cuenta_pedidos cp join public.cuentas c on c.id = cp.cuenta_id
            where cp.pedido_id = p.id and c.estado = 'pagada'
         )
    ) into v_hay_comanda_ajena;
    select exists (
      select 1 from public.pedidos p
       where p.restaurante_id = p_restaurante_id
         and p.mesa_id = p_mesa_id
         and p.estado <> 'anulado'
         and p.mesero_id = auth.uid()
         and exists (select 1 from public.pedido_items pi where pi.pedido_id = p.id and pi.anulado is not true)
         and not exists (
           select 1 from public.cuenta_pedidos cp join public.cuentas c on c.id = cp.cuenta_id
            where cp.pedido_id = p.id and c.estado = 'pagada'
         )
    ) into v_hay_comanda_propia;
    if v_mesa.mesero_responsable_id is null and (v_hay_comanda_ajena or not v_hay_comanda_propia) then
      raise exception 'Solo el administrador puede asignar esta mesa porque tiene comandas de otro mesero.';
    end if;
  end if;

  update public.mesas
     set mesero_responsable_id = p_mesero_id
   where id = p_mesa_id and restaurante_id = p_restaurante_id;
end;
$$;

-- Mueve todas las comandas todavía no cobradas de una mesa a otra libre,
-- bloqueando ambas mesas en orden estable para evitar carreras y deadlocks.
create or replace function public.mover_consumo_mesa(
  p_restaurante_id uuid,
  p_mesa_origen_id uuid,
  p_mesa_destino_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rol text;
  v_origen public.mesas%rowtype;
  v_destino public.mesas%rowtype;
  v_responsable uuid;
  v_hay_consumo boolean;
  v_hay_comanda_ajena boolean;
  v_hay_comanda_propia boolean;
  v_pedidos_movidos integer;
begin
  perform public.validar_acceso_restaurante(p_restaurante_id);
  if p_mesa_origen_id = p_mesa_destino_id then
    raise exception 'Elige una mesa distinta.';
  end if;

  select u.rol::text into v_rol
    from public.usuarios u
   where u.id = auth.uid()
     and u.restaurante_id = p_restaurante_id
     and coalesce(u.activo, true);
  if coalesce(v_rol, '') not in ('mesero', 'admin_restaurante') then
    raise exception 'Solo el mesero responsable o el administrador puede mover este consumo.';
  end if;

  perform m.id
    from public.mesas m
   where m.restaurante_id = p_restaurante_id
     and m.id in (p_mesa_origen_id, p_mesa_destino_id)
   order by m.id
   for update;

  select m.* into v_origen
    from public.mesas m
   where m.id = p_mesa_origen_id and m.restaurante_id = p_restaurante_id;
  select m.* into v_destino
    from public.mesas m
   where m.id = p_mesa_destino_id and m.restaurante_id = p_restaurante_id;
  if v_origen.id is null or v_destino.id is null then
    raise exception 'Una de las mesas no pertenece al restaurante.';
  end if;
  if v_origen.estado <> 'ocupada' then
    raise exception 'La mesa de origen ya no está ocupada.';
  end if;
  if v_destino.estado <> 'libre' or v_destino.mesero_responsable_id is not null then
    raise exception 'La mesa de destino debe estar libre y sin responsable.';
  end if;

  select exists (
    select 1 from public.pedidos p
     where p.restaurante_id = p_restaurante_id
       and p.mesa_id = p_mesa_destino_id
       and p.estado <> 'anulado'
       and exists (select 1 from public.pedido_items pi where pi.pedido_id = p.id and pi.anulado is not true)
       and not exists (
         select 1 from public.cuenta_pedidos cp join public.cuentas c on c.id = cp.cuenta_id
          where cp.pedido_id = p.id and c.estado = 'pagada'
       )
  ) into v_hay_consumo;
  if v_hay_consumo then
    raise exception 'La mesa de destino debe estar libre y sin consumo pendiente.';
  end if;

  select exists (
    select 1 from public.pedidos p
     where p.restaurante_id = p_restaurante_id
       and p.mesa_id = p_mesa_origen_id
       and p.estado <> 'anulado'
       and exists (select 1 from public.pedido_items pi where pi.pedido_id = p.id and pi.anulado is not true)
       and not exists (
         select 1 from public.cuenta_pedidos cp join public.cuentas c on c.id = cp.cuenta_id
          where cp.pedido_id = p.id and c.estado = 'pagada'
       )
  ) into v_hay_consumo;
  if not v_hay_consumo then
    raise exception 'La mesa no tiene consumo pendiente para mover.';
  end if;

  if v_rol = 'mesero' then
    if v_origen.mesero_responsable_id is not null and v_origen.mesero_responsable_id <> auth.uid() then
      raise exception 'Esta mesa está asignada a otro mesero.';
    end if;
    select exists (
      select 1 from public.pedidos p
       where p.restaurante_id = p_restaurante_id
         and p.mesa_id = p_mesa_origen_id
         and p.estado <> 'anulado'
         and p.mesero_id <> auth.uid()
         and exists (select 1 from public.pedido_items pi where pi.pedido_id = p.id and pi.anulado is not true)
         and not exists (
           select 1 from public.cuenta_pedidos cp join public.cuentas c on c.id = cp.cuenta_id
            where cp.pedido_id = p.id and c.estado = 'pagada'
         )
    ) into v_hay_comanda_ajena;
    select exists (
      select 1 from public.pedidos p
       where p.restaurante_id = p_restaurante_id
         and p.mesa_id = p_mesa_origen_id
         and p.estado <> 'anulado'
         and p.mesero_id = auth.uid()
         and exists (select 1 from public.pedido_items pi where pi.pedido_id = p.id and pi.anulado is not true)
         and not exists (
           select 1 from public.cuenta_pedidos cp join public.cuentas c on c.id = cp.cuenta_id
            where cp.pedido_id = p.id and c.estado = 'pagada'
         )
    ) into v_hay_comanda_propia;
    if v_origen.mesero_responsable_id is null and (v_hay_comanda_ajena or not v_hay_comanda_propia) then
      raise exception 'Solo el administrador puede mover esta mesa porque tiene comandas de otro mesero.';
    end if;
  end if;

  v_responsable := v_origen.mesero_responsable_id;
  if v_responsable is null and v_rol = 'mesero' then
    v_responsable := auth.uid();
  elsif v_responsable is null and v_rol = 'admin_restaurante' then
    select p.mesero_id into v_responsable
      from public.pedidos p
     where p.restaurante_id = p_restaurante_id
       and p.mesa_id = p_mesa_origen_id
       and p.estado <> 'anulado'
       and exists (select 1 from public.pedido_items pi where pi.pedido_id = p.id and pi.anulado is not true)
       and not exists (
         select 1 from public.cuenta_pedidos cp join public.cuentas c on c.id = cp.cuenta_id
          where cp.pedido_id = p.id and c.estado = 'pagada'
       )
     order by p.created_at
     limit 1;
  end if;

  update public.pedidos p
     set mesa_id = p_mesa_destino_id, updated_at = now()
   where p.restaurante_id = p_restaurante_id
     and p.mesa_id = p_mesa_origen_id
     and p.estado <> 'anulado'
     and exists (select 1 from public.pedido_items pi where pi.pedido_id = p.id and pi.anulado is not true)
     and not exists (
       select 1 from public.cuenta_pedidos cp join public.cuentas c on c.id = cp.cuenta_id
        where cp.pedido_id = p.id and c.estado = 'pagada'
     );
  get diagnostics v_pedidos_movidos = row_count;
  if v_pedidos_movidos = 0 then
    raise exception 'No se encontraron comandas pendientes para mover.';
  end if;

  update public.mesas set estado = 'libre', mesero_responsable_id = null
   where id = p_mesa_origen_id and restaurante_id = p_restaurante_id;
  update public.mesas
     set estado = 'ocupada', mesero_responsable_id = v_responsable
   where id = p_mesa_destino_id and restaurante_id = p_restaurante_id;
end;
$$;

-- Restaura una boleta pagada existente, usando los snapshots capturados cuando
-- se emitió. Para cuentas antiguas sin snapshots usa el mejor dato histórico.
create or replace function public.reimprimir_boleta(
  p_restaurante_id uuid,
  p_cuenta_id uuid,
  p_pin text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rol text;
  v_cuenta public.cuentas%rowtype;
  v_restaurante record;
  v_mesa_nombre text;
  v_mesero_nombre text;
  v_items jsonb;
  v_intentos public.reimpresion_pin_intentos%rowtype;
  v_mensaje text;
begin
  perform public.validar_acceso_restaurante(p_restaurante_id);

  select u.rol::text into v_rol
    from public.usuarios u
   where u.id = auth.uid()
     and u.restaurante_id = p_restaurante_id
     and coalesce(u.activo, true);
  if coalesce(v_rol, '') not in ('admin_restaurante', 'cajero') then
    raise exception 'Solo el administrador o el cajero pueden reimprimir boletas.';
  end if;

  if v_rol = 'cajero' then
    if not exists (select 1 from public.restaurante_pins rp where rp.restaurante_id = p_restaurante_id) then
      raise exception 'El administrador debe configurar un PIN de autorización antes de permitir reimpresiones desde caja.';
    end if;

    insert into public.reimpresion_pin_intentos (restaurante_id, usuario_id)
    values (p_restaurante_id, auth.uid())
    on conflict (restaurante_id, usuario_id) do nothing;
    select i.* into v_intentos
      from public.reimpresion_pin_intentos i
     where i.restaurante_id = p_restaurante_id and i.usuario_id = auth.uid()
     for update;
    if v_intentos.bloqueado_hasta is not null and v_intentos.bloqueado_hasta > now() then
      raise exception 'Se superó el número de intentos. Espera 15 minutos o pide al administrador que autorice la reimpresión.';
    end if;

    begin
      perform public.validar_pin_autorizacion(p_restaurante_id, p_pin);
    exception when others then
      get stacked diagnostics v_mensaje = message_text;
      if v_mensaje = 'PIN de autorizacion incorrecto' then
        update public.reimpresion_pin_intentos
           set intentos_fallidos = least(intentos_fallidos + 1, 5),
               bloqueado_hasta = case when intentos_fallidos >= 4 then now() + interval '15 minutes' else null end,
               actualizado_at = now()
         where restaurante_id = p_restaurante_id and usuario_id = auth.uid();
        raise exception 'PIN del administrador incorrecto.' using errcode = '42501';
      end if;
      raise;
    end;
    update public.reimpresion_pin_intentos
       set intentos_fallidos = 0, bloqueado_hasta = null, actualizado_at = now()
     where restaurante_id = p_restaurante_id and usuario_id = auth.uid();
  end if;

  select c.* into v_cuenta
    from public.cuentas c
   where c.id = p_cuenta_id
     and c.restaurante_id = p_restaurante_id
     and c.estado = 'pagada';
  if not found then
    raise exception 'Solo se puede reimprimir una boleta pagada.';
  end if;

  select r.nombre, r.direccion, r.ruc, r.telefono into v_restaurante
    from public.restaurantes r where r.id = p_restaurante_id;
  select m.nombre into v_mesa_nombre
    from public.mesas m where m.id = v_cuenta.mesa_id and m.restaurante_id = p_restaurante_id;
  if v_cuenta.mesero_nombre_snapshot is null then
    select u.nombre into v_mesero_nombre
      from public.cuenta_pedidos cp
      join public.pedidos p on p.id = cp.pedido_id
      join public.usuarios u on u.id = p.mesero_id
     where cp.cuenta_id = v_cuenta.id
     order by p.created_at
     limit 1;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', pi.id,
        'pedido_id', pi.pedido_id,
        'producto_id', pi.producto_id,
        'nombre_producto', pi.nombre_producto,
        'cantidad', pi.cantidad,
        'precio_unitario', pi.precio_unitario,
        'nota', pi.nota,
        'anulado', pi.anulado,
        'es_bebida', pi.es_bebida
      ) order by p.created_at, pi.created_at, pi.id
    ),
    '[]'::jsonb
  ) into v_items
    from public.cuenta_pedidos cp
    join public.pedidos p on p.id = cp.pedido_id and p.restaurante_id = p_restaurante_id
    join public.pedido_items pi on pi.pedido_id = p.id
   where cp.cuenta_id = v_cuenta.id and pi.anulado is not true;
  if jsonb_array_length(v_items) = 0 then
    raise exception 'La boleta no tiene ítems disponibles para reimprimir.';
  end if;

  return jsonb_build_object(
    'cuenta', to_jsonb(v_cuenta),
    'restauranteNombre', coalesce(v_cuenta.restaurante_nombre_snapshot, v_restaurante.nombre, 'Restaurante'),
    'direccion', coalesce(v_cuenta.restaurante_direccion_snapshot, v_restaurante.direccion),
    'ruc', coalesce(v_cuenta.restaurante_ruc_snapshot, v_restaurante.ruc),
    'telefono', coalesce(v_cuenta.restaurante_telefono_snapshot, v_restaurante.telefono),
    'mesaNombre', coalesce(v_cuenta.mesa_nombre_snapshot, v_mesa_nombre, 'Mesa'),
    'meseroNombre', coalesce(v_cuenta.mesero_nombre_snapshot, v_mesero_nombre),
    'items', v_items
  );
end;
$$;

-- Ninguna actualización directa puede escribir la columna responsable.
revoke update on public.mesas from authenticated;
revoke update (mesero_responsable_id) on public.mesas from authenticated;
grant update (nombre, zona_id, estado) on public.mesas to authenticated;

revoke all on function public.capturar_snapshot_boleta() from public, anon, authenticated;
revoke all on function public.limpiar_responsable_mesa_libre() from public, anon, authenticated;
revoke all on function public.validar_responsable_nueva_comanda() from public, anon, authenticated;
revoke all on function public.validar_responsable_edicion_item() from public, anon, authenticated;
revoke all on function public.asignar_mesa_mesero(uuid, uuid, uuid) from public, anon;
revoke all on function public.mover_consumo_mesa(uuid, uuid, uuid) from public, anon;
revoke all on function public.reimprimir_boleta(uuid, uuid, text) from public, anon;
grant execute on function public.asignar_mesa_mesero(uuid, uuid, uuid) to authenticated;
grant execute on function public.mover_consumo_mesa(uuid, uuid, uuid) to authenticated;
grant execute on function public.reimprimir_boleta(uuid, uuid, text) to authenticated;

-- Verificación puntual de funciones y privilegios del cambio.
select p.proname,
       has_function_privilege('anon', p.oid, 'execute') as anon_puede,
       has_function_privilege('authenticated', p.oid, 'execute') as usuario_puede
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('asignar_mesa_mesero', 'mover_consumo_mesa', 'reimprimir_boleta')
 order by p.proname;
