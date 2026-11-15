begin;

-- Simula una base ya desplegada antes de esta feature: la URL histórica sigue
-- presente y el esquema aún no tiene metadata de Cloudinary.
alter table public.productos drop column if exists imagen_public_id;
insert into public.restaurantes(id, nombre)
values ('55555555-5555-4555-8555-555555555555', 'QA imágenes Cloudinary');
insert into public.productos(id, restaurante_id, nombre, imagen_url, precio)
values (
  '66666666-6666-4666-8666-666666666666',
  '55555555-5555-4555-8555-555555555555',
  'Producto histórico QA',
  'https://images.example.invalid/historico.jpg',
  1
);

/* APLICAR_MIGRACION_IMAGEN_PRODUCTO */

do $$
declare
  nullable text;
  url_historica text;
  public_id text;
  rls_activo boolean;
begin
  select is_nullable into nullable
  from information_schema.columns
  where table_schema='public' and table_name='productos' and column_name='imagen_public_id';
  if nullable <> 'YES' then raise exception 'imagen_public_id debe ser nullable'; end if;

  select imagen_url, imagen_public_id into url_historica, public_id
  from public.productos where id='66666666-6666-4666-8666-666666666666';
  if url_historica <> 'https://images.example.invalid/historico.jpg' or public_id is not null then
    raise exception 'La migración alteró la URL histórica o asignó metadata artificial';
  end if;

  select c.relrowsecurity into rls_activo
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relname='productos';
  if rls_activo is not true then raise exception 'RLS de productos debe seguir activo'; end if;
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='productos'
      and policyname='productos_update_admin'
      and qual ilike '%puedo_escribir_en%admin_restaurante%'
      and with_check ilike '%puedo_escribir_en%admin_restaurante%'
  ) then raise exception 'La política existente de escritura administrativa cambió'; end if;
end;
$$;

rollback;
