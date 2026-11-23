# Manual de usuario — Mesora 1.0

## Propósito

Mesora coordina el trabajo del restaurante desde la mesa hasta la preparación y el cobro. La cuenta del usuario determina las funciones disponibles; cada restaurante opera con sus propios datos.

## Ingreso

1. Abre el sitio que te proporcionó el responsable del restaurante.
2. Inicia sesión con tu cuenta asignada.
3. Mesora abre el panel correspondiente a tu rol. Si el acceso está inactivo o la suscripción del restaurante bloquea la operación, solicita ayuda al administrador.
4. Cierra sesión al terminar tu turno, especialmente en equipos compartidos.

El demo se encuentra en `/demo`; no requiere cuenta y utiliza datos de ejemplo.

## Puesta en marcha del restaurante

El administrador del restaurante prepara la operación antes del turno:

1. Revisa los datos y horarios del local.
2. Crea zonas y mesas.
3. Crea categorías y productos con nombre, precio y categoría, y marca si son bebidas.
4. Invita o registra al personal con su rol correcto y confirma que esté activo.
5. En **Configuración operativa**, elige quién puede cobrar y cómo recibirán comandas Cocina y Barra.
6. Abre **Auditoría** para revisar cambios sensibles cuando sea necesario.

Los productos con estación histórica explícita mantienen esa regla. En productos sin asignación histórica, la marca de bebida dirige la comanda a Barra; los demás productos van a Cocina. La estación **Otros** se conserva para compatibilidad de datos existentes.

## Abrir caja

El cajero autorizado abre su turno desde **Caja** y registra el fondo inicial contado. No abras un segundo turno. Durante el turno, revisa movimientos y efectivo esperado; al finalizar, ingresa el efectivo contado y completa el arqueo. El cierre conserva observaciones y diferencia.

## Mesero: tomar y enviar pedidos

1. Entra a `/mesero` y elige una mesa disponible.
2. Agrega productos, cantidades y observaciones.
3. Revisa el resumen y envía la comanda.
4. Espera la confirmación. Si se pierde la respuesta, Mesora conserva la clave de la solicitud para que el reintento seguro no cree otra comanda.
5. En una mesa ocupada, puedes agregar otra comanda legítima; será distinta de la anterior.
6. Consulta la precuenta para revisar el consumo. La precuenta **no** es comprobante de pago ni libera la mesa.

Para modificar un ítem abierto, usa las acciones disponibles. La anulación solicita motivo; si el restaurante configuró PIN, también lo solicitará. Los pedidos e historial no se borran.

### Trasladar consumo o cambiar responsable

- **Mover consumo** solo permite una mesa de destino disponible. Confirma que sea la mesa correcta; ingresa motivo y PIN si el flujo lo requiere.
- **Pasar mesa a otro mesero** cambia el responsable operativo. Las comandas históricas conservan a quien las registró.
- Si una respuesta tarda o se pierde, no repitas la operación. Mesora debe reconciliar el estado; actualiza y verifica ambas mesas antes de volver a intentar.
- Las operaciones quedan auditadas.

## Cocina y Barra: preparar

Abre `/cocina`. Si tu restaurante tiene más de una estación habilitada, selecciona Cocina, Barra u Otros. Revisa las comandas asignadas a esa estación y avanza únicamente por los estados que permite la pantalla: pendiente, en preparación, listo y entregado.

Barra no tiene una ruta independiente. Si una estación está configurada solo con impresora, no esperes verla como una cola KDS; la comanda puede quedar en la salida manual de impresión.

## Cobrar y emitir recibo interno

El cajero o mesero solo puede cobrar si está autorizado por la modalidad vigente. Cocina no cobra. La cuenta se paga desde Caja o desde el flujo autorizado de la mesa:

1. Revisa la cuenta y los pedidos incluidos.
2. Selecciona el método o desglose de pago disponible.
3. Confirma el cobro y revisa el recibo interno.

El recibo interno es un registro de Mesora, no una boleta electrónica SUNAT. Si se anula un recibo, la operación queda en el historial y no vuelve a la lista cobrable. No intentes crear un segundo cobro para corregir una operación anulada.

## Impresión

### Manual

Abre la salida de la estación y selecciona **Imprimir** para mostrar la vista y el diálogo del navegador. Verifica visualmente la selección de impresora y papel. Abrir el diálogo o enviar el trabajo a la cola no prueba que haya salido papel. Las reimpresiones se registran según la regla del sistema y pueden requerir motivo.

### Automática (opcional)

El administrador puede vincular una computadora Windows, asignar impresoras a Cocina y Barra y activar el envío de comandas nuevas. Requiere que la computadora y el agente estén configurados y disponibles. El agente informa el envío a la cola del sistema operativo; esto no confirma la impresión física. Revisa [Limitaciones conocidas](./LIMITACIONES_CONOCIDAS.md) antes de activarlo.

## Reportes

Desde Admin, abre **Reportes** para elegir un mes o rango, filtrar por mesero/producto cuando esté disponible, comparar periodos y exportar el reporte que necesitas a CSV. Los reportes son actividad del restaurante; no son ingresos de Mesora. La interpretación de registros históricos depende de los datos guardados al momento de la operación.

## Auditoría, soporte y Superadmin

- El administrador del restaurante revisa las acciones de su local en **Auditoría**.
- **Soporte** permite conversar con el equipo de plataforma; el contador representa mensajes individuales no leídos.
- **Superadmin** administra el servicio a nivel plataforma, revisa restaurantes, suscripciones, usuarios, soporte, notificaciones y auditoría global conforme a sus permisos. No es un rol operativo de restaurante.

## Si algo no coincide

No repitas cobros, anulaciones, traslados ni envíos mientras una operación esté pendiente de confirmar. Actualiza la vista, comprueba la mesa/cuenta y comunica el incidente al administrador con hora aproximada y captura sin datos de acceso.
