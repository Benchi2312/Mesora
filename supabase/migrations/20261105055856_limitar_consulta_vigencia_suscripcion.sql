-- Limita la consulta directa del estado de suscripción al superadmin y a
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
