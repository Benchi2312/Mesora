-- Refuerza ambos traslados de mesa con motivo auditable y PIN del restaurante.
-- El PIN solo es obligatorio cuando el administrador configuró uno.
begin;

drop function if exists public.asignar_mesa_mesero(uuid, uuid, uuid);
create function public.asignar_mesa_mesero(
  p_restaurante_id uuid,
  p_mesa_id uuid,
  p_mesero_id uuid,
  p_pin text default null,
  p_motivo text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rol text;
  v_actor_nombre text;
  v_restaurante_nombre text;
  v_mesero_destino_nombre text;
  v_mesero_anterior_nombre text;
  v_motivo text := btrim(coalesce(p_motivo, ''));
  v_mesa public.mesas%rowtype;
  v_hay_consumo boolean;
  v_hay_comanda_ajena boolean;
  v_hay_comanda_propia boolean;
begin
  perform public.validar_acceso_restaurante(p_restaurante_id);

  select u.rol::text, u.nombre
    into v_rol, v_actor_nombre
    from public.usuarios u
   where u.id = auth.uid()
     and u.restaurante_id = p_restaurante_id
     and coalesce(u.activo, true);
  if coalesce(v_rol, '') not in ('mesero', 'admin_restaurante') then
    raise exception 'Solo el mesero responsable o el administrador puede pasar esta mesa.';
  end if;

  if char_length(v_motivo) < 5 or char_length(v_motivo) > 300 then
    raise exception 'Escribe un motivo de entre 5 y 300 caracteres.';
  end if;

  select m.* into v_mesa
    from public.mesas m
   where m.id = p_mesa_id and m.restaurante_id = p_restaurante_id
   for update;
  if not found or v_mesa.estado <> 'ocupada' then
    raise exception 'La mesa no está ocupada.';
  end if;

  select u.nombre into v_mesero_destino_nombre
    from public.usuarios u
   where u.id = p_mesero_id
     and u.restaurante_id = p_restaurante_id
     and u.rol::text = 'mesero'
     and coalesce(u.activo, true);
  if not found then
    raise exception 'El mesero elegido no está activo en este restaurante.';
  end if;
  if v_mesa.mesero_responsable_id = p_mesero_id then
    raise exception 'Esa persona ya es responsable de la mesa.';
  end if;

  select u.nombre into v_mesero_anterior_nombre
    from public.usuarios u
   where u.id = v_mesa.mesero_responsable_id
     and u.restaurante_id = p_restaurante_id;

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

  perform public.validar_pin_autorizacion(p_restaurante_id, p_pin);

  update public.mesas
     set mesero_responsable_id = p_mesero_id
   where id = p_mesa_id and restaurante_id = p_restaurante_id;

  select r.nombre into v_restaurante_nombre from public.restaurantes r where r.id = p_restaurante_id;
  insert into public.audit_logs (
    actor_id, actor_rol, actor_nombre, restaurante_id, restaurante_nombre,
    entidad, entidad_id, accion, descripcion, detalle
  ) values (
    auth.uid(), v_rol, v_actor_nombre, p_restaurante_id, v_restaurante_nombre,
    'mesa', p_mesa_id, 'mesa_transferir_responsable',
    'Responsabilidad de ' || v_mesa.nombre || ' transferida' ||
      case when v_mesero_anterior_nombre is null then '' else ' de ' || v_mesero_anterior_nombre end ||
      ' a ' || v_mesero_destino_nombre || '.',
    jsonb_build_object(
      'mesa_id', p_mesa_id,
      'mesa_nombre', v_mesa.nombre,
      'mesero_anterior_id', v_mesa.mesero_responsable_id,
      'mesero_anterior_nombre', v_mesero_anterior_nombre,
      'mesero_nuevo_id', p_mesero_id,
      'mesero_nuevo_nombre', v_mesero_destino_nombre,
      'motivo', v_motivo
    )
  );
end;
$$;

drop function if exists public.mover_consumo_mesa(uuid, uuid, uuid);
create function public.mover_consumo_mesa(
  p_restaurante_id uuid,
  p_mesa_origen_id uuid,
  p_mesa_destino_id uuid,
  p_pin text default null,
  p_motivo text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rol text;
  v_actor_nombre text;
  v_restaurante_nombre text;
  v_origen public.mesas%rowtype;
  v_destino public.mesas%rowtype;
  v_responsable uuid;
  v_responsable_nombre text;
  v_hay_consumo boolean;
  v_hay_comanda_ajena boolean;
  v_hay_comanda_propia boolean;
  v_pedidos_movidos integer;
  v_motivo text := btrim(coalesce(p_motivo, ''));
begin
  perform public.validar_acceso_restaurante(p_restaurante_id);
  if p_mesa_origen_id = p_mesa_destino_id then
    raise exception 'Elige una mesa distinta.';
  end if;

  select u.rol::text, u.nombre into v_rol, v_actor_nombre
    from public.usuarios u
   where u.id = auth.uid()
     and u.restaurante_id = p_restaurante_id
     and coalesce(u.activo, true);
  if coalesce(v_rol, '') not in ('mesero', 'admin_restaurante') then
    raise exception 'Solo el mesero responsable o el administrador puede mover este consumo.';
  end if;
  if char_length(v_motivo) < 5 or char_length(v_motivo) > 300 then
    raise exception 'Escribe un motivo de entre 5 y 300 caracteres.';
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

  perform public.validar_pin_autorizacion(p_restaurante_id, p_pin);

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
  select u.nombre into v_responsable_nombre
    from public.usuarios u where u.id = v_responsable and u.restaurante_id = p_restaurante_id;

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

  select r.nombre into v_restaurante_nombre from public.restaurantes r where r.id = p_restaurante_id;
  insert into public.audit_logs (
    actor_id, actor_rol, actor_nombre, restaurante_id, restaurante_nombre,
    entidad, entidad_id, accion, descripcion, detalle
  ) values (
    auth.uid(), v_rol, v_actor_nombre, p_restaurante_id, v_restaurante_nombre,
    'mesa', p_mesa_origen_id, 'mesa_mover_consumo',
    'Consumo movido de ' || v_origen.nombre || ' a ' || v_destino.nombre || '.',
    jsonb_build_object(
      'mesa_origen_id', p_mesa_origen_id,
      'mesa_origen_nombre', v_origen.nombre,
      'mesa_destino_id', p_mesa_destino_id,
      'mesa_destino_nombre', v_destino.nombre,
      'mesero_responsable_id', v_responsable,
      'mesero_responsable_nombre', v_responsable_nombre,
      'motivo', v_motivo,
      'pedidos_movidos', v_pedidos_movidos
    )
  );
end;
$$;

revoke all on function public.asignar_mesa_mesero(uuid, uuid, uuid, text, text) from public, anon;
revoke all on function public.mover_consumo_mesa(uuid, uuid, uuid, text, text) from public, anon;
grant execute on function public.asignar_mesa_mesero(uuid, uuid, uuid, text, text) to authenticated;
grant execute on function public.mover_consumo_mesa(uuid, uuid, uuid, text, text) to authenticated;

commit;
