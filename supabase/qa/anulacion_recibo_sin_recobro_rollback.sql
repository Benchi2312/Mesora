-- Prueba transaccional: no deja datos en la base local de QA.
begin;
do $$
declare r uuid:=gen_random_uuid(); otro uuid:=gen_random_uuid();
  admin_id uuid:=gen_random_uuid(); cocina_id uuid:=gen_random_uuid(); inactivo_id uuid:=gen_random_uuid();
  z uuid:=gen_random_uuid(); m uuid:=gen_random_uuid(); p uuid:=gen_random_uuid();
  c uuid; nueva uuid:=gen_random_uuid(); cuenta public.cuentas; audit_antes integer; fecha timestamptz;
  rol_inicial text:=current_user;
begin
  insert into auth.users(id) values(admin_id),(cocina_id),(inactivo_id);
  insert into public.restaurantes(id,nombre,suscripcion_activa,fecha_vencimiento)
    values(r,'QA recibo',true,now()+interval '30 days'),(otro,'QA ajeno',true,now()+interval '30 days');
  insert into public.usuarios(id,restaurante_id,rol,nombre,activo)
    values(admin_id,r,'admin_restaurante','Admin QA',true),
      (cocina_id,r,'cocina','Cocina QA',true),(inactivo_id,r,'cajero','Inactivo QA',false);
  insert into public.zonas(id,restaurante_id,nombre) values(z,r,'QA');
  insert into public.mesas(id,restaurante_id,zona_id,nombre) values(m,r,z,'Mesa QA');
  insert into public.pedidos(id,restaurante_id,mesa_id,mesero_id) values(p,r,m,admin_id);
  insert into public.pedido_items(pedido_id,nombre_producto,cantidad,precio_unitario)
    values(p,'Plato QA',1,10);
  insert into public.estado_comanda_estacion(restaurante_id,pedido_id,estacion_id,estado)
    select r,p,e.id,'pendiente' from public.estaciones_restaurante e
     where e.restaurante_id=r and e.codigo='cocina';
  perform set_config('request.jwt.claim.sub',admin_id::text,true);
  execute 'set local role authenticated';
  c:=public.cerrar_cuenta(r,m,array[p],'[{"metodo_pago":"efectivo","monto":10}]'::jsonb,0);
  if c is null then raise exception 'No se emitió el recibo inicial'; end if;
  select * into cuenta from public.anular_cuenta(r,c,'Error de cobro',null);
  if cuenta.estado<>'anulada' or cuenta.anulada_por<>admin_id or cuenta.anulada_at is null
     or cuenta.motivo_anulacion<>'Error de cobro' then
    raise exception 'Faltan estado o trazabilidad de anulación';
  end if;
  execute format('set local role %I',rol_inicial);
  select count(*) into audit_antes from public.audit_logs
   where entidad_id=c and accion='cuenta_anular';
  if audit_antes<>1 then raise exception 'La primera anulación no produjo una sola auditoría'; end if;
  execute 'set local role authenticated';
  fecha:=cuenta.anulada_at;
  select * into cuenta from public.anular_cuenta(r,c,'Error de cobro',null);
  execute format('set local role %I',rol_inicial);
  if cuenta.anulada_at<>fecha or (select count(*) from public.audit_logs
    where entidad_id=c and accion='cuenta_anular')<>1 then
    raise exception 'La segunda anulación no fue idempotente';
  end if;
  execute 'set local role authenticated';
  if jsonb_array_length(public.mesas_por_cobrar(r))<>0
     or jsonb_array_length(public.pedidos_pendientes_mesa(r,m))<>0 then
    raise exception 'La venta anulada reapareció pendiente';
  end if;
  begin
    perform public.cerrar_cuenta(r,m,array[p],'[{"metodo_pago":"efectivo","monto":10}]'::jsonb,0);
    raise exception 'Se permitió cobrar dos veces';
  exception when others then
    if sqlerrm='Se permitió cobrar dos veces' then raise; end if;
  end;
  execute format('set local role %I',rol_inicial);
  insert into public.cuentas(id,restaurante_id,mesa_id,total,metodo_pago,estado,pagado_at)
    values(nueva,r,m,10,'efectivo','pagada',now());
  begin
    insert into public.cuenta_pedidos(cuenta_id,pedido_id,subtotal) values(nueva,p,10);
    raise exception 'Se omitió el bloqueo directo del vínculo de cobro';
  exception when unique_violation then null; end;
  execute 'set local role authenticated';
  if (select count(*) from public.cuentas where id=c and estado='anulada')<>1
    or (select count(*) from public.cuenta_pagos where cuenta_id=c)<>1
    or (select count(*) from public.cuenta_pedidos where cuenta_id=c and pedido_id=p)<>1
    or (select estado from public.pedidos where id=p)<>'entregado' then
    raise exception 'Se alteró el historial de la venta';
  end if;
  begin
    perform public.avanzar_comanda_estacion(r,p,'cocina');
    raise exception 'La estación reabrió una comanda cobrada';
  exception when others then
    if sqlerrm='La estación reabrió una comanda cobrada' then raise; end if;
  end;
  perform set_config('request.jwt.claim.sub',cocina_id::text,true);
  begin perform public.anular_cuenta(r,c,'Error de cobro',null);
    raise exception 'Cocina pudo anular';
  exception when raise_exception then
    if sqlerrm='Cocina pudo anular' then raise; end if;
  end;
  perform set_config('request.jwt.claim.sub',inactivo_id::text,true);
  begin perform public.anular_cuenta(r,c,'Error de cobro',null);
    raise exception 'Inactivo pudo anular';
  exception when raise_exception then
    if sqlerrm='Inactivo pudo anular' then raise; end if;
  end;
  perform set_config('request.jwt.claim.sub',admin_id::text,true);
  begin perform public.mesas_por_cobrar(otro);
    raise exception 'Consulta cruzada de restaurante';
  exception when raise_exception then
    if sqlerrm='Consulta cruzada de restaurante' then raise; end if;
  end;
  execute format('set local role %I',rol_inicial);
end; $$;
rollback;
