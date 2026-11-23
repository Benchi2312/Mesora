# Changelog — Mesora

## 1.0.0 — Primera versión preparada para prueba controlada

Mesora 1.0 está lista para validación con usuarios de prueba. Esta nota no certifica impresión física ni emisión fiscal.

### Incluye

- Paneles por rol para Superadmin, Admin Restaurante, Mesero, Cocina y Cajero.
- Gestión de mesas, zonas, menú, personal y configuración operativa de Cocina/Barra.
- Creación de comandas con idempotencia y enrutamiento por estación; conservación de snapshots e historial.
- KDS con estados independientes y cola de impresión manual por estación.
- Caja por turnos, permisos de cobro por modalidad, pagos, recibos internos, anulaciones y arqueo.
- Protección contra recobro de cuentas anuladas y conservación de auditoría.
- Traslado de consumo y cambio de responsable con confirmación y trazabilidad.
- Reportes por periodo, detalle de ventas, meseros, productos/categorías y exportación CSV.
- Soporte entre restaurantes y contador de mensajes individuales no leídos para Superadmin.
- Agente local opcional de Windows para impresión automática, cuando el restaurante lo configura.
- Demo aislado, modo local de QA y documentación de operación y respaldo.

### Correcciones principales incorporadas

- Reintentos de creación de comanda seguros ante respuestas inciertas.
- Reconciliación de operaciones de mesa después de latencia o pérdida de respuesta.
- Motivo obligatorio para anular ítems; conservación de actor, fecha e historial.
- Bloqueo de impresión y recobro para operaciones asociadas a cuentas anuladas.
- Mejoras de responsive, navegación y textos operativos.
- Recuperación controlada de módulos dinámicos y estados de error más claros.

### Estado de validación

- Las reglas principales tienen verificadores automatizados locales y QA SQL en base aislada. Ejecutar las instrucciones de [verificación](../README.md#verificación-local) sobre el commit que se pretenda distribuir.
- El propietario reportó pruebas previas de cambio de responsable y de un turno acompañado; los hallazgos identificados fueron corregidos posteriormente. Repetir la guía de piloto para cada restaurante.
- La prueba física de impresoras térmicas de 58 mm y 80 mm sigue pendiente de evidencia documentada.
- La impresión automática depende del agente Windows, la vinculación de la computadora y la configuración de cada impresora; no es una función activada por defecto.

### Nota de compatibilidad

Los cambios de esquema se distribuyen como migraciones versionadas. En una base existente se aplican solo las pendientes, en orden y tras el respaldo y revisión correspondientes. No usar el instalador de base limpia para actualizar una instalación productiva.
