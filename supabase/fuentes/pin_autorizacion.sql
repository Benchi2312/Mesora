-- Mesora · PIN de autorización + anulación de cobros.
--
-- PROBLEMA QUE RESUELVE
-- Con la anulación de ítems, un mesero podía quitar productos de una comanda
-- abierta sin que nadie se entere: la cuenta sale más baja y el restaurante
-- cobra de menos. Lo mismo, en mayor escala, con el cobro: una boleta ya emitida
-- es un documento contable y no se puede borrar desde la app.
--
-- La regla que se impone: las dos acciones que tocan dinero para menos
-- (anular un ítem y anular un cobro) exigen el PIN del restaurante cuando el
-- restaurante lo configuró. El PIN lo define el Admin y nadie más lo puede ver
-- ni cambiar.
--
-- POR QUÉ UNA TABLA PROPIA Y NO UNA COLUMNA EN `restaurantes`
-- El hash del PIN no puede vivir en una columna de `restaurantes`: cualquier
-- policy de lectura que abre esa tabla (mesero, cocina, cajero) empezaría a
-- devolver el hash a todo el mundo. En una tabla aparte se puede cerrar del todo:
-- `01_rls_completo.sql` la deja SIN policies, así que el hash no sale de la base
-- por ninguna vía de cliente, ni para el admin. El admin solo usa
-- `tiene_pin_autorizacion`, que devuelve un booleano.
--
-- POR QUÉ UN HASH Y NO EL PIN EN CLARO
-- El PIN es una contraseña corta. Guardarla en claro convertiría una fuga de la
-- tabla (un dump, un log, una policy mal escrita) en la exposición del PIN de
-- todos los restaurantes. Se guarda con `crypt` (bcrypt) de pgcrypto: el
-- servidor compara sin poder recuperar el valor.
--
-- POR QUÉ "SIN PIN CONFIGURADO" NO BLOQUEA NADA
-- Los restaurantes que ya usan Mesora no tienen PIN: si lo exigiéramos, el día
-- que se aplicó este cambio se les rompería el anular ítems sin avisar. El
-- bloqueo se activa cuando el Admin configura el PIN, y se documenta en la UI
-- ("si no hay PIN, cualquiera del restaurante puede anular").
--
-- REQUISITOS: corre después del schema base (restaurantes, usuarios) y de
-- 00_seguridad_rpcs.sql (todas las RPCs llaman a validar_acceso_restaurante).
-- Requiere la extensión pgcrypto, que provee `crypt`/`gen_salt`.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. Tabla del PIN
-- ---------------------------------------------------------------------------
create table if not exists public.restaurante_pins (
  restaurante_id uuid primary key references public.restaurantes (id) on delete cascade,
  -- Hash bcrypt. Nunca se devuelve al cliente: ni siquiera al Admin.
  pin_hash text not null,
  actualizado_at timestamptz not null default now(),
  actualizado_por uuid references public.usuarios (id)
);

comment on table public.restaurante_pins is
  'PIN de autorización del restaurante (hash bcrypt). Lo configura y lo rota el Admin; los demás roles no pueden leerlo.';

alter table public.restaurante_pins enable row level security;

-- Las policies NO están en este archivo: viven en `01_rls_completo.sql`
-- (sección 13), y ese archivo borra explícitamente las dos que estaban aquí
-- (`restaurante_pins_select_admin` y `restaurante_pins_write_admin`).
--
-- Por qué desaparecen las dos, y no solo se consumman:
--   * `restaurante_pins_write_admin` era un `for all` para el admin. La
--     escritura tiene que pasar por `configurar_pin_autorizacion`, que valida que
--     el PIN sea de 4 a 6 dígitos, genera el hash con `gen_salt` y anota quién
--     lo cambió. Con el `for all`, el admin podía escribir el `pin_hash` a mano
--     o borrar la fila por su cuenta, sin dejar rastro.
--   * `restaurante_pins_select_admin` tampoco hace falta: la UI solo necesita
--     saber SI hay PIN, y eso lo responde `tiene_pin_autorizacion`, que devuelve
--     un booleano. Con RLS habilitado y sin policies de lectura, el hash no sale
--     de la base por ninguna vía de cliente, ni siquiera para el admin.
-- (La lectura por RPC de la tabla, si algún día hiciera falta, se haría con una
-- función `security definer` que devuelva lo justo, como hace
-- `tiene_pin_autorizacion`.)

-- ---------------------------------------------------------------------------
-- 2. Validación del PIN (la pieza que reutilizan todas las RPCs sensibles)
-- ---------------------------------------------------------------------------
-- `void`: no falla si el restaurante no tiene PIN. Si tiene, compara el PIN
-- recibido contra el hash con `crypt` (bcrypt compara sin poder recuperar el
-- valor).
--
-- Esta RPC NO la puede ejecutar el cliente (ver sección 4). Es la pieza que
-- reutilizan por dentro las RPCs de anulación, que corren como SECURITY DEFINER.
-- Si quedara ejecutable por `authenticated` sería un oráculo de fuerza bruta
-- del PIN de OTROS restaurantes: `validar_pin_autorizacion` se puede llamar con
-- cualquier `p_restaurante_id` y la única diferencia entre acierto y fallo es
-- si hay excepción. Con el permiso cerrado, probar PINs solo es posible a través
-- de una acción real, que además valida rol y estado del restaurante.
--
-- No es un secreto que el restaurante tenga PIN: la UI tiene que poder preguntar
-- (`tiene_pin_autorizacion`, que sí es ejecutable) para saber si pide el dato
-- antes de intentar la acción.
create or replace function public.validar_pin_autorizacion(
  p_restaurante_id uuid,
  p_pin text
)
returns void
language plpgsql
security definer
-- `extensions` en el search_path porque `crypt` vive ahí (Supabase instala
-- pgcrypto en ese schema, no en `public`). Sin esta segunda entrada, el cuerpo
-- de la función no resuelve `crypt` y falla con "function crypt(text, text) does
-- not exist" en el momento de validar un PIN, no al crear la función.
set search_path = public, extensions
as $$
declare
  v_hash text;
begin
  -- Defensa en profundidad: aunque hoy solo la llaman RPCs que ya validan acceso
  -- y rol, así el helper no sirve de atajo si mañana se usa desde otro lado.
  perform public.validar_acceso_restaurante(p_restaurante_id);

  select rp.pin_hash into v_hash
    from public.restaurante_pins rp
   where rp.restaurante_id = p_restaurante_id;

  -- Sin PIN configurado: la acción pasa (ver la nota de cabecera).
  if v_hash is null then
    return;
  end if;

  if p_pin is null or crypt(p_pin, v_hash) <> v_hash then
    raise exception 'PIN de autorizacion incorrecto';
  end if;
end;
$$;

comment on function public.validar_pin_autorizacion(uuid, text) is
  'Exige el PIN del restaurante si hay uno configurado. No hace nada si el restaurante no tiene PIN. La llaman las RPCs que mueven dinero para menos (anular ítem, anular cobro).';

-- ---------------------------------------------------------------------------
-- 3. Configurar / quitar el PIN (solo Admin)
-- ---------------------------------------------------------------------------
-- 4 a 6 dígitos. Un PIN más corto es adivinable en una caja (y sin rate limit en
-- la UI, un PIN de 3 dígitos se cae en segundos); uno más largo es inpracticable
-- para escribirlo con una mano mientras se atiende.
create or replace function public.configurar_pin_autorizacion(
  p_restaurante_id uuid,
  p_pin text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.validar_acceso_restaurante(p_restaurante_id);

  if not exists (
    select 1 from public.usuarios
     where id = auth.uid()
       and restaurante_id = p_restaurante_id
       and rol = 'admin_restaurante'
       and coalesce(activo, true)
  ) then
    raise exception 'Solo el administrador del restaurante puede configurar el PIN';
  end if;

  if p_pin is null or p_pin !~ '^[0-9]{4,6}$' then
    raise exception 'El PIN debe tener entre 4 y 6 digitos';
  end if;

  insert into public.restaurante_pins (restaurante_id, pin_hash, actualizado_at, actualizado_por)
  values (p_restaurante_id, crypt(p_pin, gen_salt('bf')), now(), auth.uid())
  on conflict (restaurante_id) do update
     set pin_hash = excluded.pin_hash,
         actualizado_at = excluded.actualizado_at,
         actualizado_por = excluded.actualizado_por;
end;
$$;

create or replace function public.quitar_pin_autorizacion(p_restaurante_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.validar_acceso_restaurante(p_restaurante_id);

  if not exists (
    select 1 from public.usuarios
     where id = auth.uid()
       and restaurante_id = p_restaurante_id
       and rol = 'admin_restaurante'
       and coalesce(activo, true)
  ) then
    raise exception 'Solo el administrador del restaurante puede quitar el PIN';
  end if;

  delete from public.restaurante_pins where restaurante_id = p_restaurante_id;
end;
$$;

-- ¿Hay PIN? Lo consulta cualquier persona del restaurante (para saber si tiene
-- que pedirlo en la UI) pero devuelve solo un booleano: nunca el hash.
create or replace function public.tiene_pin_autorizacion(p_restaurante_id uuid)
returns boolean
language plpgsql
security definer
-- Ver la nota de `validar_pin_autorizacion`: `extensions` está para que
-- resuelvan `crypt` y `gen_salt`.
set search_path = public, extensions
as $$
declare
  v_tiene boolean;
begin
  perform public.validar_acceso_restaurante(p_restaurante_id);

  if not exists (
    select 1 from public.usuarios

     where id = auth.uid()
       and restaurante_id = p_restaurante_id
       and coalesce(activo, true)
  ) then
    raise exception 'Sin acceso a este restaurante';
  end if;

  select exists (
    select 1 from public.restaurante_pins rp where rp.restaurante_id = p_restaurante_id
  ) into v_tiene;

  return v_tiene;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Permisos
-- ---------------------------------------------------------------------------
-- NO se dan aquí: todos los `revoke`/`grant execute` de las funciones están en
-- la sección 16 de `01_rls_completo.sql` (que se aplica al final).
--
-- Se deja anotado lo importante, porque es la excepción a la regla de "todas las
-- RPC son ejecutables por `authenticated`":
--
-- `validar_pin_autorizacion` NO se le concede a nadie. La llaman por dentro las
-- RPCs de anulación, que son SECURITY DEFINER y por eso la pueden invocar sin
-- permiso. Concedérsela a `authenticated` la convertiría en el oráculo de fuerza
-- bruta descrito en la sección 2: se podría llamar con cualquier
-- `p_restaurante_id` y la única diferencia entre acierto y fallo sería la
-- excepción. La lista completa de quién puede ejecutar qué está en
-- `01_rls_completo.sql` §16, y la consulta que lo comprueba en §17.2.
--
-- Las tres de la UI (`configurar`, `quitar`, `tiene_pin_autorizacion`) sí son
-- ejecutables por `authenticated`: el rol y el acceso los valida cada una por
-- dentro.

-- ---------------------------------------------------------------------------
-- 5. Verificación manual (opcional, en el SQL editor)
-- ---------------------------------------------------------------------------
-- select tiene_pin_autorizacion('<rid>');
-- select * from public.restaurante_pins;
--   Con las policies de 01_rls_completo.sql esto devuelve 0 filas para el
--   cliente: el hash no se lee nunca desde el navegador, ni para el admin.
