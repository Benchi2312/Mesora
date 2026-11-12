-- =============================================================================
-- Mesora · TODO_EN_UNO.sql — PEGA ESTE ARCHIVO ENTERO EN EL SQL EDITOR
-- =============================================================================
-- Levantá la base de datos de Mesora desde cero: tablas, funciones, permisos,
-- RLS y permisos de produccion. No crea usuarios ni datos de prueba.
--
-- COMO USARLO
--   1. Abre SQL Editor, crea una consulta, pega TODO este archivo y ejecuta.
--   2. Configura un super_admin inicial segun SUPABASE_SETUP.md y crea
--      el restaurante piloto desde la plataforma.
--
-- DESPUES DE APLICARLO
--   Copiá la URL y la anon key del proyecto a tu .env.local y reiniciá Vite.
--
-- NOTAS
--   - No crea cuentas ni datos de prueba. Respalda la base y revisa el
--     impacto antes de aplicarlo a un proyecto que ya contiene datos.
--   - Si algo falla, los comentarios de bloque indican donde revisar.
--   - Generado por npm run sql:install. Edita los fuentes, no este archivo.
--
-- Contenido: 55 archivos · sha256(cuerpo) = ddd4b0cc9a0d
-- Orden: 00_schema_base.sql → ../migrations/20261022120000_password_recovery.sql → ../migrations/20261103032730_admin_email_recovery.sql → 00_seguridad_rpcs.sql → migracion_items_anulables.sql → migracion_productos_es_bebida.sql → ../migrations/20261031073322_reporte_ventas_y_snapshot_bebidas.sql → ../migrations/20261031075708_reporte_ventas_dashboard.sql → ../migrations/20261029052901_datos_local_dominio.sql → pin_autorizacion.sql → rpc_crear_pedido.sql → rpc_cerrar_cuenta.sql → rpc_anular_cuenta.sql → caja_turnos.sql → 01_rls_completo.sql → admin_super_restaurante.sql → usuarios_super_admin.sql → estadisticas_super_admin.sql → soporte.sql → suscripciones_super_admin.sql → auditoria.sql → configuracion_global.sql → seguridad_piloto.sql → ../migrations/20261030173318_seguridad_rpc_piloto.sql → ../migrations/20261030173320_consultas_pendientes_piloto.sql → ../migrations/20261030173503_diagnostico_piloto.sql → ../migrations/20261030173925_indice_mesas_zona.sql → ../migrations/20261102081247_acotar_politicas_rls_piloto.sql → ../migrations/20261104065434_contacto_guardrails_incidentes.sql → ../migrations/20261104065733_confirmar_password_auth_trigger.sql → ../migrations/20261104172538_bandeja_comercial_alertas.sql → ../migrations/20261105033712_soporte_conversaciones_seguimiento.sql → ../migrations/20261105034329_soporte_mensajes_suscripcion.sql → ../migrations/20261105042359_cerrar_borrado_directo_soporte.sql → ../migrations/20261105042814_indexar_foreign_keys_soporte.sql → ../migrations/20261105050740_fijar_actor_historial_suscripciones.sql → ../migrations/20261105050911_revoke_direct_access_internal_tables.sql → ../migrations/20261105055856_limitar_consulta_vigencia_suscripcion.sql → ../migrations/20261105212322_transferir_mesas_y_reimprimir_boletas.sql → ../migrations/20261105212447_indizar_responsables_y_reimpresiones.sql → ../migrations/20261105212734_proteger_cierre_mesa_reasignada.sql → ../migrations/20261106064127_listar_meseros_activos_mismo_restaurante.sql → ../migrations/20261106070508_proteger_traslados_mesa_con_pin_y_auditoria.sql → ../migrations/20261106075551_auditar_operaciones_caja_mesa.sql → ../migrations/20261107043104_bloque2_seguridad_personal_auditoria.sql → ../migrations/20261107063406_auditoria_item_descripcion_utf8.sql → ../migrations/20261107201714_bloque3_impresion_comandas.sql → ../migrations/20261108120000_sistema_operativo_configurable.sql → ../migrations/20261109012624_fase3_configuracion_operativa_admin.sql → ../migrations/20261109024411_fase4_enrutamiento_comandas.sql → ../migrations/20261109045958_fase5_kds_salida_manual_comandas.sql → ../migrations/20261109061058_fase6_agente_impresion_automatica.sql → ../migrations/20261109075129_validar_modalidad_cobro_restaurante.sql → ../migrations/20261111034528_impedir_recobro_tras_anulacion_recibo.sql → ../migrations/20261112120000_idempotencia_crear_pedido.sql
-- =============================================================================



-- #############################################################################
-- # 1/55 · 00_schema_base.sql
-- #############################################################################

-- -- Mesora: schema base para instalaciones NUEVAS.
-- En bases existentes se aplican ?nicamente migraciones revisadas.
-- Estados y roles son text + CHECK; importes numeric(12,2).
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.restaurantes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (length(btrim(nombre)) > 0),
  ruc text,
  telefono text,
  direccion text,
  email_contacto text,
  suscripcion_activa boolean not null default true,
  fecha_vencimiento timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.usuarios (
  id uuid primary key references auth.users(id) on delete cascade,
  restaurante_id uuid references public.restaurantes(id) on delete cascade,
  rol text not null check (rol in ('super_admin','admin_restaurante','mesero','cocina','cajero')),
  nombre text not null check (length(btrim(nombre)) > 0),
  email text,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  constraint usuarios_restaurante_requerido check (rol = 'super_admin' or restaurante_id is not null)
);
create index if not exists idx_usuarios_restaurante on public.usuarios(restaurante_id);

create table if not exists public.zonas (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes(id) on delete cascade,
  nombre text not null check (length(btrim(nombre)) > 0),
  created_at timestamptz not null default now()
);
create unique index if not exists zonas_un_nombre_por_restaurante on public.zonas(restaurante_id, lower(nombre));
create unique index if not exists zonas_id_restaurante_unique on public.zonas(id, restaurante_id);

create table if not exists public.mesas (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes(id) on delete cascade,
  zona_id uuid not null references public.zonas(id) on delete restrict,
  nombre text not null check (length(btrim(nombre)) > 0),
  estado text not null default 'libre' check (estado in ('libre','ocupada')),
  created_at timestamptz not null default now(),
  constraint mesas_zona_del_mismo_restaurante_fk foreign key(zona_id, restaurante_id)
    references public.zonas(id, restaurante_id)
);
create index if not exists idx_mesas_restaurante on public.mesas(restaurante_id, nombre);
create index if not exists idx_mesas_zona on public.mesas(zona_id);
create unique index if not exists mesas_un_nombre_por_restaurante on public.mesas(restaurante_id, lower(nombre));

create table if not exists public.categorias_productos (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes(id) on delete cascade,
  nombre text not null check (length(btrim(nombre)) > 0),
  created_at timestamptz not null default now()
);
create index if not exists idx_categorias_restaurante on public.categorias_productos(restaurante_id);

create table if not exists public.productos (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes(id) on delete cascade,
  categoria_id uuid references public.categorias_productos(id) on delete set null,
  nombre text not null check (length(btrim(nombre)) > 0),
  descripcion text,
  imagen_url text,
  precio numeric(12,2) not null check (precio >= 0),
  disponible boolean not null default true,
  es_promocion boolean not null default false,
  precio_promocion numeric(12,2) check (precio_promocion >= 0),
  created_at timestamptz not null default now()
);
create index if not exists idx_productos_restaurante on public.productos(restaurante_id);
create index if not exists idx_productos_categoria on public.productos(categoria_id);

create table if not exists public.pedidos (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes(id) on delete cascade,
  mesa_id uuid not null references public.mesas(id) on delete restrict,
  mesero_id uuid not null references public.usuarios(id) on delete restrict,
  estado text not null default 'pendiente',
  constraint pedidos_estado_check check (estado in ('pendiente','en_preparacion','listo','entregado','anulado')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_pedidos_restaurante_estado on public.pedidos(restaurante_id, estado, created_at);
create index if not exists idx_pedidos_restaurante_mesa on public.pedidos(restaurante_id, mesa_id, created_at);
create index if not exists idx_pedidos_mesero on public.pedidos(mesero_id);

create table if not exists public.pedido_items (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.pedidos(id) on delete cascade,
  producto_id uuid references public.productos(id) on delete set null,
  nombre_producto text not null,
  cantidad integer not null check (cantidad between 1 and 99),
  precio_unitario numeric(12,2) not null check (precio_unitario >= 0),
  nota text,
  created_at timestamptz not null default now()
);
create index if not exists idx_pedido_items_pedido on public.pedido_items(pedido_id);

create table if not exists public.cuentas (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes(id) on delete cascade,
  mesa_id uuid not null references public.mesas(id) on delete restrict,
  total numeric(12,2) not null check (total >= 0),
  metodo_pago text not null,
  constraint cuentas_metodo_pago_check check (metodo_pago in ('efectivo','tarjeta','yape_plin','otro')),
  estado text not null default 'pendiente',
  constraint cuentas_estado_check check (estado in ('pendiente','pagada','anulada')),
  pagado_at timestamptz,
  numero text,
  propina numeric(12,2) not null default 0 check (propina >= 0),
  vuelto numeric(12,2) not null default 0 check (vuelto >= 0),
  anulada_at timestamptz,
  anulada_por uuid references public.usuarios(id) on delete set null,
  motivo_anulacion text,
  monto_reembolsado numeric(12,2) check (monto_reembolsado >= 0),
  created_at timestamptz not null default now(),
  constraint cuentas_pagada_con_fecha check (estado = 'pendiente' or pagado_at is not null)
);
create index if not exists idx_cuentas_restaurante on public.cuentas(restaurante_id, estado);
create index if not exists idx_cuentas_pagadas on public.cuentas(restaurante_id, pagado_at desc) where estado = 'pagada';
create unique index if not exists cuentas_numero_por_restaurante on public.cuentas(restaurante_id, numero) where numero is not null;

create table if not exists public.cuenta_pedidos (
  id uuid primary key default gen_random_uuid(),
  cuenta_id uuid not null references public.cuentas(id) on delete cascade,
  pedido_id uuid not null references public.pedidos(id) on delete restrict,
  subtotal numeric(12,2) not null check (subtotal >= 0)
);
create index if not exists idx_cuenta_pedidos_cuenta on public.cuenta_pedidos(cuenta_id);
create index if not exists idx_cuenta_pedidos_pedido on public.cuenta_pedidos(pedido_id);

create table if not exists public.correlativos (
  restaurante_id uuid not null references public.restaurantes(id) on delete cascade,
  tipo text not null,
  ultimo integer not null default 0,
  primary key (restaurante_id, tipo)
);

create or replace function public.tocar_updated_at()
returns trigger language plpgsql set search_path = pg_catalog, public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists trg_pedidos_updated_at on public.pedidos;
create trigger trg_pedidos_updated_at before update on public.pedidos
for each row execute function public.tocar_updated_at();
revoke all on function public.tocar_updated_at() from public, anon, authenticated;

-- Cerradas desde su creaci?n; 01_rls_completo agrega las policies y grants.
do $$
declare t text;
begin
  foreach t in array array['restaurantes','usuarios','zonas','mesas','categorias_productos',
    'productos','pedidos','pedido_items','cuentas','cuenta_pedidos','correlativos'] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end;
$$;


-- #############################################################################
-- # 2/55 · ../migrations/20261022120000_password_recovery.sql
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

-- Confirma el cambio de una contraseña temporal en el mismo perfil que usa
-- ProtectedRoute. Se incluye aquí para poder actualizar instalaciones que ya
-- añadieron debe_cambiar_password pero aún no tienen la RPC.
create or replace function public.confirmar_cambio_password()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Se requiere una sesión válida';
  end if;

  update public.usuarios
     set debe_cambiar_password = false
   where id = auth.uid();

  if not found then
    raise exception 'No se encontró el perfil del usuario';
  end if;
end;
$$;

revoke all on function public.confirmar_cambio_password() from public;
revoke all on function public.confirmar_cambio_password() from anon;
grant execute on function public.confirmar_cambio_password() to authenticated;


-- #############################################################################
-- # 3/55 · ../migrations/20261103032730_admin_email_recovery.sql
-- #############################################################################

-- -- Recuperación por correo verificado para administradores de restaurante.
-- Los tokens viven en un esquema no expuesto y solo las Edge Functions usan
-- las RPC de service_role para emitirlos y consumirlos.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;

create table if not exists private.admin_recovery_tokens (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.usuarios(id) on delete cascade,
  correo text not null,
  token_hash text not null unique check (length(token_hash) = 64),
  creado_en timestamptz not null default now(),
  expira_en timestamptz not null,
  consumido_en timestamptz,
  constraint admin_recovery_token_expiry_check
    check (expira_en > creado_en and expira_en <= creado_en + interval '1 hour')
);

alter table private.admin_recovery_tokens enable row level security;
revoke all on table private.admin_recovery_tokens from public, anon, authenticated;
grant select, insert, update, delete on table private.admin_recovery_tokens to service_role;

create table if not exists private.admin_recovery_rate_limits (
  usuario_id uuid not null references public.usuarios(id) on delete cascade,
  accion text not null check (accion in ('verificar_correo', 'recuperar_password')),
  primera_solicitud timestamptz not null default now(),
  ultima_solicitud timestamptz not null default now(),
  solicitudes integer not null default 1 check (solicitudes > 0),
  primary key (usuario_id, accion)
);

alter table private.admin_recovery_rate_limits enable row level security;
revoke all on table private.admin_recovery_rate_limits from public, anon, authenticated;
grant select, insert, update, delete on table private.admin_recovery_rate_limits to service_role;

-- El usuario no puede marcar directamente un correo como verificado usando el
-- permiso amplio de UPDATE que necesita Personal. Solo la Edge Function con
-- service_role puede escribir estos dos campos.
create or replace function public.proteger_correo_recuperacion()
returns trigger
language plpgsql
set search_path = pg_catalog, auth
as $$
begin
  if (new.correo_recuperacion is distinct from old.correo_recuperacion
      or new.correo_recuperacion_verificado is distinct from old.correo_recuperacion_verificado)
     and coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'El correo de recuperación solo se actualiza mediante verificación segura';
  end if;
  return new;
end;
$$;

revoke all on function public.proteger_correo_recuperacion() from public, anon, authenticated;
grant execute on function public.proteger_correo_recuperacion() to authenticated, service_role;

drop trigger if exists usuarios_proteger_correo_recuperacion on public.usuarios;
create trigger usuarios_proteger_correo_recuperacion
  before update of correo_recuperacion, correo_recuperacion_verificado on public.usuarios
  for each row execute function public.proteger_correo_recuperacion();

create or replace function public.mesora_recovery_can_send(
  p_usuario_id uuid,
  p_accion text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_permitido boolean;
begin
  if p_accion not in ('verificar_correo', 'recuperar_password') then
    return false;
  end if;

  insert into private.admin_recovery_rate_limits as limite
    (usuario_id, accion, primera_solicitud, ultima_solicitud, solicitudes)
  values (p_usuario_id, p_accion, now(), now(), 1)
  on conflict (usuario_id, accion) do update
    set primera_solicitud = case
          when limite.primera_solicitud <= now() - interval '24 hours' then now()
          else limite.primera_solicitud
        end,
        solicitudes = case
          when limite.primera_solicitud <= now() - interval '24 hours' then 1
          else limite.solicitudes + 1
        end,
        ultima_solicitud = now()
    where limite.ultima_solicitud <= now() - interval '60 seconds'
      and (limite.primera_solicitud <= now() - interval '24 hours' or limite.solicitudes < 5)
  returning true into v_permitido;

  return coalesce(v_permitido, false);
end;
$$;

create or replace function public.mesora_recovery_store_token(
  p_usuario_id uuid,
  p_correo text,
  p_token_hash text,
  p_expira_en timestamptz
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, private
as $$
begin
  if length(p_token_hash) <> 64
     or p_expira_en <= now()
     or p_expira_en > now() + interval '1 hour'
     or p_correo <> lower(btrim(p_correo)) then
    raise exception 'Datos de verificación inválidos';
  end if;

  delete from private.admin_recovery_tokens
   where usuario_id = p_usuario_id and consumido_en is null;

  insert into private.admin_recovery_tokens (usuario_id, correo, token_hash, expira_en)
  values (p_usuario_id, p_correo, p_token_hash, p_expira_en);
end;
$$;

create or replace function public.mesora_recovery_consume_token(p_token_hash text)
returns table (usuario_id uuid, correo text)
language sql
security definer
set search_path = pg_catalog, private
as $$
  update private.admin_recovery_tokens as token
     set consumido_en = now()
   where token.token_hash = p_token_hash
     and token.consumido_en is null
     and token.expira_en > now()
  returning token.usuario_id, token.correo;
$$;

revoke all on function public.mesora_recovery_can_send(uuid, text) from public, anon, authenticated;
revoke all on function public.mesora_recovery_store_token(uuid, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.mesora_recovery_consume_token(text) from public, anon, authenticated;
grant execute on function public.mesora_recovery_can_send(uuid, text) to service_role;
grant execute on function public.mesora_recovery_store_token(uuid, text, text, timestamptz) to service_role;
grant execute on function public.mesora_recovery_consume_token(text) to service_role;

comment on schema private is 'Datos internos que no se exponen por PostgREST.';
comment on table private.admin_recovery_tokens is 'Tokens de verificación de correo alternativo; solo se almacena el hash.';
comment on table private.admin_recovery_rate_limits is 'Límites por usuario para evitar abuso de los correos de recuperación.';


-- #############################################################################
-- # 4/55 · 00_seguridad_rpcs.sql
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
-- # 5/55 · migracion_items_anulables.sql
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
-- # 6/55 · migracion_productos_es_bebida.sql
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
-- # 7/55 · ../migrations/20261031073322_reporte_ventas_y_snapshot_bebidas.sql
-- #############################################################################

-- -- Conserva la clasificación de cocina/barra al momento de vender y entrega
-- agregados + detalle paginado en una sola respuesta, sin límite de filas REST.
alter table public.pedido_items
  add column if not exists es_bebida boolean not null default false;

update public.pedido_items pi
   set es_bebida = coalesce(pr.es_bebida, false)
  from public.productos pr
 where pi.producto_id = pr.id
   and pi.es_bebida is distinct from coalesce(pr.es_bebida, false);

create or replace function public.reporte_ventas_restaurante(
  p_restaurante_id uuid,
  p_desde timestamptz,
  p_hasta timestamptz,
  p_estado text default 'todas',
  p_busqueda text default '',
  p_offset integer default 0,
  p_limite integer default 25
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_resultado jsonb;
begin
  perform public.validar_acceso_restaurante(p_restaurante_id);
  if not public.soy_del_restaurante(p_restaurante_id)
     or not public.tengo_rol(array['admin_restaurante']) then
    raise exception 'Sin permiso para consultar el reporte de ventas';
  end if;
  if p_desde is null or p_hasta is null or p_desde >= p_hasta then
    raise exception 'El periodo del reporte no es válido';
  end if;
  if p_estado not in ('todas', 'pagada', 'anulada') then
    raise exception 'El estado del reporte no es válido';
  end if;

  with cuentas_periodo as materialized (
    select c.*
      from public.cuentas c
     where c.restaurante_id = p_restaurante_id
       and c.estado::text in ('pagada', 'anulada')
       and coalesce(c.anulada_at, c.pagado_at, c.created_at) >= p_desde
       and coalesce(c.anulada_at, c.pagado_at, c.created_at) < p_hasta
  ),
  detalle as (
    select c.id as cuenta_id, cp.pedido_id, p.created_at as pedido_fecha,
           p.mesero_id, u.nombre as mesero_nombre, m.id as mesa_id, m.nombre as mesa_nombre,
           pi.id as item_id, pi.nombre_producto, pi.cantidad, pi.precio_unitario,
           coalesce(pi.es_bebida, false) as es_bebida,
           coalesce(pi.anulado, false) as item_anulado, pi.nota
      from cuentas_periodo c
      join public.cuenta_pedidos cp on cp.cuenta_id = c.id
      join public.pedidos p on p.id = cp.pedido_id and p.restaurante_id = p_restaurante_id
      join public.mesas m on m.id = p.mesa_id
      join public.usuarios u on u.id = p.mesero_id
      left join public.pedido_items pi on pi.pedido_id = p.id
  ),
  ventas_validas as (
    select d.* from detalle d join cuentas_periodo c on c.id = d.cuenta_id
     where c.estado::text = 'pagada' and d.item_id is not null and not d.item_anulado
  ),
  filtro_cuentas as (
    select c.id, c.numero, c.estado::text as estado, c.total, c.propina, c.vuelto,
           c.metodo_pago::text as metodo_pago, c.pagado_at, c.anulada_at,
           c.motivo_anulacion, c.monto_reembolsado, c.created_at,
           coalesce((select string_agg(distinct d.mesa_nombre, ', ' order by d.mesa_nombre)
                       from detalle d where d.cuenta_id = c.id), 'Sin mesa') as mesas,
           coalesce((select string_agg(distinct d.mesero_nombre, ', ' order by d.mesero_nombre)
                       from detalle d where d.cuenta_id = c.id), '—') as meseros
      from cuentas_periodo c
     where p_estado = 'todas' or c.estado::text = p_estado
  ),
  coincidencias as (
    select f.* from filtro_cuentas f
     where coalesce(p_busqueda, '') = ''
        or concat_ws(' ', f.numero, f.mesas, f.meseros,
             (select string_agg(d.nombre_producto, ' ') from detalle d where d.cuenta_id = f.id))
           ilike '%' || p_busqueda || '%'
  ),
  cuentas_json as (
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'id', f.id, 'numero', f.numero, 'estado', f.estado, 'total', f.total,
        'propina', f.propina, 'vuelto', f.vuelto, 'metodo_pago', f.metodo_pago,
        'pagado_at', f.pagado_at, 'anulada_at', f.anulada_at,
        'motivo_anulacion', f.motivo_anulacion, 'monto_reembolsado', f.monto_reembolsado,
        'created_at', f.created_at, 'mesas', f.mesas, 'meseros', f.meseros,
        'pagos', coalesce((select jsonb_agg(jsonb_build_object(
          'metodo_pago', pg.metodo_pago::text, 'monto', pg.monto) order by pg.created_at)
          from public.cuenta_pagos pg where pg.cuenta_id = f.id), '[]'::jsonb),
        'pedidos', coalesce((select jsonb_agg(jsonb_build_object(
          'pedido_id', d.pedido_id, 'created_at', d.pedido_fecha,
          'mesa', d.mesa_nombre, 'mesero', d.mesero_nombre,
          'items', (select coalesce(jsonb_agg(jsonb_build_object(
            'nombre', di.nombre_producto, 'cantidad', di.cantidad,
            'precio_unitario', di.precio_unitario,
            'total', round(di.cantidad * di.precio_unitario, 2),
            'es_bebida', di.es_bebida, 'anulado', di.item_anulado, 'nota', di.nota)
            order by di.nombre_producto), '[]'::jsonb)
            from detalle di where di.cuenta_id = f.id and di.pedido_id = d.pedido_id
              and di.item_id is not null)
        ) order by d.pedido_fecha, d.pedido_id)
          from (select distinct pedido_id, pedido_fecha, mesa_nombre, mesero_nombre
                  from detalle where cuenta_id = f.id) d), '[]'::jsonb)
      ) order by coalesce(f.pagado_at, f.anulada_at, f.created_at) desc, f.id desc
    ), '[]'::jsonb) as filas
      from (select * from coincidencias order by coalesce(pagado_at, anulada_at, created_at) desc, id desc
            offset greatest(p_offset, 0) limit least(greatest(p_limite, 1), 50)) f
  )
  select jsonb_build_object(
    'resumen', jsonb_build_object(
      'ventas', coalesce((select round(sum(total), 2) from cuentas_periodo where estado::text = 'pagada'), 0),
      'cuentas_pagadas', (select count(*) from cuentas_periodo where estado::text = 'pagada'),
      'cuentas_anuladas', (select count(*) from cuentas_periodo where estado::text = 'anulada'),
      'reembolsos', coalesce((select round(sum(monto_reembolsado), 2) from cuentas_periodo where estado::text = 'anulada'), 0),
      'propinas', coalesce((select round(sum(propina), 2) from cuentas_periodo where estado::text = 'pagada'), 0),
      'ticket_promedio', coalesce((select round(avg(total), 2) from cuentas_periodo where estado::text = 'pagada'), 0)
    ),
    'productos', coalesce((select jsonb_agg(to_jsonb(x) order by x.total desc)
      from (select nombre_producto as nombre, es_bebida, sum(cantidad)::integer as cantidad,
                   round(sum(cantidad * precio_unitario), 2) as total
              from ventas_validas group by nombre_producto, es_bebida) x), '[]'::jsonb),
    'meseros', coalesce((select jsonb_agg(to_jsonb(x) order by x.ventas desc)
      from (select mesero_id as id, mesero_nombre as nombre,
                   count(distinct pedido_id)::integer as pedidos,
                   sum(cantidad)::integer as unidades,
                   round(sum(cantidad * precio_unitario), 2) as ventas
              from ventas_validas group by mesero_id, mesero_nombre) x), '[]'::jsonb),
    'mesas', coalesce((select jsonb_agg(to_jsonb(x) order by x.ventas desc)
      from (select mesa_id as id, mesa_nombre as nombre,
                   count(distinct cuenta_id)::integer as cuentas,
                   round(sum(cantidad * precio_unitario), 2) as ventas
              from ventas_validas group by mesa_id, mesa_nombre) x), '[]'::jsonb),
    'cuentas', (select filas from cuentas_json),
    'total_cuentas', (select count(*) from coincidencias)
  ) into v_resultado;

  return v_resultado;
end;
$$;

comment on function public.reporte_ventas_restaurante(uuid, timestamptz, timestamptz, text, text, integer, integer) is
  'Reporte interno detallado y aislado por restaurante; resume cuentas cobradas/anuladas, artículos, bebidas, mesas y meseros. No reemplaza comprobantes electrónicos.';
revoke all on function public.reporte_ventas_restaurante(uuid, timestamptz, timestamptz, text, text, integer, integer) from public, anon;
grant execute on function public.reporte_ventas_restaurante(uuid, timestamptz, timestamptz, text, text, integer, integer) to authenticated;


-- #############################################################################
-- # 8/55 · ../migrations/20261031075708_reporte_ventas_dashboard.sql
-- #############################################################################

-- -- Conserva la clasificación de cocina/barra al momento de vender y entrega
-- agregados + detalle paginado en una sola respuesta, sin límite de filas REST.
alter table public.pedido_items
  add column if not exists es_bebida boolean not null default false;

update public.pedido_items pi
   set es_bebida = coalesce(pr.es_bebida, false)
  from public.productos pr
 where pi.producto_id = pr.id
   and pi.es_bebida is distinct from coalesce(pr.es_bebida, false);

create or replace function public.reporte_ventas_restaurante(
  p_restaurante_id uuid,
  p_desde timestamptz,
  p_hasta timestamptz,
  p_estado text default 'todas',
  p_busqueda text default '',
  p_offset integer default 0,
  p_limite integer default 25
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_resultado jsonb;
begin
  perform public.validar_acceso_restaurante(p_restaurante_id);
  if not public.soy_del_restaurante(p_restaurante_id)
     or not public.tengo_rol(array['admin_restaurante']) then
    raise exception 'Sin permiso para consultar el reporte de ventas';
  end if;
  if p_desde is null or p_hasta is null or p_desde >= p_hasta then
    raise exception 'El periodo del reporte no es válido';
  end if;
  if p_estado not in ('todas', 'pagada', 'anulada') then
    raise exception 'El estado del reporte no es válido';
  end if;

  with cuentas_periodo as materialized (
    select c.*
      from public.cuentas c
     where c.restaurante_id = p_restaurante_id
       and c.estado::text in ('pagada', 'anulada')
       and coalesce(c.anulada_at, c.pagado_at, c.created_at) >= p_desde
       and coalesce(c.anulada_at, c.pagado_at, c.created_at) < p_hasta
  ),
  detalle as (
    select c.id as cuenta_id, cp.pedido_id, p.created_at as pedido_fecha,
           p.mesero_id, u.nombre as mesero_nombre, m.id as mesa_id, m.nombre as mesa_nombre,
           pi.id as item_id, pi.nombre_producto, pi.cantidad, pi.precio_unitario,
           coalesce(pi.es_bebida, false) as es_bebida,
           coalesce(pi.anulado, false) as item_anulado, pi.nota
      from cuentas_periodo c
      join public.cuenta_pedidos cp on cp.cuenta_id = c.id
      join public.pedidos p on p.id = cp.pedido_id and p.restaurante_id = p_restaurante_id
      join public.mesas m on m.id = p.mesa_id
      join public.usuarios u on u.id = p.mesero_id
      left join public.pedido_items pi on pi.pedido_id = p.id
  ),
  ventas_validas as (
    select d.* from detalle d join cuentas_periodo c on c.id = d.cuenta_id
     where c.estado::text = 'pagada' and d.item_id is not null and not d.item_anulado
  ),
  filtro_cuentas as (
    select c.id, c.numero, c.estado::text as estado, c.total, c.propina, c.vuelto,
           c.metodo_pago::text as metodo_pago, c.pagado_at, c.anulada_at,
           c.motivo_anulacion, c.monto_reembolsado, c.created_at,
           coalesce((select string_agg(distinct d.mesa_nombre, ', ' order by d.mesa_nombre)
                       from detalle d where d.cuenta_id = c.id), 'Sin mesa') as mesas,
           coalesce((select string_agg(distinct d.mesero_nombre, ', ' order by d.mesero_nombre)
                       from detalle d where d.cuenta_id = c.id), '—') as meseros
      from cuentas_periodo c
     where p_estado = 'todas' or c.estado::text = p_estado
  ),
  coincidencias as (
    select f.* from filtro_cuentas f
     where coalesce(p_busqueda, '') = ''
        or concat_ws(' ', f.numero, f.mesas, f.meseros,
             (select string_agg(d.nombre_producto, ' ') from detalle d where d.cuenta_id = f.id))
           ilike '%' || p_busqueda || '%'
  ),
  cuentas_json as (
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'id', f.id, 'numero', f.numero, 'estado', f.estado, 'total', f.total,
        'propina', f.propina, 'vuelto', f.vuelto, 'metodo_pago', f.metodo_pago,
        'pagado_at', f.pagado_at, 'anulada_at', f.anulada_at,
        'motivo_anulacion', f.motivo_anulacion, 'monto_reembolsado', f.monto_reembolsado,
        'created_at', f.created_at, 'mesas', f.mesas, 'meseros', f.meseros,
        'pagos', coalesce((select jsonb_agg(jsonb_build_object(
          'metodo_pago', pg.metodo_pago::text, 'monto', pg.monto) order by pg.created_at)
          from public.cuenta_pagos pg where pg.cuenta_id = f.id), '[]'::jsonb),
        'pedidos', coalesce((select jsonb_agg(jsonb_build_object(
          'pedido_id', d.pedido_id, 'created_at', d.pedido_fecha,
          'mesa', d.mesa_nombre, 'mesero', d.mesero_nombre,
          'items', (select coalesce(jsonb_agg(jsonb_build_object(
            'nombre', di.nombre_producto, 'cantidad', di.cantidad,
            'precio_unitario', di.precio_unitario,
            'total', round(di.cantidad * di.precio_unitario, 2),
            'es_bebida', di.es_bebida, 'anulado', di.item_anulado, 'nota', di.nota)
            order by di.nombre_producto), '[]'::jsonb)
            from detalle di where di.cuenta_id = f.id and di.pedido_id = d.pedido_id
              and di.item_id is not null)
        ) order by d.pedido_fecha, d.pedido_id)
          from (select distinct pedido_id, pedido_fecha, mesa_nombre, mesero_nombre
                  from detalle where cuenta_id = f.id) d), '[]'::jsonb)
      ) order by coalesce(f.pagado_at, f.anulada_at, f.created_at) desc, f.id desc
    ), '[]'::jsonb) as filas
      from (select * from coincidencias order by coalesce(pagado_at, anulada_at, created_at) desc, id desc
            offset greatest(p_offset, 0) limit least(greatest(p_limite, 1), 50)) f
  )
  select jsonb_build_object(
    'resumen', jsonb_build_object(
      'ventas', coalesce((select round(sum(total), 2) from cuentas_periodo where estado::text = 'pagada'), 0),
      'cuentas_pagadas', (select count(*) from cuentas_periodo where estado::text = 'pagada'),
      'cuentas_anuladas', (select count(*) from cuentas_periodo where estado::text = 'anulada'),
      'reembolsos', coalesce((select round(sum(monto_reembolsado), 2) from cuentas_periodo where estado::text = 'anulada'), 0),
      'propinas', coalesce((select round(sum(propina), 2) from cuentas_periodo where estado::text = 'pagada'), 0),
      'ticket_promedio', coalesce((select round(avg(total), 2) from cuentas_periodo where estado::text = 'pagada'), 0),
      'neto', coalesce((select round(sum(total), 2) from cuentas_periodo where estado::text = 'pagada'), 0)
               - coalesce((select round(sum(monto_reembolsado), 2) from cuentas_periodo where estado::text = 'anulada'), 0)
    ),
    'productos', coalesce((select jsonb_agg(to_jsonb(x) order by x.total desc)
      from (select nombre_producto as nombre, es_bebida, sum(cantidad)::integer as cantidad,
                   round(sum(cantidad * precio_unitario), 2) as total
              from ventas_validas group by nombre_producto, es_bebida) x), '[]'::jsonb),
    'meseros', coalesce((select jsonb_agg(to_jsonb(x) order by x.ventas desc)
      from (select mesero_id as id, mesero_nombre as nombre,
                   count(distinct pedido_id)::integer as pedidos,
                   sum(cantidad)::integer as unidades,
                   round(sum(cantidad * precio_unitario), 2) as ventas
              from ventas_validas group by mesero_id, mesero_nombre) x), '[]'::jsonb),
    'mesas', coalesce((select jsonb_agg(to_jsonb(x) order by x.ventas desc)
      from (select mesa_id as id, mesa_nombre as nombre,
                   count(distinct cuenta_id)::integer as cuentas,
                   round(sum(cantidad * precio_unitario), 2) as ventas
              from ventas_validas group by mesa_id, mesa_nombre) x), '[]'::jsonb),
    'ventas_por_dia', coalesce((select jsonb_agg(to_jsonb(x) order by x.fecha)
      from (select to_char((pagado_at at time zone 'America/Lima')::date, 'YYYY-MM-DD') as fecha,
                   round(sum(total), 2) as ventas, count(*)::integer as cuentas
              from cuentas_periodo where estado::text = 'pagada' and pagado_at is not null
              group by (pagado_at at time zone 'America/Lima')::date) x), '[]'::jsonb),
    'ventas_por_hora', coalesce((select jsonb_agg(to_jsonb(x) order by x.hora)
      from (select to_char(pagado_at at time zone 'America/Lima', 'HH24') || ':00' as hora,
                   round(sum(total), 2) as ventas, count(*)::integer as cuentas
              from cuentas_periodo where estado::text = 'pagada' and pagado_at is not null
              group by to_char(pagado_at at time zone 'America/Lima', 'HH24')) x), '[]'::jsonb),
    'ventas_por_metodo', coalesce((
      with partes as (
        select c.id as cuenta_id, c.total, pg.metodo_pago::text as metodo_pago, sum(pg.monto) as monto
          from cuentas_periodo c join public.cuenta_pagos pg on pg.cuenta_id = c.id
         where c.estado::text = 'pagada' group by c.id, c.total, pg.metodo_pago
      ), asignadas as (
        select metodo_pago, cuenta_id,
               total * monto / nullif(sum(monto) over (partition by cuenta_id), 0) as venta
          from partes
        union all
        select c.metodo_pago::text, c.id, c.total
          from cuentas_periodo c where c.estado::text = 'pagada'
            and not exists (select 1 from public.cuenta_pagos pg where pg.cuenta_id = c.id)
      )
      select jsonb_agg(jsonb_build_object('metodo_pago', x.metodo_pago,
             'ventas', round(x.ventas, 2), 'cuentas', x.cuentas) order by x.ventas desc)
        from (select metodo_pago, sum(venta) as ventas, count(distinct cuenta_id)::integer as cuentas
                from asignadas group by metodo_pago) x
    ), '[]'::jsonb),
    'cuentas', (select filas from cuentas_json),
    'total_cuentas', (select count(*) from coincidencias)
  ) into v_resultado;

  return v_resultado;
end;
$$;

comment on function public.reporte_ventas_restaurante(uuid, timestamptz, timestamptz, text, text, integer, integer) is
  'Reporte interno detallado y aislado por restaurante; resume cuentas cobradas/anuladas, artículos, bebidas, mesas y meseros. No reemplaza comprobantes electrónicos.';
revoke all on function public.reporte_ventas_restaurante(uuid, timestamptz, timestamptz, text, text, integer, integer) from public, anon;
grant execute on function public.reporte_ventas_restaurante(uuid, timestamptz, timestamptz, text, text, integer, integer) to authenticated;


-- #############################################################################
-- # 9/55 · ../migrations/20261029052901_datos_local_dominio.sql
-- #############################################################################

-- -- Datos del local: dominio opcional para identificar al personal.
-- No modifica usuarios, contraseñas, suscripciones ni documentos existentes.
alter table public.restaurantes
  add column if not exists dominio text;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.restaurantes'::regclass
      and conname = 'restaurantes_dominio_valido'
  ) then
    alter table public.restaurantes
      add constraint restaurantes_dominio_valido check (
        dominio is null or (
          char_length(dominio) <= 253
          and dominio = lower(btrim(dominio))
          and dominio ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?([.][a-z0-9]([a-z0-9-]*[a-z0-9])?)*[.][a-z]{2,}$'
        )
      );
  end if;
end;
$$;

comment on column public.restaurantes.dominio is
  'Dominio opcional de login del personal. Cambiarlo no renombra usuarios existentes.';

-- Se conserva la policy existente: solo el admin de su propio local activo
-- puede actualizar. El grant es columnario; no habilita modificar suscripciones.
grant update (dominio) on public.restaurantes to authenticated;


-- #############################################################################
-- # 10/55 · pin_autorizacion.sql
-- #############################################################################

-- -- Mesora · PIN de autorización + anulación de cobros.
--
-- PROBLEMA QUE RESUELVE
-- Con la anulación de ítems, un mesero podía quitar productos de una comanda
-- abierta sin que nadie se entere: la cuenta sale más baja y el restaurante
-- cobra de menos. Lo mismo, en mayor escala, con el cobro: una boleta ya emitida
-- es un documento contable y no se puede borrar desde la app.
--
-- La regla que se impone: anular ítems/cobros, cambiar al responsable de una
-- mesa y mover consumo requieren el PIN del restaurante cuando está configurado.
-- El PIN lo define el Admin y nadie más lo puede ver ni cambiar.
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
-- # 11/55 · rpc_crear_pedido.sql
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

    insert into public.pedido_items (pedido_id, producto_id, nombre_producto, cantidad, precio_unitario, nota, es_bebida)
    values (
      v_pedido_id,
      v_producto.id,
      v_producto.nombre,
      v_cantidad,
      v_precio,
      nullif(btrim(coalesce(v_item->>'nota', '')), ''),
      coalesce(v_producto.es_bebida, false)
    );
  end loop;

  update public.mesas set estado = 'ocupada' where id = p_mesa_id;

  return v_pedido_id;
end;
$$;


-- #############################################################################
-- # 12/55 · rpc_cerrar_cuenta.sql
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

-- Compatibilidad con instalaciones antiguas: `create table if not exists` no
-- agrega columnas a una tabla ya creada. La caja y los reportes necesitan esta
-- columna; los pagos históricos sin detalle conservan el fallback a
-- cuentas.metodo_pago.
alter table public.cuenta_pagos
  add column if not exists metodo_pago text;
create index if not exists cuenta_pagos_por_cuenta_metodo
  on public.cuenta_pagos (cuenta_id, metodo_pago);

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
-- # 13/55 · rpc_anular_cuenta.sql
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
  -- Una transacción abandonada no debe dejar la pantalla de caja esperando
  -- minutos por el bloqueo de esta boleta. El cliente resuelve el estado final
  -- antes de permitir que se repita la operación.
  set local lock_timeout = '5s';

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
-- # 14/55 · caja_turnos.sql
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
-- # 15/55 · 01_rls_completo.sql
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
-- punto 4 y 5 de validar_acceso_restaurante, expresada como booleano. La RPC se
-- concede a authenticated porque las policies la necesitan; limita el estado
-- visible al superadmin o a un miembro activo del restaurante consultado.
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
       and (
         public.soy_super_admin()
         or exists (
           select 1
             from public.usuarios u
            where u.id = auth.uid()
              and u.restaurante_id = r.id
              and coalesce(u.activo, true)
         )
       )
       and coalesce(r.suscripcion_activa, false)
       and (r.fecha_vencimiento is null or r.fecha_vencimiento >= now())
  );
$$;

comment on function public.suscripcion_vigente(uuid) is
  'El superadmin o un miembro activo del restaurante consultado puede conocer si su suscripción está vigente (null = indefinida). Helper de RLS: una policy no puede lanzar excepción.';

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
  for select to authenticated
  using ((select public.soy_del_restaurante(restaurante_id)));

drop policy if exists zonas_write_admin on public.zonas;
drop policy if exists zonas_insert_admin on public.zonas;
drop policy if exists zonas_update_admin on public.zonas;
drop policy if exists zonas_delete_admin on public.zonas;
create policy zonas_insert_admin on public.zonas
  for insert to authenticated
  with check ((select public.puedo_escribir_en(restaurante_id, array['admin_restaurante'])));
create policy zonas_update_admin on public.zonas
  for update to authenticated
  using ((select public.puedo_escribir_en(restaurante_id, array['admin_restaurante'])))
  with check ((select public.puedo_escribir_en(restaurante_id, array['admin_restaurante'])));
create policy zonas_delete_admin on public.zonas
  for delete to authenticated
  using ((select public.puedo_escribir_en(restaurante_id, array['admin_restaurante'])));

-- =============================================================================
-- 4 · mesas
-- =============================================================================
-- QUIEN LEE: cualquiera del restaurante.
-- QUIEN ESCRIBE: admin, mesero y cajero pueden actualizar las columnas de
-- operacion permitidas por los privilegios SQL; crear y borrar mesas es del admin.
-- mesero_responsable_id queda reservado a las RPC autorizadas.
alter table public.mesas enable row level security;

drop policy if exists mesas_select on public.mesas;
create policy mesas_select on public.mesas
  for select to authenticated
  using ((select public.soy_del_restaurante(restaurante_id)));

drop policy if exists mesas_write_admin on public.mesas;
drop policy if exists mesas_insert_admin on public.mesas;
drop policy if exists mesas_update_operacion on public.mesas;
drop policy if exists mesas_delete_admin on public.mesas;
create policy mesas_insert_admin on public.mesas
  for insert to authenticated
  with check ((select public.puedo_escribir_en(restaurante_id, array['admin_restaurante'])));
create policy mesas_update_operacion on public.mesas
  for update to authenticated
  using ((select public.puedo_escribir_en(restaurante_id, array['admin_restaurante', 'mesero', 'cajero'])))
  with check ((select public.puedo_escribir_en(restaurante_id, array['admin_restaurante', 'mesero', 'cajero'])));
create policy mesas_delete_admin on public.mesas
  for delete to authenticated
  using ((select public.puedo_escribir_en(restaurante_id, array['admin_restaurante'])));

-- RLS valida pertenencia, rol y suscripcion; los privilegios de columna limitan
-- el UPDATE a los campos que Mesora necesita exponer desde la API.
drop policy if exists mesas_update_estado on public.mesas;
-- La policy mesas_update_operacion anterior cubre esos tres roles.

-- =============================================================================
-- 5 · categorias_productos
-- =============================================================================
-- QUIÉN LEE: cualquiera del restaurante (el menú del mesero y la carta de
-- cocina/barra la necesitan).
--  QUIÉN ESCRIBE: solo el admin, con suscripción vigente.
alter table public.categorias_productos enable row level security;

drop policy if exists categorias_productos_select on public.categorias_productos;
create policy categorias_productos_select on public.categorias_productos
  for select to authenticated
  using ((select public.soy_del_restaurante(restaurante_id)));

drop policy if exists categorias_productos_write_admin on public.categorias_productos;
drop policy if exists categorias_productos_insert_admin on public.categorias_productos;
drop policy if exists categorias_productos_update_admin on public.categorias_productos;
drop policy if exists categorias_productos_delete_admin on public.categorias_productos;
create policy categorias_productos_insert_admin on public.categorias_productos
  for insert to authenticated
  with check ((select public.puedo_escribir_en(restaurante_id, array['admin_restaurante'])));
create policy categorias_productos_update_admin on public.categorias_productos
  for update to authenticated
  using ((select public.puedo_escribir_en(restaurante_id, array['admin_restaurante'])))
  with check ((select public.puedo_escribir_en(restaurante_id, array['admin_restaurante'])));
create policy categorias_productos_delete_admin on public.categorias_productos
  for delete to authenticated
  using ((select public.puedo_escribir_en(restaurante_id, array['admin_restaurante'])));

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
  for select to authenticated
  using ((select public.soy_del_restaurante(restaurante_id)));

drop policy if exists productos_write_admin on public.productos;
drop policy if exists productos_insert_admin on public.productos;
drop policy if exists productos_update_admin on public.productos;
drop policy if exists productos_delete_admin on public.productos;
create policy productos_insert_admin on public.productos
  for insert to authenticated
  with check ((select public.puedo_escribir_en(restaurante_id, array['admin_restaurante'])));
create policy productos_update_admin on public.productos
  for update to authenticated
  using ((select public.puedo_escribir_en(restaurante_id, array['admin_restaurante'])))
  with check ((select public.puedo_escribir_en(restaurante_id, array['admin_restaurante'])));
create policy productos_delete_admin on public.productos
  for delete to authenticated
  using ((select public.puedo_escribir_en(restaurante_id, array['admin_restaurante'])));

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
revoke all on public.correlativos from authenticated;

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
grant insert, delete on public.mesas to authenticated;
grant update (nombre, zona_id, estado) on public.mesas to authenticated;
grant insert, update, delete on public.categorias_productos to authenticated;
grant insert, update, delete on public.productos to authenticated;
grant insert, update on public.usuarios to authenticated;
revoke delete on public.usuarios from authenticated;
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
revoke all on public.restaurante_pins from authenticated;
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
-- # 16/55 · admin_super_restaurante.sql
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
-- # 17/55 · usuarios_super_admin.sql
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
-- # 18/55 · estadisticas_super_admin.sql
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
-- # 19/55 · soporte.sql
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
revoke delete on public.soporte_tickets from public, anon, authenticated;
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
-- # 20/55 · suscripciones_super_admin.sql
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

-- La identidad que queda en el historial se toma de la sesión verificada.
-- `p_creado_por` se mantiene temporalmente en la firma de las RPC por
-- compatibilidad con clientes anteriores, pero no se confía en su valor.
create or replace function public.fijar_actor_historial_suscripciones()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  if auth.uid() is not null then
    new.creado_por := auth.uid();
  end if;
  return new;
end;
$$;

revoke all on function public.fijar_actor_historial_suscripciones() from public, anon, authenticated;

drop trigger if exists trg_fijar_actor_historial_suscripciones
  on public.suscripciones_historial;
create trigger trg_fijar_actor_historial_suscripciones
  before insert on public.suscripciones_historial
  for each row execute function public.fijar_actor_historial_suscripciones();

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
-- # 21/55 · auditoria.sql
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
  -- suscripcion_reactivar, suscripcion_ajuste, configuracion_actualizar,
  -- mesa_transferir_responsable, mesa_mover_consumo.
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
-- # 22/55 · configuracion_global.sql
-- #############################################################################

-- -- =============================================================================
-- CONFIGURACIÓN GLOBAL + ALERTAS (Super Admin) — Mesora
-- =============================================================================
-- Dos piezas aditivas:
--   1. `configuracion_global`: fila única (id = 1) con el nombre de Mesora,
--      correo de contacto público, teléfono, logo e información general, y el precio mensual del
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

insert into public.configuracion_global (id, nombre_app, correo_soporte)
values (1, 'Mesora', 'mesoratech@gmail.com')
on conflict (id) do nothing;

comment on table public.configuracion_global is
  'Configuración general de la plataforma (fila única id = 1): nombre, contacto
  público, logo, información y precio mensual del plan. La lectura es pública
  (se muestra en la landing); la edición es exclusiva del super admin.';

alter table public.configuracion_global enable row level security;

-- Lectura pública: la landing muestra estos datos sin sesión.
drop policy if exists configuracion_global_select_public on public.configuracion_global;
create policy configuracion_global_select_public on public.configuracion_global
  for select to anon using (true);

drop policy if exists configuracion_global_select_super on public.configuracion_global;
create policy configuracion_global_select_super on public.configuracion_global
  for select to authenticated using (public.soy_super_admin());

drop policy if exists configuracion_global_update_super on public.configuracion_global;
create policy configuracion_global_update_super on public.configuracion_global
  for update to authenticated
  using (public.soy_super_admin())
  with check (public.soy_super_admin());
-- Sin INSERT/DELETE desde el cliente: la fila se siembra aquí.

-- La landing es anónima y necesita precio y datos de contacto. Se otorga
-- SELECT por COLUMNA (no sobre la tabla): así la anon key no puede leer
-- nombre interno, logo, información ni auditoría. RLS limita las filas (id=1),
-- pero una policy no filtra columnas.
revoke all on public.configuracion_global from anon;
grant select (precio_plan_mensual, correo_soporte, telefono_soporte)
  on public.configuracion_global to anon;
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
  (select has_column_privilege('anon', 'public.configuracion_global', 'telefono_soporte', 'select')) as anon_telefono_ok,
  (select has_column_privilege('anon', 'public.configuracion_global', 'informacion', 'select')) as anon_informacion_ok,
  (select has_function_privilege('anon', 'public.admin_alertas()', 'execute')) as anon_alerta,
  (select has_function_privilege('authenticated', 'public.admin_alertas()', 'execute')) as auth_alerta;
-- Esperado: rls_ok=true, fila_unica_ok=true, precio_plan=120, policies_ok=true,
-- trigger_ok=true, anon_precio_ok=true, anon_correo_ok=true,
-- anon_telefono_ok=true, anon_informacion_ok=false, anon_alerta=false,
-- auth_alerta=true.


-- #############################################################################
-- # 23/55 · seguridad_piloto.sql
-- #############################################################################

-- -- =============================================================================
-- Mesora · controles de piloto: límite de administradores y credenciales
-- =============================================================================
-- Aditivo e idempotente. El trigger protege el límite aunque se escriba desde
-- otra ruta (PostgREST, Edge Function o SQL); bloquear la fila del restaurante
-- serializa altas concurrentes.

alter table public.planes
  add column if not exists max_administradores integer not null default 3;

update public.planes
   set max_administradores = 3
 where clave = 'mesora_pro'
   and max_administradores is null;

comment on column public.planes.max_administradores is
  'Máximo de administradores activos por restaurante; un valor negativo significa sin límite.';

create or replace function public.validar_limite_administradores()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limite integer;
  v_actuales integer;
begin
  if new.rol <> 'admin_restaurante' or new.activo is not true then
    return new;
  end if;

  -- Cambios de datos de un administrador existente no consumen otro cupo.
  if tg_op = 'UPDATE'
     and old.rol = 'admin_restaurante'
     and old.activo is true
     and old.restaurante_id = new.restaurante_id then
    return new;
  end if;

  -- Evita que dos altas concurrentes vean el mismo cupo libre.
  perform 1
    from public.restaurantes
   where id = new.restaurante_id
   for update;

  select coalesce(p.max_administradores, 3)
    into v_limite
    from public.restaurantes r
    left join public.planes p on p.id = r.plan_id
   where r.id = new.restaurante_id;

  if v_limite < 0 then
    return new;
  end if;

  select count(*)
    into v_actuales
    from public.usuarios u
   where u.restaurante_id = new.restaurante_id
     and u.rol = 'admin_restaurante'
     and u.activo is true
     and u.id <> new.id;

  if v_actuales >= v_limite then
    raise exception 'El plan permite hasta % administradores activos.', v_limite
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.validar_limite_administradores() from public;
revoke all on function public.validar_limite_administradores() from anon;
revoke all on function public.validar_limite_administradores() from authenticated;

drop trigger if exists usuarios_limite_administradores on public.usuarios;
create trigger usuarios_limite_administradores
before insert or update of rol, activo, restaurante_id on public.usuarios
for each row execute function public.validar_limite_administradores();

-- Los clientes solo pueden cambiar los campos de personal usados por la UI.
-- email pertenece a Supabase Auth y se fija al crear la cuenta; id y restaurante
-- no se cambian desde PostgREST. El flag de contraseña lo modifican la Edge
-- Function de reset y esta RPC, nunca una escritura directa del navegador.
revoke update on public.usuarios from authenticated;
do $$
declare
  v_columna text;
begin
  for v_columna in
    select a.attname
      from pg_attribute a
     where a.attrelid = 'public.usuarios'::regclass
       and a.attnum > 0
       and not a.attisdropped
  loop
    execute format(
      'revoke update (%I) on public.usuarios from authenticated',
      v_columna
    );
  end loop;
end;
$$;
grant update (nombre, rol) on public.usuarios to authenticated;

create or replace function public.confirmar_cambio_password()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Se requiere una sesión válida';
  end if;

  update public.usuarios
     set debe_cambiar_password = false
   where id = auth.uid();

  if not found then
    raise exception 'No se encontró el perfil del usuario';
  end if;
end;
$$;

revoke all on function public.confirmar_cambio_password() from public;
revoke all on function public.confirmar_cambio_password() from anon;
grant execute on function public.confirmar_cambio_password() to authenticated;


-- #############################################################################
-- # 24/55 · ../migrations/20261030173318_seguridad_rpc_piloto.sql
-- #############################################################################

-- -- Cierra la API de funciones a anónimos y preserva el acceso autenticado real.
-- No cambia cuerpos de RPC ni permisos de tablas; no toca funciones de extensiones.
do $$
declare
  f record;
  v_firma text;
  v_auth boolean;
  v_servicio boolean;
begin
  for f in
    select p.oid, p.proname, p.prorettype, pg_get_function_identity_arguments(p.oid) as args
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
      and not exists (
        select 1 from pg_catalog.pg_depend d
        where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e'
      )
  loop
    v_firma := format('public.%I(%s)', f.proname, f.args);
    v_auth := has_function_privilege('authenticated', f.oid, 'execute');
    v_servicio := has_function_privilege('service_role', f.oid, 'execute');
    execute format('revoke execute on function %s from public, anon', v_firma);
    execute format('alter function %s set search_path = pg_catalog, public, extensions, pg_temp', v_firma);

    if f.prorettype = 'trigger'::regtype or f.proname in ('validar_pin_autorizacion', 'registrar_auditoria') then
      execute format('revoke execute on function %s from authenticated', v_firma);
    elsif v_auth then
      execute format('grant execute on function %s to authenticated', v_firma);
    end if;
    if v_servicio then execute format('grant execute on function %s to service_role', v_firma); end if;
  end loop;
end;
$$;

-- Las funciones nuevas deben declarar explícitamente su API pública.
alter default privileges in schema public revoke execute on functions from public, anon;


-- #############################################################################
-- # 25/55 · ../migrations/20261030173320_consultas_pendientes_piloto.sql
-- #############################################################################

-- -- Consultas acotadas a lo pendiente. JSON evita truncar el agregado por el
-- límite de filas de PostgREST. SECURITY INVOKER mantiene RLS por restaurante.
create or replace function public.pedidos_pendientes_mesa(p_restaurante_id uuid, p_mesa_id uuid)
returns jsonb language plpgsql stable security invoker
set search_path = pg_catalog, public, pg_temp
as $$
begin
  perform public.validar_acceso_restaurante(p_restaurante_id);
  if not public.soy_del_restaurante(p_restaurante_id) then
    raise exception 'Sin permiso para consultar este restaurante';
  end if;
  return (
    select coalesce(jsonb_agg(to_jsonb(p) order by p.created_at, p.id), '[]'::jsonb)
    from (
      select p.id, p.mesa_id, p.estado::text as estado, p.created_at
      from public.pedidos p
      where p.restaurante_id = p_restaurante_id and p.mesa_id = p_mesa_id
        and p.estado::text <> 'anulado'
        and not exists (
          select 1 from public.cuenta_pedidos cp
          join public.cuentas c on c.id = cp.cuenta_id
          where cp.pedido_id = p.id and c.estado::text = 'pagada'
        )
    ) p
  );
end;
$$;

create or replace function public.mesas_por_cobrar(p_restaurante_id uuid)
returns jsonb language plpgsql stable security invoker
set search_path = pg_catalog, public, pg_temp
as $$
begin
  perform public.validar_acceso_restaurante(p_restaurante_id);
  if not public.soy_del_restaurante(p_restaurante_id) then
    raise exception 'Sin permiso para consultar este restaurante';
  end if;
  return (
    select coalesce(jsonb_agg(to_jsonb(m) order by m.mesa_nombre, m.mesa_id), '[]'::jsonb)
    from (
      select m.id as mesa_id, m.nombre as mesa_nombre,
        round(sum(pi.cantidad * pi.precio_unitario), 2) as total,
        count(distinct p.id) as pedidos
      from public.mesas m
      join public.pedidos p on p.mesa_id = m.id and p.restaurante_id = m.restaurante_id
      join public.pedido_items pi on pi.pedido_id = p.id and coalesce(pi.anulado, false) = false
      where m.restaurante_id = p_restaurante_id and p.estado::text <> 'anulado'
        and not exists (
          select 1 from public.cuenta_pedidos cp
          join public.cuentas c on c.id = cp.cuenta_id
          where cp.pedido_id = p.id and c.estado::text = 'pagada'
        )
      group by m.id, m.nombre
      having sum(pi.cantidad * pi.precio_unitario) > 0.004
    ) m
  );
end;
$$;
revoke all on function public.pedidos_pendientes_mesa(uuid, uuid) from public, anon;
revoke all on function public.mesas_por_cobrar(uuid) from public, anon;
grant execute on function public.pedidos_pendientes_mesa(uuid, uuid) to authenticated;
grant execute on function public.mesas_por_cobrar(uuid) to authenticated;

-- Índices de FK de una columna que aún no cuentan con cobertura por prefijo.
-- No se eliminan índices: se preservan los existentes y se omiten extensiones.
do $$
declare f record;
begin
  for f in
    select c.conrelid, t.relname, a.attname, c.conkey[1] as attnum
    from pg_catalog.pg_constraint c
    join pg_catalog.pg_class t on t.oid = c.conrelid
    join pg_catalog.pg_namespace n on n.oid = t.relnamespace
    join pg_catalog.pg_attribute a on a.attrelid = t.oid and a.attnum = c.conkey[1]
    where n.nspname = 'public' and c.contype = 'f' and cardinality(c.conkey) = 1
      and not exists (
        select 1 from pg_catalog.pg_index i
        where i.indrelid = c.conrelid and i.indisvalid and i.indpred is null
          and i.indkey[0] = c.conkey[1]
      )
  loop
    execute format('create index if not exists %I on public.%I (%I)',
      left('idx_' || f.relname || '_' || f.attname || '_fk', 63), f.relname, f.attname);
  end loop;
end;
$$;


-- #############################################################################
-- # 26/55 · ../migrations/20261030173503_diagnostico_piloto.sql
-- #############################################################################

-- -- Diagnóstico mínimo: únicamente categorías y rutas normalizadas, sin mensajes,
-- PIN, correos, tokens, pedidos ni datos del cliente.
create or replace function public.registrar_error_cliente(p_tipo text, p_ruta text, p_contexto text)
returns void language plpgsql security invoker
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.usuarios where id=auth.uid() and coalesce(activo,true)
  ) then raise exception 'Se requiere una sesión activa'; end if;
  if p_tipo not in ('api','render','javascript','promise')
     or p_ruta not in ('/admin','/mesero','/cajero','/cocina','/super-admin','/restablecer','/login','otra')
     or p_contexto is null or p_contexto !~ '^[A-Za-z]{1,48}$' then
    raise exception 'Metadatos de diagnóstico inválidos';
  end if;
  raise log 'MESORA_CLIENT_ERROR tipo=% ruta=% contexto=%', p_tipo, p_ruta, p_contexto;
end;
$$;
revoke all on function public.registrar_error_cliente(text,text,text) from public, anon;
grant execute on function public.registrar_error_cliente(text,text,text) to authenticated;


-- #############################################################################
-- # 27/55 · ../migrations/20261030173925_indice_mesas_zona.sql
-- #############################################################################

-- -- Cubre también la FK compuesta que garantiza zona y mesa del mismo local.
create index if not exists idx_mesas_zona_restaurante on public.mesas(zona_id, restaurante_id);


-- #############################################################################
-- # 28/55 · ../migrations/20261102081247_acotar_politicas_rls_piloto.sql
-- #############################################################################

-- -- Acota las políticas de catálogo/mesas a usuarios autenticados y separa
-- INSERT/UPDATE/DELETE para evitar que FOR ALL también conceda SELECT.
-- En configuracion_global limita la lectura pública a anon y solo a los campos
-- que muestra la landing (precio y contacto); el resto queda para super_admin.

begin;

-- Mesas: lectura para usuarios autenticados del restaurante. Admin puede
-- insertar/borrar; admin, mesero y cajero mantienen UPDATE según su rol.
drop policy if exists mesas_select on public.mesas;
create policy mesas_select on public.mesas
  for select to authenticated
  using ((select public.soy_del_restaurante(restaurante_id)));

drop policy if exists mesas_write_admin on public.mesas;
drop policy if exists mesas_insert_admin on public.mesas;
drop policy if exists mesas_update_operacion on public.mesas;
drop policy if exists mesas_delete_admin on public.mesas;
drop policy if exists mesas_update_estado on public.mesas;
create policy mesas_insert_admin on public.mesas
  for insert to authenticated
  with check ((select public.puedo_escribir_en(restaurante_id, array['admin_restaurante'])));
create policy mesas_update_operacion on public.mesas
  for update to authenticated
  using ((select public.puedo_escribir_en(restaurante_id, array['admin_restaurante', 'mesero', 'cajero'])))
  with check ((select public.puedo_escribir_en(restaurante_id, array['admin_restaurante', 'mesero', 'cajero'])));
create policy mesas_delete_admin on public.mesas
  for delete to authenticated
  using ((select public.puedo_escribir_en(restaurante_id, array['admin_restaurante'])));

-- Categorías: el antiguo FOR ALL solapaba SELECT para administradores.
drop policy if exists categorias_productos_select on public.categorias_productos;
create policy categorias_productos_select on public.categorias_productos
  for select to authenticated
  using ((select public.soy_del_restaurante(restaurante_id)));

drop policy if exists categorias_productos_write_admin on public.categorias_productos;
drop policy if exists categorias_productos_insert_admin on public.categorias_productos;
drop policy if exists categorias_productos_update_admin on public.categorias_productos;
drop policy if exists categorias_productos_delete_admin on public.categorias_productos;
create policy categorias_productos_insert_admin on public.categorias_productos
  for insert to authenticated
  with check ((select public.puedo_escribir_en(restaurante_id, array['admin_restaurante'])));
create policy categorias_productos_update_admin on public.categorias_productos
  for update to authenticated
  using ((select public.puedo_escribir_en(restaurante_id, array['admin_restaurante'])))
  with check ((select public.puedo_escribir_en(restaurante_id, array['admin_restaurante'])));
create policy categorias_productos_delete_admin on public.categorias_productos
  for delete to authenticated
  using ((select public.puedo_escribir_en(restaurante_id, array['admin_restaurante'])));

-- Productos.
drop policy if exists productos_select on public.productos;
create policy productos_select on public.productos
  for select to authenticated
  using ((select public.soy_del_restaurante(restaurante_id)));

drop policy if exists productos_write_admin on public.productos;
drop policy if exists productos_insert_admin on public.productos;
drop policy if exists productos_update_admin on public.productos;
drop policy if exists productos_delete_admin on public.productos;
create policy productos_insert_admin on public.productos
  for insert to authenticated
  with check ((select public.puedo_escribir_en(restaurante_id, array['admin_restaurante'])));
create policy productos_update_admin on public.productos
  for update to authenticated
  using ((select public.puedo_escribir_en(restaurante_id, array['admin_restaurante'])))
  with check ((select public.puedo_escribir_en(restaurante_id, array['admin_restaurante'])));
create policy productos_delete_admin on public.productos
  for delete to authenticated
  using ((select public.puedo_escribir_en(restaurante_id, array['admin_restaurante'])));

-- Zonas.
drop policy if exists zonas_select on public.zonas;
create policy zonas_select on public.zonas
  for select to authenticated
  using ((select public.soy_del_restaurante(restaurante_id)));

drop policy if exists zonas_write_admin on public.zonas;
drop policy if exists zonas_insert_admin on public.zonas;
drop policy if exists zonas_update_admin on public.zonas;
drop policy if exists zonas_delete_admin on public.zonas;
create policy zonas_insert_admin on public.zonas
  for insert to authenticated
  with check ((select public.puedo_escribir_en(restaurante_id, array['admin_restaurante'])));
create policy zonas_update_admin on public.zonas
  for update to authenticated
  using ((select public.puedo_escribir_en(restaurante_id, array['admin_restaurante'])))
  with check ((select public.puedo_escribir_en(restaurante_id, array['admin_restaurante'])));
create policy zonas_delete_admin on public.zonas
  for delete to authenticated
  using ((select public.puedo_escribir_en(restaurante_id, array['admin_restaurante'])));

-- La landing pública requiere solo columnas concedidas a anon; la policy
-- anterior TO PUBLIC también exponía a todo usuario autenticado con SELECT de
-- tabla completa. Los super_admin conservan su policy propia.
drop policy if exists configuracion_global_select_public on public.configuracion_global;
create policy configuracion_global_select_public on public.configuracion_global
  for select to anon
  using (true);

-- RLS limita filas, no columnas. La landing muestra precio y contacto, así que
-- revocamos la lectura amplia previa de anon y concedemos solo esos tres campos.
revoke all on public.configuracion_global from anon;
grant select (precio_plan_mensual, correo_soporte, telefono_soporte)
  on public.configuracion_global to anon;

commit;


-- #############################################################################
-- # 29/55 · ../migrations/20261104065434_contacto_guardrails_incidentes.sql
-- #############################################################################

-- -- Protección del contacto comercial y registro de fallos operativos.
-- Las tablas privadas solo guardan huellas SHA-256 y códigos de fallo; no
-- contienen correos, direcciones IP ni contenido de consultas.

create schema if not exists private;

create table if not exists private.mesora_contact_limits (
  bucket text primary key,
  attempts integer not null default 0 check (attempts >= 0),
  expires_at timestamptz not null
);
create index if not exists mesora_contact_limits_expires_idx
  on private.mesora_contact_limits (expires_at);
alter table private.mesora_contact_limits enable row level security;
revoke all on private.mesora_contact_limits from public, anon, authenticated;

create table if not exists private.mesora_system_incidents (
  id bigint generated always as identity primary key,
  source text not null,
  code text not null,
  day date not null,
  occurrences integer not null default 1 check (occurrences > 0),
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  unique (source, code, day)
);
create index if not exists mesora_system_incidents_last_seen_idx
  on private.mesora_system_incidents (last_seen desc);
alter table private.mesora_system_incidents enable row level security;
revoke all on private.mesora_system_incidents from public, anon, authenticated;

-- Un bloqueo transaccional serializa las solicitudes concurrentes para que
-- ninguna pueda superar los contadores al leerlos simultáneamente.
create or replace function public.mesora_contact_can_send(
  p_email_hash text,
  p_ip_hash text
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_day text := to_char(v_now at time zone 'UTC', 'YYYYMMDD');
  v_hour text := to_char(v_now at time zone 'UTC', 'YYYYMMDDHH24');
  v_global text := 'global:' || v_day;
  v_email text := 'email:' || p_email_hash || ':' || v_day;
  v_ip text := case when p_ip_hash is null then null else 'ip:' || p_ip_hash || ':' || v_hour end;
  v_attempts integer;
  v_limit_code text;
begin
  if p_email_hash is null or p_email_hash !~ '^[0-9a-f]{64}$'
     or (p_ip_hash is not null and p_ip_hash !~ '^[0-9a-f]{64}$') then
    raise exception 'Huella inválida' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(511407070041::bigint);
  delete from private.mesora_contact_limits where expires_at < v_now;

  select attempts into v_attempts from private.mesora_contact_limits where bucket = v_global;
  if coalesce(v_attempts, 0) >= 50 then
    v_limit_code := 'contact_global_limit_reached';
  end if;
  if v_limit_code is null then
    select attempts into v_attempts from private.mesora_contact_limits where bucket = v_email;
    if coalesce(v_attempts, 0) >= 3 then v_limit_code := 'contact_rate_limited'; end if;
  end if;
  if v_limit_code is null and v_ip is not null then
    select attempts into v_attempts from private.mesora_contact_limits where bucket = v_ip;
    if coalesce(v_attempts, 0) >= 10 then v_limit_code := 'contact_rate_limited'; end if;
  end if;
  if v_limit_code is not null then
    -- Una sola incidencia por categoría y día; las denegaciones posteriores
    -- no disparan otro RPC ni crean una fila por petición abusiva.
    insert into private.mesora_system_incidents
      (source, code, day, occurrences, first_seen, last_seen)
    values
      ('contacto-comercial', v_limit_code, (v_now at time zone 'UTC')::date, 1, v_now, v_now)
    on conflict (source, code, day) do nothing;
    return false;
  end if;

  insert into private.mesora_contact_limits as lim (bucket, attempts, expires_at)
  values (v_global, 1, v_now + interval '2 days'),
         (v_email, 1, v_now + interval '2 days')
  on conflict (bucket) do update set attempts = lim.attempts + 1;
  if v_ip is not null then
    insert into private.mesora_contact_limits as lim (bucket, attempts, expires_at)
    values (v_ip, 1, v_now + interval '2 hours')
    on conflict (bucket) do update set attempts = lim.attempts + 1;
  end if;
  return true;
end;
$$;

revoke all on function public.mesora_contact_can_send(text, text) from public, anon, authenticated;
grant execute on function public.mesora_contact_can_send(text, text) to service_role;

create or replace function public.mesora_record_incident(
  p_source text,
  p_code text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_source not in ('contacto-comercial', 'admin-password-recovery', 'crear-restaurante')
     or p_code is null or p_code !~ '^[a-z0-9_]{3,60}$' then
    raise exception 'Código de incidente inválido' using errcode = '22023';
  end if;

  insert into private.mesora_system_incidents as inc
    (source, code, day, occurrences, first_seen, last_seen)
  values
    (p_source, p_code, (clock_timestamp() at time zone 'UTC')::date, 1, clock_timestamp(), clock_timestamp())
  on conflict (source, code, day) do update
     set occurrences = inc.occurrences + 1,
         last_seen = clock_timestamp();
end;
$$;

revoke all on function public.mesora_record_incident(text, text) from public, anon, authenticated;
grant execute on function public.mesora_record_incident(text, text) to service_role;

-- Solo el propietario ve las incidencias. No se muestran PII ni excepciones.
create or replace function public.mesora_system_alerts()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if not (select public.soy_super_admin()) then
    raise exception 'Solo el super administrador puede ver las incidencias.' using errcode = '42501';
  end if;

  select coalesce(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'id', 'inc-' || id,
      'tipo', 'incidente_sistema',
      'nivel', case when code in ('contact_rate_limited', 'contact_global_limit_reached')
        then 'advertencia' else 'critico' end,
      'titulo', case source
        when 'contacto-comercial' then case when code in ('contact_rate_limited', 'contact_global_limit_reached')
          then 'Límite de consultas alcanzado' else 'Fallo en el contacto comercial' end
        when 'admin-password-recovery' then 'Fallo en la recuperación de acceso'
        else 'Fallo en el alta de restaurante' end,
      'detalle', 'Código ' || code || ' · ' || occurrences || ' intento(s) en el día.',
      'fecha', last_seen,
      'restaurante_id', null,
      'restaurante_nombre', null,
      'referencia_id', null
    ) order by last_seen desc
  ), '[]'::jsonb) into v_result
  from (
    select id, source, code, occurrences, last_seen
    from private.mesora_system_incidents
    where last_seen >= clock_timestamp() - interval '7 days'
    order by last_seen desc
    limit 30
  ) recent;

  return v_result;
end;
$$;

revoke all on function public.mesora_system_alerts() from public, anon;
grant execute on function public.mesora_system_alerts() to authenticated;


-- #############################################################################
-- # 30/55 · ../migrations/20261104065733_confirmar_password_auth_trigger.sql
-- #############################################################################

-- -- Solo una contrasena cambiada en Supabase Auth puede desmarcar la clave temporal.
-- Se guarda una huella del hash de Auth cuando se activa la obligacion; la huella
-- no sirve para iniciar sesion y vive fuera del esquema expuesto.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.password_temporal_huellas (
  usuario_id uuid primary key references public.usuarios(id) on delete cascade,
  huella_auth text,
  marcada_at timestamptz not null default now(),
  reset_en_curso boolean not null default false,
  constraint password_temporal_huella_largo check (huella_auth is null or length(huella_auth) = 64)
);
alter table private.password_temporal_huellas enable row level security;
revoke all on table private.password_temporal_huellas from public, anon, authenticated;

-- Cuando el servidor marca debe_cambiar_password, captura la version actual
-- del hash de Auth. Un cliente no puede leer ni alterar esta tabla privada.
create or replace function private.mesora_registrar_password_temporal()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth, extensions, pg_temp
as $$
declare
  v_hash text;
begin
  if new.debe_cambiar_password then
    select au.encrypted_password into v_hash
      from auth.users au where au.id = new.id;
    if not found then
      raise exception 'No se encontro la identidad de Auth del usuario';
    end if;
    insert into private.password_temporal_huellas(usuario_id, huella_auth, marcada_at)
      values (new.id, case when v_hash is null then null
                           else encode(extensions.digest(v_hash, 'sha256'), 'hex') end, now())
      on conflict (usuario_id) do update
        set huella_auth = excluded.huella_auth,
            marcada_at = excluded.marcada_at;
  else
    delete from private.password_temporal_huellas where usuario_id = new.id;
  end if;
  return new;
end;
$$;
revoke all on function private.mesora_registrar_password_temporal() from public, anon, authenticated;

drop trigger if exists usuarios_password_temporal_huella on public.usuarios;
create trigger usuarios_password_temporal_huella
  after insert or update of debe_cambiar_password on public.usuarios
  for each row execute function private.mesora_registrar_password_temporal();

-- Usuarios que ya estaban obligados antes de instalar esta migracion.
insert into private.password_temporal_huellas(usuario_id, huella_auth)
select u.id,
       case when au.encrypted_password is null then null
            else encode(extensions.digest(au.encrypted_password, 'sha256'), 'hex') end
  from public.usuarios u
  join auth.users au on au.id = u.id
 where u.debe_cambiar_password
on conflict (usuario_id) do update
  set huella_auth = excluded.huella_auth,
      marcada_at = now();

-- El reset administrativo ocurre en dos servicios distintos (PostgREST y
-- Supabase Auth). El marcador impide que el nuevo hash de la clave temporal se
-- confunda con el cambio personal del trabajador entre ambas operaciones.
create or replace function public.mesora_preparar_reset_password_personal(p_usuario_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth, extensions, pg_temp
as $$
begin
  if not exists (
    select 1 from public.usuarios u
     where u.id = p_usuario_id and u.rol in ('mesero', 'cocina', 'cajero')
     for update
  ) then
    raise exception 'No se encontro al trabajador para restablecer';
  end if;

  update public.usuarios set debe_cambiar_password = true where id = p_usuario_id;
  update private.password_temporal_huellas
     set reset_en_curso = true
   where usuario_id = p_usuario_id;
end;
$$;

create or replace function public.mesora_finalizar_reset_password_personal(p_usuario_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth, extensions, pg_temp
as $$
declare
  v_huella_anterior text;
  v_huella_actual text;
  v_en_curso boolean;
begin
  select h.huella_auth, h.reset_en_curso
    into v_huella_anterior, v_en_curso
    from private.password_temporal_huellas h
   where h.usuario_id = p_usuario_id for update;
  if not found or not v_en_curso then
    raise exception 'No hay un restablecimiento de personal en curso';
  end if;
  select case when au.encrypted_password is null then null
              else encode(extensions.digest(au.encrypted_password, 'sha256'), 'hex') end
    into v_huella_actual
    from auth.users au where au.id = p_usuario_id;
  if not found or v_huella_actual is null
     or v_huella_actual is not distinct from v_huella_anterior then
    raise exception 'Auth aun no actualizo la contrasena temporal';
  end if;

  -- El trigger reemplaza la huella vieja por la nueva; el marcador permanece
  -- activo hasta la siguiente instruccion, dentro de esta misma transaccion.
  update public.usuarios set debe_cambiar_password = true where id = p_usuario_id;
  update private.password_temporal_huellas
     set reset_en_curso = false
   where usuario_id = p_usuario_id;
end;
$$;

revoke all on function public.mesora_preparar_reset_password_personal(uuid) from public, anon, authenticated;
revoke all on function public.mesora_finalizar_reset_password_personal(uuid) from public, anon, authenticated;
grant execute on function public.mesora_preparar_reset_password_personal(uuid) to service_role;
grant execute on function public.mesora_finalizar_reset_password_personal(uuid) to service_role;

-- La RPC conserva su firma para la app, pero ahora compara con Auth antes de
-- levantar la obligacion. Ni un request directo a /rpc puede confirmarla sin
-- que la contrasena en Auth haya cambiado desde el ultimo reset administrativo.
create or replace function public.confirmar_cambio_password()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth, extensions, pg_temp
as $$
declare
  v_debe_cambiar boolean;
  v_huella_anterior text;
  v_huella_actual text;
  v_en_curso boolean;
begin
  if auth.uid() is null then
    raise exception 'Se requiere una sesion valida';
  end if;

  select u.debe_cambiar_password into v_debe_cambiar
    from public.usuarios u where u.id = auth.uid() for update;
  if not found then
    raise exception 'No se encontro el perfil del usuario';
  end if;
  if not v_debe_cambiar then return; end if;

  select h.huella_auth, h.reset_en_curso into v_huella_anterior, v_en_curso
    from private.password_temporal_huellas h where h.usuario_id = auth.uid();
  if not found then
    raise exception 'Falta el registro del cambio obligatorio de contrasena';
  end if;
  if v_en_curso then
    raise exception 'El restablecimiento administrativo sigue en curso';
  end if;
  select case when au.encrypted_password is null then null
              else encode(extensions.digest(au.encrypted_password, 'sha256'), 'hex') end
    into v_huella_actual
    from auth.users au where au.id = auth.uid();
  if not found or v_huella_actual is null
     or v_huella_actual is not distinct from v_huella_anterior then
    raise exception 'Primero cambia tu contrasena en Supabase Auth';
  end if;

  update public.usuarios set debe_cambiar_password = false where id = auth.uid();
end;
$$;
revoke all on function public.confirmar_cambio_password() from public, anon;
grant execute on function public.confirmar_cambio_password() to authenticated;


-- #############################################################################
-- # 31/55 · ../migrations/20261104172538_bandeja_comercial_alertas.sql
-- #############################################################################

-- -- Bandeja comercial privada y avisos por correo con reintentos.
-- Las consultas de la landing no son tickets de soporte de restaurantes.

create table private.mesora_commercial_leads (
  id uuid primary key default gen_random_uuid(),
  submission_key text not null unique check (submission_key ~ '^[0-9a-f]{64}$'),
  nombre text not null check (length(nombre) between 1 and 100),
  restaurante text not null check (length(restaurante) between 1 and 120),
  email text not null check (length(email) between 3 and 160),
  mensaje text not null check (length(mensaje) <= 1000),
  estado text not null default 'nuevo' check (estado in ('nuevo', 'en_seguimiento', 'cerrado')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index mesora_commercial_leads_created_idx
  on private.mesora_commercial_leads (created_at desc);
alter table private.mesora_commercial_leads enable row level security;
revoke all on private.mesora_commercial_leads from public, anon, authenticated;

create table private.mesora_mail_jobs (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('lead', 'support', 'incident')),
  dedupe_key text not null unique,
  payload jsonb not null,
  attempts integer not null default 0 check (attempts between 0 and 8),
  next_attempt timestamptz not null default now(),
  locked_until timestamptz,
  sent_at timestamptz,
  last_error_code text,
  created_at timestamptz not null default now()
);
create index mesora_mail_jobs_pending_idx
  on private.mesora_mail_jobs (next_attempt, created_at)
  where sent_at is null;
alter table private.mesora_mail_jobs enable row level security;
revoke all on private.mesora_mail_jobs from public, anon, authenticated;

alter table public.soporte_tickets
  add column tipo text not null default 'error'
  check (tipo in ('error', 'consulta', 'sugerencia'));

-- El cliente no puede autodefinir estado, responsable ni otro reportante.
drop policy if exists soporte_tickets_insert on public.soporte_tickets;
create policy soporte_tickets_insert on public.soporte_tickets
  for insert to authenticated
  with check (
    public.tengo_rol(array['admin_restaurante'])
    and restaurante_id = public.mi_restaurante_id()
    and usuario_id = (select auth.uid())
  );
revoke insert, update on public.soporte_tickets from authenticated;
grant insert (restaurante_id, usuario_id, asunto, descripcion, prioridad, tipo)
  on public.soporte_tickets to authenticated;
grant update (estado, prioridad, responsable)
  on public.soporte_tickets to authenticated;

-- Esta función se invoca únicamente con service_role desde contacto-comercial.
-- Un reintento con el mismo contenido y día conserva la misma consulta y aviso.
create or replace function public.mesora_register_commercial_lead(
  p_submission_key text, p_nombre text, p_restaurante text,
  p_email text, p_mensaje text
) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_lead_id uuid;
  v_job_id uuid;
begin
  if p_submission_key is null or p_submission_key !~ '^[0-9a-f]{64}$'
     or p_nombre is null or length(btrim(p_nombre)) not between 1 and 100
     or p_restaurante is null or length(btrim(p_restaurante)) not between 1 and 120
     or p_email is null or length(btrim(p_email)) not between 3 and 160
     or btrim(p_email) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     or p_mensaje is null or length(p_mensaje) > 1000 then
    raise exception 'Consulta comercial inválida' using errcode = '22023';
  end if;

  insert into private.mesora_commercial_leads
    (submission_key, nombre, restaurante, email, mensaje)
  values
    (p_submission_key, btrim(p_nombre), btrim(p_restaurante), lower(btrim(p_email)), p_mensaje)
  on conflict (submission_key) do nothing;
  select id into v_lead_id from private.mesora_commercial_leads
   where submission_key = p_submission_key;

  insert into private.mesora_mail_jobs (kind, dedupe_key, payload)
  values ('lead', 'lead:' || p_submission_key,
    pg_catalog.jsonb_build_object('lead_id', v_lead_id, 'nombre', btrim(p_nombre),
      'restaurante', btrim(p_restaurante), 'email', lower(btrim(p_email)),
      'mensaje', p_mensaje))
  on conflict (dedupe_key) do nothing;
  select id into v_job_id from private.mesora_mail_jobs
   where dedupe_key = 'lead:' || p_submission_key;
  return pg_catalog.jsonb_build_object('lead_id', v_lead_id, 'job_id', v_job_id);
end;
$$;
revoke all on function public.mesora_register_commercial_lead(text,text,text,text,text)
  from public, anon, authenticated;
grant execute on function public.mesora_register_commercial_lead(text,text,text,text,text)
  to service_role;

-- La inserción del ticket y la cola de aviso son una sola transacción.
create or replace function private.mesora_queue_support_ticket()
returns trigger language plpgsql security definer
set search_path = ''
as $$
declare
  v_restaurante text;
begin
  select nombre into v_restaurante from public.restaurantes where id = new.restaurante_id;
  insert into private.mesora_mail_jobs (kind, dedupe_key, payload)
  values ('support', 'support:' || new.id::text,
    pg_catalog.jsonb_build_object('codigo', new.codigo, 'asunto', new.asunto,
      'tipo', new.tipo, 'prioridad', new.prioridad,
      'restaurante', coalesce(v_restaurante, 'Sin restaurante')));
  return new;
end;
$$;
revoke all on function private.mesora_queue_support_ticket()
  from public, anon, authenticated;
create trigger mesora_queue_support_ticket
  after insert on public.soporte_tickets
  for each row execute function private.mesora_queue_support_ticket();

-- Solo los incidentes graves generan un correo y como máximo uno por código/día.
create or replace function public.mesora_record_incident(
  p_source text, p_code text
) returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_id bigint;
  v_day date := (clock_timestamp() at time zone 'UTC')::date;
begin
  if p_source not in ('contacto-comercial', 'admin-password-recovery', 'crear-restaurante')
     or p_code is null or p_code !~ '^[a-z0-9_]{3,60}$' then
    raise exception 'Código de incidente inválido' using errcode = '22023';
  end if;

  insert into private.mesora_system_incidents
    (source, code, day, occurrences, first_seen, last_seen)
  values (p_source, p_code, v_day, 1, clock_timestamp(), clock_timestamp())
  on conflict (source, code, day) do nothing returning id into v_id;
  if v_id is null then
    update private.mesora_system_incidents
       set occurrences = occurrences + 1, last_seen = clock_timestamp()
     where source = p_source and code = p_code and day = v_day;
  elsif p_code not in ('contact_rate_limited', 'contact_global_limit_reached') then
    insert into private.mesora_mail_jobs (kind, dedupe_key, payload)
    values ('incident', 'incident:' || v_id::text,
      pg_catalog.jsonb_build_object('source', p_source, 'code', p_code, 'day', v_day));
  end if;
end;
$$;
revoke all on function public.mesora_record_incident(text,text)
  from public, anon, authenticated;
grant execute on function public.mesora_record_incident(text,text) to service_role;

-- Lease evita que el envío inmediato y el programado procesen el mismo aviso.
create or replace function public.mesora_claim_mail_jobs(
  p_limit integer default 10, p_job_id uuid default null
) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare v_jobs jsonb;
begin
  if p_limit not between 1 and 20 then
    raise exception 'Límite inválido' using errcode = '22023';
  end if;
  with candidates as (
    select id from private.mesora_mail_jobs
     where sent_at is null and attempts < 8 and next_attempt <= now()
       and (locked_until is null or locked_until < now())
       and (p_job_id is null or id = p_job_id)
     order by created_at
     limit p_limit for update skip locked
  ), claimed as (
    update private.mesora_mail_jobs j
       set attempts = j.attempts + 1, locked_until = now() + interval '3 minutes'
      from candidates c where j.id = c.id
    returning j.id, j.kind, j.dedupe_key, j.payload
  )
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id', id, 'kind', kind, 'dedupe_key', dedupe_key, 'payload', payload
  )), '[]'::jsonb) into v_jobs from claimed;
  return v_jobs;
end;
$$;
revoke all on function public.mesora_claim_mail_jobs(integer,uuid)
  from public, anon, authenticated;
grant execute on function public.mesora_claim_mail_jobs(integer,uuid) to service_role;

create or replace function public.mesora_finish_mail_job(
  p_job_id uuid, p_success boolean, p_error_code text default null
) returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if p_error_code is not null and p_error_code !~ '^[a-z0-9_]{3,60}$' then
    raise exception 'Código de error inválido' using errcode = '22023';
  end if;
  update private.mesora_mail_jobs
     set sent_at = case when p_success then now() else sent_at end,
         locked_until = null,
         next_attempt = case when p_success then now()
           else now() + interval '1 minute' * least(power(3, attempts)::integer, 180) end,
         last_error_code = case when p_success then null else coalesce(p_error_code, 'send_failed') end
   where id = p_job_id and sent_at is null and locked_until >= now();
  if not found then
    raise exception 'Aviso no reservado o ya procesado';
  end if;
end;
$$;
revoke all on function public.mesora_finish_mail_job(uuid,boolean,text)
  from public, anon, authenticated;
grant execute on function public.mesora_finish_mail_job(uuid,boolean,text) to service_role;

-- El panel solo usa RPC: no se concede USAGE del esquema private al navegador.
create or replace function public.mesora_commercial_inbox()
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare v_result jsonb;
begin
  if not (select public.soy_super_admin()) then
    raise exception 'Solo el superadministrador puede ver consultas comerciales' using errcode = '42501';
  end if;
  select pg_catalog.jsonb_build_object(
    'resumen', pg_catalog.jsonb_build_object(
      'hoy', count(*) filter (where l.created_at >= date_trunc('day', now() at time zone 'America/Lima') at time zone 'America/Lima'),
      'ultimos_30_dias', count(*) filter (where l.created_at >= now() - interval '30 days'),
      'nuevas', count(*) filter (where l.estado = 'nuevo'),
      'correo_pendiente', count(*) filter (where j.sent_at is null and j.attempts < 8),
      'correo_fallido', count(*) filter (where j.sent_at is null and j.attempts >= 8)
    ),
    'consultas', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id', x.id, 'nombre', x.nombre, 'restaurante', x.restaurante,
      'email', x.email, 'mensaje', x.mensaje, 'estado', x.estado,
      'created_at', x.created_at, 'updated_at', x.updated_at,
      'correo_estado', case when x.sent_at is not null then 'enviado'
        when x.attempts >= 8 then 'fallido' else 'pendiente' end
    ) order by x.created_at desc)
    from (select l2.*, j2.sent_at, j2.attempts
      from private.mesora_commercial_leads l2
      join private.mesora_mail_jobs j2 on j2.dedupe_key = 'lead:' || l2.submission_key
      order by l2.created_at desc limit 100) x), '[]'::jsonb)
  ) into v_result
  from private.mesora_commercial_leads l
  join private.mesora_mail_jobs j on j.dedupe_key = 'lead:' || l.submission_key;
  return v_result;
end;
$$;
revoke all on function public.mesora_commercial_inbox() from public, anon;
grant execute on function public.mesora_commercial_inbox() to authenticated;

create or replace function public.mesora_update_commercial_lead(
  p_id uuid, p_estado text
) returns void language plpgsql security definer
set search_path = ''
as $$
begin
  if not (select public.soy_super_admin()) then
    raise exception 'Solo el superadministrador puede gestionar consultas' using errcode = '42501';
  end if;
  if p_estado not in ('nuevo', 'en_seguimiento', 'cerrado') then
    raise exception 'Estado inválido' using errcode = '22023';
  end if;
  update private.mesora_commercial_leads
     set estado = p_estado, updated_at = now() where id = p_id;
  if not found then raise exception 'Consulta no encontrada'; end if;
end;
$$;
revoke all on function public.mesora_update_commercial_lead(uuid,text) from public, anon;
grant execute on function public.mesora_update_commercial_lead(uuid,text) to authenticated;


-- #############################################################################
-- # 32/55 · ../migrations/20261105033712_soporte_conversaciones_seguimiento.sql
-- #############################################################################

-- -- Conversaciones de soporte visibles únicamente para el restaurante afectado y Mesora.
create table public.soporte_mensajes (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.soporte_tickets(id) on delete cascade,
  autor_id uuid not null references public.usuarios(id),
  autor_super_admin boolean not null,
  mensaje text not null check (length(btrim(mensaje)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index soporte_mensajes_ticket_fecha_idx on public.soporte_mensajes(ticket_id, created_at);
alter table public.soporte_mensajes enable row level security;
revoke all on public.soporte_mensajes from public, anon, authenticated;
grant select, insert(ticket_id, autor_id, autor_super_admin, mensaje) on public.soporte_mensajes to authenticated;

create policy soporte_mensajes_select on public.soporte_mensajes
  for select to authenticated using (
    exists (select 1 from public.soporte_tickets t where t.id = ticket_id)
  );
create policy soporte_mensajes_insert on public.soporte_mensajes
  for insert to authenticated with check (
    autor_id = (select auth.uid())
    and autor_super_admin = (select public.soy_super_admin())
    and exists (
      select 1 from public.soporte_tickets t
      where t.id = ticket_id
        and t.estado <> 'cerrado'
        and (public.soy_super_admin() or
          (public.tengo_rol(array['admin_restaurante'])
           and t.restaurante_id = public.mi_restaurante_id()))
    )
  );

alter table private.mesora_commercial_leads
  add column responsable text check (responsable is null or length(responsable) <= 120),
  add column nota_interna text check (nota_interna is null or length(nota_interna) <= 2000),
  add column proximo_contacto date;
create index mesora_commercial_followup_idx
  on private.mesora_commercial_leads(proximo_contacto)
  where estado <> 'cerrado' and proximo_contacto is not null;

create or replace function public.mesora_commercial_inbox()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_result jsonb;
begin
  if not (select public.soy_super_admin()) then
    raise exception 'Solo el superadministrador puede ver consultas comerciales' using errcode = '42501';
  end if;
  select pg_catalog.jsonb_build_object(
    'resumen', pg_catalog.jsonb_build_object(
      'hoy', count(*) filter (where l.created_at >= date_trunc('day', now() at time zone 'America/Lima') at time zone 'America/Lima'),
      'ultimos_30_dias', count(*) filter (where l.created_at >= now() - interval '30 days'),
      'nuevas', count(*) filter (where l.estado = 'nuevo'),
      'correo_pendiente', count(*) filter (where j.sent_at is null and j.attempts < 8),
      'correo_fallido', count(*) filter (where j.sent_at is null and j.attempts >= 8),
      'contactos_vencidos', count(*) filter (where l.estado <> 'cerrado' and l.proximo_contacto < (now() at time zone 'America/Lima')::date)
    ),
    'consultas', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id', x.id, 'nombre', x.nombre, 'restaurante', x.restaurante,
      'email', x.email, 'mensaje', x.mensaje, 'estado', x.estado,
      'created_at', x.created_at, 'updated_at', x.updated_at,
      'responsable', x.responsable, 'nota_interna', x.nota_interna,
      'proximo_contacto', x.proximo_contacto,
      'correo_estado', case when x.sent_at is not null then 'enviado'
        when x.attempts >= 8 then 'fallido' else 'pendiente' end
    ) order by x.created_at desc)
    from (select l2.*, j2.sent_at, j2.attempts
      from private.mesora_commercial_leads l2
      join private.mesora_mail_jobs j2 on j2.dedupe_key = 'lead:' || l2.submission_key
      order by l2.created_at desc limit 100) x), '[]'::jsonb)
  )
  into v_result
  from private.mesora_commercial_leads l
  join private.mesora_mail_jobs j on j.dedupe_key = 'lead:' || l.submission_key;
  return v_result;
end;
$$;
revoke all on function public.mesora_commercial_inbox() from public, anon;
grant execute on function public.mesora_commercial_inbox() to authenticated;

create function public.mesora_update_commercial_followup(
  p_id uuid, p_responsable text, p_nota_interna text, p_proximo_contacto date
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not (select public.soy_super_admin()) then
    raise exception 'Solo el superadministrador puede gestionar consultas' using errcode = '42501';
  end if;
  if length(p_responsable) > 120 or length(p_nota_interna) > 2000 then
    raise exception 'Texto demasiado largo' using errcode = '22023';
  end if;
  update private.mesora_commercial_leads
     set responsable = nullif(btrim(p_responsable), ''),
         nota_interna = nullif(btrim(p_nota_interna), ''),
         proximo_contacto = p_proximo_contacto, updated_at = now()
   where id = p_id;
  if not found then raise exception 'Consulta no encontrada'; end if;
end;
$$;
revoke all on function public.mesora_update_commercial_followup(uuid,text,text,date) from public, anon;
grant execute on function public.mesora_update_commercial_followup(uuid,text,text,date) to authenticated;


-- #############################################################################
-- # 33/55 · ../migrations/20261105034329_soporte_mensajes_suscripcion.sql
-- #############################################################################

-- -- La suscripción vencida bloquea también las escrituras del módulo de soporte.
drop policy if exists soporte_tickets_insert on public.soporte_tickets;
create policy soporte_tickets_insert on public.soporte_tickets
  for insert to authenticated with check (
    public.puedo_escribir_en(restaurante_id, array['admin_restaurante'])
    and usuario_id = (select auth.uid())
  );

drop policy if exists soporte_mensajes_insert on public.soporte_mensajes;
create policy soporte_mensajes_insert on public.soporte_mensajes
  for insert to authenticated with check (
    autor_id = (select auth.uid())
    and autor_super_admin = (select public.soy_super_admin())
    and exists (
      select 1 from public.soporte_tickets t
      where t.id = ticket_id and t.estado <> 'cerrado'
        and (public.soy_super_admin() or
          public.puedo_escribir_en(t.restaurante_id, array['admin_restaurante']))
    )
  );


-- #############################################################################
-- # 34/55 · ../migrations/20261105042359_cerrar_borrado_directo_soporte.sql
-- #############################################################################

-- -- Revocar el privilegio SQL de borrado además de no definir una policy DELETE.
revoke delete on public.soporte_tickets from public, anon, authenticated;
revoke delete on public.soporte_mensajes from public, anon, authenticated;


-- #############################################################################
-- # 35/55 · ../migrations/20261105042814_indexar_foreign_keys_soporte.sql
-- #############################################################################

-- -- Índices para cubrir claves foráneas detectadas en el análisis de Supabase.
-- Ayudan al filtrar mensajes por autor y al borrar/actualizar usuarios asociados.
create index if not exists soporte_mensajes_autor_id_idx
  on public.soporte_mensajes (autor_id);

create index if not exists admin_recovery_tokens_usuario_id_idx
  on private.admin_recovery_tokens (usuario_id);


-- #############################################################################
-- # 36/55 · ../migrations/20261105050740_fijar_actor_historial_suscripciones.sql
-- #############################################################################

-- -- Evita que el cliente suplante al autor de una acción de suscripción.
-- La firma existente de las RPC se conserva para compatibilidad.
create or replace function public.fijar_actor_historial_suscripciones()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  if auth.uid() is not null then
    new.creado_por := auth.uid();
  end if;
  return new;
end;
$$;

revoke all on function public.fijar_actor_historial_suscripciones() from public, anon, authenticated;

drop trigger if exists trg_fijar_actor_historial_suscripciones
  on public.suscripciones_historial;
create trigger trg_fijar_actor_historial_suscripciones
  before insert on public.suscripciones_historial
  for each row execute function public.fijar_actor_historial_suscripciones();


-- #############################################################################
-- # 37/55 · ../migrations/20261105050911_revoke_direct_access_internal_tables.sql
-- #############################################################################

-- -- Estas tablas internas solo se usan desde RPC privilegiadas.
-- RLS sin políticas ya deniega filas; quitar también los grants directos
-- evita exponerlas si una política o el estado de RLS cambia por error.
revoke all on public.correlativos from anon, authenticated;
revoke all on public.restaurante_pins from anon, authenticated;


-- #############################################################################
-- # 38/55 · ../migrations/20261105055856_limitar_consulta_vigencia_suscripcion.sql
-- #############################################################################

-- -- Limita la consulta directa del estado de suscripción al superadmin y a
-- miembros activos del restaurante indicado. La función sigue siendo necesaria
-- para las policies de escritura y se ejecuta con SECURITY DEFINER.
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
       and (
         public.soy_super_admin()
         or exists (
           select 1
             from public.usuarios u
            where u.id = auth.uid()
              and u.restaurante_id = r.id
              and coalesce(u.activo, true)
         )
       )
       and coalesce(r.suscripcion_activa, false)
       and (r.fecha_vencimiento is null or r.fecha_vencimiento >= now())
  );
$$;

comment on function public.suscripcion_vigente(uuid) is
  'El superadmin o un miembro activo del restaurante consultado puede conocer si su suscripción está vigente (null = indefinida). Helper de RLS: una policy no puede lanzar excepción.';


-- #############################################################################
-- # 39/55 · ../migrations/20261105212322_transferir_mesas_y_reimprimir_boletas.sql
-- #############################################################################

-- -- Mesora · responsabilidad de mesas, traslado de consumo y reimpresión de recibos
--
-- Las comandas mantienen su mesero de origen para que ventas históricas no
-- cambien cuando se entrega una mesa. La mesa registra quién la atiende ahora.
-- Los recibos nuevos congelan sus datos visibles al momento del cobro.

alter table public.mesas
  add column if not exists mesero_responsable_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.mesas'::regclass
       and conname = 'mesas_mesero_responsable_fk'
  ) then
    alter table public.mesas
      add constraint mesas_mesero_responsable_fk
      foreign key (mesero_responsable_id) references public.usuarios(id) on delete set null;
  end if;
end;
$$;

alter table public.cuentas add column if not exists mesero_id_snapshot uuid;
alter table public.cuentas add column if not exists mesero_nombre_snapshot text;
alter table public.cuentas add column if not exists mesa_nombre_snapshot text;
alter table public.cuentas add column if not exists restaurante_nombre_snapshot text;
alter table public.cuentas add column if not exists restaurante_direccion_snapshot text;
alter table public.cuentas add column if not exists restaurante_ruc_snapshot text;
alter table public.cuentas add column if not exists restaurante_telefono_snapshot text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.cuentas'::regclass
       and conname = 'cuentas_mesero_snapshot_fk'
  ) then
    alter table public.cuentas
      add constraint cuentas_mesero_snapshot_fk
      foreign key (mesero_id_snapshot) references public.usuarios(id) on delete set null;
  end if;
end;
$$;

-- Esta función conserva en la cuenta el texto que se imprimió al cobrar.
create or replace function public.capturar_snapshot_boleta()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_restaurante record;
  v_mesa_nombre text;
  v_mesero_nombre text;
begin
  select r.nombre, r.direccion, r.ruc, r.telefono
    into v_restaurante
    from public.restaurantes r
   where r.id = new.restaurante_id;

  select m.nombre into v_mesa_nombre
    from public.mesas m
   where m.id = new.mesa_id and m.restaurante_id = new.restaurante_id;

  select u.nombre into v_mesero_nombre
    from public.usuarios u
   where u.id = auth.uid() and u.restaurante_id = new.restaurante_id;

  new.mesero_id_snapshot := auth.uid();
  new.mesero_nombre_snapshot := coalesce(new.mesero_nombre_snapshot, v_mesero_nombre);
  new.mesa_nombre_snapshot := coalesce(new.mesa_nombre_snapshot, v_mesa_nombre);
  new.restaurante_nombre_snapshot := coalesce(new.restaurante_nombre_snapshot, v_restaurante.nombre);
  new.restaurante_direccion_snapshot := coalesce(new.restaurante_direccion_snapshot, v_restaurante.direccion);
  new.restaurante_ruc_snapshot := coalesce(new.restaurante_ruc_snapshot, v_restaurante.ruc);
  new.restaurante_telefono_snapshot := coalesce(new.restaurante_telefono_snapshot, v_restaurante.telefono);
  return new;
end;
$$;

drop trigger if exists cuentas_capturar_snapshot_boleta on public.cuentas;
create trigger cuentas_capturar_snapshot_boleta
before insert on public.cuentas
for each row execute function public.capturar_snapshot_boleta();

-- Una mesa liberada deja de tener responsable. Esto cubre cobros, anulaciones
-- del último ítem y liberaciones manuales que ya existen en la aplicación.
create or replace function public.limpiar_responsable_mesa_libre()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.estado = 'libre' then
    new.mesero_responsable_id := null;
  end if;
  return new;
end;
$$;

drop trigger if exists mesas_limpiar_responsable_libre on public.mesas;
create trigger mesas_limpiar_responsable_libre
before update of estado on public.mesas
for each row execute function public.limpiar_responsable_mesa_libre();

-- Evita que un mesero cree comandas en una mesa que ya recibió otro. Si la mesa
-- aún no tiene responsable, el primer mesero que la abre se queda con ella,
-- salvo que existan comandas abiertas de un tercero (esas requieren intervención
-- del administrador o una transferencia explícita).
create or replace function public.validar_responsable_nueva_comanda()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rol text;
  v_estado text;
  v_responsable uuid;
begin
  if auth.uid() is null then
    return new;
  end if;

  select u.rol::text into v_rol
    from public.usuarios u
   where u.id = auth.uid()
     and u.restaurante_id = new.restaurante_id
     and coalesce(u.activo, true);

  if v_rol is distinct from 'mesero' then
    return new;
  end if;

  select m.estado, m.mesero_responsable_id
    into v_estado, v_responsable
    from public.mesas m
   where m.id = new.mesa_id
     and m.restaurante_id = new.restaurante_id
   for update;

  if not found then
    raise exception 'La mesa no pertenece al restaurante';
  end if;

  if v_responsable is not null and v_responsable <> auth.uid() then
    raise exception 'Esta mesa está asignada a otro mesero.';
  end if;

  if v_responsable is null and v_estado = 'ocupada' and exists (
    select 1
      from public.pedidos p
     where p.restaurante_id = new.restaurante_id
       and p.mesa_id = new.mesa_id
       and p.estado <> 'anulado'
       and p.mesero_id <> auth.uid()
       and exists (
         select 1 from public.pedido_items pi
          where pi.pedido_id = p.id and pi.anulado is not true
       )
       and not exists (
         select 1
           from public.cuenta_pedidos cp
           join public.cuentas c on c.id = cp.cuenta_id
          where cp.pedido_id = p.id and c.estado = 'pagada'
       )
  ) then
    raise exception 'Esta mesa tiene comandas de otro mesero. Pide al administrador que asigne la mesa.';
  end if;

  if v_responsable is null then
    update public.mesas
       set mesero_responsable_id = auth.uid()
     where id = new.mesa_id
       and restaurante_id = new.restaurante_id
       and mesero_responsable_id is null;
  end if;
  return new;
end;
$$;

drop trigger if exists pedidos_validar_responsable on public.pedidos;
create trigger pedidos_validar_responsable
before insert on public.pedidos
for each row execute function public.validar_responsable_nueva_comanda();

-- Tras una entrega, el mesero anterior puede seguir viendo la comanda, pero no
-- editarla ni anularla. El nuevo responsable continúa el servicio.
create or replace function public.validar_responsable_edicion_item()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_restaurante_id uuid;
  v_mesa_id uuid;
  v_autor_id uuid;
  v_responsable uuid;
  v_rol text;
begin
  if auth.uid() is null then
    return new;
  end if;

  select p.restaurante_id, p.mesa_id, p.mesero_id
    into v_restaurante_id, v_mesa_id, v_autor_id
    from public.pedidos p
   where p.id = new.pedido_id;
  if not found then
    raise exception 'La comanda no existe';
  end if;

  select u.rol::text into v_rol
    from public.usuarios u
   where u.id = auth.uid()
     and u.restaurante_id = v_restaurante_id
     and coalesce(u.activo, true);
  if v_rol is distinct from 'mesero' then
    return new;
  end if;

  select m.mesero_responsable_id into v_responsable
    from public.mesas m
   where m.id = v_mesa_id and m.restaurante_id = v_restaurante_id
   for share;

  if (v_responsable is not null and v_responsable <> auth.uid())
     or (v_responsable is null and v_autor_id <> auth.uid()) then
    raise exception 'Esta mesa está asignada a otro mesero.';
  end if;
  return new;
end;
$$;

drop trigger if exists pedido_items_validar_responsable on public.pedido_items;
create trigger pedido_items_validar_responsable
before update on public.pedido_items
for each row execute function public.validar_responsable_edicion_item();

-- La tabla de rate limit solo la modifica la RPC de reimpresión; ningún usuario
-- puede leerla o escribirla directamente.
create table if not exists public.reimpresion_pin_intentos (
  restaurante_id uuid not null references public.restaurantes(id) on delete cascade,
  usuario_id uuid not null references public.usuarios(id) on delete cascade,
  intentos_fallidos smallint not null default 0 check (intentos_fallidos between 0 and 5),
  bloqueado_hasta timestamptz,
  actualizado_at timestamptz not null default now(),
  primary key (restaurante_id, usuario_id)
);
alter table public.reimpresion_pin_intentos enable row level security;
revoke all on public.reimpresion_pin_intentos from anon, authenticated;

-- Reasigna la responsabilidad de una mesa ocupada. Los pedidos anteriores
-- conservan `pedidos.mesero_id`, de modo que los reportes de ventas no cambian.
create or replace function public.asignar_mesa_mesero(
  p_restaurante_id uuid,
  p_mesa_id uuid,
  p_mesero_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rol text;
  v_mesa public.mesas%rowtype;
  v_hay_consumo boolean;
  v_hay_comanda_ajena boolean;
  v_hay_comanda_propia boolean;
begin
  perform public.validar_acceso_restaurante(p_restaurante_id);

  select u.rol::text into v_rol
    from public.usuarios u
   where u.id = auth.uid()
     and u.restaurante_id = p_restaurante_id
     and coalesce(u.activo, true);
  if coalesce(v_rol, '') not in ('mesero', 'admin_restaurante') then
    raise exception 'Solo el mesero responsable o el administrador puede pasar esta mesa.';
  end if;

  select m.* into v_mesa
    from public.mesas m
   where m.id = p_mesa_id and m.restaurante_id = p_restaurante_id
   for update;
  if not found or v_mesa.estado <> 'ocupada' then
    raise exception 'La mesa no está ocupada.';
  end if;

  if not exists (
    select 1 from public.usuarios u
     where u.id = p_mesero_id
       and u.restaurante_id = p_restaurante_id
       and u.rol::text = 'mesero'
       and coalesce(u.activo, true)
  ) then
    raise exception 'El mesero elegido no está activo en este restaurante.';
  end if;

  select exists (
    select 1 from public.pedidos p
     where p.restaurante_id = p_restaurante_id
       and p.mesa_id = p_mesa_id
       and p.estado <> 'anulado'
       and exists (select 1 from public.pedido_items pi where pi.pedido_id = p.id and pi.anulado is not true)
       and not exists (
         select 1 from public.cuenta_pedidos cp join public.cuentas c on c.id = cp.cuenta_id
          where cp.pedido_id = p.id and c.estado = 'pagada'
       )
  ) into v_hay_consumo;
  if not v_hay_consumo then
    raise exception 'La mesa no tiene consumo pendiente para transferir.';
  end if;

  if v_rol = 'mesero' then
    if v_mesa.mesero_responsable_id is not null and v_mesa.mesero_responsable_id <> auth.uid() then
      raise exception 'Esta mesa está asignada a otro mesero.';
    end if;

    select exists (
      select 1 from public.pedidos p
       where p.restaurante_id = p_restaurante_id
         and p.mesa_id = p_mesa_id
         and p.estado <> 'anulado'
         and p.mesero_id <> auth.uid()
         and exists (select 1 from public.pedido_items pi where pi.pedido_id = p.id and pi.anulado is not true)
         and not exists (
           select 1 from public.cuenta_pedidos cp join public.cuentas c on c.id = cp.cuenta_id
            where cp.pedido_id = p.id and c.estado = 'pagada'
         )
    ) into v_hay_comanda_ajena;
    select exists (
      select 1 from public.pedidos p
       where p.restaurante_id = p_restaurante_id
         and p.mesa_id = p_mesa_id
         and p.estado <> 'anulado'
         and p.mesero_id = auth.uid()
         and exists (select 1 from public.pedido_items pi where pi.pedido_id = p.id and pi.anulado is not true)
         and not exists (
           select 1 from public.cuenta_pedidos cp join public.cuentas c on c.id = cp.cuenta_id
            where cp.pedido_id = p.id and c.estado = 'pagada'
         )
    ) into v_hay_comanda_propia;
    if v_mesa.mesero_responsable_id is null and (v_hay_comanda_ajena or not v_hay_comanda_propia) then
      raise exception 'Solo el administrador puede asignar esta mesa porque tiene comandas de otro mesero.';
    end if;
  end if;

  update public.mesas
     set mesero_responsable_id = p_mesero_id
   where id = p_mesa_id and restaurante_id = p_restaurante_id;
end;
$$;

-- Mueve todas las comandas todavía no cobradas de una mesa a otra libre,
-- bloqueando ambas mesas en orden estable para evitar carreras y deadlocks.
create or replace function public.mover_consumo_mesa(
  p_restaurante_id uuid,
  p_mesa_origen_id uuid,
  p_mesa_destino_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rol text;
  v_origen public.mesas%rowtype;
  v_destino public.mesas%rowtype;
  v_responsable uuid;
  v_hay_consumo boolean;
  v_hay_comanda_ajena boolean;
  v_hay_comanda_propia boolean;
  v_pedidos_movidos integer;
begin
  perform public.validar_acceso_restaurante(p_restaurante_id);
  if p_mesa_origen_id = p_mesa_destino_id then
    raise exception 'Elige una mesa distinta.';
  end if;

  select u.rol::text into v_rol
    from public.usuarios u
   where u.id = auth.uid()
     and u.restaurante_id = p_restaurante_id
     and coalesce(u.activo, true);
  if coalesce(v_rol, '') not in ('mesero', 'admin_restaurante') then
    raise exception 'Solo el mesero responsable o el administrador puede mover este consumo.';
  end if;

  perform m.id
    from public.mesas m
   where m.restaurante_id = p_restaurante_id
     and m.id in (p_mesa_origen_id, p_mesa_destino_id)
   order by m.id
   for update;

  select m.* into v_origen
    from public.mesas m
   where m.id = p_mesa_origen_id and m.restaurante_id = p_restaurante_id;
  select m.* into v_destino
    from public.mesas m
   where m.id = p_mesa_destino_id and m.restaurante_id = p_restaurante_id;
  if v_origen.id is null or v_destino.id is null then
    raise exception 'Una de las mesas no pertenece al restaurante.';
  end if;
  if v_origen.estado <> 'ocupada' then
    raise exception 'La mesa de origen ya no está ocupada.';
  end if;
  if v_destino.estado <> 'libre' or v_destino.mesero_responsable_id is not null then
    raise exception 'La mesa de destino debe estar libre y sin responsable.';
  end if;

  select exists (
    select 1 from public.pedidos p
     where p.restaurante_id = p_restaurante_id
       and p.mesa_id = p_mesa_destino_id
       and p.estado <> 'anulado'
       and exists (select 1 from public.pedido_items pi where pi.pedido_id = p.id and pi.anulado is not true)
       and not exists (
         select 1 from public.cuenta_pedidos cp join public.cuentas c on c.id = cp.cuenta_id
          where cp.pedido_id = p.id and c.estado = 'pagada'
       )
  ) into v_hay_consumo;
  if v_hay_consumo then
    raise exception 'La mesa de destino debe estar libre y sin consumo pendiente.';
  end if;

  select exists (
    select 1 from public.pedidos p
     where p.restaurante_id = p_restaurante_id
       and p.mesa_id = p_mesa_origen_id
       and p.estado <> 'anulado'
       and exists (select 1 from public.pedido_items pi where pi.pedido_id = p.id and pi.anulado is not true)
       and not exists (
         select 1 from public.cuenta_pedidos cp join public.cuentas c on c.id = cp.cuenta_id
          where cp.pedido_id = p.id and c.estado = 'pagada'
       )
  ) into v_hay_consumo;
  if not v_hay_consumo then
    raise exception 'La mesa no tiene consumo pendiente para mover.';
  end if;

  if v_rol = 'mesero' then
    if v_origen.mesero_responsable_id is not null and v_origen.mesero_responsable_id <> auth.uid() then
      raise exception 'Esta mesa está asignada a otro mesero.';
    end if;
    select exists (
      select 1 from public.pedidos p
       where p.restaurante_id = p_restaurante_id
         and p.mesa_id = p_mesa_origen_id
         and p.estado <> 'anulado'
         and p.mesero_id <> auth.uid()
         and exists (select 1 from public.pedido_items pi where pi.pedido_id = p.id and pi.anulado is not true)
         and not exists (
           select 1 from public.cuenta_pedidos cp join public.cuentas c on c.id = cp.cuenta_id
            where cp.pedido_id = p.id and c.estado = 'pagada'
         )
    ) into v_hay_comanda_ajena;
    select exists (
      select 1 from public.pedidos p
       where p.restaurante_id = p_restaurante_id
         and p.mesa_id = p_mesa_origen_id
         and p.estado <> 'anulado'
         and p.mesero_id = auth.uid()
         and exists (select 1 from public.pedido_items pi where pi.pedido_id = p.id and pi.anulado is not true)
         and not exists (
           select 1 from public.cuenta_pedidos cp join public.cuentas c on c.id = cp.cuenta_id
            where cp.pedido_id = p.id and c.estado = 'pagada'
         )
    ) into v_hay_comanda_propia;
    if v_origen.mesero_responsable_id is null and (v_hay_comanda_ajena or not v_hay_comanda_propia) then
      raise exception 'Solo el administrador puede mover esta mesa porque tiene comandas de otro mesero.';
    end if;
  end if;

  v_responsable := v_origen.mesero_responsable_id;
  if v_responsable is null and v_rol = 'mesero' then
    v_responsable := auth.uid();
  elsif v_responsable is null and v_rol = 'admin_restaurante' then
    select p.mesero_id into v_responsable
      from public.pedidos p
     where p.restaurante_id = p_restaurante_id
       and p.mesa_id = p_mesa_origen_id
       and p.estado <> 'anulado'
       and exists (select 1 from public.pedido_items pi where pi.pedido_id = p.id and pi.anulado is not true)
       and not exists (
         select 1 from public.cuenta_pedidos cp join public.cuentas c on c.id = cp.cuenta_id
          where cp.pedido_id = p.id and c.estado = 'pagada'
       )
     order by p.created_at
     limit 1;
  end if;

  update public.pedidos p
     set mesa_id = p_mesa_destino_id, updated_at = now()
   where p.restaurante_id = p_restaurante_id
     and p.mesa_id = p_mesa_origen_id
     and p.estado <> 'anulado'
     and exists (select 1 from public.pedido_items pi where pi.pedido_id = p.id and pi.anulado is not true)
     and not exists (
       select 1 from public.cuenta_pedidos cp join public.cuentas c on c.id = cp.cuenta_id
        where cp.pedido_id = p.id and c.estado = 'pagada'
     );
  get diagnostics v_pedidos_movidos = row_count;
  if v_pedidos_movidos = 0 then
    raise exception 'No se encontraron comandas pendientes para mover.';
  end if;

  update public.mesas set estado = 'libre', mesero_responsable_id = null
   where id = p_mesa_origen_id and restaurante_id = p_restaurante_id;
  update public.mesas
     set estado = 'ocupada', mesero_responsable_id = v_responsable
   where id = p_mesa_destino_id and restaurante_id = p_restaurante_id;
end;
$$;

-- Restaura una boleta pagada existente, usando los snapshots capturados cuando
-- se emitió. Para cuentas antiguas sin snapshots usa el mejor dato histórico.
create or replace function public.reimprimir_boleta(
  p_restaurante_id uuid,
  p_cuenta_id uuid,
  p_pin text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rol text;
  v_cuenta public.cuentas%rowtype;
  v_restaurante record;
  v_mesa_nombre text;
  v_mesero_nombre text;
  v_items jsonb;
  v_intentos public.reimpresion_pin_intentos%rowtype;
  v_mensaje text;
begin
  perform public.validar_acceso_restaurante(p_restaurante_id);

  select u.rol::text into v_rol
    from public.usuarios u
   where u.id = auth.uid()
     and u.restaurante_id = p_restaurante_id
     and coalesce(u.activo, true);
  if coalesce(v_rol, '') not in ('admin_restaurante', 'cajero') then
    raise exception 'Solo el administrador o el cajero pueden reimprimir boletas.';
  end if;

  if v_rol = 'cajero' then
    if not exists (select 1 from public.restaurante_pins rp where rp.restaurante_id = p_restaurante_id) then
      raise exception 'El administrador debe configurar un PIN de autorización antes de permitir reimpresiones desde caja.';
    end if;

    insert into public.reimpresion_pin_intentos (restaurante_id, usuario_id)
    values (p_restaurante_id, auth.uid())
    on conflict (restaurante_id, usuario_id) do nothing;
    select i.* into v_intentos
      from public.reimpresion_pin_intentos i
     where i.restaurante_id = p_restaurante_id and i.usuario_id = auth.uid()
     for update;
    if v_intentos.bloqueado_hasta is not null and v_intentos.bloqueado_hasta > now() then
      raise exception 'Se superó el número de intentos. Espera 15 minutos o pide al administrador que autorice la reimpresión.';
    end if;

    begin
      perform public.validar_pin_autorizacion(p_restaurante_id, p_pin);
    exception when others then
      get stacked diagnostics v_mensaje = message_text;
      if v_mensaje = 'PIN de autorizacion incorrecto' then
        update public.reimpresion_pin_intentos
           set intentos_fallidos = least(intentos_fallidos + 1, 5),
               bloqueado_hasta = case when intentos_fallidos >= 4 then now() + interval '15 minutes' else null end,
               actualizado_at = now()
         where restaurante_id = p_restaurante_id and usuario_id = auth.uid();
        raise exception 'PIN del administrador incorrecto.' using errcode = '42501';
      end if;
      raise;
    end;
    update public.reimpresion_pin_intentos
       set intentos_fallidos = 0, bloqueado_hasta = null, actualizado_at = now()
     where restaurante_id = p_restaurante_id and usuario_id = auth.uid();
  end if;

  select c.* into v_cuenta
    from public.cuentas c
   where c.id = p_cuenta_id
     and c.restaurante_id = p_restaurante_id
     and c.estado = 'pagada';
  if not found then
    raise exception 'Solo se puede reimprimir una boleta pagada.';
  end if;

  select r.nombre, r.direccion, r.ruc, r.telefono into v_restaurante
    from public.restaurantes r where r.id = p_restaurante_id;
  select m.nombre into v_mesa_nombre
    from public.mesas m where m.id = v_cuenta.mesa_id and m.restaurante_id = p_restaurante_id;
  if v_cuenta.mesero_nombre_snapshot is null then
    select u.nombre into v_mesero_nombre
      from public.cuenta_pedidos cp
      join public.pedidos p on p.id = cp.pedido_id
      join public.usuarios u on u.id = p.mesero_id
     where cp.cuenta_id = v_cuenta.id
     order by p.created_at
     limit 1;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', pi.id,
        'pedido_id', pi.pedido_id,
        'producto_id', pi.producto_id,
        'nombre_producto', pi.nombre_producto,
        'cantidad', pi.cantidad,
        'precio_unitario', pi.precio_unitario,
        'nota', pi.nota,
        'anulado', pi.anulado,
        'es_bebida', pi.es_bebida
      ) order by p.created_at, pi.created_at, pi.id
    ),
    '[]'::jsonb
  ) into v_items
    from public.cuenta_pedidos cp
    join public.pedidos p on p.id = cp.pedido_id and p.restaurante_id = p_restaurante_id
    join public.pedido_items pi on pi.pedido_id = p.id
   where cp.cuenta_id = v_cuenta.id and pi.anulado is not true;
  if jsonb_array_length(v_items) = 0 then
    raise exception 'La boleta no tiene ítems disponibles para reimprimir.';
  end if;

  return jsonb_build_object(
    'cuenta', to_jsonb(v_cuenta),
    'restauranteNombre', coalesce(v_cuenta.restaurante_nombre_snapshot, v_restaurante.nombre, 'Restaurante'),
    'direccion', coalesce(v_cuenta.restaurante_direccion_snapshot, v_restaurante.direccion),
    'ruc', coalesce(v_cuenta.restaurante_ruc_snapshot, v_restaurante.ruc),
    'telefono', coalesce(v_cuenta.restaurante_telefono_snapshot, v_restaurante.telefono),
    'mesaNombre', coalesce(v_cuenta.mesa_nombre_snapshot, v_mesa_nombre, 'Mesa'),
    'meseroNombre', coalesce(v_cuenta.mesero_nombre_snapshot, v_mesero_nombre),
    'items', v_items
  );
end;
$$;

-- Ninguna actualización directa puede escribir la columna responsable.
revoke update on public.mesas from authenticated;
revoke update (mesero_responsable_id) on public.mesas from authenticated;
grant update (nombre, zona_id, estado) on public.mesas to authenticated;

revoke all on function public.capturar_snapshot_boleta() from public, anon, authenticated;
revoke all on function public.limpiar_responsable_mesa_libre() from public, anon, authenticated;
revoke all on function public.validar_responsable_nueva_comanda() from public, anon, authenticated;
revoke all on function public.validar_responsable_edicion_item() from public, anon, authenticated;
revoke all on function public.asignar_mesa_mesero(uuid, uuid, uuid) from public, anon;
revoke all on function public.mover_consumo_mesa(uuid, uuid, uuid) from public, anon;
revoke all on function public.reimprimir_boleta(uuid, uuid, text) from public, anon;
grant execute on function public.asignar_mesa_mesero(uuid, uuid, uuid) to authenticated;
grant execute on function public.mover_consumo_mesa(uuid, uuid, uuid) to authenticated;
grant execute on function public.reimprimir_boleta(uuid, uuid, text) to authenticated;

-- Verificación puntual de funciones y privilegios del cambio.
select p.proname,
       has_function_privilege('anon', p.oid, 'execute') as anon_puede,
       has_function_privilege('authenticated', p.oid, 'execute') as usuario_puede
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('asignar_mesa_mesero', 'mover_consumo_mesa', 'reimprimir_boleta')
 order by p.proname;


-- #############################################################################
-- # 40/55 · ../migrations/20261105212447_indizar_responsables_y_reimpresiones.sql
-- #############################################################################

-- -- Indices de las nuevas claves foraneas y busquedas de responsable.
-- El usuario de la mesa y el autor de una boleta pueden cambiar o desactivarse;
-- estos indices evitan escaneos al validar y al aplicar ON DELETE SET NULL.
create index if not exists mesas_mesero_responsable_idx
  on public.mesas (mesero_responsable_id);

create index if not exists cuentas_mesero_snapshot_idx
  on public.cuentas (mesero_id_snapshot);

create index if not exists reimpresion_pin_intentos_usuario_idx
  on public.reimpresion_pin_intentos (usuario_id);


-- #############################################################################
-- # 41/55 · ../migrations/20261105212734_proteger_cierre_mesa_reasignada.sql
-- #############################################################################

-- -- Una vez transferida la responsabilidad, el mesero anterior no puede cobrar
-- la mesa ni aunque tenga una pantalla antigua abierta. La RPC de cierre ya
-- bloquea la fila de la mesa; este trigger valida el responsable en ese mismo
-- bloqueo y deja admin_restaurante sin cambios.
create or replace function public.validar_responsable_cierre_cuenta()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rol text;
  v_responsable uuid;
begin
  if auth.uid() is null then
    return new;
  end if;

  select u.rol::text into v_rol
    from public.usuarios u
   where u.id = auth.uid()
     and u.restaurante_id = new.restaurante_id
     and coalesce(u.activo, true);

  if v_rol = 'mesero' then
    select m.mesero_responsable_id into v_responsable
      from public.mesas m
     where m.id = new.mesa_id
       and m.restaurante_id = new.restaurante_id
     for update;

    if v_responsable is not null and v_responsable <> auth.uid() then
      raise exception 'Esta mesa esta asignada a otro mesero.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists cuentas_validar_responsable_cierre on public.cuentas;
create trigger cuentas_validar_responsable_cierre
before insert on public.cuentas
for each row execute function public.validar_responsable_cierre_cuenta();

revoke all on function public.validar_responsable_cierre_cuenta() from public, anon, authenticated;


-- #############################################################################
-- # 42/55 · ../migrations/20261106064127_listar_meseros_activos_mismo_restaurante.sql
-- #############################################################################

-- -- Permite mostrar nombres de compañeros en cocina y en el traspaso de mesa.
-- `usuarios_select` permite al personal leer solo su propio perfil; abrir una
-- policy sobre la tabla expondría también sus correos. Esta RPC devuelve solo
-- los campos mínimos de meseros activos del restaurante del usuario actual.
begin;

create or replace function public.listar_meseros_activos_restaurante(
  p_restaurante_id uuid
)
returns table (
  id uuid,
  nombre text,
  activo boolean,
  rol text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rol text;
begin
  if auth.uid() is null then
    raise exception 'Se requiere una sesión válida';
  end if;

  perform public.validar_acceso_restaurante(p_restaurante_id);

  select u.rol::text
    into v_rol
    from public.usuarios as u
   where u.id = auth.uid()
     and u.restaurante_id = p_restaurante_id
     and coalesce(u.activo, true);

  if not found or v_rol not in ('admin_restaurante', 'mesero', 'cocina', 'cajero') then
    raise exception 'Sin acceso a este restaurante';
  end if;

  return query
  select u.id, u.nombre, coalesce(u.activo, true), u.rol::text
    from public.usuarios as u
   where u.restaurante_id = p_restaurante_id
     and u.rol::text = 'mesero'
     and coalesce(u.activo, true)
   order by lower(u.nombre), u.id;
end;
$$;

comment on function public.listar_meseros_activos_restaurante(uuid) is
  'Lista solo id, nombre, estado y rol de meseros activos del restaurante del usuario autenticado. No expone correos ni permite consultar otros restaurantes.';

revoke all on function public.listar_meseros_activos_restaurante(uuid) from public, anon;
grant execute on function public.listar_meseros_activos_restaurante(uuid) to authenticated;

commit;


-- #############################################################################
-- # 43/55 · ../migrations/20261106070508_proteger_traslados_mesa_con_pin_y_auditoria.sql
-- #############################################################################

-- -- Refuerza ambos traslados de mesa con motivo auditable y PIN del restaurante.
-- El PIN solo es obligatorio cuando el administrador configuró uno.
begin;

drop function if exists public.asignar_mesa_mesero(uuid, uuid, uuid);
create function public.asignar_mesa_mesero(
  p_restaurante_id uuid,
  p_mesa_id uuid,
  p_mesero_id uuid,
  p_pin text default null,
  p_motivo text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rol text;
  v_actor_nombre text;
  v_restaurante_nombre text;
  v_mesero_destino_nombre text;
  v_mesero_anterior_nombre text;
  v_motivo text := btrim(coalesce(p_motivo, ''));
  v_mesa public.mesas%rowtype;
  v_hay_consumo boolean;
  v_hay_comanda_ajena boolean;
  v_hay_comanda_propia boolean;
begin
  perform public.validar_acceso_restaurante(p_restaurante_id);

  select u.rol::text, u.nombre
    into v_rol, v_actor_nombre
    from public.usuarios u
   where u.id = auth.uid()
     and u.restaurante_id = p_restaurante_id
     and coalesce(u.activo, true);
  if coalesce(v_rol, '') not in ('mesero', 'admin_restaurante') then
    raise exception 'Solo el mesero responsable o el administrador puede pasar esta mesa.';
  end if;

  if char_length(v_motivo) < 5 or char_length(v_motivo) > 300 then
    raise exception 'Escribe un motivo de entre 5 y 300 caracteres.';
  end if;

  select m.* into v_mesa
    from public.mesas m
   where m.id = p_mesa_id and m.restaurante_id = p_restaurante_id
   for update;
  if not found or v_mesa.estado <> 'ocupada' then
    raise exception 'La mesa no está ocupada.';
  end if;

  select u.nombre into v_mesero_destino_nombre
    from public.usuarios u
   where u.id = p_mesero_id
     and u.restaurante_id = p_restaurante_id
     and u.rol::text = 'mesero'
     and coalesce(u.activo, true);
  if not found then
    raise exception 'El mesero elegido no está activo en este restaurante.';
  end if;
  if v_mesa.mesero_responsable_id = p_mesero_id then
    raise exception 'Esa persona ya es responsable de la mesa.';
  end if;

  select u.nombre into v_mesero_anterior_nombre
    from public.usuarios u
   where u.id = v_mesa.mesero_responsable_id
     and u.restaurante_id = p_restaurante_id;

  select exists (
    select 1 from public.pedidos p
     where p.restaurante_id = p_restaurante_id
       and p.mesa_id = p_mesa_id
       and p.estado <> 'anulado'
       and exists (select 1 from public.pedido_items pi where pi.pedido_id = p.id and pi.anulado is not true)
       and not exists (
         select 1 from public.cuenta_pedidos cp join public.cuentas c on c.id = cp.cuenta_id
          where cp.pedido_id = p.id and c.estado = 'pagada'
       )
  ) into v_hay_consumo;
  if not v_hay_consumo then
    raise exception 'La mesa no tiene consumo pendiente para transferir.';
  end if;

  if v_rol = 'mesero' then
    if v_mesa.mesero_responsable_id is not null and v_mesa.mesero_responsable_id <> auth.uid() then
      raise exception 'Esta mesa está asignada a otro mesero.';
    end if;

    select exists (
      select 1 from public.pedidos p
       where p.restaurante_id = p_restaurante_id
         and p.mesa_id = p_mesa_id
         and p.estado <> 'anulado'
         and p.mesero_id <> auth.uid()
         and exists (select 1 from public.pedido_items pi where pi.pedido_id = p.id and pi.anulado is not true)
         and not exists (
           select 1 from public.cuenta_pedidos cp join public.cuentas c on c.id = cp.cuenta_id
            where cp.pedido_id = p.id and c.estado = 'pagada'
         )
    ) into v_hay_comanda_ajena;
    select exists (
      select 1 from public.pedidos p
       where p.restaurante_id = p_restaurante_id
         and p.mesa_id = p_mesa_id
         and p.estado <> 'anulado'
         and p.mesero_id = auth.uid()
         and exists (select 1 from public.pedido_items pi where pi.pedido_id = p.id and pi.anulado is not true)
         and not exists (
           select 1 from public.cuenta_pedidos cp join public.cuentas c on c.id = cp.cuenta_id
            where cp.pedido_id = p.id and c.estado = 'pagada'
         )
    ) into v_hay_comanda_propia;
    if v_mesa.mesero_responsable_id is null and (v_hay_comanda_ajena or not v_hay_comanda_propia) then
      raise exception 'Solo el administrador puede asignar esta mesa porque tiene comandas de otro mesero.';
    end if;
  end if;

  perform public.validar_pin_autorizacion(p_restaurante_id, p_pin);

  update public.mesas
     set mesero_responsable_id = p_mesero_id
   where id = p_mesa_id and restaurante_id = p_restaurante_id;

  select r.nombre into v_restaurante_nombre from public.restaurantes r where r.id = p_restaurante_id;
  insert into public.audit_logs (
    actor_id, actor_rol, actor_nombre, restaurante_id, restaurante_nombre,
    entidad, entidad_id, accion, descripcion, detalle
  ) values (
    auth.uid(), v_rol, v_actor_nombre, p_restaurante_id, v_restaurante_nombre,
    'mesa', p_mesa_id, 'mesa_transferir_responsable',
    'Responsabilidad de ' || v_mesa.nombre || ' transferida' ||
      case when v_mesero_anterior_nombre is null then '' else ' de ' || v_mesero_anterior_nombre end ||
      ' a ' || v_mesero_destino_nombre || '.',
    jsonb_build_object(
      'mesa_id', p_mesa_id,
      'mesa_nombre', v_mesa.nombre,
      'mesero_anterior_id', v_mesa.mesero_responsable_id,
      'mesero_anterior_nombre', v_mesero_anterior_nombre,
      'mesero_nuevo_id', p_mesero_id,
      'mesero_nuevo_nombre', v_mesero_destino_nombre,
      'motivo', v_motivo
    )
  );
end;
$$;

drop function if exists public.mover_consumo_mesa(uuid, uuid, uuid);
create function public.mover_consumo_mesa(
  p_restaurante_id uuid,
  p_mesa_origen_id uuid,
  p_mesa_destino_id uuid,
  p_pin text default null,
  p_motivo text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rol text;
  v_actor_nombre text;
  v_restaurante_nombre text;
  v_origen public.mesas%rowtype;
  v_destino public.mesas%rowtype;
  v_responsable uuid;
  v_responsable_nombre text;
  v_hay_consumo boolean;
  v_hay_comanda_ajena boolean;
  v_hay_comanda_propia boolean;
  v_pedidos_movidos integer;
  v_motivo text := btrim(coalesce(p_motivo, ''));
begin
  perform public.validar_acceso_restaurante(p_restaurante_id);
  if p_mesa_origen_id = p_mesa_destino_id then
    raise exception 'Elige una mesa distinta.';
  end if;

  select u.rol::text, u.nombre into v_rol, v_actor_nombre
    from public.usuarios u
   where u.id = auth.uid()
     and u.restaurante_id = p_restaurante_id
     and coalesce(u.activo, true);
  if coalesce(v_rol, '') not in ('mesero', 'admin_restaurante') then
    raise exception 'Solo el mesero responsable o el administrador puede mover este consumo.';
  end if;
  if char_length(v_motivo) < 5 or char_length(v_motivo) > 300 then
    raise exception 'Escribe un motivo de entre 5 y 300 caracteres.';
  end if;

  perform m.id
    from public.mesas m
   where m.restaurante_id = p_restaurante_id
     and m.id in (p_mesa_origen_id, p_mesa_destino_id)
   order by m.id
   for update;

  select m.* into v_origen
    from public.mesas m
   where m.id = p_mesa_origen_id and m.restaurante_id = p_restaurante_id;
  select m.* into v_destino
    from public.mesas m
   where m.id = p_mesa_destino_id and m.restaurante_id = p_restaurante_id;
  if v_origen.id is null or v_destino.id is null then
    raise exception 'Una de las mesas no pertenece al restaurante.';
  end if;
  if v_origen.estado <> 'ocupada' then
    raise exception 'La mesa de origen ya no está ocupada.';
  end if;
  if v_destino.estado <> 'libre' or v_destino.mesero_responsable_id is not null then
    raise exception 'La mesa de destino debe estar libre y sin responsable.';
  end if;

  select exists (
    select 1 from public.pedidos p
     where p.restaurante_id = p_restaurante_id
       and p.mesa_id = p_mesa_destino_id
       and p.estado <> 'anulado'
       and exists (select 1 from public.pedido_items pi where pi.pedido_id = p.id and pi.anulado is not true)
       and not exists (
         select 1 from public.cuenta_pedidos cp join public.cuentas c on c.id = cp.cuenta_id
          where cp.pedido_id = p.id and c.estado = 'pagada'
       )
  ) into v_hay_consumo;
  if v_hay_consumo then
    raise exception 'La mesa de destino debe estar libre y sin consumo pendiente.';
  end if;

  select exists (
    select 1 from public.pedidos p
     where p.restaurante_id = p_restaurante_id
       and p.mesa_id = p_mesa_origen_id
       and p.estado <> 'anulado'
       and exists (select 1 from public.pedido_items pi where pi.pedido_id = p.id and pi.anulado is not true)
       and not exists (
         select 1 from public.cuenta_pedidos cp join public.cuentas c on c.id = cp.cuenta_id
          where cp.pedido_id = p.id and c.estado = 'pagada'
       )
  ) into v_hay_consumo;
  if not v_hay_consumo then
    raise exception 'La mesa no tiene consumo pendiente para mover.';
  end if;

  if v_rol = 'mesero' then
    if v_origen.mesero_responsable_id is not null and v_origen.mesero_responsable_id <> auth.uid() then
      raise exception 'Esta mesa está asignada a otro mesero.';
    end if;
    select exists (
      select 1 from public.pedidos p
       where p.restaurante_id = p_restaurante_id
         and p.mesa_id = p_mesa_origen_id
         and p.estado <> 'anulado'
         and p.mesero_id <> auth.uid()
         and exists (select 1 from public.pedido_items pi where pi.pedido_id = p.id and pi.anulado is not true)
         and not exists (
           select 1 from public.cuenta_pedidos cp join public.cuentas c on c.id = cp.cuenta_id
            where cp.pedido_id = p.id and c.estado = 'pagada'
         )
    ) into v_hay_comanda_ajena;
    select exists (
      select 1 from public.pedidos p
       where p.restaurante_id = p_restaurante_id
         and p.mesa_id = p_mesa_origen_id
         and p.estado <> 'anulado'
         and p.mesero_id = auth.uid()
         and exists (select 1 from public.pedido_items pi where pi.pedido_id = p.id and pi.anulado is not true)
         and not exists (
           select 1 from public.cuenta_pedidos cp join public.cuentas c on c.id = cp.cuenta_id
            where cp.pedido_id = p.id and c.estado = 'pagada'
         )
    ) into v_hay_comanda_propia;
    if v_origen.mesero_responsable_id is null and (v_hay_comanda_ajena or not v_hay_comanda_propia) then
      raise exception 'Solo el administrador puede mover esta mesa porque tiene comandas de otro mesero.';
    end if;
  end if;

  perform public.validar_pin_autorizacion(p_restaurante_id, p_pin);

  v_responsable := v_origen.mesero_responsable_id;
  if v_responsable is null and v_rol = 'mesero' then
    v_responsable := auth.uid();
  elsif v_responsable is null and v_rol = 'admin_restaurante' then
    select p.mesero_id into v_responsable
      from public.pedidos p
     where p.restaurante_id = p_restaurante_id
       and p.mesa_id = p_mesa_origen_id
       and p.estado <> 'anulado'
       and exists (select 1 from public.pedido_items pi where pi.pedido_id = p.id and pi.anulado is not true)
       and not exists (
         select 1 from public.cuenta_pedidos cp join public.cuentas c on c.id = cp.cuenta_id
          where cp.pedido_id = p.id and c.estado = 'pagada'
       )
     order by p.created_at
     limit 1;
  end if;
  select u.nombre into v_responsable_nombre
    from public.usuarios u where u.id = v_responsable and u.restaurante_id = p_restaurante_id;

  update public.pedidos p
     set mesa_id = p_mesa_destino_id, updated_at = now()
   where p.restaurante_id = p_restaurante_id
     and p.mesa_id = p_mesa_origen_id
     and p.estado <> 'anulado'
     and exists (select 1 from public.pedido_items pi where pi.pedido_id = p.id and pi.anulado is not true)
     and not exists (
       select 1 from public.cuenta_pedidos cp join public.cuentas c on c.id = cp.cuenta_id
        where cp.pedido_id = p.id and c.estado = 'pagada'
     );
  get diagnostics v_pedidos_movidos = row_count;
  if v_pedidos_movidos = 0 then
    raise exception 'No se encontraron comandas pendientes para mover.';
  end if;

  update public.mesas set estado = 'libre', mesero_responsable_id = null
   where id = p_mesa_origen_id and restaurante_id = p_restaurante_id;
  update public.mesas
     set estado = 'ocupada', mesero_responsable_id = v_responsable
   where id = p_mesa_destino_id and restaurante_id = p_restaurante_id;

  select r.nombre into v_restaurante_nombre from public.restaurantes r where r.id = p_restaurante_id;
  insert into public.audit_logs (
    actor_id, actor_rol, actor_nombre, restaurante_id, restaurante_nombre,
    entidad, entidad_id, accion, descripcion, detalle
  ) values (
    auth.uid(), v_rol, v_actor_nombre, p_restaurante_id, v_restaurante_nombre,
    'mesa', p_mesa_origen_id, 'mesa_mover_consumo',
    'Consumo movido de ' || v_origen.nombre || ' a ' || v_destino.nombre || '.',
    jsonb_build_object(
      'mesa_origen_id', p_mesa_origen_id,
      'mesa_origen_nombre', v_origen.nombre,
      'mesa_destino_id', p_mesa_destino_id,
      'mesa_destino_nombre', v_destino.nombre,
      'mesero_responsable_id', v_responsable,
      'mesero_responsable_nombre', v_responsable_nombre,
      'motivo', v_motivo,
      'pedidos_movidos', v_pedidos_movidos
    )
  );
end;
$$;

revoke all on function public.asignar_mesa_mesero(uuid, uuid, uuid, text, text) from public, anon;
revoke all on function public.mover_consumo_mesa(uuid, uuid, uuid, text, text) from public, anon;
grant execute on function public.asignar_mesa_mesero(uuid, uuid, uuid, text, text) to authenticated;
grant execute on function public.mover_consumo_mesa(uuid, uuid, uuid, text, text) to authenticated;

commit;


-- #############################################################################
-- # 44/55 · ../migrations/20261106075551_auditar_operaciones_caja_mesa.sql
-- #############################################################################

-- -- Registra anulaciones de ítems, boletas y cierres de caja sin abrir permisos
-- de escritura para clientes. Los triggers corren en la misma transacción que
-- la operación: si la auditoría no se guarda, tampoco se confirma el cambio.
begin;

create or replace function public.auditar_anulacion_item_operativa()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_restaurante_id uuid;
  v_restaurante_nombre text;
  v_mesa_id uuid;
  v_mesa_nombre text;
  v_actor_id uuid := coalesce(new.anulado_por, auth.uid());
  v_actor_rol text;
  v_actor_nombre text;
begin
  if old.anulado is true or new.anulado is not true then
    return new;
  end if;

  select p.restaurante_id, r.nombre, p.mesa_id, m.nombre
    into v_restaurante_id, v_restaurante_nombre, v_mesa_id, v_mesa_nombre
    from public.pedidos p
    join public.restaurantes r on r.id = p.restaurante_id
    left join public.mesas m on m.id = p.mesa_id and m.restaurante_id = p.restaurante_id
   where p.id = new.pedido_id;

  select u.rol::text, u.nombre into v_actor_rol, v_actor_nombre
    from public.usuarios u where u.id = v_actor_id;

  insert into public.audit_logs (
    actor_id, actor_rol, actor_nombre, restaurante_id, restaurante_nombre,
    entidad, entidad_id, accion, descripcion, detalle
  ) values (
    v_actor_id, v_actor_rol, v_actor_nombre, v_restaurante_id, v_restaurante_nombre,
    'pedido_item', new.id, 'comanda_item_anular',
    'Ítem «' || new.nombre_producto || '» anulado en ' || coalesce(v_mesa_nombre, 'una mesa') || '.',
    jsonb_build_object(
      'pedido_id', new.pedido_id,
      'mesa_id', v_mesa_id,
      'mesa_nombre', v_mesa_nombre,
      'producto', new.nombre_producto,
      'cantidad', new.cantidad,
      'precio_unitario', new.precio_unitario,
      'anulado_at', new.anulado_at
    )
  );
  return new;
end;
$$;

drop trigger if exists trg_auditar_anulacion_item_operativa on public.pedido_items;
create trigger trg_auditar_anulacion_item_operativa
  after update of anulado on public.pedido_items
  for each row execute function public.auditar_anulacion_item_operativa();
revoke all on function public.auditar_anulacion_item_operativa() from public, anon, authenticated;

create or replace function public.auditar_anulacion_cuenta_operativa()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_restaurante_nombre text;
  v_mesa_nombre text;
  v_actor_id uuid := coalesce(new.anulada_por, auth.uid());
  v_actor_rol text;
  v_actor_nombre text;
begin
  if old.estado <> 'pagada' or new.estado <> 'anulada' then
    return new;
  end if;

  select r.nombre into v_restaurante_nombre
    from public.restaurantes r where r.id = new.restaurante_id;
  select m.nombre into v_mesa_nombre
    from public.mesas m where m.id = new.mesa_id and m.restaurante_id = new.restaurante_id;
  select u.rol::text, u.nombre into v_actor_rol, v_actor_nombre
    from public.usuarios u where u.id = v_actor_id;

  insert into public.audit_logs (
    actor_id, actor_rol, actor_nombre, restaurante_id, restaurante_nombre,
    entidad, entidad_id, accion, descripcion, detalle
  ) values (
    v_actor_id, v_actor_rol, v_actor_nombre, new.restaurante_id, v_restaurante_nombre,
    'cuenta', new.id, 'cuenta_anular',
    'Boleta ' || coalesce(new.numero, new.id::text) || ' anulada; se registró la devolución.',
    jsonb_build_object(
      'numero', new.numero,
      'mesa_id', new.mesa_id,
      'mesa_nombre', v_mesa_nombre,
      'total', new.total,
      'propina', coalesce(new.propina, 0),
      'monto_reembolsado', new.monto_reembolsado,
      'motivo', new.motivo_anulacion,
      'anulada_at', new.anulada_at
    )
  );
  return new;
end;
$$;

drop trigger if exists trg_auditar_anulacion_cuenta_operativa on public.cuentas;
create trigger trg_auditar_anulacion_cuenta_operativa
  after update of estado on public.cuentas
  for each row execute function public.auditar_anulacion_cuenta_operativa();
revoke all on function public.auditar_anulacion_cuenta_operativa() from public, anon, authenticated;

create or replace function public.auditar_cierre_caja_operativo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_restaurante_nombre text;
  v_actor_id uuid := coalesce(new.usuario_cierre_id, auth.uid());
  v_actor_rol text;
  v_actor_nombre text;
begin
  if old.estado <> 'abierto' or new.estado <> 'cerrado' then
    return new;
  end if;

  select r.nombre into v_restaurante_nombre
    from public.restaurantes r where r.id = new.restaurante_id;
  select u.rol::text, u.nombre into v_actor_rol, v_actor_nombre
    from public.usuarios u where u.id = v_actor_id;

  insert into public.audit_logs (
    actor_id, actor_rol, actor_nombre, restaurante_id, restaurante_nombre,
    entidad, entidad_id, accion, descripcion, detalle
  ) values (
    v_actor_id, v_actor_rol, v_actor_nombre, new.restaurante_id, v_restaurante_nombre,
    'caja_turno', new.id, 'caja_turno_cerrar',
    'Turno de caja cerrado con el arqueo declarado.',
    jsonb_build_object(
      'turno_id', new.id,
      'monto_inicial', new.monto_inicial,
      'monto_declarado', new.monto_declarado,
      'monto_esperado', new.monto_esperado,
      'diferencia', new.diferencia,
      'observaciones', new.observaciones,
      'fecha_cierre', new.fecha_cierre
    )
  );
  return new;
end;
$$;

drop trigger if exists trg_auditar_cierre_caja_operativo on public.caja_turnos;
create trigger trg_auditar_cierre_caja_operativo
  after update of estado on public.caja_turnos
  for each row execute function public.auditar_cierre_caja_operativo();
revoke all on function public.auditar_cierre_caja_operativo() from public, anon, authenticated;

commit;


-- #############################################################################
-- # 45/55 · ../migrations/20261107043104_bloque2_seguridad_personal_auditoria.sql
-- #############################################################################

-- begin;

-- El personal conserva sus filas e historial. No se permiten bajas físicas ni
-- cambios de estado por UPDATE directo: estos últimos pasan por una Edge
-- Function que también bloquea/invalida sesiones de Supabase Auth.
drop policy if exists usuarios_delete_admin on public.usuarios;
revoke delete on public.usuarios from authenticated;
revoke update on public.usuarios from authenticated;
-- Revocar también el permiso por columna legado de seguridad_piloto.sql.
revoke update (activo) on public.usuarios from authenticated;
grant update (nombre, rol) on public.usuarios to authenticated;

-- Elimina cualquier firma previa que hubiera permitido llamar esta operación
-- con una sesión de usuario, omitiendo el ban de Supabase Auth.
drop function if exists public.admin_cambiar_estado_personal(uuid, boolean, text);
create or replace function public.admin_cambiar_estado_personal(
  p_actor_id uuid,
  p_usuario_id uuid,
  p_activo boolean,
  p_motivo text default null
)
returns public.usuarios
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.usuarios;
  v_objetivo public.usuarios;
  v_restaurante_nombre text;
  v_activo_anterior boolean;
  v_motivo text := nullif(left(trim(coalesce(p_motivo, '')), 240), '');
begin
  if p_actor_id is null or p_usuario_id is null or p_activo is null then
    raise exception 'Falta indicar el usuario y el estado nuevo.';
  end if;

  select * into v_actor
    from public.usuarios
   where id = p_actor_id and rol = 'admin_restaurante' and activo is true;
  if not found or v_actor.restaurante_id is null then
    raise exception 'Solo un administrador activo puede gestionar el personal de su restaurante.';
  end if;

  select * into v_objetivo
    from public.usuarios
   where id = p_usuario_id
   for update;
  if not found then
    raise exception 'No se encontró al usuario.';
  end if;
  if v_objetivo.restaurante_id is distinct from v_actor.restaurante_id
     or v_objetivo.rol not in ('mesero', 'cocina', 'cajero', 'admin_restaurante') then
    raise exception 'Ese usuario no pertenece a tu restaurante.';
  end if;
  if v_objetivo.id = v_actor.id then
    raise exception 'No puedes desactivar tu propio acceso.';
  end if;

  v_activo_anterior := coalesce(v_objetivo.activo, true);
  if v_activo_anterior = p_activo then
    raise exception 'El acceso ya tiene ese estado. Actualiza la lista e inténtalo de nuevo.';
  end if;

  update public.usuarios
     set activo = p_activo
   where id = p_usuario_id
  returning * into v_objetivo;

  select r.nombre into v_restaurante_nombre
    from public.restaurantes r where r.id = v_actor.restaurante_id;
  insert into public.audit_logs (
    actor_id, actor_rol, actor_nombre, restaurante_id, restaurante_nombre,
    entidad, entidad_id, accion, descripcion, detalle
  ) values (
    v_actor.id, v_actor.rol::text, v_actor.nombre, v_actor.restaurante_id,
    v_restaurante_nombre, 'usuario', v_objetivo.id,
    case when p_activo then 'usuario_reactivar' else 'usuario_desactivar' end,
    case when p_activo then 'Reactivó el acceso de ' else 'Desactivó el acceso de ' end || v_objetivo.nombre,
    jsonb_build_object(
      'rol', v_objetivo.rol,
      'activo_anterior', v_activo_anterior,
      'activo_nuevo', p_activo,
      'motivo', v_motivo
    )
  );

  return v_objetivo;
end;
$$;

comment on function public.admin_cambiar_estado_personal(uuid, uuid, boolean, text) is
  'Cambia el acceso reversible de un usuario del mismo restaurante y registra actor, antes/después y motivo. La Edge Function emparejada bloquea Auth y revoca sesiones al desactivar.';
revoke all on function public.admin_cambiar_estado_personal(uuid, uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.admin_cambiar_estado_personal(uuid, uuid, boolean, text) to service_role;

-- Si Auth rechaza la clave antes de cambiarla, libera la marca transitoria.
-- Solo la Edge Function puede llamar esta compensación.
create or replace function public.mesora_cancelar_reset_password_personal(p_usuario_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update private.password_temporal_huellas
     set reset_en_curso = false
   where usuario_id = p_usuario_id;
end;
$$;
revoke all on function public.mesora_cancelar_reset_password_personal(uuid) from public, anon, authenticated;
grant execute on function public.mesora_cancelar_reset_password_personal(uuid) to service_role;

-- Completa el reset de Auth, mantiene el cambio obligatorio y registra la
-- auditoría en la misma transacción. Ninguna clave entra a esta RPC.
create or replace function public.mesora_finalizar_reset_password_personal(
  p_usuario_id uuid,
  p_actor_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.usuarios;
  v_trabajador public.usuarios;
  v_huella_anterior text;
  v_huella_actual text;
  v_en_curso boolean;
  v_restaurante_nombre text;
begin
  select * into v_actor
    from public.usuarios
   where id = p_actor_id and rol = 'admin_restaurante' and activo is true;
  if not found or v_actor.restaurante_id is null then
    raise exception 'El administrador ya no tiene acceso activo.';
  end if;

  select * into v_trabajador
    from public.usuarios
   where id = p_usuario_id
     and restaurante_id = v_actor.restaurante_id
     and rol in ('mesero', 'cocina', 'cajero')
     and activo is true;
  if not found then
    raise exception 'El trabajador no pertenece a este restaurante o está inactivo.';
  end if;

  select h.huella_auth, h.reset_en_curso
    into v_huella_anterior, v_en_curso
    from private.password_temporal_huellas h
   where h.usuario_id = p_usuario_id
   for update;
  if not found or not v_en_curso then
    raise exception 'No hay un restablecimiento de personal en curso.';
  end if;
  select case when au.encrypted_password is null then null
              else encode(extensions.digest(au.encrypted_password, 'sha256'), 'hex') end
    into v_huella_actual
    from auth.users au where au.id = p_usuario_id;
  if not found or v_huella_actual is null
     or v_huella_actual is not distinct from v_huella_anterior then
    raise exception 'Auth aún no actualizó la contraseña.';
  end if;

  update public.usuarios set debe_cambiar_password = true where id = p_usuario_id;
  update private.password_temporal_huellas set reset_en_curso = false where usuario_id = p_usuario_id;
  select r.nombre into v_restaurante_nombre from public.restaurantes r where r.id = v_actor.restaurante_id;
  insert into public.audit_logs (
    actor_id, actor_rol, actor_nombre, restaurante_id, restaurante_nombre,
    entidad, entidad_id, accion, descripcion, detalle
  ) values (
    v_actor.id, v_actor.rol::text, v_actor.nombre, v_actor.restaurante_id,
    v_restaurante_nombre, 'usuario', v_trabajador.id, 'usuario_password_reset',
    'Restableció la contraseña del ' || v_trabajador.rol::text || ' ' || v_trabajador.nombre,
    jsonb_build_object('rol', v_trabajador.rol::text)
  );
end;
$$;
revoke all on function public.mesora_finalizar_reset_password_personal(uuid, uuid) from public;
revoke all on function public.mesora_finalizar_reset_password_personal(uuid, uuid) from anon, authenticated;
grant execute on function public.mesora_finalizar_reset_password_personal(uuid, uuid) to service_role;

create or replace function public.admin_buscar_cobros(
  p_desde timestamptz,
  p_hasta timestamptz,
  p_estado text default 'todas',
  p_metodo text default 'todos',
  p_busqueda text default '',
  p_offset integer default 0,
  p_limite integer default 25
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_restaurante_id uuid;
  v_busqueda text := lower(left(trim(coalesce(p_busqueda, '')), 80));
  v_offset integer := greatest(0, least(coalesce(p_offset, 0), 100000));
  v_limite integer := greatest(1, least(coalesce(p_limite, 25), 100));
  v_resultado jsonb;
begin
  if auth.uid() is null then raise exception 'Inicia sesión para consultar los cobros.'; end if;
  select u.restaurante_id into v_restaurante_id
    from public.usuarios u
   where u.id = auth.uid()
     and u.rol in ('admin_restaurante', 'cajero')
     and u.activo is true;
  if not found or v_restaurante_id is null then
    raise exception 'Solo el administrador o el cajero activo puede consultar los cobros.';
  end if;
  if p_desde is null or p_hasta is null or p_hasta <= p_desde then
    raise exception 'El rango de fechas no es válido.';
  end if;
  if coalesce(p_estado, 'todas') not in ('todas', 'pagada', 'anulada') then raise exception 'El estado de cobro no es válido.'; end if;
  if coalesce(p_metodo, 'todos') not in ('todos', 'efectivo', 'tarjeta', 'yape_plin', 'otro') then raise exception 'El método de pago no es válido.'; end if;

  with filtrado as materialized (
    select c.*
      from public.cuentas c
     where c.restaurante_id = v_restaurante_id
       and c.estado in ('pagada', 'anulada')
       and c.pagado_at >= p_desde
       and c.pagado_at < p_hasta
       and (coalesce(p_estado, 'todas') = 'todas' or c.estado::text = p_estado)
       and (
         coalesce(p_metodo, 'todos') = 'todos'
         or exists (
           select 1 from public.cuenta_pagos cp
            where cp.cuenta_id = c.id
              and cp.restaurante_id = v_restaurante_id
              and cp.metodo_pago::text = p_metodo
         )
       )
       and (
         v_busqueda = ''
         or lower(coalesce(c.numero, '')) like '%' || v_busqueda || '%'
         or lower(coalesce(c.mesa_nombre_snapshot, '')) like '%' || v_busqueda || '%'
         or lower(coalesce(c.mesero_nombre_snapshot, '')) like '%' || v_busqueda || '%'
         or c.total::text like '%' || replace(v_busqueda, ',', '.') || '%'
       )
  )
  select jsonb_build_object(
    'items', coalesce(
      (select jsonb_agg(to_jsonb(pagina) order by pagina.pagado_at desc)
         from (select f.* from filtrado f order by f.pagado_at desc, f.id desc limit v_limite offset v_offset) pagina),
      '[]'::jsonb
    ),
    'total', (select count(*) from filtrado)
  ) into v_resultado;
  return v_resultado;
end;
$$;

comment on function public.admin_buscar_cobros(timestamptz, timestamptz, text, text, text, integer, integer) is
  'Consulta cobros paginados del restaurante actual, con filtros por fecha, estado, cualquier parte de pago y datos de boleta.';
revoke all on function public.admin_buscar_cobros(timestamptz, timestamptz, text, text, text, integer, integer) from public;
revoke all on function public.admin_buscar_cobros(timestamptz, timestamptz, text, text, text, integer, integer) from anon;
grant execute on function public.admin_buscar_cobros(timestamptz, timestamptz, text, text, text, integer, integer) to authenticated;

create or replace function public.admin_listar_auditoria_restaurante(
  p_desde timestamptz default null,
  p_hasta timestamptz default null,
  p_busqueda text default '',
  p_categoria text default 'todas',
  p_offset integer default 0,
  p_limite integer default 50
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_restaurante_id uuid;
  v_busqueda text := lower(left(trim(coalesce(p_busqueda, '')), 120));
  v_offset integer := greatest(0, least(coalesce(p_offset, 0), 100000));
  v_limite integer := greatest(1, least(coalesce(p_limite, 50), 100));
  v_resultado jsonb;
begin
  if auth.uid() is null then
    raise exception 'Inicia sesión para consultar la auditoría.';
  end if;
  select u.restaurante_id into v_restaurante_id
    from public.usuarios u
   where u.id = auth.uid() and u.rol = 'admin_restaurante' and u.activo is true;
  if not found or v_restaurante_id is null then
    raise exception 'Solo un administrador activo puede consultar la auditoría de su restaurante.';
  end if;
  if coalesce(p_categoria, 'todas') not in ('todas', 'usuarios', 'mesas', 'caja', 'cuentas', 'pedidos', 'configuracion') then
    raise exception 'El filtro de auditoría no es válido.';
  end if;
  if p_desde is not null and p_hasta is not null and p_hasta <= p_desde then
    raise exception 'El rango de fechas no es válido.';
  end if;

  with filtrado as materialized (
    select l.*
      from public.audit_logs l
     where l.restaurante_id = v_restaurante_id
       and (p_desde is null or l.created_at >= p_desde)
       and (p_hasta is null or l.created_at < p_hasta)
       and (
         coalesce(p_categoria, 'todas') = 'todas'
         or (p_categoria = 'usuarios' and l.entidad = 'usuario')
         or (p_categoria = 'mesas' and (l.entidad = 'mesa' or l.accion like 'mesa_%'))
         or (p_categoria = 'caja' and (l.entidad = 'caja_turno' or l.accion like 'caja_%'))
         or (p_categoria = 'cuentas' and (l.entidad = 'cuenta' or l.accion like 'cuenta_%'))
         or (p_categoria = 'pedidos' and (l.entidad in ('pedido', 'pedido_item') or l.accion like 'comanda_%'))
         or (p_categoria = 'configuracion' and (l.entidad in ('restaurante', 'configuracion') or l.accion like 'configuracion_%'))
       )
       and (
         v_busqueda = ''
         or lower(concat_ws(' ', l.actor_nombre, l.actor_rol, l.entidad, l.entidad_id, l.accion, l.descripcion, l.detalle::text)) like '%' || v_busqueda || '%'
       )
  )
  select jsonb_build_object(
    'items', coalesce(
      (select jsonb_agg(to_jsonb(pagina) order by pagina.created_at desc)
         from (select f.* from filtrado f order by f.created_at desc, f.id desc limit v_limite offset v_offset) pagina),
      '[]'::jsonb
    ),
    'total', (select count(*) from filtrado)
  ) into v_resultado;

  return v_resultado;
end;
$$;

comment on function public.admin_listar_auditoria_restaurante(timestamptz, timestamptz, text, text, integer, integer) is
  'Devuelve auditoría paginada, filtrada y limitada al restaurante del administrador autenticado.';
revoke all on function public.admin_listar_auditoria_restaurante(timestamptz, timestamptz, text, text, integer, integer) from public;
revoke all on function public.admin_listar_auditoria_restaurante(timestamptz, timestamptz, text, text, integer, integer) from anon;
grant execute on function public.admin_listar_auditoria_restaurante(timestamptz, timestamptz, text, text, integer, integer) to authenticated;

commit;


-- #############################################################################
-- # 46/55 · ../migrations/20261107063406_auditoria_item_descripcion_utf8.sql
-- #############################################################################

-- -- Corrige la codificación de la descripción de anulaciones nuevas.
-- No reescribe las filas históricas; la interfaz las normaliza al mostrarlas.
begin;

create or replace function public.auditar_anulacion_item_operativa()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_restaurante_id uuid;
  v_restaurante_nombre text;
  v_mesa_id uuid;
  v_mesa_nombre text;
  v_actor_id uuid := coalesce(new.anulado_por, auth.uid());
  v_actor_rol text;
  v_actor_nombre text;
begin
  if old.anulado is true or new.anulado is not true then
    return new;
  end if;

  select p.restaurante_id, r.nombre, p.mesa_id, m.nombre
    into v_restaurante_id, v_restaurante_nombre, v_mesa_id, v_mesa_nombre
    from public.pedidos p
    join public.restaurantes r on r.id = p.restaurante_id
    left join public.mesas m on m.id = p.mesa_id and m.restaurante_id = p.restaurante_id
   where p.id = new.pedido_id;

  select u.rol::text, u.nombre into v_actor_rol, v_actor_nombre
    from public.usuarios u where u.id = v_actor_id;

  insert into public.audit_logs (
    actor_id, actor_rol, actor_nombre, restaurante_id, restaurante_nombre,
    entidad, entidad_id, accion, descripcion, detalle
  ) values (
    v_actor_id, v_actor_rol, v_actor_nombre, v_restaurante_id, v_restaurante_nombre,
    'pedido_item', new.id, 'comanda_item_anular',
    U&'\00CDtem \00AB' || new.nombre_producto || U&'\00BB anulado en ' || coalesce(v_mesa_nombre, 'una mesa') || '.',
    jsonb_build_object(
      'pedido_id', new.pedido_id,
      'mesa_id', v_mesa_id,
      'mesa_nombre', v_mesa_nombre,
      'producto', new.nombre_producto,
      'cantidad', new.cantidad,
      'precio_unitario', new.precio_unitario,
      'anulado_at', new.anulado_at
    )
  );
  return new;
end;
$$;

revoke all on function public.auditar_anulacion_item_operativa() from public, anon, authenticated;

commit;


-- #############################################################################
-- # 47/55 · ../migrations/20261107201714_bloque3_impresion_comandas.sql
-- #############################################################################

-- -- Mesora · Bloque 3: estaciones de preparación e impresión de comandas.
-- No altera pagos, boletas, roles ni políticas existentes.
begin;

alter table public.productos
  add column if not exists estacion text;

update public.productos
   set estacion = case when coalesce(es_bebida, false) then 'bar' else 'cocina' end
 where estacion is null or estacion not in ('cocina', 'bar', 'otros');

alter table public.productos
  alter column estacion set default 'cocina',
  alter column estacion set not null;

alter table public.productos
  drop constraint if exists productos_estacion_check;
alter table public.productos
  add constraint productos_estacion_check check (estacion in ('cocina', 'bar', 'otros'));

alter table public.pedido_items
  add column if not exists estacion text;

update public.pedido_items pi
   set estacion = case when coalesce(pi.es_bebida, false) then 'bar' else pr.estacion end
  from public.productos pr
 where pi.producto_id = pr.id
   and pi.estacion is null;

update public.pedido_items
   set estacion = case when coalesce(es_bebida, false) then 'bar' else 'cocina' end
 where estacion is null or estacion not in ('cocina', 'bar', 'otros');

alter table public.pedido_items
  alter column estacion set default 'cocina',
  alter column estacion set not null;

alter table public.pedido_items
  drop constraint if exists pedido_items_estacion_check;
alter table public.pedido_items
  add constraint pedido_items_estacion_check check (estacion in ('cocina', 'bar', 'otros'));

-- Snapshot inmutable de la estación al crear el ítem; cambiar el menú después
-- no mueve comandas históricas de una estación a otra.
create or replace function public.fijar_estacion_snapshot_pedido_item()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.producto_id is null then
    new.estacion := coalesce(new.estacion, 'cocina');
    return new;
  end if;

  select pr.estacion
    into new.estacion
    from public.productos pr
    join public.pedidos p
      on p.id = new.pedido_id
     and p.restaurante_id = pr.restaurante_id
   where pr.id = new.producto_id;

  if not found then
    raise exception 'El producto no pertenece a la comanda.';
  end if;
  return new;
end;
$$;

drop trigger if exists pedido_items_fijar_estacion on public.pedido_items;
create trigger pedido_items_fijar_estacion
before insert or update of producto_id on public.pedido_items
for each row execute function public.fijar_estacion_snapshot_pedido_item();
revoke all on function public.fijar_estacion_snapshot_pedido_item() from public, anon, authenticated;

-- La solicitud UUID hace idempotente el registro aun si la respuesta de red se
-- pierde después de que Postgres guardó la auditoría.
create unique index if not exists audit_logs_comanda_impresion_solicitud_unique
  on public.audit_logs ((detalle ->> 'solicitud_id'))
  where accion in ('comanda_imprimir', 'comanda_reimprimir')
    and detalle ? 'solicitud_id';

create or replace function public.registrar_impresion_comanda(
  p_restaurante_id uuid,
  p_pedido_id uuid,
  p_estacion text,
  p_solicitud_id uuid,
  p_motivo text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rol text;
  v_actor_nombre text;
  v_restaurante_nombre text;
  v_mesa_id uuid;
  v_mesa_nombre text;
  v_estado_pedido text;
  v_accion_existente text;
  v_es_reimpresion boolean;
  v_accion text;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
begin
  if auth.uid() is null then
    raise exception 'Inicia sesión para registrar la impresión.';
  end if;
  if p_solicitud_id is null then
    raise exception 'No se pudo identificar esta solicitud de impresión. Inténtalo de nuevo.';
  end if;
  if p_estacion is null or p_estacion not in ('cocina', 'bar', 'otros') then
    raise exception 'Selecciona una estación válida.';
  end if;

  perform public.validar_acceso_restaurante(p_restaurante_id);

  select u.rol::text, u.nombre
    into v_rol, v_actor_nombre
    from public.usuarios u
   where u.id = auth.uid()
     and u.restaurante_id = p_restaurante_id
     and coalesce(u.activo, true);
  if coalesce(v_rol, '') not in ('admin_restaurante', 'mesero', 'cocina') then
    raise exception 'Tu perfil no tiene permiso para imprimir comandas.';
  end if;

  select p.mesa_id, p.estado, r.nombre, m.nombre
    into v_mesa_id, v_estado_pedido, v_restaurante_nombre, v_mesa_nombre
    from public.pedidos p
    join public.restaurantes r on r.id = p.restaurante_id
    join public.mesas m on m.id = p.mesa_id and m.restaurante_id = p.restaurante_id
   where p.id = p_pedido_id
     and p.restaurante_id = p_restaurante_id
   for update of p;
  if not found then
    raise exception 'No se encontró la comanda de este restaurante.';
  end if;
  if v_estado_pedido = 'anulado' then
    raise exception 'La comanda está anulada y no se puede imprimir.';
  end if;
  if not exists (
    select 1 from public.pedido_items pi
     where pi.pedido_id = p_pedido_id
       and pi.estacion = p_estacion
       and pi.anulado is not true
  ) then
    raise exception 'Esta comanda no tiene productos pendientes para esa estación.';
  end if;

  -- Repetir el mismo request_id devuelve el resultado previo sin crear otra fila.
  select l.accion into v_accion_existente
    from public.audit_logs l
   where l.detalle ->> 'solicitud_id' = p_solicitud_id::text
     and l.actor_id = auth.uid()
     and l.restaurante_id = p_restaurante_id
     and l.entidad = 'pedido'
     and l.entidad_id = p_pedido_id
     and l.detalle ->> 'estacion' = p_estacion
   limit 1;
  if found then
    return jsonb_build_object('estado', 'registrada', 'accion', v_accion_existente);
  end if;
  if exists (select 1 from public.audit_logs l where l.detalle ->> 'solicitud_id' = p_solicitud_id::text) then
    raise exception 'La solicitud de impresión ya se usó para otra comanda.';
  end if;

  select exists (
    select 1 from public.audit_logs l
     where l.restaurante_id = p_restaurante_id
       and l.entidad = 'pedido'
       and l.entidad_id = p_pedido_id
       and l.accion in ('comanda_imprimir', 'comanda_reimprimir')
       and l.detalle ->> 'estacion' = p_estacion
  ) into v_es_reimpresion;

  if v_es_reimpresion and v_motivo is null then
    return jsonb_build_object('estado', 'requiere_motivo');
  end if;
  if v_es_reimpresion and (length(v_motivo) < 5 or length(v_motivo) > 300) then
    raise exception 'Escribe un motivo de reimpresión de entre 5 y 300 caracteres.';
  end if;

  v_accion := case when v_es_reimpresion then 'comanda_reimprimir' else 'comanda_imprimir' end;
  insert into public.audit_logs (
    actor_id, actor_rol, actor_nombre, restaurante_id, restaurante_nombre,
    entidad, entidad_id, accion, descripcion, detalle
  ) values (
    auth.uid(), v_rol, v_actor_nombre, p_restaurante_id, v_restaurante_nombre,
    'pedido', p_pedido_id, v_accion,
    case when v_es_reimpresion then 'Comanda reimpresa en ' else 'Comanda enviada a impresión en ' end
      || initcap(p_estacion) || ', mesa ' || v_mesa_nombre || '.',
    jsonb_build_object(
      'solicitud_id', p_solicitud_id,
      'pedido_id', p_pedido_id,
      'mesa_id', v_mesa_id,
      'mesa_nombre', v_mesa_nombre,
      'estacion', p_estacion,
      'motivo', v_motivo
    )
  );
  return jsonb_build_object('estado', 'registrada', 'accion', v_accion);
end;
$$;

revoke all on function public.registrar_impresion_comanda(uuid, uuid, text, uuid, text) from public;
revoke all on function public.registrar_impresion_comanda(uuid, uuid, text, uuid, text) from anon;
grant execute on function public.registrar_impresion_comanda(uuid, uuid, text, uuid, text) to authenticated;

commit;


-- #############################################################################
-- # 48/55 · ../migrations/20261108120000_sistema_operativo_configurable.sql
-- #############################################################################

-- -- Mesora · Sistema operativo configurable (fases 1 y 2, esquema expansivo).
-- No conecta pedidos, KDS, impresión ni cobros a estas tablas todavía.

create table if not exists public.configuracion_operativa (
  restaurante_id uuid primary key references public.restaurantes(id) on delete cascade,
  modalidad_cobro text not null default 'cobro_por_mesero'
    check (modalidad_cobro in (
      'solo_cajero', 'cobro_por_mesero', 'caja_central_meseros_autorizados'
    )),
  version integer not null default 1 check (version >= 1),
  actualizado_por uuid references public.usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.estaciones_restaurante (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes(id) on delete cascade,
  codigo text not null check (codigo in ('cocina', 'bar', 'otros')),
  nombre text not null check (length(btrim(nombre)) > 0),
  activo boolean not null default true,
  orden integer not null default 0 check (orden >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint estaciones_restaurante_codigo_unique unique (restaurante_id, codigo),
  constraint estaciones_restaurante_id_restaurante_unique unique (id, restaurante_id)
);

create table if not exists public.destinos_estacion (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes(id) on delete cascade,
  estacion_id uuid not null,
  tipo text not null check (tipo in ('kds', 'impresora')),
  grupo text not null default 'principal' check (grupo in ('principal', 'respaldo')),
  nombre text not null check (length(btrim(nombre)) > 0),
  papel_mm smallint,
  configuracion jsonb not null default '{}'::jsonb
    check (jsonb_typeof(configuracion) = 'object'),
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint destinos_estacion_papel_check check (
    (tipo = 'kds' and papel_mm is null)
    or (tipo = 'impresora' and papel_mm is not null and papel_mm in (58, 80))
  ),
  constraint destinos_estacion_fk_estacion
    foreign key (estacion_id, restaurante_id)
    references public.estaciones_restaurante(id, restaurante_id)
    on delete restrict,
  constraint destinos_estacion_id_restaurante_unique unique (id, restaurante_id),
  constraint destinos_estacion_id_estacion_restaurante_unique
    unique (id, estacion_id, restaurante_id),
  constraint destinos_estacion_nombre_unique
    unique (estacion_id, tipo, grupo, nombre)
);

alter table public.categorias_productos
  add column if not exists estacion_id uuid;

create unique index if not exists pedidos_id_restaurante_unique
  on public.pedidos (id, restaurante_id);

create unique index if not exists usuarios_id_restaurante_unique
  on public.usuarios (id, restaurante_id);

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.categorias_productos'::regclass
       and conname = 'categorias_productos_estacion_restaurante_fk'
  ) then
    alter table public.categorias_productos
      add constraint categorias_productos_estacion_restaurante_fk
      foreign key (estacion_id, restaurante_id)
      references public.estaciones_restaurante(id, restaurante_id)
      on delete restrict;
  end if;
end;
$$;

create index if not exists categorias_productos_estacion_idx
  on public.categorias_productos (estacion_id)
  where estacion_id is not null;

create table if not exists public.entregas_comanda (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes(id) on delete cascade,
  pedido_id uuid not null,
  estacion_id uuid not null,
  destino_estacion_id uuid not null,
  grupo text not null check (grupo in ('principal', 'respaldo')),
  tipo_destino text not null check (tipo_destino in ('kds', 'impresora')),
  configuracion_version integer not null default 1 check (configuracion_version >= 1),
  clave_idempotencia uuid not null default gen_random_uuid(),
  numero_entrega integer not null default 1 check (numero_entrega >= 1),
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'enviada', 'confirmada', 'fallida', 'cancelada')),
  error_publico text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint entregas_comanda_fk_pedido_restaurante
    foreign key (pedido_id, restaurante_id)
    references public.pedidos(id, restaurante_id)
    on delete restrict,
  constraint entregas_comanda_fk_estacion_restaurante
    foreign key (estacion_id, restaurante_id)
    references public.estaciones_restaurante(id, restaurante_id)
    on delete restrict,
  constraint entregas_comanda_fk_destino_estacion_restaurante
    foreign key (destino_estacion_id, estacion_id, restaurante_id)
    references public.destinos_estacion(id, estacion_id, restaurante_id)
    on delete restrict,
  constraint entregas_comanda_idempotencia_unique
    unique (restaurante_id, clave_idempotencia),
  constraint entregas_comanda_intento_unique
    unique (restaurante_id, pedido_id, estacion_id, destino_estacion_id, numero_entrega)
);

create index if not exists entregas_comanda_pendientes_idx
  on public.entregas_comanda (restaurante_id, estado, created_at)
  where estado in ('pendiente', 'fallida');

create table if not exists public.estado_comanda_estacion (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes(id) on delete cascade,
  pedido_id uuid not null,
  estacion_id uuid not null,
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'en_preparacion', 'listo', 'entregado', 'anulado')),
  iniciado_at timestamptz,
  listo_at timestamptz,
  entregado_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint estado_comanda_estacion_fk_pedido_restaurante
    foreign key (pedido_id, restaurante_id)
    references public.pedidos(id, restaurante_id)
    on delete restrict,
  constraint estado_comanda_estacion_fk_estacion_restaurante
    foreign key (estacion_id, restaurante_id)
    references public.estaciones_restaurante(id, restaurante_id)
    on delete restrict,
  constraint estado_comanda_estacion_pedido_estacion_unique
    unique (restaurante_id, pedido_id, estacion_id)
);

create index if not exists estado_comanda_estacion_tablero_idx
  on public.estado_comanda_estacion (restaurante_id, estacion_id, estado, created_at);

create table if not exists public.autorizaciones_cobro (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes(id) on delete cascade,
  usuario_id uuid not null,
  activo boolean not null default false,
  creado_por uuid references public.usuarios(id) on delete set null,
  actualizado_por uuid references public.usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint autorizaciones_cobro_fk_usuario_restaurante
    foreign key (usuario_id, restaurante_id)
    references public.usuarios(id, restaurante_id)
    on delete restrict,
  constraint autorizaciones_cobro_usuario_unique unique (restaurante_id, usuario_id)
);

create index if not exists autorizaciones_cobro_activas_idx
  on public.autorizaciones_cobro (restaurante_id, usuario_id)
  where activo;

-- Metadatos del registro padre: el cliente no elige el actor ni la versión.
create or replace function public.mesora_config_operativa_metadata()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.version := greatest(coalesce(new.version, 1), 1);
    new.created_at := coalesce(new.created_at, now());
    new.updated_at := coalesce(new.updated_at, now());
    if auth.uid() is not null then new.actualizado_por := auth.uid(); end if;
  else
    new.version := old.version + 1;
    new.created_at := old.created_at;
    new.updated_at := now();
    new.actualizado_por := coalesce(auth.uid(), old.actualizado_por);
  end if;
  return new;
end;
$$;

revoke all on function public.mesora_config_operativa_metadata() from public, anon, authenticated;

drop trigger if exists configuracion_operativa_metadata on public.configuracion_operativa;
create trigger configuracion_operativa_metadata
before insert or update on public.configuracion_operativa
for each row execute function public.mesora_config_operativa_metadata();

-- Las modificaciones de destinos, estaciones, asignación de categoría o
-- autorizaciones avanzan la versión del agregado operativo. La inicialización
-- anidada de un restaurante nuevo no cuenta como una edición del administrador.
create or replace function public.mesora_version_config_operativa_hijo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_restaurante_id uuid;
begin
  if pg_trigger_depth() > 1 then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  if tg_table_name = 'categorias_productos' then
    if tg_op = 'UPDATE' and old.estacion_id is not distinct from new.estacion_id then
      return new;
    end if;
    if tg_op = 'INSERT' and new.estacion_id is null then return new; end if;
  end if;

  if tg_op = 'DELETE' then
    v_restaurante_id := old.restaurante_id;
  else
    v_restaurante_id := new.restaurante_id;
  end if;

  update public.configuracion_operativa
     set version = version + 1,
         actualizado_por = coalesce(auth.uid(), actualizado_por),
         updated_at = now()
   where restaurante_id = v_restaurante_id;

  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

revoke all on function public.mesora_version_config_operativa_hijo() from public, anon, authenticated;

drop trigger if exists estaciones_version_config_operativa on public.estaciones_restaurante;
create trigger estaciones_version_config_operativa
after insert or update or delete on public.estaciones_restaurante
for each row execute function public.mesora_version_config_operativa_hijo();

drop trigger if exists destinos_version_config_operativa on public.destinos_estacion;
create trigger destinos_version_config_operativa
after insert or update or delete on public.destinos_estacion
for each row execute function public.mesora_version_config_operativa_hijo();

drop trigger if exists categorias_version_config_operativa on public.categorias_productos;
create trigger categorias_version_config_operativa
after insert or update of estacion_id or delete on public.categorias_productos
for each row execute function public.mesora_version_config_operativa_hijo();

drop trigger if exists autorizaciones_version_config_operativa on public.autorizaciones_cobro;
create trigger autorizaciones_version_config_operativa
after insert or update or delete on public.autorizaciones_cobro
for each row execute function public.mesora_version_config_operativa_hijo();

-- Defaults conservadores: conservan el cobro por mesero, mantienen las tres
-- pantallas KDS actuales y no activan impresoras ni impresión automática.
insert into public.configuracion_operativa (restaurante_id, modalidad_cobro)
select r.id, 'cobro_por_mesero'
  from public.restaurantes r
on conflict (restaurante_id) do nothing;

insert into public.estaciones_restaurante (restaurante_id, codigo, nombre, activo, orden)
select r.id, e.codigo, e.nombre, true, e.orden
  from public.restaurantes r
 cross join (values
   ('cocina', 'Cocina', 10),
   ('bar', 'Bar', 20),
   ('otros', 'Otros', 30)
 ) as e(codigo, nombre, orden)
on conflict (restaurante_id, codigo) do nothing;

insert into public.destinos_estacion
  (restaurante_id, estacion_id, tipo, grupo, nombre, papel_mm, activo)
select e.restaurante_id, e.id, 'kds', 'principal', 'KDS ' || e.nombre, null, true
  from public.estaciones_restaurante e
 where not exists (
   select 1 from public.destinos_estacion d
    where d.estacion_id = e.id and d.tipo = 'kds'
      and d.grupo = 'principal' and d.nombre = 'KDS ' || e.nombre
 )
on conflict (estacion_id, tipo, grupo, nombre) do nothing;

create or replace function public.mesora_inicializar_operacion_restaurante()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.configuracion_operativa (restaurante_id, modalidad_cobro)
  values (new.id, 'cobro_por_mesero')
  on conflict (restaurante_id) do nothing;

  insert into public.estaciones_restaurante (restaurante_id, codigo, nombre, activo, orden)
  values
    (new.id, 'cocina', 'Cocina', true, 10),
    (new.id, 'bar', 'Bar', true, 20),
    (new.id, 'otros', 'Otros', true, 30)
  on conflict (restaurante_id, codigo) do nothing;

  insert into public.destinos_estacion
    (restaurante_id, estacion_id, tipo, grupo, nombre, papel_mm, activo)
  select e.restaurante_id, e.id, 'kds', 'principal', 'KDS ' || e.nombre, null, true
    from public.estaciones_restaurante e
   where e.restaurante_id = new.id
     and not exists (
       select 1 from public.destinos_estacion d
        where d.estacion_id = e.id and d.tipo = 'kds'
          and d.grupo = 'principal' and d.nombre = 'KDS ' || e.nombre
     )
  on conflict (estacion_id, tipo, grupo, nombre) do nothing;

  return new;
end;
$$;

revoke all on function public.mesora_inicializar_operacion_restaurante() from public, anon, authenticated;

drop trigger if exists restaurantes_inicializar_operacion on public.restaurantes;
create trigger restaurantes_inicializar_operacion
after insert on public.restaurantes
for each row execute function public.mesora_inicializar_operacion_restaurante();

-- El estado operativo se consulta dentro del propio restaurante. Los registros
-- financieros de autorizaciones se limitan a admin/cajero; solo admin escribe.
alter table public.configuracion_operativa enable row level security;
alter table public.estaciones_restaurante enable row level security;
alter table public.destinos_estacion enable row level security;
alter table public.entregas_comanda enable row level security;
alter table public.estado_comanda_estacion enable row level security;
alter table public.autorizaciones_cobro enable row level security;

drop policy if exists configuracion_operativa_select on public.configuracion_operativa;
create policy configuracion_operativa_select on public.configuracion_operativa
  for select to authenticated
  using ((select public.soy_del_restaurante(restaurante_id)));
drop policy if exists configuracion_operativa_insert_admin on public.configuracion_operativa;
create policy configuracion_operativa_insert_admin on public.configuracion_operativa
  for insert to authenticated
  with check ((select public.puedo_escribir_en(restaurante_id, array['admin_restaurante'])));
drop policy if exists configuracion_operativa_update_admin on public.configuracion_operativa;
create policy configuracion_operativa_update_admin on public.configuracion_operativa
  for update to authenticated
  using ((select public.puedo_escribir_en(restaurante_id, array['admin_restaurante'])))
  with check ((select public.puedo_escribir_en(restaurante_id, array['admin_restaurante'])));

drop policy if exists estaciones_restaurante_select on public.estaciones_restaurante;
create policy estaciones_restaurante_select on public.estaciones_restaurante
  for select to authenticated
  using ((select public.soy_del_restaurante(restaurante_id)));
drop policy if exists estaciones_restaurante_insert_admin on public.estaciones_restaurante;
create policy estaciones_restaurante_insert_admin on public.estaciones_restaurante
  for insert to authenticated
  with check ((select public.puedo_escribir_en(restaurante_id, array['admin_restaurante'])));
drop policy if exists estaciones_restaurante_update_admin on public.estaciones_restaurante;
create policy estaciones_restaurante_update_admin on public.estaciones_restaurante
  for update to authenticated
  using ((select public.puedo_escribir_en(restaurante_id, array['admin_restaurante'])))
  with check ((select public.puedo_escribir_en(restaurante_id, array['admin_restaurante'])));

drop policy if exists destinos_estacion_select on public.destinos_estacion;
create policy destinos_estacion_select on public.destinos_estacion
  for select to authenticated
  using ((select public.soy_del_restaurante(restaurante_id)));
drop policy if exists destinos_estacion_insert_admin on public.destinos_estacion;
create policy destinos_estacion_insert_admin on public.destinos_estacion
  for insert to authenticated
  with check ((select public.puedo_escribir_en(restaurante_id, array['admin_restaurante'])));
drop policy if exists destinos_estacion_update_admin on public.destinos_estacion;
create policy destinos_estacion_update_admin on public.destinos_estacion
  for update to authenticated
  using ((select public.puedo_escribir_en(restaurante_id, array['admin_restaurante'])))
  with check ((select public.puedo_escribir_en(restaurante_id, array['admin_restaurante'])));

drop policy if exists entregas_comanda_select on public.entregas_comanda;
create policy entregas_comanda_select on public.entregas_comanda
  for select to authenticated
  using ((select public.soy_del_restaurante(restaurante_id)));

drop policy if exists estado_comanda_estacion_select on public.estado_comanda_estacion;
create policy estado_comanda_estacion_select on public.estado_comanda_estacion
  for select to authenticated
  using ((select public.soy_del_restaurante(restaurante_id)));

drop policy if exists autorizaciones_cobro_select on public.autorizaciones_cobro;
create policy autorizaciones_cobro_select on public.autorizaciones_cobro
  for select to authenticated
  using (
    (select public.soy_del_restaurante(restaurante_id))
    and (select public.tengo_rol(array['admin_restaurante', 'cajero']))
  );
drop policy if exists autorizaciones_cobro_insert_admin on public.autorizaciones_cobro;
create policy autorizaciones_cobro_insert_admin on public.autorizaciones_cobro
  for insert to authenticated
  with check ((select public.puedo_escribir_en(restaurante_id, array['admin_restaurante'])));
drop policy if exists autorizaciones_cobro_update_admin on public.autorizaciones_cobro;
create policy autorizaciones_cobro_update_admin on public.autorizaciones_cobro
  for update to authenticated
  using ((select public.puedo_escribir_en(restaurante_id, array['admin_restaurante'])))
  with check ((select public.puedo_escribir_en(restaurante_id, array['admin_restaurante'])));

revoke all on public.configuracion_operativa, public.estaciones_restaurante,
  public.destinos_estacion, public.entregas_comanda,
  public.estado_comanda_estacion, public.autorizaciones_cobro
  from public, anon, authenticated;

grant select on public.configuracion_operativa, public.estaciones_restaurante,
  public.destinos_estacion, public.entregas_comanda,
  public.estado_comanda_estacion, public.autorizaciones_cobro to authenticated;

grant insert, update on public.configuracion_operativa,
  public.estaciones_restaurante, public.destinos_estacion,
  public.autorizaciones_cobro to authenticated;

grant all on public.configuracion_operativa, public.estaciones_restaurante,
  public.destinos_estacion, public.entregas_comanda,
  public.estado_comanda_estacion, public.autorizaciones_cobro to service_role;

revoke truncate on public.configuracion_operativa, public.estaciones_restaurante,
  public.destinos_estacion, public.entregas_comanda,
  public.estado_comanda_estacion, public.autorizaciones_cobro from authenticated;

comment on table public.configuracion_operativa is
  'Configuración operativa versionada por restaurante. La modalidad por defecto conserva el cobro actual por mesero.';
comment on table public.estaciones_restaurante is
  'Estaciones del restaurante; cocina, bar y otros se crean como valores compatibles.';
comment on table public.destinos_estacion is
  'Destinos lógicos de estación. El instalador activa KDS y deja las impresoras sin configurar.';
comment on table public.entregas_comanda is
  'Cola idempotente preparada; todavía no se escribe desde crear_pedido.';
comment on table public.estado_comanda_estacion is
  'Estado por estación preparado; el KDS actual sigue usando pedidos.estado.';
comment on table public.autorizaciones_cobro is
  'Permisos individuales preparados; cerrar_cuenta todavía no los consulta.';


-- #############################################################################
-- # 49/55 · ../migrations/20261109012624_fase3_configuracion_operativa_admin.sql
-- #############################################################################

-- -- Mesora · Fase 3: lectura y guardado del configurador operativo.
-- No conecta la configuración con pedidos, pagos, caja, KDS ni impresión.

create or replace function public.admin_obtener_configuracion_operativa(
  p_restaurante_id uuid
) returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_resultado jsonb;
begin
  if auth.uid() is null or not public.soy_del_restaurante(p_restaurante_id) then
    raise exception 'No tienes acceso a la configuración de este restaurante.' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'restaurante_id', p_restaurante_id,
    'modalidad_cobro', coalesce((
      select c.modalidad_cobro
        from public.configuracion_operativa c
       where c.restaurante_id = p_restaurante_id
    ), 'cobro_por_mesero'),
    'version', coalesce((
      select c.version
        from public.configuracion_operativa c
       where c.restaurante_id = p_restaurante_id
    ), 1),
    'estaciones', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', e.id,
          'codigo', e.codigo,
          'nombre', e.nombre,
          'activo', e.activo,
          'orden', e.orden,
          'destinos', coalesce((
            select jsonb_agg(jsonb_build_object(
              'id', d.id,
              'tipo', d.tipo,
              'grupo', d.grupo,
              'nombre', d.nombre,
              'papel_mm', d.papel_mm,
              'configuracion', d.configuracion,
              'activo', d.activo
            ) order by d.grupo, d.tipo, d.nombre)
            from public.destinos_estacion d
           where d.restaurante_id = p_restaurante_id
             and d.estacion_id = e.id
          ), '[]'::jsonb)
        ) order by e.orden, e.codigo
      )
        from public.estaciones_restaurante e
       where e.restaurante_id = p_restaurante_id
    ), jsonb_build_array(
      jsonb_build_object('id', null, 'codigo', 'cocina', 'nombre', 'Cocina', 'activo', true, 'orden', 10,
        'destinos', jsonb_build_array(jsonb_build_object('id', null, 'tipo', 'kds', 'grupo', 'principal', 'nombre', 'KDS Cocina', 'papel_mm', null, 'configuracion', '{}'::jsonb, 'activo', true))),
      jsonb_build_object('id', null, 'codigo', 'bar', 'nombre', 'Barra', 'activo', true, 'orden', 20,
        'destinos', jsonb_build_array(jsonb_build_object('id', null, 'tipo', 'kds', 'grupo', 'principal', 'nombre', 'KDS Barra', 'papel_mm', null, 'configuracion', '{}'::jsonb, 'activo', true))),
      jsonb_build_object('id', null, 'codigo', 'otros', 'nombre', 'Otros', 'activo', true, 'orden', 30,
        'destinos', jsonb_build_array(jsonb_build_object('id', null, 'tipo', 'kds', 'grupo', 'principal', 'nombre', 'KDS Otros', 'papel_mm', null, 'configuracion', '{}'::jsonb, 'activo', true)))
    )),
    'categorias', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id,
        'nombre', c.nombre,
        'estacion_codigo', e.codigo
      ) order by c.nombre, c.id)
        from public.categorias_productos c
        left join public.estaciones_restaurante e
          on e.id = c.estacion_id and e.restaurante_id = p_restaurante_id
       where c.restaurante_id = p_restaurante_id
    ), '[]'::jsonb),
    'productos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id,
        'nombre', p.nombre,
        'categoria_id', p.categoria_id,
        'estacion', p.estacion,
        'es_bebida', coalesce(p.es_bebida, false)
      ) order by p.nombre, p.id)
        from public.productos p
       where p.restaurante_id = p_restaurante_id
    ), '[]'::jsonb)
  ) into v_resultado;

  return v_resultado;
end;
$$;

comment on function public.admin_obtener_configuracion_operativa(uuid) is
  'Lee la configuración operativa de un restaurante miembro con RLS y filtros de tenant; no expone datos de otros locales.';

create or replace function public.admin_guardar_configuracion_operativa(
  p_restaurante_id uuid,
  p_configuracion jsonb
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_estacion jsonb;
  v_destino jsonb;
  v_categoria jsonb;
  v_estacion_id uuid;
  v_destino_id uuid;
  v_categoria_id uuid;
  v_codigo text;
  v_tipo text;
  v_grupo text;
  v_papel smallint;
  v_nombre text;
  v_copias integer;
  v_activo boolean;
  v_orden integer;
  v_anterior_estacion uuid;
  v_actualizados integer;
begin
  if auth.uid() is null or not public.puedo_escribir_en(p_restaurante_id, array['admin_restaurante']) then
    raise exception 'Solo el administrador activo de este restaurante puede guardar esta configuración.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_configuracion) <> 'object'
     or jsonb_typeof(p_configuracion->'estaciones') <> 'array'
     or jsonb_typeof(p_configuracion->'categorias') <> 'array' then
    raise exception 'La configuración recibida no tiene el formato esperado.' using errcode = '22023';
  end if;
  if coalesce(p_configuracion->>'modalidad_cobro', '') not in (
    'solo_cajero', 'cobro_por_mesero', 'caja_central_meseros_autorizados'
  ) then
    raise exception 'La modalidad de cobro no es válida.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_configuracion->'estaciones') <> 3
     or (select count(distinct x.value->>'codigo')
           from jsonb_array_elements(p_configuracion->'estaciones') x(value)) <> 3
     or exists (
       select 1 from jsonb_array_elements(p_configuracion->'estaciones') x(value)
        where coalesce(x.value->>'codigo', '') not in ('cocina', 'bar', 'otros')
     ) then
    raise exception 'La configuración debe conservar Cocina, Barra y Otros.' using errcode = '22023';
  end if;

  insert into public.configuracion_operativa (restaurante_id, modalidad_cobro)
  values (p_restaurante_id, p_configuracion->>'modalidad_cobro')
  on conflict (restaurante_id) do update
     set modalidad_cobro = excluded.modalidad_cobro
   where public.configuracion_operativa.modalidad_cobro is distinct from excluded.modalidad_cobro;

  for v_estacion in
    select x.value from jsonb_array_elements(p_configuracion->'estaciones') x(value)
  loop
    v_codigo := v_estacion->>'codigo';
    v_nombre := btrim(coalesce(v_estacion->>'nombre', ''));
    if v_nombre = '' or length(v_nombre) > 60
       or coalesce(v_estacion->>'activo', '') not in ('true', 'false')
       or coalesce(v_estacion->>'orden', '') !~ '^\d{1,5}$' then
      raise exception 'Revisa el nombre, estado y orden de las estaciones.' using errcode = '22023';
    end if;
    v_activo := (v_estacion->>'activo')::boolean;
    v_orden := (v_estacion->>'orden')::integer;
    if jsonb_typeof(v_estacion->'destinos') <> 'array' then
      raise exception 'Revisa los destinos configurados para cada estación.' using errcode = '22023';
    end if;

    insert into public.estaciones_restaurante (restaurante_id, codigo, nombre, activo, orden)
    values (p_restaurante_id, v_codigo, v_nombre, v_activo, v_orden)
    on conflict (restaurante_id, codigo) do update
       set nombre = excluded.nombre,
           activo = excluded.activo,
           orden = excluded.orden,
           updated_at = now()
     where public.estaciones_restaurante.nombre is distinct from excluded.nombre
        or public.estaciones_restaurante.activo is distinct from excluded.activo
        or public.estaciones_restaurante.orden is distinct from excluded.orden;

    select e.id into v_estacion_id
      from public.estaciones_restaurante e
     where e.restaurante_id = p_restaurante_id and e.codigo = v_codigo;
    if v_estacion_id is null then
      raise exception 'No se pudo guardar la estación solicitada.' using errcode = '23503';
    end if;

    for v_destino in
      select x.value from jsonb_array_elements(v_estacion->'destinos') x(value)
    loop
      v_tipo := v_destino->>'tipo';
      v_grupo := v_destino->>'grupo';
      v_nombre := btrim(coalesce(v_destino->>'nombre', ''));
      if v_tipo not in ('kds', 'impresora') or v_grupo not in ('principal', 'respaldo')
         or v_nombre = '' or length(v_nombre) > 80
         or coalesce(v_destino->>'activo', '') not in ('true', 'false') then
        raise exception 'Revisa el tipo, grupo, nombre y estado de los destinos.' using errcode = '22023';
      end if;
      v_activo := (v_destino->>'activo')::boolean;
      if jsonb_typeof(coalesce(v_destino->'configuracion', '{}'::jsonb)) <> 'object' then
        raise exception 'La configuración del destino no es válida.' using errcode = '22023';
      end if;
      if v_tipo = 'impresora' then
        if coalesce(v_destino->>'papel_mm', '') not in ('58', '80')
           or coalesce(v_destino->'configuracion'->>'copias', '') !~ '^[1-5]$' then
          raise exception 'Configura papel de 58 u 80 mm y entre 1 y 5 copias para la impresora.' using errcode = '22023';
        end if;
        v_papel := (v_destino->>'papel_mm')::smallint;
        v_copias := (v_destino->'configuracion'->>'copias')::integer;
      else
        if v_destino->'papel_mm' is not null and v_destino->'papel_mm' <> 'null'::jsonb then
          raise exception 'Los destinos KDS no llevan tamaño de papel.' using errcode = '22023';
        end if;
        v_papel := null;
        v_copias := 1;
      end if;
      v_destino_id := nullif(v_destino->>'id', '')::uuid;
      if v_destino_id is not null then
        select d.estacion_id into v_anterior_estacion
          from public.destinos_estacion d
         where d.id = v_destino_id and d.restaurante_id = p_restaurante_id;
        if not found then
          if exists (select 1 from public.destinos_estacion d where d.id = v_destino_id) then
            raise exception 'El destino indicado no pertenece a este restaurante.' using errcode = '42501';
          end if;
          insert into public.destinos_estacion
            (id, restaurante_id, estacion_id, tipo, grupo, nombre, papel_mm, configuracion, activo)
          values (v_destino_id, p_restaurante_id, v_estacion_id, v_tipo, v_grupo, v_nombre, v_papel,
                  case when v_tipo = 'impresora' then jsonb_build_object('copias', v_copias) else '{}'::jsonb end,
                  v_activo);
        else
          if v_anterior_estacion <> v_estacion_id then
            raise exception 'El destino no corresponde a la estación seleccionada.' using errcode = '42501';
          end if;
          update public.destinos_estacion d
             set tipo = v_tipo,
                 grupo = v_grupo,
                 nombre = v_nombre,
                 papel_mm = v_papel,
                 configuracion = case when v_tipo = 'impresora' then jsonb_build_object('copias', v_copias) else '{}'::jsonb end,
                 activo = v_activo,
                 updated_at = now()
           where d.id = v_destino_id and d.restaurante_id = p_restaurante_id
             and d.estacion_id = v_estacion_id
             and (d.tipo, d.grupo, d.nombre, d.papel_mm, d.configuracion, d.activo)
                 is distinct from (v_tipo, v_grupo, v_nombre, v_papel,
                   case when v_tipo = 'impresora' then jsonb_build_object('copias', v_copias) else '{}'::jsonb end,
                   v_activo);
        end if;
      else
        insert into public.destinos_estacion
          (restaurante_id, estacion_id, tipo, grupo, nombre, papel_mm, configuracion, activo)
        values (p_restaurante_id, v_estacion_id, v_tipo, v_grupo, v_nombre, v_papel,
                case when v_tipo = 'impresora' then jsonb_build_object('copias', v_copias) else '{}'::jsonb end,
                v_activo)
        on conflict (estacion_id, tipo, grupo, nombre) do update
           set papel_mm = excluded.papel_mm,
               configuracion = excluded.configuracion,
               activo = excluded.activo,
               updated_at = now()
         where public.destinos_estacion.restaurante_id = excluded.restaurante_id
           and (public.destinos_estacion.papel_mm, public.destinos_estacion.configuracion, public.destinos_estacion.activo)
               is distinct from (excluded.papel_mm, excluded.configuracion, excluded.activo);
      end if;
    end loop;
  end loop;

  if (select count(*) from public.categorias_productos c where c.restaurante_id = p_restaurante_id)
     <> jsonb_array_length(p_configuracion->'categorias')
     or (select count(distinct x.value->>'id')
           from jsonb_array_elements(p_configuracion->'categorias') x(value))
        <> jsonb_array_length(p_configuracion->'categorias') then
    raise exception 'Actualiza las categorías antes de guardar esta configuración.' using errcode = '40001';
  end if;

  for v_categoria in
    select x.value from jsonb_array_elements(p_configuracion->'categorias') x(value)
  loop
    v_categoria_id := (v_categoria->>'id')::uuid;
    v_codigo := nullif(v_categoria->>'estacion_codigo', '');
    if v_codigo is not null and v_codigo not in ('cocina', 'bar', 'otros') then
      raise exception 'Una categoría tiene una estación predeterminada inválida.' using errcode = '22023';
    end if;
    v_estacion_id := null;
    if v_codigo is not null then
      select e.id into v_estacion_id
        from public.estaciones_restaurante e
       where e.restaurante_id = p_restaurante_id and e.codigo = v_codigo;
      if v_estacion_id is null then
        raise exception 'No se encontró la estación elegida para la categoría.' using errcode = '23503';
      end if;
    end if;
    update public.categorias_productos c
       set estacion_id = v_estacion_id
     where c.id = v_categoria_id and c.restaurante_id = p_restaurante_id;
    get diagnostics v_actualizados = row_count;
    if v_actualizados <> 1 then
      raise exception 'Una categoría ya no pertenece a este restaurante. Actualiza la pantalla e inténtalo de nuevo.' using errcode = '40001';
    end if;
  end loop;

  return public.admin_obtener_configuracion_operativa(p_restaurante_id);
end;
$$;

comment on function public.admin_guardar_configuracion_operativa(uuid, jsonb) is
  'Guarda configuración operativa de forma atómica usando RLS, rol admin_restaurante y validación del tenant. No cambia operaciones actuales.';

-- Las escrituras de configuración se registran desde triggers internos. El
-- cliente autenticado nunca recibe permiso de INSERT sobre audit_logs.
create or replace function public.mesora_auditar_configuracion_operativa()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_restaurante_id uuid;
  v_entidad_id uuid;
  v_actor_id uuid := auth.uid();
  v_actor_rol text;
  v_actor_nombre text;
  v_restaurante_nombre text;
  v_accion text := 'configuracion_operativa_actualizar';
  v_descripcion text;
  v_detalle jsonb;
  v_estacion text;
begin
  if tg_table_name = 'configuracion_operativa' then
    if tg_op = 'UPDATE' and old.modalidad_cobro is not distinct from new.modalidad_cobro then
      return new;
    end if;
    v_restaurante_id := new.restaurante_id;
    v_entidad_id := new.restaurante_id;
    v_descripcion := 'Actualizó la modalidad de cobro guardada para el restaurante';
    v_detalle := jsonb_build_object(
      'modalidad_anterior', case when tg_op = 'INSERT' then null else old.modalidad_cobro end,
      'modalidad_nueva', new.modalidad_cobro
    );
  elsif tg_table_name = 'estaciones_restaurante' then
    if tg_op = 'UPDATE' and (old.nombre, old.activo, old.orden) is not distinct from (new.nombre, new.activo, new.orden) then
      return new;
    end if;
    v_restaurante_id := new.restaurante_id;
    v_entidad_id := new.id;
    v_descripcion := format('Actualizó la estación «%s»', new.nombre);
    v_detalle := jsonb_build_object('codigo', new.codigo, 'nombre', new.nombre, 'activo', new.activo, 'orden', new.orden);
  elsif tg_table_name = 'destinos_estacion' then
    if tg_op = 'UPDATE' and (old.tipo, old.grupo, old.nombre, old.papel_mm, old.configuracion, old.activo)
       is not distinct from (new.tipo, new.grupo, new.nombre, new.papel_mm, new.configuracion, new.activo) then
      return new;
    end if;
    v_restaurante_id := new.restaurante_id;
    v_entidad_id := new.id;
    select e.nombre into v_estacion from public.estaciones_restaurante e
     where e.id = new.estacion_id and e.restaurante_id = new.restaurante_id;
    v_descripcion := format('Actualizó el destino «%s» de %s', new.nombre, coalesce(v_estacion, 'la estación'));
    v_detalle := jsonb_build_object('estacion_id', new.estacion_id, 'tipo', new.tipo, 'grupo', new.grupo,
      'nombre', new.nombre, 'papel_mm', new.papel_mm, 'configuracion', new.configuracion, 'activo', new.activo);
  elsif tg_table_name = 'categorias_productos' then
    if tg_op <> 'UPDATE' or old.estacion_id is not distinct from new.estacion_id then
      return new;
    end if;
    v_restaurante_id := new.restaurante_id;
    v_entidad_id := new.id;
    v_descripcion := format('Actualizó la estación predeterminada de la categoría «%s»', new.nombre);
    v_detalle := jsonb_build_object('categoria_id', new.id, 'estacion_anterior_id', old.estacion_id,
      'estacion_nueva_id', new.estacion_id);
  else
    return new;
  end if;

  select u.rol::text, u.nombre into v_actor_rol, v_actor_nombre
    from public.usuarios u where u.id = v_actor_id;
  select r.nombre into v_restaurante_nombre
    from public.restaurantes r where r.id = v_restaurante_id;

  insert into public.audit_logs (
    actor_id, actor_rol, actor_nombre, restaurante_id, restaurante_nombre,
    entidad, entidad_id, accion, descripcion, detalle
  ) values (
    v_actor_id, v_actor_rol, v_actor_nombre, v_restaurante_id, v_restaurante_nombre,
    case when tg_table_name = 'categorias_productos' then 'categoria' else 'configuracion' end,
    v_entidad_id, v_accion, v_descripcion, v_detalle
  );
  return new;
end;
$$;

revoke all on function public.admin_obtener_configuracion_operativa(uuid) from public, anon;
revoke all on function public.admin_guardar_configuracion_operativa(uuid, jsonb) from public, anon;
grant execute on function public.admin_obtener_configuracion_operativa(uuid) to authenticated;
grant execute on function public.admin_guardar_configuracion_operativa(uuid, jsonb) to authenticated;
revoke all on function public.mesora_auditar_configuracion_operativa() from public, anon, authenticated;

drop trigger if exists configuracion_operativa_auditoria on public.configuracion_operativa;
create trigger configuracion_operativa_auditoria
  after insert or update on public.configuracion_operativa
  for each row execute function public.mesora_auditar_configuracion_operativa();
drop trigger if exists estaciones_restaurante_auditoria on public.estaciones_restaurante;
create trigger estaciones_restaurante_auditoria
  after insert or update on public.estaciones_restaurante
  for each row execute function public.mesora_auditar_configuracion_operativa();
drop trigger if exists destinos_estacion_auditoria on public.destinos_estacion;
create trigger destinos_estacion_auditoria
  after insert or update on public.destinos_estacion
  for each row execute function public.mesora_auditar_configuracion_operativa();
drop trigger if exists categorias_estacion_auditoria on public.categorias_productos;
create trigger categorias_estacion_auditoria
  after update of estacion_id on public.categorias_productos
  for each row execute function public.mesora_auditar_configuracion_operativa();


-- #############################################################################
-- # 50/55 · ../migrations/20261109024411_fase4_enrutamiento_comandas.sql
-- #############################################################################

-- -- Mesora · Fase 4: enrutamiento de comandas según configuración operativa.
-- La ruta y el estado de cada estación quedan congelados al crear la comanda.
-- Las impresoras quedan en cola manual: esta migración no imprime ni inicia agentes.
begin;

-- Los productos nuevos pueden heredar la estación de su categoría. Los valores
-- explícitos existentes se conservan y siguen teniendo prioridad.
alter table public.productos
  alter column estacion drop default,
  alter column estacion drop not null;

-- Snapshot autoritativo de estación: producto explícito > categoría > bebida > cocina.
create or replace function public.fijar_estacion_snapshot_pedido_item()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_restaurante_id uuid;
begin
  if new.producto_id is null then
    new.estacion := coalesce(new.estacion, case when coalesce(new.es_bebida, false) then 'bar' else 'cocina' end);
    return new;
  end if;

  select coalesce(
           pr.estacion,
           e.codigo,
           case when coalesce(pr.es_bebida, false) then 'bar' else 'cocina' end
         ), p.restaurante_id
    into new.estacion, v_restaurante_id
    from public.productos pr
    join public.pedidos p on p.id = new.pedido_id and p.restaurante_id = pr.restaurante_id
    left join public.categorias_productos c
      on c.id = pr.categoria_id and c.restaurante_id = pr.restaurante_id
    left join public.estaciones_restaurante e
      on e.id = c.estacion_id and e.restaurante_id = pr.restaurante_id
   where pr.id = new.producto_id;

  if not found or v_restaurante_id is null then
    raise exception 'El producto no pertenece a la comanda.' using errcode = '23503';
  end if;
  return new;
end;
$$;

revoke all on function public.fijar_estacion_snapshot_pedido_item() from public, anon, authenticated;

-- La comanda y sus destinos nacen en una sola transacción. Solo se crean
-- entregas al grupo principal; el respaldo queda reservado para manejo de fallos.
create or replace function public.crear_pedido(
  p_restaurante_id uuid,
  p_mesa_id uuid,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pedido_id uuid;
  v_item jsonb;
  v_producto_id uuid;
  v_cantidad int;
  v_producto public.productos%rowtype;
  v_precio numeric;
  v_mesero_id uuid;
  v_estacion_codigo text;
  v_estacion_id uuid;
  v_estacion_nombre text;
  v_estacion_activa boolean;
  v_destino record;
  v_config_version integer;
begin
  perform public.validar_acceso_restaurante(p_restaurante_id);

  select u.id into v_mesero_id
    from public.usuarios u
   where u.id = auth.uid()
     and u.restaurante_id = p_restaurante_id
     and coalesce(u.activo, true)
     and u.rol::text in ('mesero', 'admin_restaurante');
  if v_mesero_id is null then
    raise exception 'Sin permiso para crear pedidos en este restaurante' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.mesas m
     where m.id = p_mesa_id and m.restaurante_id = p_restaurante_id
  ) then
    raise exception 'La mesa no pertenece al restaurante' using errcode = '23503';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'El pedido no tiene ítems' using errcode = '22023';
  end if;

  select coalesce(c.version, 1) into v_config_version
    from (select 1) x
    left join public.configuracion_operativa c on c.restaurante_id = p_restaurante_id;

  insert into public.pedidos (restaurante_id, mesa_id, mesero_id, estado)
  values (p_restaurante_id, p_mesa_id, v_mesero_id, 'pendiente')
  returning id into v_pedido_id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_producto_id := nullif(v_item->>'producto_id', '')::uuid;
    v_cantidad := coalesce((v_item->>'cantidad')::int, 1);
    if v_producto_id is null then
      raise exception 'Ítem sin producto_id' using errcode = '22023';
    end if;
    if v_cantidad < 1 or v_cantidad > 99 then
      raise exception 'La cantidad debe ser un número entre 1 y 99' using errcode = '22023';
    end if;

    select * into v_producto
      from public.productos pr
     where pr.id = v_producto_id and pr.restaurante_id = p_restaurante_id
     for update;
    if v_producto.id is null then
      raise exception 'El producto no existe en este restaurante' using errcode = '23503';
    end if;
    if not v_producto.disponible then
      raise exception 'El producto % no está disponible', v_producto.nombre using errcode = '22023';
    end if;

    select coalesce(
             v_producto.estacion,
             e.codigo,
             case when coalesce(v_producto.es_bebida, false) then 'bar' else 'cocina' end
           ) into v_estacion_codigo
      from (select 1) x
      left join public.categorias_productos c
        on c.id = v_producto.categoria_id and c.restaurante_id = p_restaurante_id
      left join public.estaciones_restaurante e
        on e.id = c.estacion_id and e.restaurante_id = p_restaurante_id;

    select e.id, e.nombre, e.activo
      into v_estacion_id, v_estacion_nombre, v_estacion_activa
      from public.estaciones_restaurante e
     where e.restaurante_id = p_restaurante_id and e.codigo = v_estacion_codigo;
    if not found or v_estacion_activa is not true then
      raise exception 'La estación % está desactivada o no existe. Pide al administrador que revise la configuración operativa.',
        coalesce(v_estacion_nombre, v_estacion_codigo)
        using errcode = '22023';
    end if;
    if not exists (
      select 1 from public.destinos_estacion d
       where d.restaurante_id = p_restaurante_id and d.estacion_id = v_estacion_id
         and d.grupo = 'principal' and d.activo
    ) then
      raise exception 'La estación % no tiene un destino principal activo. Pide al administrador que revise su configuración.',
        v_estacion_nombre
        using errcode = '22023';
    end if;

    v_precio := case
      when v_producto.es_promocion and v_producto.precio_promocion is not null then v_producto.precio_promocion
      else v_producto.precio
    end;
    if v_precio is null or v_precio < 0 then
      raise exception 'El producto % no tiene precio válido', v_producto.nombre using errcode = '22023';
    end if;

    insert into public.pedido_items (
      pedido_id, producto_id, nombre_producto, cantidad, precio_unitario,
      nota, es_bebida, estacion
    ) values (
      v_pedido_id, v_producto.id, v_producto.nombre, v_cantidad, v_precio,
      nullif(btrim(coalesce(v_item->>'nota', '')), ''),
      coalesce(v_producto.es_bebida, false), v_estacion_codigo
    );
  end loop;

  for v_estacion_codigo in
    select distinct pi.estacion
      from public.pedido_items pi
     where pi.pedido_id = v_pedido_id
     order by pi.estacion
  loop
    select e.id, e.nombre, e.activo
      into v_estacion_id, v_estacion_nombre, v_estacion_activa
      from public.estaciones_restaurante e
     where e.restaurante_id = p_restaurante_id and e.codigo = v_estacion_codigo;
    if not found or v_estacion_activa is not true then
      raise exception 'La estación % está desactivada o no existe. Pide al administrador que revise la configuración operativa.',
        coalesce(v_estacion_nombre, v_estacion_codigo)
        using errcode = '22023';
    end if;

    insert into public.estado_comanda_estacion (restaurante_id, pedido_id, estacion_id, estado)
    values (p_restaurante_id, v_pedido_id, v_estacion_id, 'pendiente');

    for v_destino in
      select d.id, d.tipo, d.grupo, d.nombre, d.papel_mm, d.configuracion
        from public.destinos_estacion d
       where d.restaurante_id = p_restaurante_id
         and d.estacion_id = v_estacion_id
         and d.activo
         and d.grupo = 'principal'
       order by d.tipo, d.nombre
    loop
      insert into public.entregas_comanda (
        restaurante_id, pedido_id, estacion_id, estacion_codigo, estacion_nombre,
        destino_estacion_id, destino_nombre, configuracion_destino,
        grupo, tipo_destino, configuracion_version, numero_entrega, estado
      ) values (
        p_restaurante_id, v_pedido_id, v_estacion_id, v_estacion_codigo, v_estacion_nombre,
        v_destino.id, v_destino.nombre,
        coalesce(v_destino.configuracion, '{}'::jsonb) ||
          case when v_destino.papel_mm is null then '{}'::jsonb
               else jsonb_build_object('papel_mm', v_destino.papel_mm) end,
        'principal', v_destino.tipo, v_config_version, 1,
        case when v_destino.tipo = 'kds' then 'confirmada' else 'pendiente' end
      );
    end loop;
  end loop;

  update public.mesas m set estado = 'ocupada'
   where m.id = p_mesa_id and m.restaurante_id = p_restaurante_id;
  return v_pedido_id;
end;
$$;

comment on function public.crear_pedido(uuid, uuid, jsonb) is
  'Crea una comanda y resuelve productos > categoría > bebida > cocina. Congela estación, crea estado por estación y enrutamiento a destinos principales; impresoras quedan pendientes para impresión manual.';

-- Los ítems cancelados dejan de bloquear el estado agregado de la comanda.
create or replace function public.mesora_reconciliar_estacion_anulada()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_estacion_id uuid;
  v_estado_global text;
begin
  if new.anulado is not true or old.anulado is true then return new; end if;
  if exists (
    select 1 from public.pedido_items pi
     where pi.pedido_id = new.pedido_id
       and coalesce(pi.estacion, 'cocina') = coalesce(new.estacion, 'cocina')
       and pi.anulado is not true
  ) then return new; end if;

  select e.id into v_estacion_id
    from public.estaciones_restaurante e
    join public.pedidos p on p.restaurante_id = e.restaurante_id
   where p.id = new.pedido_id and e.codigo = coalesce(new.estacion, 'cocina');
  if v_estacion_id is null then return new; end if;

  update public.estado_comanda_estacion s
     set estado = 'anulado', updated_at = now()
   where s.pedido_id = new.pedido_id and s.estacion_id = v_estacion_id
     and s.estado <> 'anulado';
  update public.entregas_comanda d
     set estado = 'cancelada', updated_at = now()
   where d.pedido_id = new.pedido_id and d.estacion_id = v_estacion_id
     and d.estado = 'pendiente';

  if exists (
    select 1 from public.pedido_items pi
     where pi.pedido_id = new.pedido_id and pi.anulado is not true
  ) then
    select case
      when bool_or(s.estado = 'pendiente') then 'pendiente'
      when bool_or(s.estado = 'en_preparacion') then 'en_preparacion'
      when bool_or(s.estado = 'listo') then 'listo'
      else 'entregado'
    end into v_estado_global
      from public.estado_comanda_estacion s
     where s.pedido_id = new.pedido_id and s.estado <> 'anulado';
    if v_estado_global is not null then
      update public.pedidos p set estado = v_estado_global, updated_at = now()
       where p.id = new.pedido_id and p.estado <> 'anulado';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.mesora_reconciliar_estacion_anulada() from public, anon, authenticated;
drop trigger if exists pedido_item_reconciliar_estacion_anulada on public.pedido_items;
create trigger pedido_item_reconciliar_estacion_anulada
after update of anulado on public.pedido_items
for each row execute function public.mesora_reconciliar_estacion_anulada();

-- Avance compare-and-set por estación. Si no hay snapshots, se conserva el
-- comportamiento global de comandas históricas creadas antes de esta fase.
create or replace function public.avanzar_comanda_estacion(
  p_restaurante_id uuid,
  p_pedido_id uuid,
  p_estacion_codigo text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rol text;
  v_estado_pedido text;
  v_estado_estacion text;
  v_nuevo_estado text;
  v_estacion_id uuid;
begin
  perform public.validar_acceso_restaurante(p_restaurante_id);

  select u.rol::text into v_rol
    from public.usuarios u
   where u.id = auth.uid() and u.restaurante_id = p_restaurante_id and coalesce(u.activo, true);
  if v_rol is null or v_rol not in ('cocina', 'mesero', 'admin_restaurante') then
    raise exception 'Tu perfil no tiene permiso para actualizar las estaciones de preparación.' using errcode = '42501';
  end if;
  if p_estacion_codigo not in ('cocina', 'bar', 'otros') then
    raise exception 'La estación indicada no es válida.' using errcode = '22023';
  end if;

  select p.estado into v_estado_pedido
    from public.pedidos p
   where p.id = p_pedido_id and p.restaurante_id = p_restaurante_id
   for update;
  if not found then raise exception 'La comanda no pertenece al restaurante.' using errcode = '23503'; end if;
  if v_estado_pedido = 'anulado' then raise exception 'La comanda está anulada.' using errcode = '22023'; end if;
  if exists (
    select 1 from public.cuenta_pedidos cp
    join public.cuentas c on c.id = cp.cuenta_id
     where cp.pedido_id = p_pedido_id and c.estado = 'pagada'
  ) then raise exception 'La comanda ya fue cobrada.' using errcode = '22023'; end if;

  select e.id into v_estacion_id
    from public.estaciones_restaurante e
   where e.restaurante_id = p_restaurante_id and e.codigo = p_estacion_codigo;
  if v_estacion_id is null then raise exception 'No se encontró la estación de esta comanda.' using errcode = '23503'; end if;

  select s.estado into v_estado_estacion
    from public.estado_comanda_estacion s
   where s.restaurante_id = p_restaurante_id and s.pedido_id = p_pedido_id and s.estacion_id = v_estacion_id
   for update;
  if not found then
    if exists (select 1 from public.entregas_comanda d where d.pedido_id = p_pedido_id and d.restaurante_id = p_restaurante_id) then
      raise exception 'La comanda no fue enrutada a esta estación.' using errcode = '42501';
    end if;
    v_nuevo_estado := case v_estado_pedido
      when 'pendiente' then 'en_preparacion'
      when 'en_preparacion' then 'listo'
      when 'listo' then 'entregado'
      else v_estado_pedido
    end;
    if v_nuevo_estado = v_estado_pedido then
      raise exception 'La comanda ya no tiene estados pendientes.' using errcode = '22023';
    end if;
    update public.pedidos p set estado = v_nuevo_estado, updated_at = now()
     where p.id = p_pedido_id and p.restaurante_id = p_restaurante_id and p.estado = v_estado_pedido;
    if not found then raise exception 'La comanda cambió de estado. Actualiza el tablero.' using errcode = '40001'; end if;
    return;
  end if;

  v_nuevo_estado := case v_estado_estacion
    when 'pendiente' then 'en_preparacion'
    when 'en_preparacion' then 'listo'
    when 'listo' then 'entregado'
    else v_estado_estacion
  end;
  if v_nuevo_estado = v_estado_estacion then
    raise exception 'Esta estación ya terminó la comanda.' using errcode = '22023';
  end if;
  update public.estado_comanda_estacion s
     set estado = v_nuevo_estado,
         iniciado_at = case when v_nuevo_estado = 'en_preparacion' then coalesce(s.iniciado_at, now()) else s.iniciado_at end,
         listo_at = case when v_nuevo_estado = 'listo' then now() else s.listo_at end,
         entregado_at = case when v_nuevo_estado = 'entregado' then now() else s.entregado_at end,
         updated_at = now()
   where s.restaurante_id = p_restaurante_id and s.pedido_id = p_pedido_id and s.estacion_id = v_estacion_id;

  select case
    when bool_or(s.estado = 'pendiente') then 'pendiente'
    when bool_or(s.estado = 'en_preparacion') then 'en_preparacion'
    when bool_or(s.estado = 'listo') then 'listo'
    else 'entregado'
  end into v_nuevo_estado
    from public.estado_comanda_estacion s
   where s.restaurante_id = p_restaurante_id and s.pedido_id = p_pedido_id and s.estado <> 'anulado';
  if v_nuevo_estado is not null then
    update public.pedidos p set estado = v_nuevo_estado, updated_at = now()
     where p.id = p_pedido_id and p.restaurante_id = p_restaurante_id and p.estado <> 'anulado';
  end if;
end;
$$;

comment on function public.avanzar_comanda_estacion(uuid, uuid, text) is
  'Avanza compare-and-set el estado de una estación enrutada y recalcula el estado agregado de la comanda; comandas históricas mantienen el avance global.';

alter table public.entregas_comanda
  add column if not exists estacion_codigo text,
  add column if not exists estacion_nombre text,
  add column if not exists destino_nombre text,
  add column if not exists configuracion_destino jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.entregas_comanda'::regclass
       and conname = 'entregas_comanda_estacion_codigo_check'
  ) then
    alter table public.entregas_comanda
      add constraint entregas_comanda_estacion_codigo_check
      check (estacion_codigo is null or estacion_codigo in ('cocina', 'bar', 'otros'));
  end if;
end;
$$;

revoke all on function public.crear_pedido(uuid, uuid, jsonb) from public, anon;
revoke all on function public.avanzar_comanda_estacion(uuid, uuid, text) from public, anon;
grant execute on function public.crear_pedido(uuid, uuid, jsonb) to authenticated;
grant execute on function public.avanzar_comanda_estacion(uuid, uuid, text) to authenticated;

commit;


-- #############################################################################
-- # 51/55 · ../migrations/20261109045958_fase5_kds_salida_manual_comandas.sql
-- #############################################################################

-- -- Mesora · Fase 5: KDS operativo y salidas de impresión manual.
-- Las rutas quedan congeladas al crear el pedido; ninguna configuración nueva
-- modifica sus destinos históricos.
begin;

alter table public.pedidos
  add column if not exists ruteo_configurado boolean not null default false;

alter table public.entregas_comanda
  add column if not exists solicitud_impresion_id uuid;

create unique index if not exists entregas_comanda_solicitud_impresion_unique
  on public.entregas_comanda (solicitud_impresion_id)
  where solicitud_impresion_id is not null;

comment on column public.entregas_comanda.solicitud_impresion_id is
  'Identificador de la solicitud manual de impresión vigente; bloquea confirmaciones atrasadas.';
create or replace function public.crear_pedido(
  p_restaurante_id uuid,
  p_mesa_id uuid,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pedido_id uuid;
  v_item jsonb;
  v_producto_id uuid;
  v_cantidad int;
  v_producto public.productos%rowtype;
  v_precio numeric;
  v_mesero_id uuid;
  v_estacion_codigo text;
  v_estacion_id uuid;
  v_estacion_nombre text;
  v_estacion_activa boolean;
  v_destino record;
  v_config_version integer;
begin
  perform public.validar_acceso_restaurante(p_restaurante_id);

  select u.id into v_mesero_id
    from public.usuarios u
   where u.id = auth.uid()
     and u.restaurante_id = p_restaurante_id
     and coalesce(u.activo, true)
     and u.rol::text in ('mesero', 'admin_restaurante');
  if v_mesero_id is null then
    raise exception 'Sin permiso para crear pedidos en este restaurante' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.mesas m
     where m.id = p_mesa_id and m.restaurante_id = p_restaurante_id
  ) then
    raise exception 'La mesa no pertenece al restaurante' using errcode = '23503';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'El pedido no tiene ítems' using errcode = '22023';
  end if;

  select coalesce(c.version, 1) into v_config_version
    from (select 1) x
    left join public.configuracion_operativa c on c.restaurante_id = p_restaurante_id;

  insert into public.pedidos (restaurante_id, mesa_id, mesero_id, estado, ruteo_configurado)
  values (p_restaurante_id, p_mesa_id, v_mesero_id, 'pendiente', true)
  returning id into v_pedido_id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_producto_id := nullif(v_item->>'producto_id', '')::uuid;
    v_cantidad := coalesce((v_item->>'cantidad')::int, 1);
    if v_producto_id is null then
      raise exception 'Ítem sin producto_id' using errcode = '22023';
    end if;
    if v_cantidad < 1 or v_cantidad > 99 then
      raise exception 'La cantidad debe ser un número entre 1 y 99' using errcode = '22023';
    end if;

    select * into v_producto
      from public.productos pr
     where pr.id = v_producto_id and pr.restaurante_id = p_restaurante_id
     for update;
    if v_producto.id is null then
      raise exception 'El producto no existe en este restaurante' using errcode = '23503';
    end if;
    if not v_producto.disponible then
      raise exception 'El producto % no está disponible', v_producto.nombre using errcode = '22023';
    end if;

    select coalesce(
             v_producto.estacion,
             e.codigo,
             case when coalesce(v_producto.es_bebida, false) then 'bar' else 'cocina' end
           ) into v_estacion_codigo
      from (select 1) x
      left join public.categorias_productos c
        on c.id = v_producto.categoria_id and c.restaurante_id = p_restaurante_id
      left join public.estaciones_restaurante e
        on e.id = c.estacion_id and e.restaurante_id = p_restaurante_id;

    select e.id, e.nombre, e.activo
      into v_estacion_id, v_estacion_nombre, v_estacion_activa
      from public.estaciones_restaurante e
     where e.restaurante_id = p_restaurante_id and e.codigo = v_estacion_codigo;
    if not found or v_estacion_activa is not true then
      raise exception 'La estación % está desactivada o no existe. Pide al administrador que revise la configuración operativa.',
        coalesce(v_estacion_nombre, v_estacion_codigo)
        using errcode = '22023';
    end if;


    v_precio := case
      when v_producto.es_promocion and v_producto.precio_promocion is not null then v_producto.precio_promocion
      else v_producto.precio
    end;
    if v_precio is null or v_precio < 0 then
      raise exception 'El producto % no tiene precio válido', v_producto.nombre using errcode = '22023';
    end if;

    insert into public.pedido_items (
      pedido_id, producto_id, nombre_producto, cantidad, precio_unitario,
      nota, es_bebida, estacion
    ) values (
      v_pedido_id, v_producto.id, v_producto.nombre, v_cantidad, v_precio,
      nullif(btrim(coalesce(v_item->>'nota', '')), ''),
      coalesce(v_producto.es_bebida, false), v_estacion_codigo
    );
  end loop;

  for v_estacion_codigo in
    select distinct pi.estacion
      from public.pedido_items pi
     where pi.pedido_id = v_pedido_id
     order by pi.estacion
  loop
    select e.id, e.nombre, e.activo
      into v_estacion_id, v_estacion_nombre, v_estacion_activa
      from public.estaciones_restaurante e
     where e.restaurante_id = p_restaurante_id and e.codigo = v_estacion_codigo;
    if not found or v_estacion_activa is not true then
      raise exception 'La estación % está desactivada o no existe. Pide al administrador que revise la configuración operativa.',
        coalesce(v_estacion_nombre, v_estacion_codigo)
        using errcode = '22023';
    end if;

    -- Solo las rutas con KDS crean estado de tablero. Las impresoras manuales
    -- mantienen su propia entrega y una estación sin salida no crea estado operativo.
    if exists (
      select 1 from public.destinos_estacion d
       where d.restaurante_id = p_restaurante_id
         and d.estacion_id = v_estacion_id
         and d.grupo = 'principal'
         and d.activo
         and d.tipo = 'kds'
    ) then
      insert into public.estado_comanda_estacion (restaurante_id, pedido_id, estacion_id, estado)
      values (p_restaurante_id, v_pedido_id, v_estacion_id, 'pendiente');
    end if;

    for v_destino in
      select d.id, d.tipo, d.grupo, d.nombre, d.papel_mm, d.configuracion
        from public.destinos_estacion d
       where d.restaurante_id = p_restaurante_id
         and d.estacion_id = v_estacion_id
         and d.activo
         and d.grupo = 'principal'
       order by d.tipo, d.nombre
    loop
      insert into public.entregas_comanda (
        restaurante_id, pedido_id, estacion_id, estacion_codigo, estacion_nombre,
        destino_estacion_id, destino_nombre, configuracion_destino,
        grupo, tipo_destino, configuracion_version, numero_entrega, estado
      ) values (
        p_restaurante_id, v_pedido_id, v_estacion_id, v_estacion_codigo, v_estacion_nombre,
        v_destino.id, v_destino.nombre,
        coalesce(v_destino.configuracion, '{}'::jsonb) ||
          case when v_destino.papel_mm is null then '{}'::jsonb
               else jsonb_build_object('papel_mm', v_destino.papel_mm) end,
        'principal', v_destino.tipo, v_config_version, 1,
        case when v_destino.tipo = 'kds' then 'confirmada' else 'pendiente' end
      );
    end loop;
  end loop;

  update public.mesas m set estado = 'ocupada'
   where m.id = p_mesa_id and m.restaurante_id = p_restaurante_id;
  return v_pedido_id;
end;
$$;

create or replace function public.mesora_reconciliar_estacion_anulada()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_estacion_id uuid;
  v_estado_global text;
begin
  if new.anulado is not true or old.anulado is true then return new; end if;
  if exists (
    select 1 from public.pedido_items pi
     where pi.pedido_id = new.pedido_id
       and coalesce(pi.estacion, 'cocina') = coalesce(new.estacion, 'cocina')
       and pi.anulado is not true
  ) then return new; end if;

  select e.id into v_estacion_id
    from public.estaciones_restaurante e
    join public.pedidos p on p.restaurante_id = e.restaurante_id
   where p.id = new.pedido_id and e.codigo = coalesce(new.estacion, 'cocina');
  if v_estacion_id is null then return new; end if;

  update public.estado_comanda_estacion s
     set estado = 'anulado', updated_at = now()
   where s.pedido_id = new.pedido_id and s.estacion_id = v_estacion_id
     and s.estado <> 'anulado';
  update public.entregas_comanda d
     set estado = 'cancelada', updated_at = now()
   where d.pedido_id = new.pedido_id and d.estacion_id = v_estacion_id
     and d.estado in ('pendiente', 'enviada', 'fallida');

  if exists (
    select 1 from public.pedido_items pi
     where pi.pedido_id = new.pedido_id and pi.anulado is not true
  ) then
    select case
      when bool_or(s.estado = 'pendiente') then 'pendiente'
      when bool_or(s.estado = 'en_preparacion') then 'en_preparacion'
      when bool_or(s.estado = 'listo') then 'listo'
      else 'entregado'
    end into v_estado_global
      from public.estado_comanda_estacion s
     where s.pedido_id = new.pedido_id and s.estado <> 'anulado';
    if v_estado_global is not null then
      update public.pedidos p set estado = v_estado_global, updated_at = now()
       where p.id = new.pedido_id and p.estado <> 'anulado';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.avanzar_comanda_estacion(
  p_restaurante_id uuid,
  p_pedido_id uuid,
  p_estacion_codigo text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rol text;
  v_estado_pedido text;
  v_estado_estacion text;
  v_nuevo_estado text;
  v_estacion_id uuid;
  v_ruteo_configurado boolean;
begin
  perform public.validar_acceso_restaurante(p_restaurante_id);

  select u.rol::text into v_rol
    from public.usuarios u
   where u.id = auth.uid() and u.restaurante_id = p_restaurante_id and coalesce(u.activo, true);
  if v_rol is null or v_rol not in ('cocina', 'mesero', 'admin_restaurante') then
    raise exception 'Tu perfil no tiene permiso para actualizar las estaciones de preparación.' using errcode = '42501';
  end if;
  if p_estacion_codigo not in ('cocina', 'bar', 'otros') then
    raise exception 'La estación indicada no es válida.' using errcode = '22023';
  end if;

  select p.estado, coalesce(p.ruteo_configurado, false) into v_estado_pedido, v_ruteo_configurado
    from public.pedidos p
   where p.id = p_pedido_id and p.restaurante_id = p_restaurante_id
   for update;
  if not found then raise exception 'La comanda no pertenece al restaurante.' using errcode = '23503'; end if;
  if v_estado_pedido = 'anulado' then raise exception 'La comanda está anulada.' using errcode = '22023'; end if;
  if v_ruteo_configurado and not exists (
    select 1 from public.entregas_comanda d
     where d.restaurante_id = p_restaurante_id and d.pedido_id = p_pedido_id
       and d.estacion_codigo = p_estacion_codigo and d.grupo = 'principal'
       and d.tipo_destino = 'kds'
  ) then
    raise exception 'Esta estación no tiene una salida KDS configurada para la comanda.' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.cuenta_pedidos cp
    join public.cuentas c on c.id = cp.cuenta_id
     where cp.pedido_id = p_pedido_id and c.estado = 'pagada'
  ) then raise exception 'La comanda ya fue cobrada.' using errcode = '22023'; end if;

  select e.id into v_estacion_id
    from public.estaciones_restaurante e
   where e.restaurante_id = p_restaurante_id and e.codigo = p_estacion_codigo;
  if v_estacion_id is null then raise exception 'No se encontró la estación de esta comanda.' using errcode = '23503'; end if;

  select s.estado into v_estado_estacion
    from public.estado_comanda_estacion s
   where s.restaurante_id = p_restaurante_id and s.pedido_id = p_pedido_id and s.estacion_id = v_estacion_id
   for update;
  if not found then
    if exists (select 1 from public.entregas_comanda d where d.pedido_id = p_pedido_id and d.restaurante_id = p_restaurante_id) then
      raise exception 'La comanda no fue enrutada a esta estación.' using errcode = '42501';
    end if;
    v_nuevo_estado := case v_estado_pedido
      when 'pendiente' then 'en_preparacion'
      when 'en_preparacion' then 'listo'
      when 'listo' then 'entregado'
      else v_estado_pedido
    end;
    if v_nuevo_estado = v_estado_pedido then
      raise exception 'La comanda ya no tiene estados pendientes.' using errcode = '22023';
    end if;
    update public.pedidos p set estado = v_nuevo_estado, updated_at = now()
     where p.id = p_pedido_id and p.restaurante_id = p_restaurante_id and p.estado = v_estado_pedido;
    if not found then raise exception 'La comanda cambió de estado. Actualiza el tablero.' using errcode = '40001'; end if;
    return;
  end if;

  v_nuevo_estado := case v_estado_estacion
    when 'pendiente' then 'en_preparacion'
    when 'en_preparacion' then 'listo'
    when 'listo' then 'entregado'
    else v_estado_estacion
  end;
  if v_nuevo_estado = v_estado_estacion then
    raise exception 'Esta estación ya terminó la comanda.' using errcode = '22023';
  end if;
  update public.estado_comanda_estacion s
     set estado = v_nuevo_estado,
         iniciado_at = case when v_nuevo_estado = 'en_preparacion' then coalesce(s.iniciado_at, now()) else s.iniciado_at end,
         listo_at = case when v_nuevo_estado = 'listo' then now() else s.listo_at end,
         entregado_at = case when v_nuevo_estado = 'entregado' then now() else s.entregado_at end,
         updated_at = now()
   where s.restaurante_id = p_restaurante_id and s.pedido_id = p_pedido_id and s.estacion_id = v_estacion_id;

  select case
    when bool_or(s.estado = 'pendiente') then 'pendiente'
    when bool_or(s.estado = 'en_preparacion') then 'en_preparacion'
    when bool_or(s.estado = 'listo') then 'listo'
    else 'entregado'
  end into v_nuevo_estado
    from public.estado_comanda_estacion s
   where s.restaurante_id = p_restaurante_id and s.pedido_id = p_pedido_id and s.estado <> 'anulado';
  if v_nuevo_estado is not null then
    update public.pedidos p set estado = v_nuevo_estado, updated_at = now()
     where p.id = p_pedido_id and p.restaurante_id = p_restaurante_id and p.estado <> 'anulado';
  end if;
end;
$$;
comment on function public.crear_pedido(uuid, uuid, jsonb) is
  'Crea una comanda con ruta histórica. Producto > categoría > bebida > cocina; sin destino conserva pedido e ítems sin generar salida. Solo crea estado de estación para destinos KDS.';
revoke all on function public.crear_pedido(uuid, uuid, jsonb) from public, anon;
grant execute on function public.crear_pedido(uuid, uuid, jsonb) to authenticated;

revoke all on function public.mesora_reconciliar_estacion_anulada() from public, anon, authenticated;
drop trigger if exists pedido_item_reconciliar_estacion_anulada on public.pedido_items;
create trigger pedido_item_reconciliar_estacion_anulada
after update of anulado on public.pedido_items
for each row execute function public.mesora_reconciliar_estacion_anulada();

comment on function public.avanzar_comanda_estacion(uuid, uuid, text) is
  'Avanza el estado independiente de una estación KDS de la ruta histórica; el pedido agregado no mezcla estados de otras estaciones.';
revoke all on function public.avanzar_comanda_estacion(uuid, uuid, text) from public, anon;
grant execute on function public.avanzar_comanda_estacion(uuid, uuid, text) to authenticated;

create or replace function public.registrar_impresion_salida_comanda(
  p_restaurante_id uuid,
  p_pedido_id uuid,
  p_estacion text,
  p_entrega_id uuid,
  p_solicitud_id uuid,
  p_motivo text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rol text;
  v_actor_nombre text;
  v_restaurante_nombre text;
  v_mesa_id uuid;
  v_mesa_nombre text;
  v_estado_pedido text;
  v_entrega public.entregas_comanda%rowtype;
  v_accion_existente text;
  v_entrega_existente text;
  v_es_reimpresion boolean;
  v_accion text;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
begin
  if auth.uid() is null then raise exception 'Inicia sesión para registrar la impresión.'; end if;
  if p_solicitud_id is null then raise exception 'No se pudo identificar esta solicitud de impresión. Inténtalo de nuevo.'; end if;
  if p_estacion not in ('cocina', 'bar', 'otros') then raise exception 'Selecciona una estación válida.'; end if;
  perform public.validar_acceso_restaurante(p_restaurante_id);

  select u.rol::text, u.nombre into v_rol, v_actor_nombre
    from public.usuarios u
   where u.id = auth.uid() and u.restaurante_id = p_restaurante_id and coalesce(u.activo, true);
  if coalesce(v_rol, '') not in ('admin_restaurante', 'mesero', 'cocina') then
    raise exception 'Tu perfil no tiene permiso para imprimir comandas.' using errcode = '42501';
  end if;

  select d.* into v_entrega
    from public.entregas_comanda d
   where d.id = p_entrega_id and d.restaurante_id = p_restaurante_id
     and d.pedido_id = p_pedido_id and d.grupo = 'principal'
     and d.tipo_destino = 'impresora'
   for update;
  if not found or coalesce(v_entrega.estacion_codigo, p_estacion) <> p_estacion then
    raise exception 'La salida manual no pertenece a esta comanda y estación.' using errcode = '42501';
  end if;
  if v_entrega.estado = 'cancelada' then raise exception 'La salida de impresión fue cancelada.'; end if;

  select p.estado, r.nombre, m.id, m.nombre
    into v_estado_pedido, v_restaurante_nombre, v_mesa_id, v_mesa_nombre
    from public.pedidos p
    join public.restaurantes r on r.id = p.restaurante_id
    join public.mesas m on m.id = p.mesa_id and m.restaurante_id = p.restaurante_id
   where p.id = p_pedido_id and p.restaurante_id = p_restaurante_id;
  if not found or v_estado_pedido = 'anulado' then raise exception 'La comanda está anulada o no pertenece a este restaurante.'; end if;
  if not exists (
    select 1 from public.pedido_items pi
     where pi.pedido_id = p_pedido_id and pi.estacion = p_estacion and pi.anulado is not true
  ) then raise exception 'Esta comanda no tiene productos vigentes para esa estación.'; end if;

  select l.accion, l.detalle ->> 'entrega_id'
    into v_accion_existente, v_entrega_existente
    from public.audit_logs l
   where l.detalle ->> 'solicitud_id' = p_solicitud_id::text
   limit 1;
  if found then
    if v_entrega_existente = p_entrega_id::text and exists (
      select 1 from public.audit_logs l
       where l.detalle ->> 'solicitud_id' = p_solicitud_id::text
         and l.actor_id = auth.uid() and l.restaurante_id = p_restaurante_id
         and l.entidad = 'pedido' and l.entidad_id = p_pedido_id
    ) then
      return jsonb_build_object('estado', 'registrada', 'accion', v_accion_existente);
    end if;
    raise exception 'La solicitud de impresión ya se usó para otra salida.';
  end if;

  select exists (
    select 1 from public.audit_logs l
     where l.restaurante_id = p_restaurante_id and l.entidad = 'pedido'
       and l.entidad_id = p_pedido_id
       and l.accion in ('comanda_imprimir', 'comanda_reimprimir')
       and l.detalle ->> 'entrega_id' = p_entrega_id::text
  ) into v_es_reimpresion;
  if v_es_reimpresion and v_motivo is null then return jsonb_build_object('estado', 'requiere_motivo'); end if;
  if v_es_reimpresion and (length(v_motivo) < 5 or length(v_motivo) > 300) then
    raise exception 'Escribe un motivo de reimpresión de entre 5 y 300 caracteres.';
  end if;

  v_accion := case when v_es_reimpresion then 'comanda_reimprimir' else 'comanda_imprimir' end;
  begin
    insert into public.audit_logs (
      actor_id, actor_rol, actor_nombre, restaurante_id, restaurante_nombre,
      entidad, entidad_id, accion, descripcion, detalle
    ) values (
      auth.uid(), v_rol, v_actor_nombre, p_restaurante_id, v_restaurante_nombre,
      'pedido', p_pedido_id, v_accion,
      case when v_es_reimpresion then 'Comanda reimpresa en ' else 'Comanda enviada a impresión en ' end
        || initcap(p_estacion) || ', mesa ' || v_mesa_nombre || ' (' || coalesce(v_entrega.destino_nombre, 'impresora configurada') || ').',
      jsonb_build_object(
        'solicitud_id', p_solicitud_id,
        'entrega_id', p_entrega_id,
        'pedido_id', p_pedido_id,
        'mesa_id', v_mesa_id,
        'mesa_nombre', v_mesa_nombre,
        'estacion', p_estacion,
        'impresora', v_entrega.destino_nombre,
        'papel_mm', v_entrega.configuracion_destino -> 'papel_mm',
        'copias', coalesce(v_entrega.configuracion_destino -> 'copias', '1'::jsonb),
        'configuracion_version', v_entrega.configuracion_version,
        'configuracion_destino', v_entrega.configuracion_destino,
        'motivo', case when v_es_reimpresion then v_motivo else null end
      )
    );
  exception when unique_violation then
    select l.accion into v_accion_existente
      from public.audit_logs l
     where l.detalle ->> 'solicitud_id' = p_solicitud_id::text
       and l.detalle ->> 'entrega_id' = p_entrega_id::text
       and l.actor_id = auth.uid() and l.restaurante_id = p_restaurante_id
       and l.entidad_id = p_pedido_id;
    if not found then raise exception 'La solicitud de impresión ya se usó para otra salida.'; end if;
    return jsonb_build_object('estado', 'registrada', 'accion', v_accion_existente);
  end;

  update public.entregas_comanda d set estado = 'enviada', updated_at = now()
       , solicitud_impresion_id = p_solicitud_id
   where d.id = p_entrega_id and d.restaurante_id = p_restaurante_id;
  return jsonb_build_object('estado', 'registrada', 'accion', v_accion);
end;
$$;

create or replace function public.actualizar_estado_salida_comanda(
  p_restaurante_id uuid,
  p_entrega_id uuid,
  p_solicitud_id uuid,
  p_estado text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rol text;
  v_estado_actual text;
begin
  if auth.uid() is null then raise exception 'Inicia sesión para actualizar la salida.'; end if;
  if p_estado not in ('confirmada', 'fallida') then raise exception 'Estado de impresión no válido.'; end if;
  perform public.validar_acceso_restaurante(p_restaurante_id);

  select u.rol::text into v_rol
    from public.usuarios u
   where u.id = auth.uid() and u.restaurante_id = p_restaurante_id and coalesce(u.activo, true);
  if coalesce(v_rol, '') not in ('admin_restaurante', 'mesero', 'cocina') then
    raise exception 'Tu perfil no tiene permiso para actualizar esta salida.' using errcode = '42501';
  end if;

  select d.estado into v_estado_actual
    from public.entregas_comanda d
   where d.id = p_entrega_id and d.restaurante_id = p_restaurante_id
     and d.grupo = 'principal' and d.tipo_destino = 'impresora'
   for update;
  if not found or v_estado_actual = 'cancelada' then raise exception 'La salida de impresión ya no está disponible.'; end if;
  if not exists (
    select 1 from public.audit_logs l
     where l.detalle ->> 'solicitud_id' = p_solicitud_id::text
       and l.detalle ->> 'entrega_id' = p_entrega_id::text
       and l.actor_id = auth.uid() and l.restaurante_id = p_restaurante_id
       and l.accion in ('comanda_imprimir', 'comanda_reimprimir')
  ) then raise exception 'No se encontró la solicitud de impresión asociada.'; end if;

  if not exists (
    select 1 from public.entregas_comanda d
     where d.id = p_entrega_id and d.restaurante_id = p_restaurante_id
       and d.solicitud_impresion_id = p_solicitud_id
  ) then
    raise exception 'Hay otra solicitud de impresión activa. Actualiza la cola antes de confirmar.';
  end if;
  if v_estado_actual = p_estado then return; end if;
  if v_estado_actual not in ('enviada', 'fallida') then
    raise exception 'La salida no está esperando confirmación de impresión.';
  end if;

  update public.entregas_comanda d set estado = p_estado, updated_at = now()
   where d.id = p_entrega_id and d.restaurante_id = p_restaurante_id;
end;
$$;

revoke all on function public.registrar_impresion_salida_comanda(uuid, uuid, text, uuid, uuid, text) from public, anon;
revoke all on function public.actualizar_estado_salida_comanda(uuid, uuid, uuid, text) from public, anon;
grant execute on function public.registrar_impresion_salida_comanda(uuid, uuid, text, uuid, uuid, text) to authenticated;
grant execute on function public.actualizar_estado_salida_comanda(uuid, uuid, uuid, text) to authenticated;

commit;


-- #############################################################################
-- # 52/55 · ../migrations/20261109061058_fase6_agente_impresion_automatica.sql
-- #############################################################################

-- -- Mesora Fase 6. La cola y los verificadores viven fuera del esquema expuesto.
-- Ninguna clave service_role se entrega al agente. La API pública valida un
-- token aleatorio de 256 bits cuyo SHA-256 es el único valor persistido aquí.
begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.agentes_impresion (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes(id) on delete cascade,
  nombre text not null check (length(btrim(nombre)) between 2 and 80),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  estado text not null default 'activo' check (estado in ('activo','revocado')),
  impresoras_detectadas jsonb not null default '[]'::jsonb check (jsonb_typeof(impresoras_detectadas) = 'array'),
  creado_at timestamptz not null default now(),
  ultimo_heartbeat_at timestamptz,
  revocado_at timestamptz,
  constraint agentes_impresion_id_restaurante unique (id, restaurante_id)
);

create table if not exists private.codigos_agente_impresion (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes(id) on delete cascade,
  codigo_hash text not null unique check (codigo_hash ~ '^[0-9a-f]{64}$'),
  creado_por uuid not null references public.usuarios(id),
  creado_at timestamptz not null default now(),
  expira_at timestamptz not null,
  usado_at timestamptz,
  constraint codigos_agente_expira check (expira_at > creado_at and expira_at <= creado_at + interval '15 minutes')
);
create index if not exists codigos_agente_restaurante_idx
  on private.codigos_agente_impresion(restaurante_id, creado_at desc);

create table if not exists private.asignaciones_impresora (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes(id) on delete cascade,
  destino_id uuid not null,
  agente_id uuid not null,
  cola_windows text not null check (length(btrim(cola_windows)) between 1 and 160),
  activa boolean not null default true,
  max_intentos smallint not null default 3 check (max_intentos between 1 and 10),
  reintento_base_seg smallint not null default 15 check (reintento_base_seg between 5 and 300),
  creado_at timestamptz not null default now(),
  actualizado_at timestamptz not null default now(),
  constraint asignacion_destino_restaurante unique (restaurante_id, destino_id),
  constraint asignacion_id_restaurante unique (id, restaurante_id),
  constraint asignacion_destino_fk foreign key (destino_id, restaurante_id)
    references public.destinos_estacion(id, restaurante_id) on delete restrict,
  constraint asignacion_agente_fk foreign key (agente_id, restaurante_id)
    references private.agentes_impresion(id, restaurante_id) on delete restrict
);

create unique index if not exists entregas_comanda_id_restaurante_fase6
  on public.entregas_comanda(id, restaurante_id);

create table if not exists private.trabajos_impresion (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes(id) on delete cascade,
  tipo text not null default 'comanda' check (tipo in ('comanda','prueba')),
  entrega_id uuid,
  pedido_id uuid,
  destino_id uuid not null,
  agente_id uuid not null,
  estacion_codigo text not null check (estacion_codigo in ('cocina','bar')),
  cola_windows text not null check (length(btrim(cola_windows)) between 1 and 160),
  papel_mm smallint not null check (papel_mm in (58,80)),
  copias smallint not null check (copias between 1 and 5),
  configuracion_version integer not null check (configuracion_version >= 1),
  estado text not null default 'pendiente'
    check (estado in ('pendiente','reclamado','enviado','fallido','cancelado')),
  intentos smallint not null default 0 check (intentos >= 0),
  max_intentos smallint not null check (max_intentos between 1 and 10),
  reintento_base_seg smallint not null check (reintento_base_seg between 5 and 300),
  proximo_intento_at timestamptz,
  lease_hasta timestamptz,
  reclamo_id uuid,
  envio_iniciado_at timestamptz,
  enviado_at timestamptz,
  error_ultimo text,
  error_final text,
  creado_at timestamptz not null default now(),
  actualizado_at timestamptz not null default now(),
  constraint trabajo_entrega_unique unique (entrega_id),
  constraint trabajo_agente_fk foreign key (agente_id, restaurante_id)
    references private.agentes_impresion(id, restaurante_id) on delete restrict,
  constraint trabajo_destino_fk foreign key (destino_id, restaurante_id)
    references public.destinos_estacion(id, restaurante_id) on delete restrict,
  constraint trabajo_entrega_fk foreign key (entrega_id, restaurante_id)
    references public.entregas_comanda(id, restaurante_id) on delete restrict,
  constraint trabajo_pedido_fk foreign key (pedido_id, restaurante_id)
    references public.pedidos(id, restaurante_id) on delete restrict,
  constraint trabajo_tipo_check check (
    (tipo = 'prueba' and entrega_id is null and pedido_id is null)
    or (tipo = 'comanda' and entrega_id is not null and pedido_id is not null)
  )
);
create index if not exists trabajos_impresion_reclamo_idx
  on private.trabajos_impresion(agente_id, estado, proximo_intento_at, creado_at)
  where estado in ('pendiente','fallido','reclamado');

alter table private.agentes_impresion enable row level security;
alter table private.codigos_agente_impresion enable row level security;
alter table private.asignaciones_impresora enable row level security;
alter table private.trabajos_impresion enable row level security;
revoke all on table private.agentes_impresion, private.codigos_agente_impresion,
  private.asignaciones_impresora, private.trabajos_impresion from public, anon, authenticated;

-- No se conceden políticas directas: toda lectura o escritura pasa por RPC
-- con comprobación de rol, restaurante y/o verificador de token.
create or replace function private.validar_admin_impresion(p_restaurante_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := auth.uid();
begin
  if v_actor is null or not exists (
    select 1 from public.usuarios u where u.id = v_actor
      and u.restaurante_id = p_restaurante_id and u.rol::text = 'admin_restaurante'
      and coalesce(u.activo, true)
  ) then raise exception 'Solo el administrador del restaurante puede gestionar agentes de impresión.' using errcode='42501'; end if;
  return v_actor;
end; $$;

-- El código existe solo diez minutos; el agente crea su token y la base conserva
-- únicamente el hash. FOR UPDATE hace imposible consumirlo dos veces.
create or replace function public.agente_impresion_vincular(p_codigo text,p_token text,p_nombre text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_codigo private.codigos_agente_impresion%rowtype; v_agente_id uuid;
begin
  if coalesce(p_codigo,'') !~ '^[0-9a-f]{32}$' or coalesce(p_token,'') !~ '^[0-9a-f]{64}$'
    or length(btrim(coalesce(p_nombre,''))) not between 2 and 80 then
    raise exception 'Código, token o nombre inválido.' using errcode='22023'; end if;
  select c.* into v_codigo from private.codigos_agente_impresion c
    where c.codigo_hash=encode(extensions.digest(p_codigo,'sha256'),'hex') for update;
  if not found or v_codigo.usado_at is not null or v_codigo.expira_at <= now() then
    raise exception 'El código venció o ya fue utilizado. Solicita uno nuevo.' using errcode='42501'; end if;
  insert into private.agentes_impresion(restaurante_id,nombre,token_hash)
    values(v_codigo.restaurante_id,btrim(p_nombre),encode(extensions.digest(p_token,'sha256'),'hex'))
    returning id into v_agente_id;
  update private.codigos_agente_impresion set usado_at=now() where id=v_codigo.id;
  insert into public.audit_logs(actor_id,actor_rol,restaurante_id,entidad,entidad_id,accion,descripcion,detalle)
    values(v_codigo.creado_por,'admin_restaurante',v_codigo.restaurante_id,'agente_impresion',v_agente_id,
      'agente_impresion_vincular','Agente local de impresión vinculado.',jsonb_build_object('agente_id',v_agente_id));
  return jsonb_build_object('agente_id',v_agente_id,'restaurante_id',v_codigo.restaurante_id);
end; $$;

create or replace function private.agente_impresion_activo(p_token text)
returns private.agentes_impresion language plpgsql security definer set search_path = '' as $$
declare v_agente private.agentes_impresion%rowtype;
begin
  if coalesce(p_token,'') !~ '^[0-9a-f]{64}$' then
    raise exception 'Agente no autorizado.' using errcode='42501'; end if;
  select a.* into v_agente from private.agentes_impresion a
    where a.token_hash=encode(extensions.digest(p_token,'sha256'),'hex') and a.estado='activo';
  if not found then raise exception 'Agente no autorizado o revocado.' using errcode='42501'; end if;
  return v_agente;
end; $$;
revoke all on function private.agente_impresion_activo(text) from public, anon, authenticated;

create or replace function public.agente_impresion_heartbeat(p_token text,p_impresoras jsonb default '[]'::jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_agente private.agentes_impresion%rowtype;
begin
  v_agente := private.agente_impresion_activo(p_token);
  if jsonb_typeof(p_impresoras) <> 'array' or jsonb_array_length(p_impresoras)>40
    or length(p_impresoras::text)>8000 or exists(
      select 1 from jsonb_array_elements(p_impresoras) x
        where jsonb_typeof(x) <> 'string' or length(trim(both '"' from x::text)) > 160
    ) then raise exception 'Lista de impresoras inválida.' using errcode='22023'; end if;
  update private.agentes_impresion set ultimo_heartbeat_at=now(),
    impresoras_detectadas=p_impresoras
    where id=v_agente.id and restaurante_id=v_agente.restaurante_id
      and (ultimo_heartbeat_at is null or ultimo_heartbeat_at <= now()-interval '15 seconds');
  return jsonb_build_object('agente_id',v_agente.id,'restaurante_id',v_agente.restaurante_id,
    'actualizado',found,'espera_segundos',case when found then 30 else 15 end);
end; $$;

-- Creación idempotente al insertar la entrega histórica. Las asignaciones
-- posteriores no imprimen pedidos antiguos por sorpresa.
create or replace function private.encolar_entrega_impresora()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_asig private.asignaciones_impresora%rowtype;
begin
  if new.tipo_destino <> 'impresora' or new.grupo <> 'principal'
    or new.estacion_codigo not in ('cocina','bar') then return new; end if;
  select x.* into v_asig from private.asignaciones_impresora x
    join private.agentes_impresion a on a.id=x.agente_id and a.restaurante_id=x.restaurante_id
    where x.restaurante_id=new.restaurante_id and x.destino_id=new.destino_estacion_id
      and x.activa and a.estado='activo';
  if not found then return new; end if;
  insert into private.trabajos_impresion(restaurante_id,tipo,entrega_id,pedido_id,destino_id,
    agente_id,estacion_codigo,cola_windows,papel_mm,copias,configuracion_version,
    max_intentos,reintento_base_seg)
    values(new.restaurante_id,'comanda',new.id,new.pedido_id,new.destino_estacion_id,
      v_asig.agente_id,new.estacion_codigo,v_asig.cola_windows,
      coalesce((new.configuracion_destino->>'papel_mm')::smallint,80),
      least(5,greatest(1,coalesce((new.configuracion_destino->>'copias')::smallint,1))),
      new.configuracion_version,v_asig.max_intentos,v_asig.reintento_base_seg)
    on conflict (entrega_id) do nothing;
  return new;
end; $$;
revoke all on function private.encolar_entrega_impresora() from public, anon, authenticated;
drop trigger if exists entregas_comanda_encolar_agente on public.entregas_comanda;
create trigger entregas_comanda_encolar_agente after insert on public.entregas_comanda
  for each row execute function private.encolar_entrega_impresora();

-- La solicitud manual cancela un trabajo aún no reclamado. Si el agente ya lo
-- reclamó, se informa al operador y no se generan dos impresiones simultáneas.
create or replace function private.sincronizar_entrega_impresora()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_estado text; v_lease timestamptz; v_envio timestamptz;
begin
  if new.estado='cancelada' and old.estado <> 'cancelada' then
    update private.trabajos_impresion set estado='cancelado',lease_hasta=null,
      error_final=coalesce(error_final,'La entrega fue cancelada.'),actualizado_at=now()
      where entrega_id=new.id and estado in ('pendiente','fallido','reclamado');
  elsif new.solicitud_impresion_id is not null
    and new.solicitud_impresion_id is distinct from old.solicitud_impresion_id then
    select estado,lease_hasta,envio_iniciado_at into v_estado,v_lease,v_envio from private.trabajos_impresion
      where entrega_id=new.id for update;
    if v_estado='reclamado' and (v_lease >= now() or v_envio is not null) then
      raise exception 'El agente está procesando esta comanda. Actualiza la cola antes de imprimir manualmente.' using errcode='40001'; end if;
    if v_estado in ('pendiente','fallido','reclamado') then
      update private.trabajos_impresion set estado='cancelado',lease_hasta=null,
        error_final=coalesce(error_final,'Salida manual solicitada.'),actualizado_at=now()
        where entrega_id=new.id and (estado='pendiente' or proximo_intento_at is not null
          or (estado='reclamado' and lease_hasta<now() and envio_iniciado_at is null));
    end if;
  end if;
  return new;
end; $$;
revoke all on function private.sincronizar_entrega_impresora() from public, anon, authenticated;
drop trigger if exists entregas_comanda_sincronizar_agente on public.entregas_comanda;
create trigger entregas_comanda_sincronizar_agente before update of estado,solicitud_impresion_id
  on public.entregas_comanda for each row execute function private.sincronizar_entrega_impresora();
revoke all on function private.validar_admin_impresion(uuid) from public, anon, authenticated;

create or replace function public.admin_impresion_crear_codigo(p_restaurante_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid; v_codigo text; v_expira timestamptz := now() + interval '10 minutes';
begin
  v_actor := private.validar_admin_impresion(p_restaurante_id);
  if exists (select 1 from private.codigos_agente_impresion c
      where c.creado_por = v_actor and c.creado_at > now() - interval '60 seconds')
    or (select count(*) from private.codigos_agente_impresion c
      where c.creado_por = v_actor and c.creado_at > now() - interval '1 hour') >= 5 then
    raise exception 'Espera antes de crear otro código de vinculación.' using errcode='22023';
  end if;
  v_codigo := encode(extensions.gen_random_bytes(16), 'hex');
  insert into private.codigos_agente_impresion(restaurante_id,codigo_hash,creado_por,expira_at)
    values(p_restaurante_id,encode(extensions.digest(v_codigo,'sha256'),'hex'),v_actor,v_expira);
  return jsonb_build_object('codigo',v_codigo,'expira_at',v_expira);
end; $$;

create or replace function public.admin_impresion_panel(p_restaurante_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform private.validar_admin_impresion(p_restaurante_id);
  return jsonb_build_object(
    'agentes', coalesce((select jsonb_agg(jsonb_build_object(
      'id',a.id,'nombre',a.nombre,'estado',a.estado,
      'ultimo_heartbeat_at',a.ultimo_heartbeat_at,
      'impresoras_detectadas',a.impresoras_detectadas,
      'conectado',a.estado='activo' and a.ultimo_heartbeat_at > now()-interval '90 seconds'
    ) order by a.creado_at desc) from private.agentes_impresion a
      where a.restaurante_id=p_restaurante_id),'[]'::jsonb),
    'asignaciones', coalesce((select jsonb_agg(jsonb_build_object(
      'destino_id',x.destino_id,'agente_id',x.agente_id,'cola_windows',x.cola_windows,
      'activa',x.activa,'max_intentos',x.max_intentos,'reintento_base_seg',x.reintento_base_seg
    )) from private.asignaciones_impresora x
      where x.restaurante_id=p_restaurante_id),'[]'::jsonb),
    'trabajos', coalesce((select jsonb_agg(jsonb_build_object(
      'id',t.id,'tipo',t.tipo,'estacion',t.estacion_codigo,'estado',t.estado,
      'cola_windows',t.cola_windows,'intentos',t.intentos,'max_intentos',t.max_intentos,
      'creado_at',t.creado_at,'enviado_at',t.enviado_at,'error_final',t.error_final
    ) order by t.creado_at desc) from (select * from private.trabajos_impresion
      where restaurante_id=p_restaurante_id order by creado_at desc limit 30) t),'[]'::jsonb),
    'respaldo_automatico_disponible', false
  );
end; $$;

create or replace function public.admin_impresion_revocar(p_restaurante_id uuid,p_agente_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_actor uuid;
begin
  v_actor := private.validar_admin_impresion(p_restaurante_id);
  update private.agentes_impresion set estado='revocado',revocado_at=now()
    where id=p_agente_id and restaurante_id=p_restaurante_id and estado='activo';
  if not found then raise exception 'El agente no existe o ya fue revocado.'; end if;
  update private.asignaciones_impresora set activa=false,actualizado_at=now()
    where agente_id=p_agente_id and restaurante_id=p_restaurante_id;
  update private.trabajos_impresion set estado='cancelado',lease_hasta=null,
    error_final=coalesce(error_final,'Agente revocado; usa la salida manual.'),actualizado_at=now()
    where agente_id=p_agente_id and restaurante_id=p_restaurante_id
      and (estado in ('pendiente','reclamado')
        or (estado='fallido' and proximo_intento_at is not null));
  insert into public.audit_logs(actor_id,actor_rol,restaurante_id,entidad,entidad_id,accion,descripcion,detalle)
    values(v_actor,'admin_restaurante',p_restaurante_id,'agente_impresion',p_agente_id,
      'agente_impresion_revocar','Agente de impresión revocado.',jsonb_build_object('agente_id',p_agente_id));
end; $$;

create or replace function public.admin_impresion_asignar(
  p_restaurante_id uuid,p_destino_id uuid,p_agente_id uuid,p_cola_windows text,
  p_activa boolean default true,p_max_intentos integer default 3,p_reintento_base_seg integer default 15
) returns void language plpgsql security definer set search_path = '' as $$
declare v_actor uuid; v_estacion text; v_grupo text; v_cola text := btrim(coalesce(p_cola_windows,''));
begin
  v_actor := private.validar_admin_impresion(p_restaurante_id);
  select e.codigo,d.grupo into v_estacion,v_grupo from public.destinos_estacion d
    join public.estaciones_restaurante e on e.id=d.estacion_id and e.restaurante_id=d.restaurante_id
    where d.id=p_destino_id and d.restaurante_id=p_restaurante_id and d.tipo='impresora';
  if v_estacion not in ('cocina','bar') or v_estacion is null then
    raise exception 'Solo se pueden asignar impresoras de Cocina o Barra.' using errcode='22023'; end if;
  if v_grupo='respaldo' and p_activa then
    raise exception 'La impresión automática de respaldo aún no está habilitada.' using errcode='22023'; end if;
  if not exists(select 1 from private.agentes_impresion a
      where a.id=p_agente_id and a.restaurante_id=p_restaurante_id and a.estado='activo') then
    raise exception 'El agente no está activo en este restaurante.' using errcode='42501'; end if;
  if length(v_cola) not between 1 and 160 or p_max_intentos not between 1 and 10
    or p_reintento_base_seg not between 5 and 300 then
    raise exception 'Revisa el nombre de impresora y los límites de reintento.' using errcode='22023'; end if;
  insert into private.asignaciones_impresora(restaurante_id,destino_id,agente_id,cola_windows,activa,max_intentos,reintento_base_seg)
    values(p_restaurante_id,p_destino_id,p_agente_id,v_cola,p_activa,p_max_intentos,p_reintento_base_seg)
    on conflict (restaurante_id,destino_id) do update set agente_id=excluded.agente_id,
      cola_windows=excluded.cola_windows,activa=excluded.activa,max_intentos=excluded.max_intentos,
      reintento_base_seg=excluded.reintento_base_seg,actualizado_at=now();
  insert into public.audit_logs(actor_id,actor_rol,restaurante_id,entidad,entidad_id,accion,descripcion,detalle)
    values(v_actor,'admin_restaurante',p_restaurante_id,'destino_impresion',p_destino_id,
      'impresora_agente_asignar','Impresora Windows asignada a destino.',
      jsonb_build_object('agente_id',p_agente_id,'destino_id',p_destino_id,'estacion',v_estacion,
        'cola_windows',v_cola,'activa',p_activa));
end; $$;

create or replace function public.admin_impresion_prueba(p_restaurante_id uuid,p_destino_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor uuid; v_asig private.asignaciones_impresora%rowtype; v_destino public.destinos_estacion%rowtype;
  v_estacion text; v_id uuid;
begin
  v_actor := private.validar_admin_impresion(p_restaurante_id);
  select x.* into v_asig from private.asignaciones_impresora x
    join private.agentes_impresion a on a.id=x.agente_id and a.restaurante_id=x.restaurante_id
    where x.restaurante_id=p_restaurante_id and x.destino_id=p_destino_id
      and x.activa and a.estado='activo';
  if not found then raise exception 'Asigna un agente activo a esta impresora antes de probar.'; end if;
  select d.* into v_destino from public.destinos_estacion d
    join public.estaciones_restaurante e on e.id=d.estacion_id and e.restaurante_id=d.restaurante_id
    where d.id=p_destino_id and d.restaurante_id=p_restaurante_id and d.tipo='impresora' and d.grupo='principal'
      and e.codigo in ('cocina','bar');
  select e.codigo into v_estacion from public.estaciones_restaurante e
    where e.id=v_destino.estacion_id and e.restaurante_id=p_restaurante_id;
  if not found or v_estacion not in ('cocina','bar') then raise exception 'La prueba requiere una impresora principal de Cocina o Barra.'; end if;
  insert into private.trabajos_impresion(restaurante_id,tipo,destino_id,agente_id,estacion_codigo,
    cola_windows,papel_mm,copias,configuracion_version,max_intentos,reintento_base_seg)
    values(p_restaurante_id,'prueba',p_destino_id,v_asig.agente_id,v_estacion,v_asig.cola_windows,
      v_destino.papel_mm,least(5,greatest(1,coalesce((v_destino.configuracion->>'copias')::integer,1))),
      (select version from public.configuracion_operativa where restaurante_id=p_restaurante_id),
      v_asig.max_intentos,v_asig.reintento_base_seg) returning id into v_id;
  insert into public.audit_logs(actor_id,actor_rol,restaurante_id,entidad,entidad_id,accion,descripcion,detalle)
    values(v_actor,'admin_restaurante',p_restaurante_id,'trabajo_impresion',v_id,
      'impresion_prueba_solicitar','Prueba de impresión solicitada por el administrador.',
      jsonb_build_object('destino_id',p_destino_id,'estacion',v_estacion,'cola_windows',v_asig.cola_windows));
  return v_id;
end; $$;

-- Cada reclamo bloquea una sola fila. Un lease vencido se recupera solamente
-- si el agente aún no inició el envío al spooler de Windows.
create or replace function public.agente_impresion_reclamar(p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_agente private.agentes_impresion%rowtype; v_job private.trabajos_impresion%rowtype;
  v_reclamo uuid := gen_random_uuid(); v_restaurante text; v_mesa text; v_mesero text;
  v_items jsonb;
begin
  v_agente := private.agente_impresion_activo(p_token);
  update private.trabajos_impresion set estado='fallido',proximo_intento_at=null,
    error_final='Resultado incierto: el agente inició el envío y perdió la conexión. Revisar antes de reimprimir.',
    actualizado_at=now()
    where agente_id=v_agente.id and estado='reclamado' and lease_hasta<now()
      and envio_iniciado_at is not null;
  update private.trabajos_impresion set estado='fallido',proximo_intento_at=null,
    error_final='Se agotaron los intentos antes de enviar a la impresora.',actualizado_at=now()
    where agente_id=v_agente.id and estado='reclamado' and lease_hasta<now()
      and envio_iniciado_at is null and intentos>=max_intentos;

  select j.* into v_job from private.trabajos_impresion j
    where j.agente_id=v_agente.id and j.restaurante_id=v_agente.restaurante_id
      and j.intentos < j.max_intentos
      and (j.estado='pendiente'
        or (j.estado='fallido' and j.proximo_intento_at is not null and j.proximo_intento_at<=now())
        or (j.estado='reclamado' and j.envio_iniciado_at is null and j.lease_hasta<now()))
      and (j.tipo='prueba' or exists(
        select 1 from public.entregas_comanda d where d.id=j.entrega_id
          and d.restaurante_id=j.restaurante_id and d.estado in ('pendiente','fallida')
      ))
    order by j.creado_at,j.id limit 1 for update of j skip locked;
  if not found then return null; end if;
  update private.trabajos_impresion set estado='reclamado',intentos=intentos+1,
    reclamo_id=v_reclamo,lease_hasta=now()+interval '90 seconds',envio_iniciado_at=null,
    proximo_intento_at=null,actualizado_at=now() where id=v_job.id;
  select r.nombre into v_restaurante from public.restaurantes r where r.id=v_job.restaurante_id;
  if v_job.tipo='comanda' then
    select m.nombre,u.nombre into v_mesa,v_mesero from public.pedidos p
      join public.mesas m on m.id=p.mesa_id and m.restaurante_id=p.restaurante_id
      left join public.usuarios u on u.id=p.mesero_id
      where p.id=v_job.pedido_id and p.restaurante_id=v_job.restaurante_id;
    select coalesce(jsonb_agg(jsonb_build_object('nombre',pi.nombre_producto,
      'cantidad',pi.cantidad,'nota',pi.nota) order by pi.created_at,pi.id),'[]'::jsonb)
      into v_items from public.pedido_items pi
      where pi.pedido_id=v_job.pedido_id and pi.estacion=v_job.estacion_codigo and pi.anulado is not true;
    if v_items='[]'::jsonb then
      update private.trabajos_impresion set estado='cancelado',error_final='Sin productos vigentes.',
        lease_hasta=null,actualizado_at=now() where id=v_job.id;
      return null;
    end if;
  else
    v_mesa := 'PRUEBA'; v_mesero := 'Administrador';
    v_items := jsonb_build_array(jsonb_build_object('nombre','Prueba de impresión Mesora',
      'cantidad',1,'nota','Verifica el papel y el corte.'));
  end if;
  return jsonb_build_object('id',v_job.id,'reclamo_id',v_reclamo,'tipo',v_job.tipo,
    'restaurante',v_restaurante,'restaurante_id',v_job.restaurante_id,
    'pedido_id',v_job.pedido_id,'mesa',v_mesa,'mesero',v_mesero,
    'estacion',v_job.estacion_codigo,'cola_windows',v_job.cola_windows,
    'papel_mm',v_job.papel_mm,'copias',v_job.copias,
    'configuracion_version',v_job.configuracion_version,
    'numero_intento',v_job.intentos+1,'creado_at',v_job.creado_at,'items',v_items);
end; $$;

create or replace function public.agente_impresion_iniciar_envio(p_token text,p_trabajo_id uuid,p_reclamo_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_agente private.agentes_impresion%rowtype; v_job private.trabajos_impresion%rowtype;
begin
  v_agente := private.agente_impresion_activo(p_token);
  select j.* into v_job from private.trabajos_impresion j
    where j.id=p_trabajo_id and j.agente_id=v_agente.id and j.restaurante_id=v_agente.restaurante_id for update;
  if not found or v_job.estado<>'reclamado' or v_job.reclamo_id is distinct from p_reclamo_id
    or v_job.lease_hasta<=now() then raise exception 'El reclamo expiró o pertenece a otro agente.' using errcode='42501'; end if;
  if v_job.tipo='comanda' and not exists(select 1 from public.entregas_comanda d
    where d.id=v_job.entrega_id and d.restaurante_id=v_job.restaurante_id
      and d.estado in ('pendiente','fallida')) then
    raise exception 'La comanda ya no requiere impresión automática.' using errcode='22023'; end if;
  update private.trabajos_impresion set envio_iniciado_at=coalesce(envio_iniciado_at,now()),
    lease_hasta=now()+interval '5 minutes',actualizado_at=now() where id=v_job.id;
end; $$;

create or replace function public.agente_impresion_confirmar(p_token text,p_trabajo_id uuid,p_reclamo_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_agente private.agentes_impresion%rowtype; v_job private.trabajos_impresion%rowtype;
  v_restaurante text; v_mesa text;
begin
  v_agente := private.agente_impresion_activo(p_token);
  select j.* into v_job from private.trabajos_impresion j
    where j.id=p_trabajo_id and j.agente_id=v_agente.id and j.restaurante_id=v_agente.restaurante_id for update;
  if not found or v_job.reclamo_id is distinct from p_reclamo_id then
    raise exception 'El reclamo pertenece a otro agente.' using errcode='42501'; end if;
  if v_job.estado='enviado' then return jsonb_build_object('estado','enviado','idempotente',true); end if;
  if v_job.estado not in ('reclamado','fallido') or v_job.envio_iniciado_at is null then
    raise exception 'El trabajo no inició un envío válido.' using errcode='22023'; end if;
  if v_job.estado='fallido' and v_job.proximo_intento_at is not null then
    raise exception 'Este reclamo ya terminó y está programado para reintento.' using errcode='22023'; end if;
  if v_job.tipo='comanda' then
    update public.entregas_comanda set estado='enviada',updated_at=now()
      where id=v_job.entrega_id and restaurante_id=v_job.restaurante_id
        and estado in ('pendiente','fallida') and solicitud_impresion_id is null;
    if not found then raise exception 'La salida fue cancelada o se imprimió manualmente.' using errcode='40001'; end if;
  end if;
  update private.trabajos_impresion set estado='enviado',enviado_at=now(),lease_hasta=null,
    proximo_intento_at=null,error_final=null,actualizado_at=now() where id=v_job.id;
  select nombre into v_restaurante from public.restaurantes where id=v_job.restaurante_id;
  if v_job.pedido_id is not null then
    select m.nombre into v_mesa from public.mesas m join public.pedidos p
      on p.mesa_id=m.id and p.restaurante_id=m.restaurante_id where p.id=v_job.pedido_id;
  end if;
  insert into public.audit_logs(actor_id,actor_rol,actor_nombre,restaurante_id,restaurante_nombre,
    entidad,entidad_id,accion,descripcion,detalle)
    values(null,'agente_impresion',v_agente.nombre,v_job.restaurante_id,v_restaurante,
      case when v_job.tipo='prueba' then 'trabajo_impresion' else 'pedido' end,
      coalesce(v_job.pedido_id,v_job.id),'comanda_imprimir',
      case when v_job.tipo='prueba' then 'Prueba enviada a cola Windows.'
        else 'Comanda enviada a cola Windows en '||initcap(v_job.estacion_codigo)||'.' end,
      jsonb_build_object('solicitud_id',v_job.id,'entrega_id',v_job.entrega_id,
        'agente_id',v_agente.id,'impresora',v_job.cola_windows,'estacion',v_job.estacion_codigo,
        'pedido_id',v_job.pedido_id,'mesa_nombre',v_mesa,'intento',v_job.intentos,
        'enviado_at',now(),'resultado','enviado_a_cola',
        'impresion_fisica_confirmada',false));
  return jsonb_build_object('estado','enviado','impresion_fisica_confirmada',false);
end; $$;

create or replace function public.agente_impresion_fallar(
  p_token text,p_trabajo_id uuid,p_reclamo_id uuid,p_error text,p_reintento_seguro boolean
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_agente private.agentes_impresion%rowtype; v_job private.trabajos_impresion%rowtype;
  v_seguro boolean; v_siguiente timestamptz; v_error text;
begin
  v_agente := private.agente_impresion_activo(p_token);
  select j.* into v_job from private.trabajos_impresion j
    where j.id=p_trabajo_id and j.agente_id=v_agente.id and j.restaurante_id=v_agente.restaurante_id for update;
  if not found or v_job.estado<>'reclamado' or v_job.reclamo_id is distinct from p_reclamo_id then
    raise exception 'El reclamo ya terminó o pertenece a otro agente.' using errcode='42501'; end if;
  v_seguro := coalesce(p_reintento_seguro,false) and v_job.envio_iniciado_at is null
    and v_job.intentos < v_job.max_intentos;
  v_error := left(coalesce(nullif(btrim(p_error),''),'No se pudo enviar a la cola Windows.'),300);
  if v_seguro then
    v_siguiente := now()+make_interval(secs => least(3600,
      (v_job.reintento_base_seg * power(2,greatest(0,v_job.intentos-1)))::integer));
  end if;
  update private.trabajos_impresion set estado='fallido',lease_hasta=null,
    proximo_intento_at=v_siguiente,error_ultimo=v_error,
    error_final=case when v_siguiente is null then
      case when v_job.envio_iniciado_at is not null then
        'Resultado incierto después de iniciar el envío. '||v_error else v_error end
      else null end,actualizado_at=now() where id=v_job.id;
  if v_job.tipo='comanda' then
    update public.entregas_comanda set estado='fallida',error_publico=v_error,updated_at=now()
      where id=v_job.entrega_id and restaurante_id=v_job.restaurante_id and estado='pendiente';
  end if;
  return jsonb_build_object('estado','fallido','reintento_at',v_siguiente,
    'requiere_revision',v_siguiente is null);
end; $$;

revoke all on function public.admin_impresion_crear_codigo(uuid) from public, anon;
revoke all on function public.admin_impresion_panel(uuid) from public, anon;
revoke all on function public.admin_impresion_revocar(uuid,uuid) from public, anon;
revoke all on function public.admin_impresion_asignar(uuid,uuid,uuid,text,boolean,integer,integer) from public, anon;
revoke all on function public.admin_impresion_prueba(uuid,uuid) from public, anon;
grant execute on function public.admin_impresion_crear_codigo(uuid),public.admin_impresion_panel(uuid),
  public.admin_impresion_revocar(uuid,uuid),
  public.admin_impresion_asignar(uuid,uuid,uuid,text,boolean,integer,integer),
  public.admin_impresion_prueba(uuid,uuid) to authenticated;

revoke all on function public.agente_impresion_vincular(text,text,text),
  public.agente_impresion_heartbeat(text,jsonb),public.agente_impresion_reclamar(text),
  public.agente_impresion_iniciar_envio(text,uuid,uuid),
  public.agente_impresion_confirmar(text,uuid,uuid),
  public.agente_impresion_fallar(text,uuid,uuid,text,boolean) from public, authenticated;
grant execute on function public.agente_impresion_vincular(text,text,text),
  public.agente_impresion_heartbeat(text,jsonb),public.agente_impresion_reclamar(text),
  public.agente_impresion_iniciar_envio(text,uuid,uuid),
  public.agente_impresion_confirmar(text,uuid,uuid),
  public.agente_impresion_fallar(text,uuid,uuid,text,boolean) to anon;

commit;


-- #############################################################################
-- # 53/55 · ../migrations/20261109075129_validar_modalidad_cobro_restaurante.sql
-- #############################################################################

-- -- La preferencia de Fase 3 no era una autorización efectiva. NULL conserva
-- exactamente la regla anterior: mesero activo y admin_restaurante activo.
alter table public.configuracion_operativa
  add column if not exists modalidad_cobro_aplicada text
    check (modalidad_cobro_aplicada in (
      'solo_cajero', 'cobro_por_mesero', 'caja_central_meseros_autorizados'
    ));

comment on column public.configuracion_operativa.modalidad_cobro_aplicada is
  'NULL mantiene el cobro heredado; una modalidad aplicada exige autorización individual y se valida en cerrar_cuenta.';

-- La consulta propia es segura para mostrar u ocultar el acceso en la interfaz.
-- La RPC de cierre vuelve a comprobarla dentro de la misma transacción.
create or replace function public.puede_cobrar_restaurante(p_restaurante_id uuid)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_rol text;
  v_modalidad text;
begin
  if auth.uid() is null or p_restaurante_id is null then return false; end if;
  select u.rol::text into v_rol
    from public.usuarios u
   where u.id = auth.uid() and u.restaurante_id = p_restaurante_id and u.activo is true;
  if v_rol is null then return false; end if;
  if v_rol = 'admin_restaurante' then return true; end if;

  select c.modalidad_cobro_aplicada into v_modalidad
    from public.configuracion_operativa c where c.restaurante_id = p_restaurante_id;
  if v_modalidad is null then return v_rol = 'mesero'; end if;
  if (v_modalidad = 'solo_cajero' and v_rol <> 'cajero')
     or (v_modalidad = 'cobro_por_mesero' and v_rol <> 'mesero')
     or (v_modalidad = 'caja_central_meseros_autorizados' and v_rol not in ('cajero', 'mesero')) then
    return false;
  end if;
  return exists (
    select 1 from public.autorizaciones_cobro a
     where a.restaurante_id = p_restaurante_id and a.usuario_id = auth.uid() and a.activo
  );
end;
$$;

revoke all on function public.puede_cobrar_restaurante(uuid) from public, anon;
grant execute on function public.puede_cobrar_restaurante(uuid) to authenticated;

-- El administrador aplica una política completa en una sola llamada. Los IDs
-- se validan antes de escribir; no se acepta cocina, otro restaurante o inactivos.
create or replace function public.admin_obtener_politica_cobro(p_restaurante_id uuid)
returns jsonb
language plpgsql stable security invoker set search_path = ''
as $$
begin
  if auth.uid() is null or not public.puedo_escribir_en(p_restaurante_id, array['admin_restaurante']) then
    raise exception 'Solo el administrador activo puede consultar estos permisos.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'restaurante_id', p_restaurante_id,
    'modalidad_cobro', coalesce((select c.modalidad_cobro from public.configuracion_operativa c
      where c.restaurante_id = p_restaurante_id), 'cobro_por_mesero'),
    'modalidad_aplicada', (select c.modalidad_cobro_aplicada from public.configuracion_operativa c
      where c.restaurante_id = p_restaurante_id),
    'usuarios_autorizados', coalesce((select jsonb_agg(a.usuario_id order by a.usuario_id)
      from public.autorizaciones_cobro a
      where a.restaurante_id = p_restaurante_id and a.activo), '[]'::jsonb)
  );
end;
$$;

create or replace function public.admin_guardar_politica_cobro(
  p_restaurante_id uuid, p_modalidad text, p_usuarios uuid[]
)
returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
  v_total integer;
  v_validos integer;
  v_cajeros integer;
  v_meseros integer;
begin
  if auth.uid() is null or not public.puedo_escribir_en(p_restaurante_id, array['admin_restaurante']) then
    raise exception 'Solo el administrador activo puede cambiar quién cobra.' using errcode = '42501';
  end if;
  if p_modalidad not in ('solo_cajero', 'cobro_por_mesero', 'caja_central_meseros_autorizados')
     or p_modalidad is null then
    raise exception 'Elige una modalidad de cobro válida.' using errcode = '22023';
  end if;
  v_total := coalesce(array_length(p_usuarios, 1), 0);
  if v_total < 1 or v_total > 100 or exists (select 1 from unnest(p_usuarios) id where id is null)
     or (select count(distinct id) from unnest(p_usuarios) id) <> v_total then
    raise exception 'Selecciona entre 1 y 100 usuarios distintos para cobrar.' using errcode = '22023';
  end if;
  select count(*)::integer,
         count(*) filter (where u.rol = 'cajero')::integer,
         count(*) filter (where u.rol = 'mesero')::integer
    into v_validos, v_cajeros, v_meseros
    from public.usuarios u
   where u.id = any(p_usuarios) and u.restaurante_id = p_restaurante_id
     and u.activo is true and u.rol in ('cajero', 'mesero');
  if v_validos <> v_total
     or (p_modalidad = 'solo_cajero' and (v_cajeros <> v_total))
     or (p_modalidad = 'cobro_por_mesero' and (v_meseros <> v_total))
     or (p_modalidad = 'caja_central_meseros_autorizados' and (v_cajeros < 1 or v_meseros < 1)) then
    raise exception 'Selecciona usuarios activos del restaurante y del rol indicado.' using errcode = '22023';
  end if;

  -- Bloquear la configuración serializa dos guardados concurrentes del admin.
  perform 1 from public.configuracion_operativa c
   where c.restaurante_id = p_restaurante_id for update;
  if not found then
    raise exception 'No se encontró la configuración del restaurante.' using errcode = '23503';
  end if;
  update public.autorizaciones_cobro a
     set activo = false, actualizado_por = auth.uid(), updated_at = now()
   where a.restaurante_id = p_restaurante_id and a.activo and a.usuario_id <> all(p_usuarios);
  insert into public.autorizaciones_cobro(restaurante_id, usuario_id, activo, creado_por, actualizado_por)
  select p_restaurante_id, id, true, auth.uid(), auth.uid() from unnest(p_usuarios) id
  on conflict (restaurante_id, usuario_id) do update
    set activo = true, actualizado_por = auth.uid(), updated_at = now()
    where public.autorizaciones_cobro.activo is false;
  update public.configuracion_operativa c
     set modalidad_cobro = p_modalidad, modalidad_cobro_aplicada = p_modalidad
   where c.restaurante_id = p_restaurante_id;
  return public.admin_obtener_politica_cobro(p_restaurante_id);
end;
$$;

revoke all on function public.admin_obtener_politica_cobro(uuid) from public, anon;
revoke all on function public.admin_guardar_politica_cobro(uuid, text, uuid[]) from public, anon;
grant execute on function public.admin_obtener_politica_cobro(uuid) to authenticated;
grant execute on function public.admin_guardar_politica_cobro(uuid, text, uuid[]) to authenticated;

-- El audit log es append-only para clientes. El trigger registra activación,
-- cambios de autorizados y cada cobro de contingencia del administrador.
create or replace function public.mesora_auditar_cobro_configurable()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_restaurante_id uuid;
  v_actor record;
  v_actor_rol text;
  v_restaurante_nombre text;
  v_entidad text;
  v_entidad_id uuid;
  v_accion text;
  v_descripcion text;
  v_detalle jsonb;
begin
  if tg_table_name = 'configuracion_operativa' then
    if old.modalidad_cobro_aplicada is not distinct from new.modalidad_cobro_aplicada then return new; end if;
    v_restaurante_id := new.restaurante_id;
    v_entidad := 'configuracion';
    v_entidad_id := new.restaurante_id;
    v_accion := 'modalidad_cobro_aplicar';
    v_descripcion := 'Actualizó la modalidad de cobro efectiva';
    v_detalle := jsonb_build_object('anterior', old.modalidad_cobro_aplicada, 'nueva', new.modalidad_cobro_aplicada);
  elsif tg_table_name = 'autorizaciones_cobro' then
    if tg_op = 'UPDATE' and old.activo is not distinct from new.activo then return new; end if;
    v_restaurante_id := new.restaurante_id;
    v_entidad := 'configuracion';
    v_entidad_id := new.restaurante_id;
    v_accion := 'autorizacion_cobro_actualizar';
    v_descripcion := 'Actualizó un permiso individual de cobro';
    v_detalle := jsonb_build_object('usuario_id', new.usuario_id,
      'activo_anterior', case when tg_op = 'INSERT' then null else old.activo end,
      'activo_nuevo', new.activo);
  elsif tg_table_name = 'cuentas' then
    select u.rol::text into v_actor_rol from public.usuarios u
      where u.id = auth.uid() and u.restaurante_id = new.restaurante_id;
    if v_actor_rol is distinct from 'admin_restaurante' then return new; end if;
    v_restaurante_id := new.restaurante_id;
    v_entidad := 'cuenta';
    v_entidad_id := new.id;
    v_accion := 'cobro_contingencia_admin';
    v_descripcion := 'El administrador cobró una cuenta por contingencia';
    v_detalle := jsonb_build_object('cuenta_id', new.id, 'mesa_id', new.mesa_id,
      'total', new.total, 'numero', new.numero);
  else
    return new;
  end if;
  select u.rol::text as rol, u.nombre into v_actor from public.usuarios u where u.id = auth.uid();
  select r.nombre into v_restaurante_nombre from public.restaurantes r where r.id = v_restaurante_id;
  insert into public.audit_logs(actor_id, actor_rol, actor_nombre, restaurante_id,
    restaurante_nombre, entidad, entidad_id, accion, descripcion, detalle)
  values (auth.uid(), v_actor.rol, v_actor.nombre, v_restaurante_id,
    v_restaurante_nombre, v_entidad, v_entidad_id,
    v_accion, v_descripcion, v_detalle);
  return new;
end;
$$;

revoke all on function public.mesora_auditar_cobro_configurable() from public, anon, authenticated;
drop trigger if exists configuracion_modalidad_cobro_auditoria on public.configuracion_operativa;
create trigger configuracion_modalidad_cobro_auditoria after update on public.configuracion_operativa
for each row execute function public.mesora_auditar_cobro_configurable();
drop trigger if exists autorizaciones_cobro_auditoria on public.autorizaciones_cobro;
create trigger autorizaciones_cobro_auditoria after insert or update on public.autorizaciones_cobro
for each row execute function public.mesora_auditar_cobro_configurable();
drop trigger if exists cuentas_contingencia_admin_auditoria on public.cuentas;
create trigger cuentas_contingencia_admin_auditoria after insert on public.cuentas
for each row execute function public.mesora_auditar_cobro_configurable();

-- Las definiciones finales de cerrar_cuenta y capturar_snapshot_boleta se
-- agregan abajo. No alteran pagos divididos, correlativos ni cuentas históricas.


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

  -- La política se comprueba en el servidor, incluso al invocar la RPC directamente.
  if not public.puede_cobrar_restaurante(p_restaurante_id) then
    raise exception 'No estás autorizado para cobrar en este restaurante.' using errcode = '42501';
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

create or replace function public.capturar_snapshot_boleta()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_restaurante record;
  v_mesa_nombre text;
  v_mesero_nombre text;
  v_mesero_id uuid;
  v_actor_rol text;
begin
  select r.nombre, r.direccion, r.ruc, r.telefono
    into v_restaurante
    from public.restaurantes r
   where r.id = new.restaurante_id;

  select m.nombre into v_mesa_nombre
    from public.mesas m
   where m.id = new.mesa_id and m.restaurante_id = new.restaurante_id;

  select u.rol::text into v_actor_rol from public.usuarios u
   where u.id = auth.uid() and u.restaurante_id = new.restaurante_id;
  if v_actor_rol = 'mesero' then
    v_mesero_id := auth.uid();
  else
    select m.mesero_responsable_id into v_mesero_id from public.mesas m
     where m.id = new.mesa_id and m.restaurante_id = new.restaurante_id;
    if v_mesero_id is null then
      select p.mesero_id into v_mesero_id from public.pedidos p
       where p.restaurante_id = new.restaurante_id and p.mesa_id = new.mesa_id
         and p.estado <> 'anulado'
       order by p.created_at desc, p.id desc limit 1;
    end if;
  end if;
  select u.nombre into v_mesero_nombre from public.usuarios u
   where u.id = v_mesero_id and u.restaurante_id = new.restaurante_id;
  new.mesero_id_snapshot := v_mesero_id;
  new.mesero_nombre_snapshot := coalesce(new.mesero_nombre_snapshot, v_mesero_nombre);
  new.mesa_nombre_snapshot := coalesce(new.mesa_nombre_snapshot, v_mesa_nombre);
  new.restaurante_nombre_snapshot := coalesce(new.restaurante_nombre_snapshot, v_restaurante.nombre);
  new.restaurante_direccion_snapshot := coalesce(new.restaurante_direccion_snapshot, v_restaurante.direccion);
  new.restaurante_ruc_snapshot := coalesce(new.restaurante_ruc_snapshot, v_restaurante.ruc);
  new.restaurante_telefono_snapshot := coalesce(new.restaurante_telefono_snapshot, v_restaurante.telefono);
  return new;
end;
$$;


-- #############################################################################
-- # 54/55 · ../migrations/20261111034528_impedir_recobro_tras_anulacion_recibo.sql
-- #############################################################################

-- -- Anular un recibo revierte la venta, no deshace el vínculo histórico del pedido.
-- Los cambios son expansivos y no reescriben cuentas, pagos ni pedidos existentes.
create or replace function public.pedidos_pendientes_mesa(p_restaurante_id uuid, p_mesa_id uuid)
returns jsonb language plpgsql stable security invoker
set search_path = pg_catalog, public, pg_temp as $$
begin
  perform public.validar_acceso_restaurante(p_restaurante_id);
  if not public.soy_del_restaurante(p_restaurante_id) then
    raise exception 'Sin permiso para consultar este restaurante';
  end if;
  return (
    select coalesce(jsonb_agg(to_jsonb(p) order by p.created_at,p.id),'[]'::jsonb)
    from (
      select p.id,p.mesa_id,p.estado::text as estado,p.created_at
      from public.pedidos p
      where p.restaurante_id=p_restaurante_id and p.mesa_id=p_mesa_id
        and p.estado::text<>'anulado'
        and not exists (
          select 1 from public.cuenta_pedidos cp
          join public.cuentas c on c.id=cp.cuenta_id and c.restaurante_id=p.restaurante_id
          where cp.pedido_id=p.id and c.estado in ('pagada','anulada')
        )
    ) p
  );
end; $$;

create or replace function public.mesas_por_cobrar(p_restaurante_id uuid)
returns jsonb language plpgsql stable security invoker
set search_path = pg_catalog, public, pg_temp as $$
begin
  perform public.validar_acceso_restaurante(p_restaurante_id);
  if not public.soy_del_restaurante(p_restaurante_id) then
    raise exception 'Sin permiso para consultar este restaurante';
  end if;
  return (
    select coalesce(jsonb_agg(to_jsonb(m) order by m.mesa_nombre,m.mesa_id),'[]'::jsonb)
    from (
      select m.id as mesa_id,m.nombre as mesa_nombre,
        round(sum(pi.cantidad*pi.precio_unitario),2) as total,count(distinct p.id) as pedidos
      from public.mesas m
      join public.pedidos p on p.mesa_id=m.id and p.restaurante_id=m.restaurante_id
      join public.pedido_items pi on pi.pedido_id=p.id and coalesce(pi.anulado,false)=false
      where m.restaurante_id=p_restaurante_id and p.estado::text<>'anulado'
        and not exists (
          select 1 from public.cuenta_pedidos cp
          join public.cuentas c on c.id=cp.cuenta_id and c.restaurante_id=p.restaurante_id
          where cp.pedido_id=p.id and c.estado in ('pagada','anulada')
        )
      group by m.id,m.nombre
      having sum(pi.cantidad*pi.precio_unitario)>0.004
    ) m
  );
end; $$;

-- Cierre directo por RPC: un pedido ligado a una cuenta anulada tampoco se cobra.
-- La comprobación toma el bloqueo del pedido antes de que el cierre inserte pagos.
create or replace function public.impedir_recobro_pedido_cuenta()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_restaurante uuid;
begin
  select restaurante_id into v_restaurante from public.pedidos
   where id=new.pedido_id for update;
  if v_restaurante is null or not exists (
    select 1 from public.cuentas c where c.id=new.cuenta_id
      and c.restaurante_id=v_restaurante
  ) then
    raise exception 'El pedido y la cuenta deben pertenecer al mismo restaurante.' using errcode='42501';
  end if;
  if exists (
    select 1 from public.cuenta_pedidos cp
    join public.cuentas c on c.id=cp.cuenta_id and c.restaurante_id=v_restaurante
    where cp.pedido_id=new.pedido_id and c.estado in ('pagada','anulada')
  ) then
    raise exception 'Este pedido ya tiene un recibo emitido o anulado y no puede cobrarse otra vez.' using errcode='23505';
  end if;
  return new;
end; $$;
revoke all on function public.impedir_recobro_pedido_cuenta() from public,anon,authenticated;
drop trigger if exists trg_impedir_recobro_pedido_cuenta on public.cuenta_pedidos;
create trigger trg_impedir_recobro_pedido_cuenta before insert on public.cuenta_pedidos
for each row execute function public.impedir_recobro_pedido_cuenta();

-- Misma autorización y PIN del flujo existente. Una segunda solicitud devuelve
-- la misma cuenta sin actualizarla y sin disparar otra auditoría/reembolso.
create or replace function public.anular_cuenta(
  p_restaurante_id uuid,p_cuenta_id uuid,p_motivo text,p_pin text default null
) returns public.cuentas language plpgsql security definer set search_path=public as $$
declare v_cuenta public.cuentas%rowtype; v_motivo text;
begin
  set local lock_timeout='5s';
  perform public.validar_acceso_restaurante(p_restaurante_id);
  if not exists (
    select 1 from public.usuarios where id=auth.uid()
      and restaurante_id=p_restaurante_id and rol in ('admin_restaurante','cajero')
      and coalesce(activo,true)
  ) then raise exception 'Sin permiso para anular cobros en este restaurante'; end if;
  v_motivo:=nullif(btrim(coalesce(p_motivo,'')),'');
  if v_motivo is null or length(v_motivo)<4 then
    raise exception 'El motivo de la anulación es obligatorio';
  end if;
  if length(v_motivo)>200 then raise exception 'El motivo de la anulación es demasiado largo'; end if;
  perform public.validar_pin_autorizacion(p_restaurante_id,p_pin);
  select * into v_cuenta from public.cuentas
   where id=p_cuenta_id and restaurante_id=p_restaurante_id for update;
  if v_cuenta.id is null then raise exception 'La cuenta no pertenece al restaurante'; end if;
  if v_cuenta.estado='anulada' then return v_cuenta; end if;
  if v_cuenta.estado<>'pagada' then raise exception 'Solo se puede anular una cuenta cobrada'; end if;
  update public.cuentas set estado='anulada',anulada_at=now(),anulada_por=auth.uid(),
    motivo_anulacion=v_motivo,monto_reembolsado=round(v_cuenta.total+coalesce(v_cuenta.propina,0),2)
   where id=v_cuenta.id returning * into v_cuenta;
  return v_cuenta;
end; $$;
revoke all on function public.anular_cuenta(uuid,uuid,text,text) from public,anon;
grant execute on function public.anular_cuenta(uuid,uuid,text,text) to authenticated;

-- Un estado KDS histórico pendiente no puede volver a avanzarse tras cobrar
-- y anular el recibo, aunque se invoque la RPC directamente.
create or replace function public.impedir_reapertura_estacion_cobrada()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.estado is distinct from old.estado and exists (
    select 1 from public.cuenta_pedidos cp
    join public.cuentas c on c.id=cp.cuenta_id and c.restaurante_id=old.restaurante_id
    where cp.pedido_id=old.pedido_id and c.estado in ('pagada','anulada')
  ) then
    raise exception 'La comanda ya tiene un recibo emitido o anulado y no puede volver a preparación.' using errcode='22023';
  end if;
  return new;
end; $$;
revoke all on function public.impedir_reapertura_estacion_cobrada() from public,anon,authenticated;
drop trigger if exists trg_impedir_reapertura_estacion_cobrada on public.estado_comanda_estacion;
create trigger trg_impedir_reapertura_estacion_cobrada
before update of estado on public.estado_comanda_estacion
for each row execute function public.impedir_reapertura_estacion_cobrada();


-- #############################################################################
-- # 55/55 · ../migrations/20261112120000_idempotencia_crear_pedido.sql
-- #############################################################################

-- -- Una clave identifica una comanda concreta. Los pedidos históricos conservan NULL.
begin;

alter table public.pedidos
  add column if not exists solicitud_id uuid,
  add column if not exists solicitud_items jsonb;

alter table public.pedidos
  add constraint pedidos_solicitud_completa_check
  check ((solicitud_id is null and solicitud_items is null) or
         (solicitud_id is not null and solicitud_items is not null and jsonb_typeof(solicitud_items) = 'array'));

create unique index if not exists pedidos_solicitud_id_unique
  on public.pedidos (solicitud_id) where solicitud_id is not null;

-- Preserva íntegra la implementación de enrutamiento de Fase 5. La nueva RPC
-- serializa la clave antes de llamarla; ambos pasos comparten transacción.
do $$
begin
  if to_regprocedure('public.crear_pedido_base(uuid,uuid,jsonb)') is null then
    alter function public.crear_pedido(uuid,uuid,jsonb) rename to crear_pedido_base;
  end if;
end;
$$;

revoke all on function public.crear_pedido_base(uuid,uuid,jsonb) from public, anon, authenticated;

create or replace function public.crear_pedido(
  p_restaurante_id uuid, p_mesa_id uuid, p_items jsonb, p_solicitud_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_existente public.pedidos%rowtype;
  v_pedido_id uuid;
begin
  if p_solicitud_id is null then
    raise exception 'La comanda requiere una clave de solicitud' using errcode = '22023';
  end if;
  perform public.validar_acceso_restaurante(p_restaurante_id);
  select u.id into v_actor from public.usuarios u
   where u.id = auth.uid() and u.restaurante_id = p_restaurante_id
     and coalesce(u.activo, true) and u.rol::text in ('mesero', 'admin_restaurante');
  if v_actor is null then
    raise exception 'Sin permiso para crear pedidos en este restaurante' using errcode = '42501';
  end if;
  if p_items is null or jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'El pedido no tiene ítems' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) = 0 then
    raise exception 'El pedido no tiene ítems' using errcode = '22023';
  end if;

  -- El índice único es la garantía final; el lock también permite devolver el
  -- resultado original a solicitudes simultáneas sin dejar un 23505 al cliente.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_solicitud_id::text, 0));
  select * into v_existente from public.pedidos
   where solicitud_id = p_solicitud_id for update;
  if found then
    if v_existente.restaurante_id <> p_restaurante_id or
       v_existente.mesero_id <> v_actor or
       v_existente.mesa_id <> p_mesa_id or
       v_existente.solicitud_items is distinct from p_items then
      -- Mensaje idéntico para otra cuenta o restaurante: no filtra existencia.
      raise exception 'La solicitud cambió y no coincide con la comanda original.' using errcode = '22023';
    end if;
    return v_existente.id;
  end if;

  v_pedido_id := public.crear_pedido_base(p_restaurante_id, p_mesa_id, p_items);
  update public.pedidos
     set solicitud_id = p_solicitud_id, solicitud_items = p_items
   where id = v_pedido_id and restaurante_id = p_restaurante_id;
  if not found then
    raise exception 'No se pudo identificar la comanda registrada' using errcode = 'XX000';
  end if;
  return v_pedido_id;
end;
$$;

-- Compatibilidad temporal con clientes abiertos antes del despliegue. Cada
-- llamada vieja recibe su propia clave; solo el nuevo cliente reintenta seguro.
create or replace function public.crear_pedido(
  p_restaurante_id uuid, p_mesa_id uuid, p_items jsonb
)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select public.crear_pedido(p_restaurante_id, p_mesa_id, p_items, gen_random_uuid());
$$;

revoke all on function public.crear_pedido(uuid,uuid,jsonb,uuid) from public, anon;
revoke all on function public.crear_pedido(uuid,uuid,jsonb) from public, anon;
grant execute on function public.crear_pedido(uuid,uuid,jsonb,uuid) to authenticated;
grant execute on function public.crear_pedido(uuid,uuid,jsonb) to authenticated;

comment on column public.pedidos.solicitud_id is
  'Clave opaca de una comanda, nula únicamente en pedidos históricos.';
commit;
