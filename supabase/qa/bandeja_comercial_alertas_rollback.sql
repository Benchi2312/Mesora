begin;
do $$
declare
  v_rest uuid := gen_random_uuid();
  v_admin uuid := gen_random_uuid();
  v_super uuid := gen_random_uuid();
  v_ticket uuid;
  v_lead jsonb;
  v_lead_repetido jsonb;
  v_jobs jsonb;
  v_job_id uuid;
  v_inbox jsonb;
  v_inicial text := current_user;
begin
  if has_schema_privilege('authenticated', 'private', 'usage')
     or has_table_privilege('authenticated', 'private.mesora_commercial_leads', 'select')
     or has_table_privilege('anon', 'private.mesora_mail_jobs', 'select')
     or has_function_privilege('authenticated', 'public.mesora_register_commercial_lead(text,text,text,text,text)', 'execute')
     or has_function_privilege('anon', 'public.mesora_claim_mail_jobs(integer,uuid)', 'execute')
     or not has_function_privilege('service_role', 'public.mesora_claim_mail_jobs(integer,uuid)', 'execute') then
    raise exception 'La bandeja privada o la cola quedaron expuestas';
  end if;
  if has_column_privilege('authenticated', 'public.soporte_tickets', 'estado', 'insert')
     or has_column_privilege('authenticated', 'public.soporte_tickets', 'responsable', 'insert') then
    raise exception 'Un administrador puede autodefinir estado o responsable';
  end if;

  insert into auth.users(id, email) values
    (v_admin, 'admin-qa@mesora.example'),
    (v_super, 'super-qa@mesora.example');
  insert into public.restaurantes(id, nombre, suscripcion_activa)
    values(v_rest, 'Restaurante QA', true);
  insert into public.usuarios(id, restaurante_id, rol, nombre, email, activo) values
    (v_admin, v_rest, 'admin_restaurante', 'Admin QA', 'admin-qa@mesora.example', true),
    (v_super, null, 'super_admin', 'Super QA', 'super-qa@mesora.example', true);

  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  execute 'set local role authenticated';
  insert into public.soporte_tickets(restaurante_id, usuario_id, asunto, descripcion, prioridad, tipo)
  values(v_rest, v_admin, 'No carga cocina', 'Fallo de prueba', 'alta', 'error') returning id into v_ticket;
  execute format('set local role %I', v_inicial);
  if not exists (select 1 from private.mesora_mail_jobs where dedupe_key = 'support:' || v_ticket::text) then
    raise exception 'Ticket sin aviso en cola';
  end if;
  execute 'set local role authenticated';
  begin
    perform public.mesora_commercial_inbox();
    raise exception 'Admin restaurante vio consultas comerciales';
  exception when insufficient_privilege then null;
  end;
  execute format('set local role %I', v_inicial);

  perform set_config('request.jwt.claim.sub', '', true);
  v_lead := public.mesora_register_commercial_lead(
    repeat('a', 64), 'Cliente QA', 'Local QA', 'cliente@mesora.example', 'Quiero una demo');
  v_lead_repetido := public.mesora_register_commercial_lead(
    repeat('a', 64), 'Cliente QA', 'Local QA', 'cliente@mesora.example', 'Quiero una demo');
  if v_lead->>'lead_id' is distinct from v_lead_repetido->>'lead_id'
     or (select count(*) from private.mesora_commercial_leads where submission_key = repeat('a',64)) <> 1 then
    raise exception 'Reintento creó una consulta duplicada';
  end if;
  v_job_id := (v_lead->>'job_id')::uuid;
  v_jobs := public.mesora_claim_mail_jobs(1, v_job_id);
  if jsonb_array_length(v_jobs) <> 1 then raise exception 'No se reservó el aviso comercial'; end if;
  if jsonb_array_length(public.mesora_claim_mail_jobs(1, v_job_id)) <> 0 then
    raise exception 'El mismo correo fue reservado dos veces';
  end if;
  perform public.mesora_finish_mail_job(v_job_id, false, 'resend_unavailable');
  if (select next_attempt <= now() from private.mesora_mail_jobs where id = v_job_id) then
    raise exception 'El reintento no tiene demora';
  end if;
  perform public.mesora_record_incident('contacto-comercial', 'resend_unavailable');
  perform public.mesora_record_incident('contacto-comercial', 'resend_unavailable');
  if (select count(*) from private.mesora_mail_jobs where kind = 'incident') <> 1 then
    raise exception 'Incidente duplicó correos';
  end if;
  execute format('set local role %I', v_inicial);

  perform set_config('request.jwt.claim.sub', v_super::text, true);
  execute 'set local role authenticated';
  v_inbox := public.mesora_commercial_inbox();
  if v_inbox#>>'{consultas,0,nombre}' <> 'Cliente QA'
     or (v_inbox#>>'{resumen,correo_pendiente}')::integer <> 1 then
    raise exception 'La bandeja comercial no muestra la consulta';
  end if;
  perform public.mesora_update_commercial_lead((v_lead->>'lead_id')::uuid, 'en_seguimiento');
  if public.mesora_commercial_inbox()#>>'{consultas,0,estado}' <> 'en_seguimiento' then
    raise exception 'No se guardó el seguimiento';
  end if;
  execute format('set local role %I', v_inicial);
end;
$$;
rollback;
