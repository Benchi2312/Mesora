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
    create table auth.users (id uuid primary key, email text, last_sign_in_at timestamptz, created_at timestamptz default now());
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
  assert.equal((await pg.query("select count(*)::int as n from pg_tables where schemaname='public'")).rows[0].n, 19)
  console.log('SQL QA: tablas, RPC, RLS y pgcrypto instalados')
  await pg.exec(readFileSync(new URL('../supabase/qa/seguridad_rpc_rollback.sql', import.meta.url), 'utf8'))
  console.log('SQL QA: permisos de anónimo, autenticado y servicio correctos')
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
  const copia = await pg.dumpDataDir('gzip')
  const restaurada = new PGlite({ extensions: { pgcrypto }, loadDataDir: copia })
  try {
    assert.equal((await restaurada.query("select count(*)::int as n from pg_tables where schemaname='public'")).rows[0].n, 19)
    assert.equal((await restaurada.query('select count(*)::int as n from public.restaurantes')).rows[0].n, 0)
    console.log('SQL QA: respaldo/restauración de la base aislada y rollback correctos')
  } finally { await restaurada.close() }
} catch (e) {
  console.error(e.message)
  process.exitCode = 1
} finally {
  await pg.close()
}
