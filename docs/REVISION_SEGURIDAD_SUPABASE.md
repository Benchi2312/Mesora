# Revisión de seguridad y preparación del repositorio

Fecha de corte: **3 de noviembre de 2026**. Esta revisión se hizo sobre los
metadatos del proyecto Supabase Mesora, sus asesores, las fuentes SQL locales y
los refs Git disponibles. Tras probarla en PostgreSQL aislado, se aplicó una
migración de policies/grants a producción; no modificó filas. El código quedó
integrado en `main`; se añadieron la migración de recuperación y la Edge
Function. El repositorio quedó público después de revisar sus 19 commits; no
se agregó una licencia de reutilización.

## Hallazgos de Supabase

| Hallazgo | Evaluación | Acción |
| --- | --- | --- |
| Policies permisivas superpuestas (31 iniciales; 0 vigentes) | Rendimiento y superficie ambigua en `zonas`, `mesas`, `categorias_productos`, `productos` y `configuracion_global`. En catálogo/mesas había `FOR ALL` además de lectura/actualización; la regla de configuración para `PUBLIC` se sumaba a la de superadmin. | Se aplicó `20261102081247_acotar_politicas_rls_piloto.sql`; la lectura pública quedó en `anon`, los grants públicos se limitaron a precio/contacto, las escrituras se separaron por operación y se conservaron los permisos operativos de mesas. El asesor ya no informa solapamientos. |
| `configuracion_global` accesible por roles autenticados | **Exposición de datos concreta.** La policy `FOR SELECT` sin `TO` aplicaba a `PUBLIC`. Como `authenticated` también tenía permiso SELECT de tabla, cualquier usuario del restaurante podía leer la fila completa. Además, `anon` tenía SELECT de tabla; la landing solo necesita precio y contacto. | La migración fija la policy pública en `anon`, revoca el grant amplio y concede únicamente `precio_plan_mensual`, `correo_soporte` y `telefono_soporte`. QA confirma cero filas para el admin del restaurante, acceso anónimo solo a las columnas usadas por la landing y lectura completa para superadmin. |
| 31 funciones `SECURITY DEFINER` ejecutables por `authenticated` | El asesor las marca por estar invocables a través del esquema API. El catálogo confirma cero ejecuciones por `anon` y `search_path` fijado como `pg_catalog, public, extensions, pg_temp`. Incluye RPC de negocio y helpers que invocan las policies. | No se revocó el acceso requerido por la aplicación. Las funciones de administración consultadas validan el rol superadmin; las RPC de restaurante validan sesión, rol/restaurante y, cuando corresponde, PIN. La QA ya prueba el rechazo de once RPC administrativas a una sesión de mesero; falta ampliar la matriz al resto de funciones autenticadas. |
| RLS activado sin policies en `correlativos` y `restaurante_pins` | Esperado para estas tablas internas: cliente sin grants de lectura/escritura; acceso a través de RPC controladas. | Se mantienen cerradas. No se añaden policies para silenciar el aviso. |
| Protección de contraseñas filtradas desactivada | Aviso de Auth vigente en el proyecto. | Habilitarla si el plan lo ofrece y validar cambio y recuperación de contraseña. |
| 19 índices sin uso observado | El tráfico piloto aún no permite concluir que sean innecesarios. | No se eliminaron. Volver a medir con tráfico real. |

La guía oficial recomienda activar RLS en tablas del esquema expuesto y conceder
permisos deliberadamente. Supabase también explica el aviso de policies
permisivas y la ejecución de funciones `SECURITY DEFINER`:
[RLS](https://supabase.com/docs/guides/database/postgres/row-level-security),
[linter de policies permisivas](https://supabase.com/docs/guides/database/database-linter?lint=0006_multiple_permissive_policies),
[linter de funciones privilegiadas autenticadas](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

## Cambios locales y validación

- Las policies de zonas, mesas, categorías y productos ahora especifican
  `TO authenticated`. Los permisos de escritura se dividen en `INSERT`,
  `UPDATE` y `DELETE`; la política de mesas combina los roles que realmente
  usan su cambio de estado.
- La policy pública de configuración queda en `TO anon`. La migración también
  elimina el grant amplio que se observó en producción y limita el acceso a
  precio/correo/teléfono usados por la landing; el superadmin conserva lectura
  global.
- `20261022120000_password_recovery.sql` se añadió al historial local con el
  mismo contenido de la fuente idempotente que ya estaba en `fuentes/`. El
  generador comprueba que ambas copias no diverjan.
- `npm run sql:install`: correcto; cobertura de fuentes, equivalencia de
  recuperación y sanidad SQL aprobadas.
- `npm run verificar:sql`: correcto; instalación de 19 tablas, permisos RPC,
  restauración aislada, flujo completo y regresión de RLS aprobados.
- La regresión restaura las policies anteriores en PostgreSQL aislado, verifica
  que se reproduzca la exposición de configuración, inserta la migración real
  y prueba lectura/escritura por rol. También comprueba que once RPC de
  administración/superadmin rechacen una sesión de mesero. Todo termina en
  rollback. No conecta a Supabase de producción.
- El proyecto Supabase registró la migración como `20261102081247`; el archivo
  local usa esa misma versión. Consultas posteriores confirmaron la policy
  `anon`, grants acotados, cero filas globales para admin de restaurante y
  lectura completa para superadmin. Se volvieron a consultar los asesores: ya
  no aparece `multiple_permissive_policies`.
- La organización figura en el plan Free, que no incluye respaldos diarios.
  Docker está instalado, pero faltan `pg_dump`, `psql` y la contraseña
  PostgreSQL; no se obtuvo una copia restaurable de la base real. El dump/restore de QA
  corresponde a PostgreSQL aislado y no sustituye el backup de Supabase.

## Historial Git y contenido excluido de la publicación

- Se analizaron los 19 commits accesibles desde las refs locales, incluida
  `origin/main`, el árbol textual y el correo/contraseña de prueba conocidos. No hubo coincidencias para
  claves AWS, tokens GitHub/Supabase/Stripe/npm/Slack/Google, JWT completos,
  bloques de claves privadas, URLs de PostgreSQL con credenciales ni claves
  `service_role`. Los binarios de video/audio no se analizaron con ese escáner;
  sus capturas y licencias requieren revisión manual.
- `.env.example` está versionado y contiene valores de ejemplo; `.env.local` no
  está versionado y está cubierto por `.gitignore`. No se imprime ni publica
  aquí ningún valor de entorno.
- `main` y `origin/main` apuntaban al mismo commit al iniciar esta revisión. En
  las refs remotas solo estaba `origin/main`. Esta entrega integra los cambios en `main`.
- `promocional/` está ignorado y excluido del repositorio. Incluye el proyecto HyperFrames, video,
  narración/música y capturas del demo. Antes de incorporarlo, comprobar que las
  capturas no muestren datos reales y que cada audio/imagen tenga licencia para
  distribución pública. Los cachés y binarios de herramientas de render no
  deben agregarse al repo.
- No hay archivo `LICENSE`; no se conceden derechos generales de reutilización
  del código. El video final sigue pendiente por decisión del propietario.

## Lista de cierre

1. Obtener un respaldo restaurable y ensayar la restauración en otro entorno;
   el plan Free no incluye respaldos gestionados y el dump manual requiere
   contraseña PostgreSQL y herramientas locales.
2. Completar la matriz negativa para las funciones autenticadas restantes; las
   once RPC administrativas de superadmin ya rechazan al mesero en QA aislada.
3. Completar la aceptación con Auth real, dos dispositivos, pagos concurrentes
   e impresora; el propietario eligió pruebas locales y rechazó staging de pago; no se creó esa rama ni se generó costo.
4. Configurar el proveedor de correo y probar una recuperación real de admin;
   cada administrador debe verificar su correo alternativo.
5. Mantener excluido el video promocional hasta actualizarlo y autorizar su
   publicación; reemplazar el contacto comercial provisional.
