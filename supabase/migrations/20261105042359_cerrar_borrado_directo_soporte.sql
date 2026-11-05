-- Revocar el privilegio SQL de borrado además de no definir una policy DELETE.
revoke delete on public.soporte_tickets from public, anon, authenticated;
revoke delete on public.soporte_mensajes from public, anon, authenticated;
