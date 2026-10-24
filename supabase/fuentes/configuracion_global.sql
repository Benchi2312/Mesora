-- =============================================================================
-- CONFIGURACIÓN GLOBAL + ALERTAS (Super Admin) — Mesora
-- =============================================================================
-- Dos piezas aditivas:
--   1. `configuracion_global`: fila única (id = 1) con el nombre de Mesora,
--      contacto de soporte, logo e información general, y el precio mensual del
--      plan (único, editable): la landing pública lo lee; solo el super admin
--      lo edita (y cada cambio queda auditado por trigger).
--   2. `admin_alertas()`: RPC SECURITY DEFINER que devuelve las alertas
--      administrativas del panel (suscripciones por vencer/vencidas,
--      restaurantes suspendidos/nuevos, administradores nuevos y tickets
--      urgentes) como JSON, agregadas en la base.
--
-- Este archivo no hace DROP de datos, no desactiva RLS y es aditivo.
-- Dependencia: `soporte.sql` (usa soporte_tickets para las alertas).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1 · configuracion_global (fila única)
-- -----------------------------------------------------------------------------
create table if not exists public.configuracion_global (
  id integer primary key default 1 check (id = 1),
  nombre_app text not null default 'Mesora',
  correo_soporte text,
  telefono_soporte text,
  logo_url text,
  informacion text,
  -- Precio mensual (en soles) del plan único "Mesora Pro". Es la fuente de la
  -- verdad para la landing y el futuro checkout; el super admin lo edita desde
  -- el panel Configuración (quedando auditado por el trigger de abajo).
  precio_plan_mensual numeric not null default 120,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

-- Para bases ya creadas (aditivo): la columna con su default no pisa valores.
alter table public.configuracion_global
  add column if not exists precio_plan_mensual numeric not null default 120;

comment on column public.configuracion_global.precio_plan_mensual is
  'Precio mensual en soles del plan único Mesora Pro. Es editable desde el panel
  del super admin; la landing lo muestra en público.';

insert into public.configuracion_global (id, nombre_app)
values (1, 'Mesora')
on conflict (id) do nothing;

comment on table public.configuracion_global is
  'Configuración general de la plataforma (fila única id = 1): nombre, contacto
  de soporte, logo, información y precio mensual del plan. La lectura es pública
  (se muestra en la landing); la edición es exclusiva del super admin.';

alter table public.configuracion_global enable row level security;

-- Lectura pública: la landing muestra estos datos sin sesión.
drop policy if exists configuracion_global_select_public on public.configuracion_global;
create policy configuracion_global_select_public on public.configuracion_global
  for select using (true);

drop policy if exists configuracion_global_select_super on public.configuracion_global;
create policy configuracion_global_select_super on public.configuracion_global
  for select to authenticated using (public.soy_super_admin());

drop policy if exists configuracion_global_update_super on public.configuracion_global;
create policy configuracion_global_update_super on public.configuracion_global
  for update to authenticated
  using (public.soy_super_admin())
  with check (public.soy_super_admin());
-- Sin INSERT/DELETE desde el cliente: la fila se siembra aquí.

-- La landing es anónima y solo necesita el precio y el nombre. Se otorga
-- SELECT por COLUMNA (no sobre la tabla): así la anon key no puede leer
-- correo_soporte, telefono_soporte, informacion ni updated_by. RLS ya limita
-- las filas (id = 1), pero una policy no filtra columnas.
revoke all on public.configuracion_global from anon;
grant select (nombre_app, precio_plan_mensual) on public.configuracion_global to anon;
grant select, update on public.configuracion_global to authenticated;

-- El super admin es el único que edita, y solo estas columnas. Sin esto el
-- `grant update` de arriba permitiría tocar id/updated_by.
revoke update on public.configuracion_global from authenticated;
grant update (nombre_app, correo_soporte, telefono_soporte, logo_url, informacion, precio_plan_mensual)
  on public.configuracion_global to authenticated;
-- El `ALL` por defecto incluye TRUNCATE, que no pasa por RLS.
revoke truncate on public.configuracion_global from authenticated;

-- -----------------------------------------------------------------------------
-- 2 · updated_at + auditoría de la configuración
-- -----------------------------------------------------------------------------
create or replace function public.auditar_configuracion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_rol text;
  v_nombre text;
  v_campos text[] := '{}';
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  new.updated_at := now();
  new.updated_by := v_actor;

  if not (select public.soy_super_admin()) then
    return new;
  end if;

  if new.nombre_app is distinct from old.nombre_app then v_campos := array_append(v_campos, 'nombre_app'); end if;
  if new.correo_soporte is distinct from old.correo_soporte then v_campos := array_append(v_campos, 'correo_soporte'); end if;
  if new.telefono_soporte is distinct from old.telefono_soporte then v_campos := array_append(v_campos, 'telefono_soporte'); end if;
  if new.logo_url is distinct from old.logo_url then v_campos := array_append(v_campos, 'logo_url'); end if;
  if new.informacion is distinct from old.informacion then v_campos := array_append(v_campos, 'informacion'); end if;
  if new.precio_plan_mensual is distinct from old.precio_plan_mensual then v_campos := array_append(v_campos, 'precio_plan_mensual'); end if;

  if array_length(v_campos, 1) is null then
    return new;
  end if;

  if v_actor is not null then
    select u.rol::text, u.nombre into v_rol, v_nombre
      from public.usuarios u where u.id = v_actor;
  end if;

  insert into public.audit_logs
    (actor_id, actor_rol, actor_nombre, entidad, accion, descripcion, detalle)
  values
    (v_actor, v_rol, v_nombre, 'configuracion', 'configuracion_actualizar',
     'Actualizó la configuración global de Mesora',
     jsonb_build_object('campos', to_jsonb(v_campos)));

  return new;
end;
$$;

drop trigger if exists trg_auditar_configuracion on public.configuracion_global;
create trigger trg_auditar_configuracion
  before update on public.configuracion_global
  for each row execute function public.auditar_configuracion();

-- -----------------------------------------------------------------------------
-- 3 · admin_alertas(): alertas administrativas agregadas en la base
-- -----------------------------------------------------------------------------
create or replace function public.admin_alertas()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ahora timestamptz := now();
  v_limite timestamptz := now() + interval '7 days';
  v_res jsonb;
begin
  if not (select public.soy_super_admin()) then
    raise exception 'Solo el super administrador puede ver las alertas.'
      using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(payload order by orden, f desc), '[]'::jsonb)
    into v_res
    from (
      -- Suscripciones vencidas
      select jsonb_build_object(
          'id', 'venc-' || r.id, 'tipo', 'restaurante_vencido', 'nivel', 'critico',
          'titulo', 'Suscripción vencida',
          'detalle', r.nombre || ' tiene la suscripción vencida desde el ' ||
                     to_char(r.fecha_vencimiento, 'DD/MM/YYYY') || '.',
          'fecha', r.fecha_vencimiento,
          'restaurante_id', r.id, 'restaurante_nombre', r.nombre, 'referencia_id', r.id
        ) as payload, 1 as orden, r.fecha_vencimiento as f
        from public.restaurantes r
       where coalesce(r.suscripcion_activa, false)
         and r.fecha_vencimiento is not null
         and r.fecha_vencimiento < v_ahora

      union all
      -- Suscripciones por vencer (próximos 7 días)
      select jsonb_build_object(
          'id', 'porvencer-' || r.id, 'tipo', 'restaurante_por_vencer', 'nivel', 'advertencia',
          'titulo', 'Suscripción por vencer',
          'detalle', r.nombre || ' vence el ' || to_char(r.fecha_vencimiento, 'DD/MM/YYYY') || '.',
          'fecha', r.fecha_vencimiento,
          'restaurante_id', r.id, 'restaurante_nombre', r.nombre, 'referencia_id', r.id
        ), 2, r.fecha_vencimiento
        from public.restaurantes r
       where coalesce(r.suscripcion_activa, false)
         and r.fecha_vencimiento >= v_ahora
         and r.fecha_vencimiento <= v_limite

      union all
      -- Restaurantes suspendidos
      select jsonb_build_object(
          'id', 'susp-' || r.id, 'tipo', 'restaurante_suspendido', 'nivel', 'advertencia',
          'titulo', 'Restaurante suspendido',
          'detalle', r.nombre || ' tiene la suscripción suspendida.',
          'fecha', coalesce(r.fecha_vencimiento, r.created_at),
          'restaurante_id', r.id, 'restaurante_nombre', r.nombre, 'referencia_id', r.id
        ), 3, coalesce(r.fecha_vencimiento, r.created_at)
        from public.restaurantes r
       where not coalesce(r.suscripcion_activa, false)

      union all
      -- Restaurantes nuevos (últimos 7 días)
      select jsonb_build_object(
          'id', 'nuevo-' || r.id, 'tipo', 'restaurante_nuevo', 'nivel', 'info',
          'titulo', 'Nuevo restaurante',
          'detalle', r.nombre || ' se registró recientemente.',
          'fecha', r.created_at,
          'restaurante_id', r.id, 'restaurante_nombre', r.nombre, 'referencia_id', r.id
        ), 4, r.created_at
        from public.restaurantes r
       where r.created_at >= v_ahora - interval '7 days'

      union all
      -- Administradores nuevos (últimos 7 días)
      select jsonb_build_object(
          'id', 'admin-' || u.id, 'tipo', 'administrador_nuevo', 'nivel', 'info',
          'titulo', 'Nuevo administrador',
          'detalle', u.nombre || ' fue designado administrador' ||
                     coalesce(' de ' || rr.nombre, '') || '.',
          'fecha', u.created_at,
          'restaurante_id', u.restaurante_id, 'restaurante_nombre', rr.nombre, 'referencia_id', u.id
        ), 4, u.created_at
        from public.usuarios u
        left join public.restaurantes rr on rr.id = u.restaurante_id
       where u.rol::text = 'admin_restaurante'
         and u.created_at >= v_ahora - interval '7 days'

      union all
      -- Tickets urgentes sin resolver
      select jsonb_build_object(
          'id', 'tk-' || t.id, 'tipo', 'ticket_urgente', 'nivel', 'critico',
          'titulo', 'Ticket urgente',
          'detalle', t.codigo || ': ' || t.asunto,
          'fecha', t.created_at,
          'restaurante_id', t.restaurante_id, 'restaurante_nombre', rr.nombre, 'referencia_id', t.id
        ), 1, t.created_at
        from public.soporte_tickets t
        left join public.restaurantes rr on rr.id = t.restaurante_id
       where t.prioridad = 'urgente' and t.estado in ('abierto', 'en_progreso')
    ) s;

  return v_res;
end;
$$;

comment on function public.admin_alertas() is
  'Super admin: alertas administrativas agregadas (suscripciones vencidas/por
  vencer, restaurantes suspendidos/nuevos, administradores nuevos y tickets
  urgentes) como JSON. SECURITY DEFINER con control de rol.';

revoke execute on function public.admin_alertas() from public;
revoke execute on function public.admin_alertas() from anon;
grant execute on function public.admin_alertas() to authenticated;

-- -----------------------------------------------------------------------------
-- 4 · Verificación (SQL Editor)
-- -----------------------------------------------------------------------------
select
  (select relrowsecurity from pg_class where oid = 'public.configuracion_global'::regclass) as rls_ok,
  (select count(*) = 1 from public.configuracion_global where id = 1) as fila_unica_ok,
  (select precio_plan_mensual from public.configuracion_global where id = 1) as precio_plan,
  (select count(*) = 3 from pg_policies
     where schemaname = 'public' and tablename = 'configuracion_global') as policies_ok,
  (select count(*) = 1 from pg_trigger
     where not tgisinternal and tgrelid = 'public.configuracion_global'::regclass) as trigger_ok,
  (select has_column_privilege('anon', 'public.configuracion_global', 'precio_plan_mensual', 'select')) as anon_precio_ok,
  (select has_column_privilege('anon', 'public.configuracion_global', 'correo_soporte', 'select')) as anon_correo_ok,
  (select has_function_privilege('anon', 'public.admin_alertas()', 'execute')) as anon_alerta,
  (select has_function_privilege('authenticated', 'public.admin_alertas()', 'execute')) as auth_alerta;
-- Esperado: rls_ok=true, fila_unica_ok=true, precio_plan=120, policies_ok=true,
-- trigger_ok=true, anon_precio_ok=true, anon_correo_ok=false, anon_alerta=false,
-- auth_alerta=true.
