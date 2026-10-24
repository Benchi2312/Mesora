-- =============================================================================
-- Mesora · Recuperación de contraseñas por rol
-- =============================================================================
--
-- QUÉ AGREGA
--   · correo_recuperacion            — correo REAL de recuperación del admin del
--                                      restaurante. Puede ser distinto del
--                                      identificador de login (usuario@dominio).
--   · correo_recuperacion_verificado — marca que el admin ya confirmó ese correo.
--                                      Solo con true se ofrece la recuperación por
--                                      correo; si no está verificado, no se ofrece.
--   · debe_cambiar_password          — si está en true, el login obliga a setear
--                                      una nueva contraseña antes de entrar. Lo
--                                      enciende el reset administrativo de
--                                      trabajadores (mesero/cocina/cajero).
--
-- POR QUÉ
--   · El admin puede tener un correo de login que no recibe correo (ej. un
--     usuario@dominio interno). Para recuperarse necesita un correo real, que
--     verifica por su cuenta y se guarda aparte.
--   · Los trabajadores NO tienen correo real: el admin de su restaurante les
--     restablece la contraseña desde Personal y ellos la cambian al entrar.
--
-- SEGURIDAD
--   · El correo de recuperación es un DATO, no una credencial: no da acceso por sí
--     solo. La verificación y el uso se hacen siempre desde una Edge Function con
--     service_role, nunca desde el navegador.
--   · El índice único evita que dos cuentas compartan correo de recuperación
--     (esquiva el "recupero la de otro"). Es parcial: NULL repetidos son válidos.
--
-- REQUISITOS: corre después del schema base (tabla `usuarios`).
-- =============================================================================

alter table public.usuarios
  add column if not exists correo_recuperacion text;

alter table public.usuarios
  add column if not exists correo_recuperacion_verificado boolean not null default false;

alter table public.usuarios
  add column if not exists debe_cambiar_password boolean not null default false;

create unique index if not exists usuarios_correo_recuperacion_unique
  on public.usuarios (correo_recuperacion)
  where correo_recuperacion is not null;
