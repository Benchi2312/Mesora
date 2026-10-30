-- Consultas acotadas a lo pendiente. JSON evita truncar el agregado por el
-- límite de filas de PostgREST. SECURITY INVOKER mantiene RLS por restaurante.
create or replace function public.pedidos_pendientes_mesa(p_restaurante_id uuid, p_mesa_id uuid)
returns jsonb language plpgsql stable security invoker
set search_path = pg_catalog, public, pg_temp
as $$
begin
  perform public.validar_acceso_restaurante(p_restaurante_id);
  if not public.soy_del_restaurante(p_restaurante_id) then
    raise exception 'Sin permiso para consultar este restaurante';
  end if;
  return (
    select coalesce(jsonb_agg(to_jsonb(p) order by p.created_at, p.id), '[]'::jsonb)
    from (
      select p.id, p.mesa_id, p.estado::text as estado, p.created_at
      from public.pedidos p
      where p.restaurante_id = p_restaurante_id and p.mesa_id = p_mesa_id
        and p.estado::text <> 'anulado'
        and not exists (
          select 1 from public.cuenta_pedidos cp
          join public.cuentas c on c.id = cp.cuenta_id
          where cp.pedido_id = p.id and c.estado::text = 'pagada'
        )
    ) p
  );
end;
$$;

create or replace function public.mesas_por_cobrar(p_restaurante_id uuid)
returns jsonb language plpgsql stable security invoker
set search_path = pg_catalog, public, pg_temp
as $$
begin
  perform public.validar_acceso_restaurante(p_restaurante_id);
  if not public.soy_del_restaurante(p_restaurante_id) then
    raise exception 'Sin permiso para consultar este restaurante';
  end if;
  return (
    select coalesce(jsonb_agg(to_jsonb(m) order by m.mesa_nombre, m.mesa_id), '[]'::jsonb)
    from (
      select m.id as mesa_id, m.nombre as mesa_nombre,
        round(sum(pi.cantidad * pi.precio_unitario), 2) as total,
        count(distinct p.id) as pedidos
      from public.mesas m
      join public.pedidos p on p.mesa_id = m.id and p.restaurante_id = m.restaurante_id
      join public.pedido_items pi on pi.pedido_id = p.id and coalesce(pi.anulado, false) = false
      where m.restaurante_id = p_restaurante_id and p.estado::text <> 'anulado'
        and not exists (
          select 1 from public.cuenta_pedidos cp
          join public.cuentas c on c.id = cp.cuenta_id
          where cp.pedido_id = p.id and c.estado::text = 'pagada'
        )
      group by m.id, m.nombre
      having sum(pi.cantidad * pi.precio_unitario) > 0.004
    ) m
  );
end;
$$;
revoke all on function public.pedidos_pendientes_mesa(uuid, uuid) from public, anon;
revoke all on function public.mesas_por_cobrar(uuid) from public, anon;
grant execute on function public.pedidos_pendientes_mesa(uuid, uuid) to authenticated;
grant execute on function public.mesas_por_cobrar(uuid) to authenticated;

-- Índices de FK de una columna que aún no cuentan con cobertura por prefijo.
-- No se eliminan índices: se preservan los existentes y se omiten extensiones.
do $$
declare f record;
begin
  for f in
    select c.conrelid, t.relname, a.attname, c.conkey[1] as attnum
    from pg_catalog.pg_constraint c
    join pg_catalog.pg_class t on t.oid = c.conrelid
    join pg_catalog.pg_namespace n on n.oid = t.relnamespace
    join pg_catalog.pg_attribute a on a.attrelid = t.oid and a.attnum = c.conkey[1]
    where n.nspname = 'public' and c.contype = 'f' and cardinality(c.conkey) = 1
      and not exists (
        select 1 from pg_catalog.pg_index i
        where i.indrelid = c.conrelid and i.indisvalid and i.indpred is null
          and i.indkey[0] = c.conkey[1]
      )
  loop
    execute format('create index if not exists %I on public.%I (%I)',
      left('idx_' || f.relname || '_' || f.attname || '_fk', 63), f.relname, f.attname);
  end loop;
end;
$$;
