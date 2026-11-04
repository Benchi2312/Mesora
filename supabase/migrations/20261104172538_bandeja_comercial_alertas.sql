-- Bandeja comercial privada y avisos por correo con reintentos.
-- Las consultas de la landing no son tickets de soporte de restaurantes.

create table private.mesora_commercial_leads (
  id uuid primary key default gen_random_uuid(),
  submission_key text not null unique check (submission_key ~ '^[0-9a-f]{64}$'),
  nombre text not null check (length(nombre) between 1 and 100),
  restaurante text not null check (length(restaurante) between 1 and 120),
  email text not null check (length(email) between 3 and 160),
  mensaje text not null check (length(mensaje) <= 1000),
  estado text not null default 'nuevo' check (estado in ('nuevo', 'en_seguimiento', 'cerrado')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index mesora_commercial_leads_created_idx
  on private.mesora_commercial_leads (created_at desc);
alter table private.mesora_commercial_leads enable row level security;
revoke all on private.mesora_commercial_leads from public, anon, authenticated;

create table private.mesora_mail_jobs (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('lead', 'support', 'incident')),
  dedupe_key text not null unique,
  payload jsonb not null,
  attempts integer not null default 0 check (attempts between 0 and 8),
  next_attempt timestamptz not null default now(),
  locked_until timestamptz,
  sent_at timestamptz,
  last_error_code text,
  created_at timestamptz not null default now()
);
create index mesora_mail_jobs_pending_idx
  on private.mesora_mail_jobs (next_attempt, created_at)
  where sent_at is null;
alter table private.mesora_mail_jobs enable row level security;
revoke all on private.mesora_mail_jobs from public, anon, authenticated;

alter table public.soporte_tickets
  add column tipo text not null default 'error'
  check (tipo in ('error', 'consulta', 'sugerencia'));

-- El cliente no puede autodefinir estado, responsable ni otro reportante.
drop policy if exists soporte_tickets_insert on public.soporte_tickets;
create policy soporte_tickets_insert on public.soporte_tickets
  for insert to authenticated
  with check (
    public.tengo_rol(array['admin_restaurante'])
    and restaurante_id = public.mi_restaurante_id()
    and usuario_id = (select auth.uid())
  );
revoke insert, update on public.soporte_tickets from authenticated;
grant insert (restaurante_id, usuario_id, asunto, descripcion, prioridad, tipo)
  on public.soporte_tickets to authenticated;
grant update (estado, prioridad, responsable)
  on public.soporte_tickets to authenticated;

-- Esta función se invoca únicamente con service_role desde contacto-comercial.
-- Un reintento con el mismo contenido y día conserva la misma consulta y aviso.
create or replace function public.mesora_register_commercial_lead(
  p_submission_key text, p_nombre text, p_restaurante text,
  p_email text, p_mensaje text
) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_lead_id uuid;
  v_job_id uuid;
begin
  if p_submission_key is null or p_submission_key !~ '^[0-9a-f]{64}$'
     or p_nombre is null or length(btrim(p_nombre)) not between 1 and 100
     or p_restaurante is null or length(btrim(p_restaurante)) not between 1 and 120
     or p_email is null or length(btrim(p_email)) not between 3 and 160
     or btrim(p_email) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     or p_mensaje is null or length(p_mensaje) > 1000 then
    raise exception 'Consulta comercial inválida' using errcode = '22023';
  end if;

  insert into private.mesora_commercial_leads
    (submission_key, nombre, restaurante, email, mensaje)
  values
    (p_submission_key, btrim(p_nombre), btrim(p_restaurante), lower(btrim(p_email)), p_mensaje)
  on conflict (submission_key) do nothing;
  select id into v_lead_id from private.mesora_commercial_leads
   where submission_key = p_submission_key;

  insert into private.mesora_mail_jobs (kind, dedupe_key, payload)
  values ('lead', 'lead:' || p_submission_key,
    pg_catalog.jsonb_build_object('lead_id', v_lead_id, 'nombre', btrim(p_nombre),
      'restaurante', btrim(p_restaurante), 'email', lower(btrim(p_email)),
      'mensaje', p_mensaje))
  on conflict (dedupe_key) do nothing;
  select id into v_job_id from private.mesora_mail_jobs
   where dedupe_key = 'lead:' || p_submission_key;
  return pg_catalog.jsonb_build_object('lead_id', v_lead_id, 'job_id', v_job_id);
end;
$$;
revoke all on function public.mesora_register_commercial_lead(text,text,text,text,text)
  from public, anon, authenticated;
grant execute on function public.mesora_register_commercial_lead(text,text,text,text,text)
  to service_role;

-- La inserción del ticket y la cola de aviso son una sola transacción.
create or replace function private.mesora_queue_support_ticket()
returns trigger language plpgsql security definer
set search_path = ''
as $$
declare
  v_restaurante text;
begin
  select nombre into v_restaurante from public.restaurantes where id = new.restaurante_id;
  insert into private.mesora_mail_jobs (kind, dedupe_key, payload)
  values ('support', 'support:' || new.id::text,
    pg_catalog.jsonb_build_object('codigo', new.codigo, 'asunto', new.asunto,
      'tipo', new.tipo, 'prioridad', new.prioridad,
      'restaurante', coalesce(v_restaurante, 'Sin restaurante')));
  return new;
end;
$$;
revoke all on function private.mesora_queue_support_ticket()
  from public, anon, authenticated;
create trigger mesora_queue_support_ticket
  after insert on public.soporte_tickets
  for each row execute function private.mesora_queue_support_ticket();

-- Solo los incidentes graves generan un correo y como máximo uno por código/día.
create or replace function public.mesora_record_incident(
  p_source text, p_code text
) returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_id bigint;
  v_day date := (clock_timestamp() at time zone 'UTC')::date;
begin
  if p_source not in ('contacto-comercial', 'admin-password-recovery', 'crear-restaurante')
     or p_code is null or p_code !~ '^[a-z0-9_]{3,60}$' then
    raise exception 'Código de incidente inválido' using errcode = '22023';
  end if;

  insert into private.mesora_system_incidents
    (source, code, day, occurrences, first_seen, last_seen)
  values (p_source, p_code, v_day, 1, clock_timestamp(), clock_timestamp())
  on conflict (source, code, day) do nothing returning id into v_id;
  if v_id is null then
    update private.mesora_system_incidents
       set occurrences = occurrences + 1, last_seen = clock_timestamp()
     where source = p_source and code = p_code and day = v_day;
  elsif p_code not in ('contact_rate_limited', 'contact_global_limit_reached') then
    insert into private.mesora_mail_jobs (kind, dedupe_key, payload)
    values ('incident', 'incident:' || v_id::text,
      pg_catalog.jsonb_build_object('source', p_source, 'code', p_code, 'day', v_day));
  end if;
end;
$$;
revoke all on function public.mesora_record_incident(text,text)
  from public, anon, authenticated;
grant execute on function public.mesora_record_incident(text,text) to service_role;

-- Lease evita que el envío inmediato y el programado procesen el mismo aviso.
create or replace function public.mesora_claim_mail_jobs(
  p_limit integer default 10, p_job_id uuid default null
) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare v_jobs jsonb;
begin
  if p_limit not between 1 and 20 then
    raise exception 'Límite inválido' using errcode = '22023';
  end if;
  with candidates as (
    select id from private.mesora_mail_jobs
     where sent_at is null and attempts < 8 and next_attempt <= now()
       and (locked_until is null or locked_until < now())
       and (p_job_id is null or id = p_job_id)
     order by created_at
     limit p_limit for update skip locked
  ), claimed as (
    update private.mesora_mail_jobs j
       set attempts = j.attempts + 1, locked_until = now() + interval '3 minutes'
      from candidates c where j.id = c.id
    returning j.id, j.kind, j.dedupe_key, j.payload
  )
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id', id, 'kind', kind, 'dedupe_key', dedupe_key, 'payload', payload
  )), '[]'::jsonb) into v_jobs from claimed;
  return v_jobs;
end;
$$;
revoke all on function public.mesora_claim_mail_jobs(integer,uuid)
  from public, anon, authenticated;
grant execute on function public.mesora_claim_mail_jobs(integer,uuid) to service_role;

create or replace function public.mesora_finish_mail_job(
  p_job_id uuid, p_success boolean, p_error_code text default null
) returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if p_error_code is not null and p_error_code !~ '^[a-z0-9_]{3,60}$' then
    raise exception 'Código de error inválido' using errcode = '22023';
  end if;
  update private.mesora_mail_jobs
     set sent_at = case when p_success then now() else sent_at end,
         locked_until = null,
         next_attempt = case when p_success then now()
           else now() + interval '1 minute' * least(power(3, attempts)::integer, 180) end,
         last_error_code = case when p_success then null else coalesce(p_error_code, 'send_failed') end
   where id = p_job_id and sent_at is null and locked_until >= now();
  if not found then
    raise exception 'Aviso no reservado o ya procesado';
  end if;
end;
$$;
revoke all on function public.mesora_finish_mail_job(uuid,boolean,text)
  from public, anon, authenticated;
grant execute on function public.mesora_finish_mail_job(uuid,boolean,text) to service_role;

-- El panel solo usa RPC: no se concede USAGE del esquema private al navegador.
create or replace function public.mesora_commercial_inbox()
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare v_result jsonb;
begin
  if not (select public.soy_super_admin()) then
    raise exception 'Solo el superadministrador puede ver consultas comerciales' using errcode = '42501';
  end if;
  select pg_catalog.jsonb_build_object(
    'resumen', pg_catalog.jsonb_build_object(
      'hoy', count(*) filter (where l.created_at >= date_trunc('day', now() at time zone 'America/Lima') at time zone 'America/Lima'),
      'ultimos_30_dias', count(*) filter (where l.created_at >= now() - interval '30 days'),
      'nuevas', count(*) filter (where l.estado = 'nuevo'),
      'correo_pendiente', count(*) filter (where j.sent_at is null and j.attempts < 8),
      'correo_fallido', count(*) filter (where j.sent_at is null and j.attempts >= 8)
    ),
    'consultas', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id', x.id, 'nombre', x.nombre, 'restaurante', x.restaurante,
      'email', x.email, 'mensaje', x.mensaje, 'estado', x.estado,
      'created_at', x.created_at, 'updated_at', x.updated_at,
      'correo_estado', case when x.sent_at is not null then 'enviado'
        when x.attempts >= 8 then 'fallido' else 'pendiente' end
    ) order by x.created_at desc)
    from (select l2.*, j2.sent_at, j2.attempts
      from private.mesora_commercial_leads l2
      join private.mesora_mail_jobs j2 on j2.dedupe_key = 'lead:' || l2.submission_key
      order by l2.created_at desc limit 100) x), '[]'::jsonb)
  ) into v_result
  from private.mesora_commercial_leads l
  join private.mesora_mail_jobs j on j.dedupe_key = 'lead:' || l.submission_key;
  return v_result;
end;
$$;
revoke all on function public.mesora_commercial_inbox() from public, anon;
grant execute on function public.mesora_commercial_inbox() to authenticated;

create or replace function public.mesora_update_commercial_lead(
  p_id uuid, p_estado text
) returns void language plpgsql security definer
set search_path = ''
as $$
begin
  if not (select public.soy_super_admin()) then
    raise exception 'Solo el superadministrador puede gestionar consultas' using errcode = '42501';
  end if;
  if p_estado not in ('nuevo', 'en_seguimiento', 'cerrado') then
    raise exception 'Estado inválido' using errcode = '22023';
  end if;
  update private.mesora_commercial_leads
     set estado = p_estado, updated_at = now() where id = p_id;
  if not found then raise exception 'Consulta no encontrada'; end if;
end;
$$;
revoke all on function public.mesora_update_commercial_lead(uuid,text) from public, anon;
grant execute on function public.mesora_update_commercial_lead(uuid,text) to authenticated;
