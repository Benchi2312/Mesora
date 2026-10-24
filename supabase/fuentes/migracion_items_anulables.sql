-- Mesora · Edición y anulación de ítems de una comanda.
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
