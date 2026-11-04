# Envío del formulario comercial

La landing envía las solicitudes mediante la Edge Function `contacto-comercial`.
La función entrega las consultas a `mesoratech@gmail.com` con Resend y deja el
correo de quien consulta como `reply_to`. La clave del proveedor se mantiene
como secreto de Supabase y nunca se incluye en el frontend ni en Git.

Cada consulta válida queda en la bandeja privada **Super Admin → Soporte →
Consultas comerciales**. El superadministrador puede marcarla como nueva,
en seguimiento o cerrada; el correo es un aviso adicional, no el registro
principal. Los tickets de los administradores de restaurantes viven en la otra
pestaña de Soporte. Son errores, consultas o sugerencias y se avisan al mismo
buzón. Los incidentes técnicos se registran en Notificaciones y se envía un
aviso por código y día UTC.

## Activación en producción

Estado comprobado el 04/11/2026: `RESEND_API_KEY` existe en el proyecto Mesora.
Una consulta de prueba a la función desplegada respondió **HTTP 200, `ok: true`**
y el propietario confirmó que el mensaje llegó a `mesoratech@gmail.com`.
No se guarda ni publica la clave en este documento.

Los siguientes pasos son para una nueva instalación o rotación de la clave;
la instalación de Mesora ya tiene configurado el secreto:

1. Crear una cuenta de Resend con `mesoratech@gmail.com` y generar una API key.
2. En Supabase, abrir **Edge Functions → Secrets** del proyecto de producción.
3. Añadir `RESEND_API_KEY` con la API key y guardar.
4. Enviar una consulta real desde la landing y confirmar que llegó a la bandeja
   de `mesoratech@gmail.com`.

La función está configurada para usar `Mesora <onboarding@resend.dev>` como
remitente inicial. Cuando Mesora tenga dominio propio verificado en Resend, se
puede guardar el remitente definitivo en el secreto `MESORA_CONTACT_FROM_EMAIL`.
El destino se puede cambiar con `MESORA_CONTACT_TO_EMAIL`; por defecto es
`mesoratech@gmail.com`.

Si la consulta se guarda pero el proveedor falla, el formulario confirma que
quedó registrada e indica que el correo está pendiente. El proceso programado
reintenta el aviso. Si no se puede guardar, conserva los datos, ofrece
**Reintentar envío** y el enlace de correo manual. Nunca abre otra aplicación
por su cuenta. El estado de carga, el éxito y los errores se anuncian a los
lectores de pantalla.

## Cola de avisos

La migración `20261104172538_bandeja_comercial_alertas.sql` crea las tablas
privadas de consultas y avisos. El formulario intenta enviar de inmediato; el
workflow `avisos-correo.yml` llama cada diez minutos a la función
`procesar-alertas-correo` para reintentar los avisos pendientes. Usa un token
aleatorio dedicado: `MESORA_ALERTS_CRON_TOKEN` debe estar tanto en los secretos
de Edge Functions como en los secretos del repositorio GitHub. No es una clave
de Resend ni una credencial de base de datos. La función exige ese token en
`Authorization: Bearer`, no acepta CORS del navegador y limita el lote a diez
avisos. Tras ocho intentos fallidos el aviso queda visible como fallido en la
bandeja comercial; un operador debe revisar el proveedor y el código de error.
La programación de GitHub puede sufrir retrasos, por lo que el intervalo de
diez minutos es una frecuencia objetivo, no un plazo garantizado.

Para comprobar el circuito, revisar el resultado de **GitHub Actions → Enviar
avisos de Mesora**, la bandeja comercial y el registro de entregas de Resend.
No basta con una respuesta HTTP para asegurar que el destinatario recibió el
correo. Los datos de contacto se conservan en `private`; la interfaz solo usa
RPC que exige el rol de superadministrador. La retención y el borrado de datos
de contactos todavía deben definirse antes de ampliar campañas.

## Reintentos y límites

La petición al proveedor tiene un plazo de 12 segundos; el navegador espera
hasta 20 segundos. Los errores de red devuelven un error controlado. La función
rechaza JSON inválido, `null`, arrays, campos incompletos y mensajes demasiado
largos. El destino lo define el servidor; un visitante no puede elegir otro.

Una consulta con los mismos datos y destino durante el mismo día UTC usa la
misma clave de idempotencia. Resend conserva las claves durante 24 horas y
evita repetir el correo. La clave es un hash; no contiene datos legibles del
contacto. Un reintento después del cambio de día puede ser una nueva entrega.

La función reserva ahora una cuota **antes** de llamar a Resend. PostgreSQL
serializa las reservas concurrentes: hasta **3 consultas por correo al día**,
**10 por IP por hora** cuando Supabase entrega `cf-connecting-ip`, y **50 en
total al día**. Los contadores viven en el esquema `private` y guardan huellas
HMAC-SHA-256, sin correos ni IP en claro. La clave HMAC se deriva de la clave
privada de Resend; rotarla reinicia los contadores de correo/IP. Nunca se usa
`x-forwarded-for` como identidad fiable. El límite global sigue funcionando si
el encabezado de IP no está disponible. Si falla la reserva, la función responde
503 y no llama al proveedor. Cuando una cuota se agota, devuelve 429 con
`Retry-After`; el formulario ofrece el correo manual. Las solicitudes inválidas
y las capturadas por el campo señuelo no consumen cuota.

Las cuotas son un tope de uso del proveedor y reducen abuso ordinario. Un actor
puede consumir la cuota global y causar denegación temporal del formulario; el
enlace de correo manual permanece disponible. Antes de campañas, revisar la
cuota real del plan de Resend y ajustar el límite global si corresponde.

## Incidencias y revisión

Los fallos del envío comercial, la recuperación de acceso administrativo y el
alta de restaurantes se registran como **códigos sin datos personales** en
`private.mesora_system_incidents`. Los repetidos se agrupan por día. El
superadministrador los ve durante siete días en **Super Admin → Notificaciones**.
También aparecen códigos estructurados `mesora:incident` en los logs de Edge
Functions; si la base no responde, ese log sirve de respaldo. Los errores
esperados de validación y el rechazo por cuota no generan incidencias críticas.

El aviso por correo externo se genera para el primer incidente de cada código
en el día; el panel mantiene el historial agregado. Durante el lanzamiento,
revisar Notificaciones y los logs de Supabase al inicio y al cierre de cada
turno. Los códigos `resend_rejected`,
`resend_unavailable` y `rate_store_unavailable` indican que hay que revisar la
función, las cuotas del proveedor y la conexión a la base. No repetir envíos
reales solo para comprobar la alerta.

El remitente inicial `onboarding@resend.dev` está pensado para pruebas y el
destinatario admitido por la cuenta de Resend. Antes de enviar a clientes o
habilitar correos alternativos de recuperación, verificar un dominio remitente
y probar ese circuito por separado. Configurar el contacto no activa por sí
solo la recuperación al correo alternativo.

## Verificación reproducible

- `npm run verificar:contacto`: navegador aislado, proveedor simulado; carga,
  doble envío, fallo, conservación de campos, respaldo manual y reintento a
  360 y 1280 px. No envía correos reales.
- `npx deno test --allow-env supabase/functions/contacto-comercial/index_test.ts`:
  validación, reserva de cuota y proveedor simulados sin permiso de red.
- Para verificar entrega real, enviar una única consulta identificada como
  prueba y confirmar su llegada al buzón. HTTP 200 no certifica recepción.

Referencias: [secretos de Supabase](https://supabase.com/docs/guides/functions/secrets)
y [reintentos en Resend](https://resend.com/docs/dashboard/emails/idempotency-keys).
