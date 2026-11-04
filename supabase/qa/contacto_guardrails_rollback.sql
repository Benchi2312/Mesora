-- Se ejecuta dentro de PGlite; ninguna solicitud llega a Resend ni a producción.
begin;
do $$
declare
  v_email text := repeat('a', 64);
  v_ip text := repeat('b', 64);
  v_admin uuid := gen_random_uuid();
  v_alerts jsonb;
  v_count integer;
  v_original_role text := current_user;
begin
  if has_function_privilege('anon', 'public.mesora_contact_can_send(text,text)', 'execute')
     or has_function_privilege('authenticated', 'public.mesora_contact_can_send(text,text)', 'execute')
     or not has_function_privilege('service_role', 'public.mesora_contact_can_send(text,text)', 'execute') then
    raise exception 'La reserva de cuotas debe ser exclusiva de service_role';
  end if;
  if has_function_privilege('anon', 'public.mesora_record_incident(text,text)', 'execute')
     or has_function_privilege('authenticated', 'public.mesora_record_incident(text,text)', 'execute') then
    raise exception 'Un cliente puede registrar incidentes';
  end if;
  if has_table_privilege('anon', 'private.mesora_contact_limits', 'select')
     or has_table_privilege('authenticated', 'private.mesora_system_incidents', 'select') then
    raise exception 'Un cliente puede leer tablas privadas';
  end if;

  for i in 1..3 loop
    if not public.mesora_contact_can_send(v_email, v_ip) then
      raise exception 'Se rechazó una consulta bajo el límite de correo';
    end if;
  end loop;
  if public.mesora_contact_can_send(v_email, v_ip) then
    raise exception 'El límite de tres por correo no se aplicó';
  end if;
  for i in 1..7 loop
    if not public.mesora_contact_can_send(lpad(to_hex(i), 64, '0'), v_ip) then
      raise exception 'Se rechazó una consulta bajo el límite de IP';
    end if;
  end loop;
  if public.mesora_contact_can_send(lpad(to_hex(100), 64, '0'), v_ip) then
    raise exception 'El límite de diez por IP no se aplicó';
  end if;
  for i in 1..40 loop
    if not public.mesora_contact_can_send(lpad(to_hex(i), 64, '0'), null) then
      raise exception 'Se rechazó una consulta bajo el límite global';
    end if;
  end loop;
  if public.mesora_contact_can_send(lpad(to_hex(101), 64, '0'), null) then
    raise exception 'El límite global de cincuenta no se aplicó';
  end if;
  begin
    perform public.mesora_contact_can_send('correo-en-claro', null);
    raise exception 'La RPC aceptó datos en claro';
  exception when sqlstate '22023' then null;
  end;

  perform public.mesora_record_incident('contacto-comercial', 'resend_rejected');
  perform public.mesora_record_incident('contacto-comercial', 'resend_rejected');
  select occurrences into v_count from private.mesora_system_incidents
   where source = 'contacto-comercial' and code = 'resend_rejected';
  if v_count <> 2 then raise exception 'Los fallos repetidos no se agrupan'; end if;

  insert into auth.users(id) values (v_admin);
  insert into public.usuarios(id, rol, nombre, email, activo)
    values (v_admin, 'super_admin', 'QA propietario', 'propietario@example.invalid', true);
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  execute 'set local role authenticated';
  v_alerts := public.mesora_system_alerts();
  select count(*) into v_count from jsonb_array_elements(v_alerts) a
   where a->>'tipo' = 'incidente_sistema'
     and a->>'detalle' like 'Código resend_rejected%2 intento(s)%';
  if v_count <> 1 then
    raise exception 'El propietario no ve la incidencia agrupada';
  end if;
  execute format('set local role %I', v_original_role);
end;
$$;
rollback;
