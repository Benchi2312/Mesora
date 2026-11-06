-- Registra anulaciones de ítems, boletas y cierres de caja sin abrir permisos
-- de escritura para clientes. Los triggers corren en la misma transacción que
-- la operación: si la auditoría no se guarda, tampoco se confirma el cambio.
begin;

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
    'Ítem «' || new.nombre_producto || '» anulado en ' || coalesce(v_mesa_nombre, 'una mesa') || '.',
    jsonb_build_object(
      'pedido_id', new.pedido_id,
      'mesa_id', v_mesa_id,
      'mesa_nombre', v_mesa_nombre,
      'producto', new.nombre_producto,
      'cantidad', new.cantidad,
      'precio_unitario', new.precio_unitario,
      'anulado_at', new.anulado_at
    )
  );
  return new;
end;
$$;

drop trigger if exists trg_auditar_anulacion_item_operativa on public.pedido_items;
create trigger trg_auditar_anulacion_item_operativa
  after update of anulado on public.pedido_items
  for each row execute function public.auditar_anulacion_item_operativa();
revoke all on function public.auditar_anulacion_item_operativa() from public, anon, authenticated;

create or replace function public.auditar_anulacion_cuenta_operativa()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_restaurante_nombre text;
  v_mesa_nombre text;
  v_actor_id uuid := coalesce(new.anulada_por, auth.uid());
  v_actor_rol text;
  v_actor_nombre text;
begin
  if old.estado <> 'pagada' or new.estado <> 'anulada' then
    return new;
  end if;

  select r.nombre into v_restaurante_nombre
    from public.restaurantes r where r.id = new.restaurante_id;
  select m.nombre into v_mesa_nombre
    from public.mesas m where m.id = new.mesa_id and m.restaurante_id = new.restaurante_id;
  select u.rol::text, u.nombre into v_actor_rol, v_actor_nombre
    from public.usuarios u where u.id = v_actor_id;

  insert into public.audit_logs (
    actor_id, actor_rol, actor_nombre, restaurante_id, restaurante_nombre,
    entidad, entidad_id, accion, descripcion, detalle
  ) values (
    v_actor_id, v_actor_rol, v_actor_nombre, new.restaurante_id, v_restaurante_nombre,
    'cuenta', new.id, 'cuenta_anular',
    'Boleta ' || coalesce(new.numero, new.id::text) || ' anulada; se registró la devolución.',
    jsonb_build_object(
      'numero', new.numero,
      'mesa_id', new.mesa_id,
      'mesa_nombre', v_mesa_nombre,
      'total', new.total,
      'propina', coalesce(new.propina, 0),
      'monto_reembolsado', new.monto_reembolsado,
      'motivo', new.motivo_anulacion,
      'anulada_at', new.anulada_at
    )
  );
  return new;
end;
$$;

drop trigger if exists trg_auditar_anulacion_cuenta_operativa on public.cuentas;
create trigger trg_auditar_anulacion_cuenta_operativa
  after update of estado on public.cuentas
  for each row execute function public.auditar_anulacion_cuenta_operativa();
revoke all on function public.auditar_anulacion_cuenta_operativa() from public, anon, authenticated;

create or replace function public.auditar_cierre_caja_operativo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_restaurante_nombre text;
  v_actor_id uuid := coalesce(new.usuario_cierre_id, auth.uid());
  v_actor_rol text;
  v_actor_nombre text;
begin
  if old.estado <> 'abierto' or new.estado <> 'cerrado' then
    return new;
  end if;

  select r.nombre into v_restaurante_nombre
    from public.restaurantes r where r.id = new.restaurante_id;
  select u.rol::text, u.nombre into v_actor_rol, v_actor_nombre
    from public.usuarios u where u.id = v_actor_id;

  insert into public.audit_logs (
    actor_id, actor_rol, actor_nombre, restaurante_id, restaurante_nombre,
    entidad, entidad_id, accion, descripcion, detalle
  ) values (
    v_actor_id, v_actor_rol, v_actor_nombre, new.restaurante_id, v_restaurante_nombre,
    'caja_turno', new.id, 'caja_turno_cerrar',
    'Turno de caja cerrado con el arqueo declarado.',
    jsonb_build_object(
      'turno_id', new.id,
      'monto_inicial', new.monto_inicial,
      'monto_declarado', new.monto_declarado,
      'monto_esperado', new.monto_esperado,
      'diferencia', new.diferencia,
      'observaciones', new.observaciones,
      'fecha_cierre', new.fecha_cierre
    )
  );
  return new;
end;
$$;

drop trigger if exists trg_auditar_cierre_caja_operativo on public.caja_turnos;
create trigger trg_auditar_cierre_caja_operativo
  after update of estado on public.caja_turnos
  for each row execute function public.auditar_cierre_caja_operativo();
revoke all on function public.auditar_cierre_caja_operativo() from public, anon, authenticated;

commit;
