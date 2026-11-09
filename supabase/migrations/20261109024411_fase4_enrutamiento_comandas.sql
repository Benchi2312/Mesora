-- Mesora · Fase 4: enrutamiento de comandas según configuración operativa.
-- La ruta y el estado de cada estación quedan congelados al crear la comanda.
-- Las impresoras quedan en cola manual: esta migración no imprime ni inicia agentes.
begin;

-- Los productos nuevos pueden heredar la estación de su categoría. Los valores
-- explícitos existentes se conservan y siguen teniendo prioridad.
alter table public.productos
  alter column estacion drop default,
  alter column estacion drop not null;

-- Snapshot autoritativo de estación: producto explícito > categoría > bebida > cocina.
create or replace function public.fijar_estacion_snapshot_pedido_item()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_restaurante_id uuid;
begin
  if new.producto_id is null then
    new.estacion := coalesce(new.estacion, case when coalesce(new.es_bebida, false) then 'bar' else 'cocina' end);
    return new;
  end if;

  select coalesce(
           pr.estacion,
           e.codigo,
           case when coalesce(pr.es_bebida, false) then 'bar' else 'cocina' end
         ), p.restaurante_id
    into new.estacion, v_restaurante_id
    from public.productos pr
    join public.pedidos p on p.id = new.pedido_id and p.restaurante_id = pr.restaurante_id
    left join public.categorias_productos c
      on c.id = pr.categoria_id and c.restaurante_id = pr.restaurante_id
    left join public.estaciones_restaurante e
      on e.id = c.estacion_id and e.restaurante_id = pr.restaurante_id
   where pr.id = new.producto_id;

  if not found or v_restaurante_id is null then
    raise exception 'El producto no pertenece a la comanda.' using errcode = '23503';
  end if;
  return new;
end;
$$;

revoke all on function public.fijar_estacion_snapshot_pedido_item() from public, anon, authenticated;

-- La comanda y sus destinos nacen en una sola transacción. Solo se crean
-- entregas al grupo principal; el respaldo queda reservado para manejo de fallos.
create or replace function public.crear_pedido(
  p_restaurante_id uuid,
  p_mesa_id uuid,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pedido_id uuid;
  v_item jsonb;
  v_producto_id uuid;
  v_cantidad int;
  v_producto public.productos%rowtype;
  v_precio numeric;
  v_mesero_id uuid;
  v_estacion_codigo text;
  v_estacion_id uuid;
  v_estacion_nombre text;
  v_estacion_activa boolean;
  v_destino record;
  v_config_version integer;
begin
  perform public.validar_acceso_restaurante(p_restaurante_id);

  select u.id into v_mesero_id
    from public.usuarios u
   where u.id = auth.uid()
     and u.restaurante_id = p_restaurante_id
     and coalesce(u.activo, true)
     and u.rol::text in ('mesero', 'admin_restaurante');
  if v_mesero_id is null then
    raise exception 'Sin permiso para crear pedidos en este restaurante' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.mesas m
     where m.id = p_mesa_id and m.restaurante_id = p_restaurante_id
  ) then
    raise exception 'La mesa no pertenece al restaurante' using errcode = '23503';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'El pedido no tiene ítems' using errcode = '22023';
  end if;

  select coalesce(c.version, 1) into v_config_version
    from (select 1) x
    left join public.configuracion_operativa c on c.restaurante_id = p_restaurante_id;

  insert into public.pedidos (restaurante_id, mesa_id, mesero_id, estado)
  values (p_restaurante_id, p_mesa_id, v_mesero_id, 'pendiente')
  returning id into v_pedido_id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_producto_id := nullif(v_item->>'producto_id', '')::uuid;
    v_cantidad := coalesce((v_item->>'cantidad')::int, 1);
    if v_producto_id is null then
      raise exception 'Ítem sin producto_id' using errcode = '22023';
    end if;
    if v_cantidad < 1 or v_cantidad > 99 then
      raise exception 'La cantidad debe ser un número entre 1 y 99' using errcode = '22023';
    end if;

    select * into v_producto
      from public.productos pr
     where pr.id = v_producto_id and pr.restaurante_id = p_restaurante_id
     for update;
    if v_producto.id is null then
      raise exception 'El producto no existe en este restaurante' using errcode = '23503';
    end if;
    if not v_producto.disponible then
      raise exception 'El producto % no está disponible', v_producto.nombre using errcode = '22023';
    end if;

    select coalesce(
             v_producto.estacion,
             e.codigo,
             case when coalesce(v_producto.es_bebida, false) then 'bar' else 'cocina' end
           ) into v_estacion_codigo
      from (select 1) x
      left join public.categorias_productos c
        on c.id = v_producto.categoria_id and c.restaurante_id = p_restaurante_id
      left join public.estaciones_restaurante e
        on e.id = c.estacion_id and e.restaurante_id = p_restaurante_id;

    select e.id, e.nombre, e.activo
      into v_estacion_id, v_estacion_nombre, v_estacion_activa
      from public.estaciones_restaurante e
     where e.restaurante_id = p_restaurante_id and e.codigo = v_estacion_codigo;
    if not found or v_estacion_activa is not true then
      raise exception 'La estación % está desactivada o no existe. Pide al administrador que revise la configuración operativa.',
        coalesce(v_estacion_nombre, v_estacion_codigo)
        using errcode = '22023';
    end if;
    if not exists (
      select 1 from public.destinos_estacion d
       where d.restaurante_id = p_restaurante_id and d.estacion_id = v_estacion_id
         and d.grupo = 'principal' and d.activo
    ) then
      raise exception 'La estación % no tiene un destino principal activo. Pide al administrador que revise su configuración.',
        v_estacion_nombre
        using errcode = '22023';
    end if;

    v_precio := case
      when v_producto.es_promocion and v_producto.precio_promocion is not null then v_producto.precio_promocion
      else v_producto.precio
    end;
    if v_precio is null or v_precio < 0 then
      raise exception 'El producto % no tiene precio válido', v_producto.nombre using errcode = '22023';
    end if;

    insert into public.pedido_items (
      pedido_id, producto_id, nombre_producto, cantidad, precio_unitario,
      nota, es_bebida, estacion
    ) values (
      v_pedido_id, v_producto.id, v_producto.nombre, v_cantidad, v_precio,
      nullif(btrim(coalesce(v_item->>'nota', '')), ''),
      coalesce(v_producto.es_bebida, false), v_estacion_codigo
    );
  end loop;

  for v_estacion_codigo in
    select distinct pi.estacion
      from public.pedido_items pi
     where pi.pedido_id = v_pedido_id
     order by pi.estacion
  loop
    select e.id, e.nombre, e.activo
      into v_estacion_id, v_estacion_nombre, v_estacion_activa
      from public.estaciones_restaurante e
     where e.restaurante_id = p_restaurante_id and e.codigo = v_estacion_codigo;
    if not found or v_estacion_activa is not true then
      raise exception 'La estación % está desactivada o no existe. Pide al administrador que revise la configuración operativa.',
        coalesce(v_estacion_nombre, v_estacion_codigo)
        using errcode = '22023';
    end if;

    insert into public.estado_comanda_estacion (restaurante_id, pedido_id, estacion_id, estado)
    values (p_restaurante_id, v_pedido_id, v_estacion_id, 'pendiente');

    for v_destino in
      select d.id, d.tipo, d.grupo, d.nombre, d.papel_mm, d.configuracion
        from public.destinos_estacion d
       where d.restaurante_id = p_restaurante_id
         and d.estacion_id = v_estacion_id
         and d.activo
         and d.grupo = 'principal'
       order by d.tipo, d.nombre
    loop
      insert into public.entregas_comanda (
        restaurante_id, pedido_id, estacion_id, estacion_codigo, estacion_nombre,
        destino_estacion_id, destino_nombre, configuracion_destino,
        grupo, tipo_destino, configuracion_version, numero_entrega, estado
      ) values (
        p_restaurante_id, v_pedido_id, v_estacion_id, v_estacion_codigo, v_estacion_nombre,
        v_destino.id, v_destino.nombre,
        coalesce(v_destino.configuracion, '{}'::jsonb) ||
          case when v_destino.papel_mm is null then '{}'::jsonb
               else jsonb_build_object('papel_mm', v_destino.papel_mm) end,
        'principal', v_destino.tipo, v_config_version, 1,
        case when v_destino.tipo = 'kds' then 'confirmada' else 'pendiente' end
      );
    end loop;
  end loop;

  update public.mesas m set estado = 'ocupada'
   where m.id = p_mesa_id and m.restaurante_id = p_restaurante_id;
  return v_pedido_id;
end;
$$;

comment on function public.crear_pedido(uuid, uuid, jsonb) is
  'Crea una comanda y resuelve productos > categoría > bebida > cocina. Congela estación, crea estado por estación y enrutamiento a destinos principales; impresoras quedan pendientes para impresión manual.';

-- Los ítems cancelados dejan de bloquear el estado agregado de la comanda.
create or replace function public.mesora_reconciliar_estacion_anulada()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_estacion_id uuid;
  v_estado_global text;
begin
  if new.anulado is not true or old.anulado is true then return new; end if;
  if exists (
    select 1 from public.pedido_items pi
     where pi.pedido_id = new.pedido_id
       and coalesce(pi.estacion, 'cocina') = coalesce(new.estacion, 'cocina')
       and pi.anulado is not true
  ) then return new; end if;

  select e.id into v_estacion_id
    from public.estaciones_restaurante e
    join public.pedidos p on p.restaurante_id = e.restaurante_id
   where p.id = new.pedido_id and e.codigo = coalesce(new.estacion, 'cocina');
  if v_estacion_id is null then return new; end if;

  update public.estado_comanda_estacion s
     set estado = 'anulado', updated_at = now()
   where s.pedido_id = new.pedido_id and s.estacion_id = v_estacion_id
     and s.estado <> 'anulado';
  update public.entregas_comanda d
     set estado = 'cancelada', updated_at = now()
   where d.pedido_id = new.pedido_id and d.estacion_id = v_estacion_id
     and d.estado = 'pendiente';

  if exists (
    select 1 from public.pedido_items pi
     where pi.pedido_id = new.pedido_id and pi.anulado is not true
  ) then
    select case
      when bool_or(s.estado = 'pendiente') then 'pendiente'
      when bool_or(s.estado = 'en_preparacion') then 'en_preparacion'
      when bool_or(s.estado = 'listo') then 'listo'
      else 'entregado'
    end into v_estado_global
      from public.estado_comanda_estacion s
     where s.pedido_id = new.pedido_id and s.estado <> 'anulado';
    if v_estado_global is not null then
      update public.pedidos p set estado = v_estado_global, updated_at = now()
       where p.id = new.pedido_id and p.estado <> 'anulado';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.mesora_reconciliar_estacion_anulada() from public, anon, authenticated;
drop trigger if exists pedido_item_reconciliar_estacion_anulada on public.pedido_items;
create trigger pedido_item_reconciliar_estacion_anulada
after update of anulado on public.pedido_items
for each row execute function public.mesora_reconciliar_estacion_anulada();

-- Avance compare-and-set por estación. Si no hay snapshots, se conserva el
-- comportamiento global de comandas históricas creadas antes de esta fase.
create or replace function public.avanzar_comanda_estacion(
  p_restaurante_id uuid,
  p_pedido_id uuid,
  p_estacion_codigo text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rol text;
  v_estado_pedido text;
  v_estado_estacion text;
  v_nuevo_estado text;
  v_estacion_id uuid;
begin
  perform public.validar_acceso_restaurante(p_restaurante_id);

  select u.rol::text into v_rol
    from public.usuarios u
   where u.id = auth.uid() and u.restaurante_id = p_restaurante_id and coalesce(u.activo, true);
  if v_rol is null or v_rol not in ('cocina', 'mesero', 'admin_restaurante') then
    raise exception 'Tu perfil no tiene permiso para actualizar las estaciones de preparación.' using errcode = '42501';
  end if;
  if p_estacion_codigo not in ('cocina', 'bar', 'otros') then
    raise exception 'La estación indicada no es válida.' using errcode = '22023';
  end if;

  select p.estado into v_estado_pedido
    from public.pedidos p
   where p.id = p_pedido_id and p.restaurante_id = p_restaurante_id
   for update;
  if not found then raise exception 'La comanda no pertenece al restaurante.' using errcode = '23503'; end if;
  if v_estado_pedido = 'anulado' then raise exception 'La comanda está anulada.' using errcode = '22023'; end if;
  if exists (
    select 1 from public.cuenta_pedidos cp
    join public.cuentas c on c.id = cp.cuenta_id
     where cp.pedido_id = p_pedido_id and c.estado = 'pagada'
  ) then raise exception 'La comanda ya fue cobrada.' using errcode = '22023'; end if;

  select e.id into v_estacion_id
    from public.estaciones_restaurante e
   where e.restaurante_id = p_restaurante_id and e.codigo = p_estacion_codigo;
  if v_estacion_id is null then raise exception 'No se encontró la estación de esta comanda.' using errcode = '23503'; end if;

  select s.estado into v_estado_estacion
    from public.estado_comanda_estacion s
   where s.restaurante_id = p_restaurante_id and s.pedido_id = p_pedido_id and s.estacion_id = v_estacion_id
   for update;
  if not found then
    if exists (select 1 from public.entregas_comanda d where d.pedido_id = p_pedido_id and d.restaurante_id = p_restaurante_id) then
      raise exception 'La comanda no fue enrutada a esta estación.' using errcode = '42501';
    end if;
    v_nuevo_estado := case v_estado_pedido
      when 'pendiente' then 'en_preparacion'
      when 'en_preparacion' then 'listo'
      when 'listo' then 'entregado'
      else v_estado_pedido
    end;
    if v_nuevo_estado = v_estado_pedido then
      raise exception 'La comanda ya no tiene estados pendientes.' using errcode = '22023';
    end if;
    update public.pedidos p set estado = v_nuevo_estado, updated_at = now()
     where p.id = p_pedido_id and p.restaurante_id = p_restaurante_id and p.estado = v_estado_pedido;
    if not found then raise exception 'La comanda cambió de estado. Actualiza el tablero.' using errcode = '40001'; end if;
    return;
  end if;

  v_nuevo_estado := case v_estado_estacion
    when 'pendiente' then 'en_preparacion'
    when 'en_preparacion' then 'listo'
    when 'listo' then 'entregado'
    else v_estado_estacion
  end;
  if v_nuevo_estado = v_estado_estacion then
    raise exception 'Esta estación ya terminó la comanda.' using errcode = '22023';
  end if;
  update public.estado_comanda_estacion s
     set estado = v_nuevo_estado,
         iniciado_at = case when v_nuevo_estado = 'en_preparacion' then coalesce(s.iniciado_at, now()) else s.iniciado_at end,
         listo_at = case when v_nuevo_estado = 'listo' then now() else s.listo_at end,
         entregado_at = case when v_nuevo_estado = 'entregado' then now() else s.entregado_at end,
         updated_at = now()
   where s.restaurante_id = p_restaurante_id and s.pedido_id = p_pedido_id and s.estacion_id = v_estacion_id;

  select case
    when bool_or(s.estado = 'pendiente') then 'pendiente'
    when bool_or(s.estado = 'en_preparacion') then 'en_preparacion'
    when bool_or(s.estado = 'listo') then 'listo'
    else 'entregado'
  end into v_nuevo_estado
    from public.estado_comanda_estacion s
   where s.restaurante_id = p_restaurante_id and s.pedido_id = p_pedido_id and s.estado <> 'anulado';
  if v_nuevo_estado is not null then
    update public.pedidos p set estado = v_nuevo_estado, updated_at = now()
     where p.id = p_pedido_id and p.restaurante_id = p_restaurante_id and p.estado <> 'anulado';
  end if;
end;
$$;

comment on function public.avanzar_comanda_estacion(uuid, uuid, text) is
  'Avanza compare-and-set el estado de una estación enrutada y recalcula el estado agregado de la comanda; comandas históricas mantienen el avance global.';

alter table public.entregas_comanda
  add column if not exists estacion_codigo text,
  add column if not exists estacion_nombre text,
  add column if not exists destino_nombre text,
  add column if not exists configuracion_destino jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.entregas_comanda'::regclass
       and conname = 'entregas_comanda_estacion_codigo_check'
  ) then
    alter table public.entregas_comanda
      add constraint entregas_comanda_estacion_codigo_check
      check (estacion_codigo is null or estacion_codigo in ('cocina', 'bar', 'otros'));
  end if;
end;
$$;

revoke all on function public.crear_pedido(uuid, uuid, jsonb) from public, anon;
revoke all on function public.avanzar_comanda_estacion(uuid, uuid, text) from public, anon;
grant execute on function public.crear_pedido(uuid, uuid, jsonb) to authenticated;
grant execute on function public.avanzar_comanda_estacion(uuid, uuid, text) to authenticated;

commit;
