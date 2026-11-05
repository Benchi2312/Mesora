-- Índices para cubrir claves foráneas detectadas en el análisis de Supabase.
-- Ayudan al filtrar mensajes por autor y al borrar/actualizar usuarios asociados.
create index if not exists soporte_mensajes_autor_id_idx
  on public.soporte_mensajes (autor_id);

create index if not exists admin_recovery_tokens_usuario_id_idx
  on private.admin_recovery_tokens (usuario_id);
