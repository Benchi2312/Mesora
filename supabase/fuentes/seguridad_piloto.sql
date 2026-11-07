-- =============================================================================
-- Mesora · controles de piloto: límite de administradores y credenciales
-- =============================================================================
-- Aditivo e idempotente. El trigger protege el límite aunque se escriba desde
-- otra ruta (PostgREST, Edge Function o SQL); bloquear la fila del restaurante
-- serializa altas concurrentes.

alter table public.planes
  add column if not exists max_administradores integer not null default 3;

update public.planes
   set max_administradores = 3
 where clave = 'mesora_pro'
   and max_administradores is null;

comment on column public.planes.max_administradores is
  'Máximo de administradores activos por restaurante; un valor negativo significa sin límite.';

create or replace function public.validar_limite_administradores()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limite integer;
  v_actuales integer;
begin
  if new.rol <> 'admin_restaurante' or new.activo is not true then
    return new;
  end if;

  -- Cambios de datos de un administrador existente no consumen otro cupo.
  if tg_op = 'UPDATE'
     and old.rol = 'admin_restaurante'
     and old.activo is true
     and old.restaurante_id = new.restaurante_id then
    return new;
  end if;

  -- Evita que dos altas concurrentes vean el mismo cupo libre.
  perform 1
    from public.restaurantes
   where id = new.restaurante_id
   for update;

  select coalesce(p.max_administradores, 3)
    into v_limite
    from public.restaurantes r
    left join public.planes p on p.id = r.plan_id
   where r.id = new.restaurante_id;

  if v_limite < 0 then
    return new;
  end if;

  select count(*)
    into v_actuales
    from public.usuarios u
   where u.restaurante_id = new.restaurante_id
     and u.rol = 'admin_restaurante'
     and u.activo is true
     and u.id <> new.id;

  if v_actuales >= v_limite then
    raise exception 'El plan permite hasta % administradores activos.', v_limite
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.validar_limite_administradores() from public;
revoke all on function public.validar_limite_administradores() from anon;
revoke all on function public.validar_limite_administradores() from authenticated;

drop trigger if exists usuarios_limite_administradores on public.usuarios;
create trigger usuarios_limite_administradores
before insert or update of rol, activo, restaurante_id on public.usuarios
for each row execute function public.validar_limite_administradores();

-- Los clientes solo pueden cambiar los campos de personal usados por la UI.
-- email pertenece a Supabase Auth y se fija al crear la cuenta; id y restaurante
-- no se cambian desde PostgREST. El flag de contraseña lo modifican la Edge
-- Function de reset y esta RPC, nunca una escritura directa del navegador.
revoke update on public.usuarios from authenticated;
do $$
declare
  v_columna text;
begin
  for v_columna in
    select a.attname
      from pg_attribute a
     where a.attrelid = 'public.usuarios'::regclass
       and a.attnum > 0
       and not a.attisdropped
  loop
    execute format(
      'revoke update (%I) on public.usuarios from authenticated',
      v_columna
    );
  end loop;
end;
$$;
grant update (nombre, rol) on public.usuarios to authenticated;

create or replace function public.confirmar_cambio_password()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Se requiere una sesión válida';
  end if;

  update public.usuarios
     set debe_cambiar_password = false
   where id = auth.uid();

  if not found then
    raise exception 'No se encontró el perfil del usuario';
  end if;
end;
$$;

revoke all on function public.confirmar_cambio_password() from public;
revoke all on function public.confirmar_cambio_password() from anon;
grant execute on function public.confirmar_cambio_password() to authenticated;
