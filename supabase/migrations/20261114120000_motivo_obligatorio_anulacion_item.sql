-- Motivo obligatorio y persistente para anulaciones nuevas de ítems.
-- Los registros históricos conservan motivo_anulacion = NULL.
begin;

alter table public.pedido_items
  add column if not exists motivo_anulacion text;

comment on column public.pedido_items.motivo_anulacion is
  'Motivo obligatorio para anulaciones nuevas de ítems; NULL se conserva en registros históricos.';

create or replace function public.anular_item_comanda(
  p_restaurante_id uuid,
  p_pedido_id uuid,
  p_item_id uuid,
  p_motivo text,
  p_pin text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pedido public.pedidos%rowtype;
  v_item public.pedido_items%rowtype;
  v_motivo text := nullif(btrim(p_motivo), '');
begin
  perform public.validar_acceso_restaurante(p_restaurante_id);

  if not exists (
    select 1 from public.usuarios
     where id = auth.uid()
       and restaurante_id = p_restaurante_id
       and rol in ('mesero', 'admin_restaurante')
  ) then
    raise exception 'Sin permiso para anular ítems de este restaurante';
  end if;

  if v_motivo is null then
    raise exception 'El motivo de la anulación es obligatorio';
  end if;
  if char_length(v_motivo) > 200 then
    raise exception 'El motivo de la anulación no puede superar 200 caracteres';
  end if;

  perform public.validar_pin_autorizacion(p_restaurante_id, p_pin);

  select * into v_pedido
    from public.pedidos
   where id = p_pedido_id and restaurante_id = p_restaurante_id
     for update;

  if v_pedido.id is null then
    raise exception 'La comanda no pertenece al restaurante';
  end if;

  select * into v_item
    from public.pedido_items
   where id = p_item_id and pedido_id = p_pedido_id
     for update;

  if v_item.id is null then
    raise exception 'El ítem no pertenece a esta comanda';
  end if;

  -- El bloqueo de fila serializa intentos concurrentes. Un segundo intento
  -- devuelve éxito sin cambiar motivo, actor, fecha ni volver a disparar auditoría.
  if v_item.anulado then
    return;
  end if;

  if v_pedido.estado = 'anulado' then
    raise exception 'La comanda está anulada';
  end if;

  if exists (
    select 1
      from public.cuenta_pedidos cp
      join public.cuentas c on c.id = cp.cuenta_id
     where cp.pedido_id = p_pedido_id
       and c.estado = 'pagada'
  ) then
    raise exception 'La comanda ya fue cobrada';
  end if;

  update public.pedido_items
     set anulado = true,
         anulado_por = auth.uid(),
         anulado_at = now(),
         motivo_anulacion = v_motivo
   where id = p_item_id;

  update public.pedidos set updated_at = now() where id = p_pedido_id;

  if not exists (
    select 1 from public.pedido_items
     where pedido_id = p_pedido_id and anulado = false
  ) then
    update public.pedidos set estado = 'anulado' where id = p_pedido_id;
  end if;

  if not exists (
    select 1
      from public.pedidos pd
     where pd.mesa_id = v_pedido.mesa_id
       and pd.restaurante_id = p_restaurante_id
       and pd.estado <> 'anulado'
       and not exists (
         select 1
           from public.cuenta_pedidos cp
           join public.cuentas c on c.id = cp.cuenta_id
          where cp.pedido_id = pd.id
            and c.estado = 'pagada'
       )
  ) then
    update public.mesas
       set estado = 'libre'
     where id = v_pedido.mesa_id
       and restaurante_id = p_restaurante_id;
  end if;
end;
$$;

-- El cliente anterior no enviaba motivo: conserva un error seguro y explícito,
-- sin dejar una firma antigua que pueda anular por fuera de la nueva validación.
create or replace function public.anular_item_comanda(
  p_restaurante_id uuid,
  p_pedido_id uuid,
  p_item_id uuid,
  p_pin text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.validar_acceso_restaurante(p_restaurante_id);
  if not exists (
    select 1 from public.usuarios
     where id = auth.uid()
       and restaurante_id = p_restaurante_id
       and rol in ('mesero', 'admin_restaurante')
  ) then
    raise exception 'Sin permiso para anular ítems de este restaurante';
  end if;
  raise exception 'El motivo de la anulación es obligatorio';
end;
$$;

create or replace function public.auditar_anulacion_item_operativa()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_restaurante_id uuid;
  v_restaurante_nombre text;
  v_mesa_id uuid;
  v_mesa_nombre text;
  v_actor_id uuid := coalesce(new.anulado_por, auth.uid());
  v_actor_rol text;
  v_actor_nombre text;
begin
  if old.anulado is true or new.anulado is not true then
    return new;
  end if;

  select p.restaurante_id, r.nombre, p.mesa_id, m.nombre
    into v_restaurante_id, v_restaurante_nombre, v_mesa_id, v_mesa_nombre
    from public.pedidos p
    join public.restaurantes r on r.id = p.restaurante_id
    left join public.mesas m on m.id = p.mesa_id and m.restaurante_id = p.restaurante_id
   where p.id = new.pedido_id;

  select u.rol::text, u.nombre into v_actor_rol, v_actor_nombre
    from public.usuarios u where u.id = v_actor_id;

  insert into public.audit_logs (
    actor_id, actor_rol, actor_nombre, restaurante_id, restaurante_nombre,
    entidad, entidad_id, accion, descripcion, detalle
  ) values (
    v_actor_id, v_actor_rol, v_actor_nombre, v_restaurante_id, v_restaurante_nombre,
    'pedido_item', new.id, 'comanda_item_anular',
    U&'\00CDtem \00AB' || new.nombre_producto || U&'\00BB anulado en ' || coalesce(v_mesa_nombre, 'una mesa') || '.',
    jsonb_build_object(
      'pedido_id', new.pedido_id,
      'mesa_id', v_mesa_id,
      'mesa_nombre', v_mesa_nombre,
      'producto', new.nombre_producto,
      'cantidad', new.cantidad,
      'precio_unitario', new.precio_unitario,
      'motivo', new.motivo_anulacion,
      'anulado_at', new.anulado_at
    )
  );
  return new;
end;
$$;

revoke all on function public.anular_item_comanda(uuid, uuid, uuid, text, text) from public, anon;
grant execute on function public.anular_item_comanda(uuid, uuid, uuid, text, text) to authenticated;
revoke all on function public.anular_item_comanda(uuid, uuid, uuid, text) from public, anon;
grant execute on function public.anular_item_comanda(uuid, uuid, uuid, text) to authenticated;
revoke all on function public.auditar_anulacion_item_operativa() from public, anon, authenticated;

commit;
