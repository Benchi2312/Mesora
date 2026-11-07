# Operación e impresión de comandas

## Preparar estaciones

En **Admin → Menú**, cada producto tiene una estación de preparación: **Cocina**,
**Bar** u **Otros**. La marca «Es bebida» permanece separada y se usa para los
reportes de ventas. Al crear una comanda, Mesora guarda una instantánea de la
estación en cada ítem; editar el menú después no cambia pedidos que ya existen.

La migración `20261107201714_bloque3_impresion_comandas.sql` debe estar aplicada
en el proyecto Supabase antes de usar esta versión con datos reales. No se aplicó
desde este trabajo.

## Imprimir

1. Abre **Cocina**, **Bar** u **Otros** en el tablero de preparación.
2. En la comanda correcta, pulsa **Imprimir comanda**. La vista incluye el local,
   mesa, mesero, fecha, hora, identificador de la comanda, cantidades y notas.
3. Elige rollo térmico de **58 mm** o **80 mm**.
4. Pulsa **Registrar impresión** y luego **Abrir diálogo de impresión**. El
   navegador abre su diálogo normal; el usuario elige la impresora y confirma.
5. Indica si salió el papel. El estado «Impreso» significa que el usuario lo
   confirmó; el navegador no puede comprobar el papel ni el estado físico de la
   impresora.

La pantalla imprime solo los productos de la estación seleccionada. Una
reimpresión requiere motivo (5–300 caracteres). El registro de auditoría incluye
actor, fecha del servidor, restaurante, comanda, mesa, estación y motivo. Si el
servidor no responde, el botón de reintento reutiliza el identificador de
solicitud: la RPC evita filas de auditoría duplicadas. La impresión no vuelve a
crear ni modificar el pedido.

Si el navegador o el usuario no pueden confirmar la salida, Mesora informa:

> La comanda fue registrada, pero no se pudo confirmar la impresión.

El siguiente intento se registra como reimpresión y solicita un motivo.

## Impresora y límites del navegador

- La impresión usa `window.print()` y CSS de impresión; no hay impresión
  silenciosa ni acceso directo del sitio al sistema operativo.
- El equipo debe tener instalada y seleccionada la impresora térmica. El ancho
  indicado en Mesora y el controlador del dispositivo deben coincidir.
- Revisa escala, márgenes, orientación, densidad y corte desde el diálogo o el
  controlador. Los nombres de estas opciones varían por navegador y modelo.
- El navegador no confirma que haya papel, que el rollo no se atasque o que la
  impresora termine. La confirmación final es del operador.
- Esta vista tiene estilos propios (`.comanda-print`). Las boletas y precuentas
  conservan sus rutas y clases de impresión/PDF existentes.

## Validación del turno

Antes de usar una impresora en producción, imprime una comanda de cocina y otra
de bar en ambos anchos disponibles. Comprueba estación, mesa, mesero, fecha/hora,
productos, cantidades y notas. Repite una impresión con un motivo claro y revisa
en Auditoría que el actor, hora, mesa, estación y motivo sean correctos.

## Validación automática del Bloque 3

Ejecutadas localmente el 7 de noviembre de 2026:

- `npm run typecheck`: correcto.
- `npm run build`: correcto.
- `npm run verificar`: 558 comprobaciones correctas de flujos de negocio.
- `npm run verificar:impresion`: 18 comprobaciones correctas, incluyendo
  estaciones, 58/80 mm, reimpresión, doble clic, fallo de conexión, auditoría y
  vista móvil.
- `npm run verificar:precuenta`: 24 escenarios correctos; impresión y PDF
  existentes comprobados en móvil y escritorio.
- `npm run verificar:responsive`: 800 comprobaciones correctas; cinco viewports
  de la aplicación y 16 anchos de landing.
- `npm run verificar:sql`: correcto con SQL QA en base aislada, instalación y
  restauración aislada. No se ejecutó contra Supabase remoto.

## Pendiente antes de producción

- Aplicar y verificar la migración en el proyecto Supabase correcto antes de
  habilitar la impresión en datos reales.
- Validar rollos de 58 mm y 80 mm en las impresoras y navegadores del local; el
  QA local no puede confirmar corte, densidad ni salida física.
- Completar una impresión inicial y una reimpresión en el turno real y verificar
  ambas entradas de auditoría.
- Configurar la copia cifrada externa de backups y probar restauración desde esa
  copia. Este cambio documenta el procedimiento, pero no configura un proveedor
  de almacenamiento ni un job automático.
