-- Mesora Fase 6. La cola y los verificadores viven fuera del esquema expuesto.
-- Ninguna clave service_role se entrega al agente. La API pública valida un
-- token aleatorio de 256 bits cuyo SHA-256 es el único valor persistido aquí.
begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.agentes_impresion (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes(id) on delete cascade,
  nombre text not null check (length(btrim(nombre)) between 2 and 80),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  estado text not null default 'activo' check (estado in ('activo','revocado')),
  impresoras_detectadas jsonb not null default '[]'::jsonb check (jsonb_typeof(impresoras_detectadas) = 'array'),
  creado_at timestamptz not null default now(),
  ultimo_heartbeat_at timestamptz,
  revocado_at timestamptz,
  constraint agentes_impresion_id_restaurante unique (id, restaurante_id)
);

create table if not exists private.codigos_agente_impresion (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes(id) on delete cascade,
  codigo_hash text not null unique check (codigo_hash ~ '^[0-9a-f]{64}$'),
  creado_por uuid not null references public.usuarios(id),
  creado_at timestamptz not null default now(),
  expira_at timestamptz not null,
  usado_at timestamptz,
  constraint codigos_agente_expira check (expira_at > creado_at and expira_at <= creado_at + interval '15 minutes')
);
create index if not exists codigos_agente_restaurante_idx
  on private.codigos_agente_impresion(restaurante_id, creado_at desc);

create table if not exists private.asignaciones_impresora (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes(id) on delete cascade,
  destino_id uuid not null,
  agente_id uuid not null,
  cola_windows text not null check (length(btrim(cola_windows)) between 1 and 160),
  activa boolean not null default true,
  max_intentos smallint not null default 3 check (max_intentos between 1 and 10),
  reintento_base_seg smallint not null default 15 check (reintento_base_seg between 5 and 300),
  creado_at timestamptz not null default now(),
  actualizado_at timestamptz not null default now(),
  constraint asignacion_destino_restaurante unique (restaurante_id, destino_id),
  constraint asignacion_id_restaurante unique (id, restaurante_id),
  constraint asignacion_destino_fk foreign key (destino_id, restaurante_id)
    references public.destinos_estacion(id, restaurante_id) on delete restrict,
  constraint asignacion_agente_fk foreign key (agente_id, restaurante_id)
    references private.agentes_impresion(id, restaurante_id) on delete restrict
);

create unique index if not exists entregas_comanda_id_restaurante_fase6
  on public.entregas_comanda(id, restaurante_id);

create table if not exists private.trabajos_impresion (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes(id) on delete cascade,
  tipo text not null default 'comanda' check (tipo in ('comanda','prueba')),
  entrega_id uuid,
  pedido_id uuid,
  destino_id uuid not null,
  agente_id uuid not null,
  estacion_codigo text not null check (estacion_codigo in ('cocina','bar')),
  cola_windows text not null check (length(btrim(cola_windows)) between 1 and 160),
  papel_mm smallint not null check (papel_mm in (58,80)),
  copias smallint not null check (copias between 1 and 5),
  configuracion_version integer not null check (configuracion_version >= 1),
  estado text not null default 'pendiente'
    check (estado in ('pendiente','reclamado','enviado','fallido','cancelado')),
  intentos smallint not null default 0 check (intentos >= 0),
  max_intentos smallint not null check (max_intentos between 1 and 10),
  reintento_base_seg smallint not null check (reintento_base_seg between 5 and 300),
  proximo_intento_at timestamptz,
  lease_hasta timestamptz,
  reclamo_id uuid,
  envio_iniciado_at timestamptz,
  enviado_at timestamptz,
  error_ultimo text,
  error_final text,
  creado_at timestamptz not null default now(),
  actualizado_at timestamptz not null default now(),
  constraint trabajo_entrega_unique unique (entrega_id),
  constraint trabajo_agente_fk foreign key (agente_id, restaurante_id)
    references private.agentes_impresion(id, restaurante_id) on delete restrict,
  constraint trabajo_destino_fk foreign key (destino_id, restaurante_id)
    references public.destinos_estacion(id, restaurante_id) on delete restrict,
  constraint trabajo_entrega_fk foreign key (entrega_id, restaurante_id)
    references public.entregas_comanda(id, restaurante_id) on delete restrict,
  constraint trabajo_pedido_fk foreign key (pedido_id, restaurante_id)
    references public.pedidos(id, restaurante_id) on delete restrict,
  constraint trabajo_tipo_check check (
    (tipo = 'prueba' and entrega_id is null and pedido_id is null)
    or (tipo = 'comanda' and entrega_id is not null and pedido_id is not null)
  )
);
create index if not exists trabajos_impresion_reclamo_idx
  on private.trabajos_impresion(agente_id, estado, proximo_intento_at, creado_at)
  where estado in ('pendiente','fallido','reclamado');

alter table private.agentes_impresion enable row level security;
alter table private.codigos_agente_impresion enable row level security;
alter table private.asignaciones_impresora enable row level security;
alter table private.trabajos_impresion enable row level security;
revoke all on table private.agentes_impresion, private.codigos_agente_impresion,
  private.asignaciones_impresora, private.trabajos_impresion from public, anon, authenticated;

-- No se conceden políticas directas: toda lectura o escritura pasa por RPC
-- con comprobación de rol, restaurante y/o verificador de token.
create or replace function private.validar_admin_impresion(p_restaurante_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := auth.uid();
begin
  if v_actor is null or not exists (
    select 1 from public.usuarios u where u.id = v_actor
      and u.restaurante_id = p_restaurante_id and u.rol::text = 'admin_restaurante'
      and coalesce(u.activo, true)
  ) then raise exception 'Solo el administrador del restaurante puede gestionar agentes de impresión.' using errcode='42501'; end if;
  return v_actor;
end; $$;

-- El código existe solo diez minutos; el agente crea su token y la base conserva
-- únicamente el hash. FOR UPDATE hace imposible consumirlo dos veces.
create or replace function public.agente_impresion_vincular(p_codigo text,p_token text,p_nombre text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_codigo private.codigos_agente_impresion%rowtype; v_agente_id uuid;
begin
  if coalesce(p_codigo,'') !~ '^[0-9a-f]{32}$' or coalesce(p_token,'') !~ '^[0-9a-f]{64}$'
    or length(btrim(coalesce(p_nombre,''))) not between 2 and 80 then
    raise exception 'Código, token o nombre inválido.' using errcode='22023'; end if;
  select c.* into v_codigo from private.codigos_agente_impresion c
    where c.codigo_hash=encode(extensions.digest(p_codigo,'sha256'),'hex') for update;
  if not found or v_codigo.usado_at is not null or v_codigo.expira_at <= now() then
    raise exception 'El código venció o ya fue utilizado. Solicita uno nuevo.' using errcode='42501'; end if;
  insert into private.agentes_impresion(restaurante_id,nombre,token_hash)
    values(v_codigo.restaurante_id,btrim(p_nombre),encode(extensions.digest(p_token,'sha256'),'hex'))
    returning id into v_agente_id;
  update private.codigos_agente_impresion set usado_at=now() where id=v_codigo.id;
  insert into public.audit_logs(actor_id,actor_rol,restaurante_id,entidad,entidad_id,accion,descripcion,detalle)
    values(v_codigo.creado_por,'admin_restaurante',v_codigo.restaurante_id,'agente_impresion',v_agente_id,
      'agente_impresion_vincular','Agente local de impresión vinculado.',jsonb_build_object('agente_id',v_agente_id));
  return jsonb_build_object('agente_id',v_agente_id,'restaurante_id',v_codigo.restaurante_id);
end; $$;

create or replace function private.agente_impresion_activo(p_token text)
returns private.agentes_impresion language plpgsql security definer set search_path = '' as $$
declare v_agente private.agentes_impresion%rowtype;
begin
  if coalesce(p_token,'') !~ '^[0-9a-f]{64}$' then
    raise exception 'Agente no autorizado.' using errcode='42501'; end if;
  select a.* into v_agente from private.agentes_impresion a
    where a.token_hash=encode(extensions.digest(p_token,'sha256'),'hex') and a.estado='activo';
  if not found then raise exception 'Agente no autorizado o revocado.' using errcode='42501'; end if;
  return v_agente;
end; $$;
revoke all on function private.agente_impresion_activo(text) from public, anon, authenticated;

create or replace function public.agente_impresion_heartbeat(p_token text,p_impresoras jsonb default '[]'::jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_agente private.agentes_impresion%rowtype;
begin
  v_agente := private.agente_impresion_activo(p_token);
  if jsonb_typeof(p_impresoras) <> 'array' or jsonb_array_length(p_impresoras)>40
    or length(p_impresoras::text)>8000 or exists(
      select 1 from jsonb_array_elements(p_impresoras) x
        where jsonb_typeof(x) <> 'string' or length(trim(both '"' from x::text)) > 160
    ) then raise exception 'Lista de impresoras inválida.' using errcode='22023'; end if;
  update private.agentes_impresion set ultimo_heartbeat_at=now(),
    impresoras_detectadas=p_impresoras
    where id=v_agente.id and restaurante_id=v_agente.restaurante_id
      and (ultimo_heartbeat_at is null or ultimo_heartbeat_at <= now()-interval '15 seconds');
  return jsonb_build_object('agente_id',v_agente.id,'restaurante_id',v_agente.restaurante_id,
    'actualizado',found,'espera_segundos',case when found then 30 else 15 end);
end; $$;

-- Creación idempotente al insertar la entrega histórica. Las asignaciones
-- posteriores no imprimen pedidos antiguos por sorpresa.
create or replace function private.encolar_entrega_impresora()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_asig private.asignaciones_impresora%rowtype;
begin
  if new.tipo_destino <> 'impresora' or new.grupo <> 'principal'
    or new.estacion_codigo not in ('cocina','bar') then return new; end if;
  select x.* into v_asig from private.asignaciones_impresora x
    join private.agentes_impresion a on a.id=x.agente_id and a.restaurante_id=x.restaurante_id
    where x.restaurante_id=new.restaurante_id and x.destino_id=new.destino_estacion_id
      and x.activa and a.estado='activo';
  if not found then return new; end if;
  insert into private.trabajos_impresion(restaurante_id,tipo,entrega_id,pedido_id,destino_id,
    agente_id,estacion_codigo,cola_windows,papel_mm,copias,configuracion_version,
    max_intentos,reintento_base_seg)
    values(new.restaurante_id,'comanda',new.id,new.pedido_id,new.destino_estacion_id,
      v_asig.agente_id,new.estacion_codigo,v_asig.cola_windows,
      coalesce((new.configuracion_destino->>'papel_mm')::smallint,80),
      least(5,greatest(1,coalesce((new.configuracion_destino->>'copias')::smallint,1))),
      new.configuracion_version,v_asig.max_intentos,v_asig.reintento_base_seg)
    on conflict (entrega_id) do nothing;
  return new;
end; $$;
revoke all on function private.encolar_entrega_impresora() from public, anon, authenticated;
drop trigger if exists entregas_comanda_encolar_agente on public.entregas_comanda;
create trigger entregas_comanda_encolar_agente after insert on public.entregas_comanda
  for each row execute function private.encolar_entrega_impresora();

-- La solicitud manual cancela un trabajo aún no reclamado. Si el agente ya lo
-- reclamó, se informa al operador y no se generan dos impresiones simultáneas.
create or replace function private.sincronizar_entrega_impresora()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_estado text; v_lease timestamptz; v_envio timestamptz;
begin
  if new.estado='cancelada' and old.estado <> 'cancelada' then
    update private.trabajos_impresion set estado='cancelado',lease_hasta=null,
      error_final=coalesce(error_final,'La entrega fue cancelada.'),actualizado_at=now()
      where entrega_id=new.id and estado in ('pendiente','fallido','reclamado');
  elsif new.solicitud_impresion_id is not null
    and new.solicitud_impresion_id is distinct from old.solicitud_impresion_id then
    select estado,lease_hasta,envio_iniciado_at into v_estado,v_lease,v_envio from private.trabajos_impresion
      where entrega_id=new.id for update;
    if v_estado='reclamado' and (v_lease >= now() or v_envio is not null) then
      raise exception 'El agente está procesando esta comanda. Actualiza la cola antes de imprimir manualmente.' using errcode='40001'; end if;
    if v_estado in ('pendiente','fallido','reclamado') then
      update private.trabajos_impresion set estado='cancelado',lease_hasta=null,
        error_final=coalesce(error_final,'Salida manual solicitada.'),actualizado_at=now()
        where entrega_id=new.id and (estado='pendiente' or proximo_intento_at is not null
          or (estado='reclamado' and lease_hasta<now() and envio_iniciado_at is null));
    end if;
  end if;
  return new;
end; $$;
revoke all on function private.sincronizar_entrega_impresora() from public, anon, authenticated;
drop trigger if exists entregas_comanda_sincronizar_agente on public.entregas_comanda;
create trigger entregas_comanda_sincronizar_agente before update of estado,solicitud_impresion_id
  on public.entregas_comanda for each row execute function private.sincronizar_entrega_impresora();
revoke all on function private.validar_admin_impresion(uuid) from public, anon, authenticated;

create or replace function public.admin_impresion_crear_codigo(p_restaurante_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid; v_codigo text; v_expira timestamptz := now() + interval '10 minutes';
begin
  v_actor := private.validar_admin_impresion(p_restaurante_id);
  if exists (select 1 from private.codigos_agente_impresion c
      where c.creado_por = v_actor and c.creado_at > now() - interval '60 seconds')
    or (select count(*) from private.codigos_agente_impresion c
      where c.creado_por = v_actor and c.creado_at > now() - interval '1 hour') >= 5 then
    raise exception 'Espera antes de crear otro código de vinculación.' using errcode='22023';
  end if;
  v_codigo := encode(extensions.gen_random_bytes(16), 'hex');
  insert into private.codigos_agente_impresion(restaurante_id,codigo_hash,creado_por,expira_at)
    values(p_restaurante_id,encode(extensions.digest(v_codigo,'sha256'),'hex'),v_actor,v_expira);
  return jsonb_build_object('codigo',v_codigo,'expira_at',v_expira);
end; $$;

create or replace function public.admin_impresion_panel(p_restaurante_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform private.validar_admin_impresion(p_restaurante_id);
  return jsonb_build_object(
    'agentes', coalesce((select jsonb_agg(jsonb_build_object(
      'id',a.id,'nombre',a.nombre,'estado',a.estado,
      'ultimo_heartbeat_at',a.ultimo_heartbeat_at,
      'impresoras_detectadas',a.impresoras_detectadas,
      'conectado',a.estado='activo' and a.ultimo_heartbeat_at > now()-interval '90 seconds'
    ) order by a.creado_at desc) from private.agentes_impresion a
      where a.restaurante_id=p_restaurante_id),'[]'::jsonb),
    'asignaciones', coalesce((select jsonb_agg(jsonb_build_object(
      'destino_id',x.destino_id,'agente_id',x.agente_id,'cola_windows',x.cola_windows,
      'activa',x.activa,'max_intentos',x.max_intentos,'reintento_base_seg',x.reintento_base_seg
    )) from private.asignaciones_impresora x
      where x.restaurante_id=p_restaurante_id),'[]'::jsonb),
    'trabajos', coalesce((select jsonb_agg(jsonb_build_object(
      'id',t.id,'tipo',t.tipo,'estacion',t.estacion_codigo,'estado',t.estado,
      'cola_windows',t.cola_windows,'intentos',t.intentos,'max_intentos',t.max_intentos,
      'creado_at',t.creado_at,'enviado_at',t.enviado_at,'error_final',t.error_final
    ) order by t.creado_at desc) from (select * from private.trabajos_impresion
      where restaurante_id=p_restaurante_id order by creado_at desc limit 30) t),'[]'::jsonb),
    'respaldo_automatico_disponible', false
  );
end; $$;

create or replace function public.admin_impresion_revocar(p_restaurante_id uuid,p_agente_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_actor uuid;
begin
  v_actor := private.validar_admin_impresion(p_restaurante_id);
  update private.agentes_impresion set estado='revocado',revocado_at=now()
    where id=p_agente_id and restaurante_id=p_restaurante_id and estado='activo';
  if not found then raise exception 'El agente no existe o ya fue revocado.'; end if;
  update private.asignaciones_impresora set activa=false,actualizado_at=now()
    where agente_id=p_agente_id and restaurante_id=p_restaurante_id;
  update private.trabajos_impresion set estado='cancelado',lease_hasta=null,
    error_final=coalesce(error_final,'Agente revocado; usa la salida manual.'),actualizado_at=now()
    where agente_id=p_agente_id and restaurante_id=p_restaurante_id
      and (estado in ('pendiente','reclamado')
        or (estado='fallido' and proximo_intento_at is not null));
  insert into public.audit_logs(actor_id,actor_rol,restaurante_id,entidad,entidad_id,accion,descripcion,detalle)
    values(v_actor,'admin_restaurante',p_restaurante_id,'agente_impresion',p_agente_id,
      'agente_impresion_revocar','Agente de impresión revocado.',jsonb_build_object('agente_id',p_agente_id));
end; $$;

create or replace function public.admin_impresion_asignar(
  p_restaurante_id uuid,p_destino_id uuid,p_agente_id uuid,p_cola_windows text,
  p_activa boolean default true,p_max_intentos integer default 3,p_reintento_base_seg integer default 15
) returns void language plpgsql security definer set search_path = '' as $$
declare v_actor uuid; v_estacion text; v_grupo text; v_cola text := btrim(coalesce(p_cola_windows,''));
begin
  v_actor := private.validar_admin_impresion(p_restaurante_id);
  select e.codigo,d.grupo into v_estacion,v_grupo from public.destinos_estacion d
    join public.estaciones_restaurante e on e.id=d.estacion_id and e.restaurante_id=d.restaurante_id
    where d.id=p_destino_id and d.restaurante_id=p_restaurante_id and d.tipo='impresora';
  if v_estacion not in ('cocina','bar') or v_estacion is null then
    raise exception 'Solo se pueden asignar impresoras de Cocina o Barra.' using errcode='22023'; end if;
  if v_grupo='respaldo' and p_activa then
    raise exception 'La impresión automática de respaldo aún no está habilitada.' using errcode='22023'; end if;
  if not exists(select 1 from private.agentes_impresion a
      where a.id=p_agente_id and a.restaurante_id=p_restaurante_id and a.estado='activo') then
    raise exception 'El agente no está activo en este restaurante.' using errcode='42501'; end if;
  if length(v_cola) not between 1 and 160 or p_max_intentos not between 1 and 10
    or p_reintento_base_seg not between 5 and 300 then
    raise exception 'Revisa el nombre de impresora y los límites de reintento.' using errcode='22023'; end if;
  insert into private.asignaciones_impresora(restaurante_id,destino_id,agente_id,cola_windows,activa,max_intentos,reintento_base_seg)
    values(p_restaurante_id,p_destino_id,p_agente_id,v_cola,p_activa,p_max_intentos,p_reintento_base_seg)
    on conflict (restaurante_id,destino_id) do update set agente_id=excluded.agente_id,
      cola_windows=excluded.cola_windows,activa=excluded.activa,max_intentos=excluded.max_intentos,
      reintento_base_seg=excluded.reintento_base_seg,actualizado_at=now();
  insert into public.audit_logs(actor_id,actor_rol,restaurante_id,entidad,entidad_id,accion,descripcion,detalle)
    values(v_actor,'admin_restaurante',p_restaurante_id,'destino_impresion',p_destino_id,
      'impresora_agente_asignar','Impresora Windows asignada a destino.',
      jsonb_build_object('agente_id',p_agente_id,'destino_id',p_destino_id,'estacion',v_estacion,
        'cola_windows',v_cola,'activa',p_activa));
end; $$;

create or replace function public.admin_impresion_prueba(p_restaurante_id uuid,p_destino_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor uuid; v_asig private.asignaciones_impresora%rowtype; v_destino public.destinos_estacion%rowtype;
  v_estacion text; v_id uuid;
begin
  v_actor := private.validar_admin_impresion(p_restaurante_id);
  select x.* into v_asig from private.asignaciones_impresora x
    join private.agentes_impresion a on a.id=x.agente_id and a.restaurante_id=x.restaurante_id
    where x.restaurante_id=p_restaurante_id and x.destino_id=p_destino_id
      and x.activa and a.estado='activo';
  if not found then raise exception 'Asigna un agente activo a esta impresora antes de probar.'; end if;
  select d.* into v_destino from public.destinos_estacion d
    join public.estaciones_restaurante e on e.id=d.estacion_id and e.restaurante_id=d.restaurante_id
    where d.id=p_destino_id and d.restaurante_id=p_restaurante_id and d.tipo='impresora' and d.grupo='principal'
      and e.codigo in ('cocina','bar');
  select e.codigo into v_estacion from public.estaciones_restaurante e
    where e.id=v_destino.estacion_id and e.restaurante_id=p_restaurante_id;
  if not found or v_estacion not in ('cocina','bar') then raise exception 'La prueba requiere una impresora principal de Cocina o Barra.'; end if;
  insert into private.trabajos_impresion(restaurante_id,tipo,destino_id,agente_id,estacion_codigo,
    cola_windows,papel_mm,copias,configuracion_version,max_intentos,reintento_base_seg)
    values(p_restaurante_id,'prueba',p_destino_id,v_asig.agente_id,v_estacion,v_asig.cola_windows,
      v_destino.papel_mm,least(5,greatest(1,coalesce((v_destino.configuracion->>'copias')::integer,1))),
      (select version from public.configuracion_operativa where restaurante_id=p_restaurante_id),
      v_asig.max_intentos,v_asig.reintento_base_seg) returning id into v_id;
  insert into public.audit_logs(actor_id,actor_rol,restaurante_id,entidad,entidad_id,accion,descripcion,detalle)
    values(v_actor,'admin_restaurante',p_restaurante_id,'trabajo_impresion',v_id,
      'impresion_prueba_solicitar','Prueba de impresión solicitada por el administrador.',
      jsonb_build_object('destino_id',p_destino_id,'estacion',v_estacion,'cola_windows',v_asig.cola_windows));
  return v_id;
end; $$;

-- Cada reclamo bloquea una sola fila. Un lease vencido se recupera solamente
-- si el agente aún no inició el envío al spooler de Windows.
create or replace function public.agente_impresion_reclamar(p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_agente private.agentes_impresion%rowtype; v_job private.trabajos_impresion%rowtype;
  v_reclamo uuid := gen_random_uuid(); v_restaurante text; v_mesa text; v_mesero text;
  v_items jsonb;
begin
  v_agente := private.agente_impresion_activo(p_token);
  update private.trabajos_impresion set estado='fallido',proximo_intento_at=null,
    error_final='Resultado incierto: el agente inició el envío y perdió la conexión. Revisar antes de reimprimir.',
    actualizado_at=now()
    where agente_id=v_agente.id and estado='reclamado' and lease_hasta<now()
      and envio_iniciado_at is not null;
  update private.trabajos_impresion set estado='fallido',proximo_intento_at=null,
    error_final='Se agotaron los intentos antes de enviar a la impresora.',actualizado_at=now()
    where agente_id=v_agente.id and estado='reclamado' and lease_hasta<now()
      and envio_iniciado_at is null and intentos>=max_intentos;

  select j.* into v_job from private.trabajos_impresion j
    where j.agente_id=v_agente.id and j.restaurante_id=v_agente.restaurante_id
      and j.intentos < j.max_intentos
      and (j.estado='pendiente'
        or (j.estado='fallido' and j.proximo_intento_at is not null and j.proximo_intento_at<=now())
        or (j.estado='reclamado' and j.envio_iniciado_at is null and j.lease_hasta<now()))
      and (j.tipo='prueba' or exists(
        select 1 from public.entregas_comanda d where d.id=j.entrega_id
          and d.restaurante_id=j.restaurante_id and d.estado in ('pendiente','fallida')
      ))
    order by j.creado_at,j.id limit 1 for update of j skip locked;
  if not found then return null; end if;
  update private.trabajos_impresion set estado='reclamado',intentos=intentos+1,
    reclamo_id=v_reclamo,lease_hasta=now()+interval '90 seconds',envio_iniciado_at=null,
    proximo_intento_at=null,actualizado_at=now() where id=v_job.id;
  select r.nombre into v_restaurante from public.restaurantes r where r.id=v_job.restaurante_id;
  if v_job.tipo='comanda' then
    select m.nombre,u.nombre into v_mesa,v_mesero from public.pedidos p
      join public.mesas m on m.id=p.mesa_id and m.restaurante_id=p.restaurante_id
      left join public.usuarios u on u.id=p.mesero_id
      where p.id=v_job.pedido_id and p.restaurante_id=v_job.restaurante_id;
    select coalesce(jsonb_agg(jsonb_build_object('nombre',pi.nombre_producto,
      'cantidad',pi.cantidad,'nota',pi.nota) order by pi.created_at,pi.id),'[]'::jsonb)
      into v_items from public.pedido_items pi
      where pi.pedido_id=v_job.pedido_id and pi.estacion=v_job.estacion_codigo and pi.anulado is not true;
    if v_items='[]'::jsonb then
      update private.trabajos_impresion set estado='cancelado',error_final='Sin productos vigentes.',
        lease_hasta=null,actualizado_at=now() where id=v_job.id;
      return null;
    end if;
  else
    v_mesa := 'PRUEBA'; v_mesero := 'Administrador';
    v_items := jsonb_build_array(jsonb_build_object('nombre','Prueba de impresión Mesora',
      'cantidad',1,'nota','Verifica el papel y el corte.'));
  end if;
  return jsonb_build_object('id',v_job.id,'reclamo_id',v_reclamo,'tipo',v_job.tipo,
    'restaurante',v_restaurante,'restaurante_id',v_job.restaurante_id,
    'pedido_id',v_job.pedido_id,'mesa',v_mesa,'mesero',v_mesero,
    'estacion',v_job.estacion_codigo,'cola_windows',v_job.cola_windows,
    'papel_mm',v_job.papel_mm,'copias',v_job.copias,
    'configuracion_version',v_job.configuracion_version,
    'numero_intento',v_job.intentos+1,'creado_at',v_job.creado_at,'items',v_items);
end; $$;

create or replace function public.agente_impresion_iniciar_envio(p_token text,p_trabajo_id uuid,p_reclamo_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_agente private.agentes_impresion%rowtype; v_job private.trabajos_impresion%rowtype;
begin
  v_agente := private.agente_impresion_activo(p_token);
  select j.* into v_job from private.trabajos_impresion j
    where j.id=p_trabajo_id and j.agente_id=v_agente.id and j.restaurante_id=v_agente.restaurante_id for update;
  if not found or v_job.estado<>'reclamado' or v_job.reclamo_id is distinct from p_reclamo_id
    or v_job.lease_hasta<=now() then raise exception 'El reclamo expiró o pertenece a otro agente.' using errcode='42501'; end if;
  if v_job.tipo='comanda' and not exists(select 1 from public.entregas_comanda d
    where d.id=v_job.entrega_id and d.restaurante_id=v_job.restaurante_id
      and d.estado in ('pendiente','fallida')) then
    raise exception 'La comanda ya no requiere impresión automática.' using errcode='22023'; end if;
  update private.trabajos_impresion set envio_iniciado_at=coalesce(envio_iniciado_at,now()),
    lease_hasta=now()+interval '5 minutes',actualizado_at=now() where id=v_job.id;
end; $$;

create or replace function public.agente_impresion_confirmar(p_token text,p_trabajo_id uuid,p_reclamo_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_agente private.agentes_impresion%rowtype; v_job private.trabajos_impresion%rowtype;
  v_restaurante text; v_mesa text;
begin
  v_agente := private.agente_impresion_activo(p_token);
  select j.* into v_job from private.trabajos_impresion j
    where j.id=p_trabajo_id and j.agente_id=v_agente.id and j.restaurante_id=v_agente.restaurante_id for update;
  if not found or v_job.reclamo_id is distinct from p_reclamo_id then
    raise exception 'El reclamo pertenece a otro agente.' using errcode='42501'; end if;
  if v_job.estado='enviado' then return jsonb_build_object('estado','enviado','idempotente',true); end if;
  if v_job.estado not in ('reclamado','fallido') or v_job.envio_iniciado_at is null then
    raise exception 'El trabajo no inició un envío válido.' using errcode='22023'; end if;
  if v_job.estado='fallido' and v_job.proximo_intento_at is not null then
    raise exception 'Este reclamo ya terminó y está programado para reintento.' using errcode='22023'; end if;
  if v_job.tipo='comanda' then
    update public.entregas_comanda set estado='enviada',updated_at=now()
      where id=v_job.entrega_id and restaurante_id=v_job.restaurante_id
        and estado in ('pendiente','fallida') and solicitud_impresion_id is null;
    if not found then raise exception 'La salida fue cancelada o se imprimió manualmente.' using errcode='40001'; end if;
  end if;
  update private.trabajos_impresion set estado='enviado',enviado_at=now(),lease_hasta=null,
    proximo_intento_at=null,error_final=null,actualizado_at=now() where id=v_job.id;
  select nombre into v_restaurante from public.restaurantes where id=v_job.restaurante_id;
  if v_job.pedido_id is not null then
    select m.nombre into v_mesa from public.mesas m join public.pedidos p
      on p.mesa_id=m.id and p.restaurante_id=m.restaurante_id where p.id=v_job.pedido_id;
  end if;
  insert into public.audit_logs(actor_id,actor_rol,actor_nombre,restaurante_id,restaurante_nombre,
    entidad,entidad_id,accion,descripcion,detalle)
    values(null,'agente_impresion',v_agente.nombre,v_job.restaurante_id,v_restaurante,
      case when v_job.tipo='prueba' then 'trabajo_impresion' else 'pedido' end,
      coalesce(v_job.pedido_id,v_job.id),'comanda_imprimir',
      case when v_job.tipo='prueba' then 'Prueba enviada a cola Windows.'
        else 'Comanda enviada a cola Windows en '||initcap(v_job.estacion_codigo)||'.' end,
      jsonb_build_object('solicitud_id',v_job.id,'entrega_id',v_job.entrega_id,
        'agente_id',v_agente.id,'impresora',v_job.cola_windows,'estacion',v_job.estacion_codigo,
        'pedido_id',v_job.pedido_id,'mesa_nombre',v_mesa,'intento',v_job.intentos,
        'enviado_at',now(),'resultado','enviado_a_cola',
        'impresion_fisica_confirmada',false));
  return jsonb_build_object('estado','enviado','impresion_fisica_confirmada',false);
end; $$;

create or replace function public.agente_impresion_fallar(
  p_token text,p_trabajo_id uuid,p_reclamo_id uuid,p_error text,p_reintento_seguro boolean
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_agente private.agentes_impresion%rowtype; v_job private.trabajos_impresion%rowtype;
  v_seguro boolean; v_siguiente timestamptz; v_error text;
begin
  v_agente := private.agente_impresion_activo(p_token);
  select j.* into v_job from private.trabajos_impresion j
    where j.id=p_trabajo_id and j.agente_id=v_agente.id and j.restaurante_id=v_agente.restaurante_id for update;
  if not found or v_job.estado<>'reclamado' or v_job.reclamo_id is distinct from p_reclamo_id then
    raise exception 'El reclamo ya terminó o pertenece a otro agente.' using errcode='42501'; end if;
  v_seguro := coalesce(p_reintento_seguro,false) and v_job.envio_iniciado_at is null
    and v_job.intentos < v_job.max_intentos;
  v_error := left(coalesce(nullif(btrim(p_error),''),'No se pudo enviar a la cola Windows.'),300);
  if v_seguro then
    v_siguiente := now()+make_interval(secs => least(3600,
      (v_job.reintento_base_seg * power(2,greatest(0,v_job.intentos-1)))::integer));
  end if;
  update private.trabajos_impresion set estado='fallido',lease_hasta=null,
    proximo_intento_at=v_siguiente,error_ultimo=v_error,
    error_final=case when v_siguiente is null then
      case when v_job.envio_iniciado_at is not null then
        'Resultado incierto después de iniciar el envío. '||v_error else v_error end
      else null end,actualizado_at=now() where id=v_job.id;
  if v_job.tipo='comanda' then
    update public.entregas_comanda set estado='fallida',error_publico=v_error,updated_at=now()
      where id=v_job.entrega_id and restaurante_id=v_job.restaurante_id and estado='pendiente';
  end if;
  return jsonb_build_object('estado','fallido','reintento_at',v_siguiente,
    'requiere_revision',v_siguiente is null);
end; $$;

revoke all on function public.admin_impresion_crear_codigo(uuid) from public, anon;
revoke all on function public.admin_impresion_panel(uuid) from public, anon;
revoke all on function public.admin_impresion_revocar(uuid,uuid) from public, anon;
revoke all on function public.admin_impresion_asignar(uuid,uuid,uuid,text,boolean,integer,integer) from public, anon;
revoke all on function public.admin_impresion_prueba(uuid,uuid) from public, anon;
grant execute on function public.admin_impresion_crear_codigo(uuid),public.admin_impresion_panel(uuid),
  public.admin_impresion_revocar(uuid,uuid),
  public.admin_impresion_asignar(uuid,uuid,uuid,text,boolean,integer,integer),
  public.admin_impresion_prueba(uuid,uuid) to authenticated;

revoke all on function public.agente_impresion_vincular(text,text,text),
  public.agente_impresion_heartbeat(text,jsonb),public.agente_impresion_reclamar(text),
  public.agente_impresion_iniciar_envio(text,uuid,uuid),
  public.agente_impresion_confirmar(text,uuid,uuid),
  public.agente_impresion_fallar(text,uuid,uuid,text,boolean) from public, authenticated;
grant execute on function public.agente_impresion_vincular(text,text,text),
  public.agente_impresion_heartbeat(text,jsonb),public.agente_impresion_reclamar(text),
  public.agente_impresion_iniciar_envio(text,uuid,uuid),
  public.agente_impresion_confirmar(text,uuid,uuid),
  public.agente_impresion_fallar(text,uuid,uuid,text,boolean) to anon;

commit;
