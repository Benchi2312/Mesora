# Guía del primer turno de Mesora

Versión: 03/11/2026. URL: https://mesora-sistema.vercel.app.
Esta guía se puede leer en voz alta o con lector de pantalla. Las casillas son
un registro por completar; ninguna significa que la prueba ya se haya hecho.

## Antes de abrir

- [ ] Encargado, contacto de soporte, fecha y horario anotados en un registro
  privado del local. No subir nombres, ventas ni incidencias personales a GitHub.
- [ ] Copia externa cifrada del respaldo disponible, con responsable y frecuencia.
- [ ] Restaurante y suscripción activos, precios, bebidas, menú, zonas y mesas revisados.
- [ ] Administrador con correo real: probar «Olvidé mi contraseña», recibir el
  enlace, establecer la contraseña y volver a entrar. No compartir el enlace.
- [ ] Cuentas individuales para mesero, cocina y caja. Cambiar contraseñas
  temporales y configurar el PIN del encargado; comprobar cambio de usuario.
- [ ] Dos dispositivos conectados; activar «Aviso sonoro» en cocina y comprobar
  el volumen del dispositivo. El navegador necesita esa interacción inicial.
- [ ] Papel y conexión de la impresora de 80 mm; imprimir una precuenta y revisar
  que el texto, total y corte sean legibles. El demo permite ensayar sin ventas reales.
- [ ] Disponer de un registro manual para cortes de internet. Mesora requiere
  conexión para la operación real; el demo no sincroniza ventas con producción.

Ya existen cuentas iniciales: completar la instalación actual desde
Superadministración y Personal. No crear otro restaurante por duplicado ni
vaciar la base para ensayar. Las pruebas destructivas o de fallos se hacen en
el entorno local aislado; en producción registrar operaciones reales autorizadas.

## Recorrido acompañado

1. **Caja:** contar el efectivo inicial y abrir un único turno del cajero.
2. **Mesero:** elegir una mesa y registrar comida, bebida y una nota. Confirmar
   que cocina y barra vean la comanda correcta; añadir una segunda comanda.
3. **Cocina:** activar sonido y avanzar a preparación/listo. Confirmar que el
   mesero ve el cambio. Registrar cualquier demora observada.
4. **Precuenta:** revisar todo lo consumido e imprimir. Añadir consumo solo si
   corresponde al pedido real; actualizar la precuenta antes de cobrar.
5. **Cobro:** verificar total, propina, método, recibido y vuelto. Esperar el
   éxito y comprobar el registro en Cobros antes de repetir una acción.
6. **Anulación, si corresponde:** pedir PIN antes de confirmar, indicar motivo,
   comprobar la confirmación y una sola devolución. Las anulaciones ficticias
   y el cobro simultáneo se ensayan localmente, sin alterar ventas del negocio.
7. **Administrador:** contrastar cuenta, mesa, consumo, pagos, anulaciones y
   rankings en Ventas con los pedidos realmente atendidos.
8. **Cierre:** contar efectivo físico, revisar movimientos y pendientes,
   explicar diferencias y cerrar. Conciliar con el sistema fiscal del local;
   la precuenta y el recibo interno de Mesora no son comprobantes electrónicos.

## Si hay un problema

- **Cobro sin confirmación:** recuperar conexión y consultar Cobros y la mesa.
  No volver a cobrar hasta saber si la operación ya se registró.
- **Corte de internet:** anotar mesa, consumo, importe y método en el registro
  privado. El encargado concilia esos movimientos al recuperar la conexión.
- **Sin sonido:** activar audio en cocina, revisar volumen y la pestaña del
  navegador. Mantener la pantalla de comandas visible durante el servicio.
- **PIN o contraseña olvidados:** acudir al administrador o superadministrador
  correspondiente. No reutilizar credenciales ni enviar contraseñas por chat.
- **Importes incorrectos, duplicados o datos de otro local:** suspender la
  operación afectada, conservar evidencia sin credenciales y avisar al soporte.

## Registro de aceptación

Guardar una copia privada de estas líneas por escenario:

```text
Fecha y hora:
Versión o commit desplegado:
Escenario y resultado esperado:
Rol y dispositivo (sin contraseñas):
Resultado observado y duración:
Incidencia y responsable:
Resuelto / pendiente:
Aceptación del encargado:
```

El turno queda aceptado cuando el encargado confirma acceso, comandas, cobros,
anulaciones aplicables, impresión y arqueo conciliados, y no queda ningún
bloqueo de cobro, acceso o integridad de datos. Revisar incidencias cada día
durante los primeros 3 a 7 días antes de ampliar a más locales.
