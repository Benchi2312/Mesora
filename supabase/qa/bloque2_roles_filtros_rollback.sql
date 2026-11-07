begin;

-- Pruebas aisladas para filtros, tenant y bajas lógicas del Bloque 2.
-- Se ejecuta sobre TODO_EN_UNO.sql en PGlite; al final revierte todos los datos.
do $$
declare
  v_owner text := current_user;
  v_rest_a uuid := gen_random_uuid();
  v_rest_b uuid := gen_random_uuid();
  v_admin_a uuid := gen_random_uuid();
  v_admin_b uuid := gen_random_uuid();
  v_mesero_a uuid := gen_random_uuid();
  v_mesero_b uuid := gen_random_uuid();
  v_zona_a uuid := gen_random_uuid();
  v_mesa_a uuid := gen_random_uuid();
  v_zona_b uuid := gen_random_uuid();
  v_mesa_b uuid := gen_random_uuid();
  v_cuenta_pagada uuid := gen_random_uuid();
  v_cuenta_anulada uuid := gen_random_uuid();
  v_cuenta_otro uuid := gen_random_uuid();
  v_resultado jsonb;
  v_permitido boolean;
begin
  insert into auth.users(id) values (v_admin_a), (v_admin_b), (v_mesero_a), (v_mesero_b);
  insert into public.restaurantes(id, nombre, suscripcion_activa)
    values (v_rest_a, 'QA bloque 2 A', true), (v_rest_b, 'QA bloque 2 B', true);
  insert into public.usuarios(id, restaurante_id, rol, nombre, email, activo) values
    (v_admin_a, v_rest_a, 'admin_restaurante', 'Admin A', 'admin-a@qa.example', true),
    (v_admin_b, v_rest_b, 'admin_restaurante', 'Admin B', 'admin-b@qa.example', true),
    (v_mesero_a, v_rest_a, 'mesero', 'Carlos QA', 'carlos@qa.example', true),
    (v_mesero_b, v_rest_b, 'mesero', 'Otra persona', 'otro@qa.example', true);
  insert into public.zonas(id, restaurante_id, nombre) values
    (v_zona_a, v_rest_a, 'Salón A'), (v_zona_b, v_rest_b, 'Salón B');
  insert into public.mesas(id, restaurante_id, zona_id, nombre) values
    (v_mesa_a, v_rest_a, v_zona_a, 'Terraza 4'), (v_mesa_b, v_rest_b, v_zona_b, 'Mesa ajena');

  insert into public.cuentas(
    id, restaurante_id, mesa_id, total, metodo_pago, estado, pagado_at, numero, anulada_at, motivo_anulacion,
    mesero_id_snapshot, mesero_nombre_snapshot, mesa_nombre_snapshot
  ) values
    (v_cuenta_pagada, v_rest_a, v_mesa_a, 12.50, 'efectivo', 'pagada', now(), 'VQA-001', null, null, v_mesero_a, 'Carlos QA', 'Terraza 4'),
    (v_cuenta_anulada, v_rest_a, v_mesa_a, 20.00, 'efectivo', 'anulada', now(), 'VQA-002', now(), 'Motivo de prueba', v_mesero_a, 'Carlos QA', 'Terraza 4'),
    (v_cuenta_otro, v_rest_b, v_mesa_b, 12.50, 'efectivo', 'pagada', now(), 'OTRO-003', null, null, v_mesero_b, 'Otra persona', 'Mesa ajena');
  insert into public.cuenta_pagos(cuenta_id, restaurante_id, metodo_pago, monto) values
    (v_cuenta_pagada, v_rest_a, 'tarjeta', 12.50),
    (v_cuenta_anulada, v_rest_a, 'efectivo', 20.00),
    (v_cuenta_otro, v_rest_b, 'efectivo', 12.50);
  insert into public.audit_logs(actor_id, actor_rol, actor_nombre, restaurante_id, entidad, entidad_id, accion, descripcion, detalle)
    values
      (v_admin_a, 'admin_restaurante', 'Admin A', v_rest_a, 'usuario', v_mesero_a, 'usuario_desactivar', 'Desactivó a Carlos QA', jsonb_build_object('motivo','QA')),
      (v_admin_a, 'admin_restaurante', 'Admin A', v_rest_a, 'caja_turno', gen_random_uuid(), 'caja_cerrar', 'Cierre de caja QA', '{}'::jsonb),
      (v_admin_a, 'admin_restaurante', 'Admin A', v_rest_a, 'cuenta', v_cuenta_pagada, 'cuenta_cerrar', 'Cobro QA', '{}'::jsonb),
      (v_admin_b, 'admin_restaurante', 'Admin B', v_rest_b, 'usuario', v_mesero_b, 'usuario_desactivar', 'Dato de otro restaurante', '{}'::jsonb);

  perform set_config('request.jwt.claim.sub', v_admin_a::text, true);
  perform set_config('request.jwt.claims', '{"role":"authenticated"}', true);
  execute 'set local role authenticated';

  v_resultado := public.admin_buscar_cobros(now() - interval '1 day', now() + interval '1 day', 'todas', 'todos', 'VQA-001', 0, 25);
  if (v_resultado->>'total')::int <> 1 or v_resultado#>>'{items,0,numero}' <> 'VQA-001' then
    raise exception 'Búsqueda de boleta no devolvió su cuenta';
  end if;
  v_resultado := public.admin_buscar_cobros(now() - interval '1 day', now() + interval '1 day', 'todas', 'todos', 'Terraza 4', 0, 25);
  if (v_resultado->>'total')::int <> 2 then raise exception 'Búsqueda por mesa no encontró las dos cuentas'; end if;
  v_resultado := public.admin_buscar_cobros(now() - interval '1 day', now() + interval '1 day', 'todas', 'todos', 'Carlos QA', 0, 25);
  if (v_resultado->>'total')::int <> 2 then raise exception 'Búsqueda por mesero no encontró las dos cuentas'; end if;
  v_resultado := public.admin_buscar_cobros(now() - interval '1 day', now() + interval '1 day', 'pagada', 'tarjeta', '12.5', 0, 25);
  if (v_resultado->>'total')::int <> 1 or v_resultado#>>'{items,0,numero}' <> 'VQA-001' then
    raise exception 'Filtros de estado, pago dividido o importe fallaron';
  end if;
  v_resultado := public.admin_buscar_cobros(now() - interval '1 day', now() + interval '1 day', 'anulada', 'todos', '', 0, 25);
  if (v_resultado->>'total')::int <> 1 or v_resultado#>>'{items,0,numero}' <> 'VQA-002' then raise exception 'Filtro de anuladas falló'; end if;
  v_resultado := public.admin_buscar_cobros(now() - interval '1 day', now() + interval '1 day', 'todas', 'todos', 'OTRO-003', 0, 25);
  if (v_resultado->>'total')::int <> 0 then raise exception 'Cobros mostró datos de otro restaurante'; end if;

  v_resultado := public.admin_listar_auditoria_restaurante(null, null, 'Carlos QA', 'usuarios', 0, 25);
  if (v_resultado->>'total')::int <> 1 or v_resultado#>>'{items,0,accion}' <> 'usuario_desactivar' then
    raise exception 'Auditoría no buscó por usuario/acción dentro del restaurante';
  end if;
  v_resultado := public.admin_listar_auditoria_restaurante(null, null, 'caja_cerrar', 'caja', 0, 25);
  if (v_resultado->>'total')::int <> 1 then raise exception 'La categoría Caja no filtró correctamente'; end if;
  v_resultado := public.admin_listar_auditoria_restaurante(null, null, 'cuenta_cerrar', 'cuentas', 0, 25);
  if (v_resultado->>'total')::int <> 1 then raise exception 'La categoría Cuentas no filtró correctamente'; end if;
  v_resultado := public.admin_listar_auditoria_restaurante(null, null, 'Dato de otro restaurante', 'todas', 0, 25);
  if (v_resultado->>'total')::int <> 0 then raise exception 'Auditoría mostró datos de otro restaurante'; end if;

  if has_function_privilege('authenticated', 'public.admin_cambiar_estado_personal(uuid,uuid,boolean,text)', 'execute') then
    raise exception 'Authenticated puede cambiar estado y omitir el bloqueo de Auth';
  end if;
  if has_table_privilege('authenticated', 'public.usuarios', 'delete')
     or has_column_privilege('authenticated', 'public.usuarios', 'activo', 'update') then
    raise exception 'El cliente puede borrar usuarios o cambiar activo directamente';
  end if;
  begin
    perform public.admin_cambiar_estado_personal(v_admin_a, v_mesero_a, false, 'atajo');
    raise exception 'El cliente cambió el estado fuera de la Edge Function';
  exception when insufficient_privilege then null;
  end;

  execute format('set local role %I', v_owner);
  execute 'set local role service_role';
  perform public.admin_cambiar_estado_personal(v_admin_a, v_mesero_a, false, 'Cambio QA');
  execute format('set local role %I', v_owner);
  if (select activo from public.usuarios where id = v_mesero_a) then raise exception 'El usuario no se desactivó'; end if;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', v_mesero_a::text, true);
  v_permitido := false;
  begin
    perform public.crear_pedido(v_rest_a, v_mesa_a, '[]'::jsonb);
  exception when others then
    if position('Usuario desactivado' in sqlerrm) = 0 then raise; end if;
    v_permitido := true;
  end;
  if not v_permitido then raise exception 'Un usuario inactivo pudo invocar la creación de pedidos'; end if;
  execute 'set local role service_role';
  perform public.admin_cambiar_estado_personal(v_admin_a, v_mesero_a, true, 'Reactivación QA');
  execute format('set local role %I', v_owner);
  if not (select activo from public.usuarios where id = v_mesero_a) then raise exception 'El usuario no se reactivó'; end if;
  if (select count(*) from public.audit_logs
       where restaurante_id = v_rest_a and entidad_id = v_mesero_a
         and accion in ('usuario_desactivar','usuario_reactivar')
         and detalle->>'motivo' in ('Cambio QA', 'Reactivación QA')) <> 2 then
    raise exception 'La baja/reactivación no dejó auditoría con antes/después y motivo';
  end if;
end;
$$;

rollback;
select 'Bloque 2: filtros, tenant, permisos y estado lógico: OK' as resultado;
