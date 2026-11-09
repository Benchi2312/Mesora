-- QA transaccional Fase 5: destinos KDS/impresora, snapshots, estados e idempotencia.
begin;
do $$
declare
  r uuid := gen_random_uuid();
  r_otro uuid := gen_random_uuid();
  admin_id uuid := gen_random_uuid();
  cocina_id uuid := gen_random_uuid();
  cajero_id uuid := gen_random_uuid();
  admin_otro_id uuid := gen_random_uuid();
  z uuid := gen_random_uuid();
  m uuid := gen_random_uuid();
  producto_cocina uuid := gen_random_uuid();
  producto_bar uuid := gen_random_uuid();
  est_cocina uuid;
  est_bar uuid;
  destino_cocina uuid;
  destino_bar uuid;
  v_mezcla uuid;
  v_pedido uuid;
  v_salida uuid;
  v_solicitud uuid;
  v_solicitud_anterior uuid;
  v_resp jsonb;
  v_version integer;
  v_ancho smallint;
  v_copias integer;
  v_nombre text;
  n integer;
  inicial text := current_user;
begin
  insert into auth.users(id, email) values
    (admin_id, 'qa-fase5-admin@mesora.example'),
    (cocina_id, 'qa-fase5-cocina@mesora.example'),
    (cajero_id, 'qa-fase5-cajero@mesora.example'),
    (admin_otro_id, 'qa-fase5-otro@mesora.example');
  insert into public.restaurantes(id, nombre, suscripcion_activa) values
    (r, 'QA Fase 5', true), (r_otro, 'QA Fase 5 aislado', true);
  insert into public.usuarios(id, restaurante_id, rol, nombre, activo) values
    (admin_id, r, 'admin_restaurante', 'Admin QA', true),
    (cocina_id, r, 'cocina', 'Cocina QA', true),
    (cajero_id, r, 'cajero', 'Cajero QA', true),
    (admin_otro_id, r_otro, 'admin_restaurante', 'Admin ajeno', true);
  insert into public.zonas(id, restaurante_id, nombre) values (z, r, 'QA');
  insert into public.mesas(id, restaurante_id, zona_id, nombre) values (m, r, z, 'Mesa F5');
  insert into public.productos(id, restaurante_id, nombre, precio, disponible, es_bebida, estacion) values
    (producto_cocina, r, 'Plato F5', 12, true, false, 'cocina'),
    (producto_bar, r, 'Bebida F5', 5, true, true, 'bar');
  select id into est_cocina from public.estaciones_restaurante where restaurante_id = r and codigo = 'cocina';
  select id into est_bar from public.estaciones_restaurante where restaurante_id = r and codigo = 'bar';
  if est_cocina is null or est_bar is null then raise exception 'No se crearon Cocina y Barra'; end if;
  update public.destinos_estacion set activo = false where restaurante_id = r;
  update public.configuracion_operativa set version = version + 1 where restaurante_id = r;

  -- Cocina KDS + Barra impresora: ticket mixto y salida manual con snapshot.
  insert into public.destinos_estacion(restaurante_id, estacion_id, tipo, grupo, nombre, papel_mm, configuracion, activo)
  values
    (r, est_cocina, 'kds', 'principal', 'KDS Cocina F5', null, '{}', true),
    (r, est_bar, 'impresora', 'principal', 'Térmica Barra F5', 58, '{"copias":2}', true);
  select id into destino_cocina from public.destinos_estacion
   where restaurante_id = r and estacion_id = est_cocina and grupo = 'principal' and tipo = 'kds';
  select id into destino_bar from public.destinos_estacion
   where restaurante_id = r and estacion_id = est_bar and grupo = 'principal' and tipo = 'impresora';
  perform set_config('request.jwt.claim.sub', admin_id::text, true);
  perform set_config('request.jwt.claims', '{"role":"authenticated"}', true);
  execute 'set local role authenticated';
  v_mezcla := public.crear_pedido(r, m, jsonb_build_array(
    jsonb_build_object('producto_id', producto_cocina, 'cantidad', 1, 'nota', 'sin sal'),
    jsonb_build_object('producto_id', producto_bar, 'cantidad', 2, 'nota', 'con hielo')
  ));
  if (select count(*) from public.entregas_comanda where pedido_id = v_mezcla and grupo = 'principal') <> 2
     or (select count(*) from public.estado_comanda_estacion where pedido_id = v_mezcla) <> 1
     or not exists (select 1 from public.entregas_comanda where pedido_id = v_mezcla and estacion_id = est_cocina and tipo_destino = 'kds' and estado = 'confirmada')
     or not exists (select 1 from public.entregas_comanda where pedido_id = v_mezcla and estacion_id = est_bar and tipo_destino = 'impresora' and estado = 'pendiente') then
    raise exception 'La modalidad mixta no separó KDS de Cocina e impresión de Barra';
  end if;
  select id, configuracion_version, (configuracion_destino->>'papel_mm')::smallint,
         (configuracion_destino->>'copias')::integer, destino_nombre
    into v_salida, v_version, v_ancho, v_copias, v_nombre
    from public.entregas_comanda where pedido_id = v_mezcla and estacion_id = est_bar and tipo_destino = 'impresora';
  if v_ancho <> 58 or v_copias <> 2 or v_nombre <> 'Térmica Barra F5' then raise exception 'No se guardó el snapshot de papel, copias e impresora'; end if;
  perform public.avanzar_comanda_estacion(r, v_mezcla, 'cocina');
  if (select estado from public.estado_comanda_estacion where pedido_id = v_mezcla and estacion_id = est_cocina) <> 'en_preparacion'
     or (select count(*) from public.estado_comanda_estacion where pedido_id = v_mezcla and estacion_id = est_bar) <> 0 then
    raise exception 'Avanzar Cocina alteró o creó estado de Barra sin KDS';
  end if;

  -- Solicitud inicial idempotente, confirmación manual y reimpresión auditada.
  v_solicitud := gen_random_uuid();
  v_resp := public.registrar_impresion_salida_comanda(r, v_mezcla, 'bar', v_salida, v_solicitud, null);
  if v_resp->>'estado' <> 'registrada' or v_resp->>'accion' <> 'comanda_imprimir' then raise exception 'No se registró la impresión inicial'; end if;
  v_resp := public.registrar_impresion_salida_comanda(r, v_mezcla, 'bar', v_salida, v_solicitud, null);
  if v_resp->>'estado' <> 'registrada' then raise exception 'El reintento idempotente no devolvió éxito'; end if;
  execute format('set local role %I', inicial);
  select count(*) into n from public.audit_logs where detalle->>'solicitud_id' = v_solicitud::text;
  if n <> 1 then raise exception 'La solicitud repetida creó % auditorías', n; end if;
  execute 'set local role authenticated';
  perform public.actualizar_estado_salida_comanda(r, v_salida, v_solicitud, 'confirmada');
  perform public.actualizar_estado_salida_comanda(r, v_salida, v_solicitud, 'confirmada');
  if (select estado from public.entregas_comanda where id = v_salida) <> 'confirmada' then raise exception 'La confirmación no actualizó la salida'; end if;
  v_solicitud_anterior := v_solicitud;
  v_solicitud := gen_random_uuid();
  v_resp := public.registrar_impresion_salida_comanda(r, v_mezcla, 'bar', v_salida, v_solicitud, null);
  if v_resp->>'estado' <> 'requiere_motivo' then raise exception 'La reimpresión no exigió motivo'; end if;
  v_resp := public.registrar_impresion_salida_comanda(r, v_mezcla, 'bar', v_salida, v_solicitud, 'Papel mal alineado');
  if v_resp->>'accion' <> 'comanda_reimprimir' then raise exception 'La reimpresión no quedó auditada como tal'; end if;
  begin
    perform public.actualizar_estado_salida_comanda(r, v_salida, v_solicitud_anterior, 'confirmada');
    raise exception 'Se aceptó una confirmación atrasada de una impresión anterior';
  exception when raise_exception then
    if sqlerrm not like 'Hay otra solicitud de impresión activa%' then raise; end if;
  end;
  perform public.actualizar_estado_salida_comanda(r, v_salida, v_solicitud, 'fallida');
  if (select estado from public.entregas_comanda where id = v_salida) <> 'fallida' then raise exception 'No se conservó el resultado manual de impresión fallida'; end if;

  -- Reconfigurar no toca la ruta ni el snapshot ya creado.
  update public.destinos_estacion set nombre = 'Nombre actualizado', papel_mm = 80, configuracion = '{"copias":1}' where id = destino_bar;
  if (select destino_nombre from public.entregas_comanda where id = v_salida) <> 'Térmica Barra F5'
     or (select configuracion_destino->>'papel_mm' from public.entregas_comanda where id = v_salida) <> '58'
     or (select configuracion_destino->>'copias' from public.entregas_comanda where id = v_salida) <> '2'
     or (select configuracion_version from public.entregas_comanda where id = v_salida) <> v_version then
    raise exception 'Un cambio posterior alteró el snapshot histórico';
  end if;

  -- Invertir destinos: Cocina impresora y Barra KDS.
  update public.destinos_estacion set activo = false where restaurante_id = r;
  insert into public.destinos_estacion(restaurante_id, estacion_id, tipo, grupo, nombre, papel_mm, configuracion, activo) values
    (r, est_cocina, 'impresora', 'principal', 'Térmica Cocina F5', 80, '{"copias":1}', true),
    (r, est_bar, 'kds', 'principal', 'KDS Barra F5', null, '{}', true);
  v_pedido := public.crear_pedido(r, m, jsonb_build_array(
    jsonb_build_object('producto_id', producto_cocina), jsonb_build_object('producto_id', producto_bar)
  ));
  if (select count(*) from public.estado_comanda_estacion where pedido_id = v_pedido) <> 1
     or not exists (select 1 from public.estado_comanda_estacion where pedido_id = v_pedido and estacion_id = est_bar)
     or not exists (select 1 from public.entregas_comanda where pedido_id = v_pedido and estacion_id = est_cocina and tipo_destino = 'impresora')
     or (select count(*) from public.entregas_comanda where pedido_id = v_pedido and estacion_id = est_bar and tipo_destino = 'impresora') <> 0 then
    raise exception 'La ruta inversa Cocina impresora/Barra KDS no se respetó';
  end if;

  -- KDS solo Cocina; KDS solo Barra.
  update public.destinos_estacion set activo = false where restaurante_id = r;
  insert into public.destinos_estacion(restaurante_id, estacion_id, tipo, grupo, nombre, papel_mm, activo) values
    (r, est_cocina, 'kds', 'principal', 'KDS Cocina solo', null, true);
  v_pedido := public.crear_pedido(r, m, jsonb_build_array(jsonb_build_object('producto_id', producto_cocina), jsonb_build_object('producto_id', producto_bar)));
  if (select count(*) from public.entregas_comanda where pedido_id = v_pedido) <> 1
     or (select count(*) from public.estado_comanda_estacion where pedido_id = v_pedido) <> 1 then raise exception 'Falla KDS solo Cocina'; end if;
  update public.destinos_estacion set activo = false where restaurante_id = r;
  insert into public.destinos_estacion(restaurante_id, estacion_id, tipo, grupo, nombre, papel_mm, activo) values
    (r, est_bar, 'kds', 'principal', 'KDS Barra solo', null, true);
  v_pedido := public.crear_pedido(r, m, jsonb_build_array(jsonb_build_object('producto_id', producto_cocina), jsonb_build_object('producto_id', producto_bar)));
  if (select count(*) from public.entregas_comanda where pedido_id = v_pedido) <> 1
     or (select count(*) from public.estado_comanda_estacion where pedido_id = v_pedido) <> 1
     or not exists (select 1 from public.entregas_comanda where pedido_id = v_pedido and estacion_id = est_bar and tipo_destino = 'kds') then raise exception 'Falla KDS solo Barra'; end if;

  -- Impresora solo Cocina; impresora solo Barra.
  update public.destinos_estacion set activo = false where restaurante_id = r;
  insert into public.destinos_estacion(restaurante_id, estacion_id, tipo, grupo, nombre, papel_mm, configuracion, activo) values
    (r, est_cocina, 'impresora', 'principal', 'Térmica Cocina solo', 58, '{"copias":2}', true);
  v_pedido := public.crear_pedido(r, m, jsonb_build_array(jsonb_build_object('producto_id', producto_cocina), jsonb_build_object('producto_id', producto_bar)));
  if (select count(*) from public.entregas_comanda where pedido_id = v_pedido) <> 1
     or (select count(*) from public.estado_comanda_estacion where pedido_id = v_pedido) <> 0 then raise exception 'Falla impresora solo Cocina'; end if;
  update public.destinos_estacion set activo = false where restaurante_id = r;
  insert into public.destinos_estacion(restaurante_id, estacion_id, tipo, grupo, nombre, papel_mm, configuracion, activo) values
    (r, est_bar, 'impresora', 'principal', 'Térmica Barra solo', 80, '{"copias":3}', true);
  v_pedido := public.crear_pedido(r, m, jsonb_build_array(jsonb_build_object('producto_id', producto_cocina), jsonb_build_object('producto_id', producto_bar)));
  if (select count(*) from public.entregas_comanda where pedido_id = v_pedido) <> 1
     or (select count(*) from public.estado_comanda_estacion where pedido_id = v_pedido) <> 0
     or not exists (select 1 from public.entregas_comanda where pedido_id = v_pedido and estacion_id = est_bar and tipo_destino = 'impresora') then raise exception 'Falla impresora solo Barra'; end if;

  -- Ambos KDS y ambos impresora.
  update public.destinos_estacion set activo = false where restaurante_id = r;
  insert into public.destinos_estacion(restaurante_id, estacion_id, tipo, grupo, nombre, papel_mm, activo) values
    (r, est_cocina, 'kds', 'principal', 'KDS Cocina ambos', null, true),
    (r, est_bar, 'kds', 'principal', 'KDS Barra ambos', null, true);
  v_pedido := public.crear_pedido(r, m, jsonb_build_array(jsonb_build_object('producto_id', producto_cocina), jsonb_build_object('producto_id', producto_bar)));
  if (select count(*) from public.entregas_comanda where pedido_id = v_pedido) <> 2
     or (select count(*) from public.estado_comanda_estacion where pedido_id = v_pedido) <> 2 then raise exception 'Falla KDS para ambas estaciones'; end if;
  update public.destinos_estacion set activo = false where restaurante_id = r;
  insert into public.destinos_estacion(restaurante_id, estacion_id, tipo, grupo, nombre, papel_mm, configuracion, activo) values
    (r, est_cocina, 'impresora', 'principal', 'Térmica Cocina ambas', 58, '{"copias":1}', true),
    (r, est_bar, 'impresora', 'principal', 'Térmica Barra ambas', 80, '{"copias":2}', true);
  v_pedido := public.crear_pedido(r, m, jsonb_build_array(jsonb_build_object('producto_id', producto_cocina), jsonb_build_object('producto_id', producto_bar)));
  if (select count(*) from public.entregas_comanda where pedido_id = v_pedido) <> 2
     or (select count(*) from public.estado_comanda_estacion where pedido_id = v_pedido) <> 0 then raise exception 'Falla impresión para ambas estaciones'; end if;

  -- Sin destinos: pedido e ítems permanecen, pero no hay salidas ni estado KDS.
  update public.destinos_estacion set activo = false where restaurante_id = r;
  v_pedido := public.crear_pedido(r, m, jsonb_build_array(jsonb_build_object('producto_id', producto_cocina), jsonb_build_object('producto_id', producto_bar)));
  if (select count(*) from public.pedidos where id = v_pedido) <> 1
     or (select count(*) from public.pedido_items where pedido_id = v_pedido) <> 2
     or exists (select 1 from public.entregas_comanda where pedido_id = v_pedido)
     or exists (select 1 from public.estado_comanda_estacion where pedido_id = v_pedido) then raise exception 'Una comanda sin salida no conservó sus datos o generó una salida'; end if;
  begin
    perform public.avanzar_comanda_estacion(r, v_pedido, 'cocina');
    raise exception 'El usuario pudo avanzar una estación sin KDS';
  exception when insufficient_privilege then null;
  end;

  -- Impresión no modifica pedidos, pagos ni cuentas.
  if exists (select 1 from public.cuentas where restaurante_id = r)
     or exists (select 1 from public.cuenta_pagos where restaurante_id = r) then raise exception 'La salida manual afectó caja o pagos'; end if;

  -- RLS, tenant y rol: la cocina puede registrar; el cajero y otro restaurante no.
  update public.destinos_estacion set activo = false where restaurante_id = r;
  insert into public.destinos_estacion(restaurante_id, estacion_id, tipo, grupo, nombre, papel_mm, activo)
    values (r, est_cocina, 'impresora', 'principal', 'Térmica permisos', 80, true);
  v_pedido := public.crear_pedido(r, m, jsonb_build_array(jsonb_build_object('producto_id', producto_cocina)));
  select id into v_salida from public.entregas_comanda where pedido_id = v_pedido and tipo_destino = 'impresora';
  perform set_config('request.jwt.claim.sub', cocina_id::text, true);
  v_solicitud := gen_random_uuid();
  v_resp := public.registrar_impresion_salida_comanda(r, v_pedido, 'cocina', v_salida, v_solicitud, null);
  if v_resp->>'estado' <> 'registrada' then raise exception 'El rol Cocina no pudo registrar impresión manual'; end if;
  perform set_config('request.jwt.claim.sub', cajero_id::text, true);
  begin
    perform public.registrar_impresion_salida_comanda(r, v_pedido, 'cocina', v_salida, gen_random_uuid(), null);
    raise exception 'El rol Cajero pudo imprimir una comanda';
  exception when insufficient_privilege then null;
  end;
  perform set_config('request.jwt.claim.sub', admin_otro_id::text, true);
  if exists (select 1 from public.entregas_comanda where restaurante_id = r) then raise exception 'RLS dejó leer las salidas de otro restaurante'; end if;
  begin
    perform public.actualizar_estado_salida_comanda(r, v_salida, v_solicitud, 'confirmada');
    raise exception 'Un restaurante ajeno modificó la salida';
  exception when insufficient_privilege then null;
  end;
  if has_function_privilege('anon', 'public.registrar_impresion_salida_comanda(uuid,uuid,text,uuid,uuid,text)', 'execute')
     or has_function_privilege('anon', 'public.actualizar_estado_salida_comanda(uuid,uuid,uuid,text)', 'execute')
     or not has_function_privilege('authenticated', 'public.registrar_impresion_salida_comanda(uuid,uuid,text,uuid,uuid,text)', 'execute') then
    raise exception 'Los permisos de las RPC de impresión no son correctos';
  end if;
  execute format('set local role %I', inicial);
end;
$$;
rollback;
