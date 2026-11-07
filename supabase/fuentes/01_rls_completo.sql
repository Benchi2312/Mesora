-- =============================================================================
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
