-- QA transaccional del esquema Operación configurable.
-- En verificar-sql.mjs se inyecta la migración dos veces en el marcador para
-- comprobar instalación sobre datos existentes e idempotencia. Todo se revierte.
begin;

create temp table qa_operacion_ids on commit drop as
select gen_random_uuid() as restaurante_a,
       gen_random_uuid() as restaurante_b,
       gen_random_uuid() as restaurante_nuevo,
       gen_random_uuid() as admin_a,
       gen_random_uuid() as admin_b,
       gen_random_uuid() as mesero_a,
       gen_random_uuid() as mesero_b,
       gen_random_uuid() as cocina_a,
       gen_random_uuid() as cajero_a,
       gen_random_uuid() as zona_a,
       gen_random_uuid() as zona_b,
       gen_random_uuid() as mesa_a,
       gen_random_uuid() as mesa_b,
       gen_random_uuid() as categoria_a,
       gen_random_uuid() as categoria_b,
       gen_random_uuid() as producto_a,
       gen_random_uuid() as producto_b,
       gen_random_uuid() as pedido_a,
       gen_random_uuid() as pedido_b,
       gen_random_uuid() as item_a,
       gen_random_uuid() as item_b,
       gen_random_uuid() as cuenta_a,
       gen_random_uuid() as pago_a,
       gen_random_uuid() as solicitud_a,
       gen_random_uuid() as solicitud_b;

insert into auth.users(id, email)
select admin_a, 'admin-a@operacion.qa' from qa_operacion_ids
union all select admin_b, 'admin-b@operacion.qa' from qa_operacion_ids
union all select mesero_a, 'mesero-a@operacion.qa' from qa_operacion_ids
union all select mesero_b, 'mesero-b@operacion.qa' from qa_operacion_ids
union all select cocina_a, 'cocina-a@operacion.qa' from qa_operacion_ids
union all select cajero_a, 'cajero-a@operacion.qa' from qa_operacion_ids;

insert into public.restaurantes(id, nombre, suscripcion_activa)
select restaurante_a, 'QA Operación A', true from qa_operacion_ids
union all select restaurante_b, 'QA Operación B', true from qa_operacion_ids;

insert into public.usuarios(id, restaurante_id, rol, nombre, activo)
select admin_a, restaurante_a, 'admin_restaurante', 'Admin A', true from qa_operacion_ids
union all select admin_b, restaurante_b, 'admin_restaurante', 'Admin B', true from qa_operacion_ids
union all select mesero_a, restaurante_a, 'mesero', 'Mesero A', true from qa_operacion_ids
union all select mesero_b, restaurante_b, 'mesero', 'Mesero B', true from qa_operacion_ids
union all select cocina_a, restaurante_a, 'cocina', 'Cocina A', true from qa_operacion_ids
union all select cajero_a, restaurante_a, 'cajero', 'Cajero A', true from qa_operacion_ids;

insert into public.zonas(id, restaurante_id, nombre)
select zona_a, restaurante_a, 'QA A' from qa_operacion_ids
union all select zona_b, restaurante_b, 'QA B' from qa_operacion_ids;

insert into public.mesas(id, restaurante_id, zona_id, nombre)
select mesa_a, restaurante_a, zona_a, 'Mesa A' from qa_operacion_ids
union all select mesa_b, restaurante_b, zona_b, 'Mesa B' from qa_operacion_ids;

insert into public.categorias_productos(id, restaurante_id, nombre)
select categoria_a, restaurante_a, 'Categoría A' from qa_operacion_ids
union all select categoria_b, restaurante_b, 'Categoría B' from qa_operacion_ids;

insert into public.productos(id, restaurante_id, categoria_id, nombre, precio, es_bebida, estacion)
select producto_a, restaurante_a, categoria_a, 'Bebida histórica', 7, true, 'bar' from qa_operacion_ids
union all select producto_b, restaurante_b, categoria_b, 'Producto B', 10, false, 'cocina' from qa_operacion_ids;

insert into public.pedidos(id, restaurante_id, mesa_id, mesero_id, estado)
select pedido_a, restaurante_a, mesa_a, mesero_a, 'pendiente' from qa_operacion_ids
union all select pedido_b, restaurante_b, mesa_b, mesero_b, 'pendiente' from qa_operacion_ids;

insert into public.pedido_items(id, pedido_id, producto_id, nombre_producto, cantidad, precio_unitario, es_bebida)
select item_a, pedido_a, producto_a, 'Bebida histórica', 2, 7, true from qa_operacion_ids
union all select item_b, pedido_b, producto_b, 'Producto B', 1, 10, false from qa_operacion_ids;

insert into public.cuentas(id, restaurante_id, mesa_id, total, metodo_pago, estado, pagado_at)
select cuenta_a, restaurante_a, mesa_a, 14, 'efectivo', 'pagada', now() from qa_operacion_ids;

insert into public.cuenta_pedidos(cuenta_id, pedido_id, subtotal)
select cuenta_a, pedido_a, 14 from qa_operacion_ids;

insert into public.cuenta_pagos(id, cuenta_id, restaurante_id, metodo_pago, monto)
select pago_a, cuenta_a, restaurante_a, 'efectivo', 14 from qa_operacion_ids;

/* APLICAR_MIGRACION_OPERACION */

do $$
declare
  v record;
  v_estacion_a uuid;
  v_estacion_b uuid;
  v_destino_a uuid;
  v_destino_b uuid;
  v_version integer;
  v_filas integer;
  v_conteo integer;
  v_inicial text := current_user;
begin
  select * into v from qa_operacion_ids;

  if (select count(*) from public.configuracion_operativa
       where restaurante_id in (v.restaurante_a, v.restaurante_b)) <> 2 then
    raise exception 'No se creó configuración para los restaurantes existentes';
  end if;
  if exists (
    select 1 from public.configuracion_operativa
     where restaurante_id in (v.restaurante_a, v.restaurante_b)
       and (modalidad_cobro <> 'cobro_por_mesero' or version < 1)
  ) then raise exception 'El default de cobro no conserva el flujo actual'; end if;
  if (select count(*) from public.estaciones_restaurante
       where restaurante_id in (v.restaurante_a, v.restaurante_b)) <> 6 then
    raise exception 'No se crearon las tres estaciones por restaurante';
  end if;
  if (select count(*) from public.destinos_estacion
       where restaurante_id in (v.restaurante_a, v.restaurante_b)
         and tipo = 'kds' and grupo = 'principal' and activo) <> 6 then
    raise exception 'El default KDS no conserva las estaciones actuales';
  end if;
  if exists (select 1 from public.destinos_estacion
              where restaurante_id in (v.restaurante_a, v.restaurante_b)
                and tipo = 'impresora' and activo) then
    raise exception 'Se activó una impresora por defecto';
  end if;
  if (select estacion from public.productos where id = v.producto_a) <> 'bar'
     or (select estacion from public.pedido_items where id = v.item_a) <> 'bar' then
    raise exception 'La estación histórica explícita del producto o ítem cambió';
  end if;
  if (select estado from public.pedidos where id = v.pedido_a) <> 'pendiente'
     or (select total from public.cuentas where id = v.cuenta_a) <> 14
     or (select monto from public.cuenta_pagos where id = v.pago_a) <> 14 then
    raise exception 'La migración modificó pedido, cuenta o pago histórico';
  end if;
  if (select estacion_id from public.categorias_productos where id = v.categoria_a) is not null then
    raise exception 'La migración asignó una estación a una categoría histórica sin decisión del admin';
  end if;

  select id into v_estacion_a from public.estaciones_restaurante
   where restaurante_id = v.restaurante_a and codigo = 'cocina';
  select id into v_estacion_b from public.estaciones_restaurante
   where restaurante_id = v.restaurante_b and codigo = 'bar';
  select id into v_destino_a from public.destinos_estacion
   where restaurante_id = v.restaurante_a and estacion_id = v_estacion_a and tipo = 'kds';
  select id into v_destino_b from public.destinos_estacion
   where restaurante_id = v.restaurante_b and estacion_id = v_estacion_b and tipo = 'kds';

  update public.categorias_productos set estacion_id = v_estacion_a where id = v.categoria_a;
  update public.categorias_productos set estacion_id = v_estacion_b where id = v.categoria_b;
  insert into public.estado_comanda_estacion(restaurante_id, pedido_id, estacion_id)
    values (v.restaurante_a, v.pedido_a, v_estacion_a),
           (v.restaurante_b, v.pedido_b, v_estacion_b);
  insert into public.entregas_comanda
    (restaurante_id, pedido_id, estacion_id, destino_estacion_id, grupo, tipo_destino, clave_idempotencia)
    values (v.restaurante_a, v.pedido_a, v_estacion_a, v_destino_a, 'principal', 'kds', v.solicitud_a),
           (v.restaurante_b, v.pedido_b, v_estacion_b, v_destino_b, 'principal', 'kds', v.solicitud_b);
  insert into public.autorizaciones_cobro(restaurante_id, usuario_id)
    values (v.restaurante_a, v.mesero_a), (v.restaurante_b, v.mesero_b);
  if exists (select 1 from public.autorizaciones_cobro where activo) then
    raise exception 'Una autorización de cobro se activó por defecto';
  end if;

  if exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('configuracion_operativa', 'estaciones_restaurante', 'destinos_estacion',
        'entregas_comanda', 'estado_comanda_estacion', 'autorizaciones_cobro')
      and not c.relrowsecurity
  ) then raise exception 'Falta RLS en una tabla operativa'; end if;

  select version into v_version from public.configuracion_operativa where restaurante_id = v.restaurante_a;
  perform set_config('request.jwt.claim.sub', v.admin_a::text, true);
  execute 'set local role authenticated';

  if (select count(*) from public.configuracion_operativa) <> 1
     or (select count(*) from public.estaciones_restaurante) <> 3
     or (select count(*) from public.destinos_estacion) <> 3
     or (select count(*) from public.entregas_comanda) <> 1
     or (select count(*) from public.estado_comanda_estacion) <> 1
     or (select count(*) from public.autorizaciones_cobro) <> 1 then
    raise exception 'RLS no aisló la lectura al restaurante A';
  end if;

  update public.configuracion_operativa
     set modalidad_cobro = 'solo_cajero'
   where restaurante_id = v.restaurante_a;
  get diagnostics v_filas = row_count;
  if v_filas <> 1 then raise exception 'Admin A no pudo editar su configuración'; end if;
  if not exists (select 1 from public.configuracion_operativa
                  where restaurante_id = v.restaurante_a
                    and modalidad_cobro = 'solo_cajero'
                    and version = v_version + 1
                    and actualizado_por = v.admin_a) then
    raise exception 'No se registraron actor, timestamp o versión de la edición';
  end if;

  update public.estaciones_restaurante set nombre = nombre
   where id = v_estacion_b;
  get diagnostics v_filas = row_count;
  if v_filas <> 0 then raise exception 'Admin A pudo modificar estaciones de B'; end if;
  update public.destinos_estacion set activo = activo
   where id = v_destino_b;
  get diagnostics v_filas = row_count;
  if v_filas <> 0 then raise exception 'Admin A pudo modificar destinos de B'; end if;
  update public.autorizaciones_cobro set activo = true
   where restaurante_id = v.restaurante_b and usuario_id = v.mesero_b;
  get diagnostics v_filas = row_count;
  if v_filas <> 0 then raise exception 'Admin A pudo modificar autorizaciones de B'; end if;

  update public.configuracion_operativa
     set modalidad_cobro = 'solo_cajero'
   where restaurante_id = v.restaurante_b;
  get diagnostics v_filas = row_count;
  if v_filas <> 0 then raise exception 'Admin A pudo modificar configuración de B'; end if;

  perform set_config('request.jwt.claim.sub', v.mesero_a::text, true);
  if (select count(*) from public.autorizaciones_cobro) <> 0 then
    raise exception 'Un mesero pudo leer autorizaciones de cobro';
  end if;
  update public.configuracion_operativa
     set modalidad_cobro = 'cobro_por_mesero'
   where restaurante_id = v.restaurante_a;
  get diagnostics v_filas = row_count;
  if v_filas <> 0 then raise exception 'Un mesero pudo editar configuración'; end if;

  perform set_config('request.jwt.claim.sub', v.cajero_a::text, true);
  if (select count(*) from public.autorizaciones_cobro) <> 1 then
    raise exception 'Un cajero del restaurante no pudo leer su autorización';
  end if;
  update public.autorizaciones_cobro set activo = true
   where restaurante_id = v.restaurante_a and usuario_id = v.mesero_a;
  get diagnostics v_filas = row_count;
  if v_filas <> 0 then raise exception 'Un cajero pudo editar autorizaciones'; end if;

  if has_table_privilege('anon', 'public.configuracion_operativa', 'select')
     or has_table_privilege('anon', 'public.estaciones_restaurante', 'select')
     or has_table_privilege('anon', 'public.destinos_estacion', 'select')
     or has_table_privilege('anon', 'public.entregas_comanda', 'select')
     or has_table_privilege('anon', 'public.estado_comanda_estacion', 'select')
     or has_table_privilege('anon', 'public.autorizaciones_cobro', 'select') then
    raise exception 'anon puede leer alguna tabla operativa';
  end if;
  execute format('set local role %I', v_inicial);

  begin
    insert into public.destinos_estacion
      (restaurante_id, estacion_id, tipo, grupo, nombre, papel_mm)
    values (v.restaurante_a, v_estacion_a, 'impresora', 'respaldo', 'QA sin papel', null);
    raise exception 'Se aceptó una impresora sin ancho de papel';
  exception when check_violation then null;
  end;

  -- Una solicitud repetida no puede crear una segunda entrega para la misma clave.
  begin
    insert into public.entregas_comanda
      (restaurante_id, pedido_id, estacion_id, destino_estacion_id, grupo, tipo_destino, clave_idempotencia)
    values (v.restaurante_a, v.pedido_a, v_estacion_a, v_destino_a,
            'principal', 'kds', v.solicitud_a);
    raise exception 'Se aceptó una clave de idempotencia duplicada';
  exception when unique_violation then null;
  end;

  -- Los defaults también se crean para restaurantes nuevos, sin activar impresoras.
  insert into public.restaurantes(id, nombre) values (v.restaurante_nuevo, 'QA nuevo');
  if (select count(*) from public.estaciones_restaurante
       where restaurante_id = v.restaurante_nuevo) <> 3
     or (select count(*) from public.destinos_estacion
          where restaurante_id = v.restaurante_nuevo and tipo = 'kds' and activo) <> 3
     or exists (select 1 from public.destinos_estacion
                 where restaurante_id = v.restaurante_nuevo and tipo = 'impresora' and activo)
     or not exists (select 1 from public.configuracion_operativa
                     where restaurante_id = v.restaurante_nuevo
                       and modalidad_cobro = 'cobro_por_mesero') then
    raise exception 'El trigger no aplicó defaults seguros al restaurante nuevo';
  end if;

  if (select estado from public.pedidos where id = v.pedido_a) <> 'pendiente'
     or (select total from public.cuentas where id = v.cuenta_a) <> 14
     or (select monto from public.cuenta_pagos where id = v.pago_a) <> 14 then
    raise exception 'La prueba modificó el flujo histórico de pedido o cobro';
  end if;
end;
$$;

rollback;
