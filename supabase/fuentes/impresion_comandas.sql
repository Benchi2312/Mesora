-- Mesora · Bloque 3: estaciones de preparación e impresión de comandas.
-- No altera pagos, boletas, roles ni políticas existentes.
begin;

alter table public.productos
  add column if not exists estacion text;

update public.productos
   set estacion = case when coalesce(es_bebida, false) then 'bar' else 'cocina' end
 where estacion is null or estacion not in ('cocina', 'bar', 'otros');

alter table public.productos
  alter column estacion set default 'cocina',
  alter column estacion set not null;

alter table public.productos
  drop constraint if exists productos_estacion_check;
alter table public.productos
  add constraint productos_estacion_check check (estacion in ('cocina', 'bar', 'otros'));

alter table public.pedido_items
  add column if not exists estacion text;

update public.pedido_items pi
   set estacion = case when coalesce(pi.es_bebida, false) then 'bar' else pr.estacion end
  from public.productos pr
 where pi.producto_id = pr.id
   and pi.estacion is null;

update public.pedido_items
   set estacion = case when coalesce(es_bebida, false) then 'bar' else 'cocina' end
 where estacion is null or estacion not in ('cocina', 'bar', 'otros');

alter table public.pedido_items
  alter column estacion set default 'cocina',
  alter column estacion set not null;

alter table public.pedido_items
  drop constraint if exists pedido_items_estacion_check;
alter table public.pedido_items
  add constraint pedido_items_estacion_check check (estacion in ('cocina', 'bar', 'otros'));

-- Snapshot inmutable de la estación al crear el ítem; cambiar el menú después
-- no mueve comandas históricas de una estación a otra.
create or replace function public.fijar_estacion_snapshot_pedido_item()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.producto_id is null then
    new.estacion := coalesce(new.estacion, 'cocina');
    return new;
  end if;

  select pr.estacion
    into new.estacion
    from public.productos pr
    join public.pedidos p
      on p.id = new.pedido_id
     and p.restaurante_id = pr.restaurante_id
   where pr.id = new.producto_id;

  if not found then
    raise exception 'El producto no pertenece a la comanda.';
  end if;
  return new;
end;
$$;

drop trigger if exists pedido_items_fijar_estacion on public.pedido_items;
create trigger pedido_items_fijar_estacion
before insert or update of producto_id on public.pedido_items
for each row execute function public.fijar_estacion_snapshot_pedido_item();
revoke all on function public.fijar_estacion_snapshot_pedido_item() from public, anon, authenticated;

-- La solicitud UUID hace idempotente el registro aun si la respuesta de red se
-- pierde después de que Postgres guardó la auditoría.
create unique index if not exists audit_logs_comanda_impresion_solicitud_unique
  on public.audit_logs ((detalle ->> 'solicitud_id'))
  where accion in ('comanda_imprimir', 'comanda_reimprimir')
    and detalle ? 'solicitud_id';

create or replace function public.registrar_impresion_comanda(
  p_restaurante_id uuid,
  p_pedido_id uuid,
  p_estacion text,
  p_solicitud_id uuid,
  p_motivo text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rol text;
  v_actor_nombre text;
  v_restaurante_nombre text;
  v_mesa_id uuid;
  v_mesa_nombre text;
  v_estado_pedido text;
  v_accion_existente text;
  v_es_reimpresion boolean;
  v_accion text;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
begin
  if auth.uid() is null then
    raise exception 'Inicia sesión para registrar la impresión.';
  end if;
  if p_solicitud_id is null then
    raise exception 'No se pudo identificar esta solicitud de impresión. Inténtalo de nuevo.';
  end if;
  if p_estacion is null or p_estacion not in ('cocina', 'bar', 'otros') then
    raise exception 'Selecciona una estación válida.';
  end if;

  perform public.validar_acceso_restaurante(p_restaurante_id);

  select u.rol::text, u.nombre
    into v_rol, v_actor_nombre
    from public.usuarios u
   where u.id = auth.uid()
     and u.restaurante_id = p_restaurante_id
     and coalesce(u.activo, true);
  if coalesce(v_rol, '') not in ('admin_restaurante', 'mesero', 'cocina') then
    raise exception 'Tu perfil no tiene permiso para imprimir comandas.';
  end if;

  select p.mesa_id, p.estado, r.nombre, m.nombre
    into v_mesa_id, v_estado_pedido, v_restaurante_nombre, v_mesa_nombre
    from public.pedidos p
    join public.restaurantes r on r.id = p.restaurante_id
    join public.mesas m on m.id = p.mesa_id and m.restaurante_id = p.restaurante_id
   where p.id = p_pedido_id
     and p.restaurante_id = p_restaurante_id
   for update of p;
  if not found then
    raise exception 'No se encontró la comanda de este restaurante.';
  end if;
  if v_estado_pedido = 'anulado' then
    raise exception 'La comanda está anulada y no se puede imprimir.';
  end if;
  if not exists (
    select 1 from public.pedido_items pi
     where pi.pedido_id = p_pedido_id
       and pi.estacion = p_estacion
       and pi.anulado is not true
  ) then
    raise exception 'Esta comanda no tiene productos pendientes para esa estación.';
  end if;

  -- Repetir el mismo request_id devuelve el resultado previo sin crear otra fila.
  select l.accion into v_accion_existente
    from public.audit_logs l
   where l.detalle ->> 'solicitud_id' = p_solicitud_id::text
     and l.actor_id = auth.uid()
     and l.restaurante_id = p_restaurante_id
     and l.entidad = 'pedido'
     and l.entidad_id = p_pedido_id
     and l.detalle ->> 'estacion' = p_estacion
   limit 1;
  if found then
    return jsonb_build_object('estado', 'registrada', 'accion', v_accion_existente);
  end if;
  if exists (select 1 from public.audit_logs l where l.detalle ->> 'solicitud_id' = p_solicitud_id::text) then
    raise exception 'La solicitud de impresión ya se usó para otra comanda.';
  end if;

  select exists (
    select 1 from public.audit_logs l
     where l.restaurante_id = p_restaurante_id
       and l.entidad = 'pedido'
       and l.entidad_id = p_pedido_id
       and l.accion in ('comanda_imprimir', 'comanda_reimprimir')
       and l.detalle ->> 'estacion' = p_estacion
  ) into v_es_reimpresion;

  if v_es_reimpresion and v_motivo is null then
    return jsonb_build_object('estado', 'requiere_motivo');
  end if;
  if v_es_reimpresion and (length(v_motivo) < 5 or length(v_motivo) > 300) then
    raise exception 'Escribe un motivo de reimpresión de entre 5 y 300 caracteres.';
  end if;

  v_accion := case when v_es_reimpresion then 'comanda_reimprimir' else 'comanda_imprimir' end;
  insert into public.audit_logs (
    actor_id, actor_rol, actor_nombre, restaurante_id, restaurante_nombre,
    entidad, entidad_id, accion, descripcion, detalle
  ) values (
    auth.uid(), v_rol, v_actor_nombre, p_restaurante_id, v_restaurante_nombre,
    'pedido', p_pedido_id, v_accion,
    case when v_es_reimpresion then 'Comanda reimpresa en ' else 'Comanda enviada a impresión en ' end
      || initcap(p_estacion) || ', mesa ' || v_mesa_nombre || '.',
    jsonb_build_object(
      'solicitud_id', p_solicitud_id,
      'pedido_id', p_pedido_id,
      'mesa_id', v_mesa_id,
      'mesa_nombre', v_mesa_nombre,
      'estacion', p_estacion,
      'motivo', v_motivo
    )
  );
  return jsonb_build_object('estado', 'registrada', 'accion', v_accion);
end;
$$;

revoke all on function public.registrar_impresion_comanda(uuid, uuid, text, uuid, text) from public;
revoke all on function public.registrar_impresion_comanda(uuid, uuid, text, uuid, text) from anon;
grant execute on function public.registrar_impresion_comanda(uuid, uuid, text, uuid, text) to authenticated;

commit;
