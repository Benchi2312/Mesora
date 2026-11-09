# Mesora 0.1.0 — candidato para piloto controlado

Estado: preparación **local**, posterior al commit de Fase 6 `2048ac4290f1bbe28f5d6a54016db52bf628447d`. Este documento no certifica una publicación ni una impresión física. La migración Fase 6, el agente Windows y el panel todavía no se han publicado en el proyecto remoto.

## Arquitectura operativa

| Componente | Responsabilidad | Comprobación disponible |
| --- | --- | --- |
| Configuración y enrutamiento (Fases 3 y 4) | El admin define estaciones, destinos y reglas que se fotografían al crear cada pedido. | SQL QA y prueba local de enrutamiento. |
| KDS (Fase 5) | Cocina y Barra ven solo sus productos y avanzan estados independientes. | Flujo local y matriz SQL. |
| Impresión manual (Fase 5) | El operador abre el ticket histórico, solicita `window.print()` y registra reimpresión con motivo. | QA de A4, 58/80 mm, doble clic y auditoría. |
| Agente Windows (Fase 6) | Reclama trabajos de impresora principal, envía a la cola instalada y confirma el resultado ante Mesora. | Adaptador simulado, SQL QA, enumeración de colas y DPAPI. |
| Base Supabase | Guarda el snapshot de destino, trabajos idempotentes, lease, intentos y auditoría por restaurante. | Instalación limpia y sobre esquema existente en PGlite. |

El agente es un proceso Node 22 separado de Vite. No expone un puerto local. Solo admite el proyecto Supabase autorizado de Mesora, utiliza una clave pública y vinculación de un solo uso, y guarda su token en DPAPI. Las tablas de trabajos y verificadores están en `private`; el frontend no incorpora el runtime del agente ni secretos de servidor. La guía de instalación y operación está en [AGENTE_IMPRESION_WINDOWS.md](AGENTE_IMPRESION_WINDOWS.md).

**“Enviado a cola” significa que Windows aceptó el trabajo; no demuestra que haya salido papel.** El operador debe comprobar papel, caracteres y corte en la ticketera. La impresora automática de respaldo tras falta de reconocimiento KDS permanece **desactivada**: aún falta política de espera, reconocimiento por estación y transición atómica a un solo trabajo de respaldo. La impresión manual sigue disponible como alternativa controlada.

## Orden seguro de migraciones

La Fase 2 es prerrequisito del configurador; los archivos se aplican en orden cronológico. No aplicar `TODO_EN_UNO.sql` a producción sobre un esquema ya migrado.

| Orden | Archivo | Requisito |
| --- | --- | --- |
| 0 | `20261108120000_sistema_operativo_configurable.sql` | Fase 2; estaciones, destinos y tablas expansivas. |
| 1 | `20261109012624_fase3_configuracion_operativa_admin.sql` | Configurador y RPC de admin. |
| 2 | `20261109024411_fase4_enrutamiento_comandas.sql` | Snapshot y enrutamiento al crear pedidos. |
| 3 | `20261109045958_fase5_kds_salida_manual_comandas.sql` | KDS y salida manual por estación. |
| 4 | `20261109061058_fase6_agente_impresion_automatica.sql` | Vinculación, cola y agente. |

Antes de cualquier cambio remoto: abrir una ventana sin escrituras, generar un respaldo **nuevo**, comprobar hash y restaurabilidad en un entorno aislado conforme a [RESPALDOS.md](RESPALDOS.md). Verificar que el proyecto vinculado sea `yyfsewgxyyqjyzcejsqq`. Ejecutar `supabase migration list --linked` y `supabase db push --linked --skip-vault --dry-run`; comparar **toda** la lista pendiente con la secuencia esperada. Si hay otra migración pendiente, detenerse y revisar. No usar `--include-all` para forzar una discrepancia de historial. Solo después, en la ventana autorizada, ejecutar `supabase db push --linked --skip-vault` y verificar RLS, RPC, pedidos y caja antes de publicar el frontend y conectar una ticketera. Estos comandos se documentan para una ventana futura; **no se ejecutaron sobre el proyecto remoto en Fase 7**.

## Reversión

1. Ante una falla de impresión automática, detener el proceso local y **revocar o desactivar** sus asignaciones desde el panel. Revisar trabajos `reclamado`, `fallido` y `enviado` y la cola de Windows antes de cualquier reimpresión. Conservar el registro y el error final.
2. Mantener los pedidos y continuar con KDS o impresión manual. Si se revierte el frontend al commit Fase 5 `76d2f68`, desactivar antes los agentes; la migración Fase 6 seguiría instalada y sus triggers podrían crear trabajos si hay asignaciones activas.
3. No ejecutar SQL inverso improvisado ni borrar tablas: las migraciones tienen datos y referencias históricas. Si hay daño de datos, congelar escrituras, preservar el estado actual y ensayar la restauración del respaldo previo en un proyecto aislado. Comparar las transacciones posteriores al respaldo y planificar un corte controlado antes de tocar producción.
4. Si falla Fase 4 o 5, revertir código por sí solo no revierte las RPC ni la ruta histórica de comandas. Aislar el incidente y preparar restauración o corrección expansiva validada; documentar la pérdida máxima de datos aceptable con el dueño del local.

## Auditoría local de publicación

- `npm audit --json` el 09/11/2026: **0** vulnerabilidades informadas (0 bajas, moderadas, altas o críticas). No se actualizaron dependencias automáticamente.
- Archivos rastreados e historial de 71 commits: sin coincidencias de alta confianza para claves privadas, claves de servidor Supabase, tokens de GitHub/Resend/OpenAI o URL PostgreSQL con contraseña. No hay archivos ignorados que sigan rastreados. La plantilla `.env.example` sí está rastreada; archivos `.env.local`, dumps y `backups/` no lo están.
- El bundle Vite local no contiene el runtime del agente, scripts PowerShell ni coincidencias para claves de servidor. Los correos comerciales previstos son públicos; el demo y las pruebas conservan correos ilustrativos en dominios con TLD reales. Revisar que ninguno apunte a un buzón de cliente antes de hacer público el repositorio.
- El escaneo por patrones no reemplaza la revisión humana de todos los datos históricos. Los cambios locales previos de README, documentación, respaldos y marca están fuera de este candidato.

## Bloqueadores antes de publicar

1. Respaldo reciente y restauración aislada verificables, con responsable, frecuencia y retención acordados.
2. Aplicación remota ordenada de las migraciones pendientes, seguida de comprobación remota de RPC, RLS, aislamiento entre restaurantes y cuentas por rol.
3. Prueba en Windows con tiqueteras reales de **58 mm y 80 mm**: cola exacta, ancho, copias, tildes, corte, reconexión y fallos de papel/controlador. Confirmar físicamente la salida; la CI usa el adaptador simulado.
4. Turno de piloto con el personal y conciliación de comandas, anulaciones, pagos y cierre de caja usando la configuración real del restaurante. El [checklist de piloto](CHECKLIST_PILOTO_FASE7.md) define la evidencia a registrar.

No se cambia la visibilidad del repositorio, la licencia, el dominio ni la marca en esta fase.
