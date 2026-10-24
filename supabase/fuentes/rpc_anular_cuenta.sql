-- Mesora · Anulación de cobros (void de una boleta ya emitida).
--
-- PROBLEMA QUE RESUELVE
-- Una boleta emitida es un documento: no se puede borrar. Pero el mundo real
-- tiene errores de cobro (teclaron 80 en vez de 30), meals que vuelven, o
-- comandas que el mesero tomó mal. Antes no había salida: el restaurante
-- terminaba con la venta mal registrada o el cliente se iba sin pagar.
--
-- La regla que se impone
-- Anular un cobro cambia el dinero: la cuenta sale de las ventas del mes y el
-- efectivo devuelto sale de la gaveta. Por eso
--   * solo lo puede hacer el admin o el cajero (nunca el mesero),
--   * y si el restaurante tiene PIN de autorización, lo exige (también al
--     admin: el PIN es la constancia de que alguien autorizó la anulación, no
--     de que el propio admin la hizo; quién la ejecutó y cuándo queda en
--     `anulada_por` y `anulada_at`).
--
-- POR QUÉ LA CUENTA PASA A 'anulada' Y NO SE BORRA
-- El histórico de ventas tiene que seguir mostrando lo que pasó: una cuenta
-- cobrada y anulada el mismo día es información (el motivo dice por qué). Si se
-- borrara, el arqueo de caja quedaría sin explicación y el reporte sin rastro.
-- `computeMetricas` filtra por `estado = 'pagada'`, así que una cuenta anulada
-- desaparece sola de las ventas sin tocar el código de los reportes.
--
-- EL EFECTO EN LA GAVETA
-- El dinero del reembolso SALE de la gaveta: el arqueo del turno tiene que
-- descontarlo o el cajero que anuló una boleta vería un "faltante" que él no
-- cometió. Se registra `monto_reembolsado` (total + propina, todos los
-- métodos) y el arqueo descuenta de la gaveta solo la parte en efectivo, que es
-- la única que puede salir de ella (ver `ventasEfectivoDelTurno` en
-- src/lib/caja.ts).
--
-- REQUISITOS: corre después de rpc_cerrar_cuenta.sql (existen `cuentas` y
-- `cuenta_pagos`), de pin_autorizacion.sql (existe validar_pin_autorizacion) y
-- de 00_seguridad_rpcs.sql.

-- ---------------------------------------------------------------------------
-- 1. Columnas de la anulación
-- ---------------------------------------------------------------------------
-- 'anulada' entra al CHECK de `cuentas.estado`: el CHECK viejo seguiría
-- rechazando el valor nuevo, así que hay que soltar ese constraint (si tu
-- schema lo nombró de otra forma, ajústalo) y poner el que incluye las tres
-- estados. Es idempotente: si el CHECK nuevo ya existe, no se vuelve a crear.
alter table public.cuentas
  add column if not exists anulada_at timestamptz,
  add column if not exists anulada_por uuid references public.usuarios (id),
  add column if not exists motivo_anulacion text,
  add column if not exists monto_reembolsado numeric(12, 2);

comment on column public.cuentas.anulada_at is
  'Momento en que se anuló el cobro (no se borra: queda el rastro).';
comment on column public.cuentas.motivo_anulacion is
  'Por qué se anuló la boleta. Es parte del registro contable, no opcional.';
comment on column public.cuentas.monto_reembolsado is
  'Total devuelto al cliente (suma de todos los métodos). El arqueo de caja solo descuenta la parte en efectivo.';

alter table public.cuentas drop constraint if exists cuentas_estado_check;
-- Mismo criterio que en migracion_items_anulables.sql: si hay cuentas guardadas
-- con un estado fuera de la lista, el CHECK no se crea y se avisa, en vez de
-- abortar el script entero con un 22P02.
do $$
begin
  if exists (
    select 1 from public.cuentas where estado not in ('pendiente', 'pagada', 'anulada')
  ) then
    raise warning 'Mesora: public.cuentas.estado tiene valores fuera de la lista; NO se creó cuentas_estado_check. Corrige esas cuentas y vuelve a ejecutar.';
  else
    alter table public.cuentas
      add constraint cuentas_estado_check check (estado in ('pendiente', 'pagada', 'anulada'));
  end if;
end;
$$;

-- Una cuenta anulada es una cuenta que estaba pagada y se anuló: tiene fecha,
-- motivo y monto devuelto. Las cuentas normales no pueden tener nada de eso.
-- Mismo criterio blando de arriba: si una cuenta vieja ya tenía algo de esto
-- guardado a medias, se avisa y se sigue, no se corta la instalación.
alter table public.cuentas drop constraint if exists cuentas_anulacion_coherente;
do $$
begin
  alter table public.cuentas
    add constraint cuentas_anulacion_coherente check (
      (estado = 'anulada' and anulada_at is not null and motivo_anulacion is not null)
      or
      (estado <> 'anulada' and anulada_at is null and anulada_por is null and motivo_anulacion is null)
    );
exception when others then
  raise warning 'Mesora: no se pudo crear cuentas_anulacion_coherente: %. Revisa las cuentas con anulada_at/motivo_anulacion y vuelve a ejecutar.', sqlerrm;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. RPC: anular un cobro
-- ---------------------------------------------------------------------------
create or replace function public.anular_cuenta(
  p_restaurante_id uuid,
  p_cuenta_id uuid,
  p_motivo text,
  p_pin text default null
)
returns public.cuentas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cuenta public.cuentas%rowtype;
  v_reembolso numeric := 0;
  v_motivo text;
begin
  perform public.validar_acceso_restaurante(p_restaurante_id);

  -- Admin o cajero: es una operación de caja. El mesero no puede tocar una
  -- boleta ya emitida ni aunque conozca el PIN (para eso está el PIN: para que
  -- el mesero le pida el número a quien manda, no para que lo haga él).
  if not exists (
    select 1 from public.usuarios
     where id = auth.uid()
       and restaurante_id = p_restaurante_id
       and rol in ('admin_restaurante', 'cajero')
       and coalesce(activo, true)
  ) then
    raise exception 'Sin permiso para anular cobros en este restaurante';
  end if;

  v_motivo := nullif(btrim(coalesce(p_motivo, '')), '');

  if v_motivo is null or length(v_motivo) < 4 then
    raise exception 'El motivo de la anulacion es obligatorio';
  end if;

  if length(v_motivo) > 200 then
    raise exception 'El motivo de la anulacion es demasiado largo';
  end if;

  -- El PIN se pide DESPUÉS del permiso de rol: primero "no puedes", después
  -- "falta el PIN". Al revés, un mesero podría usar el mensaje de error del
  -- PIN para confirmar que el restaurante tiene PIN configurado.
  perform public.validar_pin_autorizacion(p_restaurante_id, p_pin);

  -- for update: dos terminals anulando la misma boleta a la vez. El segundo
  -- espera, despierta con estado 'anulada' y sale por la rama de "ya fue
  -- anulada" en vez de reembolsar dos veces.
  select * into v_cuenta
    from public.cuentas
   where id = p_cuenta_id and restaurante_id = p_restaurante_id
     for update;

  if v_cuenta.id is null then
    raise exception 'La cuenta no pertenece al restaurante';
  end if;

  if v_cuenta.estado = 'anulada' then
    raise exception 'Esta boleta ya fue anulada';
  end if;

  if v_cuenta.estado <> 'pagada' then
    raise exception 'Solo se puede anular una cuenta cobrada';
  end if;

  -- Cuánto se devuelve al cliente: el total de la boleta MÁS la propina, que
  -- también se cobró y también hay que devolver.
  --
  -- No hace falta sumar `cuenta_pagos`: por cómo las arma `cerrar_cuenta`, la
  -- suma de las partes es exactamente `total + propina + vuelto`, así que
  -- `total + propina` ya es el reembolso completo, y sale bien en las cuentas
  -- viejas (que no tienen detalle de pagos) y en las pagadas con tarjeta, donde
  -- sumar las partes habría dado un número que no es el devuelto.
  --
  -- Lo que SÍ hay que mirar en `cuenta_pagos` es la parte en efectivo, porque es
  -- la única que sale de la gaveta: de eso se ocupa el arqueo
  -- (`ventasEfectivoDelTurno` en src/lib/caja.ts y el bloque equivalente de
  -- supabase/caja_turnos.sql), no esta función.
  v_reembolso := round(v_cuenta.total + coalesce(v_cuenta.propina, 0), 2);

  update public.cuentas
     set estado = 'anulada',
         anulada_at = now(),
         anulada_por = auth.uid(),
         motivo_anulacion = v_motivo,
         monto_reembolsado = v_reembolso
   where id = v_cuenta.id
   returning * into v_cuenta;

  return v_cuenta;
end;
$$;

comment on function public.anular_cuenta(uuid, uuid, text, text) is
  'Anula una boleta ya cobrada (admin o cajero, con PIN si el restaurante lo configuró). La cuenta queda como registro y sale de las ventas; el efectivo devuelto se descuenta en el arqueo de caja.';

-- ---------------------------------------------------------------------------
-- 3. Permisos
-- ---------------------------------------------------------------------------
-- NO se dan aquí: los `revoke`/`grant execute` de todas las funciones están en
-- la sección 16 de `01_rls_completo.sql`, que se aplica al final (y que ya
-- incluye esta: `anular_cuenta(uuid, uuid, text, text)`).

-- ---------------------------------------------------------------------------
-- 4. Verificación manual (opcional, en el SQL editor)
-- ---------------------------------------------------------------------------
-- select estado, total, vuelto, monto_reembolsado, motivo_anulacion
--   from public.cuentas where id = '<cuenta_id>';
-- La venta del mes tiene que bajar en `total` (y en `monto_reembolsado` queda
-- lo que salió de la gaveta).
