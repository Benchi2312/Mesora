-- Uso exclusivo en una base aislada descartable, nunca en producción.
insert into auth.users(id,email) values
  ('aa000000-0000-4000-8000-000000000002','idempotencia-concurrencia@mesora.invalid');
insert into public.restaurantes(id,nombre,suscripcion_activa) values
  ('aa000000-0000-4000-8000-000000000001','QA concurrencia',true);
insert into public.usuarios(id,restaurante_id,rol,nombre,activo) values
  ('aa000000-0000-4000-8000-000000000002','aa000000-0000-4000-8000-000000000001','admin_restaurante','QA',true);
insert into public.zonas(id,restaurante_id,nombre) values
  ('aa000000-0000-4000-8000-000000000003','aa000000-0000-4000-8000-000000000001','QA');
insert into public.mesas(id,restaurante_id,zona_id,nombre) values
  ('aa000000-0000-4000-8000-000000000004','aa000000-0000-4000-8000-000000000001','aa000000-0000-4000-8000-000000000003','Mesa QA');
insert into public.productos(id,restaurante_id,nombre,precio,disponible,es_bebida) values
  ('aa000000-0000-4000-8000-000000000005','aa000000-0000-4000-8000-000000000001','Plato QA',10,true,false);
