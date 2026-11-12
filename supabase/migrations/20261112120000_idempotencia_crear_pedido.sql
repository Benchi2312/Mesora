-- Una clave identifica una comanda concreta. Los pedidos históricos conservan NULL.
begin;

alter table public.pedidos
  add column if not exists solicitud_id uuid,
  add column if not exists solicitud_items jsonb;

alter table public.pedidos
  add constraint pedidos_solicitud_completa_check
  check ((solicitud_id is null and solicitud_items is null) or
         (solicitud_id is not null and solicitud_items is not null and jsonb_typeof(solicitud_items) = 'array'));

create unique index if not exists pedidos_solicitud_id_unique
  on public.pedidos (solicitud_id) where solicitud_id is not null;

-- Preserva íntegra la implementación de enrutamiento de Fase 5. La nueva RPC
-- serializa la clave antes de llamarla; ambos pasos comparten transacción.
do $$
begin
  if to_regprocedure('public.crear_pedido_base(uuid,uuid,jsonb)') is null then
    alter function public.crear_pedido(uuid,uuid,jsonb) rename to crear_pedido_base;
  end if;
end;
$$;

revoke all on function public.crear_pedido_base(uuid,uuid,jsonb) from public, anon, authenticated;

create or replace function public.crear_pedido(
  p_restaurante_id uuid, p_mesa_id uuid, p_items jsonb, p_solicitud_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_existente public.pedidos%rowtype;
  v_pedido_id uuid;
begin
  if p_solicitud_id is null then
    raise exception 'La comanda requiere una clave de solicitud' using errcode = '22023';
  end if;
  perform public.validar_acceso_restaurante(p_restaurante_id);
  select u.id into v_actor from public.usuarios u
   where u.id = auth.uid() and u.restaurante_id = p_restaurante_id
     and coalesce(u.activo, true) and u.rol::text in ('mesero', 'admin_restaurante');
  if v_actor is null then
    raise exception 'Sin permiso para crear pedidos en este restaurante' using errcode = '42501';
  end if;
  if p_items is null or jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'El pedido no tiene ítems' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) = 0 then
    raise exception 'El pedido no tiene ítems' using errcode = '22023';
  end if;

  -- El índice único es la garantía final; el lock también permite devolver el
  -- resultado original a solicitudes simultáneas sin dejar un 23505 al cliente.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_solicitud_id::text, 0));
  select * into v_existente from public.pedidos
   where solicitud_id = p_solicitud_id for update;
  if found then
    if v_existente.restaurante_id <> p_restaurante_id or
       v_existente.mesero_id <> v_actor or
       v_existente.mesa_id <> p_mesa_id or
       v_existente.solicitud_items is distinct from p_items then
      -- Mensaje idéntico para otra cuenta o restaurante: no filtra existencia.
      raise exception 'La solicitud cambió y no coincide con la comanda original.' using errcode = '22023';
    end if;
    return v_existente.id;
  end if;

  v_pedido_id := public.crear_pedido_base(p_restaurante_id, p_mesa_id, p_items);
  update public.pedidos
     set solicitud_id = p_solicitud_id, solicitud_items = p_items
   where id = v_pedido_id and restaurante_id = p_restaurante_id;
  if not found then
    raise exception 'No se pudo identificar la comanda registrada' using errcode = 'XX000';
  end if;
  return v_pedido_id;
end;
$$;

-- Compatibilidad temporal con clientes abiertos antes del despliegue. Cada
-- llamada vieja recibe su propia clave; solo el nuevo cliente reintenta seguro.
create or replace function public.crear_pedido(
  p_restaurante_id uuid, p_mesa_id uuid, p_items jsonb
)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select public.crear_pedido(p_restaurante_id, p_mesa_id, p_items, gen_random_uuid());
$$;

revoke all on function public.crear_pedido(uuid,uuid,jsonb,uuid) from public, anon;
revoke all on function public.crear_pedido(uuid,uuid,jsonb) from public, anon;
grant execute on function public.crear_pedido(uuid,uuid,jsonb,uuid) to authenticated;
grant execute on function public.crear_pedido(uuid,uuid,jsonb) to authenticated;

comment on column public.pedidos.solicitud_id is
  'Clave opaca de una comanda, nula únicamente en pedidos históricos.';
commit;
