-- =============================================================================
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
