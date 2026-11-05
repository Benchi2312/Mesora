-- =============================================================================
-- SUSCRIPCIONES (Super Admin) — Mesora
-- =============================================================================
-- Reutiliza lo que ya existe y agrega SOLO lo mínimo:
--
--   * restaurantes.suscripcion_activa + fecha_vencimiento → siguen siendo la
--     fuente de verdad del estado (la RLS y suSuscripcionVencida ya los leen).
--     Estados derivados en frontend: activa / por vencer / vencida / suspendida
--     ("suspendida" = suscripcion_activa = false; "por vencer" = vencimiento
--     dentro de la ventana de DIAS_PARA_VENCER, nunca se guarda en columna).
--   * planes (tabla catálogo): UN SOLO plan activo "Mesora Pro" (clave
--     `mesora_pro`). El precio mensual NO vive aquí: es `configuracion_global.
--     precio_plan_mensual` (editable desde el panel). Los planes antiguos
--     (Básico/Profesional/Premium) quedan como filas inactivas de catálogo
--     para que el historial siga resolviendo sus nombres.
--   * restaurantes.plan_id (FK, default = Mesora Pro) + fecha_inicio (backfill
--     desde created_at). Aditivo: no toca columnas existentes ni RLS.
--   * suscripciones_historial: auditoría append-only de cada acción de
--     suscripción (renovar / cambiar plan / suspender / reactivar / ajuste).
--     Nunca se borra desde la aplicación.
--
-- Seguridad: las 4 RPCs son SECURITY DEFINER con control de rol
-- `soy_super_admin()` (igual que admin_actualizar_restaurante); RLS de
-- restaurantes intacta y el grant UPDATE de authenticated sigue limitado a
-- las 5 columnas de siempre (plan_id y fecha_inicio NO se conceden: los
-- administradores de restaurante no pueden modificar su propia suscripción).
--
-- Este archivo no hace DROP, no desactiva RLS y no modifica INSTALL.sql.
-- Dependencia de orden: `admin_cambiar_suscripcion` (definida en
-- admin_super_restaurante.sql) registra en suscripciones_historial cuando la
-- tabla existe; si re-ejecutas ese archivo, vuelve a correr este para dejar
-- la versión completa de las RPCs nuevas.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1 · planes: catálogo con un único plan activo (precio vive en configuración)
-- -----------------------------------------------------------------------------
create table if not exists public.planes (
  id uuid primary key default gen_random_uuid(),
  clave text not null unique,
  nombre text not null,
  orden integer not null default 0,
  -- Preparados para cuando se definan; NULL = todavía sin definir.
  precio_mensual numeric,
  max_usuarios integer,
  duracion_dias integer,
  funcionalidades jsonb,
  -- false = plan retirado: se conserva en el catálogo para que el historial
  -- siga resolviendo su nombre, pero no se puede asignar a ningún restaurante.
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.planes
  add column if not exists activo boolean not null default true;

comment on table public.planes is
  'Catálogo de planes de suscripción de Mesora. Activo: solo el plan único
  Mesora Pro (su precio mensual editable vive en configuracion_global).
  `activo = false` retira un plan sin borrar su fila (el historial lo usa).';

alter table public.planes enable row level security;

drop policy if exists planes_select on public.planes;
create policy planes_select on public.planes
  for select to authenticated using (true);
-- Sin policies de escritura: nadie administra los planes desde el cliente.

revoke all on public.planes from anon;
revoke truncate on public.planes from authenticated;

-- Siembra: el plan único activo y (para bases ya pobladas) el retiro de los
-- planes antiguos sin borrarlos ni romper las FK del historial.
insert into public.planes (clave, nombre, orden) values
  ('mesora_pro', 'Mesora Pro', 1)
on conflict (clave) do nothing;

do $$
declare
  v_pro uuid;
begin
  select id into v_pro from public.planes where clave = 'mesora_pro';
  if v_pro is null then
    raise exception 'No existe el plan "mesora_pro": revisar la siembra de planes.';
  end if;

  -- Retiran los planes heredados (Básico/Profesional/Premium) conservando su
  -- fila para que el historial de suscripciones siga resolviendo el nombre.
  update public.planes
     set activo = false, orden = orden + 10
   where clave in ('basico', 'profesional', 'premium');
end $$;

-- -----------------------------------------------------------------------------
-- 2 · restaurantes.plan_id + fecha_inicio (aditivo, con backfill)
-- -----------------------------------------------------------------------------
alter table public.restaurantes
  add column if not exists plan_id uuid references public.planes(id);

alter table public.restaurantes
  add column if not exists fecha_inicio timestamptz;

do $$
declare
  v_pro uuid;
begin
  select id into v_pro from public.planes where clave = 'mesora_pro';
  if v_pro is null then
    raise exception 'No existe el plan mesora_pro: revisar la siembra de planes.';
  end if;

  -- Backfill: los restaurantes existentes pasan al plan único y su periodo
  -- de suscripción comienza cuando se registraron.
  update public.restaurantes set plan_id = v_pro where plan_id is null;
  update public.restaurantes set plan_id = v_pro where plan_id is not null;
  update public.restaurantes set fecha_inicio = created_at where fecha_inicio is null;

  execute format('alter table public.restaurantes alter column plan_id set default %L', v_pro);
  execute 'alter table public.restaurantes alter column plan_id set not null';
  execute 'alter table public.restaurantes alter column fecha_inicio set default now()';
  execute 'alter table public.restaurantes alter column fecha_inicio set not null';
end $$;

comment on column public.restaurantes.plan_id is
  'Plan de suscripción vigente (FK a planes). Solo lo cambia el super admin
  vía suscripciones_cambiar_plan: el grant UPDATE de authenticated no incluye
  esta columna.';
comment on column public.restaurantes.fecha_inicio is
  'Inicio del periodo de suscripción vigente. Lo reinicia una renovación que
  arranca un periodo nuevo (vencida/suspendida); una suspensión pausa el
  acceso sin reiniciarlo.';

-- -----------------------------------------------------------------------------
-- 3 · suscripciones_historial: auditoría append-only (no se borra jamás)
-- -----------------------------------------------------------------------------
create table if not exists public.suscripciones_historial (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes(id) on delete cascade,
  accion text not null check (accion in
    ('renovacion', 'cambio_plan', 'suspension', 'reactivacion', 'ajuste')),
  plan_id uuid references public.planes(id),
  plan_anterior_id uuid references public.planes(id),
  fecha_inicio timestamptz,
  fecha_vencimiento timestamptz,
  suscripcion_activa boolean,
  motivo text,
  creado_por uuid,
  created_at timestamptz not null default now()
);

-- La identidad que queda en el historial se toma de la sesión verificada.
-- `p_creado_por` se mantiene temporalmente en la firma de las RPC por
-- compatibilidad con clientes anteriores, pero no se confía en su valor.
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

create index if not exists suscripciones_historial_rid_idx
  on public.suscripciones_historial (restaurante_id, created_at desc);

comment on table public.suscripciones_historial is
  'Historial de acciones de suscripción por restaurante, en orden append-only:
  cada renovación, cambio de plan, suspensión o reactivación deja una fila con
  el estado resultante. La aplicación nunca borra ni actualiza estas filas.';

alter table public.suscripciones_historial enable row level security;

drop policy if exists historial_select on public.suscripciones_historial;
create policy historial_select on public.suscripciones_historial
  for select to authenticated using (public.soy_super_admin());
-- Sin policy de escritura: las filas solo nacen desde las RPCs SECURITY DEFINER.

revoke all on public.suscripciones_historial from anon;
revoke truncate on public.suscripciones_historial from authenticated;

-- -----------------------------------------------------------------------------
-- 4 · RPCs de administración (solo super admin; SECURITY DEFINER)
-- -----------------------------------------------------------------------------
create or replace function public.suscripciones_renovar(
  p_restaurante_id uuid,
  p_fecha_vencimiento timestamptz,
  p_creado_por uuid default null
) returns setof public.restaurantes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_r public.restaurantes;
begin
  if not public.soy_super_admin() then
    raise exception 'Solo el super administrador puede administrar suscripciones.'
      using errcode = '42501';
  end if;
  if p_fecha_vencimiento is null then
    raise exception 'Debe indicar la nueva fecha de vencimiento.';
  end if;

  -- Renovar con periodo terminado (vencida/suspendida) arranca un periodo
  -- nuevo (fecha_inicio = ahora); con periodo vigente solo se extiende.
  update public.restaurantes
     set suscripcion_activa = true,
         fecha_vencimiento = p_fecha_vencimiento,
         fecha_inicio = case
           when fecha_vencimiento is null
             or fecha_vencimiento < now()
             or suscripcion_activa = false
           then now()
           else fecha_inicio
         end
   where id = p_restaurante_id
   returning * into v_r;

  if not found then
    raise exception 'Restaurante no encontrado.';
  end if;

  insert into public.suscripciones_historial
    (restaurante_id, accion, plan_id, plan_anterior_id,
     fecha_inicio, fecha_vencimiento, suscripcion_activa, creado_por)
  values
    (v_r.id, 'renovacion', v_r.plan_id, v_r.plan_id,
     v_r.fecha_inicio, v_r.fecha_vencimiento, v_r.suscripcion_activa, p_creado_por);

  return next v_r;
end;
$$;

comment on function public.suscripciones_renovar(uuid, timestamptz, uuid) is
  'Super admin: renueva la suscripción fijando una nueva fecha de vencimiento
  (y reactivándola). Si el periodo anterior había terminado, fecha_inicio pasa
  a ahora. Registra en suscripciones_historial. SECURITY DEFINER con control
  de rol.';

create or replace function public.suscripciones_cambiar_plan(
  p_restaurante_id uuid,
  p_plan_id uuid,
  p_creado_por uuid default null
) returns setof public.restaurantes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_anterior uuid;
  v_r public.restaurantes;
begin
  if not public.soy_super_admin() then
    raise exception 'Solo el super administrador puede administrar suscripciones.'
      using errcode = '42501';
  end if;
  if not exists (select 1 from public.planes where id = p_plan_id and activo) then
    raise exception 'Plan no encontrado.';
  end if;

  select plan_id into v_anterior
    from public.restaurantes
   where id = p_restaurante_id;
  if not found then
    raise exception 'Restaurante no encontrado.';
  end if;

  update public.restaurantes
     set plan_id = p_plan_id
   where id = p_restaurante_id
   returning * into v_r;

  insert into public.suscripciones_historial
    (restaurante_id, accion, plan_id, plan_anterior_id,
     fecha_inicio, fecha_vencimiento, suscripcion_activa, creado_por)
  values
    (v_r.id, 'cambio_plan', v_r.plan_id, v_anterior,
     v_r.fecha_inicio, v_r.fecha_vencimiento, v_r.suscripcion_activa, p_creado_por);

  return next v_r;
end;
$$;

comment on function public.suscripciones_cambiar_plan(uuid, uuid, uuid) is
  'Super admin: cambia el plan de un restaurante. El plan anterior queda
  registrado en suscripciones_historial (no se borra información histórica).
  SECURITY DEFINER con control de rol.';

create or replace function public.suscripciones_suspender(
  p_restaurante_id uuid,
  p_motivo text default null,
  p_creado_por uuid default null
) returns setof public.restaurantes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_r public.restaurantes;
begin
  if not public.soy_super_admin() then
    raise exception 'Solo el super administrador puede administrar suscripciones.'
      using errcode = '42501';
  end if;

  update public.restaurantes
     set suscripcion_activa = false
   where id = p_restaurante_id
   returning * into v_r;

  if not found then
    raise exception 'Restaurante no encontrado.';
  end if;

  insert into public.suscripciones_historial
    (restaurante_id, accion, plan_id, plan_anterior_id,
     fecha_inicio, fecha_vencimiento, suscripcion_activa, motivo, creado_por)
  values
    (v_r.id, 'suspension', v_r.plan_id, v_r.plan_id,
     v_r.fecha_inicio, v_r.fecha_vencimiento, v_r.suscripcion_activa,
     nullif(trim(p_motivo), ''), p_creado_por);

  return next v_r;
end;
$$;

comment on function public.suscripciones_suspender(uuid, text, uuid) is
  'Super admin: suspende la suscripción (suscripcion_activa = false) sin tocar
  fechas ni datos: los roles del restaurante quedan bloqueados por RLS y la
  pantalla de suscripción vencida. Motivo opcional guardado en el historial.
  SECURITY DEFINER con control de rol.';

create or replace function public.suscripciones_reactivar(
  p_restaurante_id uuid,
  p_fecha_vencimiento timestamptz default null,
  p_creado_por uuid default null
) returns setof public.restaurantes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_r public.restaurantes;
begin
  if not public.soy_super_admin() then
    raise exception 'Solo el super administrador puede administrar suscripciones.'
      using errcode = '42501';
  end if;

  -- La suspensión pausa el acceso pero no reinicia el periodo: fecha_inicio
  -- solo cambia si quien renueva envía una fecha nueva (caso vencida).
  update public.restaurantes
     set suscripcion_activa = true,
         fecha_vencimiento = coalesce(p_fecha_vencimiento, fecha_vencimiento)
   where id = p_restaurante_id
   returning * into v_r;

  if not found then
    raise exception 'Restaurante no encontrado.';
  end if;

  insert into public.suscripciones_historial
    (restaurante_id, accion, plan_id, plan_anterior_id,
     fecha_inicio, fecha_vencimiento, suscripcion_activa, creado_por)
  values
    (v_r.id, 'reactivacion', v_r.plan_id, v_r.plan_id,
     v_r.fecha_inicio, v_r.fecha_vencimiento, v_r.suscripcion_activa, p_creado_por);

  return next v_r;
end;
$$;

comment on function public.suscripciones_reactivar(uuid, timestamptz, uuid) is
  'Super admin: reactiva la suscripción suspendida. Si se envía una fecha,
  se usa como nuevo vencimiento (obligatorio práctico cuando la anterior ya
  venció). SECURITY DEFINER con control de rol.';

revoke execute on function public.suscripciones_renovar(uuid, timestamptz, uuid) from public;
revoke execute on function public.suscripciones_renovar(uuid, timestamptz, uuid) from anon;
revoke execute on function public.suscripciones_cambiar_plan(uuid, uuid, uuid) from public;
revoke execute on function public.suscripciones_cambiar_plan(uuid, uuid, uuid) from anon;
revoke execute on function public.suscripciones_suspender(uuid, text, uuid) from public;
revoke execute on function public.suscripciones_suspender(uuid, text, uuid) from anon;
revoke execute on function public.suscripciones_reactivar(uuid, timestamptz, uuid) from public;
revoke execute on function public.suscripciones_reactivar(uuid, timestamptz, uuid) from anon;

grant execute on function public.suscripciones_renovar(uuid, timestamptz, uuid) to authenticated;
grant execute on function public.suscripciones_cambiar_plan(uuid, uuid, uuid) to authenticated;
grant execute on function public.suscripciones_suspender(uuid, text, uuid) to authenticated;
grant execute on function public.suscripciones_reactivar(uuid, timestamptz, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 5 · Verificaciones (si esta fila llega completa, todo lo anterior corrió)
-- -----------------------------------------------------------------------------
select
  (select count(*) = 1 from public.planes
    where clave = 'mesora_pro' and activo)                          as planes_ok,
  (select count(*) = 0 from public.planes
    where activo and clave <> 'mesora_pro')                         as unico_activo_ok,
  (select count(*) = 0 from public.restaurantes where plan_id is null
                                                          or fecha_inicio is null) as backfill_ok,
  (select bool_and(relrowsecurity) from pg_class
    where oid in ('public.planes'::regclass, 'public.suscripciones_historial'::regclass))
                                                                              as rls_ok,
  (select count(*) = 2 from pg_policies
    where schemaname = 'public' and tablename in ('planes', 'suscripciones_historial')
      and cmd = 'SELECT')                                                    as policies_ok,
  (select count(*) = 4 from pg_proc
    where proname in ('suscripciones_renovar', 'suscripciones_cambiar_plan',
                      'suscripciones_suspender', 'suscripciones_reactivar'))
                                                                              as rpcs_ok,
  (select count(*) = 4 from pg_proc p
    where p.proname like 'suscripciones_%'
      and p.proacl is not null and p.proacl::text like '%authenticated%')
                                                                              as grants_ok,
  (select count(*) = 0 from information_schema.role_column_grants
    where table_schema = 'public' and table_name = 'restaurantes'
      and privilege_type = 'UPDATE' and grantee = 'authenticated'
      and column_name in ('plan_id', 'fecha_inicio', 'suscripcion_activa',
                          'fecha_vencimiento'))                              as columnas_cerradas_ok,
  (select count(*) from public.suscripciones_historial)                      as historial_filas;
