begin;

-- El historial que ya existía no debe aparecer como pendiente al activar el
-- contador. Detectamos la instalación inicial para que una reejecución no
-- marque como leídos los mensajes nuevos recibidos después.
do $$
declare
  v_columna_leido_existia boolean;
begin
  select exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'soporte_mensajes'
       and column_name = 'leido_superadmin_at'
  ) into v_columna_leido_existia;

  alter table public.soporte_mensajes
    add column if not exists leido_superadmin_at timestamptz,
    add column if not exists leido_superadmin_por uuid;

  if not v_columna_leido_existia then
    update public.soporte_mensajes
       set leido_superadmin_at = created_at
     where leido_superadmin_at is null;
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'soporte_mensajes_leido_superadmin_por_fkey'
       and conrelid = 'public.soporte_mensajes'::regclass
  ) then
    alter table public.soporte_mensajes
      add constraint soporte_mensajes_leido_superadmin_por_fkey
      foreign key (leido_superadmin_por) references public.usuarios(id)
      on delete set null;
  end if;
end;
$$;

comment on column public.soporte_mensajes.leido_superadmin_at is
  'Momento en que el superadministrador leyó el mensaje del restaurante; NULL indica no leído.';
comment on column public.soporte_mensajes.leido_superadmin_por is
  'Usuario super_admin que abrió y marcó como leído el mensaje.';

create index if not exists soporte_mensajes_superadmin_no_leidos_idx
  on public.soporte_mensajes (ticket_id, created_at)
  where autor_super_admin = false and leido_superadmin_at is null;

-- Solo un super_admin activo puede pasar mensajes entrantes de no leídos a
-- leídos. La política y los permisos por columna también protegen el UPDATE
-- directo, no únicamente las llamadas a esta función.
drop policy if exists soporte_mensajes_marcar_superadmin_leidos on public.soporte_mensajes;
create policy soporte_mensajes_marcar_superadmin_leidos
  on public.soporte_mensajes
  for update to authenticated
  using (
    (select public.soy_super_admin())
    and autor_super_admin = false
    and leido_superadmin_at is null
  )
  with check (
    (select public.soy_super_admin())
    and autor_super_admin = false
    and leido_superadmin_at is not null
    and leido_superadmin_por = (select auth.uid())
  );

grant update (leido_superadmin_at, leido_superadmin_por)
  on public.soporte_mensajes to authenticated;

create or replace function public.superadmin_conteo_mensajes_soporte_no_leidos()
returns table (ticket_id uuid, cantidad bigint)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if not coalesce((select public.soy_super_admin()), false) then
    raise exception 'Solo el superadministrador puede consultar mensajes no leídos.'
      using errcode = '42501';
  end if;

  return query
    select m.ticket_id, count(*)::bigint
      from public.soporte_mensajes as m
     where m.autor_super_admin = false
       and m.leido_superadmin_at is null
     group by m.ticket_id;
end;
$$;

create or replace function public.superadmin_marcar_mensajes_soporte_leidos(
  p_ticket_id uuid,
  p_mensaje_ids uuid[]
)
returns table (mensaje_id uuid, leido_at timestamptz)
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not coalesce((select public.soy_super_admin()), false) then
    raise exception 'Solo el superadministrador puede marcar mensajes como leídos.'
      using errcode = '42501';
  end if;

  return query
    update public.soporte_mensajes as m
       set leido_superadmin_at = pg_catalog.now(),
           leido_superadmin_por = (select auth.uid())
     where m.ticket_id = p_ticket_id
       and m.id = any(coalesce(p_mensaje_ids, array[]::uuid[]))
       and m.autor_super_admin = false
       and m.leido_superadmin_at is null
    returning m.id, m.leido_superadmin_at;
end;
$$;

revoke all on function public.superadmin_conteo_mensajes_soporte_no_leidos() from public, anon;
revoke all on function public.superadmin_marcar_mensajes_soporte_leidos(uuid, uuid[]) from public, anon;
grant execute on function public.superadmin_conteo_mensajes_soporte_no_leidos() to authenticated;
grant execute on function public.superadmin_marcar_mensajes_soporte_leidos(uuid, uuid[]) to authenticated;

-- Supabase Realtime publica los eventos bajo las mismas reglas de SELECT/RLS.
do $$
begin
  if exists (select 1 from pg_catalog.pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_catalog.pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = 'soporte_mensajes'
     ) then
    alter publication supabase_realtime add table public.soporte_mensajes;
  end if;
end;
$$;

commit;
