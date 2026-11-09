-- Fase 6: QA transaccional. Ningún dato de prueba persiste.
begin;
do $$
declare
  r uuid := gen_random_uuid(); r2 uuid := gen_random_uuid();
  u uuid := gen_random_uuid(); u2 uuid := gen_random_uuid(); mesero uuid := gen_random_uuid();
  z uuid := gen_random_uuid(); mesa uuid := gen_random_uuid(); producto uuid := gen_random_uuid();
  est uuid; dest uuid; pedido uuid; entrega uuid; trabajo uuid; agente uuid;
  v_solicitud uuid := gen_random_uuid(); v_kds uuid; v_respaldo uuid; v_otro_agente uuid; v_fallido uuid;
  v_codigo text; token text := repeat('a',64); token2 text := repeat('b',64); token3 text := repeat('c',64);
  respuesta jsonb; reclamo uuid; n integer; original text := current_user;
begin
  insert into auth.users(id,email) values (u,'fase6-admin@mesora.example'),(u2,'fase6-otro@mesora.example'),(mesero,'fase6-mesero@mesora.example');
  insert into public.restaurantes(id,nombre,suscripcion_activa) values (r,'Fase 6',true),(r2,'Fase 6 otro',true);
  insert into public.usuarios(id,restaurante_id,rol,nombre,activo) values
    (u,r,'admin_restaurante','Admin F6',true),
    (u2,r2,'admin_restaurante','Otro F6',true),
    (mesero,r,'mesero','Mesero F6',true);
  insert into public.zonas(id,restaurante_id,nombre) values(z,r,'Salón');
  insert into public.mesas(id,restaurante_id,zona_id,nombre) values(mesa,r,z,'Mesa F6');
  insert into public.productos(id,restaurante_id,nombre,precio,disponible,es_bebida,estacion)
    values(producto,r,'Plato F6',10,true,false,'cocina');
  select id into est from public.estaciones_restaurante where restaurante_id=r and codigo='cocina';
  update public.destinos_estacion set activo=false where restaurante_id=r;
  insert into public.destinos_estacion(restaurante_id,estacion_id,tipo,grupo,nombre,papel_mm,configuracion,activo)
    values(r,est,'impresora','principal','Cocina automática',58,'{"copias":2}',true) returning id into dest;

  if has_schema_privilege('anon','private','usage') or has_schema_privilege('authenticated','private','usage')
    or has_table_privilege('anon','private.trabajos_impresion','select')
    or has_table_privilege('authenticated','private.agentes_impresion','select') then
    raise exception 'El esquema de agente quedó expuesto'; end if;
  if has_function_privilege('anon','public.admin_impresion_panel(uuid)','execute')
    or has_function_privilege('authenticated','public.agente_impresion_reclamar(text)','execute') then
    raise exception 'Permisos RPC cruzados'; end if;
  perform set_config('request.jwt.claim.sub',mesero::text,true);
  execute 'set local role authenticated';
  begin
    perform public.admin_impresion_crear_codigo(r);
    raise exception 'Mesero creó código';
  exception when insufficient_privilege then null; end;
  execute format('set local role %I',original);
  perform set_config('request.jwt.claim.sub',u2::text,true);
  execute 'set local role authenticated';
  begin
    perform public.admin_impresion_panel(r);
    raise exception 'Admin ajeno accedió a otro restaurante';
  exception when insufficient_privilege then null; end;
  execute format('set local role %I',original);

  perform set_config('request.jwt.claim.sub',u::text,true);
  execute 'set local role authenticated';
  respuesta := public.admin_impresion_crear_codigo(r);
  v_codigo := respuesta->>'codigo';
  if length(v_codigo)<>32 then raise exception 'Código de vinculación incorrecto'; end if;
  begin
    perform public.admin_impresion_crear_codigo(r);
    raise exception 'Faltó límite de códigos';
  exception when sqlstate '22023' then null; end;
  execute format('set local role %I',original);

  execute 'set local role anon';
  respuesta := public.agente_impresion_vincular(v_codigo,token,'PC Cocina');
  agente := (respuesta->>'agente_id')::uuid;
  begin
    perform public.agente_impresion_vincular(v_codigo,token2,'PC replay');
    raise exception 'Se reutilizó el código';
  exception when insufficient_privilege then null; end;
  execute format('set local role %I',original);
  if (select token_hash from private.agentes_impresion where id=agente)=token
    or (select token_hash from private.agentes_impresion where id=agente) is null then
    raise exception 'Token sin hash'; end if;
  update private.codigos_agente_impresion set creado_at=now()-interval '11 minutes',
    expira_at=now()-interval '1 minute',usado_at=null where restaurante_id=r;
  execute 'set local role anon';
  begin
    perform public.agente_impresion_vincular(v_codigo,token2,'PC vencida');
    raise exception 'Se aceptó código vencido';
  exception when insufficient_privilege then null; end;
  respuesta := public.agente_impresion_heartbeat(token,'["Tiquetera Cocina"]'::jsonb);
  if (respuesta->>'actualizado')::boolean is not true then raise exception 'Heartbeat inicial falló'; end if;
  execute format('set local role %I',original);
  perform set_config('request.jwt.claim.sub',u::text,true);
  execute 'set local role authenticated';
  perform public.admin_impresion_asignar(r,dest,agente,'Tiquetera Cocina',true,2,5);
  respuesta := public.admin_impresion_panel(r);
  if jsonb_array_length(respuesta->'agentes')<>1 or jsonb_array_length(respuesta->'asignaciones')<>1 then
    raise exception 'Panel no muestra agente y asignación'; end if;
  pedido := public.crear_pedido(r,mesa,jsonb_build_array(jsonb_build_object('producto_id',producto)));
  execute format('set local role %I',original);
  select id into entrega from public.entregas_comanda where pedido_id=pedido and tipo_destino='impresora';
  select id into trabajo from private.trabajos_impresion where entrega_id=entrega;
  if trabajo is null or (select papel_mm from private.trabajos_impresion where id=trabajo)<>58
    or (select copias from private.trabajos_impresion where id=trabajo)<>2 then
    raise exception 'No se encoló el snapshot de Cocina'; end if;
  if (select count(*) from private.trabajos_impresion where entrega_id=entrega)<>1 then
    raise exception 'La entrega generó trabajos duplicados'; end if;
  insert into private.agentes_impresion(restaurante_id,nombre,token_hash)
    values(r,'PC Cocina 2',encode(extensions.digest(token3,'sha256'),'hex'));
  execute 'set local role anon';
  if public.agente_impresion_reclamar(token3) is not null then
    raise exception 'Segundo agente reclamó trabajo asignado al primero'; end if;
  respuesta := public.agente_impresion_reclamar(token);
  reclamo := (respuesta->>'reclamo_id')::uuid;
  if (respuesta->>'id')::uuid<>trabajo or respuesta->>'estacion'<>'cocina'
    or respuesta->>'cola_windows'<>'Tiquetera Cocina' or jsonb_array_length(respuesta->'items')<>1 then
    raise exception 'El agente recibió un trabajo incorrecto'; end if;
  if public.agente_impresion_reclamar(token) is not null then raise exception 'Dos reclamos de un trabajo'; end if;
  begin
    perform public.agente_impresion_confirmar(token,trabajo,reclamo);
    raise exception 'Se confirmó antes del spooler';
  exception when sqlstate '22023' then null; end;
  perform public.agente_impresion_iniciar_envio(token,trabajo,reclamo);
  respuesta := public.agente_impresion_confirmar(token,trabajo,reclamo);
  if respuesta->>'estado'<>'enviado' or (respuesta->>'impresion_fisica_confirmada')::boolean is not false then
    raise exception 'Se confirmó papel físico sin prueba'; end if;
  respuesta := public.agente_impresion_confirmar(token,trabajo,reclamo);
  if (respuesta->>'idempotente')::boolean is not true then raise exception 'Confirmación repetida no idempotente'; end if;
  execute format('set local role %I',original);
  if (select count(*) from public.audit_logs where detalle->>'solicitud_id'=trabajo::text)<>1
    or (select estado from public.entregas_comanda where id=entrega)<>'enviada' then
    raise exception 'Falta auditoría única o salida enviada'; end if;
  if (select count(*) from public.pedidos where id=pedido)<>1
    or (select count(*) from public.cuentas where restaurante_id=r)<>0
    or (select count(*) from public.cuenta_pagos where restaurante_id=r)<>0 then
    raise exception 'Imprimir cambió pedidos o pagos'; end if;

  -- La salida manual explícita cancela el trabajo aún pendiente, sin duplicar.
  perform set_config('request.jwt.claim.sub',u::text,true);
  execute 'set local role authenticated';
  pedido := public.crear_pedido(r,mesa,jsonb_build_array(jsonb_build_object('producto_id',producto)));
  execute format('set local role %I',original);
  select id into entrega from public.entregas_comanda where pedido_id=pedido and tipo_destino='impresora';
  select id into trabajo from private.trabajos_impresion where entrega_id=entrega;
  execute 'set local role authenticated';
  respuesta := public.registrar_impresion_salida_comanda(r,pedido,'cocina',entrega,v_solicitud,null);
  execute format('set local role %I',original);
  if respuesta->>'estado'<>'registrada' or (select estado from private.trabajos_impresion where id=trabajo)<>'cancelado' then
    raise exception 'La impresión manual no canceló el envío automático pendiente'; end if;

  -- Un lease vencido antes del spooler deja retomar la salida manual.
  v_solicitud := gen_random_uuid();
  execute 'set local role authenticated';
  pedido := public.crear_pedido(r,mesa,jsonb_build_array(jsonb_build_object('producto_id',producto)));
  execute format('set local role %I',original);
  select id into entrega from public.entregas_comanda where pedido_id=pedido and tipo_destino='impresora';
  select id into trabajo from private.trabajos_impresion where entrega_id=entrega;
  execute 'set local role anon';
  respuesta := public.agente_impresion_reclamar(token);
  if (respuesta->>'id')::uuid<>trabajo then raise exception 'No se reclamó el trabajo de lease'; end if;
  execute format('set local role %I',original);
  execute 'set local role authenticated';
  begin
    perform public.registrar_impresion_salida_comanda(r,pedido,'cocina',entrega,v_solicitud,null);
    raise exception 'La salida manual compitió con el agente activo';
  exception when sqlstate '40001' then null; end;
  execute format('set local role %I',original);
  update private.trabajos_impresion set lease_hasta=now()-interval '1 second' where id=trabajo;
  execute 'set local role authenticated';
  respuesta := public.registrar_impresion_salida_comanda(r,pedido,'cocina',entrega,v_solicitud,null);
  execute format('set local role %I',original);
  if respuesta->>'estado'<>'registrada' or (select estado from private.trabajos_impresion where id=trabajo)<>'cancelado' then
    raise exception 'Lease vencido bloqueó respaldo manual seguro'; end if;

  -- Cocina con KDS e impresora produce una vista KDS y solo un trabajo.
  select id into est from public.estaciones_restaurante where restaurante_id=r and codigo='cocina';
  insert into public.destinos_estacion(restaurante_id,estacion_id,tipo,grupo,nombre,activo)
    values(r,est,'kds','principal','KDS Cocina F6',true) returning id into v_kds;
  execute 'set local role authenticated';
  pedido := public.crear_pedido(r,mesa,jsonb_build_array(jsonb_build_object('producto_id',producto)));
  execute format('set local role %I',original);
  if (select count(*) from public.estado_comanda_estacion where pedido_id=pedido)<>1
    or (select count(*) from private.trabajos_impresion where pedido_id=pedido)<>1 then
    raise exception 'KDS e impresora no conservaron ambos destinos'; end if;
  update public.destinos_estacion set activo=false where id=dest;
  execute 'set local role authenticated';
  pedido := public.crear_pedido(r,mesa,jsonb_build_array(jsonb_build_object('producto_id',producto)));
  execute format('set local role %I',original);
  if (select count(*) from public.estado_comanda_estacion where pedido_id=pedido)<>1
    or (select count(*) from private.trabajos_impresion where pedido_id=pedido)<>0 then
    raise exception 'KDS solo generó impresión'; end if;
  update public.destinos_estacion set activo=false where id=v_kds;
  execute 'set local role authenticated';
  pedido := public.crear_pedido(r,mesa,jsonb_build_array(jsonb_build_object('producto_id',producto)));
  execute format('set local role %I',original);
  if (select count(*) from public.entregas_comanda where pedido_id=pedido)<>0
    or (select count(*) from private.trabajos_impresion where pedido_id=pedido)<>0 then
    raise exception 'Sin salida creó entrega o trabajo'; end if;

  -- No se activa impresora de respaldo sin reconocimiento KDS seguro.
  insert into public.destinos_estacion(restaurante_id,estacion_id,tipo,grupo,nombre,papel_mm,activo)
    values(r,est,'impresora','respaldo','Respaldo F6',80,true) returning id into v_respaldo;
  execute 'set local role authenticated';
  begin
    perform public.admin_impresion_asignar(r,v_respaldo,agente,'Tiquetera Cocina',true,2,5);
    raise exception 'Se activó el respaldo automático sin política segura';
  exception when sqlstate '22023' then null; end;
  execute format('set local role %I',original);

  -- Prueba explícita de Barra, sin alterar pedidos.
  update private.trabajos_impresion set estado='cancelado',error_final='Cierre de escenario QA'
    where restaurante_id=r and estado='pendiente';
  update public.destinos_estacion set activo=false where id=dest;
  select id into est from public.estaciones_restaurante where restaurante_id=r and codigo='bar';
  insert into public.destinos_estacion(restaurante_id,estacion_id,tipo,grupo,nombre,papel_mm,activo)
    values(r,est,'impresora','principal','Barra automática',80,true) returning id into dest;
  perform set_config('request.jwt.claim.sub',u::text,true);
  execute 'set local role authenticated';
  perform public.admin_impresion_asignar(r,dest,agente,'Tiquetera Cocina',true,2,5);
  trabajo := public.admin_impresion_prueba(r,dest);
  execute format('set local role %I',original);
  if (select tipo from private.trabajos_impresion where id=trabajo)<>'prueba'
    or (select estacion_codigo from private.trabajos_impresion where id=trabajo)<>'bar' then
    raise exception 'Prueba de Barra incorrecta'; end if;
  execute 'set local role anon';
  respuesta := public.agente_impresion_reclamar(token);
  reclamo := (respuesta->>'reclamo_id')::uuid;
  respuesta := public.agente_impresion_fallar(token,trabajo,reclamo,'Cola desconectada',true);
  if respuesta->>'estado'<>'fallido' or respuesta->>'reintento_at' is null then
    raise exception 'Faltó reintento seguro'; end if;
  execute format('set local role %I',original);
  update private.trabajos_impresion set proximo_intento_at=now()-interval '1 second' where id=trabajo;
  execute 'set local role anon';
  respuesta := public.agente_impresion_reclamar(token);
  reclamo := (respuesta->>'reclamo_id')::uuid;
  perform public.agente_impresion_iniciar_envio(token,trabajo,reclamo);
  respuesta := public.agente_impresion_fallar(token,trabajo,reclamo,'Resultado incierto',true);
  if (respuesta->>'requiere_revision')::boolean is not true then raise exception 'Reintentó tras iniciar spooler'; end if;
  execute format('set local role %I',original);
  if (select error_final from private.trabajos_impresion where id=trabajo) is null
    or (select proximo_intento_at from private.trabajos_impresion where id=trabajo) is not null then
    raise exception 'No se conservó error final'; end if;
  v_fallido := trabajo;

  -- Un segundo restaurante no ve ni confirma trabajo del primero.
  perform set_config('request.jwt.claim.sub',u2::text,true);
  execute 'set local role authenticated';
  respuesta := public.admin_impresion_crear_codigo(r2);
  execute format('set local role %I',original);
  execute 'set local role anon';
  respuesta := public.agente_impresion_vincular(respuesta->>'codigo',token2,'PC ajena');
  v_otro_agente := (respuesta->>'agente_id')::uuid;
  if public.agente_impresion_reclamar(token2) is not null then raise exception 'Agente ajeno reclamó trabajo'; end if;
  begin
    perform public.agente_impresion_confirmar(token2,trabajo,gen_random_uuid());
    raise exception 'Agente ajeno confirmó trabajo';
  exception when insufficient_privilege then null; end;
  execute format('set local role %I',original);
  if (select restaurante_id from private.agentes_impresion where id=v_otro_agente)<>r2 then
    raise exception 'Vinculación mezcló restaurantes'; end if;

  -- El lease vencido sin spooler se recupera, pero un spooler iniciado no.
  perform set_config('request.jwt.claim.sub',u::text,true);
  execute 'set local role authenticated';
  trabajo := public.admin_impresion_prueba(r,dest);
  execute format('set local role %I',original);
  execute 'set local role anon';
  respuesta := public.agente_impresion_reclamar(token);
  execute format('set local role %I',original);
  update private.trabajos_impresion set lease_hasta=now()-interval '1 second' where id=trabajo;
  execute 'set local role anon';
  respuesta := public.agente_impresion_reclamar(token);
  if (respuesta->>'id')::uuid<>trabajo or (respuesta->>'numero_intento')::integer<>2 then
    raise exception 'Lease vencido no recuperado'; end if;
  execute format('set local role %I',original);

  perform set_config('request.jwt.claim.sub',u::text,true);
  execute 'set local role authenticated';
  perform public.admin_impresion_revocar(r,agente);
  execute format('set local role %I',original);
  execute 'set local role anon';
  begin
    perform public.agente_impresion_reclamar(token);
    raise exception 'Agente revocado reclamó';
  exception when insufficient_privilege then null; end;
  begin
    perform public.agente_impresion_confirmar(token,trabajo,gen_random_uuid());
    raise exception 'Agente revocado confirmó';
  exception when insufficient_privilege then null; end;
  execute format('set local role %I',original);
  if (select estado from private.trabajos_impresion where id=trabajo)<>'cancelado' then
    raise exception 'Revocación no canceló trabajo'; end if;
  if (select estado from private.trabajos_impresion where id=v_fallido)<>'fallido'
    or (select error_final from private.trabajos_impresion where id=v_fallido) is null then
    raise exception 'Revocación borró el fallo terminal'; end if;
end; $$;
rollback;
