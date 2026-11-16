-- Reportes detallados de Admin. Usa los mismos importes y fechas que
-- reporte_ventas_restaurante; agrega cortes server-side sin crear tablas.
create or replace function public.reporte_admin_detallado_restaurante(
  p_restaurante_id uuid,
  p_desde timestamptz,
  p_hasta timestamptz,
  p_estado text default 'todas',
  p_mesero_id uuid default null,
  p_producto_id uuid default null,
  p_busqueda text default '',
  p_offset integer default 0,
  p_limite integer default 25
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_base jsonb;
  v_productos jsonb;
  v_categorias jsonb;
  v_meseros jsonb;
  v_estaciones jsonb;
  v_sin_ventas jsonb;
  v_cuentas jsonb;
  v_total bigint;
  v_resultado jsonb;
  v_busqueda text := btrim(coalesce(p_busqueda, ''));
begin
  perform public.validar_acceso_restaurante(p_restaurante_id);
  if not public.soy_del_restaurante(p_restaurante_id)
     or not public.tengo_rol(array['admin_restaurante']) then
    raise exception 'Sin permiso para consultar los reportes del restaurante';
  end if;
  if p_desde is null or p_hasta is null or p_desde >= p_hasta then
    raise exception 'El periodo del reporte no es válido';
  end if;
  if p_estado is null or p_estado not in ('todas', 'pagada', 'anulada') then
    raise exception 'El estado del reporte no es válido';
  end if;
  if length(v_busqueda) > 160 then
    raise exception 'La búsqueda del reporte excede el límite permitido';
  end if;
  if p_mesero_id is not null and not exists (
    select 1 from public.usuarios u
     where u.id = p_mesero_id and u.restaurante_id = p_restaurante_id
  ) then
    raise exception 'El mesero seleccionado no pertenece a este restaurante';
  end if;
  if p_producto_id is not null and not exists (
    select 1 from public.productos pr
     where pr.id = p_producto_id and pr.restaurante_id = p_restaurante_id
  ) then
    raise exception 'El producto seleccionado no pertenece a este restaurante';
  end if;

  -- Conserva exactamente el resumen, métodos de pago y series del Dashboard.
  v_base := public.reporte_ventas_restaurante(
    p_restaurante_id, p_desde, p_hasta, 'todas', '', 0, 1
  ) - 'cuentas' - 'total_cuentas';

  with cuentas_periodo as materialized (
    select c.id, c.restaurante_id, c.estado::text as estado, c.total,
           c.propina, c.vuelto, c.metodo_pago::text as metodo_pago,
           c.pagado_at, c.anulada_at, c.motivo_anulacion,
           c.monto_reembolsado, c.created_at,
           coalesce(c.anulada_at, c.pagado_at, c.created_at) as fecha_operacion
      from public.cuentas c
     where c.restaurante_id = p_restaurante_id
       and c.estado::text in ('pagada', 'anulada')
       and coalesce(c.anulada_at, c.pagado_at, c.created_at) >= p_desde
       and coalesce(c.anulada_at, c.pagado_at, c.created_at) < p_hasta
  ), detalle as materialized (
    select c.id as cuenta_id, c.estado, cp.pedido_id,
           p.created_at as pedido_fecha, p.mesero_id,
           coalesce(u.nombre, 'Sin mesero') as mesero_nombre,
           m.id as mesa_id, coalesce(m.nombre, 'Sin mesa') as mesa_nombre,
           pi.id as item_id, pi.producto_id, pi.nombre_producto,
           pi.cantidad, pi.precio_unitario, coalesce(pi.anulado, false) as item_anulado,
           coalesce(pi.es_bebida, false) as es_bebida, pi.estacion,
           pi.nota, pr.categoria_id, coalesce(cat.nombre, 'Sin categoría') as categoria_nombre
      from cuentas_periodo c
      join public.cuenta_pedidos cp on cp.cuenta_id = c.id
      join public.pedidos p on p.id = cp.pedido_id and p.restaurante_id = p_restaurante_id
      left join public.usuarios u on u.id = p.mesero_id and u.restaurante_id = p_restaurante_id
      left join public.mesas m on m.id = p.mesa_id and m.restaurante_id = p_restaurante_id
      left join public.pedido_items pi on pi.pedido_id = p.id
      left join public.productos pr on pr.id = pi.producto_id and pr.restaurante_id = p_restaurante_id
      left join public.categorias_productos cat
        on cat.id = pr.categoria_id and cat.restaurante_id = p_restaurante_id
  ), ventas_validas as materialized (
    select d.*
      from detalle d
     where d.estado = 'pagada' and d.item_id is not null and not d.item_anulado
       and (p_mesero_id is null or d.mesero_id = p_mesero_id)
       and (p_producto_id is null or d.producto_id = p_producto_id)
  )
  select coalesce(jsonb_agg(to_jsonb(x) order by x.total desc, x.cantidad desc, x.nombre), '[]'::jsonb)
    into v_productos
    from (
      select producto_id as id, nombre_producto as nombre, categoria_id,
             categoria_nombre as categoria, es_bebida,
             sum(cantidad)::integer as cantidad,
             round(sum(cantidad * precio_unitario), 2) as total
        from ventas_validas
       group by producto_id, nombre_producto, categoria_id, categoria_nombre, es_bebida
    ) x;

  with cuentas_periodo as materialized (
    select c.id, c.restaurante_id, c.estado::text as estado, c.pagado_at,
           c.anulada_at, c.created_at
      from public.cuentas c
     where c.restaurante_id = p_restaurante_id
       and c.estado::text in ('pagada', 'anulada')
       and coalesce(c.anulada_at, c.pagado_at, c.created_at) >= p_desde
       and coalesce(c.anulada_at, c.pagado_at, c.created_at) < p_hasta
  ), detalle as materialized (
     select c.id as cuenta_id, c.estado, p.mesero_id, pi.producto_id, pi.nombre_producto,
           pi.cantidad, pi.precio_unitario, coalesce(pi.anulado, false) as item_anulado,
           pr.categoria_id, coalesce(cat.nombre, 'Sin categoría') as categoria_nombre
      from cuentas_periodo c
      join public.cuenta_pedidos cp on cp.cuenta_id = c.id
      join public.pedidos p on p.id = cp.pedido_id and p.restaurante_id = p_restaurante_id
      join public.pedido_items pi on pi.pedido_id = p.id
      left join public.productos pr on pr.id = pi.producto_id and pr.restaurante_id = p_restaurante_id
      left join public.categorias_productos cat
        on cat.id = pr.categoria_id and cat.restaurante_id = p_restaurante_id
  )
  select coalesce(jsonb_agg(to_jsonb(x) order by x.total desc, x.cantidad desc, x.categoria), '[]'::jsonb)
    into v_categorias
    from (
      select categoria_id as id, categoria_nombre as categoria,
             sum(cantidad)::integer as cantidad,
             round(sum(cantidad * precio_unitario), 2) as total
        from detalle
        where estado = 'pagada' and not item_anulado
          and (p_mesero_id is null or mesero_id = p_mesero_id)
          and (p_producto_id is null or producto_id = p_producto_id)
       group by categoria_id, categoria_nombre
    ) x;

  with cuentas_periodo as materialized (
    select c.id, c.restaurante_id, c.estado::text as estado, c.propina,
           c.pagado_at, c.anulada_at, c.created_at
      from public.cuentas c
     where c.restaurante_id = p_restaurante_id
       and c.estado::text in ('pagada', 'anulada')
       and coalesce(c.anulada_at, c.pagado_at, c.created_at) >= p_desde
       and coalesce(c.anulada_at, c.pagado_at, c.created_at) < p_hasta
  ), detalle as materialized (
    select c.id as cuenta_id, c.estado, c.propina, p.id as pedido_id,
           p.mesero_id, coalesce(u.nombre, 'Sin mesero') as mesero_nombre,
           pi.id as item_id, pi.producto_id, pi.cantidad, pi.precio_unitario,
           coalesce(pi.anulado, false) as item_anulado
      from cuentas_periodo c
      join public.cuenta_pedidos cp on cp.cuenta_id = c.id
      join public.pedidos p on p.id = cp.pedido_id and p.restaurante_id = p_restaurante_id
      left join public.usuarios u on u.id = p.mesero_id and u.restaurante_id = p_restaurante_id
      join public.pedido_items pi on pi.pedido_id = p.id
  ), ventas_mesero_cuenta as (
    select cuenta_id, mesero_id, mesero_nombre,
           count(distinct pedido_id)::integer as comandas,
           sum(cantidad)::integer as unidades,
           round(sum(cantidad * precio_unitario), 2) as ventas,
           max(propina) as propina_cuenta
      from detalle
      where estado = 'pagada' and not item_anulado
        and (p_mesero_id is null or mesero_id = p_mesero_id)
        and (p_producto_id is null or producto_id = p_producto_id)
     group by cuenta_id, mesero_id, mesero_nombre
  ), propinas_prorrateadas as (
    select v.*,
           case when sum(v.ventas) over (partition by v.cuenta_id) > 0
             then v.propina_cuenta * v.ventas / sum(v.ventas) over (partition by v.cuenta_id)
             else 0 end as propina_atribuida
      from ventas_mesero_cuenta v
  )
  select coalesce(jsonb_agg(to_jsonb(x) order by x.ventas desc, x.comandas desc, x.nombre), '[]'::jsonb)
    into v_meseros
    from (
      select mesero_id as id, mesero_nombre as nombre,
             count(*)::integer as cuentas,
             sum(comandas)::integer as comandas,
             sum(unidades)::integer as unidades,
             round(sum(ventas), 2) as ventas,
             case when count(*) > 0 then round(sum(ventas) / count(*), 2) else 0 end as ticket_promedio,
             round(sum(propina_atribuida), 2) as propinas
        from propinas_prorrateadas
       group by mesero_id, mesero_nombre
    ) x;

  with cuentas_periodo as materialized (
    select c.id, c.restaurante_id, c.estado::text as estado,
           c.pagado_at, c.anulada_at, c.created_at
      from public.cuentas c
     where c.restaurante_id = p_restaurante_id
       and c.estado::text in ('pagada', 'anulada')
       and coalesce(c.anulada_at, c.pagado_at, c.created_at) >= p_desde
       and coalesce(c.anulada_at, c.pagado_at, c.created_at) < p_hasta
  ), ventas_validas as (
     select c.id as cuenta_id, p.id as pedido_id, p.mesero_id, pi.id as item_id, pi.producto_id,
           pi.cantidad, pi.precio_unitario,
           case when pi.estacion in ('cocina', 'bar', 'otros') then pi.estacion else 'sin_clasificar' end as estacion
      from cuentas_periodo c
      join public.cuenta_pedidos cp on cp.cuenta_id = c.id
      join public.pedidos p on p.id = cp.pedido_id and p.restaurante_id = p_restaurante_id
      join public.pedido_items pi on pi.pedido_id = p.id
      where c.estado = 'pagada' and not coalesce(pi.anulado, false)
        and (p_mesero_id is null or p.mesero_id = p_mesero_id)
        and (p_producto_id is null or pi.producto_id = p_producto_id)
  )
  select coalesce(jsonb_agg(to_jsonb(x) order by x.orden, x.estacion), '[]'::jsonb)
    into v_estaciones
    from (
      select estacion, count(distinct pedido_id)::integer as comandas,
             sum(cantidad)::integer as unidades,
             round(sum(cantidad * precio_unitario), 2) as ventas,
             case estacion when 'cocina' then 1 when 'bar' then 2 when 'otros' then 3 else 4 end as orden
        from ventas_validas
       group by estacion
    ) x;

  with cuentas_periodo as materialized (
    select c.id, c.restaurante_id, c.estado::text as estado,
           c.pagado_at, c.anulada_at, c.created_at
      from public.cuentas c
     where c.restaurante_id = p_restaurante_id
       and c.estado::text in ('pagada', 'anulada')
       and coalesce(c.anulada_at, c.pagado_at, c.created_at) >= p_desde
       and coalesce(c.anulada_at, c.pagado_at, c.created_at) < p_hasta
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', pr.id, 'nombre', pr.nombre, 'categoria_id', pr.categoria_id,
            'categoria', coalesce(cat.nombre, 'Sin categoría'), 'precio_actual', pr.precio,
            'disponible', pr.disponible
         ) order by pr.nombre), '[]'::jsonb)
    into v_sin_ventas
    from public.productos pr
    left join public.categorias_productos cat
      on cat.id = pr.categoria_id and cat.restaurante_id = p_restaurante_id
   where pr.restaurante_id = p_restaurante_id
     and not exists (
       select 1
         from cuentas_periodo c
         join public.cuenta_pedidos cp on cp.cuenta_id = c.id
         join public.pedidos p on p.id = cp.pedido_id and p.restaurante_id = p_restaurante_id
         join public.pedido_items pi on pi.pedido_id = p.id
        where c.estado = 'pagada' and pi.producto_id = pr.id
          and not coalesce(pi.anulado, false)
     );

  with cuentas_periodo as materialized (
    select c.*,
           coalesce(c.anulada_at, c.pagado_at, c.created_at) as fecha_operacion
      from public.cuentas c
     where c.restaurante_id = p_restaurante_id
       and c.estado::text in ('pagada', 'anulada')
       and coalesce(c.anulada_at, c.pagado_at, c.created_at) >= p_desde
       and coalesce(c.anulada_at, c.pagado_at, c.created_at) < p_hasta
  ), filtradas as materialized (
    select c.*
      from cuentas_periodo c
     where (p_estado = 'todas' or c.estado::text = p_estado)
       and (p_mesero_id is null or exists (
         select 1 from public.cuenta_pedidos cp
         join public.pedidos p on p.id = cp.pedido_id and p.restaurante_id = p_restaurante_id
         where cp.cuenta_id = c.id and p.mesero_id = p_mesero_id
       ))
       and (p_producto_id is null or exists (
         select 1 from public.cuenta_pedidos cp
         join public.pedidos p on p.id = cp.pedido_id and p.restaurante_id = p_restaurante_id
         join public.pedido_items pi on pi.pedido_id = p.id
         where cp.cuenta_id = c.id and pi.producto_id = p_producto_id
       ))
       and (v_busqueda = '' or c.numero ilike '%' || v_busqueda || '%' or exists (
         select 1 from public.cuenta_pedidos cp
         join public.pedidos p on p.id = cp.pedido_id and p.restaurante_id = p_restaurante_id
         left join public.mesas m on m.id = p.mesa_id and m.restaurante_id = p_restaurante_id
         left join public.usuarios u on u.id = p.mesero_id and u.restaurante_id = p_restaurante_id
         left join public.pedido_items pi on pi.pedido_id = p.id
         where cp.cuenta_id = c.id
           and concat_ws(' ', m.nombre, u.nombre, pi.nombre_producto) ilike '%' || v_busqueda || '%'
       ))
  )
  select count(*) into v_total from filtradas;

  with cuentas_periodo as materialized (
    select c.*,
           coalesce(c.anulada_at, c.pagado_at, c.created_at) as fecha_operacion
      from public.cuentas c
     where c.restaurante_id = p_restaurante_id
       and c.estado::text in ('pagada', 'anulada')
       and coalesce(c.anulada_at, c.pagado_at, c.created_at) >= p_desde
       and coalesce(c.anulada_at, c.pagado_at, c.created_at) < p_hasta
  ), filtradas as materialized (
    select c.*
      from cuentas_periodo c
     where (p_estado = 'todas' or c.estado::text = p_estado)
       and (p_mesero_id is null or exists (
         select 1 from public.cuenta_pedidos cp
         join public.pedidos p on p.id = cp.pedido_id and p.restaurante_id = p_restaurante_id
         where cp.cuenta_id = c.id and p.mesero_id = p_mesero_id
       ))
       and (p_producto_id is null or exists (
         select 1 from public.cuenta_pedidos cp
         join public.pedidos p on p.id = cp.pedido_id and p.restaurante_id = p_restaurante_id
         join public.pedido_items pi on pi.pedido_id = p.id
         where cp.cuenta_id = c.id and pi.producto_id = p_producto_id
       ))
       and (v_busqueda = '' or c.numero ilike '%' || v_busqueda || '%' or exists (
         select 1 from public.cuenta_pedidos cp
         join public.pedidos p on p.id = cp.pedido_id and p.restaurante_id = p_restaurante_id
         left join public.mesas m on m.id = p.mesa_id and m.restaurante_id = p_restaurante_id
         left join public.usuarios u on u.id = p.mesero_id and u.restaurante_id = p_restaurante_id
         left join public.pedido_items pi on pi.pedido_id = p.id
         where cp.cuenta_id = c.id
           and concat_ws(' ', m.nombre, u.nombre, pi.nombre_producto) ilike '%' || v_busqueda || '%'
       ))
  ), pagina as materialized (
    select * from filtradas
     order by fecha_operacion desc, id desc
     offset greatest(coalesce(p_offset, 0), 0)
     limit least(greatest(coalesce(p_limite, 25), 1), 100)
  )
  select coalesce(jsonb_agg(to_jsonb(x) order by x.fecha_operacion desc, x.id desc), '[]'::jsonb)
    into v_cuentas
    from (
      select c.id, c.numero, c.estado::text as estado, c.total, c.propina, c.vuelto,
             c.metodo_pago::text as metodo_pago, c.pagado_at, c.anulada_at,
             c.motivo_anulacion, c.monto_reembolsado, c.created_at,
             c.fecha_operacion,
             coalesce((select string_agg(distinct m.nombre, ', ' order by m.nombre)
                 from public.cuenta_pedidos cp join public.pedidos p on p.id = cp.pedido_id and p.restaurante_id = p_restaurante_id
                 join public.mesas m on m.id = p.mesa_id and m.restaurante_id = p_restaurante_id
                where cp.cuenta_id = c.id), 'Sin mesa') as mesas,
             coalesce((select string_agg(distinct u.nombre, ', ' order by u.nombre)
                 from public.cuenta_pedidos cp join public.pedidos p on p.id = cp.pedido_id and p.restaurante_id = p_restaurante_id
                 join public.usuarios u on u.id = p.mesero_id and u.restaurante_id = p_restaurante_id
                where cp.cuenta_id = c.id), '—') as meseros,
             coalesce((select jsonb_agg(jsonb_build_object('metodo_pago', pg.metodo_pago::text, 'monto', pg.monto)
                         order by pg.created_at, pg.id)
                 from public.cuenta_pagos pg
                where pg.cuenta_id = c.id and pg.restaurante_id = p_restaurante_id), '[]'::jsonb) as pagos,
             coalesce((select sum(pi.cantidad)::integer
                 from public.cuenta_pedidos cp join public.pedidos p on p.id = cp.pedido_id and p.restaurante_id = p_restaurante_id
                 join public.pedido_items pi on pi.pedido_id = p.id
                where cp.cuenta_id = c.id
                  and (p_mesero_id is null or p.mesero_id = p_mesero_id)
                  and (p_producto_id is null or pi.producto_id = p_producto_id)
                  and not coalesce(pi.anulado, false)), 0) as cantidad_productos,
             coalesce((select jsonb_agg(jsonb_build_object(
                 'pedido_id', q.pedido_id, 'created_at', q.created_at,
                 'mesa', q.mesa, 'zona', q.zona, 'mesero_id', q.mesero_id, 'mesero', q.mesero,
                 'items', q.items
               ) order by q.created_at, q.pedido_id)
                 from (
                   select p.id as pedido_id, p.created_at, m.nombre as mesa, z.nombre as zona,
                          p.mesero_id, u.nombre as mesero,
                          coalesce((select jsonb_agg(jsonb_build_object(
                              'id', pi.id, 'producto_id', pi.producto_id,
                              'nombre', pi.nombre_producto, 'cantidad', pi.cantidad,
                              'precio_unitario', pi.precio_unitario,
                              'total', round(pi.cantidad * pi.precio_unitario, 2),
                              'categoria_id', pr.categoria_id,
                              'categoria', coalesce(cat.nombre, 'Sin categoría'),
                              'es_bebida', coalesce(pi.es_bebida, false), 'estacion', pi.estacion,
                              'anulado', coalesce(pi.anulado, false), 'nota', pi.nota
                            ) order by pi.created_at, pi.id)
                            from public.pedido_items pi
                            left join public.productos pr on pr.id = pi.producto_id and pr.restaurante_id = p_restaurante_id
                            left join public.categorias_productos cat on cat.id = pr.categoria_id and cat.restaurante_id = p_restaurante_id
                           where pi.pedido_id = p.id and (p_producto_id is null or pi.producto_id = p_producto_id)), '[]'::jsonb) as items
                     from public.cuenta_pedidos cp
                     join public.pedidos p on p.id = cp.pedido_id and p.restaurante_id = p_restaurante_id
                     left join public.mesas m on m.id = p.mesa_id and m.restaurante_id = p_restaurante_id
                     left join public.zonas z on z.id = m.zona_id and z.restaurante_id = p_restaurante_id
                     left join public.usuarios u on u.id = p.mesero_id and u.restaurante_id = p_restaurante_id
                    where cp.cuenta_id = c.id and (p_mesero_id is null or p.mesero_id = p_mesero_id)
                      and (p_producto_id is null or exists (
                        select 1 from public.pedido_items pi2 where pi2.pedido_id = p.id and pi2.producto_id = p_producto_id
                      ))
                 ) q), '[]'::jsonb) as pedidos
        from pagina c
    ) x;

  v_resultado := v_base || jsonb_build_object(
    'productos', coalesce(v_productos, '[]'::jsonb),
    'categorias', coalesce(v_categorias, '[]'::jsonb),
    'meseros', coalesce(v_meseros, '[]'::jsonb),
    'comandas_por_estacion', coalesce(v_estaciones, '[]'::jsonb),
    'productos_sin_ventas', coalesce(v_sin_ventas, '[]'::jsonb),
    'cuentas', coalesce(v_cuentas, '[]'::jsonb),
    'total_cuentas', coalesce(v_total, 0)
  );
  return v_resultado;
end;
$$;

comment on function public.reporte_admin_detallado_restaurante(uuid, timestamptz, timestamptz, text, uuid, uuid, text, integer, integer) is
  'Reportes administrativos por restaurante. Reutiliza la semántica de reporte_ventas_restaurante y añade detalle paginado, productos, categorías actuales, meseros, estaciones y filtros. Las fechas/series están en America/Lima.';

revoke all on function public.reporte_admin_detallado_restaurante(uuid, timestamptz, timestamptz, text, uuid, uuid, text, integer, integer) from public, anon;
grant execute on function public.reporte_admin_detallado_restaurante(uuid, timestamptz, timestamptz, text, uuid, uuid, text, integer, integer) to authenticated;
notify pgrst, 'reload schema';
