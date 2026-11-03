# Preparación del primer piloto de Mesora

Revisión: **3 de noviembre de 2026**. Estado: versión web de Mesora publicada;
siguen pendientes la activación de recuperación por correo, un respaldo
restaurable y la aceptación del primer turno real.

## Cierre técnico y dirección elegida

- CI de GitHub aprobada para el commit `8cc8a06`: instalación SQL reproducible,
  suite SQL, reglas de negocio, TypeScript, precuenta, configuración y build.
  [Ejecución verificada](https://github.com/Benchi2312/Mesora/actions/runs/41103477386).
- El proyecto de Vercel se renombró a `mesoraapp`; su alias de producción es
  `https://mesoraapp-benchi1.vercel.app`.
  Sus cuatro variables de producción ya están preparadas en Vercel: URL/key
  pública de Supabase, modo local desactivado y diagnóstico activado.
- Supabase Auth usa `https://mesoraapp-benchi1.vercel.app` como Site URL y permite la
  redirección exacta `/restablecer`. Las URL anteriores siguen admitidas durante
  la transición.
- GitHub y Vercel conectados; `main` es la rama de producción. Node 22 y build
  reproducible configurados. El check `build` de CI condiciona la asignación del
  dominio y una comprobación pública se ejecuta después de cada publicación.
- Dominio de producción: `https://mesoraapp-benchi1.vercel.app`. La versión y el
  resultado de cada publicación quedan registrados en Deployments de Vercel
  y en los workflows CI / Verificar despliegue de GitHub.
- La organización Supabase está en Free; se volvió a consultar backups y la
  lista sigue vacía, con PITR desactivado. No se ha creado un respaldo real.

## Trabajo terminado

| Área | Resultado y evidencia |
| --- | --- |
| Precuenta | Desde mesa, cierre y caja de administrador/cajero. Lectura actualizada, impresión de 80 mm y PDF paginado; no cobra ni libera mesas. 24 escenarios aprobados. |
| Datos del local | Validación real/local/demo, seis campos permitidos, persistencia y dominio opcional. QA REST/navegador y SQL con rollback aprobados. |
| Permisos SQL | Revocado EXECUTE de PUBLIC/anon sobre funciones de negocio; helpers internos restringidos y search_path fijo. Eliminados los 25 avisos de funciones privilegiadas anónimas y cuatro de search_path mutable. |
| Consultas pendientes | Dos RPC agregan en SQL y excluyen cuentas pagadas. Eliminada la descarga del historial completo. Prueba aislada con 1205 pedidos sin truncar totales. |
| Índices | Resueltos los 14 hallazgos de claves foráneas sin índice de cobertura, incluida mesa/zona. |
| Instalador | Reparado el schema base comentado accidentalmente. 28 piezas SQL ordenadas instalan 19 tablas en PostgreSQL aislado con pgcrypto real; circuito, seguridad de recuperación y restauración aislada aprobados. |
| Recibo de pago | Vista y PDF dicen RECIBO INTERNO DE PAGO y aclaran que no sustituye el comprobante electrónico del local. Mesora no tiene integración fiscal de emisión/aceptación. |
| Auth | Registro público desactivado y contraseña mínima de ocho caracteres. Alta de usuarios mediante funciones administrativas. |
| Cuentas desactivadas | Pantalla de acceso bloqueado con cierre de sesión, en lugar de una vista operativa vacía. Regresión con Auth/REST simulados incluida en CI. |
| Contraseña temporal | Evitada la lectura atrasada del perfil al recibir USER_UPDATED, que podía restaurar el flag anterior después de confirmar el cambio. Tres escenarios de acceso con Auth/REST simulados aprobados. |
| Diagnóstico | Solo categoría, ruta canónica y contexto. Emisión de prueba encontrada en logs PostgreSQL. No hay alertas automáticas ni guardia asignada. |
| Dependencias | Actualizaciones compatibles; npm audit completo y de producción sin vulnerabilidades conocidas al revisar. |
| RLS y políticas | Aplicada `20261102081247_acotar_politicas_rls_piloto.sql`. En Supabase, la policy pública quedó solo para anon; los grants públicos se limitan a precio/correo/teléfono de la landing. Los usuarios autenticados del restaurante ya no leen la configuración global; las policies de catálogo/mesas están separadas por operación. |

### Migraciones aplicadas al proyecto Mesora

Aplicadas y verificadas en Supabase Mesora; otra base existente solo necesita
las que aún no tenga, después de revisar esquema y respaldo:

1. `20261022120000_password_recovery.sql`
2. `20261029052901_datos_local_dominio.sql`
3. `20261030173318_seguridad_rpc_piloto.sql`
4. `20261030173320_consultas_pendientes_piloto.sql`
5. `20261030173503_diagnostico_piloto.sql`
6. `20261030173925_indice_mesas_zona.sql`
7. `20261031073322_reporte_ventas_y_snapshot_bebidas.sql`
8. `20261031075708_reporte_ventas_dashboard.sql`
9. `20261102081247_acotar_politicas_rls_piloto.sql`
10. `20261103032730_admin_email_recovery.sql`

La migración anterior está aplicada al proyecto real y figura en su historial.
El instalador `TODO_EN_UNO.sql` incluye
las fuentes versionadas para una base nueva, pero no se usa para actualizar una
base con datos.

El instalador completo se probó en una base vacía aislada;
**no se ejecutó sobre la base real con datos**. Las pruebas SQL de negocio
contra el proyecto real crearon fixtures en una transacción y terminaron con
rollback. No dejaron ventas, pagos, anulaciones ni turnos de prueba persistidos.

## Pendientes para autorizar el primer turno

| Prioridad | Falta | Criterio de cierre |
| --- | --- | --- |
| P0 | Respaldo recuperable real | La API devolvió lista de backups vacía y PITR desactivado. El plan Free no incluye backups administrados; faltan la contraseña PostgreSQL y las herramientas locales para una exportación lógica. Restaurar y registrar responsable, frecuencia y pérdida máxima aceptable; PGlite no certifica producción. |
| P0 | Aceptación con cuentas reales y dos dispositivos | Login por rol, contraseña temporal, pedido/cocina, precuenta, cobro concurrente, anulación con PIN y arqueo en el local. Registrar resultado y tiempos. El propietario eligió pruebas locales; no se creó staging de pago. |
| P0 | Impresora y operación | Probar papel de 80 mm, impresora real, móvil y caja. Asignar encargado, soporte y contingencia sin internet. |
| P0 | Activar recuperación del admin por correo | Migración aplicada, Edge Function desplegada, dominio/redirect de Auth actualizados y UI publicada; falta configurar Resend y el remitente en secretos de Supabase, probar una entrega real y que cada admin verifique su dirección. |
| P0 | Contacto comercial definitivo | La landing muestra `contacto@mesora.invalid`, un marcador que no recibe mensajes. Reemplazarlo por un correo real antes de captar solicitudes. |
| P1 | Seguimiento | Asignar revisión de logs y escalamiento. Habilitar protección de claves filtradas si está disponible en el plan. |

**Acuerdo del propietario (30/10/2026):** el restaurante mantendrá su sistema
actual de facturación electrónica mientras Mesora gestiona pedidos y caja.
Este punto queda definido; se debe conciliar ambos registros durante el turno.
El propietario confirmó que todavía no están preparados el respaldo restaurado
ni la validación del local. Esos requisitos continúan pendientes.
Posteriormente autorizó publicar la versión y automatizar `main`, dejando
expresamente el correo para después. Publicar no cierra las pruebas presenciales
ni acredita un respaldo restaurado.

Una preview puede conectar al mismo proyecto real. **Su URL no aísla los
datos**: usar el demo para mostrar y pruebas locales para validar cambios. No crear operaciones ficticias en producción. No crear ventas ficticias en el local operativo.

### Recuperación: límite conocido

La RPC `confirmar_cambio_password` y el reset administrativo están presentes.
La recuperación del admin está implementada con un correo alternativo
verificado, token de un solo uso y entrega mediante Resend. Aún requiere
configuración de secretos y prueba de entrega real. Los trabajadores dependen
del restablecimiento que inicia el administrador desde Personal.

## Evidencia automatizada

| Comando / archivo | Resultado y alcance |
| --- | --- |
| `npm run verificar` | 510 checks aprobados del backend local y su persistencia. |
| `npm run verificar:precuenta` | 24 escenarios a 390/1280 px: PDF/impresión, error de lectura, cambio entre lecturas, roles y cobro posterior. |
| `npm run verificar:configuracion` | Validación, payload REST simulado, RPC pendientes, metadatos de diagnóstico y persistencia demo aprobados. |
| `npm run verificar:responsive` | 438 checks en 360, 390, 768 y 1280 px aprobados; incluye solapamientos de botones y guía móvil. |
| `npm run verificar:despliegue -- https://mesoraapp-benchi1.vercel.app` | Smoke público de 13 rutas, incluida la pantalla de verificación; sin login ni escrituras en Supabase. |
| `npm run verificar:sql` | Instalación vacía, permisos, migración RLS sobre policies previas, flujo SQL, 1205 pedidos y restauración aislada aprobados. Simula Auth; no prueba correo ni dos terminales concurrentes. |
| `npm run build` | TypeScript y build de producción aprobados. |
| `supabase/qa/seguridad_rpc_rollback.sql` | Anónimo rechazado, helpers privados, servicio autorizado y precio público comprobados. |
| `supabase/qa/politicas_catalogo_rollback.sql` | Reconstituye las policies previas, comprueba la exposición conocida, aplica la migración real, valida alcance por rol y rechazo de 11 RPC admin; rollback completo en PostgreSQL aislado. |
| `supabase/qa/flujo_piloto_rollback.sql` | En base real: apertura, comandas, cocina, PIN, precios manipulados, pago dividido/propina/vuelto, doble cobro, devolución única, arqueo y usuario desactivado. Todo revertido. |
| `supabase/qa/datos_local_rollback.sql` | En base real: guardado administrativo y restricciones por rol/restaurante. Todo revertido. |

Los scripts SQL requieren acceso de mantenimiento y revisión previa; no forman
parte del instalador ni sustituyen el login real de Auth.

### Revisión de seguridad y avisos vigentes

El 2/11/2026 se consultaron los asesores del proyecto Supabase Mesora. El
detalle técnico, alcance de los permisos y revisión del historial Git están en
[REVISION_SEGURIDAD_SUPABASE.md](./REVISION_SEGURIDAD_SUPABASE.md).

- **Hallazgo corregido en producción:** la policy pública
  de `configuracion_global` también alcanzaba a `authenticated`, que tiene
  permiso de lectura a nivel de tabla. Un administrador de restaurante podía
  leer la fila completa, incluidos correo/teléfono de soporte e información
  global. También se detectó que `anon` tenía SELECT de tabla, aunque la landing
  solo usa precio y datos de contacto. La migración limita la policy a `anon`
  y sus grants a esos tres campos. Las comprobaciones posteriores confirmaron
  acceso de la landing, cero filas para admin de restaurante y lectura completa
  para superadmin.
- **Avisos de policies permisivas superpuestas:** bajaron de 31 a 0 al retirar
  `FOR ALL` del catálogo/mesas y limitar los roles. Supabase explica que estas
  policies se combinan y pueden solaparse: [guía RLS](https://supabase.com/docs/guides/database/postgres/row-level-security),
  [linter `multiple_permissive_policies`](https://supabase.com/docs/guides/database/database-linter?lint=0006_multiple_permissive_policies).
- **31 funciones `SECURITY DEFINER` ejecutables por `authenticated`, ninguna
  por `anon`.** El catálogo confirma `search_path` fijado. Las RPC de negocio y
  helpers requieren ejecución autenticada; los roles se verifican en sus
  funciones. El aviso seguirá visible hasta mover helpers fuera del esquema
  expuesto o rediseñar sus permisos. La QA aislada ya verifica que once RPC
  administrativas/superadmin rechacen una sesión de mesero; todavía falta la
  matriz negativa completa de las funciones autenticadas restantes.
- **Dos tablas sin policies RLS:** `restaurante_pins` y `correlativos`; son de
  uso interno de RPC y los grants al cliente están revocados. No abrir su
  lectura para silenciar el aviso.
- **19 índices sin uso observado.** El tráfico del piloto es insuficiente para
  decidir su eliminación.
- **Protección de contraseñas filtradas de Auth desactivada.** Habilitarla si
  está disponible en el plan y validar el flujo de cambio/recuperación.

## Matriz de aceptación del restaurante

Registrar fecha, URL/proyecto, commit, operador, dispositivo, resultado y
tiempo. Usar cuentas de prueba autorizadas; como no existe staging, acordar cómo validar concurrencia sin introducir ventas ficticias en producción.

| Escenario | Resultado esperado |
| --- | --- |
| Login por rol y cambio cajero → administrador | Cuenta, vista y restaurante correctos; salir invalida la sesión anterior. |
| Contraseña temporal y reintento de confirmación | Cambio sin bucle y nuevo ingreso correcto. |
| Dos comandas con notas/bebidas | Cocina/barra reciben ítems; total acumulado correcto. |
| Editar/anular ítem con PIN válido/incorrecto | Autorización y auditoría; anulado no suma. |
| Precuenta desde mesa, cierre y caja | Vista, PDF e impresora coinciden; no altera ventas/mesas. |
| Nuevo consumo tras precuenta | Actualizar incorpora el consumo; cobro usa importe vigente. |
| Dos terminales cobran una mesa | Una sola venta; la otra informa el estado real. |
| Efectivo, tarjeta, Yape/Plin, dividido y propina | Pagos, vuelto y arqueo concilian al céntimo. |
| Anular cobro y repetir | Un solo reembolso, PIN previo y confirmación comprensible. |
| Cerrar turno con/sin pendientes | Arqueo correcto; pendientes continúan pendientes. |
| Corte de red al cobrar | Verificar si se pagó antes de repetir; ningún duplicado. |
| Usuario ajeno/desactivado o sin sesión | Backend rechaza incluso invocación directa. |

Objetivos iniciales: p95 de lectura menor a 3 s y cobro/anulación menor a
10 s con conexión estable. Son objetivos, no mediciones certificadas.

## Entrega y operación

Seguir [OPERACION_PILOTO.md](./OPERACION_PILOTO.md). Un restaurante, primer turno
acompañado en baja demanda y conciliación diaria durante 3 a 7 días.
La entrega que reemplaza el piloto se registra en `main`; Vercel despliega al
actualizar esa rama. El smoke de 13 rutas se ejecuta después de la publicación.

### Pendientes después del primer piloto

Estas tareas quedan fuera del lanzamiento inicial y se deben retomar después
de completar el primer piloto y decidir con el restaurante que el sistema está
listo para presentarse públicamente:

| Estado | Tarea | Criterio de cierre |
| --- | --- | --- |
| Pendiente tras el piloto | Revisar hallazgos de código y operación | Consolidar incidencias y solicitudes del turno; priorizar y corregir los bloqueos; repetir build, QA afectado, seguridad y aceptación antes de ampliar el uso. Los riesgos técnicos conocidos de esta auditoría siguen listados arriba. |
| Pendiente tras el piloto | Actualizar el video promocional | Grabar la versión desplegada y aceptada, actualizar guion/capturas/URL, retirar cifras o etiquetas de demo que ya no correspondan y revisar afirmaciones de producto antes de reemplazar el video actual. |
| Pendiente antes de captar solicitudes | Contacto comercial real | Reemplazar `contacto@mesora.invalid` por el correo definitivo. |
| Pendiente tras el piloto | Actualizar el video promocional | Grabar la versión desplegada y aceptada, actualizar guion/capturas/URL y revisar las afirmaciones del producto antes de reemplazar el video. |

El video actual es material de la demo y no representa todavía la versión
publicada. El video queda fuera del repositorio hasta que se actualice. La
revisión de 19 commits no encontró credenciales conocidas; `promocional/` está
excluido. El repositorio es público y todavía no declara una licencia. No subir
datos de acceso, copias de respaldo ni información operativa del restaurante.

La migración RLS y la nueva migración de recuperación están aplicadas a
Supabase. La rama `main` está conectada a Vercel para despliegue automático.
Quedan como bloqueos del primer turno: respaldo restaurable, aceptación real en
el local, remitente verificado para recuperación y pruebas físicas de impresora.
