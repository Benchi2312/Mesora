# Instalar y actualizar Mesora en Supabase

Revisión: 3/11/2026. Consultar [estado del piloto](./docs/PILOTO.md) y
[operación del local](./docs/OPERACION_PILOTO.md).

## 1. Preparar

- Node 22 y dependencias con `npm ci`.
- Proyecto Supabase identificado y acceso de mantenimiento.
- Respaldo recuperable antes de actualizar una base con datos.
- URL del proyecto y clave pública anon/publishable.

La clave pública puede viajar al navegador; RLS y permisos protegen los datos.
Nunca poner service_role, secretos ni contraseña PostgreSQL en Git, en variables
VITE_* o en el frontend de Vercel.

## 2. Instalar una base vacía

```bash
npm run sql:install
npm run verificar:sql
```

El generador combina **28 secciones SQL** (18 fuentes únicas y diez
migraciones; las copias de compatibilidad no se duplican), y verifica
cobertura, equivalencia, encoding y delimitadores. La
suite instala 19 tablas en PostgreSQL aislado con pgcrypto real, verifica
RLS/RPC, prueba la nueva migración desde las policies anteriores, opera el
circuito completo y prueba una restauración aislada. No necesita ni modifica
Supabase.

Solo para una base nueva: copiar todo `supabase/TODO_EN_UNO.sql` al **SQL
Editor** y ejecutar. Crea tablas, funciones, RLS, permisos y configuración.
No crea usuarios, contraseñas compartidas ni restaurantes de demo.
La suite no reproduce el servicio Supabase Auth, correo ni infraestructura.

Comprobaciones en SQL Editor:

```sql
-- 19 tablas públicas, todas con RLS.
select tablename, rowsecurity as rls
from pg_tables where schemaname = 'public' order by tablename;

-- Esperado: true, false.
select has_column_privilege('anon', 'public.configuracion_global',
  'precio_plan_mensual', 'select') as precio_ok,
  has_column_privilege('anon', 'public.configuracion_global',
  'correo_soporte', 'select') as correo_ok,
  has_column_privilege('anon', 'public.configuracion_global',
  'telefono_soporte', 'select') as telefono_ok,
  has_column_privilege('anon', 'public.configuracion_global',
  'informacion', 'select') as informacion_no_publica;
```

Esperado: `precio_ok`, `correo_ok` y `telefono_ok` en `true`; la columna
`informacion` no debe tener permiso de lectura anónima.

## 3. Actualizar una base existente

**No volver a pegar TODO_EN_UNO.sql sobre una base con datos.** Inspeccionar el
esquema, revisar respaldo y aplicar únicamente cambios pendientes.

Estas nueve migraciones están aplicadas en el proyecto Mesora revisado. La
migración RLS del 2/11 fue aplicada después de probarla en PostgreSQL aislado y
verificar sus permisos en producción. Para otro proyecto compatible, verificar
las ya aplicadas y revisar las pendientes en orden; obtener un respaldo
recuperable antes de cualquier cambio:

| Archivo en supabase/migrations | Efecto |
| --- | --- |
| `20261022120000_password_recovery.sql` | Columnas de recuperación/cambio temporal y RPC `confirmar_cambio_password()`. |
| `20261103032730_admin_email_recovery.sql` | Verificación segura de correo alternativo, tokens de un solo uso, límite de solicitudes y protección de campos. |
| `20261029052901_datos_local_dominio.sql` | Dominio opcional, validación y permiso administrativo por columna. |
| `20261030173318_seguridad_rpc_piloto.sql` | Revoca EXECUTE público/anónimo, protege helpers y fija search_path; conserva API autenticada necesaria. |
| `20261030173320_consultas_pendientes_piloto.sql` | RPC JSON de pedidos/mesas pendientes e índices FK sin cobertura. |
| `20261030173503_diagnostico_piloto.sql` | Diagnóstico mínimo bajo sesión activa en logs. |
| `20261030173925_indice_mesas_zona.sql` | Índice de cobertura de relación compuesta mesa/zona. |
| `20261031073322_reporte_ventas_y_snapshot_bebidas.sql` | RPC de ventas por cuenta y snapshot de clasificación de bebida. |
| `20261031075708_reporte_ventas_dashboard.sql` | Agregados del dashboard de ventas. |
| `20261102081247_acotar_politicas_rls_piloto.sql` | Limita la policy pública a anon; anon lee solo precio/correo/teléfono de la landing; separa permisos RLS de catálogo/mesas. Aplicada y verificada el 2/11/2026. |

Aplicar **antes del frontend**: sus lecturas utilizan `pedidos_pendientes_mesa`
y `mesas_por_cobrar`.

Para instalaciones antiguas, revisar también requisitos y diferencias:

- Pagos/anulación/caja: `rpc_cerrar_cuenta.sql`, `rpc_anular_cuenta.sql` y
  `caja_turnos.sql`, en ese orden; añaden/usan cuenta_pagos.metodo_pago.
- Contraseña temporal guardada sin confirmar perfil:
  `20261022120000_password_recovery.sql` instala `confirmar_cambio_password()`.
  Su fuente en `supabase/fuentes/` se compara automáticamente con la migración. Después
  pulsar **Reintentar confirmación**, sin cambiar nuevamente la contraseña.
- Comprobar las demás fuentes y `seguridad_piloto.sql`: las migraciones no
  reconstruyen por sí solas una instalación incompleta.

Los scripts de `supabase/qa/` usan transacción/rollback y requieren acceso de mantenimiento. Identificar el proyecto antes de ejecutarlos; usar pruebas locales y aisladas. El propietario eligió no crear staging de pago. No son migraciones ni forman parte del instalador.

## 4. Conectar el frontend

Copiar .env.example a .env.local y completar:

```env
VITE_SUPABASE_URL=https://<ref>.supabase.co
VITE_SUPABASE_ANON_KEY=tu-clave-publica
VITE_MESORA_MODO_LOCAL=false
VITE_MESORA_DIAGNOSTICO=true
```

Reiniciar Vite tras cambios. Sin configuración real el login falla cerrado;
el modo simulado requiere activación explícita en desarrollo y no funciona en
producción. /demo mantiene datos ficticios separados.

En Vercel configurar URL/key por entorno, build `npm run build` y salida
`dist`. vercel.json reescribe rutas SPA. Reconstruir tras cambios de VITE_*.
Una preview conectada al proyecto real **no es staging aislado**.

## 5. Auth y cuentas iniciales

- Proveedor email activo y registro público desactivado. Las funciones
  administrativas aprovisionan usuarios.
- Contraseña mínima de ocho caracteres; activar protección de claves filtradas
  cuando esté disponible en el plan.
- Site URL: dominio HTTPS oficial. Redirect URL exacta:
  `https://tu-dominio/restablecer`. Añadir separadamente la preview autorizada
  para recuperación; evitar comodines amplios.
- SMTP configurado y entrega real al administrador probada. El correo interno
  del personal puede no recibir mensajes.

En Mesora se desactivó registro y se ajustó mínimo a ocho. El dominio de Vercel es https://mesora-sistema.vercel.app. El flujo de recuperación de administradores usa un correo alternativo verificado y la Edge Function `admin-password-recovery`; los enlaces vuelven a `/restablecer`.

Estado en producción:

1. `Site URL` ya es `https://mesora-sistema.vercel.app` y Redirect URLs permite el destino exacto `https://mesora-sistema.vercel.app/restablecer`.
2. La migración `20261103032730_admin_email_recovery` está aplicada y la Edge Function `admin-password-recovery` está desplegada con `verify_jwt=false`; la función valida manualmente la sesión al configurar un correo.
3. Para habilitar el envío, configura en Resend un dominio verificado y un remitente. Añade `RESEND_API_KEY`, `MESORA_AUTH_FROM_EMAIL` y `MESORA_SITE_URL=https://mesora-sistema.vercel.app` como secretos de Edge Functions en Supabase. No los guardes en Git ni en variables `VITE_*`.
4. Cada administrador registra un correo real en **Admin → Datos del local → Recuperación de contraseña** y confirma el enlace. Prueba recibirlo y completar el cambio antes de depender del flujo.
5. Los empleados no usan recuperación por correo: el administrador les restablece la clave desde **Personal**.

El correo comercial visible en la landing es `mesoratech@gmail.com`; es independiente del remitente y de las credenciales de Resend usados para recuperar contraseñas.

Crear el primer super administrador desde Authentication con cuenta individual,
confirmación apropiada y contraseña privada. Insertar su perfil sustituyendo
el correo por el de esa cuenta:

```sql
insert into public.usuarios (id, restaurante_id, rol, nombre, email, activo)
select id, null, 'super_admin', 'Operador de plataforma', email, true
from auth.users where email = 'tu-correo@dominio.com'
on conflict (id) do nothing;
```

Desde el panel crear restaurante/administrador. En **Personal**, la Edge
Function crea tanto Auth como perfil; no dar de alta manualmente un segundo
usuario para el mismo trabajador. El reset administrativo exige cambiar la
contraseña temporal.

La interfaz y Edge Function de recuperación del administrador están
implementadas. La entrega real queda pendiente hasta configurar el proveedor y
que cada admin verifique su dirección. El personal se restablece desde
**Personal** por su administrador.

## 6. Edge Functions

Revisar proyecto y desplegar las cuatro funciones:

```bash
supabase login
supabase link --project-ref <ref>
supabase functions deploy crear-personal
supabase functions deploy crear-restaurante
supabase functions deploy crear-usuario
supabase functions deploy reset-password-personal
supabase functions deploy admin-password-recovery
```

Conservar verificación JWT y controles internos de sesión/rol. Los secretos de
servicio pertenecen al servidor. Verificar alta/reset con cuentas de aceptación;
nunca copiar service_role al navegador para solucionar un 401.

## 7. Verificación

```bash
npm run sql:install
npm run verificar:sql
npm run verificar
npm run typecheck
npx playwright install chromium
npm run verificar:precuenta
npm run verificar:configuracion
npm run verificar:responsive
npm run build
npm audit
```

QA local/demo no modifica .env.local ni el proyecto real. El SQL aislado simula
Auth. Login real, correo, impresora y concurrencia de dos terminales requieren
aceptación adicional. Ver [PILOTO.md](./docs/PILOTO.md).

## 8. Seguridad y diagnóstico

- RLS en 19 tablas y sin acceso anónimo a datos/RPC de negocio.
- Landing: solo nombre de app/precio mediante grants por columna.
- Precios/totales en SQL; validación de rol/restaurante en RPC.
- PIN/correlativos privados; no abrir tablas para silenciar avisos.
- Conservar las RPC autenticadas necesarias; revisar cada finalidad antes de
  revocar permisos.
- Diagnóstico mínimo con prefijo MESORA_CLIENT_ERROR en logs PostgreSQL,
  bajo sesión y con límite en navegador. Sin alertas automáticas; desactivar
  mediante VITE_MESORA_DIAGNOSTICO=false y nuevo build si es necesario.

El repositorio no habilita respaldos, retención de logs ni límites del proveedor
por sí solo.

## 9. Problemas frecuentes

| Síntoma | Revisar |
| --- | --- |
| Login sin perfil/datos | auth.users.id → usuarios.id, restaurante, rol y activo. |
| Correo sin confirmar | Verificación de esa cuenta; no desactivar seguridad global para resolver una cuenta. |
| RPC inexistente | Proyecto correcto y migraciones antes del frontend. |
| Permission denied | Grants/policies y sesión; corregir puntualmente sin reinstalar. |
| Recuperación a localhost | Site URL, Redirect URL y origen que solicitó el enlace. |
| Invalid API key | URL/key del mismo proyecto; nunca la clave de servicio en VITE_*. |
| Variable sin efecto | Reiniciar Vite o reconstruir deployment. |
| Ruta interna 404 | Rewrite de vercel.json y salida dist. |

## 10. Habilitar el piloto al final

Completar [OPERACION_PILOTO.md](./docs/OPERACION_PILOTO.md): restauración real,
sistema de comprobantes, cuentas/PIN, dos dispositivos/impresora, recuperación,
contingencia y responsable. Después integrar a main, desplegar dominio oficial
y verificar circuito. Una preview correcta no acredita requisitos operativos.
