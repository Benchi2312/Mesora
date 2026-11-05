-- Indices de las nuevas claves foraneas y busquedas de responsable.
-- El usuario de la mesa y el autor de una boleta pueden cambiar o desactivarse;
-- estos indices evitan escaneos al validar y al aplicar ON DELETE SET NULL.
create index if not exists mesas_mesero_responsable_idx
  on public.mesas (mesero_responsable_id);

create index if not exists cuentas_mesero_snapshot_idx
  on public.cuentas (mesero_id_snapshot);

create index if not exists reimpresion_pin_intentos_usuario_idx
  on public.reimpresion_pin_intentos (usuario_id);
