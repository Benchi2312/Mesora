do $$
declare
  pedido uuid;
begin
  select id into pedido from public.pedidos where solicitud_id='aa000000-0000-4000-8000-000000000006';
  if pedido is null or (select count(*) from public.pedidos where solicitud_id='aa000000-0000-4000-8000-000000000006')<>1 or
     (select count(*) from public.pedido_items where pedido_id=pedido)<>1 or
     (select count(*) from public.entregas_comanda where pedido_id=pedido)<>1 then
    raise exception 'Dos sesiones concurrentes duplicaron el pedido o sus efectos';
  end if;
end;
$$;
