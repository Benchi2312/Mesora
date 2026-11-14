-- QA aislado de anulación con motivo obligatorio. Todo se revierte.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
do $$
declare
  r uuid:=gen_random_uuid(); otro uuid:=gen_random_uuid();
  admin_id uuid:=gen_random_uuid(); mesero_id uuid:=gen_random_uuid();
  cocina_id uuid:=gen_random_uuid(); inactivo_id uuid:=gen_random_uuid();
  otro_mesero uuid:=gen_random_uuid(); zona uuid:=gen_random_uuid();
  mesa uuid:=gen_random_uuid(); mesa_otro uuid:=gen_random_uuid(); zona_otro uuid:=gen_random_uuid();
  producto uuid:=gen_random_uuid(); p uuid:=gen_random_uuid(); p_otro uuid:=gen_random_uuid();
  item uuid:=gen_random_uuid(); item_segundo uuid:=gen_random_uuid(); item_admin uuid:=gen_random_uuid(); item_otro uuid:=gen_random_uuid();
  motivo_original text; actor_original uuid; fecha_original timestamptz; n integer;
  denegado boolean:=false; rol_inicial text:=current_user; detalle jsonb;
begin
  insert into auth.users(id,email) values
    (admin_id,'admin@qa.invalid'),(mesero_id,'mesero@qa.invalid'),
    (cocina_id,'cocina@qa.invalid'),(inactivo_id,'inactivo@qa.invalid'),
    (otro_mesero,'otro@qa.invalid');
  insert into public.restaurantes(id,nombre,suscripcion_activa,fecha_vencimiento)
    values(r,'QA motivo ítem',true,now()+interval '1 day'),
          (otro,'QA motivo ítem aislado',true,now()+interval '1 day');
  insert into public.usuarios(id,restaurante_id,rol,nombre,activo) values
    (admin_id,r,'admin_restaurante','Admin QA',true),
    (mesero_id,r,'mesero','Mesero QA',true),
    (cocina_id,r,'cocina','Cocina QA',true),
    (inactivo_id,r,'mesero','Inactivo QA',false),
    (otro_mesero,otro,'mesero','Mesero otro QA',true);
  insert into public.zonas(id,restaurante_id,nombre) values
    (zona,r,'Zona QA'),(zona_otro,otro,'Zona otro QA');
  insert into public.mesas(id,restaurante_id,zona_id,nombre) values
    (mesa,r,zona,'Mesa motivo QA'),(mesa_otro,otro,zona_otro,'Mesa otro QA');
  insert into public.productos(id,restaurante_id,nombre,precio,disponible)
    values(producto,r,'Ítem QA',12,true);
  insert into public.pedidos(id,restaurante_id,mesa_id,mesero_id)
    values(p,r,mesa,mesero_id),(p_otro,otro,mesa_otro,otro_mesero);
  insert into public.pedido_items(id,pedido_id,producto_id,nombre_producto,cantidad,precio_unitario)
    values(item,p,producto,'Ítem QA',1,12),
          (item_segundo,p,producto,'Ítem QA protegido',1,12),
          (item_admin,p,producto,'Ítem Admin QA',1,12),
          (item_otro,p_otro,null,'Ítem otro QA',1,12);

  perform set_config('request.jwt.claim.sub',admin_id::text,true);
  execute 'set local role authenticated';
  perform public.configurar_pin_autorizacion(r,'4242');
  execute format('set local role %I',rol_inicial);

  -- Motivo vacío y solo espacios deben fallar antes de modificar o auditar.
  perform set_config('request.jwt.claim.sub',mesero_id::text,true);
  execute 'set local role authenticated';
  denegado:=false;
  begin perform public.anular_item_comanda(r,p,item,'','4242');
  exception when others then
    if position('obligatorio' in lower(sqlerrm))=0 then raise; end if;
    denegado:=true;
  end;
  if not denegado then raise exception 'Se aceptó un motivo vacío'; end if;
  denegado:=false;
  begin perform public.anular_item_comanda(r,p,item,'   ','4242');
  exception when others then
    if position('obligatorio' in lower(sqlerrm))=0 then raise; end if;
    denegado:=true;
  end;
  if not denegado then raise exception 'Se aceptó un motivo compuesto por espacios'; end if;
  denegado:=false;
  begin perform public.anular_item_comanda(r,p,item,repeat('x',201),'4242');
  exception when others then
    if position('200 caracteres' in lower(sqlerrm))=0 then raise; end if;
    denegado:=true;
  end;
  if not denegado then raise exception 'Se aceptó un motivo demasiado largo'; end if;
  if (select anulado from public.pedido_items where id=item) is true
     or exists(select 1 from public.audit_logs where entidad_id=item and accion='comanda_item_anular') then
    raise exception 'La validación del motivo cambió o auditó el ítem';
  end if;

  -- PIN incorrecto: sin cambios ni auditoría.
  denegado:=false;
  begin perform public.anular_item_comanda(r,p,item,'Pedido duplicado','0000');
  exception when others then
    if position('pin de autorizacion incorrecto' in lower(sqlerrm))=0 then raise; end if;
    denegado:=true;
  end;
  if not denegado then raise exception 'Se anuló el ítem con PIN incorrecto'; end if;
  if (select anulado from public.pedido_items where id=item) is true
     or exists(select 1 from public.audit_logs where entidad_id=item and accion='comanda_item_anular') then
    raise exception 'El PIN incorrecto produjo cambios o auditoría';
  end if;

  -- Mesero autorizado: guarda texto recortado y deja actor/motivo en la auditoría.
  perform public.anular_item_comanda(r,p,item,'  Pedido duplicado  ','4242');
  -- Las aserciones de auditoría corren como el propietario del QA porque RLS
  -- deliberadamente no permite que un mesero lea audit_logs directamente.
  execute format('set local role %I',rol_inicial);
  select motivo_anulacion,anulado_por,anulado_at
    into motivo_original,actor_original,fecha_original
    from public.pedido_items where id=item;
  if motivo_original<>'Pedido duplicado' or actor_original<>mesero_id or fecha_original is null then
    raise exception 'No se persistieron motivo, actor y fecha';
  end if;
  select count(*) into n from public.audit_logs
   where entidad_id=item and accion='comanda_item_anular';
  select al.detalle into detalle from public.audit_logs al
   where al.entidad_id=item and al.accion='comanda_item_anular' limit 1;
  if n<>1 then raise exception 'Se esperaba una auditoría, se encontraron %',n; end if;
  if detalle->>'motivo'<>'Pedido duplicado' or detalle->>'pedido_id'<>p::text or detalle->>'producto'<>'Ítem QA' then
    raise exception 'El detalle de auditoría no conserva los datos esperados: %',detalle;
  end if;
  if not exists(select 1 from public.audit_logs where entidad_id=item and accion='comanda_item_anular' and actor_id=mesero_id) then
    raise exception 'La auditoría no conserva el actor Mesero';
  end if;

  -- Segundo intento desde Admin: conserva la anulación original y no duplica log.
  execute format('set local role %I',rol_inicial);
  perform set_config('request.jwt.claim.sub',admin_id::text,true);
  execute 'set local role authenticated';
  perform public.anular_item_comanda(r,p,item,'No sobrescribir el original','4242');
  execute format('set local role %I',rol_inicial);
  if (select motivo_anulacion from public.pedido_items where id=item)<>motivo_original
     or (select anulado_por from public.pedido_items where id=item)<>actor_original
     or (select anulado_at from public.pedido_items where id=item)<>fecha_original
     or (select count(*) from public.audit_logs where entidad_id=item and accion='comanda_item_anular')<>1 then
    raise exception 'El segundo intento alteró la anulación original o duplicó auditoría';
  end if;

  -- Admin autorizado puede anular un ítem nuevo con el mismo flujo y queda auditado.
  perform set_config('request.jwt.claim.sub',admin_id::text,true);
  execute 'set local role authenticated';
  perform public.anular_item_comanda(r,p,item_admin,'Corrección administrativa QA','4242');
  execute format('set local role %I',rol_inicial);
  if (select motivo_anulacion from public.pedido_items where id=item_admin)<>'Corrección administrativa QA'
     or (select anulado_por from public.pedido_items where id=item_admin)<>admin_id
     or not exists(select 1 from public.audit_logs al where al.entidad_id=item_admin and al.accion='comanda_item_anular' and al.actor_id=admin_id and al.detalle->>'motivo'='Corrección administrativa QA') then
    raise exception 'El Admin autorizado no pudo anular y auditar el ítem';
  end if;

  -- Cocina no puede anular. El item vecino permanece abierto.
  perform set_config('request.jwt.claim.sub',cocina_id::text,true);
  execute 'set local role authenticated';
  denegado:=false;
  begin perform public.anular_item_comanda(r,p,item_segundo,'Prueba Cocina','4242');
  exception when others then
    if position('sin permiso' in lower(sqlerrm))=0 then raise; end if;
    denegado:=true;
  end;
  if not denegado or (select anulado from public.pedido_items where id=item_segundo) then
    raise exception 'Cocina pudo anular un ítem';
  end if;

  -- Usuario inactivo es rechazado por validar_acceso_restaurante.
  perform set_config('request.jwt.claim.sub',inactivo_id::text,true);
  denegado:=false;
  begin perform public.anular_item_comanda(r,p,item_segundo,'Prueba usuario inactivo','4242');
  exception when others then
    if position('desactivado' in lower(sqlerrm))=0 then raise; end if;
    denegado:=true;
  end;
  if not denegado then raise exception 'Un usuario inactivo pudo ejecutar la RPC'; end if;

  -- Usuario de otro restaurante no puede anular ni consultar el ítem de A.
  perform set_config('request.jwt.claim.sub',otro_mesero::text,true);
  denegado:=false;
  begin perform public.anular_item_comanda(r,p,item_segundo,'Cruce tenant','4242');
  exception when others then denegado:=true; end;
  if not denegado or (select anulado from public.pedido_items where id=item_segundo) then
    raise exception 'Se permitió acceso cruzado entre restaurantes';
  end if;
  execute format('set local role %I',rol_inicial);

  -- La firma antigua nunca puede anular sin motivo.
  perform set_config('request.jwt.claim.sub',mesero_id::text,true);
  execute 'set local role authenticated';
  denegado:=false;
  begin perform public.anular_item_comanda(r,p,item_segundo,'4242');
  exception when others then
    if position('motivo' in lower(sqlerrm))=0 then raise; end if;
    denegado:=true;
  end;
  if not denegado or (select anulado from public.pedido_items where id=item_segundo) then
    raise exception 'La firma antigua permitió anular sin motivo';
  end if;
  execute format('set local role %I',rol_inicial);

  if has_function_privilege('anon','public.anular_item_comanda(uuid,uuid,uuid,text,text)','execute')
     or not has_function_privilege('authenticated','public.anular_item_comanda(uuid,uuid,uuid,text,text)','execute') then
    raise exception 'Los privilegios de la RPC nueva son incorrectos';
  end if;
end;
$$;
rollback;
