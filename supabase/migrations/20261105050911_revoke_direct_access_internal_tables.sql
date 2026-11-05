-- Estas tablas internas solo se usan desde RPC privilegiadas.
-- RLS sin políticas ya deniega filas; quitar también los grants directos
-- evita exponerlas si una política o el estado de RLS cambia por error.
revoke all on public.correlativos from anon, authenticated;
revoke all on public.restaurante_pins from anon, authenticated;
