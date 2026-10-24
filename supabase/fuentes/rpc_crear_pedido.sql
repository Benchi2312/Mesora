-- Mesora · RPC: crear pedido (comanda) de forma atómica.
-- Inserta el pedido + sus items y marca la mesa como ocupada en una sola transacción.
-- Requiere que el usuario autenticado sea mesero o admin del restaurante.
--
-- El PRECIO y el NOMBRE se resuelven aquí adentro, nunca vienen del cliente.
-- El front solo manda qué producto pide y cuántas veces:
--   p_items = [{ "producto_id": "...", "cantidad": 2, "nota": "sin cebolla" }]
-- Si el cliente manda igual `nombre_producto` / `precio_unitario`, esta función
-- los IGNORA: si no, cualquiera podría pedir un pan de S/ 0.01.
--
-- `pedido_items.precio_unitario` queda congelado al momento de pedir, que es lo
-- que permite después cambiar el precio en el menú sin reescribir la historia.
--
-- REQUISITO: 00_seguridad_rpcs.sql debe estar aplicada ANTES (esta RPC llama a
-- validar_acceso_restaurante).

create or replace function public.crear_pedido(
  p_restaurante_id uuid,
  p_mesa_id uuid,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pedido_id uuid;
  v_item jsonb;
  v_producto_id uuid;
  v_cantidad int;
  v_producto public.productos%rowtype;
  v_precio numeric;
  v_mesero_id uuid;
begin
  -- Control de acceso en el servidor (suscripción + usuario activo). Va primero:
  -- sin esto, llamar a esta RPC por fuera de la app esquivaría el bloqueo que
  -- solo existe en la UI. Ver 00_seguridad_rpcs.sql.
  perform public.validar_acceso_restaurante(p_restaurante_id);

  -- El usuario debe pertenecer al restaurante con rol mesero o admin
  select id into v_mesero_id
    from public.usuarios
   where id = auth.uid()
     and restaurante_id = p_restaurante_id
     and rol in ('mesero', 'admin_restaurante');

  if v_mesero_id is null then
    raise exception 'Sin permiso para crear pedidos en este restaurante';
  end if;

  -- La mesa debe pertenecer al restaurante
  if not exists (
    select 1 from public.mesas
     where id = p_mesa_id and restaurante_id = p_restaurante_id
  ) then
    raise exception 'La mesa no pertenece al restaurante';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'El pedido no tiene ítems';
  end if;

  insert into public.pedidos (restaurante_id, mesa_id, mesero_id, estado)
  values (p_restaurante_id, p_mesa_id, v_mesero_id, 'pendiente')
  returning id into v_pedido_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    -- Qué producto y cuánto (esto sí lo decide el mesero).
    v_producto_id := nullif(v_item->>'producto_id', '')::uuid;
    v_cantidad := coalesce((v_item->>'cantidad')::int, 1);

    if v_producto_id is null then
      raise exception 'Ítem sin producto_id';
    end if;

    if v_cantidad < 1 or v_cantidad > 99 then
      raise exception 'La cantidad debe ser un número entre 1 y 99';
    end if;

    -- Se bloquea la fila del producto para que el precio no cambie a mitad de
    -- la comanda (misma promesa que "el precio queda congelado").
    select * into v_producto
      from public.productos
     where id = v_producto_id
       and restaurante_id = p_restaurante_id
       for update;

    if v_producto.id is null then
      raise exception 'El producto no existe en este restaurante';
    end if;

    if not v_producto.disponible then
      raise exception 'El producto % no está disponible', v_producto.nombre;
    end if;

    -- A cuánto: aquí se decide, no en el navegador.
    v_precio := case
      when v_producto.es_promocion and v_producto.precio_promocion is not null
        then v_producto.precio_promocion
      else v_producto.precio
    end;

    if v_precio is null or v_precio < 0 then
      raise exception 'El producto % no tiene precio válido', v_producto.nombre;
    end if;

    insert into public.pedido_items (pedido_id, producto_id, nombre_producto, cantidad, precio_unitario, nota)
    values (
      v_pedido_id,
      v_producto.id,
      v_producto.nombre,
      v_cantidad,
      v_precio,
      nullif(btrim(coalesce(v_item->>'nota', '')), '')
    );
  end loop;

  update public.mesas set estado = 'ocupada' where id = p_mesa_id;

  return v_pedido_id;
end;
$$;
