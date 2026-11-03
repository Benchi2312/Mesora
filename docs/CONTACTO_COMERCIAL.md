# Envío del formulario comercial

La landing envía las solicitudes mediante la Edge Function `contacto-comercial`.
La función entrega las consultas a `mesoratech@gmail.com` con Resend y deja el
correo de quien consulta como `reply_to`. La clave del proveedor se mantiene
como secreto de Supabase y nunca se incluye en el frontend ni en Git.

## Activación en producción

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

Si el proveedor no está configurado o falla, el formulario abre la aplicación de
correo de quien consulta con los datos ya completados como respaldo.
