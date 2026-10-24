-- =============================================================================
-- Gestión de usuarios desde el panel del super admin
-- =============================================================================
-- POR QUÉ EXISTE ESTE ARCHIVO (y por qué NO se toca la RLS):
--
-- `usuarios` está diseñada para que cada admin escriba SOLO las filas de SU
-- restaurante: policies `usuarios_insert_admin` / `usuarios_update_admin` /
-- `usuarios_delete_admin` de 01_rls_completo.sql exigen
-- `restaurante_id = mi_restaurante_id()`. El super_admin no pertenece a ningún
-- restaurante (`usuarios.restaurante_id` es null), así que medido contra la
-- base real sus escrituras directas devuelven 0 filas o 42501. Mismo problema
-- —misma solución— que `admin_super_restaurante.sql`: funciones
-- `security definer` que el navegador llama por RPC con su propio JWT, la
-- función exige `soy_super_admin()` y solo entonces escribe. RLS intacta, sin
-- `service_role` en el frontend, sin INSERT/DELETE nuevos.
--
-- Qué NO hace este archivo:
--   * No borra usuarios jamás (la baja es `activo = false`, siempre reversible);
--     el borrado físico de perfiles es potestad de cada admin sobre SU gente y
--     la cascada de auth.users sigue siendo asunto de la base.
--   * No otorga `super_admin` a nadie: ningún rol sale del formulario, y la
--     designación de administrador solo puede bajar a `admin_restaurante`.
--   * No cambia `restaurante_id`: un usuario se designa administrador del
--     restaurante al que YA pertenece (el vínculo usuario → restaurante es el
--     límite de aislamiento y se conserva sin tocar).

-- =============================================================================
-- 1 · admin_cambiar_estado_usuario: activar / desactivar sin borrar
-- =============================================================================
-- Es LA acción de "Desactivar usuario" del panel. Desactivar no borra: solo
-- pone `activo = false`, y con eso `validar_acceso_restaurante` deja de dejar
-- entrar al usuario (chequeo de servidor que ya existe en
-- 00_seguridad_rpcs.sql y que la suite verificar-flujo ejercita en 17h-17n).
-- Dos salvaguardas propias de la plataforma:
--   * nadie se desactiva a sí mismo (evita que el super admin se deje fuera);
--   * nunca puede quedar la plataforma sin al menos un super admin activo.
create or replace function public.admin_cambiar_estado_usuario(
  p_usuario_id uuid,
  p_activo boolean
)
returns setof public.usuarios
language plpgsql
security definer
set search_path = public
as $$
declare
  v_u public.usuarios;
begin
  if p_usuario_id is null then
    raise exception 'Falta el usuario.';
  end if;
  if not (select public.soy_super_admin()) then
    raise exception 'Solo el super administrador puede gestionar usuarios.';
  end if;
  if p_activo is null then
    raise exception 'El estado del usuario no puede quedar vacío.';
  end if;

  select * into v_u from public.usuarios where id = p_usuario_id;
  if not found then
    raise exception 'Usuario no encontrado.';
  end if;

  if not p_activo and p_usuario_id = auth.uid() then
    raise exception 'No puedes desactivar tu propia cuenta.';
  end if;

  if not p_activo and v_u.rol = 'super_admin' then
    if not exists (
      select 1 from public.usuarios
       where rol = 'super_admin' and activo is true and id <> p_usuario_id
    ) then
      raise exception 'Debe quedar al menos un super administrador activo.';
    end if;
  end if;

  update public.usuarios u
     set activo = p_activo
   where u.id = p_usuario_id
  returning u.* into v_u;

  return next v_u;
end;
$$;

comment on function public.admin_cambiar_estado_usuario(uuid, boolean) is
  'Super admin: activa o desactiva un usuario de la plataforma sin borrarlo. No permite desactivarse a uno mismo ni dejar la plataforma sin super administradores activos. SECURITY DEFINER con control de rol.';

revoke execute on function public.admin_cambiar_estado_usuario(uuid, boolean) from public;
revoke execute on function public.admin_cambiar_estado_usuario(uuid, boolean) from anon;
grant execute on function public.admin_cambiar_estado_usuario(uuid, boolean) to authenticated;

-- =============================================================================
-- 2 · admin_designar_administrador: cambiar el administrador de un restaurante
-- =============================================================================
-- Designa a un usuario YA PERTENECIENTE al restaurante como
-- `admin_restaurante`. Solo se toca la columna `rol`: `restaurante_id` no se
-- mueve jamás (el usuario sigue siendo de SU local) y el administrador
-- anterior conserva su rol — pueden coexistir varios administradores por
-- restaurante, que es como opera la plataforma (el alta con admin incluido
-- viene de la Edge Function `crear-restaurante` y no retira a nadie).
create or replace function public.admin_designar_administrador(
  p_restaurante_id uuid,
  p_usuario_id uuid
)
returns setof public.usuarios
language plpgsql
security definer
set search_path = public
as $$
declare
  v_u public.usuarios;
begin
  if p_restaurante_id is null or p_usuario_id is null then
    raise exception 'Faltan el restaurante o el usuario.';
  end if;
  if not (select public.soy_super_admin()) then
    raise exception 'Solo el super administrador puede designar administradores.';
  end if;

  if not exists (select 1 from public.restaurantes where id = p_restaurante_id) then
    raise exception 'Restaurante no encontrado.';
  end if;

  select * into v_u from public.usuarios where id = p_usuario_id;
  if not found then
    raise exception 'Usuario no encontrado.';
  end if;

  if v_u.restaurante_id is distinct from p_restaurante_id then
    raise exception 'El usuario no pertenece a este restaurante.';
  end if;

  if coalesce(v_u.activo, false) = false then
    raise exception 'El usuario está desactivado: actívalo antes de designarlo administrador.';
  end if;

  if v_u.rol <> 'admin_restaurante' then
    update public.usuarios u
       set rol = 'admin_restaurante'
     where u.id = p_usuario_id
    returning u.* into v_u;
  end if;

  return next v_u;
end;
$$;

comment on function public.admin_designar_administrador(uuid, uuid) is
  'Super admin: designa a un usuario que YA pertenece al restaurante como admin_restaurante. Solo cambia la columna rol; restaurante_id se conserva y los administradores previos no se retiran (varios admins por restaurante). SECURITY DEFINER con control de rol.';

revoke execute on function public.admin_designar_administrador(uuid, uuid) from public;
revoke execute on function public.admin_designar_administrador(uuid, uuid) from anon;
grant execute on function public.admin_designar_administrador(uuid, uuid) to authenticated;

-- =============================================================================
-- 3 · admin_ultimos_accesos: último ingreso por usuario
-- =============================================================================
-- `auth.users.last_sign_in_at` vive en el schema `auth`, que PostgREST NO
-- expone al cliente: ni siquiera el super admin puede leerlo con un select
-- directo. Esta RPC security definer (dueño: postgres, que sí lee auth.users)
-- lo devuelve por usuario, y como exige ser super admin, ningún perfil ajeno
-- filtra horarios de ingreso. Null = la cuenta nunca inició sesión.
create or replace function public.admin_ultimos_accesos()
returns table (id uuid, ultimo_acceso timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (select public.soy_super_admin()) then
    raise exception 'Solo el super administrador puede ver los accesos.';
  end if;

  return query
    select u.id, a.last_sign_in_at
      from public.usuarios u
      left join auth.users a on a.id = u.id;
end;
$$;

comment on function public.admin_ultimos_accesos() is
  'Super admin: último acceso (auth.users.last_sign_in_at) de cada usuario de la plataforma; null si nunca inició sesión. SECURITY DEFINER con control de rol, porque el schema auth no está expuesto a PostgREST.';

revoke execute on function public.admin_ultimos_accesos() from public;
revoke execute on function public.admin_ultimos_accesos() from anon;
grant execute on function public.admin_ultimos_accesos() to authenticated;

-- =============================================================================
-- 4 · Verificación (SQL Editor)
-- =============================================================================

-- 4.1 · Las 3 RPC: `authenticated` ejecuta, `anon` NO.
select p.proname,
       has_function_privilege('anon', p.oid, 'execute') as anon_puede,
       has_function_privilege('authenticated', p.oid, 'execute') as authenticated_puede
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('admin_cambiar_estado_usuario', 'admin_designar_administrador', 'admin_ultimos_accesos')
 order by p.proname;
-- Esperado: anon_puede = false en las 3 filas.

-- 4.2 · La RLS de `usuarios` quedó EXACTAMENTE IGUAL (las 4 policies de
-- 01_rls_completo.sql, ninguna agregada ni quitada).
select c.relname as tabla,
       c.relrowsecurity as rls_activo,
       coalesce(array_to_string(array_agg(pol.polname order by pol.polname), ', '), '(ninguna)') as policies
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  left join pg_policy pol on pol.polrelid = c.oid
 where n.nspname = 'public'
   and c.relname = 'usuarios'
 group by c.relname, c.relrowsecurity;

-- 4.3 · El último acceso se lee desde auth.users (este schema NO está expuesto
-- a PostgREST, por eso la RPC de la sección 3). En el SQL Editor (postgres,
-- sin JWT) `soy_super_admin()` da false y la RPC rechaza; la lectura directa
-- equivalente para chequear la columna es:
--   select id, email, last_sign_in_at from auth.users order by email;
-- Null en last_sign_in_at = la cuenta nunca inició sesión.
