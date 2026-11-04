-- Solo una contrasena cambiada en Supabase Auth puede desmarcar la clave temporal.
-- Se guarda una huella del hash de Auth cuando se activa la obligacion; la huella
-- no sirve para iniciar sesion y vive fuera del esquema expuesto.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.password_temporal_huellas (
  usuario_id uuid primary key references public.usuarios(id) on delete cascade,
  huella_auth text,
  marcada_at timestamptz not null default now(),
  reset_en_curso boolean not null default false,
  constraint password_temporal_huella_largo check (huella_auth is null or length(huella_auth) = 64)
);
alter table private.password_temporal_huellas enable row level security;
revoke all on table private.password_temporal_huellas from public, anon, authenticated;

-- Cuando el servidor marca debe_cambiar_password, captura la version actual
-- del hash de Auth. Un cliente no puede leer ni alterar esta tabla privada.
create or replace function private.mesora_registrar_password_temporal()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth, extensions, pg_temp
as $$
declare
  v_hash text;
begin
  if new.debe_cambiar_password then
    select au.encrypted_password into v_hash
      from auth.users au where au.id = new.id;
    if not found then
      raise exception 'No se encontro la identidad de Auth del usuario';
    end if;
    insert into private.password_temporal_huellas(usuario_id, huella_auth, marcada_at)
      values (new.id, case when v_hash is null then null
                           else encode(extensions.digest(v_hash, 'sha256'), 'hex') end, now())
      on conflict (usuario_id) do update
        set huella_auth = excluded.huella_auth,
            marcada_at = excluded.marcada_at;
  else
    delete from private.password_temporal_huellas where usuario_id = new.id;
  end if;
  return new;
end;
$$;
revoke all on function private.mesora_registrar_password_temporal() from public, anon, authenticated;

drop trigger if exists usuarios_password_temporal_huella on public.usuarios;
create trigger usuarios_password_temporal_huella
  after insert or update of debe_cambiar_password on public.usuarios
  for each row execute function private.mesora_registrar_password_temporal();

-- Usuarios que ya estaban obligados antes de instalar esta migracion.
insert into private.password_temporal_huellas(usuario_id, huella_auth)
select u.id,
       case when au.encrypted_password is null then null
            else encode(extensions.digest(au.encrypted_password, 'sha256'), 'hex') end
  from public.usuarios u
  join auth.users au on au.id = u.id
 where u.debe_cambiar_password
on conflict (usuario_id) do update
  set huella_auth = excluded.huella_auth,
      marcada_at = now();

-- El reset administrativo ocurre en dos servicios distintos (PostgREST y
-- Supabase Auth). El marcador impide que el nuevo hash de la clave temporal se
-- confunda con el cambio personal del trabajador entre ambas operaciones.
create or replace function public.mesora_preparar_reset_password_personal(p_usuario_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth, extensions, pg_temp
as $$
begin
  if not exists (
    select 1 from public.usuarios u
     where u.id = p_usuario_id and u.rol in ('mesero', 'cocina', 'cajero')
     for update
  ) then
    raise exception 'No se encontro al trabajador para restablecer';
  end if;

  update public.usuarios set debe_cambiar_password = true where id = p_usuario_id;
  update private.password_temporal_huellas
     set reset_en_curso = true
   where usuario_id = p_usuario_id;
end;
$$;

create or replace function public.mesora_finalizar_reset_password_personal(p_usuario_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth, extensions, pg_temp
as $$
declare
  v_huella_anterior text;
  v_huella_actual text;
  v_en_curso boolean;
begin
  select h.huella_auth, h.reset_en_curso
    into v_huella_anterior, v_en_curso
    from private.password_temporal_huellas h
   where h.usuario_id = p_usuario_id for update;
  if not found or not v_en_curso then
    raise exception 'No hay un restablecimiento de personal en curso';
  end if;
  select case when au.encrypted_password is null then null
              else encode(extensions.digest(au.encrypted_password, 'sha256'), 'hex') end
    into v_huella_actual
    from auth.users au where au.id = p_usuario_id;
  if not found or v_huella_actual is null
     or v_huella_actual is not distinct from v_huella_anterior then
    raise exception 'Auth aun no actualizo la contrasena temporal';
  end if;

  -- El trigger reemplaza la huella vieja por la nueva; el marcador permanece
  -- activo hasta la siguiente instruccion, dentro de esta misma transaccion.
  update public.usuarios set debe_cambiar_password = true where id = p_usuario_id;
  update private.password_temporal_huellas
     set reset_en_curso = false
   where usuario_id = p_usuario_id;
end;
$$;

revoke all on function public.mesora_preparar_reset_password_personal(uuid) from public, anon, authenticated;
revoke all on function public.mesora_finalizar_reset_password_personal(uuid) from public, anon, authenticated;
grant execute on function public.mesora_preparar_reset_password_personal(uuid) to service_role;
grant execute on function public.mesora_finalizar_reset_password_personal(uuid) to service_role;

-- La RPC conserva su firma para la app, pero ahora compara con Auth antes de
-- levantar la obligacion. Ni un request directo a /rpc puede confirmarla sin
-- que la contrasena en Auth haya cambiado desde el ultimo reset administrativo.
create or replace function public.confirmar_cambio_password()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth, extensions, pg_temp
as $$
declare
  v_debe_cambiar boolean;
  v_huella_anterior text;
  v_huella_actual text;
  v_en_curso boolean;
begin
  if auth.uid() is null then
    raise exception 'Se requiere una sesion valida';
  end if;

  select u.debe_cambiar_password into v_debe_cambiar
    from public.usuarios u where u.id = auth.uid() for update;
  if not found then
    raise exception 'No se encontro el perfil del usuario';
  end if;
  if not v_debe_cambiar then return; end if;

  select h.huella_auth, h.reset_en_curso into v_huella_anterior, v_en_curso
    from private.password_temporal_huellas h where h.usuario_id = auth.uid();
  if not found then
    raise exception 'Falta el registro del cambio obligatorio de contrasena';
  end if;
  if v_en_curso then
    raise exception 'El restablecimiento administrativo sigue en curso';
  end if;
  select case when au.encrypted_password is null then null
              else encode(extensions.digest(au.encrypted_password, 'sha256'), 'hex') end
    into v_huella_actual
    from auth.users au where au.id = auth.uid();
  if not found or v_huella_actual is null
     or v_huella_actual is not distinct from v_huella_anterior then
    raise exception 'Primero cambia tu contrasena en Supabase Auth';
  end if;

  update public.usuarios set debe_cambiar_password = false where id = auth.uid();
end;
$$;
revoke all on function public.confirmar_cambio_password() from public, anon;
grant execute on function public.confirmar_cambio_password() to authenticated;
