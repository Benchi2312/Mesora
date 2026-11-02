-- Acota las políticas de catálogo/mesas a usuarios autenticados y separa
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
