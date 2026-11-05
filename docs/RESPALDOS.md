# Respaldo real y prueba de recuperación

Los respaldos del 02 y 03/11 se usaron para pruebas. Aunque la base de
producción ya quedó limpia, las copias locales anteriores siguen en el equipo
(excluidas de Git) y conservan el estado previo, incluidos los datos de prueba.
La copia limpia posterior al reset es independiente. La purga de esos archivos
locales y la copia portable externa siguen pendientes.

## Actualizacion del 05/11/2026

Después de retirar los datos de prueba se generó un dump PostgreSQL en formato
custom desde la URL local del proyecto Mesora. Se restauro en una base nueva y
aislada con PostgreSQL 17.6: 20 tablas publicas, cero restaurantes y un perfil
de superadmin. Los informes solo contienen conteos. Las copias anteriores con
el tenant de prueba siguen en el equipo; su borrado automático fue bloqueado y
la purga manual queda pendiente.

La copia se cifró con Windows DPAPI CurrentUser, se descifró en memoria y su
SHA-256 coincidió con el original. El archivo protegido y su manifiesto están
en:

```text
%LOCALAPPDATA%\Mesora\Respaldos\clean-20261105\
```

Este cifrado protege la copia en el perfil actual; **no es un respaldo externo
ni se puede descifrar automaticamente desde otra cuenta o equipo**. La clave
de recuperacion depende del perfil de Windows. Queda pendiente acordar una
segunda ubicacion cifrada y una forma portable de custodiar su clave antes del
primer turno real.

Los scripts [`cifrar-respaldo-local.ps1`](../scripts/respaldos/cifrar-respaldo-local.ps1)
y [`descifrar-respaldo-local.ps1`](../scripts/respaldos/descifrar-respaldo-local.ps1)
protegen y recuperan dumps con ese mecanismo. La restauracion incluye
estructura y datos PostgreSQL; `--no-owner --no-acl` no conserva propietarios
ni permisos, y el dump no incluye archivos de Storage, secretos de Edge
Functions ni toda la configuracion de Auth/Vercel. La copia se restauro
localmente; esto no prueba la recuperacion de un nuevo proyecto Supabase.

## Exportacion preparada para Windows

`scripts/respaldar-supabase.ps1` usa `supabase db dump`, comprueba las opciones
de la CLI instalada y requiere Docker iniciado con contenedores Linux. No
instala software. Su modo de comprobacion no conecta al proyecto:

```powershell
powershell -NoProfile -File scripts/respaldar-supabase.ps1 -Comprobar
```

Cuando Docker este disponible y haya una ventana sin ventas ni cambios de
esquema, ejecutar desde una terminal privada:

```powershell
powershell -NoProfile -File scripts/respaldar-supabase.ps1 -VentanaSinEscriturasConfirmada
```

La CLI debe tener una sesion de la cuenta autorizada (`supabase login`). La
version revisada, 2.117.0, obtiene credenciales temporales al usar `--linked`
sin una contrasena de base de datos. Por ello no hace falta compartir una
contrasena por chat ni agregarla al script. Si la organizacion restringe ese
acceso, resolverlo en la cuenta del propietario antes de exportar. No usar
`--debug` ni `--dry-run` para compartir resultados: pueden mostrar detalles
de conexion o credenciales.

El destino predeterminado es `%LOCALAPPDATA%\Mesora\Respaldos`. `-Destino`
permite otra carpeta local privada; se rechazan carpetas dentro de Git y
enlaces de directorios. Cada ejecucion crea una carpeta nueva y restringe
sus permisos NTFS al usuario actual, SYSTEM y administradores. Esto **no
cifra** los archivos: proteger el disco y copiar despues a almacenamiento
privado cifrado fuera del equipo. No subir el contenido a GitHub o Vercel.

Se exportan `roles.sql`, `schema.sql`, `data.sql` y los dos archivos del
historial de migraciones. La exportacion de datos excluye las tablas de
Storage Vector indicadas en la guia oficial. El `manifest.json` registra
version, fechas, tamanos y SHA-256. Un error deja el estado `incompleto`; aun
con todos los archivos exportados, el estado es
`exportado_pendiente_restauracion`. Los hashes detectan cambios accidentales
al copiar, pero no demuestran que el contenido pueda restaurarse.

Cada archivo se obtiene mediante una conexion separada. Coordinar la ventana
sin escrituras es necesario para no mezclar versiones entre esquema y datos.
El script no bloquea el negocio ni detiene otros clientes automaticamente.

## Restauracion aislada

1. Preparar un proyecto Supabase de prueba con version compatible, extensiones
   necesarias y correos/integraciones salientes desactivados. Confirmar su
   coste antes de crearlo. Nunca ensayar sobre la base operativa.
2. Instalar el cliente `psql` compatible. Obtener la conexion desde el panel
   Connect del destino y custodiarla en el equipo; no escribir contrasenas en
   el historial del terminal ni en el repositorio.
3. Verificar los hashes del manifiesto tras recuperar la copia. Revisar los
   permisos por defecto del destino, las personalizaciones de Auth/Storage,
   las extensiones y las claves de cifrado segun la guia oficial vigente.
4. Aplicar el procedimiento oficial con transaccion y `ON_ERROR_STOP`, primero
   roles/esquema/datos y despues el historial de migraciones. No automatizamos
   la restauracion: el destino y las diferencias de versiones requieren
   revision antes de ejecutar SQL administrativo.
5. Comparar cantidades y relaciones de usuarios, restaurantes, pedidos,
   pagos, correlativos y turnos. Probar acceso, lectura y el flujo de caja en
   ese destino. Registrar fecha, resultado y tiempo real de recuperacion.

La exportacion SQL no incluye los archivos binarios de Storage, secretos de
Edge Functions, configuracion de Auth/SMTP/hosting ni todas las claves de
cifrado del proyecto. Mantener esas copias y configuraciones por separado.
Documentar responsable, frecuencia y retencion antes del primer turno real.

Referencias oficiales:

- [Supabase: respaldo y restauracion con CLI](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore).
- [Supabase: opciones y limites de db dump](https://supabase.com/docs/reference/cli/supabase-db-dump).
- [Supabase: respaldos por plan](https://supabase.com/docs/guides/platform/backups).
- [CLI 2.117.0: conexion mediante rol temporal](https://github.com/supabase/cli/blob/v2.117.0/apps/cli/src/command-internal/legacy-db-config.layer.ts).
