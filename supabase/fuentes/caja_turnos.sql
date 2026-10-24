-- Mesora · Caja por turnos: tabla `caja_turnos` + RPC de apertura y cierre.
--
-- Modelo: un restaurante tiene como máximo UN turno abierto (índice único
-- parcial). Al abrir se declara el efectivo inicial; al cerrar se declara el
-- efectivo contado y la función CALCULA el esperado y la diferencia, congelando
-- los tres números.
--
-- Por qué se congela y no se recalcula al vuelo: si mañana se corrige una
-- cuenta vieja, el arqueo de ayer tiene que seguir diciendo lo que se contó
-- ayer. Un dashboard que recalcula el pasado miente.
--
-- Por qué el esperado se calcula en SQL y no en el navegador: el dinero que
-- "debería" haber en la gaveta es un dato de caja, no de interfaz. Si lo
-- calculara el front, dos dispositivos podrían mostrar arqueos distintos.
--
-- REQUISITOS: este script no es standalone. Corre después del schema base
-- (restaurantes, usuarios, cuentas) y asume que:
--   * cuentas.metodo_pago usa la misma whitelist que src/types/database.ts
--   * cuentas.estado = 'pagada' y cuentas.pagado_at existe; las cuentas
--     anuladas se fechan por cuentas.anulada_at (ver rpc_anular_cuenta.sql,
--     que debe estar aplicada antes que este archivo si se anulan cobros)
--   * usuarios.auth.uid() = usuarios.id (ver más abajo: si tu tabla usuarios
--     guarda el id de Auth en otra columna, adapta el p_usuario_id).
--   * 00_seguridad_rpcs.sql ya está aplicada (abrir_turno_caja y
--     cerrar_turno_caja llaman a validar_acceso_restaurante).

-- ---------------------------------------------------------------------------
-- 1. Tabla
-- ---------------------------------------------------------------------------
create table if not exists public.caja_turnos (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes (id) on delete cascade,
  usuario_apertura_id uuid not null references public.usuarios (id),
  monto_inicial numeric(12, 2) not null check (monto_inicial >= 0),
  estado text not null default 'abierto' check (estado in ('abierto', 'cerrado')),
  fecha_apertura timestamptz not null default now(),
  fecha_cierre timestamptz,
  usuario_cierre_id uuid references public.usuarios (id),
  monto_declarado numeric(12, 2) check (monto_declarado >= 0),
  monto_esperado numeric(12, 2),
  diferencia numeric(12, 2),
  observaciones text,
  created_at timestamptz not null default now(),

  -- Un cierre tiene TODOS los datos del arqueo; un turno abierto no tiene ninguno.
  constraint caja_turno_cierre_completo check (
    (estado = 'abierto' and fecha_cierre is null
      and usuario_cierre_id is null
      and monto_declarado is null
      and monto_esperado is null
      and diferencia is null)
    or
    (estado = 'cerrado' and fecha_cierre is not null
      and usuario_cierre_id is not null
      and monto_declarado is not null
      and monto_esperado is not null
      and diferencia is not null)
  ),

  -- La diferencia tiene que ser exactamente declarado − esperado (tolerancia de
  -- 1 centavo por redondeo). Evita que un UPDATE futuro deje el arqueado
  -- inconsistente con sus propias cifras.
  constraint caja_turno_diferencia_coherente check (
    diferencia is null or abs(diferencia - (monto_declarado - monto_esperado)) < 0.01
  )
);

comment on table public.caja_turnos is
  'Turnos de caja. Un turno abierto por restaurante (índice único parcial). '
  'monto_esperado/diferencia se congelan al cerrar.';

-- Un solo turno abierto por restaurante. Es la garantía real: dos cajas no se
-- pueden abrir a la vez ni por dos terminals ni por una carrera de clics.
create unique index if not exists caja_turnos_un_abierto_por_restaurante
  on public.caja_turnos (restaurante_id)
  where estado = 'abierto';

-- Historial: del turno más reciente al más antiguo.
create index if not exists caja_turnos_por_restaurante
  on public.caja_turnos (restaurante_id, fecha_apertura desc);

-- ---------------------------------------------------------------------------
-- 2. RLS
-- ---------------------------------------------------------------------------
-- NO está aquí. Todas las policies viven en `01_rls_completo.sql` (sección 12,
-- `caja_turnos`), que además borra explícitamente las dos que estaban en esta
-- sección: `caja_turnos_select` y `caja_turnos_admin_write`.
--
-- Por qué se mueven (y por qué la de escritura desaparece):
--   * `caja_turnos_admin_write` era un `for all` para admin y cajero. Eso
--     habilitaba `insert`, `update` y `delete` DIRECTOS sobre el arqueo desde el
--     navegador, y con ellos se podía escribir a mano `monto_esperado` y
--     `diferencia` —los dos números que dicen si faltó plata— sin pasar por
--     `cerrar_turno_caja`, que es quien los calcula en SQL y los congela al
--     cerrar (y quien toma el `for update` para que dos terminales no cierren el
--     mismo turno). Ahora la tabla es de solo lectura y abrir/cerrar pasan
--     únicamente por las RPC.
--   * la de lectura no filtraba por rol: cualquier usuario del restaurante
--     veía los turnos, y no exigía suscripción ni usuario activo.

-- ---------------------------------------------------------------------------
-- 3. Apertura
-- ---------------------------------------------------------------------------
create or replace function public.abrir_turno_caja(
  p_restaurante_id uuid,
  p_usuario_id uuid,
  p_monto_inicial numeric
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_turno_id uuid;
begin
  -- Control de acceso en el servidor (suscripción + usuario activo). Ver
  -- 00_seguridad_rpcs.sql: sin esto, abrir caja por RPC esquivaría el bloqueo
  -- que hoy solo vive en la UI.
  perform public.validar_acceso_restaurante(p_restaurante_id);

  if not exists (
    select 1 from public.usuarios
     where id = auth.uid()
       and restaurante_id = p_restaurante_id
       and rol in ('admin_restaurante', 'cajero')
       and coalesce(activo, true)
  ) then
    raise exception 'Sin permiso para abrir la caja en este restaurante';
  end if;

  -- El id viene del servidor (auth.uid()), no del cliente: si el front mandara
  -- otro usuario, el arqueo atribuiría la apertura a alguien que no la hizo.
  if p_usuario_id is distinct from auth.uid() then
    raise exception 'El turno se registra con el usuario de la sesion';
  end if;

  if p_monto_inicial is null or p_monto_inicial < 0 then
    raise exception 'Monto inicial invalido: %', p_monto_inicial;
  end if;

  if exists (
    select 1 from public.caja_turnos
     where restaurante_id = p_restaurante_id and estado = 'abierto'
  ) then
    raise exception 'Ya hay un turno de caja abierto. Cierralo antes de abrir otro.';
  end if;

  insert into public.caja_turnos (restaurante_id, usuario_apertura_id, monto_inicial)
  values (p_restaurante_id, p_usuario_id, round(p_monto_inicial, 2))
  returning id into v_turno_id;

  return v_turno_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Cierre con arqueo
-- ---------------------------------------------------------------------------
create or replace function public.cerrar_turno_caja(
  p_restaurante_id uuid,
  p_usuario_id uuid,
  p_monto_declarado numeric,
  p_observaciones text default null
)
returns public.caja_turnos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_turno public.caja_turnos;
  v_ventas numeric := 0;
  v_esperado numeric;
  v_diferencia numeric;
begin
  -- Control de acceso en el servidor (suscripción + usuario activo). Ver
  -- 00_seguridad_rpcs.sql.
  perform public.validar_acceso_restaurante(p_restaurante_id);

  if not exists (
    select 1 from public.usuarios
     where id = auth.uid()
       and restaurante_id = p_restaurante_id
       and rol in ('admin_restaurante', 'cajero')
       and coalesce(activo, true)
  ) then
    raise exception 'Sin permiso para cerrar la caja en este restaurante';
  end if;

  if p_usuario_id is distinct from auth.uid() then
    raise exception 'El cierre se registra con el usuario de la sesion';
  end if;

  if p_monto_declarado is null or p_monto_declarado < 0 then
    raise exception 'Monto declarado invalido: %', p_monto_declarado;
  end if;

  -- for update: si dos terminals cierran a la vez, el segundo espera y ve el
  -- turno ya cerrado en vez de overwritear el arqueo del primero.
  select * into v_turno
    from public.caja_turnos
   where restaurante_id = p_restaurante_id and estado = 'abierto'
   for update;

  if v_turno.id is null then
    raise exception 'No hay ningun turno de caja abierto';
  end if;

  -- Efectivo cobrado DENTRO de la ventana del turno ([apertura, cierre)), menos
  -- el efectivo devuelto por boletas anuladas DENTRO de la misma ventana.
  --
  -- Con pago dividido hay que bajar a `cuenta_pagos`: la cuenta guarda un solo
  -- método principal, así que `cuentas.metodo_pago = 'efectivo'` marcaría como
  -- efectivo una cuenta pagada con tarjeta y dejaría afuera el efectivo real.
  -- El vuelto se descuenta porque salió de la gaveta: lo que queda es la venta.
  --
  -- `left join ... lateral` mantiene el fallback para cuentas viejas que no
  -- tienen detalle (sumar su total si su método principal es efectivo).
  --
  -- Una cuenta ANULADA aporta LAS DOS cosas, cada una en su fecha: el efectivo
  -- que entró (pagado_at) y el que volvió a salir (anulada_at). No es "cobrar
  -- menos": si se cobró y se anuló en el MISMO turno, ese turno tiene que ver
  -- +25 y -25, porque la gaveta estuvo con la plata y después la devolvió. Si
  -- se cobró en un turno y se anuló en el siguiente, cada arqueo cuenta su
  -- parte: el dinero entró en la primera gaveta y salió de la segunda, y el
  -- segundo turno no puede mostrar una venta que no tuvo.
  with efectivo as (
    select c.estado, c.pagado_at, c.anulada_at,
           case
             when p.monto is null then case when c.metodo_pago = 'efectivo' then c.total else 0 end
             else greatest(coalesce(p.monto, 0) - coalesce(c.vuelto, 0), 0)
           end as monto
      from public.cuentas c
      left join lateral (
        select sum(cp.monto) as monto
          from public.cuenta_pagos cp
         where cp.cuenta_id = c.id and cp.metodo_pago = 'efectivo'
      ) p on true
     where c.restaurante_id = p_restaurante_id
       -- 'pendiente' no cuenta: no entra ni sale dinero de una cuenta sin cobrar.
       and c.estado in ('pagada', 'anulada')
  )
  select coalesce(sum(
           case when e.pagado_at >= v_turno.fecha_apertura and e.pagado_at < now()
                then e.monto else 0 end
           - case when e.estado = 'anulada'
                    and e.anulada_at >= v_turno.fecha_apertura and e.anulada_at < now()
                  then e.monto else 0 end), 0) into v_ventas
    from efectivo e;

  v_esperado := round(v_turno.monto_inicial + v_ventas, 2);
  v_diferencia := round(p_monto_declarado - v_esperado, 2);

  update public.caja_turnos
     set estado = 'cerrado',
         fecha_cierre = now(),
         usuario_cierre_id = p_usuario_id,
         monto_declarado = round(p_monto_declarado, 2),
         monto_esperado = v_esperado,
         diferencia = v_diferencia,
         observaciones = nullif(btrim(coalesce(p_observaciones, '')), '')
   where id = v_turno.id
   returning * into v_turno;

  return v_turno;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Permisos
-- ---------------------------------------------------------------------------
-- NO se dan aquí: los `revoke`/`grant execute` de esta y de todas las demás
-- funciones están en la sección 16 de `01_rls_completo.sql`, que se aplica al
-- final. Ver la nota de por qué (el orden de aplicación ya no decide si una RPC
-- queda llamable con la anon key).
--
-- OJO, además: la tabla `caja_turnos` queda como SOLO LECTURA para el cliente en
-- ese mismo archivo. La policy de escritura que estaba en la sección 2 de este
-- archivo (`caja_turnos_admin_write`, un `for all`) queda eliminada a propósito:
-- permitía escribir el arqueo a mano, con cualquier `monto_esperado` y
-- `diferencia`, esquivando el `for update` de `cerrar_turno_caja`. Abrir y cerrar
-- pasan solo por las dos RPC de arriba.

-- ---------------------------------------------------------------------------
-- 6. Verificación manual (opcional, en el SQL editor)
-- ---------------------------------------------------------------------------
-- select * from public.caja_turnos where restaurante_id = '<rid>' order by fecha_apertura desc;
-- Un arqueado debe salir con diferencia 0:
--   monto_declarado = monto_inicial + efectivo cobrado en la ventana.
