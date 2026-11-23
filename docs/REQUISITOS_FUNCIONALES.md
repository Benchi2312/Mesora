# Requisitos funcionales — Mesora 1.0

Este documento describe comportamientos disponibles en la versión documentada. La modalidad contratada y la configuración de cada restaurante pueden habilitar solo una parte de ellos.

## Acceso y administración

- **RF-01:** autenticar usuarios y dirigirlos al panel según su rol.
- **RF-02:** impedir que usuarios inactivos operen y proteger las rutas por rol.
- **RF-03:** aislar consultas y escrituras por restaurante en backend y RLS.
- **RF-04:** permitir al administrador gestionar datos del local, zonas, mesas, menú, personal y configuración operativa de su restaurante.
- **RF-05:** conservar registros históricos al desactivar personal o anular operaciones.

## Mesas, menú y pedidos

- **RF-06:** crear y consultar mesas por restaurante y estado.
- **RF-07:** crear productos con nombre, precio, categoría y clasificación de bebida; admitir una imagen si la integración de almacenamiento está configurada.
- **RF-08:** crear comandas con cantidades y observaciones. Una clave persistente de idempotencia evita duplicar la misma solicitud; una mesa puede recibir nuevas comandas legítimas.
- **RF-09:** resolver la estación usando la asignación explícita histórica cuando existe; en caso contrario, enviar bebidas a Barra y los demás productos a Cocina.
- **RF-10:** conservar en la comanda el destino que le corresponde al momento de crearla; los cambios posteriores aplican a comandas nuevas.
- **RF-11:** permitir revisar, editar y anular ítems abiertos conforme a permisos, motivo y PIN configurado.

## Preparación

- **RF-12:** mostrar en `/cocina` las estaciones disponibles y las comandas destinadas a cada una.
- **RF-13:** permitir transiciones de preparación autorizadas y guardar el estado por estación.
- **RF-14:** presentar salidas manuales de impresión cuando la configuración las genere.
- **RF-15:** impedir preparar o imprimir salidas asociadas a cuentas anuladas y conservar la trazabilidad.
- **RF-16:** permitir solicitar impresión manual desde el navegador sin afirmar que el papel salió.
- **RF-17:** habilitar opcionalmente un agente Windows para enviar comandas nuevas a impresoras configuradas.

## Caja, cobros y anulaciones

- **RF-18:** abrir un turno de caja con fondo inicial, consultar sus movimientos y cerrar con arqueo.
- **RF-19:** autorizar el cobro en backend de acuerdo con modalidad, usuario activo y persona seleccionada.
- **RF-20:** cobrar cuentas con los métodos disponibles, conservar el detalle de pagos y emitir un recibo interno.
- **RF-21:** generar una precuenta del consumo pendiente sin crear un pago ni liberar la mesa.
- **RF-22:** anular un recibo interno con motivo y autorización/PIN cuando corresponda, mantener el historial y excluir la venta de pendientes cobrables.
- **RF-23:** evitar recobros, duplicados y estados parciales en solicitudes repetidas o concurrentes.

## Operación de mesa y auditoría

- **RF-24:** mover consumo únicamente a un destino válido, con prevalidación y reconciliación de respuestas inciertas.
- **RF-25:** cambiar responsable de mesa conforme a los permisos vigentes, conservar el autor histórico de las comandas y registrar motivo.
- **RF-26:** registrar en auditoría acciones sensibles y cambios relevantes con actor y referencias disponibles.

## Reportes y plataforma

- **RF-27:** filtrar reportes del restaurante por mes o rango; comparar periodos y consultar ventas, cuentas, meseros, productos y categorías disponibles.
- **RF-28:** exportar reportes filtrados en CSV compatible con Excel.
- **RF-29:** permitir al Superadmin administrar la plataforma y atender conversaciones de soporte con contador de mensajes no leídos.
- **RF-30:** ofrecer una ruta de demo aislada con datos de ejemplo y sin escrituras en Supabase.

## Criterios de negocio

- Los importes y estados se basan en las operaciones y definiciones almacenadas por el sistema; un recibo interno no es una boleta electrónica SUNAT.
- No se deben inferir ingresos de Mesora a partir de las ventas procesadas por restaurantes clientes.
- Los reportes históricos pueden depender de la información capturada al crear el pedido o cuenta.
- Una operación cuyo resultado de red sea incierto debe consultarse antes de permitir un nuevo intento.
