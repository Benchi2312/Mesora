-- Reportes del restaurante: rangos, ventas, anulaciones, pagos divididos,
-- atribución independiente de comandas/ventas, filtros y aislamiento tenant.
begin;
create temp table qa_reportes_ids on commit drop as
select gen_random_uuid() r_a, gen_random_uuid() r_b,
       gen_random_uuid() admin_a, gen_random_uuid() admin_b,
       gen_random_uuid() waiter_a, gen_random_uuid() waiter_b,
       gen_random_uuid() zone_a, gen_random_uuid() mesa_a, gen_random_uuid() mesa_b,
       gen_random_uuid() cat_a, gen_random_uuid() prod_a, gen_random_uuid() prod_b,
       gen_random_uuid() prod_no_sales, gen_random_uuid() prod_other, gen_random_uuid() order_a, gen_random_uuid() order_b,
       gen_random_uuid() order_cancel, gen_random_uuid() order_other,
       gen_random_uuid() account_a, gen_random_uuid() account_cancel,
       gen_random_uuid() account_other;

insert into auth.users(id, email)
select id, email from qa_reportes_ids v,
lateral (values
  (v.admin_a, 'reporte-admin-a@qa.example'), (v.admin_b, 'reporte-admin-b@qa.example'),
  (v.waiter_a, 'reporte-waiter-a@qa.example'), (v.waiter_b, 'reporte-waiter-b@qa.example')
) x(id, email);
insert into public.restaurantes(id, nombre, suscripcion_activa, fecha_vencimiento)
select r_a, 'QA reportes A', true, now() + interval '30 days' from qa_reportes_ids
union all select r_b, 'QA reportes B', true, now() + interval '30 days' from qa_reportes_ids;
insert into public.usuarios(id, restaurante_id, rol, nombre)
select u.id, u.rid, u.rol, u.nombre from qa_reportes_ids v,
lateral (values
  (v.admin_a, v.r_a, 'admin_restaurante', 'Admin A'),
  (v.admin_b, v.r_b, 'admin_restaurante', 'Admin B'),
  (v.waiter_a, v.r_a, 'mesero', 'Mesero A'),
  (v.waiter_b, v.r_a, 'mesero', 'Mesero B')
) u(id, rid, rol, nombre);
insert into public.zonas(id, restaurante_id, nombre) select zone_a, r_a, 'Salón QA' from qa_reportes_ids;
insert into public.mesas(id, restaurante_id, zona_id, nombre)
select mesa_a, r_a, zone_a, 'Mesa A' from qa_reportes_ids
union all select mesa_b, r_a, zone_a, 'Mesa B' from qa_reportes_ids;
insert into public.categorias_productos(id, restaurante_id, nombre)
select cat_a, r_a, 'Platos QA' from qa_reportes_ids;
insert into public.productos(id, restaurante_id, categoria_id, nombre, precio, disponible, es_bebida)
select prod_a, r_a, cat_a, 'Producto A', 10, true, false from qa_reportes_ids
union all select prod_b, r_a, cat_a, 'Producto B', 5, true, true from qa_reportes_ids
union all select prod_no_sales, r_a, cat_a, 'Sin ventas', 3, true, false from qa_reportes_ids;
insert into public.productos(id, restaurante_id, nombre, precio, disponible, es_bebida)
select prod_other, r_b, 'Producto de otro local', 7, true, false from qa_reportes_ids;
insert into public.pedidos(id, restaurante_id, mesa_id, mesero_id, created_at)
select order_a, r_a, mesa_a, waiter_a, now() - interval '2 hours' from qa_reportes_ids
union all select order_b, r_a, mesa_a, waiter_b, now() - interval '1 hour' from qa_reportes_ids
union all select order_cancel, r_a, mesa_b, waiter_a, now() - interval '50 minutes' from qa_reportes_ids
union all select order_other, r_b, mesa_b, admin_b, now() - interval '30 minutes' from qa_reportes_ids;
insert into public.pedido_items(pedido_id, producto_id, nombre_producto, cantidad, precio_unitario, es_bebida, estacion)
select order_a, prod_a, 'Producto A', 2, 10, false, 'cocina' from qa_reportes_ids
union all select order_b, prod_b, 'Producto B', 1, 5, true, 'bar' from qa_reportes_ids
union all select order_cancel, prod_a, 'Producto A', 1, 10, false, 'cocina' from qa_reportes_ids
union all select order_other, prod_other, 'Producto de otro local', 50, 10, false, 'cocina' from qa_reportes_ids;
insert into public.cuentas(id, restaurante_id, mesa_id, total, metodo_pago, estado, pagado_at, anulada_at, monto_reembolsado, propina, numero, motivo_anulacion, anulada_por, created_at)
select account_a, r_a, mesa_a, 25, 'efectivo', 'pagada', now() - interval '40 minutes', null, null, 5, 'QA-REPORT-1', null, null, now() - interval '3 hours' from qa_reportes_ids
union all select account_cancel, r_a, mesa_b, 10, 'efectivo', 'anulada', now() - interval '1 hour', now() - interval '30 minutes', 5, 0, 'QA-REPORT-2', 'Devolución QA', admin_a, now() - interval '2 hours' from qa_reportes_ids
union all select account_other, r_b, mesa_b, 500, 'efectivo', 'pagada', now() - interval '20 minutes', null, null, 0, 'QA-OTHER-1', null, null, now() - interval '1 hour' from qa_reportes_ids;
insert into public.cuenta_pedidos(cuenta_id, pedido_id, subtotal)
select account_a, order_a, 20 from qa_reportes_ids
union all select account_a, order_b, 5 from qa_reportes_ids
union all select account_cancel, order_cancel, 10 from qa_reportes_ids
union all select account_other, order_other, 500 from qa_reportes_ids;
insert into public.cuenta_pagos(cuenta_id, restaurante_id, metodo_pago, monto)
select account_a, r_a, 'efectivo', 20 from qa_reportes_ids
union all select account_a, r_a, 'yape_plin', 5 from qa_reportes_ids
union all select account_cancel, r_a, 'efectivo', 10 from qa_reportes_ids
union all select account_other, r_b, 'efectivo', 500 from qa_reportes_ids;

do $$
declare
  v record;
  r jsonb;
  v_security_definer boolean;
  v_search_path text;
  inicial text := current_user;
  inicio timestamptz := now() - interval '1 day';
  fin timestamptz := now() + interval '1 day';
begin
  select * into v from qa_reportes_ids;
  select p.prosecdef, array_to_string(p.proconfig, ',')
    into v_security_definer, v_search_path
    from pg_proc p
   where p.oid = 'public.reporte_admin_detallado_restaurante(uuid,timestamptz,timestamptz,text,uuid,uuid,text,integer,integer)'::regprocedure;
  if v_security_definer is true then raise exception 'El RPC de reportes no debe ejecutarse como SECURITY DEFINER'; end if;
  if v_search_path not like '%search_path=pg_catalog, public, pg_temp%' then raise exception 'El RPC no fija su search_path'; end if;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', v.admin_a::text, true);
  r := public.reporte_admin_detallado_restaurante(v.r_a, inicio, fin, 'todas', null, null, '', 0, 100);
  if (r#>>'{resumen,ventas}')::numeric <> 25 then raise exception 'Ventas pagadas no coinciden con el reporte base'; end if;
  if (r#>>'{resumen,neto}')::numeric <> 20 then raise exception 'Neto no descuenta el monto reembolsado'; end if;
  if jsonb_array_length(r->'reembolsos_por_dia') <> 1 or (r#>>'{reembolsos_por_dia,0,reembolsos}')::numeric <> 5 then raise exception 'La serie diaria no conserva el reembolso del resumen'; end if;
  if (r#>>'{resumen,propinas}')::numeric <> 5 then raise exception 'La propina debe conservarse fuera de ventas'; end if;
  if (r#>>'{resumen,cuentas_pagadas}')::integer <> 1 or (r#>>'{resumen,cuentas_anuladas}')::integer <> 1 then raise exception 'No se separan cuentas pagadas y anuladas'; end if;
  if (r#>>'{productos,0,cantidad}')::integer <> 2 or (r#>>'{productos,0,total}')::numeric <> 20 then raise exception 'Producto vendido no suma cantidad/importe'; end if;
  if (r#>>'{categorias,0,total}')::numeric <> 25 then raise exception 'Categoría no suma solo productos cobrados'; end if;
  if (r#>>'{meseros,0,comandas}')::integer <> 1 or (r#>>'{meseros,0,cuentas}')::integer <> 1 then raise exception 'Comandas y cuentas se calculan por separado'; end if;
  if abs((r#>>'{meseros,0,propinas}')::numeric - 4) > 0.01 then raise exception 'La propina se atribuye de forma proporcional al aporte'; end if;
  if jsonb_array_length(r->'comandas_por_estacion') <> 2 then raise exception 'Falta el corte por estación'; end if;
  if jsonb_array_length(r->'productos_sin_ventas') <> 1 then raise exception 'No se identifican productos disponibles sin ventas'; end if;
  if jsonb_array_length(r->'cuentas') <> 2 then raise exception 'Falta cuenta pagada o anulada en detalle'; end if;

  r := public.reporte_admin_detallado_restaurante(v.r_a, inicio, fin, 'pagada', v.waiter_b, v.prod_b, '', 0, 25);
  if jsonb_array_length(r->'cuentas') <> 1 or r#>>'{cuentas,0,id}' <> v.account_a::text then raise exception 'Filtros por mesero/producto no aplican al detalle'; end if;
  if jsonb_array_length(r->'productos') <> 1 or r#>>'{productos,0,id}' <> v.prod_b::text then raise exception 'Filtros activos no aplican a agregados de producto'; end if;
  if jsonb_array_length(r->'meseros') <> 1 or r#>>'{meseros,0,id}' <> v.waiter_b::text then raise exception 'El ranking confunde el mesero seleccionado'; end if;

  r := public.reporte_admin_detallado_restaurante(v.r_a, inicio, fin, 'todas', null, null, '', 0, 1);
  if (r->>'total_cuentas')::integer <> 2 or jsonb_array_length(r->'cuentas') <> 1 then raise exception 'La paginación del detalle no respeta su total'; end if;
  if jsonb_array_length(r->'reembolsos_por_dia') <> 1 then raise exception 'La serie diaria no puede depender de la página visible'; end if;
  r := public.reporte_admin_detallado_restaurante(v.r_a, now() + interval '3 days', now() + interval '4 days', 'todas', null, null, '', 0, 25);
  if (r#>>'{resumen,ventas}')::numeric <> 0 or jsonb_array_length(r->'cuentas') <> 0 then raise exception 'Un periodo sin ventas debe devolver ceros y listas vacías'; end if;
  if jsonb_array_length(r->'reembolsos_por_dia') <> 0 then raise exception 'Periodo vacío no debe tener barras de reembolso'; end if;

  perform set_config('request.jwt.claim.sub', v.waiter_a::text, true);
  begin
    perform public.reporte_admin_detallado_restaurante(v.r_a, inicio, fin, 'todas', null, null, '', 0, 25);
    raise exception 'Mesero pudo consultar reportes de administración';
  exception when raise_exception then
    if sqlerrm = 'Mesero pudo consultar reportes de administración' then raise; end if;
  end;
  perform set_config('request.jwt.claim.sub', v.admin_a::text, true);

  begin
    perform public.reporte_admin_detallado_restaurante(v.r_b, inicio, fin, 'todas', null, null, '', 0, 25);
    raise exception 'Admin A pudo consultar el restaurante B';
  exception when raise_exception then
    if sqlerrm = 'Admin A pudo consultar el restaurante B' then raise; end if;
  end;
  begin
    perform public.reporte_admin_detallado_restaurante(v.r_a, inicio, fin, 'todas', null, v.prod_other, '', 0, 25);
    raise exception 'Se aceptó un producto perteneciente a otro restaurante';
  exception when raise_exception then
    if sqlerrm = 'Se aceptó un producto perteneciente a otro restaurante' then raise; end if;
  end;
  begin
    perform public.reporte_admin_detallado_restaurante(v.r_a, inicio, fin, null, null, null, '', 0, 25);
    raise exception 'Se aceptó un estado nulo';
  exception when raise_exception then
    if sqlerrm = 'Se aceptó un estado nulo' then raise; end if;
  end;
  if has_function_privilege('anon', 'public.reporte_admin_detallado_restaurante(uuid,timestamp with time zone,timestamp with time zone,text,uuid,uuid,text,integer,integer)', 'execute') then raise exception 'Anon puede ejecutar el reporte'; end if;
  if not has_function_privilege('authenticated', 'public.reporte_admin_detallado_restaurante(uuid,timestamp with time zone,timestamp with time zone,text,uuid,uuid,text,integer,integer)', 'execute') then raise exception 'Authenticated no tiene permiso para ejecutar el reporte'; end if;
  execute format('set local role %I', inicial);
end;
$$;
rollback;
