begin;

-- Reproduce el estado previo de la base para probar la migración como upgrade,
-- no solo sobre la definición nueva del instalador.
drop policy if exists zonas_select on public.zonas;
drop policy if exists zonas_write_admin on public.zonas;
drop policy if exists zonas_insert_admin on public.zonas;
drop policy if exists zonas_update_admin on public.zonas;
drop policy if exists zonas_delete_admin on public.zonas;
create policy zonas_select on public.zonas
  for select using ((select public.soy_del_restaurante(restaurante_id)));
create policy zonas_write_admin on public.zonas
  for all using ((select public.puedo_escribir_en(restaurante_id, array['admin_restaurante'])))
  with check ((select public.puedo_escribir_en(restaurante_id, array['admin_restaurante'])));

drop policy if exists mesas_select on public.mesas;
drop policy if exists mesas_write_admin on public.mesas;
drop policy if exists mesas_insert_admin on public.mesas;
drop policy if exists mesas_update_operacion on public.mesas;
drop policy if exists mesas_delete_admin on public.mesas;
drop policy if exists mesas_update_estado on public.mesas;
create policy mesas_select on public.mesas
  for select using ((select public.soy_del_restaurante(restaurante_id)));
create policy mesas_write_admin on public.mesas
  for all using ((select public.puedo_escribir_en(restaurante_id, array['admin_restaurante'])))
  with check ((select public.puedo_escribir_en(restaurante_id, array['admin_restaurante'])));
create policy mesas_update_estado on public.mesas
  for update using ((select public.puedo_escribir_en(restaurante_id, array['mesero', 'cajero'])))
  with check ((select public.puedo_escribir_en(restaurante_id, array['mesero', 'cajero'])));

drop policy if exists categorias_productos_select on public.categorias_productos;
drop policy if exists categorias_productos_write_admin on public.categorias_productos;
drop policy if exists categorias_productos_insert_admin on public.categorias_productos;
drop policy if exists categorias_productos_update_admin on public.categorias_productos;
drop policy if exists categorias_productos_delete_admin on public.categorias_productos;
create policy categorias_productos_select on public.categorias_productos
  for select using ((select public.soy_del_restaurante(restaurante_id)));
create policy categorias_productos_write_admin on public.categorias_productos
  for all using ((select public.puedo_escribir_en(restaurante_id, array['admin_restaurante'])))
  with check ((select public.puedo_escribir_en(restaurante_id, array['admin_restaurante'])));

drop policy if exists productos_select on public.productos;
drop policy if exists productos_write_admin on public.productos;
drop policy if exists productos_insert_admin on public.productos;
drop policy if exists productos_update_admin on public.productos;
drop policy if exists productos_delete_admin on public.productos;
create policy productos_select on public.productos
  for select using ((select public.soy_del_restaurante(restaurante_id)));
create policy productos_write_admin on public.productos
  for all using ((select public.puedo_escribir_en(restaurante_id, array['admin_restaurante'])))
  with check ((select public.puedo_escribir_en(restaurante_id, array['admin_restaurante'])));

drop policy if exists configuracion_global_select_public on public.configuracion_global;
create policy configuracion_global_select_public on public.configuracion_global
  for select using (true);
-- También reproduce el grant amplio que se encontró en el proyecto real.
revoke select (precio_plan_mensual, correo_soporte, telefono_soporte)
  on public.configuracion_global from anon;
grant select on public.configuracion_global to anon;

-- La condición previa debe reproducir el hallazgo: una cuenta autenticada de
-- restaurante heredaba la policy pública y leía la fila global completa.
insert into auth.users(id) values ('00000000-0000-0000-0000-000000000101');
insert into public.restaurantes(id, nombre)
  values ('00000000-0000-0000-0000-000000000102', 'QA legacy');
insert into public.usuarios(id, restaurante_id, rol, nombre)
  values ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000102', 'admin_restaurante', 'QA legacy');
do $$
declare v_owner text := current_user; v_config integer;
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true);
  execute 'set local role authenticated';
  select count(*) into v_config from public.configuracion_global;
  if v_config <> 1 then raise exception 'El fixture legacy no reproduce la exposición conocida'; end if;
  execute format('set local role %I', v_owner);
end;
$$;

-- El generador de QA inserta aquí el SQL real de la migración, sin sus BEGIN/COMMIT,
-- para validar que transforma el estado anterior dentro de este mismo rollback.
/* APLICAR_MIGRACION_RLS */

do $$
declare
  v_owner text := current_user;
  v_restaurante_a uuid := gen_random_uuid();
  v_restaurante_b uuid := gen_random_uuid();
  v_admin uuid := gen_random_uuid();
  v_mesero uuid := gen_random_uuid();
  v_cajero uuid := gen_random_uuid();
  v_super uuid := gen_random_uuid();
  v_otro uuid := gen_random_uuid();
  v_zona uuid := gen_random_uuid();
  v_mesa uuid := gen_random_uuid();
  v_categoria uuid := gen_random_uuid();
  v_producto uuid := gen_random_uuid();
  v_filas integer;
  v_config integer;
  v_publico integer;
  v_llamada text;
  v_denegado boolean;
begin
  insert into auth.users(id) values (v_admin), (v_mesero), (v_cajero), (v_super), (v_otro);
  insert into public.restaurantes(id, nombre) values
    (v_restaurante_a, 'QA RLS A'), (v_restaurante_b, 'QA RLS B');
  insert into public.usuarios(id, restaurante_id, rol, nombre) values
    (v_admin, v_restaurante_a, 'admin_restaurante', 'Admin QA'),
    (v_mesero, v_restaurante_a, 'mesero', 'Mesero QA'),
    (v_cajero, v_restaurante_a, 'cajero', 'Cajero QA'),
    (v_super, null, 'super_admin', 'Super QA'),
    (v_otro, v_restaurante_b, 'admin_restaurante', 'Admin otro QA');
  insert into public.zonas(id, restaurante_id, nombre)
    values (v_zona, v_restaurante_a, 'Zona QA');
  insert into public.mesas(id, restaurante_id, zona_id, nombre)
    values (v_mesa, v_restaurante_a, v_zona, 'Mesa QA');
  insert into public.categorias_productos(id, restaurante_id, nombre)
    values (v_categoria, v_restaurante_a, 'Categoría QA');
  insert into public.productos(id, restaurante_id, categoria_id, nombre, precio)
    values (v_producto, v_restaurante_a, v_categoria, 'Producto QA', 1);

  -- La landing anónima puede leer precio y contacto, pero no datos internos.
  execute 'set local role anon';
  execute 'select count(*) from (select precio_plan_mensual, correo_soporte, telefono_soporte from public.configuracion_global) as landing'
    into v_publico;
  if v_publico <> 1 then raise exception 'anon dejó de leer la fila pública de configuración'; end if;
  if has_table_privilege('anon', 'public.configuracion_global', 'select')
     or not has_column_privilege('anon', 'public.configuracion_global', 'precio_plan_mensual', 'select')
     or not has_column_privilege('anon', 'public.configuracion_global', 'correo_soporte', 'select')
     or not has_column_privilege('anon', 'public.configuracion_global', 'telefono_soporte', 'select')
     or has_column_privilege('anon', 'public.configuracion_global', 'nombre_app', 'select')
     or has_column_privilege('anon', 'public.configuracion_global', 'logo_url', 'select')
     or has_column_privilege('anon', 'public.configuracion_global', 'informacion', 'select')
     or has_column_privilege('anon', 'public.configuracion_global', 'updated_by', 'select') then
    raise exception 'Los permisos por columna de anon no son los esperados';
  end if;
  execute format('set local role %I', v_owner);

  -- Un administrador de restaurante ya no hereda la política pública de config.
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  execute 'set local role authenticated';
  select count(*) into v_config from public.configuracion_global;
  if v_config <> 0 then raise exception 'Un usuario de restaurante ve la configuración global completa'; end if;
  if (select count(*) from public.zonas where restaurante_id = v_restaurante_a) <> 1
     or (select count(*) from public.mesas where restaurante_id = v_restaurante_a) <> 1
     or (select count(*) from public.categorias_productos where restaurante_id = v_restaurante_a) <> 1
     or (select count(*) from public.productos where restaurante_id = v_restaurante_a) <> 1 then
    raise exception 'El administrador perdió lectura del catálogo o las mesas propias';
  end if;
  if (select count(*) from public.zonas where restaurante_id = v_restaurante_b) <> 0 then
    raise exception 'La lectura de zonas cruzó a otro restaurante';
  end if;
  update public.zonas set nombre = 'Zona QA editada' where id = v_zona;
  update public.categorias_productos set nombre = 'Categoría QA editada' where id = v_categoria;
  update public.productos set nombre = 'Producto QA editado' where id = v_producto;
  get diagnostics v_filas = row_count;
  if v_filas <> 1 then raise exception 'El admin perdió escritura en productos'; end if;
  execute format('set local role %I', v_owner);

  -- Mesero conserva lectura y el cambio operativo de estado de mesa, pero no administra catálogo.
  perform set_config('request.jwt.claim.sub', v_mesero::text, true);
  execute 'set local role authenticated';
  if (select count(*) from public.productos where id = v_producto) <> 1 then
    raise exception 'El mesero perdió lectura del menú';
  end if;
  update public.mesas set estado = 'ocupada' where id = v_mesa;
  get diagnostics v_filas = row_count;
  if v_filas <> 1 then raise exception 'El mesero perdió el cambio de estado de mesa'; end if;
  begin
    insert into public.productos(restaurante_id, nombre, precio)
      values (v_restaurante_a, 'No permitido', 1);
    raise exception 'El mesero pudo insertar un producto';
  exception when insufficient_privilege then null;
  end;
  execute format('set local role %I', v_owner);

  -- Cajero también conserva UPDATE de mesa, que la aplicación usa al liberar una mesa.
  perform set_config('request.jwt.claim.sub', v_cajero::text, true);
  execute 'set local role authenticated';
  update public.mesas set estado = 'libre' where id = v_mesa;
  get diagnostics v_filas = row_count;
  if v_filas <> 1 then raise exception 'El cajero perdió el cambio de estado de mesa'; end if;
  execute format('set local role %I', v_owner);

  -- La política de super_admin mantiene su lectura global.
  perform set_config('request.jwt.claim.sub', v_super::text, true);
  execute 'set local role authenticated';
  select count(*) into v_config from public.configuracion_global;
  if v_config <> 1 then raise exception 'El super_admin perdió lectura de configuración global'; end if;
  execute format('set local role %I', v_owner);

  -- Las RPC administrativas deben rechazar a cualquier rol del restaurante,
  -- incluso cuando la llamada se hace directamente por PostgREST.
  perform set_config('request.jwt.claim.sub', v_mesero::text, true);
  execute 'set local role authenticated';
  foreach v_llamada in array array[
    format('select public.admin_actualizar_restaurante(%L::uuid,%L::text,%L::text,%L::text,%L::text,%L::text)', v_restaurante_a, 'No autorizado', '', '', '', ''),
    'select public.admin_alertas()',
    format('select public.admin_cambiar_estado_usuario(%L::uuid,false)', v_admin),
    format('select public.admin_cambiar_suscripcion(%L::uuid,true,now()+interval ''1 day'')', v_restaurante_a),
    format('select public.admin_designar_administrador(%L::uuid,%L::uuid)', v_restaurante_a, v_admin),
    'select public.admin_estadisticas_globales(now()-interval ''1 day'',now())',
    'select public.admin_ultimos_accesos()',
    format('select public.suscripciones_cambiar_plan(%L::uuid,null::uuid,%L::uuid)', v_restaurante_a, v_mesero),
    format('select public.suscripciones_reactivar(%L::uuid,now()+interval ''1 day'',%L::uuid)', v_restaurante_a, v_mesero),
    format('select public.suscripciones_renovar(%L::uuid,now()+interval ''1 day'',%L::uuid)', v_restaurante_a, v_mesero),
    format('select public.suscripciones_suspender(%L::uuid,%L::text,%L::uuid)', v_restaurante_a, 'QA', v_mesero)
  ] loop
    v_denegado := false;
    begin
      execute v_llamada;
    exception when others then
      if position('super administrador' in lower(sqlerrm)) > 0 then
        v_denegado := true;
      else
        raise;
      end if;
    end;
    if not v_denegado then raise exception 'Un mesero pudo invocar RPC superadmin: %', v_llamada; end if;
  end loop;
  execute format('set local role %I', v_owner);

  -- Comprueba que estas tablas ya no tengan FOR ALL ni SELECT/UPDATE solapados.
  if exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename in ('zonas','mesas','categorias_productos','productos')
       and cmd = 'ALL'
  ) then raise exception 'Quedó una política FOR ALL en el catálogo o mesas'; end if;
  if exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename in ('zonas','mesas','categorias_productos','productos')
       and cmd = 'SELECT'
     group by tablename having count(*) <> 1
  ) then raise exception 'Quedaron políticas SELECT superpuestas en catálogo o mesas'; end if;
  if (select count(*) from pg_policies where schemaname='public' and tablename='mesas' and cmd='UPDATE') <> 1 then
    raise exception 'Se esperaba una única política UPDATE para mesas';
  end if;
  if not exists (
    select 1 from pg_policies
     where schemaname='public' and tablename='configuracion_global'
       and policyname='configuracion_global_select_public' and roles=array['anon']::name[]
  ) then raise exception 'La lectura pública de configuración no está limitada a anon'; end if;
end;
$$;

rollback;
select 'RLS de catálogo, mesas y configuración global: OK' as resultado;
