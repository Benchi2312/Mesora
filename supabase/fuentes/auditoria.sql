-- =============================================================================
-- AUDITORÍA (Super Admin) — Mesora
-- =============================================================================
-- Sistema append-only de registro de acciones importantes de la plataforma.
--
-- Diseño:
--   * `audit_logs`: una fila por acción, con actor (usuario + rol), restaurante
--     afectado (si corresponde), acción, fecha/hora y un `detalle` JSONB con la
--     información relevante. NUNCA se guardan contraseñas ni secretos.
--   * RLS: SOLO el super admin puede CONSULTAR la auditoría global
--     (`soy_super_admin()`); `anon` no toca nada. No hay policies de
--     INSERT/UPDATE/DELETE: las filas nacen únicamente desde funciones
--     SECURITY DEFINER (triggers) o desde la Edge Function con service_role.
--     Es una tabla append-only: la app jamás la modifica ni la borra.
--
-- ¿Cómo se registran las acciones?
--   * Triggers (SECURITY DEFINER) en `restaurantes`, `usuarios` y
--     `suscripciones_historial` capturan las escrituras hechas por el super
--     admin vía RPC (editar restaurante, cambiar rol, activar/desactivar
--     usuario, renovar/suspender/cambiar plan). El actor sale de `auth.uid()`.
--   * Las ALTAS de restaurante y de usuario se hacen en las Edge Functions
--     `crear-restaurante` / `crear-usuario` con service_role (ahí `auth.uid()`
--     es null), así que esas funciones llaman a `registrar_auditoria(...)` con
--     el actor ya verificado contra Auth. Ver `supabase/functions/*`.
--   * NO hay triggers de INSERT sobre `restaurantes`/`usuarios` para no
--     duplicar esas altas.
--
-- Este archivo no hace DROP de datos, no desactiva RLS y es aditivo.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1 · audit_logs
-- -----------------------------------------------------------------------------
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  -- Quién: id de Auth (puede ser null en acciones de sistema/servicio).
  actor_id uuid,
  -- Rol y nombre denormalizados: aunque la tabla usuarios cambiara, el registro
  -- cuenta quién era el actor en el momento de la acción.
  actor_rol text,
  actor_nombre text,
  -- Restaurante afectado, si la acción lo toca.
  restaurante_id uuid references public.restaurantes(id) on delete set null,
  restaurante_nombre text,
  -- Entidad afectada: 'restaurante' | 'usuario' | 'suscripcion' | 'configuracion'.
  entidad text,
  entidad_id uuid,
  -- Clave estable de la acción (ver src/lib/auditoria.ts): restaurante_crear,
  -- restaurante_editar, usuario_crear, usuario_cambiar_rol, usuario_estado,
  -- suscripcion_renovar, suscripcion_cambiar_plan, suscripcion_suspender,
  -- suscripcion_reactivar, suscripcion_ajuste, configuracion_actualizar,
  -- mesa_transferir_responsable, mesa_mover_consumo.
  accion text not null,
  -- Texto legible para la UI.
  descripcion text,
  -- Información relevante de la acción. NUNCA datos sensibles.
  detalle jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_created_idx
  on public.audit_logs (created_at desc);
create index if not exists audit_logs_restaurante_idx
  on public.audit_logs (restaurante_id, created_at desc);
create index if not exists audit_logs_accion_idx
  on public.audit_logs (accion, created_at desc);
create index if not exists audit_logs_actor_idx
  on public.audit_logs (actor_id, created_at desc);

comment on table public.audit_logs is
  'Registro append-only de acciones importantes de la plataforma. Solo el super
  admin puede consultarlo. Las filas nacen desde triggers SECURITY DEFINER o
  desde las Edge Functions con service_role; nunca desde el navegador.';

alter table public.audit_logs enable row level security;

drop policy if exists audit_logs_select_super on public.audit_logs;
create policy audit_logs_select_super on public.audit_logs
  for select to authenticated using (public.soy_super_admin());
-- Sin policies de escritura: la auditoría es inmutable desde el cliente.

revoke all on public.audit_logs from anon;
grant select on public.audit_logs to authenticated;
revoke truncate on public.audit_logs from authenticated;

-- -----------------------------------------------------------------------------
-- 2 · registrar_auditoria: alta explícita (la usan las Edge Functions)
-- -----------------------------------------------------------------------------
-- Recibe el actor ya verificado y resuelve rol/nombre/restaurante en la base.
-- Se ejecuta con SECURITY DEFINER para poder insertar sin RLS de escritura.
-- Permiso: SOLO service_role (las Edge Functions). `authenticated` y `anon`
-- quedan revocados: el navegador no puede escribir auditoría a mano.
create or replace function public.registrar_auditoria(
  p_actor_id uuid,
  p_accion text,
  p_restaurante_id uuid default null,
  p_entidad text default null,
  p_entidad_id uuid default null,
  p_descripcion text default null,
  p_detalle jsonb default null
) returns public.audit_logs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rol text;
  v_nombre text;
  v_rest_nombre text;
  v_row public.audit_logs;
begin
  if coalesce(trim(p_accion), '') = '' then
    raise exception 'La acción de auditoría es obligatoria.';
  end if;

  if p_actor_id is not null then
    select u.rol::text, u.nombre into v_rol, v_nombre
      from public.usuarios u where u.id = p_actor_id;
  end if;

  if p_restaurante_id is not null then
    select r.nombre into v_rest_nombre
      from public.restaurantes r where r.id = p_restaurante_id;
  end if;

  insert into public.audit_logs
    (actor_id, actor_rol, actor_nombre, restaurante_id, restaurante_nombre,
     entidad, entidad_id, accion, descripcion, detalle)
  values
    (p_actor_id, v_rol, v_nombre, p_restaurante_id, v_rest_nombre,
     p_entidad, p_entidad_id, p_accion, p_descripcion, p_detalle)
  returning * into v_row;

  return v_row;
end;
$$;

comment on function public.registrar_auditoria(uuid, text, uuid, text, uuid, text, jsonb) is
  'Alta explícita en audit_logs para las Edge Functions (service_role): recibe el
  actor ya verificado y denormaliza rol/nombre/restaurante. SECURITY DEFINER.
  Ejecución restringida a service_role.';

revoke execute on function public.registrar_auditoria(uuid, text, uuid, text, uuid, text, jsonb) from public;
revoke execute on function public.registrar_auditoria(uuid, text, uuid, text, uuid, text, jsonb) from anon;
revoke execute on function public.registrar_auditoria(uuid, text, uuid, text, uuid, text, jsonb) from authenticated;
grant execute on function public.registrar_auditoria(uuid, text, uuid, text, uuid, text, jsonb) to service_role;

-- -----------------------------------------------------------------------------
-- 3 · Trigger: edición de la ficha de un restaurante
-- -----------------------------------------------------------------------------
-- Solo registra cambios hechos por el super admin (el admin del local edita su
-- propia ficha con `actualizarRestaurante` y eso NO va a la auditoría global).
-- Los cambios de suscripción se registran aparte, desde suscripciones_historial.
create or replace function public.auditar_restaurante()
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
  if not (select public.soy_super_admin()) then
    return new;
  end if;

  if v_actor is not null then
    select u.rol::text, u.nombre into v_rol, v_nombre
      from public.usuarios u where u.id = v_actor;
  end if;

  if new.nombre is distinct from old.nombre then v_campos := array_append(v_campos, 'nombre'); end if;
  if new.ruc is distinct from old.ruc then v_campos := array_append(v_campos, 'ruc'); end if;
  if new.direccion is distinct from old.direccion then v_campos := array_append(v_campos, 'direccion'); end if;
  if new.telefono is distinct from old.telefono then v_campos := array_append(v_campos, 'telefono'); end if;
  if new.email_contacto is distinct from old.email_contacto then v_campos := array_append(v_campos, 'email_contacto'); end if;

  if array_length(v_campos, 1) is null then
    return new;
  end if;

  insert into public.audit_logs
    (actor_id, actor_rol, actor_nombre, restaurante_id, restaurante_nombre,
     entidad, entidad_id, accion, descripcion, detalle)
  values
    (v_actor, v_rol, v_nombre, new.id, new.nombre, 'restaurante', new.id,
     'restaurante_editar',
     format('Editó la ficha de «%s»', new.nombre),
     jsonb_build_object('campos', to_jsonb(v_campos)));

  return new;
end;
$$;

drop trigger if exists trg_auditar_restaurante on public.restaurantes;
create trigger trg_auditar_restaurante
  after update on public.restaurantes
  for each row execute function public.auditar_restaurante();

-- -----------------------------------------------------------------------------
-- 4 · Trigger: cambios de rol o de estado de un usuario
-- -----------------------------------------------------------------------------
create or replace function public.auditar_usuario()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_rol text;
  v_nombre text;
  v_accion text;
  v_desc text;
  v_detalle jsonb;
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;
  -- Cambios de personal hechos por el admin de un restaurante no entran a la
  -- auditoría de plataforma: solo los del super admin.
  if not (select public.soy_super_admin()) then
    return new;
  end if;

  if v_actor is not null then
    select u.rol::text, u.nombre into v_rol, v_nombre
      from public.usuarios u where u.id = v_actor;
  end if;

  if new.rol is distinct from old.rol then
    v_accion := 'usuario_cambiar_rol';
    v_desc := format('Cambió el rol de «%s»: %s → %s', new.nombre, old.rol, new.rol);
    v_detalle := jsonb_build_object('rol_anterior', old.rol, 'rol_nuevo', new.rol);
  elsif coalesce(new.activo, true) is distinct from coalesce(old.activo, true) then
    v_accion := 'usuario_estado';
    v_desc := format('%s al usuario «%s»',
      case when coalesce(new.activo, true) then 'Reactivó' else 'Desactivó' end,
      new.nombre);
    v_detalle := jsonb_build_object('activo', coalesce(new.activo, true));
  else
    return new;
  end if;

  insert into public.audit_logs
    (actor_id, actor_rol, actor_nombre, restaurante_id, restaurante_nombre,
     entidad, entidad_id, accion, descripcion, detalle)
  values
    (v_actor, v_rol, v_nombre, new.restaurante_id,
     (select r.nombre from public.restaurantes r where r.id = new.restaurante_id),
     'usuario', new.id, v_accion, v_desc, v_detalle);

  return new;
end;
$$;

drop trigger if exists trg_auditar_usuario on public.usuarios;
create trigger trg_auditar_usuario
  after update on public.usuarios
  for each row execute function public.auditar_usuario();

-- -----------------------------------------------------------------------------
-- 5 · Trigger: acciones de suscripción (historial append-only)
-- -----------------------------------------------------------------------------
-- `suscripciones_historial` ya registra renovación / cambio de plan / suspensión
-- / reactivación / ajuste. Este trigger lo refleja en la auditoría global.
create or replace function public.auditar_suscripcion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_rol text;
  v_nombre text;
  v_accion text;
  v_desc text;
begin
  if tg_op <> 'INSERT' then
    return new;
  end if;

  v_actor := coalesce(new.creado_por, auth.uid());
  if v_actor is not null then
    select u.rol::text, u.nombre into v_rol, v_nombre
      from public.usuarios u where u.id = v_actor;
  end if;

  v_accion := case new.accion
    when 'renovacion'    then 'suscripcion_renovar'
    when 'cambio_plan'   then 'suscripcion_cambiar_plan'
    when 'suspension'    then 'suscripcion_suspender'
    when 'reactivacion'  then 'suscripcion_reactivar'
    else 'suscripcion_ajuste'
  end;
  v_desc := case new.accion
    when 'renovacion'    then 'Renovó la suscripción'
    when 'cambio_plan'   then 'Cambió el plan de suscripción'
    when 'suspension'    then 'Suspendió la suscripción'
    when 'reactivacion'  then 'Reactivó la suscripción'
    else 'Ajustó la suscripción'
  end;
  v_desc := v_desc || format(' de «%s»',
    coalesce((select r.nombre from public.restaurantes r where r.id = new.restaurante_id), 'restaurante'));

  insert into public.audit_logs
    (actor_id, actor_rol, actor_nombre, restaurante_id, restaurante_nombre,
     entidad, entidad_id, accion, descripcion, detalle)
  values
    (v_actor, v_rol, v_nombre, new.restaurante_id,
     (select r.nombre from public.restaurantes r where r.id = new.restaurante_id),
     'suscripcion', new.id, v_accion, v_desc,
     jsonb_build_object('accion', new.accion, 'motivo', new.motivo));

  return new;
end;
$$;

drop trigger if exists trg_auditar_suscripcion on public.suscripciones_historial;
create trigger trg_auditar_suscripcion
  after insert on public.suscripciones_historial
  for each row execute function public.auditar_suscripcion();

-- -----------------------------------------------------------------------------
-- 6 · Verificación (SQL Editor)
-- -----------------------------------------------------------------------------
select
  (select relrowsecurity from pg_class where oid = 'public.audit_logs'::regclass) as rls_ok,
  (select count(*) = 1 from pg_policies
     where schemaname = 'public' and tablename = 'audit_logs' and cmd = 'SELECT') as policy_select_ok,
  (select count(*) = 0 from pg_policies
     where schemaname = 'public' and tablename = 'audit_logs'
       and cmd in ('INSERT', 'UPDATE', 'DELETE')) as sin_escritura_ok,
  (select count(*) = 3 from pg_trigger
     where not tgisinternal and tgrelid in
       ('public.restaurantes'::regclass,
        'public.usuarios'::regclass,
        'public.suscripciones_historial'::regclass)
       and tgname like 'trg_auditar_%') as triggers_ok,
  (select has_function_privilege('anon', 'public.registrar_auditoria(uuid,text,uuid,text,uuid,text,jsonb)', 'execute')) as anon_puede,
  (select has_function_privilege('authenticated', 'public.registrar_auditoria(uuid,text,uuid,text,uuid,text,jsonb)', 'execute')) as authenticated_puede,
  (select count(*) from public.audit_logs) as filas;
-- Esperado: rls_ok=true, policy_select_ok=true, sin_escritura_ok=true,
-- triggers_ok=true (los 3 de este archivo; el de configuración llega con su propio
-- archivo), anon_puede=false, authenticated_puede=false.
