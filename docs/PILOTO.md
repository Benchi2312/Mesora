# Preparación del primer piloto de Mesora

Revisión: **30 de octubre de 2026**. Estado: versión candidata para validación
del restaurante. El propietario autorizó publicar en Vercel e integrar a
`main`; la aceptación presencial del primer turno sigue pendiente.

## Cierre técnico y dirección elegida

- CI de GitHub aprobada para el commit `8cc8a06`: instalación SQL reproducible,
  suite SQL, reglas de negocio, TypeScript, precuenta, configuración y build.
  [Ejecución verificada](https://github.com/Benchi2312/Mesora/actions/runs/41103477386).
- El propietario eligió `https://mesora-piloto.vercel.app` para el piloto.
  Sus cuatro variables de producción ya están preparadas en Vercel: URL/key
  pública de Supabase, modo local desactivado y diagnóstico activado.
- La redirección exacta `/restablecer` del dominio elegido está admitida en
  Supabase Auth, junto con la preview. Config push/diff confirmó el cambio.
- GitHub y Vercel conectados; `main` es la rama de producción. Node 22 y build
  reproducible configurados. El check `build` de CI condiciona la asignación del
  dominio y una comprobación pública se ejecuta después de cada publicación.
- El despliegue público y el cambio de Site URL se realizan al final de esta
  entrega. Registrar su evidencia al terminar.
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
| Instalador | Reparado el schema base comentado accidentalmente. 24 fuentes SQL instalan 19 tablas en PostgreSQL aislado con pgcrypto real; circuito y restauración aislada aprobados. |
| Recibo de pago | Vista y PDF dicen RECIBO INTERNO DE PAGO y aclaran que no sustituye el comprobante electrónico del local. Mesora no tiene integración fiscal de emisión/aceptación. |
| Auth | Registro público desactivado y contraseña mínima de ocho caracteres. Alta de usuarios mediante funciones administrativas. |
| Cuentas desactivadas | Pantalla de acceso bloqueado con cierre de sesión, en lugar de una vista operativa vacía. Regresión con Auth/REST simulados incluida en CI. |
| Diagnóstico | Solo categoría, ruta canónica y contexto. Emisión de prueba encontrada en logs PostgreSQL. No hay alertas automáticas ni guardia asignada. |
| Dependencias | Actualizaciones compatibles; npm audit completo y de producción sin vulnerabilidades conocidas al revisar. |

### Migraciones aplicadas al proyecto Mesora

Aplicadas y verificadas en este orden; otra base existente solo necesita las
que aún no tenga, después de revisar esquema y respaldo:

1. `20261029052901_datos_local_dominio.sql`
2. `20261030173318_seguridad_rpc_piloto.sql`
3. `20261030173320_consultas_pendientes_piloto.sql`
4. `20261030173503_diagnostico_piloto.sql`
5. `20261030173925_indice_mesas_zona.sql`

El instalador completo se probó en una base vacía aislada;
**no se ejecutó sobre la base real con datos**. Las pruebas SQL de negocio
contra el proyecto real crearon fixtures en una transacción y terminaron con
rollback. No dejaron ventas, pagos, anulaciones ni turnos de prueba persistidos.

## Pendientes para autorizar el primer turno

| Prioridad | Falta | Criterio de cierre |
| --- | --- | --- |
| P0 | Respaldo recuperable real | La API devolvió lista de backups vacía y PITR desactivado. Crear un respaldo, restaurarlo en otro entorno y registrar responsable, frecuencia y pérdida máxima aceptable. La restauración PGlite no certifica producción. |
| P0 | Aceptación con cuentas reales y dos dispositivos | Login por rol, contraseña temporal, pedido/cocina, precuenta, cobro concurrente, anulación con PIN y arqueo en staging. Registrar resultado y tiempos. |
| P0 | Impresora y operación | Probar papel de 80 mm, impresora real, móvil y caja. Asignar encargado, soporte y contingencia sin internet. |
| Diferido por el propietario | Recuperación por correo del administrador | Configuración SMTP, buzón real y prueba de recuperación pendientes por indicación explícita. La URL del sitio se ajusta al publicar. |
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
datos**: usar el demo para mostrar y un proyecto de staging para ensayar
operaciones que deban persistir. No crear ventas ficticias en el local operativo.

### Recuperación: límite conocido

La RPC `confirmar_cambio_password` y el reset administrativo están presentes.
La recuperación por correo usa el correo de login. Existen columnas de correo
alternativo, pero su verificación y recuperación no están implementadas.
Los trabajadores con correo interno dependen del reset administrativo; el
administrador necesita un mecanismo de recuperación acordado y probado.

## Evidencia automatizada

| Comando / archivo | Resultado y alcance |
| --- | --- |
| `npm run verificar` | 502 checks aprobados del backend local y su persistencia. |
| `npm run verificar:precuenta` | 24 escenarios a 390/1280 px: PDF/impresión, error de lectura, cambio entre lecturas, roles y cobro posterior. |
| `npm run verificar:configuracion` | Validación, payload REST simulado, RPC pendientes, metadatos de diagnóstico y persistencia demo aprobados. |
| `npm run verificar:responsive` | 332 checks en 360, 390, 768 y 1280 px aprobados. |
| `npm run verificar:sql` | Instalación vacía, permisos, flujo SQL, 1205 pedidos y restauración aislada aprobados. Simula Auth; no prueba correo ni dos terminales concurrentes. |
| `npm run build` | TypeScript y build de producción aprobados. |
| `supabase/qa/seguridad_rpc_rollback.sql` | Anónimo rechazado, helpers privados, servicio autorizado y precio público comprobados. |
| `supabase/qa/flujo_piloto_rollback.sql` | En base real: apertura, comandas, cocina, PIN, precios manipulados, pago dividido/propina/vuelto, doble cobro, devolución única, arqueo y usuario desactivado. Todo revertido. |
| `supabase/qa/datos_local_rollback.sql` | En base real: guardado administrativo y restricciones por rol/restaurante. Todo revertido. |

Los scripts SQL requieren acceso de mantenimiento y revisión previa; no forman
parte del instalador ni sustituyen el login real de Auth.

### Avisos revisados que permanecen

- 31 funciones SECURITY DEFINER invocables por authenticated: API/helpers
  necesarios; se preservaron permisos y probaron restricciones de rol/restaurante.
- Dos tablas con RLS sin políticas: `restaurante_pins` y `correlativos`,
  exclusivas de RPC. No abrir lectura para silenciar el aviso.
- 31 avisos de políticas permisivas superpuestas: consolidación gradual pendiente.
- 19 índices sin uso observado: el tráfico reducido no justifica eliminarlos.
- Protección de contraseñas filtradas de Auth desactivada.

## Matriz de aceptación del restaurante

Registrar fecha, URL/proyecto, commit, operador, dispositivo, resultado y
tiempo. Usar cuentas y datos identificados para aceptación en staging.

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
Publicar la versión al final de la entrega, según la autorización actual del
propietario. Cerrar los pendientes operativos antes de confiarle un turno real.

Trabajo en `respaldo/precuenta-piloto`, revisado mediante PR. Integrar a main
y borrar la rama al aprobar CI y verificar el despliegue autorizado. Inventario,
reservas, delivery y material promocional pueden esperar.
