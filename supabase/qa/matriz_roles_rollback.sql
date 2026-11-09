begin;

-- QA de autorizacion con identidades ficticias en PostgreSQL aislado.
-- Se invocan las RPC reales como authenticated y con el claim sub de cada rol.
-- Un error de validacion de datos NO cuenta como denegacion: se comprueba el
-- mensaje especifico de autorizacion en cada caso.
do $$
declare
  v_owner text := current_user;
  v_a uuid := gen_random_uuid();
  v_b uuid := gen_random_uuid();
  v_admin_a uuid := gen_random_uuid();
  v_admin_b uuid := gen_random_uuid();
  v_mesero uuid := gen_random_uuid();
  v_cocina uuid := gen_random_uuid();
  v_cajero uuid := gen_random_uuid();
  v_zona_a uuid := gen_random_uuid();
  v_zona_b uuid := gen_random_uuid();
  v_mesa_a uuid := gen_random_uuid();
  v_mesa_b uuid := gen_random_uuid();
  v_producto_a uuid := gen_random_uuid();
  v_pedido_b uuid := gen_random_uuid();
  v_item_b uuid := gen_random_uuid();
  v_cuenta_b uuid := gen_random_uuid();
  v_caso record;
  v_denegado boolean;
  v_numero integer := 0;
  v_antes record;
  v_despues record;
begin
  insert into auth.users(id) values
    (v_admin_a), (v_admin_b), (v_mesero), (v_cocina), (v_cajero);
  insert into public.restaurantes(id, nombre) values
    (v_a, 'QA permisos A'), (v_b, 'QA permisos B');
  update public.restaurantes
     set suscripcion_activa = true,
         fecha_vencimiento = now() + interval '30 days'
   where id in (v_a, v_b);
  insert into public.usuarios(id, restaurante_id, rol, nombre) values
    (v_admin_a, v_a, 'admin_restaurante', 'Admin A'),
    (v_admin_b, v_b, 'admin_restaurante', 'Admin B'),
    (v_mesero, v_a, 'mesero', 'Mesero A'),
    (v_cocina, v_a, 'cocina', 'Cocina A'),
    (v_cajero, v_a, 'cajero', 'Cajero A');
  insert into public.zonas(id, restaurante_id, nombre) values
    (v_zona_a, v_a, 'Zona A'), (v_zona_b, v_b, 'Zona B');
  insert into public.mesas(id, restaurante_id, zona_id, nombre) values
    (v_mesa_a, v_a, v_zona_a, 'Mesa A'),
    (v_mesa_b, v_b, v_zona_b, 'Mesa B');
  insert into public.productos(id, restaurante_id, nombre, precio) values
    (v_producto_a, v_a, 'Producto A', 10);
  insert into public.pedidos(id, restaurante_id, mesa_id, mesero_id) values
    (v_pedido_b, v_b, v_mesa_b, v_admin_b);
  insert into public.pedido_items(id, pedido_id, nombre_producto, cantidad, precio_unitario)
    values (v_item_b, v_pedido_b, 'Producto B', 1, 10);
  insert into public.cuentas(id, restaurante_id, mesa_id, total, estado, metodo_pago, numero, pagado_at)
    values (v_cuenta_b, v_b, v_mesa_b, 10, 'pagada', 'efectivo', 'QA-B-1', now());

  select (select count(*) from public.pedidos) as pedidos,
         (select count(*) from public.cuentas) as cuentas,
         (select count(*) from public.caja_turnos) as turnos,
         (select count(*) from public.restaurante_pins) as pins,
         (select count(*) from public.pedido_items) as items
    into v_antes;

  -- Un administrador A no puede operar ni consultar B aunque adivine sus UUID.
  perform set_config('request.jwt.claim.sub', v_admin_a::text, true);
  execute 'set local role authenticated';
  for v_caso in
    select * from (values
      ('crear_pedido', format('select public.crear_pedido(%L::uuid,%L::uuid,%L::jsonb)', v_b, v_mesa_b, '[]'), 'Sin permiso'),
      ('editar_item_comanda', format('select public.editar_item_comanda(%L::uuid,%L::uuid,%L::uuid,2,%L::text)', v_b, v_pedido_b, v_item_b, 'QA'), 'Sin permiso'),
      ('anular_item_comanda', format('select public.anular_item_comanda(%L::uuid,%L::uuid,%L::uuid,%L::text)', v_b, v_pedido_b, v_item_b, '0000'), 'Sin permiso'),
      ('cerrar_cuenta', format('select public.cerrar_cuenta(%L::uuid,%L::uuid,array[%L::uuid],%L::jsonb,0)', v_b, v_mesa_b, v_pedido_b, '[{"metodo_pago":"efectivo","monto":10}]'), 'No estás autorizado'),
      ('anular_cuenta', format('select public.anular_cuenta(%L::uuid,%L::uuid,%L::text,%L::text)', v_b, v_cuenta_b, 'Motivo QA', '0000'), 'Sin permiso'),
      ('abrir_turno_caja', format('select public.abrir_turno_caja(%L::uuid,%L::uuid,0)', v_b, v_admin_a), 'Sin permiso'),
      ('cerrar_turno_caja', format('select public.cerrar_turno_caja(%L::uuid,%L::uuid,0,%L::text)', v_b, v_admin_a, 'QA'), 'Sin permiso'),
      ('configurar_pin_autorizacion', format('select public.configurar_pin_autorizacion(%L::uuid,%L::text)', v_b, '4242'), 'Solo el administrador'),
      ('quitar_pin_autorizacion', format('select public.quitar_pin_autorizacion(%L::uuid)', v_b), 'Solo el administrador'),
      ('tiene_pin_autorizacion', format('select public.tiene_pin_autorizacion(%L::uuid)', v_b), 'Sin acceso'),
      ('pedidos_pendientes_mesa', format('select public.pedidos_pendientes_mesa(%L::uuid,%L::uuid)', v_b, v_mesa_b), 'Sin permiso'),
      ('mesas_por_cobrar', format('select public.mesas_por_cobrar(%L::uuid)', v_b), 'Sin permiso'),
      ('reporte_ventas_restaurante', format('select public.reporte_ventas_restaurante(%L::uuid,now()-interval ''1 day'',now()+interval ''1 day'')', v_b), 'Sin permiso')
    ) as c(nombre, llamada, error_esperado)
  loop
    v_denegado := false;
    begin
      execute v_caso.llamada;
    exception when others then
      if position(lower(v_caso.error_esperado) in lower(sqlerrm)) = 0 then
        raise exception 'RPC % fallo por otra razon: %', v_caso.nombre, sqlerrm;
      end if;
      v_denegado := true;
    end;
    if not v_denegado then
      raise exception 'Admin A pudo invocar % sobre restaurante B', v_caso.nombre;
    end if;
    v_numero := v_numero + 1;
  end loop;
  if public.mi_restaurante_id() <> v_a
     or public.soy_del_restaurante(v_b)
     or public.puedo_escribir_en(v_b, array['admin_restaurante']) then
    raise exception 'Los helpers RLS reconocen un restaurante ajeno';
  end if;
  if not public.suscripcion_vigente(v_a) or public.suscripcion_vigente(v_b) then
    raise exception 'La vigencia de otro restaurante se pudo consultar';
  end if;
  perform set_config('request.jwt.claim.sub', v_admin_b::text, true);
  if not public.suscripcion_vigente(v_b) or public.suscripcion_vigente(v_a) then
    raise exception 'El helper de suscripción no respetó el restaurante de Admin B';
  end if;
  perform set_config('request.jwt.claim.sub', v_admin_a::text, true);
  if jsonb_array_length(public.mesas_por_cobrar(v_a)) <> 0 then
    raise exception 'La consulta propia de mesas pendientes fallo';
  end if;
  if (public.reporte_ventas_restaurante(v_a, now()-interval '1 day', now()+interval '1 day')#>>'{resumen,ventas}')::numeric <> 0 then
    raise exception 'El reporte propio sin ventas fallo';
  end if;
  execute format('set local role %I', v_owner);

  -- Cocina no puede crear ni modificar comandas ni operar dinero o PIN.
  perform set_config('request.jwt.claim.sub', v_cocina::text, true);
  execute 'set local role authenticated';
  for v_caso in
    select * from (values
      ('crear_pedido', format('select public.crear_pedido(%L::uuid,%L::uuid,%L::jsonb)', v_a, v_mesa_a, '[]'), 'Sin permiso'),
      ('editar_item_comanda', format('select public.editar_item_comanda(%L::uuid,%L::uuid,%L::uuid,2,%L::text)', v_a, v_pedido_b, v_item_b, 'QA'), 'Sin permiso'),
      ('anular_item_comanda', format('select public.anular_item_comanda(%L::uuid,%L::uuid,%L::uuid,%L::text)', v_a, v_pedido_b, v_item_b, '0000'), 'Sin permiso'),
      ('cerrar_cuenta', format('select public.cerrar_cuenta(%L::uuid,%L::uuid,array[%L::uuid],%L::jsonb,0)', v_a, v_mesa_a, v_pedido_b, '[{"metodo_pago":"efectivo","monto":10}]'), 'No estás autorizado'),
      ('anular_cuenta', format('select public.anular_cuenta(%L::uuid,%L::uuid,%L::text,%L::text)', v_a, v_cuenta_b, 'Motivo QA', '0000'), 'Sin permiso'),
      ('abrir_turno_caja', format('select public.abrir_turno_caja(%L::uuid,%L::uuid,0)', v_a, v_cocina), 'Sin permiso'),
      ('cerrar_turno_caja', format('select public.cerrar_turno_caja(%L::uuid,%L::uuid,0,%L::text)', v_a, v_cocina, 'QA'), 'Sin permiso'),
      ('configurar_pin_autorizacion', format('select public.configurar_pin_autorizacion(%L::uuid,%L::text)', v_a, '4242'), 'Solo el administrador'),
      ('quitar_pin_autorizacion', format('select public.quitar_pin_autorizacion(%L::uuid)', v_a), 'Solo el administrador'),
      ('reporte_ventas_restaurante', format('select public.reporte_ventas_restaurante(%L::uuid,now()-interval ''1 day'',now()+interval ''1 day'')', v_a), 'Sin permiso')
    ) as c(nombre, llamada, error_esperado)
  loop
    v_denegado := false;
    begin
      execute v_caso.llamada;
    exception when others then
      if position(lower(v_caso.error_esperado) in lower(sqlerrm)) = 0 then
        raise exception 'RPC % fallo por otra razon: %', v_caso.nombre, sqlerrm;
      end if;
      v_denegado := true;
    end;
    if not v_denegado then raise exception 'Cocina pudo invocar %', v_caso.nombre; end if;
    v_numero := v_numero + 1;
  end loop;
  if public.tiene_pin_autorizacion(v_a) is not false
     or jsonb_array_length(public.pedidos_pendientes_mesa(v_a, v_mesa_a)) <> 0 then
    raise exception 'Cocina perdio las consultas operativas propias';
  end if;
  execute format('set local role %I', v_owner);

  -- Mesero no administra PIN, caja, devoluciones ni reportes financieros.
  perform set_config('request.jwt.claim.sub', v_mesero::text, true);
  execute 'set local role authenticated';
  for v_caso in
    select * from (values
      ('anular_cuenta', format('select public.anular_cuenta(%L::uuid,%L::uuid,%L::text,%L::text)', v_a, v_cuenta_b, 'Motivo QA', '0000'), 'Sin permiso'),
      ('abrir_turno_caja', format('select public.abrir_turno_caja(%L::uuid,%L::uuid,0)', v_a, v_mesero), 'Sin permiso'),
      ('cerrar_turno_caja', format('select public.cerrar_turno_caja(%L::uuid,%L::uuid,0,%L::text)', v_a, v_mesero, 'QA'), 'Sin permiso'),
      ('configurar_pin_autorizacion', format('select public.configurar_pin_autorizacion(%L::uuid,%L::text)', v_a, '4242'), 'Solo el administrador'),
      ('quitar_pin_autorizacion', format('select public.quitar_pin_autorizacion(%L::uuid)', v_a), 'Solo el administrador'),
      ('reporte_ventas_restaurante', format('select public.reporte_ventas_restaurante(%L::uuid,now()-interval ''1 day'',now()+interval ''1 day'')', v_a), 'Sin permiso')
    ) as c(nombre, llamada, error_esperado)
  loop
    v_denegado := false;
    begin
      execute v_caso.llamada;
    exception when others then
      if position(lower(v_caso.error_esperado) in lower(sqlerrm)) = 0 then
        raise exception 'RPC % fallo por otra razon: %', v_caso.nombre, sqlerrm;
      end if;
      v_denegado := true;
    end;
    if not v_denegado then raise exception 'Mesero pudo invocar %', v_caso.nombre; end if;
    v_numero := v_numero + 1;
  end loop;
  execute format('set local role %I', v_owner);

  -- Cajero no crea/edita pedidos ni administra PIN o reportes.
  perform set_config('request.jwt.claim.sub', v_cajero::text, true);
  execute 'set local role authenticated';
  for v_caso in
    select * from (values
      ('crear_pedido', format('select public.crear_pedido(%L::uuid,%L::uuid,%L::jsonb)', v_a, v_mesa_a, '[]'), 'Sin permiso'),
      ('editar_item_comanda', format('select public.editar_item_comanda(%L::uuid,%L::uuid,%L::uuid,2,%L::text)', v_a, v_pedido_b, v_item_b, 'QA'), 'Sin permiso'),
      ('anular_item_comanda', format('select public.anular_item_comanda(%L::uuid,%L::uuid,%L::uuid,%L::text)', v_a, v_pedido_b, v_item_b, '0000'), 'Sin permiso'),
      ('cerrar_cuenta', format('select public.cerrar_cuenta(%L::uuid,%L::uuid,array[%L::uuid],%L::jsonb,0)', v_a, v_mesa_a, v_pedido_b, '[{"metodo_pago":"efectivo","monto":10}]'), 'No estás autorizado'),
      ('configurar_pin_autorizacion', format('select public.configurar_pin_autorizacion(%L::uuid,%L::text)', v_a, '4242'), 'Solo el administrador'),
      ('quitar_pin_autorizacion', format('select public.quitar_pin_autorizacion(%L::uuid)', v_a), 'Solo el administrador'),
      ('reporte_ventas_restaurante', format('select public.reporte_ventas_restaurante(%L::uuid,now()-interval ''1 day'',now()+interval ''1 day'')', v_a), 'Sin permiso')
    ) as c(nombre, llamada, error_esperado)
  loop
    v_denegado := false;
    begin
      execute v_caso.llamada;
    exception when others then
      if position(lower(v_caso.error_esperado) in lower(sqlerrm)) = 0 then
        raise exception 'RPC % fallo por otra razon: %', v_caso.nombre, sqlerrm;
      end if;
      v_denegado := true;
    end;
    if not v_denegado then raise exception 'Cajero pudo invocar %', v_caso.nombre; end if;
    v_numero := v_numero + 1;
  end loop;
  execute format('set local role %I', v_owner);

  select (select count(*) from public.pedidos) as pedidos,
         (select count(*) from public.cuentas) as cuentas,
         (select count(*) from public.caja_turnos) as turnos,
         (select count(*) from public.restaurante_pins) as pins,
         (select count(*) from public.pedido_items) as items
    into v_despues;
  if row(v_antes.pedidos, v_antes.cuentas, v_antes.turnos, v_antes.pins, v_antes.items)
     is distinct from
     row(v_despues.pedidos, v_despues.cuentas, v_despues.turnos, v_despues.pins, v_despues.items) then
    raise exception 'Una llamada denegada dejo cambios en la base';
  end if;
  if v_numero <> 36 then raise exception 'La matriz cubrio % rechazos, se esperaban 36', v_numero; end if;
end;
$$;

rollback;
select 'Matriz roles SQL: 36 rechazos por rol y restaurante, consultas permitidas y sin escrituras: OK' as resultado;
