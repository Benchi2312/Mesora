# Revisión de seguridad y preparación del repositorio

Fecha de corte: **3 de noviembre de 2026**; matriz de roles ampliada el **4 de noviembre de 2026**. Esta revisión se hizo sobre los
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
| 31 funciones `SECURITY DEFINER` ejecutables por `authenticated` al corte inicial | El asesor las marca por estar invocables a través del esquema API. El catálogo confirma cero ejecuciones por `anon` y `search_path` fijado como `pg_catalog, public, extensions, pg_temp`. Incluye RPC de negocio y helpers que invocan las policies. | Se conservaron los permisos requeridos. La QA prueba once RPC de superadministración contra un mesero y 36 llamadas negativas adicionales por rol y restaurante sobre las RPC operativas. La matriz verifica el motivo de rechazo, de modo que una entrada inválida no se confunda con una denegación de autorización. |
| RLS activado sin policies en `correlativos` y `restaurante_pins` | Esperado para estas tablas internas: cliente sin grants de lectura/escritura; acceso a través de RPC controladas. | Se mantienen cerradas. No se añaden policies para silenciar el aviso. |
| Confirmación de contraseña temporal | La RPC anterior permitía apagar `debe_cambiar_password` sin comprobar un cambio en Supabase Auth. | `20261104065733_confirmar_password_auth_trigger.sql` guarda una huella privada del hash de Auth al marcar la clave temporal; la RPC solo confirma tras un hash distinto. El reset administrativo usa marcadores de preparación y finalización para cerrar la carrera entre PostgREST y Auth. La QA SQL cubre el intento directo y los estados intermedios; falta una prueba HTTP con una sesión real. |
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
- `supabase/qa/matriz_roles_rollback.sql` agrega 36 rechazos verificables: 13
  intentos del administrador A contra un restaurante B (pedidos, ítems, cobros,
  caja, PIN y consultas); 10 intentos de cocina, 6 del mesero y 7 del cajero
  contra operaciones fuera de su rol. Comprueba que las consultas propias sigan
  disponibles y que pedidos, cuentas, caja, PIN e ítems no cambien tras los
  intentos denegados. Usa identidades y datos inventados y termina en rollback.
  Se ejecuta con `npm run verificar:sql` sobre PostgreSQL aislado en PGlite.
- Esta matriz prueba la lógica SQL con claims simulados, no sustituye una prueba
  HTTP con tokens reales de Auth ni garantiza que una Edge Function respete las
  mismas reglas. Las RPC auxiliares como `validar_acceso_restaurante` se cubren
  parcialmente mediante las RPC de negocio; su implementación confirma estado
  de suscripción y actividad, pero por diseño no comprueba pertenencia al
  restaurante. La consulta protegida siempre debe añadir esa comprobación.
- El proyecto Supabase registró la migración como `20261102081247`; el archivo
  local usa esa misma versión. Consultas posteriores confirmaron la policy
  `anon`, grants acotados, cero filas globales para admin de restaurante y
  lectura completa para superadmin. Se volvieron a consultar los asesores: ya
  no aparece `multiple_permissive_policies`.
- La organización figura en el plan Free, sin respaldo administrado/PITR al
  momento de la revisión. Se generó un dump completo privado de producción y se
  restauró correctamente en PostgreSQL 17.6 aislado. El archivo se excluye de
  Git; todavía falta una copia cifrada fuera de esta computadora y definir
  frecuencia/retención. Storage y secretos/configuración de proveedores se
  respaldan por separado.

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

1. Copiar el respaldo restaurado a almacenamiento cifrado fuera de este equipo;
   definir frecuencia, retención y recuperación separada de Storage/proveedores.
2. Completar pruebas HTTP con tokens Auth reales y una revisión de las Edge
   Functions; la QA SQL aislada ya cubre once RPC administrativas y 36 rechazos
   adicionales por rol y restaurante.
   La corrección SQL del bypass de `confirmar_cambio_password()` requiere además
   confirmar el recorrido con un trabajador real después del despliegue.
3. Completar la aceptación con Auth real, dos dispositivos, pagos concurrentes
   e impresora; el propietario eligió pruebas locales y rechazó staging de pago; no se creó esa rama ni se generó costo.
4. La recuperación real del administrador y la recepción del formulario comercial
   fueron confirmadas por el propietario el 4 de noviembre. Mantener la prueba
   tras cambios en Auth o en el proveedor de correo.
5. Mantener excluido el video promocional hasta actualizarlo y autorizar su
   publicación.

## Seguimiento del 5 de noviembre de 2026

La verificación posterior y dos cambios nuevos aplicados a producción se
registran en [Actualización de seguridad del 5 de noviembre](./ACTUALIZACION_SEGURIDAD_SUPABASE_2026-11-05.md).
