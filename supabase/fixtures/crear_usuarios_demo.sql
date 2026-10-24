-- =============================================================================
-- Mesora · Usuario y restaurante de PRUEBA (ejecutar AL FINAL, una sola vez)
-- =============================================================================
--
-- QUÉ HACE Y QUÉ NO HACE
-- Inserta el restaurante y los PERFILES en `public.usuarios`. Los usuarios de
-- Supabase Auth no se crean aquí: `auth.users` es de GoTrue y escribirlo a mano
-- deja filas sin `auth.identities`, que después no pueden iniciar sesión. Se
-- crean desde el panel (Authentication → Users → Add user) o con la Admin API,
-- y este script solo los enlaza por email.
--
-- POR QUÉ HAY DOS PASOS Y NO UNO
-- `usuarios.id` ES `auth.users.id` (ver 00_schema_base.sql). El perfil no tiene
-- contraseña ni sabe nadie: es la fila de negocio. Por eso el alta real de
-- meseros desde la app (crearPersonal) inserta el perfil y deja el usuario de
-- Auth para cuando el mesero entre por primera vez. Este script es el camino
-- corto para tener con qué probar la app hoy.
--
-- CÓMO USARLO
--   1. En Supabase → Authentication → Users → Add user, crea estos usuarios con
--      la casilla "Auto Confirm User" marcada (si no, el login falla con
--      "Email not confirmed").
--   2. Vuelve a este archivo, cambia SOLO el bloque de correos de abajo por los
--      que creaste.
--   3. Pégalo en el SQL Editor y ejecútalo.
--   4. La consulta del final dice qué quedó creado y qué falta.
--
-- ES IDEMPOTENTE
-- Se puede volver a ejecutar: el restaurante se busca por RUC y los perfiles por
-- id de Auth, así que no duplica nada. Volver a ejecutarlo solo completa el
-- `restaurante_id` de un super_admin que estuviera suelto.
-- =============================================================================

do $$
declare
  v_restaurante uuid;
  v_omitidos text[] := array[]::text[];
  v_fila record;
begin
  -- ---------------------------------------------------------------------------
  -- 1. Restaurante de prueba
  -- ---------------------------------------------------------------------------
  -- El RUC es el identificador del negocio en Perú (11 dígitos). Cámbialo por el
  -- real si ya lo tienes; el `if not exists` evita duplicarlo.
  insert into public.restaurantes (nombre, ruc, direccion, telefono, email_contacto)
  select 'Restaurante de Prueba', '20500000000', 'Av. Siempre Viva 742',
         '999999999', 'prueba@mesora.app'
   where not exists (
     select 1 from public.restaurantes where ruc = '20500000000'
   )
  returning id into v_restaurante;

  if v_restaurante is null then
    select id into v_restaurante
      from public.restaurantes where ruc = '20500000000';
  end if;

  -- ---------------------------------------------------------------------------
  -- 2. Perfiles enlazados a los usuarios de Auth
  -- ---------------------------------------------------------------------------
  -- Los cinco roles que la app distingue. Los tres últimos son los que usan el
  -- flujo real de caja (mesero toma la comanda, cocina o barra la preparan,
  -- cajero cobra); los dos primeros administran.
  for v_fila in
    select * from (values
      ('super_admin',       'super@prueba.app'),
      ('admin_restaurante', 'admin@prueba.app'),
      ('mesero',            'mesero@prueba.app'),
      ('cocina',            'cocina@prueba.app'),
      ('cajero',            'cajero@prueba.app')
    ) as t(rol, correo)
  loop
    -- Sin usuario de Auth no hay perfil: un `usuarios` fila sin su
    -- `auth.users` detrás no puede iniciar sesión y además rompería el login
    -- (el bootstrap de la app no encuentra nada). Se avisa y se sigue.
    if not exists (select 1 from auth.users where email = v_fila.correo) then
      v_omitidos := array_append(v_omitidos, v_fila.correo);
      continue;
    end if;

    insert into public.usuarios (id, restaurante_id, rol, nombre, email, activo)
    select a.id,
           -- El super_admin va con restaurante_id NULL a propósito: administra
           -- los locales desde fuera y no opera dentro de ninguno. Las policies
           -- de lectura global de `01_rls_completo.sql` lo contemplan.
           case when v_fila.rol = 'super_admin' then null else v_restaurante end,
           v_fila.rol,
           initcap(replace(v_fila.rol, '_', ' ')),
           v_fila.correo,
           true
      from auth.users a
     where a.email = v_fila.correo
    on conflict (id) do update
       set restaurante_id = excluded.restaurante_id,
           rol            = excluded.rol,
           nombre         = excluded.nombre,
           email          = excluded.email,
           activo         = true;
  end loop;

  if array_length(v_omitidos, 1) is not null then
    raise warning
      'Estos correos no tienen usuario de Supabase Auth y quedaron sin perfil: %. Crealos en Authentication → Add user con "Auto Confirm User" y vuelve a correr este script.',
      array_to_string(v_omitidos, ', ');
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. Comprobación
-- -----------------------------------------------------------------------------
-- Lo que importa es `existe_en_auth`: si dice false, ese perfil no puede
-- iniciar sesión aunque la fila exista (no hay usuario de Auth detrás).
select r.nombre as restaurante,
       u.rol,
       u.nombre as perfil,
       u.email,
       u.activo,
       exists (select 1 from auth.users a where a.id = u.id) as existe_en_auth
  from public.usuarios u
  left join public.restaurantes r on r.id = u.restaurante_id
 order by u.rol;

-- El usuario con el que conviene empezar: el admin del restaurante.
select a.email as correo_para_entrar,
       u.rol,
       r.nombre as restaurante
  from auth.users a
  join public.usuarios u on u.id = a.id
  left join public.restaurantes r on r.id = u.restaurante_id
 where a.email = 'admin@prueba.app';
