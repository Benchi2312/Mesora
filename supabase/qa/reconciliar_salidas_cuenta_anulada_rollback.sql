-- Reconciliación idempotente de salidas históricas asociadas a cuentas anuladas.
-- Solo fixtures sintéticos; el bloque completo se revierte al final.
begin;

create temporary table qa_reconciliacion_ids (
  restaurante_id uuid,
  restaurante_ajeno_id uuid,
  admin_id uuid,
  admin_ajeno_id uuid,
  mesa_id uuid,
  mesa_envio_iniciado_id uuid,
  mesa_ajena_id uuid,
  pedido_id uuid,
  pedido_envio_iniciado_id uuid,
  pedido_ajeno_id uuid,
  cuenta_id uuid,
  cuenta_envio_iniciado_id uuid,
  cuenta_ajena_id uuid,
  entrega_cocina_id uuid,
  entrega_bar_id uuid,
  entrega_envio_iniciado_id uuid,
  entrega_ajena_id uuid,
  trabajo_cocina_id uuid,
  trabajo_bar_id uuid,
  trabajo_envio_iniciado_id uuid,
  agente_id uuid,
  token text,
  reclamo_id uuid,
  solicitud_id uuid
) on commit drop;

do $$
declare
  r uuid := gen_random_uuid();
  r_ajeno uuid := gen_random_uuid();
  admin_id uuid := gen_random_uuid();
  admin_ajeno_id uuid := gen_random_uuid();
  z uuid := gen_random_uuid();
  z_ajeno uuid := gen_random_uuid();
  m uuid := gen_random_uuid();
  m_envio uuid := gen_random_uuid();
  m_ajena uuid := gen_random_uuid();
  prod_cocina uuid := gen_random_uuid();
  prod_bar uuid := gen_random_uuid();
  prod_ajeno uuid := gen_random_uuid();
  cocina_est uuid;
  bar_est uuid;
  cocina_est_ajena uuid;
  entrega_cocina uuid;
  entrega_bar uuid;
  entrega_envio uuid;
  entrega_ajena uuid;
  pedido uuid;
  pedido_envio uuid;
  pedido_ajeno uuid;
  cuenta uuid := gen_random_uuid();
  cuenta_envio uuid := gen_random_uuid();
  cuenta_ajena uuid := gen_random_uuid();
  trabajo_cocina uuid := gen_random_uuid();
  trabajo_bar uuid := gen_random_uuid();
  trabajo_envio uuid := gen_random_uuid();
  agente uuid := gen_random_uuid();
  token text := repeat('e', 64);
  reclamo uuid := gen_random_uuid();
  solicitud uuid := gen_random_uuid();
  inicial text := current_user;
begin
  insert into auth.users(id, email) values
    (admin_id, 'qa-reconcile-admin@mesora.example'),
    (admin_ajeno_id, 'qa-reconcile-other@mesora.example');
  insert into public.restaurantes(id, nombre, suscripcion_activa) values
    (r, 'QA reconciliación salidas', true),
    (r_ajeno, 'QA otro restaurante salidas', true);
  insert into public.usuarios(id, restaurante_id, rol, nombre, activo) values
    (admin_id, r, 'admin_restaurante', 'Admin QA reconciliación', true),
    (admin_ajeno_id, r_ajeno, 'admin_restaurante', 'Admin QA ajeno', true);
  insert into public.zonas(id, restaurante_id, nombre) values
    (z, r, 'QA reconciliación'), (z_ajeno, r_ajeno, 'QA ajeno');
  insert into public.mesas(id, restaurante_id, zona_id, nombre) values
    (m, r, z, 'Mesa QA principal'),
    (m_envio, r, z, 'Mesa QA envío iniciado'),
    (m_ajena, r_ajeno, z_ajeno, 'Mesa QA ajena');
  insert into public.productos(id, restaurante_id, nombre, precio, disponible, es_bebida, estacion) values
    (prod_cocina, r, 'Plato QA reconciliación', 20, true, false, 'cocina'),
    (prod_bar, r, 'Bebida QA reconciliación', 8, true, true, 'bar'),
    (prod_ajeno, r_ajeno, 'Producto QA ajeno', 5, true, false, 'cocina');

  select id into cocina_est from public.estaciones_restaurante where restaurante_id = r and codigo = 'cocina';
  select id into bar_est from public.estaciones_restaurante where restaurante_id = r and codigo = 'bar';
  select id into cocina_est_ajena from public.estaciones_restaurante where restaurante_id = r_ajeno and codigo = 'cocina';
  update public.destinos_estacion set activo = false where restaurante_id in (r, r_ajeno);
  insert into public.destinos_estacion(restaurante_id, estacion_id, tipo, grupo, nombre, papel_mm, activo) values
    (r, cocina_est, 'impresora', 'principal', 'QA reconciliación Cocina', 80, true),
    (r, bar_est, 'impresora', 'principal', 'QA reconciliación Barra', 58, true),
    (r_ajeno, cocina_est_ajena, 'impresora', 'principal', 'QA ajeno Cocina', 80, true);

  perform set_config('request.jwt.claims', '{"role":"authenticated"}', true);
  perform set_config('request.jwt.claim.sub', admin_id::text, true);
  execute 'set local role authenticated';
  pedido := public.crear_pedido(r, m, jsonb_build_array(
    jsonb_build_object('producto_id', prod_cocina, 'cantidad', 1),
    jsonb_build_object('producto_id', prod_bar, 'cantidad', 1)
  ));
  pedido_envio := public.crear_pedido(r, m_envio, jsonb_build_array(
    jsonb_build_object('producto_id', prod_cocina, 'cantidad', 1)
  ));
  execute format('set local role %I', inicial);

  select id into entrega_cocina from public.entregas_comanda
   where pedido_id = pedido and estacion_id = cocina_est and tipo_destino = 'impresora';
  select id into entrega_bar from public.entregas_comanda
   where pedido_id = pedido and estacion_id = bar_est and tipo_destino = 'impresora';
  select id into entrega_envio from public.entregas_comanda
   where pedido_id = pedido_envio and estacion_id = cocina_est and tipo_destino = 'impresora';
  if entrega_cocina is null or entrega_bar is null or entrega_envio is null then
    raise exception 'La fixture no generó las tres salidas de impresora';
  end if;

  -- Estas cuentas se insertan como ya anuladas: la migración anterior no tuvo
  -- transición de estado que activara su trigger.
  insert into public.cuentas(id, restaurante_id, mesa_id, total, metodo_pago, estado,
    pagado_at, anulada_at, anulada_por, motivo_anulacion, numero)
  values
    (cuenta, r, m, 28, 'efectivo', 'anulada', now() - interval '2 hours', now() - interval '1 hour', admin_id,
      'QA cuenta histórica anulada', 'BQA-REC-' || left(cuenta::text, 8)),
    (cuenta_envio, r, m_envio, 20, 'efectivo', 'anulada', now() - interval '2 hours', now() - interval '1 hour', admin_id,
      'QA cuenta con envío iniciado', 'BQA-SEND-' || left(cuenta_envio::text, 8));
  insert into public.cuenta_pedidos(cuenta_id, pedido_id, subtotal) values
    (cuenta, pedido, 28), (cuenta_envio, pedido_envio, 20);
  insert into public.cuenta_pagos(cuenta_id, restaurante_id, metodo_pago, monto) values
    (cuenta, r, 'efectivo', 28), (cuenta_envio, r, 'efectivo', 20);

  -- Un evento existente para comprobar que el backfill no duplica auditoría.
  insert into public.audit_logs(actor_id, actor_rol, actor_nombre, restaurante_id,
    restaurante_nombre, entidad, entidad_id, accion, descripcion, detalle)
  values (admin_id, 'admin_restaurante', 'Admin QA reconciliación', r,
    'QA reconciliación salidas', 'entrega_comanda', entrega_cocina,
    'comanda_salida_cancelada_por_anulacion_cuenta', 'Auditoría ya existente',
    jsonb_build_object('cuenta_id', cuenta, 'pedido_id', pedido, 'entrega_id', entrega_cocina));

  insert into private.agentes_impresion(id, restaurante_id, nombre, token_hash)
    values (agente, r, 'Agente QA reconciliación', encode(extensions.digest(token, 'sha256'), 'hex'));
  insert into private.trabajos_impresion(id, restaurante_id, tipo, entrega_id, pedido_id,
    destino_id, agente_id, estacion_codigo, cola_windows, papel_mm, copias,
    configuracion_version, max_intentos, reintento_base_seg)
  select trabajo_cocina, r, 'comanda', d.id, d.pedido_id, d.destino_estacion_id, agente,
    'cocina', 'QA Cocina', 80, 1, d.configuracion_version, 3, 15
    from public.entregas_comanda d where d.id = entrega_cocina;
  insert into private.trabajos_impresion(id, restaurante_id, tipo, entrega_id, pedido_id,
    destino_id, agente_id, estacion_codigo, cola_windows, papel_mm, copias,
    configuracion_version, max_intentos, reintento_base_seg)
  select trabajo_bar, r, 'comanda', d.id, d.pedido_id, d.destino_estacion_id, agente,
    'bar', 'QA Barra', 58, 1, d.configuracion_version, 3, 15
    from public.entregas_comanda d where d.id = entrega_bar;
  insert into private.trabajos_impresion(id, restaurante_id, tipo, entrega_id, pedido_id,
    destino_id, agente_id, estacion_codigo, cola_windows, papel_mm, copias,
    configuracion_version, max_intentos, reintento_base_seg, estado,
    intentos, reclamo_id, lease_hasta, envio_iniciado_at)
  select trabajo_envio, r, 'comanda', d.id, d.pedido_id, d.destino_estacion_id, agente,
    'cocina', 'QA envío incierto', 80, 1, d.configuracion_version, 3, 15, 'reclamado',
    1, reclamo, now() + interval '5 minutes', now() - interval '1 minute'
    from public.entregas_comanda d where d.id = entrega_envio;

  perform set_config('request.jwt.claim.sub', admin_ajeno_id::text, true);
  execute 'set local role authenticated';
  pedido_ajeno := public.crear_pedido(r_ajeno, m_ajena, jsonb_build_array(
    jsonb_build_object('producto_id', prod_ajeno, 'cantidad', 1)
  ));
  execute format('set local role %I', inicial);
  select id into entrega_ajena from public.entregas_comanda
   where pedido_id = pedido_ajeno and estacion_id = cocina_est_ajena and tipo_destino = 'impresora';
  cuenta_ajena := gen_random_uuid();
  insert into public.cuentas(id, restaurante_id, mesa_id, total, metodo_pago, estado, pagado_at, numero)
    values (cuenta_ajena, r_ajeno, m_ajena, 5, 'efectivo', 'pagada', now(), 'BQA-OTHER-' || left(cuenta_ajena::text, 8));
  insert into public.cuenta_pedidos(cuenta_id, pedido_id, subtotal) values (cuenta_ajena, pedido_ajeno, 5);

  insert into pg_temp.qa_reconciliacion_ids values (
    r, r_ajeno, admin_id, admin_ajeno_id, m, m_envio, m_ajena,
    pedido, pedido_envio, pedido_ajeno, cuenta, cuenta_envio, cuenta_ajena,
    entrega_cocina, entrega_bar, entrega_envio, entrega_ajena,
    trabajo_cocina, trabajo_bar, trabajo_envio, agente, token, reclamo, solicitud
  );

  if (select count(*) from public.entregas_comanda where id in (entrega_cocina, entrega_bar, entrega_envio) and estado = 'pendiente') <> 3 then
    raise exception 'Las salidas históricas deben iniciar pendientes';
  end if;
end;
$$;

/* APLICAR_MIGRACION_RECONCILIACION_SALIDAS */

do $$
declare
  f record;
begin
  select * into f from pg_temp.qa_reconciliacion_ids;
  if (select count(*) from public.entregas_comanda
       where id in (f.entrega_cocina_id, f.entrega_bar_id)
         and estado = 'cancelada' and cancelada_por_anulacion_cuenta
         and cancelada_cuenta_id = f.cuenta_id and cancelada_por = f.admin_id
         and motivo_cancelacion = 'QA cuenta histórica anulada'
         and cancelada_at = (select anulada_at from public.cuentas where id = f.cuenta_id)) <> 2 then
    raise exception 'La primera ejecución no reconcilió las dos salidas pendientes con su trazabilidad';
  end if;
  if (select count(*) from private.trabajos_impresion
       where id in (f.trabajo_cocina_id, f.trabajo_bar_id) and estado = 'cancelado'
         and envio_iniciado_at is null and lease_hasta is null and proximo_intento_at is null) <> 2 then
    raise exception 'La primera ejecución no canceló los trabajos que aún no habían iniciado envío';
  end if;
  if (select count(*) from public.audit_logs where entidad='entrega_comanda'
       and entidad_id in (f.entrega_cocina_id, f.entrega_bar_id, f.entrega_envio_iniciado_id)
       and accion='comanda_salida_cancelada_por_anulacion_cuenta') <> 3 then
    raise exception 'La primera ejecución no dejó una auditoría por salida';
  end if;
  if (select count(*) from public.entregas_comanda where id=f.entrega_envio_iniciado_id
       and cancelada_por_anulacion_cuenta and estado='pendiente') <> 1
     or (select count(*) from private.trabajos_impresion where id=f.trabajo_envio_iniciado_id
       and estado='reclamado' and envio_iniciado_at is not null and reclamo_id=f.reclamo_id) <> 1 then
    raise exception 'La salida con envío iniciado cambió un resultado físico incierto';
  end if;
  if (select count(*) from public.entregas_comanda where id=f.entrega_ajena_id
       and estado='pendiente' and not cancelada_por_anulacion_cuenta) <> 1
     or exists(select 1 from public.audit_logs where entidad='entrega_comanda'
       and entidad_id=f.entrega_ajena_id and accion='comanda_salida_cancelada_por_anulacion_cuenta') then
    raise exception 'La migración alteró una salida de otro restaurante';
  end if;
end;
$$;

/* APLICAR_MIGRACION_RECONCILIACION_SALIDAS_SEGUNDA_VEZ */

do $$
declare
  f record;
  inicial text := current_user;
begin
  select * into f from pg_temp.qa_reconciliacion_ids;
  if (select count(*) from public.audit_logs where entidad='entrega_comanda'
       and entidad_id in (f.entrega_cocina_id, f.entrega_bar_id, f.entrega_envio_iniciado_id)
       and accion='comanda_salida_cancelada_por_anulacion_cuenta') <> 3 then
    raise exception 'La segunda ejecución duplicó auditorías o perdió historial';
  end if;
  if (select count(*) from public.pedidos where id in (f.pedido_id, f.pedido_envio_iniciado_id, f.pedido_ajeno_id)) <> 3
     or (select count(*) from public.pedido_items where pedido_id in (f.pedido_id, f.pedido_envio_iniciado_id, f.pedido_ajeno_id)) <> 4
     or (select count(*) from public.cuenta_pagos where cuenta_id in (f.cuenta_id, f.cuenta_envio_iniciado_id)) <> 2
     or (select count(*) from public.cuentas where id in (f.cuenta_id, f.cuenta_envio_iniciado_id) and estado='anulada') <> 2 then
    raise exception 'La reconciliación alteró pedidos, ítems, pagos o cuentas';
  end if;

  perform set_config('request.jwt.claims', '{"role":"authenticated"}', true);
  perform set_config('request.jwt.claim.sub', f.admin_id::text, true);
  execute 'set local role authenticated';
  begin
    perform public.registrar_impresion_salida_comanda(f.restaurante_id, f.pedido_id,
      'cocina', f.entrega_cocina_id, f.solicitud_id, null);
    raise exception 'Una RPC manual registró impresión para una cuenta anulada';
  exception when sqlstate '22023' then
    if sqlerrm = 'Una RPC manual registró impresión para una cuenta anulada'
       or sqlerrm not like 'La cuenta fue anulada.%' then raise; end if;
  end;
  begin
    perform public.actualizar_estado_salida_comanda(f.restaurante_id, f.entrega_bar_id,
      f.solicitud_id, 'confirmada');
    raise exception 'Una RPC manual confirmó salida de una cuenta anulada';
  exception when sqlstate '22023' then
    if sqlerrm = 'Una RPC manual confirmó salida de una cuenta anulada'
       or sqlerrm not like 'La cuenta fue anulada.%' then raise; end if;
  end;
  execute format('set local role %I', inicial);

  execute 'set local role anon';
  if public.agente_impresion_reclamar(f.token) is not null then
    raise exception 'El agente reclamó un trabajo de cuenta anulada';
  end if;
  begin
    perform public.agente_impresion_iniciar_envio(f.token, f.trabajo_envio_iniciado_id, f.reclamo_id);
    raise exception 'El agente reanudó un envío asociado a una cuenta anulada';
  exception when sqlstate '22023' then
    if sqlerrm = 'El agente reanudó un envío asociado a una cuenta anulada'
       or sqlerrm not like 'La cuenta fue anulada.%' then raise; end if;
  end;
  execute format('set local role %I', inicial);

  perform set_config('request.jwt.claim.sub', f.admin_ajeno_id::text, true);
  execute 'set local role authenticated';
  begin
    perform public.pedidos_con_cuenta_anulada(f.restaurante_id, array[f.pedido_id]);
    raise exception 'Un restaurante consultó el estado operativo de otro tenant';
  exception when insufficient_privilege then null;
  end;
  execute format('set local role %I', inicial);

  -- Las RPC manuales y del agente comparten la comprobación que bloquea la
  -- cuenta con FOR UPDATE antes de abrir la salida; la QA de carrera existente
  -- valida que anular no gane frente a un envío ya iniciado.
  if position('bloquear_cuentas_pedido_impresion' in pg_get_functiondef(
       'public.registrar_impresion_salida_comanda(uuid,uuid,text,uuid,uuid,text)'::regprocedure)) = 0
     or position('bloquear_cuentas_pedido_impresion' in pg_get_functiondef(
       'public.actualizar_estado_salida_comanda(uuid,uuid,uuid,text)'::regprocedure)) = 0
     or position('bloquear_cuentas_pedido_impresion' in pg_get_functiondef(
       'public.agente_impresion_iniciar_envio(text,uuid,uuid)'::regprocedure)) = 0 then
    raise exception 'Una RPC dejó de verificar el estado real de la cuenta';
  end if;
end;
$$;

rollback;
