-- Matriz de cobro por rol, política, tenant y auditoría. Sin datos persistentes.
begin;
create temp table qa_cobro_ids on commit drop as
select gen_random_uuid() r_a, gen_random_uuid() r_b,
       gen_random_uuid() admin_a, gen_random_uuid() admin_b,
       gen_random_uuid() mesero_a, gen_random_uuid() mesero_2,
       gen_random_uuid() cajero_a, gen_random_uuid() cocina_a,
       gen_random_uuid() inactivo_a, gen_random_uuid() cajero_b,
       gen_random_uuid() zona_a;

insert into auth.users(id, email)
select u.id, u.correo from qa_cobro_ids v,
lateral (values
  (v.admin_a, 'cobro-admin-a@qa.example'), (v.admin_b, 'cobro-admin-b@qa.example'),
  (v.mesero_a, 'cobro-mesero-a@qa.example'), (v.mesero_2, 'cobro-mesero-2@qa.example'),
  (v.cajero_a, 'cobro-cajero-a@qa.example'), (v.cocina_a, 'cobro-cocina-a@qa.example'),
  (v.inactivo_a, 'cobro-inactivo-a@qa.example'), (v.cajero_b, 'cobro-cajero-b@qa.example')
) u(id, correo);

insert into public.restaurantes(id, nombre, suscripcion_activa, fecha_vencimiento)
select r_a, 'QA Cobro A', true, now() + interval '30 days' from qa_cobro_ids
union all select r_b, 'QA Cobro B', true, now() + interval '30 days' from qa_cobro_ids;

insert into public.usuarios(id, restaurante_id, rol, nombre, activo)
select u.id, u.rid, u.rol, u.nombre, u.activo from qa_cobro_ids v,
lateral (values
  (v.admin_a, v.r_a, 'admin_restaurante', 'Admin A', true),
  (v.admin_b, v.r_b, 'admin_restaurante', 'Admin B', true),
  (v.mesero_a, v.r_a, 'mesero', 'Mesero A', true),
  (v.mesero_2, v.r_a, 'mesero', 'Mesero 2', true),
  (v.cajero_a, v.r_a, 'cajero', 'Cajero A', true),
  (v.cocina_a, v.r_a, 'cocina', 'Cocina A', true),
  (v.inactivo_a, v.r_a, 'mesero', 'Inactivo A', false),
  (v.cajero_b, v.r_b, 'cajero', 'Cajero B', true)
) u(id, rid, rol, nombre, activo);

insert into public.zonas(id, restaurante_id, nombre)
select zona_a, r_a, 'QA Cobro' from qa_cobro_ids;

create temp table qa_cobro_casos on commit drop as
select n, gen_random_uuid() mesa_id, gen_random_uuid() pedido_id
  from generate_series(1, 9) n;
grant select on qa_cobro_casos to authenticated;
insert into public.mesas(id, restaurante_id, zona_id, nombre, mesero_responsable_id)
select c.mesa_id, v.r_a, v.zona_a, 'Mesa QA ' || c.n,
       case when c.n = 3 then v.mesero_a else null end
  from qa_cobro_casos c cross join qa_cobro_ids v;
insert into public.pedidos(id, restaurante_id, mesa_id, mesero_id)
select c.pedido_id, v.r_a, c.mesa_id, v.mesero_a
  from qa_cobro_casos c cross join qa_cobro_ids v;
insert into public.pedido_items(pedido_id, nombre_producto, cantidad, precio_unitario)
select pedido_id, 'Producto QA', 1, 10 from qa_cobro_casos;

do $$
declare
  v record;
  c record;
  cuenta_previa uuid;
  cuenta_cajero uuid;
  cuenta_admin uuid;
  antes record;
  inicial text := current_user;
  respuesta jsonb;
begin
  select * into v from qa_cobro_ids;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', v.mesero_a::text, true);
  select * into c from qa_cobro_casos where n = 1;
  -- La preferencia guardada antes de esta migración no cambia permisos.
  execute format('set local role %I', inicial);
  update public.configuracion_operativa set modalidad_cobro = 'solo_cajero' where restaurante_id = v.r_a;
  execute 'set local role authenticated';
  if not public.puede_cobrar_restaurante(v.r_a) then raise exception 'Se perdió el cobro heredado'; end if;
  cuenta_previa := public.cerrar_cuenta(v.r_a, c.mesa_id, array[c.pedido_id], '[{"metodo_pago":"efectivo","monto":10}]'::jsonb, 0);
  if cuenta_previa is null then raise exception 'No se cobró la cuenta heredada'; end if;
  select total, numero, mesero_id_snapshot into antes from public.cuentas where id = cuenta_previa;

  perform set_config('request.jwt.claim.sub', v.admin_a::text, true);
  respuesta := public.admin_guardar_politica_cobro(v.r_a, 'solo_cajero', array[v.cajero_a]);
  if respuesta->>'modalidad_aplicada' <> 'solo_cajero' then raise exception 'No se aplicó solo caja'; end if;
  begin
    perform public.admin_guardar_politica_cobro(v.r_a, 'solo_cajero', array[v.cajero_b]);
    raise exception 'Aceptó cajero ajeno';
  exception when sqlstate '22023' then null; end;
  begin
    perform public.admin_guardar_politica_cobro(v.r_a, 'solo_cajero', array[v.cocina_a]);
    raise exception 'Aceptó cocina';
  exception when sqlstate '22023' then null; end;
  begin
    perform public.admin_guardar_politica_cobro(v.r_a, 'cobro_por_mesero', array[v.inactivo_a]);
    raise exception 'Aceptó inactivo';
  exception when sqlstate '22023' then null; end;
  begin
    perform public.admin_guardar_politica_cobro(v.r_b, 'solo_cajero', array[v.cajero_b]);
    raise exception 'Admin A cambió restaurante B';
  exception when sqlstate '42501' then null; end;

  select * into c from qa_cobro_casos where n = 2;
  perform set_config('request.jwt.claim.sub', v.mesero_a::text, true);
  begin
    perform public.cerrar_cuenta(v.r_a, c.mesa_id, array[c.pedido_id], '[{"metodo_pago":"efectivo","monto":10}]'::jsonb, 0);
    raise exception 'Mesero cobró en solo caja por RPC directa';
  exception when sqlstate '42501' then null; end;
  perform set_config('request.jwt.claim.sub', v.cocina_a::text, true);
  if public.puede_cobrar_restaurante(v.r_a) then raise exception 'Cocina puede cobrar'; end if;
  begin
    perform public.cerrar_cuenta(v.r_a, c.mesa_id, array[c.pedido_id], '[{"metodo_pago":"efectivo","monto":10}]'::jsonb, 0);
    raise exception 'Cocina cobró';
  exception when sqlstate '42501' then null; end;
  perform set_config('request.jwt.claim.sub', v.inactivo_a::text, true);
  if public.puede_cobrar_restaurante(v.r_a) then raise exception 'Inactivo puede cobrar'; end if;
  begin
    perform public.cerrar_cuenta(v.r_a, c.mesa_id, array[c.pedido_id], '[{"metodo_pago":"efectivo","monto":10}]'::jsonb, 0);
    raise exception 'Inactivo cobró';
  exception when others then
    if sqlerrm = 'Inactivo cobró' then raise; end if;
  end;
  perform set_config('request.jwt.claim.sub', v.cajero_b::text, true);
  if public.puede_cobrar_restaurante(v.r_a) then raise exception 'Cajero ajeno puede cobrar'; end if;
  begin
    perform public.cerrar_cuenta(v.r_a, c.mesa_id, array[c.pedido_id], '[{"metodo_pago":"efectivo","monto":10}]'::jsonb, 0);
    raise exception 'Cajero ajeno cobró';
  exception when others then
    if sqlerrm = 'Cajero ajeno cobró' then raise; end if;
  end;

  perform set_config('request.jwt.claim.sub', v.cajero_a::text, true);
  select * into c from qa_cobro_casos where n = 3;
  cuenta_cajero := public.cerrar_cuenta(v.r_a, c.mesa_id, array[c.pedido_id], '[{"metodo_pago":"efectivo","monto":10}]'::jsonb, 0);
  if (select mesero_id_snapshot from public.cuentas where id = cuenta_cajero) <> v.mesero_a then
    raise exception 'El recibo mostró al cajero como mesero';
  end if;

  perform set_config('request.jwt.claim.sub', v.admin_a::text, true);
  perform public.admin_guardar_politica_cobro(v.r_a, 'cobro_por_mesero', array[v.mesero_a]);
  perform set_config('request.jwt.claim.sub', v.cajero_a::text, true);
  if public.puede_cobrar_restaurante(v.r_a) then raise exception 'Cajero cobró en modo meseros'; end if;
  perform set_config('request.jwt.claim.sub', v.mesero_2::text, true);
  if public.puede_cobrar_restaurante(v.r_a) then raise exception 'Mesero no autorizado puede cobrar'; end if;
  perform set_config('request.jwt.claim.sub', v.mesero_a::text, true);
  if not public.puede_cobrar_restaurante(v.r_a) then raise exception 'Mesero autorizado rechazado'; end if;
  select * into c from qa_cobro_casos where n = 4;
  perform public.cerrar_cuenta(v.r_a, c.mesa_id, array[c.pedido_id], '[{"metodo_pago":"efectivo","monto":10}]'::jsonb, 0);

  perform set_config('request.jwt.claim.sub', v.admin_a::text, true);
  perform public.admin_guardar_politica_cobro(v.r_a, 'caja_central_meseros_autorizados', array[v.cajero_a, v.mesero_2]);
  perform set_config('request.jwt.claim.sub', v.cajero_a::text, true);
  select * into c from qa_cobro_casos where n = 5;
  perform public.cerrar_cuenta(v.r_a, c.mesa_id, array[c.pedido_id], '[{"metodo_pago":"efectivo","monto":10}]'::jsonb, 0);
  perform set_config('request.jwt.claim.sub', v.mesero_2::text, true);
  select * into c from qa_cobro_casos where n = 6;
  perform public.cerrar_cuenta(v.r_a, c.mesa_id, array[c.pedido_id], '[{"metodo_pago":"efectivo","monto":10}]'::jsonb, 0);
  perform set_config('request.jwt.claim.sub', v.mesero_a::text, true);
  if public.puede_cobrar_restaurante(v.r_a) then raise exception 'Mesero revocado puede cobrar en mixto'; end if;

  perform set_config('request.jwt.claim.sub', v.admin_a::text, true);
  select * into c from qa_cobro_casos where n = 7;
  cuenta_admin := public.cerrar_cuenta(v.r_a, c.mesa_id, array[c.pedido_id], '[{"metodo_pago":"efectivo","monto":10}]'::jsonb, 0);
  execute format('set local role %I', inicial);
  if not exists (select 1 from public.audit_logs where accion = 'cobro_contingencia_admin'
    and actor_id = v.admin_a and entidad_id = cuenta_admin and restaurante_id = v.r_a) then
    raise exception 'Falta auditoría de contingencia';
  end if;
  if not exists (select 1 from public.audit_logs where accion = 'modalidad_cobro_aplicar'
    and actor_id = v.admin_a and restaurante_id = v.r_a) then
    raise exception 'Falta auditoría de modalidad';
  end if;
  if (select count(*) from public.audit_logs where accion = 'autorizacion_cobro_actualizar'
    and actor_id = v.admin_a and restaurante_id = v.r_a) < 3 then
    raise exception 'Falta auditoría de autorizaciones';
  end if;
  if (select total from public.cuentas where id = cuenta_previa) <> antes.total
     or (select numero from public.cuentas where id = cuenta_previa) <> antes.numero
     or (select mesero_id_snapshot from public.cuentas where id = cuenta_previa) <> antes.mesero_id_snapshot then
    raise exception 'Se modificó un cobro histórico';
  end if;
  if (select count(*) from public.cuentas where restaurante_id = v.r_a) <> 6 then
    raise exception 'Un rechazo creó una cuenta adicional';
  end if;
  if has_function_privilege('anon','public.admin_guardar_politica_cobro(uuid,text,uuid[])','execute')
     or has_function_privilege('anon','public.puede_cobrar_restaurante(uuid)','execute') then
    raise exception 'Anon puede consultar o modificar cobros';
  end if;
end;
$$;
rollback;
