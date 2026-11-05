// PostgreSQL aislado en WASM con pgcrypto real. No se conecta a Supabase.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'

const pg = new PGlite({ extensions: { pgcrypto } })
try {
  await pg.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth;
    grant usage on schema public, auth to anon, authenticated, service_role;
    create table auth.users (id uuid primary key, email text, encrypted_password text, last_sign_in_at timestamptz, created_at timestamptz default now());
    create function auth.uid() returns uuid stable language sql as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;
    create function auth.jwt() returns jsonb stable language sql as $$
      select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
    $$;
    create function auth.role() returns text stable language sql as $$ select auth.jwt()->>'role' $$;
  `)
  const instalador = readFileSync(new URL('../supabase/TODO_EN_UNO.sql', import.meta.url), 'utf8')
  console.log('SQL QA: instalación completa en una base vacía')
  try { await pg.exec(instalador) } catch (e) {
    const pos = Number(e.position ?? 0)
    console.error('Error de instalación:', e.message, e.detail ?? '', pos ? instalador.slice(Math.max(0, pos - 110), pos + 160) : '')
    throw new Error('Falló el instalador SQL')
  }
  assert.equal((await pg.query("select count(*)::int as n from pg_tables where schemaname='public'")).rows[0].n, 20)
  console.log('SQL QA: tablas, RPC, RLS y pgcrypto instalados')
  await pg.exec(`
    begin;
    do $$
    declare r uuid:=gen_random_uuid(); u uuid:=gen_random_uuid(); permitido boolean; resultado record;
      inicial text:=current_user; token text:=repeat('a',64); correo text:='admin@mesora.example';
    begin
      if has_schema_privilege('anon','private','usage') or has_schema_privilege('authenticated','private','usage') then
        raise exception 'Un cliente puede acceder al esquema privado';
      end if;
      if has_table_privilege('authenticated','private.admin_recovery_tokens','select') then
        raise exception 'Autenticado puede leer tokens de recuperación';
      end if;
      if has_function_privilege('authenticated','public.mesora_recovery_can_send(uuid,text)','execute') then
        raise exception 'Autenticado puede invocar el rate limit';
      end if;

      insert into auth.users(id,email) values(u,correo);
      insert into public.restaurantes(id,nombre) values(r,'QA recovery');
      insert into public.usuarios(id,restaurante_id,rol,nombre,email,activo)
        values(u,r,'admin_restaurante','Admin QA',correo,true);

      perform set_config('request.jwt.claims','{"role":"service_role"}',true);
      permitido:=public.mesora_recovery_can_send(u,'verificar_correo');
      if permitido is not true then raise exception 'La primera solicitud fue rechazada'; end if;
      permitido:=public.mesora_recovery_can_send(u,'verificar_correo');
      if permitido is not false then raise exception 'No se aplicó el límite por minuto'; end if;
      perform public.mesora_recovery_store_token(u,correo,token,now()+interval '30 minutes');
      select * into resultado from public.mesora_recovery_consume_token(token);
      if resultado.usuario_id<>u or resultado.correo<>correo then raise exception 'No se consumió el token esperado'; end if;
      if exists(select 1 from public.mesora_recovery_consume_token(token)) then raise exception 'Se permitió reutilizar el token'; end if;

      perform set_config('request.jwt.claims','{"role":"authenticated"}',true);
      begin
        update public.usuarios set correo_recuperacion='falso@mesora.example', correo_recuperacion_verificado=true where id=u;
        raise exception 'Un usuario pudo verificar su correo sin token';
      exception when raise_exception then
        if sqlerrm not like 'El correo de recuperación solo se actualiza mediante verificación segura%' then raise; end if;
      end;

      perform set_config('request.jwt.claims','{"role":"service_role"}',true);
      update public.usuarios set correo_recuperacion=correo, correo_recuperacion_verificado=true where id=u;
      if not exists(select 1 from public.usuarios where id=u and correo_recuperacion=correo and correo_recuperacion_verificado) then
        raise exception 'La Edge Function no puede guardar el correo verificado';
      end if;
      execute format('set local role %I',inicial);
    end;
    $$;
    rollback;
  `)
  console.log('SQL QA: recuperación admin, permisos privados, límite y token de un solo uso aprobados')
  await pg.exec(readFileSync(new URL('../supabase/qa/password_temporal_rollback.sql', import.meta.url), 'utf8'))
  console.log('SQL QA: contraseña temporal confirmada solo tras cambio real en Auth')
  await pg.exec(readFileSync(new URL('../supabase/qa/seguridad_rpc_rollback.sql', import.meta.url), 'utf8'))
  console.log('SQL QA: permisos de anónimo, autenticado y servicio correctos')
  const pruebaPoliticas = readFileSync(new URL('../supabase/qa/politicas_catalogo_rollback.sql', import.meta.url), 'utf8')
  const migracionPoliticas = readFileSync(new URL('../supabase/migrations/20261102081247_acotar_politicas_rls_piloto.sql', import.meta.url), 'utf8')
    .replace(/(^|\n)begin;\s*/i, '$1')
    .replace(/\ncommit;\s*$/i, '\n')
  assert.ok(pruebaPoliticas.includes('/* APLICAR_MIGRACION_RLS */'), 'Falta el punto de inyección de la migración RLS')
  await pg.exec(pruebaPoliticas.replace('/* APLICAR_MIGRACION_RLS */', migracionPoliticas))
  console.log('SQL QA: permisos RLS de catálogo, mesas y configuración global correctos')
  await pg.exec(readFileSync(new URL('../supabase/qa/matriz_roles_rollback.sql', import.meta.url), 'utf8'))
  console.log('SQL QA: matriz de roles y aislamiento entre restaurantes aprobados')
  await pg.exec(readFileSync(new URL('../supabase/qa/bandeja_comercial_alertas_rollback.sql', import.meta.url), 'utf8'))
  console.log('SQL QA: bandeja comercial privada, avisos y soporte con rollback')
  await pg.exec(readFileSync(new URL('../supabase/qa/flujo_piloto_rollback.sql', import.meta.url), 'utf8'))
  console.log('SQL QA: circuito completo de restaurante y arqueo aprobado')
  await pg.exec(`
    begin;
    do $$
    declare r uuid:=gen_random_uuid(); u uuid:=gen_random_uuid(); z uuid:=gen_random_uuid();
      m uuid:=gen_random_uuid(); pr uuid:=gen_random_uuid(); ped uuid:=gen_random_uuid();
      c uuid:=gen_random_uuid(); salida jsonb; inicial text:=current_user;
    begin
      insert into auth.users(id) values(u);
      insert into public.restaurantes(id,nombre,suscripcion_activa) values(r,'QA reporte',true);
      insert into public.usuarios(id,restaurante_id,rol,nombre) values(u,r,'admin_restaurante','Admin QA');
      insert into public.zonas(id,restaurante_id,nombre) values(z,r,'QA');
      insert into public.mesas(id,restaurante_id,zona_id,nombre) values(m,r,z,'Mesa QA');
      insert into public.productos(id,restaurante_id,nombre,precio,es_bebida) values(pr,r,'Agua QA',5,true);
      insert into public.pedidos(id,restaurante_id,mesa_id,mesero_id) values(ped,r,m,u);
      insert into public.pedido_items(pedido_id,producto_id,nombre_producto,cantidad,precio_unitario,es_bebida)
        values(ped,pr,'Agua QA',2,5,true);
      insert into public.cuentas(id,restaurante_id,mesa_id,total,metodo_pago,estado,pagado_at,numero)
        values(c,r,m,10,'efectivo','pagada',now(),'BQA-0001');
      insert into public.cuenta_pedidos(cuenta_id,pedido_id,subtotal) values(c,ped,10);
      insert into public.cuenta_pagos(cuenta_id,restaurante_id,metodo_pago,monto) values(c,r,'efectivo',10);
      perform set_config('request.jwt.claim.sub',u::text,true);
      execute 'set local role authenticated';
      salida:=public.reporte_ventas_restaurante(r,now()-interval '1 day',now()+interval '1 day','todas','',0,25);
      if (salida#>>'{resumen,ventas}')::numeric<>10 then raise exception 'El reporte no suma las cuentas pagadas'; end if;
      if (salida#>>'{productos,0,cantidad}')::int<>2 or (salida#>>'{productos,0,es_bebida}')::boolean is not true then raise exception 'El reporte no conserva cantidad/clasificación de bebida'; end if;
      if salida#>>'{cuentas,0,pedidos,0,items,0,nombre}'<>'Agua QA' then raise exception 'Falta el detalle histórico del consumo'; end if;
      if jsonb_array_length(salida->'ventas_por_dia')<>1 or (salida#>>'{ventas_por_dia,0,ventas}')::numeric<>10 then raise exception 'La serie diaria no cuadra'; end if;
      if (salida#>>'{ventas_por_hora,0,ventas}')::numeric<>10 or (salida#>>'{ventas_por_metodo,0,ventas}')::numeric<>10 then raise exception 'Los agregados por hora/método no cuadran'; end if;
      if (salida#>>'{resumen,neto}')::numeric<>10 then raise exception 'El neto del periodo no cuadra'; end if;
      if has_function_privilege('anon','public.reporte_ventas_restaurante(uuid,timestamp with time zone,timestamp with time zone,text,text,integer,integer)','execute') then raise exception 'Anon puede ejecutar el reporte'; end if;
      execute format('set local role %I',inicial);
    end;
    $$;
    rollback;
  `)
  console.log('SQL QA: reporte ventas, consumo, bebidas y permisos de administrador aprobados')
  await pg.exec(`
    begin;
    do $$
    declare r uuid:=gen_random_uuid(); u uuid:=gen_random_uuid(); z uuid:=gen_random_uuid();
      m uuid:=gen_random_uuid(); pr uuid:=gen_random_uuid(); inicial text:=current_user;
    begin
      insert into auth.users(id) values(u);
      insert into public.restaurantes(id,nombre) values(r,'QA volumen');
      insert into public.usuarios(id,restaurante_id,rol,nombre) values(u,r,'mesero','QA volumen');
      insert into public.zonas(id,restaurante_id,nombre) values(z,r,'QA');
      insert into public.mesas(id,restaurante_id,zona_id,nombre) values(m,r,z,'QA');
      insert into public.productos(id,restaurante_id,nombre,precio) values(pr,r,'QA',1);
      insert into public.pedidos(restaurante_id,mesa_id,mesero_id)
        select r,m,u from generate_series(1,1205);
      insert into public.pedido_items(pedido_id,producto_id,nombre_producto,cantidad,precio_unitario)
        select id,pr,'QA',1,1 from public.pedidos where restaurante_id=r;
      perform set_config('request.jwt.claim.sub',u::text,true);
      execute 'set local role authenticated';
      if jsonb_array_length(public.pedidos_pendientes_mesa(r,m))<>1205 then raise exception 'Pedidos truncados'; end if;
      if (public.mesas_por_cobrar(r)->0->>'total')::numeric<>1205 then raise exception 'Agregado truncado'; end if;
      execute format('set local role %I',inicial);
    end;
    $$;
    rollback;
  `)
  console.log('SQL QA: 1205 pedidos pendientes sin truncar el total')
  await pg.exec(readFileSync(new URL('../supabase/qa/contacto_guardrails_rollback.sql', import.meta.url), 'utf8'))
  console.log('SQL QA: cuotas de contacto, aislamiento privado e incidencias de superadmin aprobados')
  const copia = await pg.dumpDataDir('gzip')
  const restaurada = new PGlite({ extensions: { pgcrypto }, loadDataDir: copia })
  try {
    assert.equal((await restaurada.query("select count(*)::int as n from pg_tables where schemaname='public'")).rows[0].n, 20)
    assert.equal((await restaurada.query('select count(*)::int as n from public.restaurantes')).rows[0].n, 0)
    console.log('SQL QA: respaldo/restauración de la base aislada y rollback correctos')
  } finally { await restaurada.close() }
} catch (e) {
  console.error(e.message)
  process.exitCode = 1
} finally {
  await pg.close()
}
