-- QA transaccional del configurador operativo de Admin. Se revierte completo.
begin;

create temp table qa_config_operativa_admin_ids on commit drop as
select gen_random_uuid() as restaurante_a,
       gen_random_uuid() as restaurante_b,
       gen_random_uuid() as admin_a,
       gen_random_uuid() as admin_b,
       gen_random_uuid() as mesero_a,
       gen_random_uuid() as categoria_a,
       gen_random_uuid() as categoria_b;

insert into auth.users(id, email)
select admin_a, 'config-admin-a@qa.example' from qa_config_operativa_admin_ids
union all select admin_b, 'config-admin-b@qa.example' from qa_config_operativa_admin_ids
union all select mesero_a, 'config-mesero-a@qa.example' from qa_config_operativa_admin_ids;

insert into public.restaurantes(id, nombre, suscripcion_activa)
select restaurante_a, 'QA Config A', true from qa_config_operativa_admin_ids
union all select restaurante_b, 'QA Config B', true from qa_config_operativa_admin_ids;

insert into public.usuarios(id, restaurante_id, rol, nombre, activo)
select admin_a, restaurante_a, 'admin_restaurante', 'Admin Config A', true from qa_config_operativa_admin_ids
union all select admin_b, restaurante_b, 'admin_restaurante', 'Admin Config B', true from qa_config_operativa_admin_ids
union all select mesero_a, restaurante_a, 'mesero', 'Mesero Config A', true from qa_config_operativa_admin_ids;

insert into public.categorias_productos(id, restaurante_id, nombre)
select categoria_a, restaurante_a, 'Platos de QA' from qa_config_operativa_admin_ids
union all select categoria_b, restaurante_b, 'Categoría ajena' from qa_config_operativa_admin_ids;

/* APLICAR_MIGRACION_CONFIG_OPERATIVA_ADMIN */

do $$
declare
  v record;
  v_config jsonb;
  v_resultado jsonb;
  v_auditorias integer;
  v_auditorias_tenant integer;
  v_acciones text;
  v_modalidad_antes text;
  v_filas_modalidad integer;
  v_auditoria_modalidad boolean;
  v_triggers integer;
  v_inicial text := current_user;
begin
  select * into v from qa_config_operativa_admin_ids;
  perform set_config('request.jwt.claim.sub', v.admin_a::text, true);
  execute 'set local role authenticated';

  v_config := public.admin_obtener_configuracion_operativa(v.restaurante_a);
  if v_config->>'modalidad_cobro' <> 'cobro_por_mesero'
     or jsonb_array_length(v_config->'estaciones') <> 3
     or v_config#>>'{estaciones,0,nombre}' <> 'Cocina'
     or v_config#>>'{estaciones,1,nombre}' <> 'Bar' then
    raise exception 'No se leyeron los defaults del restaurante propio';
  end if;
  if exists (
    select 1 from jsonb_array_elements(v_config->'estaciones') s(value),
      jsonb_array_elements(s.value->'destinos') d(value)
     where d.value->>'tipo' = 'kds' and nullif(d.value->>'id', '') is null
  ) then raise exception 'La lectura perdió un id KDS existente: %', v_config->'estaciones'; end if;
  if jsonb_array_length(v_config->'categorias') <> 1
     or v_config#>>'{categorias,0,estacion_codigo}' is not null then
    raise exception 'Las categorías se leyeron fuera del tenant o no conservaron asignación vacía';
  end if;

  v_config := jsonb_set(v_config, '{modalidad_cobro}', '"solo_cajero"'::jsonb);
  v_config := jsonb_set(v_config, '{estaciones,1,activo}', 'false'::jsonb);
  v_config := jsonb_set(v_config, '{categorias,0,estacion_codigo}', '"cocina"'::jsonb);
  v_config := jsonb_set(v_config, '{estaciones,0,destinos}',
    (v_config#>'{estaciones,0,destinos}') || jsonb_build_array(jsonb_build_object(
      'id', null, 'tipo', 'impresora', 'grupo', 'respaldo', 'nombre', 'Impresora Cocina QA',
      'papel_mm', 58, 'configuracion', jsonb_build_object('copias', 2), 'activo', true
    )), true);

  select modalidad_cobro into v_modalidad_antes from public.configuracion_operativa
   where restaurante_id = v.restaurante_a;
  update public.configuracion_operativa
     set modalidad_cobro = 'solo_cajero'
   where restaurante_id = v.restaurante_a;
  get diagnostics v_filas_modalidad = row_count;
  execute format('set local role %I', v_inicial);
  select exists (select 1 from public.audit_logs where restaurante_id = v.restaurante_a
    and actor_id = v.admin_a and accion = 'configuracion_operativa_actualizar') into v_auditoria_modalidad;
  execute 'set local role authenticated';
  if not v_auditoria_modalidad then
    raise exception 'El trigger de auditoría no registró la modalidad: antes %, filas %, después %, usuario %',
      v_modalidad_antes, v_filas_modalidad,
      (select modalidad_cobro from public.configuracion_operativa where restaurante_id = v.restaurante_a), current_user;
  end if;

  v_resultado := public.admin_guardar_configuracion_operativa(v.restaurante_a, v_config);
  if v_resultado->>'modalidad_cobro' <> 'solo_cajero'
     or v_resultado#>>'{estaciones,1,activo}' <> 'false'
     or v_resultado#>>'{categorias,0,estacion_codigo}' <> 'cocina'
     or v_resultado#>>'{estaciones,0,destinos,1,tipo}' <> 'impresora'
     or v_resultado#>>'{estaciones,0,destinos,1,papel_mm}' <> '58'
     or v_resultado#>>'{estaciones,0,destinos,1,configuracion,copias}' <> '2' then
    raise exception 'No se guardaron modalidad, estación, categoría y destino';
  end if;
  execute format('set local role %I', v_inicial);
  select count(*)::integer into v_auditorias
    from public.audit_logs
   where restaurante_id = v.restaurante_a and actor_id = v.admin_a
     and accion = 'configuracion_operativa_actualizar';
  if v_auditorias < 4 then
    select count(*)::integer, string_agg(accion || ':' || coalesce(actor_id::text, 'null'), ', ')
      into v_auditorias_tenant, v_acciones from public.audit_logs
     where restaurante_id = v.restaurante_a;
    select count(*)::integer into v_triggers from pg_trigger t
      where t.tgrelid in ('public.configuracion_operativa'::regclass, 'public.estaciones_restaurante'::regclass,
        'public.destinos_estacion'::regclass, 'public.categorias_productos'::regclass)
        and t.tgname like '%auditoria%';
    raise exception 'Faltan registros de auditoría: actor %, tenant %, acciones %, uid %, claim %, triggers %',
      v_auditorias, v_auditorias_tenant, v_acciones, auth.uid(), current_setting('request.jwt.claim.sub', true), v_triggers;
  end if;
  if has_table_privilege('authenticated', 'public.audit_logs', 'insert') then
    raise exception 'El cliente autenticado recibió acceso directo de escritura a auditoría';
  end if;
  execute 'set local role authenticated';

  begin
    perform public.admin_obtener_configuracion_operativa(v.restaurante_b);
    raise exception 'Admin A leyó configuración de B';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.admin_guardar_configuracion_operativa(v.restaurante_b, v_config);
    raise exception 'Admin A guardó configuración de B';
  exception when insufficient_privilege then null;
  end;
  begin
    v_config := jsonb_set(v_config, '{categorias,0,id}', to_jsonb(v.categoria_b::text));
    perform public.admin_guardar_configuracion_operativa(v.restaurante_a, v_config);
    raise exception 'Admin A pudo asignar una categoría de B';
  exception when insufficient_privilege or foreign_key_violation or check_violation or serialization_failure then null;
  end;

  perform set_config('request.jwt.claim.sub', v.mesero_a::text, true);
  if (public.admin_obtener_configuracion_operativa(v.restaurante_a)->>'restaurante_id')::uuid <> v.restaurante_a then
    raise exception 'El mesero del restaurante no pudo consultar su configuración';
  end if;
  begin
    perform public.admin_guardar_configuracion_operativa(v.restaurante_a, v_config);
    raise exception 'Un mesero pudo editar configuración';
  exception when insufficient_privilege then null;
  end;

  execute 'set local role anon';
  if has_function_privilege('anon', 'public.admin_obtener_configuracion_operativa(uuid)', 'execute')
     or has_function_privilege('anon', 'public.admin_guardar_configuracion_operativa(uuid,jsonb)', 'execute') then
    raise exception 'anon recibió EXECUTE sobre el configurador';
  end if;
  execute format('set local role %I', v_inicial);
end;
$$;

rollback;
