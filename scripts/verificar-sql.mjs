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
  assert.equal((await pg.query("select count(*)::int as n from pg_tables where schemaname='public'")).rows[0].n, 27)
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
  await pg.exec(readFileSync(new URL('../supabase/qa/traslado_mesa_pin_auditoria_rollback.sql', import.meta.url), 'utf8'))
  console.log('SQL QA: cambio de responsable y traslado de consumo protegidos con PIN y auditoría')
  await pg.exec(readFileSync(new URL('../supabase/qa/bandeja_comercial_alertas_rollback.sql', import.meta.url), 'utf8'))
  console.log('SQL QA: bandeja comercial privada, avisos y soporte con rollback')
  await pg.exec(readFileSync(new URL('../supabase/qa/flujo_piloto_rollback.sql', import.meta.url), 'utf8'))
  console.log('SQL QA: circuito completo de restaurante y arqueo aprobado')
  await pg.exec(readFileSync(new URL('../supabase/qa/bloque2_roles_filtros_rollback.sql', import.meta.url), 'utf8'))
  console.log('SQL QA: filtros de Cobros/Auditoría, aislamiento tenant y estado lógico aprobados')
  await pg.exec(readFileSync(new URL('../supabase/qa/impresion_comandas_rollback.sql', import.meta.url), 'utf8'))
  const qaOperacion = readFileSync(new URL('../supabase/qa/operacion_configurable_rollback.sql', import.meta.url), 'utf8')
  const migracionOperacion = readFileSync(new URL('../supabase/migrations/20261108120000_sistema_operativo_configurable.sql', import.meta.url), 'utf8')
  assert.ok(qaOperacion.includes('/* APLICAR_MIGRACION_OPERACION */'), 'Falta el punto de inyección de Operación configurable')
  const [qaAntesMigracion, qaDespuesMigracion] = qaOperacion.split('/* APLICAR_MIGRACION_OPERACION */')
  await pg.exec(qaAntesMigracion)
  await pg.exec(migracionOperacion)
  await pg.exec(migracionOperacion)
  await pg.exec(qaDespuesMigracion)
  console.log('SQL QA: estaciones históricas, auditoría idempotente y motivo de reimpresión aprobados')
  const qaConfiguracionOperativaAdmin = readFileSync(new URL('../supabase/qa/configuracion_operativa_admin_rollback.sql', import.meta.url), 'utf8')
  const migracionConfiguracionOperativaAdmin = readFileSync(new URL('../supabase/migrations/20261109012624_fase3_configuracion_operativa_admin.sql', import.meta.url), 'utf8')
  assert.ok(qaConfiguracionOperativaAdmin.includes('/* APLICAR_MIGRACION_CONFIG_OPERATIVA_ADMIN */'), 'Falta el punto de inyección de Fase 3 Operativa Admin')
  const sqlConfiguracionOperativaAdmin = qaConfiguracionOperativaAdmin.replace(
    '/* APLICAR_MIGRACION_CONFIG_OPERATIVA_ADMIN */',
    () => migracionConfiguracionOperativaAdmin,
  )
  try {
    await pg.exec(sqlConfiguracionOperativaAdmin)
  } catch (error) {
    const posicion = Number(error.position ?? 0)
    if (posicion) console.error('SQL QA configurador cerca de:', sqlConfiguracionOperativaAdmin.slice(Math.max(0, posicion - 120), posicion + 160))
    throw error
  }
  console.log('SQL QA: configurador de Admin, modalidad, estaciones, destinos, categorías, auditoría y RLS aprobados')
  await pg.exec(readFileSync(new URL('../supabase/qa/enrutamiento_comandas_rollback.sql', import.meta.url), 'utf8'))
  await pg.exec(readFileSync(new URL('../supabase/qa/fase5_kds_salida_manual_rollback.sql', import.meta.url), 'utf8'))
  await pg.exec(readFileSync(new URL('../supabase/qa/fase6_agente_impresion_rollback.sql', import.meta.url), 'utf8'))
  await pg.exec(readFileSync(new URL('../supabase/qa/modalidad_cobro_rollback.sql', import.meta.url), 'utf8'))
  console.log('SQL QA: modalidades de cobro, bypass RPC, roles, histórico y auditoría aprobados')
  await pg.exec(readFileSync(new URL('../supabase/qa/anulacion_recibo_sin_recobro_rollback.sql', import.meta.url), 'utf8'))
  console.log('SQL QA: recibo anulado no reaparece ni admite otro cobro; historial, roles e idempotencia aprobados')
  console.log('SQL QA: Fase 6 vinculación, RLS, cola, idempotencia, lease, reintentos y revocación aprobados')
  console.log('SQL QA: matriz Fase 5, solicitudes manuales, snapshots, reimpresión, idempotencia y RLS aprobados')
  console.log('SQL QA: enrutamiento por estación, snapshots, avance independiente, RLS y aislamiento tenant aprobados')
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
    assert.equal((await restaurada.query("select count(*)::int as n from pg_tables where schemaname='public'")).rows[0].n, 27)
    assert.equal((await restaurada.query('select count(*)::int as n from public.restaurantes')).rows[0].n, 0)
    console.log('SQL QA: respaldo/restauración de la base aislada y rollback correctos')
  } finally { await restaurada.close() }
  // Actualiza una base que todavía no tiene la nueva migración. Primero se
  // comprueba el rollback de la prueba; luego se aplica sobre datos existentes.
  const pgUpgrade = new PGlite({ extensions: { pgcrypto } })
  try {
    await pgUpgrade.exec(`
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
        select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}');
      $$;
      create function auth.role() returns text stable language sql as $$ select auth.jwt()->>'role' $$;
    `)

    const filasInstaller = instalador.split('\n')
    const lineaMigracion = filasInstaller.findIndex((linea) => linea.includes('· ../migrations/20261108120000_sistema_operativo_configurable.sql'))
    assert.ok(lineaMigracion > 0, 'No se encontró la sección de Operación configurable en TODO_EN_UNO.sql')
    const instaladorExistente = filasInstaller.slice(0, lineaMigracion - 1).join('\n')
    assert.ok(instaladorExistente.includes('add column if not exists estacion text'), 'La base previa no incluye Bloque 3')
    await pgUpgrade.exec(instaladorExistente)
    assert.equal((await pgUpgrade.query("select count(*)::int as n from pg_tables where schemaname='public'")).rows[0].n, 21)
    assert.equal((await pgUpgrade.query("select count(*)::int as n from information_schema.columns where table_schema='public' and table_name='productos' and column_name='estacion'")).rows[0].n, 1)

    await pgUpgrade.exec(qaAntesMigracion)
    await pgUpgrade.exec(migracionOperacion)
    await pgUpgrade.exec(migracionOperacion)
    await pgUpgrade.exec(qaDespuesMigracion)
    assert.equal((await pgUpgrade.query("select count(*)::int as n from pg_tables where schemaname='public'")).rows[0].n, 21)
    assert.equal((await pgUpgrade.query("select count(*)::int as n from information_schema.columns where table_schema='public' and table_name='categorias_productos' and column_name='estacion_id'")).rows[0].n, 0)

    await pgUpgrade.exec(`
      insert into auth.users(id,email) values ('00000000-0000-4000-8000-000000000001','upgrade@mesora.example');
      insert into public.restaurantes(id,nombre,suscripcion_activa)
        values ('00000000-0000-4000-8000-000000000002','QA actualización',true);
      insert into public.usuarios(id,restaurante_id,rol,nombre)
        values ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','admin_restaurante','Admin upgrade');
      insert into public.categorias_productos(id,restaurante_id,nombre)
        values ('00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000002','Categoría existente');
      insert into public.productos(id,restaurante_id,categoria_id,nombre,precio,es_bebida,estacion)
        values ('00000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000003','Bebida existente',8,true,'bar');
    `)
    await pgUpgrade.exec(migracionOperacion)
    await pgUpgrade.exec(migracionOperacion)
    const configuracionUpgrade = await pgUpgrade.query(`
      select c.modalidad_cobro, count(distinct e.id)::int as estaciones,
             count(distinct d.id)::int as destinos,
             (select estacion from public.productos where id='00000000-0000-4000-8000-000000000004') as estacion_producto
        from public.configuracion_operativa c
        join public.estaciones_restaurante e on e.restaurante_id=c.restaurante_id
        join public.destinos_estacion d on d.estacion_id=e.id
       where c.restaurante_id='00000000-0000-4000-8000-000000000002'
       group by c.modalidad_cobro
    `)
    assert.deepEqual(configuracionUpgrade.rows[0], {
      modalidad_cobro: 'cobro_por_mesero', estaciones: 3, destinos: 3, estacion_producto: 'bar',
    })
    const fase3Upgrade = readFileSync(new URL('../supabase/migrations/20261109012624_fase3_configuracion_operativa_admin.sql', import.meta.url), 'utf8')
    const fase4Upgrade = readFileSync(new URL('../supabase/migrations/20261109024411_fase4_enrutamiento_comandas.sql', import.meta.url), 'utf8')
    const fase5Upgrade = readFileSync(new URL('../supabase/migrations/20261109045958_fase5_kds_salida_manual_comandas.sql', import.meta.url), 'utf8')
    const fase6Upgrade = readFileSync(new URL('../supabase/migrations/20261109061058_fase6_agente_impresion_automatica.sql', import.meta.url), 'utf8')
    await pgUpgrade.exec(fase3Upgrade)
    await pgUpgrade.exec(fase4Upgrade)
    await pgUpgrade.exec(fase4Upgrade)
    await pgUpgrade.exec(fase5Upgrade)
    await pgUpgrade.exec(fase5Upgrade)
    await pgUpgrade.exec(fase6Upgrade)
    await pgUpgrade.exec(fase6Upgrade)
    const cobroUpgrade = readFileSync(new URL('../supabase/migrations/20261109075129_validar_modalidad_cobro_restaurante.sql', import.meta.url), 'utf8')
    await pgUpgrade.exec(cobroUpgrade)
    await pgUpgrade.exec(cobroUpgrade)
    assert.equal((await pgUpgrade.query("select modalidad_cobro_aplicada from public.configuracion_operativa where restaurante_id='00000000-0000-4000-8000-000000000002'")).rows[0].modalidad_cobro_aplicada, null)
    await pgUpgrade.exec(readFileSync(new URL('../supabase/qa/fase5_kds_salida_manual_rollback.sql', import.meta.url), 'utf8'))
    await pgUpgrade.exec(readFileSync(new URL('../supabase/qa/fase6_agente_impresion_rollback.sql', import.meta.url), 'utf8'))
    const columnasFase4 = await pgUpgrade.query(`
      select table_name, column_name, is_nullable from information_schema.columns
       where table_schema = 'public' and (
         (table_name = 'productos' and column_name = 'estacion') or
         (table_name = 'entregas_comanda' and column_name in ('estacion_codigo', 'configuracion_destino'))
       )
    `)
    assert.equal(columnasFase4.rows.find((c) => c.table_name === 'productos' && c.column_name === 'estacion')?.is_nullable, 'YES')
    assert.equal(columnasFase4.rows.find((c) => c.table_name === 'entregas_comanda' && c.column_name === 'estacion_codigo')?.is_nullable, 'YES')
    assert.equal(columnasFase4.rows.find((c) => c.table_name === 'entregas_comanda' && c.column_name === 'configuracion_destino')?.is_nullable, 'NO')
    assert.equal((await pgUpgrade.query("select count(*)::int as n from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='avanzar_comanda_estacion'")).rows[0].n, 1)
    assert.equal((await pgUpgrade.query("select count(*)::int as n from information_schema.columns where table_schema='public' and table_name='pedidos' and column_name='ruteo_configurado'")).rows[0].n, 1)
    assert.equal((await pgUpgrade.query("select count(*)::int as n from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('registrar_impresion_salida_comanda','actualizar_estado_salida_comanda')")).rows[0].n, 2)
    console.log('SQL QA: migraciones Fase 2/3/4/5/6 y modalidad de cobro instaladas en esquema existente; últimas migraciones idempotentes')
  } finally { await pgUpgrade.close() }
} catch (e) {
  console.error(e.message, e.position ? `SQL position ${e.position}` : '', e.detail ?? '', e.hint ?? '', e.where ?? '')
  if (e.internalQuery) console.error('Internal query:', e.internalQuery)
  process.exitCode = 1
} finally {
  await pg.close()
}
