-- Mesora · Fase 3: lectura y guardado del configurador operativo.
-- No conecta la configuración con pedidos, pagos, caja, KDS ni impresión.

create or replace function public.admin_obtener_configuracion_operativa(
  p_restaurante_id uuid
) returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_resultado jsonb;
begin
  if auth.uid() is null or not public.soy_del_restaurante(p_restaurante_id) then
    raise exception 'No tienes acceso a la configuración de este restaurante.' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'restaurante_id', p_restaurante_id,
    'modalidad_cobro', coalesce((
      select c.modalidad_cobro
        from public.configuracion_operativa c
       where c.restaurante_id = p_restaurante_id
    ), 'cobro_por_mesero'),
    'version', coalesce((
      select c.version
        from public.configuracion_operativa c
       where c.restaurante_id = p_restaurante_id
    ), 1),
    'estaciones', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', e.id,
          'codigo', e.codigo,
          'nombre', e.nombre,
          'activo', e.activo,
          'orden', e.orden,
          'destinos', coalesce((
            select jsonb_agg(jsonb_build_object(
              'id', d.id,
              'tipo', d.tipo,
              'grupo', d.grupo,
              'nombre', d.nombre,
              'papel_mm', d.papel_mm,
              'configuracion', d.configuracion,
              'activo', d.activo
            ) order by d.grupo, d.tipo, d.nombre)
            from public.destinos_estacion d
           where d.restaurante_id = p_restaurante_id
             and d.estacion_id = e.id
          ), '[]'::jsonb)
        ) order by e.orden, e.codigo
      )
        from public.estaciones_restaurante e
       where e.restaurante_id = p_restaurante_id
    ), jsonb_build_array(
      jsonb_build_object('id', null, 'codigo', 'cocina', 'nombre', 'Cocina', 'activo', true, 'orden', 10,
        'destinos', jsonb_build_array(jsonb_build_object('id', null, 'tipo', 'kds', 'grupo', 'principal', 'nombre', 'KDS Cocina', 'papel_mm', null, 'configuracion', '{}'::jsonb, 'activo', true))),
      jsonb_build_object('id', null, 'codigo', 'bar', 'nombre', 'Barra', 'activo', true, 'orden', 20,
        'destinos', jsonb_build_array(jsonb_build_object('id', null, 'tipo', 'kds', 'grupo', 'principal', 'nombre', 'KDS Barra', 'papel_mm', null, 'configuracion', '{}'::jsonb, 'activo', true))),
      jsonb_build_object('id', null, 'codigo', 'otros', 'nombre', 'Otros', 'activo', true, 'orden', 30,
        'destinos', jsonb_build_array(jsonb_build_object('id', null, 'tipo', 'kds', 'grupo', 'principal', 'nombre', 'KDS Otros', 'papel_mm', null, 'configuracion', '{}'::jsonb, 'activo', true)))
    )),
    'categorias', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id,
        'nombre', c.nombre,
        'estacion_codigo', e.codigo
      ) order by c.nombre, c.id)
        from public.categorias_productos c
        left join public.estaciones_restaurante e
          on e.id = c.estacion_id and e.restaurante_id = p_restaurante_id
       where c.restaurante_id = p_restaurante_id
    ), '[]'::jsonb),
    'productos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id,
        'nombre', p.nombre,
        'categoria_id', p.categoria_id,
        'estacion', p.estacion,
        'es_bebida', coalesce(p.es_bebida, false)
      ) order by p.nombre, p.id)
        from public.productos p
       where p.restaurante_id = p_restaurante_id
    ), '[]'::jsonb)
  ) into v_resultado;

  return v_resultado;
end;
$$;

comment on function public.admin_obtener_configuracion_operativa(uuid) is
  'Lee la configuración operativa de un restaurante miembro con RLS y filtros de tenant; no expone datos de otros locales.';

create or replace function public.admin_guardar_configuracion_operativa(
  p_restaurante_id uuid,
  p_configuracion jsonb
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_estacion jsonb;
  v_destino jsonb;
  v_categoria jsonb;
  v_estacion_id uuid;
  v_destino_id uuid;
  v_categoria_id uuid;
  v_codigo text;
  v_tipo text;
  v_grupo text;
  v_papel smallint;
  v_nombre text;
  v_copias integer;
  v_activo boolean;
  v_orden integer;
  v_anterior_estacion uuid;
  v_actualizados integer;
begin
  if auth.uid() is null or not public.puedo_escribir_en(p_restaurante_id, array['admin_restaurante']) then
    raise exception 'Solo el administrador activo de este restaurante puede guardar esta configuración.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_configuracion) <> 'object'
     or jsonb_typeof(p_configuracion->'estaciones') <> 'array'
     or jsonb_typeof(p_configuracion->'categorias') <> 'array' then
    raise exception 'La configuración recibida no tiene el formato esperado.' using errcode = '22023';
  end if;
  if coalesce(p_configuracion->>'modalidad_cobro', '') not in (
    'solo_cajero', 'cobro_por_mesero', 'caja_central_meseros_autorizados'
  ) then
    raise exception 'La modalidad de cobro no es válida.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_configuracion->'estaciones') <> 3
     or (select count(distinct x.value->>'codigo')
           from jsonb_array_elements(p_configuracion->'estaciones') x(value)) <> 3
     or exists (
       select 1 from jsonb_array_elements(p_configuracion->'estaciones') x(value)
        where coalesce(x.value->>'codigo', '') not in ('cocina', 'bar', 'otros')
     ) then
    raise exception 'La configuración debe conservar Cocina, Barra y Otros.' using errcode = '22023';
  end if;

  insert into public.configuracion_operativa (restaurante_id, modalidad_cobro)
  values (p_restaurante_id, p_configuracion->>'modalidad_cobro')
  on conflict (restaurante_id) do update
     set modalidad_cobro = excluded.modalidad_cobro
   where public.configuracion_operativa.modalidad_cobro is distinct from excluded.modalidad_cobro;

  for v_estacion in
    select x.value from jsonb_array_elements(p_configuracion->'estaciones') x(value)
  loop
    v_codigo := v_estacion->>'codigo';
    v_nombre := btrim(coalesce(v_estacion->>'nombre', ''));
    if v_nombre = '' or length(v_nombre) > 60
       or coalesce(v_estacion->>'activo', '') not in ('true', 'false')
       or coalesce(v_estacion->>'orden', '') !~ '^\d{1,5}$' then
      raise exception 'Revisa el nombre, estado y orden de las estaciones.' using errcode = '22023';
    end if;
    v_activo := (v_estacion->>'activo')::boolean;
    v_orden := (v_estacion->>'orden')::integer;
    if jsonb_typeof(v_estacion->'destinos') <> 'array' then
      raise exception 'Revisa los destinos configurados para cada estación.' using errcode = '22023';
    end if;

    insert into public.estaciones_restaurante (restaurante_id, codigo, nombre, activo, orden)
    values (p_restaurante_id, v_codigo, v_nombre, v_activo, v_orden)
    on conflict (restaurante_id, codigo) do update
       set nombre = excluded.nombre,
           activo = excluded.activo,
           orden = excluded.orden,
           updated_at = now()
     where public.estaciones_restaurante.nombre is distinct from excluded.nombre
        or public.estaciones_restaurante.activo is distinct from excluded.activo
        or public.estaciones_restaurante.orden is distinct from excluded.orden;

    select e.id into v_estacion_id
      from public.estaciones_restaurante e
     where e.restaurante_id = p_restaurante_id and e.codigo = v_codigo;
    if v_estacion_id is null then
      raise exception 'No se pudo guardar la estación solicitada.' using errcode = '23503';
    end if;

    for v_destino in
      select x.value from jsonb_array_elements(v_estacion->'destinos') x(value)
    loop
      v_tipo := v_destino->>'tipo';
      v_grupo := v_destino->>'grupo';
      v_nombre := btrim(coalesce(v_destino->>'nombre', ''));
      if v_tipo not in ('kds', 'impresora') or v_grupo not in ('principal', 'respaldo')
         or v_nombre = '' or length(v_nombre) > 80
         or coalesce(v_destino->>'activo', '') not in ('true', 'false') then
        raise exception 'Revisa el tipo, grupo, nombre y estado de los destinos.' using errcode = '22023';
      end if;
      v_activo := (v_destino->>'activo')::boolean;
      if jsonb_typeof(coalesce(v_destino->'configuracion', '{}'::jsonb)) <> 'object' then
        raise exception 'La configuración del destino no es válida.' using errcode = '22023';
      end if;
      if v_tipo = 'impresora' then
        if coalesce(v_destino->>'papel_mm', '') not in ('58', '80')
           or coalesce(v_destino->'configuracion'->>'copias', '') !~ '^[1-5]$' then
          raise exception 'Configura papel de 58 u 80 mm y entre 1 y 5 copias para la impresora.' using errcode = '22023';
        end if;
        v_papel := (v_destino->>'papel_mm')::smallint;
        v_copias := (v_destino->'configuracion'->>'copias')::integer;
      else
        if v_destino->'papel_mm' is not null and v_destino->'papel_mm' <> 'null'::jsonb then
          raise exception 'Los destinos KDS no llevan tamaño de papel.' using errcode = '22023';
        end if;
        v_papel := null;
        v_copias := 1;
      end if;
      v_destino_id := nullif(v_destino->>'id', '')::uuid;
      if v_destino_id is not null then
        select d.estacion_id into v_anterior_estacion
          from public.destinos_estacion d
         where d.id = v_destino_id and d.restaurante_id = p_restaurante_id;
        if not found then
          if exists (select 1 from public.destinos_estacion d where d.id = v_destino_id) then
            raise exception 'El destino indicado no pertenece a este restaurante.' using errcode = '42501';
          end if;
          insert into public.destinos_estacion
            (id, restaurante_id, estacion_id, tipo, grupo, nombre, papel_mm, configuracion, activo)
          values (v_destino_id, p_restaurante_id, v_estacion_id, v_tipo, v_grupo, v_nombre, v_papel,
                  case when v_tipo = 'impresora' then jsonb_build_object('copias', v_copias) else '{}'::jsonb end,
                  v_activo);
        else
          if v_anterior_estacion <> v_estacion_id then
            raise exception 'El destino no corresponde a la estación seleccionada.' using errcode = '42501';
          end if;
          update public.destinos_estacion d
             set tipo = v_tipo,
                 grupo = v_grupo,
                 nombre = v_nombre,
                 papel_mm = v_papel,
                 configuracion = case when v_tipo = 'impresora' then jsonb_build_object('copias', v_copias) else '{}'::jsonb end,
                 activo = v_activo,
                 updated_at = now()
           where d.id = v_destino_id and d.restaurante_id = p_restaurante_id
             and d.estacion_id = v_estacion_id
             and (d.tipo, d.grupo, d.nombre, d.papel_mm, d.configuracion, d.activo)
                 is distinct from (v_tipo, v_grupo, v_nombre, v_papel,
                   case when v_tipo = 'impresora' then jsonb_build_object('copias', v_copias) else '{}'::jsonb end,
                   v_activo);
        end if;
      else
        insert into public.destinos_estacion
          (restaurante_id, estacion_id, tipo, grupo, nombre, papel_mm, configuracion, activo)
        values (p_restaurante_id, v_estacion_id, v_tipo, v_grupo, v_nombre, v_papel,
                case when v_tipo = 'impresora' then jsonb_build_object('copias', v_copias) else '{}'::jsonb end,
                v_activo)
        on conflict (estacion_id, tipo, grupo, nombre) do update
           set papel_mm = excluded.papel_mm,
               configuracion = excluded.configuracion,
               activo = excluded.activo,
               updated_at = now()
         where public.destinos_estacion.restaurante_id = excluded.restaurante_id
           and (public.destinos_estacion.papel_mm, public.destinos_estacion.configuracion, public.destinos_estacion.activo)
               is distinct from (excluded.papel_mm, excluded.configuracion, excluded.activo);
      end if;
    end loop;
  end loop;

  if (select count(*) from public.categorias_productos c where c.restaurante_id = p_restaurante_id)
     <> jsonb_array_length(p_configuracion->'categorias')
     or (select count(distinct x.value->>'id')
           from jsonb_array_elements(p_configuracion->'categorias') x(value))
        <> jsonb_array_length(p_configuracion->'categorias') then
    raise exception 'Actualiza las categorías antes de guardar esta configuración.' using errcode = '40001';
  end if;

  for v_categoria in
    select x.value from jsonb_array_elements(p_configuracion->'categorias') x(value)
  loop
    v_categoria_id := (v_categoria->>'id')::uuid;
    v_codigo := nullif(v_categoria->>'estacion_codigo', '');
    if v_codigo is not null and v_codigo not in ('cocina', 'bar', 'otros') then
      raise exception 'Una categoría tiene una estación predeterminada inválida.' using errcode = '22023';
    end if;
    v_estacion_id := null;
    if v_codigo is not null then
      select e.id into v_estacion_id
        from public.estaciones_restaurante e
       where e.restaurante_id = p_restaurante_id and e.codigo = v_codigo;
      if v_estacion_id is null then
        raise exception 'No se encontró la estación elegida para la categoría.' using errcode = '23503';
      end if;
    end if;
    update public.categorias_productos c
       set estacion_id = v_estacion_id
     where c.id = v_categoria_id and c.restaurante_id = p_restaurante_id;
    get diagnostics v_actualizados = row_count;
    if v_actualizados <> 1 then
      raise exception 'Una categoría ya no pertenece a este restaurante. Actualiza la pantalla e inténtalo de nuevo.' using errcode = '40001';
    end if;
  end loop;

  return public.admin_obtener_configuracion_operativa(p_restaurante_id);
end;
$$;

comment on function public.admin_guardar_configuracion_operativa(uuid, jsonb) is
  'Guarda configuración operativa de forma atómica usando RLS, rol admin_restaurante y validación del tenant. No cambia operaciones actuales.';

-- Las escrituras de configuración se registran desde triggers internos. El
-- cliente autenticado nunca recibe permiso de INSERT sobre audit_logs.
create or replace function public.mesora_auditar_configuracion_operativa()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_restaurante_id uuid;
  v_entidad_id uuid;
  v_actor_id uuid := auth.uid();
  v_actor_rol text;
  v_actor_nombre text;
  v_restaurante_nombre text;
  v_accion text := 'configuracion_operativa_actualizar';
  v_descripcion text;
  v_detalle jsonb;
  v_estacion text;
begin
  if tg_table_name = 'configuracion_operativa' then
    if tg_op = 'UPDATE' and old.modalidad_cobro is not distinct from new.modalidad_cobro then
      return new;
    end if;
    v_restaurante_id := new.restaurante_id;
    v_entidad_id := new.restaurante_id;
    v_descripcion := 'Actualizó la modalidad de cobro guardada para el restaurante';
    v_detalle := jsonb_build_object(
      'modalidad_anterior', case when tg_op = 'INSERT' then null else old.modalidad_cobro end,
      'modalidad_nueva', new.modalidad_cobro
    );
  elsif tg_table_name = 'estaciones_restaurante' then
    if tg_op = 'UPDATE' and (old.nombre, old.activo, old.orden) is not distinct from (new.nombre, new.activo, new.orden) then
      return new;
    end if;
    v_restaurante_id := new.restaurante_id;
    v_entidad_id := new.id;
    v_descripcion := format('Actualizó la estación «%s»', new.nombre);
    v_detalle := jsonb_build_object('codigo', new.codigo, 'nombre', new.nombre, 'activo', new.activo, 'orden', new.orden);
  elsif tg_table_name = 'destinos_estacion' then
    if tg_op = 'UPDATE' and (old.tipo, old.grupo, old.nombre, old.papel_mm, old.configuracion, old.activo)
       is not distinct from (new.tipo, new.grupo, new.nombre, new.papel_mm, new.configuracion, new.activo) then
      return new;
    end if;
    v_restaurante_id := new.restaurante_id;
    v_entidad_id := new.id;
    select e.nombre into v_estacion from public.estaciones_restaurante e
     where e.id = new.estacion_id and e.restaurante_id = new.restaurante_id;
    v_descripcion := format('Actualizó el destino «%s» de %s', new.nombre, coalesce(v_estacion, 'la estación'));
    v_detalle := jsonb_build_object('estacion_id', new.estacion_id, 'tipo', new.tipo, 'grupo', new.grupo,
      'nombre', new.nombre, 'papel_mm', new.papel_mm, 'configuracion', new.configuracion, 'activo', new.activo);
  elsif tg_table_name = 'categorias_productos' then
    if tg_op <> 'UPDATE' or old.estacion_id is not distinct from new.estacion_id then
      return new;
    end if;
    v_restaurante_id := new.restaurante_id;
    v_entidad_id := new.id;
    v_descripcion := format('Actualizó la estación predeterminada de la categoría «%s»', new.nombre);
    v_detalle := jsonb_build_object('categoria_id', new.id, 'estacion_anterior_id', old.estacion_id,
      'estacion_nueva_id', new.estacion_id);
  else
    return new;
  end if;

  select u.rol::text, u.nombre into v_actor_rol, v_actor_nombre
    from public.usuarios u where u.id = v_actor_id;
  select r.nombre into v_restaurante_nombre
    from public.restaurantes r where r.id = v_restaurante_id;

  insert into public.audit_logs (
    actor_id, actor_rol, actor_nombre, restaurante_id, restaurante_nombre,
    entidad, entidad_id, accion, descripcion, detalle
  ) values (
    v_actor_id, v_actor_rol, v_actor_nombre, v_restaurante_id, v_restaurante_nombre,
    case when tg_table_name = 'categorias_productos' then 'categoria' else 'configuracion' end,
    v_entidad_id, v_accion, v_descripcion, v_detalle
  );
  return new;
end;
$$;

revoke all on function public.admin_obtener_configuracion_operativa(uuid) from public, anon;
revoke all on function public.admin_guardar_configuracion_operativa(uuid, jsonb) from public, anon;
grant execute on function public.admin_obtener_configuracion_operativa(uuid) to authenticated;
grant execute on function public.admin_guardar_configuracion_operativa(uuid, jsonb) to authenticated;
revoke all on function public.mesora_auditar_configuracion_operativa() from public, anon, authenticated;

drop trigger if exists configuracion_operativa_auditoria on public.configuracion_operativa;
create trigger configuracion_operativa_auditoria
  after insert or update on public.configuracion_operativa
  for each row execute function public.mesora_auditar_configuracion_operativa();
drop trigger if exists estaciones_restaurante_auditoria on public.estaciones_restaurante;
create trigger estaciones_restaurante_auditoria
  after insert or update on public.estaciones_restaurante
  for each row execute function public.mesora_auditar_configuracion_operativa();
drop trigger if exists destinos_estacion_auditoria on public.destinos_estacion;
create trigger destinos_estacion_auditoria
  after insert or update on public.destinos_estacion
  for each row execute function public.mesora_auditar_configuracion_operativa();
drop trigger if exists categorias_estacion_auditoria on public.categorias_productos;
create trigger categorias_estacion_auditoria
  after update of estacion_id on public.categorias_productos
  for each row execute function public.mesora_auditar_configuracion_operativa();
