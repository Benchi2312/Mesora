-- La preferencia de Fase 3 no era una autorización efectiva. NULL conserva
-- exactamente la regla anterior: mesero activo y admin_restaurante activo.
alter table public.configuracion_operativa
  add column if not exists modalidad_cobro_aplicada text
    check (modalidad_cobro_aplicada in (
      'solo_cajero', 'cobro_por_mesero', 'caja_central_meseros_autorizados'
    ));

comment on column public.configuracion_operativa.modalidad_cobro_aplicada is
  'NULL mantiene el cobro heredado; una modalidad aplicada exige autorización individual y se valida en cerrar_cuenta.';

-- La consulta propia es segura para mostrar u ocultar el acceso en la interfaz.
-- La RPC de cierre vuelve a comprobarla dentro de la misma transacción.
create or replace function public.puede_cobrar_restaurante(p_restaurante_id uuid)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_rol text;
  v_modalidad text;
begin
  if auth.uid() is null or p_restaurante_id is null then return false; end if;
  select u.rol::text into v_rol
    from public.usuarios u
   where u.id = auth.uid() and u.restaurante_id = p_restaurante_id and u.activo is true;
  if v_rol is null then return false; end if;
  if v_rol = 'admin_restaurante' then return true; end if;

  select c.modalidad_cobro_aplicada into v_modalidad
    from public.configuracion_operativa c where c.restaurante_id = p_restaurante_id;
  if v_modalidad is null then return v_rol = 'mesero'; end if;
  if (v_modalidad = 'solo_cajero' and v_rol <> 'cajero')
     or (v_modalidad = 'cobro_por_mesero' and v_rol <> 'mesero')
     or (v_modalidad = 'caja_central_meseros_autorizados' and v_rol not in ('cajero', 'mesero')) then
    return false;
  end if;
  return exists (
    select 1 from public.autorizaciones_cobro a
     where a.restaurante_id = p_restaurante_id and a.usuario_id = auth.uid() and a.activo
  );
end;
$$;

revoke all on function public.puede_cobrar_restaurante(uuid) from public, anon;
grant execute on function public.puede_cobrar_restaurante(uuid) to authenticated;

-- El administrador aplica una política completa en una sola llamada. Los IDs
-- se validan antes de escribir; no se acepta cocina, otro restaurante o inactivos.
create or replace function public.admin_obtener_politica_cobro(p_restaurante_id uuid)
returns jsonb
language plpgsql stable security invoker set search_path = ''
as $$
begin
  if auth.uid() is null or not public.puedo_escribir_en(p_restaurante_id, array['admin_restaurante']) then
    raise exception 'Solo el administrador activo puede consultar estos permisos.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'restaurante_id', p_restaurante_id,
    'modalidad_cobro', coalesce((select c.modalidad_cobro from public.configuracion_operativa c
      where c.restaurante_id = p_restaurante_id), 'cobro_por_mesero'),
    'modalidad_aplicada', (select c.modalidad_cobro_aplicada from public.configuracion_operativa c
      where c.restaurante_id = p_restaurante_id),
    'usuarios_autorizados', coalesce((select jsonb_agg(a.usuario_id order by a.usuario_id)
      from public.autorizaciones_cobro a
      where a.restaurante_id = p_restaurante_id and a.activo), '[]'::jsonb)
  );
end;
$$;

create or replace function public.admin_guardar_politica_cobro(
  p_restaurante_id uuid, p_modalidad text, p_usuarios uuid[]
)
returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
  v_total integer;
  v_validos integer;
  v_cajeros integer;
  v_meseros integer;
begin
  if auth.uid() is null or not public.puedo_escribir_en(p_restaurante_id, array['admin_restaurante']) then
    raise exception 'Solo el administrador activo puede cambiar quién cobra.' using errcode = '42501';
  end if;
  if p_modalidad not in ('solo_cajero', 'cobro_por_mesero', 'caja_central_meseros_autorizados')
     or p_modalidad is null then
    raise exception 'Elige una modalidad de cobro válida.' using errcode = '22023';
  end if;
  v_total := coalesce(array_length(p_usuarios, 1), 0);
  if v_total < 1 or v_total > 100 or exists (select 1 from unnest(p_usuarios) id where id is null)
     or (select count(distinct id) from unnest(p_usuarios) id) <> v_total then
    raise exception 'Selecciona entre 1 y 100 usuarios distintos para cobrar.' using errcode = '22023';
  end if;
  select count(*)::integer,
         count(*) filter (where u.rol = 'cajero')::integer,
         count(*) filter (where u.rol = 'mesero')::integer
    into v_validos, v_cajeros, v_meseros
    from public.usuarios u
   where u.id = any(p_usuarios) and u.restaurante_id = p_restaurante_id
     and u.activo is true and u.rol in ('cajero', 'mesero');
  if v_validos <> v_total
     or (p_modalidad = 'solo_cajero' and (v_cajeros <> v_total))
     or (p_modalidad = 'cobro_por_mesero' and (v_meseros <> v_total))
     or (p_modalidad = 'caja_central_meseros_autorizados' and (v_cajeros < 1 or v_meseros < 1)) then
    raise exception 'Selecciona usuarios activos del restaurante y del rol indicado.' using errcode = '22023';
  end if;

  -- Bloquear la configuración serializa dos guardados concurrentes del admin.
  perform 1 from public.configuracion_operativa c
   where c.restaurante_id = p_restaurante_id for update;
  if not found then
    raise exception 'No se encontró la configuración del restaurante.' using errcode = '23503';
  end if;
  update public.autorizaciones_cobro a
     set activo = false, actualizado_por = auth.uid(), updated_at = now()
   where a.restaurante_id = p_restaurante_id and a.activo and a.usuario_id <> all(p_usuarios);
  insert into public.autorizaciones_cobro(restaurante_id, usuario_id, activo, creado_por, actualizado_por)
  select p_restaurante_id, id, true, auth.uid(), auth.uid() from unnest(p_usuarios) id
  on conflict (restaurante_id, usuario_id) do update
    set activo = true, actualizado_por = auth.uid(), updated_at = now()
    where public.autorizaciones_cobro.activo is false;
  update public.configuracion_operativa c
     set modalidad_cobro = p_modalidad, modalidad_cobro_aplicada = p_modalidad
   where c.restaurante_id = p_restaurante_id;
  return public.admin_obtener_politica_cobro(p_restaurante_id);
end;
$$;

revoke all on function public.admin_obtener_politica_cobro(uuid) from public, anon;
revoke all on function public.admin_guardar_politica_cobro(uuid, text, uuid[]) from public, anon;
grant execute on function public.admin_obtener_politica_cobro(uuid) to authenticated;
grant execute on function public.admin_guardar_politica_cobro(uuid, text, uuid[]) to authenticated;

-- El audit log es append-only para clientes. El trigger registra activación,
-- cambios de autorizados y cada cobro de contingencia del administrador.
create or replace function public.mesora_auditar_cobro_configurable()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_restaurante_id uuid;
  v_actor record;
  v_actor_rol text;
  v_restaurante_nombre text;
  v_entidad text;
  v_entidad_id uuid;
  v_accion text;
  v_descripcion text;
  v_detalle jsonb;
begin
  if tg_table_name = 'configuracion_operativa' then
    if old.modalidad_cobro_aplicada is not distinct from new.modalidad_cobro_aplicada then return new; end if;
    v_restaurante_id := new.restaurante_id;
    v_entidad := 'configuracion';
    v_entidad_id := new.restaurante_id;
    v_accion := 'modalidad_cobro_aplicar';
    v_descripcion := 'Actualizó la modalidad de cobro efectiva';
    v_detalle := jsonb_build_object('anterior', old.modalidad_cobro_aplicada, 'nueva', new.modalidad_cobro_aplicada);
  elsif tg_table_name = 'autorizaciones_cobro' then
    if tg_op = 'UPDATE' and old.activo is not distinct from new.activo then return new; end if;
    v_restaurante_id := new.restaurante_id;
    v_entidad := 'configuracion';
    v_entidad_id := new.restaurante_id;
    v_accion := 'autorizacion_cobro_actualizar';
    v_descripcion := 'Actualizó un permiso individual de cobro';
    v_detalle := jsonb_build_object('usuario_id', new.usuario_id,
      'activo_anterior', case when tg_op = 'INSERT' then null else old.activo end,
      'activo_nuevo', new.activo);
  elsif tg_table_name = 'cuentas' then
    select u.rol::text into v_actor_rol from public.usuarios u
      where u.id = auth.uid() and u.restaurante_id = new.restaurante_id;
    if v_actor_rol is distinct from 'admin_restaurante' then return new; end if;
    v_restaurante_id := new.restaurante_id;
    v_entidad := 'cuenta';
    v_entidad_id := new.id;
    v_accion := 'cobro_contingencia_admin';
    v_descripcion := 'El administrador cobró una cuenta por contingencia';
    v_detalle := jsonb_build_object('cuenta_id', new.id, 'mesa_id', new.mesa_id,
      'total', new.total, 'numero', new.numero);
  else
    return new;
  end if;
  select u.rol::text as rol, u.nombre into v_actor from public.usuarios u where u.id = auth.uid();
  select r.nombre into v_restaurante_nombre from public.restaurantes r where r.id = v_restaurante_id;
  insert into public.audit_logs(actor_id, actor_rol, actor_nombre, restaurante_id,
    restaurante_nombre, entidad, entidad_id, accion, descripcion, detalle)
  values (auth.uid(), v_actor.rol, v_actor.nombre, v_restaurante_id,
    v_restaurante_nombre, v_entidad, v_entidad_id,
    v_accion, v_descripcion, v_detalle);
  return new;
end;
$$;

revoke all on function public.mesora_auditar_cobro_configurable() from public, anon, authenticated;
drop trigger if exists configuracion_modalidad_cobro_auditoria on public.configuracion_operativa;
create trigger configuracion_modalidad_cobro_auditoria after update on public.configuracion_operativa
for each row execute function public.mesora_auditar_cobro_configurable();
drop trigger if exists autorizaciones_cobro_auditoria on public.autorizaciones_cobro;
create trigger autorizaciones_cobro_auditoria after insert or update on public.autorizaciones_cobro
for each row execute function public.mesora_auditar_cobro_configurable();
drop trigger if exists cuentas_contingencia_admin_auditoria on public.cuentas;
create trigger cuentas_contingencia_admin_auditoria after insert on public.cuentas
for each row execute function public.mesora_auditar_cobro_configurable();

-- Las definiciones finales de cerrar_cuenta y capturar_snapshot_boleta se
-- agregan abajo. No alteran pagos divididos, correlativos ni cuentas históricas.


create or replace function public.cerrar_cuenta(
  p_restaurante_id uuid,
  p_mesa_id uuid,
  p_pedidos uuid[],
  p_pagos jsonb,
  p_propina numeric default 0
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total numeric := 0;
  v_cuenta_id uuid;
  v_pedido_id uuid;
  v_subtotal numeric;
  v_a_pagar numeric;
  v_recibido numeric := 0;
  v_efectivo numeric := 0;
  v_no_efectivo numeric := 0;
  v_vuelto numeric;
  v_teclado numeric;
  v_parte jsonb;
  v_metodo text;
  v_monto numeric;
  v_correlativo integer;
  v_numero text;
begin
  -- Control de acceso en el servidor (suscripción + usuario activo). Ver
  -- 00_seguridad_rpcs.sql: sin esto, `rpc('cerrar_cuenta')` desde la consola
  -- cobraría aunque el restaurante esté vencido o el mesero esté desactivado.
  perform public.validar_acceso_restaurante(p_restaurante_id);

  -- SERIALIZACIÓN DEL COBRO.
  -- El chequeo "¿ya está pagado?" y el marcado de los pedidos como 'entregado'
  -- tienen que ser un solo paso atómico, o dos cajas cobrando la misma mesa al
  -- mismo tiempo crean DOS cuentas con el mismo total (el cliente paga una vez,
  -- el restaurante acredita dos).
  --
  -- El candado es la FILA DE LA MESA, no los pedidos, y se toma aquí a
  -- propósito: antes del chequeo de "ya cobrado" y antes de mirar los pedidos.
  -- Cualquier otra forma de cerrar esta mesa (otra terminal, otro dispositivo)
  -- tiene que pasar por el mismo `for update`, así que el segundo cobra espera
  -- en la fila y, cuando despierta, ve los pedidos ya en 'entregado' y sale por
  -- la rama de "ya fue cobrado" en lugar de duplicar el cobro.
  --
  -- Se bloquea la mesa y no los pedidos porque la mesa es el recurso que se
  -- serializa: siempre existe (es el ancla de la cuenta), mientras que el set
  -- de pedidos a cobrar varía según qué comanda se haya enviado y bloquearlos
  -- exigiría ordenar los ids para no provocar deadlocks entre dos cierres.
  -- La pertenencia de los pedidos a esta mesa se revalida más abajo, ya con el
  -- candado tomado.
  perform 1 from public.mesas
   where id = p_mesa_id and restaurante_id = p_restaurante_id
     for update;

  if not found then
    raise exception 'La mesa no pertenece al restaurante';
  end if;

  -- La política se comprueba en el servidor, incluso al invocar la RPC directamente.
  if not public.puede_cobrar_restaurante(p_restaurante_id) then
    raise exception 'No estás autorizado para cobrar en este restaurante.' using errcode = '42501';
  end if;

  -- La pertenencia de la mesa ya quedó comprobada arriba, junto con el candado.

  if p_propina is null or p_propina < 0 then
    raise exception 'Propina invalida: %', p_propina;
  end if;

  if p_pagos is null or jsonb_array_length(p_pagos) = 0 then
    raise exception 'Agrega al menos un metodo de pago';
  end if;

  if p_pedidos is null or array_length(p_pedidos, 1) is null then
    raise exception 'No hay pedidos para cerrar';
  end if;

  -- Un pedido ya cobrado en otra cuenta pagada no se puede volver a cobrar.
  if exists (
    select 1
      from public.cuenta_pedidos cp
      join public.cuentas c on c.id = cp.cuenta_id
     where cp.pedido_id = any(p_pedidos)
       and c.estado = 'pagada'
  ) then
    raise exception 'Alguno de los pedidos ya fue cobrado en otra cuenta';
  end if;

  -- Total de los pedidos seleccionados (pertenecientes a mesa + restaurante).
  -- Los ítems anulados por el mesero no se cobran (ver migracion_items_anulables.sql).
  select coalesce(sum(pi.cantidad * pi.precio_unitario), 0)
    into v_total
    from public.pedido_items pi
    join public.pedidos pd on pd.id = pi.pedido_id
   where pd.restaurante_id = p_restaurante_id
     and pd.mesa_id = p_mesa_id
     and pd.id = any(p_pedidos)
     and pd.estado <> 'anulado'
     and pi.anulado = false;

  -- Una comanda sin ítems vigentes no se cobra: evita cuentas en cero.
  if v_total <= 0 then
    raise exception 'No hay pedidos por cobrar en esta mesa';
  end if;

  v_a_pagar := round(v_total + p_propina, 2);

  -- Validar los montos explícitos antes de completar los "exactos".
  for v_parte in select * from jsonb_array_elements(p_pagos)
  loop
    v_metodo := v_parte ->> 'metodo_pago';
    -- Misma whitelist que METODOS_PAGO en src/types/database.ts
    if v_metodo is null or v_metodo not in ('efectivo', 'tarjeta', 'yape_plin', 'otro') then
      raise exception 'Metodo de pago no valido: %', v_metodo;
    end if;
    v_monto := coalesce((v_parte ->> 'monto')::numeric, 0);
    if v_monto < 0 then
      raise exception 'Monto de pago invalido: %', v_monto;
    end if;
  end loop;

  -- Solo una parte puede quedar "exacta", y tiene que quedar algo por repartir.
  if (
    select count(*) from jsonb_array_elements(p_pagos) as parte
     where coalesce((parte ->> 'monto')::numeric, 0) <= 0
  ) > 1 then
    raise exception 'Solo una parte puede quedar exacta. Reparte el total entre los metodos';
  end if;

  -- El "exacto" se completa con el resto que falta (nunca con el total entero:
  -- si no, un pago dividido cobraría el doble).
  select coalesce(sum(coalesce((parte ->> 'monto')::numeric, 0)), 0)
    into v_teclado
    from jsonb_array_elements(p_pagos) as parte
   where coalesce((parte ->> 'monto')::numeric, 0) > 0;

  -- Sumar cada parte con su importe final.
  for v_parte in select * from jsonb_array_elements(p_pagos)
  loop
    v_metodo := v_parte ->> 'metodo_pago';
    v_monto := coalesce((v_parte ->> 'monto')::numeric, 0);
    if v_monto <= 0 then
      v_monto := round(v_a_pagar - v_teclado, 2);
      if v_monto <= 0 then
        raise exception 'Los montos ya cubren el total. Quita esa parte o ajustala';
      end if;
    end if;

    v_recibido := v_recibido + v_monto;
    if v_metodo = 'efectivo' then
      v_efectivo := v_efectivo + v_monto;
    else
      v_no_efectivo := v_no_efectivo + v_monto;
    end if;
  end loop;

  if v_recibido < v_a_pagar - 0.01 then
    raise exception 'El monto recibido no cubre el total de la cuenta';
  end if;

  -- El vuelto solo sale del efectivo: si lo no-efectivo supera lo que se debe,
  -- estaríamos "devolviendo" contra una tarjeta.
  if v_no_efectivo > v_a_pagar + 0.01 then
    raise exception 'El pago con tarjeta o Yape no puede superar el total: el vuelto solo se entrega en efectivo';
  end if;

  v_vuelto := round(v_recibido - v_a_pagar, 2);

  -- Correlativo de boleta del restaurante. El upsert se lleva la fila en
  -- exclusiva, así que dos cierres simultáneos no obtienen el mismo número.
  insert into public.correlativos (restaurante_id, tipo, ultimo)
  values (p_restaurante_id, 'boleta', 1)
  on conflict (restaurante_id, tipo)
  do update set ultimo = public.correlativos.ultimo + 1
  returning ultimo into v_correlativo;

  v_numero := 'B001-' || lpad(v_correlativo::text, 6, '0');

  insert into public.cuentas (
    restaurante_id, mesa_id, total, metodo_pago, estado, pagado_at, propina, vuelto, numero
  )
  values (
    p_restaurante_id, p_mesa_id, v_total,
    (p_pagos -> 0 ->> 'metodo_pago'),
    'pagada', now(), round(p_propina, 2), v_vuelto, v_numero
  )
  returning id into v_cuenta_id;

  -- Detalle del pago: una fila por parte, con el importe real (nunca 0).
  -- La parte "exacta" guarda el resto que faltaba, el mismo importe que se usó
  -- para calcular el vuelto: si guardara el total entero, el arqueo de caja
  -- sumaría de más.
  insert into public.cuenta_pagos (cuenta_id, restaurante_id, metodo_pago, monto, referencia)
  select v_cuenta_id,
         p_restaurante_id,
         (parte ->> 'metodo_pago'),
         case
           when coalesce((parte ->> 'monto')::numeric, 0) <= 0
             then round(v_a_pagar - v_teclado, 2)
           else (parte ->> 'monto')::numeric
         end,
         nullif(btrim(coalesce(parte ->> 'referencia', '')), '')
    from jsonb_array_elements(p_pagos) as parte;

  foreach v_pedido_id in array p_pedidos
  loop
    -- Subtotal de SU comanda, sin los ítems anulados.
    select coalesce(sum(cantidad * precio_unitario), 0)
      into v_subtotal
      from public.pedido_items
     where pedido_id = v_pedido_id
       and anulado = false;

    insert into public.cuenta_pedidos (cuenta_id, pedido_id, subtotal)
    values (v_cuenta_id, v_pedido_id, v_subtotal);

    update public.pedidos
       set estado = 'entregado', updated_at = now()
     where id = v_pedido_id
       and restaurante_id = p_restaurante_id
       and estado <> 'anulado';
  end loop;

  update public.mesas set estado = 'libre' where id = p_mesa_id;

  return v_cuenta_id;
end;
$$;

create or replace function public.capturar_snapshot_boleta()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_restaurante record;
  v_mesa_nombre text;
  v_mesero_nombre text;
  v_mesero_id uuid;
  v_actor_rol text;
begin
  select r.nombre, r.direccion, r.ruc, r.telefono
    into v_restaurante
    from public.restaurantes r
   where r.id = new.restaurante_id;

  select m.nombre into v_mesa_nombre
    from public.mesas m
   where m.id = new.mesa_id and m.restaurante_id = new.restaurante_id;

  select u.rol::text into v_actor_rol from public.usuarios u
   where u.id = auth.uid() and u.restaurante_id = new.restaurante_id;
  if v_actor_rol = 'mesero' then
    v_mesero_id := auth.uid();
  else
    select m.mesero_responsable_id into v_mesero_id from public.mesas m
     where m.id = new.mesa_id and m.restaurante_id = new.restaurante_id;
    if v_mesero_id is null then
      select p.mesero_id into v_mesero_id from public.pedidos p
       where p.restaurante_id = new.restaurante_id and p.mesa_id = new.mesa_id
         and p.estado <> 'anulado'
       order by p.created_at desc, p.id desc limit 1;
    end if;
  end if;
  select u.nombre into v_mesero_nombre from public.usuarios u
   where u.id = v_mesero_id and u.restaurante_id = new.restaurante_id;
  new.mesero_id_snapshot := v_mesero_id;
  new.mesero_nombre_snapshot := coalesce(new.mesero_nombre_snapshot, v_mesero_nombre);
  new.mesa_nombre_snapshot := coalesce(new.mesa_nombre_snapshot, v_mesa_nombre);
  new.restaurante_nombre_snapshot := coalesce(new.restaurante_nombre_snapshot, v_restaurante.nombre);
  new.restaurante_direccion_snapshot := coalesce(new.restaurante_direccion_snapshot, v_restaurante.direccion);
  new.restaurante_ruc_snapshot := coalesce(new.restaurante_ruc_snapshot, v_restaurante.ruc);
  new.restaurante_telefono_snapshot := coalesce(new.restaurante_telefono_snapshot, v_restaurante.telefono);
  return new;
end;
$$;
