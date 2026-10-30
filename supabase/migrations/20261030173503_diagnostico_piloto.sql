-- Diagnóstico mínimo: únicamente categorías y rutas normalizadas, sin mensajes,
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
