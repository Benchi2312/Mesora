-- QA aislado: todas las filas de prueba desaparecen al terminar.
begin;
do $$
declare
  r uuid := gen_random_uuid(); r2 uuid := gen_random_uuid();
  u uuid := gen_random_uuid(); u2 uuid := gen_random_uuid(); otro_actor uuid := gen_random_uuid(); inactivo uuid := gen_random_uuid(); cocina uuid := gen_random_uuid();
  z uuid := gen_random_uuid(); m uuid := gen_random_uuid(); m2 uuid := gen_random_uuid();
  plato uuid := gen_random_uuid(); bebida uuid := gen_random_uuid();
  clave uuid := gen_random_uuid(); clave_fallida uuid := gen_random_uuid();
  p uuid; p2 uuid; contenido jsonb; inicial text := current_user;
  n_items integer; n_entregas integer; n_auditoria integer;
begin
  insert into auth.users(id) values (u),(u2),(otro_actor),(inactivo),(cocina);
  insert into public.restaurantes(id,nombre,suscripcion_activa) values (r,'QA idempotencia',true),(r2,'QA idempotencia ajeno',true);
  insert into public.usuarios(id,restaurante_id,rol,nombre,activo) values
    (u,r,'admin_restaurante','QA admin',true),
    (u2,r2,'admin_restaurante','QA ajeno',true),
    (otro_actor,r,'mesero','QA otro actor',true),
    (inactivo,r,'mesero','QA inactivo',false),
    (cocina,r,'cocina','QA cocina',true);
  insert into public.zonas(id,restaurante_id,nombre) values (z,r,'QA');
  insert into public.mesas(id,restaurante_id,zona_id,nombre) values (m,r,z,'Mesa QA'),(m2,r,z,'Mesa QA 2');
  insert into public.productos(id,restaurante_id,nombre,precio,disponible,es_bebida) values
    (plato,r,'Plato QA',10,true,false),(bebida,r,'Bebida QA',5,true,true);
  contenido := jsonb_build_array(
    jsonb_build_object('producto_id',plato,'cantidad',2,'nota','sin sal'),
    jsonb_build_object('producto_id',bebida,'cantidad',1,'nota','')
  );
  perform set_config('request.jwt.claim.sub',u::text,true);
  perform set_config('request.jwt.claims','{"role":"authenticated"}',true);
  execute 'set local role authenticated';
  p := public.crear_pedido(r,m,contenido,clave);
  if p is null then raise exception 'No se creó la primera comanda'; end if;
  begin
    perform public.crear_pedido(r,m,null,gen_random_uuid());
    raise exception 'Se aceptó un carrito nulo';
  exception when sqlstate '22023' then null;
  end;
  select count(*) into n_items from public.pedido_items where pedido_id=p;
  select count(*) into n_entregas from public.entregas_comanda where pedido_id=p;
  select count(*) into n_auditoria from public.audit_logs where restaurante_id=r;
  p2 := public.crear_pedido(r,m,contenido,clave);
  if p2 <> p or (select count(*) from public.pedidos where solicitud_id=clave) <> 1 or
     (select count(*) from public.pedido_items where pedido_id=p) <> n_items or
     (select count(*) from public.entregas_comanda where pedido_id=p) <> n_entregas or
     (select count(*) from public.audit_logs where restaurante_id=r) <> n_auditoria then
    raise exception 'El reintento duplicó pedido, detalle, salida o auditoría';
  end if;
  if n_items <> 2 or n_entregas < 1 then raise exception 'No se conservaron los ítems o la ruta inicial'; end if;
  begin
    perform public.crear_pedido(r,m,jsonb_build_array(jsonb_build_object('producto_id',plato,'cantidad',3)),clave);
    raise exception 'Se aceptó contenido distinto';
  exception when sqlstate '22023' then
    if sqlerrm <> 'La solicitud cambió y no coincide con la comanda original.' then raise; end if;
  end;
  begin
    perform public.crear_pedido(r,m2,contenido,clave);
    raise exception 'Se aceptó otra mesa con la misma clave';
  exception when sqlstate '22023' then
    if sqlerrm <> 'La solicitud cambió y no coincide con la comanda original.' then raise; end if;
  end;
  perform set_config('request.jwt.claim.sub',otro_actor::text,true);
  begin
    perform public.crear_pedido(r,m,contenido,clave);
    raise exception 'Otro actor reutilizó la clave';
  exception when sqlstate '22023' then
    if sqlerrm <> 'La solicitud cambió y no coincide con la comanda original.' then raise; end if;
  end;
  perform set_config('request.jwt.claim.sub',u2::text,true);
  if exists(select 1 from public.pedidos where id=p) then
    raise exception 'RLS mostró una comanda de otro restaurante';
  end if;
  begin
    perform public.crear_pedido(r2,m,contenido,clave);
    raise exception 'Se reveló una clave de otro restaurante';
  exception when sqlstate '22023' then
    if sqlerrm <> 'La solicitud cambió y no coincide con la comanda original.' then raise; end if;
  end;
  perform set_config('request.jwt.claim.sub',inactivo::text,true);
  begin
    perform public.crear_pedido(r,m,contenido,clave);
    raise exception 'Usuario inactivo aceptado';
  exception when raise_exception then
    if sqlerrm <> 'Usuario desactivado' then raise; end if;
  end;
  perform set_config('request.jwt.claim.sub',cocina::text,true);
  begin
    perform public.crear_pedido(r,m,contenido,gen_random_uuid());
    raise exception 'Cocina aceptada';
  exception when insufficient_privilege then null;
  end;
  perform set_config('request.jwt.claim.sub',u::text,true);
  begin
    perform public.crear_pedido(r,m,jsonb_build_array(jsonb_build_object('producto_id',gen_random_uuid(),'cantidad',1)),clave_fallida);
    raise exception 'Producto inexistente aceptado';
  exception when foreign_key_violation then null;
  end;
  if exists(select 1 from public.pedidos where solicitud_id=clave_fallida) then raise exception 'Falló rollback de la primera transacción'; end if;
  p2 := public.crear_pedido(r,m,contenido,clave_fallida);
  if p2 is null or p2=p then raise exception 'El reintento después de rollback no creó una comanda nueva'; end if;
  execute format('set local role %I',inicial);
  if has_function_privilege('anon','public.crear_pedido(uuid,uuid,jsonb,uuid)','execute') or
     has_function_privilege('authenticated','public.crear_pedido_base(uuid,uuid,jsonb)','execute') then
    raise exception 'Permisos RPC inseguros';
  end if;
  if exists(select 1 from public.pedidos where id=p and solicitud_id is null) then raise exception 'Falta clave persistente'; end if;
end;
$$;
rollback;
