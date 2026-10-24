-- =============================================================================
-- Mesora · TODO_EN_UNO.sql — PEGA ESTE ARCHIVO ENTERO EN EL SQL EDITOR
-- =============================================================================
-- Levantá la base de datos de Mesora desde cero: tablas, funciones, permisos,
-- RLS y los perfiles de prueba. Todo en un solo archivo, en el orden correcto.
--
-- CÓMO USARLO (3 pasos)
--   1. ANTES, creá estos 5 usuarios en Supabase → Authentication → Users →
--      Add user, con "Auto Confirm User" marcado:
--           super@prueba.app   → super_admin
--           admin@prueba.app   → admin_restaurante
--           mesero@prueba.app  → mesero
--           cocina@prueba.app  → cocina
--           cajero@prueba.app  → cajero
--      El último bloque de este script los enlaza por email. Si alguno no
--      existe en Auth, aparece un aviso y se lo saltea (no rompe nada).
--   2. Abrí el SQL Editor → New query → pegá TODO este archivo → Run.
--   3. Listo. Al final hay consultas de verificación: la última debe listar los
--      5 roles de prueba.
--
-- DESPUÉS DE APLICARLO
--   Copiá la URL y la anon key del proyecto a tu .env.local y reiniciá Vite.
--
-- NOTAS
--   · Es idempotente: podés pegarlo las veces que quieras, no duplica nada.
--   · Si algo falla, los comentarios "-- # n/19 · archivo.sql" marcan
--     el bloque exacto donde estabas.
--   · El archivo es generado por `npm run sql:install` desde
--     `supabase/fuentes/`. No lo edites a mano: se pisa en la próxima
--     generación. Editá la fuente correspondiente.
--
-- Contenido: 19 archivos · sha256(cuerpo) = 42dcf05d2289
-- Orden: 00_schema_base.sql → 00_seguridad_rpcs.sql → migracion_items_anulables.sql → migracion_productos_es_bebida.sql → migracion_password_recovery.sql → pin_autorizacion.sql → rpc_crear_pedido.sql → rpc_cerrar_cuenta.sql → rpc_anular_cuenta.sql → caja_turnos.sql → 01_rls_completo.sql → admin_super_restaurante.sql → usuarios_super_admin.sql → estadisticas_super_admin.sql → soporte.sql → suscripciones_super_admin.sql → auditoria.sql → configuracion_global.sql → 99_crear_usuario_prueba.sql
-- =============================================================================



-- #############################################################################
-- # 1/19 · 00_schema_base.sql
-- #############################################################################

-- -- =============================================================================-- Mesora · SCHEMA BASE (ejecutar PRIMERO, en el SQL Editor de Supabase)-- =============================================================================---- QUÉ ES ESTE ARCHIVO-- Las diez tablas que la app necesita y que ningún otro archivo del repo creaba.-- Los tipos de `src/types/database.ts` son la especificación (de ahí sale cada-- columna, su nulabilidad y sus valores permitidos) y los `create table` que sí-- existaban (`caja_turnos`, `cuenta_pagos`, `restaurante_pins`) se dejaron donde-- estaban, para no duplicar objetos.---- LAS TRES RESTRICCIONES QUE NO SON NEGOCIABLES----   1. `usuarios.id` ES `auth.users.id`. No hay dos identidades: el perfil es la--      fila del usuario de Supabase Auth con datos de restaurante. Por eso el--      login del front puede hacer `select * from usuarios where id = auth.uid()`--      y con eso saber rol, restaurante y si está activo. Si `id` fuera un uuid--      aparte, `auth.uid()` no encontraría nada y la app no sabría quién es el--      usuario ni la RLS no podría aislar por restaurante.----   2. NUMÉRICOS CON DINERO SON `numeric(12,2)`. `precio`, `precio_unitario`,--      `total`, `propina`, `vuelto`, `monto_inicial`... El front los lee como--      número, y Postgres devuelve `numeric` como string en el JSON; la capa de--      tipos los declara `number`. Nunca `float`: 0.1 + 0.2 tiene que dar 0.30 en--      una boleta.----   3. NADA SE BORRA. Las anulaciones marcan estado (`anulado`, `anulada`) y--      guardan quién y cuándo; los `on delete cascade` solo existen para borrar--      datos de un restaurante entero, que es una operación de soporte. Una--      boleta emitida es un documento contable.---- ORDEN DE APLICACIÓN (el detalle completo está en SUPABASE_SETUP.md)--   1. este archivo                  ← tablas del dominio--   2. 00_seguridad_rpcs.sql         ← validar_acceso_restaurante--   3. migracion_items_anulables.sql--   4. migracion_productos_es_bebida.sql--   5. pin_autorizacion.sql          ← crea restaurante_pins + las funciones del PIN--   6. rpc_crear_pedido.sql--   7. rpc_cerrar_cuenta.sql         ← crea cuenta_pagos--   8. rpc_anular_cuenta.sql--   9. caja_turnos.sql               ← crea caja_turnos--  10. 01_rls_completo.sql           ← RLS y permisos, AL FINAL---- REQUISITOS--   * Estar en Supabase (o en un Postgres con los schemas `auth` y `extensions`).--     El SQL Editor corre como el rol `postgres`, que es el dueño de estos--     objetos y por eso está exento de RLS: de ahí funciona que los helpers--     `security definer` de `01_rls_completo.sql` puedan leer `usuarios` sin--     dispararse la policy a sí misma.--   * Correrlo como `postgres`, no como otro rol, y de a un archivo por vez.---- IDEMPOTENTE--   Se puede volver a ejecutar. Las tablas usan `create table if not exists` y--   los índices `create index if not exists`. OJO: si una tabla ya existe con--   columnas de más, este archivo NO las borra (para eso están las migraciones).----   Tampoco reescribe columnas que YA existen: `create table if not exists` es--   un no-op sobre una tabla que ya está. Por eso la sección 0.5 (enums → text)--   y el `add column if not exists email` de `usuarios` existen: son los dos--   puntos donde un esquema anterior dejó columnas que este diseño necesita en--   otro formato.---- LO QUE ESTE ARCHIVO NO HACE--   * No da permisos a nadie. Los `grant`/`revoke` viven todos en--     `01_rls_completo.sql`, que se aplica al final.--   * No crea usuarios de Supabase Auth (eso lo hace el panel o--     `99_crear_usuario_prueba.sql`).-- =============================================================================-- ------------------------------------------------------------------------------- 0. Extensiones-- ------------------------------------------------------------------------------- `pgcrypto` provee `gen_salt` y `crypt`, que usa `pin_autorizacion.sql` para-- el hash bcrypt del PIN. En Supabase ya está instalada en el schema-- `extensions`; el `if not exists` no la mueve si ya existe, y por eso las-- funciones del PIN llevan `set search_path = public, extensions`.-- (Postgres no valida el `search_path`: si `extensions` no existiera, el-- `search_path` igual funciona y solo faltaría la extensión.)create schema if not exists extensions;create extension if not exists pgcrypto with schema extensions;-- ------------------------------------------------------------------------------- 0.5 Un esquema anterior que guardaba los estados como `enum`-- ------------------------------------------------------------------------------- Este diseño guarda estados y roles en `text` + CHECK, que es lo que esperan-- `src/types/database.ts` (`Rol` es una unión de strings) y las RPC (`rol in-- ('mesero', 'admin_restaurante')`). Un esquema anterior puede tenerlos como-- tipos `enum` (p. ej. `pedidos.estado` sobre `estado_pedido`). Con enums este-- archivo se rompe en dos lugares, y los dos errores no dicen qué pasó:----   * `check (estado in (... , 'anulado'))` falla con 22P02 "invalid input--     value for enum": el literal se convierte al tipo de la columna y el--     valor nuevo no existe en el enum viejo;--   * lo mismo le pasa a `update estado = 'anulado'` (y a cualquier literal que--     el enum no tenga), pero recién cuando se usa, no al instalar.---- `create table if not exists` no reescribe columnas que ya existen, así que la-- única salida es convertir la columna a `text`. Se hace acá, ANTES de todo el-- resto del archivo, para que los `create table`/`create index`/`add constraint`-- de más abajo se creen sobre `text` desde el principio.---- Solo toca la columna si existe y es un enum: en una base recién creada este-- bloque no hace nada (los enums viejos quedan sin usar, no hace falta-- borrarlos).do $$declare  v_tabla text;  v_col text;  v_defecto text;  v_oid regclass;  v_es_enum boolean;  v_con text;begin  for v_tabla, v_col, v_defecto in    select * from (values      ('pedidos',      'estado',      'pendiente'),      ('cuentas',      'estado',      'pendiente'),      ('cuentas',      'metodo_pago', null::text),      ('mesas',        'estado',      'libre'),      ('caja_turnos',  'estado',      'abierto'),      ('cuenta_pagos', 'metodo_pago', null::text),      ('usuarios',     'rol',         null::text)    ) as t(tabla, columna, defecto)  loop    v_oid := to_regclass('public.' || v_tabla);    if v_oid is null then      continue;    end if;    select exists (      select 1        from pg_attribute a        join pg_type tp on tp.oid = a.atttypid       where a.attrelid = v_oid         and a.attname = v_col         and tp.typtype = 'e'    ) into v_es_enum;    if not v_es_enum then      continue;    end if;    raise notice 'Mesora: public.% (%) era un enum, se pasa a text', v_tabla, v_col;    -- El default está escrito como literal del enum viejo y no se puede    -- recastear solo: se quita ahora y se vuelve a poner abajo, ya como text.    execute format('alter table public.%I alter column %I drop default', v_tabla, v_col);    begin      execute format(        'alter table public.%I alter column %I type text using %I::text',        v_tabla, v_col, v_col      );    exception when others then      -- Postgres no supo recastear los CHECK que mencionan la columna: se      -- quitan, se convierte y el bloque 2 de abajo vuelve a poner los      -- canónicos de este esquema.      raise notice 'Mesora: no se pudo convertir public.% (%) directo: %; se quitan los CHECK que la mencionan',        v_tabla, v_col, sqlerrm;      for v_con in        select c.conname          from pg_constraint c         where c.conrelid = v_oid           and c.contype = 'c'           and pg_get_constraintdef(c.oid) ilike '%' || v_col || '%'      loop        execute format('alter table public.%I drop constraint %I', v_tabla, v_con);        raise notice 'Mesora: se quitó public.%.%', v_tabla, v_con;      end loop;      execute format(        'alter table public.%I alter column %I type text using %I::text',        v_tabla, v_col, v_col      );    end;    if v_defecto is not null then      execute format(        'alter table public.%I alter column %I set default %L::text',        v_tabla, v_col, v_defecto      );    end if;  end loop;end;$$;-- Los CHECK que el bloque anterior pudo haber tenido que soltar. Solo se agregan-- los que falten (en una base recién creada ya vinieron en el `create table` o-- todavía no existe la tabla), y si los datos viejos no cumplen el CHECK no se-- aborta la instalación: se avisa y listo, para poder seguir leyendo el resto de-- los errores de una corrida.do $$declare  v_tabla text;  v_con text;  v_def text;  v_oid regclass;begin  for v_tabla, v_con, v_def in    select * from (values      ('usuarios', 'usuarios_rol_check',       'check (rol in (''super_admin'', ''admin_restaurante'', ''mesero'', ''cocina'', ''cajero''))'),      ('mesas', 'mesas_estado_check',       'check (estado in (''libre'', ''ocupada''))'),      ('pedidos', 'pedidos_estado_check',       'check (estado in (''pendiente'', ''en_preparacion'', ''listo'', ''entregado'', ''anulado''))'),      ('cuentas', 'cuentas_metodo_pago_check',       'check (metodo_pago in (''efectivo'', ''tarjeta'', ''yape_plin'', ''otro''))'),      ('cuentas', 'cuentas_estado_check',       'check (estado in (''pendiente'', ''pagada'', ''anulada''))'),      ('cuentas', 'cuentas_pagada_con_fecha',       'check (estado = ''pendiente'' or pagado_at is not null)'),      ('cuenta_pagos', 'cuenta_pagos_metodo_pago_check',       'check (metodo_pago in (''efectivo'', ''tarjeta'', ''yape_plin'', ''otro''))'),      ('caja_turnos', 'caja_turno_cierre_completo',       'check ((estado = ''abierto'' and fecha_cierre is null and usuario_cierre_id is null and monto_declarado is null and monto_esperado is null and diferencia is null) or (estado = ''cerrado'' and fecha_cierre is not null and usuario_cierre_id is not null and monto_declarado is not null and monto_esperado is not null and diferencia is not null))')    ) as t(tabla, nombre, definicion)  loop    v_oid := to_regclass('public.' || v_tabla);    if v_oid is null then      continue;    end if;    if exists (      select 1 from pg_constraint c       where c.conrelid = v_oid and c.conname = v_con    ) then      continue;    end if;    begin      execute format('alter table public.%I add constraint %I %s', v_tabla, v_con, v_def);      raise notice 'Mesora: (re)creado el CHECK public.%.%', v_tabla, v_con;    exception when others then      raise warning 'Mesora: no se pudo crear public.% (%): %. Revisa los valores ya guardados en esa columna y vuelve a ejecutar.',        v_tabla, v_con, sqlerrm;    end;  end loop;end;$$;-- ------------------------------------------------------------------------------- 1. restaurantes-- -----------------------------------------------------------------------------create table if not exists public.restaurantes (  id uuid primary key default gen_random_uuid(),  nombre text not null,  ruc text,  telefono text,  direccion text,  email_contacto text,  -- Dominio de correo del local (ej. litoral.pe). El admin lo define desde su  -- panel y su personal entra como usuario@dominio (carlos@litoral.pe). Es solo  -- una convención de identidad: no cambia el login, que sigue por Auth.  dominio text,  -- El bloqueo de cobro: `suscripcion_activa` y `fecha_vencimiento` los leen la  -- UI (SuscripcionVencida), `validar_acceso_restaurante` en cada RPC que  -- escribe y `suscripcion_vigente` en cada policy de escritura.  -- `fecha_vencimiento = null` significa suscripción indefinida.  suscripcion_activa boolean not null default true,  fecha_vencimiento timestamptz,  created_at timestamptz not null default now());comment on table public.restaurantes is  'Locales. La suscripción vigente (suscripcion_activa + fecha_vencimiento) es lo que bloquea vender.';comment on column public.restaurantes.fecha_vencimiento is  'NULL = suscripción indefinida (plan vitalicio).';-- Igual que `usuarios.email`: si la tabla ya existía de una corrida anterior, el-- `create table if not exists` no agrega la columna. Acá se suma si falta.alter table public.restaurantes  add column if not exists dominio text;comment on column public.restaurantes.dominio is  'Dominio de correo del personal (ej. litoral.pe). Lo define el admin del local; el correo del personal queda usuario@dominio.';create index if not exists idx_restaurantes_nombre on public.restaurantes (nombre);-- ------------------------------------------------------------------------------- 2. usuarios  (perfiles; id = auth.users.id)-- -----------------------------------------------------------------------------create table if not exists public.usuarios (  id uuid primary key references auth.users (id) on delete cascade,  restaurante_id uuid references public.restaurantes (id) on delete cascade,  -- `text` + CHECK en vez de enum: es lo que espera `src/types/database.ts`  -- (`Rol` es una unión de strings) y lo que leen los RPC (`rol in ('mesero',  -- 'admin_restaurante')`). Un enum obligaría a castear en cada consulta.  rol text not null check (rol in (    'super_admin', 'admin_restaurante', 'mesero', 'cocina', 'cajero'  )),  nombre text not null,  email text,  -- Desactivar es la forma de "dar de baja": el usuario conserva su historia  -- (sus comandas, sus boletas, sus arqueos) pero pierde el acceso, tanto en la  -- app como en cada RPC y en cada policy. Por eso `activo` NO se borra y las  -- policies lo exigen.  activo boolean not null default true,  created_at timestamptz not null default now());-- Si la tabla ya existe de una corrida anterior, `create table if not exists` no-- hace nada y puede quedar sin `email`: el índice de abajo fallaría con-- "column email does not exist". Acá se agrega si falta.alter table public.usuarios  add column if not exists email text;comment on table public.usuarios is  'Perfil del usuario. El id es el de Supabase Auth: sin esa correspondencia, auth.uid() no encuentra nada y no hay aislamiento por restaurante.';comment on column public.usuarios.activo is  'false = desactivado. Pierde el acceso en la app, en las RPC y en las policies (es el mismo flag que usan las tres capas).';comment on column public.usuarios.restaurante_id is  'NULL solo para super_admin, que administra los locales desde fuera y no opera dentro de ninguno.';create index if not exists idx_usuarios_restaurante on public.usuarios (restaurante_id);-- No es unique a propósito: `crearPersonal` (src/lib/api.ts) inserta el perfil sin-- crear todavía el usuario de Auth —el alta real de meseros es en dos pasos— y un-- índice único haría fallar el alta con un error de Postgres en vez de un mensaje-- en la UI.create index if not exists idx_usuarios_email on public.usuarios (lower(email));create index if not exists idx_usuarios_rol on public.usuarios (restaurante_id, rol);-- ------------------------------------------------------------------------------- 3. zonas  y  4. mesas-- -----------------------------------------------------------------------------create table if not exists public.zonas (  id uuid primary key default gen_random_uuid(),  restaurante_id uuid not null references public.restaurantes (id) on delete cascade,  nombre text not null,  created_at timestamptz not null default now());comment on table public.zonas is  'Zonas del local (salón, terraza, barra). Se borran a mano desde la app, que avisa si quedan mesas.';create index if not exists idx_zonas_restaurante on public.zonas (restaurante_id, nombre);create table if not exists public.mesas (  id uuid primary key default gen_random_uuid(),  restaurante_id uuid not null references public.restaurantes (id) on delete cascade,  zona_id uuid not null references public.zonas (id) on delete cascade,  nombre text not null,  -- `libre`/`ocupada` no es solo cosmético: `cerrar_cuenta` la pone en 'libre' al  -- cobrar y `crear_pedido` la pone en 'ocupada'. Es el estado que el mesero ve  -- para elegir mesa.  estado text not null default 'libre' check (estado in ('libre', 'ocupada')),  created_at timestamptz not null default now());comment on table public.mesas is  'Mesas del local. El estado lo mueve el mesero/cajero para liberar y las RPC al cobrar y al pedir.';create index if not exists idx_mesas_restaurante on public.mesas (restaurante_id, nombre);create index if not exists idx_mesas_zona on public.mesas (zona_id);-- Índice único sobre `lower(nombre)`: no puede haber dos mesas que se llamen-- igual en el mismo restaurante ("Mesa 1" y "mesa 1" cuentan como la misma). Es-- el mismo criterio que usa el índice de un solo turno abierto en-- `caja_turnos.sql`: la garantía la pone la base, no el formulario.create unique index if not exists mesas_un_nombre_por_restaurante  on public.mesas (restaurante_id, lower(nombre));-- Una mesa tiene que ser de una zona del MISMO restaurante. Sin esto se podría-- colgar la mesa de una zona ajena y la fila aparecería en el filtro equivocado.---- Ojo con cómo se expresa: NO puede ser un `check (... in (select ...))` porque-- Postgres prohíbe subconsultas en un CHECK (error "cannot use subquery in check-- constraint"). La forma correcta es una FK compuesta sobre (id, restaurante_id)-- de la zona, que para eso necesita ser única en `zonas`.---- Esto se agrega con `alter` y no dentro del `create table` para que también-- funcione sobre una base donde las tablas ya existieran sin la garantía.do $$begin  if not exists (    select 1 from pg_constraint where conname = 'zonas_id_restaurante_unico'  ) then    alter table public.zonas      add constraint zonas_id_restaurante_unico unique (id, restaurante_id);  end if;  if not exists (    select 1 from pg_constraint where conname = 'mesas_zona_del_mismo_restaurante_fk'  ) then    alter table public.mesas      add constraint mesas_zona_del_mismo_restaurante_fk      foreign key (zona_id, restaurante_id)      references public.zonas (id, restaurante_id);  end if;end;$$;-- ------------------------------------------------------------------------------- 5. categorias_productos  y  6. productos-- -----------------------------------------------------------------------------create table if not exists public.categorias_productos (  id uuid primary key default gen_random_uuid(),  restaurante_id uuid not null references public.restaurantes (id) on delete cascade,  nombre text not null,  created_at timestamptz not null default now());comment on table public.categorias_productos is  'Categorías del menú. Se borran a mano desde la app, que avisa si quedan productos.';create index if not exists idx_categorias_restaurante  on public.categorias_productos (restaurante_id, nombre);create table if not exists public.productos (  id uuid primary key default gen_random_uuid(),  restaurante_id uuid not null references public.restaurantes (id) on delete cascade,  -- NULL = producto suelto sin categoría (la app lo permite). `on delete set  -- null` para que borrar una categoría no borre el historial de las boletas.  categoria_id uuid references public.categorias_productos (id) on delete set null,  nombre text not null,  descripcion text,  imagen_url text,  precio numeric(12, 2) not null check (precio >= 0),  -- `disponible = false` lo esconde del menú del mesero, pero NO de la base: el  -- filtro es del navegador (getProductos sin incluirAgotados). Ver §9.14 de  -- ESTADO_Y_CAMBIOS.md.  disponible boolean not null default true,  es_promocion boolean not null default false,  precio_promocion numeric(12, 2) check (precio_promocion >= 0),  -- Lo define el admin: lo prepara la barra, no la cocina. La migración  -- `migracion_productos_es_bebida.sql` hace un backfill desde el nombre de la  -- categoría; la columna ya está aquí, así que ese `add column if not exists`  -- no hace nada.  es_bebida boolean not null default false,  created_at timestamptz not null default now(),  -- Una promoción sin precio de promoción no es una promoción: el precio que se  -- cobra lo decide `crear_pedido`, y si `precio_promocion` fuera NULL cobraría  -- el precio normal sin avisar.  constraint productos_promocion_coherente check (    es_promocion = false or (precio_promocion is not null and precio_promocion > 0)  ));comment on table public.productos is  'Catálogo del local. El precio que se cobra lo congela `crear_pedido` en pedido_items: cambiar el precio del menú no reescribe la historia.';create index if not exists idx_productos_restaurante on public.productos (restaurante_id, nombre);create index if not exists idx_productos_disponible on public.productos (restaurante_id, disponible);create index if not exists idx_productos_categoria on public.productos (categoria_id);-- ------------------------------------------------------------------------------- 7. pedidos  y  8. pedido_items-- -----------------------------------------------------------------------------create table if not exists public.pedidos (  id uuid primary key default gen_random_uuid(),  restaurante_id uuid not null references public.restaurantes (id) on delete cascade,  -- `restrict`: la app no deja borrar una mesa con comandas por cobrar, y una  -- comanda no se borra nunca. Que la base lo diga también.  mesa_id uuid not null references public.mesas (id) on delete restrict,  -- Quién tomó la comanda. `restrict` a propósito: para dar de baja a un mesero  -- se desactiva (`activo = false`), no se borra, porque sus comandas son el  -- histórico de ventas por mesero que ve el dashboard.  mesero_id uuid not null references public.usuarios (id) on delete restrict,  -- El nombre del CHECK importa: `migracion_items_anulables.sql` borra los checks  -- que mencionen `estado` y agrega uno con los cinco valores (incluido  -- 'anulado'). Con este nombre, aplicar la migración es un no-op limpio.  estado text not null default 'pendiente',  constraint pedidos_estado_check check (    estado in ('pendiente', 'en_preparacion', 'listo', 'entregado', 'anulado')  ),  observacion text,  created_at timestamptz not null default now(),  updated_at timestamptz not null default now());comment on table public.pedidos is  'Comandas. Las crea crear_pedido (que fija los precios desde el catálogo del servidor) y de ahí en adelante solo cambian de estado: cocina, mesero y admin avanzan el estado con update directo, y la policy es lo que decide quién puede.';comment on column public.pedidos.estado is  'anulado = comanda que se quedó sin ítems vigentes: no se prepara, no se cobra y no ocupa la mesa.';-- Mismos nombres que en migracion_items_anulables.sql, para que sus-- `create index if not exists` no dupliquen nada.create index if not exists idx_pedidos_restaurante_mesa  on public.pedidos (restaurante_id, mesa_id, created_at);create index if not exists idx_pedidos_restaurante_estado  on public.pedidos (restaurante_id, estado, created_at);create index if not exists idx_pedidos_mesero on public.pedidos (mesero_id);create table if not exists public.pedido_items (  id uuid primary key default gen_random_uuid(),  pedido_id uuid not null references public.pedidos (id) on delete cascade,  -- NULL si el producto se borró del catálogo después de pedirlo: el ítem sigue  -- en la boleta con el nombre y el precio que tenía al pedirlo.  producto_id uuid references public.productos (id) on delete set null,  -- `nombre_producto` y `precio_unitario` son COPIAS congeladas al pedir. Los  -- pone el servidor (`crear_pedido`), nunca el cliente: si los aceptara del  -- navegador, cualquiera podría pedir un plato de S/ 0.01.  nombre_producto text not null,  cantidad int not null check (cantidad between 1 and 99),  precio_unitario numeric(12, 2) not null check (precio_unitario >= 0),  nota text,  -- La anulación del ítem. `not null default false` a propósito: las RPC filtran  -- con `anulado = false` (no `coalesce`), así que un NULL aquí sería un ítem  -- que ni la cocina ve ni la boleta cobra, sin que nadie lo haya pedido.  anulado boolean not null default false,  anulado_por uuid references public.usuarios (id) on delete set null,  anulado_at timestamptz,  created_at timestamptz not null default now(),  -- Si está anulado tiene que decir quién y cuándo: es el rastro de por qué la  -- cuenta sale más baja.  constraint pedido_items_anulacion_coherente check (    anulado = false    or (anulado_por is not null and anulado_at is not null)  ));comment on table public.pedido_items is  'Ítems de la comanda. El precio y el nombre los congela el servidor al pedir; anular marca `anulado`, nunca borra la fila.';create index if not exists idx_pedido_items_pedido on public.pedido_items (pedido_id);-- ------------------------------------------------------------------------------- 9. cuentas  y  10. cuenta_pedidos-- -----------------------------------------------------------------------------
-- ---------------------------------------------------------------------------
-- Correlativo de boleta por restaurante
-- ---------------------------------------------------------------------------
create table if not exists public.correlativos (
  restaurante_id uuid not null references public.restaurantes (id) on delete cascade,
  tipo text not null,
  ultimo integer not null default 0,
  primary key (restaurante_id, tipo)
);

comment on table public.correlativos is 'Contadores por restaurante (p. ej. boletas). Solo lo escribe cerrar_cuenta().';

alter table public.correlativos enable row level security;

-- Numero correlativo de boleta en cuentas
alter table public.cuentas add column if not exists numero text;

comment on column public.cuentas.numero is 'Numero correlativo de la boleta (B001-000123), unico por restaurante.';

create unique index if not exists cuentas_numero_por_restaurante
  on public.cuentas (restaurante_id, numero)
  where numero is not null;

create table if not exists public.cuentas (  id uuid primary key default gen_random_uuid(),  restaurante_id uuid not null references public.restaurantes (id) on delete cascade,  mesa_id uuid not null references public.mesas (id) on delete restrict,  -- El total es la SUMA DE LOS ÍTEMS, calculada por `cerrar_cuenta`. Nunca lo  -- manda el navegador. La app lo relee después del cobro para armar la boleta.  total numeric(12, 2) not null check (total >= 0),  -- Solo el método PRINCIPAL. El detalle real del pago dividido está en  -- `cuenta_pagos` (que crea rpc_cerrar_cuenta.sql): con pago dividido, esta  -- columna se quedaría corta y el dashboard atribuiría todo a un método.  metodo_pago text not null,  constraint cuentas_metodo_pago_check check (    metodo_pago in ('efectivo', 'tarjeta', 'yape_plin', 'otro')  ),  -- El nombre importa: `rpc_anular_cuenta.sql` hace  -- `drop constraint if exists cuentas_estado_check` para reemplazar el CHECK  -- de dos estados por el de tres. Con otro nombre quedarían los dos vivos y la  -- boleta anulada nunca se podría guardar.  estado text not null default 'pendiente',  constraint cuentas_estado_check check (estado in ('pendiente', 'pagada', 'anulada')),  pagado_at timestamptz,  -- Número correlativo de la boleta (B001-000123), único por restaurante. Lo  -- asigna `cerrar_cuenta` (rpc_cerrar_cuenta.sql). NULL en datos anteriores.  numero text,  -- La propina va APARTE del total a propósito: el reporte de ventas no cuenta  -- propina como venta de comida.  propina numeric(12, 2) not null default 0 check (propina >= 0),  vuelto numeric(12, 2) not null default 0 check (vuelto >= 0),  -- Rastro de la anulación. Los rellena `anular_cuenta` (admin o cajero, con  -- motivo y PIN). Este archivo no agrega el CHECK de coherencia: lo crea  -- `rpc_anular_cuenta.sql` con el nombre `cuentas_anulacion_coherente`, que  -- además de exigir los tres datos cuando está anulada, obliga a que estén en  -- NULL cuando no lo está (una boleta pagada no puede quedar con motivo puesto).  anulada_at timestamptz,  anulada_por uuid references public.usuarios (id) on delete set null,  motivo_anulacion text,  -- Total devuelto (todos los métodos). El arqueo de caja solo descuenta la  -- parte en efectivo, que es la única que puede salir de la gaveta.  monto_reembolsado numeric(12, 2) check (monto_reembolsado >= 0),  created_at timestamptz not null default now(),  -- Una cuenta pagada tiene fecha de pago; una pendiente, no. Sin esto, el  -- arqueo podría sumar una cuenta que nadie cobró.  constraint cuentas_pagada_con_fecha check (    estado = 'pendiente' or pagado_at is not null  ));comment on table public.cuentas is  'Cobros. La crea `cerrar_cuenta` con el total desde los ítems; anularla la deja en anulada con motivo, autor y monto devuelto. Nunca se borra.';create index if not exists idx_cuentas_restaurante on public.cuentas (restaurante_id, estado);-- El dashboard y la pantalla de cobros ordenan por fecha de pago; el índice-- parcial los evita un sort sobre toda la historia.create index if not exists idx_cuentas_pagadas on public.cuentas (restaurante_id, pagado_at desc)  where estado = 'pagada';create table if not exists public.cuenta_pedidos (  id uuid primary key default gen_random_uuid(),  cuenta_id uuid not null references public.cuentas (id) on delete cascade,  pedido_id uuid not null references public.pedidos (id) on delete restrict,  -- Subtotal de ESA comanda (sin ítems anulados). Es lo que permite reimprimir  -- el detalle y lo que usa `cerrar_cuenta` para el desglose.  subtotal numeric(12, 2) not null default 0 check (subtotal >= 0),  created_at timestamptz not null default now());comment on table public.cuenta_pedidos is  'Qué comandas se cobraron en qué boleta. Lo escribe `cerrar_cuenta` en la misma transacción que la cuenta: es lo que impide cobrar dos veces la misma comanda.';create index if not exists idx_cuenta_pedidos_cuenta on public.cuenta_pedidos (cuenta_id);create index if not exists idx_cuenta_pedidos_pedido on public.cuenta_pedidos (pedido_id);-- NO es único a propósito, y es una decisión consciente: `cerrar_cuenta` solo-- bloquea los pedidos que están en una cuenta EN ESTADO 'pagada', así que anular-- una boleta devuelve la comanda al circuito y se puede volver a cobrar. Un-- índice único sobre `pedido_id` lo rompería ese flujo (la segunda cuenta fallaría-- por constraint en vez de explicar que la comanda ya se cobró y se anuló).-- La doble protección real es el `for update` sobre la mesa en `cerrar_cuenta`.-- ------------------------------------------------------------------------------- 11. updated_at de pedidos-- ------------------------------------------------------------------------------- `avanzarPedido` y `cerrar_cuenta` escriben `updated_at` a mano, pero el-- trigger evita que la próxima RPC que olvide hacerlo deje una comanda con la-- fecha de su creación, como si nadie la hubiera tocado.create or replace function public.tocar_updated_at()returns triggerlanguage plpgsqlas $$begin  new.updated_at := now();  return new;end;$$;comment on function public.tocar_updated_at() is  'Trigger: mantiene pedidos.updated_at al día. No se ejecuta desde el cliente.';drop trigger if exists trg_pedidos_updated_at on public.pedidos;create trigger trg_pedidos_updated_at  before update on public.pedidos  for each row execute function public.tocar_updated_at();-- Un trigger no se "llama" desde el cliente, pero tampoco tiene por qué quedar-- ejecutable por cualquiera.revoke all on function public.tocar_updated_at() from public;-- ------------------------------------------------------------------------------- 12. Comprobación-- ------------------------------------------------------------------------------- Debe listar las 10 tablas de este archivo. Las otras tres (cuenta_pagos,-- caja_turnos, restaurante_pins) las crean rpc_cerrar_cuenta.sql, caja_turnos.sql-- y pin_autorizacion.sql.select c.relname as tabla_creada,       (select count(*) from pg_attribute a         where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped) as columnas  from pg_class c  join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public'   and c.relkind = 'r'   and c.relname in (     'restaurantes', 'usuarios', 'zonas', 'mesas', 'categorias_productos',     'productos', 'pedidos', 'pedido_items', 'cuentas', 'cuenta_pedidos'   ) order by c.relname;


-- #############################################################################
-- # 2/19 · 00_seguridad_rpcs.sql
-- #############################################################################

-- -- Mesora · Control de acceso en el SERVIDOR (ejecutar tras 00_schema_base.sql).
--
-- PROBLEMA QUE RESUELVE
-- El bloqueo por suscripción vencida y por usuario desactivado vivía solo en la
-- UI (ProtectedRoute / useCurrentContext). Eso no es una barrera: cualquiera que
-- tenga el anon key de Supabase puede llamar `rpc('crear_pedido', ...)` o
-- `rpc('cerrar_cuenta', ...)` desde la consola, desde curl o desde un script, y
-- saltarse el control por completo. Un mesero desactivado podría seguir cobrando,
-- y un restaurante con la suscripción vencida podría seguir vendiendo.
--
-- La regla que se impone: NINGUNA escritura se acepta si el restaurante no tiene
-- suscripción activa y vigente, o si el usuario que llama (auth.uid()) está
-- desactivado.
--
-- POR QUÉ UNA FUNCIÓN Y NO COPIAR EL CÓDIGO
-- Siete RPCs necesitan el mismo control. Duplicarlo Once es aceptar que, el día
-- que se cambie la regla (un plan nuevo, un grace period, un super admin que sí
-- puede operar), alguien se acuerde de actualizar cinco de los siete. Con una
-- sola función, el cambio se hace una vez y todas las RPCs lo heredan.
--
-- `security definer` + `set search_path`: la función lee `usuarios` y
-- `restaurantes` con los permisos del dueño (los del owner), no los del que
-- llama, para que el control no dependa de las policies de lectura de cada tabla.
--
-- Solo se concede a `authenticated`: un anónimo (que es lo que es la anon key)
-- recibe "permission denied" antes de llegar al mensaje de negocio.

create or replace function public.validar_acceso_restaurante(p_restaurante_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_suscripcion boolean;
  v_vencimiento timestamptz;
begin
  -- 1) Sesión válida. `auth.uid()` es null cuando la llamada va sin JWT.
  if auth.uid() is null then
    raise exception 'Sin sesión: hay que iniciar sesión';
  end if;

  -- 2) El usuario que llama tiene que existir y estar activo.
  --    `activo` es nullable: los NULL (usuarios de antes del campo) cuentan como
  --    activos, que es la misma regla que usa la app (`activo !== false`).
  if not exists (
    select 1
      from public.usuarios
     where id = auth.uid()
       and coalesce(activo, true) = true
  ) then
    raise exception 'Usuario desactivado';
  end if;

  -- 3) El restaurante tiene que existir (si no, es un id inventado).
  select coalesce(r.suscripcion_activa, false), r.fecha_vencimiento
    into v_suscripcion, v_vencimiento
    from public.restaurantes r
   where r.id = p_restaurante_id;

  if not found then
    raise exception 'El restaurante no existe';
  end if;

  -- 4) Suscripción activa.
  if v_suscripcion is not true then
    raise exception 'Suscripción inactiva';
  end if;

  -- 5) Y no vencida. Sin fecha de vencimiento = suscripción indefinida
  --    (así se patchea un plan "vitalicio" sin tocar el código).
  if v_vencimiento is not null and v_vencimiento < now() then
    raise exception 'Suscripción vencida';
  end if;
end;
$$;

comment on function public.validar_acceso_restaurante(uuid) is
  'Control de acceso del servidor: restaurante con suscripción activa y vigente + usuario (auth.uid()) activo. Debe ser la PRIMERA instrucción de toda RPC que escriba datos.';

-- El `revoke` se queda en el archivo que crea la función (defensa en depth: si
-- alguien aplica solo este archivo y no el `01_rls_completo.sql`, la función
-- tampoco debe quedar ejecutable por `anon`). La lista completa de permisos está
-- en `01_rls_completo.sql` §16, que repite este `revoke` y agrega todos los
-- `grant`.
revoke all on function public.validar_acceso_restaurante(uuid) from public;
grant execute on function public.validar_acceso_restaurante(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Cómo se usa en cada RPC
-- ---------------------------------------------------------------------------
-- Como PRIMERA instrucción del bloque `begin` (antes de validar pertenencia o
-- cualquier otra cosa), para que un restaurante vencido reciba el error de
-- suscripción y no un error de permisos confuso:
--
--   begin
--     perform public.validar_acceso_restaurante(p_restaurante_id);
--     ...
--
-- `perform` descarta el resultado (returns void). Si la función no lanza, la RPC
-- sigue; si lanza, la transacción entera se revierte: no queda ni un ítem, ni un
-- cobro, ni una mesa liberada a medias.
--
-- RPCs que ya la llaman: crear_pedido, cerrar_cuenta, abrir_turno_caja,
-- cerrar_turno_caja.


-- #############################################################################
-- # 3/19 · migracion_items_anulables.sql
-- #############################################################################

-- -- Mesora · Edición y anulación de ítems de una comanda.
--
-- Ejecutar UNA VEZ en el SQL Editor de Supabase, ANTES de desplegar la versión
-- nueva del front (src/lib/api.ts ya llama a estas dos RPC y lee la columna
-- `pedido_items.anulado`).
--
-- Qué añade:
--   1. pedido_items.anulado / anulado_por / anulado_at — el ítem no se borra,
--      deja rastro de qué se pidió y qué se canceló.
--   2. El estado 'anulado' en pedidos, para la comanda que se queda sin ítems
--      vigentes (no se prepara, no se cobra, no ocupa la mesa).
--   3. Las RPC editar_item_comanda y anular_item_comanda.
--   4. Permisos: revoke a anon/authenticated y grant solo a authenticated en
--      todas las funciones security definer (si no, cualquiera las ejecuta).
--
-- Es idempotente: se puede volver a ejecutar sin romper nada.
--
-- REQUISITO: 00_seguridad_rpcs.sql debe estar aplicada ANTES que este archivo
-- (editar_item_comanda y anular_item_comanda llaman a
-- validar_acceso_restaurante). Si vas a usar el PIN de autorización, aplica
-- pin_autorizacion.sql ANTES que este: anular_item_comanda llama a
-- validar_pin_autorizacion.

-- ---------------------------------------------------------------------------
-- 1 · Columnas de anulación
-- ---------------------------------------------------------------------------
alter table public.pedido_items
  add column if not exists anulado boolean not null default false;

alter table public.pedido_items
  add column if not exists anulado_por uuid;

alter table public.pedido_items
  add column if not exists anulado_at timestamptz;

comment on column public.pedido_items.anulado is
  'Ítem cancelado por el mesero: no suma, no va a cocina y no entra en la boleta';
comment on column public.pedido_items.anulado_por is 'Usuario que anuló el ítem';
comment on column public.pedido_items.anulado_at is 'Cuándo se anuló el ítem';

-- ---------------------------------------------------------------------------
-- 2 · Estado 'anulado' en pedidos
--
-- No se sabe el nombre del CHECK que ya existe (o si existe), así que se
-- localizan todos los que mencionan `estado` y se reconstruyen con la lista
-- completa. Si no había ninguno, se crea.
--
-- El `add` va con los datos a mano: si una fila guardó un estado que no está en
-- la lista (esquema anterior, enum o no), el CHECK directamente no se crea y se
-- avisa, en vez de tumbar la instalación entera con un 22P02 que no dice ni en
-- qué tabla pasó.
-- ---------------------------------------------------------------------------
do $$
declare
  v_constraint text;
begin
  for v_constraint in
    select c.conname
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
     where n.nspname = 'public'
       and t.relname = 'pedidos'
       and c.contype = 'c'
       and pg_get_constraintdef(c.oid) ilike '%estado%'
  loop
    execute format('alter table public.pedidos drop constraint %I', v_constraint);
  end loop;

  if exists (
    select 1 from public.pedidos
     where estado not in ('pendiente', 'en_preparacion', 'listo', 'entregado', 'anulado')
  ) then
    raise warning 'Mesora: public.pedidos.estado tiene valores fuera de la lista; NO se creó pedidos_estado_check. Corrige esos estados y vuelve a ejecutar.';
  else
    alter table public.pedidos
      add constraint pedidos_estado_check
      check (estado in ('pendiente', 'en_preparacion', 'listo', 'entregado', 'anulado'));
  end if;
end;
$$;

-- Comandas que ya se quedaron sin ítems (por si el front se desplegó antes que
-- esta migración): se marcan anuladas para que no se cobren.
update public.pedidos pd
   set estado = 'anulado', updated_at = now()
 where pd.estado <> 'anulado'
   and not exists (
     select 1 from public.pedido_items pi
      where pi.pedido_id = pd.id and pi.anulado = false
   );

-- ---------------------------------------------------------------------------
-- 3 · Índices que necesita el recorrido de comandas y el filtro de anulados
-- ---------------------------------------------------------------------------
create index if not exists idx_pedido_items_pedido
  on public.pedido_items (pedido_id);

create index if not exists idx_pedidos_restaurante_mesa
  on public.pedidos (restaurante_id, mesa_id, created_at);

create index if not exists idx_pedidos_restaurante_estado
  on public.pedidos (restaurante_id, estado, created_at);

-- ---------------------------------------------------------------------------
-- 4 · RPC: editar un ítem de una comanda abierta
--
-- p_cantidad y p_nota se mandan SIEMPRE los dos (no es un patch parcial):
-- el backend nunca tiene que adivinar si un null significa "no lo cambies" o
-- "quítale la nota".
-- ---------------------------------------------------------------------------
create or replace function public.editar_item_comanda(
  p_restaurante_id uuid,
  p_pedido_id uuid,
  p_item_id uuid,
  p_cantidad int,
  p_nota text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pedido public.pedidos%rowtype;
  v_item public.pedido_items%rowtype;
begin
  -- Control de acceso en el servidor (suscripción + usuario activo). Ver
  -- 00_seguridad_rpcs.sql: sin esto, editar ítems por RPC esquivaría el bloqueo
  -- que solo vive en la UI.
  perform public.validar_acceso_restaurante(p_restaurante_id);

  -- El usuario debe pertenecer al restaurante con rol mesero o admin.
  if not exists (
    select 1 from public.usuarios
     where id = auth.uid()
       and restaurante_id = p_restaurante_id
       and rol in ('mesero', 'admin_restaurante')
  ) then
    raise exception 'Sin permiso para editar comandas en este restaurante';
  end if;

  -- Los precios no se tocan: el precio unitario queda congelado al pedir.
  if p_cantidad is null or p_cantidad < 1 or p_cantidad > 99 then
    raise exception 'La cantidad debe ser un número entre 1 y 99';
  end if;

  select * into v_pedido
    from public.pedidos
   where id = p_pedido_id and restaurante_id = p_restaurante_id
     for update;

  if v_pedido.id is null then
    raise exception 'La comanda no pertenece al restaurante';
  end if;

  select * into v_item
    from public.pedido_items
   where id = p_item_id and pedido_id = p_pedido_id
     for update;

  if v_item.id is null then
    raise exception 'El ítem no pertenece a esta comanda';
  end if;

  if v_item.anulado then
    raise exception 'El ítem está anulado';
  end if;

  if v_pedido.estado = 'anulado' then
    raise exception 'La comanda está anulada';
  end if;

  -- Una comanda ya cobrada es un documento contable: no se toca.
  if exists (
    select 1
      from public.cuenta_pedidos cp
      join public.cuentas c on c.id = cp.cuenta_id
     where cp.pedido_id = p_pedido_id
       and c.estado = 'pagada'
  ) then
    raise exception 'La comanda ya fue cobrada';
  end if;

  update public.pedido_items
     set cantidad = p_cantidad,
         nota = nullif(btrim(p_nota), '')
   where id = p_item_id;

  update public.pedidos set updated_at = now() where id = p_pedido_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5 · RPC: anular un ítem de una comanda abierta
--
-- Idempotente: anular dos veces el mismo ítem no falla. Si era el último ítem
-- vigente, la comanda queda 'anulado' y la mesa vuelve a 'libre' si se quedó
-- sin comandas por cobrar.
--
-- `p_pin`: si el restaurante configuró un PIN de autorización (ver
-- pin_autorizacion.sql), sin él no se anula nada. Es la diferencia entre "el
-- mesero se equivocó y lo corrige" y "el mesero cobró de menos sin que nadie se
-- entere". Sin PIN configurado el parámetro se ignora.
-- ---------------------------------------------------------------------------
create or replace function public.anular_item_comanda(
  p_restaurante_id uuid,
  p_pedido_id uuid,
  p_item_id uuid,
  p_pin text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pedido public.pedidos%rowtype;
  v_item public.pedido_items%rowtype;
begin
  -- Control de acceso en el servidor (suscripción + usuario activo). Ver
  -- 00_seguridad_rpcs.sql.
  perform public.validar_acceso_restaurante(p_restaurante_id);

  if not exists (
    select 1 from public.usuarios
     where id = auth.uid()
       and restaurante_id = p_restaurante_id
       and rol in ('mesero', 'admin_restaurante')
  ) then
    raise exception 'Sin permiso para anular ítems de este restaurante';
  end if;

  -- Autorización del Admin: después del permiso de rol (para no revelar si hay
  -- PIN), antes de tocar nada.
  perform public.validar_pin_autorizacion(p_restaurante_id, p_pin);

  select * into v_pedido
    from public.pedidos
   where id = p_pedido_id and restaurante_id = p_restaurante_id
     for update;

  if v_pedido.id is null then
    raise exception 'La comanda no pertenece al restaurante';
  end if;

  select * into v_item
    from public.pedido_items
   where id = p_item_id and pedido_id = p_pedido_id
     for update;

  if v_item.id is null then
    raise exception 'El ítem no pertenece a esta comanda';
  end if;

  -- Ya estaba anulado: no es un error, solo se repite el efecto.
  if v_item.anulado then
    return;
  end if;

  if v_pedido.estado = 'anulado' then
    raise exception 'La comanda está anulada';
  end if;

  if exists (
    select 1
      from public.cuenta_pedidos cp
      join public.cuentas c on c.id = cp.cuenta_id
     where cp.pedido_id = p_pedido_id
       and c.estado = 'pagada'
  ) then
    raise exception 'La comanda ya fue cobrada';
  end if;

  update public.pedido_items
     set anulado = true,
         anulado_por = auth.uid(),
         anulado_at = now()
   where id = p_item_id;

  update public.pedidos set updated_at = now() where id = p_pedido_id;

  -- Sin ítems vigentes la comanda deja de existir para cocina y para la caja.
  if not exists (
    select 1 from public.pedido_items
     where pedido_id = p_pedido_id and anulado = false
  ) then
    update public.pedidos set estado = 'anulado' where id = p_pedido_id;
  end if;

  -- Si la mesa se quedó sin comandas por cobrar, vuelve a estar libre.
  -- `entregado` cuenta como abierta: servido no es pagado.
  if not exists (
    select 1
      from public.pedidos pd
     where pd.mesa_id = v_pedido.mesa_id
       and pd.restaurante_id = p_restaurante_id
       and pd.estado <> 'anulado'
       and not exists (
         select 1
           from public.cuenta_pedidos cp
           join public.cuentas c on c.id = cp.cuenta_id
          where cp.pedido_id = pd.id
            and c.estado = 'pagada'
       )
  ) then
    update public.mesas
       set estado = 'libre'
     where id = v_pedido.mesa_id
       and restaurante_id = p_restaurante_id;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6 · Permisos de las funciones
--
-- ESTOS PERMISOS YA NO ESTÁN AQUÍ: viven todos juntos en la sección 16 de
-- `01_rls_completo.sql`, que se aplica AL FINAL.
--
-- Motivo (bug real que este archivo tenía): aquí se revocaba y se otorgaba
-- `execute` sobre
--   cerrar_cuenta(uuid, uuid, uuid[], text)
-- pero la firma real de la función es
--   cerrar_cuenta(uuid, uuid, uuid[], jsonb, numeric)
-- (p_pagos es jsonb y p_propina se agregó después). En Postgres, un
-- `revoke execute on function` sobre una firma inexistente lanza ERROR, y en el
-- SQL Editor de Supabase —que corre el script entero en una transacción— eso
-- abortaba este archivo completo: la migración de los ítems anulables no se
-- podía aplicar. Peor: en el orden recomendado este archivo corría antes de
-- rpc_crear_pedido.sql y rpc_cerrar_cuenta.sql, cuando esas funciones todavía no
-- existían.
--
-- `create or replace function` NO cambia los privilegios de una función que ya
-- existía, así que el orden en que se aplican los archivos también decidía si
-- `crear_pedido` o `cerrar_cuenta` quedaban ejecutables por `anon` (Postgres le
-- da EXECUTE a PUBLIC por defecto). Con los permisos reunidos al final de
-- 01_rls_completo.sql, el orden deja de importar.

-- Comprobación: la consulta de permisos por función ahora está en
-- `01_rls_completo.sql` (sección 17.2), porque los `revoke`/`grant` están allí.


-- #############################################################################
-- # 4/19 · migracion_productos_es_bebida.sql
-- #############################################################################

-- -- =============================================================================
-- Mesora · migración: campo explícito `es_bebida` en `productos`
-- =============================================================================
-- Ejecutar UNA vez en Supabase → SQL Editor, ANTES de desplegar el frontend.
-- `realApi` ya lee y escribe `productos.es_bebida` (menú de Cocina/Barra y
-- formulario de productos del Admin), así que sin esta columna la app falla al
-- conectar con Supabase.
--
-- Es idempotente: se puede volver a ejecutar sin efectos.

-- 1) La columna. `not null default false` cubre tanto los productos ya
--    existentes como los que cree cualquier otro cliente en el futuro.
alter table public.productos
  add column if not exists es_bebida boolean not null default false;

-- 2) Backfill opcional: los datos que ya existían no tenían el flag, así que
--    se infiere una vez desde el nombre de la categoría. NO es la fuente de
--    verdad a partir de aquí (manda el valor explícito que setea el Admin).
update public.productos p
   set es_bebida = true
  from public.categorias_productos c
 where p.categoria_id = c.id
   and p.es_bebida = false
   and lower(c.nombre) similar to '%(bebida|bebidas|bar|jugueria|trago)%';

-- 3) Comprobación: debe listar las bebidas de cada restaurante.
select r.nombre as restaurante,
       count(*) filter (where p.es_bebida) as bebidas,
       count(*) as productos
  from public.productos p
  join public.restaurantes r on r.id = p.restaurante_id
 group by r.nombre
 order by r.nombre;


-- #############################################################################
-- # 5/19 · migracion_password_recovery.sql
-- #############################################################################

-- -- =============================================================================
-- Mesora · Recuperación de contraseñas por rol
-- =============================================================================
--
-- QUÉ AGREGA
--   · correo_recuperacion            — correo REAL de recuperación del admin del
--                                      restaurante. Puede ser distinto del
--                                      identificador de login (usuario@dominio).
--   · correo_recuperacion_verificado — marca que el admin ya confirmó ese correo.
--                                      Solo con true se ofrece la recuperación por
--                                      correo; si no está verificado, no se ofrece.
--   · debe_cambiar_password          — si está en true, el login obliga a setear
--                                      una nueva contraseña antes de entrar. Lo
--                                      enciende el reset administrativo de
--                                      trabajadores (mesero/cocina/cajero).
--
-- POR QUÉ
--   · El admin puede tener un correo de login que no recibe correo (ej. un
--     usuario@dominio interno). Para recuperarse necesita un correo real, que
--     verifica por su cuenta y se guarda aparte.
--   · Los trabajadores NO tienen correo real: el admin de su restaurante les
--     restablece la contraseña desde Personal y ellos la cambian al entrar.
--
-- SEGURIDAD
--   · El correo de recuperación es un DATO, no una credencial: no da acceso por sí
--     solo. La verificación y el uso se hacen siempre desde una Edge Function con
--     service_role, nunca desde el navegador.
--   · El índice único evita que dos cuentas compartan correo de recuperación
--     (esquiva el "recupero la de otro"). Es parcial: NULL repetidos son válidos.
--
-- REQUISITOS: corre después del schema base (tabla `usuarios`).
-- =============================================================================

alter table public.usuarios
  add column if not exists correo_recuperacion text;

alter table public.usuarios
  add column if not exists correo_recuperacion_verificado boolean not null default false;

alter table public.usuarios
  add column if not exists debe_cambiar_password boolean not null default false;

create unique index if not exists usuarios_correo_recuperacion_unique
  on public.usuarios (correo_recuperacion)
  where correo_recuperacion is not null;


-- #############################################################################
-- # 6/19 · pin_autorizacion.sql
-- #############################################################################

-- -- Mesora · PIN de autorización + anulación de cobros.
--
-- PROBLEMA QUE RESUELVE
-- Con la anulación de ítems, un mesero podía quitar productos de una comanda
-- abierta sin que nadie se entere: la cuenta sale más baja y el restaurante
-- cobra de menos. Lo mismo, en mayor escala, con el cobro: una boleta ya emitida
-- es un documento contable y no se puede borrar desde la app.
--
-- La regla que se impone: las dos acciones que tocan dinero para menos
-- (anular un ítem y anular un cobro) exigen el PIN del restaurante cuando el
-- restaurante lo configuró. El PIN lo define el Admin y nadie más lo puede ver
-- ni cambiar.
--
-- POR QUÉ UNA TABLA PROPIA Y NO UNA COLUMNA EN `restaurantes`
-- El hash del PIN no puede vivir en una columna de `restaurantes`: cualquier
-- policy de lectura que abre esa tabla (mesero, cocina, cajero) empezaría a
-- devolver el hash a todo el mundo. En una tabla aparte se puede cerrar del todo:
-- `01_rls_completo.sql` la deja SIN policies, así que el hash no sale de la base
-- por ninguna vía de cliente, ni para el admin. El admin solo usa
-- `tiene_pin_autorizacion`, que devuelve un booleano.
--
-- POR QUÉ UN HASH Y NO EL PIN EN CLARO
-- El PIN es una contraseña corta. Guardarla en claro convertiría una fuga de la
-- tabla (un dump, un log, una policy mal escrita) en la exposición del PIN de
-- todos los restaurantes. Se guarda con `crypt` (bcrypt) de pgcrypto: el
-- servidor compara sin poder recuperar el valor.
--
-- POR QUÉ "SIN PIN CONFIGURADO" NO BLOQUEA NADA
-- Los restaurantes que ya usan Mesora no tienen PIN: si lo exigiéramos, el día
-- que se aplicó este cambio se les rompería el anular ítems sin avisar. El
-- bloqueo se activa cuando el Admin configura el PIN, y se documenta en la UI
-- ("si no hay PIN, cualquiera del restaurante puede anular").
--
-- REQUISITOS: corre después del schema base (restaurantes, usuarios) y de
-- 00_seguridad_rpcs.sql (todas las RPCs llaman a validar_acceso_restaurante).
-- Requiere la extensión pgcrypto, que provee `crypt`/`gen_salt`.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. Tabla del PIN
-- ---------------------------------------------------------------------------
create table if not exists public.restaurante_pins (
  restaurante_id uuid primary key references public.restaurantes (id) on delete cascade,
  -- Hash bcrypt. Nunca se devuelve al cliente: ni siquiera al Admin.
  pin_hash text not null,
  actualizado_at timestamptz not null default now(),
  actualizado_por uuid references public.usuarios (id)
);

comment on table public.restaurante_pins is
  'PIN de autorización del restaurante (hash bcrypt). Lo configura y lo rota el Admin; los demás roles no pueden leerlo.';

alter table public.restaurante_pins enable row level security;

-- Las policies NO están en este archivo: viven en `01_rls_completo.sql`
-- (sección 13), y ese archivo borra explícitamente las dos que estaban aquí
-- (`restaurante_pins_select_admin` y `restaurante_pins_write_admin`).
--
-- Por qué desaparecen las dos, y no solo se consumman:
--   * `restaurante_pins_write_admin` era un `for all` para el admin. La
--     escritura tiene que pasar por `configurar_pin_autorizacion`, que valida que
--     el PIN sea de 4 a 6 dígitos, genera el hash con `gen_salt` y anota quién
--     lo cambió. Con el `for all`, el admin podía escribir el `pin_hash` a mano
--     o borrar la fila por su cuenta, sin dejar rastro.
--   * `restaurante_pins_select_admin` tampoco hace falta: la UI solo necesita
--     saber SI hay PIN, y eso lo responde `tiene_pin_autorizacion`, que devuelve
--     un booleano. Con RLS habilitado y sin policies de lectura, el hash no sale
--     de la base por ninguna vía de cliente, ni siquiera para el admin.
-- (La lectura por RPC de la tabla, si algún día hiciera falta, se haría con una
-- función `security definer` que devuelva lo justo, como hace
-- `tiene_pin_autorizacion`.)

-- ---------------------------------------------------------------------------
-- 2. Validación del PIN (la pieza que reutilizan todas las RPCs sensibles)
-- ---------------------------------------------------------------------------
-- `void`: no falla si el restaurante no tiene PIN. Si tiene, compara el PIN
-- recibido contra el hash con `crypt` (bcrypt compara sin poder recuperar el
-- valor).
--
-- Esta RPC NO la puede ejecutar el cliente (ver sección 4). Es la pieza que
-- reutilizan por dentro las RPCs de anulación, que corren como SECURITY DEFINER.
-- Si quedara ejecutable por `authenticated` sería un oráculo de fuerza bruta
-- del PIN de OTROS restaurantes: `validar_pin_autorizacion` se puede llamar con
-- cualquier `p_restaurante_id` y la única diferencia entre acierto y fallo es
-- si hay excepción. Con el permiso cerrado, probar PINs solo es posible a través
-- de una acción real, que además valida rol y estado del restaurante.
--
-- No es un secreto que el restaurante tenga PIN: la UI tiene que poder preguntar
-- (`tiene_pin_autorizacion`, que sí es ejecutable) para saber si pide el dato
-- antes de intentar la acción.
create or replace function public.validar_pin_autorizacion(
  p_restaurante_id uuid,
  p_pin text
)
returns void
language plpgsql
security definer
-- `extensions` en el search_path porque `crypt` vive ahí (Supabase instala
-- pgcrypto en ese schema, no en `public`). Sin esta segunda entrada, el cuerpo
-- de la función no resuelve `crypt` y falla con "function crypt(text, text) does
-- not exist" en el momento de validar un PIN, no al crear la función.
set search_path = public, extensions
as $$
declare
  v_hash text;
begin
  -- Defensa en profundidad: aunque hoy solo la llaman RPCs que ya validan acceso
  -- y rol, así el helper no sirve de atajo si mañana se usa desde otro lado.
  perform public.validar_acceso_restaurante(p_restaurante_id);

  select rp.pin_hash into v_hash
    from public.restaurante_pins rp
   where rp.restaurante_id = p_restaurante_id;

  -- Sin PIN configurado: la acción pasa (ver la nota de cabecera).
  if v_hash is null then
    return;
  end if;

  if p_pin is null or crypt(p_pin, v_hash) <> v_hash then
    raise exception 'PIN de autorizacion incorrecto';
  end if;
end;
$$;

comment on function public.validar_pin_autorizacion(uuid, text) is
  'Exige el PIN del restaurante si hay uno configurado. No hace nada si el restaurante no tiene PIN. La llaman las RPCs que mueven dinero para menos (anular ítem, anular cobro).';

-- ---------------------------------------------------------------------------
-- 3. Configurar / quitar el PIN (solo Admin)
-- ---------------------------------------------------------------------------
-- 4 a 6 dígitos. Un PIN más corto es adivinable en una caja (y sin rate limit en
-- la UI, un PIN de 3 dígitos se cae en segundos); uno más largo es inpracticable
-- para escribirlo con una mano mientras se atiende.
create or replace function public.configurar_pin_autorizacion(
  p_restaurante_id uuid,
  p_pin text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.validar_acceso_restaurante(p_restaurante_id);

  if not exists (
    select 1 from public.usuarios
     where id = auth.uid()
       and restaurante_id = p_restaurante_id
       and rol = 'admin_restaurante'
       and coalesce(activo, true)
  ) then
    raise exception 'Solo el administrador del restaurante puede configurar el PIN';
  end if;

  if p_pin is null or p_pin !~ '^[0-9]{4,6}$' then
    raise exception 'El PIN debe tener entre 4 y 6 digitos';
  end if;

  insert into public.restaurante_pins (restaurante_id, pin_hash, actualizado_at, actualizado_por)
  values (p_restaurante_id, crypt(p_pin, gen_salt('bf')), now(), auth.uid())
  on conflict (restaurante_id) do update
     set pin_hash = excluded.pin_hash,
         actualizado_at = excluded.actualizado_at,
         actualizado_por = excluded.actualizado_por;
end;
$$;

create or replace function public.quitar_pin_autorizacion(p_restaurante_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.validar_acceso_restaurante(p_restaurante_id);

  if not exists (
    select 1 from public.usuarios
     where id = auth.uid()
       and restaurante_id = p_restaurante_id
       and rol = 'admin_restaurante'
       and coalesce(activo, true)
  ) then
    raise exception 'Solo el administrador del restaurante puede quitar el PIN';
  end if;

  delete from public.restaurante_pins where restaurante_id = p_restaurante_id;
end;
$$;

-- ¿Hay PIN? Lo consulta cualquier persona del restaurante (para saber si tiene
-- que pedirlo en la UI) pero devuelve solo un booleano: nunca el hash.
create or replace function public.tiene_pin_autorizacion(p_restaurante_id uuid)
returns boolean
language plpgsql
security definer
-- Ver la nota de `validar_pin_autorizacion`: `extensions` está para que
-- resuelvan `crypt` y `gen_salt`.
set search_path = public, extensions
as $$
declare
  v_tiene boolean;
begin
  perform public.validar_acceso_restaurante(p_restaurante_id);

  if not exists (
    select 1 from public.usuarios

     where id = auth.uid()
       and restaurante_id = p_restaurante_id
       and coalesce(activo, true)
  ) then
    raise exception 'Sin acceso a este restaurante';
  end if;

  select exists (
    select 1 from public.restaurante_pins rp where rp.restaurante_id = p_restaurante_id
  ) into v_tiene;

  return v_tiene;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Permisos
-- ---------------------------------------------------------------------------
-- NO se dan aquí: todos los `revoke`/`grant execute` de las funciones están en
-- la sección 16 de `01_rls_completo.sql` (que se aplica al final).
--
-- Se deja anotado lo importante, porque es la excepción a la regla de "todas las
-- RPC son ejecutables por `authenticated`":
--
-- `validar_pin_autorizacion` NO se le concede a nadie. La llaman por dentro las
-- RPCs de anulación, que son SECURITY DEFINER y por eso la pueden invocar sin
-- permiso. Concedérsela a `authenticated` la convertiría en el oráculo de fuerza
-- bruta descrito en la sección 2: se podría llamar con cualquier
-- `p_restaurante_id` y la única diferencia entre acierto y fallo sería la
-- excepción. La lista completa de quién puede ejecutar qué está en
-- `01_rls_completo.sql` §16, y la consulta que lo comprueba en §17.2.
--
-- Las tres de la UI (`configurar`, `quitar`, `tiene_pin_autorizacion`) sí son
-- ejecutables por `authenticated`: el rol y el acceso los valida cada una por
-- dentro.

-- ---------------------------------------------------------------------------
-- 5. Verificación manual (opcional, en el SQL editor)
-- ---------------------------------------------------------------------------
-- select tiene_pin_autorizacion('<rid>');
-- select * from public.restaurante_pins;
--   Con las policies de 01_rls_completo.sql esto devuelve 0 filas para el
--   cliente: el hash no se lee nunca desde el navegador, ni para el admin.


-- #############################################################################
-- # 7/19 · rpc_crear_pedido.sql
-- #############################################################################

-- -- Mesora · RPC: crear pedido (comanda) de forma atómica.
-- Inserta el pedido + sus items y marca la mesa como ocupada en una sola transacción.
-- Requiere que el usuario autenticado sea mesero o admin del restaurante.
--
-- El PRECIO y el NOMBRE se resuelven aquí adentro, nunca vienen del cliente.
-- El front solo manda qué producto pide y cuántas veces:
--   p_items = [{ "producto_id": "...", "cantidad": 2, "nota": "sin cebolla" }]
-- Si el cliente manda igual `nombre_producto` / `precio_unitario`, esta función
-- los IGNORA: si no, cualquiera podría pedir un pan de S/ 0.01.
--
-- `pedido_items.precio_unitario` queda congelado al momento de pedir, que es lo
-- que permite después cambiar el precio en el menú sin reescribir la historia.
--
-- REQUISITO: 00_seguridad_rpcs.sql debe estar aplicada ANTES (esta RPC llama a
-- validar_acceso_restaurante).

create or replace function public.crear_pedido(
  p_restaurante_id uuid,
  p_mesa_id uuid,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pedido_id uuid;
  v_item jsonb;
  v_producto_id uuid;
  v_cantidad int;
  v_producto public.productos%rowtype;
  v_precio numeric;
  v_mesero_id uuid;
begin
  -- Control de acceso en el servidor (suscripción + usuario activo). Va primero:
  -- sin esto, llamar a esta RPC por fuera de la app esquivaría el bloqueo que
  -- solo existe en la UI. Ver 00_seguridad_rpcs.sql.
  perform public.validar_acceso_restaurante(p_restaurante_id);

  -- El usuario debe pertenecer al restaurante con rol mesero o admin
  select id into v_mesero_id
    from public.usuarios
   where id = auth.uid()
     and restaurante_id = p_restaurante_id
     and rol in ('mesero', 'admin_restaurante');

  if v_mesero_id is null then
    raise exception 'Sin permiso para crear pedidos en este restaurante';
  end if;

  -- La mesa debe pertenecer al restaurante
  if not exists (
    select 1 from public.mesas
     where id = p_mesa_id and restaurante_id = p_restaurante_id
  ) then
    raise exception 'La mesa no pertenece al restaurante';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'El pedido no tiene ítems';
  end if;

  insert into public.pedidos (restaurante_id, mesa_id, mesero_id, estado)
  values (p_restaurante_id, p_mesa_id, v_mesero_id, 'pendiente')
  returning id into v_pedido_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    -- Qué producto y cuánto (esto sí lo decide el mesero).
    v_producto_id := nullif(v_item->>'producto_id', '')::uuid;
    v_cantidad := coalesce((v_item->>'cantidad')::int, 1);

    if v_producto_id is null then
      raise exception 'Ítem sin producto_id';
    end if;

    if v_cantidad < 1 or v_cantidad > 99 then
      raise exception 'La cantidad debe ser un número entre 1 y 99';
    end if;

    -- Se bloquea la fila del producto para que el precio no cambie a mitad de
    -- la comanda (misma promesa que "el precio queda congelado").
    select * into v_producto
      from public.productos
     where id = v_producto_id
       and restaurante_id = p_restaurante_id
       for update;

    if v_producto.id is null then
      raise exception 'El producto no existe en este restaurante';
    end if;

    if not v_producto.disponible then
      raise exception 'El producto % no está disponible', v_producto.nombre;
    end if;

    -- A cuánto: aquí se decide, no en el navegador.
    v_precio := case
      when v_producto.es_promocion and v_producto.precio_promocion is not null
        then v_producto.precio_promocion
      else v_producto.precio
    end;

    if v_precio is null or v_precio < 0 then
      raise exception 'El producto % no tiene precio válido', v_producto.nombre;
    end if;

    insert into public.pedido_items (pedido_id, producto_id, nombre_producto, cantidad, precio_unitario, nota)
    values (
      v_pedido_id,
      v_producto.id,
      v_producto.nombre,
      v_cantidad,
      v_precio,
      nullif(btrim(coalesce(v_item->>'nota', '')), '')
    );
  end loop;

  update public.mesas set estado = 'ocupada' where id = p_mesa_id;

  return v_pedido_id;
end;
$$;


-- #############################################################################
-- # 8/19 · rpc_cerrar_cuenta.sql
-- #############################################################################

-- -- Mesora · RPC: cerrar cuenta y registrar el pago en una sola transacción.
--
-- Inserta la cuenta (pagada), sus relación cuenta_pedidos, el detalle de los
-- pagos (cuenta_pagos), marca los pedidos como entregados y libera la mesa.
--
-- PAGO DIVIDIDO / VUELTO / PROPINA
--   p_pagos es un jsonb con una parte por método:
--     [{ "metodo_pago": "efectivo", "monto": 50, "referencia": null },
--      { "metodo_pago": "yape_plin", "monto": 30, "referencia": "OP-123" }]
--
--   * `monto: null` (o 0) significa "el cliente entregó exactamente lo que le
--     falta": la función lo completa con el resto del total a pagar. Así el
--     importe cobrado depende de los ítems, no de lo que el mesero tecleó en el
--     navegador, y "33 en efectivo + el resto en Yape" no cobra 33 + el total.
--   * La suma de las partes puede ser MAYOR que el total a pagar: ese excedente
--     es el vuelto. Solo puede salir del efectivo (nunca de una tarjeta), por
--     eso la función exige que la parte no-efectivo no supere el total.
--   * `p_propina` va APARTE de `cuentas.total`: las ventas no cuentan propina
--     como venta de comida (el dashboard y el reporte siguen marg correctos).
--
-- Whitelist de métodos: 'efectivo' | 'tarjeta' | 'yape_plin' | 'otro'
-- (ajusta el valor al check constraint de tu tabla cuentas si difiere)
--
-- CONCURRENCIA: el cobro se serializa con `for update` sobre la mesa, tomado
-- antes del chequeo "ya fue cobrado", para que dos terminales no generen dos
-- cuentas del mismo total. Ver el comentario en el cuerpo de la función.
--
-- REQUISITO: 00_seguridad_rpcs.sql debe estar aplicada ANTES (esta RPC llama a
-- validar_acceso_restaurante).

-- ---------------------------------------------------------------------------
-- 0. Detalle de pagos (una fila por parte; siempre ≥ 1 por cuenta pagada)
-- ---------------------------------------------------------------------------
create table if not exists public.cuenta_pagos (
  id uuid primary key default gen_random_uuid(),
  cuenta_id uuid not null references public.cuentas (id) on delete cascade,
  restaurante_id uuid not null references public.restaurantes (id) on delete cascade,
  metodo_pago text not null check (metodo_pago in ('efectivo', 'tarjeta', 'yape_plin', 'otro')),
  -- Lo entregado por el cliente con este método (incluye lo que es vuelto).
  monto numeric(12, 2) not null check (monto > 0),
  referencia text,
  created_at timestamptz not null default now()
);

comment on table public.cuenta_pagos is
  'Partes de un pago de cuenta (pago dividido). La suma de montos = total + propina + vuelto.';

-- Consulta de arqueo: "cuánto efectivo entró hoy, por cuenta abierta".
create index if not exists cuenta_pagos_por_restaurante
  on public.cuenta_pagos (restaurante_id, created_at desc);
create index if not exists cuenta_pagos_por_cuenta on public.cuenta_pagos (cuenta_id);

-- Propina y vuelto en la cuenta (0 si no hubo).
alter table public.cuentas add column if not exists propina numeric(12, 2) not null default 0 check (propina >= 0);
alter table public.cuentas add column if not exists vuelto numeric(12, 2) not null default 0 check (vuelto >= 0);

-- ---------------------------------------------------------------------------
-- 1. La RPC
-- ---------------------------------------------------------------------------
create or replace function public.cerrar_cuenta(
  p_restaurante_id uuid,
  p_mesa_id uuid,
  p_pedidos uuid[],
  p_pagos jsonb,
  p_propina numeric default 0
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total numeric := 0;
  v_cuenta_id uuid;
  v_pedido_id uuid;
  v_subtotal numeric;
  v_a_pagar numeric;
  v_recibido numeric := 0;
  v_efectivo numeric := 0;
  v_no_efectivo numeric := 0;
  v_vuelto numeric;
  v_teclado numeric;
  v_parte jsonb;
  v_metodo text;
  v_monto numeric;
  v_correlativo integer;
  v_numero text;
begin
  -- Control de acceso en el servidor (suscripción + usuario activo). Ver
  -- 00_seguridad_rpcs.sql: sin esto, `rpc('cerrar_cuenta')` desde la consola
  -- cobraría aunque el restaurante esté vencido o el mesero esté desactivado.
  perform public.validar_acceso_restaurante(p_restaurante_id);

  -- SERIALIZACIÓN DEL COBRO.
  -- El chequeo "¿ya está pagado?" y el marcado de los pedidos como 'entregado'
  -- tienen que ser un solo paso atómico, o dos cajas cobrando la misma mesa al
  -- mismo tiempo crean DOS cuentas con el mismo total (el cliente paga una vez,
  -- el restaurante acredita dos).
  --
  -- El candado es la FILA DE LA MESA, no los pedidos, y se toma aquí a
  -- propósito: antes del chequeo de "ya cobrado" y antes de mirar los pedidos.
  -- Cualquier otra forma de cerrar esta mesa (otra terminal, otro dispositivo)
  -- tiene que pasar por el mismo `for update`, así que el segundo cobra espera
  -- en la fila y, cuando despierta, ve los pedidos ya en 'entregado' y sale por
  -- la rama de "ya fue cobrado" en lugar de duplicar el cobro.
  --
  -- Se bloquea la mesa y no los pedidos porque la mesa es el recurso que se
  -- serializa: siempre existe (es el ancla de la cuenta), mientras que el set
  -- de pedidos a cobrar varía según qué comanda se haya enviado y bloquearlos
  -- exigiría ordenar los ids para no provocar deadlocks entre dos cierres.
  -- La pertenencia de los pedidos a esta mesa se revalida más abajo, ya con el
  -- candado tomado.
  perform 1 from public.mesas
   where id = p_mesa_id and restaurante_id = p_restaurante_id
     for update;

  if not found then
    raise exception 'La mesa no pertenece al restaurante';
  end if;

  -- Rol mesero o admin: solo el personal del restaurante cierra la cuenta.
  if not exists (
    select 1 from public.usuarios
     where id = auth.uid()
       and restaurante_id = p_restaurante_id
       and rol in ('mesero', 'admin_restaurante')
       and coalesce(activo, true)
  ) then
    raise exception 'Sin permiso para cerrar cuentas en este restaurante';
  end if;

  -- La pertenencia de la mesa ya quedó comprobada arriba, junto con el candado.

  if p_propina is null or p_propina < 0 then
    raise exception 'Propina invalida: %', p_propina;
  end if;

  if p_pagos is null or jsonb_array_length(p_pagos) = 0 then
    raise exception 'Agrega al menos un metodo de pago';
  end if;

  if p_pedidos is null or array_length(p_pedidos, 1) is null then
    raise exception 'No hay pedidos para cerrar';
  end if;

  -- Un pedido ya cobrado en otra cuenta pagada no se puede volver a cobrar.
  if exists (
    select 1
      from public.cuenta_pedidos cp
      join public.cuentas c on c.id = cp.cuenta_id
     where cp.pedido_id = any(p_pedidos)
       and c.estado = 'pagada'
  ) then
    raise exception 'Alguno de los pedidos ya fue cobrado en otra cuenta';
  end if;

  -- Total de los pedidos seleccionados (pertenecientes a mesa + restaurante).
  -- Los ítems anulados por el mesero no se cobran (ver migracion_items_anulables.sql).
  select coalesce(sum(pi.cantidad * pi.precio_unitario), 0)
    into v_total
    from public.pedido_items pi
    join public.pedidos pd on pd.id = pi.pedido_id
   where pd.restaurante_id = p_restaurante_id
     and pd.mesa_id = p_mesa_id
     and pd.id = any(p_pedidos)
     and pd.estado <> 'anulado'
     and pi.anulado = false;

  -- Una comanda sin ítems vigentes no se cobra: evita cuentas en cero.
  if v_total <= 0 then
    raise exception 'No hay pedidos por cobrar en esta mesa';
  end if;

  v_a_pagar := round(v_total + p_propina, 2);

  -- Validar los montos explícitos antes de completar los "exactos".
  for v_parte in select * from jsonb_array_elements(p_pagos)
  loop
    v_metodo := v_parte ->> 'metodo_pago';
    -- Misma whitelist que METODOS_PAGO en src/types/database.ts
    if v_metodo is null or v_metodo not in ('efectivo', 'tarjeta', 'yape_plin', 'otro') then
      raise exception 'Metodo de pago no valido: %', v_metodo;
    end if;
    v_monto := coalesce((v_parte ->> 'monto')::numeric, 0);
    if v_monto < 0 then
      raise exception 'Monto de pago invalido: %', v_monto;
    end if;
  end loop;

  -- Solo una parte puede quedar "exacta", y tiene que quedar algo por repartir.
  if (
    select count(*) from jsonb_array_elements(p_pagos) as parte
     where coalesce((parte ->> 'monto')::numeric, 0) <= 0
  ) > 1 then
    raise exception 'Solo una parte puede quedar exacta. Reparte el total entre los metodos';
  end if;

  -- El "exacto" se completa con el resto que falta (nunca con el total entero:
  -- si no, un pago dividido cobraría el doble).
  select coalesce(sum(coalesce((parte ->> 'monto')::numeric, 0)), 0)
    into v_teclado
    from jsonb_array_elements(p_pagos) as parte
   where coalesce((parte ->> 'monto')::numeric, 0) > 0;

  -- Sumar cada parte con su importe final.
  for v_parte in select * from jsonb_array_elements(p_pagos)
  loop
    v_metodo := v_parte ->> 'metodo_pago';
    v_monto := coalesce((v_parte ->> 'monto')::numeric, 0);
    if v_monto <= 0 then
      v_monto := round(v_a_pagar - v_teclado, 2);
      if v_monto <= 0 then
        raise exception 'Los montos ya cubren el total. Quita esa parte o ajustala';
      end if;
    end if;

    v_recibido := v_recibido + v_monto;
    if v_metodo = 'efectivo' then
      v_efectivo := v_efectivo + v_monto;
    else
      v_no_efectivo := v_no_efectivo + v_monto;
    end if;
  end loop;

  if v_recibido < v_a_pagar - 0.01 then
    raise exception 'El monto recibido no cubre el total de la cuenta';
  end if;

  -- El vuelto solo sale del efectivo: si lo no-efectivo supera lo que se debe,
  -- estaríamos "devolviendo" contra una tarjeta.
  if v_no_efectivo > v_a_pagar + 0.01 then
    raise exception 'El pago con tarjeta o Yape no puede superar el total: el vuelto solo se entrega en efectivo';
  end if;

  v_vuelto := round(v_recibido - v_a_pagar, 2);

  -- Correlativo de boleta del restaurante. El upsert se lleva la fila en
  -- exclusiva, así que dos cierres simultáneos no obtienen el mismo número.
  insert into public.correlativos (restaurante_id, tipo, ultimo)
  values (p_restaurante_id, 'boleta', 1)
  on conflict (restaurante_id, tipo)
  do update set ultimo = public.correlativos.ultimo + 1
  returning ultimo into v_correlativo;

  v_numero := 'B001-' || lpad(v_correlativo::text, 6, '0');

  insert into public.cuentas (
    restaurante_id, mesa_id, total, metodo_pago, estado, pagado_at, propina, vuelto, numero
  )
  values (
    p_restaurante_id, p_mesa_id, v_total,
    (p_pagos -> 0 ->> 'metodo_pago'),
    'pagada', now(), round(p_propina, 2), v_vuelto, v_numero
  )
  returning id into v_cuenta_id;

  -- Detalle del pago: una fila por parte, con el importe real (nunca 0).
  -- La parte "exacta" guarda el resto que faltaba, el mismo importe que se usó
  -- para calcular el vuelto: si guardara el total entero, el arqueo de caja
  -- sumaría de más.
  insert into public.cuenta_pagos (cuenta_id, restaurante_id, metodo_pago, monto, referencia)
  select v_cuenta_id,
         p_restaurante_id,
         (parte ->> 'metodo_pago'),
         case
           when coalesce((parte ->> 'monto')::numeric, 0) <= 0
             then round(v_a_pagar - v_teclado, 2)
           else (parte ->> 'monto')::numeric
         end,
         nullif(btrim(coalesce(parte ->> 'referencia', '')), '')
    from jsonb_array_elements(p_pagos) as parte;

  foreach v_pedido_id in array p_pedidos
  loop
    -- Subtotal de SU comanda, sin los ítems anulados.
    select coalesce(sum(cantidad * precio_unitario), 0)
      into v_subtotal
      from public.pedido_items
     where pedido_id = v_pedido_id
       and anulado = false;

    insert into public.cuenta_pedidos (cuenta_id, pedido_id, subtotal)
    values (v_cuenta_id, v_pedido_id, v_subtotal);

    update public.pedidos
       set estado = 'entregado', updated_at = now()
     where id = v_pedido_id
       and restaurante_id = p_restaurante_id
       and estado <> 'anulado';
  end loop;

  update public.mesas set estado = 'libre' where id = p_mesa_id;

  return v_cuenta_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Permisos
-- ---------------------------------------------------------------------------
-- NO se da `grant execute` aquí: los permisos de todas las funciones viven en la
-- sección 16 de `01_rls_completo.sql`, que se aplica al final.
--
-- El motivo de que estén juntos no es estética. `create or replace function` no
-- cambia los privilegios de una función existente, y Postgres le da EXECUTE a
-- PUBLIC (o sea, a `anon` y a `authenticated`) por defecto. Si cada archivo
-- revocara por su cuenta, que la RPC quedara llamable desde la anon key
-- dependía del orden en que se aplicaran los scripts.


-- #############################################################################
-- # 9/19 · rpc_anular_cuenta.sql
-- #############################################################################

-- -- Mesora · Anulación de cobros (void de una boleta ya emitida).
--
-- PROBLEMA QUE RESUELVE
-- Una boleta emitida es un documento: no se puede borrar. Pero el mundo real
-- tiene errores de cobro (teclaron 80 en vez de 30), meals que vuelven, o
-- comandas que el mesero tomó mal. Antes no había salida: el restaurante
-- terminaba con la venta mal registrada o el cliente se iba sin pagar.
--
-- La regla que se impone
-- Anular un cobro cambia el dinero: la cuenta sale de las ventas del mes y el
-- efectivo devuelto sale de la gaveta. Por eso
--   * solo lo puede hacer el admin o el cajero (nunca el mesero),
--   * y si el restaurante tiene PIN de autorización, lo exige (también al
--     admin: el PIN es la constancia de que alguien autorizó la anulación, no
--     de que el propio admin la hizo; quién la ejecutó y cuándo queda en
--     `anulada_por` y `anulada_at`).
--
-- POR QUÉ LA CUENTA PASA A 'anulada' Y NO SE BORRA
-- El histórico de ventas tiene que seguir mostrando lo que pasó: una cuenta
-- cobrada y anulada el mismo día es información (el motivo dice por qué). Si se
-- borrara, el arqueo de caja quedaría sin explicación y el reporte sin rastro.
-- `computeMetricas` filtra por `estado = 'pagada'`, así que una cuenta anulada
-- desaparece sola de las ventas sin tocar el código de los reportes.
--
-- EL EFECTO EN LA GAVETA
-- El dinero del reembolso SALE de la gaveta: el arqueo del turno tiene que
-- descontarlo o el cajero que anuló una boleta vería un "faltante" que él no
-- cometió. Se registra `monto_reembolsado` (total + propina, todos los
-- métodos) y el arqueo descuenta de la gaveta solo la parte en efectivo, que es
-- la única que puede salir de ella (ver `ventasEfectivoDelTurno` en
-- src/lib/caja.ts).
--
-- REQUISITOS: corre después de rpc_cerrar_cuenta.sql (existen `cuentas` y
-- `cuenta_pagos`), de pin_autorizacion.sql (existe validar_pin_autorizacion) y
-- de 00_seguridad_rpcs.sql.

-- ---------------------------------------------------------------------------
-- 1. Columnas de la anulación
-- ---------------------------------------------------------------------------
-- 'anulada' entra al CHECK de `cuentas.estado`: el CHECK viejo seguiría
-- rechazando el valor nuevo, así que hay que soltar ese constraint (si tu
-- schema lo nombró de otra forma, ajústalo) y poner el que incluye las tres
-- estados. Es idempotente: si el CHECK nuevo ya existe, no se vuelve a crear.
alter table public.cuentas
  add column if not exists anulada_at timestamptz,
  add column if not exists anulada_por uuid references public.usuarios (id),
  add column if not exists motivo_anulacion text,
  add column if not exists monto_reembolsado numeric(12, 2);

comment on column public.cuentas.anulada_at is
  'Momento en que se anuló el cobro (no se borra: queda el rastro).';
comment on column public.cuentas.motivo_anulacion is
  'Por qué se anuló la boleta. Es parte del registro contable, no opcional.';
comment on column public.cuentas.monto_reembolsado is
  'Total devuelto al cliente (suma de todos los métodos). El arqueo de caja solo descuenta la parte en efectivo.';

alter table public.cuentas drop constraint if exists cuentas_estado_check;
-- Mismo criterio que en migracion_items_anulables.sql: si hay cuentas guardadas
-- con un estado fuera de la lista, el CHECK no se crea y se avisa, en vez de
-- abortar el script entero con un 22P02.
do $$
begin
  if exists (
    select 1 from public.cuentas where estado not in ('pendiente', 'pagada', 'anulada')
  ) then
    raise warning 'Mesora: public.cuentas.estado tiene valores fuera de la lista; NO se creó cuentas_estado_check. Corrige esas cuentas y vuelve a ejecutar.';
  else
    alter table public.cuentas
      add constraint cuentas_estado_check check (estado in ('pendiente', 'pagada', 'anulada'));
  end if;
end;
$$;

-- Una cuenta anulada es una cuenta que estaba pagada y se anuló: tiene fecha,
-- motivo y monto devuelto. Las cuentas normales no pueden tener nada de eso.
-- Mismo criterio blando de arriba: si una cuenta vieja ya tenía algo de esto
-- guardado a medias, se avisa y se sigue, no se corta la instalación.
alter table public.cuentas drop constraint if exists cuentas_anulacion_coherente;
do $$
begin
  alter table public.cuentas
    add constraint cuentas_anulacion_coherente check (
      (estado = 'anulada' and anulada_at is not null and motivo_anulacion is not null)
      or
      (estado <> 'anulada' and anulada_at is null and anulada_por is null and motivo_anulacion is null)
    );
exception when others then
  raise warning 'Mesora: no se pudo crear cuentas_anulacion_coherente: %. Revisa las cuentas con anulada_at/motivo_anulacion y vuelve a ejecutar.', sqlerrm;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. RPC: anular un cobro
-- ---------------------------------------------------------------------------
create or replace function public.anular_cuenta(
  p_restaurante_id uuid,
  p_cuenta_id uuid,
  p_motivo text,
  p_pin text default null
)
returns public.cuentas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cuenta public.cuentas%rowtype;
  v_reembolso numeric := 0;
  v_motivo text;
begin
  perform public.validar_acceso_restaurante(p_restaurante_id);

  -- Admin o cajero: es una operación de caja. El mesero no puede tocar una
  -- boleta ya emitida ni aunque conozca el PIN (para eso está el PIN: para que
  -- el mesero le pida el número a quien manda, no para que lo haga él).
  if not exists (
    select 1 from public.usuarios
     where id = auth.uid()
       and restaurante_id = p_restaurante_id
       and rol in ('admin_restaurante', 'cajero')
       and coalesce(activo, true)
  ) then
    raise exception 'Sin permiso para anular cobros en este restaurante';
  end if;

  v_motivo := nullif(btrim(coalesce(p_motivo, '')), '');

  if v_motivo is null or length(v_motivo) < 4 then
    raise exception 'El motivo de la anulacion es obligatorio';
  end if;

  if length(v_motivo) > 200 then
    raise exception 'El motivo de la anulacion es demasiado largo';
  end if;

  -- El PIN se pide DESPUÉS del permiso de rol: primero "no puedes", después
  -- "falta el PIN". Al revés, un mesero podría usar el mensaje de error del
  -- PIN para confirmar que el restaurante tiene PIN configurado.
  perform public.validar_pin_autorizacion(p_restaurante_id, p_pin);

  -- for update: dos terminals anulando la misma boleta a la vez. El segundo
  -- espera, despierta con estado 'anulada' y sale por la rama de "ya fue
  -- anulada" en vez de reembolsar dos veces.
  select * into v_cuenta
    from public.cuentas
   where id = p_cuenta_id and restaurante_id = p_restaurante_id
     for update;

  if v_cuenta.id is null then
    raise exception 'La cuenta no pertenece al restaurante';
  end if;

  if v_cuenta.estado = 'anulada' then
    raise exception 'Esta boleta ya fue anulada';
  end if;

  if v_cuenta.estado <> 'pagada' then
    raise exception 'Solo se puede anular una cuenta cobrada';
  end if;

  -- Cuánto se devuelve al cliente: el total de la boleta MÁS la propina, que
  -- también se cobró y también hay que devolver.
  --
  -- No hace falta sumar `cuenta_pagos`: por cómo las arma `cerrar_cuenta`, la
  -- suma de las partes es exactamente `total + propina + vuelto`, así que
  -- `total + propina` ya es el reembolso completo, y sale bien en las cuentas
  -- viejas (que no tienen detalle de pagos) y en las pagadas con tarjeta, donde
  -- sumar las partes habría dado un número que no es el devuelto.
  --
  -- Lo que SÍ hay que mirar en `cuenta_pagos` es la parte en efectivo, porque es
  -- la única que sale de la gaveta: de eso se ocupa el arqueo
  -- (`ventasEfectivoDelTurno` en src/lib/caja.ts y el bloque equivalente de
  -- supabase/caja_turnos.sql), no esta función.
  v_reembolso := round(v_cuenta.total + coalesce(v_cuenta.propina, 0), 2);

  update public.cuentas
     set estado = 'anulada',
         anulada_at = now(),
         anulada_por = auth.uid(),
         motivo_anulacion = v_motivo,
         monto_reembolsado = v_reembolso
   where id = v_cuenta.id
   returning * into v_cuenta;

  return v_cuenta;
end;
$$;

comment on function public.anular_cuenta(uuid, uuid, text, text) is
  'Anula una boleta ya cobrada (admin o cajero, con PIN si el restaurante lo configuró). La cuenta queda como registro y sale de las ventas; el efectivo devuelto se descuenta en el arqueo de caja.';

-- ---------------------------------------------------------------------------
-- 3. Permisos
-- ---------------------------------------------------------------------------
-- NO se dan aquí: los `revoke`/`grant execute` de todas las funciones están en
-- la sección 16 de `01_rls_completo.sql`, que se aplica al final (y que ya
-- incluye esta: `anular_cuenta(uuid, uuid, text, text)`).

-- ---------------------------------------------------------------------------
-- 4. Verificación manual (opcional, en el SQL editor)
-- ---------------------------------------------------------------------------
-- select estado, total, vuelto, monto_reembolsado, motivo_anulacion
--   from public.cuentas where id = '<cuenta_id>';
-- La venta del mes tiene que bajar en `total` (y en `monto_reembolsado` queda
-- lo que salió de la gaveta).


-- #############################################################################
-- # 10/19 · caja_turnos.sql
-- #############################################################################

-- -- Mesora · Caja por turnos: tabla `caja_turnos` + RPC de apertura y cierre.
--
-- Modelo: un restaurante tiene como máximo UN turno abierto (índice único
-- parcial). Al abrir se declara el efectivo inicial; al cerrar se declara el
-- efectivo contado y la función CALCULA el esperado y la diferencia, congelando
-- los tres números.
--
-- Por qué se congela y no se recalcula al vuelo: si mañana se corrige una
-- cuenta vieja, el arqueo de ayer tiene que seguir diciendo lo que se contó
-- ayer. Un dashboard que recalcula el pasado miente.
--
-- Por qué el esperado se calcula en SQL y no en el navegador: el dinero que
-- "debería" haber en la gaveta es un dato de caja, no de interfaz. Si lo
-- calculara el front, dos dispositivos podrían mostrar arqueos distintos.
--
-- REQUISITOS: este script no es standalone. Corre después del schema base
-- (restaurantes, usuarios, cuentas) y asume que:
--   * cuentas.metodo_pago usa la misma whitelist que src/types/database.ts
--   * cuentas.estado = 'pagada' y cuentas.pagado_at existe; las cuentas
--     anuladas se fechan por cuentas.anulada_at (ver rpc_anular_cuenta.sql,
--     que debe estar aplicada antes que este archivo si se anulan cobros)
--   * usuarios.auth.uid() = usuarios.id (ver más abajo: si tu tabla usuarios
--     guarda el id de Auth en otra columna, adapta el p_usuario_id).
--   * 00_seguridad_rpcs.sql ya está aplicada (abrir_turno_caja y
--     cerrar_turno_caja llaman a validar_acceso_restaurante).

-- ---------------------------------------------------------------------------
-- 1. Tabla
-- ---------------------------------------------------------------------------
create table if not exists public.caja_turnos (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes (id) on delete cascade,
  usuario_apertura_id uuid not null references public.usuarios (id),
  monto_inicial numeric(12, 2) not null check (monto_inicial >= 0),
  estado text not null default 'abierto' check (estado in ('abierto', 'cerrado')),
  fecha_apertura timestamptz not null default now(),
  fecha_cierre timestamptz,
  usuario_cierre_id uuid references public.usuarios (id),
  monto_declarado numeric(12, 2) check (monto_declarado >= 0),
  monto_esperado numeric(12, 2),
  diferencia numeric(12, 2),
  observaciones text,
  created_at timestamptz not null default now(),

  -- Un cierre tiene TODOS los datos del arqueo; un turno abierto no tiene ninguno.
  constraint caja_turno_cierre_completo check (
    (estado = 'abierto' and fecha_cierre is null
      and usuario_cierre_id is null
      and monto_declarado is null
      and monto_esperado is null
      and diferencia is null)
    or
    (estado = 'cerrado' and fecha_cierre is not null
      and usuario_cierre_id is not null
      and monto_declarado is not null
      and monto_esperado is not null
      and diferencia is not null)
  ),

  -- La diferencia tiene que ser exactamente declarado − esperado (tolerancia de
  -- 1 centavo por redondeo). Evita que un UPDATE futuro deje el arqueado
  -- inconsistente con sus propias cifras.
  constraint caja_turno_diferencia_coherente check (
    diferencia is null or abs(diferencia - (monto_declarado - monto_esperado)) < 0.01
  )
);

comment on table public.caja_turnos is
  'Turnos de caja. Un turno abierto por restaurante (índice único parcial). '
  'monto_esperado/diferencia se congelan al cerrar.';

-- Un solo turno abierto por restaurante. Es la garantía real: dos cajas no se
-- pueden abrir a la vez ni por dos terminals ni por una carrera de clics.
create unique index if not exists caja_turnos_un_abierto_por_restaurante
  on public.caja_turnos (restaurante_id)
  where estado = 'abierto';

-- Historial: del turno más reciente al más antiguo.
create index if not exists caja_turnos_por_restaurante
  on public.caja_turnos (restaurante_id, fecha_apertura desc);

-- ---------------------------------------------------------------------------
-- 2. RLS
-- ---------------------------------------------------------------------------
-- NO está aquí. Todas las policies viven en `01_rls_completo.sql` (sección 12,
-- `caja_turnos`), que además borra explícitamente las dos que estaban en esta
-- sección: `caja_turnos_select` y `caja_turnos_admin_write`.
--
-- Por qué se mueven (y por qué la de escritura desaparece):
--   * `caja_turnos_admin_write` era un `for all` para admin y cajero. Eso
--     habilitaba `insert`, `update` y `delete` DIRECTOS sobre el arqueo desde el
--     navegador, y con ellos se podía escribir a mano `monto_esperado` y
--     `diferencia` —los dos números que dicen si faltó plata— sin pasar por
--     `cerrar_turno_caja`, que es quien los calcula en SQL y los congela al
--     cerrar (y quien toma el `for update` para que dos terminales no cierren el
--     mismo turno). Ahora la tabla es de solo lectura y abrir/cerrar pasan
--     únicamente por las RPC.
--   * la de lectura no filtraba por rol: cualquier usuario del restaurante
--     veía los turnos, y no exigía suscripción ni usuario activo.

-- ---------------------------------------------------------------------------
-- 3. Apertura
-- ---------------------------------------------------------------------------
create or replace function public.abrir_turno_caja(
  p_restaurante_id uuid,
  p_usuario_id uuid,
  p_monto_inicial numeric
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_turno_id uuid;
begin
  -- Control de acceso en el servidor (suscripción + usuario activo). Ver
  -- 00_seguridad_rpcs.sql: sin esto, abrir caja por RPC esquivaría el bloqueo
  -- que hoy solo vive en la UI.
  perform public.validar_acceso_restaurante(p_restaurante_id);

  if not exists (
    select 1 from public.usuarios
     where id = auth.uid()
       and restaurante_id = p_restaurante_id
       and rol in ('admin_restaurante', 'cajero')
       and coalesce(activo, true)
  ) then
    raise exception 'Sin permiso para abrir la caja en este restaurante';
  end if;

  -- El id viene del servidor (auth.uid()), no del cliente: si el front mandara
  -- otro usuario, el arqueo atribuiría la apertura a alguien que no la hizo.
  if p_usuario_id is distinct from auth.uid() then
    raise exception 'El turno se registra con el usuario de la sesion';
  end if;

  if p_monto_inicial is null or p_monto_inicial < 0 then
    raise exception 'Monto inicial invalido: %', p_monto_inicial;
  end if;

  if exists (
    select 1 from public.caja_turnos
     where restaurante_id = p_restaurante_id and estado = 'abierto'
  ) then
    raise exception 'Ya hay un turno de caja abierto. Cierralo antes de abrir otro.';
  end if;

  insert into public.caja_turnos (restaurante_id, usuario_apertura_id, monto_inicial)
  values (p_restaurante_id, p_usuario_id, round(p_monto_inicial, 2))
  returning id into v_turno_id;

  return v_turno_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Cierre con arqueo
-- ---------------------------------------------------------------------------
create or replace function public.cerrar_turno_caja(
  p_restaurante_id uuid,
  p_usuario_id uuid,
  p_monto_declarado numeric,
  p_observaciones text default null
)
returns public.caja_turnos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_turno public.caja_turnos;
  v_ventas numeric := 0;
  v_esperado numeric;
  v_diferencia numeric;
begin
  -- Control de acceso en el servidor (suscripción + usuario activo). Ver
  -- 00_seguridad_rpcs.sql.
  perform public.validar_acceso_restaurante(p_restaurante_id);

  if not exists (
    select 1 from public.usuarios
     where id = auth.uid()
       and restaurante_id = p_restaurante_id
       and rol in ('admin_restaurante', 'cajero')
       and coalesce(activo, true)
  ) then
    raise exception 'Sin permiso para cerrar la caja en este restaurante';
  end if;

  if p_usuario_id is distinct from auth.uid() then
    raise exception 'El cierre se registra con el usuario de la sesion';
  end if;

  if p_monto_declarado is null or p_monto_declarado < 0 then
    raise exception 'Monto declarado invalido: %', p_monto_declarado;
  end if;

  -- for update: si dos terminals cierran a la vez, el segundo espera y ve el
  -- turno ya cerrado en vez de overwritear el arqueo del primero.
  select * into v_turno
    from public.caja_turnos
   where restaurante_id = p_restaurante_id and estado = 'abierto'
   for update;

  if v_turno.id is null then
    raise exception 'No hay ningun turno de caja abierto';
  end if;

  -- Efectivo cobrado DENTRO de la ventana del turno ([apertura, cierre)), menos
  -- el efectivo devuelto por boletas anuladas DENTRO de la misma ventana.
  --
  -- Con pago dividido hay que bajar a `cuenta_pagos`: la cuenta guarda un solo
  -- método principal, así que `cuentas.metodo_pago = 'efectivo'` marcaría como
  -- efectivo una cuenta pagada con tarjeta y dejaría afuera el efectivo real.
  -- El vuelto se descuenta porque salió de la gaveta: lo que queda es la venta.
  --
  -- `left join ... lateral` mantiene el fallback para cuentas viejas que no
  -- tienen detalle (sumar su total si su método principal es efectivo).
  --
  -- Una cuenta ANULADA aporta LAS DOS cosas, cada una en su fecha: el efectivo
  -- que entró (pagado_at) y el que volvió a salir (anulada_at). No es "cobrar
  -- menos": si se cobró y se anuló en el MISMO turno, ese turno tiene que ver
  -- +25 y -25, porque la gaveta estuvo con la plata y después la devolvió. Si
  -- se cobró en un turno y se anuló en el siguiente, cada arqueo cuenta su
  -- parte: el dinero entró en la primera gaveta y salió de la segunda, y el
  -- segundo turno no puede mostrar una venta que no tuvo.
  with efectivo as (
    select c.estado, c.pagado_at, c.anulada_at,
           case
             when p.monto is null then case when c.metodo_pago = 'efectivo' then c.total else 0 end
             else greatest(coalesce(p.monto, 0) - coalesce(c.vuelto, 0), 0)
           end as monto
      from public.cuentas c
      left join lateral (
        select sum(cp.monto) as monto
          from public.cuenta_pagos cp
         where cp.cuenta_id = c.id and cp.metodo_pago = 'efectivo'
      ) p on true
     where c.restaurante_id = p_restaurante_id
       -- 'pendiente' no cuenta: no entra ni sale dinero de una cuenta sin cobrar.
       and c.estado in ('pagada', 'anulada')
  )
  select coalesce(sum(
           case when e.pagado_at >= v_turno.fecha_apertura and e.pagado_at < now()
                then e.monto else 0 end
           - case when e.estado = 'anulada'
                    and e.anulada_at >= v_turno.fecha_apertura and e.anulada_at < now()
                  then e.monto else 0 end), 0) into v_ventas
    from efectivo e;

  v_esperado := round(v_turno.monto_inicial + v_ventas, 2);
  v_diferencia := round(p_monto_declarado - v_esperado, 2);

  update public.caja_turnos
     set estado = 'cerrado',
         fecha_cierre = now(),
         usuario_cierre_id = p_usuario_id,
         monto_declarado = round(p_monto_declarado, 2),
         monto_esperado = v_esperado,
         diferencia = v_diferencia,
         observaciones = nullif(btrim(coalesce(p_observaciones, '')), '')
   where id = v_turno.id
   returning * into v_turno;

  return v_turno;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Permisos
-- ---------------------------------------------------------------------------
-- NO se dan aquí: los `revoke`/`grant execute` de esta y de todas las demás
-- funciones están en la sección 16 de `01_rls_completo.sql`, que se aplica al
-- final. Ver la nota de por qué (el orden de aplicación ya no decide si una RPC
-- queda llamable con la anon key).
--
-- OJO, además: la tabla `caja_turnos` queda como SOLO LECTURA para el cliente en
-- ese mismo archivo. La policy de escritura que estaba en la sección 2 de este
-- archivo (`caja_turnos_admin_write`, un `for all`) queda eliminada a propósito:
-- permitía escribir el arqueo a mano, con cualquier `monto_esperado` y
-- `diferencia`, esquivando el `for update` de `cerrar_turno_caja`. Abrir y cerrar
-- pasan solo por las dos RPC de arriba.

-- ---------------------------------------------------------------------------
-- 6. Verificación manual (opcional, en el SQL editor)
-- ---------------------------------------------------------------------------
-- select * from public.caja_turnos where restaurante_id = '<rid>' order by fecha_apertura desc;
-- Un arqueado debe salir con diferencia 0:
--   monto_declarado = monto_inicial + efectivo cobrado en la ventana.


-- #############################################################################
-- # 11/19 · 01_rls_completo.sql
-- #############################################################################

-- -- =============================================================================
-- Mesora · RLS COMPLETO: quién puede leer y escribir cada tabla
-- =============================================================================
--
-- QUÉ ES ESTE ARCHIVO
-- El único lugar donde hay que mirar para responder "¿quién puede hacer qué en
-- esta base?". Antes las policies vivían dispersas: dos tablas tenían RLS
-- (caja_turnos y restaurante_pins, cada una en su propio archivo) y las otras
-- once no tenían ninguna. Este archivo las consolida todas y además recoge los
-- permisos (`execute`) de las funciones, que antes estaban repartidos y dependían
-- del orden en que se aplicaran los scripts (ver la nota de BUG ARREGLADO al pie).
--
-- Es idempotente: se puede volver a ejecutar las veces que haga falta. Cada
-- policy hace `drop policy if exists` antes de `create policy`, así que aplicarlo
-- dos veces deja exactamente lo mismo.
--
-- REQUISITOS Y ORDEN
--   00_schema_base.sql               (las diez tablas del dominio)
--   00_seguridad_rpcs.sql            (define validar_acceso_restaurante)
--   migracion_items_anulables.sql    (columnas anulado* en pedido_items)
--   migracion_productos_es_bebida.sql
--   rpc_crear_pedido.sql, rpc_cerrar_cuenta.sql, rpc_anular_cuenta.sql,
--   pin_autorizacion.sql, caja_turnos.sql   (las funciones y sus tablas)
--   → ESTE ARCHIVO, AL FINAL.
-- Se aplica al final a propósito: este archivo hace `grant` sobre funciones que
-- los anteriores crean, y si se aplica antes, esos `grant` fallarían con
-- "function does not exist". El orden completo está en SUPABASE_SETUP.md.
--
-- LAS TRES REGLAS QUE RESPETA TODO
--
--   1. AISLAMIENTO. Toda fila tiene que pertenecer al restaurante del usuario
--      que pregunta. El único que ve más de un restaurante es el super_admin, y
--      solo lee (`restaurantes` y `usuarios`); no opera dentro de un restaurante,
--      así que no tiene policies de escritura ni de lectura en los datos
--      operativos (cuentas, pedidos, caja).
--
--   2. ROL. Cada operación tiene un rol que puede pedirla, y la policy lo exige.
--      Que la UI esconda un botón es cortesía; esto es la puerta.
--
--   3. SUSCRIPCIÓN Y USUARIO ACTIVO, también en las policies. Las RPC ya lo
--      validan por dentro (validar_acceso_restaurante), pero las escrituras que
--      el front hace DIRECTAMENTE sobre tablas (avanzarPedido, liberarMesa,
--      catálogo, personal) no pasan por ninguna RPC: sin esto, un mesero
--      desactivado o un restaurante vencido podría escribir igual saltándose el
--      bloqueo que solo vive en la interfaz.
--
-- POR QUÉ HAY FUNCIONES AUXILIARES Y NO EL SQL DIRECTO EN CADA POLICY
-- Dos motivos, ambos reales:
--
--   * RECURSIÓN. La policy de `usuarios` necesita saber "de qué restaurante es
--     el que pregunta", y eso se lee de `usuarios`. Si la policy consultara
--     `usuarios` directamente, Postgres detectaría la recursión y toda query
--     sobre `usuarios` fallaría con "infinite recursion detected in policy". Por
--     eso los helpers son `security definer`: leen las tablas con los permisos
--     del dueño, no con los del que pregunta, así que no vuelven a disparar la
--     RLS.
--
--   * UNA REGLA, SIETE COPIAS. Suscripción vigente + usuario activo + rol + mismo
--     restaurante es la misma condición en más de treinta policies. Si el día de
--     mañana se cambia la regla (un grace period, un plan nuevo), se cambia en
--     `puedo_escribir_en()` y no en treinta lugares.
--
-- Las policies no pueden usar `raise exception` (para eso está
-- `validar_acceso_restaurante`, que se usa dentro de las RPC): una policy solo
-- puede devolver true/false. Por eso los helpers devuelven booleanos.
--
-- NOTA SOBRE `security definer` EN LOS HELPERS
-- Funcionan porque el dueño de las tablas (y de estas funciones) está exento de
-- RLS. Si algún día alguien crea las tablas con otro dueño o activa
-- `force row level security`, hay que revisar esta sección.
--
-- CÓMO COMPROBAR QUE QUEDÓ BIEN (SQL Editor, al final)
-- La última sección de este archivo trae las consultas de verificación.

-- =============================================================================
-- 0 · FUNCIONES AUXILIARES (la base de todas las policies de abajo)
-- =============================================================================

-- El restaurante del usuario de la sesión, o null si no hay sesión, si está
-- desactivado o si es super_admin (que no pertenece a ningún restaurante).
create or replace function public.mi_restaurante_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select u.restaurante_id
    from public.usuarios u
   where u.id = auth.uid()
     and coalesce(u.activo, true);
$$;

comment on function public.mi_restaurante_id() is
  'Restaurante del usuario autenticado (null si no hay sesión, está desactivado o es super_admin). Helper de RLS.';

-- ¿El usuario de la sesión es super_admin? Solo lectura, nunca escritura.
create or replace function public.soy_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.usuarios u
     where u.id = auth.uid()
       -- El `::text` es el mismo del que usa `tengo_rol`: si `rol` llegara a ser
       -- un enum, comparar contra el literal funciona igual, pero con el cast el
       -- archivo se comporta idéntico sea text, varchar o enum.
       and u.rol::text = 'super_admin'
       and coalesce(u.activo, true)
  );
$$;

comment on function public.soy_super_admin() is
  'El usuario autenticado es super_admin. Helper de RLS: da lectura global de restaurantes y usuarios, nunca escritura.';

-- ¿La suscripción del restaurante está activa Y no vencida? Misma regla que el
-- punto 4 y 5 de validar_acceso_restaurante, expresada como booleano.
create or replace function public.suscripcion_vigente(p_restaurante_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.restaurantes r
     where r.id = p_restaurante_id
       and coalesce(r.suscripcion_activa, false)
       and (r.fecha_vencimiento is null or r.fecha_vencimiento >= now())
  );
$$;

comment on function public.suscripcion_vigente(uuid) is
  'El restaurante existe, tiene suscripción activa y no está vencido (null = indefinida). Helper de RLS: una policy no puede lanzar excepción.';

-- ¿El usuario de la sesión tiene alguno de estos roles? No exige pertenencia al
-- restaurante: es la mitad "rol" de la condición, y se combina con
-- `soy_del_restaurante` (para leer) o `puedo_escribir_en` (para escribir).
--
-- El `u.rol::text` es a propósito: el schema base (que no está en este repo)
-- podría tener `usuarios.rol` como `text`, `varchar` o como un `enum` de Postgres.
-- Comparar un enum con un `text[]` da error ("operator does not exist"), y este
-- archivo tiene que funcionar en los tres casos.
create or replace function public.tengo_rol(p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.usuarios u
     where u.id = auth.uid()
       and coalesce(u.activo, true)
       and u.rol::text = any (p_roles)
  );
$$;

comment on function public.tengo_rol(text[]) is
  'El usuario autenticado está activo y tiene alguno de los roles indicados. Helper de RLS: la mitad "rol" de la condición de lectura.';

-- LECTURA de un restaurante: cualquier rol activo que pertenezca a él.
-- Para lo que NO tiene `restaurante_id` en la propia fila (pedido_items,
-- cuenta_pedidos), que se resuelven con los helpers de las secciones 8 y 10.
create or replace function public.soy_del_restaurante(p_restaurante_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.usuarios u
     where u.id = auth.uid()
       and coalesce(u.activo, true)
       and u.restaurante_id = p_restaurante_id
  );
$$;

comment on function public.soy_del_restaurante(uuid) is
  'El usuario autenticado está activo y pertenece a ese restaurante. Helper de RLS para policies de solo lectura.';

-- ESCRITURA en un restaurante: usuario activo, del restaurante, con uno de los
-- roles indicados y con suscripción vigente. Es LA condición de todas las
-- policies de insert/update/delete de este archivo.
create or replace function public.puedo_escribir_en(p_restaurante_id uuid, p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.usuarios u
     where u.id = auth.uid()
       and coalesce(u.activo, true)
       and u.restaurante_id = p_restaurante_id
       and u.rol::text = any (p_roles)
  )
  and public.suscripcion_vigente(p_restaurante_id);
$$;

comment on function public.puedo_escribir_en(uuid, text[]) is
  'Usuario activo + del restaurante + con uno de los roles + suscripción vigente. Es la condición de todas las policies de escritura.';

-- Membresía a través de otra tabla (las que no llevan `restaurante_id`).
create or replace function public.pedido_es_de_mi_restaurante(p_pedido_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.pedidos p
     where p.id = p_pedido_id
       and p.restaurante_id = public.mi_restaurante_id()
  );
$$;

comment on function public.pedido_es_de_mi_restaurante(uuid) is
  'El pedido indicado pertenece al restaurante del usuario autenticado. Evita el problema clásico de filtrar pedido_items con un id suelto.';

create or replace function public.cuenta_es_de_mi_restaurante(p_cuenta_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.cuentas c
     where c.id = p_cuenta_id
       and c.restaurante_id = public.mi_restaurante_id()
  );
$$;

comment on function public.cuenta_es_de_mi_restaurante(uuid) is
  'La cuenta indicada pertenece al restaurante del usuario autenticado.';

-- Los helpers tienen que ser ejecutables por `authenticated`: las policies se
-- evalúan con los permisos de quien pregunta, no con los del dueño. No se les
-- da a `anon` (la anon key no tiene sesión y no debe poder ni intentarlo).
--
-- No son un filtro de datos: devuelven un uuid que el usuario ya conoce o un
-- booleano. Por eso EXIGEN `execute` a `authenticated` y `validar_pin_autorizacion`
-- no se lo tiene (ver pin_autorizacion.sql, sección 4: sería un oráculo de fuerza
-- bruta del PIN de otros restaurantes).
revoke all on function public.mi_restaurante_id() from public;
revoke all on function public.soy_super_admin() from public;
revoke all on function public.tengo_rol(text[]) from public;
revoke all on function public.suscripcion_vigente(uuid) from public;
revoke all on function public.soy_del_restaurante(uuid) from public;
revoke all on function public.puedo_escribir_en(uuid, text[]) from public;
revoke all on function public.pedido_es_de_mi_restaurante(uuid) from public;
revoke all on function public.cuenta_es_de_mi_restaurante(uuid) from public;

grant execute on function public.mi_restaurante_id() to authenticated;
grant execute on function public.soy_super_admin() to authenticated;
grant execute on function public.tengo_rol(text[]) to authenticated;
grant execute on function public.suscripcion_vigente(uuid) to authenticated;
grant execute on function public.soy_del_restaurante(uuid) to authenticated;
grant execute on function public.puedo_escribir_en(uuid, text[]) to authenticated;
grant execute on function public.pedido_es_de_mi_restaurante(uuid) to authenticated;
grant execute on function public.cuenta_es_de_mi_restaurante(uuid) to authenticated;

-- =============================================================================
-- 1 · restaurantes
-- =============================================================================
-- QUIÉN LEE: su propia fila (la app la necesita al arrancar: src/store/auth.ts
-- lee el restaurante del usuario para el nombre, el RUC y el estado de la
-- suscripción) y el super_admin, que es quien lista todos los restaurantes para
-- la pantalla de gestión (SuperAdmin.tsx → api.getRestaurantes()).
-- QUIÉN ESCRIBE: el admin de ese restaurante, y SOLO los datos de la boleta
-- (nombre, RUC, dirección, teléfono, email): ver el `grant update (...)` de
-- columnas al final de la sección. Es lo que impide que un admin con la
-- suscripción vencida se la reactive a sí mismo con un update.
--
-- La tabla viene del schema base, que no está en este repo: este archivo no la
-- crea, solo le pone RLS y sus policies. (Por eso el orden importa: el schema
-- base va antes que esto.)
alter table public.restaurantes enable row level security;

drop policy if exists restaurantes_select on public.restaurantes;
create policy restaurantes_select on public.restaurantes
  for select
  using (
    (select public.soy_super_admin())
    or (select public.mi_restaurante_id()) = id
  );

drop policy if exists restaurantes_update_admin on public.restaurantes;
create policy restaurantes_update_admin on public.restaurantes
  for update
  using ((select public.puedo_escribir_en(id, array['admin_restaurante'])))
  with check ((select public.puedo_escribir_en(id, array['admin_restaurante'])));

-- INSERT y DELETE de restaurantes no se dan a nadie desde el cliente: se crean
-- desde el panel de Supabase (o por un alta administrativa) y se borran en
-- cascada. Que un usuario pueda borrar su propio restaurante desde la app sería
-- un botón de autodestrucción.

-- =============================================================================
-- 2 · usuarios
-- =============================================================================
-- QUIÉN LEE: su propia fila (imprescindible: el bootstrap de sesión lee
-- `usuarios` por id para saber el rol y el restaurante antes de tener nada
--  más), el admin del mismo restaurante (la pantalla de personal y el desglose de
-- ventas por mesero) y el super_admin (gestión de clientes).
-- QUIÉN ESCRIBE: el admin del mismo restaurante, con suscripción vigente.
-- LÍMITES IMPORTANTES DEL `with check`:
--   * nadie puede crear ni convertir a alguien en super_admin (`rol = any` con
--     la misma lista que ROLES_PERSONAL en src/lib/api.ts);
--   * `restaurante_id` queda atado al del admin: aunque el front mandara otro,
--     la fila no entra.
-- Un usuario desactivado conserva la lectura de su propia fila (para que la app
-- pueda explicarle por qué no entra) pero `puedo_escribir_en` lo bloquea igual
-- porque exige `coalesce(u.activo, true)`.
alter table public.usuarios enable row level security;

drop policy if exists usuarios_select on public.usuarios;
create policy usuarios_select on public.usuarios
  for select
  using (
    (select public.soy_super_admin())
    or id = (select auth.uid())
    or (
      restaurante_id = (select public.mi_restaurante_id())
      and (select public.tengo_rol(array['admin_restaurante']))
    )
  );

drop policy if exists usuarios_insert_admin on public.usuarios;
create policy usuarios_insert_admin on public.usuarios
  for insert
  with check (
    restaurante_id = (select public.mi_restaurante_id())
    and rol::text = any (array['mesero', 'cocina', 'admin_restaurante', 'cajero']::text[])
    and (select public.puedo_escribir_en(restaurante_id, array['admin_restaurante']))
  );

drop policy if exists usuarios_update_admin on public.usuarios;
create policy usuarios_update_admin on public.usuarios
  for update
  using (
    restaurante_id = (select public.mi_restaurante_id())
    and (select public.puedo_escribir_en(restaurante_id, array['admin_restaurante']))
  )
  with check (
    restaurante_id = (select public.mi_restaurante_id())
    -- No se cambia el rol a super_admin ni se mueve a otro restaurante.
    and rol::text = any (array['mesero', 'cocina', 'admin_restaurante', 'cajero']::text[])
    -- Se repite el permiso de escritura sobre la fila YA MODIFICADA (por si
    -- entre el `using` y el `with check` el restaurante se quedó sin
    -- suscripción, que es una de las pocas cosas que un update no cambia).
    and (select public.puedo_escribir_en(restaurante_id, array['admin_restaurante']))
  );

-- No se puede borrar a uno mismo (la app lo bloquea en la UI; acá se cierra).
drop policy if exists usuarios_delete_admin on public.usuarios;
create policy usuarios_delete_admin on public.usuarios
  for delete
  using (
    restaurante_id = (select public.mi_restaurante_id())
    and id <> (select auth.uid())
    and (select public.puedo_escribir_en(restaurante_id, array['admin_restaurante']))
  );

-- =============================================================================
-- 3 · zonas
-- =============================================================================
-- QUIÉN LEE: cualquiera del restaurante (el mesero elige zona al crear mesas, el
-- admin las administra).
-- QUIÉN ESCRIBE: solo el admin, con suscripción vigente. Sin cascadas: se borra
-- a mano desde la app, que ya avisa si quedan mesas o pedidos abajo.
alter table public.zonas enable row level security;

drop policy if exists zonas_select on public.zonas;
create policy zonas_select on public.zonas
  for select
  using ((select public.soy_del_restaurante(restaurante_id)));

drop policy if exists zonas_write_admin on public.zonas;
create policy zonas_write_admin on public.zonas
  for all
  using ((select public.puedo_escribir_en(restaurante_id, array['admin_restaurante'])))
  with check ((select public.puedo_escribir_en(restaurante_id, array['admin_restaurante'])));

-- =============================================================================
-- 4 · mesas
-- =============================================================================
-- QUIÉN LEE: cualquiera del restaurante.
-- QUIÉN ESCRIBE:
--   * el admin, para el catálogo (crear, renombrar, mover de zona, borrar);
--   * mesero, admin y cajero para el `estado`, que es lo único que cambia sin
--     ser el admin: el mesero libera la mesa cuando el cliente se va sin pagar
--     (CerrarCuenta.tsx → api.liberarMesa), y la RPC cerrar_cuenta la libera
--     ella misma.
-- NOTA (riesgo aceptado, no resuelto): RLS no puede filtrar columnas, así que el
-- `update` que la policy del mesero habilita también le permitiría renombrar una
-- mesa o cambiarle la zona con un update directo. No es dinero ni documento, y
-- el arreglo limpio es una RPC `liberar_mesa(rid, mesa_id)`; queda anotado en
-- ESTADO_Y_CAMBIOS.md §9 en vez de romper la app cambiando el frontend.
alter table public.mesas enable row level security;

drop policy if exists mesas_select on public.mesas;
create policy mesas_select on public.mesas
  for select
  using ((select public.soy_del_restaurante(restaurante_id)));

drop policy if exists mesas_write_admin on public.mesas;
create policy mesas_write_admin on public.mesas
  for all
  using ((select public.puedo_escribir_en(restaurante_id, array['admin_restaurante'])))
  with check ((select public.puedo_escribir_en(restaurante_id, array['admin_restaurante'])));

-- El estado de la mesa también lo mueven el mesero (liberar) y el cajero, sin
-- ser admins: policy aparte, con la misma regla de suscripción.
drop policy if exists mesas_update_estado on public.mesas;
create policy mesas_update_estado on public.mesas
  for update
  using ((select public.puedo_escribir_en(restaurante_id, array['mesero', 'cajero'])))
  with check ((select public.puedo_escribir_en(restaurante_id, array['mesero', 'cajero'])));

-- =============================================================================
-- 5 · categorias_productos
-- =============================================================================
-- QUIÉN LEE: cualquiera del restaurante (el menú del mesero y la carta de
-- cocina/barra la necesitan).
--  QUIÉN ESCRIBE: solo el admin, con suscripción vigente.
alter table public.categorias_productos enable row level security;

drop policy if exists categorias_productos_select on public.categorias_productos;
create policy categorias_productos_select on public.categorias_productos
  for select
  using ((select public.soy_del_restaurante(restaurante_id)));

drop policy if exists categorias_productos_write_admin on public.categorias_productos;
create policy categorias_productos_write_admin on public.categorias_productos
  for all
  using ((select public.puedo_escribir_en(restaurante_id, array['admin_restaurante'])))
  with check ((select public.puedo_escribir_en(restaurante_id, array['admin_restaurante'])));

-- =============================================================================
-- 6 · productos
-- =============================================================================
-- QUIÉN LEE: cualquiera del restaurante. Ojo con un detalle real: el menú del
-- mesero filtra `disponible = true` desde el navegador (getProductos con
-- `incluirAgotados`), así que la policy NO puede esconder los agotados: quien
-- quiera puede verlos con la misma consulta. Es información del catálogo, no
-- dinero, y ocultarla de verdad exigiría una vista o una RPC.
-- QUIÉN ESCRIBE: solo el admin, con suscripción vigente. El precio y el nombre
-- los valida además `crear_pedido`, que es la única vía por la que un producto
-- entra en una cuenta.
alter table public.productos enable row level security;

drop policy if exists productos_select on public.productos;
create policy productos_select on public.productos
  for select
  using ((select public.soy_del_restaurante(restaurante_id)));

drop policy if exists productos_write_admin on public.productos;
create policy productos_write_admin on public.productos
  for all
  using ((select public.puedo_escribir_en(restaurante_id, array['admin_restaurante'])))
  with check ((select public.puedo_escribir_en(restaurante_id, array['admin_restaurante'])));

-- =============================================================================
-- 7 · pedidos
-- =============================================================================
-- QUIÉN LEE: cualquiera del restaurante (cocina ve los activos, el mesero las
-- comandas de su mesa, el admin el histórico).
-- QUIÉN ESCRIBE: cocina, mesero y admin, y SOLO para mover el estado
-- (avanzarPedido: pendiente → en_preparacion → listo → entregado). Los pedidos
-- se crean y se modifican por RPC.
-- RIESGO ACEPTADO Y ANOTADO: la policy no puede filtrar columnas, así que este
-- `update` permite cambiar `mesero_id` o saltar estados con una llamada directa a
-- la API (el front sí valida el salto con `siguienteEstado`). El arreglo limpio es
-- una RPC `avanzar_pedido(rid, pedido_id, estado_esperado)` con compare-and-set
-- en SQL; hoy el compare-and-set lo hace el navegador (api.ts, `avanzarPedido`).
alter table public.pedidos enable row level security;

drop policy if exists pedidos_select on public.pedidos;
create policy pedidos_select on public.pedidos
  for select
  using ((select public.soy_del_restaurante(restaurante_id)));

drop policy if exists pedidos_update on public.pedidos;
create policy pedidos_update on public.pedidos
  for update
  using ((select public.puedo_escribir_en(restaurante_id, array['cocina', 'mesero', 'admin_restaurante'])))
  with check ((select public.puedo_escribir_en(restaurante_id, array['cocina', 'mesero', 'admin_restaurante'])));

-- =============================================================================
-- 8 · pedido_items
-- =============================================================================
-- SIN ESCRITURA DESDE EL CLIENTE, A PROPÓSITO. Un ítem entra en la base por
-- `crear_pedido` y solo cambia por `editar_item_comanda` o `anular_item_comanda`.
-- Las dos son `security definer` y hacen cosas que una policy no puede expresar:
--   * el precio y el nombre los pone el servidor, no el cliente (si el navegador
--     pudiera insertar un ítem, podría pedir un plato de S/ 0.01);
--   * no se toca una comanda ya cobrada, con `for update` para que dos terminals
--     no anulen el mismo ítem a la vez;
--   * con PIN configurado, anular lo exige.
-- Una policy de INSERT aquí no podría validar nada de eso, así que no hay policy
-- de escritura: la denegación es total y no por comparación.
-- QUIÉN LEE: cualquiera del restaurante. `getPedidoItems(ids)` no filtra por
-- restaurante (filtra por `pedido_id in (...)`), y eso está bien: la policy
-- resuelve la pertenencia por el padre, así que un mesero que se invente ids de
-- otro restaurante no lee nada.
alter table public.pedido_items enable row level security;

drop policy if exists pedido_items_select on public.pedido_items;
create policy pedido_items_select on public.pedido_items
  for select
  using ((select public.pedido_es_de_mi_restaurante(pedido_id)));

-- =============================================================================
-- 9 · cuentas
-- =============================================================================
-- SIN ESCRITURA DESDE EL CLIENTE, A PROPÓSITO. Una cuenta la crea y la paga
-- `cerrar_cuenta` (que calcula el total desde los ítems, no desde el navegador,
-- y serializa el cobro con `for update` sobre la mesa) y solo la anula
-- `anular_cuenta` (admin o cajero, con motivo obligatorio y PIN si el
-- restaurante lo configuró). Ninguna de las dos se puede reproducir con un
-- `insert`/`update` directo, y una boleta emitida es un documento: por eso no hay
-- policy de escritura.
-- QUIÉN LEE: admin, cajero y mesero. El mesero también la necesita, y no por
-- codicia: `getPedidosDeMesa` consulta las cuentas pagadas para no ofrecer a
-- cobro una comanda ya cobrada, y después de cobrar se relee la cuenta para
-- imprimir la boleta con lo que quedó guardado. La cocina no la lee.
alter table public.cuentas enable row level security;

drop policy if exists cuentas_select on public.cuentas;
create policy cuentas_select on public.cuentas
  for select
  using ((select public.soy_del_restaurante(restaurante_id))
         and (select public.tengo_rol(array['admin_restaurante', 'cajero', 'mesero'])));

-- =============================================================================
-- 10 · cuenta_pedidos (qué pedidos se cobraron en qué boleta)
-- =============================================================================
-- SIN ESCRITURA DESDE EL CLIENTE, A PROPÓSITO: lo escribe `cerrar_cuenta` en la
-- misma transacción que la cuenta. Si el navegador pudiera inventar la relación,
-- podría sacar una comanda del circuito de cobro.
-- NO tiene `restaurante_id` (se resuelve por `cuenta_es_de_mi_restaurante`), y
-- por eso no se puede filtrar con un simple `cuenta_id in (...)` sin abrir la
-- puerta a leer los pedidos de otro restaurante.
alter table public.cuenta_pedidos enable row level security;

drop policy if exists cuenta_pedidos_select on public.cuenta_pedidos;
create policy cuenta_pedidos_select on public.cuenta_pedidos
  for select
  using (
    (select public.cuenta_es_de_mi_restaurante(cuenta_id))
    and (select public.tengo_rol(array['admin_restaurante', 'cajero', 'mesero']))
  );

-- =============================================================================
-- 11 · cuenta_pagos (el detalle del pago dividido)
-- =============================================================================
-- SIN ESCRITURA DESDE EL CLIENTE, A PROPÓSITO: lo escribe `cerrar_cuenta`, que
-- es quien sabe el importe real de cada parte (completa el "exacto" con el resto
-- que falta) y el vuelto. Un `insert` directo permitiría falsear el desglose por
-- método del dashboard y el arqueo de caja.
-- QUIÉN LEE: admin y cajero. Son los dos que necesitan el detalle: el dashboard
-- reparte la venta por método y el arqueo suma la parte en efectivo. El mesero
-- no lo lee (no lo necesita para cobrar: la boleta se arma con la cuenta).
alter table public.cuenta_pagos enable row level security;

drop policy if exists cuenta_pagos_select on public.cuenta_pagos;
create policy cuenta_pagos_select on public.cuenta_pagos
  for select
  using (
    restaurante_id = (select public.mi_restaurante_id())
    and (select public.tengo_rol(array['admin_restaurante', 'cajero']))
  );

-- =============================================================================
-- 12 · caja_turnos
-- =============================================================================
-- SIN ESCRITURA DESDE EL CLIENTE, Y ESTO ES LO MÁS IMPORTANTE DEL ARCHIVO.
-- La policy que había antes era un `for all` para admin y cajero: les dejaba
-- hacer `insert`, `update` y `delete` DIRECTOS sobre la tabla del arqueo. Eso
-- esquivaba por completo el `for update` de `cerrar_turno_caja` (con el que dos
-- terminales no cierran el mismo turno) y, peor, dejaba escribir a mano
-- `monto_esperado` y `diferencia`: el número que dice si faltó plata en la
-- gaveta. Un `update` directo podría dejar un arqueado "cuadrado" que nunca se
-- contó. Por eso ahora la tabla es de SOLO LECTURA y abrir/cerrar pasan
-- exclusivamente por `abrir_turno_caja` y `cerrar_turno_caja`, que calculan el
-- esperado en SQL y congelan los tres números al cerrar.
-- QUIÉN LEE: admin y cajero. Los otros roles ni siquiera ven la caja en la app.
alter table public.caja_turnos enable row level security;

drop policy if exists caja_turnos_select on public.caja_turnos;
create policy caja_turnos_select on public.caja_turnos
  for select
  using (
    restaurante_id = (select public.mi_restaurante_id())
    and (select public.tengo_rol(array['admin_restaurante', 'cajero']))
  );

drop policy if exists caja_turnos_admin_write on public.caja_turnos;
drop policy if exists caja_turnos_write on public.caja_turnos;

-- =============================================================================
-- 13 · restaurante_pins
-- =============================================================================
-- SIN NINGUNA POLICY, Y NO ES UN OLVIDO.
-- Antes había un `select` para el admin y un `for all` de escritura para el
-- admin. Los dos sobran, y el segundo era un agujero: la escritura tiene que
-- pasar por `configurar_pin_autorizacion`, que valida que el PIN sea de 4 a 6
-- dígitos, genera el hash y anota quién lo cambió. Con un `for all` el admin
-- podía escribir el `pin_hash` a mano (por ejemplo, el hash de un PIN que él
-- elige sin que quede registro) o borrar la fila por su cuenta.
-- El `select` también sobra: la UI no necesita el hash —solo si hay que pedir el
-- PIN— y eso lo responde `tiene_pin_autorizacion`, que devuelve un booleano.
-- Así que el hash no sale de la base por ninguna vía de cliente, ni para el admin.
-- Con RLS habilitado y sin policies, cualquier `select` del cliente devuelve 0
-- filas.
alter table public.restaurante_pins enable row level security;

drop policy if exists restaurante_pins_select_admin on public.restaurante_pins;
drop policy if exists restaurante_pins_write_admin on public.restaurante_pins;

-- =============================================================================
-- 14 · Permisos de tabla: qué puede hacer el rol de base de datos `anon`
-- =============================================================================
-- Supabase da por defecto TODOS los privileges a `anon` y a `authenticated` sobre
-- las tablas del schema public. Con RLS habilitado y sin policy para `anon` ya no
-- ve nada, pero una segunda barrera no cuesta nada y protege del peor escenario
-- del mundo: que alguien deshabilite RLS por error en una tabla y de repente la
-- base entera sea legible con la anon key.
-- `service_role` no se toca: es el rol del servidor (edge functions, backups) y
-- está exento de RLS por diseño.
revoke all on public.restaurantes from anon;
revoke all on public.usuarios from anon;
revoke all on public.zonas from anon;
revoke all on public.mesas from anon;
revoke all on public.categorias_productos from anon;
revoke all on public.productos from anon;
revoke all on public.pedidos from anon;
revoke all on public.pedido_items from anon;
revoke all on public.cuentas from anon;
revoke all on public.cuenta_pedidos from anon;
revoke all on public.cuenta_pagos from anon;
revoke all on public.caja_turnos from anon;
revoke all on public.restaurante_pins from anon;
-- `correlativos` no lo lee nadie desde el cliente: solo lo escribe la función
-- `cerrar_cuenta` (security definer). Sin este revoke, el `ALL` que Supabase
-- otorga por defecto dejaba los contadores de boletas legibles con la anon key.
revoke all on public.correlativos from anon;

grant select on public.restaurantes to authenticated;
grant select on public.usuarios to authenticated;
grant select on public.zonas to authenticated;
grant select on public.mesas to authenticated;
grant select on public.categorias_productos to authenticated;
grant select on public.productos to authenticated;
grant select on public.pedidos to authenticated;
grant select on public.pedido_items to authenticated;
grant select on public.cuentas to authenticated;
grant select on public.cuenta_pedidos to authenticated;
grant select on public.cuenta_pagos to authenticated;
grant select on public.caja_turnos to authenticated;

-- Escritura directa desde el cliente, que es la que existe:
grant insert, update, delete on public.zonas to authenticated;
grant insert, update, delete on public.mesas to authenticated;
grant insert, update, delete on public.categorias_productos to authenticated;
grant insert, update, delete on public.productos to authenticated;
grant insert, update, delete on public.usuarios to authenticated;
grant update on public.pedidos to authenticated;

-- Y la que NO existe, por el motivo de las secciones 8 a 13: pedido_items,
-- cuentas, cuenta_pedidos, cuenta_pagos, caja_turnos y restaurante_pins no
-- reciben ni un privilege de escritura. Para escribir en ellas hay que llamar a
-- la RPC, que valida rol, suscripción, PIN y bloqueos. Se revocan aquí por si
-- alguien otorgó privilegios a mano antes de aplicar este archivo.

revoke insert, update, delete on public.pedido_items from authenticated;
revoke insert, update, delete on public.cuentas from authenticated;
revoke insert, update, delete on public.cuenta_pedidos from authenticated;
revoke insert, update, delete on public.cuenta_pagos from authenticated;
revoke insert, update, delete on public.caja_turnos from authenticated;
revoke insert, update, delete on public.restaurante_pins from authenticated;
revoke insert, delete on public.restaurantes from authenticated;

-- Y un privilege que casi nadie recuerda: TRUNCATE. A diferencia de SELECT,
-- INSERT, UPDATE y DELETE, NO pasa por RLS (no hay policy que lo filtre y no hay
-- forma de escribir una): `truncate` borra la tabla entera y le da igual que el
-- usuario sea del restaurante o no. Si `authenticated` conserva el `ALL` que
-- Supabase otorga por defecto, un truncate vacía pedidos, cuentas o el arqueo
-- aunque todas las policies estén impecables. No lo expone PostgREST, así que
-- hace falta acceso SQL directo, pero el costo de revocarlo es cero y la
-- diferencia entre un incidente y un tweet es entera.
revoke truncate on public.restaurantes from authenticated;
revoke truncate on public.usuarios from authenticated;
revoke truncate on public.zonas from authenticated;
revoke truncate on public.mesas from authenticated;
revoke truncate on public.categorias_productos from authenticated;
revoke truncate on public.productos from authenticated;
revoke truncate on public.pedidos from authenticated;
revoke truncate on public.pedido_items from authenticated;
revoke truncate on public.cuentas from authenticated;
revoke truncate on public.cuenta_pedidos from authenticated;
revoke truncate on public.cuenta_pagos from authenticated;
revoke truncate on public.caja_turnos from authenticated;
revoke truncate on public.restaurante_pins from authenticated;
revoke truncate on public.correlativos from authenticated;

-- =============================================================================
-- 15 · restaurantes: update SOLO de los datos de la boleta
-- =============================================================================
-- La policy de arriba deja actualizar al admin de la fila, pero una policy no
-- puede filtrar columnas: sin esto, el mismo admin podría mandar
-- `update { suscripcion_activa: true }` sobre su propio restaurante y
-- esquivarse el bloqueo de suscripción (el único control de cobro de todo el
-- sistema). Se cierra a nivel de privilegio, que sí sabe de columnas.
-- Lo que envía la app (ConfiguracionTab → api.actualizarRestaurante) es
-- exactamente: nombre, ruc, direccion, telefono, email_contacto, dominio.
revoke update on public.restaurantes from authenticated;
grant update (nombre, ruc, direccion, telefono, email_contacto, dominio)
  on public.restaurantes to authenticated;

-- =============================================================================
-- 16 · Permisos de las funciones (execute)
-- =============================================================================
-- TODO lo que la app llama por RPC está aquí. Antes cada archivo revocaba y
-- otorgaba por su cuenta, y el resultado dependía del ORDEN en que se
-- aplicaran (ver "BUG ARREGLADO" más abajo). Reglas:
--   * `security definer` corre con los permisos del dueño, así que si `anon`
--     conserva EXECUTE puede llamar cualquier RPC sin sesión. Se revoca a PUBLIC
--     (que incluye a anon y a authenticated) y se otorga solo a `authenticated`.
--   * `validar_pin_autorizacion` NO se otorga a nadie: la llaman por dentro las
--     RPCs de anulación. Ejecutable por el cliente sería un oráculo de fuerza
--     bruta del PIN de CUALQUIER restaurante.
--   * `validar_acceso_restaurante` solo a `authenticated` (así lo deja
--     00_seguridad_rpcs.sql; se repite aquí para que el archivo sea el
--     referencia única).

revoke execute on function public.validar_acceso_restaurante(uuid) from public;
revoke execute on function public.validar_pin_autorizacion(uuid, text) from public;
-- El segundo revoke es explícito aunque el primero ya lo cubra: si alguien
-- otorgó `execute` a `authenticated` a mano antes (era lo que hacía
-- pin_autorizacion.sql en su sección 4, que ahora ya no lo hace), el permiso
-- sobreviviría al revoke contra PUBLIC.
revoke execute on function public.validar_pin_autorizacion(uuid, text) from authenticated;

grant execute on function public.validar_acceso_restaurante(uuid) to authenticated;
grant execute on function public.crear_pedido(uuid, uuid, jsonb) to authenticated;
grant execute on function public.editar_item_comanda(uuid, uuid, uuid, int, text) to authenticated;
grant execute on function public.anular_item_comanda(uuid, uuid, uuid, text) to authenticated;
grant execute on function public.cerrar_cuenta(uuid, uuid, uuid[], jsonb, numeric) to authenticated;
grant execute on function public.anular_cuenta(uuid, uuid, text, text) to authenticated;
grant execute on function public.abrir_turno_caja(uuid, uuid, numeric) to authenticated;
grant execute on function public.cerrar_turno_caja(uuid, uuid, numeric, text) to authenticated;
grant execute on function public.configurar_pin_autorizacion(uuid, text) to authenticated;
grant execute on function public.quitar_pin_autorizacion(uuid) to authenticated;
grant execute on function public.tiene_pin_autorizacion(uuid) to authenticated;

-- =============================================================================
-- 17 · Verificación (SQL Editor)
-- =============================================================================

-- 17.1 · Las 13 tablas tienen RLS y ninguna tiene policies huérfanas.
select c.relname as tabla,
       c.relrowsecurity as rls_activo,
       coalesce(array_length(p.polnames, 1), 0) as policies,
       coalesce(array_to_string(p.polnames, ', '), '(solo lectura / solo RPC)') as nombres
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  left join lateral (
    select array_agg(pol.polname order by pol.polname) as polnames
      from pg_policy pol
     where pol.polrelid = c.oid
  ) p on true
 where n.nspname = 'public'
   and c.relkind = 'r'
 order by c.relname;

-- 17.2 · Ninguna función security definer quedó ejecutable por anon.
select p.proname,
       p.prosecdef as security_definer,
       has_function_privilege('anon', p.oid, 'execute') as anon_puede,
       has_function_privilege('authenticated', p.oid, 'execute') as authenticated_puede
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in (
     'validar_acceso_restaurante', 'validar_pin_autorizacion', 'crear_pedido',
     'editar_item_comanda', 'anular_item_comanda', 'cerrar_cuenta', 'anular_cuenta',
     'abrir_turno_caja', 'cerrar_turno_caja', 'configurar_pin_autorizacion',
     'quitar_pin_autorizacion', 'tiene_pin_autorizacion'
   )
 order by p.proname;

-- 17.3 · Las columnas de `restaurantes` que el admin puede cambiar de verdad.
-- `attupdate` solo dice si la columna existe como actualizable; lo que importa
-- es el privilege, y para eso está `has_column_privilege`. Tiene que dar true
-- SOLO en nombre, ruc, direccion, telefono y email_contacto: si `suscripcion_activa`
-- o `id` salieran en true, el admin podría reactivarse solo.
select a.attname as columna,
       has_column_privilege('authenticated', 'public.restaurantes', a.attname, 'update') as puede_actualizar
  from pg_attribute a
 where a.attrelid = 'public.restaurantes'::regclass
   and a.attnum > 0
   and not a.attisdropped
 order by a.attname;

-- 17.4 · Privilegios de tabla por rol, para confirmar de un vistazo que no quedó
-- ningún `ALL` por ahí. Lo que debería verse: `authenticated` con select en las
-- 12 tablas que se pueden leer, escritura solo en zonas/mesas/categorias/
-- productos/usuarios/pedidos, y NADA de truncate en ninguna. `anon` en blanco.
select c.relname as tabla,
       has_table_privilege('anon', c.oid, 'select') as anon_select,
       has_table_privilege('anon', c.oid, 'insert,update,delete') as anon_escritura,
       has_table_privilege('authenticated', c.oid, 'select') as auth_select,
       has_table_privilege('authenticated', c.oid, 'insert') as auth_insert,
       has_table_privilege('authenticated', c.oid, 'update') as auth_update,
       has_table_privilege('authenticated', c.oid, 'delete') as auth_delete,
       has_table_privilege('authenticated', c.oid, 'truncate') as auth_truncate
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relkind = 'r'
   and c.relname in (
     'restaurantes', 'usuarios', 'zonas', 'mesas', 'categorias_productos',
     'productos', 'pedidos', 'pedido_items', 'cuentas', 'cuenta_pedidos',
     'cuenta_pagos', 'caja_turnos', 'restaurante_pins', 'correlativos',
     'configuracion_global', 'soporte_tickets', 'planes',
     'suscripciones_historial', 'audit_logs'
   )
 order by c.relname;

-- =============================================================================
-- BUG ARREGLADO AL ESCRIBIR ESTE ARCHIVO (para que no vuelva)
-- =============================================================================
-- `migracion_items_anulables.sql` revocaba y otorgaba execute sobre
--   cerrar_cuenta(uuid, uuid, uuid[], text)
-- pero la firma real es
--   cerrar_cuenta(uuid, uuid, uuid[], jsonb, numeric)
-- (p_pagos es jsonb y p_propina se agregó después). En Postgres,
-- `revoke execute on function <firma que no existe>` lanza ERROR, y en el SQL
-- Editor de Supabase —que corre el script en una transacción— eso abortaba el
-- script ENTERO: la migración de los ítems anulables no se podía aplicar. Y
-- además, en el orden recomendado ese archivo corría ANTES de rpc_crear_pedido y
-- rpc_cerrar_cuenta, cuando las funciones directamente no existían.
-- Como los permisos de funciones viven ahora en la sección 16, el problema no
-- puede repetirse: los grants están todos juntos y se aplican al final, cuando
-- las funciones ya existen.


-- #############################################################################
-- # 12/19 · admin_super_restaurante.sql
-- #############################################################################

-- -- =============================================================================
-- Gestión de restaurantes desde el panel del super admin
-- =============================================================================
-- POR QUÉ EXISTE ESTE ARCHIVO (y por qué NO se toca la RLS):
--
-- `restaurantes` está diseñado para que SOLO el admin de cada cuenta escriba
-- sus filas: policy `restaurantes_update_admin` + `grant update` columnario de
-- 01_rls_completo.sql (solo nombre, ruc, direccion, telefono, email_contacto).
-- El super_admin, por arquitectura, no pertenece a ningún restaurante
-- (`usuarios.restaurante_id` es null), así que medido contra la base real:
--   * editar nombre/RUC/etc. desde su JWT devuelve 200 con 0 filas: la policy
--     `puedo_escribir_en(id, ['admin_restaurante'])` no lo deja pasar;
--   * tocar `suscripcion_activa` devuelve 42501 "permission denied": esos
--     campos no están en el grant columnario, precisamente para que ningún
--     admin se reactive a sí mismo.
--
-- La solución NO es ampliar el grant (le daría escritura de suscripción a
-- TODO usuario autenticado y dejaría la defensa en una sola policy) ni bajar
-- la RLS: son dos funciones `security definer` con la misma filosofía que el
-- resto del proyecto — el navegador llama por RPC con su propio JWT, la
-- función exige `soy_super_admin()` y solo entonces escribe. RLS intacta,
-- sin `service_role` en el frontend, sin INSERT/DELETE nuevos.
--
-- PRUEBA REAL (2026-10-08, con el JWT de super@prueba.app):
--   PATCH /rest/v1/restaurantes {suscripcion_activa:false} -> 42501
--   PATCH /rest/v1/restaurantes {nombre:"..."}             -> 200 []
-- Ambas vías cerradas; por eso la vía es RPC.

-- =============================================================================
-- 1 · admin_actualizar_restaurante: los datos administrativos de la ficha
-- =============================================================================
-- Reemplazo total de los 5 campos (el formulario del panel siempre carga los
-- valores actuales y manda los 5). Nulls: `nullif(trim(...), '')` para que un
-- campo vacío quede como null y no como ''.
create or replace function public.admin_actualizar_restaurante(
  p_restaurante_id uuid,
  p_nombre text,
  p_ruc text,
  p_direccion text,
  p_telefono text,
  p_email_contacto text
)
returns setof public.restaurantes
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_restaurante_id is null then
    raise exception 'Falta el restaurante a editar.';
  end if;
  if not (select public.soy_super_admin()) then
    raise exception 'Solo el super administrador puede editar restaurantes.';
  end if;
  if coalesce(trim(p_nombre), '') = '' then
    raise exception 'El nombre del restaurante no puede quedar vacío.';
  end if;

  return query
  update public.restaurantes r
     set nombre          = trim(p_nombre),
         ruc             = nullif(trim(coalesce(p_ruc, '')), ''),
         direccion       = nullif(trim(coalesce(p_direccion, '')), ''),
         telefono        = nullif(trim(coalesce(p_telefono, '')), ''),
         email_contacto  = nullif(trim(coalesce(p_email_contacto, '')), '')
   where r.id = p_restaurante_id
  returning r.*;
end;
$$;

comment on function public.admin_actualizar_restaurante(uuid, text, text, text, text, text) is
  'Super admin: edita los datos administrativos de un restaurante (nombre, RUC, dirección, teléfono, email). SECURITY DEFINER con control de rol: la RLS de la tabla no deja pasar al super_admin porque este no pertenece a ningún restaurante.';

-- OJO con los grants: en este proyecto las default privileges de Supabase
-- crean cada función CON `execute` directo para `anon`, `authenticated` y
-- `service_role` (se ve en el proacl de cualquier RPC existente: no basta con
-- revocar a PUBLIC). Se revoca a PUBLIC (por si acaso) y a `anon` expresamente;
-- `authenticated` es quien debe poder llamar y `service_role` queda como en el
-- resto de la base (solo uso servidor).
revoke execute on function public.admin_actualizar_restaurante(uuid, text, text, text, text, text) from public;
revoke execute on function public.admin_actualizar_restaurante(uuid, text, text, text, text, text) from anon;
grant execute on function public.admin_actualizar_restaurante(uuid, text, text, text, text, text) to authenticated;

-- =============================================================================
-- 2 · admin_cambiar_suscripcion: activar / desactivar y vencimiento
-- =============================================================================
-- Es LA acción de "Desactivar restaurante" del panel. Desactivar NO borra:
-- solo pone `suscripcion_activa = false`, y con eso la arquitectura actual
-- hace el resto: `suSuscripcionVencida()` manda a todos los roles no
-- super_admin a la pantalla de suscripción vencida, y las policies de
-- escritura (`puedo_escribir_en` → `suscripcion_vigente`) dejan de dejar
-- operar al restaurante. Los datos, usuarios y historial quedan intactos.
-- Lo mismo a la inversa para reactivar.
-- Cuando existe la tabla `suscripciones_historial` (suscripciones_super_admin.sql)
-- cada cambio real queda registrado ahí como suspensión / reactivación / ajuste.
create or replace function public.admin_cambiar_suscripcion(
  p_restaurante_id uuid,
  p_activa boolean,
  p_fecha_vencimiento timestamptz
)
returns setof public.restaurantes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prev public.restaurantes;
  v_r public.restaurantes;
  v_accion text;
begin
  if p_restaurante_id is null then
    raise exception 'Falta el restaurante.';
  end if;
  if not (select public.soy_super_admin()) then
    raise exception 'Solo el super administrador puede cambiar suscripciones.';
  end if;
  if p_activa is null then
    raise exception 'El estado de la suscripción no puede quedar vacío.';
  end if;

  select * into v_prev
    from public.restaurantes
   where id = p_restaurante_id;
  if not found then
    raise exception 'Restaurante no encontrado.';
  end if;

  update public.restaurantes r
     set suscripcion_activa = p_activa,
         fecha_vencimiento  = p_fecha_vencimiento
   where r.id = p_restaurante_id
  returning r.* into v_r;

  if to_regclass('public.suscripciones_historial') is not null
     and (v_prev.suscripcion_activa is distinct from v_r.suscripcion_activa
          or v_prev.fecha_vencimiento is distinct from v_r.fecha_vencimiento) then
    v_accion := case
      when v_prev.suscripcion_activa and not v_r.suscripcion_activa then 'suspension'
      when not v_prev.suscripcion_activa and v_r.suscripcion_activa then 'reactivacion'
      else 'ajuste'
    end;
    insert into public.suscripciones_historial
      (restaurante_id, accion, plan_id, plan_anterior_id,
       fecha_inicio, fecha_vencimiento, suscripcion_activa, motivo, creado_por)
    values
      (v_r.id, v_accion, v_r.plan_id, v_r.plan_id,
       v_r.fecha_inicio, v_r.fecha_vencimiento, v_r.suscripcion_activa,
       case when v_accion = 'ajuste'
            then 'Ajuste de vencimiento desde la ficha del restaurante'
       end,
       null);
  end if;

  return next v_r;
end;
$$;

comment on function public.admin_cambiar_suscripcion(uuid, boolean, timestamptz) is
  'Super admin: activa o desactiva la suscripción de un restaurante y fija su fecha de vencimiento (null = sin vencimiento). Desactivar no borra nada: bloquea el acceso de los roles de ese restaurante vía suscripcion_vigente/suSuscripcionVencida. Si existe suscripciones_historial, cada cambio real deja fila (suspension/reactivacion/ajuste). SECURITY DEFINER con control de rol.';

revoke execute on function public.admin_cambiar_suscripcion(uuid, boolean, timestamptz) from public;
revoke execute on function public.admin_cambiar_suscripcion(uuid, boolean, timestamptz) from anon;
grant execute on function public.admin_cambiar_suscripcion(uuid, boolean, timestamptz) to authenticated;

-- =============================================================================
-- 3 · Verificación (SQL Editor)
-- =============================================================================

-- 3.1 · `authenticated` ejecuta las RPC de gestión; `anon`, NO.
select p.proname,
       has_function_privilege('anon', p.oid, 'execute') as anon_puede,
       has_function_privilege('authenticated', p.oid, 'execute') as authenticated_puede
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('admin_actualizar_restaurante', 'admin_cambiar_suscripcion')
 order by p.proname;
-- Esperado: anon_puede = false en las dos filas.

-- 3.2 · La RLS de `restaurantes` quedó EXACTAMENTE igual (las 2 policies
-- originales de 01_rls_completo.sql, ninguna agregada ni quitada).
select c.relname as tabla,
       c.relrowsecurity as rls_activo,
       coalesce(array_to_string(array_agg(pol.polname order by pol.polname), ', '), '(ninguna)') as policies
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  left join pg_policy pol on pol.polrelid = c.oid
 where n.nspname = 'public'
   and c.relname = 'restaurantes'
 group by c.relname, c.relrowsecurity;

-- 3.3 · El grant columnario de `authenticated` sigue cerrado: suscripcion_activa
-- y fecha_vencimiento tienen que dar false (si dieran true, un admin de cuenta
-- podría reactivarse solo desde la app y este archivo no hizo falta).
select a.attname as columna,
       has_column_privilege('authenticated', 'public.restaurantes', a.attname, 'update') as puede_actualizar
  from pg_attribute a
 where a.attrelid = 'public.restaurantes'::regclass
   and a.attnum > 0
   and not a.attisdropped
 order by a.attname;


-- #############################################################################
-- # 13/19 · usuarios_super_admin.sql
-- #############################################################################

-- -- =============================================================================
-- Gestión de usuarios desde el panel del super admin
-- =============================================================================
-- POR QUÉ EXISTE ESTE ARCHIVO (y por qué NO se toca la RLS):
--
-- `usuarios` está diseñada para que cada admin escriba SOLO las filas de SU
-- restaurante: policies `usuarios_insert_admin` / `usuarios_update_admin` /
-- `usuarios_delete_admin` de 01_rls_completo.sql exigen
-- `restaurante_id = mi_restaurante_id()`. El super_admin no pertenece a ningún
-- restaurante (`usuarios.restaurante_id` es null), así que medido contra la
-- base real sus escrituras directas devuelven 0 filas o 42501. Mismo problema
-- —misma solución— que `admin_super_restaurante.sql`: funciones
-- `security definer` que el navegador llama por RPC con su propio JWT, la
-- función exige `soy_super_admin()` y solo entonces escribe. RLS intacta, sin
-- `service_role` en el frontend, sin INSERT/DELETE nuevos.
--
-- Qué NO hace este archivo:
--   * No borra usuarios jamás (la baja es `activo = false`, siempre reversible);
--     el borrado físico de perfiles es potestad de cada admin sobre SU gente y
--     la cascada de auth.users sigue siendo asunto de la base.
--   * No otorga `super_admin` a nadie: ningún rol sale del formulario, y la
--     designación de administrador solo puede bajar a `admin_restaurante`.
--   * No cambia `restaurante_id`: un usuario se designa administrador del
--     restaurante al que YA pertenece (el vínculo usuario → restaurante es el
--     límite de aislamiento y se conserva sin tocar).

-- =============================================================================
-- 1 · admin_cambiar_estado_usuario: activar / desactivar sin borrar
-- =============================================================================
-- Es LA acción de "Desactivar usuario" del panel. Desactivar no borra: solo
-- pone `activo = false`, y con eso `validar_acceso_restaurante` deja de dejar
-- entrar al usuario (chequeo de servidor que ya existe en
-- 00_seguridad_rpcs.sql y que la suite verificar-flujo ejercita en 17h-17n).
-- Dos salvaguardas propias de la plataforma:
--   * nadie se desactiva a sí mismo (evita que el super admin se deje fuera);
--   * nunca puede quedar la plataforma sin al menos un super admin activo.
create or replace function public.admin_cambiar_estado_usuario(
  p_usuario_id uuid,
  p_activo boolean
)
returns setof public.usuarios
language plpgsql
security definer
set search_path = public
as $$
declare
  v_u public.usuarios;
begin
  if p_usuario_id is null then
    raise exception 'Falta el usuario.';
  end if;
  if not (select public.soy_super_admin()) then
    raise exception 'Solo el super administrador puede gestionar usuarios.';
  end if;
  if p_activo is null then
    raise exception 'El estado del usuario no puede quedar vacío.';
  end if;

  select * into v_u from public.usuarios where id = p_usuario_id;
  if not found then
    raise exception 'Usuario no encontrado.';
  end if;

  if not p_activo and p_usuario_id = auth.uid() then
    raise exception 'No puedes desactivar tu propia cuenta.';
  end if;

  if not p_activo and v_u.rol = 'super_admin' then
    if not exists (
      select 1 from public.usuarios
       where rol = 'super_admin' and activo is true and id <> p_usuario_id
    ) then
      raise exception 'Debe quedar al menos un super administrador activo.';
    end if;
  end if;

  update public.usuarios u
     set activo = p_activo
   where u.id = p_usuario_id
  returning u.* into v_u;

  return next v_u;
end;
$$;

comment on function public.admin_cambiar_estado_usuario(uuid, boolean) is
  'Super admin: activa o desactiva un usuario de la plataforma sin borrarlo. No permite desactivarse a uno mismo ni dejar la plataforma sin super administradores activos. SECURITY DEFINER con control de rol.';

revoke execute on function public.admin_cambiar_estado_usuario(uuid, boolean) from public;
revoke execute on function public.admin_cambiar_estado_usuario(uuid, boolean) from anon;
grant execute on function public.admin_cambiar_estado_usuario(uuid, boolean) to authenticated;

-- =============================================================================
-- 2 · admin_designar_administrador: cambiar el administrador de un restaurante
-- =============================================================================
-- Designa a un usuario YA PERTENECIENTE al restaurante como
-- `admin_restaurante`. Solo se toca la columna `rol`: `restaurante_id` no se
-- mueve jamás (el usuario sigue siendo de SU local) y el administrador
-- anterior conserva su rol — pueden coexistir varios administradores por
-- restaurante, que es como opera la plataforma (el alta con admin incluido
-- viene de la Edge Function `crear-restaurante` y no retira a nadie).
create or replace function public.admin_designar_administrador(
  p_restaurante_id uuid,
  p_usuario_id uuid
)
returns setof public.usuarios
language plpgsql
security definer
set search_path = public
as $$
declare
  v_u public.usuarios;
begin
  if p_restaurante_id is null or p_usuario_id is null then
    raise exception 'Faltan el restaurante o el usuario.';
  end if;
  if not (select public.soy_super_admin()) then
    raise exception 'Solo el super administrador puede designar administradores.';
  end if;

  if not exists (select 1 from public.restaurantes where id = p_restaurante_id) then
    raise exception 'Restaurante no encontrado.';
  end if;

  select * into v_u from public.usuarios where id = p_usuario_id;
  if not found then
    raise exception 'Usuario no encontrado.';
  end if;

  if v_u.restaurante_id is distinct from p_restaurante_id then
    raise exception 'El usuario no pertenece a este restaurante.';
  end if;

  if coalesce(v_u.activo, false) = false then
    raise exception 'El usuario está desactivado: actívalo antes de designarlo administrador.';
  end if;

  if v_u.rol <> 'admin_restaurante' then
    update public.usuarios u
       set rol = 'admin_restaurante'
     where u.id = p_usuario_id
    returning u.* into v_u;
  end if;

  return next v_u;
end;
$$;

comment on function public.admin_designar_administrador(uuid, uuid) is
  'Super admin: designa a un usuario que YA pertenece al restaurante como admin_restaurante. Solo cambia la columna rol; restaurante_id se conserva y los administradores previos no se retiran (varios admins por restaurante). SECURITY DEFINER con control de rol.';

revoke execute on function public.admin_designar_administrador(uuid, uuid) from public;
revoke execute on function public.admin_designar_administrador(uuid, uuid) from anon;
grant execute on function public.admin_designar_administrador(uuid, uuid) to authenticated;

-- =============================================================================
-- 3 · admin_ultimos_accesos: último ingreso por usuario
-- =============================================================================
-- `auth.users.last_sign_in_at` vive en el schema `auth`, que PostgREST NO
-- expone al cliente: ni siquiera el super admin puede leerlo con un select
-- directo. Esta RPC security definer (dueño: postgres, que sí lee auth.users)
-- lo devuelve por usuario, y como exige ser super admin, ningún perfil ajeno
-- filtra horarios de ingreso. Null = la cuenta nunca inició sesión.
create or replace function public.admin_ultimos_accesos()
returns table (id uuid, ultimo_acceso timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (select public.soy_super_admin()) then
    raise exception 'Solo el super administrador puede ver los accesos.';
  end if;

  return query
    select u.id, a.last_sign_in_at
      from public.usuarios u
      left join auth.users a on a.id = u.id;
end;
$$;

comment on function public.admin_ultimos_accesos() is
  'Super admin: último acceso (auth.users.last_sign_in_at) de cada usuario de la plataforma; null si nunca inició sesión. SECURITY DEFINER con control de rol, porque el schema auth no está expuesto a PostgREST.';

revoke execute on function public.admin_ultimos_accesos() from public;
revoke execute on function public.admin_ultimos_accesos() from anon;
grant execute on function public.admin_ultimos_accesos() to authenticated;

-- =============================================================================
-- 4 · Verificación (SQL Editor)
-- =============================================================================

-- 4.1 · Las 3 RPC: `authenticated` ejecuta, `anon` NO.
select p.proname,
       has_function_privilege('anon', p.oid, 'execute') as anon_puede,
       has_function_privilege('authenticated', p.oid, 'execute') as authenticated_puede
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('admin_cambiar_estado_usuario', 'admin_designar_administrador', 'admin_ultimos_accesos')
 order by p.proname;
-- Esperado: anon_puede = false en las 3 filas.

-- 4.2 · La RLS de `usuarios` quedó EXACTAMENTE IGUAL (las 4 policies de
-- 01_rls_completo.sql, ninguna agregada ni quitada).
select c.relname as tabla,
       c.relrowsecurity as rls_activo,
       coalesce(array_to_string(array_agg(pol.polname order by pol.polname), ', '), '(ninguna)') as policies
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  left join pg_policy pol on pol.polrelid = c.oid
 where n.nspname = 'public'
   and c.relname = 'usuarios'
 group by c.relname, c.relrowsecurity;

-- 4.3 · El último acceso se lee desde auth.users (este schema NO está expuesto
-- a PostgREST, por eso la RPC de la sección 3). En el SQL Editor (postgres,
-- sin JWT) `soy_super_admin()` da false y la RPC rechaza; la lectura directa
-- equivalente para chequear la columna es:
--   select id, email, last_sign_in_at from auth.users order by email;
-- Null en last_sign_in_at = la cuenta nunca inició sesión.


-- #############################################################################
-- # 14/19 · estadisticas_super_admin.sql
-- #############################################################################

-- -- =============================================================================
-- Estadísticas globales de la plataforma (panel del super admin)
-- =============================================================================
-- POR QUÉ EXISTE ESTE ARCHIVO:
--
-- El panel no puede agregar sumando filas descargadas al navegador: `pedidos` y
-- `cuentas` crecen sin techo en TODOS los restaurantes y el super admin no tiene
-- por qué leerlas una por una. Esta RPC `security definer` calcula el resumen,
-- las comparaciones, el ranking y la evolución con COUNT/SUM/GROUP BY en la base
-- y devuelve un único JSON. Una sola llamada, sin filas crudas.
--
-- Aislamiento: exige `soy_super_admin()` (mismo patrón que
-- usuarios_super_admin.sql / suscripciones_super_admin.sql). Un administrador de
-- restaurante NO pertenece al grupo super_admin y la función lo rechaza: jamás
-- ve totales de otros restaurantes. La RLS de las tablas no se toca.
--
-- Definiciones de las métricas (las mismas que el backend local en
-- src/lib/estadisticas.ts, para que ambos modos midan igual):
--   * venta   = suma de `cuentas.total` con `estado = 'pagada'` (sin contar
--               anuladas), fechada por `pagado_at`;
--   * pedido  = comanda creada en el periodo, sin importar su estado;
--   * activo  = `suscripcion_activa` y vencimiento nulo o futuro (ahora).
-- `restaurantesRegistrados`, `usuarios`, `usuariosActivos` y `administradores`
-- son estado actual (no dependen del periodo); el resto sí. `administradores`
-- cuenta los perfiles con rol de administrador (`admin_restaurante` de cada
-- local, más el `super_admin` de la plataforma).

create or replace function public.admin_estadisticas_globales(
  p_desde timestamptz,
  p_hasta timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_desde timestamptz := coalesce(p_desde, date_trunc('day', now()));
  v_hasta timestamptz := coalesce(p_hasta, now());
  -- Cortes de las comparaciones Hoy / Esta semana (lunes) / Este mes.
  v_hoy timestamptz := date_trunc('day', now());
  v_semana timestamptz := date_trunc('week', now());
  v_mes timestamptz := date_trunc('month', now());
  v_resumen jsonb;
  v_comparaciones jsonb;
  v_ranking jsonb;
  v_evolucion jsonb;
begin
  if not (select public.soy_super_admin()) then
    raise exception 'Solo el super administrador puede ver las estadísticas globales.';
  end if;

  -- 1 · Resumen ---------------------------------------------------------------
  select jsonb_build_object(
    'restaurantesRegistrados', (select count(*) from public.restaurantes),
    'restaurantesActivos', (
      select count(*) from public.restaurantes
       where suscripcion_activa
         and (fecha_vencimiento is null or fecha_vencimiento >= now())
    ),
    'usuarios', (select count(*) from public.usuarios),
    'usuariosActivos', (select count(*) from public.usuarios where activo is true),
    'administradores', (select count(*) from public.usuarios where rol in ('admin_restaurante', 'super_admin')),
    'pedidos', (
      select count(*) from public.pedidos
       where created_at >= v_desde and created_at <= v_hasta
    ),
    'ventas', (
      select coalesce(sum(total), 0) from public.cuentas
       where estado = 'pagada' and pagado_at >= v_desde and pagado_at <= v_hasta
    ),
    'restaurantesNuevos', (
      select count(*) from public.restaurantes
       where created_at >= v_desde and created_at <= v_hasta
    )
  ) into v_resumen;

  -- 2 · Comparaciones hoy / semana / mes -------------------------------------
  select jsonb_build_object(
    'pedidos', jsonb_build_object(
      'hoy', (select count(*) from public.pedidos where created_at >= v_hoy),
      'semana', (select count(*) from public.pedidos where created_at >= v_semana),
      'mes', (select count(*) from public.pedidos where created_at >= v_mes)
    ),
    'ventas', jsonb_build_object(
      'hoy', (select coalesce(sum(total), 0) from public.cuentas where estado = 'pagada' and pagado_at >= v_hoy),
      'semana', (select coalesce(sum(total), 0) from public.cuentas where estado = 'pagada' and pagado_at >= v_semana),
      'mes', (select coalesce(sum(total), 0) from public.cuentas where estado = 'pagada' and pagado_at >= v_mes)
    ),
    'restaurantesNuevos', jsonb_build_object(
      'hoy', (select count(*) from public.restaurantes where created_at >= v_hoy),
      'semana', (select count(*) from public.restaurantes where created_at >= v_semana),
      'mes', (select count(*) from public.restaurantes where created_at >= v_mes)
    )
  ) into v_comparaciones;

  -- 3 · Ranking (solo restaurantes con actividad en el periodo) --------------
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'restauranteId', a.restaurante_id,
        'nombre', a.nombre,
        'pedidos', a.pedidos,
        'ventas', a.ventas
      )
      order by a.ventas desc, a.pedidos desc, a.nombre
    ),
    '[]'::jsonb
  )
  into v_ranking
  from (
    select r.id as restaurante_id,
           r.nombre,
           coalesce(p.pedidos, 0) as pedidos,
           coalesce(v.ventas, 0) as ventas
      from public.restaurantes r
      left join (
        select restaurante_id, count(*) as pedidos
          from public.pedidos
         where created_at >= v_desde and created_at <= v_hasta
         group by restaurante_id
      ) p on p.restaurante_id = r.id
      left join (
        select restaurante_id, sum(total) as ventas
          from public.cuentas
         where estado = 'pagada' and pagado_at >= v_desde and pagado_at <= v_hasta
         group by restaurante_id
      ) v on v.restaurante_id = r.id
  ) a
  where a.pedidos > 0 or a.ventas > 0;

  -- 4 · Evolución diaria del periodo -----------------------------------------
  -- generate_series garantiza los días sin actividad (valor 0), así el gráfico
  -- no salta fechas.
  with dias as (
    select generate_series(v_desde::date, v_hasta::date, interval '1 day')::date as dia
  ),
  r as (
    select created_at::date as dia, count(*) as n
      from public.restaurantes
     where created_at >= v_desde and created_at <= v_hasta
     group by 1
  ),
  p as (
    select created_at::date as dia, count(*) as n
      from public.pedidos
     where created_at >= v_desde and created_at <= v_hasta
     group by 1
  ),
  v as (
    select pagado_at::date as dia, sum(total) as n
      from public.cuentas
     where estado = 'pagada' and pagado_at >= v_desde and pagado_at <= v_hasta
     group by 1
  )
  select jsonb_build_object(
    'restaurantes', (
      select coalesce(jsonb_agg(
               jsonb_build_object('fecha', to_char(d.dia, 'YYYY-MM-DD'), 'valor', coalesce(r.n, 0))
               order by d.dia
             ), '[]'::jsonb)
        from dias d left join r on r.dia = d.dia
    ),
    'pedidos', (
      select coalesce(jsonb_agg(
               jsonb_build_object('fecha', to_char(d.dia, 'YYYY-MM-DD'), 'valor', coalesce(p.n, 0))
               order by d.dia
             ), '[]'::jsonb)
        from dias d left join p on p.dia = d.dia
    ),
    'ventas', (
      select coalesce(jsonb_agg(
               jsonb_build_object('fecha', to_char(d.dia, 'YYYY-MM-DD'), 'valor', coalesce(v.n, 0))
               order by d.dia
             ), '[]'::jsonb)
        from dias d left join v on v.dia = d.dia
    )
  ) into v_evolucion;

  return jsonb_build_object(
    'desde', v_desde,
    'hasta', v_hasta,
    'resumen', v_resumen,
    'comparaciones', v_comparaciones,
    'ranking', v_ranking,
    'evolucion', v_evolucion
  );
end;
$$;

comment on function public.admin_estadisticas_globales(timestamptz, timestamptz) is
  'Super admin: estadísticas globales (resumen, comparaciones hoy/semana/mes, ranking por restaurante y evolución diaria) calculadas con agregados en la base. SECURITY DEFINER con control de rol; nunca devuelve filas crudas.';

revoke execute on function public.admin_estadisticas_globales(timestamptz, timestamptz) from public;
revoke execute on function public.admin_estadisticas_globales(timestamptz, timestamptz) from anon;
grant execute on function public.admin_estadisticas_globales(timestamptz, timestamptz) to authenticated;

-- =============================================================================
-- Verificación (SQL Editor)
-- =============================================================================
-- En el SQL Editor (postgres, sin JWT) `soy_super_admin()` da false y la RPC
-- rechaza: el control de rol se prueba con un JWT real de super admin.
-- Lo que sí se verifica acá es el permiso:

select p.proname,
       has_function_privilege('anon', p.oid, 'execute') as anon_puede,
       has_function_privilege('authenticated', p.oid, 'execute') as authenticated_puede
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname = 'admin_estadisticas_globales';
-- Esperado: anon_puede = false, authenticated_puede = true.


-- #############################################################################
-- # 15/19 · soporte.sql
-- #############################################################################

-- -- =============================================================================
-- SOPORTE (Admin del restaurante → Super Admin) — Mesora
-- =============================================================================
-- Tickets de soporte. El admin del restaurante los REPORTA desde su panel y el
-- super admin los gestiona (asigna, cambia de estado y cierra). El super admin
-- NO crea tickets desde su panel.
--
-- Seguridad:
--   * SELECT: el super admin ve todos; el `admin_restaurante` solo los de SU
--     restaurante (`mi_restaurante_id()`).
--   * INSERT: solo el `admin_restaurante`, y solo para su propio restaurante
--     (`restaurante_id = mi_restaurante_id()`).
--   * UPDATE: solo el super admin (gestión: estado, prioridad, responsable).
--   * Sin policy de DELETE: un ticket no se borra, se cierra (`estado`).
--   * Aditivo: no toca ninguna tabla existente.
-- =============================================================================

create table if not exists public.soporte_tickets (
  id uuid primary key default gen_random_uuid(),
  -- Código legible para mostrar en la UI (ej. TK-3F9A1C). Único por ticket.
  codigo text not null unique
    default ('TK-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))),
  -- Restaurante afectado (los tickets de plataforma pueden ir sin restaurante).
  restaurante_id uuid references public.restaurantes(id) on delete set null,
  -- Usuario que reporta o al que se refiere el ticket, si aplica.
  usuario_id uuid references public.usuarios(id) on delete set null,
  asunto text not null,
  descripcion text not null,
  prioridad text not null default 'media'
    check (prioridad in ('baja', 'media', 'alta', 'urgente')),
  estado text not null default 'abierto'
    check (estado in ('abierto', 'en_progreso', 'resuelto', 'cerrado')),
  -- Responsable de resolverlo (super administrador de la plataforma).
  responsable_id uuid references public.usuarios(id) on delete set null,
  responsable text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resuelto_at timestamptz
);

create index if not exists soporte_tickets_estado_idx
  on public.soporte_tickets (estado, prioridad, created_at desc);
create index if not exists soporte_tickets_restaurante_idx
  on public.soporte_tickets (restaurante_id, created_at desc);

comment on table public.soporte_tickets is
  'Tickets de soporte. El admin del restaurante los reporta; solo el super admin
  los ve todos y los gestiona. Un ticket no se borra: pasa por abierto →
  en_progreso → resuelto → cerrado.';

alter table public.soporte_tickets enable row level security;

-- Lectura: super admin (todos) o admin del restaurante (los suyos).
drop policy if exists soporte_tickets_select_super on public.soporte_tickets;
drop policy if exists soporte_tickets_select on public.soporte_tickets;
create policy soporte_tickets_select on public.soporte_tickets
  for select to authenticated
  using (
    public.soy_super_admin()
    or (
      public.tengo_rol(array['admin_restaurante'])
      and restaurante_id = public.mi_restaurante_id()
    )
  );

-- Alta: solo el admin del restaurante, y solo para su propio restaurante.
drop policy if exists soporte_tickets_insert_super on public.soporte_tickets;
drop policy if exists soporte_tickets_insert on public.soporte_tickets;
create policy soporte_tickets_insert on public.soporte_tickets
  for insert to authenticated
  with check (
    public.tengo_rol(array['admin_restaurante'])
    and restaurante_id = public.mi_restaurante_id()
  );

-- Gestión: solo el super admin.
drop policy if exists soporte_tickets_update_super on public.soporte_tickets;
drop policy if exists soporte_tickets_update on public.soporte_tickets;
create policy soporte_tickets_update on public.soporte_tickets
  for update to authenticated
  using (public.soy_super_admin())
  with check (public.soy_super_admin());
-- Sin policy de DELETE.

revoke all on public.soporte_tickets from anon;
grant select, insert, update on public.soporte_tickets to authenticated;
revoke truncate on public.soporte_tickets from authenticated;

-- -----------------------------------------------------------------------------
-- updated_at + resuelto_at automáticos
-- -----------------------------------------------------------------------------
create or replace function public.soporte_ticket_touch()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at := now();
  -- Sella la fecha de resolución la primera vez que pasa a `resuelto`.
  if new.estado = 'resuelto' and old.estado <> 'resuelto' and new.resuelto_at is null then
    new.resuelto_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_soporte_ticket_touch on public.soporte_tickets;
create trigger trg_soporte_ticket_touch
  before update on public.soporte_tickets
  for each row execute function public.soporte_ticket_touch();

-- -----------------------------------------------------------------------------
-- Verificación (SQL Editor)
-- -----------------------------------------------------------------------------
select
  (select relrowsecurity from pg_class where oid = 'public.soporte_tickets'::regclass) as rls_ok,
  (select array_to_string(array_agg(cmd order by cmd), ', ') from pg_policies
     where schemaname = 'public' and tablename = 'soporte_tickets') as policies,
  (select count(*) = 0 from pg_policies
     where schemaname = 'public' and tablename = 'soporte_tickets' and cmd = 'DELETE') as sin_delete_ok,
  (select count(*) = 1 from pg_trigger
     where not tgisinternal and tgrelid = 'public.soporte_tickets'::regclass
       and tgname = 'trg_soporte_ticket_touch') as trigger_ok,
  (select has_table_privilege('anon', 'public.soporte_tickets', 'select')) as anon_select,
  (select has_table_privilege('authenticated', 'public.soporte_tickets', 'select')) as auth_select;
-- Esperado: rls_ok=true, policies=INSERT, SELECT, UPDATE,
-- sin_delete_ok=true, trigger_ok=true, anon_select=false, auth_select=true.


-- #############################################################################
-- # 16/19 · suscripciones_super_admin.sql
-- #############################################################################

-- -- =============================================================================
-- SUSCRIPCIONES (Super Admin) — Mesora
-- =============================================================================
-- Reutiliza lo que ya existe y agrega SOLO lo mínimo:
--
--   * restaurantes.suscripcion_activa + fecha_vencimiento → siguen siendo la
--     fuente de verdad del estado (la RLS y suSuscripcionVencida ya los leen).
--     Estados derivados en frontend: activa / por vencer / vencida / suspendida
--     ("suspendida" = suscripcion_activa = false; "por vencer" = vencimiento
--     dentro de la ventana de DIAS_PARA_VENCER, nunca se guarda en columna).
--   * planes (tabla catálogo): UN SOLO plan activo "Mesora Pro" (clave
--     `mesora_pro`). El precio mensual NO vive aquí: es `configuracion_global.
--     precio_plan_mensual` (editable desde el panel). Los planes antiguos
--     (Básico/Profesional/Premium) quedan como filas inactivas de catálogo
--     para que el historial siga resolviendo sus nombres.
--   * restaurantes.plan_id (FK, default = Mesora Pro) + fecha_inicio (backfill
--     desde created_at). Aditivo: no toca columnas existentes ni RLS.
--   * suscripciones_historial: auditoría append-only de cada acción de
--     suscripción (renovar / cambiar plan / suspender / reactivar / ajuste).
--     Nunca se borra desde la aplicación.
--
-- Seguridad: las 4 RPCs son SECURITY DEFINER con control de rol
-- `soy_super_admin()` (igual que admin_actualizar_restaurante); RLS de
-- restaurantes intacta y el grant UPDATE de authenticated sigue limitado a
-- las 5 columnas de siempre (plan_id y fecha_inicio NO se conceden: los
-- administradores de restaurante no pueden modificar su propia suscripción).
--
-- Este archivo no hace DROP, no desactiva RLS y no modifica INSTALL.sql.
-- Dependencia de orden: `admin_cambiar_suscripcion` (definida en
-- admin_super_restaurante.sql) registra en suscripciones_historial cuando la
-- tabla existe; si re-ejecutas ese archivo, vuelve a correr este para dejar
-- la versión completa de las RPCs nuevas.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1 · planes: catálogo con un único plan activo (precio vive en configuración)
-- -----------------------------------------------------------------------------
create table if not exists public.planes (
  id uuid primary key default gen_random_uuid(),
  clave text not null unique,
  nombre text not null,
  orden integer not null default 0,
  -- Preparados para cuando se definan; NULL = todavía sin definir.
  precio_mensual numeric,
  max_usuarios integer,
  duracion_dias integer,
  funcionalidades jsonb,
  -- false = plan retirado: se conserva en el catálogo para que el historial
  -- siga resolviendo su nombre, pero no se puede asignar a ningún restaurante.
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.planes
  add column if not exists activo boolean not null default true;

comment on table public.planes is
  'Catálogo de planes de suscripción de Mesora. Activo: solo el plan único
  Mesora Pro (su precio mensual editable vive en configuracion_global).
  `activo = false` retira un plan sin borrar su fila (el historial lo usa).';

alter table public.planes enable row level security;

drop policy if exists planes_select on public.planes;
create policy planes_select on public.planes
  for select to authenticated using (true);
-- Sin policies de escritura: nadie administra los planes desde el cliente.

revoke all on public.planes from anon;
revoke truncate on public.planes from authenticated;

-- Siembra: el plan único activo y (para bases ya pobladas) el retiro de los
-- planes antiguos sin borrarlos ni romper las FK del historial.
insert into public.planes (clave, nombre, orden) values
  ('mesora_pro', 'Mesora Pro', 1)
on conflict (clave) do nothing;

do $$
declare
  v_pro uuid;
begin
  select id into v_pro from public.planes where clave = 'mesora_pro';
  if v_pro is null then
    raise exception 'No existe el plan "mesora_pro": revisar la siembra de planes.';
  end if;

  -- Retiran los planes heredados (Básico/Profesional/Premium) conservando su
  -- fila para que el historial de suscripciones siga resolviendo el nombre.
  update public.planes
     set activo = false, orden = orden + 10
   where clave in ('basico', 'profesional', 'premium');
end $$;

-- -----------------------------------------------------------------------------
-- 2 · restaurantes.plan_id + fecha_inicio (aditivo, con backfill)
-- -----------------------------------------------------------------------------
alter table public.restaurantes
  add column if not exists plan_id uuid references public.planes(id);

alter table public.restaurantes
  add column if not exists fecha_inicio timestamptz;

do $$
declare
  v_pro uuid;
begin
  select id into v_pro from public.planes where clave = 'mesora_pro';
  if v_pro is null then
    raise exception 'No existe el plan mesora_pro: revisar la siembra de planes.';
  end if;

  -- Backfill: los restaurantes existentes pasan al plan único y su periodo
  -- de suscripción comienza cuando se registraron.
  update public.restaurantes set plan_id = v_pro where plan_id is null;
  update public.restaurantes set plan_id = v_pro where plan_id is not null;
  update public.restaurantes set fecha_inicio = created_at where fecha_inicio is null;

  execute format('alter table public.restaurantes alter column plan_id set default %L', v_pro);
  execute 'alter table public.restaurantes alter column plan_id set not null';
  execute 'alter table public.restaurantes alter column fecha_inicio set default now()';
  execute 'alter table public.restaurantes alter column fecha_inicio set not null';
end $$;

comment on column public.restaurantes.plan_id is
  'Plan de suscripción vigente (FK a planes). Solo lo cambia el super admin
  vía suscripciones_cambiar_plan: el grant UPDATE de authenticated no incluye
  esta columna.';
comment on column public.restaurantes.fecha_inicio is
  'Inicio del periodo de suscripción vigente. Lo reinicia una renovación que
  arranca un periodo nuevo (vencida/suspendida); una suspensión pausa el
  acceso sin reiniciarlo.';

-- -----------------------------------------------------------------------------
-- 3 · suscripciones_historial: auditoría append-only (no se borra jamás)
-- -----------------------------------------------------------------------------
create table if not exists public.suscripciones_historial (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes(id) on delete cascade,
  accion text not null check (accion in
    ('renovacion', 'cambio_plan', 'suspension', 'reactivacion', 'ajuste')),
  plan_id uuid references public.planes(id),
  plan_anterior_id uuid references public.planes(id),
  fecha_inicio timestamptz,
  fecha_vencimiento timestamptz,
  suscripcion_activa boolean,
  motivo text,
  creado_por uuid,
  created_at timestamptz not null default now()
);

create index if not exists suscripciones_historial_rid_idx
  on public.suscripciones_historial (restaurante_id, created_at desc);

comment on table public.suscripciones_historial is
  'Historial de acciones de suscripción por restaurante, en orden append-only:
  cada renovación, cambio de plan, suspensión o reactivación deja una fila con
  el estado resultante. La aplicación nunca borra ni actualiza estas filas.';

alter table public.suscripciones_historial enable row level security;

drop policy if exists historial_select on public.suscripciones_historial;
create policy historial_select on public.suscripciones_historial
  for select to authenticated using (public.soy_super_admin());
-- Sin policy de escritura: las filas solo nacen desde las RPCs SECURITY DEFINER.

revoke all on public.suscripciones_historial from anon;
revoke truncate on public.suscripciones_historial from authenticated;

-- -----------------------------------------------------------------------------
-- 4 · RPCs de administración (solo super admin; SECURITY DEFINER)
-- -----------------------------------------------------------------------------
create or replace function public.suscripciones_renovar(
  p_restaurante_id uuid,
  p_fecha_vencimiento timestamptz,
  p_creado_por uuid default null
) returns setof public.restaurantes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_r public.restaurantes;
begin
  if not public.soy_super_admin() then
    raise exception 'Solo el super administrador puede administrar suscripciones.'
      using errcode = '42501';
  end if;
  if p_fecha_vencimiento is null then
    raise exception 'Debe indicar la nueva fecha de vencimiento.';
  end if;

  -- Renovar con periodo terminado (vencida/suspendida) arranca un periodo
  -- nuevo (fecha_inicio = ahora); con periodo vigente solo se extiende.
  update public.restaurantes
     set suscripcion_activa = true,
         fecha_vencimiento = p_fecha_vencimiento,
         fecha_inicio = case
           when fecha_vencimiento is null
             or fecha_vencimiento < now()
             or suscripcion_activa = false
           then now()
           else fecha_inicio
         end
   where id = p_restaurante_id
   returning * into v_r;

  if not found then
    raise exception 'Restaurante no encontrado.';
  end if;

  insert into public.suscripciones_historial
    (restaurante_id, accion, plan_id, plan_anterior_id,
     fecha_inicio, fecha_vencimiento, suscripcion_activa, creado_por)
  values
    (v_r.id, 'renovacion', v_r.plan_id, v_r.plan_id,
     v_r.fecha_inicio, v_r.fecha_vencimiento, v_r.suscripcion_activa, p_creado_por);

  return next v_r;
end;
$$;

comment on function public.suscripciones_renovar(uuid, timestamptz, uuid) is
  'Super admin: renueva la suscripción fijando una nueva fecha de vencimiento
  (y reactivándola). Si el periodo anterior había terminado, fecha_inicio pasa
  a ahora. Registra en suscripciones_historial. SECURITY DEFINER con control
  de rol.';

create or replace function public.suscripciones_cambiar_plan(
  p_restaurante_id uuid,
  p_plan_id uuid,
  p_creado_por uuid default null
) returns setof public.restaurantes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_anterior uuid;
  v_r public.restaurantes;
begin
  if not public.soy_super_admin() then
    raise exception 'Solo el super administrador puede administrar suscripciones.'
      using errcode = '42501';
  end if;
  if not exists (select 1 from public.planes where id = p_plan_id and activo) then
    raise exception 'Plan no encontrado.';
  end if;

  select plan_id into v_anterior
    from public.restaurantes
   where id = p_restaurante_id;
  if not found then
    raise exception 'Restaurante no encontrado.';
  end if;

  update public.restaurantes
     set plan_id = p_plan_id
   where id = p_restaurante_id
   returning * into v_r;

  insert into public.suscripciones_historial
    (restaurante_id, accion, plan_id, plan_anterior_id,
     fecha_inicio, fecha_vencimiento, suscripcion_activa, creado_por)
  values
    (v_r.id, 'cambio_plan', v_r.plan_id, v_anterior,
     v_r.fecha_inicio, v_r.fecha_vencimiento, v_r.suscripcion_activa, p_creado_por);

  return next v_r;
end;
$$;

comment on function public.suscripciones_cambiar_plan(uuid, uuid, uuid) is
  'Super admin: cambia el plan de un restaurante. El plan anterior queda
  registrado en suscripciones_historial (no se borra información histórica).
  SECURITY DEFINER con control de rol.';

create or replace function public.suscripciones_suspender(
  p_restaurante_id uuid,
  p_motivo text default null,
  p_creado_por uuid default null
) returns setof public.restaurantes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_r public.restaurantes;
begin
  if not public.soy_super_admin() then
    raise exception 'Solo el super administrador puede administrar suscripciones.'
      using errcode = '42501';
  end if;

  update public.restaurantes
     set suscripcion_activa = false
   where id = p_restaurante_id
   returning * into v_r;

  if not found then
    raise exception 'Restaurante no encontrado.';
  end if;

  insert into public.suscripciones_historial
    (restaurante_id, accion, plan_id, plan_anterior_id,
     fecha_inicio, fecha_vencimiento, suscripcion_activa, motivo, creado_por)
  values
    (v_r.id, 'suspension', v_r.plan_id, v_r.plan_id,
     v_r.fecha_inicio, v_r.fecha_vencimiento, v_r.suscripcion_activa,
     nullif(trim(p_motivo), ''), p_creado_por);

  return next v_r;
end;
$$;

comment on function public.suscripciones_suspender(uuid, text, uuid) is
  'Super admin: suspende la suscripción (suscripcion_activa = false) sin tocar
  fechas ni datos: los roles del restaurante quedan bloqueados por RLS y la
  pantalla de suscripción vencida. Motivo opcional guardado en el historial.
  SECURITY DEFINER con control de rol.';

create or replace function public.suscripciones_reactivar(
  p_restaurante_id uuid,
  p_fecha_vencimiento timestamptz default null,
  p_creado_por uuid default null
) returns setof public.restaurantes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_r public.restaurantes;
begin
  if not public.soy_super_admin() then
    raise exception 'Solo el super administrador puede administrar suscripciones.'
      using errcode = '42501';
  end if;

  -- La suspensión pausa el acceso pero no reinicia el periodo: fecha_inicio
  -- solo cambia si quien renueva envía una fecha nueva (caso vencida).
  update public.restaurantes
     set suscripcion_activa = true,
         fecha_vencimiento = coalesce(p_fecha_vencimiento, fecha_vencimiento)
   where id = p_restaurante_id
   returning * into v_r;

  if not found then
    raise exception 'Restaurante no encontrado.';
  end if;

  insert into public.suscripciones_historial
    (restaurante_id, accion, plan_id, plan_anterior_id,
     fecha_inicio, fecha_vencimiento, suscripcion_activa, creado_por)
  values
    (v_r.id, 'reactivacion', v_r.plan_id, v_r.plan_id,
     v_r.fecha_inicio, v_r.fecha_vencimiento, v_r.suscripcion_activa, p_creado_por);

  return next v_r;
end;
$$;

comment on function public.suscripciones_reactivar(uuid, timestamptz, uuid) is
  'Super admin: reactiva la suscripción suspendida. Si se envía una fecha,
  se usa como nuevo vencimiento (obligatorio práctico cuando la anterior ya
  venció). SECURITY DEFINER con control de rol.';

revoke execute on function public.suscripciones_renovar(uuid, timestamptz, uuid) from public;
revoke execute on function public.suscripciones_renovar(uuid, timestamptz, uuid) from anon;
revoke execute on function public.suscripciones_cambiar_plan(uuid, uuid, uuid) from public;
revoke execute on function public.suscripciones_cambiar_plan(uuid, uuid, uuid) from anon;
revoke execute on function public.suscripciones_suspender(uuid, text, uuid) from public;
revoke execute on function public.suscripciones_suspender(uuid, text, uuid) from anon;
revoke execute on function public.suscripciones_reactivar(uuid, timestamptz, uuid) from public;
revoke execute on function public.suscripciones_reactivar(uuid, timestamptz, uuid) from anon;

grant execute on function public.suscripciones_renovar(uuid, timestamptz, uuid) to authenticated;
grant execute on function public.suscripciones_cambiar_plan(uuid, uuid, uuid) to authenticated;
grant execute on function public.suscripciones_suspender(uuid, text, uuid) to authenticated;
grant execute on function public.suscripciones_reactivar(uuid, timestamptz, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 5 · Verificaciones (si esta fila llega completa, todo lo anterior corrió)
-- -----------------------------------------------------------------------------
select
  (select count(*) = 1 from public.planes
    where clave = 'mesora_pro' and activo)                          as planes_ok,
  (select count(*) = 0 from public.planes
    where activo and clave <> 'mesora_pro')                         as unico_activo_ok,
  (select count(*) = 0 from public.restaurantes where plan_id is null
                                                          or fecha_inicio is null) as backfill_ok,
  (select bool_and(relrowsecurity) from pg_class
    where oid in ('public.planes'::regclass, 'public.suscripciones_historial'::regclass))
                                                                              as rls_ok,
  (select count(*) = 2 from pg_policies
    where schemaname = 'public' and tablename in ('planes', 'suscripciones_historial')
      and cmd = 'SELECT')                                                    as policies_ok,
  (select count(*) = 4 from pg_proc
    where proname in ('suscripciones_renovar', 'suscripciones_cambiar_plan',
                      'suscripciones_suspender', 'suscripciones_reactivar'))
                                                                              as rpcs_ok,
  (select count(*) = 4 from pg_proc p
    where p.proname like 'suscripciones_%'
      and p.proacl is not null and p.proacl::text like '%authenticated%')
                                                                              as grants_ok,
  (select count(*) = 0 from information_schema.role_column_grants
    where table_schema = 'public' and table_name = 'restaurantes'
      and privilege_type = 'UPDATE' and grantee = 'authenticated'
      and column_name in ('plan_id', 'fecha_inicio', 'suscripcion_activa',
                          'fecha_vencimiento'))                              as columnas_cerradas_ok,
  (select count(*) from public.suscripciones_historial)                      as historial_filas;


-- #############################################################################
-- # 17/19 · auditoria.sql
-- #############################################################################

-- -- =============================================================================
-- AUDITORÍA (Super Admin) — Mesora
-- =============================================================================
-- Sistema append-only de registro de acciones importantes de la plataforma.
--
-- Diseño:
--   * `audit_logs`: una fila por acción, con actor (usuario + rol), restaurante
--     afectado (si corresponde), acción, fecha/hora y un `detalle` JSONB con la
--     información relevante. NUNCA se guardan contraseñas ni secretos.
--   * RLS: SOLO el super admin puede CONSULTAR la auditoría global
--     (`soy_super_admin()`); `anon` no toca nada. No hay policies de
--     INSERT/UPDATE/DELETE: las filas nacen únicamente desde funciones
--     SECURITY DEFINER (triggers) o desde la Edge Function con service_role.
--     Es una tabla append-only: la app jamás la modifica ni la borra.
--
-- ¿Cómo se registran las acciones?
--   * Triggers (SECURITY DEFINER) en `restaurantes`, `usuarios` y
--     `suscripciones_historial` capturan las escrituras hechas por el super
--     admin vía RPC (editar restaurante, cambiar rol, activar/desactivar
--     usuario, renovar/suspender/cambiar plan). El actor sale de `auth.uid()`.
--   * Las ALTAS de restaurante y de usuario se hacen en las Edge Functions
--     `crear-restaurante` / `crear-usuario` con service_role (ahí `auth.uid()`
--     es null), así que esas funciones llaman a `registrar_auditoria(...)` con
--     el actor ya verificado contra Auth. Ver `supabase/functions/*`.
--   * NO hay triggers de INSERT sobre `restaurantes`/`usuarios` para no
--     duplicar esas altas.
--
-- Este archivo no hace DROP de datos, no desactiva RLS y es aditivo.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1 · audit_logs
-- -----------------------------------------------------------------------------
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  -- Quién: id de Auth (puede ser null en acciones de sistema/servicio).
  actor_id uuid,
  -- Rol y nombre denormalizados: aunque la tabla usuarios cambiara, el registro
  -- cuenta quién era el actor en el momento de la acción.
  actor_rol text,
  actor_nombre text,
  -- Restaurante afectado, si la acción lo toca.
  restaurante_id uuid references public.restaurantes(id) on delete set null,
  restaurante_nombre text,
  -- Entidad afectada: 'restaurante' | 'usuario' | 'suscripcion' | 'configuracion'.
  entidad text,
  entidad_id uuid,
  -- Clave estable de la acción (ver src/lib/auditoria.ts): restaurante_crear,
  -- restaurante_editar, usuario_crear, usuario_cambiar_rol, usuario_estado,
  -- suscripcion_renovar, suscripcion_cambiar_plan, suscripcion_suspender,
  -- suscripcion_reactivar, suscripcion_ajuste, configuracion_actualizar.
  accion text not null,
  -- Texto legible para la UI.
  descripcion text,
  -- Información relevante de la acción. NUNCA datos sensibles.
  detalle jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_created_idx
  on public.audit_logs (created_at desc);
create index if not exists audit_logs_restaurante_idx
  on public.audit_logs (restaurante_id, created_at desc);
create index if not exists audit_logs_accion_idx
  on public.audit_logs (accion, created_at desc);
create index if not exists audit_logs_actor_idx
  on public.audit_logs (actor_id, created_at desc);

comment on table public.audit_logs is
  'Registro append-only de acciones importantes de la plataforma. Solo el super
  admin puede consultarlo. Las filas nacen desde triggers SECURITY DEFINER o
  desde las Edge Functions con service_role; nunca desde el navegador.';

alter table public.audit_logs enable row level security;

drop policy if exists audit_logs_select_super on public.audit_logs;
create policy audit_logs_select_super on public.audit_logs
  for select to authenticated using (public.soy_super_admin());
-- Sin policies de escritura: la auditoría es inmutable desde el cliente.

revoke all on public.audit_logs from anon;
grant select on public.audit_logs to authenticated;
revoke truncate on public.audit_logs from authenticated;

-- -----------------------------------------------------------------------------
-- 2 · registrar_auditoria: alta explícita (la usan las Edge Functions)
-- -----------------------------------------------------------------------------
-- Recibe el actor ya verificado y resuelve rol/nombre/restaurante en la base.
-- Se ejecuta con SECURITY DEFINER para poder insertar sin RLS de escritura.
-- Permiso: SOLO service_role (las Edge Functions). `authenticated` y `anon`
-- quedan revocados: el navegador no puede escribir auditoría a mano.
create or replace function public.registrar_auditoria(
  p_actor_id uuid,
  p_accion text,
  p_restaurante_id uuid default null,
  p_entidad text default null,
  p_entidad_id uuid default null,
  p_descripcion text default null,
  p_detalle jsonb default null
) returns public.audit_logs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rol text;
  v_nombre text;
  v_rest_nombre text;
  v_row public.audit_logs;
begin
  if coalesce(trim(p_accion), '') = '' then
    raise exception 'La acción de auditoría es obligatoria.';
  end if;

  if p_actor_id is not null then
    select u.rol::text, u.nombre into v_rol, v_nombre
      from public.usuarios u where u.id = p_actor_id;
  end if;

  if p_restaurante_id is not null then
    select r.nombre into v_rest_nombre
      from public.restaurantes r where r.id = p_restaurante_id;
  end if;

  insert into public.audit_logs
    (actor_id, actor_rol, actor_nombre, restaurante_id, restaurante_nombre,
     entidad, entidad_id, accion, descripcion, detalle)
  values
    (p_actor_id, v_rol, v_nombre, p_restaurante_id, v_rest_nombre,
     p_entidad, p_entidad_id, p_accion, p_descripcion, p_detalle)
  returning * into v_row;

  return v_row;
end;
$$;

comment on function public.registrar_auditoria(uuid, text, uuid, text, uuid, text, jsonb) is
  'Alta explícita en audit_logs para las Edge Functions (service_role): recibe el
  actor ya verificado y denormaliza rol/nombre/restaurante. SECURITY DEFINER.
  Ejecución restringida a service_role.';

revoke execute on function public.registrar_auditoria(uuid, text, uuid, text, uuid, text, jsonb) from public;
revoke execute on function public.registrar_auditoria(uuid, text, uuid, text, uuid, text, jsonb) from anon;
revoke execute on function public.registrar_auditoria(uuid, text, uuid, text, uuid, text, jsonb) from authenticated;
grant execute on function public.registrar_auditoria(uuid, text, uuid, text, uuid, text, jsonb) to service_role;

-- -----------------------------------------------------------------------------
-- 3 · Trigger: edición de la ficha de un restaurante
-- -----------------------------------------------------------------------------
-- Solo registra cambios hechos por el super admin (el admin del local edita su
-- propia ficha con `actualizarRestaurante` y eso NO va a la auditoría global).
-- Los cambios de suscripción se registran aparte, desde suscripciones_historial.
create or replace function public.auditar_restaurante()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_rol text;
  v_nombre text;
  v_campos text[] := '{}';
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;
  if not (select public.soy_super_admin()) then
    return new;
  end if;

  if v_actor is not null then
    select u.rol::text, u.nombre into v_rol, v_nombre
      from public.usuarios u where u.id = v_actor;
  end if;

  if new.nombre is distinct from old.nombre then v_campos := array_append(v_campos, 'nombre'); end if;
  if new.ruc is distinct from old.ruc then v_campos := array_append(v_campos, 'ruc'); end if;
  if new.direccion is distinct from old.direccion then v_campos := array_append(v_campos, 'direccion'); end if;
  if new.telefono is distinct from old.telefono then v_campos := array_append(v_campos, 'telefono'); end if;
  if new.email_contacto is distinct from old.email_contacto then v_campos := array_append(v_campos, 'email_contacto'); end if;

  if array_length(v_campos, 1) is null then
    return new;
  end if;

  insert into public.audit_logs
    (actor_id, actor_rol, actor_nombre, restaurante_id, restaurante_nombre,
     entidad, entidad_id, accion, descripcion, detalle)
  values
    (v_actor, v_rol, v_nombre, new.id, new.nombre, 'restaurante', new.id,
     'restaurante_editar',
     format('Editó la ficha de «%s»', new.nombre),
     jsonb_build_object('campos', to_jsonb(v_campos)));

  return new;
end;
$$;

drop trigger if exists trg_auditar_restaurante on public.restaurantes;
create trigger trg_auditar_restaurante
  after update on public.restaurantes
  for each row execute function public.auditar_restaurante();

-- -----------------------------------------------------------------------------
-- 4 · Trigger: cambios de rol o de estado de un usuario
-- -----------------------------------------------------------------------------
create or replace function public.auditar_usuario()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_rol text;
  v_nombre text;
  v_accion text;
  v_desc text;
  v_detalle jsonb;
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;
  -- Cambios de personal hechos por el admin de un restaurante no entran a la
  -- auditoría de plataforma: solo los del super admin.
  if not (select public.soy_super_admin()) then
    return new;
  end if;

  if v_actor is not null then
    select u.rol::text, u.nombre into v_rol, v_nombre
      from public.usuarios u where u.id = v_actor;
  end if;

  if new.rol is distinct from old.rol then
    v_accion := 'usuario_cambiar_rol';
    v_desc := format('Cambió el rol de «%s»: %s → %s', new.nombre, old.rol, new.rol);
    v_detalle := jsonb_build_object('rol_anterior', old.rol, 'rol_nuevo', new.rol);
  elsif coalesce(new.activo, true) is distinct from coalesce(old.activo, true) then
    v_accion := 'usuario_estado';
    v_desc := format('%s al usuario «%s»',
      case when coalesce(new.activo, true) then 'Reactivó' else 'Desactivó' end,
      new.nombre);
    v_detalle := jsonb_build_object('activo', coalesce(new.activo, true));
  else
    return new;
  end if;

  insert into public.audit_logs
    (actor_id, actor_rol, actor_nombre, restaurante_id, restaurante_nombre,
     entidad, entidad_id, accion, descripcion, detalle)
  values
    (v_actor, v_rol, v_nombre, new.restaurante_id,
     (select r.nombre from public.restaurantes r where r.id = new.restaurante_id),
     'usuario', new.id, v_accion, v_desc, v_detalle);

  return new;
end;
$$;

drop trigger if exists trg_auditar_usuario on public.usuarios;
create trigger trg_auditar_usuario
  after update on public.usuarios
  for each row execute function public.auditar_usuario();

-- -----------------------------------------------------------------------------
-- 5 · Trigger: acciones de suscripción (historial append-only)
-- -----------------------------------------------------------------------------
-- `suscripciones_historial` ya registra renovación / cambio de plan / suspensión
-- / reactivación / ajuste. Este trigger lo refleja en la auditoría global.
create or replace function public.auditar_suscripcion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_rol text;
  v_nombre text;
  v_accion text;
  v_desc text;
begin
  if tg_op <> 'INSERT' then
    return new;
  end if;

  v_actor := coalesce(new.creado_por, auth.uid());
  if v_actor is not null then
    select u.rol::text, u.nombre into v_rol, v_nombre
      from public.usuarios u where u.id = v_actor;
  end if;

  v_accion := case new.accion
    when 'renovacion'    then 'suscripcion_renovar'
    when 'cambio_plan'   then 'suscripcion_cambiar_plan'
    when 'suspension'    then 'suscripcion_suspender'
    when 'reactivacion'  then 'suscripcion_reactivar'
    else 'suscripcion_ajuste'
  end;
  v_desc := case new.accion
    when 'renovacion'    then 'Renovó la suscripción'
    when 'cambio_plan'   then 'Cambió el plan de suscripción'
    when 'suspension'    then 'Suspendió la suscripción'
    when 'reactivacion'  then 'Reactivó la suscripción'
    else 'Ajustó la suscripción'
  end;
  v_desc := v_desc || format(' de «%s»',
    coalesce((select r.nombre from public.restaurantes r where r.id = new.restaurante_id), 'restaurante'));

  insert into public.audit_logs
    (actor_id, actor_rol, actor_nombre, restaurante_id, restaurante_nombre,
     entidad, entidad_id, accion, descripcion, detalle)
  values
    (v_actor, v_rol, v_nombre, new.restaurante_id,
     (select r.nombre from public.restaurantes r where r.id = new.restaurante_id),
     'suscripcion', new.id, v_accion, v_desc,
     jsonb_build_object('accion', new.accion, 'motivo', new.motivo));

  return new;
end;
$$;

drop trigger if exists trg_auditar_suscripcion on public.suscripciones_historial;
create trigger trg_auditar_suscripcion
  after insert on public.suscripciones_historial
  for each row execute function public.auditar_suscripcion();

-- -----------------------------------------------------------------------------
-- 6 · Verificación (SQL Editor)
-- -----------------------------------------------------------------------------
select
  (select relrowsecurity from pg_class where oid = 'public.audit_logs'::regclass) as rls_ok,
  (select count(*) = 1 from pg_policies
     where schemaname = 'public' and tablename = 'audit_logs' and cmd = 'SELECT') as policy_select_ok,
  (select count(*) = 0 from pg_policies
     where schemaname = 'public' and tablename = 'audit_logs'
       and cmd in ('INSERT', 'UPDATE', 'DELETE')) as sin_escritura_ok,
  (select count(*) = 3 from pg_trigger
     where not tgisinternal and tgrelid in
       ('public.restaurantes'::regclass,
        'public.usuarios'::regclass,
        'public.suscripciones_historial'::regclass)
       and tgname like 'trg_auditar_%') as triggers_ok,
  (select has_function_privilege('anon', 'public.registrar_auditoria(uuid,text,uuid,text,uuid,text,jsonb)', 'execute')) as anon_puede,
  (select has_function_privilege('authenticated', 'public.registrar_auditoria(uuid,text,uuid,text,uuid,text,jsonb)', 'execute')) as authenticated_puede,
  (select count(*) from public.audit_logs) as filas;
-- Esperado: rls_ok=true, policy_select_ok=true, sin_escritura_ok=true,
-- triggers_ok=true (los 3 de este archivo; el de configuración llega con su propio
-- archivo), anon_puede=false, authenticated_puede=false.


-- #############################################################################
-- # 18/19 · configuracion_global.sql
-- #############################################################################

-- -- =============================================================================
-- CONFIGURACIÓN GLOBAL + ALERTAS (Super Admin) — Mesora
-- =============================================================================
-- Dos piezas aditivas:
--   1. `configuracion_global`: fila única (id = 1) con el nombre de Mesora,
--      contacto de soporte, logo e información general, y el precio mensual del
--      plan (único, editable): la landing pública lo lee; solo el super admin
--      lo edita (y cada cambio queda auditado por trigger).
--   2. `admin_alertas()`: RPC SECURITY DEFINER que devuelve las alertas
--      administrativas del panel (suscripciones por vencer/vencidas,
--      restaurantes suspendidos/nuevos, administradores nuevos y tickets
--      urgentes) como JSON, agregadas en la base.
--
-- Este archivo no hace DROP de datos, no desactiva RLS y es aditivo.
-- Dependencia: `soporte.sql` (usa soporte_tickets para las alertas).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1 · configuracion_global (fila única)
-- -----------------------------------------------------------------------------
create table if not exists public.configuracion_global (
  id integer primary key default 1 check (id = 1),
  nombre_app text not null default 'Mesora',
  correo_soporte text,
  telefono_soporte text,
  logo_url text,
  informacion text,
  -- Precio mensual (en soles) del plan único "Mesora Pro". Es la fuente de la
  -- verdad para la landing y el futuro checkout; el super admin lo edita desde
  -- el panel Configuración (quedando auditado por el trigger de abajo).
  precio_plan_mensual numeric not null default 120,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

-- Para bases ya creadas (aditivo): la columna con su default no pisa valores.
alter table public.configuracion_global
  add column if not exists precio_plan_mensual numeric not null default 120;

comment on column public.configuracion_global.precio_plan_mensual is
  'Precio mensual en soles del plan único Mesora Pro. Es editable desde el panel
  del super admin; la landing lo muestra en público.';

insert into public.configuracion_global (id, nombre_app)
values (1, 'Mesora')
on conflict (id) do nothing;

comment on table public.configuracion_global is
  'Configuración general de la plataforma (fila única id = 1): nombre, contacto
  de soporte, logo, información y precio mensual del plan. La lectura es pública
  (se muestra en la landing); la edición es exclusiva del super admin.';

alter table public.configuracion_global enable row level security;

-- Lectura pública: la landing muestra estos datos sin sesión.
drop policy if exists configuracion_global_select_public on public.configuracion_global;
create policy configuracion_global_select_public on public.configuracion_global
  for select using (true);

drop policy if exists configuracion_global_select_super on public.configuracion_global;
create policy configuracion_global_select_super on public.configuracion_global
  for select to authenticated using (public.soy_super_admin());

drop policy if exists configuracion_global_update_super on public.configuracion_global;
create policy configuracion_global_update_super on public.configuracion_global
  for update to authenticated
  using (public.soy_super_admin())
  with check (public.soy_super_admin());
-- Sin INSERT/DELETE desde el cliente: la fila se siembra aquí.

-- La landing es anónima y solo necesita el precio y el nombre. Se otorga
-- SELECT por COLUMNA (no sobre la tabla): así la anon key no puede leer
-- correo_soporte, telefono_soporte, informacion ni updated_by. RLS ya limita
-- las filas (id = 1), pero una policy no filtra columnas.
revoke all on public.configuracion_global from anon;
grant select (nombre_app, precio_plan_mensual) on public.configuracion_global to anon;
grant select, update on public.configuracion_global to authenticated;

-- El super admin es el único que edita, y solo estas columnas. Sin esto el
-- `grant update` de arriba permitiría tocar id/updated_by.
revoke update on public.configuracion_global from authenticated;
grant update (nombre_app, correo_soporte, telefono_soporte, logo_url, informacion, precio_plan_mensual)
  on public.configuracion_global to authenticated;
-- El `ALL` por defecto incluye TRUNCATE, que no pasa por RLS.
revoke truncate on public.configuracion_global from authenticated;

-- -----------------------------------------------------------------------------
-- 2 · updated_at + auditoría de la configuración
-- -----------------------------------------------------------------------------
create or replace function public.auditar_configuracion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_rol text;
  v_nombre text;
  v_campos text[] := '{}';
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  new.updated_at := now();
  new.updated_by := v_actor;

  if not (select public.soy_super_admin()) then
    return new;
  end if;

  if new.nombre_app is distinct from old.nombre_app then v_campos := array_append(v_campos, 'nombre_app'); end if;
  if new.correo_soporte is distinct from old.correo_soporte then v_campos := array_append(v_campos, 'correo_soporte'); end if;
  if new.telefono_soporte is distinct from old.telefono_soporte then v_campos := array_append(v_campos, 'telefono_soporte'); end if;
  if new.logo_url is distinct from old.logo_url then v_campos := array_append(v_campos, 'logo_url'); end if;
  if new.informacion is distinct from old.informacion then v_campos := array_append(v_campos, 'informacion'); end if;
  if new.precio_plan_mensual is distinct from old.precio_plan_mensual then v_campos := array_append(v_campos, 'precio_plan_mensual'); end if;

  if array_length(v_campos, 1) is null then
    return new;
  end if;

  if v_actor is not null then
    select u.rol::text, u.nombre into v_rol, v_nombre
      from public.usuarios u where u.id = v_actor;
  end if;

  insert into public.audit_logs
    (actor_id, actor_rol, actor_nombre, entidad, accion, descripcion, detalle)
  values
    (v_actor, v_rol, v_nombre, 'configuracion', 'configuracion_actualizar',
     'Actualizó la configuración global de Mesora',
     jsonb_build_object('campos', to_jsonb(v_campos)));

  return new;
end;
$$;

drop trigger if exists trg_auditar_configuracion on public.configuracion_global;
create trigger trg_auditar_configuracion
  before update on public.configuracion_global
  for each row execute function public.auditar_configuracion();

-- -----------------------------------------------------------------------------
-- 3 · admin_alertas(): alertas administrativas agregadas en la base
-- -----------------------------------------------------------------------------
create or replace function public.admin_alertas()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ahora timestamptz := now();
  v_limite timestamptz := now() + interval '7 days';
  v_res jsonb;
begin
  if not (select public.soy_super_admin()) then
    raise exception 'Solo el super administrador puede ver las alertas.'
      using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(payload order by orden, f desc), '[]'::jsonb)
    into v_res
    from (
      -- Suscripciones vencidas
      select jsonb_build_object(
          'id', 'venc-' || r.id, 'tipo', 'restaurante_vencido', 'nivel', 'critico',
          'titulo', 'Suscripción vencida',
          'detalle', r.nombre || ' tiene la suscripción vencida desde el ' ||
                     to_char(r.fecha_vencimiento, 'DD/MM/YYYY') || '.',
          'fecha', r.fecha_vencimiento,
          'restaurante_id', r.id, 'restaurante_nombre', r.nombre, 'referencia_id', r.id
        ) as payload, 1 as orden, r.fecha_vencimiento as f
        from public.restaurantes r
       where coalesce(r.suscripcion_activa, false)
         and r.fecha_vencimiento is not null
         and r.fecha_vencimiento < v_ahora

      union all
      -- Suscripciones por vencer (próximos 7 días)
      select jsonb_build_object(
          'id', 'porvencer-' || r.id, 'tipo', 'restaurante_por_vencer', 'nivel', 'advertencia',
          'titulo', 'Suscripción por vencer',
          'detalle', r.nombre || ' vence el ' || to_char(r.fecha_vencimiento, 'DD/MM/YYYY') || '.',
          'fecha', r.fecha_vencimiento,
          'restaurante_id', r.id, 'restaurante_nombre', r.nombre, 'referencia_id', r.id
        ), 2, r.fecha_vencimiento
        from public.restaurantes r
       where coalesce(r.suscripcion_activa, false)
         and r.fecha_vencimiento >= v_ahora
         and r.fecha_vencimiento <= v_limite

      union all
      -- Restaurantes suspendidos
      select jsonb_build_object(
          'id', 'susp-' || r.id, 'tipo', 'restaurante_suspendido', 'nivel', 'advertencia',
          'titulo', 'Restaurante suspendido',
          'detalle', r.nombre || ' tiene la suscripción suspendida.',
          'fecha', coalesce(r.fecha_vencimiento, r.created_at),
          'restaurante_id', r.id, 'restaurante_nombre', r.nombre, 'referencia_id', r.id
        ), 3, coalesce(r.fecha_vencimiento, r.created_at)
        from public.restaurantes r
       where not coalesce(r.suscripcion_activa, false)

      union all
      -- Restaurantes nuevos (últimos 7 días)
      select jsonb_build_object(
          'id', 'nuevo-' || r.id, 'tipo', 'restaurante_nuevo', 'nivel', 'info',
          'titulo', 'Nuevo restaurante',
          'detalle', r.nombre || ' se registró recientemente.',
          'fecha', r.created_at,
          'restaurante_id', r.id, 'restaurante_nombre', r.nombre, 'referencia_id', r.id
        ), 4, r.created_at
        from public.restaurantes r
       where r.created_at >= v_ahora - interval '7 days'

      union all
      -- Administradores nuevos (últimos 7 días)
      select jsonb_build_object(
          'id', 'admin-' || u.id, 'tipo', 'administrador_nuevo', 'nivel', 'info',
          'titulo', 'Nuevo administrador',
          'detalle', u.nombre || ' fue designado administrador' ||
                     coalesce(' de ' || rr.nombre, '') || '.',
          'fecha', u.created_at,
          'restaurante_id', u.restaurante_id, 'restaurante_nombre', rr.nombre, 'referencia_id', u.id
        ), 4, u.created_at
        from public.usuarios u
        left join public.restaurantes rr on rr.id = u.restaurante_id
       where u.rol::text = 'admin_restaurante'
         and u.created_at >= v_ahora - interval '7 days'

      union all
      -- Tickets urgentes sin resolver
      select jsonb_build_object(
          'id', 'tk-' || t.id, 'tipo', 'ticket_urgente', 'nivel', 'critico',
          'titulo', 'Ticket urgente',
          'detalle', t.codigo || ': ' || t.asunto,
          'fecha', t.created_at,
          'restaurante_id', t.restaurante_id, 'restaurante_nombre', rr.nombre, 'referencia_id', t.id
        ), 1, t.created_at
        from public.soporte_tickets t
        left join public.restaurantes rr on rr.id = t.restaurante_id
       where t.prioridad = 'urgente' and t.estado in ('abierto', 'en_progreso')
    ) s;

  return v_res;
end;
$$;

comment on function public.admin_alertas() is
  'Super admin: alertas administrativas agregadas (suscripciones vencidas/por
  vencer, restaurantes suspendidos/nuevos, administradores nuevos y tickets
  urgentes) como JSON. SECURITY DEFINER con control de rol.';

revoke execute on function public.admin_alertas() from public;
revoke execute on function public.admin_alertas() from anon;
grant execute on function public.admin_alertas() to authenticated;

-- -----------------------------------------------------------------------------
-- 4 · Verificación (SQL Editor)
-- -----------------------------------------------------------------------------
select
  (select relrowsecurity from pg_class where oid = 'public.configuracion_global'::regclass) as rls_ok,
  (select count(*) = 1 from public.configuracion_global where id = 1) as fila_unica_ok,
  (select precio_plan_mensual from public.configuracion_global where id = 1) as precio_plan,
  (select count(*) = 3 from pg_policies
     where schemaname = 'public' and tablename = 'configuracion_global') as policies_ok,
  (select count(*) = 1 from pg_trigger
     where not tgisinternal and tgrelid = 'public.configuracion_global'::regclass) as trigger_ok,
  (select has_column_privilege('anon', 'public.configuracion_global', 'precio_plan_mensual', 'select')) as anon_precio_ok,
  (select has_column_privilege('anon', 'public.configuracion_global', 'correo_soporte', 'select')) as anon_correo_ok,
  (select has_function_privilege('anon', 'public.admin_alertas()', 'execute')) as anon_alerta,
  (select has_function_privilege('authenticated', 'public.admin_alertas()', 'execute')) as auth_alerta;
-- Esperado: rls_ok=true, fila_unica_ok=true, precio_plan=120, policies_ok=true,
-- trigger_ok=true, anon_precio_ok=true, anon_correo_ok=false, anon_alerta=false,
-- auth_alerta=true.


-- #############################################################################
-- # 19/19 · 99_crear_usuario_prueba.sql
-- #############################################################################

-- -- =============================================================================
-- Mesora · Usuario y restaurante de PRUEBA (ejecutar AL FINAL, una sola vez)
-- =============================================================================
--
-- QUÉ HACE Y QUÉ NO HACE
-- Inserta el restaurante y los PERFILES en `public.usuarios`. Los usuarios de
-- Supabase Auth no se crean aquí: `auth.users` es de GoTrue y escribirlo a mano
-- deja filas sin `auth.identities`, que después no pueden iniciar sesión. Se
-- crean desde el panel (Authentication → Users → Add user) o con la Admin API,
-- y este script solo los enlaza por email.
--
-- POR QUÉ HAY DOS PASOS Y NO UNO
-- `usuarios.id` ES `auth.users.id` (ver 00_schema_base.sql). El perfil no tiene
-- contraseña ni sabe nadie: es la fila de negocio. Por eso el alta real de
-- meseros desde la app (crearPersonal) inserta el perfil y deja el usuario de
-- Auth para cuando el mesero entre por primera vez. Este script es el camino
-- corto para tener con qué probar la app hoy.
--
-- CÓMO USARLO
--   1. En Supabase → Authentication → Users → Add user, crea estos usuarios con
--      la casilla "Auto Confirm User" marcada (si no, el login falla con
--      "Email not confirmed").
--   2. Vuelve a este archivo, cambia SOLO el bloque de correos de abajo por los
--      que creaste.
--   3. Pégalo en el SQL Editor y ejecútalo.
--   4. La consulta del final dice qué quedó creado y qué falta.
--
-- ES IDEMPOTENTE
-- Se puede volver a ejecutar: el restaurante se busca por RUC y los perfiles por
-- id de Auth, así que no duplica nada. Volver a ejecutarlo solo completa el
-- `restaurante_id` de un super_admin que estuviera suelto.
-- =============================================================================

do $$
declare
  v_restaurante uuid;
  v_omitidos text[] := array[]::text[];
  v_fila record;
begin
  -- ---------------------------------------------------------------------------
  -- 1. Restaurante de prueba
  -- ---------------------------------------------------------------------------
  -- El RUC es el identificador del negocio en Perú (11 dígitos). Cámbialo por el
  -- real si ya lo tienes; el `if not exists` evita duplicarlo.
  insert into public.restaurantes (nombre, ruc, direccion, telefono, email_contacto)
  select 'Restaurante de Prueba', '20500000000', 'Av. Siempre Viva 742',
         '999999999', 'prueba@mesora.app'
   where not exists (
     select 1 from public.restaurantes where ruc = '20500000000'
   )
  returning id into v_restaurante;

  if v_restaurante is null then
    select id into v_restaurante
      from public.restaurantes where ruc = '20500000000';
  end if;

  -- ---------------------------------------------------------------------------
  -- 2. Perfiles enlazados a los usuarios de Auth
  -- ---------------------------------------------------------------------------
  -- Los cinco roles que la app distingue. Los tres últimos son los que usan el
  -- flujo real de caja (mesero toma la comanda, cocina o barra la preparan,
  -- cajero cobra); los dos primeros administran.
  for v_fila in
    select * from (values
      ('super_admin',       'super@prueba.app'),
      ('admin_restaurante', 'admin@prueba.app'),
      ('mesero',            'mesero@prueba.app'),
      ('cocina',            'cocina@prueba.app'),
      ('cajero',            'cajero@prueba.app')
    ) as t(rol, correo)
  loop
    -- Sin usuario de Auth no hay perfil: un `usuarios` fila sin su
    -- `auth.users` detrás no puede iniciar sesión y además rompería el login
    -- (el bootstrap de la app no encuentra nada). Se avisa y se sigue.
    if not exists (select 1 from auth.users where email = v_fila.correo) then
      v_omitidos := array_append(v_omitidos, v_fila.correo);
      continue;
    end if;

    insert into public.usuarios (id, restaurante_id, rol, nombre, email, activo)
    select a.id,
           -- El super_admin va con restaurante_id NULL a propósito: administra
           -- los locales desde fuera y no opera dentro de ninguno. Las policies
           -- de lectura global de `01_rls_completo.sql` lo contemplan.
           case when v_fila.rol = 'super_admin' then null else v_restaurante end,
           v_fila.rol,
           initcap(replace(v_fila.rol, '_', ' ')),
           v_fila.correo,
           true
      from auth.users a
     where a.email = v_fila.correo
    on conflict (id) do update
       set restaurante_id = excluded.restaurante_id,
           rol            = excluded.rol,
           nombre         = excluded.nombre,
           email          = excluded.email,
           activo         = true;
  end loop;

  if array_length(v_omitidos, 1) is not null then
    raise warning
      'Estos correos no tienen usuario de Supabase Auth y quedaron sin perfil: %. Crealos en Authentication → Add user con "Auto Confirm User" y vuelve a correr este script.',
      array_to_string(v_omitidos, ', ');
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. Comprobación
-- -----------------------------------------------------------------------------
-- Lo que importa es `existe_en_auth`: si dice false, ese perfil no puede
-- iniciar sesión aunque la fila exista (no hay usuario de Auth detrás).
select r.nombre as restaurante,
       u.rol,
       u.nombre as perfil,
       u.email,
       u.activo,
       exists (select 1 from auth.users a where a.id = u.id) as existe_en_auth
  from public.usuarios u
  left join public.restaurantes r on r.id = u.restaurante_id
 order by u.rol;

-- El usuario con el que conviene empezar: el admin del restaurante.
select a.email as correo_para_entrar,
       u.rol,
       r.nombre as restaurante
  from auth.users a
  join public.usuarios u on u.id = a.id
  left join public.restaurantes r on r.id = u.restaurante_id
 where a.email = 'admin@prueba.app';
