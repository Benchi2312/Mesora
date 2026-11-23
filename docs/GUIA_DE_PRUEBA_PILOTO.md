# Guía de prueba piloto — Mesora 1.0

## Propósito y alcance

Validar la configuración real del restaurante con personal autorizado antes de depender de Mesora durante un turno. Ejecuta el flujo en un restaurante y mesas reservados para QA; no pruebes anulaciones, cobros ni traslados con ventas reales.

## Qué está verificado y qué falta

| Estado | Alcance |
| --- | --- |
| **Verificado en QA automatizada** | Reglas de pedidos e idempotencia, permisos de cobro, aislamiento por restaurante, enrutamiento por estación, anulaciones, reportes, auditoría y estados responsive cubiertos por las suites del repositorio. Ejecuta las suites contra el commit candidato actual. |
| **Piloto previo informado** | El propietario confirmó pruebas de cambio de responsable y un turno acompañado. Los hallazgos informados se corrigieron en versiones posteriores; repetir esta guía en cada local y configuración antes de su adopción. |
| **Opcional** | Impresión manual; agente Windows para impresión automática; pruebas ampliadas de reportes y soporte con cuentas de QA. |
| **Pendiente de aceptación física** | Confirmar salida de papel con una ticketera real de 58 mm y otra de 80 mm, instalar/vincular el agente Windows y verificar un turno con el personal del local. No hay evidencia de esa validación física en esta guía. |

Las suites simuladas no sustituyen aceptación presencial, comprobación del hardware ni pruebas de la configuración Supabase del restaurante.

## Preparación segura

1. Designa un responsable del piloto y acuerda el horario, el alcance, el método de reversión y el teléfono de soporte interno.
2. Confirma que el entorno y los datos estén reservados para pruebas, sin mesas con ventas reales activas.
3. Crea cuentas de prueba separadas y asigna únicamente los roles necesarios:

   | Rol | Marcador local |
   | --- | --- |
   | Admin Restaurante | `ADMIN_EMAIL`, `ADMIN_PASSWORD` |
   | Mesero | `MESERO_EMAIL`, `MESERO_PASSWORD` |
   | Cocina y Barra | `COCINA_EMAIL`, `COCINA_PASSWORD` |
   | Cajero | `CAJA_EMAIL`, `CAJA_PASSWORD` |

   Completa los valores solo en un archivo local ignorado por Git, por ejemplo `.env.test.local`. No pegues credenciales en issues, chat, capturas ni documentación. Barra es una estación de la cuenta de Cocina.

4. Verifica que las cuentas estén activas y que cada una pertenezca al restaurante de prueba.
5. Respalda los datos del entorno siguiendo el runbook autorizado. No guardes dumps ni claves en este repositorio.
6. Define una mesa libre de prueba y otra libre como destino de traslado. Vuelve a comprobar ambas antes de usarlas.
7. Registra el commit, fecha, responsable y ambiente en el acta local del piloto; no anotes claves ni datos de clientes.

## Recorrido recomendado

### A. Administración

- Iniciar sesión como Admin y confirmar el restaurante activo.
- Revisar nombre/datos del local, mesas, zonas y personal de prueba.
- Configurar modalidad de cobro y elegir solo personal activo compatible.
- Configurar Cocina y Barra: pantalla, impresora manual o ambas, según el hardware y el procedimiento de la prueba.
- Confirmar que la política de impresión automática permanezca desactivada si todavía no se validó el agente.

### B. Caja, pedido y preparación

- Abrir turno de prueba con fondo inicial documentado.
- Entrar como Mesero; elegir la mesa libre reservada.
- Crear una comanda con un producto asignado a Cocina y otro a Barra, cantidades y una nota.
- Enviar una sola vez; confirmar que cada estación vea solo sus productos y que no haya duplicados.
- Si se simula pérdida de respuesta, reintentar el mismo borrador con la misma clave de idempotencia; no crear otro pedido para “comprobar”.
- En Cocina y Barra, avanzar únicamente los estados permitidos y confirmar independencia por estación.
- Crear una segunda comanda legítima desde el mismo consumo y verificar que el historial las conserva por separado.

### C. Cambios auditados y cobro

- En un conjunto de datos reservado, probar mover consumo a la mesa destino libre con motivo y PIN si lo exige la configuración.
- Probar cambio de responsable a otro mesero activo con motivo y PIN según la regla vigente.
- Verificar la mesa de origen, la de destino y los eventos de auditoría antes de continuar.
- Anular un ítem de prueba con motivo; ingresar el PIN si está configurado. Comprobar que el producto ya no se cobre ni aparezca en preparación activa y que la auditoría conserve el motivo.
- Consultar la precuenta y confirmar que está identificada como vista previa, no como comprobante de pago.
- Cobrar con un usuario autorizado por la modalidad y revisar el recibo interno.
- Si se probará anulación de recibo, utilizar una cuenta de prueba independiente. Confirmar que conserva historial, auditoría y que no vuelve a Caja. No anules una venta real.
- Revisar arqueo, movimientos y cierre del turno de prueba.

### D. Reportes, impresión y soporte

- Abrir Reportes, probar un periodo con ventas, otro sin ventas, filtros y CSV. Verificar que las cifras correspondan al restaurante de prueba.
- En impresión manual, revisar vista, ancho, estación y copias. El operador debe observar el resultado físico; el navegador no lo confirma.
- Solo si se autorizó prueba de agente, vincular la PC Windows y probar cada impresora por separado. Confirmar el envío a cola y, manualmente, el papel.
- Con cuentas de QA, abrir un ticket y revisar conversación/contador de mensajes no leídos. No escribas a conversaciones reales.

## Criterios de aceptación

Marca cada punto como **PASS**, **FAIL** o **BLOQUEADO** y agrega evidencia sin credenciales:

- [ ] Cada cuenta entra únicamente a las funciones de su rol.
- [ ] Los datos de otro restaurante no aparecen ni son modificables.
- [ ] La comanda se registra una vez y conserva sus observaciones.
- [ ] Cocina y Barra reciben solo sus productos y mantienen estados independientes.
- [ ] Reintentos inciertos no crean pedidos, cobros ni auditoría duplicados.
- [ ] Traslados y cambio de responsable validan destino, motivo/PIN y auditoría.
- [ ] Anular un ítem o recibo conserva historial y bloquea el cobro cuando corresponde.
- [ ] El recibo interno, el efectivo esperado, el arqueo y el cierre coinciden con los datos de prueba.
- [ ] Reportes y exportaciones respetan el periodo y restaurante seleccionados.
- [ ] Impresión manual/automática: registrar separado el resultado del software y la comprobación física del papel.
- [ ] No hay desbordamientos ni errores bloqueantes en móvil, tablet y escritorio.

Si una escritura devuelve timeout o resultado incierto, detente y consulta el estado antes de reintentar. Conserva registros de prueba para investigación; no los borres ni alteres sin autorización del responsable.
