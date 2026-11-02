begin;
do $$
declare v_rol text := current_user; v_denegado boolean;
begin
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prokind='f'
      and not exists (select 1 from pg_depend d where d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e')
      and (has_function_privilege('anon',p.oid,'execute') or p.proconfig is null)
  ) then raise exception 'Queda una función pública expuesta o sin search_path'; end if;
  if not has_function_privilege('authenticated','public.crear_pedido(uuid,uuid,jsonb)','execute')
     or not has_function_privilege('authenticated','public.cerrar_cuenta(uuid,uuid,uuid[],jsonb,numeric)','execute')
     or not has_function_privilege('service_role','public.registrar_auditoria(uuid,text,uuid,text,uuid,text,jsonb)','execute') then
    raise exception 'Se perdió un permiso requerido por la aplicación';
  end if;
  execute 'set local role anon';
  v_denegado := false;
  begin perform public.crear_pedido(null,null,'[]'::jsonb);
  exception when insufficient_privilege then v_denegado := true; end;
  if not v_denegado then raise exception 'anon puede invocar crear_pedido'; end if;
  -- El precio y el contacto visibles en la landing siguen disponibles sin sesión.
  perform precio_plan_mensual, correo_soporte, telefono_soporte from public.configuracion_global;
  execute format('set local role %I',v_rol);
  execute 'set local role authenticated';
  v_denegado := false;
  begin perform public.validar_pin_autorizacion(null,'0000');
  exception when insufficient_privilege then v_denegado := true; end;
  if not v_denegado then raise exception 'El cliente puede usar el helper de PIN directamente'; end if;
  execute format('set local role %I',v_rol);
end;
$$;
rollback;
select 'Permisos RPC, search_path, servicio y precio público: OK' as resultado;
