# Limitaciones conocidas — Mesora 1.0

Este documento separa las capacidades verificadas en software de las condiciones que dependen de cada local o de hardware físico.

## Impresión

- **La impresión automática es opcional.** Requiere una computadora Windows vinculada a Mesora, el agente local en ejecución y una impresora instalada y asignada a Cocina o Barra.
- “Enviado a la cola del sistema operativo” significa que Windows aceptó el trabajo; no prueba que la impresora imprimió ni que salió papel.
- No se ha documentado evidencia de una prueba física de ticketera térmica de 58 mm y 80 mm para esta edición. Esa validación debe hacerse en el local con una persona presente.
- La impresión manual usa el diálogo del navegador. El tamaño de papel, márgenes, escala y dispositivo dependen también del navegador, controlador e impresora.
- La impresora de oficina puede servir para revisar el flujo, pero no valida el corte, ancho ni formato físico de una ticketera térmica.
- El respaldo automático de KDS a impresora está desactivado. No asumir que una impresora tomará el trabajo si falla una pantalla.

## Operación y conectividad

- El modo real necesita conexión con Supabase. No hay cola offline general que sincronice pedidos o pagos al recuperar Internet.
- Si una operación queda sin respuesta, espera la reconciliación de Mesora y consulta el estado antes de repetirla.
- El modo local es una herramienta de QA y el modo demo usa datos de ejemplo; ninguno sustituye pruebas con los permisos y configuración real del restaurante.
- La disponibilidad de una estación depende de la configuración vigente. Una estación configurada solo para impresora no necesariamente presenta una pantalla KDS.

## Comprobantes, productos e historial

- Mesora genera **recibos internos**, no boletas electrónicas SUNAT ni comprobantes fiscales. El restaurante mantiene su sistema de facturación electrónica.
- La categoría o estación de algunos registros históricos puede reflejar la configuración existente al momento de su creación; no reinterpretar el historial con reglas nuevas.
- Los productos con asignación histórica explícita conservan prioridad sobre la regla simple por bebida. La estación Otros se mantiene por compatibilidad.
- La subida de imágenes depende de la función firmada de Cloudinary y de secretos correctamente configurados en el servidor. Esos secretos nunca deben configurarse como variables públicas `VITE_*`.

## Reportes y administración

- Los reportes muestran las métricas para las que existen datos confiables; no representan ingresos de Mesora ni facturación fiscal.
- Cambios de modalidad de cobro se aplican a operaciones nuevas y no reescriben los recibos o pagos históricos.
- Las acciones visibles dependen de rol, estado activo, autorización individual y configuración del restaurante.
- La aceptación del piloto es por local: usuarios, modalidades, conexiones, impresoras y procedimientos pueden diferir.

## Funciones fuera del alcance de v1.0

Esta versión no documenta como disponibles módulos de delivery, repartidores, parrilla ni empaque. Tampoco promete funcionamiento offline, impresión física certificada o integración de facturación electrónica.

## Próximos controles recomendados

1. Validar una ticketera de 58 mm y una de 80 mm desde el navegador y, si se habilita, desde el agente Windows.
2. Repetir el flujo de piloto con cuentas y mesas reservadas, sin ventas de clientes.
3. Mantener el runbook de backup/restauración y comprobar periódicamente una restauración aislada.
4. Registrar cualquier función futura nueva como cambio de versión, con fuente de datos, permisos y pruebas verificables.
