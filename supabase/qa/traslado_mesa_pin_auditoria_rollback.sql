-- QA aislado de reasignación y movimiento de consumo con PIN y auditoría.
begin;
do $$
declare
  v_owner text := current_user;
  v_r uuid := gen_random_uuid();
  v_r_otro uuid := gen_random_uuid();
  v_admin uuid := gen_random_uuid();
  v_carlos uuid := gen_random_uuid();
  v_maria uuid := gen_random_uuid();
  v_otro_admin uuid := gen_random_uuid();
  v_z uuid := gen_random_uuid();
  v_mesa_a uuid := gen_random_uuid();
  v_mesa_b uuid := gen_random_uuid();
  v_mesa_c uuid := gen_random_uuid();
  v_mesa_d uuid := gen_random_uuid();
  v_producto uuid := gen_random_uuid();
  v_pedido uuid := gen_random_uuid();
  v_pedido_destino uuid := gen_random_uuid();
  v_pedido_cuenta_anulada uuid := gen_random_uuid();
  v_item uuid := gen_random_uuid();
  v_item_destino uuid := gen_random_uuid();
  v_item_cuenta_anulada uuid := gen_random_uuid();
  v_cuenta_anulada uuid := gen_random_uuid();
  v_denegado boolean;
begin
  insert into auth.users(id) values(v_admin), (v_carlos), (v_maria), (v_otro_admin);
  insert into public.restaurantes(id, nombre, suscripcion_activa, fecha_vencimiento)
    values(v_r, 'QA traslado', true, now()+interval '30 days'),
          (v_r_otro, 'QA otro restaurante', true, now()+interval '30 days');
  insert into public.usuarios(id, restaurante_id, rol, nombre, activo)
    values(v_admin, v_r, 'admin_restaurante', 'Admin QA', true),
          (v_carlos, v_r, 'mesero', 'Carlos QA', true),
          (v_maria, v_r, 'mesero', 'María QA', true),
          (v_otro_admin, v_r_otro, 'admin_restaurante', 'Admin Otro QA', true);
  insert into public.zonas(id, restaurante_id, nombre) values(v_z, v_r, 'Salón QA');
  insert into public.mesas(id, restaurante_id, zona_id, nombre, estado, mesero_responsable_id)
    values(v_mesa_a, v_r, v_z, 'Mesa QA A', 'ocupada', v_carlos),
          (v_mesa_b, v_r, v_z, 'Mesa QA B', 'libre', null),
          (v_mesa_c, v_r, v_z, 'Mesa QA C', 'ocupada', null),
          (v_mesa_d, v_r, v_z, 'Mesa QA D', 'libre', null);
  insert into public.productos(id, restaurante_id, nombre, precio) values(v_producto, v_r, 'Producto QA', 10);
  insert into public.pedidos(id, restaurante_id, mesa_id, mesero_id) values(v_pedido, v_r, v_mesa_a, v_carlos);
  insert into public.pedido_items(id, pedido_id, producto_id, nombre_producto, cantidad, precio_unitario)
    values(v_item, v_pedido, v_producto, 'Producto QA', 1, 10);
  insert into public.pedidos(id, restaurante_id, mesa_id, mesero_id) values(v_pedido_destino, v_r, v_mesa_c, v_carlos);
  insert into public.pedido_items(id, pedido_id, producto_id, nombre_producto, cantidad, precio_unitario)
    values(v_item_destino, v_pedido_destino, v_producto, 'Producto QA', 1, 10);
  insert into public.pedidos(id, restaurante_id, mesa_id, mesero_id, estado)
    values(v_pedido_cuenta_anulada, v_r, v_mesa_d, v_carlos, 'entregado');
  insert into public.pedido_items(id, pedido_id, producto_id, nombre_producto, cantidad, precio_unitario)
    values(v_item_cuenta_anulada, v_pedido_cuenta_anulada, v_producto, 'Producto QA histórico', 1, 10);
  insert into public.cuentas(id, restaurante_id, mesa_id, total, metodo_pago, estado,
    pagado_at, anulada_at, anulada_por, motivo_anulacion, numero)
    values(v_cuenta_anulada, v_r, v_mesa_d, 10, 'efectivo', 'anulada', now(), now(), v_admin,
      'Cuenta QA anulada antes del traslado', 'BQA-' || left(v_cuenta_anulada::text, 8));
  insert into public.cuenta_pedidos(cuenta_id, pedido_id, subtotal)
    values(v_cuenta_anulada, v_pedido_cuenta_anulada, 10);

  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  execute 'set local role authenticated';
  if jsonb_array_length(public.pedidos_pendientes_mesa(v_r, v_mesa_d)) <> 0 then
    raise exception 'Una comanda ligada a cuenta anulada aparece como consumo pendiente';
  end if;
  perform public.configurar_pin_autorizacion(v_r, '4321');
  execute format('set local role %I', v_owner);

  if has_function_privilege('anon', 'public.asignar_mesa_mesero(uuid,uuid,uuid,text,text)', 'execute')
     or has_function_privilege('anon', 'public.mover_consumo_mesa(uuid,uuid,uuid,text,text)', 'execute')
     or not has_function_privilege('authenticated', 'public.asignar_mesa_mesero(uuid,uuid,uuid,text,text)', 'execute')
     or not has_function_privilege('authenticated', 'public.mover_consumo_mesa(uuid,uuid,uuid,text,text)', 'execute') then
    raise exception 'Los permisos de RPC de traslado son incorrectos';
  end if;

  perform set_config('request.jwt.claim.sub', v_carlos::text, true);
  execute 'set local role authenticated';
  if not exists (
    select 1 from public.listar_meseros_activos_restaurante(v_r)
     where id=v_maria and activo is true and rol='mesero'
  ) then raise exception 'La lista no muestra al segundo mesero activo del restaurante'; end if;
  v_denegado := false;
  begin
    perform public.asignar_mesa_mesero(v_r, v_mesa_a, v_maria, '0000', 'Cambio de turno');
  exception when others then
    if sqlerrm not like '%PIN de autorizacion incorrecto%' then raise; end if;
    v_denegado := true;
  end;
  if not v_denegado then raise exception 'Se aceptó un PIN incorrecto para reasignar la mesa'; end if;
  execute format('set local role %I', v_owner);
  if (select mesero_responsable_id from public.mesas where id=v_mesa_a) <> v_carlos
     or exists(select 1 from public.audit_logs where entidad_id=v_mesa_a and accion='mesa_transferir_responsable') then
    raise exception 'El intento fallido modificó o auditó la reasignación';
  end if;

  perform set_config('request.jwt.claim.sub', v_carlos::text, true);
  execute 'set local role authenticated';
  perform public.asignar_mesa_mesero(v_r, v_mesa_a, v_maria, '4321', 'Cambio de turno');
  execute format('set local role %I', v_owner);
  if (select mesero_responsable_id from public.mesas where id=v_mesa_a) <> v_maria then
    raise exception 'No se asignó la mesa al segundo mesero';
  end if;
  if not exists (
    select 1 from public.audit_logs
     where actor_id=v_carlos and entidad_id=v_mesa_a and accion='mesa_transferir_responsable'
       and detalle->>'mesero_nuevo_id'=v_maria::text
       and detalle->>'motivo'='Cambio de turno'
       and created_at is not null
  ) then raise exception 'Falta auditoría completa de la reasignación'; end if;

  perform set_config('request.jwt.claim.sub', v_maria::text, true);
  execute 'set local role authenticated';
  v_denegado := false;
  begin
    perform public.mover_consumo_mesa(v_r, v_mesa_a, v_mesa_c, '0000', 'No mover a mesa ocupada');
  exception when others then
    if sqlerrm not like '%mesa de destino debe estar libre%' then raise; end if;
    v_denegado := true;
  end;
  if not v_denegado then raise exception 'El destino ocupado no se bloqueó antes de validar el PIN'; end if;
  execute format('set local role %I', v_owner);
  if (select mesa_id from public.pedidos where id=v_pedido) <> v_mesa_a
     or (select mesa_id from public.pedidos where id=v_pedido_destino) <> v_mesa_c
     or exists(select 1 from public.audit_logs where entidad_id=v_mesa_a and accion='mesa_mover_consumo') then
    raise exception 'El bloqueo del destino ocupado cambió o auditó el traslado';
  end if;

  perform set_config('request.jwt.claim.sub', v_maria::text, true);
  execute 'set local role authenticated';
  v_denegado := false;
  begin
    perform public.mover_consumo_mesa(v_r, v_mesa_a, v_mesa_b, '0000', 'Cliente cambió de mesa');
  exception when others then
    if sqlerrm not like '%PIN de autorizacion incorrecto%' then raise; end if;
    v_denegado := true;
  end;
  if not v_denegado then raise exception 'Se aceptó un PIN incorrecto para mover el consumo'; end if;
  execute format('set local role %I', v_owner);
  if (select mesa_id from public.pedidos where id=v_pedido) <> v_mesa_a then
    raise exception 'El intento fallido cambió el consumo de mesa';
  end if;

  perform set_config('request.jwt.claim.sub', v_maria::text, true);
  execute 'set local role authenticated';
  perform public.mover_consumo_mesa(v_r, v_mesa_a, v_mesa_b, '4321', 'Cliente cambió de mesa');
  execute format('set local role %I', v_owner);
  if (select mesa_id from public.pedidos where id=v_pedido) <> v_mesa_b
     or (select estado from public.mesas where id=v_mesa_a) <> 'libre'
     or (select mesero_responsable_id from public.mesas where id=v_mesa_b) <> v_maria then
    raise exception 'No se movieron correctamente las comandas, mesa y responsable';
  end if;
  if not exists (
    select 1 from public.audit_logs
     where actor_id=v_maria and entidad_id=v_mesa_a and accion='mesa_mover_consumo'
       and detalle->>'mesa_destino_id'=v_mesa_b::text
       and detalle->>'motivo'='Cliente cambió de mesa'
       and created_at is not null
  ) then raise exception 'Falta auditoría completa del movimiento de consumo'; end if;

  -- Una comanda histórica de una cuenta anulada no debe bloquear un destino
  -- libre ni aparecer entre los pedidos pendientes que usa la interfaz.
  perform set_config('request.jwt.claim.sub', v_maria::text, true);
  execute 'set local role authenticated';
  perform public.mover_consumo_mesa(v_r, v_mesa_b, v_mesa_d, '4321', 'Cliente cambia de mesa');
  if exists (
    select 1 from jsonb_array_elements(public.pedidos_pendientes_mesa(v_r, v_mesa_d)) p
    where p->>'id'=v_pedido_cuenta_anulada::text
  ) or not exists (
    select 1 from jsonb_array_elements(public.pedidos_pendientes_mesa(v_r, v_mesa_d)) p
    where p->>'id'=v_pedido::text
  ) then
    raise exception 'El destino libre no separó el historial anulado del nuevo consumo pendiente';
  end if;
  execute format('set local role %I', v_owner);
  if (select mesa_id from public.pedidos where id=v_pedido) <> v_mesa_d
     or (select mesa_id from public.pedidos where id=v_pedido_cuenta_anulada) <> v_mesa_d
     or (select estado from public.mesas where id=v_mesa_b) <> 'libre'
     or (select estado from public.mesas where id=v_mesa_d) <> 'ocupada'
     or (select count(*) from public.audit_logs where actor_id=v_maria
         and entidad_id=v_mesa_b and accion='mesa_mover_consumo'
         and detalle->>'mesa_destino_id'=v_mesa_d::text) <> 1 then
    raise exception 'Mover a un destino con historial de cuenta anulada no quedó íntegro';
  end if;

  perform set_config('request.jwt.claim.sub', v_otro_admin::text, true);
  execute 'set local role authenticated';
  v_denegado := false;
  begin
    perform public.asignar_mesa_mesero(v_r, v_mesa_b, v_carlos, '4321', 'Prueba de aislamiento');
  exception when others then v_denegado := true;
  end;
  if not v_denegado then raise exception 'Otro restaurante pudo reasignar una mesa'; end if;
  execute format('set local role %I', v_owner);
end;
$$;
rollback;
