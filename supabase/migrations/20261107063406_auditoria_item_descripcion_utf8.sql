-- Corrige la codificación de la descripción de anulaciones nuevas.
-- No reescribe las filas históricas; la interfaz las normaliza al mostrarlas.
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
    U&'\00CDtem \00AB' || new.nombre_producto || U&'\00BB anulado en ' || coalesce(v_mesa_nombre, 'una mesa') || '.',
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

revoke all on function public.auditar_anulacion_item_operativa() from public, anon, authenticated;

commit;
