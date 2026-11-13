-- Solo en la base descartable: retiene la primera transacción mientras entra
-- la segunda. No instalar esta función ni este trigger en producción.
create or replace function public.qa_retardar_pedido()
returns trigger language plpgsql set search_path = '' as $$
begin
  perform pg_catalog.pg_sleep(2);
  return new;
end;
$$;
create trigger qa_retardar_pedido before insert on public.pedidos
for each row execute function public.qa_retardar_pedido();
