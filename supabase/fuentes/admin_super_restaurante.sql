-- =============================================================================
-- Gestión de restaurantes desde el panel del super admin
-- =============================================================================
-- POR QUÉ EXISTE ESTE ARCHIVO (y por qué NO se toca la RLS):
--
-- `restaurantes` está diseñado para que SOLO el admin de cada cuenta escriba
-- sus filas: policy `restaurantes_update_admin` + `grant update` columnario de
-- 01_rls_completo.sql (solo nombre, ruc, direccion, telefono, email_contacto).
-- El super_admin, por arquitectura, no pertenece a ningún restaurante
-- (`usuarios.restaurante_id` es null), así que medido contra la base real:
--   * editar nombre/RUC/etc. desde su JWT devuelve 200 con 0 filas: la policy
--     `puedo_escribir_en(id, ['admin_restaurante'])` no lo deja pasar;
--   * tocar `suscripcion_activa` devuelve 42501 "permission denied": esos
--     campos no están en el grant columnario, precisamente para que ningún
--     admin se reactive a sí mismo.
--
-- La solución NO es ampliar el grant (le daría escritura de suscripción a
-- TODO usuario autenticado y dejaría la defensa en una sola policy) ni bajar
-- la RLS: son dos funciones `security definer` con la misma filosofía que el
-- resto del proyecto — el navegador llama por RPC con su propio JWT, la
-- función exige `soy_super_admin()` y solo entonces escribe. RLS intacta,
-- sin `service_role` en el frontend, sin INSERT/DELETE nuevos.
--
-- PRUEBA REAL (2026-10-08, con el JWT de super@prueba.app):
--   PATCH /rest/v1/restaurantes {suscripcion_activa:false} -> 42501
--   PATCH /rest/v1/restaurantes {nombre:"..."}             -> 200 []
-- Ambas vías cerradas; por eso la vía es RPC.

-- =============================================================================
-- 1 · admin_actualizar_restaurante: los datos administrativos de la ficha
-- =============================================================================
-- Reemplazo total de los 5 campos (el formulario del panel siempre carga los
-- valores actuales y manda los 5). Nulls: `nullif(trim(...), '')` para que un
-- campo vacío quede como null y no como ''.
create or replace function public.admin_actualizar_restaurante(
  p_restaurante_id uuid,
  p_nombre text,
  p_ruc text,
  p_direccion text,
  p_telefono text,
  p_email_contacto text
)
returns setof public.restaurantes
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_restaurante_id is null then
    raise exception 'Falta el restaurante a editar.';
  end if;
  if not (select public.soy_super_admin()) then
    raise exception 'Solo el super administrador puede editar restaurantes.';
  end if;
  if coalesce(trim(p_nombre), '') = '' then
    raise exception 'El nombre del restaurante no puede quedar vacío.';
  end if;

  return query
  update public.restaurantes r
     set nombre          = trim(p_nombre),
         ruc             = nullif(trim(coalesce(p_ruc, '')), ''),
         direccion       = nullif(trim(coalesce(p_direccion, '')), ''),
         telefono        = nullif(trim(coalesce(p_telefono, '')), ''),
         email_contacto  = nullif(trim(coalesce(p_email_contacto, '')), '')
   where r.id = p_restaurante_id
  returning r.*;
end;
$$;

comment on function public.admin_actualizar_restaurante(uuid, text, text, text, text, text) is
  'Super admin: edita los datos administrativos de un restaurante (nombre, RUC, dirección, teléfono, email). SECURITY DEFINER con control de rol: la RLS de la tabla no deja pasar al super_admin porque este no pertenece a ningún restaurante.';

-- OJO con los grants: en este proyecto las default privileges de Supabase
-- crean cada función CON `execute` directo para `anon`, `authenticated` y
-- `service_role` (se ve en el proacl de cualquier RPC existente: no basta con
-- revocar a PUBLIC). Se revoca a PUBLIC (por si acaso) y a `anon` expresamente;
-- `authenticated` es quien debe poder llamar y `service_role` queda como en el
-- resto de la base (solo uso servidor).
revoke execute on function public.admin_actualizar_restaurante(uuid, text, text, text, text, text) from public;
revoke execute on function public.admin_actualizar_restaurante(uuid, text, text, text, text, text) from anon;
grant execute on function public.admin_actualizar_restaurante(uuid, text, text, text, text, text) to authenticated;

-- =============================================================================
-- 2 · admin_cambiar_suscripcion: activar / desactivar y vencimiento
-- =============================================================================
-- Es LA acción de "Desactivar restaurante" del panel. Desactivar NO borra:
-- solo pone `suscripcion_activa = false`, y con eso la arquitectura actual
-- hace el resto: `suSuscripcionVencida()` manda a todos los roles no
-- super_admin a la pantalla de suscripción vencida, y las policies de
-- escritura (`puedo_escribir_en` → `suscripcion_vigente`) dejan de dejar
-- operar al restaurante. Los datos, usuarios y historial quedan intactos.
-- Lo mismo a la inversa para reactivar.
-- Cuando existe la tabla `suscripciones_historial` (suscripciones_super_admin.sql)
-- cada cambio real queda registrado ahí como suspensión / reactivación / ajuste.
create or replace function public.admin_cambiar_suscripcion(
  p_restaurante_id uuid,
  p_activa boolean,
  p_fecha_vencimiento timestamptz
)
returns setof public.restaurantes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prev public.restaurantes;
  v_r public.restaurantes;
  v_accion text;
begin
  if p_restaurante_id is null then
    raise exception 'Falta el restaurante.';
  end if;
  if not (select public.soy_super_admin()) then
    raise exception 'Solo el super administrador puede cambiar suscripciones.';
  end if;
  if p_activa is null then
    raise exception 'El estado de la suscripción no puede quedar vacío.';
  end if;

  select * into v_prev
    from public.restaurantes
   where id = p_restaurante_id;
  if not found then
    raise exception 'Restaurante no encontrado.';
  end if;

  update public.restaurantes r
     set suscripcion_activa = p_activa,
         fecha_vencimiento  = p_fecha_vencimiento
   where r.id = p_restaurante_id
  returning r.* into v_r;

  if to_regclass('public.suscripciones_historial') is not null
     and (v_prev.suscripcion_activa is distinct from v_r.suscripcion_activa
          or v_prev.fecha_vencimiento is distinct from v_r.fecha_vencimiento) then
    v_accion := case
      when v_prev.suscripcion_activa and not v_r.suscripcion_activa then 'suspension'
      when not v_prev.suscripcion_activa and v_r.suscripcion_activa then 'reactivacion'
      else 'ajuste'
    end;
    insert into public.suscripciones_historial
      (restaurante_id, accion, plan_id, plan_anterior_id,
       fecha_inicio, fecha_vencimiento, suscripcion_activa, motivo, creado_por)
    values
      (v_r.id, v_accion, v_r.plan_id, v_r.plan_id,
       v_r.fecha_inicio, v_r.fecha_vencimiento, v_r.suscripcion_activa,
       case when v_accion = 'ajuste'
            then 'Ajuste de vencimiento desde la ficha del restaurante'
       end,
       null);
  end if;

  return next v_r;
end;
$$;

comment on function public.admin_cambiar_suscripcion(uuid, boolean, timestamptz) is
  'Super admin: activa o desactiva la suscripción de un restaurante y fija su fecha de vencimiento (null = sin vencimiento). Desactivar no borra nada: bloquea el acceso de los roles de ese restaurante vía suscripcion_vigente/suSuscripcionVencida. Si existe suscripciones_historial, cada cambio real deja fila (suspension/reactivacion/ajuste). SECURITY DEFINER con control de rol.';

revoke execute on function public.admin_cambiar_suscripcion(uuid, boolean, timestamptz) from public;
revoke execute on function public.admin_cambiar_suscripcion(uuid, boolean, timestamptz) from anon;
grant execute on function public.admin_cambiar_suscripcion(uuid, boolean, timestamptz) to authenticated;

-- =============================================================================
-- 3 · Verificación (SQL Editor)
-- =============================================================================

-- 3.1 · `authenticated` ejecuta las RPC de gestión; `anon`, NO.
select p.proname,
       has_function_privilege('anon', p.oid, 'execute') as anon_puede,
       has_function_privilege('authenticated', p.oid, 'execute') as authenticated_puede
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('admin_actualizar_restaurante', 'admin_cambiar_suscripcion')
 order by p.proname;
-- Esperado: anon_puede = false en las dos filas.

-- 3.2 · La RLS de `restaurantes` quedó EXACTAMENTE igual (las 2 policies
-- originales de 01_rls_completo.sql, ninguna agregada ni quitada).
select c.relname as tabla,
       c.relrowsecurity as rls_activo,
       coalesce(array_to_string(array_agg(pol.polname order by pol.polname), ', '), '(ninguna)') as policies
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  left join pg_policy pol on pol.polrelid = c.oid
 where n.nspname = 'public'
   and c.relname = 'restaurantes'
 group by c.relname, c.relrowsecurity;

-- 3.3 · El grant columnario de `authenticated` sigue cerrado: suscripcion_activa
-- y fecha_vencimiento tienen que dar false (si dieran true, un admin de cuenta
-- podría reactivarse solo desde la app y este archivo no hizo falta).
select a.attname as columna,
       has_column_privilege('authenticated', 'public.restaurantes', a.attname, 'update') as puede_actualizar
  from pg_attribute a
 where a.attrelid = 'public.restaurantes'::regclass
   and a.attnum > 0
   and not a.attisdropped
 order by a.attname;
