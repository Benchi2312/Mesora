# Agente local de impresión de Mesora (Fase 6)

## Alcance y arquitectura

El agente es un proceso Node 22 independiente de la aplicación web. Corre en primer plano en una cuenta de Windows del restaurante. No abre un servidor ni un puerto. Usa HTTPS hacia el proyecto Supabase de Mesora y la cola de impresoras instalada en ese Windows. La aplicación web no recibe el token persistente del agente.

El administrador crea un código aleatorio de un solo uso con vencimiento de diez minutos. El agente genera su propio token de 256 bits, lo envía una vez mediante la RPC de vinculación y lo conserva cifrado con DPAPI `CurrentUser` en `%LOCALAPPDATA%\Mesora\print-agent\vinculo.dpapi`. La base guarda únicamente el SHA-256 del código y del token. El proceso utiliza la clave pública `anon` o `sb_publishable_`; nunca una clave `service_role` o `sb_secret_`. Revocar un agente invalida su token, desactiva sus asignaciones y cancela trabajos no enviados.

Las tablas de agente, códigos, asignaciones y trabajos están en `private`, con RLS activa y sin acceso directo para `anon` o `authenticated`. Las RPC administrativas validan el rol y el restaurante. Las RPC del agente validan su token y solo devuelven el contenido del siguiente trabajo asignado a ese agente. El código no se conserva en claro y no se muestra después de abandonar el panel.

Cuando Fase 5 crea una entrega para un destino **impresora principal** de Cocina o Barra, un trigger crea un trabajo si había un agente activo asignado. El trabajo conserva cola Windows, ancho, copias y versión de configuración de ese momento. Vincular un agente después no imprime pedidos antiguos. Los destinos solo KDS no generan trabajos; KDS e impresora generan ambas salidas; sin destino no hay salida operativa. La salida manual previa sigue disponible.

La reclamación SQL usa bloqueo `FOR UPDATE SKIP LOCKED` y un lease de 90 segundos. Si el agente desaparece antes de iniciar el envío a Windows, puede recuperarse el trabajo o el operador puede tomar la salida manual una vez vencido el lease. Mientras el reclamo está vigente, la salida manual se bloquea para impedir duplicados. Si el agente desaparece después de iniciar el envío, el resultado queda incierto y se detiene el reintento automático. Las fallas seguras anteriores al spooler usan espera exponencial con máximo de intentos y segundos iniciales configurables. El agente guarda un recibo DPAPI tras la aceptación del spooler y lo confirma en Mesora antes de reclamar otro trabajo; así, una respuesta remota perdida no causa otra copia. La auditoría distingue **enviado a cola** de **papel físico no verificado**.

## Preparación en Windows

1. Instala Node.js 22 y el controlador oficial de cada ticketera. Confirma que Windows puede ver e imprimir con los nombres de cola correctos.
2. Instala el código de Mesora localmente (`npm ci`). No copies el archivo `.env.local` de un administrador a una computadora compartida.
3. Abre Mesora como `admin_restaurante` → **Impresión automática** → **Generar código**. El código dura diez minutos y se usa una vez.
4. En PowerShell de la computadora del restaurante, define la URL del proyecto y **solo** su clave pública. Puedes usar los valores `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` que ya utiliza el frontend. Por ejemplo:

   ```powershell
   $env:MESORA_SUPABASE_URL = 'https://yyfsewgxyyqjyzcejsqq.supabase.co'
   $env:MESORA_SUPABASE_ANON_KEY = '<clave pública anon o sb_publishable_>'
   npm run agente:vincular
   ```

   El agente solo acepta el proyecto Supabase de Mesora indicado arriba. El comando pide nombre de computadora y código de forma interactiva. No pases el token ni el código como argumento de línea de comandos ni los guardes en el repositorio.

5. Inicia el agente con `npm run agente:iniciar`. Mantén esa terminal abierta durante la operación. `Ctrl+C` lo detiene sin modificar pedidos. En otra terminal, `npm run agente:estado` muestra el último estado local.
6. En el panel, pulsa **Actualizar estado**. Selecciona la computadora y el nombre exacto de la cola de Windows para cada destino principal de Cocina o Barra. Configura intentos y espera inicial. Guarda y usa **Prueba de impresión** explícitamente. Comprueba que salió papel, legibilidad y corte.

El agente no se instala como servicio de Windows en esta fase. Si la computadora se reinicia, el operador debe volver a ejecutar `npm run agente:iniciar`. Se recomienda una cuenta dedicada de Windows con permisos mínimos de impresión. DPAPI ata el vínculo a esa cuenta; cambiar de cuenta requiere una vinculación nueva. No compartas la carpeta DPAPI ni la claves del proyecto.

## Impresoras y confirmación

El adaptador real utiliza `System.Drawing.Printing.PrintDocument` mediante un script PowerShell local, con la cola exacta y el tamaño personalizado de 58 u 80 mm. No usa impresión silenciosa del navegador. El adaptador simulado `agent/simulated-printer.mjs` se utiliza solo en pruebas automáticas y nunca confirma papel físico. La vista manual de Fase 5 sigue usando `window.print()` y requiere motivo al reimprimir.

**Enviado a cola no significa que salió papel.** Windows puede aceptar el trabajo y fallar después por atasco, falta de papel, desconexión o controlador. Si hay un error tras iniciar el spooler, revisa la cola y la impresora antes de usar la reimpresión manual. Los trabajos fallidos se conservan en el panel; no se borran automáticamente.

## Respaldo KDS → impresora

La política de impresora de respaldo permanece **desactivada** y la RPC rechaza activarla. Para habilitarla con seguridad falta definir y guardar por restaurante: instante de recepción KDS, confirmación explícita de reconocimiento por estación, umbral de espera, transición atómica a un único trabajo de respaldo y su reconciliación frente a reconocimiento tardío o impresión manual. Hasta entonces el administrador puede imprimir manualmente tras verificar la pantalla. No se simula ni se anuncia un respaldo automático activo.

## Verificación local y prueba física pendiente

- `npm run verificar:agente`: adaptador simulado, recibo ante desconexión, reintentos seguros, fallo incierto, restricción de RPC y ausencia de credenciales administrativas.
- `npm run verificar:sql`: instalación limpia y sobre esquema existente, QA transaccional de vinculación, expiración, replay, permisos, RLS, aislamiento, cola, lease, auditoría, modalidades, impresión manual y revocación.
- `npm run verificar:impresion`: 35 comprobaciones de salida manual, A4, 58/80 mm, doble clic, error de red y reimpresión. La reducción desde 44 en Fase 4 se debe al ancho histórico inmutable por destino: ya no se alternan 58/80 dentro del mismo ticket. Las pruebas de error y reintento permanecen.

Antes de usarlo en un turno real falta probar con una ticketera térmica de 58 mm y otra de 80 mm en Windows: nombre de cola, controlador, ancho efectivo, copias, caracteres españoles, corte, reconexión y cómo se muestra un atasco o falta de papel. Esta prueba requiere comprobación física por el personal del restaurante. La migración de esta fase aún no se ha aplicado a Supabase remoto y el commit local no se ha publicado.
