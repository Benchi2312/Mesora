-- =============================================================================
-- Estadísticas globales de la plataforma (panel del super admin)
-- =============================================================================
-- POR QUÉ EXISTE ESTE ARCHIVO:
--
-- El panel no puede agregar sumando filas descargadas al navegador: `pedidos` y
-- `cuentas` crecen sin techo en TODOS los restaurantes y el super admin no tiene
-- por qué leerlas una por una. Esta RPC `security definer` calcula el resumen,
-- las comparaciones, el ranking y la evolución con COUNT/SUM/GROUP BY en la base
-- y devuelve un único JSON. Una sola llamada, sin filas crudas.
--
-- Aislamiento: exige `soy_super_admin()` (mismo patrón que
-- usuarios_super_admin.sql / suscripciones_super_admin.sql). Un administrador de
-- restaurante NO pertenece al grupo super_admin y la función lo rechaza: jamás
-- ve totales de otros restaurantes. La RLS de las tablas no se toca.
--
-- Definiciones de las métricas (las mismas que el backend local en
-- src/lib/estadisticas.ts, para que ambos modos midan igual):
--   * venta   = suma de `cuentas.total` con `estado = 'pagada'` (sin contar
--               anuladas), fechada por `pagado_at`;
--   * pedido  = comanda creada en el periodo, sin importar su estado;
--   * activo  = `suscripcion_activa` y vencimiento nulo o futuro (ahora).
-- `restaurantesRegistrados`, `usuarios`, `usuariosActivos` y `administradores`
-- son estado actual (no dependen del periodo); el resto sí. `administradores`
-- cuenta los perfiles con rol de administrador (`admin_restaurante` de cada
-- local, más el `super_admin` de la plataforma).

create or replace function public.admin_estadisticas_globales(
  p_desde timestamptz,
  p_hasta timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_desde timestamptz := coalesce(p_desde, date_trunc('day', now()));
  v_hasta timestamptz := coalesce(p_hasta, now());
  -- Cortes de las comparaciones Hoy / Esta semana (lunes) / Este mes.
  v_hoy timestamptz := date_trunc('day', now());
  v_semana timestamptz := date_trunc('week', now());
  v_mes timestamptz := date_trunc('month', now());
  v_resumen jsonb;
  v_comparaciones jsonb;
  v_ranking jsonb;
  v_evolucion jsonb;
begin
  if not (select public.soy_super_admin()) then
    raise exception 'Solo el super administrador puede ver las estadísticas globales.';
  end if;

  -- 1 · Resumen ---------------------------------------------------------------
  select jsonb_build_object(
    'restaurantesRegistrados', (select count(*) from public.restaurantes),
    'restaurantesActivos', (
      select count(*) from public.restaurantes
       where suscripcion_activa
         and (fecha_vencimiento is null or fecha_vencimiento >= now())
    ),
    'usuarios', (select count(*) from public.usuarios),
    'usuariosActivos', (select count(*) from public.usuarios where activo is true),
    'administradores', (select count(*) from public.usuarios where rol in ('admin_restaurante', 'super_admin')),
    'pedidos', (
      select count(*) from public.pedidos
       where created_at >= v_desde and created_at <= v_hasta
    ),
    'ventas', (
      select coalesce(sum(total), 0) from public.cuentas
       where estado = 'pagada' and pagado_at >= v_desde and pagado_at <= v_hasta
    ),
    'restaurantesNuevos', (
      select count(*) from public.restaurantes
       where created_at >= v_desde and created_at <= v_hasta
    )
  ) into v_resumen;

  -- 2 · Comparaciones hoy / semana / mes -------------------------------------
  select jsonb_build_object(
    'pedidos', jsonb_build_object(
      'hoy', (select count(*) from public.pedidos where created_at >= v_hoy),
      'semana', (select count(*) from public.pedidos where created_at >= v_semana),
      'mes', (select count(*) from public.pedidos where created_at >= v_mes)
    ),
    'ventas', jsonb_build_object(
      'hoy', (select coalesce(sum(total), 0) from public.cuentas where estado = 'pagada' and pagado_at >= v_hoy),
      'semana', (select coalesce(sum(total), 0) from public.cuentas where estado = 'pagada' and pagado_at >= v_semana),
      'mes', (select coalesce(sum(total), 0) from public.cuentas where estado = 'pagada' and pagado_at >= v_mes)
    ),
    'restaurantesNuevos', jsonb_build_object(
      'hoy', (select count(*) from public.restaurantes where created_at >= v_hoy),
      'semana', (select count(*) from public.restaurantes where created_at >= v_semana),
      'mes', (select count(*) from public.restaurantes where created_at >= v_mes)
    )
  ) into v_comparaciones;

  -- 3 · Ranking (solo restaurantes con actividad en el periodo) --------------
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'restauranteId', a.restaurante_id,
        'nombre', a.nombre,
        'pedidos', a.pedidos,
        'ventas', a.ventas
      )
      order by a.ventas desc, a.pedidos desc, a.nombre
    ),
    '[]'::jsonb
  )
  into v_ranking
  from (
    select r.id as restaurante_id,
           r.nombre,
           coalesce(p.pedidos, 0) as pedidos,
           coalesce(v.ventas, 0) as ventas
      from public.restaurantes r
      left join (
        select restaurante_id, count(*) as pedidos
          from public.pedidos
         where created_at >= v_desde and created_at <= v_hasta
         group by restaurante_id
      ) p on p.restaurante_id = r.id
      left join (
        select restaurante_id, sum(total) as ventas
          from public.cuentas
         where estado = 'pagada' and pagado_at >= v_desde and pagado_at <= v_hasta
         group by restaurante_id
      ) v on v.restaurante_id = r.id
  ) a
  where a.pedidos > 0 or a.ventas > 0;

  -- 4 · Evolución diaria del periodo -----------------------------------------
  -- generate_series garantiza los días sin actividad (valor 0), así el gráfico
  -- no salta fechas.
  with dias as (
    select generate_series(v_desde::date, v_hasta::date, interval '1 day')::date as dia
  ),
  r as (
    select created_at::date as dia, count(*) as n
      from public.restaurantes
     where created_at >= v_desde and created_at <= v_hasta
     group by 1
  ),
  p as (
    select created_at::date as dia, count(*) as n
      from public.pedidos
     where created_at >= v_desde and created_at <= v_hasta
     group by 1
  ),
  v as (
    select pagado_at::date as dia, sum(total) as n
      from public.cuentas
     where estado = 'pagada' and pagado_at >= v_desde and pagado_at <= v_hasta
     group by 1
  )
  select jsonb_build_object(
    'restaurantes', (
      select coalesce(jsonb_agg(
               jsonb_build_object('fecha', to_char(d.dia, 'YYYY-MM-DD'), 'valor', coalesce(r.n, 0))
               order by d.dia
             ), '[]'::jsonb)
        from dias d left join r on r.dia = d.dia
    ),
    'pedidos', (
      select coalesce(jsonb_agg(
               jsonb_build_object('fecha', to_char(d.dia, 'YYYY-MM-DD'), 'valor', coalesce(p.n, 0))
               order by d.dia
             ), '[]'::jsonb)
        from dias d left join p on p.dia = d.dia
    ),
    'ventas', (
      select coalesce(jsonb_agg(
               jsonb_build_object('fecha', to_char(d.dia, 'YYYY-MM-DD'), 'valor', coalesce(v.n, 0))
               order by d.dia
             ), '[]'::jsonb)
        from dias d left join v on v.dia = d.dia
    )
  ) into v_evolucion;

  return jsonb_build_object(
    'desde', v_desde,
    'hasta', v_hasta,
    'resumen', v_resumen,
    'comparaciones', v_comparaciones,
    'ranking', v_ranking,
    'evolucion', v_evolucion
  );
end;
$$;

comment on function public.admin_estadisticas_globales(timestamptz, timestamptz) is
  'Super admin: estadísticas globales (resumen, comparaciones hoy/semana/mes, ranking por restaurante y evolución diaria) calculadas con agregados en la base. SECURITY DEFINER con control de rol; nunca devuelve filas crudas.';

revoke execute on function public.admin_estadisticas_globales(timestamptz, timestamptz) from public;
revoke execute on function public.admin_estadisticas_globales(timestamptz, timestamptz) from anon;
grant execute on function public.admin_estadisticas_globales(timestamptz, timestamptz) to authenticated;

-- =============================================================================
-- Verificación (SQL Editor)
-- =============================================================================
-- En el SQL Editor (postgres, sin JWT) `soy_super_admin()` da false y la RPC
-- rechaza: el control de rol se prueba con un JWT real de super admin.
-- Lo que sí se verifica acá es el permiso:

select p.proname,
       has_function_privilege('anon', p.oid, 'execute') as anon_puede,
       has_function_privilege('authenticated', p.oid, 'execute') as authenticated_puede
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname = 'admin_estadisticas_globales';
-- Esperado: anon_puede = false, authenticated_puede = true.
