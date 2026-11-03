# Operación del piloto

Procedimiento actualizado el 31/10/2026; responsables y evidencias reales
pendientes. Completar con el encargado antes del primer turno.

## Registro de salida

| Dato | Completar |
| --- | --- |
| Restaurante, encargado y soporte | Pendiente |
| Primer turno acompañado: fecha/horario | Pendiente |
| URL de producción | https://mesoraapp-benchi1.vercel.app; validar después del despliegue de la versión nueva. |
| Proyecto y versión | Supabase Mesora; rama main en GitHub. El commit desplegado y sus checks se consultan en Deployments de Vercel y Actions de GitHub. |
| Sistema de comprobantes electrónicos | Se mantiene el sistema actual del local; confirmado por el propietario el 30/10/2026. |
| Responsable y ubicación privada del respaldo | Pendiente |
| Frecuencia, retención y pérdida máxima aceptable | Pendiente |
| Restauración: fecha y tiempo real de recuperación | Pendiente |
| Dispositivos e impresora aprobados | Pendiente |

## 1. Respaldo y recuperación

1. Revisar cobertura y disponibilidad en Supabase. En la consulta realizada no
   había backups físicos listados y PITR estaba desactivado. Acordar mecanismo
   y coste con el propietario antes de habilitarlo.
2. Crear el respaldo mediante el mecanismo aprobado del proveedor o una
   exportación administrativa documentada. Guardarlo cifrado fuera de Git/Vercel
   con acceso limitado. No copiar volcados ni credenciales al repositorio.
3. Verificar por separado Auth, archivos de Storage, secretos de Edge Functions
   y hosting: un dump del esquema public no respalda todo el servicio.
4. Restaurar en un proyecto aislado, nunca sobre el restaurante operativo para
   ensayar. Desactivar correos e integraciones salientes durante la prueba.
5. Comparar cantidades, relaciones, último cobro/correlativo, pagos y turnos.
   Probar login/lectura. Registrar fecha, versión, tamaño, cobertura, resultado
   y tiempo real de recuperación.
6. Acordar frecuencia/retención según la pérdida de ventas tolerable; repetir
   después de cambios de esquema relevantes y verificar la continuidad.

La restauración de `npm run verificar:sql` utiliza una base PGlite aislada.
Solo valida ese entorno técnico de prueba.

### Preparativos concretos que faltan para el respaldo real

La organización está en Free. La guía oficial recomienda exportaciones con la
CLI y almacenamiento fuera del servicio en ese plan. Para seguir esa vía:

- Preparar Docker para `supabase db dump` y un cliente PostgreSQL para restaurar;
  Docker, pg_dump y psql no están disponibles en el PATH del equipo revisado.
- La CLI autenticada puede solicitar una credencial temporal al proyecto;
  no es necesario pedir la contraseña por chat. Si la cuenta no permite esa
  vía, configurar el acceso de conexión en el equipo o gestor seguro.
- Elegir una ubicación privada cifrada para las copias y una copia fuera del
  equipo; acordar responsable y frecuencia antes del primer turno.
- Preparar un destino aislado y ejecutar la restauración completa. Revisar las
  particularidades de Auth y claves de cifrado de la guía vigente, además de
  los archivos de Storage y configuración que no cubra el volcado.

Referencias: [respaldos por plan](https://supabase.com/docs/guides/platform/backups)
y [exportación/restauración con CLI](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore).
El procedimiento y script preparados están en [RESPALDOS.md](./RESPALDOS.md).
Todavía no existe evidencia de un respaldo real creado y restaurado.
La alternativa es un servicio administrado con respaldo recuperable, sujeto
a la elección y condiciones del plan del propietario.

## 2. Preparación del local

- Accesos individuales: rol, restaurante y activo comprobados.
- PIN del encargado configurado; credenciales en un gestor privado.
- Precios, bebidas, zonas/mesas, datos del local y suscripción revisados.
- Reset de personal probado. Recuperación del administrador con buzón real
  diferida expresamente por el propietario; conservarla como pendiente.
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
3. La integración de recuperación del administrador ya está en el código;
   antes de depender de ella, configurar sus secretos de correo, redirección de
   Auth y probar entrega real. Integrar a `main` con CI aprobada: Vercel detecta
   el push y publica automáticamente cuando el check `build` permite asignar el
   dominio. Mantener visibles los pendientes de respaldo/restauración y
   aceptación del local.
4. Comprobar rutas públicas con `npm run verificar:despliegue --
   https://mesoraapp-benchi1.vercel.app`; el workflow de GitHub también lo ejecuta
   tras el despliegue. Registrar commit y deployment. Esta comprobación no
   autentica ni crea ventas. GitHub borra la rama del PR al integrarlo; borrar
   la local con `git branch -d` después de sincronizar `main`.
5. Si falla la interfaz, promover el deployment anterior compatible. No borrar
   tablas/columnas ni restaurar datos automáticamente para revertir frontend.
6. Si afecta datos, conservar evidencia, detener operaciones afectadas y seguir
   la recuperación aprobada con el propietario.

Una preview o build correctos no autorizan por sí solos el inicio del turno.
Los datos pendientes del registro requieren evidencia.
