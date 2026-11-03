-- Recuperación por correo verificado para administradores de restaurante.
-- Los tokens viven en un esquema no expuesto y solo las Edge Functions usan
-- las RPC de service_role para emitirlos y consumirlos.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;

create table if not exists private.admin_recovery_tokens (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.usuarios(id) on delete cascade,
  correo text not null,
  token_hash text not null unique check (length(token_hash) = 64),
  creado_en timestamptz not null default now(),
  expira_en timestamptz not null,
  consumido_en timestamptz,
  constraint admin_recovery_token_expiry_check
    check (expira_en > creado_en and expira_en <= creado_en + interval '1 hour')
);

alter table private.admin_recovery_tokens enable row level security;
revoke all on table private.admin_recovery_tokens from public, anon, authenticated;
grant select, insert, update, delete on table private.admin_recovery_tokens to service_role;

create table if not exists private.admin_recovery_rate_limits (
  usuario_id uuid not null references public.usuarios(id) on delete cascade,
  accion text not null check (accion in ('verificar_correo', 'recuperar_password')),
  primera_solicitud timestamptz not null default now(),
  ultima_solicitud timestamptz not null default now(),
  solicitudes integer not null default 1 check (solicitudes > 0),
  primary key (usuario_id, accion)
);

alter table private.admin_recovery_rate_limits enable row level security;
revoke all on table private.admin_recovery_rate_limits from public, anon, authenticated;
grant select, insert, update, delete on table private.admin_recovery_rate_limits to service_role;

-- El usuario no puede marcar directamente un correo como verificado usando el
-- permiso amplio de UPDATE que necesita Personal. Solo la Edge Function con
-- service_role puede escribir estos dos campos.
create or replace function public.proteger_correo_recuperacion()
returns trigger
language plpgsql
set search_path = pg_catalog, auth
as $$
begin
  if (new.correo_recuperacion is distinct from old.correo_recuperacion
      or new.correo_recuperacion_verificado is distinct from old.correo_recuperacion_verificado)
     and coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'El correo de recuperación solo se actualiza mediante verificación segura';
  end if;
  return new;
end;
$$;

revoke all on function public.proteger_correo_recuperacion() from public, anon, authenticated;
grant execute on function public.proteger_correo_recuperacion() to authenticated, service_role;

drop trigger if exists usuarios_proteger_correo_recuperacion on public.usuarios;
create trigger usuarios_proteger_correo_recuperacion
  before update of correo_recuperacion, correo_recuperacion_verificado on public.usuarios
  for each row execute function public.proteger_correo_recuperacion();

create or replace function public.mesora_recovery_can_send(
  p_usuario_id uuid,
  p_accion text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_permitido boolean;
begin
  if p_accion not in ('verificar_correo', 'recuperar_password') then
    return false;
  end if;

  insert into private.admin_recovery_rate_limits as limite
    (usuario_id, accion, primera_solicitud, ultima_solicitud, solicitudes)
  values (p_usuario_id, p_accion, now(), now(), 1)
  on conflict (usuario_id, accion) do update
    set primera_solicitud = case
          when limite.primera_solicitud <= now() - interval '24 hours' then now()
          else limite.primera_solicitud
        end,
        solicitudes = case
          when limite.primera_solicitud <= now() - interval '24 hours' then 1
          else limite.solicitudes + 1
        end,
        ultima_solicitud = now()
    where limite.ultima_solicitud <= now() - interval '60 seconds'
      and (limite.primera_solicitud <= now() - interval '24 hours' or limite.solicitudes < 5)
  returning true into v_permitido;

  return coalesce(v_permitido, false);
end;
$$;

create or replace function public.mesora_recovery_store_token(
  p_usuario_id uuid,
  p_correo text,
  p_token_hash text,
  p_expira_en timestamptz
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, private
as $$
begin
  if length(p_token_hash) <> 64
     or p_expira_en <= now()
     or p_expira_en > now() + interval '1 hour'
     or p_correo <> lower(btrim(p_correo)) then
    raise exception 'Datos de verificación inválidos';
  end if;

  delete from private.admin_recovery_tokens
   where usuario_id = p_usuario_id and consumido_en is null;

  insert into private.admin_recovery_tokens (usuario_id, correo, token_hash, expira_en)
  values (p_usuario_id, p_correo, p_token_hash, p_expira_en);
end;
$$;

create or replace function public.mesora_recovery_consume_token(p_token_hash text)
returns table (usuario_id uuid, correo text)
language sql
security definer
set search_path = pg_catalog, private
as $$
  update private.admin_recovery_tokens as token
     set consumido_en = now()
   where token.token_hash = p_token_hash
     and token.consumido_en is null
     and token.expira_en > now()
  returning token.usuario_id, token.correo;
$$;

revoke all on function public.mesora_recovery_can_send(uuid, text) from public, anon, authenticated;
revoke all on function public.mesora_recovery_store_token(uuid, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.mesora_recovery_consume_token(text) from public, anon, authenticated;
grant execute on function public.mesora_recovery_can_send(uuid, text) to service_role;
grant execute on function public.mesora_recovery_store_token(uuid, text, text, timestamptz) to service_role;
grant execute on function public.mesora_recovery_consume_token(text) to service_role;

comment on schema private is 'Datos internos que no se exponen por PostgREST.';
comment on table private.admin_recovery_tokens is 'Tokens de verificación de correo alternativo; solo se almacena el hash.';
comment on table private.admin_recovery_rate_limits is 'Límites por usuario para evitar abuso de los correos de recuperación.';
