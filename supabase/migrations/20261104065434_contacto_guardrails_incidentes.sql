-- Protección del contacto comercial y registro de fallos operativos.
-- Las tablas privadas solo guardan huellas SHA-256 y códigos de fallo; no
-- contienen correos, direcciones IP ni contenido de consultas.

create schema if not exists private;

create table if not exists private.mesora_contact_limits (
  bucket text primary key,
  attempts integer not null default 0 check (attempts >= 0),
  expires_at timestamptz not null
);
create index if not exists mesora_contact_limits_expires_idx
  on private.mesora_contact_limits (expires_at);
alter table private.mesora_contact_limits enable row level security;
revoke all on private.mesora_contact_limits from public, anon, authenticated;

create table if not exists private.mesora_system_incidents (
  id bigint generated always as identity primary key,
  source text not null,
  code text not null,
  day date not null,
  occurrences integer not null default 1 check (occurrences > 0),
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  unique (source, code, day)
);
create index if not exists mesora_system_incidents_last_seen_idx
  on private.mesora_system_incidents (last_seen desc);
alter table private.mesora_system_incidents enable row level security;
revoke all on private.mesora_system_incidents from public, anon, authenticated;

-- Un bloqueo transaccional serializa las solicitudes concurrentes para que
-- ninguna pueda superar los contadores al leerlos simultáneamente.
create or replace function public.mesora_contact_can_send(
  p_email_hash text,
  p_ip_hash text
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_day text := to_char(v_now at time zone 'UTC', 'YYYYMMDD');
  v_hour text := to_char(v_now at time zone 'UTC', 'YYYYMMDDHH24');
  v_global text := 'global:' || v_day;
  v_email text := 'email:' || p_email_hash || ':' || v_day;
  v_ip text := case when p_ip_hash is null then null else 'ip:' || p_ip_hash || ':' || v_hour end;
  v_attempts integer;
  v_limit_code text;
begin
  if p_email_hash is null or p_email_hash !~ '^[0-9a-f]{64}$'
     or (p_ip_hash is not null and p_ip_hash !~ '^[0-9a-f]{64}$') then
    raise exception 'Huella inválida' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(511407070041::bigint);
  delete from private.mesora_contact_limits where expires_at < v_now;

  select attempts into v_attempts from private.mesora_contact_limits where bucket = v_global;
  if coalesce(v_attempts, 0) >= 50 then
    v_limit_code := 'contact_global_limit_reached';
  end if;
  if v_limit_code is null then
    select attempts into v_attempts from private.mesora_contact_limits where bucket = v_email;
    if coalesce(v_attempts, 0) >= 3 then v_limit_code := 'contact_rate_limited'; end if;
  end if;
  if v_limit_code is null and v_ip is not null then
    select attempts into v_attempts from private.mesora_contact_limits where bucket = v_ip;
    if coalesce(v_attempts, 0) >= 10 then v_limit_code := 'contact_rate_limited'; end if;
  end if;
  if v_limit_code is not null then
    -- Una sola incidencia por categoría y día; las denegaciones posteriores
    -- no disparan otro RPC ni crean una fila por petición abusiva.
    insert into private.mesora_system_incidents
      (source, code, day, occurrences, first_seen, last_seen)
    values
      ('contacto-comercial', v_limit_code, (v_now at time zone 'UTC')::date, 1, v_now, v_now)
    on conflict (source, code, day) do nothing;
    return false;
  end if;

  insert into private.mesora_contact_limits as lim (bucket, attempts, expires_at)
  values (v_global, 1, v_now + interval '2 days'),
         (v_email, 1, v_now + interval '2 days')
  on conflict (bucket) do update set attempts = lim.attempts + 1;
  if v_ip is not null then
    insert into private.mesora_contact_limits as lim (bucket, attempts, expires_at)
    values (v_ip, 1, v_now + interval '2 hours')
    on conflict (bucket) do update set attempts = lim.attempts + 1;
  end if;
  return true;
end;
$$;

revoke all on function public.mesora_contact_can_send(text, text) from public, anon, authenticated;
grant execute on function public.mesora_contact_can_send(text, text) to service_role;

create or replace function public.mesora_record_incident(
  p_source text,
  p_code text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_source not in ('contacto-comercial', 'admin-password-recovery', 'crear-restaurante')
     or p_code is null or p_code !~ '^[a-z0-9_]{3,60}$' then
    raise exception 'Código de incidente inválido' using errcode = '22023';
  end if;

  insert into private.mesora_system_incidents as inc
    (source, code, day, occurrences, first_seen, last_seen)
  values
    (p_source, p_code, (clock_timestamp() at time zone 'UTC')::date, 1, clock_timestamp(), clock_timestamp())
  on conflict (source, code, day) do update
     set occurrences = inc.occurrences + 1,
         last_seen = clock_timestamp();
end;
$$;

revoke all on function public.mesora_record_incident(text, text) from public, anon, authenticated;
grant execute on function public.mesora_record_incident(text, text) to service_role;

-- Solo el propietario ve las incidencias. No se muestran PII ni excepciones.
create or replace function public.mesora_system_alerts()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if not (select public.soy_super_admin()) then
    raise exception 'Solo el super administrador puede ver las incidencias.' using errcode = '42501';
  end if;

  select coalesce(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'id', 'inc-' || id,
      'tipo', 'incidente_sistema',
      'nivel', case when code in ('contact_rate_limited', 'contact_global_limit_reached')
        then 'advertencia' else 'critico' end,
      'titulo', case source
        when 'contacto-comercial' then case when code in ('contact_rate_limited', 'contact_global_limit_reached')
          then 'Límite de consultas alcanzado' else 'Fallo en el contacto comercial' end
        when 'admin-password-recovery' then 'Fallo en la recuperación de acceso'
        else 'Fallo en el alta de restaurante' end,
      'detalle', 'Código ' || code || ' · ' || occurrences || ' intento(s) en el día.',
      'fecha', last_seen,
      'restaurante_id', null,
      'restaurante_nombre', null,
      'referencia_id', null
    ) order by last_seen desc
  ), '[]'::jsonb) into v_result
  from (
    select id, source, code, occurrences, last_seen
    from private.mesora_system_incidents
    where last_seen >= clock_timestamp() - interval '7 days'
    order by last_seen desc
    limit 30
  ) recent;

  return v_result;
end;
$$;

revoke all on function public.mesora_system_alerts() from public, anon;
grant execute on function public.mesora_system_alerts() to authenticated;
