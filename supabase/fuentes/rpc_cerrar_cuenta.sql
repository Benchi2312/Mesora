-- Mesora · RPC: cerrar cuenta y registrar el pago en una sola transacción.
--
-- Inserta la cuenta (pagada), sus relación cuenta_pedidos, el detalle de los
-- pagos (cuenta_pagos), marca los pedidos como entregados y libera la mesa.
--
-- PAGO DIVIDIDO / VUELTO / PROPINA
--   p_pagos es un jsonb con una parte por método:
--     [{ "metodo_pago": "efectivo", "monto": 50, "referencia": null },
--      { "metodo_pago": "yape_plin", "monto": 30, "referencia": "OP-123" }]
--
--   * `monto: null` (o 0) significa "el cliente entregó exactamente lo que le
--     falta": la función lo completa con el resto del total a pagar. Así el
--     importe cobrado depende de los ítems, no de lo que el mesero tecleó en el
--     navegador, y "33 en efectivo + el resto en Yape" no cobra 33 + el total.
--   * La suma de las partes puede ser MAYOR que el total a pagar: ese excedente
--     es el vuelto. Solo puede salir del efectivo (nunca de una tarjeta), por
--     eso la función exige que la parte no-efectivo no supere el total.
--   * `p_propina` va APARTE de `cuentas.total`: las ventas no cuentan propina
--     como venta de comida (el dashboard y el reporte siguen marg correctos).
--
-- Whitelist de métodos: 'efectivo' | 'tarjeta' | 'yape_plin' | 'otro'
-- (ajusta el valor al check constraint de tu tabla cuentas si difiere)
--
-- CONCURRENCIA: el cobro se serializa con `for update` sobre la mesa, tomado
-- antes del chequeo "ya fue cobrado", para que dos terminales no generen dos
-- cuentas del mismo total. Ver el comentario en el cuerpo de la función.
--
-- REQUISITO: 00_seguridad_rpcs.sql debe estar aplicada ANTES (esta RPC llama a
-- validar_acceso_restaurante).

-- ---------------------------------------------------------------------------
-- 0. Detalle de pagos (una fila por parte; siempre ≥ 1 por cuenta pagada)
-- ---------------------------------------------------------------------------
create table if not exists public.cuenta_pagos (
  id uuid primary key default gen_random_uuid(),
  cuenta_id uuid not null references public.cuentas (id) on delete cascade,
  restaurante_id uuid not null references public.restaurantes (id) on delete cascade,
  metodo_pago text not null check (metodo_pago in ('efectivo', 'tarjeta', 'yape_plin', 'otro')),
  -- Lo entregado por el cliente con este método (incluye lo que es vuelto).
  monto numeric(12, 2) not null check (monto > 0),
  referencia text,
  created_at timestamptz not null default now()
);

-- Compatibilidad con instalaciones antiguas: `create table if not exists` no
-- agrega columnas a una tabla ya creada. La caja y los reportes necesitan esta
-- columna; los pagos históricos sin detalle conservan el fallback a
-- cuentas.metodo_pago.
alter table public.cuenta_pagos
  add column if not exists metodo_pago text;
create index if not exists cuenta_pagos_por_cuenta_metodo
  on public.cuenta_pagos (cuenta_id, metodo_pago);

comment on table public.cuenta_pagos is
  'Partes de un pago de cuenta (pago dividido). La suma de montos = total + propina + vuelto.';

-- Consulta de arqueo: "cuánto efectivo entró hoy, por cuenta abierta".
create index if not exists cuenta_pagos_por_restaurante
  on public.cuenta_pagos (restaurante_id, created_at desc);
create index if not exists cuenta_pagos_por_cuenta on public.cuenta_pagos (cuenta_id);

-- Propina y vuelto en la cuenta (0 si no hubo).
alter table public.cuentas add column if not exists propina numeric(12, 2) not null default 0 check (propina >= 0);
alter table public.cuentas add column if not exists vuelto numeric(12, 2) not null default 0 check (vuelto >= 0);

-- ---------------------------------------------------------------------------
-- 1. La RPC
-- ---------------------------------------------------------------------------
create or replace function public.cerrar_cuenta(
  p_restaurante_id uuid,
  p_mesa_id uuid,
  p_pedidos uuid[],
  p_pagos jsonb,
  p_propina numeric default 0
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total numeric := 0;
  v_cuenta_id uuid;
  v_pedido_id uuid;
  v_subtotal numeric;
  v_a_pagar numeric;
  v_recibido numeric := 0;
  v_efectivo numeric := 0;
  v_no_efectivo numeric := 0;
  v_vuelto numeric;
  v_teclado numeric;
  v_parte jsonb;
  v_metodo text;
  v_monto numeric;
  v_correlativo integer;
  v_numero text;
begin
  -- Control de acceso en el servidor (suscripción + usuario activo). Ver
  -- 00_seguridad_rpcs.sql: sin esto, `rpc('cerrar_cuenta')` desde la consola
  -- cobraría aunque el restaurante esté vencido o el mesero esté desactivado.
  perform public.validar_acceso_restaurante(p_restaurante_id);

  -- SERIALIZACIÓN DEL COBRO.
  -- El chequeo "¿ya está pagado?" y el marcado de los pedidos como 'entregado'
  -- tienen que ser un solo paso atómico, o dos cajas cobrando la misma mesa al
  -- mismo tiempo crean DOS cuentas con el mismo total (el cliente paga una vez,
  -- el restaurante acredita dos).
  --
  -- El candado es la FILA DE LA MESA, no los pedidos, y se toma aquí a
  -- propósito: antes del chequeo de "ya cobrado" y antes de mirar los pedidos.
  -- Cualquier otra forma de cerrar esta mesa (otra terminal, otro dispositivo)
  -- tiene que pasar por el mismo `for update`, así que el segundo cobra espera
  -- en la fila y, cuando despierta, ve los pedidos ya en 'entregado' y sale por
  -- la rama de "ya fue cobrado" en lugar de duplicar el cobro.
  --
  -- Se bloquea la mesa y no los pedidos porque la mesa es el recurso que se
  -- serializa: siempre existe (es el ancla de la cuenta), mientras que el set
  -- de pedidos a cobrar varía según qué comanda se haya enviado y bloquearlos
  -- exigiría ordenar los ids para no provocar deadlocks entre dos cierres.
  -- La pertenencia de los pedidos a esta mesa se revalida más abajo, ya con el
  -- candado tomado.
  perform 1 from public.mesas
   where id = p_mesa_id and restaurante_id = p_restaurante_id
     for update;

  if not found then
    raise exception 'La mesa no pertenece al restaurante';
  end if;

  -- Rol mesero o admin: solo el personal del restaurante cierra la cuenta.
  if not exists (
    select 1 from public.usuarios
     where id = auth.uid()
       and restaurante_id = p_restaurante_id
       and rol in ('mesero', 'admin_restaurante')
       and coalesce(activo, true)
  ) then
    raise exception 'Sin permiso para cerrar cuentas en este restaurante';
  end if;

  -- La pertenencia de la mesa ya quedó comprobada arriba, junto con el candado.

  if p_propina is null or p_propina < 0 then
    raise exception 'Propina invalida: %', p_propina;
  end if;

  if p_pagos is null or jsonb_array_length(p_pagos) = 0 then
    raise exception 'Agrega al menos un metodo de pago';
  end if;

  if p_pedidos is null or array_length(p_pedidos, 1) is null then
    raise exception 'No hay pedidos para cerrar';
  end if;

  -- Un pedido ya cobrado en otra cuenta pagada no se puede volver a cobrar.
  if exists (
    select 1
      from public.cuenta_pedidos cp
      join public.cuentas c on c.id = cp.cuenta_id
     where cp.pedido_id = any(p_pedidos)
       and c.estado = 'pagada'
  ) then
    raise exception 'Alguno de los pedidos ya fue cobrado en otra cuenta';
  end if;

  -- Total de los pedidos seleccionados (pertenecientes a mesa + restaurante).
  -- Los ítems anulados por el mesero no se cobran (ver migracion_items_anulables.sql).
  select coalesce(sum(pi.cantidad * pi.precio_unitario), 0)
    into v_total
    from public.pedido_items pi
    join public.pedidos pd on pd.id = pi.pedido_id
   where pd.restaurante_id = p_restaurante_id
     and pd.mesa_id = p_mesa_id
     and pd.id = any(p_pedidos)
     and pd.estado <> 'anulado'
     and pi.anulado = false;

  -- Una comanda sin ítems vigentes no se cobra: evita cuentas en cero.
  if v_total <= 0 then
    raise exception 'No hay pedidos por cobrar en esta mesa';
  end if;

  v_a_pagar := round(v_total + p_propina, 2);

  -- Validar los montos explícitos antes de completar los "exactos".
  for v_parte in select * from jsonb_array_elements(p_pagos)
  loop
    v_metodo := v_parte ->> 'metodo_pago';
    -- Misma whitelist que METODOS_PAGO en src/types/database.ts
    if v_metodo is null or v_metodo not in ('efectivo', 'tarjeta', 'yape_plin', 'otro') then
      raise exception 'Metodo de pago no valido: %', v_metodo;
    end if;
    v_monto := coalesce((v_parte ->> 'monto')::numeric, 0);
    if v_monto < 0 then
      raise exception 'Monto de pago invalido: %', v_monto;
    end if;
  end loop;

  -- Solo una parte puede quedar "exacta", y tiene que quedar algo por repartir.
  if (
    select count(*) from jsonb_array_elements(p_pagos) as parte
     where coalesce((parte ->> 'monto')::numeric, 0) <= 0
  ) > 1 then
    raise exception 'Solo una parte puede quedar exacta. Reparte el total entre los metodos';
  end if;

  -- El "exacto" se completa con el resto que falta (nunca con el total entero:
  -- si no, un pago dividido cobraría el doble).
  select coalesce(sum(coalesce((parte ->> 'monto')::numeric, 0)), 0)
    into v_teclado
    from jsonb_array_elements(p_pagos) as parte
   where coalesce((parte ->> 'monto')::numeric, 0) > 0;

  -- Sumar cada parte con su importe final.
  for v_parte in select * from jsonb_array_elements(p_pagos)
  loop
    v_metodo := v_parte ->> 'metodo_pago';
    v_monto := coalesce((v_parte ->> 'monto')::numeric, 0);
    if v_monto <= 0 then
      v_monto := round(v_a_pagar - v_teclado, 2);
      if v_monto <= 0 then
        raise exception 'Los montos ya cubren el total. Quita esa parte o ajustala';
      end if;
    end if;

    v_recibido := v_recibido + v_monto;
    if v_metodo = 'efectivo' then
      v_efectivo := v_efectivo + v_monto;
    else
      v_no_efectivo := v_no_efectivo + v_monto;
    end if;
  end loop;

  if v_recibido < v_a_pagar - 0.01 then
    raise exception 'El monto recibido no cubre el total de la cuenta';
  end if;

  -- El vuelto solo sale del efectivo: si lo no-efectivo supera lo que se debe,
  -- estaríamos "devolviendo" contra una tarjeta.
  if v_no_efectivo > v_a_pagar + 0.01 then
    raise exception 'El pago con tarjeta o Yape no puede superar el total: el vuelto solo se entrega en efectivo';
  end if;

  v_vuelto := round(v_recibido - v_a_pagar, 2);

  -- Correlativo de boleta del restaurante. El upsert se lleva la fila en
  -- exclusiva, así que dos cierres simultáneos no obtienen el mismo número.
  insert into public.correlativos (restaurante_id, tipo, ultimo)
  values (p_restaurante_id, 'boleta', 1)
  on conflict (restaurante_id, tipo)
  do update set ultimo = public.correlativos.ultimo + 1
  returning ultimo into v_correlativo;

  v_numero := 'B001-' || lpad(v_correlativo::text, 6, '0');

  insert into public.cuentas (
    restaurante_id, mesa_id, total, metodo_pago, estado, pagado_at, propina, vuelto, numero
  )
  values (
    p_restaurante_id, p_mesa_id, v_total,
    (p_pagos -> 0 ->> 'metodo_pago'),
    'pagada', now(), round(p_propina, 2), v_vuelto, v_numero
  )
  returning id into v_cuenta_id;

  -- Detalle del pago: una fila por parte, con el importe real (nunca 0).
  -- La parte "exacta" guarda el resto que faltaba, el mismo importe que se usó
  -- para calcular el vuelto: si guardara el total entero, el arqueo de caja
  -- sumaría de más.
  insert into public.cuenta_pagos (cuenta_id, restaurante_id, metodo_pago, monto, referencia)
  select v_cuenta_id,
         p_restaurante_id,
         (parte ->> 'metodo_pago'),
         case
           when coalesce((parte ->> 'monto')::numeric, 0) <= 0
             then round(v_a_pagar - v_teclado, 2)
           else (parte ->> 'monto')::numeric
         end,
         nullif(btrim(coalesce(parte ->> 'referencia', '')), '')
    from jsonb_array_elements(p_pagos) as parte;

  foreach v_pedido_id in array p_pedidos
  loop
    -- Subtotal de SU comanda, sin los ítems anulados.
    select coalesce(sum(cantidad * precio_unitario), 0)
      into v_subtotal
      from public.pedido_items
     where pedido_id = v_pedido_id
       and anulado = false;

    insert into public.cuenta_pedidos (cuenta_id, pedido_id, subtotal)
    values (v_cuenta_id, v_pedido_id, v_subtotal);

    update public.pedidos
       set estado = 'entregado', updated_at = now()
     where id = v_pedido_id
       and restaurante_id = p_restaurante_id
       and estado <> 'anulado';
  end loop;

  update public.mesas set estado = 'libre' where id = p_mesa_id;

  return v_cuenta_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Permisos
-- ---------------------------------------------------------------------------
-- NO se da `grant execute` aquí: los permisos de todas las funciones viven en la
-- sección 16 de `01_rls_completo.sql`, que se aplica al final.
--
-- El motivo de que estén juntos no es estética. `create or replace function` no
-- cambia los privilegios de una función existente, y Postgres le da EXECUTE a
-- PUBLIC (o sea, a `anon` y a `authenticated`) por defecto. Si cada archivo
-- revocara por su cuenta, que la RPC quedara llamable desde la anon key
-- dependía del orden en que se aplicaran los scripts.
