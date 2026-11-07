begin;

-- El personal conserva sus filas e historial. No se permiten bajas físicas ni
-- cambios de estado por UPDATE directo: estos últimos pasan por una Edge
-- Function que también bloquea/invalida sesiones de Supabase Auth.
drop policy if exists usuarios_delete_admin on public.usuarios;
revoke delete on public.usuarios from authenticated;
revoke update on public.usuarios from authenticated;
-- Revocar también el permiso por columna legado de seguridad_piloto.sql.
revoke update (activo) on public.usuarios from authenticated;
grant update (nombre, rol) on public.usuarios to authenticated;

-- Elimina cualquier firma previa que hubiera permitido llamar esta operación
-- con una sesión de usuario, omitiendo el ban de Supabase Auth.
drop function if exists public.admin_cambiar_estado_personal(uuid, boolean, text);
create or replace function public.admin_cambiar_estado_personal(
  p_actor_id uuid,
  p_usuario_id uuid,
  p_activo boolean,
  p_motivo text default null
)
returns public.usuarios
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.usuarios;
  v_objetivo public.usuarios;
  v_restaurante_nombre text;
  v_activo_anterior boolean;
  v_motivo text := nullif(left(trim(coalesce(p_motivo, '')), 240), '');
begin
  if p_actor_id is null or p_usuario_id is null or p_activo is null then
    raise exception 'Falta indicar el usuario y el estado nuevo.';
  end if;

  select * into v_actor
    from public.usuarios
   where id = p_actor_id and rol = 'admin_restaurante' and activo is true;
  if not found or v_actor.restaurante_id is null then
    raise exception 'Solo un administrador activo puede gestionar el personal de su restaurante.';
  end if;

  select * into v_objetivo
    from public.usuarios
   where id = p_usuario_id
   for update;
  if not found then
    raise exception 'No se encontró al usuario.';
  end if;
  if v_objetivo.restaurante_id is distinct from v_actor.restaurante_id
     or v_objetivo.rol not in ('mesero', 'cocina', 'cajero', 'admin_restaurante') then
    raise exception 'Ese usuario no pertenece a tu restaurante.';
  end if;
  if v_objetivo.id = v_actor.id then
    raise exception 'No puedes desactivar tu propio acceso.';
  end if;

  v_activo_anterior := coalesce(v_objetivo.activo, true);
  if v_activo_anterior = p_activo then
    raise exception 'El acceso ya tiene ese estado. Actualiza la lista e inténtalo de nuevo.';
  end if;

  update public.usuarios
     set activo = p_activo
   where id = p_usuario_id
  returning * into v_objetivo;

  select r.nombre into v_restaurante_nombre
    from public.restaurantes r where r.id = v_actor.restaurante_id;
  insert into public.audit_logs (
    actor_id, actor_rol, actor_nombre, restaurante_id, restaurante_nombre,
    entidad, entidad_id, accion, descripcion, detalle
  ) values (
    v_actor.id, v_actor.rol::text, v_actor.nombre, v_actor.restaurante_id,
    v_restaurante_nombre, 'usuario', v_objetivo.id,
    case when p_activo then 'usuario_reactivar' else 'usuario_desactivar' end,
    case when p_activo then 'Reactivó el acceso de ' else 'Desactivó el acceso de ' end || v_objetivo.nombre,
    jsonb_build_object(
      'rol', v_objetivo.rol,
      'activo_anterior', v_activo_anterior,
      'activo_nuevo', p_activo,
      'motivo', v_motivo
    )
  );

  return v_objetivo;
end;
$$;

comment on function public.admin_cambiar_estado_personal(uuid, uuid, boolean, text) is
  'Cambia el acceso reversible de un usuario del mismo restaurante y registra actor, antes/después y motivo. La Edge Function emparejada bloquea Auth y revoca sesiones al desactivar.';
revoke all on function public.admin_cambiar_estado_personal(uuid, uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.admin_cambiar_estado_personal(uuid, uuid, boolean, text) to service_role;

-- Si Auth rechaza la clave antes de cambiarla, libera la marca transitoria.
-- Solo la Edge Function puede llamar esta compensación.
create or replace function public.mesora_cancelar_reset_password_personal(p_usuario_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update private.password_temporal_huellas
     set reset_en_curso = false
   where usuario_id = p_usuario_id;
end;
$$;
revoke all on function public.mesora_cancelar_reset_password_personal(uuid) from public, anon, authenticated;
grant execute on function public.mesora_cancelar_reset_password_personal(uuid) to service_role;

-- Completa el reset de Auth, mantiene el cambio obligatorio y registra la
-- auditoría en la misma transacción. Ninguna clave entra a esta RPC.
create or replace function public.mesora_finalizar_reset_password_personal(
  p_usuario_id uuid,
  p_actor_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.usuarios;
  v_trabajador public.usuarios;
  v_huella_anterior text;
  v_huella_actual text;
  v_en_curso boolean;
  v_restaurante_nombre text;
begin
  select * into v_actor
    from public.usuarios
   where id = p_actor_id and rol = 'admin_restaurante' and activo is true;
  if not found or v_actor.restaurante_id is null then
    raise exception 'El administrador ya no tiene acceso activo.';
  end if;

  select * into v_trabajador
    from public.usuarios
   where id = p_usuario_id
     and restaurante_id = v_actor.restaurante_id
     and rol in ('mesero', 'cocina', 'cajero')
     and activo is true;
  if not found then
    raise exception 'El trabajador no pertenece a este restaurante o está inactivo.';
  end if;

  select h.huella_auth, h.reset_en_curso
    into v_huella_anterior, v_en_curso
    from private.password_temporal_huellas h
   where h.usuario_id = p_usuario_id
   for update;
  if not found or not v_en_curso then
    raise exception 'No hay un restablecimiento de personal en curso.';
  end if;
  select case when au.encrypted_password is null then null
              else encode(extensions.digest(au.encrypted_password, 'sha256'), 'hex') end
    into v_huella_actual
    from auth.users au where au.id = p_usuario_id;
  if not found or v_huella_actual is null
     or v_huella_actual is not distinct from v_huella_anterior then
    raise exception 'Auth aún no actualizó la contraseña.';
  end if;

  update public.usuarios set debe_cambiar_password = true where id = p_usuario_id;
  update private.password_temporal_huellas set reset_en_curso = false where usuario_id = p_usuario_id;
  select r.nombre into v_restaurante_nombre from public.restaurantes r where r.id = v_actor.restaurante_id;
  insert into public.audit_logs (
    actor_id, actor_rol, actor_nombre, restaurante_id, restaurante_nombre,
    entidad, entidad_id, accion, descripcion, detalle
  ) values (
    v_actor.id, v_actor.rol::text, v_actor.nombre, v_actor.restaurante_id,
    v_restaurante_nombre, 'usuario', v_trabajador.id, 'usuario_password_reset',
    'Restableció la contraseña del ' || v_trabajador.rol::text || ' ' || v_trabajador.nombre,
    jsonb_build_object('rol', v_trabajador.rol::text)
  );
end;
$$;
revoke all on function public.mesora_finalizar_reset_password_personal(uuid, uuid) from public;
revoke all on function public.mesora_finalizar_reset_password_personal(uuid, uuid) from anon, authenticated;
grant execute on function public.mesora_finalizar_reset_password_personal(uuid, uuid) to service_role;

create or replace function public.admin_buscar_cobros(
  p_desde timestamptz,
  p_hasta timestamptz,
  p_estado text default 'todas',
  p_metodo text default 'todos',
  p_busqueda text default '',
  p_offset integer default 0,
  p_limite integer default 25
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_restaurante_id uuid;
  v_busqueda text := lower(left(trim(coalesce(p_busqueda, '')), 80));
  v_offset integer := greatest(0, least(coalesce(p_offset, 0), 100000));
  v_limite integer := greatest(1, least(coalesce(p_limite, 25), 100));
  v_resultado jsonb;
begin
  if auth.uid() is null then raise exception 'Inicia sesión para consultar los cobros.'; end if;
  select u.restaurante_id into v_restaurante_id
    from public.usuarios u
   where u.id = auth.uid()
     and u.rol in ('admin_restaurante', 'cajero')
     and u.activo is true;
  if not found or v_restaurante_id is null then
    raise exception 'Solo el administrador o el cajero activo puede consultar los cobros.';
  end if;
  if p_desde is null or p_hasta is null or p_hasta <= p_desde then
    raise exception 'El rango de fechas no es válido.';
  end if;
  if coalesce(p_estado, 'todas') not in ('todas', 'pagada', 'anulada') then raise exception 'El estado de cobro no es válido.'; end if;
  if coalesce(p_metodo, 'todos') not in ('todos', 'efectivo', 'tarjeta', 'yape_plin', 'otro') then raise exception 'El método de pago no es válido.'; end if;

  with filtrado as materialized (
    select c.*
      from public.cuentas c
     where c.restaurante_id = v_restaurante_id
       and c.estado in ('pagada', 'anulada')
       and c.pagado_at >= p_desde
       and c.pagado_at < p_hasta
       and (coalesce(p_estado, 'todas') = 'todas' or c.estado::text = p_estado)
       and (
         coalesce(p_metodo, 'todos') = 'todos'
         or exists (
           select 1 from public.cuenta_pagos cp
            where cp.cuenta_id = c.id
              and cp.restaurante_id = v_restaurante_id
              and cp.metodo_pago::text = p_metodo
         )
       )
       and (
         v_busqueda = ''
         or lower(coalesce(c.numero, '')) like '%' || v_busqueda || '%'
         or lower(coalesce(c.mesa_nombre_snapshot, '')) like '%' || v_busqueda || '%'
         or lower(coalesce(c.mesero_nombre_snapshot, '')) like '%' || v_busqueda || '%'
         or c.total::text like '%' || replace(v_busqueda, ',', '.') || '%'
       )
  )
  select jsonb_build_object(
    'items', coalesce(
      (select jsonb_agg(to_jsonb(pagina) order by pagina.pagado_at desc)
         from (select f.* from filtrado f order by f.pagado_at desc, f.id desc limit v_limite offset v_offset) pagina),
      '[]'::jsonb
    ),
    'total', (select count(*) from filtrado)
  ) into v_resultado;
  return v_resultado;
end;
$$;

comment on function public.admin_buscar_cobros(timestamptz, timestamptz, text, text, text, integer, integer) is
  'Consulta cobros paginados del restaurante actual, con filtros por fecha, estado, cualquier parte de pago y datos de boleta.';
revoke all on function public.admin_buscar_cobros(timestamptz, timestamptz, text, text, text, integer, integer) from public;
revoke all on function public.admin_buscar_cobros(timestamptz, timestamptz, text, text, text, integer, integer) from anon;
grant execute on function public.admin_buscar_cobros(timestamptz, timestamptz, text, text, text, integer, integer) to authenticated;

create or replace function public.admin_listar_auditoria_restaurante(
  p_desde timestamptz default null,
  p_hasta timestamptz default null,
  p_busqueda text default '',
  p_categoria text default 'todas',
  p_offset integer default 0,
  p_limite integer default 50
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_restaurante_id uuid;
  v_busqueda text := lower(left(trim(coalesce(p_busqueda, '')), 120));
  v_offset integer := greatest(0, least(coalesce(p_offset, 0), 100000));
  v_limite integer := greatest(1, least(coalesce(p_limite, 50), 100));
  v_resultado jsonb;
begin
  if auth.uid() is null then
    raise exception 'Inicia sesión para consultar la auditoría.';
  end if;
  select u.restaurante_id into v_restaurante_id
    from public.usuarios u
   where u.id = auth.uid() and u.rol = 'admin_restaurante' and u.activo is true;
  if not found or v_restaurante_id is null then
    raise exception 'Solo un administrador activo puede consultar la auditoría de su restaurante.';
  end if;
  if coalesce(p_categoria, 'todas') not in ('todas', 'usuarios', 'mesas', 'caja', 'cuentas', 'pedidos', 'configuracion') then
    raise exception 'El filtro de auditoría no es válido.';
  end if;
  if p_desde is not null and p_hasta is not null and p_hasta <= p_desde then
    raise exception 'El rango de fechas no es válido.';
  end if;

  with filtrado as materialized (
    select l.*
      from public.audit_logs l
     where l.restaurante_id = v_restaurante_id
       and (p_desde is null or l.created_at >= p_desde)
       and (p_hasta is null or l.created_at < p_hasta)
       and (
         coalesce(p_categoria, 'todas') = 'todas'
         or (p_categoria = 'usuarios' and l.entidad = 'usuario')
         or (p_categoria = 'mesas' and (l.entidad = 'mesa' or l.accion like 'mesa_%'))
         or (p_categoria = 'caja' and (l.entidad = 'caja_turno' or l.accion like 'caja_%'))
         or (p_categoria = 'cuentas' and (l.entidad = 'cuenta' or l.accion like 'cuenta_%'))
         or (p_categoria = 'pedidos' and (l.entidad in ('pedido', 'pedido_item') or l.accion like 'comanda_%'))
         or (p_categoria = 'configuracion' and (l.entidad in ('restaurante', 'configuracion') or l.accion like 'configuracion_%'))
       )
       and (
         v_busqueda = ''
         or lower(concat_ws(' ', l.actor_nombre, l.actor_rol, l.entidad, l.entidad_id, l.accion, l.descripcion, l.detalle::text)) like '%' || v_busqueda || '%'
       )
  )
  select jsonb_build_object(
    'items', coalesce(
      (select jsonb_agg(to_jsonb(pagina) order by pagina.created_at desc)
         from (select f.* from filtrado f order by f.created_at desc, f.id desc limit v_limite offset v_offset) pagina),
      '[]'::jsonb
    ),
    'total', (select count(*) from filtrado)
  ) into v_resultado;

  return v_resultado;
end;
$$;

comment on function public.admin_listar_auditoria_restaurante(timestamptz, timestamptz, text, text, integer, integer) is
  'Devuelve auditoría paginada, filtrada y limitada al restaurante del administrador autenticado.';
revoke all on function public.admin_listar_auditoria_restaurante(timestamptz, timestamptz, text, text, integer, integer) from public;
revoke all on function public.admin_listar_auditoria_restaurante(timestamptz, timestamptz, text, text, integer, integer) from anon;
grant execute on function public.admin_listar_auditoria_restaurante(timestamptz, timestamptz, text, text, integer, integer) to authenticated;

commit;
