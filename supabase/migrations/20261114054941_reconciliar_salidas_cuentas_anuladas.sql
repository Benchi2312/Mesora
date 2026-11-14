-- Reconcilia salidas de impresión creadas antes de la protección de cuentas
-- anuladas. Conserva pedidos, pagos, recibos, salidas y auditoría histórica.
begin;

-- Las RPC manuales y del agente usan este bloqueo con el orden cuenta -> salida
-- -> trabajo. La comprobación consulta el estado real de la cuenta, aunque la
-- salida sea histórica y todavía no tenga la marca de cancelación.
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
revoke all on function private.bloquear_cuentas_pedido_impresion(uuid, uuid)
  from public, anon, authenticated;

-- Reconciliación idempotente. Bloquea cuenta, salida y después cada trabajo,
-- respetando el orden que siguen las RPC de impresión para evitar carreras.
do $$
declare
  v_cuenta record;
  v_salida record;
  v_trabajo record;
  v_actor_rol text;
  v_actor_nombre text;
  v_restaurante_nombre text;
  v_mesa_nombre text;
  v_envio_iniciado boolean;
  v_cancelar_estado boolean;
begin
  for v_cuenta in
    select c.id, c.restaurante_id, c.anulada_at, c.anulada_por, c.motivo_anulacion
      from public.cuentas c
     where c.estado = 'anulada'
     order by c.id
     for update of c
  loop
    select r.nombre into v_restaurante_nombre
      from public.restaurantes r where r.id = v_cuenta.restaurante_id;
    select m.nombre into v_mesa_nombre
      from public.cuenta_pedidos cp
      join public.pedidos p on p.id = cp.pedido_id
        and p.restaurante_id = v_cuenta.restaurante_id
      join public.mesas m on m.id = p.mesa_id
        and m.restaurante_id = p.restaurante_id
     where cp.cuenta_id = v_cuenta.id
     order by p.created_at, p.id
     limit 1;

    v_actor_rol := null;
    v_actor_nombre := null;
    if v_cuenta.anulada_por is not null then
      select u.rol::text, u.nombre into v_actor_rol, v_actor_nombre
        from public.usuarios u
       where u.id = v_cuenta.anulada_por
         and u.restaurante_id = v_cuenta.restaurante_id;
    end if;
    v_actor_rol := coalesce(v_actor_rol, 'sistema');
    v_actor_nombre := coalesce(v_actor_nombre, 'Mesora');

    for v_salida in
      select d.id, d.pedido_id, d.estacion_codigo, d.estado,
             d.solicitud_impresion_id, d.cancelada_por_anulacion_cuenta,
             d.cancelada_cuenta_id, d.cancelada_at, d.cancelada_por,
             d.motivo_cancelacion
        from public.cuenta_pedidos cp
        join public.entregas_comanda d on d.pedido_id = cp.pedido_id
          and d.restaurante_id = v_cuenta.restaurante_id
       where cp.cuenta_id = v_cuenta.id
         and d.tipo_destino = 'impresora'
       order by d.id
       for update of d
    loop
      v_envio_iniciado := v_salida.solicitud_impresion_id is not null;

      for v_trabajo in
        select j.id, j.estado, j.envio_iniciado_at
          from private.trabajos_impresion j
         where j.entrega_id = v_salida.id
           and j.restaurante_id = v_cuenta.restaurante_id
         order by j.id
         for update of j
      loop
        if v_trabajo.envio_iniciado_at is not null then
          v_envio_iniciado := true;
        elsif v_trabajo.estado in ('pendiente', 'reclamado', 'fallido') then
          update private.trabajos_impresion j
             set estado = 'cancelado',
                 lease_hasta = null,
                 proximo_intento_at = null,
                 error_final = coalesce(j.error_final,
                   'Cuenta anulada antes del envío: la salida no puede reclamarse ni imprimirse.'),
                 actualizado_at = now()
           where j.id = v_trabajo.id
             and j.restaurante_id = v_cuenta.restaurante_id
             and j.envio_iniciado_at is null
             and j.estado in ('pendiente', 'reclamado', 'fallido');
        end if;
      end loop;

      -- Si hay solicitud manual o un agente ya inició el envío, solo se aplica
      -- el bloqueo lógico. El estado físico se conserva como estaba.
      v_cancelar_estado := v_salida.estado in ('pendiente', 'fallida')
        and not v_envio_iniciado;

      if v_salida.cancelada_por_anulacion_cuenta is distinct from true
         or v_salida.cancelada_cuenta_id is null
         or (v_salida.cancelada_at is null and v_cuenta.anulada_at is not null)
         or (v_salida.cancelada_por is null and v_cuenta.anulada_por is not null)
         or (v_salida.motivo_cancelacion is null and v_cuenta.motivo_anulacion is not null)
         or (v_cancelar_estado and v_salida.estado <> 'cancelada') then
        update public.entregas_comanda d
           set estado = case when v_cancelar_estado then 'cancelada' else d.estado end,
               cancelada_por_anulacion_cuenta = true,
               cancelada_cuenta_id = coalesce(d.cancelada_cuenta_id, v_cuenta.id),
               cancelada_at = coalesce(d.cancelada_at, v_cuenta.anulada_at, now()),
               cancelada_por = coalesce(d.cancelada_por, v_cuenta.anulada_por),
               motivo_cancelacion = coalesce(d.motivo_cancelacion, v_cuenta.motivo_anulacion),
               updated_at = now()
         where d.id = v_salida.id
           and d.restaurante_id = v_cuenta.restaurante_id;
      end if;

      if not exists (
        select 1
          from public.audit_logs a
         where a.restaurante_id = v_cuenta.restaurante_id
           and a.entidad = 'entrega_comanda'
           and a.entidad_id = v_salida.id
           and a.accion = 'comanda_salida_cancelada_por_anulacion_cuenta'
      ) then
        insert into public.audit_logs (
          actor_id, actor_rol, actor_nombre, restaurante_id, restaurante_nombre,
          entidad, entidad_id, accion, descripcion, detalle
        ) values (
          v_cuenta.anulada_por, v_actor_rol, v_actor_nombre,
          v_cuenta.restaurante_id, v_restaurante_nombre,
          'entrega_comanda', v_salida.id,
          'comanda_salida_cancelada_por_anulacion_cuenta',
          'Salida de ' || coalesce(v_salida.estacion_codigo, 'estación')
            || ' bloqueada por anulación de cuenta en ' || coalesce(v_mesa_nombre, 'mesa'),
          jsonb_build_object(
            'cuenta_id', v_cuenta.id,
            'pedido_id', v_salida.pedido_id,
            'entrega_id', v_salida.id,
            'estacion', v_salida.estacion_codigo,
            'motivo', v_cuenta.motivo_anulacion,
            'anulada_at', v_cuenta.anulada_at,
            'reconciliada_por', 'migracion_20261114051725'
          )
        );
      end if;
    end loop;
  end loop;
end;
$$;

commit;
