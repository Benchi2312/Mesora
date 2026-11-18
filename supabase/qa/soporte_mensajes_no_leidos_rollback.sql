-- Prueba integrada con BEGIN/ROLLBACK: no deja usuarios, tickets ni mensajes.
begin;

do $$
begin
  insert into auth.users(id, email) values
    ('95000000-0000-4000-8000-000000000001', 'admin-a@qa.invalid'),
    ('95000000-0000-4000-8000-000000000002', 'admin-b@qa.invalid'),
    ('95000000-0000-4000-8000-000000000003', 'super@qa.invalid');
  insert into public.restaurantes(id, nombre) values
    ('95000000-0000-4000-8000-000000000011', 'QA Soporte A'),
    ('95000000-0000-4000-8000-000000000012', 'QA Soporte B');
  insert into public.usuarios(id, restaurante_id, rol, nombre, email) values
    ('95000000-0000-4000-8000-000000000001', '95000000-0000-4000-8000-000000000011', 'admin_restaurante', 'Admin A', 'admin-a@qa.invalid'),
    ('95000000-0000-4000-8000-000000000002', '95000000-0000-4000-8000-000000000012', 'admin_restaurante', 'Admin B', 'admin-b@qa.invalid'),
    ('95000000-0000-4000-8000-000000000003', null, 'super_admin', 'Super QA', 'super@qa.invalid');
  insert into public.soporte_tickets(id, restaurante_id, usuario_id, asunto, descripcion) values
    ('95000000-0000-4000-8000-000000000021', '95000000-0000-4000-8000-000000000011', '95000000-0000-4000-8000-000000000001', 'Ticket A', 'Conversación A'),
    ('95000000-0000-4000-8000-000000000022', '95000000-0000-4000-8000-000000000012', '95000000-0000-4000-8000-000000000002', 'Ticket B', 'Conversación B');
  insert into public.soporte_mensajes(id, ticket_id, autor_id, autor_super_admin, mensaje, created_at) values
    ('95000000-0000-4000-8000-000000000031', '95000000-0000-4000-8000-000000000021', '95000000-0000-4000-8000-000000000001', false, 'Mensaje A1', '2026-11-18T10:00:00Z'),
    ('95000000-0000-4000-8000-000000000032', '95000000-0000-4000-8000-000000000021', '95000000-0000-4000-8000-000000000001', false, 'Mensaje A2', '2026-11-18T10:01:00Z'),
    ('95000000-0000-4000-8000-000000000033', '95000000-0000-4000-8000-000000000022', '95000000-0000-4000-8000-000000000002', false, 'Mensaje B1', '2026-11-18T10:02:00Z');
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '95000000-0000-4000-8000-000000000003', true);

do $$
declare
  v_a integer;
  v_b integer;
  v_actualizado integer;
  v_texto text;
  v_autor uuid;
  v_creado timestamptz;
  v_leido_por uuid;
begin
  select cantidad::integer into v_a
    from public.superadmin_conteo_mensajes_soporte_no_leidos()
   where ticket_id = '95000000-0000-4000-8000-000000000021';
  select cantidad::integer into v_b
    from public.superadmin_conteo_mensajes_soporte_no_leidos()
   where ticket_id = '95000000-0000-4000-8000-000000000022';
  if v_a <> 2 or v_b <> 1 then raise exception 'El conteo inicial por conversación debe ser 2 y 1'; end if;

  select count(*)::integer into v_actualizado
    from public.superadmin_marcar_mensajes_soporte_leidos(
      '95000000-0000-4000-8000-000000000021',
      array['95000000-0000-4000-8000-000000000031','95000000-0000-4000-8000-000000000032']::uuid[]
    );
  if v_actualizado <> 2 then raise exception 'Abrir ticket debe marcar solo sus dos mensajes entrantes'; end if;

  select cantidad::integer into v_b
    from public.superadmin_conteo_mensajes_soporte_no_leidos()
   where ticket_id = '95000000-0000-4000-8000-000000000022';
  if v_b <> 1 or exists (
    select 1 from public.superadmin_conteo_mensajes_soporte_no_leidos()
     where ticket_id = '95000000-0000-4000-8000-000000000021'
  ) then raise exception 'Leer conversación A debe dejarla en cero y no afectar B'; end if;

  select count(*)::integer into v_actualizado
    from public.superadmin_marcar_mensajes_soporte_leidos(
      '95000000-0000-4000-8000-000000000021',
      array['95000000-0000-4000-8000-000000000031','95000000-0000-4000-8000-000000000032']::uuid[]
    );
  if v_actualizado <> 0 then raise exception 'La repetición de lectura debe ser idempotente'; end if;

  select mensaje, autor_id, created_at, leido_superadmin_por
    into v_texto, v_autor, v_creado, v_leido_por
    from public.soporte_mensajes where id = '95000000-0000-4000-8000-000000000031';
  if v_texto <> 'Mensaje A1' or v_autor <> '95000000-0000-4000-8000-000000000001'
     or v_creado <> '2026-11-18T10:00:00Z'::timestamptz
     or v_leido_por <> '95000000-0000-4000-8000-000000000003'
     or (select leido_superadmin_at from public.soporte_mensajes where id = '95000000-0000-4000-8000-000000000031') is null then
    raise exception 'La lectura debe guardar actor/fecha y conservar autor, mensaje y conversación';
  end if;
  if has_function_privilege('anon', 'public.superadmin_conteo_mensajes_soporte_no_leidos()', 'execute')
     or has_function_privilege('anon', 'public.superadmin_marcar_mensajes_soporte_leidos(uuid,uuid[])', 'execute')
     or has_table_privilege('anon', 'public.soporte_mensajes', 'select') then
    raise exception 'Anon no debe leer ni ejecutar las operaciones de no leídos';
  end if;
end;
$$;

reset role;
insert into public.soporte_mensajes(id, ticket_id, autor_id, autor_super_admin, mensaje, created_at) values
  ('95000000-0000-4000-8000-000000000034', '95000000-0000-4000-8000-000000000021', '95000000-0000-4000-8000-000000000001', false, 'Mensaje A3 posterior', '2026-11-18T10:03:00Z');

set local role authenticated;
select set_config('request.jwt.claim.sub', '95000000-0000-4000-8000-000000000003', true);
do $$
declare v_primera integer; v_recarga integer; v_a integer; v_b integer;
begin
  select coalesce(sum(cantidad), 0)::integer into v_primera
    from public.superadmin_conteo_mensajes_soporte_no_leidos();
  select coalesce(sum(cantidad), 0)::integer into v_recarga
    from public.superadmin_conteo_mensajes_soporte_no_leidos();
  select cantidad::integer into v_a from public.superadmin_conteo_mensajes_soporte_no_leidos()
    where ticket_id = '95000000-0000-4000-8000-000000000021';
  select cantidad::integer into v_b from public.superadmin_conteo_mensajes_soporte_no_leidos()
    where ticket_id = '95000000-0000-4000-8000-000000000022';
  if v_primera <> 2 or v_recarga <> 2 or v_a <> 1 or v_b <> 1 then
    raise exception 'Nuevo mensaje posterior debe incrementar una sola vez y persistir tras recarga';
  end if;
end;
$$;

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '95000000-0000-4000-8000-000000000001', true);
do $$
declare v_visibles integer; v_rechazado boolean := false;
begin
  select count(*)::integer into v_visibles from public.soporte_mensajes;
  if v_visibles <> 3 then raise exception 'El admin A debe ver únicamente los tres mensajes de su restaurante'; end if;
  update public.soporte_mensajes
     set leido_superadmin_at = now(), leido_superadmin_por = auth.uid()
   where id = '95000000-0000-4000-8000-000000000034';
  if found then raise exception 'RLS debe bloquear una actualización directa del estado de lectura a un admin de restaurante'; end if;
  begin
    perform * from public.superadmin_conteo_mensajes_soporte_no_leidos();
  exception when insufficient_privilege then
    v_rechazado := true;
  end;
  if not v_rechazado then raise exception 'El RPC de conteo global debe rechazar a un admin de restaurante'; end if;
  v_rechazado := false;
  begin
    perform * from public.superadmin_marcar_mensajes_soporte_leidos(
      '95000000-0000-4000-8000-000000000022', array['95000000-0000-4000-8000-000000000033']::uuid[]
    );
  exception when insufficient_privilege then
    v_rechazado := true;
  end;
  if not v_rechazado then raise exception 'El RPC de lectura debe rechazar al admin y al ticket de otro restaurante'; end if;
end;
$$;

rollback;
