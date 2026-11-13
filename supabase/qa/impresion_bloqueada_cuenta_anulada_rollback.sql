-- QA transaccional de salidas de impresora vinculadas a recibos anulados.
-- Todo usa datos sintéticos y se revierte al finalizar.
begin;
do $$
declare
  r uuid := gen_random_uuid();
  r_ajeno uuid := gen_random_uuid();
  admin_id uuid := gen_random_uuid();
  cocina_id uuid := gen_random_uuid();
  admin_ajeno_id uuid := gen_random_uuid();
  z uuid := gen_random_uuid();
  m1 uuid := gen_random_uuid();
  m2 uuid := gen_random_uuid();
  m3 uuid := gen_random_uuid();
  prod_cocina uuid := gen_random_uuid();
  prod_bar uuid := gen_random_uuid();
  cocina_est uuid;
  bar_est uuid;
  entrega_cocina uuid;
  entrega_bar uuid;
  pedido uuid;
  cuenta uuid;
  cuenta_manual uuid;
  cuenta_agente uuid;
  cuenta_legacy uuid := gen_random_uuid();
  pedido_manual uuid;
  pedido_agente uuid;
  pedido_legacy uuid;
  entrega_legacy uuid;
  trabajo_cocina uuid := gen_random_uuid();
  trabajo_bar uuid := gen_random_uuid();
  trabajo_activo uuid := gen_random_uuid();
  agente uuid := gen_random_uuid();
  reclamo uuid := gen_random_uuid();
  solicitud uuid := gen_random_uuid();
  token text := repeat('d', 64);
  respuesta jsonb;
  n integer;
  inicial text := current_user;
begin
  insert into auth.users(id, email) values
    (admin_id, 'qa-print-void-admin@mesora.example'),
    (cocina_id, 'qa-print-void-kitchen@mesora.example'),
    (admin_ajeno_id, 'qa-print-void-other@mesora.example');
  insert into public.restaurantes(id, nombre, suscripcion_activa) values
    (r, 'QA impresión cuenta anulada', true),
    (r_ajeno, 'QA aislamiento impresión', true);
  insert into public.usuarios(id, restaurante_id, rol, nombre, activo) values
    (admin_id, r, 'admin_restaurante', 'Admin QA', true),
    (cocina_id, r, 'cocina', 'Cocina QA', true),
    (admin_ajeno_id, r_ajeno, 'admin_restaurante', 'Admin ajeno QA', true);
  insert into public.zonas(id, restaurante_id, nombre) values (z, r, 'QA');
  insert into public.mesas(id, restaurante_id, zona_id, nombre) values
    (m1, r, z, 'Mesa QA impresión 1'),
    (m2, r, z, 'Mesa QA impresión 2'),
    (m3, r, z, 'Mesa QA impresión 3');
  insert into public.productos(id, restaurante_id, nombre, precio, disponible, es_bebida, estacion) values
    (prod_cocina, r, 'Plato QA cocina', 20, true, false, 'cocina'),
    (prod_bar, r, 'Bebida QA barra', 8, true, true, 'bar');
  select id into cocina_est from public.estaciones_restaurante where restaurante_id = r and codigo = 'cocina';
  select id into bar_est from public.estaciones_restaurante where restaurante_id = r and codigo = 'bar';
  update public.destinos_estacion set activo = false where restaurante_id = r;
  insert into public.destinos_estacion(restaurante_id, estacion_id, tipo, grupo, nombre, papel_mm, activo) values
    (r, cocina_est, 'impresora', 'principal', 'Cocina QA', 80, true),
    (r, bar_est, 'impresora', 'principal', 'Barra QA', 58, true);

  perform set_config('request.jwt.claims', '{"role":"authenticated"}', true);
  perform set_config('request.jwt.claim.sub', admin_id::text, true);
  execute 'set local role authenticated';
  pedido := public.crear_pedido(r, m1, jsonb_build_array(
    jsonb_build_object('producto_id', prod_cocina, 'cantidad', 1),
    jsonb_build_object('producto_id', prod_bar, 'cantidad', 1)
  ));
  execute format('set local role %I', inicial);
  select id into entrega_cocina from public.entregas_comanda where pedido_id = pedido and estacion_id = cocina_est and tipo_destino = 'impresora';
  select id into entrega_bar from public.entregas_comanda where pedido_id = pedido and estacion_id = bar_est and tipo_destino = 'impresora';
  if (select estado from public.entregas_comanda where id = entrega_cocina) <> 'pendiente'
     or (select estado from public.entregas_comanda where id = entrega_bar) <> 'pendiente' then
    raise exception 'La prueba no comenzó con ambas salidas pendientes';
  end if;

  insert into private.agentes_impresion(id, restaurante_id, nombre, token_hash)
    values (agente, r, 'Agente QA', encode(extensions.digest(token, 'sha256'), 'hex'));
  insert into private.trabajos_impresion(id, restaurante_id, tipo, entrega_id, pedido_id,
    destino_id, agente_id, estacion_codigo, cola_windows, papel_mm, copias,
    configuracion_version, max_intentos, reintento_base_seg)
  select trabajo_cocina, r, 'comanda', d.id, d.pedido_id, d.destino_estacion_id, agente,
    'cocina', 'Cola QA Cocina', 80, 1, d.configuracion_version, 3, 15
    from public.entregas_comanda d where d.id = entrega_cocina;
  insert into private.trabajos_impresion(id, restaurante_id, tipo, entrega_id, pedido_id,
    destino_id, agente_id, estacion_codigo, cola_windows, papel_mm, copias,
    configuracion_version, max_intentos, reintento_base_seg)
  select trabajo_bar, r, 'comanda', d.id, d.pedido_id, d.destino_estacion_id, agente,
    'bar', 'Cola QA Barra', 58, 1, d.configuracion_version, 3, 15
    from public.entregas_comanda d where d.id = entrega_bar;

  perform set_config('request.jwt.claim.sub', admin_id::text, true);
  execute 'set local role authenticated';
  cuenta := public.cerrar_cuenta(r, m1, array[pedido], '[{"metodo_pago":"efectivo","monto":28}]'::jsonb, 0);
  execute format('set local role %I', inicial);
  if (select count(*) from public.cuenta_pedidos where cuenta_id = cuenta and pedido_id = pedido) <> 1 then
    raise exception 'No se conservó el vínculo cuenta-pedido';
  end if;
  perform set_config('request.jwt.claim.sub', admin_id::text, true);
  execute 'set local role authenticated';
  perform public.anular_cuenta(r, cuenta, 'QA anulación salida', null);
  execute format('set local role %I', inicial);

  if (select count(*) from public.entregas_comanda where id in (entrega_cocina, entrega_bar)
        and estado = 'cancelada' and cancelada_por_anulacion_cuenta
        and cancelada_cuenta_id = cuenta and cancelada_por = admin_id
        and motivo_cancelacion = 'QA anulación salida' and cancelada_at is not null) <> 2 then
    raise exception 'La anulación no canceló y trazó ambas salidas';
  end if;
  if (select count(*) from private.trabajos_impresion where id in (trabajo_cocina, trabajo_bar) and estado = 'cancelado') <> 2 then
    raise exception 'La anulación no bloqueó los trabajos del agente';
  end if;
  if (select count(*) from public.audit_logs where entidad = 'entrega_comanda'
       and entidad_id in (entrega_cocina, entrega_bar)
       and accion = 'comanda_salida_cancelada_por_anulacion_cuenta'
       and actor_id = admin_id) <> 2 then
    raise exception 'Faltan eventos de auditoría de salidas canceladas';
  end if;

  perform set_config('request.jwt.claim.sub', admin_id::text, true);
  execute 'set local role authenticated';
  begin
    perform public.registrar_impresion_salida_comanda(r, pedido, 'cocina', entrega_cocina, solicitud, null);
    raise exception 'Una llamada directa registró impresión para una cuenta anulada';
  exception when sqlstate '22023' then
    if sqlerrm = 'Una llamada directa registró impresión para una cuenta anulada' then raise; end if;
    if sqlerrm not like 'La cuenta fue anulada.%' then raise; end if;
  end;
  begin
    perform public.actualizar_estado_salida_comanda(r, entrega_bar, gen_random_uuid(), 'confirmada');
    raise exception 'Una llamada directa confirmó salida de una cuenta anulada';
  exception when sqlstate '22023' then
    if sqlerrm = 'Una llamada directa confirmó salida de una cuenta anulada' then raise; end if;
    if sqlerrm not like 'La cuenta fue anulada.%' then raise; end if;
  end;
  if not (pedido = any(public.pedidos_con_cuenta_anulada(r, array[pedido]))) then
    raise exception 'La RPC operativa no marcó el pedido como cuenta anulada';
  end if;
  execute format('set local role %I', inicial);

  -- Simula una cuenta que ya estaba anulada antes de instalar los triggers.
  -- El agente debe reconciliar su salida antigua sin reclamarla ni imprimirla.
  perform set_config('request.jwt.claim.sub', admin_id::text, true);
  execute 'set local role authenticated';
  pedido_legacy := public.crear_pedido(r, m3, jsonb_build_array(
    jsonb_build_object('producto_id', prod_bar, 'cantidad', 1)
  ));
  execute format('set local role %I', inicial);
  select id into entrega_legacy from public.entregas_comanda
   where pedido_id = pedido_legacy and estacion_id = bar_est and tipo_destino = 'impresora';
  insert into public.cuentas(id, restaurante_id, mesa_id, total, metodo_pago, estado,
    pagado_at, anulada_at, anulada_por, motivo_anulacion, numero)
  values (cuenta_legacy, r, m3, 8, 'efectivo', 'anulada', now(), now(), admin_id,
    'QA cuenta anulada preexistente', 'BQA-LEGACY-' || left(cuenta_legacy::text, 8));
  insert into public.cuenta_pedidos(cuenta_id, pedido_id, subtotal)
  values (cuenta_legacy, pedido_legacy, 8);
  if (select estado from public.entregas_comanda where id = entrega_legacy) <> 'pendiente' then
    raise exception 'La fixture legacy debe comenzar pendiente';
  end if;

  perform set_config('request.jwt.claim.sub', admin_id::text, true);
  execute 'set local role authenticated';
  begin
    perform public.registrar_impresion_salida_comanda(r, pedido_legacy, 'bar', entrega_legacy, gen_random_uuid(), null);
    raise exception 'Una RPC directa habilito una salida de cuenta anulada preexistente';
  exception when sqlstate '22023' then
    if sqlerrm = 'Una RPC directa habilito una salida de cuenta anulada preexistente' then raise; end if;
    if sqlerrm not like 'La cuenta fue anulada.%' then raise; end if;
  end;
  execute format('set local role %I', inicial);

  execute 'set local role anon';
  if public.agente_impresion_reclamar(token) is not null then
    raise exception 'El agente reclamó una salida de cuenta anulada';
  end if;
  begin
    perform public.agente_impresion_iniciar_envio(token, trabajo_cocina, gen_random_uuid());
    raise exception 'El agente preparó una salida anulada';
  exception when sqlstate '22023' then
    if sqlerrm = 'El agente preparó una salida anulada' then raise; end if;
    if sqlerrm not like 'La cuenta fue anulada.%' then raise; end if;
  end;
  execute format('set local role %I', inicial);

  perform set_config('request.jwt.claim.sub', cocina_id::text, true);
  execute 'set local role authenticated';
  if not (pedido = any(public.pedidos_con_cuenta_anulada(r, array[pedido]))) then
    raise exception 'Cocina no pudo consultar el estado mínimo para bloquear la impresión';
  end if;
  begin
    perform public.pedidos_con_cuenta_anulada(r_ajeno, array[pedido]);
    raise exception 'Cocina consultó otro restaurante';
  exception when insufficient_privilege then null;
  end;
  execute format('set local role %I', inicial);

  -- El historial operativo permanece: pedido, ítems, pago, recibo y auditoría.
  if (select count(*) from public.pedidos where id = pedido and restaurante_id = r) <> 1
     or (select count(*) from public.pedido_items where pedido_id = pedido) <> 2
     or (select count(*) from public.cuenta_pagos where cuenta_id = cuenta) <> 1
     or (select count(*) from public.cuentas where id = cuenta and estado = 'anulada') <> 1
     or (select count(*) from public.audit_logs where entidad_id = cuenta and accion = 'cuenta_anular') <> 1
     or (select count(*) from public.entregas_comanda where id in (entrega_cocina, entrega_bar)) <> 2 then
    raise exception 'La anulación borró o alteró datos históricos';
  end if;

  -- La anulación se detiene mientras haya diálogo manual abierto.
  perform set_config('request.jwt.claim.sub', admin_id::text, true);
  execute 'set local role authenticated';
  pedido_manual := public.crear_pedido(r, m2, jsonb_build_array(jsonb_build_object('producto_id', prod_cocina)));
  execute format('set local role %I', inicial);
  select id into entrega_cocina from public.entregas_comanda where pedido_id = pedido_manual and tipo_destino = 'impresora';
  perform set_config('request.jwt.claim.sub', admin_id::text, true);
  execute 'set local role authenticated';
  cuenta_manual := public.cerrar_cuenta(r, m2, array[pedido_manual], '[{"metodo_pago":"efectivo","monto":20}]'::jsonb, 0);
  execute format('set local role %I', inicial);
  update public.entregas_comanda set estado = 'enviada', solicitud_impresion_id = gen_random_uuid() where id = entrega_cocina;
  perform set_config('request.jwt.claim.sub', admin_id::text, true);
  execute 'set local role authenticated';
  begin
    perform public.anular_cuenta(r, cuenta_manual, 'QA carrera manual', null);
    raise exception 'La cuenta se anuló con impresión manual en curso';
  exception when sqlstate '55000' then null;
  end;
  execute format('set local role %I', inicial);
  if (select estado from public.cuentas where id = cuenta_manual) <> 'pagada' then
    raise exception 'El bloqueo de carrera dejó la cuenta parcialmente anulada';
  end if;

  -- El agente en envío externo también impide una anulación concurrente.
  perform set_config('request.jwt.claim.sub', admin_id::text, true);
  execute 'set local role authenticated';
  pedido_agente := public.crear_pedido(r, m3, jsonb_build_array(jsonb_build_object('producto_id', prod_bar)));
  execute format('set local role %I', inicial);
  select id into entrega_bar from public.entregas_comanda where pedido_id = pedido_agente and tipo_destino = 'impresora';
  perform set_config('request.jwt.claim.sub', admin_id::text, true);
  execute 'set local role authenticated';
  cuenta_agente := public.cerrar_cuenta(r, m3, array[pedido_agente], '[{"metodo_pago":"efectivo","monto":8}]'::jsonb, 0);
  execute format('set local role %I', inicial);
  insert into private.trabajos_impresion(id, restaurante_id, tipo, entrega_id, pedido_id,
    destino_id, agente_id, estacion_codigo, cola_windows, papel_mm, copias,
    configuracion_version, max_intentos, reintento_base_seg, estado, reclamo_id, lease_hasta, envio_iniciado_at)
  select trabajo_activo, r, 'comanda', d.id, d.pedido_id, d.destino_estacion_id, agente,
    'bar', 'Cola QA Barra activa', 58, 1, d.configuracion_version, 3, 15,
    'reclamado', reclamo, now() + interval '1 minute', now()
    from public.entregas_comanda d where d.id = entrega_bar;
  perform set_config('request.jwt.claim.sub', admin_id::text, true);
  execute 'set local role authenticated';
  begin
    perform public.anular_cuenta(r, cuenta_agente, 'QA carrera agente', null);
    raise exception 'La cuenta se anuló con el agente en envío';
  exception when sqlstate '55000' then null;
  end;
  execute format('set local role %I', inicial);
  if (select estado from public.cuentas where id = cuenta_agente) <> 'pagada'
     or (select estado from private.trabajos_impresion where id = trabajo_activo) <> 'reclamado' then
    raise exception 'El bloqueo de carrera del agente cambió estados parcialmente';
  end if;
end;
$$;
rollback;
