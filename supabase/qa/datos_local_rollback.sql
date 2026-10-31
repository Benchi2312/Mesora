-- Verificación con perfiles existentes. Todas las escrituras se revierten.
-- Ejecutar con rol de mantenimiento, después de datos_local_dominio.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '15s';

do $$
declare
  v_admin uuid;
  v_restaurante uuid;
  v_otro uuid;
  v_personal uuid;
  v_filas integer;
  v_rol text := current_user;
begin
  select u.id, r.id into v_admin, v_restaurante
  from public.usuarios u
  join public.restaurantes r on r.id = u.restaurante_id
  where u.rol::text = 'admin_restaurante'
    and coalesce(u.activo, true)
    and r.suscripcion_activa
    and (r.fecha_vencimiento is null or r.fecha_vencimiento > now())
  limit 1;
  if v_admin is null then raise exception 'No hay administrador activo para esta prueba'; end if;
  select id into v_otro from public.restaurantes where id <> v_restaurante limit 1;
  select id into v_personal from public.usuarios
  where restaurante_id = v_restaurante and coalesce(activo, true)
    and rol::text in ('mesero', 'cajero', 'cocina') limit 1;

  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  update public.restaurantes set dominio = 'configuracion-qa.example' where id = v_restaurante;
  get diagnostics v_filas = row_count;
  if v_filas <> 1 then raise exception 'El administrador no pudo guardar su dominio'; end if;

  begin
    update public.restaurantes set dominio = 'dominio no valido' where id = v_restaurante;
    raise exception 'El servidor aceptó un dominio inválido';
  exception when check_violation then null;
  end;
  begin
    update public.restaurantes set suscripcion_activa = false where id = v_restaurante;
    raise exception 'El administrador pudo modificar su suscripción';
  exception when insufficient_privilege then null;
  end;
  if v_otro is not null then
    update public.restaurantes set dominio = 'configuracion-qa.example' where id = v_otro;
    get diagnostics v_filas = row_count;
    if v_filas <> 0 then raise exception 'Se pudo editar un restaurante ajeno'; end if;
  end if;
  execute format('set local role %I', v_rol);

  if v_personal is not null then
    perform set_config('request.jwt.claim.sub', v_personal::text, true);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', v_personal, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    update public.restaurantes set dominio = 'configuracion-qa.example' where id = v_restaurante;
    get diagnostics v_filas = row_count;
    if v_filas <> 0 then raise exception 'El personal pudo modificar los datos del local'; end if;
    execute format('set local role %I', v_rol);
  end if;

  execute 'set local role anon';
  begin
    update public.restaurantes set dominio = 'configuracion-qa.example' where id = v_restaurante;
    raise exception 'Un anónimo pudo enviar una actualización';
  exception when insufficient_privilege then null;
  end;
  execute format('set local role %I', v_rol);
end;
$$;

rollback;
select 'Datos del local: pruebas transaccionales correctas; escrituras revertidas.' as resultado;
