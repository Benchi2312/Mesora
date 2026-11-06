-- Permite mostrar nombres de compañeros en cocina y en el traspaso de mesa.
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
