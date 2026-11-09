-- QA transaccional del enrutamiento operativo Fase 4. Toda la información se revierte.
begin;
do $$
declare
  r uuid := gen_random_uuid();
  r_otro uuid := gen_random_uuid();
  admin_id uuid := gen_random_uuid();
  admin_otro_id uuid := gen_random_uuid();
  zona_id uuid := gen_random_uuid();
  zona_otro_id uuid := gen_random_uuid();
  mesa_id uuid := gen_random_uuid();
  mesa_otro_id uuid := gen_random_uuid();
  categoria_id uuid := gen_random_uuid();
  producto_explicito uuid := gen_random_uuid();
  producto_categoria uuid := gen_random_uuid();
  bebida_sin_categoria uuid := gen_random_uuid();
  v_pedido_id uuid;
  v_pedido_cancelacion_id uuid;
  v_cocina_id uuid;
  v_bar_id uuid;
  entrega_record record;
  estado_record record;
  cuenta_inicial integer;
  pagos_inicial integer;
  inicial text := current_user;
begin
  insert into auth.users(id, email) values
    (admin_id, 'qa-enrutamiento@mesora.example'),
    (admin_otro_id, 'qa-enrutamiento-otro@mesora.example');
  insert into public.restaurantes(id, nombre, suscripcion_activa) values
    (r, 'QA Enrutamiento', true),
    (r_otro, 'QA Enrutamiento Aislado', true);
  insert into public.usuarios(id, restaurante_id, rol, nombre, activo) values
    (admin_id, r, 'admin_restaurante', 'Admin QA Enrutamiento', true),
    (admin_otro_id, r_otro, 'admin_restaurante', 'Admin QA Ajeno', true);
  insert into public.zonas(id, restaurante_id, nombre) values
    (zona_id, r, 'QA'),
    (zona_otro_id, r_otro, 'QA');
  insert into public.mesas(id, restaurante_id, zona_id, nombre) values
    (mesa_id, r, zona_id, 'Mesa QA'),
    (mesa_otro_id, r_otro, zona_otro_id, 'Mesa ajena');
  insert into public.categorias_productos(id, restaurante_id, nombre)
  values (categoria_id, r, 'Categoría Cocina QA');
  select id into v_cocina_id from public.estaciones_restaurante where restaurante_id = r and codigo = 'cocina';
  select id into v_bar_id from public.estaciones_restaurante where restaurante_id = r and codigo = 'bar';
  if v_cocina_id is null or v_bar_id is null then raise exception 'No se inicializaron las estaciones por defecto'; end if;

  update public.categorias_productos set estacion_id = v_cocina_id where id = categoria_id;
  insert into public.productos(id, restaurante_id, categoria_id, nombre, precio, disponible, es_bebida, estacion)
  values
    (producto_explicito, r, categoria_id, 'Producto explícito Bar', 11, true, false, 'bar'),
    (producto_categoria, r, categoria_id, 'Producto heredado Cocina', 12, true, false, null),
    (bebida_sin_categoria, r, null, 'Bebida fallback Bar', 4, true, true, null);

  -- Cocina: KDS + impresora principal + respaldo; Barra: impresora principal.
  insert into public.destinos_estacion
    (restaurante_id, estacion_id, tipo, grupo, nombre, papel_mm, configuracion, activo)
  values
    (r, v_cocina_id, 'impresora', 'principal', 'Impresora Cocina QA', 80, '{"copias":1}', true),
    (r, v_cocina_id, 'impresora', 'respaldo', 'Respaldo Cocina QA', 58, '{"copias":2}', true),
    (r, v_bar_id, 'impresora', 'principal', 'Impresora Barra QA', 58, '{"copias":1}', true);
  update public.destinos_estacion set activo = false
   where restaurante_id = r and estacion_id = v_bar_id and tipo = 'kds' and grupo = 'principal';

  select count(*) into cuenta_inicial from public.cuentas where restaurante_id = r;
  select count(*) into pagos_inicial from public.cuenta_pagos where restaurante_id = r;
  perform set_config('request.jwt.claim.sub', admin_id::text, true);
  perform set_config('request.jwt.claims', '{"role":"authenticated"}', true);
  execute 'set local role authenticated';

  v_pedido_id := public.crear_pedido(r, mesa_id, jsonb_build_array(
    jsonb_build_object('producto_id', producto_explicito, 'cantidad', 1),
    jsonb_build_object('producto_id', producto_categoria, 'cantidad', 1),
    jsonb_build_object('producto_id', bebida_sin_categoria, 'cantidad', 1)
  ));

  if (select count(*) from public.pedido_items where pedido_id = v_pedido_id and estacion = 'bar') <> 2
     or (select count(*) from public.pedido_items where pedido_id = v_pedido_id and estacion = 'cocina') <> 1 then
    raise exception 'Prioridad estación explícita/categoría/bebida incorrecta';
  end if;
  if (select count(*) from public.estado_comanda_estacion where restaurante_id = r and pedido_id = v_pedido_id) <> 1
     or not exists (select 1 from public.estado_comanda_estacion where restaurante_id = r and pedido_id = v_pedido_id and estacion_id = v_cocina_id)
     or exists (select 1 from public.estado_comanda_estacion where restaurante_id = r and pedido_id = v_pedido_id and estacion_id = v_bar_id) then
    raise exception 'Solo la estación con destino KDS debe tener estado de tablero';
  end if;
  if (select count(*) from public.entregas_comanda where restaurante_id = r and pedido_id = v_pedido_id and grupo = 'principal') <> 3
     or exists (select 1 from public.entregas_comanda where restaurante_id = r and pedido_id = v_pedido_id and grupo = 'respaldo') then
    raise exception 'Se registraron destinos principales incorrectos o se usó el respaldo automáticamente';
  end if;
  if not exists (
    select 1 from public.entregas_comanda
     where restaurante_id = r and pedido_id = v_pedido_id and estacion_id = v_cocina_id
       and tipo_destino = 'kds' and estado = 'confirmada'
  ) or not exists (
    select 1 from public.entregas_comanda
     where restaurante_id = r and pedido_id = v_pedido_id and estacion_id = v_cocina_id
       and tipo_destino = 'impresora' and destino_nombre = 'Impresora Cocina QA'
       and configuracion_destino = '{"copias":1,"papel_mm":80}'::jsonb and estado = 'pendiente'
  ) or not exists (
    select 1 from public.entregas_comanda
     where restaurante_id = r and pedido_id = v_pedido_id and estacion_id = v_bar_id
       and tipo_destino = 'impresora' and destino_nombre = 'Impresora Barra QA'
       and estado = 'pendiente'
  ) then
    raise exception 'El snapshot de destino, configuración o estado KDS/impresora no coincide';
  end if;

  -- Una estación no cambia la otra; el pedido padre resume el estado más atrasado.
  perform public.avanzar_comanda_estacion(r, v_pedido_id, 'cocina');
  select estado into estado_record from public.estado_comanda_estacion
   where restaurante_id = r and pedido_id = v_pedido_id and estacion_id = v_cocina_id;
  if estado_record.estado <> 'en_preparacion'
     or exists (select 1 from public.estado_comanda_estacion where restaurante_id = r and pedido_id = v_pedido_id and estacion_id = v_bar_id)
     or (select estado from public.pedidos where id = v_pedido_id) <> 'en_preparacion' then
    raise exception 'El avance de Cocina modificó una estación sin KDS o el resumen agregado';
  end if;
  perform public.avanzar_comanda_estacion(r, v_pedido_id, 'cocina');
  if (select estado from public.pedidos where id = v_pedido_id) <> 'listo' then
    raise exception 'El avance independiente no se reflejó en la comanda';
  end if;
  perform public.avanzar_comanda_estacion(r, v_pedido_id, 'cocina');
  if (select estado from public.pedidos where id = v_pedido_id) <> 'entregado' then
    raise exception 'El KDS no marcó entregada la comanda';
  end if;

  -- La impresión/entrega no cambia pagos ni crea cuentas.
  if (select count(*) from public.cuentas where restaurante_id = r) <> cuenta_inicial
     or (select count(*) from public.cuenta_pagos where restaurante_id = r) <> pagos_inicial then
    raise exception 'El enrutamiento modificó cuentas o pagos';
  end if;

  -- Segundo pedido: anular el único ítem de una estación cancela su impresión pendiente.
  v_pedido_cancelacion_id := public.crear_pedido(r, mesa_id, jsonb_build_array(
    jsonb_build_object('producto_id', producto_explicito, 'cantidad', 1),
    jsonb_build_object('producto_id', producto_categoria, 'cantidad', 1)
  ));
  execute format('set local role %I', inicial);
  update public.pedido_items set anulado = true
   where pedido_id = v_pedido_cancelacion_id and producto_id = producto_explicito;
  if exists (select 1 from public.estado_comanda_estacion
       where restaurante_id = r and pedido_id = v_pedido_cancelacion_id and estacion_id = v_bar_id)
     or (select estado from public.entregas_comanda
       where restaurante_id = r and pedido_id = v_pedido_cancelacion_id and estacion_id = v_bar_id and tipo_destino = 'impresora') <> 'cancelada'
     or (select estado from public.estado_comanda_estacion
       where restaurante_id = r and pedido_id = v_pedido_cancelacion_id and estacion_id = v_cocina_id) <> 'pendiente' then
    raise exception 'La anulación no cerró solo la estación afectada ni canceló su entrega pendiente';
  end if;

  -- Las llamadas y las lecturas quedan limitadas al tenant autenticado.
  perform set_config('request.jwt.claim.sub', admin_id::text, true);
  perform set_config('request.jwt.claims', '{"role":"authenticated"}', true);
  execute 'set local role authenticated';
  if (select count(*) from public.estaciones_restaurante where restaurante_id = r_otro) <> 0
     or (select count(*) from public.entregas_comanda where restaurante_id = r_otro) <> 0 then
    raise exception 'RLS permitió leer datos de otro restaurante';
  end if;
  begin
    perform public.avanzar_comanda_estacion(r_otro, v_pedido_id, 'cocina');
    raise exception 'Un admin pudo cambiar comandas de otro restaurante';
  exception when insufficient_privilege then
    null;
  end;
  execute format('set local role %I', inicial);

  if has_function_privilege('anon', 'public.crear_pedido(uuid,uuid,jsonb)', 'execute')
     or has_function_privilege('anon', 'public.avanzar_comanda_estacion(uuid,uuid,text)', 'execute')
     or not has_function_privilege('authenticated', 'public.avanzar_comanda_estacion(uuid,uuid,text)', 'execute') then
    raise exception 'Los permisos anon/authenticated de las RPC no son correctos';
  end if;
  if has_table_privilege('authenticated', 'public.entregas_comanda', 'insert')
     or has_table_privilege('authenticated', 'public.estado_comanda_estacion', 'update')
     or has_table_privilege('anon', 'public.entregas_comanda', 'select') then
    raise exception 'Un cliente puede escribir estados/entregas o anon puede leerlos';
  end if;
end;
$$;
rollback;
