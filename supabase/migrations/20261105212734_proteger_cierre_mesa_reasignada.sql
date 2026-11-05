-- Una vez transferida la responsabilidad, el mesero anterior no puede cobrar
-- la mesa ni aunque tenga una pantalla antigua abierta. La RPC de cierre ya
-- bloquea la fila de la mesa; este trigger valida el responsable en ese mismo
-- bloqueo y deja admin_restaurante sin cambios.
create or replace function public.validar_responsable_cierre_cuenta()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rol text;
  v_responsable uuid;
begin
  if auth.uid() is null then
    return new;
  end if;

  select u.rol::text into v_rol
    from public.usuarios u
   where u.id = auth.uid()
     and u.restaurante_id = new.restaurante_id
     and coalesce(u.activo, true);

  if v_rol = 'mesero' then
    select m.mesero_responsable_id into v_responsable
      from public.mesas m
     where m.id = new.mesa_id
       and m.restaurante_id = new.restaurante_id
     for update;

    if v_responsable is not null and v_responsable <> auth.uid() then
      raise exception 'Esta mesa esta asignada a otro mesero.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists cuentas_validar_responsable_cierre on public.cuentas;
create trigger cuentas_validar_responsable_cierre
before insert on public.cuentas
for each row execute function public.validar_responsable_cierre_cuenta();

revoke all on function public.validar_responsable_cierre_cuenta() from public, anon, authenticated;
