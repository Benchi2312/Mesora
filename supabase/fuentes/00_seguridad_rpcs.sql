-- Mesora · Control de acceso en el SERVIDOR (ejecutar tras 00_schema_base.sql).
--
-- PROBLEMA QUE RESUELVE
-- El bloqueo por suscripción vencida y por usuario desactivado vivía solo en la
-- UI (ProtectedRoute / useCurrentContext). Eso no es una barrera: cualquiera que
-- tenga el anon key de Supabase puede llamar `rpc('crear_pedido', ...)` o
-- `rpc('cerrar_cuenta', ...)` desde la consola, desde curl o desde un script, y
-- saltarse el control por completo. Un mesero desactivado podría seguir cobrando,
-- y un restaurante con la suscripción vencida podría seguir vendiendo.
--
-- La regla que se impone: NINGUNA escritura se acepta si el restaurante no tiene
-- suscripción activa y vigente, o si el usuario que llama (auth.uid()) está
-- desactivado.
--
-- POR QUÉ UNA FUNCIÓN Y NO COPIAR EL CÓDIGO
-- Siete RPCs necesitan el mismo control. Duplicarlo Once es aceptar que, el día
-- que se cambie la regla (un plan nuevo, un grace period, un super admin que sí
-- puede operar), alguien se acuerde de actualizar cinco de los siete. Con una
-- sola función, el cambio se hace una vez y todas las RPCs lo heredan.
--
-- `security definer` + `set search_path`: la función lee `usuarios` y
-- `restaurantes` con los permisos del dueño (los del owner), no los del que
-- llama, para que el control no dependa de las policies de lectura de cada tabla.
--
-- Solo se concede a `authenticated`: un anónimo (que es lo que es la anon key)
-- recibe "permission denied" antes de llegar al mensaje de negocio.

create or replace function public.validar_acceso_restaurante(p_restaurante_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_suscripcion boolean;
  v_vencimiento timestamptz;
begin
  -- 1) Sesión válida. `auth.uid()` es null cuando la llamada va sin JWT.
  if auth.uid() is null then
    raise exception 'Sin sesión: hay que iniciar sesión';
  end if;

  -- 2) El usuario que llama tiene que existir y estar activo.
  --    `activo` es nullable: los NULL (usuarios de antes del campo) cuentan como
  --    activos, que es la misma regla que usa la app (`activo !== false`).
  if not exists (
    select 1
      from public.usuarios
     where id = auth.uid()
       and coalesce(activo, true) = true
  ) then
    raise exception 'Usuario desactivado';
  end if;

  -- 3) El restaurante tiene que existir (si no, es un id inventado).
  select coalesce(r.suscripcion_activa, false), r.fecha_vencimiento
    into v_suscripcion, v_vencimiento
    from public.restaurantes r
   where r.id = p_restaurante_id;

  if not found then
    raise exception 'El restaurante no existe';
  end if;

  -- 4) Suscripción activa.
  if v_suscripcion is not true then
    raise exception 'Suscripción inactiva';
  end if;

  -- 5) Y no vencida. Sin fecha de vencimiento = suscripción indefinida
  --    (así se patchea un plan "vitalicio" sin tocar el código).
  if v_vencimiento is not null and v_vencimiento < now() then
    raise exception 'Suscripción vencida';
  end if;
end;
$$;

comment on function public.validar_acceso_restaurante(uuid) is
  'Control de acceso del servidor: restaurante con suscripción activa y vigente + usuario (auth.uid()) activo. Debe ser la PRIMERA instrucción de toda RPC que escriba datos.';

-- El `revoke` se queda en el archivo que crea la función (defensa en depth: si
-- alguien aplica solo este archivo y no el `01_rls_completo.sql`, la función
-- tampoco debe quedar ejecutable por `anon`). La lista completa de permisos está
-- en `01_rls_completo.sql` §16, que repite este `revoke` y agrega todos los
-- `grant`.
revoke all on function public.validar_acceso_restaurante(uuid) from public;
grant execute on function public.validar_acceso_restaurante(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Cómo se usa en cada RPC
-- ---------------------------------------------------------------------------
-- Como PRIMERA instrucción del bloque `begin` (antes de validar pertenencia o
-- cualquier otra cosa), para que un restaurante vencido reciba el error de
-- suscripción y no un error de permisos confuso:
--
--   begin
--     perform public.validar_acceso_restaurante(p_restaurante_id);
--     ...
--
-- `perform` descarta el resultado (returns void). Si la función no lanza, la RPC
-- sigue; si lanza, la transacción entera se revierte: no queda ni un ítem, ni un
-- cobro, ni una mesa liberada a medias.
--
-- RPCs que ya la llaman: crear_pedido, cerrar_cuenta, abrir_turno_caja,
-- cerrar_turno_caja.
