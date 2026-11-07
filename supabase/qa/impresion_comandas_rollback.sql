-- QA transaccional para la migración Bloque 3. No deja filas persistentes.
begin;
do $$
declare
  r uuid := gen_random_uuid();
  u uuid := gen_random_uuid();
  z uuid := gen_random_uuid();
  m uuid := gen_random_uuid();
  pr uuid := gen_random_uuid();
  ped uuid := gen_random_uuid();
  req uuid := gen_random_uuid();
  req_reimpresion uuid := gen_random_uuid();
  inicial text := current_user;
  salida jsonb;
  filas integer;
  v_actor uuid;
  v_detalle jsonb;
  v_descripcion text;
begin
  insert into auth.users(id, email) values (u, 'qa-comandas@mesora.example');
  insert into public.restaurantes(id, nombre, suscripcion_activa) values (r, 'Restaurante QA', true);
  insert into public.usuarios(id, restaurante_id, rol, nombre, activo)
    values (u, r, 'cocina', 'Cocina QA', true);
  insert into public.zonas(id, restaurante_id, nombre) values (z, r, 'Salón');
  insert into public.mesas(id, restaurante_id, zona_id, nombre) values (m, r, z, 'Mesa QA');
  insert into public.productos(id, restaurante_id, nombre, precio, es_bebida, estacion)
    values (pr, r, 'Chicha morada', 7, true, 'bar');
  insert into public.pedidos(id, restaurante_id, mesa_id, mesero_id)
    values (ped, r, m, u);
  insert into public.pedido_items(pedido_id, producto_id, nombre_producto, cantidad, precio_unitario, es_bebida, nota)
    values (ped, pr, 'Chicha morada', 2, 7, true, 'Sin hielo');

  if (select estacion from public.pedido_items where pedido_id = ped) <> 'bar' then
    raise exception 'El trigger no tomó la estación del producto';
  end if;

  -- Una edición posterior del menú no cambia la estación del ítem histórico.
  update public.productos set estacion = 'otros' where id = pr;
  if (select estacion from public.pedido_items where pedido_id = ped) <> 'bar' then
    raise exception 'La estación histórica cambió al editar el producto';
  end if;

  perform set_config('request.jwt.claim.sub', u::text, true);
  perform set_config('request.jwt.claims', '{"role":"authenticated"}', true);
  if has_function_privilege('anon', 'public.registrar_impresion_comanda(uuid,uuid,text,uuid,text)', 'execute') then
    raise exception 'anon puede ejecutar registrar_impresion_comanda';
  end if;
  if not has_function_privilege('authenticated', 'public.registrar_impresion_comanda(uuid,uuid,text,uuid,text)', 'execute') then
    raise exception 'authenticated no puede ejecutar registrar_impresion_comanda';
  end if;

  execute 'set local role authenticated';
  salida := public.registrar_impresion_comanda(r, ped, 'bar', req, null);
  if salida->>'estado' <> 'registrada' or salida->>'accion' <> 'comanda_imprimir' then
    raise exception 'La primera impresión no se registró correctamente: %', salida;
  end if;
  -- La misma solicitud es segura ante respuesta de red perdida.
  salida := public.registrar_impresion_comanda(r, ped, 'bar', req, null);
  if salida->>'estado' <> 'registrada' or salida->>'accion' <> 'comanda_imprimir' then
    raise exception 'El reintento idempotente no devolvió el resultado original: %', salida;
  end if;
  salida := public.registrar_impresion_comanda(r, ped, 'bar', req_reimpresion, null);
  if salida->>'estado' <> 'requiere_motivo' then
    raise exception 'La reimpresión no solicitó motivo: %', salida;
  end if;
  salida := public.registrar_impresion_comanda(r, ped, 'bar', req_reimpresion, 'Papel no salió');
  if salida->>'estado' <> 'registrada' or salida->>'accion' <> 'comanda_reimprimir' then
    raise exception 'La reimpresión con motivo no se registró: %', salida;
  end if;
  execute format('set local role %I', inicial);

  select count(*) into filas from public.audit_logs
   where restaurante_id = r and entidad = 'pedido' and entidad_id = ped
     and accion in ('comanda_imprimir', 'comanda_reimprimir');
  if filas <> 2 then raise exception 'Se esperaban dos auditorías únicas, se encontraron %', filas; end if;
  select l.actor_id, l.detalle, l.descripcion into v_actor, v_detalle, v_descripcion
    from public.audit_logs l where l.restaurante_id = r and l.entidad_id = ped and l.accion = 'comanda_imprimir';
  if v_actor <> u then raise exception 'La auditoría no guardó el usuario'; end if;
  if v_detalle->>'mesa_id' <> m::text or v_detalle->>'mesa_nombre' <> 'Mesa QA' or v_detalle->>'estacion' <> 'bar' then
    raise exception 'La auditoría no guardó mesa y estación: %', v_detalle;
  end if;
  if v_descripcion <> 'Comanda enviada a impresión en Bar, mesa Mesa QA.' then
    raise exception 'La descripción UTF-8 no coincide: %', v_descripcion;
  end if;
  if not exists (
    select 1 from public.audit_logs
     where restaurante_id = r and entidad_id = ped and accion = 'comanda_reimprimir'
       and actor_id = u and created_at is not null
       and detalle->>'mesa_id' = m::text and detalle->>'motivo' = 'Papel no salió'
  ) then raise exception 'La reimpresión no guardó usuario, fecha, mesa y motivo'; end if;
end;
$$;
rollback;
