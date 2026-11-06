-- Datos de QA aislados por UUID, completamente revertidos al final.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
do $$
declare
  r uuid := gen_random_uuid(); otro uuid := gen_random_uuid();
  admin_id uuid := gen_random_uuid(); mesero uuid := gen_random_uuid();
  cocina uuid := gen_random_uuid(); cajero uuid := gen_random_uuid();
  zona uuid := gen_random_uuid(); mesa uuid := gen_random_uuid();
  plato uuid := gen_random_uuid(); bebida uuid := gen_random_uuid();
  p1 uuid; p2 uuid; item_cancelado uuid; cuenta uuid; turno uuid;
  resumen jsonb; c public.cuentas; cierre public.caja_turnos;
  denegado boolean; rol_inicial text := current_user;
begin
  insert into auth.users(id,email) values
    (admin_id,admin_id::text||'@qa.invalid'),(mesero,mesero::text||'@qa.invalid'),
    (cocina,cocina::text||'@qa.invalid'),(cajero,cajero::text||'@qa.invalid');
  insert into public.restaurantes(id,nombre,suscripcion_activa,fecha_vencimiento)
    values(r,'QA piloto transaccional',true,now()+interval '1 day'),(otro,'QA aislamiento',true,now()+interval '1 day');
  insert into public.usuarios(id,restaurante_id,rol,nombre,activo) values
    (admin_id,r,'admin_restaurante','Admin QA',true),(mesero,r,'mesero','Mesero QA',true),
    (cocina,r,'cocina','Cocina QA',true),(cajero,r,'cajero','Cajero QA',true);
  insert into public.zonas(id,restaurante_id,nombre) values(zona,r,'Zona QA');
  insert into public.mesas(id,restaurante_id,zona_id,nombre) values(mesa,r,zona,'Mesa QA');
  insert into public.productos(id,restaurante_id,nombre,precio,disponible,es_bebida) values
    (plato,r,'Plato QA',22.50,true,false),(bebida,r,'Bebida QA',5.50,true,true);

  perform set_config('request.jwt.claim.sub',admin_id::text,true);
  execute 'set local role authenticated';
  perform public.configurar_pin_autorizacion(r,'4242');
  if not public.tiene_pin_autorizacion(r) then raise exception 'No se configuró el PIN'; end if;
  execute format('set local role %I',rol_inicial);

  perform set_config('request.jwt.claim.sub',cajero::text,true);
  execute 'set local role authenticated';
  turno := public.abrir_turno_caja(r,cajero,100);
  execute format('set local role %I',rol_inicial);
  update public.caja_turnos set fecha_apertura=now()-interval '2 minutes' where id=turno;

  perform set_config('request.jwt.claim.sub',mesero::text,true);
  execute 'set local role authenticated';
  p1 := public.crear_pedido(r,mesa,jsonb_build_array(
    jsonb_build_object('producto_id',plato,'cantidad',2,'precio_unitario',0.01),
    jsonb_build_object('producto_id',bebida,'cantidad',1)));
  p2 := public.crear_pedido(r,mesa,jsonb_build_array(jsonb_build_object('producto_id',bebida,'cantidad',2)));
  if (select precio_unitario from public.pedido_items where pedido_id=p1 and producto_id=plato) <> 22.50 then
    raise exception 'El navegador pudo alterar el precio';
  end if;
  select id into item_cancelado from public.pedido_items where pedido_id=p1 and producto_id=bebida;
  denegado:=false;
  begin perform public.anular_item_comanda(r,p1,item_cancelado,'0000');
  exception when others then denegado:=true; end;
  if not denegado then raise exception 'Se anuló un ítem con PIN incorrecto'; end if;
  perform public.anular_item_comanda(r,p1,item_cancelado,'4242');
  if jsonb_array_length(public.pedidos_pendientes_mesa(r,mesa))<>2 then raise exception 'Falta una comanda pendiente'; end if;
  resumen:=public.mesas_por_cobrar(r);
  if (resumen->0->>'total')::numeric<>56 then raise exception 'Precuenta incorrecta: %',resumen; end if;
  denegado:=false;
  begin perform public.mesas_por_cobrar(otro); exception when others then denegado:=true; end;
  if not denegado then raise exception 'Se consultó un restaurante ajeno'; end if;
  execute format('set local role %I',rol_inicial);
  if not exists (
    select 1 from public.audit_logs
     where actor_id=mesero and entidad_id=item_cancelado and accion='comanda_item_anular'
       and detalle->>'producto'='Bebida QA'
       and detalle->>'mesa_id'=mesa::text
  ) then raise exception 'La anulación del ítem no quedó en auditoría'; end if;

  perform set_config('request.jwt.claim.sub',cocina::text,true);
  execute 'set local role authenticated';
  update public.pedidos set estado='en_preparacion' where id=p1;
  update public.pedidos set estado='listo' where id=p1;
  update public.pedidos set estado='entregado' where id=p1;
  if jsonb_array_length(public.pedidos_pendientes_mesa(r,mesa))<>2 then raise exception 'Servir la comanda la dio por cobrada'; end if;
  execute format('set local role %I',rol_inicial);

  perform set_config('request.jwt.claim.sub',mesero::text,true);
  execute 'set local role authenticated';
  cuenta:=public.cerrar_cuenta(r,mesa,array[p1,p2],
    '[{"metodo_pago":"efectivo","monto":40},{"metodo_pago":"tarjeta","monto":30}]'::jsonb,5);
  select * into c from public.cuentas where id=cuenta;
  if c.total<>56 or c.propina<>5 or c.vuelto<>9 then raise exception 'No concilian total, propina y vuelto'; end if;
  if jsonb_array_length(public.pedidos_pendientes_mesa(r,mesa))<>0 then raise exception 'Persisten pedidos cobrados'; end if;
  if jsonb_array_length(public.mesas_por_cobrar(r))<>0 then raise exception 'La mesa cobrada sigue pendiente'; end if;
  if (select estado from public.mesas where id=mesa)<>'libre' then raise exception 'No se liberó la mesa'; end if;
  denegado:=false;
  begin perform public.cerrar_cuenta(r,mesa,array[p1,p2],'[{"metodo_pago":"efectivo","monto":0}]'::jsonb,0);
  exception when others then denegado:=true; end;
  if not denegado then raise exception 'Se pudo cobrar dos veces'; end if;
  denegado:=false;
  begin perform public.anular_cuenta(r,cuenta,'Prueba de rol QA','4242');
  exception when others then denegado:=true; end;
  if not denegado then raise exception 'El mesero anuló un cobro'; end if;
  execute format('set local role %I',rol_inicial);
  update public.cuentas set pagado_at=now()-interval '1 minute' where id=cuenta;

  perform set_config('request.jwt.claim.sub',cajero::text,true);
  execute 'set local role authenticated';
  denegado:=false;
  begin perform public.anular_cuenta(r,cuenta,'Prueba PIN QA','0000');
  exception when others then denegado:=true; end;
  if not denegado then raise exception 'Se anuló un cobro con PIN incorrecto'; end if;
  c:=public.anular_cuenta(r,cuenta,'Anulación de QA con PIN','4242');
  if c.estado<>'anulada' or c.monto_reembolsado<>61 then raise exception 'Reembolso incorrecto'; end if;
  denegado:=false;
  begin perform public.anular_cuenta(r,cuenta,'Segundo intento QA','4242');
  exception when others then denegado:=true; end;
  if not denegado then raise exception 'Se permitió una segunda anulación'; end if;
  execute format('set local role %I',rol_inicial);
  if not exists (
    select 1 from public.audit_logs
     where actor_id=cajero and entidad_id=cuenta and accion='cuenta_anular'
       and detalle->>'motivo'='Anulación de QA con PIN'
       and (detalle->>'monto_reembolsado')::numeric=61
  ) then raise exception 'La anulación de la boleta no quedó en auditoría'; end if;
  update public.cuentas set anulada_at=now()-interval '30 seconds' where id=cuenta;

  perform set_config('request.jwt.claim.sub',cajero::text,true);
  execute 'set local role authenticated';
  cierre:=public.cerrar_turno_caja(r,cajero,100,'QA transaccional');
  if cierre.estado<>'cerrado' or cierre.monto_esperado<>100 or cierre.diferencia<>0 then raise exception 'Arqueo incorrecto'; end if;
  execute format('set local role %I',rol_inicial);
  if not exists (
    select 1 from public.audit_logs
     where actor_id=cajero and entidad_id=turno and accion='caja_turno_cerrar'
       and (detalle->>'monto_declarado')::numeric=100
       and (detalle->>'diferencia')::numeric=0
  ) then raise exception 'El cierre de caja no quedó en auditoría'; end if;

  update public.usuarios set activo=false where id=mesero;
  perform set_config('request.jwt.claim.sub',mesero::text,true);
  execute 'set local role authenticated';
  denegado:=false;
  begin perform public.crear_pedido(r,mesa,jsonb_build_array(jsonb_build_object('producto_id',plato,'cantidad',1)));
  exception when others then denegado:=true; end;
  if not denegado then raise exception 'Un usuario desactivado creó un pedido'; end if;
  execute format('set local role %I',rol_inicial);
end;
$$;
rollback;
select 'Flujo SQL completo: roles, PIN, cocina, pendientes, pago dividido, doble cobro, anulación y arqueo OK; QA revertida.' as resultado;
