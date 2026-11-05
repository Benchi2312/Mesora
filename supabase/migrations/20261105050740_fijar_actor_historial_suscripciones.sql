-- Evita que el cliente suplante al autor de una acción de suscripción.
-- La firma existente de las RPC se conserva para compatibilidad.
create or replace function public.fijar_actor_historial_suscripciones()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  if auth.uid() is not null then
    new.creado_por := auth.uid();
  end if;
  return new;
end;
$$;

revoke all on function public.fijar_actor_historial_suscripciones() from public, anon, authenticated;

drop trigger if exists trg_fijar_actor_historial_suscripciones
  on public.suscripciones_historial;
create trigger trg_fijar_actor_historial_suscripciones
  before insert on public.suscripciones_historial
  for each row execute function public.fijar_actor_historial_suscripciones();
