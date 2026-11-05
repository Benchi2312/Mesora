-- Conversaciones de soporte visibles únicamente para el restaurante afectado y Mesora.
create table public.soporte_mensajes (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.soporte_tickets(id) on delete cascade,
  autor_id uuid not null references public.usuarios(id),
  autor_super_admin boolean not null,
  mensaje text not null check (length(btrim(mensaje)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index soporte_mensajes_ticket_fecha_idx on public.soporte_mensajes(ticket_id, created_at);
alter table public.soporte_mensajes enable row level security;
revoke all on public.soporte_mensajes from public, anon, authenticated;
grant select, insert(ticket_id, autor_id, autor_super_admin, mensaje) on public.soporte_mensajes to authenticated;

create policy soporte_mensajes_select on public.soporte_mensajes
  for select to authenticated using (
    exists (select 1 from public.soporte_tickets t where t.id = ticket_id)
  );
create policy soporte_mensajes_insert on public.soporte_mensajes
  for insert to authenticated with check (
    autor_id = (select auth.uid())
    and autor_super_admin = (select public.soy_super_admin())
    and exists (
      select 1 from public.soporte_tickets t
      where t.id = ticket_id
        and t.estado <> 'cerrado'
        and (public.soy_super_admin() or
          (public.tengo_rol(array['admin_restaurante'])
           and t.restaurante_id = public.mi_restaurante_id()))
    )
  );

alter table private.mesora_commercial_leads
  add column responsable text check (responsable is null or length(responsable) <= 120),
  add column nota_interna text check (nota_interna is null or length(nota_interna) <= 2000),
  add column proximo_contacto date;
create index mesora_commercial_followup_idx
  on private.mesora_commercial_leads(proximo_contacto)
  where estado <> 'cerrado' and proximo_contacto is not null;

create or replace function public.mesora_commercial_inbox()
returns jsonb language plpgsql security definer set search_path = '' as $$
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
      'correo_fallido', count(*) filter (where j.sent_at is null and j.attempts >= 8),
      'contactos_vencidos', count(*) filter (where l.estado <> 'cerrado' and l.proximo_contacto < (now() at time zone 'America/Lima')::date)
    ),
    'consultas', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id', x.id, 'nombre', x.nombre, 'restaurante', x.restaurante,
      'email', x.email, 'mensaje', x.mensaje, 'estado', x.estado,
      'created_at', x.created_at, 'updated_at', x.updated_at,
      'responsable', x.responsable, 'nota_interna', x.nota_interna,
      'proximo_contacto', x.proximo_contacto,
      'correo_estado', case when x.sent_at is not null then 'enviado'
        when x.attempts >= 8 then 'fallido' else 'pendiente' end
    ) order by x.created_at desc)
    from (select l2.*, j2.sent_at, j2.attempts
      from private.mesora_commercial_leads l2
      join private.mesora_mail_jobs j2 on j2.dedupe_key = 'lead:' || l2.submission_key
      order by l2.created_at desc limit 100) x), '[]'::jsonb)
  )
  into v_result
  from private.mesora_commercial_leads l
  join private.mesora_mail_jobs j on j.dedupe_key = 'lead:' || l.submission_key;
  return v_result;
end;
$$;
revoke all on function public.mesora_commercial_inbox() from public, anon;
grant execute on function public.mesora_commercial_inbox() to authenticated;

create function public.mesora_update_commercial_followup(
  p_id uuid, p_responsable text, p_nota_interna text, p_proximo_contacto date
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not (select public.soy_super_admin()) then
    raise exception 'Solo el superadministrador puede gestionar consultas' using errcode = '42501';
  end if;
  if length(p_responsable) > 120 or length(p_nota_interna) > 2000 then
    raise exception 'Texto demasiado largo' using errcode = '22023';
  end if;
  update private.mesora_commercial_leads
     set responsable = nullif(btrim(p_responsable), ''),
         nota_interna = nullif(btrim(p_nota_interna), ''),
         proximo_contacto = p_proximo_contacto, updated_at = now()
   where id = p_id;
  if not found then raise exception 'Consulta no encontrada'; end if;
end;
$$;
revoke all on function public.mesora_update_commercial_followup(uuid,text,text,date) from public, anon;
grant execute on function public.mesora_update_commercial_followup(uuid,text,text,date) to authenticated;
