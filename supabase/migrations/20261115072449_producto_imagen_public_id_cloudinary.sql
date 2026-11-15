begin;

-- Conserva imagen_url como URL de entrega y guarda el public_id solo para
-- recursos Cloudinary nuevos. La columna nullable mantiene intactos productos
-- históricos y los enlaces externos.
alter table public.productos
  add column if not exists imagen_public_id text;

comment on column public.productos.imagen_public_id is
  'Public ID de Cloudinary de la imagen del producto; NULL para enlaces externos e imágenes históricas.';

commit;
