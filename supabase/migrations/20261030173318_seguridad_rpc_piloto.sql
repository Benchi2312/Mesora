-- Cierra la API de funciones a anónimos y preserva el acceso autenticado real.
-- No cambia cuerpos de RPC ni permisos de tablas; no toca funciones de extensiones.
do $$
declare
  f record;
  v_firma text;
  v_auth boolean;
  v_servicio boolean;
begin
  for f in
    select p.oid, p.proname, p.prorettype, pg_get_function_identity_arguments(p.oid) as args
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
      and not exists (
        select 1 from pg_catalog.pg_depend d
        where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e'
      )
  loop
    v_firma := format('public.%I(%s)', f.proname, f.args);
    v_auth := has_function_privilege('authenticated', f.oid, 'execute');
    v_servicio := has_function_privilege('service_role', f.oid, 'execute');
    execute format('revoke execute on function %s from public, anon', v_firma);
    execute format('alter function %s set search_path = pg_catalog, public, extensions, pg_temp', v_firma);

    if f.prorettype = 'trigger'::regtype or f.proname in ('validar_pin_autorizacion', 'registrar_auditoria') then
      execute format('revoke execute on function %s from authenticated', v_firma);
    elsif v_auth then
      execute format('grant execute on function %s to authenticated', v_firma);
    end if;
    if v_servicio then execute format('grant execute on function %s to service_role', v_firma); end if;
  end loop;
end;
$$;

-- Las funciones nuevas deben declarar explícitamente su API pública.
alter default privileges in schema public revoke execute on functions from public, anon;
