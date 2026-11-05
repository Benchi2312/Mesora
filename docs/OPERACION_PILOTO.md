# Operación del piloto

Procedimiento actualizado el 02/11/2026. Completar con el encargado los datos
del local y las pruebas presenciales antes del primer turno.

Para el encargado: [guía breve del primer turno](./GUIA_PRIMER_TURNO.md).
Para seguimiento: [estado y pendientes del MVP](./ESTADO_MVP.md).

## Registro de salida

| Dato | Completar |
| --- | --- |
| Restaurante, encargado y soporte | Pendiente |
| Primer turno acompañado: fecha/horario | Pendiente |
| URL de producción | https://mesora-sistema.vercel.app; validar tras cada despliegue de `main`. |
| Proyecto y versión | Supabase Mesora; rama main en GitHub. El commit desplegado y sus checks se consultan en Deployments de Vercel y Actions de GitHub. |
| Sistema de comprobantes electrónicos | Se mantiene el sistema actual del local; confirmado por el propietario el 30/10/2026. |
| Respaldo y restauración local | 02/11/2026: dump completo de la base real restaurado correctamente en una base Supabase local aislada. El archivo está en `backups/mesora-production-20261102.dump`, excluido de Git. |
| Responsable y copia fuera de esta computadora | Pendiente |
| Frecuencia, retención y pérdida máxima aceptable | Pendiente |
| Restauración del servicio y tiempo real de recuperación | Pendiente; la prueba local no mide el RTO ni valida un proyecto remoto nuevo. |
| Dispositivos e impresora aprobados | Pendiente |

## 1. Respaldo y recuperación

1. Revisar cobertura y disponibilidad en Supabase. En la consulta realizada no
   había backups físicos listados y PITR estaba desactivado. Acordar mecanismo
   y coste con el propietario antes de habilitarlo.
2. Se generó un dump completo con `pg_dump` 17.6 y se restauró en una base
   Supabase local temporal. El artefacto queda en `backups/`, está excluido de
   Git y se verificó con `pg_restore --list`. Antes del turno real, copiarlo a
   un destino cifrado fuera de esta computadora y acordar responsable,
   frecuencia y retención.
3. El dump cubre la base PostgreSQL; no incluye objetos binarios de Storage,
   configuración del proveedor Auth, secretos de Edge Functions ni despliegues
   de Vercel. Definir respaldo y recuperación por separado para esos servicios.
4. Restaurar en un proyecto aislado, nunca sobre el restaurante operativo para
   ensayar. Desactivar correos e integraciones salientes durante la prueba.
5. Comparar cantidades, relaciones, último cobro/correlativo, pagos y turnos.
   Probar login/lectura. Registrar fecha, versión, tamaño, cobertura, resultado
   y tiempo real de recuperación.
6. Acordar frecuencia/retención según la pérdida de ventas tolerable; repetir
   después de cambios de esquema relevantes y verificar la continuidad.

La restauración de `npm run verificar:sql` utiliza una base PGlite aislada.
Solo valida ese entorno técnico de prueba.

### Trabajo pendiente para el respaldo

La restauración completa de la base en PostgreSQL 17.6 local aislado ya se
completó y verificó. El archivo privado está en `backups/` y excluido de Git.
Antes del primer turno, el propietario debe copiarlo a almacenamiento cifrado
fuera de esta computadora y definir responsable, frecuencia y retención.
Preparar además la cobertura de objetos de Storage, proveedores Auth y secretos
de Edge Functions, que no están dentro del dump SQL.

Referencias: [respaldos por plan](https://supabase.com/docs/guides/platform/backups)
y [exportación/restauración con CLI](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore).
El procedimiento y script están en [RESPALDOS.md](./RESPALDOS.md). La prueba
local demuestra que el archivo puede restaurarse en un entorno aislado, no
certifica el tiempo de recuperación ni restaura Storage o secretos.

## 2. Preparación del local

- Accesos individuales: rol, restaurante y activo comprobados.
- PIN del encargado configurado; credenciales en un gestor privado.
- Precios, bebidas, zonas/mesas, datos del local y suscripción revisados.
- El administrador ve fecha y tiempo restante de su suscripción en el panel.
  Desde 30 días antes aparecen avisos de renovación; en los últimos 7 días y
  24 horas se vuelven más visibles. Si vence, todos los roles del restaurante
  quedan en la pantalla de acceso pausado. Los perfiles y los datos permanecen
  intactos y el acceso se recupera al renovar. La app comprueba el estado cada
  minuto y al volver a la ventana; el bloqueo de escritura se aplica en la base.
- Reset de personal probado. Probar recuperación con el correo real de acceso
  del administrador del restaurante; el correo alternativo requiere Resend.
- Impresora de 80 mm, PDF, móvil y equipo de caja aprobados.
- Sistema de comprobantes acordado: Mesora entrega recibo interno y precuenta.
  El propietario confirmó que mantiene su facturación actual; conciliar ambos
  registros durante el turno.
- Matriz de [PILOTO.md](./PILOTO.md) ejecutada y aceptada, con cobro simultáneo
  desde dos dispositivos y corte de red incluidos.

## 3. Apertura y cierre

1. Confirmar conexión/acceso y que no exista otro turno abierto del cajero.
   Abrir con el efectivo contado.
2. Registrar pedidos y revisar cocina/barra. Actualizar precuenta si cambia el
   consumo.
3. Revisar total, propina, método, recibido y vuelto al cobrar. Esperar la
   confirmación antes de repetir una acción.
4. Para anular, pedir PIN, registrar motivo y comprobar estado/devolución.
5. Cerrar contando efectivo físico: comparar apertura, cobros en efectivo y
   devoluciones. Explicar toda diferencia y revisar pendientes por separado.
6. Conciliar con el sistema de comprobantes y guardar el resumen en ubicación
   privada. Registrar incidentes y tiempos.

## 4. Corte de internet o error al cobrar

1. Anotar mesa, hora, consumo e importe en el registro manual privado del local.
   El modo QA local no sincroniza ventas reales ni es respaldo operativo.
2. Si se perdió la respuesta, recuperar conexión y revisar **Cobros** y estado
   de mesa/cuenta antes de repetir. La falta de confirmación visual no demuestra
   que el pago falló.
3. Si se cobró manualmente, el encargado reconcilia ese pago con el sistema
   antes de volver a operar la mesa. Documentar correcciones para evitar duplicados.
4. Escalar pagos duplicados, diferencias sin explicar, mezcla de restaurantes o
   pérdida general de acceso. Detener cobros afectados hasta confirmar el estado.

## 5. Diagnóstico y soporte

Un administrador del restaurante abre **Soporte → Nueva solicitud**, elige
error, consulta o sugerencia, describe el caso y ve su estado en el mismo
apartado. El superadministrador lo recibe en **Soporte → Soporte de
restaurantes**, asigna responsable y actualiza prioridad y estado. La creación
del ticket también deja un aviso por correo a `mesoratech@gmail.com`, con
reintentos automáticos si falla el proveedor. El cuerpo del ticket permanece
en la bandeja de Mesora; el aviso por correo contiene solo un resumen.

Las solicitudes de la landing llegan a **Soporte → Consultas comerciales**,
donde el superadministrador puede marcar el seguimiento. No son tickets de un
restaurante. Los fallos de servicios se agrupan en **Notificaciones** y generan
un aviso externo por código y día. Ver [circuito de correo](./CONTACTO_COMERCIAL.md).

Cada ticket tiene una conversación. El administrador del restaurante y Mesora
pueden responder mientras el ticket no esté cerrado; solo ese restaurante y el
superadministrador leen sus mensajes. Al cerrarlo, el historial queda visible
y se abre un nuevo ticket si hace falta continuar. El estado y la prioridad los
gestiona Mesora; las respuestas se consultan dentro de la aplicación.

En **Consultas comerciales**, Mesora registra responsable, nota interna y fecha
del próximo contacto. El contador de contactos atrasados considera las consultas
abiertas con una fecha anterior a hoy en Lima. Las notas no se envían por correo
ni aparecen en la landing; solo el superadministrador accede a ellas.

La app real envía a logs PostgreSQL el prefijo `MESORA_CLIENT_ERROR`, tipo,
ruta canónica y operación/contexto. No envía mensajes originales, formularios,
identificadores, PIN ni tokens. Límite por pestaña: 20 intentos/10 minutos y
una categoría/contexto/ruta cada 60 s. Requiere sesión y funciona como mejor
esfuerzo; no sustituye alertas.

Registrar hora, ruta y acción; ocultar datos sensibles en capturas. Soporte
revisa Postgres/Auth/Edge Functions y contrasta con caja/auditoría. Asignar
revisión al inicio, durante y al cierre del primer turno.
Para detener los envíos, definir `VITE_MESORA_DIAGNOSTICO=false` y reconstruir.
Esto no elimina registros anteriores del proveedor.

## 6. Despliegue y reversión

1. Rama `respaldo/<tema>`, PR y CI aprobado. Revisar migraciones y respaldo
   antes de actualizar la base.
2. Probar preview; si apunta a la base real, usar demo para mostrar y staging
   aislado para ensayos persistentes. Verificar Auth en la URL exacta.
3. La integración de recuperación del administrador ya está desplegada y la
   redirección de Auth apunta a la URL oficial. SMTP está configurado y el
   superadmin recuperó el acceso y el propietario confirmó el cambio de
   contraseña del admin del restaurante. El
   correo alternativo requiere secretos de Resend y prueba propia. Integrar a
   `main` después de CI aprobada; Vercel detecta el push y publica automáticamente.
   CI y despliegue son comprobaciones separadas. Mantener visibles los pendientes
   de copia externa del respaldo y aceptación del local.
4. Comprobar rutas públicas con `npm run verificar:despliegue --
   https://mesora-sistema.vercel.app`; el workflow de GitHub también lo ejecuta
   tras el despliegue. Registrar commit y deployment. Esta comprobación no
   autentica ni crea ventas. GitHub borra la rama del PR al integrarlo; borrar
   la local con `git branch -d` después de sincronizar `main`.
5. Si falla la interfaz, promover el deployment anterior compatible. No borrar
   tablas/columnas ni restaurar datos automáticamente para revertir frontend.
6. Si afecta datos, conservar evidencia, detener operaciones afectadas y seguir
   la recuperación aprobada con el propietario.

Una preview o build correctos no autorizan por sí solos el inicio del turno.
Los datos pendientes del registro requieren evidencia.
