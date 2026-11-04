begin;

-- PGlite simula Auth con hashes ficticios. La RPC ve el estado de auth.users
-- como lo hace en Supabase; no se usan contrasenas ni usuarios reales.
do $$
declare
  v_owner text := current_user;
  v_restaurante uuid := gen_random_uuid();
  v_trabajador uuid := gen_random_uuid();
  v_denegado boolean;
begin
  insert into auth.users(id, email, encrypted_password)
    values (v_trabajador, 'qa-temporal@mesora.example', 'hash_temporal_1');
  insert into public.restaurantes(id, nombre)
    values (v_restaurante, 'QA temporal');
  insert into public.usuarios(id, restaurante_id, rol, nombre, debe_cambiar_password)
    values (v_trabajador, v_restaurante, 'mesero', 'Trabajador QA', true);

  if not exists (select 1 from private.password_temporal_huellas where usuario_id = v_trabajador)
     or has_schema_privilege('authenticated', 'private', 'usage')
     or has_table_privilege('authenticated', 'private.password_temporal_huellas', 'select') then
    raise exception 'La huella temporal falta o es accesible al cliente';
  end if;

  perform set_config('request.jwt.claim.sub', v_trabajador::text, true);
  execute 'set local role authenticated';
  v_denegado := false;
  begin
    perform public.confirmar_cambio_password();
  exception when others then
    if position('Primero cambia tu contrasena' in sqlerrm) = 0 then raise; end if;
    v_denegado := true;
  end;
  if not v_denegado then raise exception 'La RPC confirmo sin cambiar la clave de Auth'; end if;
  begin
    update public.usuarios set debe_cambiar_password = false where id = v_trabajador;
    raise exception 'El cliente pudo cambiar directamente el flag temporal';
  exception when insufficient_privilege then null;
  end;
  execute format('set local role %I', v_owner);

  -- Un cambio de email, un login o actualizar la misma huella no sirven.
  update auth.users set email = 'qa-nuevo@mesora.example',
                        last_sign_in_at = now(),
                        encrypted_password = 'hash_temporal_1'
    where id = v_trabajador;
  execute 'set local role authenticated';
  v_denegado := false;
  begin
    perform public.confirmar_cambio_password();
  exception when others then
    if position('Primero cambia tu contrasena' in sqlerrm) = 0 then raise; end if;
    v_denegado := true;
  end;
  if not v_denegado then raise exception 'Un cambio no-password permitio confirmar'; end if;
  execute format('set local role %I', v_owner);

  -- Auth cambia realmente su hash: la misma RPC ahora puede confirmar.
  update auth.users set encrypted_password = 'hash_personal_1' where id = v_trabajador;
  execute 'set local role authenticated';
  perform public.confirmar_cambio_password();
  if (select debe_cambiar_password from public.usuarios where id = v_trabajador) then
    raise exception 'El cambio real no quito la obligacion';
  end if;
  execute format('set local role %I', v_owner);
  if exists (select 1 from private.password_temporal_huellas where usuario_id = v_trabajador) then
    raise exception 'La huella temporal persistio despues de confirmar';
  end if;

  -- El reset administrativo se prepara antes de cambiar Auth. Aunque Auth ya
  -- tenga la clave temporal nueva, el empleado no puede confirmar mientras
  -- quede el marcador transitorio.
  perform public.mesora_preparar_reset_password_personal(v_trabajador);
  if not (select reset_en_curso from private.password_temporal_huellas where usuario_id = v_trabajador) then
    raise exception 'El reset no quedo marcado en curso';
  end if;
  update auth.users set encrypted_password = 'hash_temporal_2' where id = v_trabajador;
  execute 'set local role authenticated';
  v_denegado := false;
  begin
    perform public.confirmar_cambio_password();
  exception when others then
    if position('sigue en curso' in sqlerrm) = 0 then raise; end if;
    v_denegado := true;
  end;
  if not v_denegado then raise exception 'Se confirmo durante el reset administrativo'; end if;
  execute format('set local role %I', v_owner);
  perform public.mesora_finalizar_reset_password_personal(v_trabajador);
  if (select reset_en_curso from private.password_temporal_huellas where usuario_id = v_trabajador) then
    raise exception 'El reset no se finalizo';
  end if;
  execute 'set local role authenticated';
  v_denegado := false;
  begin
    perform public.confirmar_cambio_password();
  exception when others then
    if position('Primero cambia tu contrasena' in sqlerrm) = 0 then raise; end if;
    v_denegado := true;
  end;
  if not v_denegado then raise exception 'La clave temporal nueva permitio confirmar'; end if;
  execute format('set local role %I', v_owner);

  update auth.users set encrypted_password = 'hash_personal_2' where id = v_trabajador;
  execute 'set local role authenticated';
  perform public.confirmar_cambio_password();
  if (select debe_cambiar_password from public.usuarios where id = v_trabajador) then
    raise exception 'El segundo cambio real no se confirmo';
  end if;
  execute format('set local role %I', v_owner);
end;
$$;

rollback;
select 'Contrasena temporal: rechazo sin cambio de Auth, exito tras cambio y segundo reset: OK' as resultado;
