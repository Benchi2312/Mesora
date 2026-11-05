-- =============================================================================
-- SOPORTE (Admin del restaurante → Super Admin) — Mesora
-- =============================================================================
-- Tickets de soporte. El admin del restaurante los REPORTA desde su panel y el
-- super admin los gestiona (asigna, cambia de estado y cierra). El super admin
-- NO crea tickets desde su panel.
--
-- Seguridad:
--   * SELECT: el super admin ve todos; el `admin_restaurante` solo los de SU
--     restaurante (`mi_restaurante_id()`).
--   * INSERT: solo el `admin_restaurante`, y solo para su propio restaurante
--     (`restaurante_id = mi_restaurante_id()`).
--   * UPDATE: solo el super admin (gestión: estado, prioridad, responsable).
--   * Sin policy de DELETE: un ticket no se borra, se cierra (`estado`).
--   * Aditivo: no toca ninguna tabla existente.
-- =============================================================================

create table if not exists public.soporte_tickets (
  id uuid primary key default gen_random_uuid(),
  -- Código legible para mostrar en la UI (ej. TK-3F9A1C). Único por ticket.
  codigo text not null unique
    default ('TK-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))),
  -- Restaurante afectado (los tickets de plataforma pueden ir sin restaurante).
  restaurante_id uuid references public.restaurantes(id) on delete set null,
  -- Usuario que reporta o al que se refiere el ticket, si aplica.
  usuario_id uuid references public.usuarios(id) on delete set null,
  asunto text not null,
  descripcion text not null,
  prioridad text not null default 'media'
    check (prioridad in ('baja', 'media', 'alta', 'urgente')),
  estado text not null default 'abierto'
    check (estado in ('abierto', 'en_progreso', 'resuelto', 'cerrado')),
  -- Responsable de resolverlo (super administrador de la plataforma).
  responsable_id uuid references public.usuarios(id) on delete set null,
  responsable text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resuelto_at timestamptz
);

create index if not exists soporte_tickets_estado_idx
  on public.soporte_tickets (estado, prioridad, created_at desc);
create index if not exists soporte_tickets_restaurante_idx
  on public.soporte_tickets (restaurante_id, created_at desc);

comment on table public.soporte_tickets is
  'Tickets de soporte. El admin del restaurante los reporta; solo el super admin
  los ve todos y los gestiona. Un ticket no se borra: pasa por abierto →
  en_progreso → resuelto → cerrado.';

alter table public.soporte_tickets enable row level security;

-- Lectura: super admin (todos) o admin del restaurante (los suyos).
drop policy if exists soporte_tickets_select_super on public.soporte_tickets;
drop policy if exists soporte_tickets_select on public.soporte_tickets;
create policy soporte_tickets_select on public.soporte_tickets
  for select to authenticated
  using (
    public.soy_super_admin()
    or (
      public.tengo_rol(array['admin_restaurante'])
      and restaurante_id = public.mi_restaurante_id()
    )
  );

-- Alta: solo el admin del restaurante, y solo para su propio restaurante.
drop policy if exists soporte_tickets_insert_super on public.soporte_tickets;
drop policy if exists soporte_tickets_insert on public.soporte_tickets;
create policy soporte_tickets_insert on public.soporte_tickets
  for insert to authenticated
  with check (
    public.tengo_rol(array['admin_restaurante'])
    and restaurante_id = public.mi_restaurante_id()
  );

-- Gestión: solo el super admin.
drop policy if exists soporte_tickets_update_super on public.soporte_tickets;
drop policy if exists soporte_tickets_update on public.soporte_tickets;
create policy soporte_tickets_update on public.soporte_tickets
  for update to authenticated
  using (public.soy_super_admin())
  with check (public.soy_super_admin());
-- Sin policy de DELETE.

revoke all on public.soporte_tickets from anon;
grant select, insert, update on public.soporte_tickets to authenticated;
revoke delete on public.soporte_tickets from public, anon, authenticated;
revoke truncate on public.soporte_tickets from authenticated;

-- -----------------------------------------------------------------------------
-- updated_at + resuelto_at automáticos
-- -----------------------------------------------------------------------------
create or replace function public.soporte_ticket_touch()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at := now();
  -- Sella la fecha de resolución la primera vez que pasa a `resuelto`.
  if new.estado = 'resuelto' and old.estado <> 'resuelto' and new.resuelto_at is null then
    new.resuelto_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_soporte_ticket_touch on public.soporte_tickets;
create trigger trg_soporte_ticket_touch
  before update on public.soporte_tickets
  for each row execute function public.soporte_ticket_touch();

-- -----------------------------------------------------------------------------
-- Verificación (SQL Editor)
-- -----------------------------------------------------------------------------
select
  (select relrowsecurity from pg_class where oid = 'public.soporte_tickets'::regclass) as rls_ok,
  (select array_to_string(array_agg(cmd order by cmd), ', ') from pg_policies
     where schemaname = 'public' and tablename = 'soporte_tickets') as policies,
  (select count(*) = 0 from pg_policies
     where schemaname = 'public' and tablename = 'soporte_tickets' and cmd = 'DELETE') as sin_delete_ok,
  (select count(*) = 1 from pg_trigger
     where not tgisinternal and tgrelid = 'public.soporte_tickets'::regclass
       and tgname = 'trg_soporte_ticket_touch') as trigger_ok,
  (select has_table_privilege('anon', 'public.soporte_tickets', 'select')) as anon_select,
  (select has_table_privilege('authenticated', 'public.soporte_tickets', 'select')) as auth_select;
-- Esperado: rls_ok=true, policies=INSERT, SELECT, UPDATE,
-- sin_delete_ok=true, trigger_ok=true, anon_select=false, auth_select=true.
