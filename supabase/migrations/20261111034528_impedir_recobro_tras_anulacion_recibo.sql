-- Anular un recibo revierte la venta, no deshace el vínculo histórico del pedido.
-- Los cambios son expansivos y no reescriben cuentas, pagos ni pedidos existentes.
create or replace function public.pedidos_pendientes_mesa(p_restaurante_id uuid, p_mesa_id uuid)
returns jsonb language plpgsql stable security invoker
set search_path = pg_catalog, public, pg_temp as $$
begin
  perform public.validar_acceso_restaurante(p_restaurante_id);
  if not public.soy_del_restaurante(p_restaurante_id) then
    raise exception 'Sin permiso para consultar este restaurante';
  end if;
  return (
    select coalesce(jsonb_agg(to_jsonb(p) order by p.created_at,p.id),'[]'::jsonb)
    from (
      select p.id,p.mesa_id,p.estado::text as estado,p.created_at
      from public.pedidos p
      where p.restaurante_id=p_restaurante_id and p.mesa_id=p_mesa_id
        and p.estado::text<>'anulado'
        and not exists (
          select 1 from public.cuenta_pedidos cp
          join public.cuentas c on c.id=cp.cuenta_id and c.restaurante_id=p.restaurante_id
          where cp.pedido_id=p.id and c.estado in ('pagada','anulada')
        )
    ) p
  );
end; $$;

create or replace function public.mesas_por_cobrar(p_restaurante_id uuid)
returns jsonb language plpgsql stable security invoker
set search_path = pg_catalog, public, pg_temp as $$
begin
  perform public.validar_acceso_restaurante(p_restaurante_id);
  if not public.soy_del_restaurante(p_restaurante_id) then
    raise exception 'Sin permiso para consultar este restaurante';
  end if;
  return (
    select coalesce(jsonb_agg(to_jsonb(m) order by m.mesa_nombre,m.mesa_id),'[]'::jsonb)
    from (
      select m.id as mesa_id,m.nombre as mesa_nombre,
        round(sum(pi.cantidad*pi.precio_unitario),2) as total,count(distinct p.id) as pedidos
      from public.mesas m
      join public.pedidos p on p.mesa_id=m.id and p.restaurante_id=m.restaurante_id
      join public.pedido_items pi on pi.pedido_id=p.id and coalesce(pi.anulado,false)=false
      where m.restaurante_id=p_restaurante_id and p.estado::text<>'anulado'
        and not exists (
          select 1 from public.cuenta_pedidos cp
          join public.cuentas c on c.id=cp.cuenta_id and c.restaurante_id=p.restaurante_id
          where cp.pedido_id=p.id and c.estado in ('pagada','anulada')
        )
      group by m.id,m.nombre
      having sum(pi.cantidad*pi.precio_unitario)>0.004
    ) m
  );
end; $$;

-- Cierre directo por RPC: un pedido ligado a una cuenta anulada tampoco se cobra.
-- La comprobación toma el bloqueo del pedido antes de que el cierre inserte pagos.
create or replace function public.impedir_recobro_pedido_cuenta()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_restaurante uuid;
begin
  select restaurante_id into v_restaurante from public.pedidos
   where id=new.pedido_id for update;
  if v_restaurante is null or not exists (
    select 1 from public.cuentas c where c.id=new.cuenta_id
      and c.restaurante_id=v_restaurante
  ) then
    raise exception 'El pedido y la cuenta deben pertenecer al mismo restaurante.' using errcode='42501';
  end if;
  if exists (
    select 1 from public.cuenta_pedidos cp
    join public.cuentas c on c.id=cp.cuenta_id and c.restaurante_id=v_restaurante
    where cp.pedido_id=new.pedido_id and c.estado in ('pagada','anulada')
  ) then
    raise exception 'Este pedido ya tiene un recibo emitido o anulado y no puede cobrarse otra vez.' using errcode='23505';
  end if;
  return new;
end; $$;
revoke all on function public.impedir_recobro_pedido_cuenta() from public,anon,authenticated;
drop trigger if exists trg_impedir_recobro_pedido_cuenta on public.cuenta_pedidos;
create trigger trg_impedir_recobro_pedido_cuenta before insert on public.cuenta_pedidos
for each row execute function public.impedir_recobro_pedido_cuenta();

-- Misma autorización y PIN del flujo existente. Una segunda solicitud devuelve
-- la misma cuenta sin actualizarla y sin disparar otra auditoría/reembolso.
create or replace function public.anular_cuenta(
  p_restaurante_id uuid,p_cuenta_id uuid,p_motivo text,p_pin text default null
) returns public.cuentas language plpgsql security definer set search_path=public as $$
declare v_cuenta public.cuentas%rowtype; v_motivo text;
begin
  set local lock_timeout='5s';
  perform public.validar_acceso_restaurante(p_restaurante_id);
  if not exists (
    select 1 from public.usuarios where id=auth.uid()
      and restaurante_id=p_restaurante_id and rol in ('admin_restaurante','cajero')
      and coalesce(activo,true)
  ) then raise exception 'Sin permiso para anular cobros en este restaurante'; end if;
  v_motivo:=nullif(btrim(coalesce(p_motivo,'')),'');
  if v_motivo is null or length(v_motivo)<4 then
    raise exception 'El motivo de la anulación es obligatorio';
  end if;
  if length(v_motivo)>200 then raise exception 'El motivo de la anulación es demasiado largo'; end if;
  perform public.validar_pin_autorizacion(p_restaurante_id,p_pin);
  select * into v_cuenta from public.cuentas
   where id=p_cuenta_id and restaurante_id=p_restaurante_id for update;
  if v_cuenta.id is null then raise exception 'La cuenta no pertenece al restaurante'; end if;
  if v_cuenta.estado='anulada' then return v_cuenta; end if;
  if v_cuenta.estado<>'pagada' then raise exception 'Solo se puede anular una cuenta cobrada'; end if;
  update public.cuentas set estado='anulada',anulada_at=now(),anulada_por=auth.uid(),
    motivo_anulacion=v_motivo,monto_reembolsado=round(v_cuenta.total+coalesce(v_cuenta.propina,0),2)
   where id=v_cuenta.id returning * into v_cuenta;
  return v_cuenta;
end; $$;
revoke all on function public.anular_cuenta(uuid,uuid,text,text) from public,anon;
grant execute on function public.anular_cuenta(uuid,uuid,text,text) to authenticated;

-- Un estado KDS histórico pendiente no puede volver a avanzarse tras cobrar
-- y anular el recibo, aunque se invoque la RPC directamente.
create or replace function public.impedir_reapertura_estacion_cobrada()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.estado is distinct from old.estado and exists (
    select 1 from public.cuenta_pedidos cp
    join public.cuentas c on c.id=cp.cuenta_id and c.restaurante_id=old.restaurante_id
    where cp.pedido_id=old.pedido_id and c.estado in ('pagada','anulada')
  ) then
    raise exception 'La comanda ya tiene un recibo emitido o anulado y no puede volver a preparación.' using errcode='22023';
  end if;
  return new;
end; $$;
revoke all on function public.impedir_reapertura_estacion_cobrada() from public,anon,authenticated;
drop trigger if exists trg_impedir_reapertura_estacion_cobrada on public.estado_comanda_estacion;
create trigger trg_impedir_reapertura_estacion_cobrada
before update of estado on public.estado_comanda_estacion
for each row execute function public.impedir_reapertura_estacion_cobrada();
