-- Bloquea las salidas manuales y automáticas de comandas vinculadas a una
-- cuenta anulada. Las filas se conservan como historial; no se elimina nada.
begin;

alter table public.entregas_comanda
  add column if not exists cancelada_por_anulacion_cuenta boolean not null default false,
  add column if not exists cancelada_cuenta_id uuid references public.cuentas(id),
  add column if not exists cancelada_at timestamptz,
  add column if not exists cancelada_por uuid references public.usuarios(id) on delete set null,
  add column if not exists motivo_cancelacion text;

create index if not exists entregas_comanda_anuladas_recientes_idx
  on public.entregas_comanda (restaurante_id, updated_at desc)
  where cancelada_por_anulacion_cuenta is true;

comment on column public.entregas_comanda.cancelada_por_anulacion_cuenta is
  'Marca histórica: la salida no puede volver a prepararse ni imprimirse porque la cuenta fue anulada.';

-- Todas las operaciones de impresión usan el orden cuenta -> entrega -> trabajo.
-- Así se serializan con el cambio pagada -> anulada y evitan carreras con el spooler.
create or replace function private.bloquear_cuentas_pedido_impresion(
  p_restaurante_id uuid,
  p_pedido_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cuenta record;
  v_anulada boolean := false;
begin
  for v_cuenta in
    select c.id, c.estado
      from public.cuenta_pedidos cp
      join public.cuentas c on c.id = cp.cuenta_id
     where cp.pedido_id = p_pedido_id
       and c.restaurante_id = p_restaurante_id
     order by c.id
     for update of c
  loop
    if v_cuenta.estado = 'anulada' then
      v_anulada := true;
    end if;
  end loop;
  return v_anulada;
end;
$$;
revoke all on function private.bloquear_cuentas_pedido_impresion(uuid, uuid) from public, anon, authenticated;

create or replace function private.proteger_anulacion_contra_impresion_activa()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entrega record;
  v_estado_trabajo text;
  v_envio_iniciado timestamptz;
begin
  if old.estado is not distinct from new.estado or new.estado <> 'anulada' then
    return new;
  end if;

  -- La cuenta ya está bloqueada por el UPDATE. Respetamos el orden de locks
  -- también aquí para que impresión manual y agente no puedan empezar a la vez.
  for v_entrega in
    select d.id, d.estado, d.solicitud_impresion_id
      from public.cuenta_pedidos cp
      join public.entregas_comanda d on d.pedido_id = cp.pedido_id
       and d.restaurante_id = new.restaurante_id
     where cp.cuenta_id = new.id
     order by d.id
     for update of d
  loop
    if v_entrega.estado = 'enviada' and v_entrega.solicitud_impresion_id is not null then
      raise exception 'Resuelve la impresión manual en curso antes de anular la cuenta.'
        using errcode = '55000';
    end if;

    select j.estado, j.envio_iniciado_at
      into v_estado_trabajo, v_envio_iniciado
      from private.trabajos_impresion j
     where j.entrega_id = v_entrega.id
     for update;
    if v_estado_trabajo in ('reclamado', 'fallido') and v_envio_iniciado is not null then
      raise exception 'El agente está enviando una comanda a la impresora. Espera a que termine antes de anular la cuenta.'
        using errcode = '55000';
    end if;
  end loop;
  return new;
end;
$$;
revoke all on function private.proteger_anulacion_contra_impresion_activa() from public, anon, authenticated;
drop trigger if exists cuentas_proteger_anulacion_impresion_activa on public.cuentas;
create trigger cuentas_proteger_anulacion_impresion_activa
  before update of estado on public.cuentas
  for each row execute function private.proteger_anulacion_contra_impresion_activa();

create or replace function private.cancelar_salidas_cuenta_anulada()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entrega record;
  v_actor_rol text;
  v_actor_nombre text;
  v_restaurante_nombre text;
  v_mesa_nombre text;
begin
  if old.estado = 'anulada' or new.estado <> 'anulada' then
    return new;
  end if;

  select u.rol::text, u.nombre into v_actor_rol, v_actor_nombre
    from public.usuarios u where u.id = new.anulada_por;
  select r.nombre into v_restaurante_nombre
    from public.restaurantes r where r.id = new.restaurante_id;
  select m.nombre into v_mesa_nombre
    from public.mesas m where m.id = new.mesa_id and m.restaurante_id = new.restaurante_id;

  for v_entrega in
    select d.id, d.pedido_id, d.estacion_codigo, d.estado, d.cancelada_por_anulacion_cuenta
      from public.cuenta_pedidos cp
      join public.entregas_comanda d on d.pedido_id = cp.pedido_id
       and d.restaurante_id = new.restaurante_id
     where cp.cuenta_id = new.id
     order by d.id
  loop
    update public.entregas_comanda d
       set estado = case when d.estado in ('pendiente', 'fallida') then 'cancelada' else d.estado end,
           cancelada_por_anulacion_cuenta = true,
           cancelada_cuenta_id = new.id,
           cancelada_at = new.anulada_at,
           cancelada_por = new.anulada_por,
           motivo_cancelacion = new.motivo_anulacion,
           updated_at = now()
     where d.id = v_entrega.id
       and d.restaurante_id = new.restaurante_id;

    if not v_entrega.cancelada_por_anulacion_cuenta then
      insert into public.audit_logs (
        actor_id, actor_rol, actor_nombre, restaurante_id, restaurante_nombre,
        entidad, entidad_id, accion, descripcion, detalle
      ) values (
        new.anulada_por, v_actor_rol, v_actor_nombre, new.restaurante_id, v_restaurante_nombre,
        'entrega_comanda', v_entrega.id, 'comanda_salida_cancelada_por_anulacion_cuenta',
        'Salida de ' || coalesce(v_entrega.estacion_codigo, 'estación') || ' cancelada por anulación de cuenta en ' || coalesce(v_mesa_nombre, 'mesa'),
        jsonb_build_object(
          'cuenta_id', new.id, 'pedido_id', v_entrega.pedido_id,
          'entrega_id', v_entrega.id, 'estacion', v_entrega.estacion_codigo,
          'motivo', new.motivo_anulacion, 'anulada_at', new.anulada_at
        )
      );
    end if;
  end loop;
  return new;
end;
$$;
revoke all on function private.cancelar_salidas_cuenta_anulada() from public, anon, authenticated;
drop trigger if exists cuentas_cancelar_salidas_impresion on public.cuentas;
create trigger cuentas_cancelar_salidas_impresion
  after update of estado on public.cuentas
  for each row execute function private.cancelar_salidas_cuenta_anulada();

-- Vista mínima para Cocina/Admin/Mesero. La tabla cuenta_pedidos no tiene
-- permisos de lectura para Cocina, por eso se devuelve solo el conjunto de IDs.
create or replace function public.pedidos_con_cuenta_anulada(
  p_restaurante_id uuid,
  p_pedido_ids uuid[]
)
returns uuid[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rol text;
begin
  perform public.validar_acceso_restaurante(p_restaurante_id);
  select u.rol::text into v_rol
    from public.usuarios u
   where u.id = auth.uid() and u.restaurante_id = p_restaurante_id and coalesce(u.activo, true);
  if coalesce(v_rol, '') not in ('admin_restaurante', 'mesero', 'cocina') then
    raise exception 'Tu perfil no puede consultar el estado operativo de estas comandas.'
      using errcode = '42501';
  end if;
  if coalesce(cardinality(p_pedido_ids), 0) > 500 then
    raise exception 'Consulta demasiadas comandas a la vez.' using errcode = '22023';
  end if;

  return coalesce(array(
    select distinct cp.pedido_id
      from public.cuenta_pedidos cp
      join public.cuentas c on c.id = cp.cuenta_id and c.restaurante_id = p_restaurante_id
     where c.estado = 'anulada'
       and cp.pedido_id = any(coalesce(p_pedido_ids, '{}'::uuid[]))
     order by cp.pedido_id
  ), '{}'::uuid[]);
end;
$$;
revoke all on function public.pedidos_con_cuenta_anulada(uuid, uuid[]) from public, anon;
grant execute on function public.pedidos_con_cuenta_anulada(uuid, uuid[]) to authenticated;

create or replace function public.registrar_impresion_salida_comanda(
  p_restaurante_id uuid,
  p_pedido_id uuid,
  p_estacion text,
  p_entrega_id uuid,
  p_solicitud_id uuid,
  p_motivo text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rol text;
  v_actor_nombre text;
  v_restaurante_nombre text;
  v_mesa_id uuid;
  v_mesa_nombre text;
  v_estado_pedido text;
  v_entrega public.entregas_comanda%rowtype;
  v_accion_existente text;
  v_entrega_existente text;
  v_es_reimpresion boolean;
  v_accion text;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
begin
  if auth.uid() is null then raise exception 'Inicia sesión para registrar la impresión.'; end if;
  if p_solicitud_id is null then raise exception 'No se pudo identificar esta solicitud de impresión. Inténtalo de nuevo.'; end if;
  if p_estacion not in ('cocina', 'bar', 'otros') then raise exception 'Selecciona una estación válida.'; end if;
  perform public.validar_acceso_restaurante(p_restaurante_id);

  select u.rol::text, u.nombre into v_rol, v_actor_nombre
    from public.usuarios u
   where u.id = auth.uid() and u.restaurante_id = p_restaurante_id and coalesce(u.activo, true);
  if coalesce(v_rol, '') not in ('admin_restaurante', 'mesero', 'cocina') then
    raise exception 'Tu perfil no tiene permiso para imprimir comandas.' using errcode = '42501';
  end if;
  if private.bloquear_cuentas_pedido_impresion(p_restaurante_id, p_pedido_id) then
    raise exception 'La cuenta fue anulada. Esta salida de impresión ya no está disponible.' using errcode = '22023';
  end if;

  select d.* into v_entrega
    from public.entregas_comanda d
   where d.id = p_entrega_id and d.restaurante_id = p_restaurante_id
     and d.pedido_id = p_pedido_id and d.grupo = 'principal'
     and d.tipo_destino = 'impresora'
   for update;
  if not found or coalesce(v_entrega.estacion_codigo, p_estacion) <> p_estacion then
    raise exception 'La salida manual no pertenece a esta comanda y estación.' using errcode = '42501';
  end if;
  if v_entrega.estado = 'cancelada' or v_entrega.cancelada_por_anulacion_cuenta then
    raise exception 'La salida de impresión fue cancelada y no se puede volver a preparar.';
  end if;

  select p.estado, r.nombre, m.id, m.nombre
    into v_estado_pedido, v_restaurante_nombre, v_mesa_id, v_mesa_nombre
    from public.pedidos p
    join public.restaurantes r on r.id = p.restaurante_id
    join public.mesas m on m.id = p.mesa_id and m.restaurante_id = p.restaurante_id
   where p.id = p_pedido_id and p.restaurante_id = p_restaurante_id;
  if not found or v_estado_pedido = 'anulado' then raise exception 'La comanda está anulada o no pertenece a este restaurante.'; end if;
  if not exists (
    select 1 from public.pedido_items pi
     where pi.pedido_id = p_pedido_id and pi.estacion = p_estacion and pi.anulado is not true
  ) then raise exception 'Esta comanda no tiene productos vigentes para esa estación.'; end if;

  select l.accion, l.detalle ->> 'entrega_id'
    into v_accion_existente, v_entrega_existente
    from public.audit_logs l
   where l.detalle ->> 'solicitud_id' = p_solicitud_id::text
   limit 1;
  if found then
    if v_entrega_existente = p_entrega_id::text and exists (
      select 1 from public.audit_logs l
       where l.detalle ->> 'solicitud_id' = p_solicitud_id::text
         and l.actor_id = auth.uid() and l.restaurante_id = p_restaurante_id
         and l.entidad = 'pedido' and l.entidad_id = p_pedido_id
    ) then
      return jsonb_build_object('estado', 'registrada', 'accion', v_accion_existente);
    end if;
    raise exception 'La solicitud de impresión ya se usó para otra salida.';
  end if;

  select exists (
    select 1 from public.audit_logs l
     where l.restaurante_id = p_restaurante_id and l.entidad = 'pedido'
       and l.entidad_id = p_pedido_id
       and l.accion in ('comanda_imprimir', 'comanda_reimprimir')
       and l.detalle ->> 'entrega_id' = p_entrega_id::text
  ) into v_es_reimpresion;
  if v_es_reimpresion and v_motivo is null then return jsonb_build_object('estado', 'requiere_motivo'); end if;
  if v_es_reimpresion and (length(v_motivo) < 5 or length(v_motivo) > 300) then
    raise exception 'Escribe un motivo de reimpresión de entre 5 y 300 caracteres.';
  end if;

  v_accion := case when v_es_reimpresion then 'comanda_reimprimir' else 'comanda_imprimir' end;
  begin
    insert into public.audit_logs (
      actor_id, actor_rol, actor_nombre, restaurante_id, restaurante_nombre,
      entidad, entidad_id, accion, descripcion, detalle
    ) values (
      auth.uid(), v_rol, v_actor_nombre, p_restaurante_id, v_restaurante_nombre,
      'pedido', p_pedido_id, v_accion,
      case when v_es_reimpresion then 'Comanda reimpresa en ' else 'Comanda enviada a impresión en ' end
        || initcap(p_estacion) || ', mesa ' || v_mesa_nombre || ' (' || coalesce(v_entrega.destino_nombre, 'impresora configurada') || ').',
      jsonb_build_object(
        'solicitud_id', p_solicitud_id, 'entrega_id', p_entrega_id, 'pedido_id', p_pedido_id,
        'mesa_id', v_mesa_id, 'mesa_nombre', v_mesa_nombre, 'estacion', p_estacion,
        'impresora', v_entrega.destino_nombre, 'papel_mm', v_entrega.configuracion_destino -> 'papel_mm',
        'copias', coalesce(v_entrega.configuracion_destino -> 'copias', '1'::jsonb),
        'configuracion_version', v_entrega.configuracion_version,
        'configuracion_destino', v_entrega.configuracion_destino,
        'motivo', case when v_es_reimpresion then v_motivo else null end
      )
    );
  exception when unique_violation then
    select l.accion into v_accion_existente
      from public.audit_logs l
     where l.detalle ->> 'solicitud_id' = p_solicitud_id::text
       and l.detalle ->> 'entrega_id' = p_entrega_id::text
       and l.actor_id = auth.uid() and l.restaurante_id = p_restaurante_id
       and l.entidad_id = p_pedido_id;
    if not found then raise exception 'La solicitud de impresión ya se usó para otra salida.'; end if;
    return jsonb_build_object('estado', 'registrada', 'accion', v_accion_existente);
  end;

  update public.entregas_comanda d set estado = 'enviada', updated_at = now(), solicitud_impresion_id = p_solicitud_id
   where d.id = p_entrega_id and d.restaurante_id = p_restaurante_id;
  return jsonb_build_object('estado', 'registrada', 'accion', v_accion);
end;
$$;

create or replace function public.actualizar_estado_salida_comanda(
  p_restaurante_id uuid,
  p_entrega_id uuid,
  p_solicitud_id uuid,
  p_estado text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rol text;
  v_entrega public.entregas_comanda%rowtype;
begin
  if auth.uid() is null then raise exception 'Inicia sesión para actualizar la salida.'; end if;
  if p_estado not in ('confirmada', 'fallida') then raise exception 'Estado de impresión no válido.'; end if;
  perform public.validar_acceso_restaurante(p_restaurante_id);

  select u.rol::text into v_rol
    from public.usuarios u
   where u.id = auth.uid() and u.restaurante_id = p_restaurante_id and coalesce(u.activo, true);
  if coalesce(v_rol, '') not in ('admin_restaurante', 'mesero', 'cocina') then
    raise exception 'Tu perfil no tiene permiso para actualizar esta salida.' using errcode = '42501';
  end if;

  select d.* into v_entrega from public.entregas_comanda d
   where d.id = p_entrega_id and d.restaurante_id = p_restaurante_id
     and d.grupo = 'principal' and d.tipo_destino = 'impresora';
  if not found then raise exception 'La salida de impresión ya no está disponible.'; end if;
  if private.bloquear_cuentas_pedido_impresion(p_restaurante_id, v_entrega.pedido_id)
     then raise exception 'La cuenta fue anulada. No se puede confirmar ni reintentar esta impresión.' using errcode = '22023'; end if;
  select d.* into v_entrega from public.entregas_comanda d
   where d.id = p_entrega_id and d.restaurante_id = p_restaurante_id
     and d.grupo = 'principal' and d.tipo_destino = 'impresora'
   for update;
  if not found or v_entrega.cancelada_por_anulacion_cuenta or v_entrega.estado = 'cancelada' then
    raise exception 'La cuenta fue anulada. No se puede confirmar ni reintentar esta impresión.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.audit_logs l
     where l.detalle ->> 'solicitud_id' = p_solicitud_id::text
       and l.detalle ->> 'entrega_id' = p_entrega_id::text
       and l.actor_id = auth.uid() and l.restaurante_id = p_restaurante_id
       and l.accion in ('comanda_imprimir', 'comanda_reimprimir')
  ) then raise exception 'No se encontró la solicitud de impresión asociada.'; end if;

  if v_entrega.solicitud_impresion_id is distinct from p_solicitud_id then
    raise exception 'Hay otra solicitud de impresión activa. Actualiza la cola antes de confirmar.';
  end if;
  if v_entrega.estado = p_estado then return; end if;
  if v_entrega.estado not in ('enviada', 'fallida') then
    raise exception 'La salida no está esperando confirmación de impresión.';
  end if;
  update public.entregas_comanda set estado = p_estado, updated_at = now()
   where id = p_entrega_id and restaurante_id = p_restaurante_id;
end;
$$;

revoke all on function public.registrar_impresion_salida_comanda(uuid, uuid, text, uuid, uuid, text) from public, anon;
revoke all on function public.actualizar_estado_salida_comanda(uuid, uuid, uuid, text) from public, anon;
grant execute on function public.registrar_impresion_salida_comanda(uuid, uuid, text, uuid, uuid, text) to authenticated;
grant execute on function public.actualizar_estado_salida_comanda(uuid, uuid, uuid, text) to authenticated;

create or replace function public.agente_impresion_reclamar(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_agente private.agentes_impresion%rowtype;
  v_job private.trabajos_impresion%rowtype;
  v_entrega public.entregas_comanda%rowtype;
  v_candidato record;
  v_expirado record;
  v_cuenta record;
  v_reclamo uuid := gen_random_uuid();
  v_restaurante text;
  v_mesa text;
  v_mesero text;
  v_items jsonb;
  v_anulada boolean;
  v_actor_rol text;
  v_actor_nombre text;
begin
  v_agente := private.agente_impresion_activo(p_token);
  update private.trabajos_impresion set estado = 'fallido', proximo_intento_at = null,
    error_final = 'Resultado incierto: el agente inició el envío y perdió la conexión. Revisar antes de reimprimir.',
    actualizado_at = now()
   where agente_id = v_agente.id and estado = 'reclamado' and lease_hasta < now()
     and tipo <> 'comanda'
     and envio_iniciado_at is not null;
  update private.trabajos_impresion set estado = 'fallido', proximo_intento_at = null,
    error_final = 'Se agotaron los intentos antes de enviar a la impresora.', actualizado_at = now()
   where agente_id = v_agente.id and estado = 'reclamado' and lease_hasta < now()
     and tipo <> 'comanda'
     and envio_iniciado_at is null and intentos >= max_intentos;

  -- Los trabajos de comanda se resuelven con los locks cuenta -> entrega -> trabajo.
  -- Para cuentas anuladas que existian antes de esta migracion, se conserva y
  -- etiqueta la salida, y se cancela el trabajo sin volverlo a intentar.
  for v_expirado in
    select j.id, j.entrega_id, j.pedido_id, j.envio_iniciado_at, j.intentos, j.max_intentos
      from private.trabajos_impresion j
     where j.agente_id = v_agente.id and j.restaurante_id = v_agente.restaurante_id
       and j.tipo = 'comanda' and j.estado = 'reclamado' and j.lease_hasta < now()
       and (j.envio_iniciado_at is not null or j.intentos >= j.max_intentos)
     order by j.id
  loop
    v_anulada := private.bloquear_cuentas_pedido_impresion(v_agente.restaurante_id, v_expirado.pedido_id);
    select d.* into v_entrega from public.entregas_comanda d
     where d.id = v_expirado.entrega_id and d.restaurante_id = v_agente.restaurante_id
     for update;
    if not found then continue; end if;

    if v_anulada and not v_entrega.cancelada_por_anulacion_cuenta then
      select c.id, c.anulada_at, c.anulada_por, c.motivo_anulacion
        into v_cuenta
        from public.cuenta_pedidos cp
        join public.cuentas c on c.id = cp.cuenta_id
       where cp.pedido_id = v_expirado.pedido_id
         and c.restaurante_id = v_agente.restaurante_id
         and c.estado = 'anulada'
       order by c.id limit 1;
      update public.entregas_comanda d
         set estado = case when d.estado in ('pendiente', 'fallida') then 'cancelada' else d.estado end,
             cancelada_por_anulacion_cuenta = true,
             cancelada_cuenta_id = v_cuenta.id,
             cancelada_at = v_cuenta.anulada_at,
             cancelada_por = v_cuenta.anulada_por,
             motivo_cancelacion = v_cuenta.motivo_anulacion,
             updated_at = now()
       where d.id = v_entrega.id and d.restaurante_id = v_agente.restaurante_id;
      if v_cuenta.anulada_por is not null then
        select u.rol::text, u.nombre into v_actor_rol, v_actor_nombre
          from public.usuarios u where u.id = v_cuenta.anulada_por;
      else
        v_actor_rol := 'sistema';
        v_actor_nombre := 'Agente de impresion';
      end if;
      if not exists (
        select 1 from public.audit_logs l
         where l.entidad = 'entrega_comanda' and l.entidad_id = v_entrega.id
           and l.accion = 'comanda_salida_cancelada_por_anulacion_cuenta'
      ) then
        insert into public.audit_logs (
          actor_id, actor_rol, actor_nombre, restaurante_id, restaurante_nombre,
          entidad, entidad_id, accion, descripcion, detalle
        )
        select v_cuenta.anulada_por, v_actor_rol, v_actor_nombre, v_agente.restaurante_id, r.nombre,
          'entrega_comanda', v_entrega.id, 'comanda_salida_cancelada_por_anulacion_cuenta',
          'Salida de ' || coalesce(v_entrega.estacion_codigo, 'estacion') || ' cancelada por anulacion de cuenta en ' || coalesce(m.nombre, 'mesa'),
          jsonb_build_object(
            'cuenta_id', v_cuenta.id, 'pedido_id', v_expirado.pedido_id,
            'entrega_id', v_entrega.id, 'estacion', v_entrega.estacion_codigo,
            'motivo', v_cuenta.motivo_anulacion, 'anulada_at', v_cuenta.anulada_at,
            'reconciliada_por', 'agente_impresion'
          )
          from public.restaurantes r
          left join public.pedidos p on p.id = v_expirado.pedido_id and p.restaurante_id = r.id
          left join public.mesas m on m.id = p.mesa_id and m.restaurante_id = r.id
         where r.id = v_agente.restaurante_id;
      end if;
      select d.* into v_entrega from public.entregas_comanda d
       where d.id = v_expirado.entrega_id and d.restaurante_id = v_agente.restaurante_id;
    end if;

    select j.* into v_job from private.trabajos_impresion j
     where j.id = v_expirado.id and j.agente_id = v_agente.id
       and j.restaurante_id = v_agente.restaurante_id
       and j.estado = 'reclamado' and j.lease_hasta < now()
       and (j.envio_iniciado_at is not null or j.intentos >= j.max_intentos)
     for update skip locked;
    if not found then continue; end if;

    if v_anulada or v_entrega.cancelada_por_anulacion_cuenta or v_entrega.estado = 'cancelada' then
      update private.trabajos_impresion set estado = 'cancelado', lease_hasta = null,
        proximo_intento_at = null,
        error_final = coalesce(error_final, 'Cuenta anulada: la salida ya no se puede imprimir.'),
        actualizado_at = now()
       where id = v_job.id;
    elsif v_job.envio_iniciado_at is not null then
      update private.trabajos_impresion set estado = 'fallido', proximo_intento_at = null,
        error_final = 'Resultado incierto: el agente inicio el envio y perdio la conexion. Revisar antes de reimprimir.',
        actualizado_at = now()
       where id = v_job.id;
    else
      update private.trabajos_impresion set estado = 'fallido', proximo_intento_at = null,
        error_final = 'Se agotaron los intentos antes de enviar a la impresora.', actualizado_at = now()
       where id = v_job.id;
    end if;
  end loop;

  -- No bloquear trabajos primero: para cada candidato se bloquea cuenta, entrega
  -- y por último el trabajo. Esto comparte el orden con anular_cuenta.
  for v_candidato in
    select j.id, j.tipo, j.entrega_id, j.pedido_id
      from private.trabajos_impresion j
     where j.agente_id = v_agente.id and j.restaurante_id = v_agente.restaurante_id
       and j.estado in ('pendiente', 'fallido', 'reclamado')
       and (
         (j.tipo = 'comanda' and exists (
           select 1 from public.cuenta_pedidos cp
           join public.cuentas c on c.id = cp.cuenta_id
           where cp.pedido_id = j.pedido_id and c.restaurante_id = j.restaurante_id
             and c.estado = 'anulada'
         ) and not (j.estado = 'reclamado' and j.envio_iniciado_at is not null and j.lease_hasta >= now()))
         or (j.intentos < j.max_intentos and (
           j.estado = 'pendiente'
           or (j.estado = 'fallido' and j.proximo_intento_at is not null and j.proximo_intento_at <= now())
           or (j.estado = 'reclamado' and j.envio_iniciado_at is null and j.lease_hasta < now())
         ))
       )
     order by j.creado_at, j.id
     limit 100
  loop
    if v_candidato.tipo = 'comanda' then
      v_anulada := private.bloquear_cuentas_pedido_impresion(v_agente.restaurante_id, v_candidato.pedido_id);
      select d.* into v_entrega from public.entregas_comanda d
       where d.id = v_candidato.entrega_id and d.restaurante_id = v_agente.restaurante_id
       for update;
      if not found then continue; end if;
      if v_anulada or v_entrega.cancelada_por_anulacion_cuenta or v_entrega.estado = 'cancelada'
         or v_entrega.estado not in ('pendiente', 'fallida') then
        if v_anulada then
          select c.id, c.anulada_at, c.anulada_por, c.motivo_anulacion
            into v_cuenta
            from public.cuenta_pedidos cp
            join public.cuentas c on c.id = cp.cuenta_id
           where cp.pedido_id = v_candidato.pedido_id
             and c.restaurante_id = v_agente.restaurante_id
             and c.estado = 'anulada'
           order by c.id limit 1;
          if not v_entrega.cancelada_por_anulacion_cuenta then
            update public.entregas_comanda d
               set estado = case when d.estado in ('pendiente', 'fallida') then 'cancelada' else d.estado end,
                   cancelada_por_anulacion_cuenta = true,
                   cancelada_cuenta_id = v_cuenta.id,
                   cancelada_at = v_cuenta.anulada_at,
                   cancelada_por = v_cuenta.anulada_por,
                   motivo_cancelacion = v_cuenta.motivo_anulacion,
                   updated_at = now()
             where d.id = v_entrega.id and d.restaurante_id = v_agente.restaurante_id;
            if v_cuenta.anulada_por is not null then
              select u.rol::text, u.nombre into v_actor_rol, v_actor_nombre
                from public.usuarios u where u.id = v_cuenta.anulada_por;
            else
              v_actor_rol := 'sistema';
              v_actor_nombre := 'Agente de impresion';
            end if;
            if not exists (
              select 1 from public.audit_logs l
               where l.entidad = 'entrega_comanda' and l.entidad_id = v_entrega.id
                 and l.accion = 'comanda_salida_cancelada_por_anulacion_cuenta'
            ) then
              insert into public.audit_logs (
                actor_id, actor_rol, actor_nombre, restaurante_id, restaurante_nombre,
                entidad, entidad_id, accion, descripcion, detalle
              )
              select v_cuenta.anulada_por, v_actor_rol, v_actor_nombre, v_agente.restaurante_id, r.nombre,
                'entrega_comanda', v_entrega.id, 'comanda_salida_cancelada_por_anulacion_cuenta',
                'Salida de ' || coalesce(v_entrega.estacion_codigo, 'estacion') || ' cancelada por anulacion de cuenta en ' || coalesce(m.nombre, 'mesa'),
                jsonb_build_object(
                  'cuenta_id', v_cuenta.id, 'pedido_id', v_candidato.pedido_id,
                  'entrega_id', v_entrega.id, 'estacion', v_entrega.estacion_codigo,
                  'motivo', v_cuenta.motivo_anulacion, 'anulada_at', v_cuenta.anulada_at,
                  'reconciliada_por', 'agente_impresion'
                )
                from public.restaurantes r
                left join public.pedidos p on p.id = v_candidato.pedido_id and p.restaurante_id = r.id
                left join public.mesas m on m.id = p.mesa_id and m.restaurante_id = r.id
               where r.id = v_agente.restaurante_id;
            end if;
            select d.* into v_entrega from public.entregas_comanda d
             where d.id = v_entrega.id and d.restaurante_id = v_agente.restaurante_id;
          end if;
        end if;
        update private.trabajos_impresion set estado = 'cancelado', lease_hasta = null,
          proximo_intento_at = null,
          error_final = coalesce(error_final, 'Cuenta anulada: la salida ya no se puede imprimir.'),
          actualizado_at = now()
         where id = v_candidato.id and estado in ('pendiente', 'fallido', 'reclamado');
        continue;
      end if;
    end if;

    select j.* into v_job from private.trabajos_impresion j
     where j.id = v_candidato.id and j.agente_id = v_agente.id
       and j.restaurante_id = v_agente.restaurante_id
       and j.intentos < j.max_intentos
       and (j.estado = 'pendiente'
         or (j.estado = 'fallido' and j.proximo_intento_at is not null and j.proximo_intento_at <= now())
         or (j.estado = 'reclamado' and j.envio_iniciado_at is null and j.lease_hasta < now()))
     for update skip locked;
    if not found then continue; end if;

    update private.trabajos_impresion set estado = 'reclamado', intentos = intentos + 1,
      reclamo_id = v_reclamo, lease_hasta = now() + interval '90 seconds',
      envio_iniciado_at = null, proximo_intento_at = null, actualizado_at = now()
     where id = v_job.id returning * into v_job;
    select r.nombre into v_restaurante from public.restaurantes r where r.id = v_job.restaurante_id;
    if v_job.tipo = 'comanda' then
      select m.nombre, u.nombre into v_mesa, v_mesero from public.pedidos p
       join public.mesas m on m.id = p.mesa_id and m.restaurante_id = p.restaurante_id
       left join public.usuarios u on u.id = p.mesero_id
       where p.id = v_job.pedido_id and p.restaurante_id = v_job.restaurante_id;
      select coalesce(jsonb_agg(jsonb_build_object('nombre', pi.nombre_producto,
        'cantidad', pi.cantidad, 'nota', pi.nota) order by pi.created_at, pi.id), '[]'::jsonb)
        into v_items from public.pedido_items pi
       where pi.pedido_id = v_job.pedido_id and pi.estacion = v_job.estacion_codigo and pi.anulado is not true;
      if v_items = '[]'::jsonb then
        update private.trabajos_impresion set estado = 'cancelado', error_final = 'Sin productos vigentes.',
          lease_hasta = null, actualizado_at = now() where id = v_job.id;
        return null;
      end if;
    else
      v_mesa := 'PRUEBA'; v_mesero := 'Administrador';
      v_items := jsonb_build_array(jsonb_build_object('nombre', 'Prueba de impresión Mesora',
        'cantidad', 1, 'nota', 'Verifica el papel y el corte.'));
    end if;
    return jsonb_build_object('id', v_job.id, 'reclamo_id', v_reclamo, 'tipo', v_job.tipo,
      'restaurante', v_restaurante, 'restaurante_id', v_job.restaurante_id,
      'pedido_id', v_job.pedido_id, 'mesa', v_mesa, 'mesero', v_mesero,
      'estacion', v_job.estacion_codigo, 'cola_windows', v_job.cola_windows,
      'papel_mm', v_job.papel_mm, 'copias', v_job.copias,
      'configuracion_version', v_job.configuracion_version,
      'numero_intento', v_job.intentos, 'creado_at', v_job.creado_at, 'items', v_items);
  end loop;
  return null;
end;
$$;

create or replace function public.agente_impresion_iniciar_envio(p_token text, p_trabajo_id uuid, p_reclamo_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_agente private.agentes_impresion%rowtype;
  v_job private.trabajos_impresion%rowtype;
  v_entrega public.entregas_comanda%rowtype;
  v_anulada boolean;
begin
  v_agente := private.agente_impresion_activo(p_token);
  select j.* into v_job from private.trabajos_impresion j
   where j.id = p_trabajo_id and j.agente_id = v_agente.id and j.restaurante_id = v_agente.restaurante_id;
  if not found then raise exception 'El trabajo no existe para este agente.' using errcode = '42501'; end if;
  if v_job.tipo = 'comanda' then
    v_anulada := private.bloquear_cuentas_pedido_impresion(v_job.restaurante_id, v_job.pedido_id);
    select d.* into v_entrega from public.entregas_comanda d
     where d.id = v_job.entrega_id and d.restaurante_id = v_job.restaurante_id for update;
    if not found or v_anulada or v_entrega.cancelada_por_anulacion_cuenta
       or v_entrega.estado = 'cancelada' then
      raise exception 'La cuenta fue anulada. El agente no puede preparar esta impresión.' using errcode = '22023';
    end if;
  end if;
  select j.* into v_job from private.trabajos_impresion j
   where j.id = p_trabajo_id and j.agente_id = v_agente.id and j.restaurante_id = v_agente.restaurante_id
   for update;
  if not found or v_job.estado <> 'reclamado' or v_job.reclamo_id is distinct from p_reclamo_id
     or v_job.lease_hasta <= now() then raise exception 'El reclamo expiró o pertenece a otro agente.' using errcode = '42501'; end if;
  if v_job.tipo = 'comanda' and (v_entrega.estado not in ('pendiente', 'fallida')
      or v_entrega.solicitud_impresion_id is not null) then
    raise exception 'La comanda ya no requiere impresión automática.' using errcode = '22023';
  end if;
  update private.trabajos_impresion set envio_iniciado_at = coalesce(envio_iniciado_at, now()),
    lease_hasta = now() + interval '5 minutes', actualizado_at = now() where id = v_job.id;
end;
$$;

create or replace function public.agente_impresion_confirmar(p_token text, p_trabajo_id uuid, p_reclamo_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_agente private.agentes_impresion%rowtype;
  v_job private.trabajos_impresion%rowtype;
  v_entrega public.entregas_comanda%rowtype;
  v_anulada boolean;
  v_restaurante text;
  v_mesa text;
begin
  v_agente := private.agente_impresion_activo(p_token);
  select j.* into v_job from private.trabajos_impresion j
   where j.id = p_trabajo_id and j.agente_id = v_agente.id and j.restaurante_id = v_agente.restaurante_id;
  if not found then raise exception 'El trabajo no existe para este agente.' using errcode = '42501'; end if;
  if v_job.estado = 'enviado' and v_job.reclamo_id is not distinct from p_reclamo_id then
    return jsonb_build_object('estado', 'enviado', 'idempotente', true);
  end if;
  if v_job.tipo = 'comanda' then
    v_anulada := private.bloquear_cuentas_pedido_impresion(v_job.restaurante_id, v_job.pedido_id);
    select d.* into v_entrega from public.entregas_comanda d
     where d.id = v_job.entrega_id and d.restaurante_id = v_job.restaurante_id for update;
    if not found or v_anulada or v_entrega.cancelada_por_anulacion_cuenta
       or v_entrega.estado = 'cancelada' then
      raise exception 'La cuenta fue anulada. El agente no puede confirmar esta impresión.' using errcode = '22023';
    end if;
  end if;
  select j.* into v_job from private.trabajos_impresion j
   where j.id = p_trabajo_id and j.agente_id = v_agente.id and j.restaurante_id = v_agente.restaurante_id
   for update;
  if not found or v_job.reclamo_id is distinct from p_reclamo_id then
    raise exception 'El reclamo pertenece a otro agente.' using errcode = '42501';
  end if;
  if v_job.estado = 'enviado' then return jsonb_build_object('estado', 'enviado', 'idempotente', true); end if;
  if v_job.estado not in ('reclamado', 'fallido') or v_job.envio_iniciado_at is null then
    raise exception 'El trabajo no inició un envío válido.' using errcode = '22023';
  end if;
  if v_job.estado = 'fallido' and v_job.proximo_intento_at is not null then
    raise exception 'Este reclamo ya terminó y está programado para reintento.' using errcode = '22023';
  end if;
  if v_job.tipo = 'comanda' then
    update public.entregas_comanda set estado = 'enviada', updated_at = now()
     where id = v_job.entrega_id and restaurante_id = v_job.restaurante_id
       and estado in ('pendiente', 'fallida') and solicitud_impresion_id is null
       and cancelada_por_anulacion_cuenta is false;
    if not found then raise exception 'La salida fue cancelada o se imprimió manualmente.' using errcode = '40001'; end if;
  end if;
  update private.trabajos_impresion set estado = 'enviado', enviado_at = now(), lease_hasta = null,
    proximo_intento_at = null, error_final = null, actualizado_at = now() where id = v_job.id;
  select nombre into v_restaurante from public.restaurantes where id = v_job.restaurante_id;
  if v_job.pedido_id is not null then
    select m.nombre into v_mesa from public.mesas m join public.pedidos p
      on p.mesa_id = m.id and p.restaurante_id = m.restaurante_id where p.id = v_job.pedido_id;
  end if;
  insert into public.audit_logs(actor_id, actor_rol, actor_nombre, restaurante_id, restaurante_nombre,
    entidad, entidad_id, accion, descripcion, detalle)
  values(null, 'agente_impresion', v_agente.nombre, v_job.restaurante_id, v_restaurante,
    case when v_job.tipo = 'prueba' then 'trabajo_impresion' else 'pedido' end,
    coalesce(v_job.pedido_id, v_job.id), 'comanda_imprimir',
    case when v_job.tipo = 'prueba' then 'Prueba enviada a cola Windows.'
      else 'Comanda enviada a cola Windows en ' || initcap(v_job.estacion_codigo) || '.' end,
    jsonb_build_object('solicitud_id', v_job.id, 'entrega_id', v_job.entrega_id,
      'agente_id', v_agente.id, 'impresora', v_job.cola_windows, 'estacion', v_job.estacion_codigo,
      'pedido_id', v_job.pedido_id, 'mesa_nombre', v_mesa, 'intento', v_job.intentos,
      'enviado_at', now(), 'resultado', 'enviado_a_cola', 'impresion_fisica_confirmada', false));
  return jsonb_build_object('estado', 'enviado', 'impresion_fisica_confirmada', false);
end;
$$;

create or replace function public.agente_impresion_fallar(
  p_token text, p_trabajo_id uuid, p_reclamo_id uuid, p_error text, p_reintento_seguro boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_agente private.agentes_impresion%rowtype;
  v_job private.trabajos_impresion%rowtype;
  v_entrega public.entregas_comanda%rowtype;
  v_anulada boolean;
  v_seguro boolean;
  v_siguiente timestamptz;
  v_error text;
begin
  v_agente := private.agente_impresion_activo(p_token);
  select j.* into v_job from private.trabajos_impresion j
   where j.id = p_trabajo_id and j.agente_id = v_agente.id and j.restaurante_id = v_agente.restaurante_id;
  if not found then raise exception 'El trabajo no existe para este agente.' using errcode = '42501'; end if;
  if v_job.tipo = 'comanda' then
    v_anulada := private.bloquear_cuentas_pedido_impresion(v_job.restaurante_id, v_job.pedido_id);
    select d.* into v_entrega from public.entregas_comanda d
     where d.id = v_job.entrega_id and d.restaurante_id = v_job.restaurante_id for update;
    if not found or v_anulada or v_entrega.cancelada_por_anulacion_cuenta
       or v_entrega.estado = 'cancelada' then
      raise exception 'La cuenta fue anulada. El agente no puede actualizar esta impresión.' using errcode = '22023';
    end if;
  end if;
  select j.* into v_job from private.trabajos_impresion j
   where j.id = p_trabajo_id and j.agente_id = v_agente.id and j.restaurante_id = v_agente.restaurante_id
   for update;
  if not found or v_job.estado <> 'reclamado' or v_job.reclamo_id is distinct from p_reclamo_id then
    raise exception 'El reclamo ya terminó o pertenece a otro agente.' using errcode = '42501';
  end if;
  v_seguro := coalesce(p_reintento_seguro, false) and v_job.envio_iniciado_at is null
    and v_job.intentos < v_job.max_intentos;
  v_error := left(coalesce(nullif(btrim(p_error), ''), 'No se pudo enviar a la cola Windows.'), 300);
  if v_seguro then
    v_siguiente := now() + make_interval(secs => least(3600,
      (v_job.reintento_base_seg * power(2, greatest(0, v_job.intentos - 1)))::integer));
  end if;
  update private.trabajos_impresion set estado = 'fallido', lease_hasta = null,
    proximo_intento_at = v_siguiente, error_ultimo = v_error,
    error_final = case when v_siguiente is null then
      case when v_job.envio_iniciado_at is not null then 'Resultado incierto después de iniciar el envío. ' || v_error else v_error end
      else null end, actualizado_at = now()
   where id = v_job.id;
  if v_job.tipo = 'comanda' then
    update public.entregas_comanda set estado = 'fallida', error_publico = v_error, updated_at = now()
     where id = v_job.entrega_id and restaurante_id = v_job.restaurante_id and estado = 'pendiente';
  end if;
  return jsonb_build_object('estado', 'fallido', 'reintento_at', v_siguiente, 'requiere_revision', v_siguiente is null);
end;
$$;

revoke all on function public.agente_impresion_reclamar(text),
  public.agente_impresion_iniciar_envio(text, uuid, uuid),
  public.agente_impresion_confirmar(text, uuid, uuid),
  public.agente_impresion_fallar(text, uuid, uuid, text, boolean)
  from public, authenticated;
grant execute on function public.agente_impresion_reclamar(text),
  public.agente_impresion_iniciar_envio(text, uuid, uuid),
  public.agente_impresion_confirmar(text, uuid, uuid),
  public.agente_impresion_fallar(text, uuid, uuid, text, boolean)
  to anon;

commit;
