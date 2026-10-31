-- Conserva la clasificación de cocina/barra al momento de vender y entrega
-- agregados + detalle paginado en una sola respuesta, sin límite de filas REST.
alter table public.pedido_items
  add column if not exists es_bebida boolean not null default false;

update public.pedido_items pi
   set es_bebida = coalesce(pr.es_bebida, false)
  from public.productos pr
 where pi.producto_id = pr.id
   and pi.es_bebida is distinct from coalesce(pr.es_bebida, false);

create or replace function public.reporte_ventas_restaurante(
  p_restaurante_id uuid,
  p_desde timestamptz,
  p_hasta timestamptz,
  p_estado text default 'todas',
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
  v_resultado jsonb;
begin
  perform public.validar_acceso_restaurante(p_restaurante_id);
  if not public.soy_del_restaurante(p_restaurante_id)
     or not public.tengo_rol(array['admin_restaurante']) then
    raise exception 'Sin permiso para consultar el reporte de ventas';
  end if;
  if p_desde is null or p_hasta is null or p_desde >= p_hasta then
    raise exception 'El periodo del reporte no es válido';
  end if;
  if p_estado not in ('todas', 'pagada', 'anulada') then
    raise exception 'El estado del reporte no es válido';
  end if;

  with cuentas_periodo as materialized (
    select c.*
      from public.cuentas c
     where c.restaurante_id = p_restaurante_id
       and c.estado::text in ('pagada', 'anulada')
       and coalesce(c.anulada_at, c.pagado_at, c.created_at) >= p_desde
       and coalesce(c.anulada_at, c.pagado_at, c.created_at) < p_hasta
  ),
  detalle as (
    select c.id as cuenta_id, cp.pedido_id, p.created_at as pedido_fecha,
           p.mesero_id, u.nombre as mesero_nombre, m.id as mesa_id, m.nombre as mesa_nombre,
           pi.id as item_id, pi.nombre_producto, pi.cantidad, pi.precio_unitario,
           coalesce(pi.es_bebida, false) as es_bebida,
           coalesce(pi.anulado, false) as item_anulado, pi.nota
      from cuentas_periodo c
      join public.cuenta_pedidos cp on cp.cuenta_id = c.id
      join public.pedidos p on p.id = cp.pedido_id and p.restaurante_id = p_restaurante_id
      join public.mesas m on m.id = p.mesa_id
      join public.usuarios u on u.id = p.mesero_id
      left join public.pedido_items pi on pi.pedido_id = p.id
  ),
  ventas_validas as (
    select d.* from detalle d join cuentas_periodo c on c.id = d.cuenta_id
     where c.estado::text = 'pagada' and d.item_id is not null and not d.item_anulado
  ),
  filtro_cuentas as (
    select c.id, c.numero, c.estado::text as estado, c.total, c.propina, c.vuelto,
           c.metodo_pago::text as metodo_pago, c.pagado_at, c.anulada_at,
           c.motivo_anulacion, c.monto_reembolsado, c.created_at,
           coalesce((select string_agg(distinct d.mesa_nombre, ', ' order by d.mesa_nombre)
                       from detalle d where d.cuenta_id = c.id), 'Sin mesa') as mesas,
           coalesce((select string_agg(distinct d.mesero_nombre, ', ' order by d.mesero_nombre)
                       from detalle d where d.cuenta_id = c.id), '—') as meseros
      from cuentas_periodo c
     where p_estado = 'todas' or c.estado::text = p_estado
  ),
  coincidencias as (
    select f.* from filtro_cuentas f
     where coalesce(p_busqueda, '') = ''
        or concat_ws(' ', f.numero, f.mesas, f.meseros,
             (select string_agg(d.nombre_producto, ' ') from detalle d where d.cuenta_id = f.id))
           ilike '%' || p_busqueda || '%'
  ),
  cuentas_json as (
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'id', f.id, 'numero', f.numero, 'estado', f.estado, 'total', f.total,
        'propina', f.propina, 'vuelto', f.vuelto, 'metodo_pago', f.metodo_pago,
        'pagado_at', f.pagado_at, 'anulada_at', f.anulada_at,
        'motivo_anulacion', f.motivo_anulacion, 'monto_reembolsado', f.monto_reembolsado,
        'created_at', f.created_at, 'mesas', f.mesas, 'meseros', f.meseros,
        'pagos', coalesce((select jsonb_agg(jsonb_build_object(
          'metodo_pago', pg.metodo_pago::text, 'monto', pg.monto) order by pg.created_at)
          from public.cuenta_pagos pg where pg.cuenta_id = f.id), '[]'::jsonb),
        'pedidos', coalesce((select jsonb_agg(jsonb_build_object(
          'pedido_id', d.pedido_id, 'created_at', d.pedido_fecha,
          'mesa', d.mesa_nombre, 'mesero', d.mesero_nombre,
          'items', (select coalesce(jsonb_agg(jsonb_build_object(
            'nombre', di.nombre_producto, 'cantidad', di.cantidad,
            'precio_unitario', di.precio_unitario,
            'total', round(di.cantidad * di.precio_unitario, 2),
            'es_bebida', di.es_bebida, 'anulado', di.item_anulado, 'nota', di.nota)
            order by di.nombre_producto), '[]'::jsonb)
            from detalle di where di.cuenta_id = f.id and di.pedido_id = d.pedido_id
              and di.item_id is not null)
        ) order by d.pedido_fecha, d.pedido_id)
          from (select distinct pedido_id, pedido_fecha, mesa_nombre, mesero_nombre
                  from detalle where cuenta_id = f.id) d), '[]'::jsonb)
      ) order by coalesce(f.pagado_at, f.anulada_at, f.created_at) desc, f.id desc
    ), '[]'::jsonb) as filas
      from (select * from coincidencias order by coalesce(pagado_at, anulada_at, created_at) desc, id desc
            offset greatest(p_offset, 0) limit least(greatest(p_limite, 1), 50)) f
  )
  select jsonb_build_object(
    'resumen', jsonb_build_object(
      'ventas', coalesce((select round(sum(total), 2) from cuentas_periodo where estado::text = 'pagada'), 0),
      'cuentas_pagadas', (select count(*) from cuentas_periodo where estado::text = 'pagada'),
      'cuentas_anuladas', (select count(*) from cuentas_periodo where estado::text = 'anulada'),
      'reembolsos', coalesce((select round(sum(monto_reembolsado), 2) from cuentas_periodo where estado::text = 'anulada'), 0),
      'propinas', coalesce((select round(sum(propina), 2) from cuentas_periodo where estado::text = 'pagada'), 0),
      'ticket_promedio', coalesce((select round(avg(total), 2) from cuentas_periodo where estado::text = 'pagada'), 0)
    ),
    'productos', coalesce((select jsonb_agg(to_jsonb(x) order by x.total desc)
      from (select nombre_producto as nombre, es_bebida, sum(cantidad)::integer as cantidad,
                   round(sum(cantidad * precio_unitario), 2) as total
              from ventas_validas group by nombre_producto, es_bebida) x), '[]'::jsonb),
    'meseros', coalesce((select jsonb_agg(to_jsonb(x) order by x.ventas desc)
      from (select mesero_id as id, mesero_nombre as nombre,
                   count(distinct pedido_id)::integer as pedidos,
                   sum(cantidad)::integer as unidades,
                   round(sum(cantidad * precio_unitario), 2) as ventas
              from ventas_validas group by mesero_id, mesero_nombre) x), '[]'::jsonb),
    'mesas', coalesce((select jsonb_agg(to_jsonb(x) order by x.ventas desc)
      from (select mesa_id as id, mesa_nombre as nombre,
                   count(distinct cuenta_id)::integer as cuentas,
                   round(sum(cantidad * precio_unitario), 2) as ventas
              from ventas_validas group by mesa_id, mesa_nombre) x), '[]'::jsonb),
    'cuentas', (select filas from cuentas_json),
    'total_cuentas', (select count(*) from coincidencias)
  ) into v_resultado;

  return v_resultado;
end;
$$;

comment on function public.reporte_ventas_restaurante(uuid, timestamptz, timestamptz, text, text, integer, integer) is
  'Reporte interno detallado y aislado por restaurante; resume cuentas cobradas/anuladas, artículos, bebidas, mesas y meseros. No reemplaza comprobantes electrónicos.';
revoke all on function public.reporte_ventas_restaurante(uuid, timestamptz, timestamptz, text, text, integer, integer) from public, anon;
grant execute on function public.reporte_ventas_restaurante(uuid, timestamptz, timestamptz, text, text, integer, integer) to authenticated;
