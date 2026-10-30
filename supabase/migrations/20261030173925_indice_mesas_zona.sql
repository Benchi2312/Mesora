-- Cubre también la FK compuesta que garantiza zona y mesa del mismo local.
create index if not exists idx_mesas_zona_restaurante on public.mesas(zona_id, restaurante_id);
